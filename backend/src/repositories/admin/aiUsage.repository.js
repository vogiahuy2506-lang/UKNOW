import db from '../../config/database.js';
import { aiCreditConsumptionRowSql } from '../../constants/aiCreditUsage.js';

const PROMPT_EXPR = "(metadata->>'promptTokens')::bigint";
const OUTPUT_EXPR = "(metadata->>'outputTokens')::bigint";
/** Đầu ra tính tiền của một dòng: output, hoặc tổng − prompt nếu lớn hơn (thêm token suy nghĩ). Chỉ dùng trong FILTER hợp lệ. */
const BILLABLE_OUTPUT_EXPR = `GREATEST(${OUTPUT_EXPR}, COALESCE(delta, 0) - ${PROMPT_EXPR})`;
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
   * Tập khách (tài khoản thanh toán = `usage_logs.id_user`) CÓ lượt AI trong `lookbackDays` ngày qua, kèm gói ĐANG dùng.
   * Chỉ là tập ỨNG VIÊN: "đã dùng trong kỳ hiện tại" phải tính bằng đúng hàm của cổng chặn
   * (getBillingCycle + usageTrackingRepository.getUsageInRange), không tổng hợp ở đây.
   *
   * Kỳ hạn mức dài đúng 30 ngày (computeBillingWindow) nên khách có dùng trong kỳ hiện tại chắc chắn có ≥ 1 dòng trong
   * 30 ngày qua — 31 ngày là dư một ngày cho lệch giờ. Dòng bán Marketplace không tính là "có dùng"; khách không có gói
   * (`users.active_plan_id` rỗng) không có kỳ hiện tại nên bị loại bằng JOIN.
   *
   * @param {{ lookbackDays?: number }} [options]
   * @returns {Promise<Array<{ user_id: string, plan_id: number, plan_code: string, plan_name: string,
   *   ai_credits_per_period: number|null, plan_price: string|number|null }>>}
   */
  async listCreditCustomers({ lookbackDays = 31 } = {}) {
    return this.safeQuery(
      `SELECT DISTINCT
         ul.id_user AS user_id,
         p.id AS plan_id,
         COALESCE(p.code, 'unknown') AS plan_code,
         COALESCE(p.name, p.code, 'Unknown plan') AS plan_name,
         p.ai_credits_per_period,
         p.price AS plan_price
       FROM usage_logs ul
       JOIN users u ON u.id = ul.id_user
       JOIN plans p ON p.id = u.active_plan_id
       WHERE ul.resource_type = 'ai_credit'
         AND ${aiCreditConsumptionRowSql('ul')}
         AND ul.created_at >= NOW() - ($1::int * INTERVAL '1 day')`,
      [lookbackDays]
    );
  }

  /**
   * Average prompt/output tokens per Gemini call across all models.
   * Each usage_logs row with resource_type=ai_token is one call.
   * Rows missing positive token metadata are excluded from AVG (not treated as 0).
   *
   * "Output" ở đây là đầu ra TÍNH TIỀN = max(output, delta − prompt): gồm token suy nghĩ (Google tính theo giá đầu ra,
   * nằm trong `delta` = tổng nhưng không nằm trong metadata.outputTokens) — cùng công thức với estimateCost.
   */
  async getAvgAiTokenUsage({ windowDays = 30 } = {}) {
    const days = Math.min(Math.max(Number.parseInt(windowDays, 10) || 30, 1), 90);
    const rows = await this.safeQuery(
      `SELECT
         COUNT(*) FILTER (WHERE ${PROMPT_VALID} AND ${OUTPUT_VALID})::int AS calls,
         COALESCE(AVG(${PROMPT_EXPR}) FILTER (WHERE ${PROMPT_VALID} AND ${OUTPUT_VALID}), 0)::float AS avg_prompt_tokens,
         COALESCE(AVG(${BILLABLE_OUTPUT_EXPR}) FILTER (WHERE ${PROMPT_VALID} AND ${OUTPUT_VALID}), 0)::float AS avg_output_tokens
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
