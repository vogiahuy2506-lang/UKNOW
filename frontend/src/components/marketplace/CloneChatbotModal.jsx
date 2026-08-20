import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineX,
  HiOutlineCheckCircle,
  HiOutlineShare,
  HiOutlineMail,
  HiOutlineEye,
  HiOutlinePencilAlt,
  HiOutlineDuplicate,
  HiOutlineSparkles,
  HiOutlineClock,
} from 'react-icons/hi';
import chatbotApi from '../../services/chatbotApi';
import { useI18n } from '../../i18n';

const PERMISSIONS = [
  {
    key: 'view',
    icon: HiOutlineEye,
    label: 'Chỉ xem',
    desc: 'Chỉ xem hội thoại, không thể chỉnh sửa',
    color: 'from-sky-500 to-cyan-500',
  },
  {
    key: 'edit',
    icon: HiOutlinePencilAlt,
    label: 'Chỉnh sửa',
    desc: 'Có thể thay đổi cấu hình và nội dung',
    color: 'from-violet-500 to-fuchsia-500',
  },
  {
    key: 'clone',
    icon: HiOutlineDuplicate,
    label: 'Sao chép',
    desc: 'Tạo bản sao độc lập thuộc sở hữu của họ',
    color: 'from-emerald-500 to-teal-500',
  },
];

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

const emailToAvatar = (email) => {
  const handle = String(email || '').split('@')[0] || '?';
  const initials = handle.slice(0, 2).toUpperCase();
  let hash = 0;
  for (let i = 0; i < handle.length; i += 1) hash = (hash * 31 + handle.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return { initials, bg: `hsl(${hue} 70% 55%)` };
};

const CloneChatbotModal = ({ open, chatbot, onClose, onSuccess }) => {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [permission, setPermission] = useState('clone');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setEmail('');
      setNote('');
      setPermission('clone');
      setError('');
      setSuccess(false);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, submitting, onClose]);

  const emailValid = useMemo(() => isValidEmail(email), [email]);
  const avatar = useMemo(() => emailToAvatar(email), [email]);

  if (!open || !chatbot || !mounted) return null;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (!email.trim()) {
      setError(t('common.required') || 'Vui lòng nhập email');
      return;
    }
    if (!emailValid) {
      setError(t('auth.invalidEmail') || 'Email không hợp lệ');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const result = await chatbotApi.shareChatbot(chatbot.id, {
        recipientEmail: email.trim(),
        permission,
        note: note.trim() || undefined,
      });
      const recipient = result?.data?.recipient?.name || email.trim();
      setSuccess(true);
      toast.success(
        t('chatbot.cloneSuccess', { name: recipient })
          || `Đã chia sẻ chatbot cho ${recipient}. Họ có thể tìm thấy trong danh sách chatbot của mình.`
      );
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 900);
    } catch (err) {
      const code = err.response?.data?.code;
      const message = (code === 'CHATBOT_LIMIT_EXCEEDED' ? t('chatbot.cloneLimitReached') : null)
        || err.response?.data?.message
        || err.message
        || 'Không thể chia sẻ chatbot';
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-4 animate-[fadeIn_0.2s_ease-out]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-chatbot-title"
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl shadow-indigo-500/20 animate-[modalIn_0.28s_cubic-bezier(0.16,1,0.3,1)]"
      >
        {/* Animated gradient header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 px-6 pt-6 pb-8">
          <div
            aria-hidden
            className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/15 blur-2xl animate-[pulse_6s_ease-in-out_infinite]"
          />
          <div
            aria-hidden
            className="absolute -bottom-20 -left-10 w-48 h-48 rounded-full bg-fuchsia-300/30 blur-3xl animate-[pulse_7s_ease-in-out_infinite_1s]"
          />

          <div className="relative flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-sm ring-1 ring-white/30">
                <HiOutlineShare className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 id="share-chatbot-title" className="text-xl font-semibold text-white tracking-tight">
                  {t('chatbot.cloneTitle') || 'Chia sẻ Chatbot'}
                </h2>
                <p className="text-indigo-100 text-sm mt-0.5">
                  {t('chatbot.cloneSubtitle') || 'Mời đồng đội cùng sử dụng chatbot này'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white/90 transition-colors"
              aria-label="Close"
            >
              <HiOutlineX className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Chatbot preview */}
          <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-50 border border-slate-100">
            {chatbot?.avatar_url ? (
              <img
                src={chatbot.avatar_url}
                alt=""
                className="w-11 h-11 rounded-xl object-cover ring-1 ring-slate-200"
              />
            ) : (
              <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-500 text-white">
                <HiOutlineSparkles className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900 truncate">{chatbot?.name}</p>
              <p className="text-xs text-slate-500 truncate">
                {chatbot?.description || t('common.noDescription') || 'Không có mô tả'}
              </p>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Sẵn sàng chia sẻ
            </span>
          </div>

          {/* Email input with avatar preview */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1.5">
              {t('chatbot.recipientEmail') || 'Email người nhận'}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                {emailValid ? (
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold animate-[pop_0.2s_ease-out]"
                    style={{ background: avatar.bg }}
                  >
                    {avatar.initials}
                  </div>
                ) : (
                  <HiOutlineMail className="h-5 w-5 text-slate-400" />
                )}
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                placeholder={t('chatbot.emailPlaceholder') || 'nguyen@example.com'}
                className={`w-full pl-12 pr-4 py-3 text-sm rounded-xl border bg-white transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                  error
                    ? 'border-rose-300 focus:ring-rose-200 bg-rose-50/40'
                    : emailValid
                      ? 'border-emerald-300 focus:ring-emerald-200'
                      : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-200'
                }`}
                disabled={submitting || success}
              />
            </div>
            {error ? (
              <p className="mt-1.5 text-xs text-rose-600">{error}</p>
            ) : (
              <p className="mt-1.5 text-xs text-slate-500">
                {t('chatbot.cloneNote') || 'Người nhận phải có tài khoản trong hệ thống.'}
              </p>
            )}
          </div>

          {/* Permission selector */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Quyền truy cập
            </label>
            <div className="grid grid-cols-3 gap-2">
              {PERMISSIONS.map((p) => {
                const Icon = p.icon;
                const active = permission === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPermission(p.key)}
                    disabled={submitting || success}
                    className={`group relative flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all text-center ${
                      active
                        ? 'border-indigo-500 bg-indigo-50/60 shadow-sm'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className={`flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br ${p.color} text-white shadow-sm transition-transform group-hover:scale-105`}
                    >
                      <Icon className="w-4 h-4" />
                    </span>
                    <span className="text-xs font-semibold text-slate-900">{p.label}</span>
                    <span className="text-[10px] leading-tight text-slate-500 line-clamp-2">
                      {p.desc}
                    </span>
                    {active && (
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-600" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional note */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1.5">
              Lời nhắn <span className="font-normal text-slate-400">(tuỳ chọn)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Gửi kèm lời nhắn cho người nhận..."
              disabled={submitting || success}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 transition-all resize-none"
            />
          </div>

          {/* Info box */}
          <div className="flex gap-3 p-3 rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100/80">
            <HiOutlineClock className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-700 leading-relaxed">
              <span className="font-semibold text-indigo-900">
                {t('chatbot.cloneIncludes') || 'Bản sao bao gồm'}:
              </span>{' '}
              {t('chatbot.cloneIncludesList') ||
                'Cấu hình hội thoại, giao diện widget, knowledge base và embeddings đã huấn luyện.'}
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200/70 rounded-xl transition-colors disabled:opacity-50"
          >
            {t('common.cancel') || 'Hủy'}
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={submitting || success || !email.trim()}
            className="relative px-5 py-2.5 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 transition-all shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 disabled:opacity-50 disabled:shadow-none inline-flex items-center gap-2"
          >
            {success ? (
              <span className="inline-flex items-center gap-2">
                <HiOutlineCheckCircle className="w-4 h-4" />
                Đã chia sẻ
              </span>
            ) : submitting ? (
              <span className="inline-flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('common.cloning') || 'Đang chia sẻ...'}
              </span>
            ) : (
              <span className="inline-flex items-center gap-2">
                <HiOutlineShare className="w-4 h-4" />
                {t('chatbot.clone') || 'Chia sẻ ngay'}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default CloneChatbotModal;
