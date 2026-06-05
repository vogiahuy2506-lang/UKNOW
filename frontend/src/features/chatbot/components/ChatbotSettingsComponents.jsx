import { useState } from 'react';
import {
  HiOutlineBookOpen,
  HiOutlineCheckCircle,
  HiOutlineChevronDown,
  HiOutlineChevronRight,
  HiOutlineClipboardCopy,
  HiOutlineExternalLink,
  HiOutlineLink,
  HiOutlinePlay,
  HiOutlinePlus,
  HiOutlineRefresh,
  HiOutlineTrash,
  HiOutlineX,
  HiOutlineXCircle,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
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
