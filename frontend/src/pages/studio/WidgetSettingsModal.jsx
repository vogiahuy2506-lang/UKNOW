import { useState, useEffect } from 'react';
import {
  HiOutlineX,
  HiOutlineSave,
  HiOutlineRefresh,
  HiOutlineChat,
  HiOutlineCode,
  HiOutlineLink,
  HiOutlineColorSwatch,
  HiOutlineCheck,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import chatbotApi from '../../features/chatbot/services/chatbotApi.service';
import ImageUrlInput from '../../features/chatbot/components/AvatarUploader';

const TABS = [
  { id: 'script', label: 'Chat Widget', icon: HiOutlineChat, desc: 'Widget nổi góc màn hình' },
  { id: 'iframe', label: 'iFrame', icon: HiOutlineCode, desc: 'Nhúng trang chat vào website' },
  { id: 'public_link', label: 'Public Link', icon: HiOutlineLink, desc: 'Trang chat công khai' },
];

const POSITIONS = [
  { key: 'bottom-right', label: 'Dưới phải' },
  { key: 'bottom-left', label: 'Dưới trái' },
  { key: 'top-right', label: 'Trên phải' },
  { key: 'top-left', label: 'Trên trái' },
];

const COLOR_PRESETS = [
  { name: 'Cam', primary: '#ee7518', accent: '#f19342', bg: '#ffffff', text: '#1f2937' },
  { name: 'Xanh dương', primary: '#2563eb', accent: '#60a5fa', bg: '#ffffff', text: '#1f2937' },
  { name: 'Tím', primary: '#7c3aed', accent: '#a78bfa', bg: '#ffffff', text: '#1f2937' },
  { name: 'Xanh lá', primary: '#16a34a', accent: '#4ade80', bg: '#ffffff', text: '#1f2937' },
  { name: 'Đen', primary: '#18181b', accent: '#52525b', bg: '#ffffff', text: '#1f2937' },
];

const IFRAME_THEMES = [
  { key: 'light', label: 'Sáng', primary: '#ee7518', accent: '#f19342', bg: '#ffffff', text: '#1f2937' },
  { key: 'dark', label: 'Tối', primary: '#ee7518', accent: '#f19342', bg: '#0f172a', text: '#e2e8f0' },
  { key: 'brand', label: 'Thương hiệu', primary: '#7c3aed', accent: '#a78bfa', bg: '#faf5ff', text: '#1f2937' },
];

const SIZES = [
  { key: 'small', label: 'Nhỏ', w: 320, h: 480 },
  { key: 'medium', label: 'Vừa', w: 380, h: 560 },
  { key: 'large', label: 'Lớn', w: 440, h: 640 },
];

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
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

function ColorRow({ label, value, onChange }) {
  return (
    <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-9 h-9 rounded-lg cursor-pointer border border-slate-200 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-xs font-mono text-slate-700 truncate">{value}</p>
      </div>
    </div>
  );
}

function PresetRow({ presets, currentValues, onApply }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {presets.map((p) => {
        const isActive = currentValues.primary?.toLowerCase() === p.primary.toLowerCase()
          && currentValues.accent?.toLowerCase() === p.accent.toLowerCase();
        return (
          <button
            key={p.name}
            type="button"
            onClick={() => onApply(p)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              isActive
                ? 'border-primary-500 bg-primary-50 text-primary-700'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-white'
            }`}
          >
            <span className="flex gap-0.5">
              <span className="w-3 h-3 rounded-full border border-white/60" style={{ background: p.primary }} />
              <span className="w-3 h-3 rounded-full border border-white/60" style={{ background: p.accent }} />
            </span>
            {p.name}
            {isActive && <HiOutlineCheck className="w-3 h-3" />}
          </button>
        );
      })}
    </div>
  );
}

export default function WidgetSettingsModal({ open, chatbot, embedKind, onClose, onUpdate }) {
  const [activeTab, setActiveTab] = useState(embedKind || 'script');
  const [saving, setSaving] = useState(false);

  // ── Shared widget config (saved to custom_chatbots columns) ────────────
  // All 3 embed types (script / iframe / public link) share the same logo,
  // colors, avatar toggle, border radius, and launcher label. Settings like
  // position, auto_open, and show_header are embed-specific and live here
  // so they can be persisted; settings that have no DB column (size, theme)
  // stay in their respective local states only (read-only preview helpers).
  const [cfg, setCfg] = useState({
    primary_color: '#ee7518',
    background_color: '#ffffff',
    text_color: '#1f2937',
    accent_color: '#f19342',
    position: 'bottom-right',
    logo_url: '',
    show_avatar: true,
    show_header: true,        // used by iframe & public_link
    welcome_message: '',
    auto_open: false,         // used by script
    launcher_label: 'Chat với chúng tôi', // used by script
    border_radius: 16,
    show_suggested: true,     // used by public_link
    require_name: false,      // used by public_link
  });

  // ── iFrame / public_link only fields (no DB column — read-only preview) ─
  const [embedSize, setEmbedSize] = useState('medium');
  const [embedTheme, setEmbedTheme] = useState('light');

  useEffect(() => {
    if (open && chatbot) {
      if (embedKind) setActiveTab(embedKind);
      // Logo: uu tien avatar_url (Setting chatbot - nguon chinh),
      // fallback logo_url (Widget cu). Hien tai 2 modal ghi vao 2 cot DB
      // khac nhau nen logo co the khong dong bo.
      const sharedLogo = chatbot.avatar_url || chatbot.logo_url || '';
      const ws = chatbot.widget_settings || {};
      setCfg({
        primary_color: ws.primary_color || chatbot.primary_color || '#ee7518',
        background_color: ws.background_color || chatbot.background_color || '#ffffff',
        text_color: ws.text_color || chatbot.text_color || '#1f2937',
        accent_color: ws.accent_color || chatbot.accent_color || '#f19342',
        position: ws.position || chatbot.position || 'bottom-right',
        logo_url: ws.logo_url || sharedLogo,
        show_avatar: ws.show_avatar !== false && chatbot.show_avatar !== false,
        show_header: ws.show_header !== false,
        welcome_message: ws.welcome_message || chatbot.welcome_message || '',
        auto_open: ws.auto_open === true,
        launcher_label: ws.launcher_label || 'Chat với chúng tôi',
        border_radius: ws.border_radius ?? chatbot.border_radius ?? 16,
        show_suggested: ws.show_suggested !== false,
        require_name: ws.require_name === true,
      });
      setEmbedSize(ws.size || 'medium');
      setEmbedTheme(ws.theme || 'light');
    }
  }, [open, chatbot, embedKind]);

  if (!open || !chatbot) return null;

  const update = (patch) => setCfg((p) => ({ ...p, ...patch }));
  const applyPreset = (p) => update({ primary_color: p.primary, accent_color: p.accent, background_color: p.bg, text_color: p.text });
  const applyTheme = (t) => { setEmbedTheme(t.key); update({ primary_color: t.primary, accent_color: t.accent, background_color: t.bg, text_color: t.text }); };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        primary_color: cfg.primary_color,
        background_color: cfg.background_color,
        text_color: cfg.text_color,
        accent_color: cfg.accent_color,
        position: cfg.position,
        logo_url: cfg.logo_url,
        // Dong bo logo vao avatar_url de Setting chatbot la nguon chinh.
        // Backend updateChatbot COALESCE avatar_url nen chi ghi khi co gia tri.
        // Nhu vay logo upload o Widget Settings cung se hien thi o ChatbotConfigModal.
        // Neu avatar_url da co gia tri va user khong doi logo, ta van gui de dam bao dong bo.
        avatar_url: cfg.logo_url || chatbot.avatar_url || null,
        show_avatar: cfg.show_avatar,
        show_header: cfg.show_header,
        welcome_message: cfg.welcome_message,
        launcher_label: cfg.launcher_label,
        border_radius: cfg.border_radius,
        auto_open: cfg.auto_open,
        chat_height: '600px',
        widget_key: chatbot.widget_key,
        // KHONG gui suggested_questions tu modal nay.
        // Truoc day gui [] -> DB bi xoa sach moi lan luu widget settings,
        // lam mat cau hoi goi y da thiet lap trong ChatbotConfigModal.
        // Persist size + theme even though the UI only uses them as preview hints
        // (avoids a second silent round-trip on next open)
        size: embedSize,
        theme: embedTheme,
        show_suggested: cfg.show_suggested,
        require_name: cfg.require_name,
        // Remove dead fields: iframe_settings and public_link_settings had no
        // DB column so backend silently dropped them. All UI now shares cfg.
      };
      const res = await chatbotApi.updateChatbot(chatbot.id, payload);
      if (res.success && res.data) {
        const updated = { ...chatbot, ...res.data };
        onUpdate?.(updated);
        toast.success('Đã lưu cấu hình widget');
        onClose?.();
      } else {
        throw new Error(res.message || 'Save failed');
      }
    } catch (err) {
      toast.error(err.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  };

  const gradientStyle = `linear-gradient(135deg, ${cfg.primary_color}, ${cfg.accent_color})`;
  const activeTabMeta = TABS.find((t) => t.id === activeTab);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-2 md:p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full h-full md:h-[90vh] md:w-[90vw] max-w-[1200px] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 shrink-0 bg-white">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0"
              style={{ background: gradientStyle }}
            >
              <HiOutlineColorSwatch className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base md:text-lg font-semibold text-slate-900 truncate">
                Giao diện Widget
              </h2>
              <p className="text-xs text-slate-500 truncate">
                Tuỳ chỉnh cho từng dạng nhúng — {chatbot.name}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Đóng"
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        {/* Body: 3-tab layout */}
        <div className="flex flex-1 min-h-0">
          {/* Left: tab list */}
          <nav className="w-60 lg:w-72 border-r border-slate-100 bg-slate-50/50 p-3 overflow-y-auto shrink-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 mb-2">
              Dạng nhúng
            </p>
            <div className="space-y-1">
              {TABS.map((t) => {
                const Icon = t.icon;
                const isActive = activeTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveTab(t.id)}
                    className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                      isActive
                        ? 'bg-white text-primary-700 shadow-sm border border-slate-200'
                        : 'text-slate-600 hover:bg-white border border-transparent'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-primary-100 text-primary-600' : 'bg-slate-100 text-slate-500'
                    }`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate">{t.label}</p>
                      <p className="text-[11px] text-slate-400 font-normal truncate">{t.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Live preview — uses cfg so all tabs show the same saved colors */}
            <div className="mt-5 px-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Preview
              </p>
              {activeTab === 'script' && (
                <ScriptPreview cfg={cfg} chatbot={chatbot} />
              )}
              {activeTab === 'iframe' && (
                <IframePreview cfg={{ ...cfg, size: embedSize }} chatbot={chatbot} />
              )}
              {activeTab === 'public_link' && (
                <PublicLinkPreview cfg={{ ...cfg, size: embedSize }} chatbot={chatbot} />
              )}
            </div>
          </nav>

          {/* Right: settings for active tab */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            <div className="p-6 md:p-8 space-y-5 max-w-2xl">
              <div className="flex items-center gap-2">
                <activeTabMeta.icon className="w-5 h-5 text-primary-600" />
                <h3 className="text-base font-semibold text-slate-900">{activeTabMeta.label}</h3>
              </div>

              {/* ── Common to all tabs: color palette + logo + border radius ── */}
              {/* Presets */}
              <section className="bg-white rounded-xl border border-slate-200 p-5">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Bảng màu nhanh</h4>
                <PresetRow
                  presets={COLOR_PRESETS}
                  currentValues={cfg}
                  onApply={applyPreset}
                />
              </section>

              {/* Color palette */}
              <section className="bg-white rounded-xl border border-slate-200 p-5">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Màu sắc</h4>
                <div className="grid grid-cols-2 gap-3">
                  <ColorRow label="Màu chính" value={cfg.primary_color} onChange={(v) => update({ primary_color: v })} />
                  <ColorRow label="Màu nhấn" value={cfg.accent_color} onChange={(v) => update({ accent_color: v })} />
                  <ColorRow label="Màu nền" value={cfg.background_color} onChange={(v) => update({ background_color: v })} />
                  <ColorRow label="Màu chữ" value={cfg.text_color} onChange={(v) => update({ text_color: v })} />
                </div>
              </section>

              {/* Logo URL — shared across all embed types */}
              <section className="bg-white rounded-xl border border-slate-200 p-5">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Logo widget</h4>
                <ImageUrlInput
                  value={cfg.logo_url}
                  onChange={(url) => update({ logo_url: url || '' })}
                  label=""
                  placeholder="https://example.com/logo.png"
                  help="Logo dùng chung cho cả 3 kiểu nhúng (script / iframe / public link)."
                />
              </section>

              {/* Border radius */}
              <section className="bg-white rounded-xl border border-slate-200 p-5">
                <h4 className="text-sm font-semibold text-slate-900 mb-3">Bo góc</h4>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={0}
                    max={24}
                    value={cfg.border_radius}
                    onChange={(e) => update({ border_radius: Number(e.target.value) })}
                    className="flex-1"
                  />
                  <span className="text-sm font-mono text-slate-700 w-12 text-right">{cfg.border_radius}px</span>
                </div>
              </section>

              {/* ── Script-only settings ── */}
              {activeTab === 'script' && (
                <>
                  {/* Position */}
                  <section className="bg-white rounded-xl border border-slate-200 p-5">
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Vị trí hiển thị</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {POSITIONS.map((pos) => (
                        <button
                          key={pos.key}
                          type="button"
                          onClick={() => update({ position: pos.key })}
                          className={`py-2 text-xs font-medium rounded-lg border transition-colors ${
                            cfg.position === pos.key
                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {pos.label}
                        </button>
                      ))}
                    </div>
                  </section>

                  {/* Launcher label - DEPRECATED FIELD.
                      widget.js chi hien thi SVG icon (xem widget.js dong 122),
                      khong render launcher_label. Field nay khong co cot DB
                      tuong ung va khong noi render nao su dung -> an di de
                      tranh nham lan cho admin. Neu sau nay muon text label
                      thi can vua sua widget.js vua them cot DB. */}
                  {false && (
                  <section className="bg-white rounded-xl border border-slate-200 p-5">
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Nhãn nút mở chat</h4>
                    <input
                      type="text"
                      value={cfg.launcher_label}
                      onChange={(e) => update({ launcher_label: e.target.value })}
                      placeholder="Chat với chúng tôi"
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10"
                    />
                  </section>
                  )}

                  {/* Script toggles */}
                  <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700">Hiển thị Avatar</p>
                        <p className="text-xs text-slate-400">Avatar hiển thị cạnh tin nhắn bot</p>
                      </div>
                      <Toggle checked={cfg.show_avatar} onChange={(v) => update({ show_avatar: v })} />
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <div>
                        <p className="text-sm font-medium text-slate-700">Tự động mở chat</p>
                        <p className="text-xs text-slate-400">Mở widget sau 2s khi tải trang</p>
                      </div>
                      <Toggle checked={cfg.auto_open} onChange={(v) => update({ auto_open: v })} />
                    </div>
                  </section>
                </>
              )}

              {/* ── iFrame + public_link settings ── */}
              {(activeTab === 'iframe' || activeTab === 'public_link') && (
                <>
                  {/* Theme presets (iFrame + public_link only) */}
                  <section className="bg-white rounded-xl border border-slate-200 p-5">
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Theme</h4>
                    <div className="flex flex-wrap gap-2">
                      {IFRAME_THEMES.map((t) => {
                        const isActive = embedTheme === t.key;
                        return (
                          <button
                            key={t.key}
                            type="button"
                            onClick={() => applyTheme(t)}
                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-xs font-medium transition-all ${
                              isActive
                                ? 'border-primary-500 bg-primary-50 text-primary-700'
                                : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-white'
                            }`}
                          >
                            <span className="flex gap-0.5">
                              <span className="w-3 h-3 rounded-full border border-white/60" style={{ background: t.primary }} />
                              <span className="w-3 h-3 rounded-full border border-white/60" style={{ background: t.bg, borderColor: 'rgba(0,0,0,0.1)' }} />
                            </span>
                            {t.label}
                          </button>
                        );
                      })}
                    </div>
                  </section>

                  {/* Size */}
                  <section className="bg-white rounded-xl border border-slate-200 p-5">
                    <h4 className="text-sm font-semibold text-slate-900 mb-3">Kích thước</h4>
                    <div className="grid grid-cols-3 gap-2">
                      {SIZES.map((s) => (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => setEmbedSize(s.key)}
                          className={`py-2 text-xs font-medium rounded-lg border transition-colors ${
                            embedSize === s.key
                              ? 'border-primary-500 bg-primary-50 text-primary-700'
                              : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          {s.label}
                          <p className="text-[10px] text-slate-400 mt-0.5">{s.w}×{s.h}</p>
                        </button>
                      ))}
                    </div>
                  </section>

                  {/* Toggles */}
                  <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-700">Hiển thị header</p>
                        <p className="text-xs text-slate-400">Tiêu đề + nút đóng</p>
                      </div>
                      <Toggle checked={cfg.show_header} onChange={(v) => update({ show_header: v })} />
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <div>
                        <p className="text-sm font-medium text-slate-700">Hiển thị Avatar</p>
                        <p className="text-xs text-slate-400">Avatar bên cạnh tin nhắn bot</p>
                      </div>
                      <Toggle checked={cfg.show_avatar} onChange={(v) => update({ show_avatar: v })} />
                    </div>
                    {activeTab === 'public_link' && (
                      <>
                        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                          <div>
                            <p className="text-sm font-medium text-slate-700">Câu hỏi gợi ý</p>
                            <p className="text-xs text-slate-400">Hiện các câu hỏi mẫu khi mở</p>
                          </div>
                          <Toggle checked={cfg.show_suggested} onChange={(v) => update({ show_suggested: v })} />
                        </div>
                        <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                          <div>
                            <p className="text-sm font-medium text-slate-700">Yêu cầu nhập tên</p>
                            <p className="text-xs text-slate-400">Hỏi tên trước khi chat</p>
                          </div>
                          <Toggle checked={cfg.require_name} onChange={(v) => update({ require_name: v })} />
                        </div>
                      </>
                    )}
                  </section>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-t border-slate-200 bg-slate-50 shrink-0">
          <p className="text-xs text-slate-500 hidden md:block">
            Tuỳ chỉnh áp dụng riêng cho dạng <strong>{activeTabMeta.label}</strong>
          </p>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <HiOutlineRefresh className="w-4 h-4 animate-spin" />
                  Đang lưu...
                </>
              ) : (
                <>
                  <HiOutlineSave className="w-4 h-4" />
                  Lưu cấu hình
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Live preview components ─────────────────────────────────────────── */

function ScriptPreview({ cfg, chatbot }) {
  const pos = cfg.position || 'bottom-right';
  const isRight = pos.includes('right');
  const isBottom = pos.includes('bottom');
  const avatarSrc = cfg.logo_url || chatbot?.avatar_url;

  return (
    <div className="relative h-44 bg-slate-100 rounded-lg overflow-hidden border border-slate-200">
      <div className="absolute inset-0 p-2">
        <div className="w-full h-full bg-white rounded-md border border-slate-100" />
      </div>
      <div
        className="absolute w-10 h-10 rounded-full shadow-lg overflow-hidden flex items-center justify-center text-white"
        style={{
          background: avatarSrc ? 'transparent' : `linear-gradient(135deg, ${cfg.primary_color}, ${cfg.accent_color})`,
          [isBottom ? 'bottom' : 'top']: 12,
          [isRight ? 'right' : 'left']: 12,
        }}
      >
        {avatarSrc ? (
          <img src={avatarSrc} alt="" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.parentElement.style.background = `linear-gradient(135deg, ${cfg.primary_color}, ${cfg.accent_color})`; }} />
        ) : (
          <HiOutlineChat className="w-5 h-5" />
        )}
      </div>
      <div
        className="absolute w-44 rounded-xl shadow-xl border border-slate-200 overflow-hidden"
        style={{
          background: cfg.background_color,
          color: cfg.text_color,
          [isBottom ? 'bottom' : 'top']: 56,
          [isRight ? 'right' : 'left']: 12,
          borderRadius: cfg.border_radius,
        }}
      >
        <div
          className="px-2 py-1.5 text-[10px] font-semibold text-white"
          style={{ background: cfg.primary_color }}
        >
          {cfg.launcher_label || 'Chat với chúng tôi'}
        </div>
        <div className="p-2 text-[10px]">Xin chào!</div>
      </div>
    </div>
  );
}

function IframePreview({ cfg, chatbot }) {
  const sizeMap = { small: { w: 200, h: 130 }, medium: { w: 240, h: 160 }, large: { w: 280, h: 190 } };
  const sz = sizeMap[cfg.size] || sizeMap.medium;

  // Determine avatar: logo_url > chatbot.avatar_url > placeholder
  const avatarSrc = cfg.logo_url || chatbot.avatar_url;

  return (
    <div className="bg-slate-100 rounded-lg p-3 border border-slate-200">
      <div
        className="mx-auto overflow-hidden border border-slate-200"
        style={{ width: sz.w, height: sz.h, background: cfg.background_color, color: cfg.text_color, borderRadius: cfg.border_radius }}
      >
        {cfg.show_header && (
          <div
            className="px-2 py-1.5 text-[10px] font-semibold text-white flex items-center gap-1"
            style={{ background: cfg.primary_color }}
          >
            {avatarSrc ? (
              <img src={avatarSrc} alt="" className="w-3 h-3 rounded-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            ) : (
              <span className="w-3 h-3 rounded-full bg-white/30" />
            )}
            {chatbot.name}
          </div>
        )}
        <div className="p-2 text-[10px] space-y-1">
          <div className="flex items-start gap-1">
            {cfg.show_avatar && (
              avatarSrc ? (
                <img src={avatarSrc} alt="" className="w-3 h-3 rounded-full object-cover shrink-0" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
              ) : (
                <span className="w-3 h-3 rounded-full bg-slate-200 shrink-0" />
              )
            )}
            <div className="px-2 py-1 rounded-md bg-slate-100 text-[9px]">Xin chào!</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function PublicLinkPreview({ cfg, chatbot }) {
  return <IframePreview cfg={cfg} chatbot={chatbot} />;
}