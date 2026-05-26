import { useState, useEffect } from 'react';
import {
  HiOutlineChip, HiOutlineRefresh,
  HiOutlineX, HiOutlineCheckCircle, HiOutlineXCircle,
  HiOutlineExternalLink, HiOutlineLink, HiOutlineCode, HiOutlineChevronDown, HiOutlineChevronRight,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../services/chatbotApi';
import { useI18n } from '../../i18n';

// ── Channel Definitions ────────────────────────────────────────

function getChannels(t) {
  return [
    {
      id: 'zalo_oa',
      name: t('chatbot.channels.zaloOa'),
      description: t('chatbot.zaloOaDescription'),
      icon: '💬',
      color: 'blue',
      fields: [
        { key: 'zalo_app_id', label: t('chatbot.appId'), type: 'text', placeholder: t('channelConnections.zaloAppIdPlaceholder'), required: true },
        { key: 'zalo_app_secret', label: t('chatbot.appSecret'), type: 'password', placeholder: t('channelConnections.zaloAppSecretPlaceholder'), required: true },
        { key: 'display_name', label: t('channelConnections.displayNameOptional'), placeholder: t('channelConnections.displayNamePlaceholder'), required: false },
      ],
      guide: {
        title: t('channelConnections.zaloGuideTitle'),
        steps: [
          {
            title: t('channelConnections.zaloStep1Title'),
            description: t('channelConnections.zaloStep1Desc'),
            link: { text: t('channelConnections.zaloStep1Link'), url: 'https://developer.zalo.me' },
            openInNew: true,
          },
          {
            title: t('channelConnections.zaloStep2Title'),
            description: t('channelConnections.zaloStep2Desc'),
            urlField: 'webhook_url',
            showCopyBtn: true,
          },
          {
            title: t('channelConnections.zaloStep3Title'),
            description: t('channelConnections.zaloStep3Desc'),
            tip: t('channelConnections.zaloStep3Tip'),
          },
          {
            title: t('channelConnections.zaloStep4Title'),
            description: t('channelConnections.zaloStep4Desc'),
          },
        ],
      },
    },
    {
      id: 'facebook',
      name: t('channelConnections.facebookName'),
      description: t('channelConnections.facebookDesc'),
      icon: '📘',
      color: 'indigo',
      fields: [
        { key: 'page_access_token', label: t('chatbot.pageAccessToken'), type: 'password', placeholder: t('channelConnections.pageAccessTokenPlaceholder'), required: true },
        { key: 'page_id', label: t('chatbot.pageId'), type: 'text', placeholder: t('channelConnections.pageIdPlaceholder'), required: true },
        { key: 'display_name', label: t('channelConnections.displayNameOptional'), placeholder: t('channelConnections.shopPlaceholder'), required: false },
      ],
      guide: {
        title: t('channelConnections.facebookGuideTitle'),
        steps: [
          {
            title: t('channelConnections.facebookStep1Title'),
            description: t('channelConnections.facebookStep1Desc'),
            link: { text: t('channelConnections.facebookStep1Link'), url: 'https://developers.facebook.com' },
            openInNew: true,
          },
          {
            title: t('channelConnections.facebookStep2Title'),
            description: t('channelConnections.facebookStep2Desc'),
            urlField: 'webhook_url',
            verifyToken: 'founderai',
          },
          {
            title: t('channelConnections.facebookStep3Title'),
            description: t('channelConnections.facebookStep3Desc'),
          },
          {
            title: t('channelConnections.facebookStep4Title'),
            description: t('channelConnections.facebookStep4Desc'),
          },
        ],
      },
    },
  ];
}

// ── Guide Component ────────────────────────────────────────────

function GuideSection({ channel, connectedChannel, t }) {
  const [expanded, setExpanded] = useState(false);

  if (!channel.guide) return null;

  // Production API URL for webhooks
  const PRODUCTION_WEBHOOK_URL = 'https://api.founderai.biz';

  const webhookUrl = connectedChannel?.webhook_url || `${PRODUCTION_WEBHOOK_URL}/api/webhooks/${channel.id === 'zalo_oa' ? 'zalo-oa' : 'facebook'}`;

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-slate-50 hover:bg-slate-100 transition-colors text-left"
      >
        <div className="flex items-center gap-2">
          <HiOutlineCode className="w-4 h-4 text-cyan-500" />
          <span className="text-sm font-semibold text-slate-700">{channel.guide.title}</span>
        </div>
        {expanded ? (
          <HiOutlineChevronDown className="w-4 h-4 text-slate-400" />
        ) : (
          <HiOutlineChevronRight className="w-4 h-4 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="p-4 space-y-4 bg-white">
          {channel.guide.steps.map((step, index) => (
            <div key={index} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div className="w-6 h-6 rounded-full bg-cyan-500 text-white text-xs font-bold flex items-center justify-center shrink-0">
                  {index + 1}
                </div>
                {index < channel.guide.steps.length - 1 && (
                  <div className="w-0.5 flex-1 bg-slate-200 my-1" />
                )}
              </div>
              <div className="pb-4 flex-1">
                <h4 className="text-sm font-semibold text-slate-700">{step.title}</h4>
                <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>

                {step.link && (
                  <a href={step.link.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-cyan-500 hover:underline mt-1">
                    <HiOutlineExternalLink className="w-3 h-3" />
                    {step.link.text}
                  </a>
                )}

                {step.urlField && (
                  <div className="mt-2">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase">{t('channelConnections.webhookUrl')}:</label>
                    <div className="flex items-center gap-1 mt-1">
                      <code className="flex-1 text-[11px] bg-slate-100 border border-slate-200 rounded px-2 py-1 font-mono text-slate-600 truncate">
                        {webhookUrl}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(webhookUrl)}
                        className="px-2 py-1 text-[10px] bg-slate-200 hover:bg-slate-300 rounded transition-colors"
                      >
                        {t('channelConnections.copy')}
                      </button>
                    </div>
                  </div>
                )}

                {step.verifyToken && (
                  <div className="mt-2">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase">{t('channelConnections.verifyToken')}:</label>
                    <div className="flex items-center gap-1 mt-1">
                      <code className="flex-1 text-[11px] bg-orange-50 border border-orange-200 rounded px-2 py-0.5 font-mono text-orange-600">
                        {step.verifyToken}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(step.verifyToken)}
                        className="px-2 py-1 text-[10px] bg-orange-100 hover:bg-orange-200 text-orange-600 rounded transition-colors"
                      >
                        {t('channelConnections.copy')}
                      </button>
                    </div>
                  </div>
                )}

                {step.fields && (
                  <div className="mt-2">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase">{t('channelConnections.subscribeFields')}:</label>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {step.fields.map(field => (
                        <span key={field} className="text-[10px] bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 text-slate-500">
                          {field}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {step.tip && (
                  <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 mt-2">
                    💡 {step.tip}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

function ChannelConnectionsPage() {
  const { t } = useI18n();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showConnect, setShowConnect] = useState(null);
  const [forms, setForms] = useState({});
  const [connecting, setConnecting] = useState(false);
  const [activeTab, setActiveTab] = useState('zalo_oa');

  // Get channel definitions with translations
  const channelDefs = getChannels(t);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchChannels(); }, []);

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const res = await chatbotApi.listChannels();
      setChannels(res.data || []);
    } catch { toast.error(t('errors.loadFailed')); }
    finally { setLoading(false); }
  };

  const getChannel = (id) => channels.find(c => c.channel === id);

  const handleConnect = async (channelId, e) => {
    e.preventDefault();
    const channelDef = channelDefs.find(c => c.id === channelId);
    const formData = forms[channelId] || {};

    // Validation
    const requiredField = channelDef.fields.find(f => f.required && !formData[f.key]);
    if (requiredField) {
      toast.error(`${t('common.required')} ${requiredField.label}`);
      return;
    }

    setConnecting(true);
    try {
      let res;
      if (channelId === 'zalo_oa') {
        res = await chatbotApi.connectZaloOA({
          zalo_app_id: formData.zalo_app_id,
          zalo_app_secret: formData.zalo_app_secret,
          display_name: formData.display_name,
        });
      } else if (channelId === 'facebook') {
        res = await chatbotApi.connectFacebook({
          page_access_token: formData.page_access_token,
          page_id: formData.page_id,
          page_name: formData.display_name,
        });
      }

      if (res.success) {
        await fetchChannels();
        setShowConnect(null);
        setForms(prev => ({ ...prev, [channelId]: {} }));
        toast.success(`${t('common.success')} ${channelDef.name}`);
      } else {
        toast.error(res.message || t('errors.connectFailed'));
      }
    } catch (err) {
      toast.error(err.response?.data?.message || t('errors.connectFailed'));
    } finally { setConnecting(false); }
  };

  const handleDisconnect = async (channelId) => {
    if (!confirm(t('chatbot.channels.confirmDisconnect'))) return;
    try {
      await chatbotApi.disconnectChannel(channelId);
      await fetchChannels();
      toast.success(t('chatbot.channels.disconnectedSuccess'));
    } catch { toast.error(t('errors.disconnectFailed')); }
  };

  const channelDef = channelDefs.find(c => c.id === activeTab);
  const connectedChannel = getChannel(activeTab);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 bg-cyan-100 rounded-xl flex items-center justify-center shrink-0">
          <HiOutlineChip className="w-5 h-5 text-cyan-600" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800">{t('chatbot.channels.title')}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {t('chatbot.channels.description')}
          </p>
        </div>
      </div>

      {/* Channel Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="flex border-b border-slate-100">
          {channelDefs.map(ch => {
            const isConnected = !!getChannel(ch.id);
            return (
              <button
                key={ch.id}
                onClick={() => setActiveTab(ch.id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium transition-colors border-b-2 ${
                  activeTab === ch.id
                    ? 'text-cyan-600 border-cyan-500'
                    : 'text-slate-400 border-transparent hover:text-slate-600'
                }`}
              >
                <span>{ch.icon}</span>
                {ch.name}
                {isConnected && (
                  <span className="w-2 h-2 bg-green-500 rounded-full" title={t('chatbot.channels.connected')} />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <div className="text-center py-8 text-slate-400">{t('common.loading')}</div>
          ) : (
            <div className="space-y-4">
              {/* Channel Description */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{channelDef.icon}</span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-700">{channelDef.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5">{channelDef.description}</p>
                  </div>
                </div>
              </div>

              {/* Step-by-Step Guide */}
              <GuideSection channel={channelDef} connectedChannel={connectedChannel} t={t} />

              {/* Connected Status */}
              {connectedChannel?.is_active ? (
                <div className="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <HiOutlineCheckCircle className="w-6 h-6 text-green-600" />
                    <div>
                      <p className="text-sm font-semibold text-green-700">{t('chatbot.channels.connected')}</p>
                      <p className="text-xs text-green-600 mt-0.5">
                        {connectedChannel.display_name || channelDef.name}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDisconnect(activeTab)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                  >
                    <HiOutlineXCircle className="w-3.5 h-3.5" />
                    {t('chatbot.channels.disconnect')}
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl">
                  <div className="flex items-center gap-3">
                    <HiOutlineXCircle className="w-6 h-6 text-slate-400" />
                    <div>
                      <p className="text-sm font-semibold text-slate-500">{t('chatbot.channels.notConnected')}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{t('chatbot.channels.connectToStart', { name: channelDef.name })}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowConnect(activeTab)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-cyan-500 text-white text-xs font-semibold rounded-lg hover:bg-cyan-600 transition-all shadow-sm"
                  >
                    <HiOutlineLink className="w-3.5 h-3.5" />
                    {t('chatbot.channels.connect')}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Connect Modal */}
      {showConnect && (() => {
        const chDef = channelDefs.find(c => c.id === showConnect);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 sticky top-0 bg-white">
                <h3 className="text-sm font-bold text-slate-800">
                  {t('chatbot.channels.connect')} {chDef.icon} {chDef.name}
                </h3>
                <button onClick={() => setShowConnect(null)} className="p-1 text-slate-400 hover:text-slate-600">
                  <HiOutlineX className="w-5 h-5" />
                </button>
              </div>
              <form onSubmit={(e) => handleConnect(showConnect, e)} className="p-5 space-y-4">
                {chDef.fields.map(field => (
                  <div key={field.key}>
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                      {field.label} {field.required && <span className="text-red-400">*</span>}
                    </label>
                    <input
                      type={field.type}
                      value={forms[showConnect]?.[field.key] || ''}
                      onChange={e => setForms(prev => ({
                        ...prev,
                        [showConnect]: { ...prev[showConnect], [field.key]: e.target.value },
                      }))}
                      placeholder={field.placeholder}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-cyan-400 transition-all"
                    />
                  </div>
                ))}

                {/* Quick Help */}
                <div className="p-3 bg-cyan-50 border border-cyan-100 rounded-xl">
                  <p className="text-[11px] text-cyan-700">
                    💡 {t('chatbot.channels.quickHelp')}
                  </p>
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button type="button" onClick={() => setShowConnect(null)} className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700">{t('common.cancel')}</button>
                  <button type="submit" disabled={connecting} className="flex items-center gap-2 px-4 py-2 bg-cyan-500 text-white text-sm font-semibold rounded-xl hover:bg-cyan-600 disabled:opacity-60 transition-all">
                    {connecting ? <><HiOutlineRefresh className="w-4 h-4 animate-spin" />{t('chatbot.channels.connecting')}</> : <><HiOutlineCheckCircle className="w-4 h-4" />{t('chatbot.channels.connect')}</>}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

export default ChannelConnectionsPage;
