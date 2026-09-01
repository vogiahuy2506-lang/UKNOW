import { CAMPAIGN_INTENT_V1_SCHEMA } from '../campaignIntent.schema.js';

/**
 * Chốt chặn tương thích Gemini responseSchema.
 *
 * Bối cảnh: từ GĐ 1 (7d49f4f4) tới 01/09/2026, schema có `version: { type:
 * 'integer', enum: [1] }`. Gemini chỉ nhận enum gồm CHUỖI, nên nó từ chối
 * NGUYÊN schema bằng lỗi 400 — IntentShadow chưa từng chạy thành công một lần
 * nào, mà log vẫn trông bình thường (`agree:false` + `llmError`).
 *
 * Các test khác đều mock Gemini nên không đụng tới ràng buộc này. Test này soi
 * thẳng cấu trúc schema, không cần gọi mạng.
 */

function walkSchema(node, path, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node, path);
  if (node.properties && typeof node.properties === 'object') {
    for (const [key, child] of Object.entries(node.properties)) {
      walkSchema(child, `${path}.${key}`, visit);
    }
  }
  if (node.items) walkSchema(node.items, `${path}[]`, visit);
}

describe('CAMPAIGN_INTENT_V1_SCHEMA tương thích Gemini responseSchema', () => {
  it('mọi enum chỉ chứa chuỗi — số hay boolean làm Gemini trả 400 cho cả schema', () => {
    const viPham = [];
    walkSchema(CAMPAIGN_INTENT_V1_SCHEMA, 'root', (node, path) => {
      if (!Array.isArray(node.enum)) return;
      node.enum.forEach((value, i) => {
        if (typeof value !== 'string') {
          viPham.push(`${path}.enum[${i}] = ${JSON.stringify(value)} (${typeof value})`);
        }
      });
    });
    expect(viPham).toEqual([]);
  });

  it('trường có enum thì phải khai type là string', () => {
    const viPham = [];
    walkSchema(CAMPAIGN_INTENT_V1_SCHEMA, 'root', (node, path) => {
      if (Array.isArray(node.enum) && node.type !== 'string') {
        viPham.push(`${path}: type=${node.type} nhưng có enum`);
      }
    });
    expect(viPham).toEqual([]);
  });
});
