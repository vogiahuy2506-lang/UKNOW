import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import emailTemplateApiService from '../../features/templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../features/templates/services/zaloTemplateApi.service';
import emailSettingsApiService from '../../features/settings/services/emailSettingsApi.service';
import zaloSettingsApiService from '../../features/settings/services/zaloSettingsApi.service';
import campaignApiService from '../../features/campaigns/services/campaignApi.service';
import { htmlToPlainText } from '../../utils/htmlToPlainText.util.js';
import { miniMarkdownToHtml } from '../../utils/miniMarkdownToHtml.js';
import { pickTemplateContent } from './quickSend.util';
import {
  HiOutlinePlus,
  HiOutlineMail,
  HiOutlineChat,
  HiOutlineUsers,
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
};

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

const QuickSend = () => {
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(QUICK_SEND_STEPS.RECIPIENTS);
  const [selectedChannel, setSelectedChannel] = useState(CHANNEL_TYPES.EMAIL);

  // Manual input state
  const [manualEmails, setManualEmails] = useState('');
  const [manualPhones, setManualPhones] = useState('');

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

  // Nạp bản nháp từ Trợ lý AI (quickSendDraft) nếu có
  useEffect(() => {
    const draft = location.state?.quickSendDraft;
    if (!draft) return;

    if (draft.channel === CHANNEL_TYPES.EMAIL || draft.channel === CHANNEL_TYPES.ZALO) {
      setSelectedChannel(draft.channel);
    }

    if (Array.isArray(draft.recipients)) {
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
      setTemplateContent({
        subject: draft.subject || '',
        body: draft.body || '',
      });
    }

    if (draft.accountId) {
      if (draft.channel === CHANNEL_TYPES.ZALO) {
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
    const raw = templateContent.body || selectedTemplate?.bodyHtml || '';
    const isLikelyHtml = /<\s*(p|div|h[1-6]|br|hr|strong|em|ul|ol|li|table|span|a)\b/i.test(raw);
    const html = isLikelyHtml ? raw : miniMarkdownToHtml(raw);
    return {
      html,
      text: htmlToPlainText(html),
    };
  }, [templateContent.body, selectedTemplate]);

  // Resolve the Zalo body as plain text only. Zalo OA does not render HTML.
  const resolveZaloBody = useCallback(() => {
    return templateContent.body || selectedTemplate?.bodyText || '';
  }, [templateContent.body, selectedTemplate]);

  // Get final recipients from manual input only
  const finalRecipients = useCallback(() => {
    const manualList = (selectedChannel === CHANNEL_TYPES.EMAIL ? manualEmails : manualPhones)
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => s && (selectedChannel === CHANNEL_TYPES.EMAIL ? s.includes('@') : /^\d+$/.test(s)));

    return manualList.map((contact) => ({ email: contact, phone: contact, name: contact }));
  }, [selectedChannel, manualEmails, manualPhones]);

  // Check if has manual recipients
  const hasManualRecipients = () => {
    const input = selectedChannel === CHANNEL_TYPES.EMAIL ? manualEmails : manualPhones;
    return input.trim().length > 0;
  };

  // Select template
  const handleSelectTemplate = async (template) => {
    if (!template?.id) return;
    const templateId = template.id;
    activeTemplateSelectionIdRef.current = templateId;
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

    setIsTesting(true);
    try {
      const accountId = selectedChannel === CHANNEL_TYPES.EMAIL
        ? selectedEmailAccount?.id
        : selectedZaloAccount?.id;

      const attachments = [
        ...(Array.isArray(selectedTemplate?.attachments) ? selectedTemplate.attachments : []),
        ...(Array.isArray(extraAttachments) ? extraAttachments : []),
      ];
      if (selectedChannel === CHANNEL_TYPES.EMAIL) {
        const { html, text } = resolveEmailBody();
        const res = await campaignApiService.testSendQuickCampaign({
          channel: selectedChannel,
          recipient: cleanRecipient,
          subject: templateContent.subject || selectedTemplate?.subject || 'Thử nghiệm gửi nhanh UKNOW',
          message: text,
          htmlContent: html,
          accountId,
          attachments,
        });
        toast.success(res?.data?.message || t('quickSend.testSendSuccess'));
      } else {
        const res = await campaignApiService.testSendQuickCampaign({
          channel: selectedChannel,
          recipient: cleanRecipient,
          subject: templateContent.subject || selectedTemplate?.subject || 'Thử nghiệm gửi nhanh UKNOW',
          message: resolveZaloBody(),
          accountId,
          attachments,
        });
        toast.success(res?.data?.message || t('quickSend.testSendSuccess'));
      }
    } catch (err) {
      const msg = err.response?.data?.message || t('quickSend.testSendFailed');
      toast.error(msg);
    } finally {
      setIsTesting(false);
    }
  };

  // Run the per-recipient send loop. Returns aggregate stats; works for both
  // initial send and the post-failure retry (which calls it with the smaller
  // `recipients` list of previously-failed recipients).
  const runSendLoop = useCallback(async (recipients) => {
    const isEmail = selectedChannel === CHANNEL_TYPES.EMAIL;
    const attachments = [
      ...(Array.isArray(selectedTemplate?.attachments) ? selectedTemplate.attachments : []),
      ...(Array.isArray(extraAttachments) ? extraAttachments : []),
    ];
    let successCount = 0;
    let failCount = 0;
    const failureSamples = new Map();
    let quotaExceededEarly = false;
    const failed = [];

    if (isEmail) {
      const { html, text } = resolveEmailBody();
      const subject = templateContent.subject || selectedTemplate?.subject || 'Không có tiêu đề';
      for (const recipient of recipients) {
        try {
          await emailSettingsApiService.sendEmail({
            fromEmailId: parseInt(selectedEmailAccount.id, 10),
            to: recipient.email,
            subject,
            content: text,
            htmlContent: html,
            attachments,
          });
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
    } else {
      const message = resolveZaloBody();
      for (const recipient of recipients) {
        try {
          await zaloSettingsApiService.sendMessage({
            accountId: selectedZaloAccount.id,
            phone: recipient.phone,
            message,
            attachments,
          });
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
    return { isEmail, successCount, failCount, failureSamples, failed };
  }, [
    selectedChannel,
    selectedEmailAccount,
    selectedZaloAccount,
    resolveEmailBody,
    resolveZaloBody,
    templateContent.subject,
    selectedTemplate,
    extraAttachments,
  ]);

  // Send quick campaign - gửi trực tiếp không cần tạo campaign
  const handleSend = async () => {
    const recipients = finalRecipients();
    if (recipients.length === 0) {
      toast.error(t('quickSend.noRecipients'));
      return;
    }
    // Validate body — accept a chosen template even if its body fields are both
    // blank (rare but possible for a freshly imported template). We treat a
    // template selection as proof that the user *intended* to send it; let
    // the backend reject empty bodies with its own clearer error otherwise.
    const resolvedBody = resolveEmailBody();
    const resolvedZaloBody = resolveZaloBody();
    const hasEmailBody = selectedChannel !== CHANNEL_TYPES.EMAIL
      || Boolean((resolvedBody.html || resolvedBody.text || '').trim())
      || Boolean(selectedTemplate);
    const hasZaloBody = selectedChannel !== CHANNEL_TYPES.ZALO
      || Boolean(resolvedZaloBody.trim())
      || Boolean(selectedTemplate);
    if (!hasEmailBody || !hasZaloBody) {
      toast.error(t('quickSend.noTemplate'));
      return;
    }
    if (!selectedTemplate && !templateContent.body) {
      toast.error(t('quickSend.noTemplate'));
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
    if (selectedChannel === CHANNEL_TYPES.ZALO && !selectedZaloAccount) {
      toast.error(t('quickSend.noZaloAccountSelected'));
      setCurrentStep(QUICK_SEND_STEPS.RECIPIENTS);
      setIsSending(false);
      return;
    }

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
      setIsSending(false);
    }
  };

  // Retry the send only to the previously-failed recipients (best-effort —
  // we don't re-pick a different sender account, etc.). Only available when
  // the failure wasn't caused by quota exhaustion, since that would never
  // succeed on the same sender anyway.
  const handleRetryFailed = async () => {
    if (failedRecipients.length === 0) return;
    if ((sendResult?.failureTypes || []).includes('quota_exceeded')) {
      toast.error(t('quickSend.retryQuotaBlocked') || 'Đã vượt hạn mức — không thể gửi lại.');
      return;
    }
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
      setIsRetrying(false);
    }
  };

  // Reset and start over
  const handleStartOver = () => {
    setCurrentStep(QUICK_SEND_STEPS.RECIPIENTS);
    setSelectedTemplate(null);
    setTemplateContent({ subject: '', body: '' });
    setManualEmails('');
    setManualPhones('');
    setSendResult(null);
    setFailedRecipients([]);
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
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setSelectedChannel(CHANNEL_TYPES.EMAIL)}
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
                  onClick={() => setSelectedChannel(CHANNEL_TYPES.ZALO)}
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

        {/* Template Selection */}
        {currentStep === QUICK_SEND_STEPS.TEMPLATE && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('quickSend.selectTemplate')}</h2>

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
                disabled={!selectedTemplate}
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
              {(selectedTemplate || templateContent.subject || templateContent.body || (extraAttachments && extraAttachments.length > 0)) && (
                <div className="p-4 bg-gray-50 rounded-lg mb-4">
                  <p className="text-sm font-medium text-gray-700">
                    {selectedTemplate ? t('quickSend.template') : (selectedChannel === CHANNEL_TYPES.EMAIL ? 'Nội dung email' : 'Nội dung tin nhắn')}
                  </p>
                  {selectedTemplate ? (
                    <p className="text-gray-900 font-medium mt-1">{selectedTemplate.templateName || selectedTemplate.name || selectedTemplate.title}</p>
                  ) : (
                    templateContent.subject && (
                      <p className="text-gray-900 font-medium mt-1">{templateContent.subject}</p>
                    )
                  )}
                  {((selectedTemplate?.attachments && selectedTemplate.attachments.length > 0) || (extraAttachments && extraAttachments.length > 0)) && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                        <HiOutlinePaperClip className="w-3.5 h-3.5 text-gray-500" />
                        {t('quickSend.attachments')} ({(selectedTemplate?.attachments?.length || 0) + (extraAttachments?.length || 0)})
                      </p>
                      <div className="space-y-1.5">
                        {[...(selectedTemplate?.attachments || []), ...(extraAttachments || [])].map((att, idx) => (
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

            {/* Test Send Box */}
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
