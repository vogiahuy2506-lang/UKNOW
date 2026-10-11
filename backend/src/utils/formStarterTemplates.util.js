/**
 * Mẫu biểu mẫu dựng sẵn Ở BACKEND (PLAN_BIEU_MAU_TUY_BIEN_AI_LANDING_2026-10-11 PR-6).
 *
 * Vì sao có bản backend: chỗ trống có loại trong HTML landing (`<div data-founderai-form-slot="booking">`) được thay bằng
 * biểu mẫu thật NGAY LÚC LƯU landing (landingPageAdmin.service.js) — không có trình soạn Biểu mẫu ở giữa để mẫu frontend
 * (`frontend/src/features/forms/constants/formTemplates.js`, chữ qua i18n) điền sẵn state. Nên backend cần nguồn mẫu riêng.
 *
 * ĐỒNG BỘ VỚI FRONTEND: nội dung mẫu ở đây PHẢI bằng mẫu frontend bản tiếng Việt (cùng trường / loại / role / bắt buộc /
 * lựa chọn / cài đặt / khung giờ đặt lịch). Lệch là đỏ ở `formTemplates.contract.spec.js` (đẩy từng mẫu frontend qua bản dịch vi
 * rồi so với bản này) — sửa chữ ở một bên mà quên bên kia thì CI bắt, không phải khách bắt.
 *
 * Hình dạng mỗi mẫu khớp `buildFormFromTemplate` phía frontend:
 *   - fields: [{ label, type, role, required, options[] }]
 *   - settings: { submitButtonText, successMessage, notifyOwner, sendConfirmation } hoặc null (mẫu "blank": cài đặt mặc định)
 *   - bookingWeeklySlots: khung giờ mẫu của mẫu đặt lịch (bật BẮT BUỘC ≥1 khung giờ — normalizeBookingConfig), hoặc null
 *   - payment: true = mẫu thu tiền
 *
 * QĐ4 (AI/hệ thống KHÔNG BAO GIỜ điền tiền / tài khoản): mẫu `payment` tạo biểu mẫu thu thông tin bình thường với
 * `payment_config = null` (xem `buildStarterFormDraft` — `paymentConfig` luôn null), đã xuất bản để landing chạy ngay;
 * chủ tự khai số tiền + tài khoản nhận tiền trong trình soạn Biểu mẫu để bật thu tiền. Cờ "cần bổ sung" lưu ở cột
 * `landing_page_forms.kind` (= 'payment') và được TÍNH khi đọc: kind payment mà biểu mẫu chưa có `payment_config` bật.
 */
import { FORM_SLOT_KINDS } from './landingHtmlInjection.util.js';

const WEEKDAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'];

const nameField = (required = true) => ({ label: 'Họ và tên', type: 'short_text', role: 'name', required, options: [] });
const phoneField = (required = true) => ({ label: 'Số điện thoại', type: 'phone', role: 'phone', required, options: [] });
const emailField = (required = true) => ({ label: 'Địa chỉ Email', type: 'email', role: 'email', required, options: [] });
const noteField = () => ({ label: 'Ghi chú', type: 'long_text', role: '', required: false, options: [] });

/** Khung giờ mẫu của mẫu đặt lịch: thứ 2–6, 09:00 và 14:00 (khoá '1'..'5', 0 = Chủ nhật). */
const SAMPLE_WEEKLY_SLOTS = Object.freeze({
  1: Object.freeze(['09:00', '14:00']),
  2: Object.freeze(['09:00', '14:00']),
  3: Object.freeze(['09:00', '14:00']),
  4: Object.freeze(['09:00', '14:00']),
  5: Object.freeze(['09:00', '14:00']),
});

export const FORM_STARTER_TEMPLATES = Object.freeze({
  consult: {
    fields: [
      nameField(),
      phoneField(),
      emailField(false),
      { label: 'Lời nhắn', type: 'long_text', role: '', required: false, options: [] },
    ],
    settings: {
      submitButtonText: 'Gửi đăng ký',
      successMessage: 'Cảm ơn bạn đã đăng ký. Chúng tôi sẽ liên hệ lại với bạn sớm.',
      notifyOwner: true,
      sendConfirmation: false,
    },
    bookingWeeklySlots: null,
    payment: false,
  },
  booking: {
    // Email bắt buộc + sendConfirmation bật: thư xác nhận / nhắc hẹn chỉ gửi khi đủ cả hai.
    fields: [nameField(), phoneField(), emailField(), noteField()],
    settings: {
      submitButtonText: 'Đặt lịch',
      successMessage: 'Cảm ơn bạn. Lịch hẹn của bạn đã được ghi nhận.',
      notifyOwner: true,
      sendConfirmation: true,
    },
    bookingWeeklySlots: SAMPLE_WEEKLY_SLOTS,
    payment: false,
  },
  payment: {
    fields: [nameField(), phoneField(), emailField(), noteField()],
    settings: {
      submitButtonText: 'Đăng ký và thanh toán',
      successMessage: 'Cảm ơn bạn đã gửi thông tin!',
      notifyOwner: true,
      sendConfirmation: true,
    },
    bookingWeeklySlots: null,
    payment: true,
  },
  survey: {
    fields: [
      {
        label: 'Bạn biết đến chúng tôi qua đâu?',
        type: 'radio',
        role: '',
        required: true,
        options: ['Facebook', 'Zalo', 'Bạn bè giới thiệu', 'Khác'],
      },
      {
        label: 'Bạn đánh giá thế nào về trải nghiệm của mình?',
        type: 'radio',
        role: '',
        required: true,
        options: ['Rất hài lòng', 'Hài lòng', 'Bình thường', 'Chưa hài lòng'],
      },
      {
        label: 'Bạn muốn chúng tôi cải thiện điều gì?',
        type: 'checkbox',
        role: '',
        required: false,
        options: ['Chất lượng sản phẩm / dịch vụ', 'Giá cả', 'Tốc độ phục vụ', 'Chăm sóc khách hàng'],
      },
      { label: 'Góp ý thêm', type: 'long_text', role: '', required: false, options: [] },
    ],
    settings: {
      submitButtonText: 'Gửi khảo sát',
      successMessage: 'Cảm ơn bạn đã dành thời gian trả lời khảo sát.',
      notifyOwner: true,
      sendConfirmation: false,
    },
    bookingWeeklySlots: null,
    payment: false,
  },
  // Giống hệt biểu mẫu mới trước khi có bước chọn mẫu: một ô Họ và tên, cài đặt mặc định.
  blank: {
    fields: [nameField()],
    settings: null,
    bookingWeeklySlots: null,
    payment: false,
  },
});

/** Tên loại dùng làm hậu tố tiêu đề biểu mẫu tự tạo ("Landing ABC - Đặt lịch hẹn"). Chữ tiếng Việt như nhãn trường của mẫu. */
export const FORM_STARTER_KIND_LABELS = Object.freeze({
  consult: 'Đăng ký tư vấn',
  booking: 'Đặt lịch hẹn',
  payment: 'Thu tiền / đặt cọc',
  survey: 'Khảo sát',
  blank: 'Biểu mẫu',
});

/**
 * Dựng bản nháp biểu mẫu từ mẫu: ĐÚNG đầu vào của `formService.createForm` (đi tiếp qua normalizeFormFields /
 * normalizeFormSettings / normalizeBookingConfig như mọi biểu mẫu).
 *
 * - Cài đặt luôn `consentEnabled: true` + `notifyOwner: true` như biểu mẫu tạo từ landing trước nay (ô đồng ý tiếp thị là
 *   quyết định pháp lý — khách điền trên landing phải được hỏi đồng ý; chủ muốn tắt thì tự tắt trong trình soạn).
 * - `paymentConfig` LUÔN null (QĐ4): không bao giờ tự điền số tiền / tài khoản. `needsPaymentSetup` chỉ để caller ghi `kind`.
 *
 * @param {string} kind một trong FORM_SLOT_KINDS
 * @returns {{
 *   fields: Array<object>, settings: object, bookingConfig: object|null, paymentConfig: null, needsPaymentSetup: boolean
 * }}
 */
export function buildStarterFormDraft(kind) {
  if (!FORM_SLOT_KINDS.includes(kind)) {
    throw new Error(`Loại biểu mẫu không hợp lệ: ${kind}`);
  }
  const template = FORM_STARTER_TEMPLATES[kind];

  const fields = template.fields.map((f) => {
    const item = { label: f.label, type: f.type, required: Boolean(f.required) };
    if (f.role) item.role = f.role;
    if (['select', 'radio', 'checkbox'].includes(f.type)) item.options = [...f.options];
    return item;
  });

  const settings = { ...(template.settings || {}), consentEnabled: true, notifyOwner: true };

  let bookingConfig = null;
  if (template.bookingWeeklySlots) {
    const weeklySlots = {};
    for (const day of WEEKDAY_KEYS) weeklySlots[day] = [...(template.bookingWeeklySlots[day] || [])];
    bookingConfig = {
      enabled: true,
      weeklySlots,
      slotCapacity: null,
      daysAhead: 30,
      minNoticeMinutes: 60,
      closedDates: [],
    };
  }

  return { fields, settings, bookingConfig, paymentConfig: null, needsPaymentSetup: Boolean(template.payment) };
}
