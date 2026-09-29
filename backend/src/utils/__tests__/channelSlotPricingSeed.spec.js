/**
 * P6 (PLAN_TG_WA_DAY_DU) — GHIM giá seed slot Telegram/WhatsApp: mặc định PHẢI bằng giá slot Zalo hiện có
 * (chạm tiền — không tự đặt giá mới; admin đổi ở trang giá có sẵn). Đọc thẳng file migration/bootstrap nên lệch
 * một con số là đỏ, không cần CSDL.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../..');
const read = (rel) => readFileSync(path.join(backendDir, rel), 'utf8');

/** Lấy các số trong dòng `('<itemKey>', ...)` đầu tiên của file (số nguyên, bỏ chuỗi). */
function rowNumbers(sql, itemKey) {
  const match = sql.match(new RegExp(`\\(\\s*'${itemKey}'\\s*,([^)]*)\\)`));
  if (!match) throw new Error(`Không thấy dòng ${itemKey}`);
  return match[1]
    .split(',')
    .map((part) => part.trim())
    .filter((part) => /^-?\d+$/.test(part))
    .map(Number);
}

describe('giá seed bán lẻ slot (topup_pricing) — Telegram/WhatsApp = Zalo', () => {
  const zaloRetail = rowNumbers(read('migrations/109_topup_structural_items.sql'), 'zalo_accounts');
  // [unit_price, min_qty, step_qty, max_qty, sort_order]
  const [zaloPrice, zaloMin, zaloStep, zaloMax] = zaloRetail;
  const migration = read('migrations/269_topup_custom_plan_telegram_whatsapp_slots.sql');
  const bootstrap = read('tests/integration/sql/bootstrap.sql');

  it.each(['telegram_accounts', 'whatsapp_accounts'])('%s trong migration 269: giá/min/bước/trần y hệt slot Zalo', (key) => {
    const [price, min, step, max] = rowNumbers(migration, key);
    expect({ price, min, step, max }).toEqual({ price: zaloPrice, min: zaloMin, step: zaloStep, max: zaloMax });
  });

  it.each(['telegram_accounts', 'whatsapp_accounts'])('%s trong bootstrap.sql khớp migration 269', (key) => {
    // bootstrap có 2 dòng cùng key (topup + custom plan): lấy dòng topup = dòng có 50000.
    const matches = [...bootstrap.matchAll(new RegExp(`\\(\\s*'${key}'\\s*,([^)]*)\\)`, 'g'))]
      .map((m) => m[1].split(',').map((p) => p.trim()).filter((p) => /^-?\d+$/.test(p)).map(Number));
    expect(matches.some(([price, min, step, max]) => (
      price === zaloPrice && min === zaloMin && step === zaloStep && max === zaloMax
    ))).toBe(true);
  });
});

describe('giá seed gói tuỳ chỉnh (custom_plan_pricing) — Telegram/WhatsApp = đơn giá TK Zalo', () => {
  // Giá TK Zalo hiện hành = giá sau cân đối lại ở migration 097 (096 seed 50000 rồi 097 UPDATE về 40000).
  const zaloRebalance = rowNumbers(read('migrations/097_custom_plan_pricing_rebalance.sql'), 'zalo_accounts');
  const zaloUnitPrice = zaloRebalance[0];
  const migration = read('migrations/269_topup_custom_plan_telegram_whatsapp_slots.sql');

  it.each([
    ['telegram_accounts', 'max_telegram_accounts'],
    ['whatsapp_accounts', 'max_whatsapp_accounts'],
  ])('%s: đơn giá = Zalo, min/included = 0 (chọn 0 được), cột gói đúng', (key, planColumn) => {
    const [unitPrice, unitSize, included, min] = rowNumbers(migration.split('INSERT INTO custom_plan_pricing')[1], key);
    expect(unitPrice).toBe(zaloUnitPrice);
    expect(unitSize).toBe(1);
    expect(included).toBe(0);
    expect(min).toBe(0);
    expect(migration).toContain(`'${key}', '${planColumn}'`);
  });
});
