import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowLeft,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineArrowUp,
  HiOutlineArrowDown,
  HiOutlineCheck,
  HiOutlineEye,
  HiOutlineEyeOff,
  HiOutlineShare,
  HiOutlineInbox,
  HiOutlineQrcode,
  HiOutlineDocumentText,
  HiOutlineViewList,
  HiOutlineUser,
  HiOutlineMail,
  HiOutlinePhone,
  HiOutlineAnnotation,
  HiOutlineCheckCircle,
  HiOutlineClipboardCheck,
  HiOutlineCalendar,
  HiOutlineLightningBolt,
  HiOutlineChevronDown,
  HiOutlineColorSwatch,
  HiOutlineShoppingCart,
  HiOutlineCreditCard,
} from 'react-icons/hi';
import QRCode from 'qrcode';
import { buildVietQrString, decodeQrFromImageFile, parseAndValidateMoMoQr } from '../../../utils/vietqrParser';
import { useI18n } from '../../../i18n';
import { useAuthStore } from '../../../stores/authStore';
import productApiService from '../../products/services/productApi.service';
import { PAYOS_BANK_BIN_MAP } from '../../../utils/payosBankBinMap';
import {
  PAYMENT_PURPOSES,
  DEFAULT_PAYMENT_PURPOSE,
  resolvePaymentPurpose,
  editorPaymentPurposeKeys,
} from '../utils/paymentPurpose.util';
import {
  fetchFormById,
  createForm,
  updateForm,
  publishForm,
  uploadFormTempFile,
  uploadFormAsset,
} from '../services/formAdminApi.service';
import ShareModal from '../components/ShareModal';
import FormRenderer from '../components/FormRenderer';
import BankSearchSelect from '../components/BankSearchSelect';
import FormTemplatePicker from '../components/FormTemplatePicker';
import AddSectionCard from '../components/AddSectionCard';
import { FORM_TEMPLATES, buildFormFromTemplate } from '../constants/formTemplates';
import useStorageQuota from '../../storage/useStorageQuota';
import { validateFilesBeforeUpload, getUploadValidationErrorMessage } from '../../storage/validateUpload';
import { notifyStorageQuotaRefresh } from '../../storage/storageEvents';
import {
  ALLOWED_FORM_FONTS,
  ALLOWED_FORM_LAYOUTS,
  ALLOWED_FORM_BANNER_HEIGHTS,
  FORM_THEME_PRESETS,
} from '../constants/formTheme';

const FIELD_TYPES = [
  { value: 'short_text', labelKey: 'forms.types.short_text' },
  { value: 'long_text', labelKey: 'forms.types.long_text' },
  { value: 'email', labelKey: 'forms.types.email' },
  { value: 'phone', labelKey: 'forms.types.phone' },
  { value: 'number', labelKey: 'forms.types.number' },
  { value: 'select', labelKey: 'forms.types.select' },
  { value: 'radio', labelKey: 'forms.types.radio' },
  { value: 'checkbox', labelKey: 'forms.types.checkbox' },
  { value: 'date', labelKey: 'forms.types.date' },
];

// `common: true` = hiện sẵn ở hàng "Thêm nhanh"; các loại còn lại nằm sau nút "Loại khác…" (không bỏ loại nào).
const QUICK_FIELD_PRESETS = [
  {
    id: 'name',
    titleKey: 'forms.editorPage.quickAdd.fullName',
    descKey: 'forms.editorPage.quickAdd.fullNameDesc',
    title: 'Họ và tên',
    common: true,
    desc: 'Định danh tên khách hàng',
    type: 'short_text',
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
    role: '',
    required: false,
    icon: HiOutlineCalendar,
    colorClass: 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/40 border-orange-200/80 dark:border-orange-800 hover:bg-orange-100 dark:hover:bg-orange-950/60 hover:border-orange-300 dark:hover:border-orange-700',
  },
];

const DEFAULT_SETTINGS = {
  notifyOwner: true,
  consentEnabled: false,
  sendConfirmation: false,
  submitButtonText: '',
  successMessage: '',
  redirectUrl: '',
};

// Hợp đồng đặt lịch (bookingConfig) — chép từ backend/src/utils/formDefinition.util.js
// normalizeBookingConfig, hằng số dòng 265-275 (PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md,
// PR-2a). Lệch thì code backend đúng, không phải file này.
const WEEKDAY_KEYS = ['0', '1', '2', '3', '4', '5', '6'];
const WEEKDAY_UI_ORDER = [
  { key: '1', labelKey: 'forms.editorPage.booking.weekday.mon' },
  { key: '2', labelKey: 'forms.editorPage.booking.weekday.tue' },
  { key: '3', labelKey: 'forms.editorPage.booking.weekday.wed' },
  { key: '4', labelKey: 'forms.editorPage.booking.weekday.thu' },
  { key: '5', labelKey: 'forms.editorPage.booking.weekday.fri' },
  { key: '6', labelKey: 'forms.editorPage.booking.weekday.sat' },
  { key: '0', labelKey: 'forms.editorPage.booking.weekday.sun' },
];
const MAX_SLOTS_PER_DAY = 48;
const MIN_SLOT_CAPACITY = 1;
const MAX_SLOT_CAPACITY = 1000;
const MIN_DAYS_AHEAD = 1;
const MAX_DAYS_AHEAD = 180;
const MIN_NOTICE_MINUTES_MIN = 0;
const MIN_NOTICE_MINUTES_MAX = 10080;
const MAX_CLOSED_DATES = 366;

const DEFAULT_WEEKLY_SLOTS = WEEKDAY_KEYS.reduce((acc, k) => ({ ...acc, [k]: [] }), {});
const DEFAULT_BOOKING = {
  enabled: false,
  weeklySlots: DEFAULT_WEEKLY_SLOTS,
  slotCapacity: '', // '' = không giới hạn (gửi null)
  daysAhead: 30,
  minNoticeMinutes: 60,
  closedDates: [],
};

// Hợp đồng thanh toán giữ chỗ (paymentConfig) — chép từ backend/src/utils/formDefinition.util.js
// normalizePaymentConfig, hằng số cùng file (PR-3a). Lệch thì code backend đúng, không phải file này.
const MIN_PAYMENT_AMOUNT = 1000;
const MAX_PAYMENT_AMOUNT = 100000000;
const MIN_HOLD_MINUTES = 10;
const MAX_HOLD_MINUTES = 120;
const DEFAULT_HOLD_MINUTES = 30;
const DEFAULT_PAYMENT = {
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

const STORAGE_PAYMENT_PRESET_KEY = 'uknow_form_payment_preset';

function getSavedPaymentPreset(userId) {
  try {
    const key = userId ? `${STORAGE_PAYMENT_PRESET_KEY}_${userId}` : STORAGE_PAYMENT_PRESET_KEY;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function savePaymentPreset(userId, paymentData) {
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
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const DEFAULT_THEME = {
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

// Khối thu gọn trong trình soạn: "Sau khi gửi" (cài đặt), Đặt lịch hẹn, Thanh toán, Giao diện.
// Khối đang có dữ liệu thì mở sẵn; khối trống hiện thẻ thu gọn, bấm mới mở.
// Khoá lỗi validateForm thuộc khối nào — lưu thất bại thì mở các khối đó ra để người dùng thấy ô lỗi
// (nếu không, lỗi redirectUrl trong khối "Sau khi gửi" đang thu gọn chỉ hiện ở toast).
const BLOCK_ERROR_KEYS = {
  afterSubmit: ['submitButtonText', 'successMessage', 'redirectUrl'],
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
const hasThemeCustomization = (th) =>
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

export default function FormEditorPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);

  // Phản biện PR-3b điểm 3: activeContext (self/employee) sống trong authStore (Zustand) —
  // cùng cách đọc `Campaigns.jsx:51`. Nhân viên (kể cả có quyền `forms`) chỉ ĐỌC được khối
  // thanh toán — không phải một chốt permission riêng, mà là contextType.
  const user = useAuthStore((state) => state.user);
  const activeContext = useAuthStore((state) => state.activeContext) || user?.activeContext;
  const isEmployee = activeContext?.type === 'employee';

  const [isLoading, setIsLoading] = useState(isEditMode);
  const [isSaving, setIsSaving] = useState(false);
  // Chỉ có nghĩa ở chế độ tạo mới: false = đang ở bước chọn mẫu, true = đã vào trình soạn.
  const [templateChosen, setTemplateChosen] = useState(false);
  // Khối nào đang mở. Mặc định thu gọn hết; nạp biểu mẫu / chọn mẫu / lưu lỗi sẽ mở khối cần thấy.
  const [openBlocks, setOpenBlocks] = useState({
    afterSubmit: false,
    booking: false,
    payment: false,
    theme: false,
  });
  const openBlock = (name) => setOpenBlocks((prev) => (prev[name] ? prev : { ...prev, [name]: true }));
  // Hàng "Thêm nhanh": mặc định chỉ 4 loại hay dùng; "Loại khác…" mở phần còn lại.
  const [showMoreFieldTypes, setShowMoreFieldTypes] = useState(false);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [publicKey, setPublicKey] = useState('');
  const [submissionCount, setSubmissionCount] = useState(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isTogglingPublish, setIsTogglingPublish] = useState(false);
  const [fields, setFields] = useState([]);
  const [settings, setSettings] = useState(() => ({
    ...DEFAULT_SETTINGS,
    submitButtonText: t('publicForm.defaultSubmit'),
    successMessage: t('publicForm.defaultSuccess'),
  }));
  const [booking, setBooking] = useState(DEFAULT_BOOKING);
  const [initialBookingHadConfig, setInitialBookingHadConfig] = useState(false);
  const [confirmDisableBooking, setConfirmDisableBooking] = useState(false);
  const [payment, setPayment] = useState(DEFAULT_PAYMENT);
  const savedPreset = useMemo(() => getSavedPaymentPreset(user?.id), [user?.id]);
  const hasSavedPreset = Boolean(
    savedPreset && (savedPreset.accountNumber || savedPreset.momoPhone)
  );

  const handleApplySavedPreset = () => {
    if (!savedPreset) return;
    setPayment((prev) => ({
      ...prev,
      bankBin: savedPreset.bankBin || prev.bankBin,
      accountNumber: savedPreset.accountNumber || prev.accountNumber,
      accountName: savedPreset.accountName || prev.accountName,
      momoPhone: savedPreset.momoPhone || prev.momoPhone,
      momoName: savedPreset.momoName || prev.momoName,
      momoQrMode: savedPreset.momoQrMode || prev.momoQrMode,
      momoQrAccount: savedPreset.momoQrAccount || prev.momoQrAccount,
    }));
    toast.success(t('forms.editorPage.payment.appliedSavedPresetSuccess'));
  };

  useEffect(() => {
    if (!isEditMode && savedPreset) {
      setPayment((prev) => {
        if (prev.accountNumber || prev.momoPhone) return prev;
        return {
          ...prev,
          bankBin: savedPreset.bankBin || prev.bankBin,
          accountNumber: savedPreset.accountNumber || prev.accountNumber,
          accountName: savedPreset.accountName || prev.accountName,
          momoPhone: savedPreset.momoPhone || prev.momoPhone,
          momoName: savedPreset.momoName || prev.momoName,
          momoQrMode: savedPreset.momoQrMode || prev.momoQrMode,
          momoQrAccount: savedPreset.momoQrAccount || prev.momoQrAccount,
        };
      });
    }
  }, [isEditMode, savedPreset]);
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [errors, setErrors] = useState({});
  // Biểu mẫu dành cho sản phẩm nào (phễu bán hàng theo sản phẩm). '' = không gắn.
  const [productId, setProductId] = useState('');
  const [initialProductId, setInitialProductId] = useState('');
  const [productOptions, setProductOptions] = useState([]);
  const selectedProduct = productOptions.find((p) => String(p.id) === productId) || null;
  // Giá dạng SỐ của sản phẩm (products.price_amount) dùng để tự điền / gợi ý số tiền thanh toán; ngoài khoảng cho phép thì bỏ qua.
  const productPriceAmount = (product) => {
    const v = Number(product?.priceAmount);
    return product?.priceAmount != null && Number.isInteger(v) && v >= MIN_PAYMENT_AMOUNT && v <= MAX_PAYMENT_AMOUNT ? v : null;
  };
  const selectedProductAmount = productPriceAmount(selectedProduct);
  const handleProductChange = (e) => {
    const nextId = e.target.value;
    setProductId(nextId);
    // Chọn sản phẩm có giá số, thanh toán đang bật mà ô số tiền trống → tự điền (không bao giờ đè số đã có).
    const amount = productPriceAmount(productOptions.find((p) => String(p.id) === nextId));
    if (!isEmployee && payment.enabled && amount !== null) {
      setPayment((prev) => (prev.amount ? prev : { ...prev, amount: String(amount) }));
    }
  };
  const { usage: storageQuota } = useStorageQuota();
  const bannerInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const [isDecodingMomoQr, setIsDecodingMomoQr] = useState(false);
  const momoQrFileInputRef = useRef(null);
  const [momoPreviewQrDataUrl, setMomoPreviewQrDataUrl] = useState(null);

  useEffect(() => {
    let active = true;
    const hasMomo = payment.enabled && (payment.methods || []).includes('momo') && payment.momoQrMode !== 'none';
    if (hasMomo) {
      const acc = payment.momoQrMode === 'phone'
        ? (payment.momoPhone || '').trim()
        : (payment.momoQrAccount || '').replace(/\s+/g, '').toUpperCase();
      const amt = Number(payment.amount);
      const isAccValid = payment.momoQrMode === 'phone'
        ? /^0[35789]\d{8}$/.test(acc)
        : /^[A-Z0-9]{6,19}$/.test(acc);
      const isAmtValid = Number.isInteger(amt) && amt >= MIN_PAYMENT_AMOUNT && amt <= MAX_PAYMENT_AMOUNT;
      const isNameValid = Boolean((payment.momoName || '').trim());

      if (isAccValid && isAmtValid && isNameValid) {
        try {
          const qrStr = buildVietQrString({
            bin: '971025',
            accountNumber: acc,
            amount: amt,
            memo: 'KIEMTRA',
          });
          QRCode.toDataURL(qrStr, { width: 160, margin: 2 })
            .then((url) => {
              if (active) setMomoPreviewQrDataUrl(url);
            })
            .catch(() => {
              if (active) setMomoPreviewQrDataUrl(null);
            });
          return () => {
            active = false;
          };
        } catch {
          setMomoPreviewQrDataUrl(null);
        }
      } else {
        setMomoPreviewQrDataUrl(null);
      }
    } else {
      setMomoPreviewQrDataUrl(null);
    }
    return () => {
      active = false;
    };
  }, [
    payment.enabled,
    payment.methods,
    payment.momoQrMode,
    payment.momoQrAccount,
    payment.momoPhone,
    payment.amount,
    payment.momoName,
  ]);

  // Danh sách sản phẩm đang bán để chọn. Nhân viên chỉ có quyền `forms` (không có `courses`) bị 403 → danh sách rỗng,
  // ô chọn vẫn giữ nguyên sản phẩm đã gắn (không làm mất khi lưu).
  useEffect(() => {
    let active = true;
    productApiService
      .getProducts({ status: 'active', limit: 100 })
      .then((res) => {
        if (!active) return;
        const list = res?.data?.data?.products;
        setProductOptions(Array.isArray(list) ? list : []);
      })
      .catch(() => {
        if (active) setProductOptions([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    // Form mới: các trường / cài đặt do bước chọn mẫu điền (handleSelectTemplate) — mẫu "Trống" cho
    // sẵn 1 trường Họ tên. Effect này không đụng state ở chế độ tạo, nên đổi ngôn ngữ giữa chừng
    // cũng không xoá các trường người dùng đã soạn.
    if (!isEditMode) return;

    setIsLoading(true);
    fetchFormById(id)
      .then((data) => {
        if (!data) {
          toast.error(t('forms.editorPage.notFound'));
          navigate('/app/forms');
          return;
        }
        setTitle(data.title || '');
        setDescription(data.description || '');
        setIsPublished(Boolean(data.isPublished));
        setProductId(data.productId ? String(data.productId) : '');
        setInitialProductId(data.productId ? String(data.productId) : '');
        setPublicKey(data.publicKey || '');
        setSubmissionCount(data.submissionCount ?? null);
        setFields(
          Array.isArray(data.fields)
            ? data.fields.map((f) => ({
                key: f.key || '',
                label: f.label || '',
                type: f.type || 'short_text',
                required: Boolean(f.required),
                role: f.role || '',
                options: Array.isArray(f.options)
                  ? f.options.map((opt) => (typeof opt === 'object' ? opt.label || opt.value : opt))
                  : [],
              }))
            : []
        );
        setSettings({
          notifyOwner: Boolean(data.settings?.notifyOwner ?? DEFAULT_SETTINGS.notifyOwner),
          consentEnabled: Boolean(data.settings?.consentEnabled ?? DEFAULT_SETTINGS.consentEnabled),
          sendConfirmation: Boolean(data.settings?.sendConfirmation ?? DEFAULT_SETTINGS.sendConfirmation),
          submitButtonText: data.settings?.submitButtonText || DEFAULT_SETTINGS.submitButtonText,
          successMessage: data.settings?.successMessage || DEFAULT_SETTINGS.successMessage,
          redirectUrl: data.settings?.redirectUrl || '',
        });

        if (data.bookingConfig) {
          setBooking({
            enabled: true,
            weeklySlots: { ...DEFAULT_WEEKLY_SLOTS, ...data.bookingConfig.weeklySlots },
            slotCapacity:
              data.bookingConfig.slotCapacity === null || data.bookingConfig.slotCapacity === undefined
                ? ''
                : String(data.bookingConfig.slotCapacity),
            daysAhead: data.bookingConfig.daysAhead ?? 30,
            minNoticeMinutes: data.bookingConfig.minNoticeMinutes ?? 60,
            closedDates: Array.isArray(data.bookingConfig.closedDates) ? data.bookingConfig.closedDates : [],
          });
          setInitialBookingHadConfig(true);
        } else {
          setBooking(DEFAULT_BOOKING);
          setInitialBookingHadConfig(false);
        }
        setConfirmDisableBooking(false);

        if (data.paymentConfig) {
          const loadedMode = data.paymentConfig.momoQrMode || (data.paymentConfig.momoQrAccount ? 'account' : 'none');
          const loadedMethods = Array.isArray(data.paymentConfig.methods) && data.paymentConfig.methods.length > 0
            ? data.paymentConfig.methods
            : (data.paymentConfig.method ? [data.paymentConfig.method] : ['bank']);
          setPayment({
            enabled: true,
            methods: loadedMethods,
            method: data.paymentConfig.method || loadedMethods[0] || 'bank',
            amount: data.paymentConfig.amount != null ? String(data.paymentConfig.amount) : '',
            bankBin: data.paymentConfig.bankBin || '',
            accountNumber: data.paymentConfig.accountNumber || '',
            accountName: data.paymentConfig.accountName || '',
            momoPhone: data.paymentConfig.momoPhone || '',
            momoName: data.paymentConfig.momoName || '',
            momoQrMode: loadedMode,
            momoQrBin: data.paymentConfig.momoQrBin || '',
            momoQrAccount: data.paymentConfig.momoQrAccount || '',
            momoQrRefLabel: data.paymentConfig.momoQrRefLabel || '',
            holdMinutes: data.paymentConfig.holdMinutes ?? DEFAULT_HOLD_MINUTES,
            purpose: resolvePaymentPurpose(data.paymentConfig.purpose),
          });
        } else {
          setPayment(DEFAULT_PAYMENT);
        }

        // GET chủ form trả CẢ bannerKey/logoKey (trình soạn cần biết khoá hiện tại) LẪN
        // bannerUrl/logoUrl (tiện hiển thị ngay, không cần tự dựng URL từ khoá).
        const loadedTheme = data.theme || {};
        setTheme({
          preset: loadedTheme.preset || '',
          primaryColor: loadedTheme.primaryColor || '',
          backgroundColor: loadedTheme.backgroundColor || '',
          fontFamily: loadedTheme.fontFamily || '',
          layout: loadedTheme.layout || '',
          bannerHeight: loadedTheme.bannerHeight || '',
          bannerKey: loadedTheme.bannerKey || '',
          bannerUrl: loadedTheme.bannerUrl || '',
          logoKey: loadedTheme.logoKey || '',
          logoUrl: loadedTheme.logoUrl || '',
        });

        // Biểu mẫu đang bật tính năng nào thì khối đó mở sẵn (khối trống vẫn thu gọn).
        setOpenBlocks((prev) => ({
          ...prev,
          booking: Boolean(data.bookingConfig),
          payment: Boolean(data.paymentConfig),
          theme: hasThemeCustomization({
            preset: loadedTheme.preset,
            primaryColor: loadedTheme.primaryColor,
            backgroundColor: loadedTheme.backgroundColor,
            fontFamily: loadedTheme.fontFamily,
            layout: loadedTheme.layout,
            bannerHeight: loadedTheme.bannerHeight,
            bannerKey: loadedTheme.bannerKey,
            logoKey: loadedTheme.logoKey,
          }),
        }));
      })
      .catch((err) => {
        toast.error(err.response?.data?.message || t('forms.editorPage.loadError'));
        navigate('/app/forms');
      })
      .finally(() => setIsLoading(false));
  }, [id, isEditMode, navigate, t]);

  // Bước chọn mẫu (chỉ ở chế độ tạo mới): điền sẵn trường + cài đặt (+ bật đặt lịch / thanh toán) vào
  // ĐÚNG các state trình soạn đang dùng, rồi vào trình soạn. Lưu đi đường lưu cũ, không có API riêng.
  const handleSelectTemplate = (templateId) => {
    const template = FORM_TEMPLATES.find((tpl) => tpl.id === templateId);
    if (!template) return;
    // Nhân viên không gửi được paymentConfig (backend chặn 403) — mẫu thu tiền chỉ dành cho chủ tài khoản.
    if (template.ownerOnly && isEmployee) return;

    const built = buildFormFromTemplate(template, t);
    setFields(built.fields);
    // Gộp lên state hiện có: consentEnabled / redirectUrl giữ mặc định, mẫu chỉ ghi đè khoá nó khai.
    setSettings((prev) => ({ ...prev, ...built.settings }));
    if (built.bookingWeeklySlots) {
      setBooking({
        ...DEFAULT_BOOKING,
        enabled: true,
        weeklySlots: { ...DEFAULT_WEEKLY_SLOTS, ...built.bookingWeeklySlots },
      });
    }
    // Gộp (không ghi đè) để giữ tài khoản nhận tiền đã lưu từ lần trước (effect nạp preset ở trên).
    if (built.enablePayment) setPayment((prev) => ({ ...prev, enabled: true }));
    // Mẫu bật tính năng nào thì khối đó mở sẵn để người dùng khai tiếp (khung giờ / tài khoản nhận tiền).
    setOpenBlocks((prev) => ({
      ...prev,
      booking: prev.booking || Boolean(built.bookingWeeklySlots),
      payment: prev.payment || built.enablePayment,
    }));
    setTemplateChosen(true);
  };

  // Thêm trường mới
  const handleAddField = () => {
    if (fields.length >= 30) {
      toast.error(t('forms.editorPage.maxFields'));
      return;
    }
    setFields((prev) => [
      ...prev,
      {
        key: '', // Trường mới key rỗng để server tự sinh
        label: t('forms.editorPage.newFieldLabel', { index: prev.length + 1 }),
        type: 'short_text',
        required: false,
        role: '',
        options: [],
      },
    ]);
  };

  // Thêm trường thông dụng 1-chạm từ thư viện mẫu
  const handleAddQuickField = (preset) => {
    if (fields.length >= 30) {
      toast.error(t('forms.editorPage.maxFields'));
      return;
    }
    const localizedTitle = preset.titleKey ? t(preset.titleKey) : preset.title;
    let localizedOptions = [];
    if (preset.optionsKey === 'items') {
      localizedOptions = [t('forms.editorPage.quickAdd.defaultItem1'), t('forms.editorPage.quickAdd.defaultItem2')];
    } else if (preset.optionsKey === 'options') {
      localizedOptions = [t('forms.editorPage.defaultOption1'), t('forms.editorPage.defaultOption2')];
    } else if (preset.options) {
      localizedOptions = [...preset.options];
    }

    setFields((prev) => [
      ...prev,
      {
        key: '',
        label: localizedTitle,
        type: preset.type,
        required: Boolean(preset.required),
        role: preset.role || '',
        options: localizedOptions,
      },
    ]);
    toast.success(t('forms.editorPage.quickAdd.addedToast', { title: localizedTitle }));
  };

  // Xoá trường
  const handleRemoveField = (idx) => {
    setFields((prev) => prev.filter((_, i) => i !== idx));
  };

  // Di chuyển thứ tự trường
  const handleMoveField = (idx, direction) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= fields.length) return;
    setFields((prev) => {
      const copy = [...prev];
      const temp = copy[idx];
      copy[idx] = copy[targetIdx];
      copy[targetIdx] = temp;
      return copy;
    });
  };

  // Cập nhật thuộc tính trường
  const handleUpdateField = (idx, key, value) => {
    setFields((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [key]: value };

      // Nếu chuyển sang kiểu không có options thì clear options
      if (key === 'type' && !['select', 'radio', 'checkbox'].includes(value)) {
        copy[idx].options = [];
      } else if (key === 'type' && ['select', 'radio', 'checkbox'].includes(value) && copy[idx].options.length === 0) {
        copy[idx].options = [t('forms.editorPage.defaultOption1'), t('forms.editorPage.defaultOption2')];
      }

      // Đổi role: kiểm tra trùng lặp
      if (key === 'role' && value) {
        for (let i = 0; i < copy.length; i++) {
          if (i !== idx && copy[i].role === value) {
            toast.error(t('forms.editorPage.roleDuplicate', { role: value }));
            copy[i].role = '';
          }
        }
      }

      return copy;
    });
  };

  // Thao tác với options
  const handleAddOption = (fieldIdx) => {
    setFields((prev) => {
      const copy = [...prev];
      const currentOpts = copy[fieldIdx].options || [];
      if (currentOpts.length >= 50) {
        toast.error(t('forms.editorPage.maxOptions'));
        return prev;
      }
      copy[fieldIdx] = {
        ...copy[fieldIdx],
        options: [...currentOpts, t('forms.editorPage.defaultOptionN', { index: currentOpts.length + 1 })],
      };
      return copy;
    });
  };

  const handleUpdateOption = (fieldIdx, optIdx, val) => {
    setFields((prev) => {
      const copy = [...prev];
      const currentOpts = [...(copy[fieldIdx].options || [])];
      currentOpts[optIdx] = val;
      copy[fieldIdx] = { ...copy[fieldIdx], options: currentOpts };
      return copy;
    });
  };

  const handleRemoveOption = (fieldIdx, optIdx) => {
    setFields((prev) => {
      const copy = [...prev];
      const currentOpts = copy[fieldIdx].options.filter((_, i) => i !== optIdx);
      copy[fieldIdx] = { ...copy[fieldIdx], options: currentOpts };
      return copy;
    });
  };

  // Bật/tắt đặt lịch hẹn
  const handleToggleBookingEnabled = (checked) => {
    setBooking((prev) => ({ ...prev, enabled: checked }));
    if (checked) setConfirmDisableBooking(false);
  };

  const handleAddTimeSlot = (dayKey) => {
    setBooking((prev) => {
      const current = prev.weeklySlots[dayKey] || [];
      if (current.length >= MAX_SLOTS_PER_DAY) {
        toast.error(t('forms.editorPage.booking.maxSlotsPerDay'));
        return prev;
      }
      return { ...prev, weeklySlots: { ...prev.weeklySlots, [dayKey]: [...current, ''] } };
    });
  };

  const handleUpdateTimeSlot = (dayKey, idx, value) => {
    setBooking((prev) => {
      const current = [...(prev.weeklySlots[dayKey] || [])];
      current[idx] = value;
      return { ...prev, weeklySlots: { ...prev.weeklySlots, [dayKey]: current } };
    });
  };

  const handleRemoveTimeSlot = (dayKey, idx) => {
    setBooking((prev) => ({
      ...prev,
      weeklySlots: { ...prev.weeklySlots, [dayKey]: (prev.weeklySlots[dayKey] || []).filter((_, i) => i !== idx) },
    }));
  };

  // Áp khung giờ của Thứ 2 cho tất cả các ngày còn lại
  const handleApplyMondayToAll = () => {
    setBooking((prev) => {
      const mondaySlots = prev.weeklySlots['1'] || [];
      const next = {};
      for (const key of WEEKDAY_KEYS) next[key] = [...mondaySlots];
      return { ...prev, weeklySlots: next };
    });
  };

  const handleAddClosedDate = () => {
    setBooking((prev) => {
      if (prev.closedDates.length >= MAX_CLOSED_DATES) {
        toast.error(t('forms.editorPage.booking.maxClosedDates'));
        return prev;
      }
      return { ...prev, closedDates: [...prev.closedDates, ''] };
    });
  };

  const handleUpdateClosedDate = (idx, value) => {
    setBooking((prev) => {
      const next = [...prev.closedDates];
      next[idx] = value;
      return { ...prev, closedDates: next };
    });
  };

  const handleRemoveClosedDate = (idx) => {
    setBooking((prev) => ({ ...prev, closedDates: prev.closedDates.filter((_, i) => i !== idx) }));
  };

  // Chọn mẫu dựng sẵn: CHỈ ghi đè màu/font/layout — cố ý KHÔNG đụng bannerKey/logoKey/bannerUrl/
  // logoUrl (mục 6 "chọn preset ... giữ nguyên ảnh"; nghiệm thu "chọn preset khi có logo -> giữ
  // logoKey"). FORM_THEME_PRESETS không chứa trường ảnh nên không có gì để vô tình ghi đè.
  const handleSelectThemePreset = (presetId) => {
    const preset = FORM_THEME_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setTheme((prev) => ({
      ...prev,
      preset: preset.id,
      primaryColor: preset.primaryColor,
      backgroundColor: preset.backgroundColor,
      fontFamily: preset.fontFamily,
      layout: preset.layout,
    }));
  };

  const handleThemeColorChange = (field, value) => {
    setTheme((prev) => ({ ...prev, [field]: value }));
  };

  const handleThemeFontChange = (value) => {
    setTheme((prev) => ({ ...prev, fontFamily: value }));
  };

  const handleThemeLayoutChange = (value) => {
    setTheme((prev) => ({ ...prev, layout: value }));
  };

  const handleThemeBannerHeightChange = (value) => {
    setTheme((prev) => ({ ...prev, bannerHeight: value }));
  };

  const handleRemoveThemeImage = (kind) => {
    // kind: 'banner' | 'logo' — xoá khỏi state, KHÔNG gửi khoá này khi lưu -> backend tự gỡ +
    // giải phóng tệp (hợp đồng "gửi thiếu bannerKey = gỡ banner VÀ xoá file ảnh").
    if (kind === 'banner') {
      setTheme((prev) => ({ ...prev, bannerKey: '', bannerUrl: '' }));
    } else {
      setTheme((prev) => ({ ...prev, logoKey: '', logoUrl: '' }));
    }
  };

  const handleUploadThemeImage = async (kind, file) => {
    if (!file) return;
    const allowedExts = ['.png', '.jpg', '.jpeg', '.webp'];
    const name = (file.name || '').toLowerCase();
    if (!allowedExts.some((ext) => name.endsWith(ext))) {
      toast.error(t('forms.editorPage.theme.onlyImages'));
      return;
    }

    const validation = validateFilesBeforeUpload([file], storageQuota);
    if (!validation.ok) {
      toast.error(getUploadValidationErrorMessage(validation, t));
      return;
    }

    const setUploading = kind === 'banner' ? setIsUploadingBanner : setIsUploadingLogo;
    setUploading(true);
    try {
      const temp = await uploadFormTempFile(file);
      const asset = await uploadFormAsset({
        tempId: temp.tempId,
        originalName: temp.originalName,
        contentType: temp.contentType,
        size: temp.size,
      });
      if (kind === 'banner') {
        setTheme((prev) => ({ ...prev, bannerKey: asset.storageKey, bannerUrl: asset.url }));
      } else {
        setTheme((prev) => ({ ...prev, logoKey: asset.storageKey, logoUrl: asset.url }));
      }
      notifyStorageQuotaRefresh();
    } catch (err) {
      // Bẫy 413/STORAGE_QUOTA_EXCEEDED — báo hết dung lượng, KHÔNG đổi ảnh đang hiển thị
      // (nghiệm thu: "413 -> báo hết dung lượng không đổi ảnh").
      if (err.response?.status === 413 || err.response?.data?.code === 'STORAGE_QUOTA_EXCEEDED') {
        toast.error(t('storageQuota.quotaExceededServer'));
      } else {
        toast.error(err.response?.data?.message || t('forms.editorPage.theme.uploadError'));
      }
    } finally {
      setUploading(false);
    }
  };

  const handleUploadMomoQr = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsDecodingMomoQr(true);
    try {
      const decoded = await decodeQrFromImageFile(file);
      if (!decoded.success) {
        toast.error(t('forms.editorPage.payment.momoQrNotFound'));
        return;
      }
      const qrRes = parseAndValidateMoMoQr(decoded.raw);
      if (!qrRes.valid) {
        if (qrRes.error === 'INVALID_CHECKSUM') {
          toast.error(t('forms.editorPage.payment.momoQrChecksumError'));
        } else if (qrRes.error === 'INVALID_GUID') {
          toast.error(t('forms.editorPage.payment.momoQrGuidError'));
        } else {
          toast.error(t('forms.editorPage.payment.momoQrInvalid'));
        }
        return;
      }
      if (qrRes.momoQrBin !== '971025') {
        toast.error(t('forms.editorPage.payment.momoQrNotMomoError'));
        return;
      }
      setPayment((prev) => ({
        ...prev,
        momoQrMode: 'account',
        momoQrBin: '971025',
        momoQrAccount: qrRes.momoQrAccount,
        momoQrRefLabel: qrRes.momoQrRefLabel || '',
      }));
      toast.success(t('forms.editorPage.payment.momoQrAutoFilled'));
    } catch (err) {
      toast.error(err.message || t('forms.editorPage.payment.momoQrError'));
    } finally {
      setIsDecodingMomoQr(false);
      if (momoQrFileInputRef.current) {
        momoQrFileInputRef.current.value = '';
      }
    }
  };

  // Validate form trước khi lưu
  const validateForm = () => {
    const errs = {};

    if (!title.trim()) {
      errs.title = t('forms.editorPage.validationTitleRequired');
    } else if (title.trim().length > 200) {
      errs.title = t('forms.editorPage.validationTitleMax');
    }

    if (description && description.length > 5000) {
      errs.description = t('forms.editorPage.validationDescMax');
    }

    if (fields.length === 0) {
      errs.fields = t('forms.editorPage.validationFieldsRequired');
    }

    // Validate từng trường
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (!f.label || !f.label.trim()) {
        errs[`field_${i}_label`] = t('forms.editorPage.validationFieldLabelRequired');
      } else if (f.label.trim().length > 200) {
        errs[`field_${i}_label`] = t('forms.editorPage.validationFieldLabelMax');
      }

      if (['select', 'radio', 'checkbox'].includes(f.type)) {
        if (!f.options || f.options.length === 0) {
          errs[`field_${i}_options`] = t('forms.editorPage.validationOptionsRequired');
        }
      }
    }

    // Validate settings
    if (settings.submitButtonText && settings.submitButtonText.length > 50) {
      errs.submitButtonText = t('forms.editorPage.validationSubmitTextMax');
    }
    if (settings.successMessage && settings.successMessage.length > 500) {
      errs.successMessage = t('forms.editorPage.validationSuccessMsgMax');
    }
    if (settings.redirectUrl && settings.redirectUrl.trim()) {
      const urlStr = settings.redirectUrl.trim();
      if (urlStr.length > 2000) {
        errs.redirectUrl = t('forms.editorPage.validationRedirectUrlMax');
      } else {
        try {
          const parsed = new URL(urlStr);
          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            errs.redirectUrl = t('forms.editorPage.validationRedirectUrlProtocol');
          }
        } catch {
          errs.redirectUrl = t('forms.editorPage.validationRedirectUrlInvalid');
        }
      }
    }

    // Validate đặt lịch hẹn (hợp đồng normalizeBookingConfig, xem hằng số ở đầu file)
    if (booking.enabled) {
      let totalSlots = 0;
      let hasDuplicate = false;
      for (const key of WEEKDAY_KEYS) {
        const times = (booking.weeklySlots[key] || []).filter(Boolean);
        totalSlots += times.length;
        if (new Set(times).size !== times.length) hasDuplicate = true;
      }
      if (totalSlots === 0) {
        errs.bookingSlots = t('forms.editorPage.booking.noSlotsError');
      } else if (hasDuplicate) {
        errs.bookingSlots = t('forms.editorPage.booking.duplicateSlotTime');
      }

      if (booking.slotCapacity !== '') {
        const n = Number(booking.slotCapacity);
        if (!Number.isInteger(n) || n < MIN_SLOT_CAPACITY || n > MAX_SLOT_CAPACITY) {
          errs.bookingCapacity = t('forms.editorPage.booking.capacityInvalid');
        }
      }

      const daysAheadNum = Number(booking.daysAhead);
      if (!Number.isInteger(daysAheadNum) || daysAheadNum < MIN_DAYS_AHEAD || daysAheadNum > MAX_DAYS_AHEAD) {
        errs.bookingDaysAhead = t('forms.editorPage.booking.daysAheadInvalid');
      }

      const minNoticeNum = Number(booking.minNoticeMinutes);
      if (
        !Number.isInteger(minNoticeNum) ||
        minNoticeNum < MIN_NOTICE_MINUTES_MIN ||
        minNoticeNum > MIN_NOTICE_MINUTES_MAX
      ) {
        errs.bookingMinNotice = t('forms.editorPage.booking.minNoticeInvalid');
      }

      const closedFilled = booking.closedDates.filter(Boolean);
      if (closedFilled.length > MAX_CLOSED_DATES) {
        errs.bookingClosedDates = t('forms.editorPage.booking.maxClosedDates');
      } else if (new Set(closedFilled).size !== closedFilled.length) {
        errs.bookingClosedDates = t('forms.editorPage.booking.duplicateClosedDate');
      }
    } else if (initialBookingHadConfig && !confirmDisableBooking) {
      errs.bookingDisableConfirm = t('forms.editorPage.booking.disableConfirmRequired');
    }

    // Validate thanh toán giữ chỗ (hợp đồng normalizePaymentConfig, hằng số ở đầu file) — nhân
    // viên không gửi paymentConfig nên không cần validate phía họ (khối chỉ đọc, disabled).
    if (!isEmployee && payment.enabled) {
      const activeMethods = payment.methods || (payment.method ? [payment.method] : []);
      if (activeMethods.length === 0) {
        errs.paymentMethods = t('forms.editorPage.payment.methodsRequired') || 'Vui lòng chọn ít nhất một phương thức thanh toán';
      }

      const amountNum = Number(payment.amount);
      if (!Number.isInteger(amountNum) || amountNum < MIN_PAYMENT_AMOUNT || amountNum > MAX_PAYMENT_AMOUNT) {
        errs.paymentAmount = t('forms.editorPage.payment.amountInvalid');
      }

      if (activeMethods.includes('bank')) {
        if (!payment.bankBin || !PAYOS_BANK_BIN_MAP[payment.bankBin]) {
          errs.paymentBank = t('forms.editorPage.payment.bankRequired');
        }
        if (!/^\d{6,19}$/.test(payment.accountNumber || '')) {
          errs.paymentAccountNumber = t('forms.editorPage.payment.accountNumberInvalid');
        }
        if (!payment.accountName || !payment.accountName.trim()) {
          errs.paymentAccountName = t('forms.editorPage.payment.accountNameRequired');
        }
      }

      if (activeMethods.includes('momo')) {
        if (!/^0[35789]\d{8}$/.test((payment.momoPhone || '').trim())) {
          errs.paymentMomoPhone = t('forms.editorPage.payment.momoPhoneInvalid');
        }
        if (!payment.momoName || !payment.momoName.trim()) {
          errs.paymentMomoName = t('forms.editorPage.payment.momoNameRequired');
        }
        if (payment.momoQrMode === 'account') {
          const cleanAcc = (payment.momoQrAccount || '').replace(/\s+/g, '').toUpperCase();
          if (!cleanAcc) {
            errs.paymentMomoQrAccount = t('forms.editorPage.payment.momoQrAccountRequired');
          } else if (!/^[A-Z0-9]{6,19}$/.test(cleanAcc)) {
            errs.paymentMomoQrAccount = t('forms.editorPage.payment.momoQrAccountInvalid');
          }
        }
      }

      const holdNum = Number(payment.holdMinutes);
      if (!Number.isInteger(holdNum) || holdNum < MIN_HOLD_MINUTES || holdNum > MAX_HOLD_MINUTES) {
        errs.paymentHoldMinutes = t('forms.editorPage.payment.holdMinutesInvalid');
      }
    }

    return errs;
  };

  const handleSave = async ({ andPublish = false } = {}) => {
    const validationErrors = validateForm();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      // Mở các khối thu gọn đang chứa ô lỗi để người dùng thấy ngay chỗ cần sửa.
      setOpenBlocks((prev) => {
        const next = { ...prev };
        for (const [block, keys] of Object.entries(BLOCK_ERROR_KEYS)) {
          if (keys.some((k) => validationErrors[k])) next[block] = true;
        }
        return next;
      });
      const firstError = Object.values(validationErrors)[0];
      toast.error(firstError);
      return false;
    }
    setErrors({});
    setIsSaving(true);

    try {
      // Chuẩn bị payload: giữ nguyên key cũ nếu có (bắt buộc theo PR-1b contract)
      const payloadFields = fields.map((f) => {
        const item = {
          label: f.label.trim(),
          type: f.type,
          required: Boolean(f.required),
        };
        // Giữ key cũ nếu có (trường mới key rỗng)
        if (f.key && String(f.key).trim()) {
          item.key = f.key.trim();
        }
        if (f.role) {
          item.role = f.role;
        }
        if (['select', 'radio', 'checkbox'].includes(f.type)) {
          item.options = f.options.map((opt) => String(opt).trim()).filter(Boolean);
        }
        return item;
      });

      // Luôn gửi đủ 6 khoá settings vì PUT ghi đè cả khối
      const payloadSettings = {
        notifyOwner: Boolean(settings.notifyOwner),
        consentEnabled: Boolean(settings.consentEnabled),
        sendConfirmation: Boolean(settings.sendConfirmation),
        submitButtonText: settings.submitButtonText?.trim() || t('publicForm.defaultSubmit'),
        successMessage: settings.successMessage?.trim() || t('publicForm.defaultSuccess'),
        redirectUrl: settings.redirectUrl?.trim() || null,
      };

      // Luôn gửi bookingConfig: đủ 6 khoá khi bật, null khi tắt (server lưu null -> mất khung
      // giờ đã khai, đã cảnh báo ở validateForm/UI trước khi tới đây).
      let payloadBooking = null;
      if (booking.enabled) {
        const weeklySlots = {};
        for (const key of WEEKDAY_KEYS) {
          weeklySlots[key] = (booking.weeklySlots[key] || []).filter(Boolean);
        }
        payloadBooking = {
          enabled: true,
          weeklySlots,
          slotCapacity: booking.slotCapacity === '' ? null : Number(booking.slotCapacity),
          daysAhead: Number(booking.daysAhead),
          minNoticeMinutes: Number(booking.minNoticeMinutes),
          closedDates: booking.closedDates.filter(Boolean),
        };
      }

      // PR-4b mục 6: payload LUÔN gửi `theme` (kể cả rỗng `{}` — nghĩa là "không tuỳ chỉnh",
      // FormRenderer/trang công khai tự rơi về giao diện mặc định) — KHÁC payment, không có gate
      // theo isEmployee (nhân viên có quyền `forms` mới vào được trang này, được phép đổi theme).
      // Khoá nào rỗng ('') thì VẮNG MẶT trong object — riêng bannerKey/logoKey: vắng mặt =
      // "gỡ ảnh" (hợp đồng normalizeFormTheme), nên phải theo đúng state hiện tại của "Gỡ ảnh"/
      // đã upload, KHÔNG được tự ý gửi giá trị cũ khi người dùng chỉ đổi màu (bannerKey đã nằm
      // sẵn trong theme.bannerKey từ lúc nạp API — giữ ảnh cũ tự động vì state không đổi trừ khi
      // người dùng bấm Gỡ ảnh/upload ảnh khác).
      const payloadTheme = {
        ...(theme.preset ? { preset: theme.preset } : {}),
        ...(HEX_COLOR_RE.test(theme.primaryColor) ? { primaryColor: theme.primaryColor } : {}),
        ...(HEX_COLOR_RE.test(theme.backgroundColor) ? { backgroundColor: theme.backgroundColor } : {}),
        ...(theme.fontFamily ? { fontFamily: theme.fontFamily } : {}),
        ...(theme.layout ? { layout: theme.layout } : {}),
        ...(theme.bannerHeight ? { bannerHeight: theme.bannerHeight } : {}),
        ...(theme.bannerKey ? { bannerKey: theme.bannerKey } : {}),
        ...(theme.logoKey ? { logoKey: theme.logoKey } : {}),
      };

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        fields: payloadFields,
        settings: payloadSettings,
        bookingConfig: payloadBooking,
        theme: payloadTheme,
      };

      // Chỉ gửi productId khi đang gắn hoặc vừa bỏ gắn — biểu mẫu chưa từng gắn sản phẩm giữ nguyên payload cũ.
      if (productId !== '' || initialProductId !== '') {
        payload.productId = productId === '' ? null : Number(productId);
      }

      // PR-3b mục 1: payload LUÔN gửi paymentConfig cho chủ tài khoản (đủ khoá khi bật, null khi
      // tắt) — nhân viên KHÔNG được gửi khoá này dù giá trị gì (backend chặn 403
      // PAYMENT_CONFIG_OWNER_ONLY chỉ cần THẤY khoá `paymentConfig` trong body, không xét giá
      // trị), nên bỏ hẳn khoá này khỏi payload thay vì gửi null.
      if (!isEmployee) {
        if (!payment.enabled) {
          payload.paymentConfig = null;
        } else {
          const activeMethods = Array.isArray(payment.methods) && payment.methods.length > 0
            ? payment.methods
            : (payment.method ? [payment.method] : ['bank']);
          const primaryMethod = activeMethods[0] || 'bank';
          payload.paymentConfig = {
            enabled: true,
            methods: activeMethods,
            method: primaryMethod,
            amount: Number(payment.amount),
            holdMinutes: Number(payment.holdMinutes),
            purpose: resolvePaymentPurpose(payment.purpose),
          };
          if (activeMethods.includes('bank')) {
            payload.paymentConfig.bankBin = payment.bankBin;
            payload.paymentConfig.accountNumber = (payment.accountNumber || '').trim();
            payload.paymentConfig.accountName = (payment.accountName || '').trim();
          }
          if (activeMethods.includes('momo')) {
            const mode = payment.momoQrMode || 'none';
            payload.paymentConfig.momoPhone = (payment.momoPhone || '').trim();
            payload.paymentConfig.momoName = (payment.momoName || '').trim();
            payload.paymentConfig.momoQrMode = mode;
            if (mode === 'account') {
              payload.paymentConfig.momoQrBin = '971025';
              payload.paymentConfig.momoQrAccount = (payment.momoQrAccount || '').replace(/\s+/g, '').toUpperCase();
              if (payment.momoQrRefLabel) {
                payload.paymentConfig.momoQrRefLabel = payment.momoQrRefLabel.trim();
              }
            } else if (mode === 'phone') {
              payload.paymentConfig.momoQrBin = '971025';
              payload.paymentConfig.momoQrAccount = (payment.momoPhone || '').trim();
            }
          }
        }
      }

      if (isEditMode) {
        await updateForm(id, payload);
        if (andPublish) {
          await publishForm(id, true);
          setIsPublished(true);
        }
        if (payment.enabled) {
          savePaymentPreset(user?.id, payment);
        }
        toast.success(t('forms.saveSuccess'));
        setInitialBookingHadConfig(Boolean(payloadBooking));
        setInitialProductId(productId);
        setConfirmDisableBooking(false);
        return id;
      } else {
        const created = await createForm(payload);
        if (andPublish) {
          await publishForm(created.id, true);
        }
        if (payment.enabled) {
          savePaymentPreset(user?.id, payment);
        }
        toast.success(t('forms.saveSuccess'));
        navigate(`/app/forms/${created.id}/edit`, { replace: true });
        return created.id;
      }
    } catch (err) {
      toast.error(err.response?.data?.message || t('forms.editorPage.saveError'));
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePublish = async () => {
    if (!isEditMode) {
      await handleSave({ andPublish: true });
      return;
    }

    if (isPublished) {
      setIsTogglingPublish(true);
      try {
        await publishForm(id, false);
        setIsPublished(false);
        toast.success(t('forms.editorPage.unpublishSuccess'));
      } catch (err) {
        toast.error(err.response?.data?.message || t('forms.editorPage.togglePublishError'));
      } finally {
        setIsTogglingPublish(false);
      }
      return;
    }

    // Nếu form đang ẩn: LƯU TRƯỚC rồi mới publish
    setIsTogglingPublish(true);
    try {
      await handleSave({ andPublish: true });
    } finally {
      setIsTogglingPublish(false);
    }
  };

  // Xem trước Khối 6 (Giao diện) — FormRenderer previewMode dựng từ state nháp hiện tại, KHÔNG
  // phải bản đã lưu. Phản biện PR-4b điểm 3: đặt xem trước NGAY DƯỚI các control trong CÙNG khối
  // (không tách layout 2 cột toàn trang) — trang này vốn là 1 cột các "Khối" xếp dọc, dựng lại
  // thành 2 cột là thay đổi lớn hơn hẳn phạm vi tính năng theme.
  const previewForm = useMemo(
    () => ({
      title: title || t('forms.formTitle'),
      description,
      fields: fields.map((f) => ({
        key: f.key || f.label,
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.options,
      })),
      settings: {
        submitButtonText: settings.submitButtonText,
        successMessage: settings.successMessage,
        consentEnabled: false,
      },
      theme: {
        primaryColor: HEX_COLOR_RE.test(theme.primaryColor) ? theme.primaryColor : undefined,
        fontFamily: theme.fontFamily || undefined,
        layout: theme.layout || undefined,
        bannerHeight: theme.bannerHeight || undefined,
        bannerUrl: theme.bannerUrl || undefined,
        logoUrl: theme.logoUrl || undefined,
      },
    }),
    [title, description, fields, settings.submitButtonText, settings.successMessage, theme, t]
  );

  if (isLoading) {
    return (
      <div className="p-12 text-center text-gray-500 dark:text-dk-text2">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 dark:border-dk-border border-t-primary-600 mb-3" />
        <p className="text-sm">{t('forms.editorPage.loading')}</p>
      </div>
    );
  }

  // Biểu mẫu MỚI bắt đầu bằng chọn mẫu; sửa biểu mẫu cũ thì không có bước này.
  if (!isEditMode && !templateChosen) {
    return (
      <FormTemplatePicker
        onSelect={handleSelectTemplate}
        onBack={() => navigate('/app/forms')}
        isEmployee={isEmployee}
      />
    );
  }

  // Dòng tóm tắt của khối "Sau khi gửi" lúc thu gọn, vd "Hiện lời cảm ơn · báo email cho bạn".
  const afterSubmitSummary = [
    settings.redirectUrl?.trim()
      ? t('forms.editorPage.afterSubmit.summaryRedirect')
      : t('forms.editorPage.afterSubmit.summaryThanks'),
    settings.notifyOwner && t('forms.editorPage.afterSubmit.summaryNotifyOwner'),
    settings.sendConfirmation && t('forms.editorPage.afterSubmit.summaryConfirmation'),
    settings.consentEnabled && t('forms.editorPage.afterSubmit.summaryConsent'),
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="space-y-6">
      {/* Thanh thao tác dính (PR-1) */}
      <div className="sticky top-0 z-20 bg-white/95 dark:bg-dk-inset/95 backdrop-blur-md py-3.5 border-b border-gray-100 dark:border-dk-border flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 transition-all">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/app/forms')}
            className="p-2.5 rounded-xl border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-raised hover:bg-gray-50 dark:hover:bg-dk-strong text-gray-600 dark:text-dk-text hover:text-gray-900 dark:hover:text-dk-text shadow-2xs transition-all"
            title={t('forms.submissionsPage.backToForms')}
          >
            <HiOutlineArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-dk-text">
                {isEditMode ? t('forms.editForm') : t('forms.createNew')}
              </h1>
              {isEditMode && (
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    isPublished
                      ? 'bg-green-50 dark:bg-emerald-950/40 text-green-700 dark:text-emerald-400 border border-green-200 dark:border-emerald-800'
                      : 'bg-gray-100 dark:bg-dk-raised text-gray-600 dark:text-dk-text2 border border-gray-200 dark:border-dk-border'
                  }`}
                >
                  {isPublished ? t('forms.isPublished') : t('forms.isDraft')}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-dk-text2 mt-0.5">
              {isEditMode ? t('forms.editorPage.editSubtitle') : t('forms.editorPage.createSubtitle')}
            </p>
          </div>
        </div>

        {/* Cụm thao tác: Lưu -> Xuất bản / Gỡ xuất bản -> (đã lưu) Chia sẻ & QR -> Bài nộp (N) */}
        <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
          {/* Nút 1: Lưu */}
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={isSaving || isTogglingPublish}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-700 hover:to-amber-700 active:scale-[0.98] text-white text-sm font-semibold rounded-xl shadow-sm hover:shadow transition-all disabled:opacity-50"
          >
            <HiOutlineCheck className="w-4 h-4" />
            <span>{isSaving ? t('forms.editorPage.saving') : t('forms.editorPage.saveForm')}</span>
          </button>

          {/* Nút 2: Công khai / Ẩn */}
          <button
            type="button"
            onClick={handleTogglePublish}
            disabled={isSaving || isTogglingPublish}
            title={!isEditMode ? t('forms.editorPage.saveAndPublishTooltip') : undefined}
            className={`inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-xl border shadow-2xs transition-all disabled:opacity-50 ${
              isPublished
                ? 'border-gray-200 dark:border-dk-border text-gray-700 dark:text-dk-text bg-white dark:bg-dk-raised hover:bg-gray-50 dark:hover:bg-dk-strong'
                : 'border-emerald-600 text-emerald-700 dark:text-emerald-300 bg-emerald-50/80 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
            }`}
          >
            {isPublished ? (
              <>
                <HiOutlineEyeOff className="w-4 h-4 text-gray-500 dark:text-dk-text2" />
                <span>{t('forms.unpublish')}</span>
              </>
            ) : (
              <>
                <HiOutlineEye className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>{t('forms.publish')}</span>
              </>
            )}
          </button>

          {/* Nút 3 + 4 chỉ hiện khi biểu mẫu đã lưu (có id) — chưa lưu thì không có gì để chia sẻ / xem bài nộp,
              không để nút mờ gây thắc mắc. */}
          {isEditMode && (
            <>
              {/* Nút 3: Chia sẻ */}
              <button
                type="button"
                onClick={() => setIsShareModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-dk-border text-gray-700 dark:text-dk-text bg-white dark:bg-dk-raised hover:bg-gray-50 dark:hover:bg-dk-strong shadow-2xs transition-all"
              >
                <HiOutlineShare className="w-4 h-4 text-gray-500 dark:text-dk-text2" />
                <span>{t('forms.share')}</span>
              </button>

              {/* Nút 4: Bài nộp (N) */}
              <button
                type="button"
                onClick={() => navigate(`/app/forms/${id}/submissions`)}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium rounded-xl border border-gray-200 dark:border-dk-border text-gray-700 dark:text-dk-text bg-white dark:bg-dk-raised hover:bg-gray-50 dark:hover:bg-dk-strong shadow-2xs transition-all"
              >
                <HiOutlineInbox className="w-4 h-4 text-gray-500 dark:text-dk-text2" />
                <span>
                  {submissionCount !== null && submissionCount !== undefined
                    ? `${t('forms.editorPage.submissions')} (${submissionCount})`
                    : t('forms.editorPage.submissions')}
                </span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Hàng 1 trên màn hình rộng: Thông tin chung & Sau khi gửi */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Khối 1: Thông tin chung */}
        <div id="section-general" className="bg-white dark:bg-dk-raised rounded-2xl shadow-sm border border-slate-200/90 dark:border-dk-border hover:border-slate-300 dark:hover:border-dk-border hover:shadow-md p-6 sm:p-7 space-y-5 transition-all duration-200 relative overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-dk-border">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md shadow-orange-500/25 flex items-center justify-center shrink-0">
              <HiOutlineDocumentText className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-dk-text">{t('forms.editorPage.generalInfo')}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 border border-orange-200/80 dark:border-orange-900/60">
                  {t('forms.editorPage.badges.basic')}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-dk-text2 mt-0.5">{t('forms.editorPage.generalInfoSubtitle')}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-dk-text mb-1.5">
              {t('forms.formTitle')} <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              type="text"
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('forms.editorPage.titlePlaceholder')}
              className={`w-full px-4 py-2.5 rounded-xl border text-sm font-medium text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted bg-white dark:bg-dk-bg focus:outline-none focus:ring-4 transition shadow-2xs ${
                errors.title
                  ? 'border-red-300 dark:border-red-500/60 focus:ring-red-100 dark:focus:ring-red-950/30'
                  : 'border-slate-200 dark:border-dk-border hover:border-slate-300 dark:hover:border-dk-border-strong focus:border-orange-500 focus:ring-orange-500/10'
              }`}
            />
            {errors.title && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.title}</p>}
            <p className="text-xs text-slate-400 dark:text-dk-muted mt-1.5 text-right">{title.length}/200</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-dk-text mb-1.5">
              {t('forms.formDescription')}
            </label>
            <textarea
              rows={3}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('forms.editorPage.descPlaceholder')}
              className={`w-full px-4 py-2.5 rounded-xl border text-sm text-slate-800 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted bg-white dark:bg-dk-bg focus:outline-none focus:ring-4 transition shadow-2xs resize-y ${
                errors.description
                  ? 'border-red-300 dark:border-red-500/60 focus:ring-red-100 dark:focus:ring-red-950/30'
                  : 'border-slate-200 dark:border-dk-border hover:border-slate-300 dark:hover:border-dk-border-strong focus:border-orange-500 focus:ring-orange-500/10'
              }`}
            />
            {errors.description && (
              <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.description}</p>
            )}
            <p className="text-xs text-slate-400 dark:text-dk-muted mt-1.5 text-right">{description.length}/5000</p>
          </div>
        </div>

        {/* Khối 3: Sau khi gửi (Cài đặt & phản hồi) — thu gọn mặc định, kèm dòng tóm tắt */}
        <div id="section-settings" className="bg-white dark:bg-dk-raised rounded-2xl shadow-sm border border-slate-200/90 dark:border-dk-border hover:border-slate-300 dark:hover:border-dk-border hover:shadow-md p-6 sm:p-7 space-y-5 transition-all duration-200 relative overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-teal-500 to-emerald-600" />
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-dk-border">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-md shadow-teal-500/25 flex items-center justify-center shrink-0">
              <HiOutlineClipboardCheck className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-dk-text">
                  <button
                    type="button"
                    aria-expanded={openBlocks.afterSubmit}
                    aria-controls="section-settings-body"
                    onClick={() => setOpenBlocks((prev) => ({ ...prev, afterSubmit: !prev.afterSubmit }))}
                    className="inline-flex items-center gap-2 text-left hover:text-teal-700 dark:hover:text-teal-400 transition"
                  >
                    <span>{t('forms.editorPage.afterSubmit.title')}</span>
                    <HiOutlineChevronDown
                      className={`w-4 h-4 text-slate-400 dark:text-dk-muted transition-transform ${openBlocks.afterSubmit ? 'rotate-180' : ''}`}
                    />
                  </button>
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-400 border border-teal-200/80 dark:border-teal-900/60">
                  {t('forms.editorPage.badges.postSubmit')}
                </span>
              </div>
              {!openBlocks.afterSubmit && (
                <p className="text-xs text-slate-500 dark:text-dk-text2 mt-1" data-testid="after-submit-summary">
                  {afterSubmitSummary}
                </p>
              )}
              {openBlocks.afterSubmit && (
                <p className="text-xs text-slate-500 dark:text-dk-text2 mt-0.5">{t('forms.editorPage.afterSubmitSubtitle')}</p>
              )}
            </div>
          </div>

          {openBlocks.afterSubmit && (
            <div id="section-settings-body" className="space-y-4 divide-y divide-slate-100 dark:divide-dk-border">
              {/* notifyOwner */}
              <div className="flex items-start justify-between gap-4 pt-4 first:pt-0">
                <div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-dk-text">
                    {t('forms.notifyOwner')}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-dk-text2 mt-0.5">
                    {t('forms.editorPage.notifyOwnerHelp')}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.notifyOwner}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, notifyOwner: e.target.checked }))
                  }
                  className="mt-1 h-4 w-4 rounded text-teal-600 dark:text-teal-400 focus:ring-teal-500 border-slate-300 dark:border-dk-border-strong"
                />
              </div>

              {/* consentEnabled */}
              <div className="flex items-start justify-between gap-4 pt-4">
                <div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-dk-text">
                    {t('forms.consentEnabled')}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-dk-text2 mt-0.5">
                    {t('forms.editorPage.consentEnabledHelp')}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.consentEnabled}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, consentEnabled: e.target.checked }))
                  }
                  className="mt-1 h-4 w-4 rounded text-teal-600 dark:text-teal-400 focus:ring-teal-500 border-slate-300 dark:border-dk-border-strong"
                />
              </div>

              {/* sendConfirmation */}
              <div className="flex items-start justify-between gap-4 pt-4">
                <div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-dk-text">
                    {t('forms.sendConfirmation')}
                  </div>
                  <p className="text-xs text-slate-500 dark:text-dk-text2 mt-0.5">
                    {t('forms.editorPage.sendConfirmationHelp')}
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.sendConfirmation}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, sendConfirmation: e.target.checked }))
                  }
                  className="mt-1 h-4 w-4 rounded text-teal-600 dark:text-teal-400 focus:ring-teal-500 border-slate-300 dark:border-dk-border-strong"
                />
              </div>

              {/* submitButtonText */}
              <div className="pt-4 space-y-1">
                <label className="block text-sm font-semibold text-slate-700 dark:text-dk-text">
                  {t('forms.submitButtonText')}
                </label>
                <input
                  type="text"
                  maxLength={50}
                  value={settings.submitButtonText}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, submitButtonText: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-bg text-sm text-slate-800 dark:text-dk-text focus:outline-none focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-950/40 focus:border-teal-500 shadow-2xs"
                />
              </div>

              {/* successMessage */}
              <div className="pt-4 space-y-1">
                <label className="block text-sm font-semibold text-slate-700 dark:text-dk-text">
                  {t('forms.successMessage')}
                </label>
                <textarea
                  rows={2}
                  maxLength={500}
                  value={settings.successMessage}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, successMessage: e.target.value }))
                  }
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-bg text-sm text-slate-800 dark:text-dk-text focus:outline-none focus:ring-2 focus:ring-teal-100 dark:focus:ring-teal-950/40 focus:border-teal-500 shadow-2xs resize-y"
                />
              </div>

              {/* redirectUrl */}
              <div className="pt-4 space-y-1">
                <label className="block text-sm font-semibold text-slate-700 dark:text-dk-text">
                  {t('forms.redirectUrl')}
                </label>
                <input
                  type="url"
                  maxLength={2000}
                  value={settings.redirectUrl}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, redirectUrl: e.target.value }))
                  }
                  placeholder="https://example.com/cam-on"
                  className={`w-full px-4 py-2.5 rounded-xl border text-sm bg-white dark:bg-dk-bg text-slate-800 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 shadow-2xs ${
                    errors.redirectUrl
                      ? 'border-red-300 dark:border-red-500/60 focus:ring-red-200 dark:focus:ring-red-950/30'
                      : 'border-slate-200 dark:border-dk-border focus:ring-teal-100 dark:focus:ring-teal-950/40 focus:border-teal-500'
                  }`}
                />
                {errors.redirectUrl && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.redirectUrl}</p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Khối 2: Danh sách trường */}
      <div id="section-fields" className="bg-white dark:bg-dk-raised rounded-2xl shadow-sm border border-slate-200/90 dark:border-dk-border hover:border-slate-300 dark:hover:border-dk-border hover:shadow-md p-6 sm:p-7 space-y-6 transition-all duration-200 relative overflow-hidden group">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-indigo-500 to-purple-600" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-dk-border">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white shadow-md shadow-indigo-500/25 flex items-center justify-center shrink-0">
              <HiOutlineViewList className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-dk-text">{t('forms.fields')}</h2>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-200/80 dark:border-indigo-900/60">
                  {fields.length}/30
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-dk-text2 mt-0.5">{t('forms.editorPage.maxFieldsHelp')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleAddField}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-[0.98] text-white rounded-xl text-xs font-bold shadow-xs hover:shadow transition self-start sm:self-auto"
          >
            <HiOutlinePlus className="w-4 h-4" />
            <span>{t('forms.addField')}</span>
          </button>
        </div>

        {/* Dải nút thêm nhanh 1-chạm tích hợp trong khối */}
        <div className="bg-gradient-to-r from-orange-50/80 via-amber-50/50 to-orange-50/30 dark:from-orange-950/20 dark:via-amber-950/10 dark:to-orange-950/20 p-4 rounded-2xl border border-dashed border-orange-200/90 dark:border-orange-800/60 shadow-2xs">
          <div className="text-[11px] font-bold text-orange-950 dark:text-orange-200 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
            <HiOutlineLightningBolt className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
            <span>{t('forms.editorPage.quickAdd.title')}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_FIELD_PRESETS.filter((preset) => preset.common || showMoreFieldTypes).map((preset) => {
              const Icon = preset.icon;
              return (
                <button
                  key={preset.id || preset.title}
                  type="button"
                  onClick={() => handleAddQuickField(preset)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 bg-white dark:bg-dk-raised hover:bg-orange-50 dark:hover:bg-orange-950/40 text-slate-700 dark:text-dk-text hover:text-orange-700 dark:hover:text-orange-400 border border-slate-200 dark:border-dk-border hover:border-orange-300 dark:hover:border-orange-500/50 rounded-xl text-xs font-semibold transition-all shadow-2xs hover:shadow-xs active:scale-95 group"
                >
                  <Icon className="w-3.5 h-3.5 text-slate-500 dark:text-dk-text2 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition" />
                  <span>{preset.titleKey ? t(preset.titleKey) : preset.title}</span>
                </button>
              );
            })}
            <button
              type="button"
              aria-expanded={showMoreFieldTypes}
              onClick={() => setShowMoreFieldTypes((prev) => !prev)}
              className="inline-flex items-center gap-1 px-3 py-2 text-orange-700 dark:text-orange-400 hover:bg-orange-100/70 dark:hover:bg-orange-950/40 rounded-xl text-xs font-bold transition"
            >
              {showMoreFieldTypes ? t('forms.editorPage.quickAdd.fewerTypes') : t('forms.editorPage.quickAdd.moreTypes')}
            </button>
          </div>
        </div>

          {errors.fields && (
            <p className="text-xs text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-950/40 rounded-xl">{errors.fields}</p>
          )}

          <div className="space-y-4">
            {fields.map((field, idx) => {
              const hasOptions = ['select', 'radio', 'checkbox'].includes(field.type);
              const labelError = errors[`field_${idx}_label`];
              const optionsError = errors[`field_${idx}_options`];

              return (
                <div
                  key={field.key || idx}
                  className="p-5 rounded-2xl border border-slate-200/90 dark:border-dk-border bg-gradient-to-b from-white to-slate-50/40 dark:from-dk-raised dark:to-dk-surface space-y-4 relative shadow-2xs hover:border-slate-300 dark:hover:border-dk-border hover:shadow-xs transition-all"
                >
                  <div className="flex items-center justify-between border-b border-slate-100 dark:border-dk-border pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider bg-slate-100 dark:bg-dk-raised text-slate-700 dark:text-dk-text border border-slate-200/80 dark:border-dk-border">
                        {t('forms.editorPage.fieldIndex', { index: idx + 1 })}
                      </span>
                      <span className="text-xs font-semibold px-2.5 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/60">
                        {t(FIELD_TYPES.find((ft) => ft.value === field.type)?.labelKey || 'forms.types.short_text')}
                      </span>
                      {field.required && (
                        <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60 px-2 py-0.5 rounded-md">
                          {t('forms.required')}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveField(idx, -1)}
                        className="p-1.5 text-slate-400 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-raised disabled:opacity-30 rounded-lg transition"
                        title={t('forms.editorPage.moveUp')}
                      >
                        <HiOutlineArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === fields.length - 1}
                        onClick={() => handleMoveField(idx, 1)}
                        className="p-1.5 text-slate-400 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-raised disabled:opacity-30 rounded-lg transition"
                        title={t('forms.editorPage.moveDown')}
                      >
                        <HiOutlineArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveField(idx)}
                        className="p-1.5 text-slate-400 dark:text-dk-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition ml-1"
                        title={t('forms.editorPage.removeField')}
                      >
                        <HiOutlineTrash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Nhãn trường */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-dk-text mb-1">
                        {t('forms.fieldLabel')} <span className="text-red-500 dark:text-red-400">*</span>
                      </label>
                      <input
                        type="text"
                        maxLength={200}
                        value={field.label}
                        onChange={(e) => handleUpdateField(idx, 'label', e.target.value)}
                        placeholder={t('forms.editorPage.fieldLabelPlaceholder')}
                        className={`w-full px-3.5 py-2.5 bg-white dark:bg-dk-bg rounded-xl border text-sm font-medium text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-4 transition shadow-2xs ${
                          labelError
                            ? 'border-red-300 dark:border-red-500/60 focus:ring-red-100 dark:focus:ring-red-950/30'
                            : 'border-gray-200 dark:border-dk-border focus:border-orange-500 focus:ring-orange-500/10'
                        }`}
                      />
                      {labelError && <p className="text-xs text-red-600 dark:text-red-400 mt-1">{labelError}</p>}
                    </div>

                    {/* Kiểu dữ liệu */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-dk-text mb-1">
                        {t('forms.fieldType')}
                      </label>
                      <select
                        value={field.type}
                        onChange={(e) => handleUpdateField(idx, 'type', e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-dk-bg rounded-xl border border-gray-200 dark:border-dk-border text-sm font-medium text-slate-900 dark:text-dk-text focus:outline-none focus:ring-4 focus:border-orange-500 focus:ring-orange-500/10 shadow-2xs"
                      >
                        {FIELD_TYPES.map((ft) => (
                          <option key={ft.value} value={ft.value}>
                            {t(ft.labelKey)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Vai trò role */}
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 dark:text-dk-text mb-1">
                        {t('forms.role')}
                      </label>
                      <select
                        value={field.role || ''}
                        onChange={(e) => handleUpdateField(idx, 'role', e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-white dark:bg-dk-bg rounded-xl border border-gray-200 dark:border-dk-border text-sm text-slate-900 dark:text-dk-text focus:outline-none focus:ring-4 focus:border-orange-500 focus:ring-orange-500/10 shadow-2xs"
                      >
                        <option value="">{t('forms.roleNone')}</option>
                        <option value="name">{t('forms.roleName')}</option>
                        <option value="email">{t('forms.roleEmail')}</option>
                        <option value="phone">{t('forms.rolePhone')}</option>
                      </select>
                    </div>

                    {/* Bắt buộc check */}
                    <div className="flex items-center pt-5">
                      <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700 dark:text-dk-text px-3 py-2 rounded-xl hover:bg-gray-100/80 dark:hover:bg-dk-raised transition">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => handleUpdateField(idx, 'required', e.target.checked)}
                          className="h-4 w-4 rounded text-orange-600 dark:text-orange-400 focus:ring-orange-500 border-gray-300 dark:border-dk-border-strong"
                        />
                        <span className="font-medium">{t('forms.required')}</span>
                      </label>
                    </div>
                  </div>

                  {/* Danh sách lựa chọn options (nếu là select, radio, checkbox) */}
                  {hasOptions && (
                    <div className="pt-3 border-t border-gray-200/80 dark:border-dk-border space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-gray-700 dark:text-dk-text">
                          {t('forms.options')}
                        </label>
                        <button
                          type="button"
                          onClick={() => handleAddOption(idx)}
                          className="inline-flex items-center gap-1 text-xs text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 font-semibold px-2 py-1 rounded-md hover:bg-orange-50 dark:hover:bg-orange-950/40 transition"
                        >
                          + {t('forms.addOption')}
                        </button>
                      </div>

                      {optionsError && (
                        <p className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 p-2.5 rounded-xl">{optionsError}</p>
                      )}

                      <div className="space-y-2">
                        {field.options.map((opt, optIdx) => (
                          <div key={optIdx} className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-400 dark:text-dk-muted w-4 text-center shrink-0">
                              {optIdx + 1}.
                            </span>
                            <input
                              type="text"
                              maxLength={100}
                              value={opt}
                              onChange={(e) => handleUpdateOption(idx, optIdx, e.target.value)}
                              placeholder={t('forms.optionPlaceholder')}
                              className="w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border border-gray-200 dark:border-dk-border text-xs font-medium text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 shadow-2xs"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(idx, optIdx)}
                              className="p-1.5 text-gray-400 dark:text-dk-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition"
                              title={t('forms.editorPage.removeOption')}
                            >
                              <HiOutlineTrash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>


      {/* Hàng 2 trên màn hình rộng: Gắn sản phẩm & Đặt lịch hẹn */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Khối "Dành cho sản phẩm": gắn biểu mẫu với sản phẩm để trang Sản phẩm đếm Đăng ký / Đã trả / Doanh thu */}
        <div id="section-product" className="bg-white dark:bg-dk-raised rounded-2xl shadow-sm border border-slate-200/90 dark:border-dk-border hover:border-slate-300 dark:hover:border-dk-border hover:shadow-md p-6 sm:p-7 space-y-4 transition-all duration-200 relative overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-violet-500 to-purple-600" />
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-dk-border">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md shadow-violet-500/25 flex items-center justify-center shrink-0">
              <HiOutlineShoppingCart className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-dk-text">{t('forms.editorPage.product.title')}</h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-400 border border-violet-200/80 dark:border-violet-900/60">
                  {t('forms.editorPage.badges.product')}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-dk-text2 mt-0.5">{t('forms.editorPage.product.help')}</p>
            </div>
          </div>
          <select
            data-testid="form-product-select"
            aria-label={t('forms.editorPage.product.title')}
            value={productId}
            onChange={handleProductChange}
            className="w-full rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-bg px-4 py-2.5 text-sm font-medium text-slate-900 dark:text-dk-text focus:outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 shadow-2xs transition"
          >
            <option value="">{t('forms.editorPage.product.none')}</option>
            {productId !== '' && !productOptions.some((p) => String(p.id) === productId) && (
              <option value={productId}>{t('forms.editorPage.product.currentOption', { id: productId })}</option>
            )}
            {productOptions.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {p.productName}
              </option>
            ))}
          </select>
          {payment.enabled && selectedProductAmount !== null ? (
            <p data-testid="form-product-price-hint" className="text-xs text-slate-600 dark:text-dk-text bg-violet-50/60 dark:bg-violet-950/30 p-2.5 rounded-xl border border-violet-100 dark:border-violet-900/50">
              {t('forms.editorPage.product.priceHintAmount', { price: `${selectedProductAmount.toLocaleString('vi-VN')} đ` })}{' '}
              {!isEmployee && payment.amount && Number(payment.amount) !== selectedProductAmount ? (
                <button
                  type="button"
                  data-testid="form-product-use-price"
                  className="text-violet-600 dark:text-violet-400 font-semibold hover:underline ml-1"
                  onClick={() => setPayment((prev) => ({ ...prev, amount: String(selectedProductAmount) }))}
                >
                  {t('forms.editorPage.product.usePrice', { price: `${selectedProductAmount.toLocaleString('vi-VN')} đ` })}
                </button>
              ) : null}
            </p>
          ) : payment.enabled && selectedProduct?.price ? (
            <p data-testid="form-product-price-hint" className="text-xs text-slate-600 dark:text-dk-text bg-violet-50/60 dark:bg-violet-950/30 p-2.5 rounded-xl border border-violet-100 dark:border-violet-900/50">
              {t('forms.editorPage.product.priceHint', { price: selectedProduct.price })}
            </p>
          ) : null}
        </div>

        {/* Khối 4: Đặt lịch hẹn — thẻ thu gọn "Thêm đặt lịch hẹn" cho tới khi có dữ liệu / người dùng bấm mở */}
        {openBlocks.booking ? (
        <div id="section-booking" className="bg-white dark:bg-dk-raised rounded-2xl shadow-sm border border-slate-200/90 dark:border-dk-border hover:border-slate-300 dark:hover:border-dk-border hover:shadow-md p-6 sm:p-7 space-y-6 transition-all duration-200 relative overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-600" />
          <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100 dark:border-dk-border">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 text-white shadow-md shadow-blue-500/25 flex items-center justify-center shrink-0">
                <HiOutlineCalendar className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-dk-text">
                    {t('forms.editorPage.booking.title')}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400 border border-blue-200/80 dark:border-blue-900/60">
                    {t('forms.editorPage.badges.booking')}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-dk-text2 mt-0.5">
                  {t('forms.editorPage.booking.enableHelp')}
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none shrink-0 pt-1">
              <span className="text-xs font-semibold text-slate-700 dark:text-dk-text">
                {t('forms.editorPage.booking.enableLabel')}
              </span>
              <input
                type="checkbox"
                checked={booking.enabled}
                onChange={(e) => handleToggleBookingEnabled(e.target.checked)}
                className="h-4 w-4 rounded text-blue-600 dark:text-blue-400 focus:ring-blue-500 border-slate-300 dark:border-dk-border-strong"
              />
            </label>
          </div>

          {!booking.enabled && initialBookingHadConfig && (
            <div className="p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60 text-amber-800 dark:text-amber-300 text-xs space-y-2">
              <p className="font-medium">{t('forms.editorPage.booking.disableWarning')}</p>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmDisableBooking}
                  onChange={(e) => setConfirmDisableBooking(e.target.checked)}
                  className="h-4 w-4 rounded text-amber-600 dark:text-amber-400 focus:ring-amber-500 border-amber-300 dark:border-amber-700"
                />
                <span>{t('forms.editorPage.booking.disableConfirmCheckbox')}</span>
              </label>
              {errors.bookingDisableConfirm && (
                <p className="text-red-700 dark:text-red-400 font-medium">{errors.bookingDisableConfirm}</p>
              )}
            </div>
          )}

          {booking.enabled && (
            <div className="space-y-5">
              {(fields.every((f) => f.role !== 'email') || !settings.sendConfirmation) && (
                <p className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-blue-700 dark:text-blue-300 text-xs">
                  {t('forms.editorPage.booking.emailHint')}
                </p>
              )}

              {errors.bookingSlots && (
                <p className="text-xs text-red-600 dark:text-red-400 p-3 bg-red-50 dark:bg-red-950/40 rounded-xl">{errors.bookingSlots}</p>
              )}

              {/* Khung giờ theo tuần */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-dk-text">
                    {t('forms.editorPage.booking.weeklySlotsLabel')}
                  </label>
                  <button
                    type="button"
                    onClick={handleApplyMondayToAll}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
                  >
                    {t('forms.editorPage.booking.applyMondayToAll')}
                  </button>
                </div>
                <div className="space-y-2">
                  {WEEKDAY_UI_ORDER.map((day) => (
                    <div key={day.key} className="p-3 rounded-xl border border-gray-200 dark:border-dk-border bg-gray-50/50 dark:bg-dk-bg/50">
                      <div className="text-xs font-semibold text-gray-700 dark:text-dk-text mb-2">{t(day.labelKey)}</div>
                      <div className="flex flex-wrap items-center gap-2">
                        {(booking.weeklySlots[day.key] || []).map((time, idx) => (
                          <div key={idx} className="flex items-center gap-1">
                            <input
                              type="time"
                              value={time}
                              onChange={(e) => handleUpdateTimeSlot(day.key, idx, e.target.value)}
                              className="px-2 py-1.5 bg-white dark:bg-dk-bg rounded-lg border border-gray-300 dark:border-dk-border text-slate-900 dark:text-dk-text text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveTimeSlot(day.key, idx)}
                              className="p-1 text-gray-400 dark:text-dk-muted hover:text-red-500 dark:hover:text-red-400 rounded"
                              title={t('forms.editorPage.booking.removeSlot')}
                            >
                              <HiOutlineTrash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => handleAddTimeSlot(day.key)}
                          className="px-2.5 py-1.5 rounded-lg border border-dashed border-gray-300 dark:border-dk-border text-xs text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/30"
                        >
                          + {t('forms.editorPage.booking.addSlot')}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Sức chứa / số ngày cho phép / báo trước tối thiểu */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                    {t('forms.editorPage.booking.capacityLabel')}
                  </label>
                  <input
                    type="number"
                    min={MIN_SLOT_CAPACITY}
                    max={MAX_SLOT_CAPACITY}
                    value={booking.slotCapacity}
                    onChange={(e) => setBooking((prev) => ({ ...prev, slotCapacity: e.target.value }))}
                    placeholder={t('forms.editorPage.booking.capacityPlaceholder')}
                    className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text focus:outline-none focus:ring-2 ${
                      errors.bookingCapacity
                        ? 'border-red-300 dark:border-red-500/60 focus:ring-red-200 dark:focus:ring-red-950/40'
                        : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                    }`}
                  />
                  {errors.bookingCapacity && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.bookingCapacity}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                    {t('forms.editorPage.booking.daysAheadLabel')}
                  </label>
                  <input
                    type="number"
                    min={MIN_DAYS_AHEAD}
                    max={MAX_DAYS_AHEAD}
                    value={booking.daysAhead}
                    onChange={(e) => setBooking((prev) => ({ ...prev, daysAhead: e.target.value }))}
                    className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text focus:outline-none focus:ring-2 ${
                      errors.bookingDaysAhead
                        ? 'border-red-300 dark:border-red-500/60 focus:ring-red-200 dark:focus:ring-red-950/40'
                        : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                    }`}
                  />
                  {errors.bookingDaysAhead && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.bookingDaysAhead}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                    {t('forms.editorPage.booking.minNoticeLabel')}
                  </label>
                  <input
                    type="number"
                    min={MIN_NOTICE_MINUTES_MIN}
                    max={MIN_NOTICE_MINUTES_MAX}
                    value={booking.minNoticeMinutes}
                    onChange={(e) => setBooking((prev) => ({ ...prev, minNoticeMinutes: e.target.value }))}
                    className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text focus:outline-none focus:ring-2 ${
                      errors.bookingMinNotice
                        ? 'border-red-300 dark:border-red-500/60 focus:ring-red-200 dark:focus:ring-red-950/40'
                        : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                    }`}
                  />
                  {errors.bookingMinNotice && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.bookingMinNotice}</p>
                  )}
                </div>
              </div>

              {/* Ngày nghỉ */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700 dark:text-dk-text">
                    {t('forms.editorPage.booking.closedDatesLabel')}
                  </label>
                  <button
                    type="button"
                    onClick={handleAddClosedDate}
                    className="text-xs text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 font-medium"
                  >
                    + {t('forms.editorPage.booking.addClosedDate')}
                  </button>
                </div>
                {errors.bookingClosedDates && (
                  <p className="text-xs text-red-600 dark:text-red-400">{errors.bookingClosedDates}</p>
                )}
                <div className="space-y-2">
                  {booking.closedDates.map((d, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="date"
                        value={d}
                        onChange={(e) => handleUpdateClosedDate(idx, e.target.value)}
                        className="px-3 py-1.5 bg-white dark:bg-dk-bg rounded-lg border border-gray-300 dark:border-dk-border text-slate-900 dark:text-dk-text text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveClosedDate(idx)}
                        className="p-1.5 text-gray-400 dark:text-dk-muted hover:text-red-500 dark:hover:text-red-400 rounded"
                      >
                        <HiOutlineTrash className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        ) : (
          <AddSectionCard
            id="section-booking"
            icon={HiOutlineCalendar}
            title={t('forms.editorPage.addBlock.booking')}
            hint={t('forms.editorPage.booking.enableHelp')}
            onOpen={() => openBlock('booking')}
          />
        )}
      </div>

      {/* Hàng 3 trên màn hình rộng: Thanh toán giữ chỗ & Giao diện */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {/* Khối 5: Thanh toán giữ chỗ — thẻ thu gọn "Thu tiền khi gửi" cho tới khi có dữ liệu / người dùng bấm mở */}
        {openBlocks.payment ? (
        <div id="section-payment" className="bg-white dark:bg-dk-raised rounded-2xl shadow-sm border border-slate-200/90 dark:border-dk-border hover:border-slate-300 dark:hover:border-dk-border hover:shadow-md p-6 sm:p-7 space-y-6 transition-all duration-200 relative overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-600" />
          <div className="flex items-start justify-between gap-4 pb-3 border-b border-slate-100 dark:border-dk-border">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-500/25 flex items-center justify-center shrink-0">
                <HiOutlineCreditCard className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900 dark:text-dk-text">
                    {t('forms.editorPage.payment.title')}
                  </h2>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-900/60">
                    {t('forms.editorPage.badges.payment')}
                  </span>
                </div>
                <p className="text-xs text-slate-500 dark:text-dk-text2 mt-0.5">
                  {t('forms.editorPage.payment.enableHelp')}
                </p>
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none shrink-0 pt-1">
              <span className="text-xs font-semibold text-slate-700 dark:text-dk-text">
                {t('forms.editorPage.payment.enableLabel')}
              </span>
              <input
                type="checkbox"
                checked={payment.enabled}
                disabled={isEmployee}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  // Bật thu tiền khi đã chọn sản phẩm có giá số và ô số tiền trống → tự điền.
                  setPayment((prev) => ({
                    ...prev,
                    enabled,
                    amount: enabled && !prev.amount && selectedProductAmount !== null ? String(selectedProductAmount) : prev.amount,
                  }));
                }}
                className="h-4 w-4 rounded text-emerald-600 dark:text-emerald-400 focus:ring-emerald-500 border-slate-300 dark:border-dk-border-strong dark:bg-dk-bg disabled:opacity-50"
              />
            </label>
          </div>

          {isEmployee && (
            <p className="p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs">
              {t('forms.editorPage.payment.employeeReadOnlyNotice')}
            </p>
          )}

          {payment.enabled && (
            <div className="space-y-5">
              {!isEmployee && (
                <div className="space-y-3">
                  <p className="p-3 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 text-blue-700 dark:text-blue-300 text-xs">
                    {t('forms.editorPage.payment.ownerWarning')}
                  </p>
                  {hasSavedPreset && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-dk-raised/50 border border-slate-200 dark:border-dk-border text-xs">
                      <span className="text-slate-600 dark:text-dk-text">
                        {t('forms.editorPage.payment.savedPresetNotice')}
                      </span>
                      <button
                        type="button"
                        onClick={handleApplySavedPreset}
                        className="font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 underline"
                      >
                        {t('forms.editorPage.payment.applySavedPreset')}
                      </button>
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-2">
                  {t('forms.editorPage.payment.methodLabel')}
                </label>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-dk-text cursor-pointer">
                    <input
                      type="checkbox"
                      name="paymentMethodBank"
                      disabled={isEmployee}
                      checked={(payment.methods || []).includes('bank')}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setPayment((prev) => {
                          const currentMethods = prev.methods || (prev.method ? [prev.method] : ['bank']);
                          const nextMethods = checked
                            ? Array.from(new Set([...currentMethods, 'bank']))
                            : currentMethods.filter((m) => m !== 'bank');
                          return {
                            ...prev,
                            methods: nextMethods,
                            method: nextMethods[0] || 'bank',
                          };
                        });
                      }}
                      className="rounded text-primary-600 dark:text-primary-400 focus:ring-primary-500 border-slate-300 dark:border-dk-border-strong dark:bg-dk-bg"
                    />
                    {t('forms.editorPage.payment.methodBank')}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-dk-text cursor-pointer">
                    <input
                      type="checkbox"
                      name="paymentMethodMomo"
                      disabled={isEmployee}
                      checked={(payment.methods || []).includes('momo')}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setPayment((prev) => {
                          const currentMethods = prev.methods || (prev.method ? [prev.method] : ['bank']);
                          const nextMethods = checked
                            ? Array.from(new Set([...currentMethods, 'momo']))
                            : currentMethods.filter((m) => m !== 'momo');
                          return {
                            ...prev,
                            methods: nextMethods,
                            method: nextMethods[0] || 'momo',
                          };
                        });
                      }}
                      className="rounded text-primary-600 dark:text-primary-400 focus:ring-primary-500 border-slate-300 dark:border-dk-border-strong dark:bg-dk-bg"
                    />
                    {t('forms.editorPage.payment.methodMomo')}
                  </label>
                </div>
                {errors.paymentMethods && (
                  <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.paymentMethods}</p>
                )}
              </div>

              <div>
                <label htmlFor="form-payment-purpose" className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                  {t('forms.editorPage.payment.purposeLabel')}
                </label>
                <select
                  id="form-payment-purpose"
                  disabled={isEmployee}
                  value={resolvePaymentPurpose(payment.purpose)}
                  onChange={(e) => setPayment((prev) => ({ ...prev, purpose: e.target.value }))}
                  className="w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border border-gray-300 dark:border-dk-border text-sm text-slate-900 dark:text-dk-text focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40 disabled:bg-gray-50 dark:disabled:bg-dk-raised disabled:text-gray-500 dark:disabled:text-dk-muted"
                >
                  {PAYMENT_PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {t(editorPaymentPurposeKeys(p).option)}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-gray-500 dark:text-dk-text2 mt-1">{t('forms.editorPage.payment.purposeHelp')}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                    {t('forms.editorPage.payment.amountLabel')}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    disabled={isEmployee}
                    value={payment.amount ? Number(payment.amount).toLocaleString('vi-VN') : ''}
                    onChange={(e) =>
                      setPayment((prev) => ({ ...prev, amount: e.target.value.replace(/\D/g, '') }))
                    }
                    placeholder={t('forms.editorPage.payment.amountPlaceholder')}
                    className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 disabled:bg-gray-50 dark:disabled:bg-dk-raised disabled:text-gray-500 dark:disabled:text-dk-muted ${
                      errors.paymentAmount
                        ? 'border-red-300 dark:border-red-800 focus:ring-red-200 dark:focus:ring-red-950/40'
                        : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                    }`}
                  />
                  {errors.paymentAmount && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.paymentAmount}</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                    {t(editorPaymentPurposeKeys(payment.purpose).holdMinutesLabel)}
                  </label>
                  <input
                    type="number"
                    min={MIN_HOLD_MINUTES}
                    max={MAX_HOLD_MINUTES}
                    disabled={isEmployee}
                    value={payment.holdMinutes}
                    onChange={(e) => setPayment((prev) => ({ ...prev, holdMinutes: e.target.value }))}
                    className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text focus:outline-none focus:ring-2 disabled:bg-gray-50 dark:disabled:bg-dk-raised disabled:text-gray-500 dark:disabled:text-dk-muted ${
                      errors.paymentHoldMinutes
                        ? 'border-red-300 dark:border-red-800 focus:ring-red-200 dark:focus:ring-red-950/40'
                        : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                    }`}
                  />
                  {errors.paymentHoldMinutes && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.paymentHoldMinutes}</p>
                  )}
                </div>
              </div>

              {(payment.methods || []).includes('bank') && (
                <div className="p-4 bg-gray-50 dark:bg-dk-raised/40 rounded-xl border border-gray-200 dark:border-dk-border space-y-4">
                  <h4 className="text-xs font-semibold text-gray-700 dark:text-dk-text uppercase tracking-wider">
                    {t('forms.editorPage.payment.methodBank')}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                        {t('forms.editorPage.payment.bankLabel')}
                      </label>
                      <BankSearchSelect
                        disabled={isEmployee}
                        value={payment.bankBin}
                        onChange={(bin) => setPayment((prev) => ({ ...prev, bankBin: bin }))}
                        hasError={Boolean(errors.paymentBank)}
                        placeholder={t('forms.editorPage.payment.bankPlaceholder')}
                      />
                      {errors.paymentBank && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.paymentBank}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                        {t('forms.editorPage.payment.accountNumberLabel')}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        disabled={isEmployee}
                        value={payment.accountNumber}
                        onChange={(e) =>
                          setPayment((prev) => ({ ...prev, accountNumber: e.target.value.replace(/\D/g, '') }))
                        }
                        className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text focus:outline-none focus:ring-2 disabled:bg-gray-50 dark:disabled:bg-dk-raised disabled:text-gray-500 dark:disabled:text-dk-muted ${
                          errors.paymentAccountNumber
                            ? 'border-red-300 dark:border-red-800 focus:ring-red-200 dark:focus:ring-red-950/40'
                            : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                        }`}
                      />
                      {errors.paymentAccountNumber && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.paymentAccountNumber}</p>
                      )}
                    </div>

                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                        {t('forms.editorPage.payment.accountNameLabel')}
                      </label>
                      <input
                        type="text"
                        disabled={isEmployee}
                        value={payment.accountName}
                        onChange={(e) => setPayment((prev) => ({ ...prev, accountName: e.target.value }))}
                        placeholder={t('forms.editorPage.payment.accountNamePlaceholder')}
                        className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 disabled:bg-gray-50 dark:disabled:bg-dk-raised disabled:text-gray-500 dark:disabled:text-dk-muted ${
                          errors.paymentAccountName
                            ? 'border-red-300 dark:border-red-800 focus:ring-red-200 dark:focus:ring-red-950/40'
                            : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                        }`}
                      />
                      <p className="text-[11px] text-gray-400 dark:text-dk-muted mt-1">
                        {t('forms.editorPage.payment.accountNameHint')}
                      </p>
                      {errors.paymentAccountName && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.paymentAccountName}</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {(payment.methods || []).includes('momo') && (
                <div className="p-4 bg-gray-50 dark:bg-dk-raised/40 rounded-xl border border-gray-200 dark:border-dk-border space-y-4">
                  <h4 className="text-xs font-semibold text-gray-700 dark:text-dk-text uppercase tracking-wider">
                    {t('forms.editorPage.payment.methodMomo')}
                  </h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                        {t('forms.editorPage.payment.momoPhoneLabel')}
                      </label>
                      <input
                        type="text"
                        inputMode="numeric"
                        disabled={isEmployee}
                        value={payment.momoPhone}
                        onChange={(e) =>
                          setPayment((prev) => ({ ...prev, momoPhone: e.target.value.replace(/\D/g, '') }))
                        }
                        placeholder={t('forms.editorPage.payment.phonePlaceholder')}
                        className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 disabled:bg-gray-50 dark:disabled:bg-dk-raised disabled:text-gray-500 dark:disabled:text-dk-muted ${
                          errors.paymentMomoPhone
                            ? 'border-red-300 dark:border-red-800 focus:ring-red-200 dark:focus:ring-red-950/40'
                            : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                        }`}
                      />
                      {errors.paymentMomoPhone && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.paymentMomoPhone}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                        {t('forms.editorPage.payment.momoNameLabel')}
                      </label>
                      <input
                        type="text"
                        disabled={isEmployee}
                        value={payment.momoName}
                        onChange={(e) => setPayment((prev) => ({ ...prev, momoName: e.target.value }))}
                        placeholder={t('forms.editorPage.payment.accountNamePlaceholder')}
                        className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 disabled:bg-gray-50 dark:disabled:bg-dk-raised disabled:text-gray-500 dark:disabled:text-dk-muted ${
                          errors.paymentMomoName
                            ? 'border-red-300 dark:border-red-800 focus:ring-red-200 dark:focus:ring-red-950/40'
                            : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                        }`}
                      />
                      <p className="text-[11px] text-gray-400 dark:text-dk-muted mt-1">
                        {t('forms.editorPage.payment.accountNameHint')}
                      </p>
                      {errors.paymentMomoName && (
                        <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.paymentMomoName}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-xs font-medium text-gray-700 dark:text-dk-text">
                      {t('forms.editorPage.payment.momoQrModeLabel')}
                    </label>
                    <div className="space-y-1.5">
                      <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-dk-text cursor-pointer">
                        <input
                          type="radio"
                          name="momoQrMode"
                          value="phone"
                          disabled={isEmployee}
                          checked={payment.momoQrMode === 'phone'}
                          onChange={() => setPayment((prev) => ({ ...prev, momoQrMode: 'phone' }))}
                          className="text-primary-600 dark:text-primary-400 focus:ring-primary-500 border-slate-300 dark:border-dk-border-strong dark:bg-dk-bg"
                        />
                        <span>{t('forms.editorPage.payment.momoQrModePhone')}</span>
                      </label>
                      {payment.momoQrMode === 'phone' && (
                        <p className="ml-6 text-[11px] text-gray-400 dark:text-dk-muted">
                          {t('forms.editorPage.payment.momoQrPhoneHint')}
                        </p>
                      )}

                      <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-dk-text cursor-pointer">
                        <input
                          type="radio"
                          name="momoQrMode"
                          value="account"
                          disabled={isEmployee}
                          checked={payment.momoQrMode === 'account'}
                          onChange={() => setPayment((prev) => ({ ...prev, momoQrMode: 'account' }))}
                          className="text-primary-600 dark:text-primary-400 focus:ring-primary-500 border-slate-300 dark:border-dk-border-strong dark:bg-dk-bg"
                        />
                        <span>{t('forms.editorPage.payment.momoQrModeAccount')}</span>
                      </label>

                      <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-dk-text cursor-pointer">
                        <input
                          type="radio"
                          name="momoQrMode"
                          value="none"
                          disabled={isEmployee}
                          checked={payment.momoQrMode === 'none'}
                          onChange={() => setPayment((prev) => ({ ...prev, momoQrMode: 'none' }))}
                          className="text-primary-600 dark:text-primary-400 focus:ring-primary-500 border-slate-300 dark:border-dk-border-strong dark:bg-dk-bg"
                        />
                        <span>{t('forms.editorPage.payment.momoQrModeNone')}</span>
                      </label>
                    </div>
                  </div>

                  {payment.momoQrMode === 'account' && (
                    <div className="space-y-3 p-3 bg-white dark:bg-dk-raised/60 rounded-xl border border-gray-200 dark:border-dk-border">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                          {t('forms.editorPage.payment.momoQrAccountLabel')}
                        </label>
                        <input
                          type="text"
                          disabled={isEmployee}
                          value={payment.momoQrAccount || ''}
                          onChange={(e) => {
                            const cleanVal = e.target.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
                            setPayment((prev) => ({ ...prev, momoQrAccount: cleanVal }));
                          }}
                          placeholder={t('forms.editorPage.payment.momoQrAccountPlaceholder')}
                          className={`w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border text-sm font-mono text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 disabled:bg-gray-50 dark:disabled:bg-dk-raised disabled:text-gray-500 dark:disabled:text-dk-muted ${
                            errors.paymentMomoQrAccount
                              ? 'border-red-300 dark:border-red-800 focus:ring-red-200 dark:focus:ring-red-950/40'
                              : 'border-gray-300 dark:border-dk-border focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40'
                          }`}
                        />
                        <p className="text-[11px] text-gray-500 dark:text-dk-text2 mt-1">
                          {t('forms.editorPage.payment.momoQrAccountHint')}
                        </p>
                        {errors.paymentMomoQrAccount && (
                          <p className="text-xs text-red-600 dark:text-red-400 mt-1">{errors.paymentMomoQrAccount}</p>
                        )}
                      </div>

                      <div>
                        <input
                          ref={momoQrFileInputRef}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={isEmployee || isDecodingMomoQr}
                          onChange={handleUploadMomoQr}
                        />
                        <button
                          type="button"
                          disabled={isEmployee || isDecodingMomoQr}
                          onClick={() => momoQrFileInputRef.current?.click()}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-raised hover:bg-gray-50 dark:hover:bg-dk-strong text-xs font-medium text-gray-700 dark:text-dk-text shadow-sm transition-colors disabled:opacity-50"
                        >
                          <HiOutlineQrcode className="w-4 h-4 text-gray-500 dark:text-dk-text2" />
                          {isDecodingMomoQr
                            ? t('forms.editorPage.payment.momoQrDecoding')
                            : t('forms.editorPage.payment.momoQrAutoFillBtn')}
                        </button>
                      </div>
                    </div>
                  )}

                  {momoPreviewQrDataUrl && (
                    <div className="p-3 bg-white dark:bg-dk-raised/60 rounded-xl border border-gray-200 dark:border-dk-border text-center space-y-2">
                      <p className="text-xs font-semibold text-gray-700 dark:text-dk-text">
                        {t('forms.editorPage.payment.momoPreviewQrTitle')}
                      </p>
                      <img
                        src={momoPreviewQrDataUrl}
                        alt="QR MoMo Preview"
                        data-testid="momo-preview-qr"
                        className="w-36 h-36 mx-auto rounded-lg border border-gray-100 dark:border-slate-700 bg-white dark:bg-white p-1" // dark-ngoai-le: khung QR code phải nền trắng cố ý
                      />
                      <p className="text-[11px] text-gray-600 dark:text-dk-text2 leading-relaxed">
                        {t('forms.editorPage.payment.momoPreviewQrInstruction', {
                          name: (payment.momoName || '').trim().toUpperCase(),
                        })}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        ) : (
          <AddSectionCard
            id="section-payment"
            icon={HiOutlineCreditCard}
            title={t('forms.editorPage.addBlock.payment')}
            hint={t('forms.editorPage.payment.enableHelp')}
            onOpen={() => openBlock('payment')}
          />
        )}

        {/* Khối 6: Giao diện (PR-4b) — thẻ thu gọn "Giao diện" cho tới khi đã tuỳ chỉnh / người dùng bấm mở */}
        {openBlocks.theme ? (
        <div id="section-theme" className="bg-white dark:bg-dk-raised rounded-2xl shadow-sm border border-slate-200/90 dark:border-dk-border hover:border-slate-300 dark:hover:border-dk-border hover:shadow-md p-6 sm:p-7 space-y-6 transition-all duration-200 relative overflow-hidden group">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 to-pink-600" />
          <div className="flex items-center gap-3 pb-3 border-b border-slate-100 dark:border-dk-border">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-md shadow-rose-500/25 flex items-center justify-center shrink-0">
              <HiOutlineColorSwatch className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 dark:text-dk-text">
                  {t('forms.editorPage.theme.title')}
                </h2>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200/80 dark:border-rose-900/60">
                  {t('forms.editorPage.badges.theme')}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-dk-text2 mt-0.5">
                {t('forms.editorPage.theme.subtitle')}
              </p>
            </div>
          </div>

          {/* Mẫu dựng sẵn */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-2">
              {t('forms.editorPage.theme.presetLabel')}
            </label>
            <div className="flex flex-wrap gap-2">
              {FORM_THEME_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleSelectThemePreset(preset.id)}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
                    theme.preset === preset.id
                      ? 'border-primary-500 ring-2 ring-primary-100 dark:ring-primary-950/40 text-gray-900 dark:text-dk-text bg-orange-50/50 dark:bg-orange-950/30'
                      : 'border-gray-300 dark:border-dk-border text-gray-700 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-raised'
                  }`}
                >
                  <span
                    className="w-4 h-4 rounded-full border border-black/10 shrink-0"
                    style={{ backgroundColor: preset.primaryColor }}
                  />
                  {t(`forms.editorPage.theme.presets.${preset.id}`)}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                {t('forms.editorPage.theme.primaryColorLabel')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={HEX_COLOR_RE.test(theme.primaryColor) ? theme.primaryColor : '#df5c0e'}
                  onChange={(e) => handleThemeColorChange('primaryColor', e.target.value)}
                  className="h-9 w-11 rounded-lg border border-gray-300 dark:border-dk-border cursor-pointer shrink-0"
                  aria-label={t('forms.editorPage.theme.primaryColorLabel')}
                />
                <input
                  type="text"
                  value={theme.primaryColor}
                  onChange={(e) => handleThemeColorChange('primaryColor', e.target.value)}
                  placeholder="#DF5C0E"
                  maxLength={7}
                  className="w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border border-gray-300 dark:border-dk-border text-sm font-mono text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                {t('forms.editorPage.theme.backgroundColorLabel')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={HEX_COLOR_RE.test(theme.backgroundColor) ? theme.backgroundColor : '#f9fafb'}
                  onChange={(e) => handleThemeColorChange('backgroundColor', e.target.value)}
                  className="h-9 w-11 rounded-lg border border-gray-300 dark:border-dk-border cursor-pointer shrink-0"
                  aria-label={t('forms.editorPage.theme.backgroundColorLabel')}
                />
                <input
                  type="text"
                  value={theme.backgroundColor}
                  onChange={(e) => handleThemeColorChange('backgroundColor', e.target.value)}
                  placeholder="#F9FAFB"
                  maxLength={7}
                  className="w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border border-gray-300 dark:border-dk-border text-sm font-mono text-slate-900 dark:text-dk-text placeholder:text-slate-400 dark:placeholder:text-dk-muted focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                {t('forms.editorPage.theme.fontLabel')}
              </label>
              <select
                value={theme.fontFamily}
                onChange={(e) => handleThemeFontChange(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border border-gray-300 dark:border-dk-border text-sm text-slate-900 dark:text-dk-text focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40"
              >
                <option value="">{t('forms.editorPage.theme.fontDefault')}</option>
                {ALLOWED_FORM_FONTS.map((font) => (
                  <option key={font} value={font}>
                    {font}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                {t('forms.editorPage.theme.layoutLabel')}
              </label>
              <select
                value={theme.layout}
                onChange={(e) => handleThemeLayoutChange(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border border-gray-300 dark:border-dk-border text-sm text-slate-900 dark:text-dk-text focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40"
              >
                <option value="">{t('forms.editorPage.theme.layoutDefault')}</option>
                {ALLOWED_FORM_LAYOUTS.map((l) => (
                  <option key={l} value={l}>
                    {t(`forms.editorPage.theme.layout.${l}`)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                {t('forms.editorPage.theme.bannerHeightLabel')}
              </label>
              <select
                value={theme.bannerHeight}
                onChange={(e) => handleThemeBannerHeightChange(e.target.value)}
                className="w-full px-3 py-2 bg-white dark:bg-dk-bg rounded-xl border border-gray-300 dark:border-dk-border text-sm text-slate-900 dark:text-dk-text focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100 dark:focus:ring-primary-950/40"
              >
                <option value="">{t('forms.editorPage.theme.bannerHeightDefault')}</option>
                {ALLOWED_FORM_BANNER_HEIGHTS.map((h) => (
                  <option key={h} value={h}>
                    {t(`forms.editorPage.theme.bannerHeight.${h}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Banner + Logo */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                {t('forms.editorPage.theme.bannerLabel')}
              </label>
              {theme.bannerUrl ? (
                <img
                  src={theme.bannerUrl}
                  alt=""
                  className="w-full h-24 object-cover rounded-xl border border-gray-200 dark:border-dk-border mb-2"
                />
              ) : (
                <div className="w-full h-24 rounded-xl border border-dashed border-gray-300 dark:border-dk-border bg-gray-50 dark:bg-dk-raised/40 mb-2" />
              )}
              <input
                ref={bannerInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  handleUploadThemeImage('banner', file);
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isUploadingBanner}
                  onClick={() => bannerInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dk-border text-xs font-medium text-gray-700 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-raised disabled:opacity-50"
                >
                  {isUploadingBanner ? t('forms.editorPage.theme.uploading') : t('forms.editorPage.theme.uploadButton')}
                </button>
                {theme.bannerUrl && (
                  <button
                    type="button"
                    onClick={() => handleRemoveThemeImage('banner')}
                    className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    {t('forms.editorPage.theme.removeImage')}
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-1">
                {t('forms.editorPage.theme.logoLabel')}
              </label>
              {theme.logoUrl ? (
                <img
                  src={theme.logoUrl}
                  alt=""
                  className="h-24 max-w-full object-contain rounded-xl border border-gray-200 dark:border-dk-border mb-2 bg-white dark:bg-dk-bg"
                />
              ) : (
                <div className="w-full h-24 rounded-xl border border-dashed border-gray-300 dark:border-dk-border bg-gray-50 dark:bg-dk-raised/40 mb-2" />
              )}
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  handleUploadThemeImage('logo', file);
                }}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isUploadingLogo}
                  onClick={() => logoInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dk-border text-xs font-medium text-gray-700 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-raised disabled:opacity-50"
                >
                  {isUploadingLogo ? t('forms.editorPage.theme.uploading') : t('forms.editorPage.theme.uploadButton')}
                </button>
                {theme.logoUrl && (
                  <button
                    type="button"
                    onClick={() => handleRemoveThemeImage('logo')}
                    className="px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/60 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40"
                  >
                    {t('forms.editorPage.theme.removeImage')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Xem trước */}
          <div>
            <label className="block text-xs font-medium text-gray-700 dark:text-dk-text mb-2">
              {t('forms.editorPage.theme.previewLabel')}
            </label>
            <div
              className="rounded-xl border border-gray-200 dark:border-dk-border p-4 sm:p-6 flex justify-center overflow-x-hidden box-border"
              style={HEX_COLOR_RE.test(theme.backgroundColor) ? { backgroundColor: theme.backgroundColor } : undefined}
            >
              <FormRenderer form={previewForm} onSubmit={() => {}} previewMode />
            </div>
          </div>
        </div>
        ) : (
          <AddSectionCard
            id="section-theme"
            icon={HiOutlineColorSwatch}
            title={t('forms.editorPage.theme.title')}
            hint={t('forms.editorPage.theme.subtitle')}
            onOpen={() => openBlock('theme')}
          />
        )}
      </div>

      {/* Modal chia sẻ (PR-1) */}
      {isEditMode && (
        <ShareModal
          form={{
            id,
            publicKey,
            title,
            isPublished,
          }}
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          onPublish={handleTogglePublish}
        />
      )}
    </div>
  );
}
