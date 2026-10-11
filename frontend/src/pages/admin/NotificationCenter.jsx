/**
 * Trung tâm Chiến dịch Email — bố cục trình soạn (11/10/2026)
 * ----------------------------------------------------------------
 * Kiểu "Tạo landing page" của /app (components/editor/AdminEditorShell): thanh trên 52px + vùng soạn chiếm trọn,
 * MỌI cấu hình gom vào modal Cài đặt.
 *
 * Thanh trên: [icon + tên] — [3 chế độ: Lịch sử · Soạn mẫu · Gửi chiến dịch] — [Cài đặt] [Công cụ] | [nút chính theo chế độ]
 *   1) Lịch sử        — bảng danh sách + hành động (toàn chiều rộng)
 *   2) Soạn mẫu       — chọn 1 trong 6 dạng, soạn HTML (trái) + xem trước (phải); nút chính "Lưu thành mẫu"
 *   3) Gửi chiến dịch — chọn dạng / mẫu đã lưu, xem trước + tóm tắt; nút chính "Gửi ngay" / "Hẹn giờ" / "Lên lịch định kỳ"
 * Cài đặt: Kênh gửi · Đối tượng · Lịch gửi · Cấu hình kênh (theo sự kiện).
 *
 * CHỈ ĐỔI BỐ CỤC: state, handler, lời gọi API và payload gửi đi giữ nguyên so với bản trước (kênh / đối tượng / lịch chọn trong
 * Cài đặt vẫn vào payload như cũ — xem NotificationCenter.layout.spec.jsx).
 *
 * Subject + body tách riêng; map xuống `title` + `message` khi gửi.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineAdjustments,
  HiOutlineArrowRight,
  HiOutlineBookmark,
  HiOutlineClock,
  HiOutlineCode,
  HiOutlineEye,
  HiOutlineInformationCircle,
  HiOutlineMail,
  HiOutlineMailOpen,
  HiOutlinePaperAirplane,
  HiOutlinePencil,
  HiOutlineRefresh,
  HiOutlineSparkles,
  HiOutlineUserGroup,
} from 'react-icons/hi';
import { FaBell, FaClock } from 'react-icons/fa';
import adminNotificationApiService from '../../features/admin/services/adminNotificationApi.service';
import {
  NOTIFICATION_CHANNEL_ORDER,
  defaultChannelsFromSettings,
  disabledChannelsFromSettings,
  isValidBroadcastLink,
} from '../../features/admin/utils/notificationChannels.util';
import {
  renderFreeformPreview,
  TYPE_TEMPLATES,
} from '../../features/admin/utils/notificationTemplates.util';
import {
  TargetingPanel,
  ScheduleSelector,
  NotificationHistoryTable,
  EmailPreviewModal,
  EmailLogsModal,
  SaveAsTemplateModal,
  NotificationChannelSelector,
  NotificationEventSettingsPanel,
} from '../../features/admin/components';
import {
  AdminEditorShell,
  EditorSettingsModal,
  EditorTopbar,
  TopbarButton,
  TopbarDivider,
  TopbarSaveButton,
  TopbarSegmented,
  TopbarSettingsButton,
  TopbarToolsMenu,
} from '../../components/editor/AdminEditorShell';
import { useAuthStore } from '../../stores/authStore.js';
import { useI18n } from '../../i18n';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const formatDateTime = (value) => {
  if (!value) return '—';
  return new Date(value).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

function buildPayloadFromHtml({ subject, bodyHtml, type, targeting, schedule, channels, link }) {
  // Map từ form "Mẫu email" (bodyHtml = HTML admin soạn) sang payload BE.
  // QUAN TRỌNG (19/09):
  //  - `message` = text thuần (BE dùng cho email client text-mode fallback).
  //  - `html_content` = HTML admin soạn (BE dùng cho SMTP HTML body).
  //  - Trước đây chỉ truyền `message = bodyHtml` → BE lưu HTML vào column
  //    TEXT → render escape → mail hiển thị "&lt;h1&gt;..." thay vì HTML.
  const html = String(bodyHtml || '').trim();
  return {
    type,
    title: String(subject || '').trim(),
    title_en: '',
    message: html ? htmlToPlainText(html) : '',
    message_en: '',
    html_content: html || null,
    // Kênh gửi lúc này (email / chuông). Liên kết chỉ có nghĩa với chuông: backend đọc `metadata.link`.
    channels,
    ...(channels.includes('in_app') && String(link || '').trim() ? { metadata: { link: String(link).trim() } } : {}),
    target_roles: targeting.roles,
    target_plans: targeting.plans,
    target_statuses: targeting.statuses,
    target_user_ids: targeting.user_ids,
    target_emails: targeting.emails,
    registered_before: targeting.registered_before,
    registered_after: targeting.registered_after,
    schedule_type: schedule.schedule_type,
    scheduled_at: schedule.scheduled_at,
    recurrence_pattern: schedule.recurrence_pattern,
    recurrence_end_date: schedule.recurrence_end_date,
  };
}

/**
 * Trích text thuần từ HTML admin soạn (dùng cho `message` plain-text fallback).
 * Match với logic của EmailPreviewModal.stripHtmlToText nhưng đơn giản hơn
 * (chỉ dùng cho payload, không cần render).
 */
function htmlToPlainText(html) {
  if (!html || typeof html !== 'string') return '';
  return html
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function validatePayload(payload) {
  if (!payload.title?.trim()) {
    return 'Vui lòng nhập tiêu đề email.';
  }
  if (!payload.message?.trim()) {
    return 'Vui lòng nhập nội dung HTML.';
  }
  if (payload.schedule_type === 'now') {
    const hasRecipients =
      (payload.target_user_ids?.length || 0) > 0 || (payload.target_emails?.length || 0) > 0;
    if (!hasRecipients) return 'Vui lòng chọn ít nhất một người nhận (user IDs hoặc email)';
  } else {
    const hasTargeting =
      (payload.target_roles?.length || 0) > 0 ||
      (payload.target_plans?.length || 0) > 0 ||
      (payload.target_statuses?.length || 0) > 0 ||
      (payload.target_user_ids?.length || 0) > 0 ||
      (payload.target_emails?.length || 0) > 0 ||
      payload.registered_before ||
      payload.registered_after;
    if (!hasTargeting) return 'Vui lòng chọn ít nhất một tiêu chí người nhận';
  }
  return null;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const CARD_CLASS = 'rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface shadow-sm';

/** Biểu tượng (i) kèm gợi ý — thay cho các dòng chú thích dài trên đầu trang. */
function HintIcon({ text }) {
  return (
    <span
      role="img"
      tabIndex={0}
      title={text}
      aria-label={text}
      className="inline-flex cursor-help text-slate-400 dark:text-dk-muted hover:text-orange-500 dark:hover:text-orange-400 focus:outline-none focus-visible:text-orange-500"
    >
      <HiOutlineInformationCircle className="h-4 w-4" />
    </span>
  );
}

/**
 * Chọn chế độ trên màn hẹp: `center` của EditorTopbar ẩn dưới md nên chế độ phải có chỗ khác để bấm.
 * Dùng nút `aria-pressed` (không phải role="tab") để không trùng với TopbarSegmented trong cây DOM.
 */
function MobileModeStrip({ value, onChange, options, ariaLabel }) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="md:hidden shrink-0 flex gap-1 border-b border-gray-200/90 dark:border-dk-border bg-white dark:bg-dk-surface p-2"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-semibold transition-colors ${
              active
                ? 'border-orange-200 dark:border-orange-800/60 bg-orange-50 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300'
                : 'border-gray-200 dark:border-dk-border bg-white dark:bg-dk-raised text-gray-600 dark:text-dk-text'
            }`}
          >
            {opt.icon ? <opt.icon className="h-3.5 w-3.5 shrink-0" /> : null}
            <span className="truncate">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function TypeChips({ value, onChange, className = 'flex flex-wrap gap-1.5' }) {
  const { t } = useI18n();
  return (
    <div className={className} role="group" aria-label={t('notificationCenter.studio.emailType')}>
      {Object.values(TYPE_TEMPLATES).map((tpl) => {
        const selected = value === tpl.key;
        return (
          <button
            key={tpl.key}
            type="button"
            onClick={() => onChange(tpl.key)}
            aria-pressed={selected}
            className={`shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
              selected
                ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                : 'border-slate-300 dark:border-dk-border-strong bg-white dark:bg-dk-surface text-slate-700 dark:text-dk-text hover:border-orange-300 dark:hover:border-orange-700 hover:bg-orange-50 dark:hover:bg-orange-950/60 hover:text-orange-700 dark:hover:text-orange-300'
            }`}
          >
            {tpl.label}
          </button>
        );
      })}
    </div>
  );
}

function HtmlEditor({ value, onChange, variables, bodyRef }) {
  const { t } = useI18n();
  const insertVariable = (variable) => {
    const token = `{{${variable}}}`;
    const input = bodyRef.current;
    const start = input?.selectionStart ?? value.length;
    const end = input?.selectionEnd ?? start;
    const nextValue = value.slice(0, start) + token + value.slice(end);
    onChange(nextValue);
    window.requestAnimationFrame(() => {
      input?.focus();
      input?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <div className="flex flex-1 min-h-0 flex-col gap-3">
      <div className="shrink-0 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-slate-800 dark:text-dk-text">{t('notificationCenter.studio.variables')}</span>
          <HintIcon text={t('notificationCenter.studio.variablesHint')} />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {variables.map((variable) => (
            <button
              key={variable}
              type="button"
              onClick={() => insertVariable(variable)}
              className="rounded-md border border-slate-300 dark:border-dk-border-strong bg-white dark:bg-dk-surface px-2 py-0.5 font-mono text-[11px] text-slate-700 dark:text-dk-text hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/60 hover:text-orange-700 dark:hover:text-orange-300"
            >
              {`{{${variable}}}`}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col gap-1.5">
        <div className="flex shrink-0 items-center justify-between">
          <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-dk-text">
            {t('notificationCenter.studio.htmlCode')}
            <HintIcon text={t('notificationCenter.studio.htmlHint')} />
          </span>
          <span className="font-mono text-[10px] text-slate-400 dark:text-dk-muted">{value.length} chars</span>
        </div>
        <textarea
          ref={bodyRef}
          aria-label="Mã HTML email"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="<p>Tiêu đề email...</p>"
          rows={14}
          spellCheck={false}
          className="w-full flex-1 min-h-[280px] lg:min-h-0 resize-none rounded-lg border border-slate-300 dark:border-dk-border-strong bg-white dark:bg-dk-inset px-3 py-3 font-mono text-xs leading-5 text-slate-800 dark:text-dk-text placeholder-slate-400 dark:placeholder-dk-muted focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        />
      </div>
    </div>
  );
}

function LivePreview({ html, subject, templateKey, className = '' }) {
  const { t } = useI18n();
  const previewHtml = useMemo(
    () => renderFreeformPreview({ templateKey, bodyHtml: html, subject }),
    [templateKey, html, subject],
  );
  return (
    <section className={`flex min-h-0 flex-col overflow-hidden ${CARD_CLASS} ${className}`}>
      <div className="flex shrink-0 items-center gap-3 border-b border-slate-200 dark:border-dk-border px-4 py-2.5">
        <h2 className="flex shrink-0 items-center gap-2 text-sm font-semibold text-slate-900 dark:text-dk-text">
          <HiOutlineEye className="h-4 w-4 text-orange-500 dark:text-orange-400" />
          {t('notificationCenter.studio.previewTitle')}
        </h2>
        <p className="min-w-0 flex-1 truncate text-right text-xs text-slate-500 dark:text-dk-text2">
          {subject || t('notificationCenter.studio.noSubject')}
        </p>
      </div>
      {html ? (
        // giữ sáng: thân thư xem trước giống thật, luôn nền trắng (khung bao quanh vẫn theo chế độ tối)
        <iframe
          title="Email Preview"
          srcDoc={previewHtml}
          sandbox=""
          className="w-full flex-1 min-h-[480px] lg:min-h-0 bg-white"
        />
      ) : (
        <div className="flex min-h-[240px] flex-1 items-center justify-center text-sm text-slate-400 dark:text-dk-muted">
          {t('notificationCenter.studio.noContent')}
        </div>
      )}
    </section>
  );
}

/** Vòng quay thay icon nút chính khi đang gửi (TopbarSaveButton chỉ tự quay khi `saving`, mà nhãn "Đang lưu..." sai ngữ cảnh gửi). */
function SpinIcon({ className = '' }) {
  return <HiOutlineRefresh className={`${className} animate-spin`} />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const VARIABLES = ['user_name', 'user_email', 'user_plan', 'product_name', 'current_date', 'dashboard_url', 'support_email'];

export default function NotificationCenter() {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState('history');
  const [busy, setBusy] = useState(false);
  // Modal Cài đặt (11/10/2026): kênh gửi / đối tượng / lịch gửi / cấu hình kênh theo sự kiện. Chỉ là chỗ ĐẶT các điều khiển —
  // giá trị (channels, targeting, schedule…) vẫn nằm ở state của trang như trước.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('channels');
  const openSettings = useCallback((tab) => {
    if (tab) setSettingsTab(tab);
    setSettingsOpen(true);
  }, []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  // Tab "Mẫu email" state
  const [typeKey, setTypeKey] = useState('announcement');
  // drafts: { [type]: { subject, bodyHtml } } — lưu bản đã sửa theo từng type
  const initialDrafts = useMemo(
    () => Object.fromEntries(
      Object.entries(TYPE_TEMPLATES).map(([k, tpl]) => [k, { subject: tpl.subject, bodyHtml: tpl.bodyHtml }]),
    ),
    [],
  );
  const [drafts, setDrafts] = useState(initialDrafts);
  const draft = drafts[typeKey] || { subject: '', bodyHtml: '' };
  const bodyRef = useRef(null);

  // Tab "Gửi" state
  const [sendTypeKey, setSendTypeKey] = useState('announcement');
  const [targeting, setTargeting] = useState({});
  const [schedule, setSchedule] = useState({ schedule_type: 'now' });
  // Kênh gửi của bản tin (email / chuông). Mặc định lấy theo cấu hình sự kiện `admin_broadcast` (tab "Cấu hình kênh"),
  // cho tới khi admin tự bấm chọn.
  const [channels, setChannels] = useState([...NOTIFICATION_CHANNEL_ORDER]);
  const [broadcastLink, setBroadcastLink] = useState('');
  // Kênh đang tắt trong tab "Cấu hình kênh": checkbox bị khoá, backend cũng trả 400 nếu cố chọn.
  const [disabledChannels, setDisabledChannels] = useState([]);
  const channelsTouchedRef = useRef(false);

  // History
  const [notifications, setNotifications] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, limit: 20, total: 0, totalPages: 0 });
  const [loadingList, setLoadingList] = useState(false);

  // Modals
  const [previewModal, setPreviewModal] = useState({ open: false, notification: null });
  const [logsModal, setLogsModal] = useState({ open: false, notificationId: null, title: '' });

  // Save-as template modal + saved templates cache (dung o tab "Gui")
  const [saveAsModal, setSaveAsModal] = useState({
    open: false,
    submitting: false,
    errorMessage: '',
  });
  const [savedTemplates, setSavedTemplates] = useState([]);
  const [selectedSavedTemplateId, setSelectedSavedTemplateId] = useState('');

  // Role check (de an nut "Luu thanh mau" neu khong phai super admin)
  const currentUser = useAuthStore((state) => state.user);
  const userRoleCode = String(currentUser?.roleCode || '').trim().toLowerCase();
  const userRoleRaw = String(currentUser?.role || '').trim().toLowerCase();
  // Trong convention hiện tai cua repo: role === 'admin' trong DB = super admin.
  // Frontend cung cap roleCode === 'admin' qua authStore. Chap nhan ca hai dang.
  const isSuperAdmin = userRoleCode === 'admin' || userRoleRaw === 'admin' || userRoleCode === 'superadmin' || userRoleRaw === 'superadmin';

  // ----------------------------------------------------------------- Loaders

  const loadNotifications = useCallback(
    async (page = 1) => {
      setLoadingList(true);
      try {
        const response = await adminNotificationApiService.getNotifications({
          page,
          limit: pagination.limit || 20,
        });
        if (response.data?.success) {
          setNotifications(response.data.data.data);
          setPagination(response.data.data.pagination);
        }
      } catch (error) {
        console.error('Error loading notifications:', error);
        toast.error('Không thể tải danh sách thông báo');
      } finally {
        setLoadingList(false);
      }
    },
    [pagination.limit],
  );

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  // Kênh mặc định cho bản tin mới theo cấu hình `admin_broadcast`. Lỗi đọc cấu hình → giữ mặc định cả hai kênh.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await adminNotificationApiService.getNotificationEvents();
        if (cancelled || channelsTouchedRef.current || !response.data?.success) return;
        const entry = (response.data.data || []).find((item) => item.key === 'admin_broadcast');
        setDisabledChannels(disabledChannelsFromSettings(entry?.settings));
        setChannels(defaultChannelsFromSettings(entry?.settings));
      } catch (error) {
        console.error('[NotificationCenter] load admin_broadcast channel defaults error:', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Admin vừa lưu cấu hình `admin_broadcast` ở tab "Cấu hình kênh": cập nhật kênh được phép và bỏ chọn kênh vừa tắt.
  const onEventSaved = useCallback((entry) => {
    if (entry?.key !== 'admin_broadcast') return;
    const off = disabledChannelsFromSettings(entry.settings);
    setDisabledChannels(off);
    setChannels((current) => current.filter((channel) => !off.includes(channel)));
  }, []);

  const onChannelsChange = useCallback((next) => {
    channelsTouchedRef.current = true;
    setChannels(next);
  }, []);

  // Load danh sach mau da luu (cho dropdown o tab "Gui")
  const loadSavedTemplates = useCallback(async () => {
    try {
      const response = await adminNotificationApiService.listTemplates();
      if (response.data?.success) {
        setSavedTemplates(response.data.data || []);
      }
    } catch (error) {
      console.error('[NotificationCenter] loadSavedTemplates error:', error);
    }
  }, []);

  useEffect(() => {
    loadSavedTemplates();
  }, [loadSavedTemplates]);

  // Save-as handlers
  const openSaveAsModal = useCallback(() => {
    const current = drafts[typeKey] || { subject: '', bodyHtml: '' };
    if (!current.subject.trim() && !current.bodyHtml.trim()) {
      toast.error('Bản soạn đang trống — hãy nhập subject hoặc HTML trước');
      return;
    }
    setSaveAsModal({ open: true, submitting: false, errorMessage: '' });
  }, [drafts, typeKey]);

  const closeSaveAsModal = useCallback(() => {
    setSaveAsModal({ open: false, submitting: false, errorMessage: '' });
  }, []);

  const submitSaveAs = useCallback(
    async ({ name, slug, description }) => {
      const current = drafts[typeKey] || { subject: '', bodyHtml: '' };
      setSaveAsModal((m) => ({ ...m, submitting: true, errorMessage: '' }));
      try {
        const response = await adminNotificationApiService.createTemplate({
          type_key: typeKey,
          slug,
          name,
          description,
          subject: current.subject,
          body_html: current.bodyHtml,
          schedule_type: 'now',
        });
        if (response.data?.success) {
          toast.success(`Đã lưu mẫu "${name}"`);
          setSaveAsModal({ open: false, submitting: false, errorMessage: '' });
          await loadSavedTemplates();
          return true;
        }
        const msg = response.data?.message || 'Không thể lưu mẫu';
        setSaveAsModal((m) => ({ ...m, submitting: false, errorMessage: msg }));
        return false;
      } catch (error) {
        const status = error.response?.status;
        const data = error.response?.data;
        let msg = data?.message || error.message || 'Có lỗi xảy ra';
        if (status === 403) {
          msg = 'Chỉ super admin mới có quyền lưu mẫu mới';
        } else if (status === 409) {
          msg = data?.message || 'Slug đã tồn tại cho dạng email này — chọn tên khác';
        }
        setSaveAsModal((m) => ({ ...m, submitting: false, errorMessage: msg }));
        toast.error(msg);
        return false;
      }
    },
    [drafts, typeKey, loadSavedTemplates],
  );

  const onPickSavedTemplate = useCallback(
    (event) => {
      const id = event.target.value;
      setSelectedSavedTemplateId(id);
      if (!id) return;
      const tpl = savedTemplates.find((t) => String(t.id) === String(id));
      if (!tpl) return;
      setSendTypeKey(tpl.type_key);
      setDrafts((current) => ({
        ...current,
        [tpl.type_key]: {
          subject: tpl.subject || '',
          bodyHtml: tpl.body_html || '',
        },
      }));
      toast.success(`Đã fill mẫu "${tpl.name}" vào form`);
    },
    [savedTemplates],
  );

  // ----------------------------------------------------------------- Template actions

  const applyTemplate = useCallback((key) => {
    const tpl = TYPE_TEMPLATES[key];
    if (!tpl) return;
    setTypeKey(key);
    setDrafts((current) => ({ ...current, [key]: { subject: tpl.subject, bodyHtml: tpl.bodyHtml } }));
  }, []);

  const clearTemplate = useCallback(() => {
    setDrafts((current) => ({ ...current, [typeKey]: { subject: '', bodyHtml: '' } }));
  }, [typeKey]);

  // ----------------------------------------------------------------- Send actions

  const submit = useCallback(async () => {
    const draftForSend = drafts[sendTypeKey] || TYPE_TEMPLATES[sendTypeKey] || { subject: '', bodyHtml: '' };
    const payload = buildPayloadFromHtml({
      subject: draftForSend.subject,
      bodyHtml: draftForSend.bodyHtml,
      type: sendTypeKey,
      targeting,
      schedule,
      channels,
      link: broadcastLink,
    });
    const validationError = validatePayload(payload);
    if (validationError) {
      toast.error(validationError);
      return;
    }
    if (channels.length === 0) {
      toast.error(t('notificationCenter.channels.noneSelected'));
      return;
    }
    if (channels.includes('in_app') && !isValidBroadcastLink(broadcastLink)) {
      toast.error(t('notificationCenter.channels.linkInvalid'));
      return;
    }

    setBusy(true);
    try {
      if (payload.schedule_type === 'now') {
        const response = await adminNotificationApiService.sendDirect(payload);
        if (response.data?.success) {
          toast.success(response.data.message || 'Gửi thông báo thành công');
          await loadNotifications();
          setActiveTab('history');
        } else {
          toast.error(response.data?.message || 'Có lỗi xảy ra');
        }
        return;
      }

      const createRes = await adminNotificationApiService.createNotification(payload);
      if (!createRes.data?.success) {
        toast.error(createRes.data?.message || 'Không thể tạo thông báo');
        return;
      }
      const notificationId = createRes.data.data.id;

      if (payload.schedule_type === 'scheduled') {
        const scheduleRes = await adminNotificationApiService.scheduleNotification(
          notificationId,
          new Date(payload.scheduled_at).toISOString(),
        );
        if (!scheduleRes.data?.success) {
          toast.error(scheduleRes.data?.message || 'Không thể hẹn giờ thông báo');
          return;
        }
        toast.success('Đã hẹn giờ thông báo thành công');
      } else {
        toast.success('Đã tạo thông báo định kỳ thành công');
      }
      await loadNotifications();
      setActiveTab('history');
    } catch (error) {
      const status = error.response?.status;
      if (status === 409) toast.error(error.response?.data?.message || 'Thông báo đang được xử lý, thử lại sau');
      else toast.error(error.response?.data?.message || error.message || 'Có lỗi xảy ra');
    } finally {
      setBusy(false);
    }
  }, [sendTypeKey, targeting, schedule, drafts, channels, broadcastLink, loadNotifications, t]);

  const sendOne = useCallback(
    async (notification) => {
      if (!window.confirm(`Gửi thông báo "${notification.title}"?`)) return;
      setBusy(true);
      try {
        const response = await adminNotificationApiService.sendNotification(notification.id);
        if (response.data?.success) {
          toast.success(response.data.message);
          await loadNotifications();
        } else toast.error(response.data?.message);
      } catch (error) {
        const status = error.response?.status;
        if (status === 409) toast.error(error.response?.data?.message || 'Thông báo đang được xử lý');
        else toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
      } finally {
        setBusy(false);
      }
    },
    [loadNotifications],
  );

  const resendOne = useCallback(
    async (notification) => {
      if (!window.confirm(`Gửi lại thông báo "${notification.title}"?\n\nLưu ý: Có thể gửi trùng email cho những người đã nhận.`)) return;
      setBusy(true);
      try {
        const response = await adminNotificationApiService.sendDirect({
          type: notification.type,
          priority: notification.priority,
          title: notification.title,
          title_en: notification.title_en,
          message: notification.message,
          message_en: notification.message_en,
          target_roles: notification.target_roles,
          target_plans: notification.target_plans,
          target_statuses: notification.target_statuses,
          target_user_ids: notification.target_user_ids,
          target_emails: notification.target_emails,
          registered_before: notification.registered_before,
          registered_after: notification.registered_after,
          channels: notification.channels,
          metadata: notification.metadata,
        });
        if (response.data?.success) {
          toast.success(response.data.message);
          await loadNotifications();
        } else toast.error(response.data?.message);
      } catch (error) {
        toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
      } finally {
        setBusy(false);
      }
    },
    [loadNotifications],
  );

  const scheduleOne = useCallback(
    async (notification) => {
      const minDate = new Date(Date.now() + 60 * 1000);
      const minDateLocal = minDate.toLocaleString('sv-SE', { hour12: false }).replace(' ', ' ');
      const input = window.prompt(
        `Nhập thời gian hẹn (định dạng: YYYY-MM-DD HH:mm)\nPhải sau thời điểm: ${minDateLocal}`,
        minDateLocal.slice(0, 16),
      );
      if (!input) return;
      const dateRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
      if (!dateRegex.test(input)) {
        toast.error('Định dạng không đúng. Ví dụ: 2024-12-31 10:00');
        return;
      }
      const parsed = new Date(input).getTime();
      if (Number.isNaN(parsed) || parsed <= Date.now()) {
        toast.error('Thời gian hẹn giờ phải lớn hơn thời gian hiện tại ít nhất 1 phút');
        return;
      }
      setBusy(true);
      try {
        const response = await adminNotificationApiService.scheduleNotification(notification.id, new Date(input).toISOString());
        if (response.data?.success) {
          toast.success('Đã hẹn giờ thông báo');
          await loadNotifications();
        } else toast.error(response.data?.message);
      } catch (error) {
        const status = error.response?.status;
        if (status === 409) toast.error(error.response?.data?.message || 'Không thể hẹn giờ thông báo này');
        else toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
      } finally {
        setBusy(false);
      }
    },
    [loadNotifications],
  );

  const deleteOne = useCallback(
    async (notification) => {
      if (!window.confirm(`Xóa thông báo "${notification.title}"?`)) return;
      setBusy(true);
      try {
        const response = await adminNotificationApiService.deleteNotification(notification.id);
        if (response.data?.success) {
          toast.success('Đã xóa thông báo');
          await loadNotifications();
        } else toast.error(response.data?.message);
      } catch (error) {
        toast.error(error.response?.data?.message || 'Có lỗi xảy ra');
      } finally {
        setBusy(false);
      }
    },
    [loadNotifications],
  );

  // ----------------------------------------------------------------- Render

  const modeOptions = [
    { value: 'history', label: t('notificationCenter.studio.modeHistory'), icon: HiOutlineMailOpen },
    { value: 'templates', label: t('notificationCenter.studio.modeTemplates'), icon: HiOutlineCode },
    { value: 'send', label: t('notificationCenter.studio.modeSend'), icon: HiOutlinePaperAirplane },
  ];

  const settingsTabs = [
    { key: 'channels', label: t('notificationCenter.studio.tabChannels'), icon: HiOutlineMail },
    { key: 'audience', label: t('notificationCenter.studio.tabAudience'), icon: HiOutlineUserGroup },
    { key: 'schedule', label: t('notificationCenter.studio.tabSchedule'), icon: HiOutlineClock },
    { key: 'events', label: t('notificationCenter.tabs.eventConfig'), icon: HiOutlineAdjustments },
  ];

  // Nội dung chế độ "Gửi chiến dịch": lấy bản soạn của dạng đang chọn, rơi về mẫu gốc nếu chưa có.
  const sendHtml = drafts[sendTypeKey]?.bodyHtml || TYPE_TEMPLATES[sendTypeKey]?.bodyHtml || '';
  const sendSubject = drafts[sendTypeKey]?.subject || TYPE_TEMPLATES[sendTypeKey]?.subject || '';

  // Tóm tắt một dòng (kênh · đối tượng · thời gian) — chỉ để xem, sửa trong Cài đặt.
  const channelsSummary = channels.length
    ? channels.map((channel) => t(channel === 'email' ? 'notificationCenter.channels.chipEmail' : 'notificationCenter.channels.chipInApp')).join(' + ')
    : '—';
  const audienceCount = (targeting.user_ids?.length || 0) + (targeting.emails?.length || 0);
  const hasCriteria = Boolean(
    targeting.roles?.length || targeting.plans?.length || targeting.statuses?.length
    || targeting.registered_before || targeting.registered_after,
  );
  let audienceSummary = t('notificationCenter.studio.audienceNone');
  if (audienceCount > 0) audienceSummary = t('notificationCenter.studio.audienceCount', { count: audienceCount });
  else if (hasCriteria) audienceSummary = t('notificationCenter.studio.audienceCriteria');
  let timeSummary;
  if (schedule.schedule_type === 'now') timeSummary = t('notificationCenter.studio.timeNow');
  else if (schedule.schedule_type === 'scheduled') timeSummary = t('notificationCenter.studio.timeScheduled', { date: formatDateTime(schedule.scheduled_at) });
  else timeSummary = t('notificationCenter.studio.timeRecurring', { pattern: t(`notificationCenter.schedule.${schedule.recurrence_pattern || 'daily'}`).toLowerCase() });

  let sendLabel = t('notificationCenter.studio.sendRecurring');
  if (schedule.schedule_type === 'now') sendLabel = t('notificationCenter.studio.sendNow');
  else if (schedule.schedule_type === 'scheduled') sendLabel = t('notificationCenter.studio.schedule');

  let primaryAction = null;
  if (activeTab === 'templates') {
    // Màn hẹp dùng nhãn ngắn để tên trang trên thanh không bị cắt còn "Chiế…".
    const saveTemplateLabel = (
      <>
        <span className="sm:hidden">{t('notificationCenter.studio.saveTemplateShort')}</span>
        <span className="hidden sm:inline">{t('notificationCenter.studio.saveTemplate')}</span>
      </>
    );
    primaryAction = isSuperAdmin ? (
      <TopbarSaveButton onClick={openSaveAsModal} label={saveTemplateLabel} icon={HiOutlineBookmark} title={t('notificationCenter.saveAsTemplateTitle')} />
    ) : (
      <TopbarButton icon={HiOutlineBookmark} disabled title={t('notificationCenter.studio.superAdminOnly')}>
        {saveTemplateLabel}
      </TopbarButton>
    );
  } else if (activeTab === 'send') {
    primaryAction = (
      <TopbarSaveButton
        onClick={submit}
        disabled={busy}
        label={busy ? t('notificationCenter.studio.processing') : sendLabel}
        icon={busy ? SpinIcon : (schedule.schedule_type === 'scheduled' ? FaClock : FaBell)}
      />
    );
  }

  const toolItems = activeTab === 'templates'
    ? [
        {
          key: 'use-template',
          icon: HiOutlineCode,
          label: t('notificationCenter.studio.useTemplate', { label: TYPE_TEMPLATES[typeKey]?.label || typeKey }),
          description: t('notificationCenter.studio.useTemplateHint'),
          onClick: () => applyTemplate(typeKey),
        },
        {
          key: 'clear',
          icon: HiOutlineRefresh,
          label: t('notificationCenter.studio.clearDraft'),
          description: t('notificationCenter.studio.clearDraftHint'),
          onClick: clearTemplate,
          danger: true,
        },
      ]
    : [];

  const inputClass = 'w-full rounded-lg border border-slate-300 dark:border-dk-border-strong bg-white dark:bg-dk-inset px-3 py-2 text-sm text-slate-900 dark:text-dk-text placeholder-slate-400 dark:placeholder-dk-muted focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30';

  return (
    <AdminEditorShell
      topbar={(
        <EditorTopbar
          icon={HiOutlineSparkles}
          title={t('notificationCenter.studio.title')}
          center={(
            <TopbarSegmented
              ariaLabel={t('notificationCenter.studio.modesLabel')}
              value={activeTab}
              onChange={setActiveTab}
              options={modeOptions}
            />
          )}
          right={(
            <>
              <TopbarSettingsButton onClick={() => openSettings()} />
              <TopbarToolsMenu items={toolItems} />
              {primaryAction ? (
                <>
                  <TopbarDivider />
                  {primaryAction}
                </>
              ) : null}
            </>
          )}
        />
      )}
    >
      <div className="flex h-full min-h-0 flex-col">
        <MobileModeStrip
          ariaLabel={t('notificationCenter.studio.modesLabel')}
          value={activeTab}
          onChange={setActiveTab}
          options={modeOptions}
        />

        <div className="flex-1 min-h-0">
          {/* Chế độ 1 — Lịch sử: bảng toàn chiều rộng */}
          {activeTab === 'history' ? (
            <div className="h-full overflow-y-auto p-3 sm:p-4">
              <NotificationHistoryTable
                notifications={notifications}
                loading={loadingList}
                pagination={pagination}
                onPageChange={loadNotifications}
                onView={() => {}}
                onPreview={(n) => setPreviewModal({ open: true, notification: n })}
                onLogs={(n) => setLogsModal({ open: true, notificationId: n.id, title: n.title })}
                onCopy={(n) => {
                  applyTemplate(n.type || 'announcement');
                  toast.success('Đã copy nội dung thông báo vào tab Mẫu email');
                  setActiveTab('templates');
                }}
                onSend={sendOne}
                onResend={resendOne}
                onSchedule={scheduleOne}
                onDelete={deleteOne}
              />
            </div>
          ) : null}

          {/* Chế độ 2 — Soạn mẫu: dạng email (thanh nhỏ) + soạn (trái) | xem trước (phải) */}
          {activeTab === 'templates' ? (
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-gray-200/90 dark:border-dk-border bg-white dark:bg-dk-surface px-3 py-2 sm:px-4">
                <span className="whitespace-nowrap text-xs font-semibold text-slate-600 dark:text-dk-text2">
                  {t('notificationCenter.studio.emailType')}
                </span>
                <div className="min-w-0 basis-full md:basis-auto md:flex-1">
                  <TypeChips
                    value={typeKey}
                    onChange={setTypeKey}
                    className="flex gap-1.5 overflow-x-auto pb-0.5 md:flex-wrap md:overflow-visible md:pb-0"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSendTypeKey(typeKey);
                    setActiveTab('send');
                  }}
                  title={t('notificationCenter.studio.goSendTitle')}
                  className="ml-auto inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1 text-xs font-semibold text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/40"
                >
                  {t('notificationCenter.studio.goSend')}
                  <HiOutlineArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
                <div className="grid gap-3 p-3 sm:p-4 lg:h-full lg:grid-cols-2">
                  <section className={`flex min-h-0 flex-col gap-3 p-4 lg:overflow-y-auto ${CARD_CLASS}`}>
                    <label className="block shrink-0 space-y-1.5">
                      <span className="flex items-center justify-between text-sm font-medium text-slate-800 dark:text-dk-text">
                        <span className="flex items-center gap-2">
                          <HiOutlinePencil className="h-4 w-4 text-orange-500 dark:text-orange-400" />
                          Tiêu đề email (subject)
                        </span>
                        <span className="text-xs font-normal text-slate-400 dark:text-dk-muted">{draft.subject.length}/200</span>
                      </span>
                      <input
                        aria-label="Tiêu đề email"
                        value={draft.subject}
                        onChange={(event) => setDrafts((current) => ({ ...current, [typeKey]: { ...current[typeKey], subject: event.target.value } }))}
                        maxLength={200}
                        placeholder="[Founder AI] Tiêu đề email"
                        className={inputClass}
                      />
                    </label>

                    <HtmlEditor
                      value={draft.bodyHtml}
                      onChange={(v) => setDrafts((current) => ({ ...current, [typeKey]: { ...current[typeKey], bodyHtml: v } }))}
                      variables={VARIABLES}
                      bodyRef={bodyRef}
                    />
                  </section>

                  <LivePreview html={draft.bodyHtml} subject={draft.subject} templateKey={typeKey} />
                </div>
              </div>
            </div>
          ) : null}

          {/* Chế độ 3 — Gửi chiến dịch: dạng + mẫu đã lưu (trái) | tóm tắt + xem trước (phải); cấu hình nằm trong Cài đặt */}
          {activeTab === 'send' ? (
            <div className="h-full overflow-y-auto lg:overflow-hidden">
              <div className="grid gap-3 p-3 sm:p-4 lg:h-full lg:grid-cols-[minmax(300px,380px)_minmax(0,1fr)]">
                <div className="min-h-0 space-y-3 lg:overflow-y-auto">
                  <section className={`space-y-2 p-4 ${CARD_CLASS}`}>
                    <span className="text-sm font-medium text-slate-800 dark:text-dk-text">{t('notificationCenter.studio.emailType')}</span>
                    <TypeChips value={sendTypeKey} onChange={setSendTypeKey} />
                  </section>

                  <section className={`space-y-1.5 p-4 ${CARD_CLASS}`}>
                    <label htmlFor="notification-saved-template" className="text-sm font-medium text-slate-800 dark:text-dk-text">
                      {t('notificationCenter.studio.savedTemplate')}
                    </label>
                    <select
                      id="notification-saved-template"
                      value={selectedSavedTemplateId}
                      onChange={onPickSavedTemplate}
                      className={inputClass}
                    >
                      <option value="">{t('notificationCenter.studio.savedTemplateNone')}</option>
                      {savedTemplates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>
                          {tpl.name} · {TYPE_TEMPLATES[tpl.type_key]?.label || tpl.type_key}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-500 dark:text-dk-text2">{t('notificationCenter.studio.savedTemplateHint')}</p>
                  </section>
                </div>

                <div className="flex min-h-0 flex-col gap-3">
                  <div
                    role="group"
                    aria-label={t('notificationCenter.studio.summaryAria')}
                    className={`flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-xs text-slate-700 dark:text-dk-text ${CARD_CLASS}`}
                  >
                    <span>
                      {t('notificationCenter.channels.summaryLabel')}: <strong>{channelsSummary}</strong>
                    </span>
                    <span>
                      {t('notificationCenter.studio.summaryAudience')}:{' '}
                      <strong className={audienceCount === 0 && !hasCriteria ? 'text-amber-700 dark:text-amber-300' : ''}>{audienceSummary}</strong>
                    </span>
                    <span>
                      {t('notificationCenter.studio.summaryTime')}: <strong>{timeSummary}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => openSettings('channels')}
                      title={t('notificationCenter.studio.editTitle')}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg border border-orange-300 dark:border-orange-700 bg-white dark:bg-dk-surface px-2.5 py-1 font-semibold text-orange-700 dark:text-orange-300 hover:bg-orange-50 dark:hover:bg-orange-950/60"
                    >
                      <HiOutlinePencil className="h-3.5 w-3.5" />
                      {t('notificationCenter.studio.edit')}
                    </button>
                  </div>

                  <LivePreview html={sendHtml} subject={sendSubject} templateKey={sendTypeKey} className="flex-1" />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Cài đặt — kênh gửi, đối tượng, lịch gửi, cấu hình kênh theo sự kiện */}
      <EditorSettingsModal
        open={settingsOpen}
        onClose={closeSettings}
        title={t('notificationCenter.studio.settingsTitle')}
        subtitle={t('notificationCenter.studio.settingsSubtitle')}
        tabs={settingsTabs}
        activeTab={settingsTab}
        onTabChange={setSettingsTab}
        footer={<TopbarButton onClick={closeSettings}>{t('common.done')}</TopbarButton>}
      >
        {settingsTab === 'channels' ? (
          <NotificationChannelSelector
            value={channels}
            onChange={onChannelsChange}
            link={broadcastLink}
            onLinkChange={setBroadcastLink}
            type={sendTypeKey}
            disabledChannels={disabledChannels}
          />
        ) : null}

        {settingsTab === 'audience' ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-dk-text2">{t('notificationCenter.studio.audienceHint')}</p>
            <TargetingPanel
              criteria={targeting}
              onChange={setTargeting}
            />
          </div>
        ) : null}

        {settingsTab === 'schedule' ? (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 dark:text-dk-text2">{t('notificationCenter.studio.scheduleHint')}</p>
            <ScheduleSelector value={schedule} onChange={setSchedule} />
          </div>
        ) : null}

        {settingsTab === 'events' ? <NotificationEventSettingsPanel bare onEntrySaved={onEventSaved} /> : null}
      </EditorSettingsModal>

      {/* Modals */}
      <EmailPreviewModal
        isOpen={previewModal.open}
        onClose={() => setPreviewModal({ open: false, notification: null })}
        notification={previewModal.notification}
      />
      <EmailLogsModal
        isOpen={logsModal.open}
        onClose={() => setLogsModal({ open: false, notificationId: null, title: '' })}
        notificationId={logsModal.notificationId}
        notificationTitle={logsModal.title}
      />
      <SaveAsTemplateModal
        open={saveAsModal.open}
        onClose={closeSaveAsModal}
        onSubmit={submitSaveAs}
        submitting={saveAsModal.submitting}
        errorMessage={saveAsModal.errorMessage}
        initial={{
          subject: draft.subject,
          bodyHtml: draft.bodyHtml,
          typeKey,
          typeLabel: TYPE_TEMPLATES[typeKey]?.label || typeKey,
        }}
      />
    </AdminEditorShell>
  );
}
