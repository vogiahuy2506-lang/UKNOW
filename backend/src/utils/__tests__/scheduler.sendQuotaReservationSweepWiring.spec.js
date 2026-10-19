/**
 * PLAN_SAN_SANG_BAT_ENFORCE_HAN_MUC_2026-10-19 PR-E1 — cron send_quota_reservation_sweep phải THẬT SỰ được đăng ký.
 *
 * `cronJobRegistry.spec.js` chỉ kiểm mã job có trong `recordRun(...)`; xoá dòng `cron.schedule(...)` đi thì spec đó vẫn xanh
 * mà bộ dọn ngừng chạy im lặng — đặt chỗ hết lease giữ hạn mức + ví vĩnh viễn khi bật enforce. Spec này ghim: lịch mỗi
 * phút giây 40 (lệch campaign_scheduler_tick giây 20), múi giờ Hà Nội, job bọc recordRun + gọi đúng hàm của service,
 * cờ chặn chồng lượt, và dọn `released` quá 30 ngày nằm trong data_retention_cleanup.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from '@jest/globals';
import { CRON_JOBS } from '../../services/admin/cronJobRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(__dirname, '../scheduler.js'), 'utf8').replace(/\r\n/g, '\n');

describe('scheduler — cron send_quota_reservation_sweep', () => {
  it("đăng ký cron '40 * * * * *' giờ Hà Nội và gọi hàm dọn", () => {
    expect(source).toMatch(
      /cron\.schedule\('40 \* \* \* \* \*', async \(\) => \{\n\s*await sweepSendQuotaReservations\(\);\n\s*\}, \{ timezone: HANOI_TIME_ZONE \}\);/
    );
  });

  it('job bọc recordRun mã send_quota_reservation_sweep và chạy sweepReservations của service', () => {
    const start = source.indexOf('const sweepSendQuotaReservations = async () =>');
    expect(start).toBeGreaterThan(0);
    const body = source.slice(start, source.indexOf("cron.schedule('40 * * * * *'", start));
    expect(body).toContain("recordRun('send_quota_reservation_sweep'");
    expect(body).toContain("import('../services/quota/sendQuotaReservationSweeper.service.js')");
    expect(body).toContain('sweepReservations()');
  });

  it('có cờ chặn chồng lượt', () => {
    const start = source.indexOf('const sweepSendQuotaReservations = async () =>');
    const body = source.slice(start, source.indexOf("cron.schedule('40 * * * * *'", start));
    expect(body).toContain('if (sendQuotaReservationSweepRunning) return;');
    expect(body).toMatch(/finally \{\n\s*sendQuotaReservationSweepRunning = false;/);
  });

  it('khai báo trong cronJobRegistry là job tracked, không tuỳ chọn (chạy cả khi shadow/off)', () => {
    const entry = CRON_JOBS.find((job) => job.code === 'send_quota_reservation_sweep');
    expect(entry).toBeDefined();
    expect(entry.tracked).toBe(true);
    expect(entry.optional).toBeUndefined();
  });

  it('data_retention_cleanup dọn đặt chỗ released quá 30 ngày, cách ly lỗi khỏi phần còn lại', () => {
    const start = source.indexOf("recordRun('data_retention_cleanup'");
    expect(start).toBeGreaterThan(0);
    const body = source.slice(start, source.indexOf('}, { timezone: HANOI_TIME_ZONE });', start));
    expect(body).toContain('cleanupReleasedSendQuotaReservations');
    expect(body).toContain('sendQuotaReleasedDeleted');
    expect(body).toContain('sendQuotaReleasedError');
  });
});
