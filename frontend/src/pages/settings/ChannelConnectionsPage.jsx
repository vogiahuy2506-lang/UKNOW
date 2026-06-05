import { useState, useEffect } from 'react';
import {
  HiOutlineChip, HiOutlineRefresh, HiOutlineExternalLink,
  HiOutlineX, HiOutlineCheckCircle, HiOutlineXCircle,
  HiOutlineLink, HiOutlineCode, HiOutlineChevronDown, HiOutlineChevronRight,
  HiOutlinePlay, HiOutlineSearch, HiOutlineLogin, HiOutlineUserGroup,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../services/chatbotApi';
import { useI18n } from '../../i18n';
import { useSearchParams } from 'react-router-dom';

// ── Channel Definitions ────────────────────────────────────────

function getChannels(t) {
  return [
    {
      id: 'zalo_oa',
      name: t('chatbot.channels.zaloOa'),
      description: t('chatbot.zaloOaDescription'),
      icon: '💬',
      color: 'blue',
      colorClass: 'bg-blue-500',
      fields: [
        { key: 'zalo_app_id', label: 'Zalo App ID', type: 'text', placeholder: '1234567890123456', required: true },
        { key: 'zalo_app_secret', label: 'Zalo App Secret', type: 'password', placeholder: '••••••••••••••••', required: true },
      ],
      guide: {
        title: 'Hướng dẫn kết nối Zalo OA',
        steps: [
          {
            title: 'Bước 1: Tạo Zalo Official Account',
            description: 'Đăng nhập Zalo Developer và tạo OA nếu chưa có',
            link: { text: 'Mở Zalo Developer', url: 'https://developer.zalo.me' },
            openInNew: true,
          },
          {
            title: 'Bước 2: Lấy App ID và App Secret',
            description: 'Vào mục Thông tin ứng dụng để lấy credentials',
            tip: 'App ID: dãy số 16 chữ số • App Secret: chuỗi ký tự dài',
          },
          {
            title: 'Bước 3: Cài đặt Webhook URL',
            description: 'Copy URL bên dưới và dán vào ô Webhook trên Zalo Developer',
            urlField: 'webhook_url',
            showCopyBtn: true,
          },
          {
            title: 'Bước 4: Kết nối',
            description: 'Nhập App ID và App Secret, nhấn "Kết nối"',
            tip: 'Webhook URL đã được hệ thống tự động thiết lập sẵn',
          },
        ],
      },
    },
    {
      id: 'facebook',
      name: 'Facebook Messenger',
      description: 'Kết nối Fanpage để chatbot tự động trả lời tin nhắn',
      icon: '📘',
      color: 'indigo',
      colorClass: 'bg-indigo-600',
      fields: [
        { key: 'page_access_token', label: 'Page Access Token', type: 'password', placeholder: 'EAACEdEose0cBA...', required: true },
        { key: 'page_id', label: 'Page ID', type: 'text', placeholder: '123456789', required: true },
      ],
      guide: {
        title: 'Hướng dẫn kết nối Facebook Messenger',
        steps: [
          {
            title: 'Bước 1: Tạo Facebook App',
            description: 'Tạo app loại Business trên Facebook Developers',
            link: { text: 'Mở Facebook Developers', url: 'https://developers.facebook.com' },
            openInNew: true,
          },
          {
            title: 'Bước 2: Thêm Messenger Product',
            description: 'Trong app của bạn, thêm product "Messenger"',
          },
          {
            title: 'Bước 3: Generate Page Token',
            description: 'Trong phần Messenger Settings, generate token cho Page của bạn',
            tip: 'Cần có quyền Admin trên Facebook Page',
          },
          {
            title: 'Bước 4: Cài đặt Webhook',
            description: 'Dùng URL và Verify Token bên dưới để setup webhook',
            urlField: 'webhook_url',
            verifyToken: 'founderai',
            showCopyBtn: true,
          },
          {
            title: 'Bước 5: Kết nối',
            description: 'Dán Page Access Token, Page ID và nhấn "Kết nối"',
          },
        ],
      },
    },
  ];
}

// ── Test Connection Component ──────────────────────────────────

function TestConnection({ channel, formData, onTest }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const [resultMessage, setResultMessage] = useState('');

  const handleTest = async () => {
    if (!formData || Object.values(formData).some(v => !v?.trim())) {
      toast.error('Vui lòng nhập đầy đủ thông tin');
      return;
    }

    setTesting(true);
    setResult(null);
    setResultMessage('');

    try {
      let res;
      if (channel === 'zalo_oa') {
        res = await chatbotApi.testZaloOA({
          zalo_app_id: formData.zalo_app_id,
          zalo_app_secret: formData.zalo_app_secret,
        });
      } else if (channel === 'facebook') {
        res = await chatbotApi.testFacebook({
          page_access_token: formData.page_access_token,
          page_id: formData.page_id,
        });
      }

      if (res.success) {
        setResult('success');
        setResultMessage(res.data?.oa_name || res.data?.page_name || 'Kết nối thành công!');
        toast.success(res.message || 'Kết nối thành công!');
      } else {
        setResult('error');
        setResultMessage(res.message || 'Kết nối thất bại');
        toast.error(res.message || 'Kết nối thất bại');
      }

      if (onTest) onTest(res.success ? 'success' : 'error');
    } catch (err) {
      setResult('error');
      setResultMessage(err.response?.data?.message || 'Lỗi kết nối');
      toast.error(err.response?.data?.message || 'Lỗi kết nối');
      if (onTest) onTest('error');
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200">
      <button
        type="button"
        onClick={handleTest}
        disabled={testing || !formData || Object.values(formData).some(v => !v?.trim())}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
      >
        {testing ? (
          <><HiOutlineRefresh className="w-4 h-4 animate-spin" /> Đang kiểm tra...</>
        ) : (
          <><HiOutlinePlay className="w-4 h-4" /> Kiểm tra kết nối</>
        )}
      </button>

      {result && (
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
          result === 'success'
            ? 'bg-green-100 text-green-700'
            : 'bg-red-100 text-red-700'
        }`}>
          {result === 'success' ? (
            <><HiOutlineCheckCircle className="w-4 h-4" /> {resultMessage}</>
          ) : (
            <><HiOutlineXCircle className="w-4 h-4" /> {resultMessage}</>
          )}
        </div>
      )}
    </div>
  );
}

// ── Guide Component ────────────────────────────────────────────

function GuideSection({ channel, connectedChannel, t }) {
  const [expanded, setExpanded] = useState(false);

  if (!channel.guide) return null;

  // Production API URL for webhooks
  const PRODUCTION_WEBHOOK_URL = 'https://founderai.biz';
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
                <div className={`w-7 h-7 rounded-full ${channel.colorClass} text-white text-xs font-bold flex items-center justify-center shrink-0`}>
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
                    className="inline-flex items-center gap-1 text-xs text-cyan-600 hover:underline mt-2 font-medium">
                    <HiOutlineExternalLink className="w-3 h-3" />
                    {step.link.text}
                  </a>
                )}

                {step.urlField && (
                  <div className="mt-3">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase">Webhook URL:</label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 text-[11px] bg-slate-100 border border-slate-200 rounded-lg px-3 py-2 font-mono text-slate-600 break-all">
                        {webhookUrl}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(webhookUrl)}
                        className="px-3 py-2 text-[11px] bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors font-medium shrink-0"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}

                {step.verifyToken && (
                  <div className="mt-3">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase">Verify Token:</label>
                    <div className="flex items-center gap-2 mt-1">
                      <code className="flex-1 text-[11px] bg-orange-50 border border-orange-200 rounded-lg px-3 py-2 font-mono text-orange-600">
                        {step.verifyToken}
                      </code>
                      <button
                        onClick={() => navigator.clipboard.writeText(step.verifyToken)}
                        className="px-3 py-2 text-[11px] bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors font-medium shrink-0"
                      >
                        Copy
                      </button>
                    </div>
                  </div>
                )}

                {step.tip && (
                  <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mt-2">
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

// ── OAuth Helpers ───────────────────────────────────────────────

async function initFacebookOAuth() {
  try {
    const res = await fetch('/api/webhooks/oauth/facebook/init', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    const data = await res.json();
    if (data.success && data.auth_url) {
      window.location.href = data.auth_url;
    } else {
      toast.error(data.message || 'Không thể khởi tạo OAuth');
    }
  } catch (err) {
    toast.error('Lỗi kết nối OAuth');
  }
}

async function initZaloOAuth() {
  try {
    const res = await fetch('/api/webhooks/oauth/zalo-oa/init', {
      headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
    });
    const data = await res.json();
    if (data.success && data.auth_url) {
      window.location.href = data.auth_url;
    } else {
      toast.error(data.message || 'Không thể khởi tạo OAuth');
    }
  } catch (err) {
    toast.error('Lỗi kết nối OAuth');
  }
}

// ── Page Select Modal ─────────────────────────────────────────

function FacebookPageSelectModal({ pages, token, onSelect, onClose }) {
  const [selectedPage, setSelectedPage] = useState(null);
  const [connecting, setConnecting] = useState(false);

  const handleConnect = async () => {
    if (!selectedPage) return;
    setConnecting(true);
    try {
      const res = await chatbotApi.completeFacebookConnection({
        page_id: selectedPage.id,
        page_name: selectedPage.name,
        page_access_token: selectedPage.access_token,
      });
      if (res.success) {
        toast.success(`Đã kết nối thành công page "${selectedPage.name}"!`);
        onSelect();
      } else {
        toast.error(res.message || 'Kết nối thất bại');
      }
    } catch (err) {
      toast.error('Lỗi kết nối');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
            📘 Chọn Facebook Page
          </h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600">
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 max-h-[60vh] overflow-y-auto">
          {pages.length === 0 ? (
            <div className="text-center py-8 text-slate-500">
              <HiOutlineUserGroup className="w-12 h-12 mx-auto mb-3 text-slate-300" />
              <p className="font-medium">Không tìm thấy Page nào</p>
              <p className="text-sm mt-1">Bạn cần có ít nhất 1 Facebook Page để kết nối</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => setSelectedPage(page)}
                  className={`w-full p-4 rounded-xl border-2 transition-all text-left ${
                    selectedPage?.id === page.id
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-slate-200 hover:border-slate-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                      <span className="text-lg">📘</span>
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-slate-700">{page.name}</p>
                      <p className="text-xs text-slate-400">ID: {page.id}</p>
                    </div>
                    {selectedPage?.id === page.id && (
                      <HiOutlineCheckCircle className="w-5 h-5 text-indigo-500" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="px-5 py-4 border-t border-slate-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-slate-500 hover:text-slate-700"
          >
            Hủy
          </button>
          <button
            onClick={handleConnect}
            disabled={!selectedPage || connecting}
            className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {connecting ? (
              <><HiOutlineRefresh className="w-4 h-4 animate-spin" /> Đang kết nối...</>
            ) : (
              <><HiOutlineCheckCircle className="w-4 h-4" /> Kết nối Page</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────

function ChannelConnectionsPage() {
  const { t } = useI18n();
  const [searchParams, setSearchParams] = useSearchParams();
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showConnect, setShowConnect] = useState(null);
  const [forms, setForms] = useState({});
  const [connecting, setConnecting] = useState(false);
  const [activeTab, setActiveTab] = useState('zalo_oa');
  const [connectionTest, setConnectionTest] = useState(null);
  const [oauthLoading, setOauthLoading] = useState(false);

  // Facebook page selection
  const [showPageSelect, setShowPageSelect] = useState(false);
  const [fbPages, setFbPages] = useState([]);
  const [fbToken, setFbToken] = useState('');

  const channelDefs = getChannels(t);

  // Handle OAuth callback params
  useEffect(() => {
    const success = searchParams.get('success');
    const error = searchParams.get('error');
    const name = searchParams.get('name');
    const reason = searchParams.get('reason');
    const facebookPages = searchParams.get('facebook_pages');
    const token = searchParams.get('token');

    if (success === 'zalo_connected') {
      toast.success(`Đã kết nối thành công "${name || 'Zalo OA'}"!`);
      fetchChannels();
    }

    if (error) {
      const errorMessages = {
        facebook_denied: 'Bạn đã hủy kết nối Facebook',
        zalo_denied: 'Bạn đã hủy kết nối Zalo OA',
        token_exchange_failed: 'Không thể lấy token từ Facebook',
        zalo_token_failed: 'Không thể lấy token từ Zalo',
        no_pages: 'Không tìm thấy Facebook Page nào',
      };
      toast.error(errorMessages[error] || `Lỗi: ${reason || error}`);
    }

    if (facebookPages && token) {
      try {
        const pages = JSON.parse(decodeURIComponent(facebookPages));
        setFbPages(pages);
        setFbToken(token);
        setShowPageSelect(true);
        setActiveTab('facebook');
      } catch (e) {
        console.error('Parse pages error:', e);
      }
    }

    // Clean URL
    if (success || error || facebookPages) {
      setSearchParams({});
    }

    fetchChannels();
  }, []);

  const fetchChannels = async () => {
    setLoading(true);
    try {
      const res = await chatbotApi.listChannels();
      setChannels(res.data || []);
    } catch { toast.error(t('errors.loadFailed')); }
    finally { setLoading(false); }
  };

  const getChannel = (id) => channels.find(c => c.channel === id);

  const handleOAuth = async (channelId) => {
    setOauthLoading(true);
    try {
      if (channelId === 'zalo_oa') {
        await initZaloOAuth();
      } else if (channelId === 'facebook') {
        await initFacebookOAuth();
      }
    } finally {
      setOauthLoading(false);
    }
  };

  const handleConnect = async (channelId, e) => {
    e?.preventDefault();
    const channelDef = channelDefs.find(c => c.id === channelId);
    const formData = forms[channelId] || {};

    // Validation
    const requiredField = channelDef.fields.find(f => f.required && !formData[f.key]);
    if (requiredField) {
      toast.error(`Vui lòng nhập: ${requiredField.label}`);
      return;
    }

    setConnecting(true);
    try {
      let res;
      if (channelId === 'zalo_oa') {
        res = await chatbotApi.connectZaloOA({
          zalo_app_id: formData.zalo_app_id,
          zalo_app_secret: formData.zalo_app_secret,
        });
      } else if (channelId === 'facebook') {
        res = await chatbotApi.connectFacebook({
          page_access_token: formData.page_access_token,
          page_id: formData.page_id,
        });
      }

      if (res.success) {
        await fetchChannels();
        setShowConnect(null);
        setForms(prev => ({ ...prev, [channelId]: {} }));
        setConnectionTest(null);
        toast.success(`${channelDef.name} đã được kết nối thành công!`);
      } else {
        toast.error(res.message || 'Kết nối thất bại');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'Kết nối thất bại');
    } finally { setConnecting(false); }
  };

  const handleDisconnect = async (channelId) => {
    if (!confirm('Bạn có chắc muốn ngắt kết nối?')) return;
    try {
      await chatbotApi.disconnectChannel(channelId);
      await fetchChannels();
      toast.success('Đã ngắt kết nối');
    } catch { toast.error('Ngắt kết nối thất bại'); }
  };

  const channelDef = channelDefs.find(c => c.id === activeTab);
  const connectedChannel = getChannel(activeTab);

  return (
    <div className="space-y-5 max-w-3xl mx-auto">
      {/* Facebook Page Selection Modal */}
      {showPageSelect && (
        <FacebookPageSelectModal
          pages={fbPages}
          token={fbToken}
          onSelect={() => {
            setShowPageSelect(false);
            fetchChannels();
          }}
          onClose={() => setShowPageSelect(false)}
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 bg-cyan-100 rounded-xl flex items-center justify-center shrink-0">
          <HiOutlineChip className="w-5 h-5 text-cyan-600" />
        </div>
        <div>
          <h2 className="text-base font-bold text-slate-800">{t('chatbot.channels.title')}</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Kết nối Zalo OA hoặc Facebook Messenger để chatbot tự động trả lời khách hàng
          </p>
        </div>
      </div>

      {/* Quick Connect Cards */}
      {!connectedChannel && (
        <div className="grid grid-cols-2 gap-4">
          {channelDefs.map(ch => {
            const isConnected = !!getChannel(ch.id);
            if (isConnected) return null;
            
            return (
              <div
                key={ch.id}
                className={`p-5 rounded-2xl border-2 transition-all cursor-pointer ${
                  activeTab === ch.id
                    ? `${ch.colorClass} text-white border-transparent`
                    : 'bg-white border-slate-200 hover:border-slate-300'
                }`}
                onClick={() => setActiveTab(ch.id)}
              >
                <div className="text-3xl mb-3">{ch.icon}</div>
                <h3 className={`font-bold ${activeTab === ch.id ? 'text-white' : 'text-slate-700'}`}>
                  {ch.name}
                </h3>
                <p className={`text-xs mt-1 ${activeTab === ch.id ? 'text-white/80' : 'text-slate-400'}`}>
                  {activeTab === ch.id ? 'Click để xem chi tiết' : 'Nhấn để kết nối'}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Channel Tabs */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
        <div className="flex border-b border-slate-100">
          {channelDefs.map(ch => {
            const isConnected = !!getChannel(ch.id);
            return (
              <button
                key={ch.id}
                onClick={() => setActiveTab(ch.id)}
                className={`flex-1 flex items-center justify-center gap-2 px-5 py-4 text-sm font-medium transition-all border-b-2 ${
                  activeTab === ch.id
                    ? `${ch.colorClass} text-white border-transparent`
                    : 'text-slate-500 border-transparent hover:bg-slate-50'
                }`}
              >
                <span className="text-lg">{ch.icon}</span>
                <span>{ch.name}</span>
                {isConnected && (
                  <span className={`w-2 h-2 rounded-full ${activeTab === ch.id ? 'bg-white' : 'bg-green-500'}`} />
                )}
              </button>
            );
          })}
        </div>

        <div className="p-6 space-y-5">
          {loading ? (
            <div className="text-center py-12 text-slate-400">
              <HiOutlineRefresh className="w-8 h-8 animate-spin mx-auto mb-2" />
              <p>Đang tải...</p>
            </div>
          ) : (
            <>
              {/* Channel Description */}
              <div className="p-4 bg-gradient-to-r from-slate-50 to-slate-100 rounded-xl border border-slate-200">
                <div className="flex items-start gap-3">
                  <span className="text-3xl">{channelDef.icon}</span>
                  <div>
                    <h3 className="text-sm font-bold text-slate-700">{channelDef.name}</h3>
                    <p className="text-xs text-slate-500 mt-1">{channelDef.description}</p>
                  </div>
                </div>
              </div>

              {/* Connection Status */}
              {connectedChannel?.is_active ? (
                <div className="p-5 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                        <HiOutlineCheckCircle className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-green-700">Đã kết nối</p>
                        <p className="text-xs text-green-600 mt-0.5">
                          {connectedChannel.display_name || channelDef.name}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDisconnect(activeTab)}
                      className="px-4 py-2 text-sm font-medium text-red-600 bg-white border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                    >
                      Ngắt kết nối
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* OAuth Quick Connect */}
                  <div className={`p-5 rounded-xl border-2 border-dashed ${channelDef.colorClass} border-opacity-30`}>
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center shadow-sm">
                        {channelDef.id === 'zalo_oa' ? (
                          <span className="text-2xl">💬</span>
                        ) : (
                          <span className="text-2xl">📘</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-slate-700">Kết nối nhanh với {channelDef.name}</h4>
                        <p className="text-xs text-slate-500 mt-1">
                          Đăng nhập và ủy quyền tự động - Không cần nhập thủ công
                        </p>
                      </div>
                      <button
                        onClick={() => handleOAuth(channelDef.id)}
                        disabled={oauthLoading}
                        className={`flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white rounded-xl transition-all shadow-md ${
                          channelDef.colorClass
                        } hover:opacity-90`}
                      >
                        {oauthLoading ? (
                          <><HiOutlineRefresh className="w-4 h-4 animate-spin" /> Đang chuyển...</>
                        ) : (
                          <><HiOutlineLogin className="w-4 h-4" /> Đăng nhập</>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-px bg-slate-200" />
                    <span className="text-xs text-slate-400 font-medium">HOẶC ĐIỀN THỦ CÔNG</span>
                    <div className="flex-1 h-px bg-slate-200" />
                  </div>

                  {/* Step-by-Step Guide */}
                  <GuideSection channel={channelDef} connectedChannel={connectedChannel} t={t} />

                  {/* Manual Connect Form */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
                    <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2">
                      <HiOutlineLink className="w-4 h-4 text-cyan-500" />
                      Điền thông tin thủ công
                    </h3>

                    <form onSubmit={(e) => handleConnect(activeTab, e)} className="space-y-4">
                      {channelDef.fields.map(field => (
                        <div key={field.key}>
                          <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                            {field.label} {field.required && <span className="text-red-400">*</span>}
                          </label>
                          <input
                            type={field.type}
                            value={forms[activeTab]?.[field.key] || ''}
                            onChange={e => {
                              setForms(prev => ({
                                ...prev,
                                [activeTab]: { ...prev[activeTab], [field.key]: e.target.value },
                              }));
                              setConnectionTest(null);
                            }}
                            placeholder={field.placeholder}
                            className="mt-1.5 w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100 transition-all"
                          />
                        </div>
                      ))}

                      {/* Test Connection */}
                      <TestConnection
                        channel={activeTab}
                        formData={forms[activeTab]}
                        onTest={setConnectionTest}
                      />

                      <button
                        type="submit"
                        disabled={connecting || connectionTest === 'error'}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-3 text-sm font-bold rounded-xl transition-all ${
                          connecting
                            ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                            : `${channelDef.colorClass} text-white hover:opacity-90 shadow-md`
                        }`}
                      >
                        {connecting ? (
                          <><HiOutlineRefresh className="w-4 h-4 animate-spin" /> Đang kết nối...</>
                        ) : (
                          <><HiOutlineCheckCircle className="w-4 h-4" /> Kết nối ngay</>
                        )}
                      </button>
                    </form>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default ChannelConnectionsPage;
