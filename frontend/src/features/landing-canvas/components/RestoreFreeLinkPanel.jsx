import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import { postLandingFreeLink } from '../../landing-pages/services/landingPagesAdminApi.service.js';
import { SYSTEM_BASE_DOMAIN } from '../utils/landingDomain.js';

function errorMessage(err, fallback) {
  const fromServer = err?.response?.data?.message;
  if (typeof fromServer === 'string' && fromServer.trim()) return fromServer;
  return err?.message || fallback;
}

/**
 * Khối "Dùng lại link miễn phí" trong Cài đặt trang (PLAN_DUNG_LAI_LINK_MIEN_PHI_2026-10-03).
 *
 * Chỉ hiện cho trang bị mất link: `domain_type='custom'` mà không còn hàng tên miền nào (4 trang ở production:
 * 50, 76, 88, 105 — gốc là lỗi "Lưu tên miền" cũ). Khách đặt đường dẫn (điền sẵn slug hiện tại, có thể rỗng) rồi bấm nút:
 * backend cấp `<slug>.founderai.biz` và đưa trang về chế độ miễn phí.
 *
 * Quy tắc cứng (chốt PR-1): panel này KHÔNG nhận `setForm` và không đụng `domainType` — xong việc gọi `onRestored(data)`
 * để modal nạp lại từ server và đồng bộ slug server đã ghi về `form.slug`. Lỗi 400 / 409 hiện đúng câu của backend.
 *
 * @param {{
 *   editingId: number|string,
 *   slug: string|null|undefined,
 *   onRestored: (data: object|null) => (void|Promise<void>),
 * }} props
 */
export default function RestoreFreeLinkPanel({ editingId, slug, onRestored }) {
  const tc = useI18n('landingCanvas.settingsModal');
  const [value, setValue] = useState(String(slug || ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setValue(String(slug || ''));
  }, [slug]);

  const handleRestore = async () => {
    setBusy(true);
    setError('');
    try {
      const data = await postLandingFreeLink(editingId, value);
      const link = data?.slug ? `${data.slug}.${SYSTEM_BASE_DOMAIN}` : '';
      if (data && data.provisioned === false) {
        // Hàng link đã ghi nhưng hệ thống chưa cấp xong subdomain (vd Cloudflare lỗi): báo lý do, không giả vờ đã chạy.
        const reason = typeof data.message === 'string' ? data.message.trim() : '';
        toast(`${tc('sections.freeLink.pendingWarn', { link })}${reason ? `\n${reason}` : ''}`, { duration: 8000 });
      } else {
        toast.success(tc('sections.freeLink.success', { link }));
      }
      await onRestored?.(data);
    } catch (err) {
      setError(errorMessage(err, tc('sections.freeLink.genericError')));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-orange-200 bg-orange-50/60 p-4" data-testid="restore-free-link">
      <label htmlFor="restore-free-link-slug" className="block text-sm font-semibold text-gray-900">
        {tc('sections.freeLink.slugLabel')}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex min-w-0 flex-1 items-center rounded-lg border border-gray-200 bg-white focus-within:border-orange-400 focus-within:ring-2 focus-within:ring-orange-100">
          <input
            id="restore-free-link-slug"
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={value}
            onChange={(e) => {
              setValue(e.target.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''));
              setError('');
            }}
            placeholder="ten-page"
            className="min-w-0 flex-1 rounded-lg bg-transparent px-4 py-2.5 font-mono text-gray-900 placeholder:text-gray-400 focus:outline-none"
          />
          <span className="shrink-0 pr-3 font-mono text-sm text-gray-500">.{SYSTEM_BASE_DOMAIN}</span>
        </div>
        <button
          type="button"
          onClick={handleRestore}
          disabled={busy}
          className="shrink-0 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-orange-600 disabled:opacity-50"
        >
          {busy ? tc('sections.freeLink.busy') : tc('sections.freeLink.button')}
        </button>
      </div>
      {error ? (
        <p role="alert" className="whitespace-pre-line text-xs text-red-600" data-testid="restore-free-link-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
