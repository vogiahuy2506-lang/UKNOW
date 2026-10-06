import { useState } from 'react';
import {
  HiOutlineCode,
  HiOutlineLink,
  HiOutlineClipboardCopy,
  HiOutlineChat,
  HiOutlineX,
  HiOutlineColorSwatch,
  HiOutlineExternalLink,
  HiOutlineCheckCircle,
  HiOutlineDuplicate,
  HiOutlineShoppingBag,
  HiOutlineChevronRight,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import { ChannelModal } from './ChannelModals';
import ShareChatbotModal from '../../components/marketplace/ShareChatbotModal';
import MarketplaceListingModal from '../../components/marketplace/MarketplaceListingModal';
import { useChannelEntitlements } from '../../hooks/queries/useChannelEntitlements';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../i18n';

// Tên 3 cách đưa chatbot lên website (04/10/2026, S-04/phần b): dùng chữ thường ngày thay cho thuật ngữ kỹ thuật.
const EMBED_OPTIONS = [
  {
    id: 'script',
    titleKey: 'chatbot.studio.embedScriptTitle',
    tooltipKey: 'chatbot.studio.embedScriptTip',
    icon: HiOutlineChat,
    iconClass: 'bg-emerald-50 text-emerald-600',
  },
  {
    id: 'iframe',
    titleKey: 'chatbot.studio.embedIframeTitle',
    tooltipKey: 'chatbot.studio.embedIframeTip',
    icon: HiOutlineCode,
    iconClass: 'bg-blue-50 text-blue-600',
  },
  {
    id: 'public_link',
    titleKey: 'chatbot.studio.embedLinkTitle',
    tooltipKey: 'chatbot.studio.embedLinkTip',
    icon: HiOutlineLink,
    iconClass: 'bg-primary-50 text-primary-600',
  },
];

// Kênh nhắn tin còn dùng được trong Studio. Facebook Messenger được khôi phục 05/10/2026 (trước đó gỡ 21/09/2026
// vì chưa có FACEBOOK_APP_ID/SECRET nên nút OAuth luôn báo lỗi); Zalo OA vẫn gỡ vì chưa từng có một lần nối nào.
// `countField` đọc số tài khoản đang bật từ API danh sách chatbot.
const CHANNEL_TILES = [
  {
    key: 'facebook',
    title: 'Facebook',
    tooltip: 'Facebook Messenger — Bật chatbot trả lời tin nhắn trên Fanpage',
    icon: 'f',
    iconClass: 'bg-blue-50 text-blue-600',
    countField: 'facebook_count',
  },
  {
    key: 'zalo_personal',
    title: 'Zalo cá nhân',
    tooltip: 'Zalo cá nhân — Bật chatbot cho từng tài khoản',
    icon: 'Z',
    iconClass: 'bg-orange-50 text-orange-600',
    countField: 'zalo_personal_count',
  },
  {
    key: 'whatsapp',
    title: 'WhatsApp',
    tooltip: 'WhatsApp Business — Gán AI reply cho từng tài khoản',
    icon: 'W',
    iconClass: 'bg-emerald-50 text-emerald-600',
    countField: 'whatsapp_count',
  },
  {
    key: 'telegram_personal',
    title: 'Telegram',
    tooltip: 'Telegram cá nhân — Quét QR để liên kết, bật chatbot cho từng tài khoản',
    icon: 'T',
    iconClass: 'bg-sky-50 text-sky-600',
    countField: 'telegram_count',
  },
];

function SquareTile({ onClick, iconBg, children, tooltip, label, sublabel, sublabelOn = false, disabled = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={tooltip}
      disabled={disabled}
      className={`group relative w-full min-h-[78px] bg-white rounded-xl border border-slate-200 transition-all flex flex-col items-center justify-center gap-1 px-1.5 py-2 ${
        disabled ? 'opacity-70 cursor-default' : 'hover:border-primary-300 hover:bg-primary-50/30'
      }`}
    >
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-bold transition-transform ${disabled ? '' : 'group-hover:scale-110'} ${iconBg}`}>
        {children}
      </div>
      <span className="text-[11px] font-medium text-slate-600 group-hover:text-primary-700 text-center leading-tight px-1 truncate w-full">
        {label}
      </span>
      {sublabel && (
        <span className={`text-[10px] leading-tight text-center truncate w-full px-1 ${sublabelOn ? 'text-emerald-600' : 'text-slate-400'}`}>
          {sublabel}
        </span>
      )}
    </button>
  );
}

export default function DeployTab({
  chatbot,
  onOpenWidgetSettings,
  onUpdate,
}) {
  const { t } = useI18n();
  // P9 — gói không có Telegram/WhatsApp (trần 0) thì ẩn ô kênh đó (không còn tài khoản nào dùng được để gán chatbot).
  const entitlements = useChannelEntitlements();
  const [embedModal, setEmbedModal] = useState(null); // 'script' | 'iframe' | 'public_link' | null
  const [channelModal, setChannelModal] = useState(null); // 'zalo_personal' | 'whatsapp' | 'telegram_personal' | null
  const [shareModal, setShareModal] = useState(false);
  const [marketplaceModal, setMarketplaceModal] = useState(false);

  // Nhân viên chỉ thấy phần mình đủ quyền dùng (S-15): Kênh cần `chatbot_channels_manage`, Marketplace cần
  // `marketplace_manage`, "Gửi bản sao" chỉ chủ tài khoản (route requireSelfContext).
  // Trước đây các ô vẫn hiện rồi báo lỗi chung chung khi bấm.
  const activeContext = useAuthStore((state) => state.activeContext);
  const isEmployee = activeContext?.type === 'employee';
  const hasPermission = (key) => !isEmployee || activeContext?.permissions?.[key] === true;
  const canManageChannels = hasPermission('chatbot_channels_manage');
  const canSendCopy = !isEmployee;
  const canSell = hasPermission('marketplace_manage');

  // Sau khi đóng hộp kênh / đăng bán: lấy lại số tài khoản đang bật + trạng thái listing để chữ dưới ô và dòng
  // "Đang chạy: …" ở đầu khung chat đúng ngay, không phải F5. Lỗi thì giữ nguyên số cũ.
  const refreshBot = async () => {
    if (!onUpdate || !chatbot?.id) return;
    try {
      const res = await chatbotApi.listChatbots();
      const fresh = (Array.isArray(res?.data) ? res.data : []).find((b) => String(b.id) === String(chatbot.id));
      if (fresh) onUpdate({ ...chatbot, ...fresh });
    } catch {
      // giữ nguyên
    }
  };

  if (!chatbot) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        Chọn chatbot để xem triển khai
      </div>
    );
  }

  const listingStatus = chatbot.marketplace_listing_status || null;
  const channelTiles = CHANNEL_TILES.filter((tile) => (
    !(tile.key === 'whatsapp' && !entitlements.whatsapp)
    && !(tile.key === 'telegram_personal' && !entitlements.telegram)
    && !(tile.key === 'zalo_personal' && !entitlements.zalo)
  ));

  return (
    <div className="flex flex-col h-full">
      {/* Header: MỘT tiêu đề (bản cũ lặp chữ "Triển khai" hai lần + một biểu tượng bảng màu không nhãn — S-09) */}
      <div className="px-5 pt-5 pb-3 shrink-0">
        <h3 className="text-sm font-semibold text-slate-900">{t('chatbot.studio.deployTitle')}</h3>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-5">
        {/* Trên website */}
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1 mb-2">
            {t('chatbot.studio.deployWebTitle')}
          </p>
          <div className="grid grid-cols-3 gap-2">
            {EMBED_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <SquareTile
                  key={opt.id}
                  onClick={() => setEmbedModal(opt.id)}
                  iconBg={opt.iconClass}
                  tooltip={t(opt.tooltipKey)}
                  label={t(opt.titleKey)}
                >
                  <Icon className="w-5 h-5" />
                </SquareTile>
              );
            })}
          </div>
          {/* Đổi màu/vị trí/lời mời: một dòng CÓ CHỮ ngay dưới 3 ô (trước là biểu tượng bảng màu chỉ hiện chữ khi rê chuột) */}
          <button
            type="button"
            onClick={() => onOpenWidgetSettings?.()}
            className="mt-2 w-full inline-flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-medium text-primary-700 bg-primary-50/60 hover:bg-primary-50 transition-colors"
          >
            <span className="inline-flex items-center gap-2">
              <HiOutlineColorSwatch className="w-4 h-4 shrink-0" />
              {t('chatbot.studio.deployAppearanceLink')}
            </span>
            <HiOutlineChevronRight className="w-3.5 h-3.5 shrink-0" />
          </button>
        </div>

        {/* Trên ứng dụng nhắn tin */}
        {canManageChannels && channelTiles.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1 mb-2">
              {t('chatbot.studio.deployMessengerTitle')}
            </p>
            {/* 4 ô kênh (Facebook + Zalo cá nhân + WhatsApp + Telegram) nên xuống 2 cột: 3 cột sẽ đẩy ô
                thứ 4 xuống hàng lẻ. */}
            <div className="grid grid-cols-2 gap-2">
              {channelTiles.map((tile) => {
                const count = Number(chatbot[tile.countField]) || 0;
                return (
                  <SquareTile
                    key={tile.key}
                    onClick={() => setChannelModal(tile.key)}
                    iconBg={tile.iconClass}
                    tooltip={tile.tooltip}
                    label={tile.title}
                    sublabel={count > 0 ? t('chatbot.studio.tileOn', { count }) : t('chatbot.studio.tileOff')}
                    sublabelOn={count > 0}
                  >
                    <span className="text-base">{tile.icon}</span>
                  </SquareTile>
                );
              })}
            </div>
          </div>
        )}

        {/* Sao chép & bán */}
        {(canSendCopy || canSell) && (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 px-1 mb-2">
              {t('chatbot.studio.deployCopySellTitle')}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {canSendCopy && (
                <SquareTile
                  onClick={() => setShareModal(true)}
                  iconBg="bg-orange-50 text-orange-600"
                  tooltip={t('chatbot.studio.shareCopyTip')}
                  label={t('chatbot.studio.shareCopyTitle')}
                >
                  <HiOutlineDuplicate className="w-5 h-5" />
                </SquareTile>
              )}
              {canSell && (
                <SquareTile
                  onClick={() => setMarketplaceModal(true)}
                  iconBg="bg-violet-50 text-violet-600"
                  tooltip={listingStatus ? t('chatbot.studio.marketplaceListedTip') : t('chatbot.studio.marketplaceSellTip')}
                  label={listingStatus
                    ? t(listingStatus === 'published' ? 'chatbot.studio.marketplaceSoldTitle' : 'chatbot.studio.marketplaceListedTitle')
                    : t('chatbot.studio.marketplaceSellTitle')}
                  disabled={Boolean(listingStatus)}
                >
                  <HiOutlineShoppingBag className="w-5 h-5" />
                </SquareTile>
              )}
            </div>
          </div>
        )}
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
          onClose={() => {
            setChannelModal(null);
            refreshBot();
          }}
        />
      )}

      {/* Gửi bản sao */}
      {shareModal && (
        <ShareChatbotModal
          open={shareModal}
          chatbot={chatbot}
          onClose={() => setShareModal(false)}
          onSuccess={() => setShareModal(false)}
        />
      )}

      {/* Đăng bán trên Marketplace */}
      {marketplaceModal && (
        <MarketplaceListingModal
          open={marketplaceModal}
          chatbot={chatbot}
          onClose={() => setMarketplaceModal(false)}
          onSuccess={() => {
            setMarketplaceModal(false);
            refreshBot();
          }}
        />
      )}
    </div>
  );
}

/* ─── Modal riêng cho từng dạng nhúng ───────────────────────────────────── */

// Chiều cao mã nhúng iFrame theo embed_size (Giao diện Widget). Khớp SIZES trong WidgetSettingsModal.
const EMBED_HEIGHTS = { small: 480, medium: 600, large: 760 };

function EmbedModal({ kind, chatbot, onClose, onOpenWidgetSettings }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const widgetKey = chatbot.widget_key || chatbot.id;
  // Link công khai và iFrame cùng dùng origin hiện tại + widget_key (S-24). Bản cũ: link ghi cứng https://founderai.biz, iFrame
  // dùng id số tuần tự (/chat/<id>, dễ dò). Mọi bot đều có widget_key (bản sao được sinh key từ S-03).
  const publicUrl = `${baseUrl}/chat/${widgetKey}`;

  const scriptCode = `<script>
  window.customChatbotConfig = {
    token: '${widgetKey}',
    baseUrl: '${baseUrl}'
  };
</script>
<script src="${baseUrl}/widget.js" defer></script>`;

  const iframeHeight = EMBED_HEIGHTS[chatbot.embed_size] || EMBED_HEIGHTS.medium;
  const iframeCode = `<iframe
  src="${publicUrl}"
  width="100%"
  height="${iframeHeight}"
  style="border:none;border-radius:12px;"
  title="${chatbot.name}"
></iframe>`;

  const titles = {
    script: t('chatbot.studio.embedScriptModalTitle'),
    iframe: t('chatbot.studio.embedIframeModalTitle'),
    public_link: t('chatbot.studio.embedLinkModalTitle'),
  };
  const descs = {
    script: 'Dán đoạn script dưới đây vào trước thẻ đóng </body> của website.',
    iframe: 'Dán đoạn iframe vào bất kỳ vị trí nào trong trang để hiển thị khung chat.',
    public_link: 'Mở hoặc chia sẻ liên kết công khai tới trang chat của chatbot.',
  };

  const codeMap = { script: scriptCode, iframe: iframeCode };
  const code = codeMap[kind];

  // Chờ clipboard thật sự ghi xong: trình duyệt chặn (http, iframe, quyền) thì báo lỗi chứ không nói "Đã copy" (S-23).
  const handleCopy = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      toast.error(t('chatbot.studio.copyFailed'));
      return;
    }
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
                  Bạn có thể tuỳ chỉnh giao diện nhúng của chatbot.
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
