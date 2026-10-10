import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from '@jest/globals';
import {
  NOTIFICATION_CHANNELS,
  broadcastSeverity,
  isBroadcastEmailLocked,
  normalizeStoredChannels,
  parseNotificationChannels,
  summarizeSendResult,
} from '../notificationChannels.util.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION_290 = path.resolve(__dirname, '../../../migrations/290_notifications_channels.sql');
const BOOTSTRAP = path.resolve(__dirname, '../../../tests/integration/sql/bootstrap.sql');
const INVENTORY = path.resolve(__dirname, '../../../tests/integration/fixtures/productionSchemaInventory.json');

describe('parseNotificationChannels', () => {
  it('chỉ nhận email / in_app', () => {
    expect(NOTIFICATION_CHANNELS).toEqual(['email', 'in_app']);
  });

  it('mảng hợp lệ → bỏ trùng và đưa về thứ tự chuẩn (email trước)', () => {
    expect(parseNotificationChannels(['in_app', 'email', 'email'])).toEqual({ ok: true, channels: ['email', 'in_app'] });
    expect(parseNotificationChannels(['in_app'])).toEqual({ ok: true, channels: ['in_app'] });
  });

  it.each([
    ['mảng rỗng', []],
    ['không phải mảng', 'email'],
    ['null', null],
    ['undefined', undefined],
    ['giá trị lạ', ['email', 'sms']],
    ['phần tử không phải chuỗi', [1]],
  ])('%s → lỗi, không đoán', (_label, value) => {
    const parsed = parseNotificationChannels(value);
    expect(parsed.ok).toBe(false);
    expect(parsed.message).toEqual(expect.any(String));
  });
});

describe('normalizeStoredChannels', () => {
  it('giá trị đã lưu hợp lệ giữ nguyên; thiếu/hỏng/rỗng → [email] (không bao giờ im lặng không gửi gì)', () => {
    expect(normalizeStoredChannels(['email', 'in_app'])).toEqual(['email', 'in_app']);
    expect(normalizeStoredChannels(['in_app'])).toEqual(['in_app']);
    expect(normalizeStoredChannels(null)).toEqual(['email']);
    expect(normalizeStoredChannels(undefined)).toEqual(['email']);
    expect(normalizeStoredChannels([])).toEqual(['email']);
    expect(normalizeStoredChannels(['lạ'])).toEqual(['email']);
  });
});

describe('isBroadcastEmailLocked', () => {
  it('khẩn cấp hoặc loại bảo mật / bảo trì → khoá (bỏ qua tuỳ chọn tắt email)', () => {
    expect(isBroadcastEmailLocked({ priority: 'urgent', type: 'announcement' })).toBe(true);
    expect(isBroadcastEmailLocked({ priority: 'normal', type: 'security' })).toBe(true);
    expect(isBroadcastEmailLocked({ priority: 'low', type: 'maintenance' })).toBe(true);
  });

  it('loại còn lại và mức ưu tiên khác → không khoá (tôn trọng tuỳ chọn người dùng)', () => {
    for (const type of ['announcement', 'promotion', 'warning', 'reminder']) {
      for (const priority of ['low', 'normal', 'high']) {
        expect(isBroadcastEmailLocked({ type, priority })).toBe(false);
      }
    }
    expect(isBroadcastEmailLocked({})).toBe(false);
    expect(isBroadcastEmailLocked(null)).toBe(false);
  });
});

describe('broadcastSeverity', () => {
  it('urgent → error, high → warning, còn lại info', () => {
    expect(broadcastSeverity('urgent')).toBe('error');
    expect(broadcastSeverity('high')).toBe('warning');
    expect(broadcastSeverity('normal')).toBe('info');
    expect(broadcastSeverity('low')).toBe('info');
    expect(broadcastSeverity(undefined)).toBe('info');
  });
});

describe('summarizeSendResult', () => {
  it('chỉ email, kết quả cũ không có trường mới → câu y như trước PR-3', () => {
    expect(summarizeSendResult({ sent: 3, failed: 0, total: 3 })).toEqual({ success: true, message: 'Đã gửi thành công 3/3 email' });
    expect(summarizeSendResult({ sent: 2, failed: 1, total: 3 })).toEqual({ success: true, message: 'Đã gửi 2/3 email, 1 thất bại' });
    expect(summarizeSendResult({ sent: 0, failed: 3, total: 3 })).toEqual({ success: false, message: 'Gửi thất bại toàn bộ 3 email' });
    expect(summarizeSendResult({ sent: 0, failed: 0, total: 0 })).toEqual({ success: true, message: 'Đã gửi thành công 0/0 email' });
  });

  it('chỉ chuông: không bao giờ bị coi là "thất bại toàn bộ email" dù sent = 0', () => {
    const result = summarizeSendResult({ sent: 0, failed: 0, total: 5, emailTotal: 0, emailSkipped: 0, inApp: 5, channels: ['in_app'] });
    expect(result).toEqual({ success: true, message: 'Đã gửi 5 thông báo chuông' });
  });

  it('cả hai kênh: ghép câu email + chuông; có người tắt email thì nói rõ', () => {
    const result = summarizeSendResult({ sent: 4, failed: 0, total: 5, emailTotal: 4, emailSkipped: 1, inApp: 5, channels: ['email', 'in_app'] });
    expect(result.success).toBe(true);
    expect(result.message).toBe('Đã gửi thành công 4/4 email. 1 người đã tắt nhận email loại này. Đã gửi 5 thông báo chuông');
  });

  it('email thất bại toàn bộ → success=false kể cả khi chuông đã chèn được (admin phải thấy)', () => {
    const result = summarizeSendResult({ sent: 0, failed: 2, total: 2, emailTotal: 2, emailSkipped: 0, inApp: 2, channels: ['email', 'in_app'] });
    expect(result.success).toBe(false);
    expect(result.message).toContain('Gửi thất bại toàn bộ 2 email');
    expect(result.message).toContain('Đã gửi 2 thông báo chuông');
  });

  it('chuông lỗi (inAppFailed) → success=false với câu "Chuông: lỗi", không còn câu "Đã gửi 0 thông báo chuông"', () => {
    const chiChuong = summarizeSendResult({ sent: 0, failed: 0, total: 5, emailTotal: 0, inApp: 0, inAppFailed: true, channels: ['in_app'] });
    expect(chiChuong).toEqual({ success: false, message: 'Chuông: lỗi, không chèn được thông báo nào' });

    const caHai = summarizeSendResult({ sent: 5, failed: 0, total: 5, emailTotal: 5, inApp: 0, inAppFailed: true, channels: ['email', 'in_app'] });
    expect(caHai.success).toBe(false);
    expect(caHai.message).toBe('Đã gửi thành công 5/5 email. Chuông: lỗi, không chèn được thông báo nào');
  });

  it('mọi người nhận đều đã tắt email → "không gửi email nào", không phải thất bại', () => {
    const result = summarizeSendResult({ sent: 0, failed: 0, total: 3, emailTotal: 0, emailSkipped: 3, inApp: 0, channels: ['email'] });
    expect(result.success).toBe(true);
    expect(result.message).toBe('Không gửi email nào. 3 người đã tắt nhận email loại này');
  });
});

describe('migration 290 + bản sao trong bootstrap/inventory', () => {
  const migration = fs.readFileSync(MIGRATION_290, 'utf8');
  const bootstrap = fs.readFileSync(BOOTSTRAP, 'utf8');

  it('migration thêm đúng hai cột, mặc định {email} và 0 (bản tin cũ giữ hành vi chỉ-email)', () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS channels TEXT\[\] NOT NULL DEFAULT '\{email\}'/);
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS in_app_count INTEGER NOT NULL DEFAULT 0/);
    const sqlOnly = migration.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
    expect(sqlOnly).not.toMatch(/\bDROP\b/i);
  });

  it('bootstrap.sql có cùng hai cột với cùng mặc định', () => {
    expect(bootstrap).toMatch(/ALTER TABLE notifications[\s\S]*?ADD COLUMN IF NOT EXISTS channels TEXT\[\] NOT NULL DEFAULT '\{email\}'/);
    expect(bootstrap).toMatch(/ALTER TABLE notifications[\s\S]*?ADD COLUMN IF NOT EXISTS in_app_count INTEGER NOT NULL DEFAULT 0/);
  });

  it('inventory production liệt kê hai cột, mảng giữ thứ tự chữ cái', () => {
    const columns = JSON.parse(fs.readFileSync(INVENTORY, 'utf8')).tables.notifications;
    expect(columns).toContain('channels');
    expect(columns).toContain('in_app_count');
    expect(columns).toEqual([...columns].sort());
  });
});
