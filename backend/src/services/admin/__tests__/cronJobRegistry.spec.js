/**
 * Case 6 — mã CRON_JOBS tracked phải khớp chuỗi/hằng truyền vào recordRun trong scheduler.js.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from '@jest/globals';
import { CRON_JOBS } from '../cronJobRegistry.js';
import {
  PAYOS_RECONCILE_JOB_CODE,
  PAYOS_EXPIRE_JOB_CODE,
} from '../../payment/payosReconcile.service.js';
import {
  EINVOICE_RECONCILE_JOB_CODE,
  EINVOICE_EMAIL_JOB_CODE,
  EINVOICE_REPAIR_JOB_CODE,
  EINVOICE_SERIES_CHECK_JOB_CODE,
} from '../../payment/matbaoInvoice.service.js';
import { STORAGE_RECONCILE_JOB_CODE } from '../../storage/storageReconcile.service.js';
import { AFFILIATE_REVENUE_SWEEP_JOB_CODE } from '../../affiliate/affiliateRevenueSweep.service.js';
import { AFFILIATE_MONTH_CLOSING_JOB_CODE } from '../../affiliate/affiliateMonthClosing.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEDULER_PATH = path.resolve(__dirname, '../../../utils/scheduler.js');

function extractRecordedJobCodes(schedulerSource) {
  const codes = new Set();
  const literalRe = /recordRun\(\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = literalRe.exec(schedulerSource)) !== null) {
    codes.add(m[1]);
  }

  // Jobs dùng hằng — resolve từ export service.
  if (/recordRun\(\s*PAYOS_RECONCILE_JOB_CODE/.test(schedulerSource)) {
    codes.add(PAYOS_RECONCILE_JOB_CODE);
  }
  if (/recordRun\(\s*PAYOS_EXPIRE_JOB_CODE/.test(schedulerSource)) {
    codes.add(PAYOS_EXPIRE_JOB_CODE);
  }
  if (/recordRun\(\s*EINVOICE_RECONCILE_JOB_CODE/.test(schedulerSource)) {
    codes.add(EINVOICE_RECONCILE_JOB_CODE);
  }
  if (/recordRun\(\s*EINVOICE_EMAIL_JOB_CODE/.test(schedulerSource)) {
    codes.add(EINVOICE_EMAIL_JOB_CODE);
  }
  if (/recordRun\(\s*EINVOICE_REPAIR_JOB_CODE/.test(schedulerSource)) {
    codes.add(EINVOICE_REPAIR_JOB_CODE);
  }
  if (/recordRun\(\s*EINVOICE_SERIES_CHECK_JOB_CODE/.test(schedulerSource)) {
    codes.add(EINVOICE_SERIES_CHECK_JOB_CODE);
  }
  if (/recordRun\(\s*STORAGE_RECONCILE_JOB_CODE/.test(schedulerSource)) {
    codes.add(STORAGE_RECONCILE_JOB_CODE);
  }
  if (/recordRun\(\s*AFFILIATE_REVENUE_SWEEP_JOB_CODE/.test(schedulerSource)) {
    codes.add(AFFILIATE_REVENUE_SWEEP_JOB_CODE);
  }
  if (/recordRun\(\s*AFFILIATE_MONTH_CLOSING_JOB_CODE/.test(schedulerSource)) {
    codes.add(AFFILIATE_MONTH_CLOSING_JOB_CODE);
  }
  return codes;
}

describe('cronJobRegistry ↔ scheduler recordRun', () => {
  it('mọi job tracked trong CRON_JOBS đều có recordRun tương ứng', () => {
    const source = fs.readFileSync(SCHEDULER_PATH, 'utf8');
    const recorded = extractRecordedJobCodes(source);
    const tracked = CRON_JOBS.filter((j) => j.tracked).map((j) => j.code);

    expect(tracked.length).toBeGreaterThanOrEqual(3);
    for (const code of tracked) {
      expect(recorded.has(code)).toBe(true);
    }
  });

  it('mọi recordRun trong scheduler đều nằm trong CRON_JOBS', () => {
    const source = fs.readFileSync(SCHEDULER_PATH, 'utf8');
    const recorded = extractRecordedJobCodes(source);
    const catalog = new Set(CRON_JOBS.map((j) => j.code));

    for (const code of recorded) {
      expect(catalog.has(code)).toBe(true);
    }
  });

  it('đúng 36 cron cố định, không trùng mã', () => {
    // 29 → 30: thêm notification_templates (PLAN_NOTIFICATION_CENTER_SAVE_AS_TEMPLATE,
    // PR-1 — Save As Template MVP, dispatch mark-only vì template chưa lưu targeting).
    // 30 → 31: thêm facebook_token_refresh (06209dca, 21/09/2026 — làm mới Page Access Token 03:00
    // hàng ngày). Thêm cron mà quên sửa số ở đây là đỏ cả bộ unit, chặn luôn deploy backend.
    // 31 → 33: thêm affiliate_revenue_sweep + affiliate_month_closing (PR-4 đợt rà soát 26/09,
    // PLAN_VA_LOI_LUONG_TIEN_2026-09-26 PR-6 Việc 6.3 — 2 job affiliate đã gọi recordRun từ trước
    // nhưng chưa có trong CRON_JOBS nên không được cronJobRegistry giám sát/cảnh báo).
    // 33 → 34: thêm channel_disconnect_alert (P3 PLAN_TG_WA_DAY_DU_2026-09-29 — báo chủ khi kênh mất kết nối).
    // 34 → 35: thêm product_chat_mention_scan (PLAN_PHEU_NGUOI_GIA_SO_HOI_CHATBOT PR-D — đếm lượt hỏi chatbot về sản phẩm).
    // 35 → 36: thêm user_notifications_cleanup (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO PR-1 — dọn thông báo chuông cũ 03:10).
    // 36 → 37: thêm support_ticket_auto_close (PLAN_TICKET_GOP_Y_VA_CHUONG_THONG_BAO PR-4 — đóng ticket chờ khách quá 7 ngày, 03:20).
    expect(CRON_JOBS).toHaveLength(37);
    const codes = CRON_JOBS.map((j) => j.code);
    expect(new Set(codes).size).toBe(37);
  });
});
