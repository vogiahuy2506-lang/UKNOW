/**
 * PR-10b (C6-01) — job chạy HẰNG THÁNG phải được giữ lịch sử lâu hơn 14 ngày, không thì trang "Tác vụ
 * định kỳ" báo "Chưa ghi nhận" + "Hỏng thì…" ~16 ngày mỗi tháng cho job khoẻ.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from '@jest/globals';
import { CRON_JOBS, getMonthlyCronJobCodes } from '../cronJobRegistry.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEDULER_PATH = path.resolve(__dirname, '../../../utils/scheduler.js');

describe('cron hằng tháng — giữ lịch sử lâu hơn', () => {
  it('đúng hai job tháng: tổng hợp chatbot theo tháng + đóng sổ hoa hồng', () => {
    expect([...getMonthlyCronJobCodes()].sort()).toEqual(['affiliate_month_closing', 'chatbot_digest_monthly']);
  });

  it('mọi job có lịch ghi "tháng" đều gắn monthly: true (thêm job tháng mới mà quên cờ là đỏ)', () => {
    const monthlyBySchedule = CRON_JOBS.filter((j) => /tháng/i.test(j.schedule)).map((j) => j.code).sort();
    expect(monthlyBySchedule).toEqual([...getMonthlyCronJobCodes()].sort());
  });

  it('scheduler truyền danh sách job tháng vào deleteOlderThan (không thì cờ monthly vô tác dụng)', () => {
    const source = fs.readFileSync(SCHEDULER_PATH, 'utf8');
    expect(source).toMatch(/deleteOlderThan\(\{[\s\S]*?keepJobCodes:\s*getMonthlyCronJobCodes\(\)/);
  });
});
