/**
 * P11 (PLAN_TG_WA_DAY_DU mục 18) — GHIM migration 272 + bảng kênh Hộp thư → kênh hạn mức.
 * Đọc thẳng file migration/bootstrap/inventory nên lệch là đỏ, không cần CSDL.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import {
  INBOX_CHANNEL_BY_QUOTA_CHANNEL,
  resolveInboxQuotaChannel,
} from '../../constants/sendQuotaChannels.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(here, '../../..');
const read = (rel) => readFileSync(path.join(backendDir, rel), 'utf8');

const migration = read('migrations/272_hop_thu_tg_wa_han_muc_nang_luc_tai_khoan.sql');
const bootstrap = read('tests/integration/sql/bootstrap.sql');
const inventory = JSON.parse(read('tests/integration/fixtures/productionSchemaInventory.json'));

describe('resolveInboxQuotaChannel', () => {
  it('map kênh Hộp thư → kênh hạn mức (WhatsApp Baileys = whatsapp)', () => {
    expect(resolveInboxQuotaChannel('telegram')).toBe('telegram');
    expect(resolveInboxQuotaChannel('whatsapp_baileys')).toBe('whatsapp');
  });

  it('kênh khác không đo hạn mức tin/tháng', () => {
    for (const ch of ['zalo_oa', 'facebook', 'webchat', 'zalo_personal', 'whatsapp', undefined, null, '']) {
      expect(resolveInboxQuotaChannel(ch)).toBeNull();
    }
  });

  it('bảng ngược khớp bảng xuôi', () => {
    for (const [quotaChannel, inboxChannel] of Object.entries(INBOX_CHANNEL_BY_QUOTA_CHANNEL)) {
      expect(resolveInboxQuotaChannel(inboxChannel)).toBe(quotaChannel);
    }
  });
});

describe('migration 272', () => {
  it('thêm cột channel_messages.quota_reservation_id + chỉ mục duy nhất một phần', () => {
    expect(migration).toMatch(/ALTER TABLE channel_messages ADD COLUMN IF NOT EXISTS quota_reservation_id BIGINT/);
    expect(migration).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_cm_quota_reservation_id[\s\S]*WHERE quota_reservation_id IS NOT NULL/);
  });

  it('seed năng lực Telegram/WhatsApp = 16.000/tài khoản, đúng số của Zalo (096)', () => {
    const zalo = read('migrations/096_custom_plan_self_serve.sql')
      .match(/\('zalo_monthly_capacity_per_account',\s*NULL,\s*(\d+)/);
    expect(zalo[1]).toBe('16000');
    for (const key of ['telegram_monthly_capacity_per_account', 'whatsapp_monthly_capacity_per_account']) {
      expect(migration).toMatch(new RegExp(`\\('${key}',\\s*NULL,\\s*16000,\\s*1,\\s*0,\\s*0,\\s*NULL,\\s*1,\\s*TRUE,\\s*0\\)`));
      expect(bootstrap).toMatch(new RegExp(`\\('${key}',\\s*NULL,\\s*16000,\\s*1,\\s*0,\\s*0,\\s*NULL,\\s*1,\\s*TRUE,\\s*0\\)`));
    }
    expect(migration).toMatch(/ON CONFLICT \(item_key\) DO NOTHING/);
  });

  it('bootstrap và inventory phản chiếu cột mới', () => {
    expect(bootstrap).toMatch(/ALTER TABLE channel_messages ADD COLUMN IF NOT EXISTS quota_reservation_id BIGINT/);
    expect(inventory.tables.channel_messages).toContain('quota_reservation_id');
  });
});
