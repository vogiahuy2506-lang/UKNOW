import { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import customerApiService from '../../features/customers/services/customerApi.service';
import emailTemplateApiService from '../../features/templates/services/emailTemplateApi.service';
import zaloTemplateApiService from '../../features/templates/services/zaloTemplateApi.service';
import campaignApiService from '../../features/campaigns/services/campaignApi.service';
import emailSettingsApiService from '../../features/settings/services/emailSettingsApi.service';
import zaloSettingsApiService from '../../features/settings/services/zaloSettingsApi.service';
import {
  HiOutlinePlus,
  HiOutlineMail,
  HiOutlineChat,
  HiOutlineUsers,
  HiOutlineCheckCircle,
  HiOutlineChevronRight,
  HiOutlineSearch,
} from 'react-icons/hi';

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

const QuickSend = () => {
  const { t } = useI18n();
  const [currentStep, setCurrentStep] = useState(QUICK_SEND_STEPS.RECIPIENTS);
  const [selectedChannel, setSelectedChannel] = useState(CHANNEL_TYPES.EMAIL);

  // Recipients state
  const [customers, setCustomers] = useState([]);
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoadingCustomers, setIsLoadingCustomers] = useState(false);
  const [manualEmails, setManualEmails] = useState('');
  const [manualPhones, setManualPhones] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

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
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);

  // Send state
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState(null);

  // Fetch customers
  const fetchCustomers = useCallback(async () => {
    setIsLoadingCustomers(true);
    try {
      const response = await customerApiService.getCustomers({ page: 1, limit: 100 });
      const items = response?.data?.data?.items || [];
      setCustomers(items);
    } catch (error) {
      toast.error(t('quickSend.loadCustomersFailed'));
    } finally {
      setIsLoadingCustomers(false);
    }
  }, [t]);

  // Fetch templates
  const fetchTemplates = useCallback(async () => {
    setIsLoadingTemplates(true);
    try {
      const [emailRes, zaloRes] = await Promise.all([
        emailTemplateApiService.getTemplates({ page: 1, limit: 50 }),
        zaloTemplateApiService.getTemplates({ page: 1, limit: 50 }),
      ]);
      setEmailTemplates(emailRes?.data?.data?.items || []);
      setZaloTemplates(zaloRes?.data?.data?.items || []);
    } catch (error) {
      toast.error(t('quickSend.loadTemplatesFailed'));
    } finally {
      setIsLoadingTemplates(false);
    }
  }, [t]);

  // Fetch sender accounts
  const fetchAccounts = useCallback(async () => {
    setIsLoadingAccounts(true);
    try {
      const [emailRes, zaloRes] = await Promise.all([
        emailSettingsApiService.listEmailSettings(),
        zaloSettingsApiService.listAccounts(),
      ]);
      setEmailAccounts(emailRes?.data?.data?.items || []);
      const zaloItemsRaw = zaloRes?.data?.data?.items || [];
      const zaloItems = zaloItemsRaw.filter((a) => !a.isLocked);
      setZaloAccounts(zaloItems);

      // Auto-select default account if exists
      const emailItems = emailRes?.data?.data?.items || [];
      const defaultEmail = emailItems.find((a) => a.isDefault || a.is_active);
      const defaultZalo = zaloItems.find((a) => a.isDefault || a.is_default);
      if (defaultEmail) setSelectedEmailAccount(defaultEmail);
      if (defaultZalo) setSelectedZaloAccount(defaultZalo);
    } catch (error) {
      console.error('Failed to fetch accounts:', error);
    } finally {
      setIsLoadingAccounts(false);
    }
  }, []);

  useEffect(() => {
    if (currentStep === QUICK_SEND_STEPS.RECIPIENTS) {
      fetchAccounts();
      fetchCustomers();
    } else if (currentStep === QUICK_SEND_STEPS.TEMPLATE) {
      fetchTemplates();
    }
  }, [currentStep, fetchCustomers, fetchTemplates, fetchAccounts]);

  // Filter customers by search
  const filteredCustomers = useMemo(() => {
    if (!searchTerm) return customers;
    const term = searchTerm.toLowerCase();
    return customers.filter(
      (c) =>
        (c.name || '').toLowerCase().includes(term) ||
        (c.email || '').toLowerCase().includes(term) ||
        (c.phone || '').toLowerCase().includes(term)
    );
  }, [customers, searchTerm]);

  // Get final recipients
  const finalRecipients = useMemo(() => {
    const selected = selectedCustomers.map((id) => {
      const customer = customers.find((c) => c.id === id);
      return customer;
    }).filter(Boolean);

    const manualList = (selectedChannel === CHANNEL_TYPES.EMAIL ? manualEmails : manualPhones)
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter((s) => s && (selectedChannel === CHANNEL_TYPES.EMAIL ? s.includes('@') : /^\d+$/.test(s)));

    return [...selected, ...manualList.map((contact) => ({ email: contact, phone: contact, name: contact }))];
  }, [selectedCustomers, customers, manualEmails, manualPhones, selectedChannel]);

  // Toggle customer selection
  const toggleCustomer = (customerId) => {
    setSelectedCustomers((prev) =>
      prev.includes(customerId) ? prev.filter((id) => id !== customerId) : [...prev, customerId]
    );
  };

  // Select all filtered customers
  const selectAllFiltered = () => {
    const filteredIds = filteredCustomers.map((c) => c.id);
    setSelectedCustomers((prev) => [...new Set([...prev, ...filteredIds])]);
  };

  // Deselect all
  const deselectAll = () => {
    setSelectedCustomers([]);
  };

  // Select template
  const handleSelectTemplate = (template) => {
    setSelectedTemplate(template);
    if (selectedChannel === CHANNEL_TYPES.EMAIL) {
      setTemplateContent({
        subject: template.subject || '',
        body: template.html_content || template.content || '',
      });
    } else {
      setTemplateContent({
        body: template.content || template.message || '',
      });
    }
  };

  // Send quick campaign
  const handleSend = async () => {
    if (finalRecipients.length === 0) {
      toast.error(t('quickSend.noRecipients'));
      return;
    }
    if (!selectedTemplate && !templateContent.body) {
      toast.error(t('quickSend.noTemplate'));
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
      // Create a temporary campaign for sending
      const campaignPayload = {
        name: `${t('quickSend.campaignPrefix') || 'Quick Send'} - ${new Date().toLocaleString('vi-VN')}`,
        type: selectedChannel,
        status: 'draft',
        flow_data: {
          nodes: [
            {
              id: 'send-node',
              type: selectedChannel === CHANNEL_TYPES.EMAIL ? 'sendEmail' : 'sendZalo',
              data: {
                templateId: selectedTemplate?.id,
                subject: templateContent.subject,
                content: templateContent.body,
                emailAccountId: selectedEmailAccount?.id,
                zaloAccountId: selectedZaloAccount?.id,
              },
            },
          ],
          edges: [],
        },
      };

      // Create campaign
      const campaignRes = await campaignApiService.createCampaign(campaignPayload);
      const campaignId = campaignRes?.data?.data?.id;

      if (!campaignId) {
        throw new Error('Failed to create campaign');
      }

      // Add recipients and run
      const recipientPayload = selectedChannel === CHANNEL_TYPES.EMAIL
        ? { emails: finalRecipients.map((r) => r.email || r.phone).filter(Boolean) }
        : { phone_numbers: finalRecipients.map((r) => r.phone || r.email).filter(Boolean) };

      // Run campaign immediately
      const runRes = await campaignApiService.runCampaign(campaignId, recipientPayload);

      setSendResult({
        success: true,
        campaignId,
        recipientsCount: finalRecipients.length,
        runId: runRes?.data?.data?.runId,
      });
      setCurrentStep(QUICK_SEND_STEPS.DONE);
      toast.success(t('quickSend.sendSuccess'));
    } catch (error) {
      toast.error(error?.message || t('quickSend.sendFailed'));
      setCurrentStep(QUICK_SEND_STEPS.PREVIEW);
    } finally {
      setIsSending(false);
    }
  };

  // Reset and start over
  const handleStartOver = () => {
    setCurrentStep(QUICK_SEND_STEPS.RECIPIENTS);
    setSelectedCustomers([]);
    setSelectedTemplate(null);
    setTemplateContent({ subject: '', body: '' });
    setManualEmails('');
    setManualPhones('');
    setSendResult(null);
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

            {/* Recipients from Customers */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">{t('quickSend.selectRecipients')}</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={selectAllFiltered}
                    className="text-sm text-orange-600 hover:text-orange-700"
                  >
                    {t('quickSend.selectAll')}
                  </button>
                  <span className="text-gray-300">|</span>
                  <button
                    onClick={deselectAll}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    {t('quickSend.deselectAll')}
                  </button>
                </div>
              </div>

              {/* Search */}
              <div className="relative mb-4">
                <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t('quickSend.searchPlaceholder')}
                  className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              {/* Customer List */}
              {isLoadingCustomers ? (
                <div className="flex items-center justify-center py-10">
                  <div className="h-8 w-8 rounded-full border-2 border-orange-500 border-t-transparent animate-spin" />
                </div>
              ) : (
                <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg">
                  {filteredCustomers.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">{t('quickSend.noCustomers')}</div>
                  ) : (
                    filteredCustomers.map((customer) => (
                      <label
                        key={customer.id}
                        className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={selectedCustomers.includes(customer.id)}
                          onChange={() => toggleCustomer(customer.id)}
                          className="w-4 h-4 text-orange-500 rounded border-gray-300 focus:ring-orange-500"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{customer.name || 'No name'}</p>
                          <p className="text-xs text-gray-500 truncate">
                            {selectedChannel === CHANNEL_TYPES.EMAIL ? customer.email : customer.phone}
                          </p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
              )}

              <p className="text-sm text-gray-500 mt-2">
                {t('quickSend.selectedCount', { count: selectedCustomers.length })}
              </p>
            </div>

            {/* Manual Input Toggle */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <button
                onClick={() => setShowManualInput(!showManualInput)}
                className="flex items-center gap-2 text-orange-600 hover:text-orange-700 font-medium"
              >
                <HiOutlinePlus className="w-5 h-5" />
                {showManualInput ? t('quickSend.hideManualInput') : t('quickSend.addManualInput')}
              </button>

              {showManualInput && (
                <div className="mt-4">
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
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {t('quickSend.manualInputHint')}
                  </p>
                </div>
              )}
            </div>

            {/* Next Button */}
            <div className="flex justify-end">
              <button
                onClick={() => setCurrentStep(QUICK_SEND_STEPS.TEMPLATE)}
                disabled={selectedCustomers.length === 0 && !manualEmails && !manualPhones}
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
                        {template.name || template.title || 'Untitled'}
                      </p>
                      {template.subject && (
                        <p className="text-sm text-gray-500 truncate mt-1">{template.subject}</p>
                      )}
                      <p className="text-xs text-gray-400 truncate mt-1">
                        {template.content || template.message || ''}
                      </p>
                    </button>
                  ))}
                </div>
              )}

              {selectedTemplate && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm font-medium text-gray-700 mb-2">{t('quickSend.selectedTemplate')}</p>
                  <p className="text-gray-900">{selectedTemplate.name || selectedTemplate.title}</p>
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
              <div className="grid grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">{t('quickSend.channel')}</p>
                  <p className="text-lg font-semibold text-gray-900 capitalize">{selectedChannel}</p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">{t('quickSend.senderAccount') || 'Tài khoản gửi'}</p>
                  <p className="text-lg font-semibold text-gray-900 truncate">
                    {selectedChannel === CHANNEL_TYPES.EMAIL
                      ? (selectedEmailAccount?.name || selectedEmailAccount?.email || '-')
                      : (selectedZaloAccount?.name || selectedZaloAccount?.display_name || '-')}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-500">{t('quickSend.recipients')}</p>
                  <p className="text-lg font-semibold text-gray-900">{finalRecipients.length}</p>
                </div>
              </div>

              {/* Template Preview */}
              {selectedTemplate && (
                <div className="p-4 bg-gray-50 rounded-lg mb-4">
                  <p className="text-sm font-medium text-gray-700">{t('quickSend.template')}</p>
                  <p className="text-gray-900 mt-1">{selectedTemplate.name || selectedTemplate.title}</p>
                </div>
              )}

              {/* Recipients Preview */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-sm font-medium text-gray-700 mb-2">{t('quickSend.recipientsList')}</p>
                <div className="max-h-40 overflow-y-auto">
                  {finalRecipients.slice(0, 20).map((r, i) => (
                    <p key={i} className="text-sm text-gray-600">
                      {r.name || r.email || r.phone}
                    </p>
                  ))}
                  {finalRecipients.length > 20 && (
                    <p className="text-sm text-gray-500 mt-2">
                      ...{t('quickSend.andMore', { count: finalRecipients.length - 20 })}
                    </p>
                  )}
                </div>
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
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <HiOutlineCheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('quickSend.sendSuccessTitle')}</h2>
            <p className="text-gray-500 mb-6">
              {t('quickSend.sendSuccessDesc', { count: sendResult.recipientsCount })}
            </p>
            <div className="flex justify-center gap-4">
              <button
                onClick={handleStartOver}
                className="px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition"
              >
                {t('quickSend.sendAnother')}
              </button>
              <button
                onClick={() => window.location.href = '/app/campaigns'}
                className="px-6 py-3 bg-orange-500 text-white font-semibold rounded-lg hover:bg-orange-600 transition"
              >
                {t('quickSend.viewCampaigns')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuickSend;
