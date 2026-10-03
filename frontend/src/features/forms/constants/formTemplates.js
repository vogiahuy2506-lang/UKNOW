// Mẫu biểu mẫu dựng sẵn cho bước "Chọn mẫu" khi TẠO biểu mẫu mới (FormEditorPage).
//
// File THUẦN: không JSX, không import React/i18n, để backend spec đối chiếu hợp đồng
// (backend/src/utils/__tests__/formTemplates.contract.spec.js) import trực tiếp và đẩy từng mẫu qua
// normalizeFormFields / normalizeFormSettings / normalizeBookingConfig / normalizePaymentConfig THẬT.
//
// Mẫu chỉ điền sẵn state mà trình soạn vốn đã có (fields, settings, booking, payment) — người dùng
// bấm Lưu thì đi đúng đường lưu cũ, không có API hay cấu trúc dữ liệu riêng cho mẫu.
// Chữ hiển thị đi qua khoá i18n (forms.editorPage.templates.*): truyền `t` vào buildFormFromTemplate.

const T = 'forms.editorPage.templates';

// Khoá nhãn dùng chung giữa các mẫu. `forms.editorPage.defaultFieldName` là nhãn mặc định sẵn có
// của ô Họ và tên — dùng lại để mẫu "Trống" giống hệt biểu mẫu mới trước khi có bước chọn mẫu.
const NAME_LABEL = 'forms.editorPage.defaultFieldName';
const PHONE_LABEL = `${T}.fields.phone`;
const EMAIL_LABEL = `${T}.fields.email`;
const MESSAGE_LABEL = `${T}.fields.message`;

const nameField = (required = true) => ({ labelKey: NAME_LABEL, type: 'short_text', role: 'name', required });
const phoneField = (required = true) => ({ labelKey: PHONE_LABEL, type: 'phone', role: 'phone', required });
const emailField = (required = true) => ({ labelKey: EMAIL_LABEL, type: 'email', role: 'email', required });

// Khung giờ mẫu của mẫu "Đặt lịch hẹn": bật đặt lịch BẮT BUỘC có ít nhất 1 khung giờ trong tuần
// (normalizeBookingConfig ném 400 nếu rỗng), nên phải điền sẵn thì lưu ngay mới qua được. Người dùng
// thấy khối Đặt lịch mở sẵn kèm các giờ này để chỉnh lại theo lịch của mình.
const SAMPLE_WEEKLY_SLOTS = Object.freeze({
  1: ['09:00', '14:00'],
  2: ['09:00', '14:00'],
  3: ['09:00', '14:00'],
  4: ['09:00', '14:00'],
  5: ['09:00', '14:00'],
});

/**
 * Cấu trúc một mẫu:
 *  - id, nameKey, descKey: hiển thị ở bước chọn mẫu.
 *  - fields: [{ labelKey, type, role, required, optionKeys? }] — cùng hình dạng trường trong state trình soạn.
 *  - settings: { submitTextKey, successMessageKey, notifyOwner, sendConfirmation } — chỉ GHI ĐÈ các khoá này;
 *    consentEnabled / redirectUrl giữ nguyên mặc định (ô đồng ý tiếp thị là quyết định pháp lý của chủ form).
 *  - bookingSlots: weeklySlots mẫu (có thì bật Đặt lịch hẹn), hoặc null.
 *  - payment: true thì bật Thanh toán giữ chỗ (số tiền / tài khoản nhận tiền người dùng tự khai).
 *  - ownerOnly: mẫu chạm paymentConfig — chỉ chủ tài khoản được dùng (nhân viên không gửi được khoá này).
 */
export const FORM_TEMPLATES = Object.freeze([
  {
    id: 'consult',
    nameKey: `${T}.consult.name`,
    descKey: `${T}.consult.desc`,
    fields: [nameField(), phoneField(), emailField(false), { labelKey: MESSAGE_LABEL, type: 'long_text', role: '', required: false }],
    settings: {
      submitTextKey: `${T}.consult.submit`,
      successMessageKey: `${T}.consult.success`,
      notifyOwner: true,
      sendConfirmation: false,
    },
    bookingSlots: null,
    payment: false,
    ownerOnly: false,
  },
  {
    id: 'booking',
    nameKey: `${T}.booking.name`,
    descKey: `${T}.booking.desc`,
    // Email bắt buộc + sendConfirmation bật: thư xác nhận / nhắc hẹn chỉ gửi khi đủ cả hai
    // (xem emailHint ở khối Đặt lịch hẹn).
    fields: [nameField(), phoneField(), emailField(), { labelKey: `${T}.fields.note`, type: 'long_text', role: '', required: false }],
    settings: {
      submitTextKey: `${T}.booking.submit`,
      successMessageKey: `${T}.booking.success`,
      notifyOwner: true,
      sendConfirmation: true,
    },
    bookingSlots: SAMPLE_WEEKLY_SLOTS,
    payment: false,
    ownerOnly: false,
  },
  {
    id: 'payment',
    nameKey: `${T}.payment.name`,
    descKey: `${T}.payment.desc`,
    fields: [nameField(), phoneField(), emailField(), { labelKey: `${T}.fields.note`, type: 'long_text', role: '', required: false }],
    settings: {
      submitTextKey: `${T}.payment.submit`,
      successMessageKey: 'publicForm.defaultSuccess',
      notifyOwner: true,
      sendConfirmation: true,
    },
    bookingSlots: null,
    payment: true,
    ownerOnly: true,
  },
  {
    id: 'survey',
    nameKey: `${T}.survey.name`,
    descKey: `${T}.survey.desc`,
    fields: [
      {
        labelKey: `${T}.survey.q1`,
        type: 'radio',
        role: '',
        required: true,
        optionKeys: [`${T}.survey.q1o1`, `${T}.survey.q1o2`, `${T}.survey.q1o3`, `${T}.survey.q1o4`],
      },
      {
        labelKey: `${T}.survey.q2`,
        type: 'radio',
        role: '',
        required: true,
        optionKeys: [`${T}.survey.q2o1`, `${T}.survey.q2o2`, `${T}.survey.q2o3`, `${T}.survey.q2o4`],
      },
      {
        labelKey: `${T}.survey.q3`,
        type: 'checkbox',
        role: '',
        required: false,
        optionKeys: [`${T}.survey.q3o1`, `${T}.survey.q3o2`, `${T}.survey.q3o3`, `${T}.survey.q3o4`],
      },
      { labelKey: `${T}.survey.q4`, type: 'long_text', role: '', required: false },
    ],
    settings: {
      submitTextKey: `${T}.survey.submit`,
      successMessageKey: `${T}.survey.success`,
      notifyOwner: true,
      sendConfirmation: false,
    },
    bookingSlots: null,
    payment: false,
    ownerOnly: false,
  },
  {
    // Giống hệt biểu mẫu mới trước khi có bước chọn mẫu: một ô Họ và tên, cài đặt mặc định.
    id: 'blank',
    nameKey: `${T}.blank.name`,
    descKey: `${T}.blank.desc`,
    fields: [nameField()],
    settings: null,
    bookingSlots: null,
    payment: false,
    ownerOnly: false,
  },
]);

/** Mọi khoá i18n một mẫu tham chiếu — dùng cho spec kiểm khoá có đủ ở cả vi và en. */
export function collectTemplateKeys(template) {
  const keys = [template.nameKey, template.descKey];
  for (const f of template.fields) {
    keys.push(f.labelKey, ...(f.optionKeys || []));
  }
  if (template.settings) keys.push(template.settings.submitTextKey, template.settings.successMessageKey);
  return keys;
}

/**
 * Dựng state trình soạn từ một mẫu.
 *
 * @param {object} template phần tử của FORM_TEMPLATES
 * @param {(key: string) => string} t hàm dịch
 * @returns {{
 *   fields: Array<{ key: string, label: string, type: string, required: boolean, role: string, options: string[] }>,
 *   settings: object,
 *   bookingWeeklySlots: Record<string, string[]>|null,
 *   enablePayment: boolean
 * }}
 *   `settings` chỉ chứa các khoá mẫu ghi đè (rỗng khi mẫu không đụng cài đặt) — trình soạn gộp lên state hiện tại.
 */
export function buildFormFromTemplate(template, t) {
  const fields = template.fields.map((f) => ({
    key: '', // trường mới key rỗng để server tự sinh (hợp đồng PR-1b)
    label: t(f.labelKey),
    type: f.type,
    required: Boolean(f.required),
    role: f.role || '',
    options: (f.optionKeys || []).map((k) => t(k)),
  }));

  const settings = template.settings
    ? {
        notifyOwner: template.settings.notifyOwner,
        sendConfirmation: template.settings.sendConfirmation,
        submitButtonText: t(template.settings.submitTextKey),
        successMessage: t(template.settings.successMessageKey),
      }
    : {};

  const bookingWeeklySlots = template.bookingSlots
    ? Object.fromEntries(Object.entries(template.bookingSlots).map(([day, times]) => [day, [...times]]))
    : null;

  return { fields, settings, bookingWeeklySlots, enablePayment: Boolean(template.payment) };
}
