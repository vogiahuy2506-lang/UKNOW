import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineShare,
  HiOutlineX,
  HiOutlineTrash,
  HiOutlineEye,
  HiOutlinePencil,
} from 'react-icons/hi';
import marketplaceService from '../../services/marketplace.service';
import { useI18n } from '../../i18n';
import EmailTagsInput from '../common/EmailTagsInput';

/**
 * Modal chia sẻ landing page với người khác trong hệ thống.
 *
 * Props:
 *  - landingPage: { id, title } - landing page cần chia sẻ
 *  - open: boolean
 *  - onClose: () => void
 *  - onChanged: () => void  (optional, gọi sau khi danh sách share thay đổi)
 */
export default function LandingPageShareModal({ landingPage, open, onClose, onChanged }) {
  const { t } = useI18n();
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [recipients, setRecipients] = useState([]);
  const [shareType, setShareType] = useState('view');
  const [error, setError] = useState('');

  // useCallback để effect bên dưới khai đủ phụ thuộc mà không chạy lại mỗi lần render:
  // danh tính hàm chỉ đổi khi đổi landing page, đúng bằng điều kiện effect vốn đã dùng.
  const loadShares = useCallback(async () => {
    if (!landingPage?.id) return;
    setLoading(true);
    try {
      const res = await marketplaceService.getLandingPageShares(landingPage.id);
      setShares(res.data?.data || []);
    } catch (e) {
      console.error('Load shares error:', e);
    } finally {
      setLoading(false);
    }
  }, [landingPage?.id]);

  useEffect(() => {
    if (open && landingPage?.id) {
      loadShares();
      setRecipients([]);
      setShareType('view');
      setError('');
    }
  }, [open, landingPage?.id, loadShares]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (recipients.length === 0) {
      setError('Vui lòng nhập ít nhất 1 email');
      return;
    }
    setSubmitting(true);
    const results = await Promise.allSettled(
      recipients.map((email) =>
        marketplaceService.shareLandingPage(landingPage.id, {
          recipientEmail: email,
          shareType,
        }),
      ),
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - succeeded;
    if (succeeded > 0) {
      toast.success(
        failed > 0
          ? `Đã chia sẻ cho ${succeeded}/${results.length} người`
          : t('landingPagesAdmin.shareSuccess'),
      );
    }
    if (failed > 0) {
      const firstFail = results.find((r) => r.status === 'rejected');
      const msg = firstFail?.reason?.response?.data?.message || firstFail?.reason?.message;
      toast.error(msg || `${failed} lượt chia sẻ thất bại`);
    }
    setRecipients([]);
    setShareType('view');
    setSubmitting(false);
    await loadShares();
    onChanged?.();
  };

  const handleRevoke = async (share) => {
    const email = share.recipient?.email;
    if (!window.confirm(t('landingPagesAdmin.shareRevokeConfirm', { email }))) return;
    try {
      await marketplaceService.revokeLandingPageShare(landingPage.id, share.recipient.id);
      toast.success(t('landingPagesAdmin.shareRevokeSuccess'));
      await loadShares();
      onChanged?.();
    } catch (err) {
      toast.error(err.response?.data?.message || t('landingPagesAdmin.shareRevokeFailed'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-100 flex items-center justify-center">
              <HiOutlineShare className="w-4 h-4 text-orange-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {t('landingPagesAdmin.shareTitle')}
              </h2>
              <p className="text-xs text-gray-500 truncate max-w-[280px]">
                {landingPage?.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-3 border-b border-gray-100">
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              {t('landingPagesAdmin.shareRecipient')}
            </label>
            <EmailTagsInput
              value={recipients}
              onChange={setRecipients}
              disabled={submitting}
              error={error}
              placeholder="Nhập email và nhấn Enter để thêm..."
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-semibold text-gray-700">
              {t('landingPagesAdmin.shareType')}:
            </label>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setShareType('view')}
                disabled={submitting}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  shareType === 'view'
                    ? 'bg-orange-50 border-orange-300 text-orange-700 font-medium'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <HiOutlineEye className="w-3 h-3" />
                {t('landingPagesAdmin.shareTypeView')}
              </button>
              <button
                type="button"
                onClick={() => setShareType('edit')}
                disabled={submitting}
                className={`flex items-center gap-1 text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  shareType === 'edit'
                    ? 'bg-orange-50 border-orange-300 text-orange-700 font-medium'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <HiOutlinePencil className="w-3 h-3" />
                {t('landingPagesAdmin.shareTypeEdit')}
              </button>
            </div>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={submitting || recipients.length === 0}
            className="btn btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <HiOutlineShare className="w-4 h-4" />
            {submitting
              ? '...'
              : recipients.length > 1
                ? `Chia sẻ (${recipients.length})`
                : t('landingPagesAdmin.shareSubmit')}
          </button>
        </form>

        <div className="px-5 py-4 max-h-72 overflow-y-auto">
          <p className="text-xs font-semibold text-gray-700 mb-2">
            {t('landingPagesAdmin.shareCurrentList')}
          </p>
          {loading ? (
            <div className="py-4 text-center text-sm text-gray-500">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-orange-600 mx-auto" />
            </div>
          ) : shares.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">{t('landingPagesAdmin.shareNone')}</p>
          ) : (
            <ul className="space-y-2">
              {shares.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-2 p-2 rounded-lg border border-gray-100 hover:bg-gray-50"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-orange-500 to-orange-300 text-white flex items-center justify-center text-xs font-semibold flex-shrink-0">
                    {(s.recipient?.name || s.recipient?.email || '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {s.recipient?.name || s.recipient?.email}
                    </p>
                    <p className="text-xs text-gray-500 truncate">{s.recipient?.email}</p>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600 flex-shrink-0">
                    {s.shareType === 'edit' ? t('landingPagesAdmin.shareTypeEdit') : t('landingPagesAdmin.shareTypeView')}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRevoke(s)}
                    className="p-1.5 rounded text-red-500 hover:bg-red-50 flex-shrink-0"
                    title={t('landingPagesAdmin.shareRevoke')}
                  >
                    <HiOutlineTrash className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
