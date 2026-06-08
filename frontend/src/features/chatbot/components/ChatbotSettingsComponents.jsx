import { useState, useEffect, useRef } from 'react';
import {
  HiOutlineBookOpen,
  HiOutlineCheck,
  HiOutlineCheckCircle,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineClipboardCopy,
  HiOutlineCode,
  HiOutlineDocumentText,
  HiOutlineExternalLink,
  HiOutlineGlobeAlt,
  HiOutlineLink,
  HiOutlinePlay,
  HiOutlinePlus,
  HiOutlineQrcode,
  HiOutlineRefresh,
  HiOutlineTrash,
  HiOutlineUpload,
  HiOutlineX,
  HiOutlineXCircle,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import chatbotApi from '../services/chatbotApi.service';

export function SectionCard({ icon: Icon, title, subtitle, children, accent = 'slate' }) {
  const colors = {
    purple: 'bg-purple-50 text-purple-500',
    blue: 'bg-blue-50 text-blue-500',
    green: 'bg-green-50 text-green-600',
    orange: 'bg-orange-50 text-orange-500',
    slate: 'bg-slate-100 text-slate-500',
  };

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${colors[accent]}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-700">{title}</p>
          {subtitle && <p className="text-xs text-slate-400 truncate">{subtitle}</p>}
        </div>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function FieldRow({ label, children, hint }) {
  return (
    <div className="space-y-1.5">
      <label className="label">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export function TextInput({ className = '', ...props }) {
  return <input className={`input ${className}`} {...props} />;
}

export function Textarea({ className = '', ...props }) {
  return <textarea className={`input resize-y min-h-[80px] ${className}`} {...props} />;
}

export function Toggle({ checked, onChange, id }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      id={id}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
        checked ? 'bg-primary-600' : 'bg-slate-200'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export function ChannelStatusBadge({ connected, label }) {
  return connected ? (
    <span className="inline-flex max-w-full items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
      <span className="w-1.5 h-1.5 rounded-full bg-green-500 shrink-0" />
      <span className="truncate">{label || 'Đã kết nối'}</span>
    </span>
  ) : (
    <span className="inline-flex max-w-full items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
      <span className="truncate">Chưa kết nối</span>
    </span>
  );
}

export function CopyField({ label, value, tone = 'slate' }) {
  const toneClass = {
    slate: 'bg-slate-50 border-slate-200 text-slate-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
  };

  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</label>
      <div className={`rounded-xl border px-3 py-3 ${toneClass[tone]}`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <code className="min-w-0 flex-1 text-[11px] font-mono break-all leading-5">{value}</code>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard.writeText(value);
              toast.success('Đã copy');
            }}
            className="inline-flex items-center justify-center gap-1 rounded-lg bg-white/80 px-2.5 py-1.5 text-[11px] font-medium hover:bg-white transition-colors shrink-0 self-start"
          >
            <HiOutlineClipboardCopy className="w-3.5 h-3.5" /> Copy
          </button>
        </div>
      </div>
    </div>
  );
}

export function ChecklistStep({ index, title, description, children, accent = 'blue', expanded, onToggle }) {
  const accentClass = {
    blue: 'bg-blue-500',
    indigo: 'bg-indigo-600',
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
      >
        <div className={`w-7 h-7 rounded-full ${accentClass[accent]} text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5`}>
          {index}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold text-slate-700 break-words">{title}</h4>
              <p className="text-xs text-slate-500 mt-1 leading-5 break-words">{description}</p>
            </div>
            {expanded ? (
              <HiOutlineChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            ) : (
              <HiOutlineChevronRight className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            )}
          </div>
        </div>
      </button>
      {expanded ? <div className="px-4 pb-4 pl-14 min-w-0">{children}</div> : null}
    </div>
  );
}

export function ChannelOverview({ accent = 'blue', icon, title, subtitle, bullets }) {
  const palette = {
    blue: {
      iconWrap: 'bg-blue-100 text-blue-600',
      badge: 'bg-blue-50 border-blue-100 text-blue-700',
      dot: 'bg-blue-500',
    },
    indigo: {
      iconWrap: 'bg-indigo-100 text-indigo-600',
      badge: 'bg-indigo-50 border-indigo-100 text-indigo-700',
      dot: 'bg-indigo-600',
    },
  };

  const current = palette[accent];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg font-bold shrink-0 ${current.iconWrap}`}>
          {icon}
        </div>
        <div className="min-w-0">
          <div className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${current.badge}`}>
            Kết nối kênh hội thoại
          </div>
          <h3 className="text-sm font-semibold text-slate-800 mt-2">{title}</h3>
          <p className="text-xs text-slate-500 mt-1 leading-5">{subtitle}</p>
        </div>
      </div>
      <div className="mt-4 grid gap-2">
        {bullets.map((item) => (
          <div key={item} className="flex items-start gap-2 text-xs text-slate-600 leading-5">
            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${current.dot}`} />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChannelQuickTest({ channelType, channelLabel, connected }) {
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState(null);
  const [message, setMessage] = useState('');

  const handleTest = async () => {
    if (!connected) return;
    setTesting(true);
    setResult(null);
    setMessage('');
    try {
      const response = await chatbotApi.testInboxConnection(channelType);
      const ok = !!response.data?.success;
      setResult(ok ? 'success' : 'error');
      setMessage(response.data?.message || (ok ? 'Kiểm tra thành công' : 'Kiểm tra thất bại'));
      if (ok) toast.success(response.data?.message || 'Kiểm tra kết nối thành công');
      else toast.error(response.data?.message || 'Kiểm tra kết nối thất bại');
    } catch (err) {
      const errorMessage = err.response?.data?.message || 'Không thể kiểm tra kết nối';
      setResult('error');
      setMessage(errorMessage);
      toast.error(errorMessage);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <p className="text-sm font-semibold text-slate-700">Kiểm tra kết nối nhanh</p>
        <p className="text-xs text-slate-400 mt-1">Xác minh trạng thái hiện tại của kênh mà không cần rời khỏi studio.</p>
      </div>
      <div className="p-4 space-y-3">
        {connected ? (
          <>
            <button
              type="button"
              onClick={handleTest}
              disabled={testing}
              className="btn btn-secondary text-xs"
            >
              {testing ? (
                <><HiOutlineRefresh className="w-4 h-4 animate-spin" /> Đang kiểm tra...</>
              ) : (
                <><HiOutlinePlay className="w-4 h-4" /> Test {channelLabel}</>
              )}
            </button>
            {result ? (
              <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs leading-5 ${
                result === 'success'
                  ? 'border-green-200 bg-green-50 text-green-700'
                  : 'border-red-200 bg-red-50 text-red-700'
              }`}>
                {result === 'success' ? (
                  <HiOutlineCheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                ) : (
                  <HiOutlineXCircle className="w-4 h-4 shrink-0 mt-0.5" />
                )}
                <span>{message}</span>
              </div>
            ) : null}
          </>
        ) : (
          <div className="rounded-xl border border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700 leading-5">
            Kênh chưa được kết nối nên chưa thể test trực tiếp trong studio. Hãy hoàn tất cấu hình tại trang kết nối kênh trước.
          </div>
        )}
      </div>
    </div>
  );
}

export function ZaloChannelCard({ channel, onConnect, onDisconnect, onOpenGuide, webhookUrl }) {
  const isConnected = !!channel;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-blue-100 text-blue-600 flex items-center justify-center text-2xl font-bold shrink-0">
          Z
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-lg font-bold text-slate-800">Zalo Official Account</h3>
            <ChannelStatusBadge connected={isConnected} label={isConnected ? 'Đã kết nối' : 'Chưa kết nối'} />
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Kết nối chatbot với Zalo OA để tự động nhận, phân luồng và phản hồi hội thoại từ khách hàng.
          </p>
        </div>
      </div>

      {isConnected ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-semibold text-blue-700">Kênh đang hoạt động</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="bg-white/80 rounded-xl p-3 border border-blue-100">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Webhook URL</p>
                <p className="text-xs text-slate-700 font-mono break-all">{channel.webhook_url || webhookUrl}</p>
              </div>
              {channel.config && (
                <div className="bg-white/80 rounded-xl p-3 border border-blue-100">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">App ID</p>
                  <p className="text-xs text-slate-700 font-mono">{channel.config.zalo_app_id || '—'}</p>
                </div>
              )}
            </div>
            <p className="text-xs text-blue-600 mt-3">
              Chatbot đang nhận sự kiện từ Zalo OA. Nếu bạn thay đổi OA hoặc app credentials, hãy ngắt kết nối và cấu hình lại.
            </p>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onOpenGuide} className="btn btn-secondary text-xs">
              <HiOutlineBookOpen className="w-4 h-4" /> Xem hướng dẫn
            </button>
            <button type="button" onClick={onDisconnect} className="btn bg-red-50 text-red-600 hover:bg-red-100 text-xs border border-red-200">
              <HiOutlineTrash className="w-4 h-4" /> Ngắt kết nối
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                <HiOutlineLink className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Thiết lập Webhook</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sau khi kết nối, webhook URL sẽ được sử dụng để nhận tin nhắn và sự kiện từ Zalo OA.
                </p>
              </div>
            </div>
            <CopyField label="Webhook URL" value={webhookUrl} tone="blue" />
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onOpenGuide} className="btn btn-secondary text-xs">
              <HiOutlineBookOpen className="w-4 h-4" /> Xem hướng dẫn
            </button>
            <button type="button" onClick={onConnect} className="btn btn-primary text-xs">
              <HiOutlinePlus className="w-4 h-4" /> Kết nối Zalo OA
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function FacebookChannelCard({ channel, onConnect, onDisconnect, onOpenGuide, webhookUrl, verifyToken }) {
  const isConnected = !!channel;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-4">
        <div className="w-14 h-14 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center text-2xl font-bold shrink-0">
          f
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h3 className="text-lg font-bold text-slate-800">Facebook Messenger</h3>
            <ChannelStatusBadge connected={isConnected} label={isConnected ? 'Đã kết nối' : 'Chưa kết nối'} />
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Kết nối chatbot với Facebook Fanpage để tự động trả lời tin nhắn Messenger.
          </p>
        </div>
      </div>

      {isConnected ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-semibold text-indigo-700">Fanpage đã liên kết</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="bg-white/80 rounded-xl p-3 border border-indigo-100">
                <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Webhook URL</p>
                <p className="text-xs text-slate-700 font-mono break-all">{channel.webhook_url || webhookUrl}</p>
              </div>
              {channel.config && (
                <div className="bg-white/80 rounded-xl p-3 border border-indigo-100">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1">Page ID</p>
                  <p className="text-xs text-slate-700 font-mono">{channel.config.page_id || '—'}</p>
                </div>
              )}
            </div>
            <p className="text-xs text-indigo-600 mt-3">
              Các cuộc trò chuyện Messenger mới sẽ được chuyển vào chatbot. Nếu đổi page hoặc token, hãy kết nối lại.
            </p>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onOpenGuide} className="btn btn-secondary text-xs">
              <HiOutlineBookOpen className="w-4 h-4" /> Xem hướng dẫn
            </button>
            <button type="button" onClick={onDisconnect} className="btn bg-red-50 text-red-600 hover:bg-red-100 text-xs border border-red-200">
              <HiOutlineTrash className="w-4 h-4" /> Ngắt kết nối
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                <HiOutlineLink className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Cấu hình Webhook</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Sử dụng URL và Verify Token bên dưới để cấu hình webhook trên Facebook Developer Console.
                </p>
              </div>
            </div>
            <div className="space-y-3">
              <CopyField label="Webhook URL" value={webhookUrl} tone="blue" />
              <CopyField label="Verify Token" value={verifyToken} tone="orange" />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onOpenGuide} className="btn btn-secondary text-xs">
              <HiOutlineBookOpen className="w-4 h-4" /> Xem hướng dẫn
            </button>
            <button type="button" onClick={onConnect} className="btn btn-primary text-xs">
              <HiOutlinePlus className="w-4 h-4" /> Kết nối Facebook
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function FacebookConnectModal({
  open,
  form,
  connecting,
  onClose,
  onSubmit,
  onChange,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Kết nối Facebook Messenger</h3>
            <p className="text-xs text-slate-400 mt-1">Nhập Page ID và Page Access Token để kết nối chatbot với Fanpage của bạn.</p>
          </div>
          <button type="button" onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <HiOutlineX className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <FieldRow label="Tên hiển thị">
            <TextInput
              value={form.display_name}
              onChange={e => onChange(prev => ({ ...prev, display_name: e.target.value }))}
              placeholder="VD: Facebook Page bán hàng"
            />
          </FieldRow>
          <FieldRow label="Facebook Page ID">
            <TextInput
              value={form.page_id}
              onChange={e => onChange(prev => ({ ...prev, page_id: e.target.value }))}
              placeholder="Nhập Page ID (số)"
              required
            />
          </FieldRow>
          <FieldRow label="Page Access Token" hint="Token phải có quyền pages_messaging và không hết hạn">
            <Textarea
              value={form.page_access_token}
              onChange={e => onChange(prev => ({ ...prev, page_access_token: e.target.value }))}
              placeholder="EAAxxxxxxxxxxxxx..."
              rows={4}
              required
            />
          </FieldRow>
          <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-xs text-indigo-700 leading-5">
            Sau khi kết nối thành công, webhook URL sẽ được sinh để bạn cấu hình trên Facebook Developer Console.
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">Hủy</button>
            <button type="submit" disabled={connecting} className="btn btn-primary disabled:opacity-50">
              {connecting ? 'Đang kết nối...' : 'Kết nối Facebook'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ZaloConnectModal({
  open,
  form,
  connecting,
  onClose,
  onSubmit,
  onChange,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Kết nối Zalo Official Account</h3>
            <p className="text-xs text-slate-400 mt-1">Nhập App ID và App Secret để kết nối thật với chatbot này.</p>
          </div>
          <button type="button" onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <HiOutlineX className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <FieldRow label="Tên hiển thị">
            <TextInput
              value={form.display_name}
              onChange={e => onChange(prev => ({ ...prev, display_name: e.target.value }))}
              placeholder="VD: Zalo OA bán hàng"
            />
          </FieldRow>
          <FieldRow label="Zalo App ID">
            <TextInput
              value={form.zalo_app_id}
              onChange={e => onChange(prev => ({ ...prev, zalo_app_id: e.target.value }))}
              placeholder="Nhập App ID"
              required
            />
          </FieldRow>
          <FieldRow label="Zalo App Secret">
            <TextInput
              type="password"
              value={form.zalo_app_secret}
              onChange={e => onChange(prev => ({ ...prev, zalo_app_secret: e.target.value }))}
              placeholder="Nhập App Secret"
              required
            />
          </FieldRow>
          <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-700 leading-5">
            Sau khi kết nối thành công, hệ thống sẽ sinh webhook URL riêng cho chatbot này để bạn cấu hình trong Zalo Developer.
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">Hủy</button>
            <button type="submit" disabled={connecting} className="btn btn-primary disabled:opacity-50">
              {connecting ? 'Đang kết nối...' : 'Kết nối Zalo OA'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function UploadDocumentModal({
  open,
  form,
  uploading,
  fileInputRef,
  onClose,
  onSubmit,
  onFileSelect,
  onChange,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Upload Tài Liệu</h3>
          <button type="button" onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <HiOutlineX className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <div
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:bg-slate-50 hover:border-slate-300 transition-colors"
          >
            <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.csv,.xlsx,.xls"
              className="hidden" onChange={onFileSelect} />
            {form.file ? (
              <>
                <HiOutlineDocumentText className="w-8 h-8 text-green-500 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-700">{form.file.name}</p>
                <p className="text-xs text-slate-400 mt-1">
                  {(form.file.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </>
            ) : (
              <>
                <HiOutlineUpload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm text-slate-600">Click hoặc kéo thả file vào đây</p>
                <p className="text-xs text-slate-400 mt-1">PDF, DOCX, TXT, CSV (tối đa 10MB)</p>
              </>
            )}
          </div>
          <FieldRow label="Tiêu đề (tùy chọn)">
            <TextInput
              value={form.title}
              onChange={e => onChange(p => ({ ...p, title: e.target.value }))}
              placeholder="Nhập tiêu đề tài liệu"
            />
          </FieldRow>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">Hủy</button>
            <button type="submit" disabled={uploading || !form.file} className="btn btn-primary disabled:opacity-50">
              {uploading ? 'Đang tải...' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function TextDocumentModal({
  open,
  form,
  adding,
  onClose,
  onSubmit,
  onChange,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-800">Thêm Văn Bản Kiến Thức</h3>
          <button type="button" onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <HiOutlineX className="w-4 h-4" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="p-5 space-y-4">
          <FieldRow label="Tiêu đề (tùy chọn)">
            <TextInput
              value={form.title}
              onChange={e => onChange(p => ({ ...p, title: e.target.value }))}
              placeholder="VD: FAQ về sản phẩm"
            />
          </FieldRow>
          <FieldRow label="Nội dung">
            <Textarea
              value={form.content}
              onChange={e => onChange(p => ({ ...p, content: e.target.value }))}
              rows={8}
              placeholder="Dán nội dung văn bản, FAQ, thông tin sản phẩm..."
              required
            />
          </FieldRow>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn btn-ghost">Hủy</button>
            <button type="submit" disabled={adding || !form.content.trim()} className="btn btn-primary disabled:opacity-50">
              {adding ? 'Đang thêm...' : 'Lưu lại'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function ChannelGuideModal({
  open,
  onClose,
  accent = 'blue',
  icon,
  title,
  summary,
  docsUrl,
  setupChecklist,
  techDetails,
  footer,
}) {
  if (!open) return null;

  const palette = {
    blue: {
      icon: 'bg-blue-100 text-blue-600',
      title: 'text-blue-600',
    },
    indigo: {
      icon: 'bg-indigo-100 text-indigo-600',
      title: 'text-indigo-600',
    },
  };

  const current = palette[accent];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className={`w-11 h-11 rounded-2xl flex items-center justify-center text-lg font-bold shrink-0 ${current.icon}`}>
              {icon}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-semibold text-slate-800">{title}</h3>
                <span className={`text-xs font-medium ${current.title}`}>Hướng dẫn triển khai</span>
              </div>
              <p className="text-sm text-slate-500 mt-1 leading-6">{summary}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {docsUrl ? (
              <a
                href={docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 text-xs font-medium hover:underline ${current.title}`}
              >
                <HiOutlineExternalLink className="w-3.5 h-3.5" /> Tài liệu
              </a>
            ) : null}
            <button type="button" onClick={onClose}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <HiOutlineX className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-76px)] p-5">
          <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr] min-w-0">
            <div className="space-y-4 min-w-0">
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-700">Hướng dẫn thiết lập</p>
                  <p className="text-xs text-slate-400 mt-1">Làm theo từng bước để hoàn tất kết nối.</p>
                </div>
                <div className="p-4 min-w-0">{setupChecklist}</div>
              </div>
            </div>

            <div className="space-y-4 min-w-0">
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-700">Thông số kỹ thuật</p>
                  <p className="text-xs text-slate-400 mt-1">Các giá trị cần dùng khi cấu hình webhook.</p>
                </div>
                <div className="p-4 space-y-3 min-w-0">{techDetails}</div>
              </div>

              {footer ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-500 leading-5 min-w-0">
                  {footer}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Public Link Card ──────────────────────────────────────────────────────────

export function PublicLinkCard({ chatbot, form }) {
  const [linkCopied, setLinkCopied] = useState(false);
  const [qrCopied, setQrCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [qrDownloadUrl, setQrDownloadUrl] = useState(null);
  const [qrColor, setQrColor] = useState(() => {
    const saved = localStorage.getItem(`qr_color_${chatbot.id}`);
    return saved || form.primary_color || '#6366F1';
  });
  const [qrBgColor, setQrBgColor] = useState(() => {
    const saved = localStorage.getItem(`qr_bgcolor_${chatbot.id}`);
    return saved || form.background_color || '#FFFFFF';
  });
  const [qrLogo, setQrLogo] = useState(() => {
    const saved = localStorage.getItem(`qr_logo_${chatbot.id}`);
    return saved || form.logo_url || '';
  });
  const qrRef = useRef(null);

  // Persist QR settings to localStorage
  useEffect(() => {
    localStorage.setItem(`qr_color_${chatbot.id}`, qrColor);
  }, [qrColor, chatbot.id]);

  useEffect(() => {
    localStorage.setItem(`qr_bgcolor_${chatbot.id}`, qrBgColor);
  }, [qrBgColor, chatbot.id]);

  useEffect(() => {
    localStorage.setItem(`qr_logo_${chatbot.id}`, qrLogo);
  }, [qrLogo, chatbot.id]);

  // Generate short link
  const shortLinkId = chatbot.widget_key || chatbot.id;
  const shortLink = `https://founderai.biz/${shortLinkId}`;
  const fullLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/chat/${chatbot.id}`;

  // Generate QR code with current settings
  const generateQR = async () => {
    try {
      const url = await QRCode.toDataURL(shortLink, {
        width: 280,
        margin: 2,
        color: {
          dark: qrColor,
          light: qrBgColor,
        },
        errorCorrectionLevel: qrLogo ? 'H' : 'M', // Higher error correction if logo
      });
      setQrDataUrl(url);

      const link = document.createElement('a');
      link.download = `chatbot-qr-${shortLinkId}.png`;
      link.href = url;
      setQrDownloadUrl(link);
    } catch (err) {
      console.error('QR generation failed:', err);
    }
  };

  useEffect(() => {
    generateQR();
  }, [shortLink, qrColor, qrBgColor, shortLinkId]);

  // Regenerate QR when logo changes
  useEffect(() => {
    if (qrLogo) {
      generateQR();
    }
  }, [qrLogo]);

  const copyLink = () => {
    navigator.clipboard.writeText(shortLink);
    setLinkCopied(true);
    toast.success('Đã copy link!');
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const copyQR = () => {
    if (qrDataUrl) {
      fetch(qrDataUrl)
        .then(res => res.blob())
        .then(blob => {
          const item = new ClipboardItem({ 'image/png': blob });
          navigator.clipboard.write([item]);
          setQrCopied(true);
          toast.success('Đã copy QR code!');
          setTimeout(() => setQrCopied(false), 2000);
        });
    }
  };

  const downloadQR = () => {
    if (qrDownloadUrl) {
      qrDownloadUrl.click();
      toast.success('Đã tải QR code!');
    }
  };

  const resetToDefault = () => {
    const defaultColor = form.primary_color || '#6366F1';
    const defaultBg = form.background_color || '#FFFFFF';
    const defaultLogo = form.logo_url || '';
    setQrColor(defaultColor);
    setQrBgColor(defaultBg);
    setQrLogo(defaultLogo);
    localStorage.setItem(`qr_color_${chatbot.id}`, defaultColor);
    localStorage.setItem(`qr_bgcolor_${chatbot.id}`, defaultBg);
    localStorage.setItem(`qr_logo_${chatbot.id}`, defaultLogo);
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 min-w-0 w-full space-y-5">
      {/* Header */}
      <div>
        <h3 className="text-base font-semibold text-slate-800 flex items-center gap-2">
          <HiOutlineGlobeAlt className="w-5 h-5 text-emerald-500" />
          Link rút gọn & QR Code
        </h3>
        <p className="text-xs text-slate-500 mt-1">
          Chia sẻ nhanh cho khách hàng qua link hoặc mã QR có thể tùy chỉnh.
        </p>
      </div>

      {/* Main Content - 2 columns on desktop */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left Column - QR Code Preview */}
        <div className="flex flex-col items-center gap-4">
          {/* QR Display */}
          {qrDataUrl ? (
            <div className="relative">
              <img
                ref={qrRef}
                src={qrDataUrl}
                alt="QR Code"
                className="w-52 h-52 rounded-2xl shadow-lg border-4"
                style={{ borderColor: qrBgColor === '#FFFFFF' ? '#f1f5f9' : qrBgColor }}
              />
              {/* Logo overlay */}
              {qrLogo && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <img
                    src={qrLogo}
                    alt="Logo"
                    className="w-14 h-14 rounded-2xl bg-white p-1.5 shadow-xl object-contain"
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="w-52 h-52 rounded-2xl border-4 border-dashed border-slate-300 flex items-center justify-center bg-slate-50">
              <div className="animate-pulse text-slate-400 text-sm">Đang tạo QR...</div>
            </div>
          )}

          {/* QR Actions */}
          <div className="flex gap-2 w-full">
            <button
              type="button"
              onClick={copyQR}
              disabled={!qrDataUrl}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 font-medium"
            >
              <HiOutlineClipboardCopy className="w-4 h-4" />
              {qrCopied ? 'Đã copy!' : 'Copy QR'}
            </button>

            <button
              type="button"
              onClick={downloadQR}
              disabled={!qrDataUrl}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-xs px-4 py-2.5 rounded-xl transition-colors disabled:opacity-50 font-medium"
            >
              <HiOutlineExternalLink className="w-4 h-4" />
              Tải PNG
            </button>
          </div>
        </div>

        {/* Right Column - Customization & Link */}
        <div className="flex-1 space-y-4">
          {/* Short Link */}
          <div className="bg-gradient-to-br from-slate-50 to-slate-100 rounded-xl p-4">
            <label className="text-xs font-medium text-slate-600 mb-2 block">Link rút gọn</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shortLink}
                className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2.5 text-sm font-mono text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <button
                type="button"
                onClick={copyLink}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs px-4 py-2.5 rounded-lg transition-colors whitespace-nowrap font-medium"
              >
                {linkCopied ? (
                  <>
                    <HiOutlineCheckCircle className="w-4 h-4" />
                    Đã copy!
                  </>
                ) : (
                  <>
                    <HiOutlineClipboardCopy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </button>
            </div>
          </div>

          {/* QR Customization */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Tùy chỉnh QR</label>
              <button
                type="button"
                onClick={resetToDefault}
                className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
              >
                <HiOutlineRefresh className="w-3.5 h-3.5" />
                Reset
              </button>
            </div>

            {/* Color Pickers */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-slate-500">Màu QR</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={qrColor}
                    onChange={(e) => setQrColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={qrColor}
                    onChange={(e) => setQrColor(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-600"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-500">Màu nền</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={qrBgColor}
                    onChange={(e) => setQrBgColor(e.target.value)}
                    className="w-10 h-10 rounded-lg border border-slate-200 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={qrBgColor}
                    onChange={(e) => setQrBgColor(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1.5 text-xs font-mono text-slate-600"
                  />
                </div>
              </div>
            </div>

            {/* Logo URL */}
            <div className="space-y-1.5">
              <label className="text-xs text-slate-500">Logo (URL)</label>
              <input
                type="text"
                value={qrLogo}
                onChange={(e) => setQrLogo(e.target.value)}
                placeholder="https://example.com/logo.png"
                className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 placeholder:text-slate-400"
              />
              <p className="text-xs text-slate-400">Logo sẽ hiển thị ở giữa mã QR (yêu cầu độ tương phản cao).</p>
            </div>
          </div>

          {/* Use Cases */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-xs font-medium text-amber-800 mb-2">Cách sử dụng:</p>
            <ul className="text-xs text-amber-700 space-y-1">
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                Chia sẻ link/QR qua Zalo, Facebook, Email
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                Đặt trên namecard, banner, email signature
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-500 mt-0.5">•</span>
                In ấn, đặt tại quầy
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Footer - Full Link */}
      <div className="text-xs text-slate-400 border-t border-slate-100 pt-3 flex items-center gap-2">
        <span className="font-medium">Link đầy đủ:</span>
        <span className="font-mono truncate">{fullLink}</span>
      </div>
    </div>
  );
}

// ── Deploy Method Modal ────────────────────────────────────────────────────────

const deployOptionsConfig = [
  {
    id: 'script',
    label: 'Website Script',
    desc: 'Nhúng đoạn mã JavaScript vào website để hiển thị chatbot.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
      </svg>
    ),
    color: 'emerald',
  },
  {
    id: 'iframe',
    label: 'iFrame',
    desc: 'Nhúng chatbot vào một trang cố định trên website.',
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
      </svg>
    ),
    color: 'blue',
  },
  {
    id: 'publicLink',
    label: 'Link công khai',
    desc: 'Chia sẻ link rút gọn và mã QR cho khách hàng.',
    icon: <HiOutlineGlobeAlt className="w-6 h-6" />,
    color: 'purple',
  },
  {
    id: 'zalo',
    label: 'Zalo OA',
    desc: 'Kết nối với Zalo Official Account để nhận tin nhắn.',
    icon: (
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-6.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm2 4.5c0 1.5-1.5 2.5-3 2.5s-3-1-3-2.5" />
      </svg>
    ),
    color: 'blue',
  },
  {
    id: 'facebook',
    label: 'Facebook Messenger',
    desc: 'Kết nối với Facebook Page để nhận tin nhắn.',
    icon: (
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
      </svg>
    ),
    color: 'indigo',
  },
];

const colorClasses = {
  emerald: { bg: 'bg-emerald-100', text: 'text-emerald-600', border: 'border-emerald-200' },
  blue: { bg: 'bg-blue-100', text: 'text-blue-600', border: 'border-blue-200' },
  purple: { bg: 'bg-purple-100', text: 'text-purple-600', border: 'border-purple-200' },
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-600', border: 'border-indigo-200' },
};

export function DeployMethodModal({ open, currentTab, onSelect, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-semibold text-slate-800">Chọn phương thức triển khai</h3>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <HiOutlineX className="w-5 h-5 text-slate-400" />
          </button>
        </div>

        {/* Options List */}
        <div className="p-3 space-y-2 overflow-y-auto max-h-[60vh]">
          {deployOptionsConfig.map((option) => {
            const colors = colorClasses[option.color];
            const isSelected = currentTab === option.id;

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => onSelect(option.id)}
                className={`w-full flex items-start gap-4 p-4 rounded-xl border transition-all text-left ${
                  isSelected
                    ? `${colors.border} bg-${option.color === 'emerald' ? 'emerald-50' : option.color === 'blue' ? 'blue-50' : option.color === 'purple' ? 'purple-50' : 'indigo-50'} shadow-sm`
                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                <div className={`w-12 h-12 rounded-xl ${colors.bg} ${colors.text} flex items-center justify-center shrink-0`}>
                  {option.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">{option.label}</p>
                    {isSelected && (
                      <span className={`inline-flex items-center gap-1 text-xs font-medium ${colors.text}`}>
                        <HiOutlineCheckCircle className="w-3.5 h-3.5" />
                        Đang chọn
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{option.desc}</p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Deploy Tab Content ────────────────────────────────────────────────────────

export function DeployTabContent({
  deployTab, chatbot, form, zaloChannel, facebookChannel,
  zaloWebhookUrl, facebookWebhookUrl, facebookVerifyToken,
  setShowZaloConnectModal, setShowFacebookConnectModal,
  setShowChannelGuideModal, handleDisconnectChannel,
  copyWidgetCode, copyIframeCode, widgetCopied,
}) {
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';

  if (deployTab === 'script') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 min-w-0 w-full space-y-3">
        <p className="text-xs text-slate-500">
          Copy đoạn mã bên dưới và dán vào thẻ <code className="bg-slate-100 px-1 rounded">&#x3C;head&#x3E;</code> hoặc trước thẻ đóng <code className="bg-slate-100 px-1 rounded">&#x3C;/body&#x3E;</code> trên website.
        </p>
        <div className="relative">
          <pre className="bg-slate-900 text-green-400 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">
            {`<script>
  window.customChatbotConfig = {
    token: '${chatbot.widget_key || chatbot.id}',
    baseUrl: '${baseUrl}',
    primaryColor: '${form.primary_color}',
    backgroundColor: '${form.background_color}',
    textColor: '${form.text_color}',
    accentColor: '${form.accent_color}',
    position: '${form.position}',
    welcomeMessage: '${form.greeting_msg || 'Xin chào!'}'
  };
</script>
<script src="${baseUrl}/widget.js" defer></script>`}
          </pre>
          <button type="button" onClick={copyWidgetCode}
            className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
            {widgetCopied
              ? <><HiOutlineCheck className="w-3.5 h-3.5" /> Đã copy</>
              : <><HiOutlineCode className="w-3.5 h-3.5" /> Copy code</>
            }
          </button>
        </div>
      </div>
    );
  }

  if (deployTab === 'iframe') {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5 min-w-0 w-full space-y-3">
        <p className="text-xs text-slate-500">
          Sử dụng iFrame để nhúng giao diện chat vào một trang cố định trên website.
        </p>
        <div className="relative">
          <pre className="bg-slate-900 text-blue-400 p-4 rounded-xl text-xs font-mono overflow-x-auto leading-relaxed">
            {`<iframe
  src="${baseUrl}/chat/${chatbot.id}"
  width="100%" height="600"
  style="border:none;border-radius:12px;"
  allow="microphone;camera"
></iframe>`}
          </pre>
          <button type="button" onClick={copyIframeCode}
            className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
            <HiOutlineCode className="w-3.5 h-3.5" /> Copy code
          </button>
        </div>
      </div>
    );
  }

  if (deployTab === 'publicLink') {
    return <PublicLinkCard chatbot={chatbot} form={form} />;
  }

  if (deployTab === 'zalo') {
    return (
      <ZaloChannelCard
        channel={zaloChannel}
        onConnect={() => setShowZaloConnectModal(true)}
        onDisconnect={() => handleDisconnectChannel('zalo_oa')}
        onOpenGuide={() => setShowChannelGuideModal('zalo')}
        webhookUrl={zaloWebhookUrl}
        chatbotId={chatbot.id}
      />
    );
  }

  if (deployTab === 'facebook') {
    return (
      <FacebookChannelCard
        channel={facebookChannel}
        onConnect={() => setShowFacebookConnectModal(true)}
        onDisconnect={() => handleDisconnectChannel('facebook')}
        onOpenGuide={() => setShowChannelGuideModal('facebook')}
        webhookUrl={facebookWebhookUrl}
        verifyToken={facebookVerifyToken}
      />
    );
  }

  return null;
}

// ── Deploy Script Modal ────────────────────────────────────────────────────────

export function DeployScriptModal({ open, chatbot, form, onClose, onCopy, copied }) {
  if (!open) return null;

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const code = `<script>
  window.customChatbotConfig = {
    token: '${chatbot.widget_key || chatbot.id}',
    baseUrl: '${baseUrl}',
    primaryColor: '${form.primary_color}',
    backgroundColor: '${form.background_color}',
    textColor: '${form.text_color}',
    accentColor: '${form.accent_color}',
    position: '${form.position}',
    welcomeMessage: '${form.greeting_msg || 'Xin chào!'}'
  };
</script>
<script src="${baseUrl}/widget.js" defer></script>`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">Website Script</h3>
              <p className="text-xs text-slate-400">Mã nhúng JavaScript</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center">
            <HiOutlineX className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <p className="text-sm text-slate-600">
            Copy đoạn mã bên dưới và dán vào thẻ <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">&#x3C;head&#x3E;</code> hoặc trước thẻ đóng <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">&#x3C;/body&#x3E;</code> trên website của bạn.
          </p>
          <div className="relative rounded-xl overflow-hidden">
            <pre className="bg-slate-900 text-green-400 p-4 text-xs font-mono overflow-x-auto leading-relaxed max-h-80">
              {code}
            </pre>
            <button onClick={onCopy}
              className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
              {copied ? <><HiOutlineCheck className="w-3.5 h-3.5" /> Đã copy</> : <><HiOutlineCode className="w-3.5 h-3.5" /> Copy code</>}
            </button>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-medium text-amber-800">Lưu ý khi sử dụng:</p>
            <ul className="text-xs text-amber-700 space-y-1">
              <li>• Đảm bảo website của bạn hỗ trợ HTTPS</li>
              <li>• Script sẽ tự động tạo widget chat ở góc màn hình</li>
              <li>• Có thể tùy chỉnh màu sắc và vị trí trong cấu hình</li>
            </ul>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end shrink-0">
          <button onClick={onClose} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-colors">
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Deploy iFrame Modal ────────────────────────────────────────────────────────

export function DeployIframeModal({ open, chatbot, onClose, onCopy }) {
  if (!open) return null;

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const code = `<iframe
  src="${baseUrl}/chat/${chatbot.id}"
  width="100%" height="600"
  style="border:none;border-radius:12px;"
  allow="microphone;camera"
></iframe>`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">iFrame</h3>
              <p className="text-xs text-slate-400">Nhúng vào trang cố định</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center">
            <HiOutlineX className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          <p className="text-sm text-slate-600">
            Sử dụng iFrame để nhúng giao diện chat vào một trang cố định trên website của bạn.
          </p>
          <div className="relative rounded-xl overflow-hidden">
            <pre className="bg-slate-900 text-blue-400 p-4 text-xs font-mono overflow-x-auto leading-relaxed max-h-80">
              {code}
            </pre>
            <button onClick={onCopy}
              className="absolute top-3 right-3 flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white text-xs px-3 py-1.5 rounded-lg transition-colors">
              <HiOutlineCode className="w-3.5 h-3.5" /> Copy code
            </button>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2">
            <p className="text-xs font-medium text-amber-800">Lưu ý khi sử dụng:</p>
            <ul className="text-xs text-amber-700 space-y-1">
              <li>• iFrame phù hợp cho trang chat chuyên dụng</li>
              <li>• Có thể điều chỉnh chiều cao (height) theo nhu cầu</li>
              <li>• Đảm bảo website hỗ trợ HTTPS</li>
            </ul>
          </div>
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end shrink-0">
          <button onClick={onClose} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-colors">
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Deploy Public Link Modal ────────────────────────────────────────────────────

export function DeployPublicLinkModal({ open, chatbot, form, onClose }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center">
              <HiOutlineGlobeAlt className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">Link công khai</h3>
              <p className="text-xs text-slate-400">Link rút gọn & QR Code</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center">
            <HiOutlineX className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">
          <PublicLinkCard chatbot={chatbot} form={form} />
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end shrink-0">
          <button onClick={onClose} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-colors">
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Zalo Channel Modal ────────────────────────────────────────────────────────

export function ZaloChannelModal({ open, channel, form, onClose, onConnect, onDisconnect, onOpenGuide, webhookUrl }) {
  if (!open) return null;
  const isConnected = !!channel;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center text-xl font-bold">
              Z
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">Zalo Official Account</h3>
              <p className="text-xs text-slate-400">Kết nối chatbot với Zalo OA</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center">
            <HiOutlineX className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">
          <ZaloChannelCard
            channel={channel}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onOpenGuide={onOpenGuide}
            webhookUrl={webhookUrl}
          />
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end shrink-0">
          <button onClick={onClose} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-colors">
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Facebook Channel Modal ────────────────────────────────────────────────────

export function FacebookChannelModal({ open, channel, onClose, onConnect, onDisconnect, onOpenGuide, webhookUrl, verifyToken }) {
  if (!open) return null;
  const isConnected = !!channel;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-slate-800">Facebook Messenger</h3>
              <p className="text-xs text-slate-400">Kết nối chatbot với Facebook Page</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-slate-100 flex items-center justify-center">
            <HiOutlineX className="w-5 h-5 text-slate-400" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">
          <FacebookChannelCard
            channel={channel}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
            onOpenGuide={onOpenGuide}
            webhookUrl={webhookUrl}
            verifyToken={verifyToken}
          />
        </div>
        <div className="px-5 py-4 border-t border-slate-100 flex justify-end shrink-0">
          <button onClick={onClose} className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium rounded-xl transition-colors">
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
