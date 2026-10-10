import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_EVENT_KEYS,
  getNotificationEvent,
  getDefaultEventSettings,
  isKnownNotificationEvent,
} from '../notificationEventCatalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_289 = path.resolve(__dirname, '../../../migrations/289_notification_preferences_and_event_settings.sql');
const BOOTSTRAP = path.resolve(__dirname, '../../../tests/integration/sql/bootstrap.sql');

/**
 * Bảng kỳ vọng TÍNH TAY theo PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO_2026-10-10 mục 2.1 (không chép từ đầu ra của catalog):
 *   key → [audience, inApp, email, userCanDisableEmail]
 */
const EXPECTED = {
  admin_broadcast: ['user', true, true, true],
  campaign_run_completed: ['user', true, false, true],
  campaign_run_failed: ['user', true, true, true],
  campaign_approval_required: ['user', true, true, false],
  campaign_schedule_skipped: ['user', true, true, true],
  support_ticket_replied: ['user', true, true, false],
  support_ticket_closed: ['user', true, false, true],
  support_ticket_created: ['admin', true, true, false],
  support_ticket_user_replied: ['admin', true, true, false],
};

describe('notificationEventCatalog', () => {
  it('đúng 9 khoá của plan, không thừa không thiếu', () => {
    expect([...NOTIFICATION_EVENT_KEYS].sort()).toEqual(Object.keys(EXPECTED).sort());
    expect(new Set(NOTIFICATION_EVENT_KEYS).size).toBe(NOTIFICATION_EVENT_KEYS.length);
  });

  it.each(Object.entries(EXPECTED))('%s: audience / mặc định chuông + email / user tắt được email', (key, [audience, inApp, email, canDisable]) => {
    const event = getNotificationEvent(key);
    expect(event.audience).toBe(audience);
    expect(event.defaults).toEqual({ inApp, email });
    expect(event.userCanDisableEmail).toBe(canDisable);
    expect(getDefaultEventSettings(key)).toEqual({
      inAppEnabled: inApp,
      emailEnabled: email,
      userCanDisableEmail: canDisable,
    });
  });

  it('mỗi mục có nhãn vi/en + mô tả không rỗng', () => {
    for (const event of NOTIFICATION_EVENTS) {
      expect(event.label.trim()).not.toBe('');
      expect(event.labelEn.trim()).not.toBe('');
      expect(event.description.trim()).not.toBe('');
    }
  });

  it('khoá lạ → null / false', () => {
    expect(getNotificationEvent('khong_co')).toBeNull();
    expect(getDefaultEventSettings('khong_co')).toBeNull();
    expect(isKnownNotificationEvent('khong_co')).toBe(false);
    expect(isKnownNotificationEvent('campaign_run_failed')).toBe(true);
  });

  it('catalog bị đóng băng (không ai sửa được lúc chạy)', () => {
    expect(Object.isFrozen(NOTIFICATION_EVENTS)).toBe(true);
  });
});

function parseSeedRows(sql) {
  const rows = {};
  const re = /\(\s*'([a-z_]+)'\s*,\s*(true|false)\s*,\s*(true|false)\s*,\s*(true|false)\s*\)/g;
  let match;
  while ((match = re.exec(sql)) !== null) {
    rows[match[1]] = [match[2] === 'true', match[3] === 'true', match[4] === 'true'];
  }
  return rows;
}

describe('seed của migration 289 + bootstrap.sql khớp catalog (ghim từng phần tử)', () => {
  const expectedSeed = Object.fromEntries(
    Object.entries(EXPECTED).map(([key, [, inApp, email, canDisable]]) => [key, [inApp, email, canDisable]])
  );

  it('migration 289 seed đủ 9 khoá, đúng giá trị mặc định', () => {
    const rows = parseSeedRows(fs.readFileSync(MIGRATION_289, 'utf8'));
    expect(rows).toEqual(expectedSeed);
  });

  it('bootstrap.sql seed y hệt migration 289', () => {
    const rows = parseSeedRows(fs.readFileSync(BOOTSTRAP, 'utf8').split('-- --- Migration 289')[1]);
    expect(rows).toEqual(expectedSeed);
  });

  it('seed của migration khớp catalog (đổi catalog mà quên migration mới thì đỏ)', () => {
    const rows = parseSeedRows(fs.readFileSync(MIGRATION_289, 'utf8'));
    for (const event of NOTIFICATION_EVENTS) {
      expect(rows[event.key]).toEqual([event.defaults.inApp, event.defaults.email, event.userCanDisableEmail]);
    }
  });
});
