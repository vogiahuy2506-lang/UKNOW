import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineX,
  HiOutlineShare,
  HiOutlineMail,
  HiOutlineSparkles,
} from 'react-icons/hi';
import chatbotApi from '../../services/chatbotApi';
import { useI18n } from '../../i18n';

const isValidEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim());

const emailToAvatar = (email) => {
  const handle = String(email || '').split('@')[0] || '?';
  const initials = handle.slice(0, 2).toUpperCase();
  let hash = 0;
  for (let i = 0; i < handle.length; i += 1) hash = (hash * 31 + handle.charCodeAt(i)) >>> 0;
  const hue = hash % 360;
  return { initials, bg: `hsl(${hue} 70% 55%)` };
};

const ShareChatbotModal = ({ open, chatbot, onClose, onSuccess }) => {
  const { t } = useI18n();
  const [email, setEmail] = useState('');
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
        note: note.trim() || undefined,
      });
      const recipient = result?.data?.recipient?.name || email.trim();
      setSuccess(true);
      toast.success(
        t('chatbot.cloneSuccess', { name: recipient })
          || `Đã chia sẻ chatbot cho ${recipient}`
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-chatbot-title"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <HiOutlineShare className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 id="share-chatbot-title" className="text-lg font-semibold text-gray-900">
                {t('chatbot.cloneTitle') || 'Chia sẻ Chatbot'}
              </h3>
              <p className="text-sm text-gray-500">
                Mời đồng đội cùng sử dụng chatbot
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            aria-label="Close"
          >
            <HiOutlineX className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Chatbot preview */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
            {chatbot?.avatar_url ? (
              <img
                src={chatbot.avatar_url}
                alt=""
                className="w-10 h-10 rounded-xl object-cover ring-1 ring-gray-200"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 flex items-center justify-center text-white">
                <HiOutlineSparkles className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 truncate">{chatbot?.name}</p>
              <p className="text-xs text-gray-500 truncate">
                {chatbot?.description || 'Không có mô tả'}
              </p>
            </div>
          </div>

          {/* Email input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email người nhận <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none">
                {emailValid ? (
                  <div
                    className="w-7 h-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold"
                    style={{ background: avatar.bg }}
                  >
                    {avatar.initials}
                  </div>
                ) : (
                  <HiOutlineMail className="h-5 w-5 text-gray-400" />
                )}
              </div>
              <input
                type="email"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError('');
                }}
                placeholder="nguyen@example.com"
                className={`w-full pl-12 pr-4 py-3 text-sm rounded-xl border bg-white transition-all focus:outline-none focus:ring-2 focus:ring-orange-200 ${
                  error
                    ? 'border-red-300 focus:border-red-400 focus:ring-red-200 bg-red-50/40'
                    : emailValid
                      ? 'border-green-300 focus:border-green-400 focus:ring-green-200'
                      : 'border-gray-200 focus:border-orange-400'
                }`}
                disabled={submitting || success}
              />
            </div>
            {error ? (
              <p className="mt-1.5 text-xs text-red-600">{error}</p>
            ) : (
              <p className="mt-1.5 text-xs text-gray-500">
                Người nhận phải có tài khoản trong hệ thống.
              </p>
            )}
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Lời nhắn <span className="font-normal text-gray-400">(tuỳ chọn)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Gửi kèm lời nhắn cho người nhận..."
              disabled={submitting || success}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 transition-all resize-none"
            />
          </div>

          {/* Info */}
          <div className="flex gap-2.5 p-3 rounded-xl bg-orange-50 border border-orange-100">
            <svg className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-xs text-gray-700 leading-relaxed">
              <span className="font-semibold text-orange-900">Bản sao bao gồm:</span>{' '}
              Cấu hình hội thoại, giao diện widget, knowledge base và embeddings đã huấn luyện.
            </p>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
          >
            {t('common.cancel') || 'Hủy'}
          </button>
          <button
            type="submit"
            onClick={handleSubmit}
            disabled={submitting || success || !email.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Đang chia sẻ...
              </>
            ) : success ? (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Đã chia sẻ
              </>
            ) : (
              <>
                <HiOutlineShare className="w-4 h-4" />
                Chia sẻ ngay
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default ShareChatbotModal;
