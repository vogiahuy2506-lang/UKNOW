/**
 * PLAN_ZALO_TU_DONG_DONG_Y_KET_BAN_2026-10-17 Việc 5 — cron quét bù lời mời kết bạn Zalo phải THẬT SỰ được đăng ký.
 *
 * `cronJobRegistry.spec.js` chỉ kiểm mã job có trong `recordRun(...)`; xoá dòng `cron.schedule(...)` đi thì spec đó vẫn
 * xanh mà cron ngừng chạy im lặng (chỉ còn đường sự kiện, mất toàn bộ quét bù). Spec này ghim đúng ba thứ: lịch
 * phút 7/17/27... (lệch cron nhóm 5/15/25 và cron listener 0/5/10), múi giờ Hà Nội, và job gọi đúng hàm của service.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from '@jest/globals';
import { CRON_JOBS } from '../../services/admin/cronJobRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const source = fs.readFileSync(path.resolve(__dirname, '../scheduler.js'), 'utf8').replace(/\r\n/g, '\n');

describe('scheduler — cron zalo_friend_auto_accept', () => {
  it("đăng ký cron '7-59/10 * * * *' giờ Hà Nội và gọi hàm quét", () => {
    expect(source).toMatch(
      /cron\.schedule\('7-59\/10 \* \* \* \*', async \(\) => \{\n\s*await sweepZaloFriendAutoAccept\(\);\n\s*\}, \{ timezone: HANOI_TIME_ZONE \}\);/
    );
  });

  it('job bọc recordRun mã zalo_friend_auto_accept và chạy sweepAllEnabledAccounts của service', () => {
    const start = source.indexOf('const sweepZaloFriendAutoAccept = async () =>');
    expect(start).toBeGreaterThan(0);
    const body = source.slice(start, source.indexOf("cron.schedule('7-59/10", start));
    expect(body).toContain("recordRun('zalo_friend_auto_accept'");
    expect(body).toContain("import('../services/zalo/zaloFriendAutoAccept.service.js')");
    expect(body).toContain('sweepAllEnabledAccounts()');
  });

  it('khai báo trong cronJobRegistry là job tracked (không thì trang "Tác vụ định kỳ" báo "Chưa ghi nhận")', () => {
    const entry = CRON_JOBS.find((job) => job.code === 'zalo_friend_auto_accept');
    expect(entry).toBeDefined();
    expect(entry.tracked).toBe(true);
    // Không phải job tuỳ chọn: cron luôn được đăng ký lúc khởi động (không có biến môi trường tắt).
    expect(entry.optional).toBeUndefined();
  });

  it('có cờ chặn chồng lượt (lượt dài hơn 10 phút vì chờ giãn cách giữa các lần đồng ý)', () => {
    const start = source.indexOf('const sweepZaloFriendAutoAccept = async () =>');
    const body = source.slice(start, source.indexOf("cron.schedule('7-59/10", start));
    expect(body).toContain('if (zaloFriendAutoAcceptRunning) return;');
    expect(body).toMatch(/finally \{\n\s*zaloFriendAutoAcceptRunning = false;/);
  });
});
