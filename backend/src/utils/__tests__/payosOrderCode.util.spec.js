/**
 * Bộ sinh mã đơn PayOS dùng chung: trong trần PayOS (≤ Number.MAX_SAFE_INTEGER), không đụng dải mã
 * cũ, không đoán được từ thời điểm tạo đơn, và mọi đường tạo đơn đều dùng nó.
 */
import { describe, expect, it } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ORDER_CODE_MAX,
  ORDER_CODE_MIN,
  ORDER_CODE_RANDOM_SPAN,
  PAYOS_ORDER_CODE_MAX,
  generatePayosOrderCode,
} from '../payosOrderCode.util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe('payosOrderCode.util', () => {
  it('trần PayOS = Number.MAX_SAFE_INTEGER; mã lớn nhất có thể sinh nằm dưới trần', () => {
    expect(PAYOS_ORDER_CODE_MAX).toBe(Number.MAX_SAFE_INTEGER);
    expect(ORDER_CODE_MAX).toBe(ORDER_CODE_MIN + ORDER_CODE_RANDOM_SPAN - 1);
    expect(Number.isSafeInteger(ORDER_CODE_MIN + ORDER_CODE_RANDOM_SPAN)).toBe(true);
    expect(ORDER_CODE_MAX).toBeLessThanOrEqual(PAYOS_ORDER_CODE_MAX);
    expect(ORDER_CODE_MIN).toBeGreaterThan(0);
  });

  it('khoảng ngẫu nhiên hợp lệ cho crypto.randomInt (max − min < 2^48) và đủ rộng (≥ 2^47)', () => {
    expect(ORDER_CODE_RANDOM_SPAN).toBeLessThan(2 ** 48);
    expect(ORDER_CODE_RANDOM_SPAN).toBeGreaterThanOrEqual(2 ** 47);
  });

  it('dải mã mới không đụng mã kiểu cũ (Date.now() và Date.now()*100 + 0..99) tới năm 2200', () => {
    const year2200 = Date.UTC(2200, 0, 1);
    expect(year2200 * 100 + 99).toBeLessThan(ORDER_CODE_MIN);
    expect(Date.now() * 100 + 99).toBeLessThan(ORDER_CODE_MIN);
  });

  it('mã luôn 16 chữ số → mã tra cứu hoá đơn "UK"+mã (cắt 20 ký tự) không bị cắt', () => {
    expect(String(ORDER_CODE_MIN)).toHaveLength(16);
    expect(String(ORDER_CODE_MAX)).toHaveLength(16);
    expect(`UK${ORDER_CODE_MAX}`.length).toBeLessThanOrEqual(20);
  });

  it('sinh 20.000 mã: số nguyên an toàn trong dải, không trùng', () => {
    const seen = new Set();
    for (let i = 0; i < 20_000; i += 1) {
      const code = generatePayosOrderCode();
      expect(Number.isSafeInteger(code)).toBe(true);
      expect(code).toBeGreaterThanOrEqual(ORDER_CODE_MIN);
      expect(code).toBeLessThanOrEqual(ORDER_CODE_MAX);
      seen.add(code);
    }
    expect(seen.size).toBe(20_000);
  });

  it('mọi đường tạo đơn dùng bộ sinh chung, không còn Date.now() làm mã đơn', () => {
    const files = [
      '../../services/payment/payment.service.js',
      '../../services/payment/topup.service.js',
      '../../services/admin/adminPlans.service.js',
      '../../repositories/admin/adminPlans.repository.js',
    ];
    for (const rel of files) {
      const source = fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
      expect(source).toContain('payosOrderCode.util.js');
      expect(source).not.toMatch(/orderCode\s*=\s*Date\.now\(\)/);
      expect(source).not.toMatch(/Date\.now\(\)\s*\*\s*100\s*\+/);
    }
  });
});
