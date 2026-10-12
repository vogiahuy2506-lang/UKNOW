import {
  HiOutlineUser,
  HiOutlineMail,
  HiOutlinePhone,
  HiOutlineAnnotation,
  HiOutlineDocumentText,
  HiOutlineCheckCircle,
  HiOutlineClipboardCheck,
  HiOutlineViewList,
  HiOutlineCalendar,
  HiOutlineStar,
  HiOutlineThumbUp,
  HiOutlineClock,
  HiOutlineMenuAlt1,
  HiOutlineMenuAlt2,
  HiOutlineScissors,
} from 'react-icons/hi';
import { DEFAULT_PAYMENT_PURPOSE } from '../../utils/paymentPurpose.util';

// Hằng số + mặc định dùng chung của trình soạn biểu mẫu (FormEditorPage và các khối con trong components/editor/).
// 11/10/2026 (PR-3 trình soạn mới): chuyển NGUYÊN VĂN từ FormEditorPage.jsx khi tách trang thành các component con.

// `group`: 'question' = trường NHẬP (khách điền); 'layout' = khối HIỂN THỊ (tiêu đề, đoạn chữ, ngắt trang — PR-4:
// không có giá trị / bắt buộc / vai trò / lựa chọn). Thứ tự giữ nguyên 9 loại gốc ở đầu.
export const FIELD_TYPES = [
  { value: 'short_text', labelKey: 'forms.types.short_text', group: 'question' },
  { value: 'long_text', labelKey: 'forms.types.long_text', group: 'question' },
  { value: 'email', labelKey: 'forms.types.email', group: 'question' },
  { value: 'phone', labelKey: 'forms.types.phone', group: 'question' },
  { value: 'number', labelKey: 'forms.types.number', group: 'question' },
  { value: 'select', labelKey: 'forms.types.select', group: 'question' },
  { value: 'radio', labelKey: 'forms.types.radio', group: 'question' },
  { value: 'checkbox', labelKey: 'forms.types.checkbox', group: 'question' },
  { value: 'date', labelKey: 'forms.types.date', group: 'question' },
  { value: 'rating', labelKey: 'forms.types.rating', group: 'question' },
  { value: 'yes_no', labelKey: 'forms.types.yes_no', group: 'question' },
  { value: 'time', labelKey: 'forms.types.time', group: 'question' },
  { value: 'heading', labelKey: 'forms.types.heading', group: 'layout' },
  { value: 'paragraph', labelKey: 'forms.types.paragraph', group: 'layout' },
  { value: 'page_break', labelKey: 'forms.types.page_break', group: 'layout' },
];
export const FIELD_TYPE_GROUPS = [
  { id: 'question', labelKey: 'forms.typeGroups.question' },
  { id: 'layout', labelKey: 'forms.typeGroups.layout' },
];

// `common: true` = hiện sẵn ở hàng "Thêm nhanh"; các loại còn lại nằm sau nút "Loại khác…" (không bỏ loại nào).
export const QUICK_FIELD_PRESETS = [
  {
    id: 'name',
    titleKey: 'forms.editorPage.quickAdd.fullName',
    descKey: 'forms.editorPage.quickAdd.fullNameDesc',
    title: 'Họ và tên',
    common: true,
    desc: 'Định danh tên khách hàng',
    type: 'short_text',
    group: 'question',
    role: 'name',
    required: true,
    icon: HiOutlineUser,
    colorClass: 'text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 border-blue-200/80 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-950/60 hover:border-blue-300 dark:hover:border-blue-700',
  },
  {
    id: 'email',
    titleKey: 'forms.editorPage.quickAdd.email',
    descKey: 'forms.editorPage.quickAdd.emailDesc',
    title: 'Địa chỉ Email',
    common: true,
    desc: 'Gửi thư xác nhận tự động',
    type: 'email',
    group: 'question',
    role: 'email',
    required: true,
    icon: HiOutlineMail,
    colorClass: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 border-purple-200/80 dark:border-purple-800 hover:bg-purple-100 dark:hover:bg-purple-950/60 hover:border-purple-300 dark:hover:border-purple-700',
  },
  {
    id: 'phone',
    titleKey: 'forms.editorPage.quickAdd.phone',
    descKey: 'forms.editorPage.quickAdd.phoneDesc',
    title: 'Số điện thoại',
    common: true,
    desc: 'Liên hệ tư vấn / Zalo',
    type: 'phone',
    group: 'question',
    role: 'phone',
    required: true,
    icon: HiOutlinePhone,
    colorClass: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-950/60 hover:border-emerald-300 dark:hover:border-emerald-700',
  },
  {
    id: 'short_text',
    titleKey: 'forms.editorPage.quickAdd.shortText',
    descKey: 'forms.editorPage.quickAdd.shortTextDesc',
    title: 'Văn bản ngắn',
    common: true,
    desc: 'Câu trả lời 1 dòng',
    type: 'short_text',
    group: 'question',
    role: '',
    required: false,
    icon: HiOutlineAnnotation,
    colorClass: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200/80 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-950/60 hover:border-amber-300 dark:hover:border-amber-700',
  },
  {
    id: 'long_text',
    titleKey: 'forms.editorPage.quickAdd.longText',
    descKey: 'forms.editorPage.quickAdd.longTextDesc',
    title: 'Đoạn văn dài',
    desc: 'Góp ý hoặc mô tả chi tiết',
    type: 'long_text',
    group: 'question',
    role: '',
    required: false,
    icon: HiOutlineDocumentText,
    colorClass: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40 border-indigo-200/80 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-950/60 hover:border-indigo-300 dark:hover:border-indigo-700',
  },
  {
    id: 'radio',
    titleKey: 'forms.editorPage.quickAdd.radio',
    descKey: 'forms.editorPage.quickAdd.radioDesc',
    title: 'Trắc nghiệm đơn',
    desc: 'Chọn 1 trong nhiều lựa chọn',
    type: 'radio',
    group: 'question',
    role: '',
    required: false,
    optionsKey: 'options',
    options: ['Lựa chọn 1', 'Lựa chọn 2'],
    icon: HiOutlineCheckCircle,
    colorClass: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200/80 dark:border-rose-800 hover:bg-rose-100 dark:hover:bg-rose-950/60 hover:border-rose-300 dark:hover:border-rose-700',
  },
  {
    id: 'checkbox',
    titleKey: 'forms.editorPage.quickAdd.checkbox',
    descKey: 'forms.editorPage.quickAdd.checkboxDesc',
    title: 'Hộp kiểm',
    desc: 'Cho phép tích chọn nhiều mục',
    type: 'checkbox',
    group: 'question',
    role: '',
    required: false,
    optionsKey: 'items',
    options: ['Mục 1', 'Mục 2'],
    icon: HiOutlineClipboardCheck,
    colorClass: 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/40 border-teal-200/80 dark:border-teal-800 hover:bg-teal-100 dark:hover:bg-teal-950/60 hover:border-teal-300 dark:hover:border-teal-700',
  },
  {
    id: 'select',
    titleKey: 'forms.editorPage.quickAdd.select',
    descKey: 'forms.editorPage.quickAdd.selectDesc',
    title: 'Menu thả xuống',
    desc: 'Danh sách lựa chọn gọn gàng',
    type: 'select',
    group: 'question',
    role: '',
    required: false,
    optionsKey: 'options',
    options: ['Lựa chọn 1', 'Lựa chọn 2'],
    icon: HiOutlineViewList,
    colorClass: 'text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-950/40 border-sky-200/80 dark:border-sky-800 hover:bg-sky-100 dark:hover:bg-sky-950/60 hover:border-sky-300 dark:hover:border-sky-700',
  },
  {
    id: 'date',
    titleKey: 'forms.editorPage.quickAdd.date',
    descKey: 'forms.editorPage.quickAdd.dateDesc',
    title: 'Ngày / Thời gian',
    desc: 'Chọn ngày hẹn hoặc ngày sinh',
    type: 'date',
    group: 'question',
    role: '',
    required: false,
    icon: HiOutlineCalendar,
    colorClass: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border-orange-200/80 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-950/60 hover:border-orange-300 dark:hover:border-orange-700',
  },
  // ── PR-4: câu hỏi mới ── `labelKey` = nhãn mặc định khi thêm (khác tên nút); không dùng `colorClass`.
  {
    id: 'rating',
    titleKey: 'forms.editorPage.quickAdd.rating',
    descKey: 'forms.editorPage.quickAdd.ratingDesc',
    labelKey: 'forms.editorPage.quickAdd.ratingLabel',
    title: 'Chấm sao',
    desc: 'Khách chọn từ 1 đến 5 sao',
    type: 'rating',
    group: 'question',
    role: '',
    required: false,
    icon: HiOutlineStar,
  },
  {
    id: 'yes_no',
    titleKey: 'forms.editorPage.quickAdd.yesNo',
    descKey: 'forms.editorPage.quickAdd.yesNoDesc',
    labelKey: 'forms.editorPage.quickAdd.yesNoLabel',
    title: 'Có / Không',
    desc: 'Câu hỏi trả lời nhanh bằng một cú bấm',
    type: 'yes_no',
    group: 'question',
    role: '',
    required: false,
    icon: HiOutlineThumbUp,
  },
  {
    id: 'time',
    titleKey: 'forms.editorPage.quickAdd.time',
    descKey: 'forms.editorPage.quickAdd.timeDesc',
    labelKey: 'forms.editorPage.quickAdd.timeLabel',
    title: 'Giờ',
    desc: 'Chọn giờ hẹn hoặc giờ tiện liên hệ',
    type: 'time',
    group: 'question',
    role: '',
    required: false,
    icon: HiOutlineClock,
  },
  // ── PR-4: khối bố cục (không có giá trị) ── page_break: nhãn mặc định để TRỐNG (tiêu đề bước là tuỳ chọn).
  {
    id: 'heading',
    titleKey: 'forms.editorPage.quickAdd.heading',
    descKey: 'forms.editorPage.quickAdd.headingDesc',
    labelKey: 'forms.editorPage.quickAdd.headingLabel',
    title: 'Tiêu đề phần',
    desc: 'Chia biểu mẫu thành từng phần có tên',
    type: 'heading',
    group: 'layout',
    role: '',
    required: false,
    icon: HiOutlineMenuAlt1,
  },
  {
    id: 'paragraph',
    titleKey: 'forms.editorPage.quickAdd.paragraph',
    descKey: 'forms.editorPage.quickAdd.paragraphDesc',
    labelKey: 'forms.editorPage.quickAdd.paragraphLabel',
    title: 'Đoạn chữ',
    desc: 'Lời dẫn, hướng dẫn hoặc điều khoản',
    type: 'paragraph',
    group: 'layout',
    role: '',
    required: false,
    icon: HiOutlineMenuAlt2,
  },
  {
    id: 'page_break',
    titleKey: 'forms.editorPage.quickAdd.pageBreak',
    descKey: 'forms.editorPage.quickAdd.pageBreakDesc',
    emptyLabel: true,
    title: 'Ngắt trang',
    desc: 'Chia thành nhiều bước có nút Tiếp / Quay lại',
    type: 'page_break',
    group: 'layout',
    role: '',
    required: false,
    icon: HiOutlineScissors,
  },
];

export const DEFAULT_SETTINGS = {
  notifyOwner: true,
  consentEnabled: false,
  sendConfirmation: false,
  submitButtonText: '',
  successMessage: '',
  redirectUrl: '',
  // Lời đồng ý tuỳ chỉnh (≤500). Rỗng = KHÔNG gửi khoá lên server (renderer dùng câu mặc định).
  consentText: '',
};

// Giới hạn khớp backend/src/utils/formDefinition.util.js (MAX_INPUT_FIELDS, MAX_DISPLAY_BLOCKS, MAX_LABEL_LENGTH,
// MAX_PARAGRAPH_LENGTH, MAX_HELP_TEXT_LENGTH, MAX_CONSENT_TEXT_LENGTH). Lệch thì code backend đúng, không phải file này.
// MAX_FIELDS = trần số trường NHẬP (tên cũ giữ nguyên); khối hiển thị (tiêu đề / đoạn chữ / ngắt trang) đếm riêng.
export const MAX_FIELDS = 30;
export const MAX_DISPLAY_BLOCKS = 20;
export const MAX_OPTIONS = 50;
export const MAX_LABEL_LENGTH = 200;
// Nội dung đoạn chữ (paragraph) nằm trong `label` nên có trần riêng.
export const MAX_PARAGRAPH_LENGTH = 2000;
export const MAX_PLACEHOLDER_LENGTH = 200;
export const MAX_HELP_TEXT_LENGTH = 300;
export const MAX_CONSENT_TEXT_LENGTH = 500;

// Loại trường có lựa chọn (options) / có ô nhập chữ nên dùng được placeholder.
export const OPTION_FIELD_TYPES = ['select', 'radio', 'checkbox'];
export const PLACEHOLDER_FIELD_TYPES = ['short_text', 'long_text', 'email', 'phone', 'number'];
// Loại nhập KHÔNG nhận vai trò định danh (số sao / có-không / giờ không thể là tên, email, SĐT) — khớp backend.
export const NO_ROLE_FIELD_TYPES = ['rating', 'yes_no', 'time'];

// Hợp đồng đặt lịch (bookingConfig) — chép từ backend/src/utils/formDefinition.util.js
// normalizeBookingConfig, hằng số dòng 265-275 (PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md,
// PR-2a). Lệch thì code backend đúng, không phải file này.
export const WEEKDAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'];
export const WEEKDAY_UI_ORDER = [
  { key: '1', labelKey: 'forms.editorPage.booking.weekday.mon' },
  { key: '2', labelKey: 'forms.editorPage.booking.weekday.tue' },
  { key: '3', labelKey: 'forms.editorPage.booking.weekday.wed' },
  { key: '4', labelKey: 'forms.editorPage.booking.weekday.thu' },
  { key: '5', labelKey: 'forms.editorPage.booking.weekday.fri' },
  { key: '6', labelKey: 'forms.editorPage.booking.weekday.sat' },
  { key: '0', labelKey: 'forms.editorPage.booking.weekday.sun' },
];
export const MAX_SLOTS_PER_DAY = 48;
export const MIN_SLOT_CAPACITY = 1;
export const MAX_SLOT_CAPACITY = 1000;
export const MIN_DAYS_AHEAD = 1;
export const MAX_DAYS_AHEAD = 180;
export const MIN_NOTICE_MINUTES_MIN = 0;
export const MIN_NOTICE_MINUTES_MAX = 10080;
export const MAX_CLOSED_DATES = 366;

export const DEFAULT_WEEKLY_SLOTS = WEEKDAY_KEYS.reduce((acc, k) => ({ ...acc, [k]: [] }), {});
export const DEFAULT_BOOKING = {
  enabled: false,
  weeklySlots: DEFAULT_WEEKLY_SLOTS,
  slotCapacity: '', // '' = không giới hạn (gửi null)
  daysAhead: 30,
  minNoticeMinutes: 60,
  closedDates: [],
};

// Hợp đồng thanh toán giữ chỗ (paymentConfig) — chép từ backend/src/utils/formDefinition.util.js
// normalizePaymentConfig, hằng số cùng file (PR-3a). Lệch thì code backend đúng, không phải file này.
export const MIN_PAYMENT_AMOUNT = 1000;
export const MAX_PAYMENT_AMOUNT = 100000000;
export const MIN_HOLD_MINUTES = 10;
export const MAX_HOLD_MINUTES = 120;
export const DEFAULT_HOLD_MINUTES = 30;
export const DEFAULT_PAYMENT = {
  enabled: false,
  methods: ['bank'],
  method: 'bank',
  amount: '', // chuỗi CHỈ CHỮ SỐ (không dấu chấm) — format hiển thị ở input riêng
  bankBin: '',
  accountNumber: '',
  accountName: '',
  momoPhone: '',
  momoName: '',
  // Việc 4.0 đạt 25/09 (VCB quét QR dựng từ SĐT, chuyển thật thành công) → form MoMo mới mặc định dùng SĐT.
  momoQrMode: 'phone',
  momoQrBin: '',
  momoQrAccount: '',
  momoQrRefLabel: '',
  holdMinutes: DEFAULT_HOLD_MINUTES,
  purpose: DEFAULT_PAYMENT_PURPOSE,
};

export const STORAGE_PAYMENT_PRESET_KEY = 'uknow_form_payment_preset';

export function getSavedPaymentPreset(userId) {
  try {
    const key = userId ? `${STORAGE_PAYMENT_PRESET_KEY}_${userId}` : STORAGE_PAYMENT_PRESET_KEY;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function savePaymentPreset(userId, paymentData) {
  try {
    const key = userId ? `${STORAGE_PAYMENT_PRESET_KEY}_${userId}` : STORAGE_PAYMENT_PRESET_KEY;
    const dataToSave = {
      bankBin: paymentData.bankBin || '',
      accountNumber: paymentData.accountNumber || '',
      accountName: paymentData.accountName || '',
      momoPhone: paymentData.momoPhone || '',
      momoName: paymentData.momoName || '',
      momoQrMode: paymentData.momoQrMode || 'phone',
      momoQrAccount: paymentData.momoQrAccount || '',
    };
    localStorage.setItem(key, JSON.stringify(dataToSave));
  } catch (e) {
    console.error('Failed to save payment preset', e);
  }
}

// Hợp đồng giao diện (theme) — chép từ backend/src/utils/formDefinition.util.js
// normalizeFormTheme (PR-4a/4b). '' ở mọi trường nghĩa là "chưa đặt" -> khoá đó vắng mặt trong
// payload khi lưu, FormRenderer/trang công khai tự rơi về giao diện mặc định hiện tại. Riêng
// bannerUrl/logoUrl CHỈ để hiển thị xem trước — không bao giờ gửi lên server (server tự tính
// lại từ bannerKey/logoKey).
export const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
export const DEFAULT_THEME = {
  preset: '',
  primaryColor: '',
  backgroundColor: '',
  fontFamily: '',
  layout: '',
  bannerHeight: '',
  bannerKey: '',
  bannerUrl: '',
  logoKey: '',
  logoUrl: '',
};

// Các tab của modal Cài đặt (thay cho các khối thu gọn xếp dọc của trình soạn cũ).
export const SETTINGS_TABS = ['general', 'afterSubmit', 'booking', 'payment', 'theme', 'product'];

// Khoá lỗi validateForm thuộc tab nào — lưu thất bại thì mở modal ở tab đầu tiên có ô lỗi để người dùng thấy ngay
// (nếu không, lỗi redirectUrl trong tab "Sau khi gửi" chỉ hiện ở toast).
export const TAB_ERROR_KEYS = {
  general: ['description'],
  afterSubmit: ['submitButtonText', 'successMessage', 'redirectUrl', 'consentText'],
  booking: [
    'bookingSlots',
    'bookingCapacity',
    'bookingDaysAhead',
    'bookingMinNotice',
    'bookingClosedDates',
    'bookingDisableConfirm',
  ],
  payment: [
    'paymentMethods',
    'paymentAmount',
    'paymentBank',
    'paymentAccountNumber',
    'paymentAccountName',
    'paymentMomoPhone',
    'paymentMomoName',
    'paymentMomoQrAccount',
    'paymentHoldMinutes',
  ],
};

// Giao diện "đã tuỳ chỉnh" = có ít nhất một khoá sẽ được gửi lên (xem payloadTheme trong handleSave).
export const hasThemeCustomization = (th) =>
  Boolean(
    th.preset ||
      th.primaryColor ||
      th.backgroundColor ||
      th.fontFamily ||
      th.layout ||
      th.bannerHeight ||
      th.bannerKey ||
      th.logoKey
  );
