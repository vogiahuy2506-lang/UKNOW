import { describe, it, expect } from '@jest/globals';
import { resolveTier, AFFILIATE_TIERS } from '../affiliateTier.util.js';

describe('affiliateTier.util — resolveTier', () => {
  it('định nghĩa đúng 5 bậc hoa hồng', () => {
    expect(AFFILIATE_TIERS).toHaveLength(5);
    expect(AFFILIATE_TIERS.map((t) => t.ratePercent)).toEqual([10, 15, 20, 25, 30]);
  });

  it('các mốc biên chuẩn theo quy định plan', () => {
    // Bậc 1: dưới 10.000.000đ -> 10%
    expect(resolveTier(9_999_999)).toMatchObject({ level: 1, ratePercent: 10 });
    expect(resolveTier('9999999')).toMatchObject({ level: 1, ratePercent: 10 });
    expect(resolveTier(9_999_999.99)).toMatchObject({ level: 1, ratePercent: 10 });

    // Bậc 2: từ 10.000.000đ -> 15%
    expect(resolveTier(10_000_000)).toMatchObject({ level: 2, ratePercent: 15 });
    expect(resolveTier(19_999_999)).toMatchObject({ level: 2, ratePercent: 15 });

    // Bậc 3: từ 20.000.000đ -> 20%
    expect(resolveTier(20_000_000)).toMatchObject({ level: 3, ratePercent: 20 });
    expect(resolveTier(49_999_999)).toMatchObject({ level: 3, ratePercent: 20 });

    // Bậc 4: từ 50.000.000đ -> 25%
    expect(resolveTier(50_000_000)).toMatchObject({ level: 4, ratePercent: 25 });
    expect(resolveTier(99_999_999)).toMatchObject({ level: 4, ratePercent: 25 });

    // Bậc 5: từ 100.000.000đ trở lên -> 30%
    expect(resolveTier(100_000_000)).toMatchObject({ level: 5, ratePercent: 30 });
    expect(resolveTier(500_000_000)).toMatchObject({ level: 5, ratePercent: 30 });
  });

  it('xử lý an toàn các giá trị 0, âm, chuỗi, hoặc không hợp lệ', () => {
    expect(resolveTier(0)).toMatchObject({ level: 1, ratePercent: 10 });
    expect(resolveTier(-500_000)).toMatchObject({ level: 1, ratePercent: 10 });
    expect(resolveTier(null)).toMatchObject({ level: 1, ratePercent: 10 });
    expect(resolveTier(undefined)).toMatchObject({ level: 1, ratePercent: 10 });
    expect(resolveTier('invalid')).toMatchObject({ level: 1, ratePercent: 10 });
  });
});
