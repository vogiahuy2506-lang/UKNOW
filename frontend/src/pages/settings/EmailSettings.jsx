import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import emailSettingsApiService from '../../features/settings/services/emailSettingsApi.service';
import {
  HiOutlineMail,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineCheckCircle,
  HiOutlineReply,
  HiOutlineRefresh,
  HiOutlineSparkles,
  HiOutlineGlobe,
  HiOutlineLockClosed,
  HiOutlineQuestionMarkCircle,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlinePaperAirplane,
  HiOutlineTerminal,
  HiOutlineUser,
  HiOutlineDesktopComputer,
  HiOutlineInformationCircle,
  HiOutlineShieldCheck,
} from 'react-icons/hi';

const PLATFORM_DOMAIN = import.meta.env.VITE_DEFAULT_FROM_DOMAIN || 'digiso.vn';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMAIL_MODES = {
  platform: {
    labelKey: 'emailSettings.modePlatform',
    descKey: 'emailSettings.modePlatformDesc',
    Icon: HiOutlineGlobe,
    badgeCls: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    cardCls: 'border-emerald-500 bg-emerald-50/60',
    recommended: true,
    tabColor: 'emerald',
  },
  smtp: {
    labelKey: 'emailSettings.modeSmtp',
    descKey: 'emailSettings.modeSmtpDesc',
    Icon: HiOutlineLockClosed,
    badgeCls: 'border-amber-200 bg-amber-50 text-amber-700',
    cardCls: 'border-amber-500 bg-amber-50/60',
    recommended: false,
    tabColor: 'amber',
  },
};

const TABS = [
  { key: 'platform', labelKey: 'emailSettings.tabPlatformDefault', Icon: HiOutlineGlobe },
  { key: 'smtp', labelKey: 'emailSettings.tabSmtpRieng', Icon: HiOutlineLockClosed },
];

// ── SectionCard ───────────────────────────────────────────────────────────────
const SectionCard = ({ icon: Icon, title, subtitle, children, accent = 'orange' }) => {
  const [isOpen, setIsOpen] = useState(true);
  const colors = {
    orange: 'bg-orange-50 text-orange-500',
    blue: 'bg-blue-50 text-blue-500',
    green: 'bg-green-50 text-green-600',
    purple: 'bg-purple-50 text-purple-500',
    slate: 'bg-slate-100 text-slate-500',
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div
        className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 cursor-pointer hover:bg-slate-50 transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colors[accent]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-700">{title}</p>
          {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
        </div>
        <button
          type="button"
          className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 transition"
        >
          {isOpen ? (
            <HiOutlineChevronDown className="w-4 h-4" />
          ) : (
            <HiOutlineChevronRight className="w-4 h-4" />
          )}
        </button>
      </div>
      {isOpen && <div className="p-5">{children}</div>}
    </div>
  );
};

// ── SMTP Guide Accordion ─────────────────────────────────────────────────────
const SmtpGuideAccordion = ({ t }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeProvider, setActiveProvider] = useState('gmail');

  const providers = [
    { key: 'gmail', labelKey: 'emailSettings.smtpGuideGmail', Icon: HiOutlineDesktopComputer },
    { key: 'outlook', labelKey: 'emailSettings.smtpGuideOutlook', Icon: HiOutlineDesktopComputer },
    { key: 'other', labelKey: 'emailSettings.smtpGuideOther', Icon: HiOutlineTerminal },
  ];

  const providerSteps = {
    gmail: [
      'emailSettings.smtpGuideGmailStep1',
      'emailSettings.smtpGuideGmailStep2',
      'emailSettings.smtpGuideGmailStep3',
    ],
    outlook: [
      'emailSettings.smtpGuideOutlookStep1',
      'emailSettings.smtpGuideOutlookStep2',
      'emailSettings.smtpGuideOutlookStep3',
    ],
    other: [
      'emailSettings.smtpGuideOtherStep1',
      'emailSettings.smtpGuideOtherStep2',
      'emailSettings.smtpGuideOtherStep3',
    ],
  };

  const providerNotes = {
    gmail: 'emailSettings.smtpGuideGmailNote',
    outlook: 'emailSettings.smtpGuideOutlookNote',
    other: 'emailSettings.smtpGuideOtherNote',
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-100 transition"
        onClick={() => setIsOpen(!isOpen)}
      >
        <HiOutlineQuestionMarkCircle className="w-5 h-5 text-orange-500" />
        <span className="flex-1 text-left text-sm font-medium text-slate-700">
          {t('emailSettings.smtpGuideAccordionTitle')}
        </span>
        {isOpen ? (
          <HiOutlineChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <HiOutlineChevronRight className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {isOpen && (
        <div className="px-4 pb-4 space-y-4">
          {/* Quick Reference */}
          <div className="flex flex-wrap gap-3 p-3 bg-blue-50 rounded-lg border border-blue-100">
            <div className="flex items-start gap-2 text-xs text-blue-700">
              <HiOutlineGlobe className="w-4 h-4 mt-0.5 shrink-0" />
              <span><strong>{t('emailSettings.smtpGuideQuickRef')}:</strong> {t('emailSettings.smtpGuidePortList')}</span>
            </div>
          </div>

          {/* Provider Tabs */}
          <div className="flex gap-2">
            {providers.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setActiveProvider(p.key)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                  activeProvider === p.key
                    ? 'bg-orange-100 text-orange-700 border border-orange-200'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                {t(p.labelKey)}
              </button>
            ))}
          </div>

          {/* Steps */}
          <ol className="space-y-3 text-xs text-slate-600">
            {providerSteps[activeProvider].map((stepKey, idx) => (
              <li key={idx} className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-orange-100 text-center text-[10px] font-bold text-orange-600">
                  {idx + 1}
                </span>
                <span className="flex-1 leading-relaxed">{t(stepKey)}</span>
              </li>
            ))}
          </ol>

          {/* Note */}
          {providerNotes[activeProvider] && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-100 text-xs text-amber-700">
              <HiOutlineInformationCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <span>{t(providerNotes[activeProvider])}</span>
            </div>
          )}

          {/* Security Warning */}
          <div className="flex items-start gap-2 p-3 bg-red-50 rounded-lg border border-red-100 text-xs text-red-700">
            <HiOutlineShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
            <span>{t('emailSettings.smtpGuideSecurityNote')}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ── Test Email Modal ──────────────────────────────────────────────────────────
const TestEmailModal = ({ isOpen, onClose, onSend, isSending, t }) => {
  const [email, setEmail] = useState('');
  const [subject, setSubject] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setEmail('');
      setSubject(t('emailSettings.testEmailSubjectDefault'));
      setContent(t('emailSettings.testEmailContentDefault'));
      setError('');
    }
  }, [isOpen, t]);

  const handleSubmit = () => {
    if (!email.trim()) {
      setError(t('emailSettings.enterTestEmail'));
      return;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setError(t('emailSettings.invalidTestEmail'));
      return;
    }
    setError('');
    onSend({ to: email.trim(), subject, content });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center">
            <HiOutlinePaperAirplane className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-800">{t('emailSettings.sendTestEmail')}</h3>
            <p className="text-xs text-slate-500">{t('emailSettings.testEmailPlaceholder')}</p>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('emailSettings.replyTo')}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t('emailSettings.testEmailPlaceholder')}
              className={`w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition ${
                error ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
              }`}
            />
            {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('emailSettings.testEmailSubject')}
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              {t('emailSettings.testEmailContent')}
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition resize-none"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-slate-100 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            disabled={isSending}
            className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
          >
            {t('common.cancel')}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSending}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 text-sm font-semibold text-white hover:bg-orange-700 transition disabled:opacity-50"
          >
            {isSending ? (
              <>
                <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                {t('emailSettings.sendingTestEmail')}
              </>
            ) : (
              <>
                <HiOutlinePaperAirplane className="h-4 w-4" />
                {t('emailSettings.sendTestEmail')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

function normalizeItem(raw) {
  const item = raw?.data?.data || raw?.data || raw || {};
  return {
    id: item.id,
    name: item.name || '',
    email: item.email || '',
    replyTo: item.replyTo || item.reply_to || '',
    platformPrefix: item.platformPrefix || item.platform_prefix || 'no-reply',
    dailySentCount: item.dailySentCount ?? item.daily_sent_count ?? 0,
    totalSentCount: item.totalSentCount ?? item.total_sent_count ?? 0,
    isVerified: item.isVerified ?? item.is_verified ?? false,
    status: item.status || 'active',
    creatorName: item.creatorName || item.creator_name || null,
    createdBy: item.creator_name ? { name: item.creator_name } : null,
    createdAt: item.createdAt || item.created_at || null,
    updatedAt: item.updatedAt || item.updated_at || null,
    emailMode: item.emailMode || item.email_mode || 'platform',
    smtpHost: item.smtpHost || item.smtp_host || '',
    smtpPort: item.smtpPort || item.smtp_port || '',
    smtpUsername: item.smtpUsername || item.smtp_username || '',
    smtpPassword: item.smtpPassword || item.smtp_password || '',
  };
}

const EmailSettings = () => {
  const { t } = useI18n();
  const initializedRef = useRef(false);

  const [emailSettings, setEmailSettings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedEmailId, setSelectedEmailId] = useState(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [activeTab, setActiveTab] = useState('platform');

  // Modal state
  const [showTestEmailModal, setShowTestEmailModal] = useState(false);
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  const emptyForm = {
    name: '',
    replyTo: '',
    emailMode: 'platform',
    platformPrefix: '',
    smtpHost: '',
    smtpPort: '',
    smtpUsername: '',
    smtpPassword: '',
  };

  const [formData, setFormData] = useState(emptyForm);
  const [formErrors, setFormErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const isSmtpMode = formData.emailMode === 'smtp';

  const isValidForm = useMemo(() => {
    const nameOk = String(formData.name || '').trim().length > 0;
    const replyOk = EMAIL_REGEX.test(String(formData.replyTo || '').trim());

    if (isSmtpMode) {
      const hostOk = String(formData.smtpHost || '').trim().length > 0;
      const portOk = String(formData.smtpPort || '').trim().length > 0;
      const usernameOk = String(formData.smtpUsername || '').trim().length > 0;
      const passwordOk = String(formData.smtpPassword || '').trim().length > 0;
      return nameOk && replyOk && hostOk && portOk && usernameOk && passwordOk;
    }
    return nameOk && replyOk;
  }, [formData, isSmtpMode]);

  const fetchEmailSettings = useCallback(async () => {
    try {
      const response = await emailSettingsApiService.listEmailSettings();
      const items = Array.isArray(response?.data?.data?.items) ? response.data.data.items : [];
      setEmailSettings(items.map((raw) => normalizeItem(raw)));
    } catch (error) {
      setEmailSettings([]);
      toast.error(t('emailSettings.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  const refresh = async () => {
    setIsRefreshing(true);
    await fetchEmailSettings();
    setIsRefreshing(false);
  };

  useEffect(() => {
    if (!initializedRef.current) {
      initializedRef.current = true;
      fetchEmailSettings();
    }
  }, [fetchEmailSettings]);

  useEffect(() => {
    if (!selectedEmailId) {
      setIsAddingNew(false);
    }
  }, [selectedEmailId]);

  const resetForm = () => {
    setFormData(emptyForm);
    setFormErrors({});
  };

  const openNew = () => {
    setIsAddingNew(true);
    setSelectedEmailId(null);
    resetForm();
  };

  const handleSelectEmail = async (item) => {
    try {
      const response = await emailSettingsApiService.getEmailSetting(item.id);
      const normalized = normalizeItem(response);
      setEmailSettings((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, ...normalized } : entry)));
      setSelectedEmailId(normalized.id);
      setIsAddingNew(false);
      setFormData({
        name: normalized.name || '',
        replyTo: normalized.replyTo || normalized.reply_to || '',
        emailMode: normalized.emailMode || 'platform',
        platformPrefix: normalized.platformPrefix || '',
        smtpHost: normalized.smtpHost || '',
        smtpPort: normalized.smtpPort || '',
        smtpUsername: normalized.smtpUsername || '',
        smtpPassword: normalized.smtpPassword || '',
      });
      setActiveTab(normalized.emailMode || 'platform');
      setFormErrors({});
    } catch (error) {
      toast.error(t('emailSettings.loadDetailFailed'));
    }
  };

  const handleModeChange = (mode) => {
    setFormData((prev) => ({
      ...prev,
      emailMode: mode,
      ...(mode === 'smtp' ? { smtpHost: prev.smtpHost || '', smtpPort: prev.smtpPort || '', smtpUsername: prev.smtpUsername || '', smtpPassword: prev.smtpPassword || '' } : { smtpHost: '', smtpPort: '', smtpUsername: '', smtpPassword: '' }),
    }));
    setActiveTab(mode);
    setFormErrors({});
  };

  const validateForm = () => {
    const errors = {};
    const name = String(formData.name || '').trim();
    const replyTo = String(formData.replyTo || '').trim();

    if (!name) errors.name = t('emailSettings.nameRequired');
    if (!replyTo) errors.replyTo = t('emailSettings.replyToRequired');
    else if (!EMAIL_REGEX.test(replyTo)) errors.replyTo = t('emailSettings.invalidReplyTo');

    if (!isSmtpMode) {
      const prefix = String(formData.platformPrefix || '').trim();
      if (!prefix) {
        errors.platformPrefix = t('emailSettings.platformPrefixRequired') || 'Email prefix là bắt buộc';
      } else if (!/^[a-zA-Z0-9._-]+$/.test(prefix)) {
        errors.platformPrefix = t('emailSettings.platformPrefixInvalid') || 'Chỉ dùng chữ, số, dấu chấm, gạch dưới, gạch ngang';
      } else if (prefix.length > 50) {
        errors.platformPrefix = t('emailSettings.platformPrefixTooLong') || 'Tối đa 50 ký tự';
      }
    }

    if (isSmtpMode) {
      if (!String(formData.smtpHost || '').trim()) errors.smtpHost = t('emailSettings.smtpHostRequired');
      if (!String(formData.smtpPort || '').trim()) errors.smtpPort = t('emailSettings.smtpPortRequired');
      if (!String(formData.smtpUsername || '').trim()) errors.smtpUsername = t('emailSettings.smtpUsernameRequired');
      if (!String(formData.smtpPassword || '').trim()) errors.smtpPassword = t('emailSettings.smtpPasswordRequired');
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!validateForm()) {
      toast.error(t('emailSettings.invalidForm'));
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        ...formData,
      };

      if (selectedEmailId && !isAddingNew) {
        await emailSettingsApiService.updateEmailSetting(selectedEmailId, payload);
        toast.success(t('emailSettings.updateSuccess'));
        setEmailSettings((prev) => prev.map((entry) => (entry.id === selectedEmailId ? { ...entry, ...formData } : entry)));
      } else {
        const response = await emailSettingsApiService.createEmailSetting(payload);
        const created = normalizeItem(response);
        setEmailSettings((prev) => [created, ...prev]);
        setSelectedEmailId(created.id);
        setIsAddingNew(false);
        toast.success(t('emailSettings.addSuccess'));
      }
      resetForm();
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || t('emailSettings.error');
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('emailSettings.confirmDelete'))) return;
    setIsDeletingId(id);
    try {
      await emailSettingsApiService.deleteEmailSetting(id);
      toast.success(t('emailSettings.deleted'));
      setEmailSettings((prev) => prev.filter((entry) => entry.id !== id));
      if (selectedEmailId === id) {
        setSelectedEmailId(null);
        setIsAddingNew(false);
        resetForm();
      }
    } catch (error) {
      toast.error(t('emailSettings.deleteFailed'));
    } finally {
      setIsDeletingId(null);
    }
  };

  const handleTestConnection = async () => {
    if (!isSmtpMode) return;
    if (!formData.smtpHost || !formData.smtpPort || !formData.smtpUsername || !formData.smtpPassword) {
      toast.error(t('emailSettings.invalidForm'));
      return;
    }

    setIsTestingConnection(true);
    try {
      await emailSettingsApiService.testConnection({
        smtpHost: formData.smtpHost.trim(),
        smtpPort: String(formData.smtpPort).trim(),
        smtpUsername: formData.smtpUsername.trim(),
        smtpPassword: formData.smtpPassword,
      });
      toast.success(t('emailSettings.testConnectionSuccess'));
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || t('emailSettings.testConnectionFailed');
      toast.error(message);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleSendTestEmail = async (payload) => {
    if (!selectedEmailId) {
      toast.error(t('emailSettings.editEmailHint'));
      return;
    }
    setIsSendingTest(true);
    try {
      await emailSettingsApiService.sendTestEmail(selectedEmailId, payload);
      toast.success(t('emailSettings.sendTestSuccess'));
      setShowTestEmailModal(false);
    } catch (error) {
      const message = error?.response?.data?.message || error?.message || t('emailSettings.sendTestFailed');
      toast.error(message);
    } finally {
      setIsSendingTest(false);
    }
  };

  const renderList = () => {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-10">
          <span className="h-6 w-6 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
        </div>
      );
    }
    if (!emailSettings.length) {
      return <div className="px-4 pb-6 text-center text-sm text-slate-500">{t('emailSettings.noEmails')}</div>;
    }
    return (
      <div className="max-h-[540px] overflow-y-auto">
        <div className="divide-y divide-slate-100">
          {emailSettings.map((item) => {
            const isActive = selectedEmailId === item.id && !isAddingNew;
            const modeCfg = EMAIL_MODES[item.emailMode] || EMAIL_MODES.platform;
            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => handleSelectEmail(item)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelectEmail(item); } }}
                className={`flex w-full items-start gap-3 px-4 py-3 text-left transition cursor-pointer ${
                  isActive ? 'border-l-4 border-orange-500 bg-orange-50/60' : 'border-l-4 border-transparent hover:bg-slate-50'
                }`}
              >
                <div
                  className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${
                    isActive ? 'border-orange-200 bg-orange-100 text-orange-700' : 'border-slate-200 bg-slate-50 text-slate-500'
                  }`}
                >
                  <modeCfg.Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.name || t('emailSettings.noName')}</p>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${modeCfg.badgeCls}`}>
                      <modeCfg.Icon className="h-3 w-3" />
                      {t(modeCfg.labelKey)}
                    </span>
                  </div>
                  <p className="mt-1 flex items-center gap-1 truncate text-xs text-slate-500">
                    <HiOutlineReply className="h-3 w-3" />
                    {item.replyTo || t('emailSettings.noReplyTo')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    handleDelete(item.id);
                  }}
                  disabled={isDeletingId === item.id}
                  className={`rounded-lg p-2 transition ${
                    isActive ? 'text-slate-500 hover:bg-red-50 hover:text-red-600' : 'text-slate-400 hover:bg-red-50 hover:text-red-600'
                  }`}
                  title={t('emailSettings.delete')}
                >
                  {isDeletingId === item.id ? (
                    <span className="inline-block h-4 w-4 rounded-full border-2 border-red-300 border-t-transparent animate-spin" />
                  ) : (
                    <HiOutlineTrash className="h-4 w-4" />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderFromPreview = () => {
    const modeCfg = EMAIL_MODES[formData.emailMode] || EMAIL_MODES.platform;
    const Icon = modeCfg.Icon;
    const previewEmail =
      formData.emailMode === 'platform'
        ? `${formData.platformPrefix || 'no-reply'}@${PLATFORM_DOMAIN}`
        : String(formData.replyTo || '').trim();
    return (
      <div className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-2 text-slate-700">
          <Icon className="h-4 w-4 text-orange-500" />
          <span>
            {t('emailSettings.previewLabel')}{' '}
            <span className="font-semibold text-slate-900">{previewEmail || '—'}</span>
          </span>
        </span>
        <span className="hidden text-slate-400 md:inline">{t('emailSettings.previewHint')}</span>
      </div>
    );
  };

  const renderForm = () => {
    const title = isAddingNew ? t('emailSettings.addNewEmail') : t('emailSettings.editEmail');
    const hint = isAddingNew ? t('emailSettings.addNewEmailHint') : t('emailSettings.editEmailHint');
    const modeCfg = EMAIL_MODES[formData.emailMode] || EMAIL_MODES.platform;
    const ModeIcon = modeCfg.Icon;

    return (
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${modeCfg.badgeCls}`}>
                <ModeIcon className="mr-1 h-3.5 w-3.5" />
                {t(modeCfg.labelKey)}
              </span>
            </div>
            <p className="mt-1 text-base font-semibold text-slate-900">{title}</p>
            <p className="mt-1 text-xs text-slate-500">{hint}</p>
          </div>
          {selectedEmailId && !isAddingNew ? (
            <button
              type="button"
              onClick={() => handleDelete(selectedEmailId)}
              disabled={isDeletingId === selectedEmailId}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 transition hover:border-red-300 hover:bg-red-100 disabled:opacity-70"
            >
              {isDeletingId === selectedEmailId ? (
                <span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-red-300 border-t-transparent animate-spin" />
              ) : (
                <HiOutlineTrash className="h-4 w-4" />
              )}
              {t('emailSettings.delete')}
            </button>
          ) : null}
        </div>

        {/* Tabs */}
        <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const tabColor = EMAIL_MODES[tab.key]?.tabColor || 'orange';
            const activeClasses = {
              orange: 'bg-orange-100 text-orange-700 shadow-sm',
              emerald: 'bg-emerald-100 text-emerald-700 shadow-sm',
            }[tabColor] || 'bg-white text-slate-700 shadow-sm';
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleModeChange(tab.key)}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition ${isActive ? activeClasses : 'text-slate-500 hover:text-slate-700'}`}
              >
                <tab.Icon className="h-4 w-4" />
                {t(tab.labelKey)}
              </button>
            );
          })}
        </div>

        {/* Section 1: Thong tin nguoi gui */}
        <SectionCard
          icon={HiOutlineUser}
          title={t('emailSettings.senderInfo') || 'Thông tin người gửi'}
          subtitle={t('emailSettings.senderInfoSubtitle') || 'Tên hiển thị và email reply-to'}
          accent="orange"
        >
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">{t('emailSettings.displayName')}</label>
              <input
                type="text"
                value={formData.name}
                onChange={(event) => setFormData((prev) => ({ ...prev, name: event.target.value }))}
                className={`w-full border rounded-lg px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 ${
                  formErrors.name ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                }`}
                placeholder={t('emailSettings.displayNamePlaceholder')}
              />
              {formErrors.name && <p className="text-xs text-red-600">{formErrors.name}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">{t('emailSettings.replyTo')}</label>
              <input
                type="email"
                value={formData.replyTo}
                onChange={(event) => setFormData((prev) => ({ ...prev, replyTo: event.target.value }))}
                className={`w-full border rounded-lg px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 ${
                  formErrors.replyTo ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                }`}
                placeholder={t('emailSettings.replyToPlaceholder')}
              />
              {formErrors.replyTo && <p className="text-xs text-red-600">{formErrors.replyTo}</p>}
            </div>
            {!isSmtpMode && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">
                  {t('emailSettings.platformPrefix') || 'Email prefix'}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={formData.platformPrefix}
                    onChange={(event) => setFormData((prev) => ({ ...prev, platformPrefix: event.target.value.replace(/[^a-zA-Z0-9._-]/g, '') }))}
                    className={`w-full border rounded-lg px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 ${
                      formErrors.platformPrefix ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                    }`}
                    placeholder="no-reply"
                    maxLength={50}
                  />
                  <span className="text-sm text-slate-500 shrink-0">@{PLATFORM_DOMAIN}</span>
                </div>
                {formErrors.platformPrefix ? (
                  <p className="text-xs text-red-600">{formErrors.platformPrefix}</p>
                ) : (
                  <p className="text-xs text-slate-400">{t('emailSettings.platformPrefixHint') || 'Chỉ dùng chữ, số, dấu chấm, gạch dưới, gạch ngang'}</p>
                )}
              </div>
            )}
          </div>
        </SectionCard>

        {/* Section 2: Cau hinh SMTP (chi khi mode SMTP) */}
        {isSmtpMode && (
          <SectionCard
            icon={HiOutlineTerminal}
            title={t('emailSettings.smtpConfig') || 'Cấu hình SMTP'}
            subtitle={t('emailSettings.smtpConfigSubtitle') || 'Thông tin server SMTP riêng'}
            accent="amber"
          >
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">{t('emailSettings.smtpHost')}</label>
                <input
                  type="text"
                  value={formData.smtpHost}
                  onChange={(event) => setFormData((prev) => ({ ...prev, smtpHost: event.target.value }))}
                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 ${
                    formErrors.smtpHost ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                  placeholder="smtp.gmail.com"
                />
                {formErrors.smtpHost && <p className="text-xs text-red-600">{formErrors.smtpHost}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">{t('emailSettings.smtpPort')}</label>
                <input
                  type="text"
                  value={formData.smtpPort}
                  onChange={(event) => setFormData((prev) => ({ ...prev, smtpPort: event.target.value }))}
                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 ${
                    formErrors.smtpPort ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                  placeholder="587"
                />
                {formErrors.smtpPort && <p className="text-xs text-red-600">{formErrors.smtpPort}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">{t('emailSettings.smtpUsername')}</label>
                <input
                  type="text"
                  value={formData.smtpUsername}
                  onChange={(event) => setFormData((prev) => ({ ...prev, smtpUsername: event.target.value }))}
                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 ${
                    formErrors.smtpUsername ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                  placeholder="your@email.com"
                />
                {formErrors.smtpUsername && <p className="text-xs text-red-600">{formErrors.smtpUsername}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">{t('emailSettings.smtpPassword')}</label>
                <input
                  type="password"
                  value={formData.smtpPassword}
                  onChange={(event) => setFormData((prev) => ({ ...prev, smtpPassword: event.target.value }))}
                  className={`w-full border rounded-lg px-3 py-2 text-sm outline-none transition focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 ${
                    formErrors.smtpPassword ? 'border-red-400 bg-red-50/40' : 'border-slate-200'
                  }`}
                  placeholder="••••••••"
                />
                {formErrors.smtpPassword && <p className="text-xs text-red-600">{formErrors.smtpPassword}</p>}
              </div>
            </div>
          </SectionCard>
        )}

        {/* Section 3: Huong dan SMTP (chi khi mode SMTP) */}
        {isSmtpMode && (
          <SmtpGuideAccordion t={t} />
        )}

        {/* Preview */}
        {renderFromPreview()}

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-2">
            {isSmtpMode && (
              <button
                type="button"
                onClick={handleTestConnection}
                disabled={isTestingConnection || !formData.smtpHost || !formData.smtpPort || !formData.smtpUsername || !formData.smtpPassword}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isTestingConnection ? (
                  <>
                    <span className="h-4 w-4 rounded-full border-2 border-slate-300 border-t-slate-600 animate-spin" />
                    {t('emailSettings.testingConnection')}
                  </>
                ) : (
                  <>
                    <HiOutlineCheckCircle className="h-4 w-4" />
                    {t('emailSettings.testConnection')}
                  </>
                )}
              </button>
            )}
            {selectedEmailId && !isAddingNew && (
              <button
                type="button"
                onClick={() => setShowTestEmailModal(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <HiOutlinePaperAirplane className="h-4 w-4" />
                {t('emailSettings.sendTestEmail')}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                setSelectedEmailId(null);
                setIsAddingNew(false);
                resetForm();
              }}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSaving || !isValidForm}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isSaving ? (
                <>
                  <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  {t('common.saving') || 'Đang lưu...'}
                </>
              ) : (
                <>
                  <HiOutlineCheckCircle className="h-4 w-4" />
                  {isAddingNew ? t('emailSettings.addEmail') : t('common.save')}
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{t('emailSettings.title')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('emailSettings.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={refresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-orange-200 hover:text-orange-700 disabled:opacity-70"
          >
            <HiOutlineRefresh className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
            {t('common.refresh')}
          </button>
          <button
            type="button"
            onClick={openNew}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700"
          >
            <HiOutlinePlus className="h-4 w-4" />
            {t('emailSettings.addNewEmail')}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Left: Email List */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
              <HiOutlineMail className="h-4 w-4 text-orange-500" />
              <p className="text-sm font-semibold text-slate-900">{t('emailSettings.listTitle')}</p>
            </div>
            {renderList()}
          </div>
        </div>

        {/* Right: Form */}
        <div className="lg:col-span-2">
          {!selectedEmailId && !isAddingNew ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-6 py-16 text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-orange-100 text-orange-600">
                <HiOutlineSparkles className="h-7 w-7" />
              </div>
              <p className="text-base font-semibold text-slate-900">{t('emailSettings.selectEmailToView')}</p>
              <p className="mt-1 max-w-xs text-sm text-slate-500">{t('emailSettings.selectEmailToEditTip')}</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              {renderForm()}
            </div>
          )}
        </div>
      </div>

      {/* Test Email Modal */}
      <TestEmailModal
        isOpen={showTestEmailModal}
        onClose={() => setShowTestEmailModal(false)}
        onSend={handleSendTestEmail}
        isSending={isSendingTest}
        t={t}
      />
    </div>
  );
};

export default EmailSettings;
