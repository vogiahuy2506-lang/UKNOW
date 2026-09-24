import { describe, it, expect } from '@jest/globals';
import * as tier from '../aiModelTier.util.js';

/**
 * File này từng chỉ ghim bộ hàm xếp hạng model theo gói (clampModelToMax, listModelsUpToTier…), và
 * dùng chính hai model Google đã khai tử (1.5-flash, 2.0-flash) làm dữ liệu mẫu. Bộ hàm đó đã bị gỡ
 * 24/09/2026 vì không còn nơi nào gọi — xem chú thích cuối aiModelTier.util.js.
 */
describe('aiModelTier.util', () => {
  it('normalizeModelId: bỏ khoảng trắng, về chữ thường, rỗng khi thiếu', () => {
    expect(tier.normalizeModelId('  Gemini-3.5-Flash ')).toBe('gemini-3.5-flash');
    expect(tier.normalizeModelId(null)).toBe('');
    expect(tier.normalizeModelId(undefined)).toBe('');
  });

  it('chỉ còn đúng 2 thứ được xuất — bộ hàm xếp hạng theo gói không quay lại', () => {
    expect(Object.keys(tier).sort()).toEqual(['DEFAULT_AI_MODEL', 'normalizeModelId']);
  });
});
