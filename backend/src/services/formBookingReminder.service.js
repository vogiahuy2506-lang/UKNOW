/**
 * Cron `form_booking_reminder` (PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-2a việc 5).
 * Gửi 1 thư nhắc trước 24 giờ cho các lượt đặt lịch qua Form đang chiếm chỗ. Giành quyền gửi
 * bằng UPDATE có điều kiện TRƯỚC khi gửi (formRepository.claimReminderSlot) để hai lượt cron
 * chạy chồng nhau không gửi trùng; gửi hỏng thì trả reminder_sent_at về NULL để lượt sau thử lại.
 */
import formRepository from '../repositories/form.repository.js';
import { sendSystemEmail, SENDER_NAME } from '../utils/systemEmail.util.js';
import { escapeHtml } from '../utils/htmlEscape.util.js';
import { formatAppointmentVn } from '../utils/formBooking.util.js';
import { logError } from '../utils/logger.util.js';

/**
 * @returns {Promise<{ candidates: number, sent: number, failed: number, synced: number }>}
 */
export async function runFormBookingReminder() {
  const candidates = await formRepository.listBookingReminderCandidates();
  let sent = 0;
  let failed = 0;

  for (const row of candidates) {
    const claimed = await formRepository.claimReminderSlot(row.id);
    if (!claimed) {
      // Đã bị giành bởi lượt cron khác chạy chồng lên, hoặc đã gửi trước đó — bỏ qua.
      continue;
    }

    try {
      const subject = `[${SENDER_NAME}] Nhắc lịch hẹn sắp tới - ${row.formTitle}`;
      const html = `
        <h2>Nhắc lịch hẹn sắp tới</h2>
        <p>Biểu mẫu: <strong>${escapeHtml(row.formTitle)}</strong></p>
        <p>Giờ hẹn: <strong>${escapeHtml(formatAppointmentVn(new Date(row.appointmentAt)))}</strong></p>
      `;
      await sendSystemEmail({
        to: row.respondentEmail,
        subject,
        html,
      });
      sent += 1;
    } catch (error) {
      await formRepository.unclaimReminderSlot(row.id);
      failed += 1;
      logError(`[formBookingReminder] Gửi thư nhắc lịch thất bại cho submission ${row.id}: ${error.message}`);
    }
  }

  return {
    candidates: candidates.length,
    sent,
    failed,
    synced: sent,
  };
}
