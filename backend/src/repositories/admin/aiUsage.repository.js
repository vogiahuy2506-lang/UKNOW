import db from '../../config/database.js';

const PROMPT_EXPR = "(metadata->>'promptTokens')::bigint";
const OUTPUT_EXPR = "(metadata->>'outputTokens')::bigint";
/** Positive integers only — exclude missing/zero so they don't dilute the average. */
const PROMPT_VALID = "(metadata->>'promptTokens') ~ '^[1-9][0-9]*$'";
const OUTPUT_VALID = "(metadata->>'outputTokens') ~ '^[1-9][0-9]*$'";

class AiUsageRepository {
  async safeQuery(sql, params = [], fallback = []) {
    try {
      const result = await db.query(sql, params);
      return result.rows || fallback;
    } catch (error) {
      // 42P01: undefined_table, 42703: undefined_column, 42704: undefined_object
      // 22P02: invalid_text_representation, 42883: undefined_function/operator
      const safeCodes = ['42P01', '42703', '42704', '22P02', '42883'];
      if (safeCodes.includes(error?.code)) return fallback;
      throw error;
    }
  }

  /**
   * Average prompt/output tokens per AI answer across all models.
   * Each usage_logs row with resource_type=ai_token is one answer (1 credit).
   * Rows missing positive token metadata are excluded from AVG (not treated as 0).
   */
  async getAvgAiTokenUsage({ windowDays = 30 } = {}) {
    const days = Math.min(Math.max(Number.parseInt(windowDays, 10) || 30, 1), 90);
    const rows = await this.safeQuery(
      `SELECT
         COUNT(*) FILTER (WHERE ${PROMPT_VALID} AND ${OUTPUT_VALID})::int AS calls,
         COALESCE(AVG(${PROMPT_EXPR}) FILTER (WHERE ${PROMPT_VALID} AND ${OUTPUT_VALID}), 0)::float AS avg_prompt_tokens,
         COALESCE(AVG(${OUTPUT_EXPR}) FILTER (WHERE ${PROMPT_VALID} AND ${OUTPUT_VALID}), 0)::float AS avg_output_tokens
       FROM usage_logs
       WHERE resource_type = 'ai_token'
         AND created_at >= NOW() - ($1::int * INTERVAL '1 day')`,
      [days],
      [{ calls: 0, avg_prompt_tokens: 0, avg_output_tokens: 0 }]
    );
    const row = rows[0] || {};
    return {
      calls: Number(row.calls || 0),
      avgPromptTokens: Number(row.avg_prompt_tokens || 0),
      avgOutputTokens: Number(row.avg_output_tokens || 0),
    };
  }
}

export default new AiUsageRepository();
