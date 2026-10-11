import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import { useAuthStore } from '../../../stores/authStore';
import productApiService from '../../products/services/productApi.service';
import { PAYOS_BANK_BIN_MAP } from '../../../utils/payosBankBinMap';
import { resolvePaymentPurpose } from '../utils/paymentPurpose.util';
import { fetchFormById, createForm, updateForm, publishForm } from '../services/formAdminApi.service';
import ShareModal from '../components/ShareModal';
import FormTemplatePicker from '../components/FormTemplatePicker';
import { FORM_TEMPLATES, buildFormFromTemplate } from '../constants/formTemplates';
import { AdminEditorShell } from '../../../components/editor/AdminEditorShell';
import FormEditorTopbar from '../components/editor/FormEditorTopbar';
import FieldListPane from '../components/editor/FieldListPane';
import FormPreviewPane from '../components/editor/FormPreviewPane';
import FormSettingsModal from '../components/editor/FormSettingsModal';
import {
  DEFAULT_SETTINGS,
  DEFAULT_BOOKING,
  DEFAULT_WEEKLY_SLOTS,
  DEFAULT_PAYMENT,
  DEFAULT_THEME,
  DEFAULT_HOLD_MINUTES,
  WEEKDAY_KEYS,
  MIN_SLOT_CAPACITY,
  MAX_SLOT_CAPACITY,
  MIN_DAYS_AHEAD,
  MAX_DAYS_AHEAD,
  MIN_NOTICE_MINUTES_MIN,
  MIN_NOTICE_MINUTES_MAX,
  MAX_CLOSED_DATES,
  MIN_PAYMENT_AMOUNT,
  MAX_PAYMENT_AMOUNT,
  MIN_HOLD_MINUTES,
  MAX_HOLD_MINUTES,
  MAX_FIELDS,
  MAX_OPTIONS,
  MAX_PLACEHOLDER_LENGTH,
  MAX_HELP_TEXT_LENGTH,
  MAX_CONSENT_TEXT_LENGTH,
  OPTION_FIELD_TYPES,
  PLACEHOLDER_FIELD_TYPES,
  HEX_COLOR_RE,
  TAB_ERROR_KEYS,
  getSavedPaymentPreset,
  savePaymentPreset,
  hasThemeCustomization,
} from '../components/editor/formEditorConstants';

// Mã định danh phía trình duyệt cho từng trường (chọn / kéo-thả / key React) — KHÔNG bao giờ gửi lên server,
// payload chỉ dựng từ các khoá được liệt kê trong handleSave.
let fieldUidSeq = 0;
const nextFieldUid = () => {
  fieldUidSeq += 1;
  return `fld_${fieldUidSeq}`;
};
const makeField = (partial = {}) => ({
  uid: nextFieldUid(),
  key: '', // trường mới key rỗng để server tự sinh
  label: '',
  type: 'short_text',
  required: false,
  role: '',
  placeholder: '',
  helpText: '',
  options: [],
  ...partial,
});

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
  // Modal Cài đặt: null = đóng, ngược lại là khoá tab đang mở. `lastSettingsTab` để nút Cài đặt mở lại đúng tab vừa dùng.
  const [settingsTab, setSettingsTab] = useState(null);
  const [lastSettingsTab, setLastSettingsTab] = useState('general');
  const openSettingsTab = (tab) => {
    setLastSettingsTab(tab);
    setSettingsTab(tab);
  };
  // Mẫu vừa chọn bật sẵn Đặt lịch / Thanh toán → nhắc khai tiếp (thay cho việc tự mở khối ở trình soạn cũ).
  const [setupHints, setSetupHints] = useState({ booking: false, payment: false });
  const [previewDevice, setPreviewDevice] = useState('desktop');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const [publicKey, setPublicKey] = useState('');
  const [submissionCount, setSubmissionCount] = useState(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [isTogglingPublish, setIsTogglingPublish] = useState(false);
  const [fields, setFields] = useState([]);
  // Trường đang chọn để sửa (theo uid để không lệch khi đổi thứ tự / chèn / xoá). Không còn trường nào khớp thì rơi về trường đầu.
  const [selectedUid, setSelectedUid] = useState(null);
  const activeUid = fields.some((f) => f.uid === selectedUid) ? selectedUid : (fields[0]?.uid ?? null);
  const scrollTargetUidRef = useRef(null);
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
            ? data.fields.map((f) =>
                makeField({
                  key: f.key || '',
                  label: f.label || '',
                  type: f.type || 'short_text',
                  required: Boolean(f.required),
                  role: f.role || '',
                  placeholder: f.placeholder || '',
                  helpText: f.helpText || '',
                  options: Array.isArray(f.options)
                    ? f.options.map((opt) => (typeof opt === 'object' ? opt.label || opt.value : opt))
                    : [],
                })
              )
            : []
        );
        setSettings({
          notifyOwner: Boolean(data.settings?.notifyOwner ?? DEFAULT_SETTINGS.notifyOwner),
          consentEnabled: Boolean(data.settings?.consentEnabled ?? DEFAULT_SETTINGS.consentEnabled),
          sendConfirmation: Boolean(data.settings?.sendConfirmation ?? DEFAULT_SETTINGS.sendConfirmation),
          submitButtonText: data.settings?.submitButtonText || DEFAULT_SETTINGS.submitButtonText,
          successMessage: data.settings?.successMessage || DEFAULT_SETTINGS.successMessage,
          redirectUrl: data.settings?.redirectUrl || '',
          consentText: data.settings?.consentText || '',
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
    const builtFields = built.fields.map((f) => makeField(f));
    setFields(builtFields);
    setSelectedUid(builtFields[0]?.uid ?? null);
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
    // Mẫu bật tính năng nào thì nhắc khai tiếp (khung giờ / tài khoản nhận tiền) ngay đầu danh sách trường.
    setSetupHints({ booking: Boolean(built.bookingWeeklySlots), payment: Boolean(built.enablePayment) });
    setTemplateChosen(true);
  };

  // Chọn trường để sửa + cuộn hàng của nó vào tầm nhìn (sau khi danh sách dựng lại).
  const focusField = (uid) => {
    setSelectedUid(uid);
    scrollTargetUidRef.current = uid;
  };
  useEffect(() => {
    const uid = scrollTargetUidRef.current;
    if (!uid) return;
    scrollTargetUidRef.current = null;
    document.getElementById(`field-row-${uid}`)?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [fields]);

  // Thêm trường mới
  const handleAddField = () => {
    if (fields.length >= MAX_FIELDS) {
      toast.error(t('forms.editorPage.maxFields'));
      return;
    }
    const field = makeField({ label: t('forms.editorPage.newFieldLabel', { index: fields.length + 1 }) });
    setFields((prev) => [...prev, field]);
    focusField(field.uid);
  };

  // Thêm trường thông dụng 1-chạm từ thư viện mẫu
  const handleAddQuickField = (preset) => {
    if (fields.length >= MAX_FIELDS) {
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

    const field = makeField({
      label: localizedTitle,
      type: preset.type,
      required: Boolean(preset.required),
      role: preset.role || '',
      options: localizedOptions,
    });
    setFields((prev) => [...prev, field]);
    focusField(field.uid);
    toast.success(t('forms.editorPage.quickAdd.addedToast', { title: localizedTitle }));
  };

  // Xoá trường (đang chọn trường bị xoá thì chọn trường kế bên)
  const handleRemoveField = (idx) => {
    const removed = fields[idx];
    setFields((prev) => prev.filter((_, i) => i !== idx));
    if (removed && removed.uid === activeUid) {
      const neighbor = fields[idx + 1] || fields[idx - 1];
      setSelectedUid(neighbor ? neighbor.uid : null);
    }
  };

  // Nhân bản trường: chèn bản sao NGAY DƯỚI, key rỗng (server tự sinh), KHÔNG nhân bản vai trò
  // (mỗi vai trò name/email/phone chỉ gán cho tối đa 1 trường).
  const handleDuplicateField = (idx) => {
    if (fields.length >= MAX_FIELDS) {
      toast.error(t('forms.editorPage.maxFields'));
      return;
    }
    const source = fields[idx];
    if (!source) return;
    const copy = { ...source, uid: nextFieldUid(), key: '', role: '', options: [...(source.options || [])] };
    setFields((prev) => {
      const next = [...prev];
      next.splice(idx + 1, 0, copy);
      return next;
    });
    focusField(copy.uid);
  };

  // Di chuyển thứ tự trường (nút lên/xuống — bàn phím, cảm ứng)
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

  // Đổi thứ tự bằng kéo-thả: lấy trường ở `from` đặt vào vị trí `to`
  const handleReorderField = (from, to) => {
    if (from === to || from < 0 || to < 0) return;
    setFields((prev) => {
      if (from >= prev.length || to >= prev.length) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(from, 1);
      copy.splice(to, 0, moved);
      return copy;
    });
  };

  // Cập nhật thuộc tính trường
  const handleUpdateField = (idx, key, value) => {
    setFields((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [key]: value };

      // Nếu chuyển sang kiểu không có options thì clear options
      if (key === 'type' && !OPTION_FIELD_TYPES.includes(value)) {
        copy[idx].options = [];
      } else if (key === 'type' && OPTION_FIELD_TYPES.includes(value) && copy[idx].options.length === 0) {
        copy[idx].options = [t('forms.editorPage.defaultOption1'), t('forms.editorPage.defaultOption2')];
      }

      // Đổi role: kiểm tra trùng lặp
      if (key === 'role' && value) {
        for (let i = 0; i < copy.length; i++) {
          if (i !== idx && copy[i].role === value) {
            toast.error(t('forms.editorPage.roleDuplicate', { role: value }));
            copy[i] = { ...copy[i], role: '' };
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
      if (currentOpts.length >= MAX_OPTIONS) {
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

      if (OPTION_FIELD_TYPES.includes(f.type)) {
        if (!f.options || f.options.length === 0) {
          errs[`field_${i}_options`] = t('forms.editorPage.validationOptionsRequired');
        }
      }

      if (f.helpText && f.helpText.trim().length > MAX_HELP_TEXT_LENGTH) {
        errs[`field_${i}_helpText`] = t('forms.editorPage.validationHelpTextMax');
      }
      if (f.placeholder && f.placeholder.trim().length > MAX_PLACEHOLDER_LENGTH) {
        errs[`field_${i}_placeholder`] = t('forms.editorPage.validationPlaceholderMax');
      }
    }

    // Validate settings
    if (settings.submitButtonText && settings.submitButtonText.length > 50) {
      errs.submitButtonText = t('forms.editorPage.validationSubmitTextMax');
    }
    if (settings.successMessage && settings.successMessage.length > 500) {
      errs.successMessage = t('forms.editorPage.validationSuccessMsgMax');
    }
    if (settings.consentText && settings.consentText.trim().length > MAX_CONSENT_TEXT_LENGTH) {
      errs.consentText = t('forms.editorPage.validationConsentTextMax');
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

    // Validate đặt lịch hẹn (hợp đồng normalizeBookingConfig, xem hằng số ở formEditorConstants)
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

    // Validate thanh toán giữ chỗ (hợp đồng normalizePaymentConfig, hằng số ở formEditorConstants) — nhân
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
      // Có trường lỗi → chọn trường lỗi đầu tiên để thấy ngay ô cần sửa.
      const firstBadFieldIdx = fields.findIndex((_, i) =>
        Object.keys(validationErrors).some((k) => k.startsWith(`field_${i}_`))
      );
      if (firstBadFieldIdx >= 0) focusField(fields[firstBadFieldIdx].uid);
      // Chỉ lỗi nằm trong Cài đặt (không có lỗi tiêu đề / trường) → mở modal ở tab đầu tiên có ô lỗi.
      const hasNonSettingsError =
        Boolean(validationErrors.title || validationErrors.fields) || firstBadFieldIdx >= 0;
      if (!hasNonSettingsError) {
        const firstTab = Object.entries(TAB_ERROR_KEYS).find(([, keys]) => keys.some((k) => validationErrors[k]));
        if (firstTab) openSettingsTab(firstTab[0]);
      }
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
        // placeholder / helpText CHỈ gửi khi có chữ (trường cũ không có thì payload y như trước đây);
        // placeholder chỉ có nghĩa với loại có ô nhập chữ.
        if (PLACEHOLDER_FIELD_TYPES.includes(f.type) && f.placeholder && f.placeholder.trim()) {
          item.placeholder = f.placeholder.trim();
        }
        if (f.helpText && f.helpText.trim()) {
          item.helpText = f.helpText.trim();
        }
        if (OPTION_FIELD_TYPES.includes(f.type)) {
          item.options = f.options.map((opt) => String(opt).trim()).filter(Boolean);
        }
        return item;
      });

      // Luôn gửi đủ 6 khoá settings vì PUT ghi đè cả khối (+ consentText khi có chữ)
      const payloadSettings = {
        notifyOwner: Boolean(settings.notifyOwner),
        consentEnabled: Boolean(settings.consentEnabled),
        sendConfirmation: Boolean(settings.sendConfirmation),
        submitButtonText: settings.submitButtonText?.trim() || t('publicForm.defaultSubmit'),
        successMessage: settings.successMessage?.trim() || t('publicForm.defaultSuccess'),
        redirectUrl: settings.redirectUrl?.trim() || null,
        ...(settings.consentText?.trim() ? { consentText: settings.consentText.trim() } : {}),
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

  // Xem trước SỐNG (cột phải): FormRenderer previewMode dựng từ state nháp hiện tại, KHÔNG phải bản đã lưu — gồm cả ô đồng ý
  // (theo consentEnabled / consentText thật) và bộ chọn lịch (khi bật đặt lịch, ở dạng mẫu không gọi mạng). Key của trường
  // chưa có key dùng uid phía trình duyệt (ổn định khi gõ nhãn) thay vì nhãn.
  const previewForm = useMemo(
    () => ({
      title: title || t('forms.formTitle'),
      description,
      fields: fields.map((f) => ({
        key: f.key || f.uid,
        label: f.label,
        type: f.type,
        required: f.required,
        options: f.options,
        placeholder: f.placeholder,
        helpText: f.helpText,
      })),
      settings: {
        submitButtonText: settings.submitButtonText,
        successMessage: settings.successMessage,
        consentEnabled: settings.consentEnabled,
        consentText: settings.consentText,
      },
      booking: booking.enabled ? { enabled: true, daysAhead: Number(booking.daysAhead) || 30 } : null,
      theme: {
        primaryColor: HEX_COLOR_RE.test(theme.primaryColor) ? theme.primaryColor : undefined,
        fontFamily: theme.fontFamily || undefined,
        layout: theme.layout || undefined,
        bannerHeight: theme.bannerHeight || undefined,
        bannerUrl: theme.bannerUrl || undefined,
        logoUrl: theme.logoUrl || undefined,
      },
    }),
    [
      title,
      description,
      fields,
      settings.submitButtonText,
      settings.successMessage,
      settings.consentEnabled,
      settings.consentText,
      booking.enabled,
      booking.daysAhead,
      theme,
      t,
    ]
  );

  if (isLoading) {
    return (
      <div className="h-full overflow-auto">
        <div className="p-12 text-center text-gray-500 dark:text-dk-text2">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 dark:border-dk-border border-t-primary-600 mb-3" />
          <p className="text-sm">{t('forms.editorPage.loading')}</p>
        </div>
      </div>
    );
  }

  // Biểu mẫu MỚI bắt đầu bằng chọn mẫu; sửa biểu mẫu cũ thì không có bước này.
  if (!isEditMode && !templateChosen) {
    return (
      <div className="h-full overflow-auto p-2 md:p-3">
        <FormTemplatePicker
          onSelect={handleSelectTemplate}
          onBack={() => navigate('/app/forms')}
          isEmployee={isEmployee}
        />
      </div>
    );
  }

  // Tab nào đang có tính năng bật (chấm xanh) / có ô lỗi (chấm đỏ) trên modal Cài đặt.
  const tabOn = {
    booking: booking.enabled,
    payment: payment.enabled,
    theme: hasThemeCustomization(theme),
    product: productId !== '',
  };
  const tabError = Object.fromEntries(
    Object.entries(TAB_ERROR_KEYS).map(([tab, keys]) => [tab, keys.some((k) => errors[k])])
  );

  return (
    <>
      <AdminEditorShell
        topbar={
          <FormEditorTopbar
            isEditMode={isEditMode}
            title={title}
            onTitleChange={setTitle}
            titleError={errors.title}
            isPublished={isPublished}
            submissionCount={submissionCount}
            isSaving={isSaving}
            isTogglingPublish={isTogglingPublish}
            settingsOpen={Boolean(settingsTab)}
            onBack={() => navigate('/app/forms')}
            onOpenSettings={() => openSettingsTab(lastSettingsTab)}
            onShare={() => setIsShareModalOpen(true)}
            onOpenSubmissions={() => navigate(`/app/forms/${id}/submissions`)}
            onSave={() => handleSave()}
            onTogglePublish={handleTogglePublish}
          />
        }
      >
        {/* < lg: một cột dọc (danh sách trường rồi xem trước) và cả khối cuộn; ≥ lg: hai cột, mỗi cột tự cuộn nên xem trước đứng yên. */}
        <div className="h-full overflow-y-auto lg:overflow-hidden">
          <div className="grid grid-cols-1 lg:grid-cols-2 lg:h-full">
            <div className="min-w-0 lg:overflow-y-auto">
              <FieldListPane
                fields={fields}
                errors={errors}
                selectedUid={activeUid}
                setupHints={setupHints}
                onDismissSetupHints={() => setSetupHints({ booking: false, payment: false })}
                onOpenSettings={openSettingsTab}
                onSelect={setSelectedUid}
                onAddField={handleAddField}
                onAddQuickField={handleAddQuickField}
                onMoveField={handleMoveField}
                onReorderField={handleReorderField}
                onDuplicateField={handleDuplicateField}
                onRemoveField={handleRemoveField}
                onUpdateField={handleUpdateField}
                onAddOption={handleAddOption}
                onUpdateOption={handleUpdateOption}
                onRemoveOption={handleRemoveOption}
              />
            </div>
            <div className="min-w-0 lg:overflow-y-auto border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-dk-border bg-gray-100/70 dark:bg-dk-inset">
              <FormPreviewPane
                form={previewForm}
                backgroundColor={HEX_COLOR_RE.test(theme.backgroundColor) ? theme.backgroundColor : undefined}
                device={previewDevice}
                onDeviceChange={setPreviewDevice}
              />
            </div>
          </div>
        </div>
      </AdminEditorShell>

      <FormSettingsModal
        activeTab={settingsTab}
        onTabChange={openSettingsTab}
        onClose={() => setSettingsTab(null)}
        tabOn={tabOn}
        tabError={tabError}
        general={{ description, setDescription, errors }}
        afterSubmit={{ settings, setSettings, errors }}
        booking={{
          booking,
          setBooking,
          initialBookingHadConfig,
          confirmDisableBooking,
          setConfirmDisableBooking,
          errors,
          fields,
          settings,
        }}
        payment={{
          payment,
          setPayment,
          errors,
          isEmployee,
          hasSavedPreset,
          onApplySavedPreset: handleApplySavedPreset,
          selectedProductAmount,
        }}
        theme={{ theme, setTheme }}
        product={{
          productId,
          productOptions,
          selectedProduct,
          selectedProductAmount,
          onProductChange: handleProductChange,
          payment,
          setPayment,
          isEmployee,
        }}
      />

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
    </>
  );
}
