import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import emailTemplateApiService from '../../features/templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../features/templates/services/zaloTemplateApi.service';
import emailSettingsApiService from '../../features/settings/services/emailSettingsApi.service';
import zaloSettingsApiService from '../../features/settings/services/zaloSettingsApi.service';
import chatbotApiService from '../../features/chatbot/services/chatbotApi.service';
import campaignApiService from '../../features/campaigns/services/campaignApi.service';
import campaignBuilderApiService from '../../features/campaigns/services/campaignBuilderApi.service';
import { ZaloGroupPickerCard } from '../../features/ai/components/AiChatbotWizardCards.jsx';
import { htmlToPlainText } from '../../utils/htmlToPlainText.util.js';
import { miniMarkdownToHtml } from '../../utils/miniMarkdownToHtml.js';
import { resolveActionIdempotencyKey } from '../../utils/idempotency.util.js';
import { pickTemplateContent } from './quickSend.util';
import {
  HiOutlinePlus,
  HiOutlineMail,
  HiOutlineChat,
  HiOutlineUsers,
  HiOutlineUserGroup,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineChevronRight,
  HiOutlineClock,
  HiOutlineMoon,
  HiOutlinePaperAirplane,
  HiOutlineRefresh,
  HiOutlinePaperClip,
} from 'react-icons/hi';

function formatFileSize(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let size = bytes;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

const QUICK_SEND_STEPS = {
  RECIPIENTS: 'recipients',
  TEMPLATE: 'template',
  PREVIEW: 'preview',
  SENDING: 'sending',
  DONE: 'done',
};

const CHANNEL_TYPES = {
  EMAIL: 'email',
  ZALO: 'zalo',
  ZALO_GROUP: 'zalo_group',
};

const ZALO_RECIPIENT_TYPES = {
  PHONE: 'phone',
  UID: 'uid',
};

/**
 * Đối chiếu 1 dòng UID với map danh bạ đã tải (uid -> friend object từ chatbotApiService.getZaloFriends).
 * Chỉ đối chiếu (và tự tick) MỘT LẦN — dòng đã có `inContacts !== null` giữ nguyên `checked`
 * người dùng đã chọn, không bị ghi đè mỗi lần danh bạ tải lại (Bẫy 4: không tự tick UID lạ).
 */
function resolveUidRowAgainstFriendsMap(row, friendsMap) {
  if (row.inContacts !== null) return row;
  const friend = friendsMap.get(row.uid);
  if (!friend) return { ...row, inContacts: false, checked: false, name: null };
  // Bạn bè có trong danh bạ nhưng không đặt tên hiển thị (hiếm) — vẫn KHÔNG được rơi xuống
  // UID trần, dù đã xác nhận đúng người (Bẫy 4 áp cho mọi nơi hiển thị, không chỉ ca chưa
  // đối chiếu được).
  const name = friend.display_name || friend.displayName || `…${row.uid.slice(-4)}`;
  return { ...row, inContacts: true, checked: true, name };
}

/**
 * Map an axios/fetch error from /email-settings/send-email and
 * /zalo-settings/send-message into one of a small fixed set of error
 * categories the UI can act on. Backend distinguishes "SEND_QUOTA_EXCEEDED"
 * (HTTP 403) and `errorType: 'smtp_config'` (HTTP 422); everything else
 * collapses into a generic "unknown" bucket.
 *
 * @param {object} err - axios error
 * @returns {{ errorType: string, message: string, statusCode: number|null }}
 */
function classifySendError(err) {
  const status = err?.response?.status || null;
  const data = err?.response?.data || {};
  const code = data?.code || null;
  const errorType = data?.data?.errorType || null;
  const rawMessage = data?.message || err?.message || 'Send failed';

  if (code === 'SEND_QUOTA_EXCEEDED' || /hạn mức|quota/i.test(rawMessage)) {
    return { errorType: 'quota_exceeded', message: rawMessage, statusCode: status };
  }
  if (errorType === 'smtp_config' || /cấu hình SMTP|SMTP config/i.test(rawMessage)) {
    return { errorType: 'smtp_config', message: rawMessage, statusCode: status };
  }
  if (status === 401 || /unauthor|đăng nhập/i.test(rawMessage)) {
    return { errorType: 'auth', message: rawMessage, statusCode: status };
  }
  if (status === 422 || /validation|invalid/i.test(rawMessage)) {
    return { errorType: 'validation', message: rawMessage, statusCode: status };
  }
  if (status >= 500) {
    return { errorType: 'server', message: rawMessage, statusCode: status };
  }
  return { errorType: 'unknown', message: rawMessage, statusCode: status };
}

/**
 * Pick a single representative toast message from a Map of failure samples
 * collected across the per-recipient loop. Keeps the user from seeing N
 * stacked toasts when the same underlying issue fanned out to every
 * recipient.
 */
function buildFailureToast(failureSamples, isEmail) {
  if (!failureSamples || failureSamples.size === 0) {
    return 'Gửi thất bại';
  }
  const order = ['quota_exceeded', 'smtp_config', 'auth', 'validation', 'server', 'unknown'];
  for (const key of order) {
    const sample = failureSamples.get(key);
    if (!sample) continue;
    switch (key) {
      case 'quota_exceeded':
        return 'Đã vượt hạn mức gửi email. Vui lòng nâng cấp gói hoặc mua thêm lượt gửi.';
      case 'smtp_config':
        return `Lỗi cấu hình SMTP tài khoản gửi: ${sample.message}`;
      case 'auth':
        return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
      case 'validation':
        return `Dữ liệu gửi không hợp lệ: ${sample.message}`;
      case 'server':
        return `Máy chủ gặp lỗi (HTTP ${sample.statusCode || '?'}). Vui lòng thử lại sau.`;
      default:
        return isEmail
          ? `Gửi email thất bại: ${sample.message}`
          : `Gửi Zalo thất bại: ${sample.message}`;
    }
  }
  return 'Gửi thất bại';
}

/**
 * Bẫy 7 (PLAN_GUI_NHANH_MOI_KENH, bước 5): POST /zalo/preview/send-personal và
 * /send-group luôn trả HTTP 200 + { data: { items, meta } } — kể cả khi người nhận/nhóm
 * đó thất bại (items[i].status === 'failed'), chỉ 409/503/403 mới là lỗi toàn cục ném
 * mã khác 200. Không sửa được ở backend (endpoint còn phục vụ preview Campaign Builder,
 * nơi gửi nhiều người/nhóm một lượt và đọc meta.failed thay vì early-throw).
 *
 * runSendLoop gọi hàm này ngay sau await — nếu item đầu (mỗi lần gọi ở đây luôn đúng 1
 * item vì QuickSend gửi từng người/nhóm một lệnh) không phải 'success', ném lỗi hình
 * dạng axios để catch() + classifySendError() phía dưới xử lý y hệt lỗi HTTP thật, không
 * cần nhánh code riêng.
 *
 * @param {object} res kết quả axios từ sendMessage/sendGroupMessage
 * @throws {Error & { response: { status: 200, data: { message: string, code: string } } }}
 */
function throwIfZaloItemFailed(res) {
  const item = res?.data?.data?.items?.[0];
  if (!item || item.status === 'success') return;
  const message = item.error || item.errorLabel || 'Gửi thất bại';
  const err = new Error(message);
  err.response = {
    status: 200,
    data: { message, code: item.errorCode },
  };
  throw err;
}

const QuickSend = () => {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(QUICK_SEND_STEPS.RECIPIENTS);
  const [selectedChannel, setSelectedChannel] = useState(CHANNEL_TYPES.EMAIL);

  // Manual input state
  const [manualEmails, setManualEmails] = useState('');
  const [manualPhones, setManualPhones] = useState('');

  // Zalo UID recipient state — xem resolveUidRowAgainstFriendsMap ở trên.
  const [zaloRecipientType, setZaloRecipientType] = useState(ZALO_RECIPIENT_TYPES.PHONE);
  const [uidRows, setUidRows] = useState([]); // [{ uid, name, checked, inContacts }]
  const [uidManualInput, setUidManualInput] = useState('');
  const [uidSearch, setUidSearch] = useState('');
  const [uidSearchResults, setUidSearchResults] = useState([]);
  const [isLoadingUidSearch, setIsLoadingUidSearch] = useState(false);
  const [isLoadingUidContacts, setIsLoadingUidContacts] = useState(false);
  const zaloFriendsMapRef = useRef(new Map()); // uid -> friend object (cả trang đã tải)
  const resolvedForAccountIdRef = useRef(null); // id tài khoản Zalo lần đối chiếu gần nhất
  const uidSearchTimerRef = useRef(null);

  // Zalo nhóm (PR-2) — [{ id, name }]. name: null khi mới nạp từ bản nháp AI (chỉ có id,
  // Bẫy 4) và chờ resolveGroupNames đối chiếu; ZaloGroupPickerCard tự có tên ngay khi người
  // dùng chọn tay (onSubmit nhận kèm danh sách group đầy đủ).
  const [selectedGroups, setSelectedGroups] = useState([]);

  // Sender accounts state
  const [emailAccounts, setEmailAccounts] = useState([]);
  const [zaloAccounts, setZaloAccounts] = useState([]);
  const [selectedEmailAccount, setSelectedEmailAccount] = useState(null);
  const [selectedZaloAccount, setSelectedZaloAccount] = useState(null);
  const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);

  // Template state
  const [emailTemplates, setEmailTemplates] = useState([]);
  const [zaloTemplates, setZaloTemplates] = useState([]);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [templateContent, setTemplateContent] = useState({ subject: '', body: '' });
  const [extraAttachments, setExtraAttachments] = useState([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isLoadingTemplateDetail, setIsLoadingTemplateDetail] = useState(false);
  const [templateDetailError, setTemplateDetailError] = useState(false);
  const activeTemplateSelectionIdRef = useRef(null);

  // Nội dung tự soạn (bước 2, phương án "Soạn nội dung mới") — TÁCH khỏi templateContent để
  // chuyển qua lại giữa "chọn mẫu" và "soạn mới" không làm mất bản nháp của bên kia. AI
  // Assistant gửi subject/body không kèm template cũng đi vào đây (xem effect nạp draft ở trên).
  const [contentMode, setContentMode] = useState('template'); // 'template' | 'custom'
  const [customContent, setCustomContent] = useState({ subject: '', body: '' });

  // Nguồn nội dung/mẫu/đính kèm ĐANG DÙNG THẬT — mọi nơi validate/preview/gửi phải đọc qua đây,
  // không đọc trực tiếp templateContent/selectedTemplate, để không lệch giữa hai chế độ.
  const activeContent = useMemo(
    () => (contentMode === 'custom' ? customContent : templateContent),
    [contentMode, customContent, templateContent]
  );
  const activeTemplate = useMemo(
    () => (contentMode === 'custom' ? null : selectedTemplate),
    [contentMode, selectedTemplate]
  );
  const activeAttachments = useMemo(() => [
    ...(contentMode === 'template' && Array.isArray(selectedTemplate?.attachments) ? selectedTemplate.attachments : []),
    ...(Array.isArray(extraAttachments) ? extraAttachments : []),
  ], [contentMode, selectedTemplate, extraAttachments]);

  // Send state
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);
  // Retry state — `failedRecipients` lets the user resend only to recipients
  // that previously failed (e.g. transient SMTP / Zalo session errors).
  const [failedRecipients, setFailedRecipients] = useState([]);
  const [isRetrying, setIsRetrying] = useState(false);

  // Estimation & test send state
  const [estimate, setEstimate] = useState(null);
  const [isLoadingEstimate, setIsLoadingEstimate] = useState(false);
  const [testRecipient, setTestRecipient] = useState('');
  const [isTesting, setIsTesting] = useState(false);
  const testSendActionKeyRef = useRef({ key: null, signature: null });
  const testSendPreparationRef = useRef(false);
  // Khoá idempotency cho CẢ ĐỢT gửi hàng loạt (runSendLoop) — mỗi người nhận trong đợt dùng
  // `${key}-${index}` dẫn xuất từ đây. Bấm gửi hai lần với cùng nội dung/người nhận sẽ tái
  // dùng đúng key này (resolveActionIdempotencyKey so signature), nên mỗi cặp key-người nhận
  // giống hệt lần trước → backend dedupe đúng. Reset về null sau khi đợt gửi kết thúc (thành
  // công lẫn thất bại) để lần gửi MỚI sau đó (kể cả trùng nội dung) không bị coi nhầm là trùng.
  const sendActionKeyRef = useRef({ key: null, signature: null });
  // Chốt đồng bộ chặn double-click thật (giống testSendPreparationRef ở Gửi thử) — khoá
  // idempotency một mình không đủ: 2 click gần như đồng thời có thể cùng đọc
  // sendActionKeyRef.current TRƯỚC khi request đầu ghi lại (resolveActionIdempotencyKey là
  // async), ra 2 khoá gốc khác nhau cho CÙNG một đợt. state (isSending/isRetrying) không
  // đáng tin cho việc này vì cập nhật bị React batch, không tức thời như ref.
  const sendPreparationRef = useRef(false);
  const retryPreparationRef = useRef(false);

  // Nạp bản nháp từ Trợ lý AI (quickSendDraft) nếu có
  useEffect(() => {
    const draft = location.state?.quickSendDraft;
    if (!draft) return;

    if ([CHANNEL_TYPES.EMAIL, CHANNEL_TYPES.ZALO, CHANNEL_TYPES.ZALO_GROUP].includes(draft.channel)) {
      setSelectedChannel(draft.channel);
    }

    const isZaloUidDraft = draft.channel === CHANNEL_TYPES.ZALO && draft.recipientType === ZALO_RECIPIENT_TYPES.UID;
    const isZaloGroupDraft = draft.channel === CHANNEL_TYPES.ZALO_GROUP;

    if (isZaloGroupDraft) {
      const rawList = Array.isArray(draft.recipients)
        ? draft.recipients
        : String(draft.recipients || '').split(/[\n,;]+/);
      const ids = rawList.map((r) => String(r || '').trim()).filter(Boolean);
      // Chưa có tên (Bẫy 4) — resolveGroupNames đối chiếu lại với danh sách nhóm thật của
      // tài khoản đã chọn ngay khi tài khoản sẵn sàng (effect bên dưới).
      setSelectedGroups(ids.map((id) => ({ id, name: null })));
    } else if (isZaloUidDraft) {
      setZaloRecipientType(ZALO_RECIPIENT_TYPES.UID);
      const rawList = Array.isArray(draft.recipients)
        ? draft.recipients
        : String(draft.recipients || '').split(/[\n,;]+/);
      const uids = rawList.map((r) => String(r || '').trim()).filter(Boolean);
      // Chưa đối chiếu danh bạ (inContacts: null) — chưa tick sẵn, đợi effect tải danh bạ resolve.
      // Nhãn bạn bè (nếu bản nháp có mang sang trong tương lai) chỉ là gợi ý ban đầu, trang này
      // vẫn đối chiếu lại với danh bạ thật (Bẫy 4) — không tin nhãn từ nguồn không kiểm chứng được.
      setUidRows(uids.map((uid) => ({ uid, name: null, checked: false, inContacts: null })));
    } else if (Array.isArray(draft.recipients)) {
      const clean = draft.recipients.map((r) => String(r || '').trim()).filter(Boolean).join('\n');
      if (draft.channel === CHANNEL_TYPES.ZALO) {
        setManualPhones(clean);
      } else {
        setManualEmails(clean);
      }
    } else if (typeof draft.recipients === 'string' && draft.recipients.trim()) {
      if (draft.channel === CHANNEL_TYPES.ZALO) {
        setManualPhones(draft.recipients.trim());
      } else {
        setManualEmails(draft.recipients.trim());
      }
    }

    if (draft.subject !== undefined || draft.body !== undefined) {
      // Bản nháp AI mang nội dung trực tiếp, không kèm template — luôn là chế độ "soạn mới".
      setContentMode('custom');
      setCustomContent({
        subject: draft.subject || '',
        body: draft.body || '',
      });
    }

    if (draft.accountId) {
      if (draft.channel === CHANNEL_TYPES.ZALO || draft.channel === CHANNEL_TYPES.ZALO_GROUP) {
        setSelectedZaloAccount({ id: draft.accountId });
      } else {
        setSelectedEmailAccount({ id: draft.accountId });
      }
    }

    if (Array.isArray(draft.attachments) && draft.attachments.length > 0) {
      setExtraAttachments(draft.attachments);
    }

    if (draft.startStep === QUICK_SEND_STEPS.PREVIEW || draft.startStep === 'preview') {
      setCurrentStep(QUICK_SEND_STEPS.PREVIEW);
    } else if (draft.startStep === QUICK_SEND_STEPS.TEMPLATE || draft.startStep === 'template') {
      setCurrentStep(QUICK_SEND_STEPS.TEMPLATE);
    }

    // Xóa state để tránh F5 nạp lại draft cũ
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      const [emailRes, zaloRes] = await Promise.all([
        emailTemplateApiService.getTemplates({ page: 1, limit: 50 }),
        zaloTemplateApiService.getTemplates({ page: 1, limit: 50 }),
      ]);
      // Backend trả về data.items, items chứa templateName, subject, bodyHtml/bodyText
      setEmailTemplates(emailRes?.data?.data?.items || []);
      setZaloTemplates(zaloRes?.data?.data?.items || []);
    } catch (error) {
      toast.error(tRef.current('quickSend.loadTemplatesFailed'));
    } finally {
      setIsLoadingTemplates(false);
    }
  }, []);

  // Fetch sender accounts
  const fetchAccounts = useCallback(async () => {
    setIsLoadingAccounts(true);
    try {
      const [emailRes, zaloRes] = await Promise.all([
        emailSettingsApiService.listEmailSettings(),
        zaloSettingsApiService.listAccounts(),
      ]);
      const emailItems = emailRes?.data?.data?.items || [];
      setEmailAccounts(emailItems);
      const zaloItemsRaw = zaloRes?.data?.data?.items || [];
      const zaloItems = zaloItemsRaw.filter((a) => !a.isLocked);
      setZaloAccounts(zaloItems);

      // Auto-select default account if exists or preserve draft account
      setSelectedEmailAccount((current) => {
        if (current?.id) {
          const matched = emailItems.find((a) => String(a.id) === String(current.id));
          return matched || current;
        }
        if (emailItems.length === 1) return emailItems[0];
        const def = emailItems.find((a) => a.isDefault || a.is_default);
        return def || null;
      });

      setSelectedZaloAccount((current) => {
        if (current?.id) {
          const matched = zaloItems.find((a) => String(a.id) === String(current.id));
          return matched || current;
        }
        const defaultZalo = zaloItems.find((a) => a.isDefault || a.is_default);
        return defaultZalo || null;
      });
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    } finally {
      setIsLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    if (currentStep === QUICK_SEND_STEPS.RECIPIENTS || currentStep === QUICK_SEND_STEPS.PREVIEW) {
      fetchAccounts();
    }
    if (currentStep === QUICK_SEND_STEPS.TEMPLATE) {
      fetchTemplates();
    }
  }, [currentStep, fetchTemplates, fetchAccounts]);

  // Resolve the email body as { html, text }. Always sends both so SMTP can
  // pick the right part per recipient — sending only `content` (HTML) made the
  // text/plain fallback show raw `<p>` tags in mail clients that disable HTML.
  //
  // Edge case: legacy templates saved from the "Text" tab have an empty
  // `bodyHtml` and a markdown-ish `bodyText`. `templateContent.body` then
  // resolves to the plain-text fallback. Build a real HTML body from it so
  // Gmail renders paragraph structure instead of a single run-on line.
  const resolveEmailBody = useCallback(() => {
    const raw = activeContent.body || activeTemplate?.bodyHtml || '';
    const isLikelyHtml = /<\s*(p|div|h[1-6]|br|hr|strong|em|ul|ol|li|table|span|a)\b/i.test(raw);
    // Chế độ soạn mới: nội dung là plain text/Markdown cơ bản, không phải HTML — chuyển bằng
    // miniMarkdownToHtml y hệt template legacy chỉ có bodyText (nhánh isLikelyHtml=false).
    const html = isLikelyHtml ? raw : miniMarkdownToHtml(raw);
    return {
      html,
      text: htmlToPlainText(html),
    };
  }, [activeContent.body, activeTemplate]);

  // Resolve the Zalo body as plain text only. Zalo OA does not render HTML.
  const resolveZaloBody = useCallback(() => {
    return activeContent.body || activeTemplate?.bodyText || '';
  }, [activeContent.body, activeTemplate]);

  // Get final recipients from manual input only
  const finalRecipients = useCallback(() => {
    if (selectedChannel === CHANNEL_TYPES.ZALO_GROUP) {
      // Shape {email,phone,name} dùng chung với luồng email/zalo cá nhân để bước Xem lại
      // (finalRecipients().map(r => r.name)) và vòng gửi (runSendLoop) không cần nhánh
      // render riêng — id nhóm đặt cả vào email/phone (runSendLoop đọc lại qua .phone).
      return selectedGroups.map((g) => ({
        email: g.id,
        phone: g.id,
        name: g.name || t('quickSend.groupNotFound', { last4: g.id.slice(-4) }),
      }));
    }
    if (selectedChannel === CHANNEL_TYPES.ZALO && zaloRecipientType === ZALO_RECIPIENT_TYPES.UID) {
      // Chỉ những dòng người dùng đã tick (UID không có trong danh bạ mặc định KHÔNG tick — Bẫy 4).
      // Tên hiển thị ở bước Xem lại KHÔNG được rơi xuống UID trần: dòng chưa đối chiếu được
      // (name: null, dù đã tick thủ công) vẫn phải hiện nhãn "không có trong danh bạ", không
      // phải chuỗi số — Bẫy 4 áp dụng cho MỌI nơi hiển thị, không chỉ bước chọn người nhận.
      return uidRows
        .filter((r) => r.checked)
        .map((r) => ({
          email: r.uid,
          phone: r.uid,
          name: r.name || t('quickSend.uidNotInContacts', { last4: r.uid.slice(-4) }),
        }));
    }
    const manualList = (selectedChannel === CHANNEL_TYPES.EMAIL ? manualEmails : manualPhones)
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => s && (selectedChannel === CHANNEL_TYPES.EMAIL ? s.includes('@') : /^\d+$/.test(s)));

    return manualList.map((contact) => ({ email: contact, phone: contact, name: contact }));
  }, [selectedChannel, manualEmails, manualPhones, zaloRecipientType, uidRows, selectedGroups, t]);

  // Check if has manual recipients
  const hasManualRecipients = () => {
    if (selectedChannel === CHANNEL_TYPES.ZALO_GROUP) {
      return selectedGroups.length > 0;
    }
    if (selectedChannel === CHANNEL_TYPES.ZALO && zaloRecipientType === ZALO_RECIPIENT_TYPES.UID) {
      return uidRows.some((r) => r.checked);
    }
    const input = selectedChannel === CHANNEL_TYPES.EMAIL ? manualEmails : manualPhones;
    return input.trim().length > 0;
  };

  // Tải toàn bộ danh bạ Zalo của tài khoản đã chọn (phân trang), đối chiếu uidRows hiện có.
  // Trần 50 trang (~5.000 bạn ở limit 100/trang) đủ cho tài khoản cá nhân, tránh vòng lặp vô hạn nếu API trả sai totalPages.
  const loadZaloContactsAndResolve = useCallback(async (accountId) => {
    if (!accountId) return;
    setIsLoadingUidContacts(true);
    try {
      const map = new Map();
      let page = 1;
      let totalPages = 1;
      do {
        const res = await chatbotApiService.getZaloFriends({ accountId, page, limit: 100 });
        const payload = res?.data?.data || res?.data || {};
        const items = Array.isArray(payload.items) ? payload.items : [];
        items.forEach((f) => {
          const id = String(f.friend_id || f.friendId || f.id || '').trim();
          if (id) map.set(id, f);
        });
        totalPages = Number(payload.totalPages) > 0 ? Number(payload.totalPages) : 1;
        page += 1;
      } while (page <= totalPages && page <= 50);
      zaloFriendsMapRef.current = map;
      setUidRows((prev) => prev.map((row) => resolveUidRowAgainstFriendsMap(row, map)));
    } catch (err) {
      console.error('Load Zalo contacts for UID resolve failed:', err);
      toast.error(t('quickSend.loadCustomersFailed'));
    } finally {
      setIsLoadingUidContacts(false);
    }
  }, [t]);

  useEffect(() => {
    if (selectedChannel !== CHANNEL_TYPES.ZALO || zaloRecipientType !== ZALO_RECIPIENT_TYPES.UID) return;
    if (!selectedZaloAccount?.id) return;
    // Đổi tài khoản gửi (khác id trước đó) → danh bạ khác hẳn, mọi dòng đã đối chiếu (tên,
    // trạng thái "có/không trong danh bạ") thuộc về tài khoản CŨ không còn đúng nghĩa. Reset
    // về chưa đối chiếu (inContacts: null) để load lại đúng danh bạ tài khoản mới, tránh hiện
    // nhãn/tick sai chủ (Bẫy 4 áp cho cả trường hợp đổi tài khoản, không chỉ lần nạp đầu).
    if (resolvedForAccountIdRef.current != null && resolvedForAccountIdRef.current !== selectedZaloAccount.id) {
      setUidRows((prev) => prev.map((row) => ({ ...row, inContacts: null, checked: false, name: null })));
    }
    resolvedForAccountIdRef.current = selectedZaloAccount.id;
    loadZaloContactsAndResolve(selectedZaloAccount.id);
  }, [selectedChannel, zaloRecipientType, selectedZaloAccount, loadZaloContactsAndResolve]);

  // Đối chiếu tên nhóm cho các dòng chỉ có id (bản nháp từ Trợ lý AI mang sang — Bẫy 4:
  // không hiển thị id trần). Chọn tay qua ZaloGroupPickerCard đã có tên ngay lúc onSubmit,
  // effect này chỉ cần chạy cho phần còn thiếu (name === null).
  const resolveGroupNames = useCallback(async (accountId) => {
    if (!accountId) return;
    try {
      const res = await campaignBuilderApiService.getPreviewZaloGroups({ accountId });
      const payload = res?.data?.data || res?.data || {};
      const items = Array.isArray(payload) ? payload : (payload.groups || payload.items || []);
      const byId = new Map(
        items.map((g) => [String(g.groupId || g.group_id || g.id || ''), g.groupName || g.group_name || g.name])
      );
      setSelectedGroups((prev) => prev.map((g) => (
        g.name !== null ? g : { ...g, name: byId.get(g.id) || t('quickSend.groupNotFound', { last4: g.id.slice(-4) }) }
      )));
    } catch (err) {
      console.error('Load Zalo groups for name resolve failed:', err);
    }
  }, [t]);

  useEffect(() => {
    if (selectedChannel !== CHANNEL_TYPES.ZALO_GROUP) return;
    if (!selectedZaloAccount?.id) return;
    resolveGroupNames(selectedZaloAccount.id);
  }, [selectedChannel, selectedZaloAccount, resolveGroupNames]);

  // Tìm bạn bè để thêm thủ công (ngoài danh sách bản nháp mang sang) — debounce 300ms giống ZaloFriendPickerCard.
  useEffect(() => {
    if (selectedChannel !== CHANNEL_TYPES.ZALO || zaloRecipientType !== ZALO_RECIPIENT_TYPES.UID) return;
    if (!selectedZaloAccount?.id) {
      setUidSearchResults([]);
      return;
    }
    if (uidSearchTimerRef.current) clearTimeout(uidSearchTimerRef.current);
    uidSearchTimerRef.current = setTimeout(async () => {
      setIsLoadingUidSearch(true);
      try {
        const res = await chatbotApiService.getZaloFriends({
          accountId: selectedZaloAccount.id,
          search: uidSearch,
          page: 1,
          limit: 30,
        });
        const payload = res?.data?.data || res?.data || {};
        setUidSearchResults(Array.isArray(payload.items) ? payload.items : []);
      } catch (err) {
        console.error('Search Zalo friends failed:', err);
      } finally {
        setIsLoadingUidSearch(false);
      }
    }, 300);
    return () => {
      if (uidSearchTimerRef.current) clearTimeout(uidSearchTimerRef.current);
    };
  }, [uidSearch, selectedChannel, zaloRecipientType, selectedZaloAccount]);

  // Bật/tắt 1 UID: nếu chưa có trong uidRows (vd. vừa bấm từ kết quả tìm danh bạ) thì thêm mới
  // đã tick sẵn (người dùng chủ động chọn từ danh bạ thật = đáng tin); nếu đã có thì đảo checked.
  const toggleUidChecked = useCallback((uid, friendHint) => {
    setUidRows((prev) => {
      const idx = prev.findIndex((r) => r.uid === uid);
      if (idx === -1) {
        const friend = friendHint || zaloFriendsMapRef.current.get(uid);
        const name = friend ? (friend.display_name || friend.displayName || `…${uid.slice(-4)}`) : uid;
        return [...prev, { uid, name, checked: true, inContacts: Boolean(friend) }];
      }
      const next = [...prev];
      next[idx] = { ...next[idx], checked: !next[idx].checked };
      return next;
    });
  }, []);

  const removeUidRow = useCallback((uid) => {
    setUidRows((prev) => prev.filter((r) => r.uid !== uid));
  }, []);

  // Dán tay danh sách UID (đúng hợp đồng backend validateManualRecipients: /^\d{6,32}$/).
  // Dòng mới luôn bắt đầu CHƯA tick — chỉ tick sau khi loadZaloContactsAndResolve xác nhận có trong danh bạ.
  const handleAddUidManual = () => {
    const rawItems = uidManualInput.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
    const validItems = rawItems.filter((s) => /^\d{6,32}$/.test(s));
    const invalidCount = rawItems.length - validItems.length;
    if (validItems.length === 0) {
      toast.error(t('quickSend.uidInvalidFormat'));
      return;
    }
    setUidRows((prev) => {
      const existing = new Set(prev.map((r) => r.uid));
      const additions = validItems
        .filter((uid) => !existing.has(uid))
        .map((uid) => resolveUidRowAgainstFriendsMap(
          { uid, name: null, checked: false, inContacts: null },
          zaloFriendsMapRef.current
        ));
      return [...prev, ...additions];
    });
    setUidManualInput('');
    if (invalidCount > 0) {
      toast.error(t('quickSend.uidSomeInvalid', { count: invalidCount }));
    }
  };

  // Select template
  const handleSelectTemplate = async (template) => {
    if (!template?.id) return;
    const templateId = template.id;
    activeTemplateSelectionIdRef.current = templateId;
    setContentMode('template');
    setSelectedTemplate(template);
    setTemplateDetailError(false);
    setIsLoadingTemplateDetail(true);

    try {
      let fullTemplate = template;
      if (selectedChannel === CHANNEL_TYPES.EMAIL) {
        const res = await emailTemplateApiService.getTemplateById(templateId);
        if (activeTemplateSelectionIdRef.current !== templateId) return;
        const data = res?.data?.data || res?.data;
        if (data) {
          fullTemplate = data;
        }
        setSelectedTemplate(fullTemplate);
        applyTemplateBody(fullTemplate);
      } else {
        const res = await zaloTemplateApiService.getTemplateById(templateId);
        if (activeTemplateSelectionIdRef.current !== templateId) return;
        const data = res?.data?.data || res?.data;
        if (data) {
          fullTemplate = data;
        }
        setSelectedTemplate(fullTemplate);
        applyTemplateBody(fullTemplate);
      }
    } catch (err) {
      if (activeTemplateSelectionIdRef.current !== templateId) return;
      console.error('Failed to fetch template detail:', err);
      setTemplateDetailError(true);
      toast.error(t('quickSend.templateLoadDetailFailed'));
    } finally {
      if (activeTemplateSelectionIdRef.current === templateId) {
        setIsLoadingTemplateDetail(false);
      }
    }
  };

  const applyTemplateBody = (template) => {
    setTemplateContent(pickTemplateContent(template, selectedChannel));
  };

  // Fetch estimated completion time from backend policy when entering PREVIEW
  useEffect(() => {
    if (currentStep !== QUICK_SEND_STEPS.PREVIEW) return;
    let isMounted = true;
    const fetchEstimate = async () => {
      setIsLoadingEstimate(true);
      try {
        const count = finalRecipients().length;
        const res = await campaignApiService.getQuickSendEstimate({
          channel: selectedChannel,
          recipients: count,
        });
        if (isMounted && res?.data?.data) {
          setEstimate(res.data.data);
        }
      } catch (err) {
        console.error('Failed to fetch estimate:', err);
      } finally {
        if (isMounted) setIsLoadingEstimate(false);
      }
    };
    fetchEstimate();
    return () => { isMounted = false; };
  }, [currentStep, selectedChannel, finalRecipients]);

  // Test send to a single address
  const handleTestSend = async () => {
    // The idempotency signature may await binary hashing. Keep a synchronous
    // guard so a rapid second click cannot begin another logical send first.
    if (isTesting || testSendPreparationRef.current) return;
    if (isLoadingTemplateDetail) {
      toast.error(t('quickSend.loadingTemplateDetail'));
      return;
    }
    if (templateDetailError) {
      toast.error(t('quickSend.templateLoadDetailFailed'));
      return;
    }
    const cleanRecipient = testRecipient.trim();
    if (!cleanRecipient) {
      toast.error(
        selectedChannel === CHANNEL_TYPES.EMAIL
          ? t('quickSend.testRecipientEmailPlaceholder')
          : t('quickSend.testRecipientPhonePlaceholder')
      );
      return;
    }

    testSendPreparationRef.current = true;
    setIsTesting(true);
    try {
      const accountId = selectedChannel === CHANNEL_TYPES.EMAIL
        ? selectedEmailAccount?.id
        : selectedZaloAccount?.id;

      const attachments = activeAttachments;

      const isEmail = selectedChannel === CHANNEL_TYPES.EMAIL;
      const { html, text } = isEmail ? resolveEmailBody() : { html: null, text: '' };
      const zaloMsg = !isEmail ? resolveZaloBody() : '';
      const subject = activeContent.subject || activeTemplate?.subject || 'Thử nghiệm gửi nhanh UKNOW';

      const testPayloadData = {
        channel: selectedChannel,
        recipient: cleanRecipient,
        accountId,
        subject,
        message: isEmail ? text : zaloMsg,
        htmlContent: isEmail ? html : null,
        attachments,
      };

      testSendActionKeyRef.current = await resolveActionIdempotencyKey(
        testSendActionKeyRef.current,
        testPayloadData
      );
      const testOptions = { idempotencyKey: testSendActionKeyRef.current.key };

      if (isEmail) {
        const res = await campaignApiService.testSendQuickCampaign({
          channel: selectedChannel,
          recipient: cleanRecipient,
          subject,
          message: text,
          htmlContent: html,
          accountId,
          attachments,
        }, testOptions);
        toast.success(res?.data?.message || t('quickSend.testSendSuccess'));
        testSendActionKeyRef.current = { key: null, signature: null };
      } else {
        const res = await campaignApiService.testSendQuickCampaign({
          channel: selectedChannel,
          recipient: cleanRecipient,
          subject,
          message: zaloMsg,
          accountId,
          attachments,
        }, testOptions);
        toast.success(res?.data?.message || t('quickSend.testSendSuccess'));
        testSendActionKeyRef.current = { key: null, signature: null };
      }
    } catch (err) {
      const msg = err.response?.data?.message || t('quickSend.testSendFailed');
      toast.error(msg);
    } finally {
      testSendPreparationRef.current = false;
      setIsTesting(false);
    }
  };

  // Run the per-recipient send loop. Returns aggregate stats; works for both
  // initial send and the post-failure retry (which calls it with the smaller
  // `recipients` list of previously-failed recipients).
  const runSendLoop = useCallback(async (recipients) => {
    const isEmail = selectedChannel === CHANNEL_TYPES.EMAIL;
    const attachments = activeAttachments;
    let successCount = 0;
    let failCount = 0;
    const failureSamples = new Map();
    let quotaExceededEarly = false;
    const failed = [];

    // Một khoá cho CẢ ĐỢT (không phải mỗi request một khoá ngẫu nhiên như trước — bấm gửi
    // 2 lần với cùng nội dung/người nhận trước đây ra 2 khoá khác nhau, gửi trùng thật).
    // Mỗi người nhận trong đợt dùng `${baseKey}-${index}` — chỉ số trong CHÍNH danh sách
    // recipients của lần gọi này, nên đợt gửi lại (retry, danh sách con) tự nhiên có chữ ký
    // khác đợt gửi đầu (recipients khác) → không bị coi nhầm là trùng với đợt đã gửi trước.
    const idempotencyPayload = {
      channel: selectedChannel,
      accountId: isEmail ? selectedEmailAccount?.id : selectedZaloAccount?.id,
      recipientType: (isEmail || selectedChannel === CHANNEL_TYPES.ZALO_GROUP) ? undefined : zaloRecipientType,
      recipients: recipients.map((r) => r.email || r.phone),
      templateId: activeTemplate?.id || null,
      subject: activeContent.subject || '',
      body: activeContent.body || '',
      attachments: attachments.map((a) => a?.key || a?.name || ''),
    };
    sendActionKeyRef.current = await resolveActionIdempotencyKey(sendActionKeyRef.current, idempotencyPayload);
    const baseKey = sendActionKeyRef.current.key;

    if (isEmail) {
      const { html, text } = resolveEmailBody();
      const subject = activeContent.subject || activeTemplate?.subject || 'Không có tiêu đề';
      for (const [idx, recipient] of recipients.entries()) {
        try {
          await emailSettingsApiService.sendEmail({
            fromEmailId: parseInt(selectedEmailAccount.id, 10),
            to: recipient.email,
            subject,
            content: text,
            htmlContent: html,
            attachments,
          }, { idempotencyKey: `${baseKey}-${idx}` });
          successCount++;
        } catch (err) {
          console.error('Send email error to:', recipient.email, err);
          failCount++;
          failed.push(recipient);
          const info = classifySendError(err);
          if (info.errorType === 'quota_exceeded') {
            quotaExceededEarly = true;
          }
          if (!failureSamples.has(info.errorType)) {
            failureSamples.set(info.errorType, {
              ...info,
              firstRecipient: recipient.email,
            });
          }
          if (quotaExceededEarly) break;
        }
      }
    } else if (selectedChannel === CHANNEL_TYPES.ZALO_GROUP) {
      const message = resolveZaloBody();
      for (const [idx, recipient] of recipients.entries()) {
        try {
          // recipient.phone == groupId (xem finalRecipients() — dùng chung shape {email,phone,name}).
          const res = await zaloSettingsApiService.sendGroupMessage({
            accountId: selectedZaloAccount.id,
            groupId: recipient.phone,
            message,
            attachments,
          }, { idempotencyKey: `${baseKey}-${idx}` });
          throwIfZaloItemFailed(res);
          successCount++;
        } catch (err) {
          console.error('Send Zalo group error to:', recipient.name, err);
          failCount++;
          failed.push(recipient);
          const info = classifySendError(err);
          if (!failureSamples.has(info.errorType)) {
            failureSamples.set(info.errorType, {
              ...info,
              firstRecipient: recipient.name,
            });
          }
        }
      }
    } else {
      const message = resolveZaloBody();
      for (const [idx, recipient] of recipients.entries()) {
        try {
          const res = await zaloSettingsApiService.sendMessage({
            accountId: selectedZaloAccount.id,
            phone: recipient.phone,
            recipientType: zaloRecipientType,
            message,
            attachments,
          }, { idempotencyKey: `${baseKey}-${idx}` });
          throwIfZaloItemFailed(res);
          successCount++;
        } catch (err) {
          console.error('Send Zalo error to:', recipient.phone, err);
          failCount++;
          failed.push(recipient);
          const info = classifySendError(err);
          if (!failureSamples.has(info.errorType)) {
            failureSamples.set(info.errorType, {
              ...info,
              firstRecipient: recipient.phone,
            });
          }
        }
      }
    }
    // Đợt đã xong (thành công lẫn thất bại) — reset để lần gửi MỚI sau đó (kể cả trùng nội
    // dung) tính khoá mới, không bị coi nhầm là trùng với đợt vừa xong (cùng pattern
    // testSendActionKeyRef đã dùng ở handleTestSend).
    sendActionKeyRef.current = { key: null, signature: null };
    return { isEmail, successCount, failCount, failureSamples, failed };
  }, [
    selectedChannel,
    selectedEmailAccount,
    selectedZaloAccount,
    resolveEmailBody,
    resolveZaloBody,
    activeContent,
    activeTemplate,
    activeAttachments,
    zaloRecipientType,
  ]);

  // Send quick campaign - gửi trực tiếp không cần tạo campaign
  const handleSend = async () => {
    if (isSending || sendPreparationRef.current) return;
    const recipients = finalRecipients();
    if (recipients.length === 0) {
      toast.error(t('quickSend.noRecipients'));
      return;
    }
    // Validate content theo đúng chế độ đang active. Chế độ mẫu: chọn mẫu là đủ, kể cả khi
    // mẫu đó rỗng cả hai field (hiếm nhưng có thể xảy ra với mẫu mới import) — coi việc chọn
    // mẫu là bằng chứng người dùng CHỦ Ý gửi nó, để backend tự báo lỗi rõ hơn nếu rỗng thật.
    // Chế độ soạn mới: bắt buộc nội dung không chỉ gồm khoảng trắng — không có "mẫu" nào để
    // viện cớ gửi tiếp.
    if (contentMode === 'template') {
      if (!selectedTemplate) {
        toast.error(t('quickSend.noTemplate'));
        return;
      }
    } else if (!(activeContent.body && activeContent.body.trim())) {
      toast.error(t('quickSend.customContentEmpty'));
      return;
    }
    if (isLoadingTemplateDetail) {
      toast.error(t('quickSend.loadingTemplateDetail'));
      return;
    }
    if (templateDetailError) {
      toast.error(t('quickSend.templateLoadDetailFailed'));
      return;
    }

    // Validate sender account
    if (selectedChannel === CHANNEL_TYPES.EMAIL && !selectedEmailAccount) {
      toast.error(t('quickSend.noEmailAccountSelected'));
      setCurrentStep(QUICK_SEND_STEPS.RECIPIENTS);
      setIsSending(false);
      return;
    }
    if ((selectedChannel === CHANNEL_TYPES.ZALO || selectedChannel === CHANNEL_TYPES.ZALO_GROUP) && !selectedZaloAccount) {
      toast.error(t('quickSend.noZaloAccountSelected'));
      setCurrentStep(QUICK_SEND_STEPS.RECIPIENTS);
      setIsSending(false);
      return;
    }

    sendPreparationRef.current = true;
    setIsSending(true);
    setCurrentStep(QUICK_SEND_STEPS.SENDING);

    try {
      const totalRecipients = recipients.length;
      const result = await runSendLoop(recipients);
      const { isEmail, successCount, failCount, failureSamples, failed } = result;

      if (successCount === 0) {
        toast.error(buildFailureToast(failureSamples, isEmail));
        setSendResult({
          success: false,
          recipientsCount: totalRecipients,
          successCount,
          failCount,
          failureTypes: Array.from(failureSamples.keys()),
        });
        setFailedRecipients(failed);
        setCurrentStep(QUICK_SEND_STEPS.DONE);
      } else {
        if (failCount > 0 && failureSamples.size > 0) {
          // Partial success — show why some failed (single toast, not one per recipient).
          toast.error(buildFailureToast(failureSamples, isEmail));
        }
        setSendResult({
          success: true,
          recipientsCount: totalRecipients,
          successCount,
          failCount,
          failureTypes: Array.from(failureSamples.keys()),
        });
        setFailedRecipients(failed);
        setCurrentStep(QUICK_SEND_STEPS.DONE);
        toast.success(t('quickSend.sendSuccess'));
      }
    } catch (error) {
      console.error('Quick send error:', error);
      toast.error(error?.response?.data?.message || error?.message || t('quickSend.sendFailed'));
      setCurrentStep(QUICK_SEND_STEPS.PREVIEW);
    } finally {
      sendPreparationRef.current = false;
      setIsSending(false);
    }
  };

  // Retry the send only to the previously-failed recipients (best-effort —
  // we don't re-pick a different sender account, etc.). Only available when
  // the failure wasn't caused by quota exhaustion, since that would never
  // succeed on the same sender anyway.
  const handleRetryFailed = async () => {
    if (isRetrying || retryPreparationRef.current) return;
    if (failedRecipients.length === 0) return;
    if ((sendResult?.failureTypes || []).includes('quota_exceeded')) {
      toast.error(t('quickSend.retryQuotaBlocked') || 'Đã vượt hạn mức — không thể gửi lại.');
      return;
    }
    retryPreparationRef.current = true;
    setIsRetrying(true);
    try {
      const result = await runSendLoop(failedRecipients);
      const { successCount, failCount, failureSamples, failed } = result;
      const previouslySucceeded = (sendResult?.successCount || 0);
      const totalSuccess = previouslySucceeded + successCount;
      const totalRecipients = sendResult?.recipientsCount || failedRecipients.length;

      if (failCount > 0 && failureSamples.size > 0) {
        toast.error(buildFailureToast(failureSamples, selectedChannel === CHANNEL_TYPES.EMAIL));
      }
      setSendResult({
        success: totalSuccess > 0,
        recipientsCount: totalRecipients,
        successCount: totalSuccess,
        failCount,
        failureTypes: Array.from(failureSamples.keys()),
      });
      setFailedRecipients(failed);
      if (successCount > 0) {
        toast.success(
          t('quickSend.retrySuccess', { count: successCount }) ||
          `Đã gửi lại thành công ${successCount} người.`,
        );
      }
    } catch (error) {
      console.error('Retry error:', error);
      toast.error(error?.response?.data?.message || t('quickSend.sendFailed'));
    } finally {
      retryPreparationRef.current = false;
      setIsRetrying(false);
    }
  };

  // Reset and start over
  const handleStartOver = () => {
    setCurrentStep(QUICK_SEND_STEPS.RECIPIENTS);
    setContentMode('template');
    setSelectedTemplate(null);
    setTemplateContent({ subject: '', body: '' });
    setCustomContent({ subject: '', body: '' });
    // extraAttachments có thể đến từ bản nháp AI trước đó — "Gửi tiếp" phải xoá, không được
    // mang đính kèm của lượt gửi cũ sang lượt mới.
    setExtraAttachments([]);
    setManualEmails('');
    setManualPhones('');
    setZaloRecipientType(ZALO_RECIPIENT_TYPES.PHONE);
    setUidRows([]);
    setUidManualInput('');
    setUidSearch('');
    setUidSearchResults([]);
    setSelectedGroups([]);
    resolvedForAccountIdRef.current = null;
    sendActionKeyRef.current = { key: null, signature: null };
    setSendResult(null);
    setFailedRecipients([]);
  };

  // Đổi kênh gửi — Email dùng subject+HTML, Zalo (cá nhân/nhóm) chỉ dùng plain text. Đổi
  // qua lại giữa hai "họ" này thì nội dung/mẫu đang có không còn hợp kênh mới (mẫu Email/Zalo
  // cũng là hai danh sách riêng) — xoá để không lỡ tay gửi nội dung của kênh cũ sang kênh mới.
  // Đổi giữa Zalo cá nhân ↔ Zalo nhóm giữ nguyên vì cùng "họ" (cùng danh sách mẫu, cùng dạng
  // plain text).
  const handleChannelChange = (nextChannel) => {
    if (nextChannel === selectedChannel) return;
    const wasEmail = selectedChannel === CHANNEL_TYPES.EMAIL;
    const willBeEmail = nextChannel === CHANNEL_TYPES.EMAIL;
    if (wasEmail !== willBeEmail) {
      setContentMode('template');
      setSelectedTemplate(null);
      setTemplateContent({ subject: '', body: '' });
      setCustomContent({ subject: '', body: '' });
    }
    setSelectedChannel(nextChannel);
  };

  // Step indicators
  const steps = [
    { key: QUICK_SEND_STEPS.RECIPIENTS, label: t('quickSend.stepRecipients'), icon: HiOutlineUsers },
    { key: QUICK_SEND_STEPS.TEMPLATE, label: t('quickSend.stepTemplate'), icon: HiOutlineMail },
    { key: QUICK_SEND_STEPS.PREVIEW, label: t('quickSend.stepPreview'), icon: HiOutlineCheckCircle },
  ];

  const currentStepIndex = steps.findIndex((s) => s.key === currentStep);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <HiOutlineMail className="w-7 h-7 text-orange-500" />
            {t('quickSend.title')}
          </h1>
          <p className="text-sm text-gray-500 mt-1">{t('quickSend.subtitle')}</p>
        </div>

        {/* Step Indicators */}
        <div className="max-w-6xl mx-auto px-4 pb-4">
          <div className="flex items-center gap-2">
            {steps.map((step, index) => {
              const isActive = step.key === currentStep;
              const isCompleted = index < currentStepIndex || currentStep === QUICK_SEND_STEPS.DONE;
              const Icon = step.icon;
              return (
                <div key={step.key} className="flex items-center">
                  <div
                    className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition ${
                      isActive
                        ? 'bg-orange-100 text-orange-700'
                        : isCompleted
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {isCompleted ? (
                      <HiOutlineCheckCircle className="w-4 h-4" />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                    <span>{step.label}</span>
                  </div>
                  {index < steps.length - 1 && (
                    <HiOutlineChevronRight className="w-4 h-4 text-gray-300 mx-1" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-6">
        {/* Channel Selection */}
        {currentStep === QUICK_SEND_STEPS.RECIPIENTS && (
          <div className="space-y-6">
            {/* Channel Type */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('quickSend.selectChannel')}</h2>
              <div className="grid grid-cols-3 gap-4">
                <button
                  onClick={() => handleChannelChange(CHANNEL_TYPES.EMAIL)}
                  className={`p-4 rounded-xl border-2 transition flex flex-col items-center gap-2 ${
                    selectedChannel === CHANNEL_TYPES.EMAIL
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <HiOutlineMail className={`w-8 h-8 ${selectedChannel === CHANNEL_TYPES.EMAIL ? 'text-orange-500' : 'text-gray-400'}`} />
                  <span className={`font-medium ${selectedChannel === CHANNEL_TYPES.EMAIL ? 'text-orange-700' : 'text-gray-700'}`}>
                    Email
                  </span>
                </button>
                <button
                  onClick={() => handleChannelChange(CHANNEL_TYPES.ZALO)}
                  className={`p-4 rounded-xl border-2 transition flex flex-col items-center gap-2 ${
                    selectedChannel === CHANNEL_TYPES.ZALO
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <HiOutlineChat className={`w-8 h-8 ${selectedChannel === CHANNEL_TYPES.ZALO ? 'text-orange-500' : 'text-gray-400'}`} />
                  <span className={`font-medium ${selectedChannel === CHANNEL_TYPES.ZALO ? 'text-orange-700' : 'text-gray-700'}`}>
                    Zalo
                  </span>
                </button>
                <button
                  onClick={() => handleChannelChange(CHANNEL_TYPES.ZALO_GROUP)}
                  className={`p-4 rounded-xl border-2 transition flex flex-col items-center gap-2 ${
                    selectedChannel === CHANNEL_TYPES.ZALO_GROUP
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <HiOutlineUserGroup className={`w-8 h-8 ${selectedChannel === CHANNEL_TYPES.ZALO_GROUP ? 'text-orange-500' : 'text-gray-400'}`} />
                  <span className={`font-medium ${selectedChannel === CHANNEL_TYPES.ZALO_GROUP ? 'text-orange-700' : 'text-gray-700'}`}>
                    {t('quickSend.channelZaloGroup')}
                  </span>
                </button>
              </div>
            </div>

            {/* Sender Account Selection */}
            {selectedChannel === CHANNEL_TYPES.EMAIL ? (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('quickSend.selectSenderAccount')}</h2>
                {isLoadingAccounts ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="h-6 w-6 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
                  </div>
                ) : emailAccounts.length === 0 ? (
                  <p className="text-sm text-gray-500">{t('quickSend.noEmailAccounts')}</p>
                ) : (
                  <div className="space-y-2">
                    {emailAccounts.map((account) => (
                      <label
                        key={account.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition ${
                          selectedEmailAccount?.id === account.id
                            ? 'border-orange-500 bg-orange-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="emailAccount"
                          checked={selectedEmailAccount?.id === account.id}
                          onChange={() => setSelectedEmailAccount(account)}
                          className="w-4 h-4 text-orange-500"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{account.name}</p>
                          <p className="text-sm text-gray-500">{account.email || account.from_email}</p>
                        </div>
                        {(account.isDefault || account.is_active) && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                            {t('quickSend.default')}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('quickSend.selectSenderAccount')}</h2>
                {isLoadingAccounts ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="h-6 w-6 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
                  </div>
                ) : zaloAccounts.length === 0 ? (
                  <p className="text-sm text-gray-500">{t('quickSend.noZaloAccounts')}</p>
                ) : (
                  <div className="space-y-2">
                    {zaloAccounts.map((account) => (
                      <label
                        key={account.id}
                        className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition ${
                          selectedZaloAccount?.id === account.id
                            ? 'border-orange-500 bg-orange-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <input
                          type="radio"
                          name="zaloAccount"
                          checked={selectedZaloAccount?.id === account.id}
                          onChange={() => setSelectedZaloAccount(account)}
                          className="w-4 h-4 text-orange-500"
                        />
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{account.displayName || account.zaloName || 'Tài khoản Zalo'}</p>
                          <p className="text-sm text-gray-500">{account.zaloUserId || account.zaloPhone || ''}</p>
                        </div>
                        {(account.isDefault || account.is_default) && (
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                            {t('quickSend.default')}
                          </span>
                        )}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Manual Input Section */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-4">
                <HiOutlinePlus className="w-5 h-5 text-orange-500" />
                <h2 className="text-lg font-semibold text-gray-900">{t('quickSend.manualInput')}</h2>
              </div>

              {selectedChannel === CHANNEL_TYPES.ZALO_GROUP ? (
                <div className="space-y-3">
                  {!selectedZaloAccount?.id ? (
                    <p className="text-sm text-amber-600">{t('quickSend.groupNoAccountSelected')}</p>
                  ) : (
                    <ZaloGroupPickerCard
                      data={{ accountId: selectedZaloAccount.id }}
                      isActive
                      t={t}
                      onSubmit={(ids, groups) => {
                        const byId = new Map(
                          groups.map((g) => [String(g.groupId || g.group_id || g.id || ''), g.groupName || g.group_name || g.name])
                        );
                        setSelectedGroups(ids.map((id) => ({ id: String(id), name: byId.get(String(id)) || String(id) })));
                        toast.success(t('quickSend.groupSelected', { count: ids.length }));
                      }}
                    />
                  )}
                  {selectedGroups.length > 0 && (
                    <div className="border border-gray-200 rounded-lg p-3">
                      <p className="text-xs font-medium text-gray-500 mb-2">{t('quickSend.groupSelectedListLabel')}</p>
                      <div className="flex flex-wrap gap-2">
                        {selectedGroups.map((g) => (
                          <span key={g.id} className="inline-flex items-center gap-1 rounded-full bg-orange-50 border border-orange-200 px-3 py-1 text-xs text-orange-700">
                            {g.name || t('quickSend.groupNotFound', { last4: g.id.slice(-4) })}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
              <>
              {selectedChannel === CHANNEL_TYPES.ZALO && (
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('quickSend.zaloRecipientTypeLabel')}
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="zaloRecipientType"
                        checked={zaloRecipientType === ZALO_RECIPIENT_TYPES.PHONE}
                        onChange={() => setZaloRecipientType(ZALO_RECIPIENT_TYPES.PHONE)}
                        className="w-4 h-4 text-orange-500"
                      />
                      {t('quickSend.zaloRecipientTypePhone')}
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="radio"
                        name="zaloRecipientType"
                        checked={zaloRecipientType === ZALO_RECIPIENT_TYPES.UID}
                        onChange={() => setZaloRecipientType(ZALO_RECIPIENT_TYPES.UID)}
                        className="w-4 h-4 text-orange-500"
                      />
                      {t('quickSend.zaloRecipientTypeUid')}
                    </label>
                  </div>
                </div>
              )}

              {selectedChannel === CHANNEL_TYPES.ZALO && zaloRecipientType === ZALO_RECIPIENT_TYPES.UID ? (
                <div className="space-y-4">
                  {!selectedZaloAccount?.id && (
                    <p className="text-sm text-amber-600">{t('quickSend.uidNoAccountSelected')}</p>
                  )}

                  {/* Danh sách UID đã chọn / chờ xác nhận */}
                  {uidRows.length > 0 && (
                    <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-72 overflow-y-auto">
                      {uidRows.map((row) => (
                        <label
                          key={row.uid}
                          className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={row.checked}
                            onChange={() => toggleUidChecked(row.uid)}
                            className="w-4 h-4 text-orange-500 rounded"
                          />
                          <div className="flex-1 min-w-0">
                            {row.inContacts === null ? (
                              <p className="text-sm text-gray-400 italic">{t('quickSend.uidLoadingContacts')}</p>
                            ) : row.inContacts ? (
                              <p className="text-sm font-medium text-gray-900 truncate">{row.name}</p>
                            ) : (
                              <p className="text-sm text-amber-700 truncate">
                                {t('quickSend.uidNotInContacts', { last4: row.uid.slice(-4) })}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.preventDefault(); removeUidRow(row.uid); }}
                            className="text-gray-400 hover:text-red-500 text-xs font-medium"
                          >
                            ✕
                          </button>
                        </label>
                      ))}
                    </div>
                  )}
                  {uidRows.some((r) => r.inContacts === false) && (
                    <p className="text-xs text-amber-600">{t('quickSend.uidConfirmHint')}</p>
                  )}

                  {/* Thêm từ danh bạ (tìm theo tên) */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('quickSend.uidAddFromContactsLabel')}
                    </label>
                    <input
                      type="text"
                      value={uidSearch}
                      onChange={(e) => setUidSearch(e.target.value)}
                      placeholder={t('quickSend.uidSearchPlaceholder')}
                      disabled={!selectedZaloAccount?.id}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 disabled:bg-gray-50"
                    />
                    {isLoadingUidSearch ? (
                      <p className="text-xs text-gray-400 mt-2">{t('quickSend.uidLoadingContacts')}</p>
                    ) : uidSearch && uidSearchResults.length === 0 ? (
                      <p className="text-xs text-gray-400 mt-2">{t('quickSend.uidNoSearchResults')}</p>
                    ) : uidSearchResults.length > 0 ? (
                      <div className="mt-2 border border-gray-100 rounded-lg divide-y divide-gray-50 max-h-48 overflow-y-auto">
                        {uidSearchResults.map((friend) => {
                          const id = String(friend.friend_id || friend.friendId || friend.id || '');
                          const name = friend.display_name || friend.displayName || id;
                          const isChecked = uidRows.some((r) => r.uid === id && r.checked);
                          return (
                            <label key={id} className="flex items-center gap-2.5 px-3 py-2 hover:bg-gray-50 cursor-pointer text-sm">
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={() => toggleUidChecked(id, friend)}
                                className="w-4 h-4 text-orange-500 rounded"
                              />
                              <span className="truncate text-gray-800">{name}</span>
                            </label>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>

                  {/* Dán tay UID */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {t('quickSend.uidManualAddLabel')}
                    </label>
                    <textarea
                      value={uidManualInput}
                      onChange={(e) => setUidManualInput(e.target.value)}
                      placeholder={t('quickSend.uidManualAddPlaceholder')}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddUidManual}
                      disabled={!uidManualInput.trim()}
                      className="mt-2 px-4 py-2 text-sm font-medium text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t('quickSend.uidManualAddButton')}
                    </button>
                  </div>

                  {isLoadingUidContacts && (
                    <p className="text-xs text-gray-400">{t('quickSend.uidLoadingContacts')}</p>
                  )}
                  <p className="text-xs text-gray-500">
                    {t('quickSend.uidSelectedCount', { count: uidRows.filter((r) => r.checked).length })}
                  </p>
                </div>
              ) : (
                <>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {selectedChannel === CHANNEL_TYPES.EMAIL
                      ? t('quickSend.manualEmails')
                      : t('quickSend.manualPhones')}
                  </label>
                  <textarea
                    value={selectedChannel === CHANNEL_TYPES.EMAIL ? manualEmails : manualPhones}
                    onChange={(e) =>
                      selectedChannel === CHANNEL_TYPES.EMAIL
                        ? setManualEmails(e.target.value)
                        : setManualPhones(e.target.value)
                    }
                    placeholder={
                      selectedChannel === CHANNEL_TYPES.EMAIL
                        ? 'email1@example.com\nemail2@example.com'
                        : '0901234567\n0902345678'
                    }
                    rows={6}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    {t('quickSend.manualInputHint')}
                  </p>
                </>
              )}
              </>
              )}
            </div>

            {/* Next Button */}
            <div className="flex justify-end">
              <button
                onClick={() => setCurrentStep(QUICK_SEND_STEPS.TEMPLATE)}
                disabled={!hasManualRecipients()}
                className="px-6 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {t('quickSend.next')}
                <HiOutlineChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Content Selection */}
        {currentStep === QUICK_SEND_STEPS.TEMPLATE && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('quickSend.contentSourceLabel')}</h2>
              <div className="grid grid-cols-2 gap-4 mb-6">
                <button
                  onClick={() => setContentMode('template')}
                  className={`p-4 rounded-xl border-2 text-left transition ${
                    contentMode === 'template'
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className={`font-medium ${contentMode === 'template' ? 'text-orange-700' : 'text-gray-700'}`}>
                    {t('quickSend.contentModeTemplate')}
                  </p>
                </button>
                <button
                  onClick={() => setContentMode('custom')}
                  className={`p-4 rounded-xl border-2 text-left transition ${
                    contentMode === 'custom'
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className={`font-medium ${contentMode === 'custom' ? 'text-orange-700' : 'text-gray-700'}`}>
                    {t('quickSend.contentModeCustom')}
                  </p>
                </button>
              </div>

              {contentMode === 'template' ? (
                <>
                  <h3 className="text-base font-semibold text-gray-900 mb-4">{t('quickSend.selectTemplate')}</h3>
                  {isLoadingTemplates ? (
                    <div className="flex items-center justify-center py-10">
                      <div className="h-8 w-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {(selectedChannel === CHANNEL_TYPES.EMAIL ? emailTemplates : zaloTemplates).map((template) => (
                        <button
                          key={template.id}
                          onClick={() => handleSelectTemplate(template)}
                          className={`p-4 rounded-xl border-2 text-left transition ${
                            selectedTemplate?.id === template.id
                              ? 'border-orange-500 bg-orange-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <p className="font-medium text-gray-900 truncate">
                            {template.templateName || template.name || template.title || 'Untitled'}
                          </p>
                          {template.subject && (
                            <p className="text-sm text-gray-500 truncate mt-1">{template.subject}</p>
                          )}
                          <p className="text-xs text-gray-400 truncate mt-1">
                            {template.bodyText || template.body_html || template.body_text || ''}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}

                  {selectedTemplate && (
                    <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-700">{t('quickSend.selectedTemplate')}</p>
                        {isLoadingTemplateDetail && (
                          <span className="text-xs text-orange-600 flex items-center gap-1.5 font-medium">
                            <span className="w-3.5 h-3.5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
                            {t('quickSend.loadingTemplateDetail')}
                          </span>
                        )}
                      </div>
                      <p className="text-gray-900 font-medium mt-1">{selectedTemplate.templateName || selectedTemplate.name || selectedTemplate.title}</p>
                      {selectedTemplate.attachments && selectedTemplate.attachments.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-gray-200">
                          <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                            <HiOutlinePaperClip className="w-3.5 h-3.5 text-gray-500" />
                            {t('quickSend.attachments')} ({selectedTemplate.attachments.length})
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {selectedTemplate.attachments.map((att, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1 px-2.5 py-1 bg-white rounded border border-gray-200 text-xs text-gray-700">
                                <HiOutlinePaperClip className="w-3 h-3 text-gray-400" />
                                <span className="truncate max-w-[200px]">{att.originalName || att.name || att.filename || att.key}</span>
                                {att.size ? <span className="text-gray-400">({formatFileSize(att.size)})</span> : null}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-4">
                  {selectedChannel === CHANNEL_TYPES.EMAIL && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        {t('quickSend.customSubjectLabel')}
                      </label>
                      <input
                        type="text"
                        value={customContent.subject}
                        onChange={(e) => setCustomContent((prev) => ({ ...prev, subject: e.target.value }))}
                        placeholder={t('quickSend.customSubjectPlaceholder')}
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      {selectedChannel === CHANNEL_TYPES.EMAIL
                        ? t('quickSend.customEmailContentLabel')
                        : t('quickSend.customMessageContentLabel')}
                    </label>
                    <textarea
                      value={customContent.body}
                      onChange={(e) => setCustomContent((prev) => ({ ...prev, body: e.target.value }))}
                      placeholder={t('quickSend.customBodyPlaceholder')}
                      rows={10}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Navigation */}
            <div className="flex justify-between">
              <button
                onClick={() => setCurrentStep(QUICK_SEND_STEPS.RECIPIENTS)}
                className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
              >
                {t('quickSend.back')}
              </button>
              <button
                onClick={() => setCurrentStep(QUICK_SEND_STEPS.PREVIEW)}
                disabled={contentMode === 'template' ? !selectedTemplate : !(customContent.body && customContent.body.trim())}
                className="px-6 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {t('quickSend.next')}
                <HiOutlineChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* Preview & Send */}
        {currentStep === QUICK_SEND_STEPS.PREVIEW && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('quickSend.previewAndSend')}</h2>

              {/* Summary */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">{t('quickSend.channel')}</p>
                  <p className="text-base font-semibold text-gray-900 capitalize mt-1">{selectedChannel}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">{t('quickSend.senderAccount') || 'Tài khoản gửi'}</p>
                  <p className="text-base font-semibold text-gray-900 truncate mt-1">
                    {selectedChannel === CHANNEL_TYPES.EMAIL
                      ? (selectedEmailAccount?.name || selectedEmailAccount?.email || '-')
                      : (selectedZaloAccount?.name || selectedZaloAccount?.display_name || selectedZaloAccount?.zaloName || 'Tài khoản Zalo')}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">{t('quickSend.recipients')}</p>
                  <p className="text-base font-semibold text-gray-900 mt-1">{finalRecipients().length}</p>
                </div>
                <div className="p-4 bg-orange-50/60 border border-orange-100 rounded-lg">
                  <p className="text-xs text-orange-600 font-medium flex items-center gap-1">
                    <HiOutlineClock className="w-3.5 h-3.5" />
                    {t('quickSend.estimatedDuration')}
                  </p>
                  <p className="text-base font-semibold text-orange-900 mt-1">
                    {isLoadingEstimate ? '...' : (
                      estimate?.unit === 'immediate'
                        ? t('quickSend.immediate')
                        : estimate?.unit === 'seconds'
                          ? t('quickSend.estimateSeconds', { value: estimate.value })
                          : estimate?.unit === 'minutes'
                            ? t('quickSend.estimateMinutes', { value: estimate.value })
                            : estimate?.unit === 'hours'
                              ? t('quickSend.estimateHours', { value: estimate.value })
                              : estimate?.unit === 'days'
                                ? t('quickSend.estimateDays', { value: estimate.value })
                                : t('quickSend.immediate')
                    )}
                  </p>
                </div>
              </div>

              {/* Quiet hours notice if applicable */}
              {estimate?.quietHours?.enabled && (
                <div className="mb-6 p-3.5 rounded-lg bg-indigo-50 border border-indigo-200 flex items-start gap-2.5 text-xs text-indigo-900 animate-fadeIn">
                  <HiOutlineMoon className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">
                    {t('quickSend.quietHoursNotice', {
                      start: estimate.quietHours.startFormatted || '23:00',
                      end: estimate.quietHours.endFormatted || '06:00',
                    })}
                  </span>
                </div>
              )}

              {/* Template / Message Content Preview */}
              {(activeTemplate || activeContent.subject || activeContent.body || activeAttachments.length > 0) && (
                <div className="p-4 bg-gray-50 rounded-lg mb-4">
                  <p className="text-sm font-medium text-gray-700">
                    {activeTemplate
                      ? t('quickSend.template')
                      : (selectedChannel === CHANNEL_TYPES.EMAIL
                        ? t('quickSend.customEmailContentLabel')
                        : t('quickSend.customMessageContentLabel'))}
                  </p>
                  {activeTemplate ? (
                    <p className="text-gray-900 font-medium mt-1">{activeTemplate.templateName || activeTemplate.name || activeTemplate.title}</p>
                  ) : (
                    <>
                      {activeContent.subject && (
                        <p className="text-gray-900 font-medium mt-1">{activeContent.subject}</p>
                      )}
                      {/* Nội dung tự soạn hiển thị dưới dạng text an toàn (con React tự escape),
                          KHÔNG dùng dangerouslySetInnerHTML — đây là bản Markdown/plain text thô,
                          chưa qua miniMarkdownToHtml. */}
                      {activeContent.body && (
                        <p className="text-gray-700 text-sm mt-1 whitespace-pre-wrap line-clamp-6">{activeContent.body}</p>
                      )}
                    </>
                  )}
                  {activeAttachments.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                        <HiOutlinePaperClip className="w-3.5 h-3.5 text-gray-500" />
                        {t('quickSend.attachments')} ({activeAttachments.length})
                      </p>
                      <div className="space-y-1.5">
                        {activeAttachments.map((att, idx) => (
                          <div key={idx} className="flex items-center gap-2 text-xs text-gray-700 bg-white px-3 py-1.5 rounded border border-gray-200">
                            <HiOutlinePaperClip className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            <span className="font-medium truncate">{att.originalName || att.name || att.filename || att.key}</span>
                            {att.size ? <span className="text-gray-400 shrink-0">({formatFileSize(att.size)})</span> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Recipients Preview */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-700 mb-2">{t('quickSend.recipientsList')}</p>
                <div className="max-h-40 overflow-y-auto">
                  {finalRecipients().slice(0, 20).map((r, i) => (
                    <p key={i} className="text-sm text-gray-600">
                      {r.name || r.email || r.phone}
                    </p>
                  ))}
                  {finalRecipients().length > 20 && (
                    <p className="text-sm text-gray-500 mt-2">
                      ...{t('quickSend.andMore', { count: finalRecipients().length - 20 })}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Test Send Box — ẩn cho Zalo nhóm: không có khái niệm "gửi thử tới 1 địa chỉ",
                đích đến CỐ ĐỊNH là nhóm đã chọn, "gửi thử" sẽ tức là gửi thật vào nhóm đó. */}
            {selectedChannel !== CHANNEL_TYPES.ZALO_GROUP && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center gap-2 mb-1">
                <HiOutlinePaperAirplane className="w-5 h-5 text-orange-500" />
                <h3 className="text-base font-semibold text-gray-900">{t('quickSend.testSendTitle')}</h3>
              </div>
              <p className="text-xs text-gray-500 mb-4">{t('quickSend.testSendDesc')}</p>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type={selectedChannel === CHANNEL_TYPES.EMAIL ? 'email' : 'tel'}
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder={
                    selectedChannel === CHANNEL_TYPES.EMAIL
                      ? t('quickSend.testRecipientEmailPlaceholder')
                      : t('quickSend.testRecipientPhonePlaceholder')
                  }
                  className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
                <button
                  type="button"
                  onClick={handleTestSend}
                  disabled={isTesting || !testRecipient.trim()}
                  className="px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {isTesting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>{t('quickSend.testing')}</span>
                    </>
                  ) : (
                    <>
                      <HiOutlinePaperAirplane className="w-4 h-4" />
                      <span>{t('quickSend.testSendButton')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
            )}

            {/* Warning */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-amber-800 text-sm">
                <strong>{t('quickSend.warning')}:</strong> {t('quickSend.warningText')}
              </p>
            </div>

            {/* Navigation */}
            <div className="flex justify-between">
              <button
                onClick={() => setCurrentStep(QUICK_SEND_STEPS.TEMPLATE)}
                className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
              >
                {t('quickSend.back')}
              </button>
              <button
                onClick={handleSend}
                disabled={isSending}
                className="px-6 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <HiOutlineMail className="w-5 h-5" />
                {isSending ? t('quickSend.sending') : t('quickSend.sendNow')}
              </button>
            </div>
          </div>
        )}

        {/* Sending */}
        {currentStep === QUICK_SEND_STEPS.SENDING && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <div className="h-16 w-16 rounded-full border-4 border-orange-500 border-t-transparent animate-spin mx-auto mb-6" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('quickSend.sending')}</h2>
            <p className="text-gray-500">{t('quickSend.sendingDesc')}</p>
          </div>
        )}

        {/* Done */}
        {currentStep === QUICK_SEND_STEPS.DONE && sendResult && (
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            {sendResult.success ? (
              <>
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <HiOutlineCheckCircle className="w-8 h-8 text-green-500" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('quickSend.sendSuccessTitle')}</h2>
                <p className="text-gray-500 mb-2">
                  {t('quickSend.sendSuccessDesc', { count: sendResult.successCount })}
                </p>
                {sendResult.failCount > 0 && (
                  <p className="text-red-600 text-sm mb-4">
                    {t('quickSend.sendPartialFail', { failCount: sendResult.failCount })}
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                  <HiOutlineXCircle className="w-8 h-8 text-red-500" />
                </div>
                <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('quickSend.sendAllFailedTitle')}</h2>
                <p className="text-gray-500 mb-4">{t('quickSend.sendAllFailedDesc')}</p>
              </>
            )}
            {failedRecipients.length > 0 && !isRetrying && (
              <p className="text-xs text-gray-400 mb-3">
                {t('quickSend.failedRecipientCount', { count: failedRecipients.length }) ||
                  `${failedRecipients.length} người nhận bị lỗi`}
              </p>
            )}
            <div className="flex justify-center gap-3 flex-wrap">
              {failedRecipients.length > 0 && (
                <button
                  onClick={handleRetryFailed}
                  disabled={isRetrying}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-medium rounded-lg hover:bg-orange-600 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  <HiOutlineRefresh className={`w-4 h-4 ${isRetrying ? 'animate-spin' : ''}`} />
                  {isRetrying
                    ? (t('quickSend.retrying') || 'Đang gửi lại…')
                    : (t('quickSend.retryFailed', { count: failedRecipients.length }) ||
                       `Gửi lại cho ${failedRecipients.length} người`)}
                </button>
              )}
              <button
                onClick={handleStartOver}
                disabled={isRetrying}
                className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 disabled:opacity-60 transition"
              >
                {t('quickSend.sendAnother')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickSend;
