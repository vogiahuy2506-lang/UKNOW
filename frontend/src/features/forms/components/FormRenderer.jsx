import { useState, useRef, useCallback, useEffect } from 'react';
import { useI18n } from '../../../i18n';
import BookingSlotPicker from './BookingSlotPicker';
import { vnToday, addDaysToDateStr, formatSlotDateLabel } from '../utils/bookingFormat.util';
import { useFormFont } from '../utils/useFormFont';
import { getReadableTextColor } from '../utils/formTheme.util';
import { isDisplayFieldType, splitFormPages, RATING_MAX } from '../utils/formFieldTypes.util';
import { buildFormFontFamily, FORM_BANNER_HEIGHTS, DEFAULT_FORM_BANNER_HEIGHT } from '../constants/formTheme';

const SLOT_ERROR_CODES = new Set(['FORM_SLOT_FULL', 'INVALID_APPOINTMENT_SLOT']);

/**
 * FormRenderer: Component hiển thị biểu mẫu công khai và xử lý nộp bài.
 * Thiết kế decoupled để PR-4 dùng cho xem trước (previewMode) và PR-5 dùng cho bản nhúng.
 *
 * @param {object} props
 * @param {object} props.form - Định nghĩa biểu mẫu (title, description, fields, settings, theme, booking)
 * @param {Function} props.onSubmit - Callback nộp bài: (payload) => Promise<{navigated?: boolean}|void>.
 *   Trả `{ navigated: true }` khi caller đã tự điều hướng đi nơi khác (PR-3b: nộp bài thu tiền ->
 *   trang trạng thái) — FormRenderer bỏ qua redirectUrl/màn thành công của chính nó trong trường
 *   hợp đó, tránh chồng lên điều hướng caller vừa làm.
 * @param {boolean} [props.isSubmitting] - Trạng thái đang gửi từ bên ngoài
 * @param {string} [props.externalError] - Lỗi từ server (nếu có)
 * @param {boolean} [props.previewMode] - Chế độ xem trước trong trình soạn thảo
 * @param {(from: string, days: number) => Promise<{slots: Array}>} [props.loadSlots] - Tải khung
 *   giờ trống. Renderer KHÔNG tự gọi API (giữ decoupled) — không truyền prop này (vd. trong
 *   previewMode) thì hiển thị lịch khoá/mẫu thay vì gọi mạng.
 * @param {boolean} [props.embedMode] - PR-5: đang render trong iframe nhúng (`/f/:publicKey?embed=1`).
 *   Khi có redirectUrl, chuyển hướng CẢ TRANG NGOÀI (`window.top`) thay vì chỉ mỗi iframe —
 *   thất bại (top bị chặn/không truy cập được) thì hiện màn thành công kèm link `target="_top"`
 *   thay vì im lặng chuyển hướng mỗi iframe (khách chỉ thấy iframe đổi trang, trang ngoài đứng yên).
 * @param {boolean} [props.singleColumn] - PR-4: ép MỘT cột dù viewport rộng (khung "Điện thoại" của xem trước trong
 *   trình soạn: breakpoint `sm:` đo theo viewport chứ không theo khung 390px). Trang công khai/bản nhúng không truyền —
 *   tự theo viewport: ≥ sm hai cột (trường `width:'half'` đứng chung hàng), < sm một cột.
 *
 * Nhiều bước (PR-4): khối `page_break` chia biểu mẫu thành các trang (xem `splitFormPages`). Trang cuối mới có bộ
 * chọn lịch, ô đồng ý và nút gửi; các trang trước có "Tiếp" (kiểm trường bắt buộc của CHÍNH trang đó) và "Quay lại".
 * Không có `page_break` → một trang, hành vi y như trước.
 */
export default function FormRenderer({
  form,
  onSubmit,
  isSubmitting = false,
  externalError = '',
  previewMode = false,
  loadSlots,
  embedMode = false,
  singleColumn = false,
}) {
  const { t, locale } = useI18n();

  const [answers, setAnswers] = useState({});
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [clientErrors, setClientErrors] = useState({});
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [redirectFallbackUrl, setRedirectFallbackUrl] = useState('');
  // Trang đang xem (0-based) — chỉ có nghĩa khi biểu mẫu có khối page_break (nhiều bước).
  const [pageIndex, setPageIndex] = useState(0);
  const stepHeaderRef = useRef(null);
  const lastPageIndexRef = useRef(0);

  const booking = form?.booking || null;
  const bookingEnabled = Boolean(booking?.enabled);
  const daysAhead = Number.isFinite(booking?.daysAhead) ? booking.daysAhead : 30;
  const bookingMock = bookingEnabled && (previewMode || typeof loadSlots !== 'function');

  const [weekStart, setWeekStart] = useState(() => vnToday());
  const [slots, setSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsLoadError, setSlotsLoadError] = useState('');
  const [selectedSlot, setSelectedSlot] = useState(null); // { date, time }
  const [bookedInfo, setBookedInfo] = useState(null); // snapshot cho màn thành công

  // Chống bấm đúp bằng useRef để chặn ngay lập tức trong event loop
  const submittingRef = useRef(false);
  // Ref cho trường bẫy bot không điều khiển (uncontrolled input)
  const honeypotRef = useRef(null);
  // Đếm thứ tự request tải slots — đổi tuần liên tiếp có thể khiến phản hồi về KHÔNG đúng thứ
  // tự (mạng chậm/nhanh xen kẽ); chỉ áp kết quả của request mới nhất, bỏ phản hồi cũ tới muộn.
  const loadSlotsSeqRef = useRef(0);

  const fields = Array.isArray(form?.fields) ? form.fields : [];
  // Chia trang theo page_break. Không có trường nào để hiện (mảng rỗng) vẫn cần 1 trang trống để còn nút gửi.
  const pages = splitFormPages(fields);
  const pageList = pages.length > 0 ? pages : [{ title: '', fields: [] }];
  const isMultiStep = pageList.length > 1;
  // Xem trước trong trình soạn: người soạn xoá bớt ngắt trang khi đang ở trang 3 → kẹp lại, không để trang "mất tích".
  const safePageIndex = Math.min(pageIndex, pageList.length - 1);
  const currentPage = pageList[safePageIndex];
  const isLastPage = safePageIndex === pageList.length - 1;
  const settings = form?.settings || {};
  const submitButtonText = settings.submitButtonText?.trim() || t('publicForm.defaultSubmit');
  const successMessage = settings.successMessage?.trim() || t('publicForm.defaultSuccess');

  // PR-4b — giao diện biểu mẫu (PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md). `theme` rỗng/thiếu
  // phải ra ĐÚNG giao diện hiện tại (chữ trắng trên cam mặc định) — mọi biến dưới đây chỉ có giá
  // trị khi theme THỰC SỰ khai báo khoá đó, không tự suy ra màu/text từ màu mặc định.
  const theme = form?.theme || {};
  const primaryColor = theme.primaryColor || null;
  // Chỉ tính màu chữ tự động khi theme CÓ primaryColor riêng — gọi hàm này vô điều kiện (kể cả
  // với màu mặc định #DF5C0E) sẽ đổi chữ nút từ trắng sang tối (review 15/09: 4.79 so 3.70).
  const primaryTextColor = primaryColor ? getReadableTextColor(primaryColor) : null;
  // Nền nhạt (~10% alpha, hex 8 ký tự) dùng cho trạng thái hover — CSS custom property (không
  // phải class opacity-modifier của Tailwind trên giá trị var(), thứ Tailwind không tính trước
  // được lúc build) để BookingSlotPicker (con) dùng qua cascade, cùng cơ chế với --form-primary.
  const primaryTintColor = primaryColor ? `${primaryColor}1a` : null;
  const fontFamilyCss = buildFormFontFamily(theme.fontFamily);
  const isWideLayout = theme.layout === 'wide';
  const bannerHeight = FORM_BANNER_HEIGHTS[theme.bannerHeight] || FORM_BANNER_HEIGHTS[DEFAULT_FORM_BANNER_HEIGHT];
  const [bannerLoadFailed, setBannerLoadFailed] = useState(false);
  const [logoLoadFailed, setLogoLoadFailed] = useState(false);

  useFormFont(theme.fontFamily);

  // Biến CSS trên gốc component thay vì sinh class Tailwind động (Bẫy PR-4b mục 2: JIT không
  // thấy `bg-[${color}]` lúc build) — cascade tự nhiên xuống BookingSlotPicker (con), không cần
  // truyền primaryColor qua props. Fallback trong var(...) giữ ĐÚNG màu/chữ mặc định hiện tại khi
  // không set (phrase "biến CSS trên gốc" — phản biện PR-4b điểm 1, chọn vì tránh prop-drilling
  // primaryColor xuống BookingSlotPicker và các nút lặp lại nhiều chỗ).
  // Biểu mẫu LUÔN sáng (trang công khai, bản nhúng, xem trước trong trình soạn). `html.dark` đặt
  // `color-scheme: dark` → ô nhập/radio/checkbox không đặt nền sẽ bị trình duyệt tô tối khi xem trước
  // trong app đang ở giao diện tối (review PR-3 11/10). Ghim lại `light` ngay trên gốc.
  const themeRootStyle = {
    colorScheme: 'light',
    ...(primaryColor ? { '--form-primary': primaryColor } : {}),
    ...(primaryTextColor ? { '--form-primary-text': primaryTextColor } : {}),
    ...(primaryTintColor ? { '--form-primary-tint': primaryTintColor } : {}),
    ...(fontFamilyCss ? { fontFamily: fontFamilyCss } : {}),
  };
  const cardWidthClass = isWideLayout ? 'max-w-2xl' : 'max-w-xl';
  const cardSurfaceClass = isWideLayout ? '' : 'shadow-sm border border-gray-100';

  const todayVn = vnToday();
  const maxDate = addDaysToDateStr(todayVn, daysAhead);
  const canGoPrevWeek = weekStart > todayVn;
  const canGoNextWeek = addDaysToDateStr(weekStart, 7) <= maxDate;

  const loadWeek = useCallback(
    async (from) => {
      if (typeof loadSlots !== 'function') return;
      const seq = ++loadSlotsSeqRef.current;
      setSlotsLoading(true);
      setSlotsLoadError('');
      try {
        const result = await loadSlots(from, 7);
        if (seq !== loadSlotsSeqRef.current) return; // phản hồi cũ tới muộn — bỏ qua
        setSlots(Array.isArray(result?.slots) ? result.slots : []);
      } catch {
        if (seq !== loadSlotsSeqRef.current) return;
        setSlots([]);
        setSlotsLoadError(t('publicForm.booking.loadSlotsError'));
      } finally {
        if (seq === loadSlotsSeqRef.current) setSlotsLoading(false);
      }
    },
    [loadSlots, t]
  );

  useEffect(() => {
    if (bookingEnabled && !bookingMock) {
      loadWeek(weekStart);
    }
  }, [bookingEnabled, bookingMock, weekStart, loadWeek]);

  // Đổi trang: đưa đầu biểu mẫu vào tầm nhìn + chuyển tiêu điểm lên khối "Bước x/y" (nút Tiếp vừa bấm đã biến mất khỏi
  // DOM). Không làm gì trong xem trước (không giật cuộn / không cướp tiêu điểm của trình soạn) và ở lần vẽ đầu.
  useEffect(() => {
    if (lastPageIndexRef.current === safePageIndex) return;
    lastPageIndexRef.current = safePageIndex;
    if (previewMode) return;
    const el = stepHeaderRef.current;
    if (!el) return;
    el.focus?.({ preventScroll: true });
    el.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  }, [safePageIndex, previewMode]);

  const handlePrevWeek = () => {
    const prev = addDaysToDateStr(weekStart, -7);
    setWeekStart(prev < todayVn ? todayVn : prev);
  };

  const handleNextWeek = () => {
    if (!canGoNextWeek) return;
    setWeekStart(addDaysToDateStr(weekStart, 7));
  };

  const handleSelectSlot = (date, time) => {
    setSelectedSlot({ date, time });
    if (clientErrors.__booking) {
      setClientErrors((prev) => {
        const next = { ...prev };
        delete next.__booking;
        return next;
      });
    }
  };

  const normalizePhoneClient = (raw) => {
    const s = String(raw || '').trim();
    if (!s) return '';
    const hasPlus = s.startsWith('+');
    const digits = s.replace(/\D/g, '');
    return hasPlus ? `+${digits}` : digits;
  };

  const handleFieldChange = (key, val) => {
    setAnswers((prev) => ({ ...prev, [key]: val }));
    if (clientErrors[key]) {
      setClientErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const handleCheckboxItemToggle = (key, optVal) => {
    const current = Array.isArray(answers[key]) ? answers[key] : [];
    const exists = current.includes(optVal);
    const updated = exists ? current.filter((v) => v !== optVal) : [...current, optVal];
    handleFieldChange(key, updated);
  };

  // Kiểm các trường NHẬP trong `list` (khối hiển thị không có giá trị nên bỏ qua). Dùng cho cả nút "Tiếp" (chỉ trường
  // của trang hiện tại) lẫn nút gửi (mọi trang) — server luôn kiểm đủ, đây chỉ để báo lỗi sớm.
  const validateFields = (list) => {
    const errors = {};

    for (const field of list) {
      const { key, label, required, type } = field;
      if (isDisplayFieldType(type)) continue;
      const val = answers[key];

      // Kiểm tra bắt buộc
      const isEmpty =
        val === undefined ||
        val === null ||
        (typeof val === 'string' && val.trim() === '') ||
        (Array.isArray(val) && val.length === 0);

      if (required && isEmpty) {
        errors[key] = t('publicForm.validation.required', { label });
        continue;
      }

      if (!isEmpty) {
        if (type === 'short_text' && String(val).length > 500) {
          errors[key] = t('publicForm.validation.shortTextMax', { label });
        } else if (type === 'long_text' && String(val).length > 5000) {
          errors[key] = t('publicForm.validation.longTextMax', { label });
        } else if (type === 'email') {
          const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRe.test(String(val).trim())) {
            errors[key] = t('publicForm.validation.emailInvalid');
          }
        } else if (type === 'phone') {
          const normalizedPhone = normalizePhoneClient(val);
          if (!/^\+?[0-9]{8,20}$/.test(normalizedPhone)) {
            errors[key] = t('publicForm.validation.phoneInvalid');
          }
        }
      }
    }

    return errors;
  };

  const validateClient = () => {
    const errors = validateFields(fields);

    if (bookingEnabled && !previewMode && !selectedSlot) {
      errors.__booking = t('publicForm.booking.selectRequired');
    }

    return errors;
  };

  const handleGoNext = () => {
    // Xem trước: mọi ô bị khoá nên không thể điền — cho sang trang để xem, không chặn bằng trường bắt buộc.
    if (!previewMode) {
      const errors = validateFields(currentPage.fields);
      if (Object.keys(errors).length > 0) {
        setClientErrors((prev) => ({ ...prev, ...errors }));
        return;
      }
    }
    setPageIndex(Math.min(safePageIndex + 1, pageList.length - 1));
  };

  const handleGoBack = () => {
    // Quay lại KHÔNG kiểm gì và không xoá câu trả lời — `answers` nằm ở renderer, không ở từng trang.
    setPageIndex(Math.max(safePageIndex - 1, 0));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (previewMode) return;

    // Enter trong ô nhập ở trang giữa = "Tiếp" (trang giữa không có nút gửi, nhưng form 1 ô nhập vẫn tự submit).
    if (!isLastPage) {
      handleGoNext();
      return;
    }

    // Chặn bấm đúp ngay lập tức bằng cờ ref
    if (submittingRef.current || isSubmitting) {
      return;
    }

    const errors = validateClient();
    if (Object.keys(errors).length > 0) {
      setClientErrors(errors);
      // Lỗi nằm ở trang trước (hiếm: trang trước chỉ qua được "Tiếp" khi đã hợp lệ) → đưa khách về đúng trang đó.
      const firstBadPage = pageList.findIndex((page) => page.fields.some((f) => errors[f.key]));
      if (firstBadPage >= 0 && firstBadPage < safePageIndex) setPageIndex(firstBadPage);
      return;
    }

    submittingRef.current = true;

    try {
      const cleanAnswers = { ...answers };

      for (const field of fields) {
        if (field.type === 'phone' && cleanAnswers[field.key]) {
          cleanAnswers[field.key] = normalizePhoneClient(cleanAnswers[field.key]);
        }
      }

      // Bẫy bot: lấy giá trị thật từ input honeypot không điều khiển
      const honeypotVal = honeypotRef.current ? honeypotRef.current.value : '';

      const payload = {
        answers: cleanAnswers,
        _hp_website: honeypotVal,
      };

      // Chỉ gửi marketingConsent khi form bật settings.consentEnabled
      if (settings.consentEnabled === true) {
        payload.marketingConsent = Boolean(marketingConsent);
      }

      // Chỉ gửi appointmentDate/appointmentTime khi form bật đặt lịch — form không bật
      // KHÔNG được có 2 khoá này trong payload (hợp đồng PR-2a).
      if (bookingEnabled && selectedSlot) {
        payload.appointmentDate = selectedSlot.date;
        payload.appointmentTime = selectedSlot.time;
      }

      if (onSubmit) {
        const submitResult = await onSubmit(payload);
        // Caller đã tự điều hướng (PR-3b: nộp bài thu tiền -> trang trạng thái) — không chạy
        // tiếp redirectUrl/màn thành công của FormRenderer, tránh window.location.href đè lên
        // navigate() caller vừa gọi.
        if (submitResult?.navigated) {
          return;
        }
      }

      if (bookingEnabled && selectedSlot) {
        setBookedInfo(selectedSlot);
      }

      // Xử lý chuyển hướng phòng thủ lớp 2
      if (settings.redirectUrl && settings.redirectUrl.trim() !== '') {
        try {
          const parsed = new URL(settings.redirectUrl.trim());
          if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            const url = settings.redirectUrl.trim();
            if (embedMode) {
              // Trong iframe nhúng: đổi window.location.href chỉ chuyển hướng MỖI iframe,
              // khách vẫn kẹt trên landing page ngoài. Thử chuyển cả trang ngoài qua window.top;
              // thất bại (hiếm — vd trình duyệt chặn) thì rơi xuống màn thành công + link target="_top".
              try {
                window.top.location.href = url;
                return;
              } catch {
                setRedirectFallbackUrl(url);
              }
            } else {
              window.location.href = url;
              return;
            }
          }
        } catch {
          // URL không hợp lệ -> không redirect, hiện thông báo thành công
        }
      }

      setSubmittedSuccess(true);
    } catch (err) {
      // Lỗi chung do bên ngoài/caller quản lý qua externalError. Riêng lỗi khung giờ (409 hết
      // chỗ / 400 khung không hợp lệ) phải tải lại slots + bỏ chọn khung cũ, GIỮ NGUYÊN các câu
      // trả lời khác đã điền (answers không đổi trong nhánh này).
      const code = err?.response?.data?.code;
      if (bookingEnabled && SLOT_ERROR_CODES.has(code)) {
        setSelectedSlot(null);
        setClientErrors((prev) => ({
          ...prev,
          __booking: t(`publicForm.booking.error.${code}`),
        }));
        loadWeek(weekStart);
      }
    } finally {
      submittingRef.current = false;
    }
  };

  if (submittedSuccess) {
    return (
      <div
        className={`w-full ${cardWidthClass} mx-auto p-6 bg-white text-slate-800 rounded-2xl ${cardSurfaceClass} text-center`}
        style={themeRootStyle}
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-50 text-green-600 flex items-center justify-center text-3xl font-bold">
          ✓
        </div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">
          {t('publicForm.submitSuccess')}
        </h3>
        <p className="text-gray-600 whitespace-pre-line leading-relaxed">
          {successMessage}
        </p>
        {bookedInfo && (
          <p
            className="mt-4 inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-primary-50 text-primary-700 text-sm font-medium"
            // Nền nhạt + chữ đậm của MỘT màu — không quy về CSS var (fallback của var() không
            // tái tạo được cặp "50/700" nhạt-đậm cùng tông của một hex bất kỳ), chỉ ghi đè bằng
            // style khi CÓ theme màu riêng; theme {} giữ nguyên 2 class gốc, không đổi gì.
            style={primaryColor ? { backgroundColor: `${primaryColor}1a`, color: primaryColor } : undefined}
          >
            {t('publicForm.booking.bookedAt', {
              date: formatSlotDateLabel(bookedInfo.date, locale),
              time: bookedInfo.time,
            })}
          </p>
        )}
        {redirectFallbackUrl && (
          <a
            href={redirectFallbackUrl}
            target="_top"
            rel="noopener"
            className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[color:var(--form-primary,#df5c0e)] text-[color:var(--form-primary-text,#ffffff)] text-sm font-medium hover:brightness-95 transition-colors"
          >
            {t('publicForm.redirectFallbackLink')}
          </a>
        )}
      </div>
    );
  }

  // giữ sáng: biểu mẫu khách điền luôn nền trắng. text-slate-800 (= màu chữ body sáng #1e293b) để xem trước trong app
  // chế độ tối không kế thừa chữ sáng của body → chữ trắng trên ô trắng.
  return (
    <div
      className={`w-full ${cardWidthClass} mx-auto bg-white text-slate-800 rounded-2xl ${cardSurfaceClass} overflow-hidden overflow-x-hidden box-border`}
      style={themeRootStyle}
    >
      {/* Banner: full-bleed (tràn hết chiều rộng thẻ, không theo padding nội dung bên dưới) —
          object-cover + chiều cao cố định theo bannerHeight, ảnh 1600×400 không bị thu nhỏ vì
          không giới hạn max-width. Lỗi tải -> ẩn hẳn, không vỡ khung (không hiện icon ảnh hỏng). */}
      {theme.bannerUrl && !bannerLoadFailed && (
        <img
          src={theme.bannerUrl}
          alt=""
          style={{ height: bannerHeight }}
          className="w-full object-cover"
          onError={() => setBannerLoadFailed(true)}
        />
      )}
      <div className="p-4 sm:p-6">
        {/* Tiêu đề & mô tả biểu mẫu */}
        <div className="mb-6">
          {theme.logoUrl && !logoLoadFailed && (
            <img
              src={theme.logoUrl}
              alt=""
              className="h-12 max-w-[200px] object-contain mb-3"
              onError={() => setLogoLoadFailed(true)}
            />
          )}
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2 break-words">
            {form?.title || t('forms.formTitle')}
          </h1>
          {form?.description && (
            <p className="text-gray-600 text-sm sm:text-base whitespace-pre-line break-words leading-relaxed">
              {form.description}
            </p>
          )}
        </div>

        {/* Lỗi tổng thể từ server */}
      {externalError && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm break-words">
          {externalError}
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {/* Trường bẫy Bot (Honeypot) — ẩn hoàn toàn khỏi người dùng */}
        <div
          style={{ opacity: 0, position: 'absolute', top: 0, left: 0, height: 0, width: 0, zIndex: -1 }}
          aria-hidden="true"
        >
          <label htmlFor="_hp_website">Do not fill this</label>
          <input
            id="_hp_website"
            type="text"
            name="_hp_website"
            tabIndex={-1}
            autoComplete="off"
            ref={honeypotRef}
            defaultValue=""
          />
        </div>

        {/* Nhiều bước: "Bước x/y" + tiêu đề bước + thanh tiến trình (chỉ khi có page_break tạo ≥ 2 trang) */}
        {isMultiStep && (
          <div ref={stepHeaderRef} tabIndex={-1} data-testid="form-step-progress" className="outline-none">
            <div className="flex items-baseline justify-between gap-3 text-xs text-gray-500">
              <span className="font-semibold text-gray-700">
                {t('publicForm.step.progress', { current: safePageIndex + 1, total: pageList.length })}
              </span>
              {currentPage.title && <span className="min-w-0 truncate text-right">{currentPage.title}</span>}
            </div>
            <div
              role="progressbar"
              aria-valuemin={1}
              aria-valuemax={pageList.length}
              aria-valuenow={safePageIndex + 1}
              aria-label={t('publicForm.step.progress', { current: safePageIndex + 1, total: pageList.length })}
              className="mt-1.5 h-1.5 w-full rounded-full bg-gray-200 overflow-hidden"
            >
              <div
                className="h-full rounded-full bg-[color:var(--form-primary,#df5c0e)] transition-all"
                style={{ width: `${((safePageIndex + 1) / pageList.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Danh sách các trường của trang hiện tại. Lưới 2 cột ≥ sm: trường `width:'half'` chiếm 1 cột (hai trường half
            liền nhau đứng chung hàng), còn lại chiếm cả hàng; < sm (hoặc singleColumn) luôn 1 cột. */}
        <div className={`grid grid-cols-1 ${singleColumn ? '' : 'sm:grid-cols-2'} gap-x-4 gap-y-5`}>
        {currentPage.fields.map((field) => {
          const { key, label, type, required, options = [] } = field;
          const fullRowClass = singleColumn ? '' : 'sm:col-span-2';
          const helpText = typeof field.helpText === 'string' ? field.helpText.trim() : '';

          // Khối hiển thị: không có giá trị / ô nhập — luôn cả hàng. (page_break không bao giờ tới đây: splitFormPages
          // đã dùng nó làm ranh giới trang.)
          if (type === 'heading') {
            return (
              <div key={key} data-block="heading" className={`min-w-0 pt-1 ${fullRowClass}`}>
                <h2 className="text-lg font-semibold text-gray-900 break-words">{label}</h2>
                {helpText && (
                  <p className="mt-0.5 text-sm text-gray-600 leading-snug whitespace-pre-line break-words">{helpText}</p>
                )}
              </div>
            );
          }
          if (type === 'paragraph') {
            return (
              <p
                key={key}
                data-block="paragraph"
                className={`min-w-0 text-sm text-gray-700 leading-relaxed whitespace-pre-line break-words ${fullRowClass}`}
              >
                {label}
              </p>
            );
          }

          const val = answers[key] ?? '';
          const fieldError = clientErrors[key];
          const fieldControlId = ['radio', 'checkbox', 'rating', 'yes_no'].includes(type) ? undefined : `field_${key}`;
          // Chữ hướng dẫn nhỏ dưới nhãn (PR-3) + gợi ý trong ô nhập (placeholder) — thiếu thì không hiện gì.
          const helpId = helpText ? `help_${key}` : undefined;
          const inputPlaceholder = typeof field.placeholder === 'string' && field.placeholder.trim() ? field.placeholder.trim() : undefined;
          const fieldSpanClass = field.width === 'half' ? '' : fullRowClass;

          return (
            <div key={key} className={`min-w-0 space-y-1.5 ${fieldSpanClass}`}>
              <label
                htmlFor={fieldControlId}
                className="block text-sm font-medium text-gray-800 break-words"
              >
                {label}
                {required && <span className="text-red-500 ml-1">*</span>}
              </label>

              {helpText && (
                <p id={helpId} className="text-xs text-gray-500 leading-snug whitespace-pre-line break-words">
                  {helpText}
                </p>
              )}

              {/* short_text */}
              {type === 'short_text' && (
                <input
                  id={fieldControlId}
                  type="text"
                  maxLength={500}
                  placeholder={inputPlaceholder}
                  aria-describedby={helpId}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 ${
                    fieldError
                      ? 'border-red-300 focus:ring-red-200'
                      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                  }`}
                  value={val}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  disabled={isSubmitting || previewMode}
                />
              )}

              {/* long_text */}
              {type === 'long_text' && (
                <textarea
                  id={fieldControlId}
                  rows={4}
                  maxLength={5000}
                  placeholder={inputPlaceholder}
                  aria-describedby={helpId}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 resize-y ${
                    fieldError
                      ? 'border-red-300 focus:ring-red-200'
                      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                  }`}
                  value={val}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  disabled={isSubmitting || previewMode}
                />
              )}

              {/* email */}
              {type === 'email' && (
                <input
                  id={fieldControlId}
                  type="email"
                  maxLength={255}
                  placeholder={inputPlaceholder}
                  aria-describedby={helpId}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 ${
                    fieldError
                      ? 'border-red-300 focus:ring-red-200'
                      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                  }`}
                  value={val}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  disabled={isSubmitting || previewMode}
                />
              )}

              {/* phone */}
              {type === 'phone' && (
                <input
                  id={fieldControlId}
                  type="tel"
                  maxLength={50}
                  placeholder={inputPlaceholder}
                  aria-describedby={helpId}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 ${
                    fieldError
                      ? 'border-red-300 focus:ring-red-200'
                      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                  }`}
                  value={val}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  disabled={isSubmitting || previewMode}
                />
              )}

              {/* number */}
              {type === 'number' && (
                <input
                  id={fieldControlId}
                  type="number"
                  placeholder={inputPlaceholder}
                  aria-describedby={helpId}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 ${
                    fieldError
                      ? 'border-red-300 focus:ring-red-200'
                      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                  }`}
                  value={val}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  disabled={isSubmitting || previewMode}
                />
              )}

              {/* date */}
              {type === 'date' && (
                <input
                  id={fieldControlId}
                  type="date"
                  aria-describedby={helpId}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 ${
                    fieldError
                      ? 'border-red-300 focus:ring-red-200'
                      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                  }`}
                  value={val}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  disabled={isSubmitting || previewMode}
                />
              )}

              {/* select */}
              {type === 'select' && (
                <select
                  id={fieldControlId}
                  aria-describedby={helpId}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 bg-white ${
                    fieldError
                      ? 'border-red-300 focus:ring-red-200'
                      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                  }`}
                  value={val}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  disabled={isSubmitting || previewMode}
                >
                  <option value="">{t('publicForm.selectPlaceholder')}</option>
                  {options.map((opt, i) => {
                    const optVal = typeof opt === 'object' ? opt.value : opt;
                    const optLbl = typeof opt === 'object' ? opt.label : opt;
                    return (
                      <option key={optVal || i} value={optVal}>
                        {optLbl}
                      </option>
                    );
                  })}
                </select>
              )}

              {/* radio */}
              {type === 'radio' && (
                <div className="space-y-2 pt-1">
                  {options.map((opt, i) => {
                    const optVal = typeof opt === 'object' ? opt.value : opt;
                    const optLbl = typeof opt === 'object' ? opt.label : opt;
                    const id = `radio-${key}-${i}`;
                    return (
                      <label
                        key={optVal || i}
                        htmlFor={id}
                        className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-700"
                      >
                        <input
                          id={id}
                          type="radio"
                          name={key}
                          value={optVal}
                          checked={val === optVal}
                          onChange={(e) => handleFieldChange(key, e.target.value)}
                          disabled={isSubmitting || previewMode}
                          className="h-4 w-4 text-[color:var(--form-primary,#df5c0e)] focus:ring-primary-500 border-gray-300"
                        />
                        <span>{optLbl}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* checkbox */}
              {type === 'checkbox' && (
                <div className="space-y-2 pt-1">
                  {options.map((opt, i) => {
                    const optVal = typeof opt === 'object' ? opt.value : opt;
                    const optLbl = typeof opt === 'object' ? opt.label : opt;
                    const isChecked = Array.isArray(val) && val.includes(optVal);
                    const id = `chk-${key}-${i}`;
                    return (
                      <label
                        key={optVal || i}
                        htmlFor={id}
                        className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-700"
                      >
                        <input
                          id={id}
                          type="checkbox"
                          value={optVal}
                          checked={isChecked}
                          onChange={() => handleCheckboxItemToggle(key, optVal)}
                          disabled={isSubmitting || previewMode}
                          className="h-4 w-4 rounded text-[color:var(--form-primary,#df5c0e)] focus:ring-primary-500 border-gray-300"
                        />
                        <span>{optLbl}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {/* time */}
              {type === 'time' && (
                <input
                  id={fieldControlId}
                  type="time"
                  aria-describedby={helpId}
                  className={`w-full px-3.5 py-2.5 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 ${
                    fieldError
                      ? 'border-red-300 focus:ring-red-200'
                      : 'border-gray-300 focus:border-primary-500 focus:ring-primary-100'
                  }`}
                  value={val}
                  onChange={(e) => handleFieldChange(key, e.target.value)}
                  disabled={isSubmitting || previewMode}
                />
              )}

              {/* rating: 1–5 sao. Bấm lại đúng sao đang chọn = bỏ chọn (trường không bắt buộc cần xoá được). */}
              {type === 'rating' && (
                <div role="radiogroup" aria-label={label} aria-describedby={helpId} className="flex items-center gap-1 pt-0.5">
                  {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map((n) => {
                    const current = Number(val) || 0;
                    return (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={current === n}
                        aria-label={t('publicForm.rating.starLabel', { count: n })}
                        disabled={isSubmitting || previewMode}
                        onClick={() => handleFieldChange(key, current === n ? '' : n)}
                        className={`rounded p-0.5 text-3xl leading-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-200 disabled:cursor-not-allowed ${
                          current >= n ? 'text-amber-400' : 'text-gray-300 hover:text-amber-300'
                        }`}
                      >
                        ★
                      </button>
                    );
                  })}
                  {Number(val) > 0 && (
                    <span className="ml-2 text-xs text-gray-500">
                      {Number(val)}/{RATING_MAX}
                    </span>
                  )}
                </div>
              )}

              {/* yes_no */}
              {type === 'yes_no' && (
                <div role="radiogroup" aria-label={label} aria-describedby={helpId} className="flex items-center gap-6 pt-1">
                  {['yes', 'no'].map((choice) => {
                    const id = `yn-${key}-${choice}`;
                    return (
                      <label
                        key={choice}
                        htmlFor={id}
                        className="flex items-center gap-2.5 cursor-pointer text-sm text-gray-700"
                      >
                        <input
                          id={id}
                          type="radio"
                          name={key}
                          value={choice}
                          checked={val === choice}
                          onChange={() => handleFieldChange(key, choice)}
                          disabled={isSubmitting || previewMode}
                          className="h-4 w-4 text-[color:var(--form-primary,#df5c0e)] focus:ring-primary-500 border-gray-300"
                        />
                        <span>{choice === 'yes' ? t('publicForm.yes') : t('publicForm.no')}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {fieldError && (
                <p className="text-xs text-red-600 mt-1">{fieldError}</p>
              )}
            </div>
          );
        })}
        </div>

        {/* Chọn khung giờ đặt lịch: chỉ hiện khi form.booking?.enabled, và (nhiều bước) chỉ ở TRANG CUỐI */}
        {bookingEnabled && isLastPage && (
          <BookingSlotPicker
            slots={slots}
            isLoading={slotsLoading}
            loadError={slotsLoadError}
            selected={selectedSlot}
            onSelect={handleSelectSlot}
            onPrevWeek={handlePrevWeek}
            onNextWeek={handleNextWeek}
            canGoPrev={canGoPrevWeek}
            canGoNext={canGoNextWeek}
            disabled={isSubmitting || previewMode}
            mock={bookingMock}
            error={clientErrors.__booking}
          />
        )}

        {/* Ô đồng ý tiếp thị: chỉ hiện khi consentEnabled = true (nhiều bước: ở trang cuối, cạnh nút gửi) */}
        {settings.consentEnabled === true && isLastPage && (
          <div className="pt-2">
            <label className="flex items-start gap-3 cursor-pointer text-sm text-gray-700 select-none">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                disabled={isSubmitting || previewMode}
                className="mt-0.5 h-4 w-4 rounded text-[color:var(--form-primary,#df5c0e)] focus:ring-primary-500 border-gray-300"
              />
              <span className="leading-snug">
                {(typeof settings.consentText === 'string' && settings.consentText.trim()) || t('publicForm.consentLabel')}
              </span>
            </label>
          </div>
        )}

        {/* Điều hướng + nút gửi: trang giữa có "Tiếp", trang cuối có nút gửi; từ trang 2 trở đi có "Quay lại" */}
        <div className="pt-4 flex items-stretch gap-3">
          {isMultiStep && safePageIndex > 0 && (
            <button
              type="button"
              onClick={handleGoBack}
              disabled={isSubmitting}
              className="shrink-0 py-3 px-5 rounded-xl font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('publicForm.step.back')}
            </button>
          )}
          {/* key RIÊNG cho hai nút: cùng vị trí, cùng thẻ <button> nên không có key thì React tái dùng một nút DOM và chỉ đổi
              type "button" → "submit" NGAY trong lúc xử lý click "Tiếp"; trình duyệt thật chạy hành vi mặc định của
              click SAU đó nên gửi luôn biểu mẫu khi vừa sang trang cuối (lỗi bắt được bằng ảnh chụp 12/10, jsdom không thấy
              vì act gom cập nhật). Có key → nút "Tiếp" bị gỡ khỏi DOM, không còn là nút submit. */}
          {isLastPage ? (
            <button
              key="submit"
              type="submit"
              disabled={isSubmitting || previewMode}
              className="w-full py-3 px-6 rounded-xl font-medium text-[color:var(--form-primary-text,#ffffff)] bg-[color:var(--form-primary,#df5c0e)] hover:brightness-95 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isSubmitting ? t('publicForm.submitting') : submitButtonText}
            </button>
          ) : (
            <button
              key="next"
              type="button"
              onClick={handleGoNext}
              disabled={isSubmitting}
              className="w-full py-3 px-6 rounded-xl font-medium text-[color:var(--form-primary-text,#ffffff)] bg-[color:var(--form-primary,#df5c0e)] hover:brightness-95 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {t('publicForm.step.next')}
            </button>
          )}
        </div>
      </form>
      </div>
    </div>
  );
}
