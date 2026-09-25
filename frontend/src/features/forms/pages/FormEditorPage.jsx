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
  HiOutlineCheckCircle,
  HiOutlineQrcode,
} from 'react-icons/hi';
import { decodeQrFromImageFile, parseAndValidateMoMoQr } from '../../../utils/vietqrParser';
import { useI18n } from '../../../i18n';
import { useAuthStore } from '../../../stores/authStore';
import { PAYOS_BANK_BIN_MAP } from '../../../utils/payosBankBinMap';
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
  method: 'bank',
  amount: '', // chuỗi CHỈ CHỮ SỐ (không dấu chấm) — format hiển thị ở input riêng
  bankBin: '',
  accountNumber: '',
  accountName: '',
  momoPhone: '',
  momoName: '',
  momoQrBin: '',
  momoQrAccount: '',
  momoQrRefLabel: '',
  holdMinutes: DEFAULT_HOLD_MINUTES,
};

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
  const [theme, setTheme] = useState(DEFAULT_THEME);
  const [isUploadingBanner, setIsUploadingBanner] = useState(false);
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [errors, setErrors] = useState({});
  const { usage: storageQuota } = useStorageQuota();
  const bannerInputRef = useRef(null);
  const logoInputRef = useRef(null);
  const [isDecodingMomoQr, setIsDecodingMomoQr] = useState(false);
  const momoQrFileInputRef = useRef(null);

  useEffect(() => {
    if (!isEditMode) {
      // Form mới mặc định cho sẵn 1 trường Họ tên
      setFields([
        {
          key: '',
          label: t('forms.editorPage.defaultFieldName'),
          type: 'short_text',
          required: true,
          role: 'name',
          options: [],
        },
      ]);
      return;
    }

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
          setPayment({
            enabled: true,
            method: data.paymentConfig.method || 'bank',
            amount: data.paymentConfig.amount != null ? String(data.paymentConfig.amount) : '',
            bankBin: data.paymentConfig.bankBin || '',
            accountNumber: data.paymentConfig.accountNumber || '',
            accountName: data.paymentConfig.accountName || '',
            momoPhone: data.paymentConfig.momoPhone || '',
            momoName: data.paymentConfig.momoName || '',
            momoQrBin: data.paymentConfig.momoQrBin || '',
            momoQrAccount: data.paymentConfig.momoQrAccount || '',
            momoQrRefLabel: data.paymentConfig.momoQrRefLabel || '',
            holdMinutes: data.paymentConfig.holdMinutes ?? DEFAULT_HOLD_MINUTES,
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
      })
      .catch((err) => {
        toast.error(err.response?.data?.message || t('forms.editorPage.loadError'));
        navigate('/app/forms');
      })
      .finally(() => setIsLoading(false));
  }, [id, isEditMode, navigate, t]);

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
      setPayment((prev) => ({
        ...prev,
        momoQrBin: qrRes.momoQrBin,
        momoQrAccount: qrRes.momoQrAccount,
        momoQrRefLabel: qrRes.momoQrRefLabel || '',
      }));
      toast.success(t('forms.editorPage.payment.momoQrSuccess'));
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
      const amountNum = Number(payment.amount);
      if (!Number.isInteger(amountNum) || amountNum < MIN_PAYMENT_AMOUNT || amountNum > MAX_PAYMENT_AMOUNT) {
        errs.paymentAmount = t('forms.editorPage.payment.amountInvalid');
      }
      if (payment.method === 'momo') {
        if (!/^0[35789]\d{8}$/.test((payment.momoPhone || '').trim())) {
          errs.paymentMomoPhone = t('forms.editorPage.payment.momoPhoneInvalid');
        }
        if (!payment.momoName || !payment.momoName.trim()) {
          errs.paymentMomoName = t('forms.editorPage.payment.momoNameRequired');
        }
      } else {
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

      // PR-3b mục 1: payload LUÔN gửi paymentConfig cho chủ tài khoản (đủ khoá khi bật, null khi
      // tắt) — nhân viên KHÔNG được gửi khoá này dù giá trị gì (backend chặn 403
      // PAYMENT_CONFIG_OWNER_ONLY chỉ cần THẤY khoá `paymentConfig` trong body, không xét giá
      // trị), nên bỏ hẳn khoá này khỏi payload thay vì gửi null.
      if (!isEmployee) {
        if (!payment.enabled) {
          payload.paymentConfig = null;
        } else if (payment.method === 'momo') {
          payload.paymentConfig = {
            enabled: true,
            method: 'momo',
            amount: Number(payment.amount),
            momoPhone: (payment.momoPhone || '').trim(),
            momoName: (payment.momoName || '').trim(),
            holdMinutes: Number(payment.holdMinutes),
          };
          if (payment.momoQrBin && payment.momoQrAccount) {
            payload.paymentConfig.momoQrBin = payment.momoQrBin.trim();
            payload.paymentConfig.momoQrAccount = payment.momoQrAccount.trim();
            if (payment.momoQrRefLabel) {
              payload.paymentConfig.momoQrRefLabel = payment.momoQrRefLabel.trim();
            }
          }
        } else {
          payload.paymentConfig = {
            enabled: true,
            method: 'bank',
            amount: Number(payment.amount),
            bankBin: payment.bankBin,
            accountNumber: (payment.accountNumber || '').trim(),
            accountName: (payment.accountName || '').trim(),
            holdMinutes: Number(payment.holdMinutes),
          };
        }
      }

      if (isEditMode) {
        await updateForm(id, payload);
        if (andPublish) {
          await publishForm(id, true);
          setIsPublished(true);
        }
        toast.success(t('forms.saveSuccess'));
        setInitialBookingHadConfig(Boolean(payloadBooking));
        setConfirmDisableBooking(false);
        return id;
      } else {
        const created = await createForm(payload);
        if (andPublish) {
          await publishForm(created.id, true);
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
      <div className="p-12 text-center text-gray-500">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-primary-600 mb-3" />
        <p className="text-sm">{t('forms.editorPage.loading')}</p>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto overflow-x-hidden box-border">
      {/* Thanh thao tác dính (PR-1) */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-sm -mx-4 -mt-4 sm:-mx-6 sm:-mt-6 lg:-mx-8 lg:-mt-8 px-4 sm:px-6 lg:px-8 py-4 mb-6 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/app/forms')}
            className="p-2 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors"
            title={t('forms.submissionsPage.backToForms')}
          >
            <HiOutlineArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                {isEditMode ? t('forms.editForm') : t('forms.createNew')}
              </h1>
              {isEditMode && (
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    isPublished
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-gray-100 text-gray-600 border border-gray-200'
                  }`}
                >
                  {isPublished ? t('forms.isPublished') : t('forms.isDraft')}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
              {isEditMode ? t('forms.editorPage.editSubtitle') : t('forms.editorPage.createSubtitle')}
            </p>
          </div>
        </div>

        {/* Cụm thao tác: Lưu -> Công khai / Ẩn -> Chia sẻ -> Bài nộp (N) */}
        <div className="flex flex-wrap items-center gap-2 self-end sm:self-auto">
          {/* Nút 1: Lưu */}
          <button
            type="button"
            onClick={() => handleSave()}
            disabled={isSaving || isTogglingPublish}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 active:scale-[0.99] text-white text-sm font-medium rounded-xl shadow-sm transition-all disabled:opacity-50"
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
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-xl border transition-all disabled:opacity-50 ${
              isPublished
                ? 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                : 'border-green-600 text-green-700 bg-green-50 hover:bg-green-100'
            }`}
          >
            {isPublished ? (
              <>
                <HiOutlineEyeOff className="w-4 h-4 text-gray-500" />
                <span>{t('forms.unpublish')}</span>
              </>
            ) : (
              <>
                <HiOutlineEye className="w-4 h-4 text-green-600" />
                <span>{t('forms.publish')}</span>
              </>
            )}
          </button>

          {/* Nút 3: Chia sẻ */}
          <button
            type="button"
            onClick={() => setIsShareModalOpen(true)}
            disabled={!isEditMode}
            title={!isEditMode ? t('forms.editorPage.saveFirstTooltip') : undefined}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-xl border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <HiOutlineShare className="w-4 h-4 text-gray-500" />
            <span>{t('forms.share')}</span>
          </button>

          {/* Nút 4: Bài nộp (N) */}
          <button
            type="button"
            onClick={() => navigate(`/app/forms/${id}/submissions`)}
            disabled={!isEditMode}
            title={!isEditMode ? t('forms.editorPage.saveFirstTooltip') : undefined}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-xl border border-gray-200 text-gray-700 bg-white hover:bg-gray-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <HiOutlineInbox className="w-4 h-4 text-gray-500" />
            <span>
              {submissionCount !== null && submissionCount !== undefined
                ? `${t('forms.editorPage.submissions')} (${submissionCount})`
                : t('forms.editorPage.submissions')}
            </span>
          </button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Khối 1: Thông tin chung */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 space-y-4">
          <h2 className="text-base font-semibold text-gray-900">{t('forms.editorPage.generalInfo')}</h2>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('forms.formTitle')} <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('forms.editorPage.titlePlaceholder')}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 ${
                errors.title
                  ? 'border-red-300 focus:ring-red-200'
                  : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
              }`}
            />
            {errors.title && <p className="text-xs text-red-600 mt-1">{errors.title}</p>}
            <p className="text-xs text-gray-400 mt-1 text-right">{title.length}/200</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('forms.formDescription')}
            </label>
            <textarea
              rows={3}
              maxLength={5000}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('forms.editorPage.descPlaceholder')}
              className={`w-full px-3.5 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 resize-y ${
                errors.description
                  ? 'border-red-300 focus:ring-red-200'
                  : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
              }`}
            />
            {errors.description && (
              <p className="text-xs text-red-600 mt-1">{errors.description}</p>
            )}
            <p className="text-xs text-gray-400 mt-1 text-right">{description.length}/5000</p>
          </div>
        </div>

        {/* Khối 2: Danh sách trường */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-gray-900">{t('forms.fields')}</h2>
              <p className="text-xs text-gray-500">{t('forms.editorPage.maxFieldsHelp')}</p>
            </div>
            <button
              type="button"
              onClick={handleAddField}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-primary-50 text-primary-700 hover:bg-primary-100 rounded-xl text-xs font-medium transition-colors"
            >
              <HiOutlinePlus className="w-4 h-4" />
              {t('forms.addField')}
            </button>
          </div>

          {errors.fields && (
            <p className="text-xs text-red-600 p-3 bg-red-50 rounded-xl">{errors.fields}</p>
          )}

          <div className="space-y-4">
            {fields.map((field, idx) => {
              const hasOptions = ['select', 'radio', 'checkbox'].includes(field.type);
              const labelError = errors[`field_${idx}_label`];
              const optionsError = errors[`field_${idx}_options`];

              return (
                <div
                  key={field.key || idx}
                  className="p-4 rounded-xl border border-gray-200/90 bg-gray-50/50 space-y-4 relative"
                >
                  <div className="flex items-center justify-between border-b border-gray-200 pb-3">
                    <span className="text-xs font-semibold uppercase text-gray-500">
                      {t('forms.editorPage.fieldIndex', { index: idx + 1 })}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveField(idx, -1)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded"
                        title={t('forms.editorPage.moveUp')}
                      >
                        <HiOutlineArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === fields.length - 1}
                        onClick={() => handleMoveField(idx, 1)}
                        className="p-1.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 rounded"
                        title={t('forms.editorPage.moveDown')}
                      >
                        <HiOutlineArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveField(idx)}
                        className="p-1.5 text-red-400 hover:text-red-600 rounded"
                        title={t('forms.editorPage.removeField')}
                      >
                        <HiOutlineTrash className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Nhãn trường */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {t('forms.fieldLabel')} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        maxLength={200}
                        value={field.label}
                        onChange={(e) => handleUpdateField(idx, 'label', e.target.value)}
                        placeholder={t('forms.editorPage.fieldLabelPlaceholder')}
                        className={`w-full px-3 py-2 bg-white rounded-xl border text-sm focus:outline-none focus:ring-2 ${
                          labelError
                            ? 'border-red-300 focus:ring-red-200'
                            : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                        }`}
                      />
                      {labelError && <p className="text-xs text-red-600 mt-1">{labelError}</p>}
                    </div>

                    {/* Kiểu dữ liệu */}
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {t('forms.fieldType')}
                      </label>
                      <select
                        value={field.type}
                        onChange={(e) => handleUpdateField(idx, 'type', e.target.value)}
                        className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100"
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
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {t('forms.role')}
                      </label>
                      <select
                        value={field.role || ''}
                        onChange={(e) => handleUpdateField(idx, 'role', e.target.value)}
                        className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100"
                      >
                        <option value="">{t('forms.roleNone')}</option>
                        <option value="name">{t('forms.roleName')}</option>
                        <option value="email">{t('forms.roleEmail')}</option>
                        <option value="phone">{t('forms.rolePhone')}</option>
                      </select>
                    </div>

                    {/* Bắt buộc check */}
                    <div className="flex items-center pt-5">
                      <label className="flex items-center gap-2 cursor-pointer select-none text-sm text-gray-700">
                        <input
                          type="checkbox"
                          checked={field.required}
                          onChange={(e) => handleUpdateField(idx, 'required', e.target.checked)}
                          className="h-4 w-4 rounded text-primary-600 focus:ring-primary-500 border-gray-300"
                        />
                        <span>{t('forms.required')}</span>
                      </label>
                    </div>
                  </div>

                  {/* Danh sách lựa chọn options (nếu là select, radio, checkbox) */}
                  {hasOptions && (
                    <div className="pt-2 border-t border-gray-200/60 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-medium text-gray-700">
                          {t('forms.options')}
                        </label>
                        <button
                          type="button"
                          onClick={() => handleAddOption(idx)}
                          className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                        >
                          + {t('forms.addOption')}
                        </button>
                      </div>

                      {optionsError && (
                        <p className="text-xs text-red-600">{optionsError}</p>
                      )}

                      <div className="space-y-2">
                        {field.options.map((opt, optIdx) => (
                          <div key={optIdx} className="flex items-center gap-2">
                            <input
                              type="text"
                              maxLength={100}
                              value={opt}
                              onChange={(e) => handleUpdateOption(idx, optIdx, e.target.value)}
                              placeholder={t('forms.optionPlaceholder')}
                              className="w-full px-3 py-1.5 bg-white rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveOption(idx, optIdx)}
                              className="p-1.5 text-gray-400 hover:text-red-500 rounded"
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

        {/* Khối 3: Cài đặt nâng cao */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-900">{t('forms.settings')}</h2>

          <div className="space-y-4 divide-y divide-gray-100">
            {/* notifyOwner */}
            <div className="flex items-start justify-between gap-4 pt-4 first:pt-0">
              <div>
                <div className="text-sm font-medium text-gray-800">
                  {t('forms.notifyOwner')}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('forms.editorPage.notifyOwnerHelp')}
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.notifyOwner}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, notifyOwner: e.target.checked }))
                }
                className="mt-1 h-4 w-4 rounded text-primary-600 focus:ring-primary-500 border-gray-300"
              />
            </div>

            {/* consentEnabled */}
            <div className="flex items-start justify-between gap-4 pt-4">
              <div>
                <div className="text-sm font-medium text-gray-800">
                  {t('forms.consentEnabled')}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('forms.editorPage.consentEnabledHelp')}
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.consentEnabled}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, consentEnabled: e.target.checked }))
                }
                className="mt-1 h-4 w-4 rounded text-primary-600 focus:ring-primary-500 border-gray-300"
              />
            </div>

            {/* sendConfirmation */}
            <div className="flex items-start justify-between gap-4 pt-4">
              <div>
                <div className="text-sm font-medium text-gray-800">
                  {t('forms.sendConfirmation')}
                </div>
                <p className="text-xs text-gray-500 mt-0.5">
                  {t('forms.editorPage.sendConfirmationHelp')}
                </p>
              </div>
              <input
                type="checkbox"
                checked={settings.sendConfirmation}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, sendConfirmation: e.target.checked }))
                }
                className="mt-1 h-4 w-4 rounded text-primary-600 focus:ring-primary-500 border-gray-300"
              />
            </div>

            {/* submitButtonText */}
            <div className="pt-4 space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                {t('forms.submitButtonText')}
              </label>
              <input
                type="text"
                maxLength={50}
                value={settings.submitButtonText}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, submitButtonText: e.target.value }))
                }
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
              />
            </div>

            {/* successMessage */}
            <div className="pt-4 space-y-1">
              <label className="block text-sm font-medium text-gray-700">
                {t('forms.successMessage')}
              </label>
              <textarea
                rows={2}
                maxLength={500}
                value={settings.successMessage}
                onChange={(e) =>
                  setSettings((prev) => ({ ...prev, successMessage: e.target.value }))
                }
                className="w-full px-3.5 py-2 rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-500"
              />
            </div>

            {/* redirectUrl */}
            <div className="pt-4 space-y-1">
              <label className="block text-sm font-medium text-gray-700">
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
                className={`w-full px-3.5 py-2 rounded-xl border text-sm focus:outline-none focus:ring-2 ${
                  errors.redirectUrl
                    ? 'border-red-300 focus:ring-red-200'
                    : 'border-gray-300 focus:ring-primary-100 focus:border-primary-500'
                }`}
              />
              {errors.redirectUrl && (
                <p className="text-xs text-red-600 mt-1">{errors.redirectUrl}</p>
              )}
            </div>
          </div>
        </div>

        {/* Khối 4: Đặt lịch hẹn */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {t('forms.editorPage.booking.title')}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('forms.editorPage.booking.enableHelp')}
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
              <span className="text-sm font-medium text-gray-800">
                {t('forms.editorPage.booking.enableLabel')}
              </span>
              <input
                type="checkbox"
                checked={booking.enabled}
                onChange={(e) => handleToggleBookingEnabled(e.target.checked)}
                className="h-4 w-4 rounded text-primary-600 focus:ring-primary-500 border-gray-300"
              />
            </label>
          </div>

          {!booking.enabled && initialBookingHadConfig && (
            <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-2">
              <p className="font-medium">{t('forms.editorPage.booking.disableWarning')}</p>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmDisableBooking}
                  onChange={(e) => setConfirmDisableBooking(e.target.checked)}
                  className="h-4 w-4 rounded text-amber-600 focus:ring-amber-500 border-amber-300"
                />
                <span>{t('forms.editorPage.booking.disableConfirmCheckbox')}</span>
              </label>
              {errors.bookingDisableConfirm && (
                <p className="text-red-700 font-medium">{errors.bookingDisableConfirm}</p>
              )}
            </div>
          )}

          {booking.enabled && (
            <div className="space-y-5">
              {(fields.every((f) => f.role !== 'email') || !settings.sendConfirmation) && (
                <p className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs">
                  {t('forms.editorPage.booking.emailHint')}
                </p>
              )}

              {errors.bookingSlots && (
                <p className="text-xs text-red-600 p-3 bg-red-50 rounded-xl">{errors.bookingSlots}</p>
              )}

              {/* Khung giờ theo tuần */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    {t('forms.editorPage.booking.weeklySlotsLabel')}
                  </label>
                  <button
                    type="button"
                    onClick={handleApplyMondayToAll}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                  >
                    {t('forms.editorPage.booking.applyMondayToAll')}
                  </button>
                </div>
                <div className="space-y-2">
                  {WEEKDAY_UI_ORDER.map((day) => (
                    <div key={day.key} className="p-3 rounded-xl border border-gray-200 bg-gray-50/50">
                      <div className="text-xs font-semibold text-gray-700 mb-2">{t(day.labelKey)}</div>
                      <div className="flex flex-wrap items-center gap-2">
                        {(booking.weeklySlots[day.key] || []).map((time, idx) => (
                          <div key={idx} className="flex items-center gap-1">
                            <input
                              type="time"
                              value={time}
                              onChange={(e) => handleUpdateTimeSlot(day.key, idx, e.target.value)}
                              className="px-2 py-1.5 bg-white rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                            />
                            <button
                              type="button"
                              onClick={() => handleRemoveTimeSlot(day.key, idx)}
                              className="p-1 text-gray-400 hover:text-red-500 rounded"
                              title={t('forms.editorPage.booking.removeSlot')}
                            >
                              <HiOutlineTrash className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => handleAddTimeSlot(day.key)}
                          className="px-2.5 py-1.5 rounded-lg border border-dashed border-gray-300 text-xs text-primary-600 hover:bg-primary-50"
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
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('forms.editorPage.booking.capacityLabel')}
                  </label>
                  <input
                    type="number"
                    min={MIN_SLOT_CAPACITY}
                    max={MAX_SLOT_CAPACITY}
                    value={booking.slotCapacity}
                    onChange={(e) => setBooking((prev) => ({ ...prev, slotCapacity: e.target.value }))}
                    placeholder={t('forms.editorPage.booking.capacityPlaceholder')}
                    className={`w-full px-3 py-2 bg-white rounded-xl border text-sm focus:outline-none focus:ring-2 ${
                      errors.bookingCapacity
                        ? 'border-red-300 focus:ring-red-200'
                        : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                    }`}
                  />
                  {errors.bookingCapacity && (
                    <p className="text-xs text-red-600 mt-1">{errors.bookingCapacity}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('forms.editorPage.booking.daysAheadLabel')}
                  </label>
                  <input
                    type="number"
                    min={MIN_DAYS_AHEAD}
                    max={MAX_DAYS_AHEAD}
                    value={booking.daysAhead}
                    onChange={(e) => setBooking((prev) => ({ ...prev, daysAhead: e.target.value }))}
                    className={`w-full px-3 py-2 bg-white rounded-xl border text-sm focus:outline-none focus:ring-2 ${
                      errors.bookingDaysAhead
                        ? 'border-red-300 focus:ring-red-200'
                        : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                    }`}
                  />
                  {errors.bookingDaysAhead && (
                    <p className="text-xs text-red-600 mt-1">{errors.bookingDaysAhead}</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('forms.editorPage.booking.minNoticeLabel')}
                  </label>
                  <input
                    type="number"
                    min={MIN_NOTICE_MINUTES_MIN}
                    max={MIN_NOTICE_MINUTES_MAX}
                    value={booking.minNoticeMinutes}
                    onChange={(e) => setBooking((prev) => ({ ...prev, minNoticeMinutes: e.target.value }))}
                    className={`w-full px-3 py-2 bg-white rounded-xl border text-sm focus:outline-none focus:ring-2 ${
                      errors.bookingMinNotice
                        ? 'border-red-300 focus:ring-red-200'
                        : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                    }`}
                  />
                  {errors.bookingMinNotice && (
                    <p className="text-xs text-red-600 mt-1">{errors.bookingMinNotice}</p>
                  )}
                </div>
              </div>

              {/* Ngày nghỉ */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    {t('forms.editorPage.booking.closedDatesLabel')}
                  </label>
                  <button
                    type="button"
                    onClick={handleAddClosedDate}
                    className="text-xs text-primary-600 hover:text-primary-700 font-medium"
                  >
                    + {t('forms.editorPage.booking.addClosedDate')}
                  </button>
                </div>
                {errors.bookingClosedDates && (
                  <p className="text-xs text-red-600">{errors.bookingClosedDates}</p>
                )}
                <div className="space-y-2">
                  {booking.closedDates.map((d, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input
                        type="date"
                        value={d}
                        onChange={(e) => handleUpdateClosedDate(idx, e.target.value)}
                        className="px-3 py-1.5 bg-white rounded-lg border border-gray-300 text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveClosedDate(idx)}
                        className="p-1.5 text-gray-400 hover:text-red-500 rounded"
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

        {/* Khối 5: Thanh toán giữ chỗ */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {t('forms.editorPage.payment.title')}
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {t('forms.editorPage.payment.enableHelp')}
              </p>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none shrink-0">
              <span className="text-sm font-medium text-gray-800">
                {t('forms.editorPage.payment.enableLabel')}
              </span>
              <input
                type="checkbox"
                checked={payment.enabled}
                disabled={isEmployee}
                onChange={(e) => setPayment((prev) => ({ ...prev, enabled: e.target.checked }))}
                className="h-4 w-4 rounded text-primary-600 focus:ring-primary-500 border-gray-300 disabled:opacity-50"
              />
            </label>
          </div>

          {isEmployee && (
            <p className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              {t('forms.editorPage.payment.employeeReadOnlyNotice')}
            </p>
          )}

          {payment.enabled && (
            <div className="space-y-5">
              {!isEmployee && (
                <p className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-700 text-xs">
                  {t('forms.editorPage.payment.ownerWarning')}
                </p>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">
                  {t('forms.editorPage.payment.methodLabel')}
                </label>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="bank"
                      disabled={isEmployee}
                      checked={payment.method !== 'momo'}
                      onChange={() => setPayment((prev) => ({ ...prev, method: 'bank' }))}
                      className="text-primary-600 focus:ring-primary-500"
                    />
                    {t('forms.editorPage.payment.methodBank')}
                  </label>
                  <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                    <input
                      type="radio"
                      name="paymentMethod"
                      value="momo"
                      disabled={isEmployee}
                      checked={payment.method === 'momo'}
                      onChange={() => setPayment((prev) => ({ ...prev, method: 'momo' }))}
                      className="text-primary-600 focus:ring-primary-500"
                    />
                    {t('forms.editorPage.payment.methodMomo')}
                  </label>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
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
                    className={`w-full px-3 py-2 bg-white rounded-xl border text-sm focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500 ${
                      errors.paymentAmount
                        ? 'border-red-300 focus:ring-red-200'
                        : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                    }`}
                  />
                  {errors.paymentAmount && (
                    <p className="text-xs text-red-600 mt-1">{errors.paymentAmount}</p>
                  )}
                </div>

                {payment.method === 'momo' ? (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
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
                        placeholder="Vd: 0912345678"
                        className={`w-full px-3 py-2 bg-white rounded-xl border text-sm focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500 ${
                          errors.paymentMomoPhone
                            ? 'border-red-300 focus:ring-red-200'
                            : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                        }`}
                      />
                      {errors.paymentMomoPhone && (
                        <p className="text-xs text-red-600 mt-1">{errors.paymentMomoPhone}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {t('forms.editorPage.payment.momoNameLabel')}
                      </label>
                      <input
                        type="text"
                        disabled={isEmployee}
                        value={payment.momoName}
                        onChange={(e) => setPayment((prev) => ({ ...prev, momoName: e.target.value }))}
                        placeholder={t('forms.editorPage.payment.accountNamePlaceholder')}
                        className={`w-full px-3 py-2 bg-white rounded-xl border text-sm focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500 ${
                          errors.paymentMomoName
                            ? 'border-red-300 focus:ring-red-200'
                            : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                        }`}
                      />
                      <p className="text-[11px] text-gray-400 mt-1">
                        {t('forms.editorPage.payment.accountNameHint')}
                      </p>
                      {errors.paymentMomoName && (
                        <p className="text-xs text-red-600 mt-1">{errors.paymentMomoName}</p>
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
                      {payment.momoQrAccount ? (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <HiOutlineCheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                            <span className="text-xs font-medium text-emerald-800 truncate">
                              {t('forms.editorPage.payment.momoQrLoaded', {
                                account: payment.momoQrAccount.length > 4 ? `****${payment.momoQrAccount.slice(-4)}` : payment.momoQrAccount,
                              })}
                            </span>
                          </div>
                          {!isEmployee && (
                            <button
                              type="button"
                              onClick={() =>
                                setPayment((prev) => ({
                                  ...prev,
                                  momoQrBin: '',
                                  momoQrAccount: '',
                                  momoQrRefLabel: '',
                                }))
                              }
                              className="text-xs text-red-600 hover:text-red-700 underline font-medium ml-2 shrink-0"
                            >
                              {t('forms.editorPage.payment.momoQrRemoveBtn')}
                            </button>
                          )}
                        </div>
                      ) : (
                        <div>
                          <button
                            type="button"
                            disabled={isEmployee || isDecodingMomoQr}
                            onClick={() => momoQrFileInputRef.current?.click()}
                            className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-primary-300 bg-primary-50/50 hover:bg-primary-50 text-xs font-medium text-primary-700 transition-colors disabled:opacity-50"
                          >
                            <HiOutlineQrcode className="w-4 h-4 text-primary-600" />
                            {isDecodingMomoQr
                              ? t('forms.editorPage.payment.momoQrDecoding')
                              : t('forms.editorPage.payment.uploadMomoQrBtn')}
                          </button>
                          <p className="text-[11px] text-gray-400 mt-1">
                            {t('forms.editorPage.payment.momoQrHint')}
                          </p>
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {t('forms.editorPage.payment.bankLabel')}
                      </label>
                      <select
                        disabled={isEmployee}
                        value={payment.bankBin}
                        onChange={(e) => setPayment((prev) => ({ ...prev, bankBin: e.target.value }))}
                        className={`w-full px-3 py-2 bg-white rounded-xl border text-sm focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500 ${
                          errors.paymentBank
                            ? 'border-red-300 focus:ring-red-200'
                            : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                        }`}
                      >
                        <option value="">{t('forms.editorPage.payment.bankPlaceholder')}</option>
                        {Object.entries(PAYOS_BANK_BIN_MAP).map(([bin, info]) => (
                          <option key={bin} value={bin}>
                            {info.name} ({info.short})
                          </option>
                        ))}
                      </select>
                      {errors.paymentBank && (
                        <p className="text-xs text-red-600 mt-1">{errors.paymentBank}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
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
                        className={`w-full px-3 py-2 bg-white rounded-xl border text-sm focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500 ${
                          errors.paymentAccountNumber
                            ? 'border-red-300 focus:ring-red-200'
                            : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                        }`}
                      />
                      {errors.paymentAccountNumber && (
                        <p className="text-xs text-red-600 mt-1">{errors.paymentAccountNumber}</p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        {t('forms.editorPage.payment.accountNameLabel')}
                      </label>
                      <input
                        type="text"
                        disabled={isEmployee}
                        value={payment.accountName}
                        onChange={(e) => setPayment((prev) => ({ ...prev, accountName: e.target.value }))}
                        placeholder={t('forms.editorPage.payment.accountNamePlaceholder')}
                        className={`w-full px-3 py-2 bg-white rounded-xl border text-sm focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500 ${
                          errors.paymentAccountName
                            ? 'border-red-300 focus:ring-red-200'
                            : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                        }`}
                      />
                      <p className="text-[11px] text-gray-400 mt-1">
                        {t('forms.editorPage.payment.accountNameHint')}
                      </p>
                      {errors.paymentAccountName && (
                        <p className="text-xs text-red-600 mt-1">{errors.paymentAccountName}</p>
                      )}
                    </div>
                  </>
                )}

                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    {t('forms.editorPage.payment.holdMinutesLabel')}
                  </label>
                  <input
                    type="number"
                    min={MIN_HOLD_MINUTES}
                    max={MAX_HOLD_MINUTES}
                    disabled={isEmployee}
                    value={payment.holdMinutes}
                    onChange={(e) => setPayment((prev) => ({ ...prev, holdMinutes: e.target.value }))}
                    className={`w-full px-3 py-2 bg-white rounded-xl border text-sm focus:outline-none focus:ring-2 disabled:bg-gray-50 disabled:text-gray-500 ${
                      errors.paymentHoldMinutes
                        ? 'border-red-300 focus:ring-red-200'
                        : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                    }`}
                  />
                  {errors.paymentHoldMinutes && (
                    <p className="text-xs text-red-600 mt-1">{errors.paymentHoldMinutes}</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Khối 6: Giao diện (PR-4b) */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 sm:p-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {t('forms.editorPage.theme.title')}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {t('forms.editorPage.theme.subtitle')}
            </p>
          </div>

          {/* Mẫu dựng sẵn */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
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
                      ? 'border-primary-500 ring-2 ring-primary-100 text-gray-900'
                      : 'border-gray-300 text-gray-700 hover:bg-gray-50'
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
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {t('forms.editorPage.theme.primaryColorLabel')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={HEX_COLOR_RE.test(theme.primaryColor) ? theme.primaryColor : '#df5c0e'}
                  onChange={(e) => handleThemeColorChange('primaryColor', e.target.value)}
                  className="h-9 w-11 rounded-lg border border-gray-300 cursor-pointer shrink-0"
                  aria-label={t('forms.editorPage.theme.primaryColorLabel')}
                />
                <input
                  type="text"
                  value={theme.primaryColor}
                  onChange={(e) => handleThemeColorChange('primaryColor', e.target.value)}
                  placeholder="#DF5C0E"
                  maxLength={7}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {t('forms.editorPage.theme.backgroundColorLabel')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={HEX_COLOR_RE.test(theme.backgroundColor) ? theme.backgroundColor : '#f9fafb'}
                  onChange={(e) => handleThemeColorChange('backgroundColor', e.target.value)}
                  className="h-9 w-11 rounded-lg border border-gray-300 cursor-pointer shrink-0"
                  aria-label={t('forms.editorPage.theme.backgroundColorLabel')}
                />
                <input
                  type="text"
                  value={theme.backgroundColor}
                  onChange={(e) => handleThemeColorChange('backgroundColor', e.target.value)}
                  placeholder="#F9FAFB"
                  maxLength={7}
                  className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-sm font-mono focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {t('forms.editorPage.theme.fontLabel')}
              </label>
              <select
                value={theme.fontFamily}
                onChange={(e) => handleThemeFontChange(e.target.value)}
                className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100"
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
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {t('forms.editorPage.theme.layoutLabel')}
              </label>
              <select
                value={theme.layout}
                onChange={(e) => handleThemeLayoutChange(e.target.value)}
                className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100"
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
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {t('forms.editorPage.theme.bannerHeightLabel')}
              </label>
              <select
                value={theme.bannerHeight}
                onChange={(e) => handleThemeBannerHeightChange(e.target.value)}
                className="w-full px-3 py-2 bg-white rounded-xl border border-gray-300 text-sm focus:outline-none focus:ring-2 focus:border-primary-500 focus:ring-primary-100"
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
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {t('forms.editorPage.theme.bannerLabel')}
              </label>
              {theme.bannerUrl ? (
                <img
                  src={theme.bannerUrl}
                  alt=""
                  className="w-full h-24 object-cover rounded-xl border border-gray-200 mb-2"
                />
              ) : (
                <div className="w-full h-24 rounded-xl border border-dashed border-gray-300 bg-gray-50 mb-2" />
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
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {isUploadingBanner ? t('forms.editorPage.theme.uploading') : t('forms.editorPage.theme.uploadButton')}
                </button>
                {theme.bannerUrl && (
                  <button
                    type="button"
                    onClick={() => handleRemoveThemeImage('banner')}
                    className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    {t('forms.editorPage.theme.removeImage')}
                  </button>
                )}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                {t('forms.editorPage.theme.logoLabel')}
              </label>
              {theme.logoUrl ? (
                <img
                  src={theme.logoUrl}
                  alt=""
                  className="h-24 max-w-full object-contain rounded-xl border border-gray-200 mb-2 bg-white"
                />
              ) : (
                <div className="w-full h-24 rounded-xl border border-dashed border-gray-300 bg-gray-50 mb-2" />
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
                  className="px-3 py-1.5 rounded-lg border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {isUploadingLogo ? t('forms.editorPage.theme.uploading') : t('forms.editorPage.theme.uploadButton')}
                </button>
                {theme.logoUrl && (
                  <button
                    type="button"
                    onClick={() => handleRemoveThemeImage('logo')}
                    className="px-3 py-1.5 rounded-lg border border-red-200 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    {t('forms.editorPage.theme.removeImage')}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Xem trước */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-2">
              {t('forms.editorPage.theme.previewLabel')}
            </label>
            <div
              className="rounded-xl border border-gray-200 p-4 sm:p-6 flex justify-center overflow-x-hidden box-border"
              style={HEX_COLOR_RE.test(theme.backgroundColor) ? { backgroundColor: theme.backgroundColor } : undefined}
            >
              <FormRenderer form={previewForm} onSubmit={() => {}} previewMode />
            </div>
          </div>
        </div>
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
