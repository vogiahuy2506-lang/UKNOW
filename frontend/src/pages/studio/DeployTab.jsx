import { useState, useEffect } from 'react';
import {
  HiOutlineCode,
  HiOutlineLink,
  HiOutlineClipboardCopy,
  HiOutlineChat,
  HiOutlineX,
  HiOutlineColorSwatch,
  HiOutlineExternalLink,
  HiOutlineCheckCircle,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import { ChannelModal } from './ChannelModals';

const EMBED_OPTIONS = [
  {
    id: 'script',
    title: 'Chat Widget',
    tooltip: 'Widget chat nổi',
    icon: HiOutlineChat,
    iconClass: 'bg-emerald-50 text-emerald-600',
  },
  {
    id: 'iframe',
    title: 'iFrame',
    tooltip: 'Nhúng khung chat',
    icon: HiOutlineCode,
    iconClass: 'bg-blue-50 text-blue-600',
  },
  {
    id: 'public_link',
    title: 'Public Link',
    tooltip: 'Trang chat công khai',
    icon: HiOutlineLink,
    iconClass: 'bg-primary-50 text-primary-600',
  },
];

const CHANNEL_TILES = [
  {
    key: 'zalo',
    title: 'Zalo OA',
    tooltip: 'Zalo OA — Tự động hồi đáp',
    icon: 'Z',
    iconClass: 'bg-blue-50 text-blue-600',
  },
  {
    key: 'facebook',
    title: 'Facebook',
    tooltip: 'Facebook Messenger — Trả lời Fanpage',
    icon: 'f',
    iconClass: 'bg-indigo-50 text-indigo-600',
  },
  {
    key: 'zalo_personal',
    title: 'Zalo cá nhân',
    tooltip: 'Zalo cá nhân — Bật chatbot cho từng tài khoản',
    icon: 'Z',
    iconClass: 'bg-orange-50 text-orange-600',
  },
];

function SquareTile({ onClick, iconBg, children, badge, tooltip, connected, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      className="group relative w-full min-h-[78px] bg-white rounded-xl border border-slate-200 hover:border-primary-300 hover:bg-primary-50/30 transition-all flex flex-col items-center justify-center gap-1.5 px-1.5 py-2"
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold transition-transform group-hover:scale-110 ${iconBg}`}>
        {children}
      </div>
      <span className="text-[11px] font-medium text-slate-600 group-hover:text-primary-700 text-center leading-tight px-1 truncate w-full">
        {label}
      </span>
      {/* Status dot */}
      {badge && (
        <span className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-white ${badge}`} />
      )}
      {connected === false && (
        <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-500 ring-2 ring-white" />
      )}
    </button>
  );
}

export default function DeployTab({
  chatbot,
  onOpenWidgetSettings,
}) {
  const [channels, setChannels] = useState([]);
  const [embedModal, setEmbedModal] = useState(null); // 'script' | 'iframe' | 'public_link' | null
  const [channelModal, setChannelModal] = useState(null); // 'zalo' | 'facebook' | 'zalo_personal' | null

  useEffect(() => {
    if (chatbot?.id) loadChannels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatbot?.id]);

  const loadChannels = async () => {
    if (!chatbot?.id) return;
    try {
      const res = await chatbotApi.getChatbotChannels(chatbot.id);
      const list = res?.data || res || [];
      setChannels(Array.isArray(list) ? list : []);
    } catch {
      setChannels(chatbot.channels || []);
    }
  };

  if (!chatbot) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Chọn chatbot để xem triển khai
      </div>
    );
  }

  const zaloChannel = channels.find(c => c.channel_type === 'zalo');
  const facebookChannel = channels.find(c => c.channel_type === 'facebook');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 pb-3 shrink-0 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Triển khai</h3>
        <button
          type="button"
          onClick={() => onOpenWidgetSettings?.()}
          className="w-8 h-8 rounded-lg flex items-center justify-center text-primary-600 hover:bg-primary-50 transition-colors"
          title="Tuỳ chỉnh giao diện widget"
        >
          <HiOutlineColorSwatch className="w-4 h-4" />
        </button>
      </div>

      {/* Content - 6 ô vuông, 2 nhóm */}
      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-5">
        {/* Nhúng lên website */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1 mb-2">
            Nhúng lên website
          </p>
          <div className="grid grid-cols-3 gap-2">
            {EMBED_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <SquareTile
                  key={opt.id}
                  onClick={() => setEmbedModal(opt.id)}
                  iconBg={opt.iconClass}
                  tooltip={opt.tooltip}
                  label={opt.title}
                >
                  <Icon className="w-5 h-5" />
                </SquareTile>
              );
            })}
          </div>
        </div>

        {/* Kênh hội thoại */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1 mb-2">
            Kênh hội thoại
          </p>
          <div className="grid grid-cols-3 gap-2">
            {CHANNEL_TILES.map((tile) => {
              const isConnected = tile.key === 'zalo'
                ? !!zaloChannel
                : tile.key === 'facebook'
                ? !!facebookChannel
                : null;
              return (
                <SquareTile
                  key={tile.key}
                  onClick={() => setChannelModal(tile.key)}
                  iconBg={tile.iconClass}
                  tooltip={tile.tooltip}
                  label={tile.title}
                  connected={tile.key === 'zalo_personal' ? null : isConnected}
                >
                  <span className="text-base">{tile.icon}</span>
                </SquareTile>
              );
            })}
          </div>
        </div>
      </div>

      {/* Embed modal */}
      {embedModal && (
        <EmbedModal
          kind={embedModal}
          chatbot={chatbot}
          onClose={() => setEmbedModal(null)}
          onOpenWidgetSettings={() => {
            const k = embedModal;
            setEmbedModal(null);
            onOpenWidgetSettings?.(k);
          }}
        />
      )}

      {/* Channel modal */}
      {channelModal && (
        <ChannelModal
          key={channelModal + ':' + (chatbot?.id || '')}
          open
          channel={channelModal}
          chatbot={chatbot}
          onClose={() => setChannelModal(null)}
        />
      )}
    </div>
  );
}

/* ─── Modal riêng cho từng dạng nhúng ───────────────────────────────────── */

function EmbedModal({ kind, chatbot, onClose, onOpenWidgetSettings }) {
  const [copied, setCopied] = useState(false);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const widgetKey = chatbot.widget_key || chatbot.id;
  const publicUrl = `https://founderai.biz/chat/${widgetKey}`;

  const scriptCode = `<script>
  window.customChatbotConfig = {
    token: '${widgetKey}',
    baseUrl: '${baseUrl}'
  };
</script>
<script src="${baseUrl}/widget.js" defer></script>`;

  const iframeCode = `<iframe
  src="${baseUrl}/chat/${chatbot.id}"
  width="100%"
  height="600"
  style="border:none;border-radius:12px;"
  title="${chatbot.name}"
></iframe>`;

  const titles = {
    script: 'Chat Widget — Script nhúng',
    iframe: 'iFrame — Nhúng khung chat',
    public_link: 'Public Link — Trang chat công khai',
  };
  const descs = {
    script: 'Dán đoạn script dưới đây vào trước thẻ đóng </body> của website.',
    iframe: 'Dán đoạn iframe vào bất kỳ vị trí nào trong trang để hiển thị khung chat.',
    public_link: 'Mở hoặc chia sẻ liên kết công khai tới trang chat của chatbot.',
  };

  const codeMap = { script: scriptCode, iframe: iframeCode };
  const code = codeMap[kind];

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast.success('Đã copy');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpen = () => {
    if (kind === 'public_link') {
      window.open(publicUrl, '_blank', 'noopener');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 truncate">{titles[kind]}</h3>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{chatbot.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100"
          >
            <HiOutlineX className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-5 space-y-4">
          <p className="text-xs text-slate-600">{descs[kind]}</p>

          {kind === 'public_link' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <HiOutlineLink className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  readOnly
                  value={publicUrl}
                  className="flex-1 bg-transparent text-sm text-slate-700 outline-none font-mono"
                />
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleCopy(publicUrl)}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {copied ? <HiOutlineCheckCircle className="w-4 h-4" /> : <HiOutlineClipboardCopy className="w-4 h-4" />}
                  {copied ? 'Đã copy' : 'Copy URL'}
                </button>
                <button
                  type="button"
                  onClick={handleOpen}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-700 hover:bg-slate-50 text-sm font-semibold rounded-lg transition-colors"
                >
                  <HiOutlineExternalLink className="w-4 h-4" />
                  Mở liên kết
                </button>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs font-medium text-slate-700 block mb-1.5">
                {kind === 'script' ? 'Mã script' : 'Mã iFrame'}
              </label>
              <pre className="bg-slate-900 text-slate-100 rounded-lg p-3 text-[11px] font-mono leading-relaxed overflow-x-auto max-h-48">
                {code}
              </pre>
              <button
                type="button"
                onClick={() => handleCopy(code)}
                className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-primary-500 hover:bg-primary-600 text-white text-sm font-semibold rounded-lg transition-colors"
              >
                {copied ? <HiOutlineCheckCircle className="w-4 h-4" /> : <HiOutlineClipboardCopy className="w-4 h-4" />}
                {copied ? 'Đã copy' : 'Copy mã'}
              </button>
            </div>
          )}

          {/* Widget custom hint */}
          {(kind === 'script' || kind === 'iframe' || kind === 'public_link') && (
            <div className="flex items-start gap-3 px-3 py-2.5 bg-primary-50/50 rounded-lg border border-primary-100">
              <HiOutlineColorSwatch className="w-4 h-4 text-primary-600 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-700">
                  Bạn có thể tuỳ chỉnh giao diện riêng cho dạng nhúng này.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenWidgetSettings}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-primary-200 text-primary-700 text-xs font-medium hover:bg-primary-100 transition-colors shrink-0"
              >
                Tuỳ chỉnh
              </button>
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}