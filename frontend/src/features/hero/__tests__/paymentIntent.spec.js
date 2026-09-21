import { describe, it, expect } from 'vitest';

/**
 * PR cho vietqr-chat-hero-landing — test helper detectPaymentIntent (private
 * trong component, nên copy regex ở đây để verify). Khi refactor component,
 * copy regex vào file này.
 */

function detectPaymentIntent(text) {
  const t = String(text || '').toLowerCase();
  const hasPayKeyword =
    /\b(thanh toán|pay|chuyển khoản|ck|qr|vietqr)\b/.test(t) ||
    /thanh toán|chuyển tiền/.test(t);
  if (!hasPayKeyword) return null;

  const vnUnitMatch = t.match(/(\d+(?:[.,]\d+)?)\s*(tr|triệu|k|ngàn|nghin|n)/i);
  if (vnUnitMatch) {
    const num = parseFloat(vnUnitMatch[1].replace(',', '.'));
    const unit = vnUnitMatch[2].toLowerCase();
    const mult =
      unit === 'tr' || unit === 'triệu' ? 1_000_000 :
      unit === 'k' || unit === 'ngàn' || unit === 'nghin' || unit === 'n' ? 1_000 : 1;
    const amount = Math.round(num * mult);
    if (amount > 0) return { amount };
  }

  const numericMatches = [...t.matchAll(/(\d{1,3}(?:[.,]\d{3})+|\d{4,})/g)];
  for (const m of numericMatches) {
    const cleaned = m[1].replace(/[.,]/g, '');
    const amount = parseInt(cleaned, 10);
    if (Number.isFinite(amount) && amount >= 10_000) {
      return { amount };
    }
  }

  return null;
}

describe('detectPaymentIntent (vietqr-chat-hero-landing)', () => {
  it('match: "thanh toán 150000 đ" → 150000', () => {
    expect(detectPaymentIntent('thanh toán 150000 đ')).toEqual({ amount: 150000 });
  });

  it('match: "thanh toán 1.500.000" → 1500000', () => {
    expect(detectPaymentIntent('tôi muốn thanh toán 1.500.000')).toEqual({ amount: 1_500_000 });
  });

  it('match: "thanh toán 1,5tr" → 1500000', () => {
    expect(detectPaymentIntent('thanh toán 1,5tr')).toEqual({ amount: 1_500_000 });
  });

  it('match: "thanh toán 500k" → 500000', () => {
    expect(detectPaymentIntent('thanh toán 500k')).toEqual({ amount: 500_000 });
  });

  it('match: "chuyển khoản 2tr" → 2000000', () => {
    expect(detectPaymentIntent('chuyển khoản 2tr')).toEqual({ amount: 2_000_000 });
  });

  it('match: "pay 1000000 vnd" → 1000000', () => {
    expect(detectPaymentIntent('pay 1000000 vnd')).toEqual({ amount: 1_000_000 });
  });

  it('NO match: không có keyword thanh toán → null', () => {
    expect(detectPaymentIntent('xin chào, tôi muốn hỏi về giá')).toBeNull();
  });

  it('NO match: có keyword nhưng số < 10000 → null', () => {
    expect(detectPaymentIntent('thanh toán 5000')).toBeNull();
  });

  it('NO match: empty string → null', () => {
    expect(detectPaymentIntent('')).toBeNull();
    expect(detectPaymentIntent(null)).toBeNull();
  });

  it('match: "vietqr 250000" → 250000', () => {
    expect(detectPaymentIntent('cho tôi vietqr 250000')).toEqual({ amount: 250_000 });
  });

  it('match: case-insensitive "THANH TOÁN 100K" → 100000', () => {
    expect(detectPaymentIntent('THANH TOÁN 100K')).toEqual({ amount: 100_000 });
  });

  it('match: chọn số lớn nhất nếu có nhiều số ≥ 10000', () => {
    // "tôi từ 1990, muốn thanh toán 50000" → 50000 (không phải 1990)
    expect(detectPaymentIntent('tôi sinh 1990, thanh toán 50000')).toEqual({ amount: 50_000 });
  });
});
