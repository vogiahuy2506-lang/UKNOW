import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineX,
  HiOutlineCheckCircle,
  HiOutlineShare,
  HiOutlineEye,
  HiOutlinePencilAlt,
  HiOutlineDuplicate,
  HiOutlineSparkles,
  HiOutlineClock,
} from 'react-icons/hi';
import chatbotApi from '../../services/chatbotApi';
import { useI18n } from '../../i18n';
import EmailTagsInput from '../common/EmailTagsInput';

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

const CloneChatbotModal = ({ open, chatbot, onClose, onSuccess }) => {
  const { t } = useI18n();
  const [emails, setEmails] = useState([]);
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
      setEmails([]);
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

  if (!open || !chatbot || !mounted) return null;

  const handleSubmit = async (e) => {
    e?.preventDefault?.();
    if (emails.length === 0) {
      setError(t('common.required') || 'Vui lòng nhập ít nhất 1 email');
      return;
    }

    setSubmitting(true);
    setError('');

    const results = await Promise.allSettled(
      emails.map((recipientEmail) =>
        chatbotApi.shareChatbot(chatbot.id, {
          recipientEmail,
          permission,
          note: note.trim() || undefined,
        }),
      ),
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - succeeded;

    if (succeeded > 0) {
      const firstOk = results.find((r) => r.status === 'fulfilled');
      const recipient = firstOk?.value?.data?.recipient?.name || `${succeeded} người`;
      const msg =
        failed > 0
          ? `Đã chia sẻ cho ${succeeded}/${results.length} người`
          : t('chatbot.cloneSuccess', { name: recipient }) ||
            `Đã chia sẻ chatbot cho ${recipient}. Họ có thể tìm thấy trong danh sách chatbot của mình.`;
      toast.success(msg);
      setSuccess(true);
      setTimeout(() => {
        onSuccess?.();
        onClose();
      }, 900);
    }
    if (failed > 0) {
      const firstFail = results.find((r) => r.status === 'rejected');
      const err = firstFail?.reason;
      const code = err?.response?.data?.code;
      const message =
        (code === 'CHATBOT_LIMIT_EXCEEDED' ? t('chatbot.cloneLimitReached') : null) ||
        err?.response?.data?.message ||
        err?.message ||
        `${failed} lượt chia sẻ thất bại`;
      setError(message);
      toast.error(message);
    }
    setSubmitting(false);
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
        className="relative w-full max-w-lg overflow-hidden rounded-3xl bg-white shadow-2xl shadow-orange-500/20 animate-[modalIn_0.28s_cubic-bezier(0.16,1,0.3,1)]"
      >
        {/* Animated gradient header */}
        <div className="relative overflow-hidden bg-gradient-to-br from-orange-500 via-orange-500 to-amber-500 px-6 pt-6 pb-8">
          <div
            aria-hidden
            className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/15 blur-2xl animate-[pulse_6s_ease-in-out_infinite]"
          />
          <div
            aria-hidden
            className="absolute -bottom-20 -left-10 w-48 h-48 rounded-full bg-amber-300/30 blur-3xl animate-[pulse_7s_ease-in-out_infinite_1s]"
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
                <p className="text-orange-50 text-sm mt-0.5">
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
              <div className="flex items-center justify-center w-11 h-11 rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 text-white">
                <HiOutlineSparkles className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-slate-900 truncate">{chatbot?.name}</p>
              <p className="text-xs text-slate-500 truncate">
                {chatbot?.description || t('common.noDescription') || 'Không có mô tả'}
              </p>
            </div>
            <span className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-orange-700 bg-orange-50 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
              Sẵn sàng chia sẻ
            </span>
          </div>

          {/* Email input */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-1.5">
              {t('chatbot.recipientEmail') || 'Email người nhận'}
            </label>
            <EmailTagsInput
              value={emails}
              onChange={(next) => {
                setEmails(next);
                if (error) setError('');
              }}
              disabled={submitting || success}
              error={error}
              placeholder={t('chatbot.emailPlaceholder') || 'nguyen@example.com'}
            />
            {!error && (
              <p className="mt-1.5 text-xs text-slate-500">
                {t('chatbot.cloneNote') || 'Người nhận phải có tài khoản trong hệ thống. Có thể thêm nhiều người.'}
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
                        ? 'border-orange-500 bg-orange-50/60 shadow-sm'
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
                      <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-orange-600" />
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
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 transition-all resize-none"
            />
          </div>

          {/* Info box */}
          <div className="flex gap-3 p-3 rounded-xl bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-100/80">
            <HiOutlineClock className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-700 leading-relaxed">
              <span className="font-semibold text-orange-900">
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
            disabled={submitting || success || emails.length === 0}
            className="relative px-5 py-2.5 text-sm font-semibold text-white rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 transition-all shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 disabled:opacity-50 disabled:shadow-none inline-flex items-center gap-2"
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
                {emails.length > 1
                  ? `Chia sẻ (${emails.length})`
                  : t('chatbot.clone') || 'Chia sẻ ngay'}
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
