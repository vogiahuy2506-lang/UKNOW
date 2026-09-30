/**
 * P10 (PLAN_TG_WA_DAY_DU mục 17) — GHIM migration 271: giá seed món tin Telegram/WhatsApp = giá `zalo_messages`
 * (chạm tiền — không đặt giá mới), cột gói mới, CHECK ledger đã mở. Đọc thẳng file migration/bootstrap nên
 * lệch một con số là đỏ, không cần CSDL.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../..');
const read = (rel) => readFileSync(path.join(backendDir, rel), 'utf8');

function rowNumbers(sql, itemKey) {
  const match = sql.match(new RegExp(`\\(\\s*'${itemKey}'\\s*,([^)]*)\\)`));
  if (!match) throw new Error(`Không thấy dòng ${itemKey}`);
  return match[1]
    .split(',')
    .map((part) => part.trim())
    .filter((part) => /^-?\d+$/.test(part))
    .map(Number);
}

const migration = read('migrations/271_han_muc_tin_thang_telegram_whatsapp.sql');
const bootstrap = read('tests/integration/sql/bootstrap.sql');

describe('migration 271 — món top-up tiêu hao tin Telegram/WhatsApp = giá zalo_messages', () => {
  // [unit_price, min_qty, step_qty, (max NULL bị bỏ qua), sort_order]
  const zalo = rowNumbers(read('migrations/099_topup.sql'), 'zalo_messages');

  it.each(['telegram_messages', 'whatsapp_messages'])('%s: giá/min/bước y hệt zalo_messages', (key) => {
    const row = rowNumbers(migration, key);
    expect(row.slice(0, 3)).toEqual(zalo.slice(0, 3));
  });

  it.each(['telegram_messages', 'whatsapp_messages'])('%s trong bootstrap.sql khớp migration', (key) => {
    const matches = [...bootstrap.matchAll(new RegExp(`\\(\\s*'${key}'\\s*,([^)]*)\\)`, 'g'))]
      .map((m) => m[1].split(',').map((p) => p.trim()).filter((p) => /^-?\d+$/.test(p)).map(Number));
    expect(matches.some((row) => row.slice(0, 3).join() === zalo.slice(0, 3).join())).toBe(true);
  });
});

describe('migration 271 — gói tuỳ chỉnh: tin Telegram/WhatsApp giống dòng zalo_messages, đúng cột gói', () => {
  const zalo = rowNumbers(read('migrations/097_custom_plan_pricing_rebalance.sql'), 'zalo_messages');
  // 097: [unit_price, unit_size, included, min, step]
  const custom = migration.split('INSERT INTO custom_plan_pricing')[1];

  it.each([
    ['telegram_messages', 'monthly_telegram_limit'],
    ['whatsapp_messages', 'monthly_whatsapp_limit'],
  ])('%s: đơn giá/đơn vị/kèm sẵn/min/bước = Zalo và ghi vào %s', (key, column) => {
    expect(custom).toContain(`'${column}'`);
    const [unitPrice, unitSize, included, min] = rowNumbers(custom, key);
    expect({ unitPrice, unitSize, included, min })
      .toEqual({ unitPrice: zalo[0], unitSize: zalo[1], included: zalo[2], min: zalo[3] });
  });
});

describe('migration 271 — cột gói + CHECK ledger', () => {
  it('thêm 2 cột tin/tháng vào plans (KHÔNG vào users: hạn mức tin đọc từ gói)', () => {
    expect(migration).toMatch(/ALTER TABLE plans[\s\S]*monthly_telegram_limit INTEGER[\s\S]*monthly_whatsapp_limit INTEGER/);
    expect(migration).not.toMatch(/ALTER TABLE users/);
  });

  it('seed = sao chép hạn mức Zalo của gói (chỉ điền khi đang NULL)', () => {
    expect(migration).toMatch(/SET monthly_telegram_limit = monthly_zalo_limit\s+WHERE monthly_telegram_limit IS NULL/);
    expect(migration).toMatch(/SET monthly_whatsapp_limit = monthly_zalo_limit\s+WHERE monthly_whatsapp_limit IS NULL/);
  });

  it('mở chk_sqr_channel cho telegram/whatsapp (migration VÀ bootstrap)', () => {
    for (const sql of [migration, bootstrap]) {
      expect(sql).toContain("channel IN ('email', 'zalo', 'telegram', 'whatsapp')");
    }
  });

  it('mở chk_sqr_wallet_item_key + topup_grants_consumable_no_expiry cho hai món mới', () => {
    for (const sql of [migration, bootstrap]) {
      expect(sql).toContain("'emails', 'zalo_messages', 'telegram_messages', 'whatsapp_messages'");
      expect(sql).toContain("'zalo_messages', 'emails', 'ai_credits', 'telegram_messages', 'whatsapp_messages'");
    }
  });

  it('có chú thích allow-destructive-ddl ở dòng đầu (DROP CONSTRAINT)', () => {
    expect(migration.split('\n')[0]).toMatch(/^-- allow-destructive-ddl/);
  });
});
