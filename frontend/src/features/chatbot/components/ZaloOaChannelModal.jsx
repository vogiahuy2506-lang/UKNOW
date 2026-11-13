import { useCallback, useEffect, useState } from 'react';
import {
  HiOutlineX,
  HiOutlineRefresh,
  HiOutlineClipboardCopy,
  HiOutlineCheckCircle,
  HiOutlineTrash,
  HiOutlineExternalLink,
  HiOutlineShieldCheck,
  HiOutlinePlus,
  HiOutlineChevronDown,
  HiOutlineChevronUp,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../services/chatbotApi.service';

export default function ZaloOaChannelModal({ open, onClose, chatbotId }) {
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState([]);
  const [togglingId, setTogglingId] = useState(null);
  const [copied, setCopied] = useState(false);

  // Form thêm OA mới
  const [showAddForm, setShowAddForm] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [formData, setFormData] = useState({
    access_token: '',
    refresh_token: '',
    app_id: '',
    app_secret: '',
    oa_secret_key: '',
  });

  // Xác thực tên miền (Domain verification)
  const [domainCode, setDomainCode] = useState('');
  const [domainVerified, setDomainVerified] = useState(null);
  const [savingDomain, setSavingDomain] = useState(false);

  // Webhook URL chuẩn theo tài liệu Zalo OA
  const webhookUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/api/v1/zalo/webhook`
    : '/api/v1/zalo/webhook';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Tải danh sách OA theo chatbot
      const accRes = await chatbotApi.getZaloOaAccountsForChatbot(chatbotId);
      setAccounts(Array.isArray(accRes?.data) ? accRes.data : []);

      // 2. Tải thông tin xác thực tên miền hiện có
      try {
        const domRes = await chatbotApi.getZaloDomainVerification();
        if (domRes?.data?.verification_code) {
          setDomainVerified(domRes.data);
          setDomainCode(domRes.data.verification_code);
        }
      } catch {
        // bỏ qua nếu chưa cấu hình
      }
    } catch (err) {
      console.error('[ZaloOaChannelModal] loadData failed:', err);
      toast.error('Không thể tải danh sách Zalo OA');
    } finally {
      setLoading(false);
    }
  }, [chatbotId]);

  useEffect(() => {
    if (open) loadData();
  }, [open, loadData]);

  if (!open) return null;

  const handleCopyWebhook = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      toast.success('Đã copy Webhook URL vào clipboard!');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Không thể copy vào clipboard');
    }
  };

  const handleSaveDomainVerification = async (e) => {
    e?.preventDefault();
    if (!domainCode.trim()) {
      toast.error('Vui lòng nhập mã xác thực tên miền từ Zalo');
      return;
    }
    setSavingDomain(true);
    try {
      const res = await chatbotApi.saveZaloDomainVerification(domainCode.trim());
      setDomainVerified(res?.data || { verification_code: domainCode.trim() });
      toast.success('Đã lưu mã xác thực tên miền thành công! Zalo crawler giờ có thể kiểm tra file.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Lỗi khi lưu mã xác thực');
    } finally {
      setSavingDomain(false);
    }
  };

  const handleToggleAccount = async (account) => {
    const nextState = !account.is_active;
    setTogglingId(account.channel_connection_id);
    try {
      await chatbotApi.toggleZaloOaAccountForChatbot(
        chatbotId,
        account.channel_connection_id,
        nextState
      );
      toast.success(
        nextState
          ? `Đã bật Zalo OA "${account.name}" cho trợ lý này`
          : `Đã tắt Zalo OA "${account.name}"`
      );
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể đổi trạng thái Zalo OA');
    } finally {
      setTogglingId(null);
    }
  };

  const handleConnectNewAccount = async (e) => {
    e?.preventDefault();
    if (!formData.access_token.trim()) {
      toast.error('Vui lòng nhập Access Token từ Zalo API Explorer');
      return;
    }

    setConnecting(true);
    try {
      const res = await chatbotApi.connectWorkspaceZaloOaAccount(formData);
      toast.success(res?.message || 'Kết nối Zalo OA thành công!');
      setFormData({
        access_token: '',
        refresh_token: '',
        app_id: '',
        app_secret: '',
        oa_secret_key: '',
      });
      setShowAddForm(false);
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Kết nối Zalo OA thất bại. Vui lòng kiểm tra lại token.');
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async (account) => {
    if (!window.confirm(`Bạn có chắc muốn ngắt kết nối tài khoản Zalo OA "${account.name}" khỏi toàn bộ Workspace?`)) {
      return;
    }
    try {
      await chatbotApi.disconnectWorkspaceZaloOaAccount(account.channel_connection_id);
      toast.success('Đã ngắt kết nối Zalo OA');
      await loadData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Không thể ngắt kết nối');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col border border-slate-200 dark:border-dk-border overflow-hidden my-auto">
        {/* Header */}
        <div className="px-6 py-4 flex items-center gap-3 border-b border-slate-100 dark:border-dk-border bg-slate-50/50 dark:bg-dk-surface/50">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-base shrink-0 bg-blue-600 text-white shadow-sm shadow-blue-500/20">
            Z
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold text-slate-900 dark:text-dk-text flex items-center gap-2">
              Kênh Zalo Official Account (Zalo OA)
              <span className="px-2 py-0.5 text-[11px] font-medium bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 rounded-full border border-blue-200/60 dark:border-blue-800/40">
                Multi-Account
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-dk-text2 mt-0.5 truncate">
              Liên kết nhiều Zalo OA và kích hoạt trợ lý AI phản hồi tự động
            </p>
          </div>
          <button
            type="button"
            onClick={loadData}
            title="Làm mới danh sách"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-dk-text dark:hover:bg-dk-raised shrink-0 transition-colors"
          >
            <HiOutlineRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:text-dk-text dark:hover:bg-dk-raised shrink-0 transition-colors"
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-sm">
          {/* Section 1: Hướng dẫn cấu hình Zalo Developers (Webhook & Domain Verify) */}
          <div className="bg-slate-50 dark:bg-dk-raised/50 rounded-xl p-4 border border-slate-200/80 dark:border-dk-border/80 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-dk-text flex items-center gap-1.5">
                <HiOutlineShieldCheck className="w-4 h-4 text-blue-500" />
                Cấu hình trên Zalo Developers
              </span>
              <a
                href="https://developers.zalo.me/tools/explorer/"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 font-medium"
              >
                Mở Zalo API Explorer <HiOutlineExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>

            {/* Webhook URL */}
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-dk-text2 mb-1">
                Webhook URL (dán vào Cài đặt Webhook của Zalo OA)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={webhookUrl}
                  className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg text-slate-600 dark:text-dk-text font-mono select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleCopyWebhook}
                  className="px-3 py-1.5 text-xs font-medium bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg hover:bg-slate-100 dark:hover:bg-dk-raised text-slate-700 dark:text-dk-text flex items-center gap-1.5 shrink-0 transition-colors shadow-sm"
                >
                  <HiOutlineClipboardCopy className="w-3.5 h-3.5" />
                  {copied ? 'Đã copy' : 'Copy'}
                </button>
              </div>
            </div>

            {/* Domain Verification */}
            <form onSubmit={handleSaveDomainVerification} className="pt-2 border-t border-slate-200/60 dark:border-dk-border/60">
              <label className="block text-xs font-medium text-slate-700 dark:text-dk-text2 mb-1">
                Xác thực tên miền Zalo (Domain Verification)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Dán mã hoặc zalo-platform-site-verification=..."
                  value={domainCode}
                  onChange={(e) => setDomainCode(e.target.value)}
                  className="flex-1 px-3 py-1.5 text-xs bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-lg text-slate-800 dark:text-dk-text font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={savingDomain}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shrink-0 disabled:opacity-50 shadow-sm"
                >
                  {savingDomain ? 'Đang lưu...' : 'Lưu mã'}
                </button>
              </div>
              {domainVerified?.verification_code && (
                <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                  <HiOutlineCheckCircle className="w-3.5 h-3.5" />
                  Đã kích hoạt file xác thực tại: <span className="font-mono">/{domainVerified.file_name || `zalo-platform-site-verification-${domainVerified.verification_code}.html`}</span>
                </div>
              )}
            </form>
          </div>

          {/* Section 2: Danh sách Zalo OA trong Workspace */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-dk-text">
                Tài khoản Zalo OA trong Workspace ({accounts.length})
              </h4>
              <button
                type="button"
                onClick={() => setShowAddForm(!showAddForm)}
                className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 flex items-center gap-1"
              >
                <HiOutlinePlus className="w-3.5 h-3.5" />
                Thêm Zalo OA mới
              </button>
            </div>

            {loading ? (
              <div className="py-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
                <HiOutlineRefresh className="w-4 h-4 animate-spin" /> Đang tải danh sách tài khoản...
              </div>
            ) : accounts.length === 0 ? (
              <div className="text-center py-6 px-4 bg-slate-50 dark:bg-dk-raised/30 rounded-xl border border-dashed border-slate-300 dark:border-dk-border">
                <p className="text-xs text-slate-500 dark:text-dk-text2">
                  Chưa có tài khoản Zalo OA nào được kết nối.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  className="mt-2.5 px-3 py-1.5 text-xs font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors inline-flex items-center gap-1.5 shadow-sm"
                >
                  <HiOutlinePlus className="w-3.5 h-3.5" /> Kết nối tài khoản đầu tiên
                </button>
              </div>
            ) : (
              <div className="space-y-2.5">
                {accounts.map((acc) => {
                  const isToggling = togglingId === acc.channel_connection_id;
                  return (
                    <div
                      key={acc.channel_connection_id}
                      className={`p-3.5 rounded-xl border transition-all flex items-center gap-3.5 ${
                        acc.is_active
                          ? 'border-blue-500/40 bg-blue-50/20 dark:bg-blue-950/20 shadow-sm'
                          : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface'
                      }`}
                    >
                      {/* Avatar */}
                      {acc.avatar ? (
                        <img
                          src={acc.avatar}
                          alt={acc.name}
                          className="w-10 h-10 rounded-full object-cover border border-slate-200 dark:border-dk-border shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-300 font-bold text-xs flex items-center justify-center shrink-0">
                          OA
                        </div>
                      )}

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800 dark:text-dk-text text-sm truncate">
                            {acc.name}
                          </span>
                          {acc.is_active && (
                            <span className="px-2 py-0.5 text-[10px] font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 rounded-full border border-emerald-300/60 dark:border-emerald-800/40 shrink-0">
                              Đang trả lời
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-dk-text2 flex items-center gap-2 mt-0.5">
                          <span>OA ID: <span className="font-mono text-slate-700 dark:text-dk-text">{acc.zalo_oa_id}</span></span>
                          <span>•</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">Tự động làm mới token</span>
                        </div>
                        {acc.active_on_other_chatbot && (
                          <div className="mt-1 text-[11px] text-amber-600 dark:text-amber-400 flex items-center gap-1 font-medium">
                            ⚠️ Đang gán cho bot: &quot;{acc.active_on_other_chatbot.name}&quot; (bật tại đây sẽ chuyển quyền trả lời qua bot này)
                          </div>
                        )}
                      </div>

                      {/* Action: Toggle Switch */}
                      <div className="flex items-center gap-2.5 shrink-0">
                        <button
                          type="button"
                          data-testid="toggle-oa-button"
                          aria-label="Bật hoặc tắt Zalo OA"
                          disabled={isToggling}
                          onClick={() => handleToggleAccount(acc)}
                          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                            acc.is_active ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'
                          } ${isToggling ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                              acc.is_active ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDisconnect(acc)}
                          title="Ngắt kết nối OA này"
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                        >
                          <HiOutlineTrash className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Section 3: Form thêm Zalo OA mới (Collapsible) */}
          <div className="border border-slate-200 dark:border-dk-border rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowAddForm(!showAddForm)}
              className="w-full px-4 py-3 flex items-center justify-between bg-slate-50/70 dark:bg-dk-raised/50 hover:bg-slate-100/70 dark:hover:bg-dk-raised transition-colors text-left font-medium text-xs text-slate-700 dark:text-dk-text"
            >
              <span className="flex items-center gap-2">
                <HiOutlinePlus className="w-4 h-4 text-blue-500" />
                Kết nối Zalo OA mới (Access Token & Refresh Token)
              </span>
              {showAddForm ? <HiOutlineChevronUp className="w-4 h-4" /> : <HiOutlineChevronDown className="w-4 h-4" />}
            </button>

            {showAddForm && (
              <form onSubmit={handleConnectNewAccount} className="p-4 space-y-3 bg-white dark:bg-dk-surface">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-dk-text mb-1">
                    Access Token <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    placeholder="Lấy từ Zalo API Explorer (cấp quyền cho OA)..."
                    value={formData.access_token}
                    onChange={(e) => setFormData({ ...formData, access_token: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-dk-raised border border-slate-200 dark:border-dk-border rounded-lg text-slate-800 dark:text-dk-text font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-dk-text mb-1">
                    Refresh Token <span className="text-slate-400 font-normal">(Khuyến nghị để hệ thống tự động gia hạn token 4h/lần)</span>
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Refresh token nhận được cùng lúc với access token..."
                    value={formData.refresh_token}
                    onChange={(e) => setFormData({ ...formData, refresh_token: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-dk-raised border border-slate-200 dark:border-dk-border rounded-lg text-slate-800 dark:text-dk-text font-mono focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-dk-text mb-1">
                      App ID (ID ứng dụng)
                    </label>
                    <input
                      type="text"
                      placeholder="VD: 123456789012345"
                      value={formData.app_id}
                      onChange={(e) => setFormData({ ...formData, app_id: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-dk-raised border border-slate-200 dark:border-dk-border rounded-lg text-slate-800 dark:text-dk-text focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-dk-text mb-1">
                      App Secret (Khóa bí mật ứng dụng)
                    </label>
                    <input
                      type="password"
                      placeholder="App Secret..."
                      value={formData.app_secret}
                      onChange={(e) => setFormData({ ...formData, app_secret: e.target.value })}
                      className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-dk-raised border border-slate-200 dark:border-dk-border rounded-lg text-slate-800 dark:text-dk-text focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-dk-text mb-1">
                    OA Secret Key <span className="text-slate-400 font-normal">(Tùy chọn: dùng để xác thực chữ ký webhook an toàn)</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Khóa bí mật OA từ Quản lý OA..."
                    value={formData.oa_secret_key}
                    onChange={(e) => setFormData({ ...formData, oa_secret_key: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 dark:bg-dk-raised border border-slate-200 dark:border-dk-border rounded-lg text-slate-800 dark:text-dk-text focus:ring-1 focus:ring-blue-500 focus:outline-none font-mono"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-3 py-1.5 text-xs text-slate-600 dark:text-dk-text2 hover:bg-slate-100 dark:hover:bg-dk-raised rounded-lg transition-colors"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    disabled={connecting}
                    className="px-4 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors shadow-sm disabled:opacity-50"
                  >
                    {connecting ? 'Đang kiểm tra & kết nối...' : 'Kết nối Zalo OA'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 dark:border-dk-border bg-slate-50/50 dark:bg-dk-surface/50 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-dk-text hover:bg-slate-200/60 dark:hover:bg-dk-raised rounded-lg transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
