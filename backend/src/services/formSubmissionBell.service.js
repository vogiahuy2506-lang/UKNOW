import { logError } from '../utils/logger.util.js';

/**
 * Chuông "Có bài nộp mới" của Biểu mẫu (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11, PR-8c).
 *
 * Khách nộp bài công khai → báo CHỦ workspace trên chuông (sự kiện `form_submission_received`, migration 302), bấm mở thẳng trang bài nộp
 * của biểu mẫu đó. Chỉ gửi cho CHỦ: dispatcher (`notifyUsers`) nhận danh sách id người nhận cụ thể, chưa có định tuyến theo quyền
 * nhân viên; chuông cũng gắn theo từng tài khoản đăng nhập nên nhân viên không "ké" được chuông của chủ. Thêm nhân viên có quyền
 * `forms` cần một truy vấn "nhân viên theo quyền" + chính sách riêng — chưa làm, không chế cơ chế mới ở PR này.
 *
 * GỘP chống spam: `dedupeKey` = `form_submission:<formId>:<cửa sổ 10 phút>`; khoá unique (user, dedupe_key) của `user_notifications` khiến
 * chỉ bài nộp ĐẦU TIÊN của mỗi cửa sổ sinh chuông (nội dung nêu người nộp đầu tiên đó). Cửa sổ cố định theo đồng hồ (không trượt) → tối đa
 * một chuông mỗi biểu mẫu mỗi 10 phút, nhưng hai bài nộp sát mép cửa sổ có thể thành hai chuông.
 *
 * KHÔNG BAO GIỜ làm chậm hay làm hỏng bài nộp: gọi kiểu fire-and-forget và nuốt mọi lỗi. Lời gọi đang bay được giữ trong một Set để TEST
 * chờ tất định (`settlePendingFormSubmissionBells`) — `void asyncFn()` trần từng làm đỏ CI ở PR-4b: chuông trễ ghi SAU khi ca sau đã
 * TRUNCATE (id đánh lại từ 1) rơi vào ca sau. `tests/integration/helpers/db.js` `truncateAll()` cũng gọi hàm settle này.
 */

export const FORM_SUBMISSION_BELL_EVENT = 'form_submission_received';
export const FORM_SUBMISSION_BELL_WINDOW_MS = 10 * 60 * 1000;

const TITLE_MAX = 120;
const WHO_MAX = 80;

/**
 * Khoá chống trùng theo biểu mẫu + cửa sổ 10 phút (mốc theo đồng hồ UTC — chỉ cần ổn định, không cần là giờ VN).
 *
 * @param {number|string} formId
 * @param {Date} [now]
 * @returns {string}
 */
export function buildFormSubmissionBellDedupeKey(formId, now = new Date()) {
  const bucket = Math.floor(now.getTime() / FORM_SUBMISSION_BELL_WINDOW_MS);
  return `form_submission:${formId}:${bucket}`;
}

/** Tên hiển thị của người nộp trong chuông: tên → email → SĐT; không có gì thì null (câu chữ sẽ nói "một khách"). */
function pickRespondentLabel({ respondentName, respondentEmail, respondentPhone }) {
  const raw = [respondentName, respondentEmail, respondentPhone].find((value) => String(value ?? '').trim());
  return raw ? String(raw).trim().slice(0, WHO_MAX) : null;
}

/**
 * Báo chủ biểu mẫu. Không bao giờ ném lỗi ra ngoài.
 *
 * @param {{
 *   form: { id: number|string, workspaceOwnerId: number|string, title?: string },
 *   submission?: { id?: number|string }|null,
 *   respondentName?: string|null,
 *   respondentEmail?: string|null,
 *   respondentPhone?: string|null,
 * }} input
 * @param {Date} [now]
 */
export async function notifyOwnerFormSubmission(input, now = new Date()) {
  const { form, submission = null } = input || {};
  try {
    const ownerId = Number(form?.workspaceOwnerId);
    if (!Number.isSafeInteger(ownerId) || ownerId <= 0 || form?.id == null) return;
    // Nạp muộn: cùng lý do với formFileUpload.service.js — dispatcher kéo theo systemEmail + 3 repository thông báo, không cần trên
    // đường nộp bài cho tới khi thật sự phát chuông, và nạp tĩnh sẽ buộc mọi spec mock systemEmail.util phải khai thêm export.
    const { notifyUsers } = await import('./notification/notificationDispatch.service.js');
    const title = String(form.title || '').slice(0, TITLE_MAX);
    const who = pickRespondentLabel(input);
    const link = `/app/forms/${form.id}/submissions`;
    await notifyUsers({
      eventType: FORM_SUBMISSION_BELL_EVENT,
      userIds: [ownerId],
      title: `Có bài nộp mới — ${title}`,
      titleEn: `New submission — ${title}`,
      message:
        `${who || 'Một khách'} vừa gửi biểu mẫu "${title}". `
        + 'Các bài nộp tiếp theo của biểu mẫu này trong 10 phút tới sẽ không báo lại — mở trang bài nộp để xem đủ.',
      messageEn:
        `${who || 'A customer'} just submitted your form "${title}". `
        + 'Further submissions of this form in the next 10 minutes will not notify again — open the submissions page to see them all.',
      link,
      severity: 'info',
      metadata: {
        formId: String(form.id),
        formTitle: title,
        ...(submission?.id != null ? { firstSubmissionId: String(submission.id) } : {}),
      },
      dedupeKey: buildFormSubmissionBellDedupeKey(form.id, now),
    });
  } catch (error) {
    logError(`[FormSubmissionBell] Không báo được chủ biểu mẫu ${form?.id} có bài nộp mới: ${error?.message || error}`);
  }
}

const pendingBells = new Set();

/**
 * Bắn chuông kiểu fire-and-forget (không bắt khách chờ, không thể làm hỏng bài nộp: lỗi đồng bộ cũng bị nuốt).
 *
 * @param {Parameters<typeof notifyOwnerFormSubmission>[0]} input
 */
export function fireFormSubmissionBell(input) {
  try {
    const pending = notifyOwnerFormSubmission(input).finally(() => pendingBells.delete(pending));
    pendingBells.add(pending);
  } catch (error) {
    logError(`[FormSubmissionBell] Lỗi khởi tạo chuông bài nộp mới: ${error?.message || error}`);
  }
}

/** Chờ mọi chuông bài nộp mới đang bay xong (dùng cho test; production không cần gọi). */
export async function settlePendingFormSubmissionBells() {
  await Promise.allSettled([...pendingBells]);
}
