/**
 * Cron `form_booking_reminder` (PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md, PR-2a việc 5).
 * Gửi 1 thư nhắc trước 24 giờ cho các lượt đặt lịch qua Form đang chiếm chỗ. Giành quyền gửi
 * bằng UPDATE có điều kiện TRƯỚC khi gửi (formRepository.claimReminderSlot) để hai lượt cron
 * chạy chồng nhau không gửi trùng; gửi hỏng thì trả reminder_sent_at về NULL để lượt sau thử lại.
 */
import formRepository, { MAX_FORM_RESPONDENT_EMAILS_PER_24H } from '../repositories/form.repository.js';
import { sendSystemEmail, SENDER_NAME } from '../utils/systemEmail.util.js';
import { escapeHtml } from '../utils/htmlEscape.util.js';
import { formatAppointmentVn } from '../utils/formBooking.util.js';
import { logError } from '../utils/logger.util.js';
import { buildFormUnsubscribeFooterHtml } from '../utils/formUnsubscribeFooter.util.js';

/**
 * @returns {Promise<{ candidates: number, sent: number, failed: number, skippedByCap: number, synced: number }>}
 */
export async function runFormBookingReminder() {
  const candidates = await formRepository.listBookingReminderCandidates();
  let sent = 0;
  let failed = 0;
  let skippedByCap = 0;

  for (const row of candidates) {
    // Trần thư gửi người đặt (PLAN...#Trần thư gửi người đặt) — đếm lại MỖI lần vì một lượt chạy
    // có thể có nhiều ứng viên cùng form; ứng viên gửi trước làm tăng count cho ứng viên sau
    // (đúng ý — tính cả xác nhận và nhắc trong 24h qua). Vượt trần thì KHÔNG claim (để
    // reminder_sent_at NULL), lượt cron sau (15 phút) sẽ tự thử lại khi trần đã hạ.
    const formEmailCount = await formRepository.countFormRespondentEmailsLast24h(row.formId);
    if (formEmailCount >= MAX_FORM_RESPONDENT_EMAILS_PER_24H) {
      skippedByCap += 1;
      logError(`[formBookingReminder] Bỏ nhắc lịch cho form ${row.formId} — đã vượt trần ${MAX_FORM_RESPONDENT_EMAILS_PER_24H} thư/24h`);
      continue;
    }

    const claimed = await formRepository.claimReminderSlot(row.id);
    if (!claimed) {
      // Đã bị giành bởi lượt cron khác chạy chồng lên, hoặc đã gửi trước đó — bỏ qua.
      continue;
    }

    try {
      const subject = `[${SENDER_NAME}] Nhắc lịch hẹn sắp tới - ${row.formTitle}`;
      const footerHtml = buildFormUnsubscribeFooterHtml({
        marketingConsent: row.marketingConsent,
        consentWithdrawnAt: row.consentWithdrawnAt,
        unsubscribeToken: row.unsubscribeToken,
      });
      const html = `
        <h2>Nhắc lịch hẹn sắp tới</h2>
        <p>Biểu mẫu: <strong>${escapeHtml(row.formTitle)}</strong></p>
        <p>Giờ hẹn: <strong>${escapeHtml(formatAppointmentVn(new Date(row.appointmentAt)))}</strong></p>
        ${footerHtml}
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
    skippedByCap,
    synced: sent,
  };
}
