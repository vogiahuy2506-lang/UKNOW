import { useEffect, useState, useRef, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import { useAuthStore } from '../../../stores/authStore';
import productApiService from '../../products/services/productApi.service';
import { PAYOS_BANK_BIN_MAP } from '../../../utils/payosBankBinMap';
import { resolvePaymentPurpose } from '../utils/paymentPurpose.util';
import { isDisplayFieldType } from '../utils/formFieldTypes.util';
import { buildPreviewFormProduct } from '../utils/buildPreviewFormProduct.util';
import { fetchFormById, createForm, updateForm, publishForm, fetchFormCapabilities } from '../services/formAdminApi.service';
import {
  readFileConfig,
  makeDefaultFileConfig,
  MIN_FORM_FILE_MB,
  MAX_FORM_FILE_MB,
  MIN_FORM_FILE_COUNT,
  MAX_FORM_FILE_COUNT,
} from '../utils/formFileKinds.util';
import ShareModal from '../components/ShareModal';
import FormTemplatePicker from '../components/FormTemplatePicker';
import { FORM_TEMPLATES, buildFormFromTemplate } from '../constants/formTemplates';
import { AdminEditorShell } from '../../../components/editor/AdminEditorShell';
import FormEditorTopbar from '../components/editor/FormEditorTopbar';
import FieldListPane from '../components/editor/FieldListPane';
import FormPreviewPane from '../components/editor/FormPreviewPane';
import FormSettingsModal from '../components/editor/FormSettingsModal';
import FormAiTools from '../components/editor/FormAiTools';
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
  MAX_DISPLAY_BLOCKS,
  MAX_OPTIONS,
  MAX_PLACEHOLDER_LENGTH,
  MAX_HELP_TEXT_LENGTH,
  MAX_PARAGRAPH_LENGTH,
  MAX_CONSENT_TEXT_LENGTH,
  NO_ROLE_FIELD_TYPES,
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
const BYTES_PER_MB = 1024 * 1024;

// Trường `file`: trong state trình soạn dung lượng/số tệp giữ dạng CHUỖI (gõ dở "1." không bị ép lại); chuyển sang số ở payload.
// `fileConfig` chỉ có giá trị ở trường loại `file`, các loại khác luôn null.
const toEditorFileConfig = (raw) => {
  const cfg = readFileConfig(raw);
  return {
    kinds: cfg.kinds,
    maxMb: String(Number((cfg.maxBytes / BYTES_PER_MB).toFixed(2))),
    maxFiles: String(cfg.maxFiles),
  };
};
const toPayloadFileConfig = (editorCfg) => {
  const cfg = editorCfg || toEditorFileConfig(null);
  return {
    kinds: [...(cfg.kinds || [])],
    maxBytes: Math.round(Number(cfg.maxMb) * BYTES_PER_MB),
    maxFiles: Number(cfg.maxFiles),
  };
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
  width: 'full', // 'full' | 'half' (chỉ trường nhập); chỉ gửi lên server khi 'half'
  fileConfig: null, // chỉ trường `file`: { kinds, maxMb, maxFiles } (xem toEditorFileConfig)
  ...partial,
});

// Chữ nút gửi mặc định mà SERVER lưu khi chủ biểu mẫu để trống (backend normalizeFormSettings) — bản đã lưu luôn mang
// chuỗi tiếng Việt này dù giao diện đang tiếng Anh, nên chọn sản phẩm phải nhận ra nó là "chưa tự đặt chữ".
const SERVER_DEFAULT_SUBMIT_TEXT = 'Gửi thông tin';

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
  // PR-4b: backend có bật tính năng nhận tệp từ khách không (cờ FORM_FILE_UPLOAD_ENABLED). Tắt → ẩn loại "Tải tệp" khỏi menu.
  const [fileUploadsEnabled, setFileUploadsEnabled] = useState(false);
  // Trường đang chọn để sửa (theo uid để không lệch khi đổi thứ tự / chèn / xoá). Không còn trường nào khớp thì rơi về trường đầu.
  const [selectedUid, setSelectedUid] = useState(null);
  const activeUid = fields.some((f) => f.uid === selectedUid) ? selectedUid : (fields[0]?.uid ?? null);
  const scrollTargetUidRef = useRef(null);
  // Bản mới nhất của `fields` cho các lời gọi bất đồng bộ của nút AI (kết quả về sau vài chục giây, closure cũ đã lỗi thời).
  const fieldsRef = useRef(fields);
  fieldsRef.current = fields;
  // Hoàn tác 1 bước cho "AI viết lại câu chữ": chữ cũ của các trường vừa bị đổi, theo uid. null = không có gì để hoàn tác.
  const [rewriteUndo, setRewriteUndo] = useState(null);
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
    const nextProduct = productOptions.find((p) => String(p.id) === nextId);
    // Chọn sản phẩm có giá số, thanh toán đang bật mà ô số tiền trống → tự điền (không bao giờ đè số đã có).
    const amount = productPriceAmount(nextProduct);
    if (!isEmployee && payment.enabled && amount !== null) {
      setPayment((prev) => (prev.amount ? prev : { ...prev, amount: String(amount) }));
    }
    // Biểu mẫu gắn sản phẩm là biểu mẫu bán hàng: tiêu đề đang trống thì lấy tên sản phẩm; nút gửi còn là chữ mặc định
    // thì đổi thành "Đặt mua ngay". Không bao giờ đè chữ người dùng đã gõ (giống ô số tiền ở trên).
    if (nextProduct) {
      const productName = String(nextProduct.productName || '').trim();
      if (productName && !title.trim()) setTitle(productName);
      setSettings((prev) => {
        const current = String(prev.submitButtonText || '').trim();
        const isDefaultText = current === '' || current === t('publicForm.defaultSubmit') || current === SERVER_DEFAULT_SUBMIT_TEXT;
        return isDefaultText ? { ...prev, submitButtonText: t('forms.editorPage.product.defaultSubmitText') } : prev;
      });
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
                  width: f.width === 'half' ? 'half' : 'full',
                  fileConfig: f.type === 'file' ? toEditorFileConfig(f.fileConfig) : null,
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
          // Vắng khoá = HIỆN thẻ sản phẩm (mặc định bật); chỉ `false` tường minh mới tắt.
          showProductCard: data.settings?.showProductCard !== false,
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
          textColor: loadedTheme.textColor || '',
          buttonStyle: loadedTheme.buttonStyle || '',
          buttonRadius: loadedTheme.buttonRadius || '',
          cardRadius: loadedTheme.cardRadius || '',
          inputStyle: loadedTheme.inputStyle || '',
          backgroundImageKey: loadedTheme.backgroundImageKey || '',
          backgroundImageUrl: loadedTheme.backgroundImageUrl || '',
          backgroundImageOverlay: Number.isInteger(loadedTheme.backgroundImageOverlay)
            ? loadedTheme.backgroundImageOverlay
            : '',
        });
      })
      .catch((err) => {
        toast.error(err.response?.data?.message || t('forms.editorPage.loadError'));
        navigate('/app/forms');
      })
      .finally(() => setIsLoading(false));
  }, [id, isEditMode, navigate, t]);

  // Cờ tính năng nhận tệp từ khách. Lỗi/thiếu hàm → coi là TẮT (chỉ ẩn loại trường mới, trình soạn vẫn dùng bình thường).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const caps = await fetchFormCapabilities();
        if (!cancelled) setFileUploadsEnabled(Boolean(caps?.fileUploadsEnabled));
      } catch {
        if (!cancelled) setFileUploadsEnabled(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  // AI dựng nháp từ mô tả (PR-5): đổ vào ĐÚNG các state trình soạn như bước chọn mẫu rồi vào trình soạn. CHƯA lưu — người dùng xem lại,
  // sửa tuỳ ý rồi mới bấm Lưu (đường lưu cũ, không có API riêng).
  // `draft.paymentConfig` (backend luôn trả null) KHÔNG được đụng tới: AI không bao giờ điền tiền / tài khoản nhận tiền — loại thu tiền
  // chỉ kèm `needsAttention: ['payment']` để nhắc chủ tự khai ở tab Thanh toán (nhân viên không khai được nên không nhắc họ).
  // Nháp AI trả lựa chọn dạng chuỗi, nhưng chấp nhận cả {label, value} (hình dạng chuẩn hoá của backend) như đường nạp biểu mẫu —
  // `String(object)` ra "[object Object]" (review PR-5 12/10).
  const aiOptionToText = (opt) => (opt && typeof opt === 'object' ? String(opt.label || opt.value || '') : String(opt ?? ''));

  const handleAiDraft = (draft) => {
    const built = (Array.isArray(draft?.fields) ? draft.fields : []).map((f) => {
      const type = f.type || 'short_text';
      const isBlock = isDisplayFieldType(type);
      return makeField({
        label: String(f.label || ''),
        type,
        required: !isBlock && Boolean(f.required),
        role: isBlock || NO_ROLE_FIELD_TYPES.includes(type) ? '' : f.role || '',
        placeholder: String(f.placeholder || ''),
        helpText: String(f.helpText || ''),
        width: !isBlock && f.width === 'half' ? 'half' : 'full',
        options: OPTION_FIELD_TYPES.includes(type) && Array.isArray(f.options) ? f.options.map(aiOptionToText) : [],
      });
    });
    if (built.length === 0) {
      toast.error(t('forms.editorPage.ai.picker.emptyResult'));
      return;
    }
    setFields(built);
    setSelectedUid(built[0].uid);
    setRewriteUndo(null);
    setTitle(String(draft.title || '').slice(0, 200));
    setDescription(String(draft.description || ''));

    const s = draft.settings || {};
    setSettings((prev) => ({
      ...prev,
      notifyOwner: typeof s.notifyOwner === 'boolean' ? s.notifyOwner : prev.notifyOwner,
      consentEnabled: typeof s.consentEnabled === 'boolean' ? s.consentEnabled : prev.consentEnabled,
      sendConfirmation: typeof s.sendConfirmation === 'boolean' ? s.sendConfirmation : prev.sendConfirmation,
      submitButtonText: typeof s.submitButtonText === 'string' && s.submitButtonText.trim() ? s.submitButtonText : prev.submitButtonText,
      successMessage: typeof s.successMessage === 'string' && s.successMessage.trim() ? s.successMessage : prev.successMessage,
    }));

    const bc = draft.bookingConfig;
    if (bc && bc.enabled) {
      setBooking({
        ...DEFAULT_BOOKING,
        enabled: true,
        weeklySlots: { ...DEFAULT_WEEKLY_SLOTS, ...bc.weeklySlots },
        slotCapacity: bc.slotCapacity === null || bc.slotCapacity === undefined ? '' : String(bc.slotCapacity),
        daysAhead: bc.daysAhead ?? DEFAULT_BOOKING.daysAhead,
        minNoticeMinutes: bc.minNoticeMinutes ?? DEFAULT_BOOKING.minNoticeMinutes,
        closedDates: Array.isArray(bc.closedDates) ? bc.closedDates : [],
      });
    }

    const needs = Array.isArray(draft.needsAttention) ? draft.needsAttention : [];
    setSetupHints({ booking: needs.includes('booking') && Boolean(bc?.enabled), payment: needs.includes('payment') && !isEmployee });
    setTemplateChosen(true);
    toast.success(t('forms.editorPage.ai.draftReady'));
  };

  // "AI gợi ý câu hỏi": thêm các câu người dùng đã tích vào CUỐI danh sách (cắt theo trần trường nhập). Trả số trường thực sự thêm.
  const handleAddAiFields = (suggested) => {
    const current = fieldsRef.current;
    const room = Math.max(0, MAX_FIELDS - current.filter((f) => !isDisplayFieldType(f.type)).length);
    const accepted = suggested.slice(0, room);
    if (accepted.length === 0) {
      toast.error(t('forms.editorPage.maxFields'));
      return 0;
    }
    const added = accepted.map((f) => {
      const type = f.type || 'short_text';
      return makeField({
        label: String(f.label || ''),
        type,
        required: Boolean(f.required),
        role: NO_ROLE_FIELD_TYPES.includes(type) ? '' : f.role || '',
        placeholder: String(f.placeholder || ''),
        helpText: String(f.helpText || ''),
        width: f.width === 'half' ? 'half' : 'full',
        options: OPTION_FIELD_TYPES.includes(type) && Array.isArray(f.options) ? f.options.map(aiOptionToText) : [],
      });
    });
    // Vai trò (tên / email / SĐT) chỉ một trường — gợi ý trùng vai trò với trường đã có thì bỏ vai trò của gợi ý, không cướp của trường cũ.
    const taken = new Set(current.map((f) => f.role).filter(Boolean));
    const safe = added.map((f) => {
      if (f.role && taken.has(f.role)) return { ...f, role: '' };
      if (f.role) taken.add(f.role);
      return f;
    });
    setFields([...current, ...safe]);
    focusField(safe[0].uid);
    toast.success(t(accepted.length < suggested.length ? 'forms.editorPage.ai.tools.suggest.addedCapped' : 'forms.editorPage.ai.tools.suggest.added', { count: safe.length }));
    return safe.length;
  };

  // "AI viết lại câu chữ": áp CHỮ (nhãn, hướng dẫn, gợi ý ô, lựa chọn) lên đúng trường theo uid; key/loại/bắt buộc/vai trò/thứ tự không đổi.
  // Lưu chữ cũ để hoàn tác 1 bước. Trả số trường thực sự đổi chữ.
  const handleApplyAiRewrite = (patches) => {
    const byUid = new Map(patches.map((p) => [p.uid, p]));
    const undo = {};
    const next = fieldsRef.current.map((f) => {
      const p = byUid.get(f.uid);
      if (!p || f.type === 'page_break') return f;
      const patch = {};
      if (p.label && p.label !== f.label) patch.label = p.label;
      if (f.helpText && p.helpText && p.helpText !== f.helpText && f.type !== 'paragraph') patch.helpText = p.helpText;
      if (f.placeholder && p.placeholder && p.placeholder !== f.placeholder) patch.placeholder = p.placeholder;
      // Lựa chọn: chỉ đổi khi trường VẪN là loại có lựa chọn và còn đúng số mục lúc AI đọc (người dùng có thể đã sửa trong lúc chờ).
      if (
        OPTION_FIELD_TYPES.includes(f.type) &&
        Array.isArray(p.options) &&
        p.options.length === f.options.length &&
        p.options.some((o, i) => o !== f.options[i])
      ) {
        patch.options = p.options;
      }
      if (Object.keys(patch).length === 0) return f;
      undo[f.uid] = { label: f.label, helpText: f.helpText, placeholder: f.placeholder, options: [...f.options] };
      return { ...f, ...patch };
    });
    const changed = Object.keys(undo).length;
    if (changed === 0) {
      toast.error(t('forms.editorPage.ai.tools.rewrite.nothing'));
      return 0;
    }
    setFields(next);
    setRewriteUndo(undo);
    toast.success(t('forms.editorPage.ai.tools.rewrite.done', { count: changed }));
    return changed;
  };

  const handleUndoAiRewrite = () => {
    if (!rewriteUndo) return;
    setFields((prev) => prev.map((f) => (rewriteUndo[f.uid] ? { ...f, ...rewriteUndo[f.uid] } : f)));
    setRewriteUndo(null);
    toast.success(t('forms.editorPage.ai.tools.rewrite.undone'));
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

  // Trần theo từng nhóm (khớp backend): tối đa MAX_FIELDS trường NHẬP và MAX_DISPLAY_BLOCKS khối bố cục (tiêu đề / đoạn
  // chữ / ngắt trang) — khối bố cục không ăn vào hạn mức câu hỏi. Trả true (kèm thông báo) nếu thêm một trường `type` nữa
  // sẽ vượt trần của nhóm đó.
  const exceedsTypeLimit = (type) => {
    if (isDisplayFieldType(type)) {
      if (fields.filter((f) => isDisplayFieldType(f.type)).length >= MAX_DISPLAY_BLOCKS) {
        toast.error(t('forms.editorPage.maxBlocks'));
        return true;
      }
      return false;
    }
    if (fields.filter((f) => !isDisplayFieldType(f.type)).length >= MAX_FIELDS) {
      toast.error(t('forms.editorPage.maxFields'));
      return true;
    }
    return false;
  };

  // Thêm trường mới
  const handleAddField = () => {
    if (exceedsTypeLimit('short_text')) return;
    const inputCount = fields.filter((f) => !isDisplayFieldType(f.type)).length;
    const field = makeField({ label: t('forms.editorPage.newFieldLabel', { index: inputCount + 1 }) });
    setFields((prev) => [...prev, field]);
    focusField(field.uid);
  };

  // Thêm trường thông dụng 1-chạm từ thư viện mẫu
  const handleAddQuickField = (preset) => {
    if (exceedsTypeLimit(preset.type)) return;
    const localizedTitle = preset.titleKey ? t(preset.titleKey) : preset.title;
    let localizedOptions = [];
    if (preset.optionsKey === 'items') {
      localizedOptions = [t('forms.editorPage.quickAdd.defaultItem1'), t('forms.editorPage.quickAdd.defaultItem2')];
    } else if (preset.optionsKey === 'options') {
      localizedOptions = [t('forms.editorPage.defaultOption1'), t('forms.editorPage.defaultOption2')];
    } else if (preset.options) {
      localizedOptions = [...preset.options];
    }

    // Nhãn mặc định: tên nút, trừ khi preset khai nhãn riêng (labelKey) hoặc để trống (page_break — tiêu đề bước là tuỳ chọn).
    const defaultLabel = preset.emptyLabel ? '' : preset.labelKey ? t(preset.labelKey) : localizedTitle;
    const field = makeField({
      label: defaultLabel,
      type: preset.type,
      required: Boolean(preset.required),
      role: preset.role || '',
      options: localizedOptions,
      fileConfig: preset.type === 'file' ? toEditorFileConfig(makeDefaultFileConfig()) : null,
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
    const source = fields[idx];
    if (!source) return;
    if (exceedsTypeLimit(source.type)) return;
    const copy = {
      ...source,
      uid: nextFieldUid(),
      key: '',
      role: '',
      options: [...(source.options || [])],
      fileConfig: source.fileConfig ? { ...source.fileConfig, kinds: [...source.fileConfig.kinds] } : null,
    };
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
    // Đổi giữa trường nhập <-> khối bố cục: nhóm đích đã đủ trần thì chặn (kèm thông báo), giữ nguyên trường.
    if (key === 'type' && fields[idx] && isDisplayFieldType(fields[idx].type) !== isDisplayFieldType(value) && exceedsTypeLimit(value)) {
      return;
    }
    setFields((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [key]: value };

      // Nếu chuyển sang kiểu không có options thì clear options
      if (key === 'type' && !OPTION_FIELD_TYPES.includes(value)) {
        copy[idx].options = [];
      } else if (key === 'type' && OPTION_FIELD_TYPES.includes(value) && copy[idx].options.length === 0) {
        copy[idx].options = [t('forms.editorPage.defaultOption1'), t('forms.editorPage.defaultOption2')];
      }

      // Sang/ra khỏi loại `file`: cấu hình tệp chỉ tồn tại ở trường file (mới sang file → mặc định Ảnh + PDF, 10 MB, 1 tệp).
      if (key === 'type') {
        copy[idx] = {
          ...copy[idx],
          fileConfig: value === 'file' ? (copy[idx].fileConfig || toEditorFileConfig(makeDefaultFileConfig())) : null,
        };
      }

      // Sang khối bố cục: bỏ mọi thuộc tính chỉ có nghĩa với trường nhập (bắt buộc / vai trò / gợi ý / độ rộng).
      // Sang sao / có-không / giờ: bỏ vai trò (các loại này không thể là tên, email, SĐT).
      if (key === 'type' && isDisplayFieldType(value)) {
        copy[idx] = { ...copy[idx], required: false, role: '', placeholder: '', width: 'full', options: [] };
      } else if (key === 'type' && NO_ROLE_FIELD_TYPES.includes(value)) {
        copy[idx] = { ...copy[idx], role: '' };
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

    // Khối bố cục (tiêu đề / đoạn chữ / ngắt trang) không tính: biểu mẫu phải có ít nhất 1 trường để khách điền.
    if (fields.every((f) => isDisplayFieldType(f.type))) {
      errs.fields = t('forms.editorPage.validationFieldsRequired');
    }

    // Validate từng trường
    for (let i = 0; i < fields.length; i++) {
      const f = fields[i];
      if (f.type === 'paragraph') {
        // Nội dung đoạn chữ nằm trong `label` (trần 2000, không phải 200).
        if (!f.label || !f.label.trim()) {
          errs[`field_${i}_label`] = t('forms.editorPage.validationParagraphRequired');
        } else if (f.label.trim().length > MAX_PARAGRAPH_LENGTH) {
          errs[`field_${i}_label`] = t('forms.editorPage.validationParagraphMax');
        }
      } else if (f.type === 'page_break') {
        // Tiêu đề bước là tuỳ chọn — chỉ kiểm độ dài.
        if (f.label && f.label.trim().length > 200) {
          errs[`field_${i}_label`] = t('forms.editorPage.validationFieldLabelMax');
        }
      } else if (!f.label || !f.label.trim()) {
        errs[`field_${i}_label`] = t('forms.editorPage.validationFieldLabelRequired');
      } else if (f.label.trim().length > 200) {
        errs[`field_${i}_label`] = t('forms.editorPage.validationFieldLabelMax');
      }

      if (OPTION_FIELD_TYPES.includes(f.type)) {
        if (!f.options || f.options.length === 0) {
          errs[`field_${i}_options`] = t('forms.editorPage.validationOptionsRequired');
        }
      }

      if (f.type === 'file') {
        const cfg = f.fileConfig || {};
        if (!Array.isArray(cfg.kinds) || cfg.kinds.length === 0) {
          errs[`field_${i}_fileKinds`] = t('forms.editorPage.validationFileKinds');
        }
        const mb = Number(cfg.maxMb);
        if (String(cfg.maxMb ?? '').trim() === '' || !Number.isFinite(mb) || mb < MIN_FORM_FILE_MB || mb > MAX_FORM_FILE_MB) {
          errs[`field_${i}_fileSize`] = t('forms.editorPage.validationFileSize', { min: MIN_FORM_FILE_MB, max: MAX_FORM_FILE_MB });
        }
        const count = Number(cfg.maxFiles);
        if (!Number.isInteger(count) || count < MIN_FORM_FILE_COUNT || count > MAX_FORM_FILE_COUNT) {
          errs[`field_${i}_fileCount`] = t('forms.editorPage.validationFileCount', { min: MIN_FORM_FILE_COUNT, max: MAX_FORM_FILE_COUNT });
        }
      }

      if (f.type !== 'paragraph' && f.type !== 'page_break' && f.helpText && f.helpText.trim().length > MAX_HELP_TEXT_LENGTH) {
        errs[`field_${i}_helpText`] = t('forms.editorPage.validationHelpTextMax');
      }
      if (!isDisplayFieldType(f.type) && f.placeholder && f.placeholder.trim().length > MAX_PLACEHOLDER_LENGTH) {
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
        const isBlock = isDisplayFieldType(f.type);
        const item = {
          label: f.label.trim(),
          type: f.type,
          // Khối bố cục không có giá trị nên không bao giờ bắt buộc.
          required: isBlock ? false : Boolean(f.required),
        };
        // Giữ key cũ nếu có (trường mới key rỗng)
        if (f.key && String(f.key).trim()) {
          item.key = f.key.trim();
        }
        // Vai trò chỉ cho loại có thể là tên/email/SĐT (khối bố cục, sao, có-không, giờ thì không).
        if (f.role && !isBlock && !NO_ROLE_FIELD_TYPES.includes(f.type)) {
          item.role = f.role;
        }
        // placeholder / helpText CHỈ gửi khi có chữ (trường cũ không có thì payload y như trước đây);
        // placeholder chỉ có nghĩa với loại có ô nhập chữ.
        if (PLACEHOLDER_FIELD_TYPES.includes(f.type) && f.placeholder && f.placeholder.trim()) {
          item.placeholder = f.placeholder.trim();
        }
        // helpText: trường nhập + tiêu đề phần (mô tả phụ). Đoạn chữ / ngắt trang không có chữ phụ.
        if (f.helpText && f.helpText.trim() && f.type !== 'paragraph' && f.type !== 'page_break') {
          item.helpText = f.helpText.trim();
        }
        if (OPTION_FIELD_TYPES.includes(f.type)) {
          item.options = f.options.map((opt) => String(opt).trim()).filter(Boolean);
        }
        // Độ rộng CHỈ gửi khi 'half' (full = mặc định, vắng khoá) — payload trường cũ không đổi một byte.
        if (!isBlock && f.width === 'half') {
          item.width = 'half';
        }
        // Trường tệp: nhóm tệp / dung lượng tối đa mỗi tệp (byte) / số tệp tối đa (backend chuẩn hoá + kiểm lại).
        if (f.type === 'file') {
          item.fileConfig = toPayloadFileConfig(f.fileConfig);
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
        // Chỉ gửi khi TẮT (mặc định bật = vắng khoá): payload của mọi biểu mẫu khác giữ nguyên từng byte, và PUT ghi đè cả
        // khối settings nên bật lại chỉ cần bỏ khoá.
        ...(settings.showProductCard === false ? { showProductCard: false } : {}),
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
        // PR-8b — backend THAY CẢ theme mỗi lần lưu nên MỌI khoá đã đặt phải đi theo (kể cả khi chỉ đổi màu chủ đạo).
        // Khoá rỗng vắng mặt = mặc định. Độ tối chỉ gửi kèm ảnh nền (backend cũng bỏ nếu không có ảnh).
        ...(HEX_COLOR_RE.test(theme.textColor) ? { textColor: theme.textColor } : {}),
        ...(theme.buttonStyle ? { buttonStyle: theme.buttonStyle } : {}),
        ...(theme.buttonRadius ? { buttonRadius: theme.buttonRadius } : {}),
        ...(theme.cardRadius ? { cardRadius: theme.cardRadius } : {}),
        ...(theme.inputStyle ? { inputStyle: theme.inputStyle } : {}),
        ...(theme.backgroundImageKey ? { backgroundImageKey: theme.backgroundImageKey } : {}),
        ...(theme.backgroundImageKey && Number.isInteger(theme.backgroundImageOverlay)
          ? { backgroundImageOverlay: theme.backgroundImageOverlay }
          : {}),
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

  // Thẻ sản phẩm của xem trước: theo đúng quy tắc API công khai — chỉ khi công tắc bật (mặc định bật) và sản phẩm đang bán
  // (ảnh chỉ nhận http/https). Giá chính theo khối Thanh toán nháp (mục đích "đơn hàng" thì hiện số tiền đang nhập).
  const showProductCard = settings.showProductCard !== false;
  const previewProduct = useMemo(
    () => (showProductCard ? buildPreviewFormProduct(selectedProduct) : null),
    [showProductCard, selectedProduct]
  );
  const previewPaymentAmount = Number(payment.amount);
  const previewPaymentEnabled = payment.enabled && Number.isFinite(previewPaymentAmount) && previewPaymentAmount > 0;
  const previewPaymentPurpose = payment.purpose;

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
        width: f.width,
        ...(f.type === 'file' ? { fileConfig: toPayloadFileConfig(f.fileConfig) } : {}),
      })),
      // Xem trước theo ĐÚNG những gì khách sẽ thấy: cờ tắt thì ô tệp thay bằng câu "tạm chưa nhận tệp".
      ...(fields.some((f) => f.type === 'file') ? { fileUploads: { enabled: fileUploadsEnabled } } : {}),
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
        textColor: HEX_COLOR_RE.test(theme.textColor) ? theme.textColor : undefined,
        buttonStyle: theme.buttonStyle || undefined,
        buttonRadius: theme.buttonRadius || undefined,
        cardRadius: theme.cardRadius || undefined,
        inputStyle: theme.inputStyle || undefined,
      },
      product: previewProduct,
      payment: previewPaymentEnabled
        ? { enabled: true, amount: previewPaymentAmount, purpose: resolvePaymentPurpose(previewPaymentPurpose) }
        : null,
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
      previewProduct,
      previewPaymentEnabled,
      previewPaymentAmount,
      previewPaymentPurpose,
      fileUploadsEnabled,
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
          onAiDraft={handleAiDraft}
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
              <FormAiTools
                title={title}
                description={description}
                fields={fields}
                productId={productId}
                onAddFields={handleAddAiFields}
                onApplyRewrite={handleApplyAiRewrite}
                canUndo={Boolean(rewriteUndo)}
                onUndo={handleUndoAiRewrite}
              />
              <FieldListPane
                fields={fields}
                errors={errors}
                selectedUid={activeUid}
                setupHints={setupHints}
                fileUploadsEnabled={fileUploadsEnabled}
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
                backgroundImageUrl={theme.backgroundImageKey ? theme.backgroundImageUrl || undefined : undefined}
                backgroundImageOverlay={theme.backgroundImageOverlay}
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
          showProductCard,
          onShowProductCardChange: (checked) => setSettings((prev) => ({ ...prev, showProductCard: checked })),
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
