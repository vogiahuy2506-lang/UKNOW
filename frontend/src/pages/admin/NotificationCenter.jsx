/**
 * Notification Center — Remake 2026-09-19 (v3)
 * ----------------------------------------------------------------
 * 3 pill tabs:
 *   1) Lịch sử chiến dịch — bảng danh sách + hành động
 *   2) Soạn mẫu         — chọn 1 trong 6 dạng, soạn HTML Vi (code editor), lưu thành mẫu
 *   3) Chiến dịch mới    — chọn dạng, đối tượng, lịch, nhấn Gửi (có thể dùng mẫu đã lưu)
 *
 * Tên hiển thị: "Trung tâm Chiến dịch Email" (alias của "Trung tâm Thông báo").
 *
 * Pattern tham khảo AdminWelcomeEmailPage:
 *  - 1 textarea HTML lớn + chip variables
 *  - Live preview iframe render HTML vừa soạn
 *  - Selector chip ở trên editor
 *
 * Subject + body tách riêng; map xuống `title` + `message` khi gửi.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineBell,
  HiOutlineClock,
  HiOutlineCode,
  HiOutlineEye,
  HiOutlineMailOpen,
  HiOutlinePaperAirplane,
  HiOutlinePencil,
  HiOutlineRefresh,
  HiOutlineUserGroup,
  HiOutlineSparkles,
  HiOutlineBookmark,
} from 'react-icons/hi';
import { FaBell, FaClock } from 'react-icons/fa';
import adminNotificationApiService from '../../features/admin/services/adminNotificationApi.service';
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
} from '../../features/admin/components';
import { useAuthStore } from '../../stores/authStore.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TABS = [
  { id: 'history', label: 'Lịch sử chiến dịch', icon: HiOutlineMailOpen },
  { id: 'templates', label: 'Soạn mẫu', icon: HiOutlineCode },
  { id: 'send', label: 'Chiến dịch mới', icon: HiOutlinePaperAirplane },
];

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

function buildPayloadFromHtml({ subject, bodyHtml, type, targeting, schedule }) {
  return {
    type,
    title: String(subject || '').trim(),
    title_en: '',
    message: String(bodyHtml || '').trim(),
    message_en: '',
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

function PillTabs({ active, onChange, tabs }) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const selected = active === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-pressed={selected}
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              selected
                ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                : 'border-slate-300 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700'
            }`}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

function TypeChips({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Chọn dạng email">
      {Object.values(TYPE_TEMPLATES).map((t) => {
        const selected = value === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            aria-pressed={selected}
            className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              selected
                ? 'border-orange-500 bg-orange-500 text-white shadow-sm'
                : 'border-slate-300 bg-white text-slate-700 hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700'
            }`}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

function HtmlEditor({ value, onChange, variables, bodyRef }) {
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
    <div className="space-y-3">
      <div className="space-y-1.5">
        <span className="text-sm font-medium text-slate-800">Biến số có sẵn</span>
        <p className="text-xs text-slate-500">Click để chèn tại vị trí con trỏ trong HTML.</p>
        <div className="flex flex-wrap gap-2">
          {variables.map((variable) => (
            <button
              key={variable}
              type="button"
              onClick={() => insertVariable(variable)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 font-mono text-xs text-slate-700 hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700"
            >
              {`{{${variable}}}`}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-800">Mã HTML</span>
          <span className="font-mono text-[10px] text-slate-400">{value.length} chars</span>
        </div>
        <textarea
          ref={bodyRef}
          aria-label="Mã HTML email"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="<p>Tiêu đề email...</p>"
          rows={22}
          spellCheck={false}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-3 font-mono text-xs leading-5 text-slate-800 placeholder-slate-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
        />
        <p className="text-xs text-slate-500">
          Nội dung body của email (chỉ phần <code className="font-mono">body</code>, không cần thẻ <code className="font-mono">&lt;html&gt;</code> bao ngoài). Tiêu đề riêng ở ô phía trên.
        </p>
      </div>
    </div>
  );
}

function LivePreview({ html, subject, templateKey }) {
  const previewHtml = useMemo(
    () => renderFreeformPreview({ templateKey, bodyHtml: html, subject }),
    [templateKey, html, subject],
  );
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold text-slate-900">
            <HiOutlineEye className="h-5 w-5 text-orange-500" />
            Bản xem trước
          </h2>
          <p className="mt-1 truncate text-xs text-slate-500">{subject || 'Chưa có tiêu đề'}</p>
        </div>
      </div>
      {html ? (
        <iframe
          title="Email Preview"
          srcDoc={previewHtml}
          sandbox=""
          className="h-[760px] w-full bg-white"
        />
      ) : (
        <div className="flex h-80 items-center justify-center text-sm text-slate-400">
          Chưa có nội dung để xem trước
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const VARIABLES = ['user_name', 'user_email', 'user_plan', 'product_name', 'current_date', 'dashboard_url', 'support_email'];

export default function NotificationCenter() {
  const [activeTab, setActiveTab] = useState('history');
  const [busy, setBusy] = useState(false);

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
  const setDraft = (next) => setDrafts((current) => ({ ...current, [typeKey]: next }));
  const bodyRef = useRef(null);

  // Tab "Gửi" state
  const [sendTypeKey, setSendTypeKey] = useState('announcement');
  const [targeting, setTargeting] = useState({});
  const [schedule, setSchedule] = useState({ schedule_type: 'now' });

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
    setDraft({ subject: tpl.subject, bodyHtml: tpl.bodyHtml });
  }, []);

  const clearTemplate = useCallback(() => {
    setDraft({ subject: '', bodyHtml: '' });
  }, []);

  // ----------------------------------------------------------------- Send actions

  const submit = useCallback(async () => {
    const draftForSend = drafts[sendTypeKey] || TYPE_TEMPLATES[sendTypeKey] || { subject: '', bodyHtml: '' };
    const payload = buildPayloadFromHtml({
      subject: draftForSend.subject,
      bodyHtml: draftForSend.bodyHtml,
      type: sendTypeKey,
      targeting,
      schedule,
    });
    const validationError = validatePayload(payload);
    if (validationError) {
      toast.error(validationError);
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
  }, [sendTypeKey, targeting, schedule, drafts, loadNotifications]);

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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <HiOutlineSparkles className="h-7 w-7 text-orange-500" />
            <h1 className="text-2xl font-bold text-slate-900">Trung tâm Chiến dịch Email</h1>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Soạn mẫu HTML theo từng dạng email → lưu thành mẫu có tên riêng (super admin) → chọn người nhận → gửi ngay hoặc hẹn giờ.
          </p>
          <p className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
            Dùng <code className="font-mono">{`{{user_name}}`}</code>, <code className="font-mono">{`{{dashboard_url}}`}</code>… sẽ tự thay bằng dữ liệu người nhận.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <PillTabs active={activeTab} onChange={setActiveTab} tabs={TABS} />

      {/* Tab content */}
      {activeTab === 'history' ? (
        <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <header className="flex items-center gap-2">
            <HiOutlineMailOpen className="h-5 w-5 text-orange-500" />
            <h2 className="font-semibold text-slate-900">Lịch sử thông báo</h2>
          </header>
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
        </section>
      ) : null}

      {activeTab === 'templates' ? (
        <div className="space-y-5">
          <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <header>
              <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                <HiOutlineCode className="h-5 w-5 text-orange-500" />
                Mẫu email theo dạng
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Mỗi dạng có một mẫu HTML riêng (khác nhau về layout/component). Bấm "Dùng mẫu" để copy vào ô bên dưới, sau đó sửa trực tiếp.
              </p>
            </header>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-medium text-slate-800">Dạng email:</span>
              <TypeChips value={typeKey} onChange={setTypeKey} />
              <button
                type="button"
                onClick={() => applyTemplate(typeKey)}
                className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
              >
                Dùng mẫu {TYPE_TEMPLATES[typeKey]?.label}
              </button>
              <button
                type="button"
                onClick={clearTemplate}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:border-orange-400 hover:bg-orange-50 hover:text-orange-700"
              >
                <HiOutlineRefresh className="h-3.5 w-3.5" />
                Xóa trắng
              </button>
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <header className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                  <HiOutlinePencil className="h-5 w-5 text-orange-500" />
                  Soạn HTML
                </h2>
                {isSuperAdmin ? (
                  <button
                    type="button"
                    onClick={openSaveAsModal}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-orange-300 bg-white px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50"
                    title="Lưu bản soạn hiện tại thành mẫu mới (mẫu gốc KHÔNG đổi)"
                  >
                    <HiOutlineBookmark className="h-3.5 w-3.5" />
                    Lưu thành mẫu
                  </button>
                ) : (
                  <span
                    className="text-xs text-slate-400"
                    title="Chỉ super admin mới có quyền lưu mẫu mới"
                  >
                    <HiOutlineBookmark className="inline h-3.5 w-3.5" /> Chỉ super admin
                  </span>
                )}
              </header>
              {isSuperAdmin ? (
                <p className="rounded-lg border border-dashed border-orange-300 bg-orange-50/60 px-3 py-2 text-xs text-orange-800">
                  💡 Soạn xong? Bấm <strong>Lưu thành mẫu mới</strong> ở thanh cam bên dưới để lưu vào DB.
                  Mẫu gốc sẽ <strong>không</strong> bị thay đổi — bạn có thể chọn lại mẫu vừa lưu ở tab <em>Chiến dịch mới</em>.
                </p>
              ) : null}

              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-800">Tiêu đề email (subject)</span>
                <input
                  aria-label="Tiêu đề email"
                  value={draft.subject}
                  onChange={(event) => setDraft({ ...draft, subject: event.target.value })}
                  maxLength={200}
                  placeholder="[Founder AI] Tiêu đề email"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                />
                <span className="block text-right text-xs text-slate-400">{draft.subject.length}/200</span>
              </label>

              <HtmlEditor
                value={draft.bodyHtml}
                onChange={(v) => setDraft({ ...draft, bodyHtml: v })}
                variables={VARIABLES}
                bodyRef={bodyRef}
              />
            </section>

            <LivePreview html={draft.bodyHtml} subject={draft.subject} templateKey={typeKey} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-slate-700">
            <p>
              Đã soạn xong mẫu? <strong>Chuyển sang tab "Chiến dịch mới"</strong>, chọn dạng tương ứng rồi cấu hình đối tượng + lịch.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {isSuperAdmin ? (
                <button
                  type="button"
                  onClick={openSaveAsModal}
                  className="inline-flex items-center gap-2 rounded-lg border border-orange-400 bg-white px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100"
                  title="Lưu bản soạn hiện tại thành mẫu mới (mẫu gốc KHÔNG đổi)"
                >
                  <HiOutlineBookmark className="h-4 w-4" />
                  Lưu thành mẫu mới
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setSendTypeKey(typeKey);
                  setActiveTab('send');
                }}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
              >
                Tiếp tục: chuyển sang Chiến dịch mới →
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {activeTab === 'send' ? (
        <div className="grid gap-6 xl:grid-cols-2">
          {/* LEFT — config */}
          <div className="space-y-5">
            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <header>
                <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                  <HiOutlinePaperAirplane className="h-5 w-5 text-orange-500" />
                  Gửi thông báo
                </h2>
                <p className="mt-1 text-xs text-slate-500">Chọn dạng email đã soạn, đối tượng và lịch gửi.</p>
              </header>

              <div className="space-y-3">
                <div>
                  <span className="text-sm font-medium text-slate-800">Dạng email</span>
                  <div className="mt-2">
                    <TypeChips value={sendTypeKey} onChange={setSendTypeKey} />
                  </div>
                </div>

                <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-3">
                  <label className="text-sm font-medium text-slate-800">
                    Dùng mẫu đã lưu (tuỳ chọn)
                  </label>
                  <select
                    value={selectedSavedTemplateId}
                    onChange={onPickSavedTemplate}
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
                  >
                    <option value="">— Soạn tự do —</option>
                    {savedTemplates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name} · {TYPE_TEMPLATES[tpl.type_key]?.label || tpl.type_key}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-xs text-slate-500">
                    Chọn mẫu để fill subject + HTML vào form bên dưới. Bạn vẫn phải chọn nhóm
                    người nhận + lịch trước khi gửi.
                  </p>
                </div>
              </div>
            </section>

            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <header>
                <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                  <HiOutlineUserGroup className="h-5 w-5 text-orange-500" />
                  Nhắm đối tượng
                </h2>
                <p className="mt-1 text-xs text-slate-500">Có thể kết hợp nhiều tiêu chí.</p>
              </header>
              <TargetingPanel
                criteria={targeting}
                onChange={setTargeting}
              />
            </section>

            <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <header>
                <h2 className="flex items-center gap-2 font-semibold text-slate-900">
                  <HiOutlineClock className="h-5 w-5 text-orange-500" />
                  Thời gian gửi
                </h2>
                <p className="mt-1 text-xs text-slate-500">Gửi ngay / Hẹn giờ / Định kỳ.</p>
              </header>
              <ScheduleSelector value={schedule} onChange={setSchedule} />
            </section>

            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className={`inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium text-white shadow-sm transition-all ${
                  busy
                    ? 'cursor-not-allowed bg-orange-200'
                    : 'bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700'
                }`}
              >
                {busy ? (
                  <>
                    <span className="loading loading-spinner loading-sm" />
                    Đang xử lý...
                  </>
                ) : schedule.schedule_type === 'now' ? (
                  <>
                    <FaBell className="h-4 w-4" />
                    Gửi ngay
                  </>
                ) : schedule.schedule_type === 'scheduled' ? (
                  <>
                    <FaClock className="h-4 w-4" />
                    Hẹn giờ
                  </>
                ) : (
                  <>
                    <FaBell className="h-4 w-4" />
                    Lên lịch định kỳ
                  </>
                )}
              </button>
            </div>
          </div>

          {/* RIGHT — preview */}
          <div className="space-y-5 xl:sticky xl:top-4 xl:self-start">
            <LivePreview
              html={drafts[sendTypeKey]?.bodyHtml || TYPE_TEMPLATES[sendTypeKey]?.bodyHtml || ''}
              subject={drafts[sendTypeKey]?.subject || TYPE_TEMPLATES[sendTypeKey]?.subject || ''}
              templateKey={sendTypeKey}
            />

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p className="font-semibold">Tóm tắt sẽ gửi</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
                <li>Dạng: <strong>{TYPE_TEMPLATES[sendTypeKey]?.label || sendTypeKey}</strong></li>
                <li>
                  Thời gian:{' '}
                  <strong>
                    {schedule.schedule_type === 'now'
                      ? 'gửi ngay'
                      : schedule.schedule_type === 'scheduled'
                      ? `hẹn ${formatDateTime(schedule.scheduled_at)}`
                      : `lặp ${schedule.recurrence_pattern || 'daily'}`}
                  </strong>
                </li>
              </ul>
            </div>
          </div>
        </div>
      ) : null}

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
    </div>
  );
}


