import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineX } from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/**
 * Ảnh đính kèm trong thread. Kho GCS trả 302 sang signed URL nên ảnh được tải bằng axios `responseType:'blob'`
 * (kèm Bearer qua `fetchBlob`) rồi `URL.createObjectURL` — KHÔNG gắn URL API thẳng vào `<img src>`.
 * Bấm ảnh thu nhỏ → mở lớp phủ xem ảnh lớn.
 *
 * @param {object} props
 * @param {{ storageObjectId: number|string, name?: string }} props.attachment
 * @param {number|string} props.ticketId
 * @param {(ticketId: number|string, objectId: number|string) => Promise<Blob>} props.fetchBlob tham chiếu ỔN ĐỊNH
 *   (hàm của supportApi) — đổi danh tính mỗi lần render sẽ tải lại ảnh liên tục
 */
export default function SupportAttachmentImage({ ticketId, attachment, fetchBlob }) {
  const { t } = useI18n();
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const objectId = attachment.storageObjectId;

  useEffect(() => {
    let cancelled = false;
    let createdUrl = null;
    setSrc(null);
    setFailed(false);
    Promise.resolve()
      .then(() => fetchBlob(ticketId, objectId))
      .then((blob) => {
        if (cancelled) return;
        createdUrl = URL.createObjectURL(blob);
        setSrc(createdUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (createdUrl) URL.revokeObjectURL?.(createdUrl);
    };
  }, [fetchBlob, ticketId, objectId]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  if (failed) {
    return (
      <span className="flex h-20 w-20 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 p-1 text-center text-[10px] text-slate-400 break-all">
        {attachment.name || t('support.attachments.loadFailed')}
      </span>
    );
  }
  if (!src) {
    return <span className="block h-20 w-20 animate-pulse rounded-lg bg-slate-100" aria-hidden="true" />;
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t('support.attachments.open', { name: attachment.name || '' })}
        className="block h-20 w-20 overflow-hidden rounded-lg border border-slate-200 bg-white hover:opacity-90"
      >
        <img src={src} alt={attachment.name || ''} className="h-full w-full object-cover" />
      </button>
      {open &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 p-4"
            onClick={() => setOpen(false)}
          >
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={t('common.close')}
              className="absolute right-4 top-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
            >
              <HiOutlineX className="h-5 w-5" aria-hidden="true" />
            </button>
            <img
              src={src}
              alt={attachment.name || ''}
              className="max-h-full max-w-full rounded-lg object-contain"
              onClick={(event) => event.stopPropagation()}
            />
          </div>,
          document.body,
        )}
    </>
  );
}
