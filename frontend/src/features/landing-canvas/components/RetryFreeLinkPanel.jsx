import { useState } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import { postLandingCustomDomainVerify } from '../../landing-pages/services/landingPagesAdminApi.service.js';

function errorMessage(err, fallback) {
  const fromServer = err?.response?.data?.message;
  if (typeof fromServer === 'string' && fromServer.trim()) return fromServer;
  return err?.message || fallback;
}

/**
 * Dòng trạng thái + nút "Thử lại" khi link miễn phí `<slug>.founderai.biz` kẹt `pending_verification`
 * (PLAN_DUNG_LAI_LINK_MIEN_PHI_2026-10-03, PR-2).
 *
 * Gốc: cấp subdomain qua Cloudflare lỗi (tạo trang mới, hoặc "Dùng lại link miễn phí") thì backend vẫn ghi hàng
 * `cf_managed=true` ở trạng thái chờ để thử lại sau — nhưng nút "Thử lại" cũ nằm ở trình soạn đã bị thay, nên khách không
 * có cách nào bấm. Nút này gọi POST /:id/custom-domain/verify (qua api.js, có Bearer): với hàng `cf_managed` chờ cấp, backend
 * gọi lại Cloudflare; thất bại thì 400 kèm lý do — hiện đúng câu đó ra đây.
 *
 * Quy tắc cứng (chốt PR-1): panel này KHÔNG nhận `setForm`, không đụng `domainType` — xong việc chỉ gọi `onRetried()` để modal
 * nạp lại tình trạng tên miền từ server (link chuyển sang đang chạy thì panel tự biến mất vì modal không còn coi là pending).
 *
 * @param {{
 *   editingId: number|string,
 *   onRetried: () => (void|Promise<void>),
 * }} props
 */
export default function RetryFreeLinkPanel({ editingId, onRetried }) {
  const tc = useI18n('landingCanvas.settingsModal');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleRetry = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await postLandingCustomDomainVerify(editingId);
      toast.success(tc('sections.freeLink.retrySuccess'));
      await onRetried?.();
    } catch (err) {
      setError(errorMessage(err, tc('sections.freeLink.retryError')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2" data-testid="retry-free-link">
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid="retry-free-link-status"
          className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-800"
        >
          {tc('sections.freeLink.pendingBadge')}
        </span>
        <button
          type="button"
          onClick={handleRetry}
          disabled={busy}
          className="rounded-lg bg-orange-500 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-orange-600 disabled:opacity-50"
        >
          {busy ? tc('sections.freeLink.retrying') : tc('sections.freeLink.retry')}
        </button>
      </div>
      <p className="text-xs text-gray-600">{tc('sections.freeLink.pendingNote')}</p>
      {error ? (
        <p role="alert" className="whitespace-pre-line text-xs text-red-600" data-testid="retry-free-link-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
