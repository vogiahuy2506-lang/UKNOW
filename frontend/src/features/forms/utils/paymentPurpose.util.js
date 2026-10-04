// Cách chủ biểu mẫu gọi khoản tiền (paymentConfig.purpose) — chép từ
// backend/src/utils/formDefinition.util.js (PAYMENT_PURPOSES). Lệch thì backend đúng.
export const PAYMENT_PURPOSES = Object.freeze(['hold', 'order', 'deposit']);
export const DEFAULT_PAYMENT_PURPOSE = 'hold';

/** Thiếu / lạ -> 'hold' (biểu mẫu và bài nộp cũ không có purpose vẫn ra chữ "giữ chỗ"). */
export function resolvePaymentPurpose(value) {
  return PAYMENT_PURPOSES.includes(value) ? value : DEFAULT_PAYMENT_PURPOSE;
}

// Bảng tra khoá i18n theo purpose. KHÔNG dùng `t(key) || x` làm dự phòng — t() trả lại chính khoá
// khi thiếu bản dịch nên dự phòng đó không bao giờ chạy; mặc định nằm ở resolvePaymentPurpose.
export const PUBLIC_PAYMENT_KEYS = Object.freeze({
  hold: Object.freeze({
    requiredNotice: 'publicForm.payment.requiredNotice',
    tooManyPendingHolds: 'publicForm.payment.tooManyPendingHolds',
    holdCountdown: 'publicForm.payment.holdCountdown',
    holdExpiredTitle: 'publicForm.payment.holdExpiredTitle',
    holdExpiredDesc: 'publicForm.payment.holdExpiredDesc',
  }),
  order: Object.freeze({
    requiredNotice: 'publicForm.payment.purposeOrder.requiredNotice',
    tooManyPendingHolds: 'publicForm.payment.purposeOrder.tooManyPendingHolds',
    holdCountdown: 'publicForm.payment.purposeOrder.holdCountdown',
    holdExpiredTitle: 'publicForm.payment.purposeOrder.holdExpiredTitle',
    holdExpiredDesc: 'publicForm.payment.purposeOrder.holdExpiredDesc',
  }),
  deposit: Object.freeze({
    requiredNotice: 'publicForm.payment.purposeDeposit.requiredNotice',
    tooManyPendingHolds: 'publicForm.payment.purposeDeposit.tooManyPendingHolds',
    holdCountdown: 'publicForm.payment.purposeDeposit.holdCountdown',
    holdExpiredTitle: 'publicForm.payment.purposeDeposit.holdExpiredTitle',
    holdExpiredDesc: 'publicForm.payment.purposeDeposit.holdExpiredDesc',
  }),
});

export const EDITOR_PAYMENT_PURPOSE_KEYS = Object.freeze({
  hold: Object.freeze({
    option: 'forms.editorPage.payment.purposeHold',
    holdMinutesLabel: 'forms.editorPage.payment.holdMinutesLabel',
  }),
  order: Object.freeze({
    option: 'forms.editorPage.payment.purposeOrder',
    holdMinutesLabel: 'forms.editorPage.payment.holdMinutesLabelOrder',
  }),
  deposit: Object.freeze({
    option: 'forms.editorPage.payment.purposeDeposit',
    holdMinutesLabel: 'forms.editorPage.payment.holdMinutesLabelDeposit',
  }),
});

/** @returns {Record<string,string>} khoá chữ phía người mua theo purpose (mặc định hold). */
export function publicPaymentKeys(purpose) {
  return PUBLIC_PAYMENT_KEYS[resolvePaymentPurpose(purpose)];
}

export function editorPaymentPurposeKeys(purpose) {
  return EDITOR_PAYMENT_PURPOSE_KEYS[resolvePaymentPurpose(purpose)];
}
