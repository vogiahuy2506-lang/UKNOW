import { useEffect, useMemo, useState } from 'react';
import { HiOutlineBookmark, HiOutlineX } from 'react-icons/hi';

/**
 * Modal "Lưu thành mẫu" (Save As) — lưu bản soạn hiện tại thành 1 mẫu mới
 * trong DB. Mẫu gốc (TYPE_TEMPLATES) KHÔNG bị ảnh hưởng.
 *
 * Props:
 *  - open: boolean
 *  - onClose: () => void
 *  - onSubmit: async ({ name, slug, description }) => boolean (true = success)
 *  - initial: { subject, bodyHtml, typeKey, typeLabel }
 *  - submitting: boolean
 *  - defaultSlugBase: string (slug gợi ý từ subject)
 */
export default function SaveAsTemplateModal({
  open,
  onClose,
  onSubmit,
  initial,
  submitting = false,
  errorMessage = '',
}) {
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [localError, setLocalError] = useState('');

  // Reset state khi mở modal
  useEffect(() => {
    if (!open) return;
    setLocalError('');
    const seedName = (initial?.subject || '').slice(0, 120) || 'Mẫu mới';
    setName(seedName);
    const seedSlug = slugify(seedName);
    setSlug(seedSlug);
    setSlugTouched(false);
    setDescription('');
  }, [open, initial?.subject]);

  // Auto slugify từ name (khi user không sửa tay slug)
  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugify(name));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name]);

  const previewLine = useMemo(() => {
    const html = initial?.bodyHtml || '';
    // strip tags, lấy 80 ký tự đầu
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return text.slice(0, 120) + (text.length > 120 ? '…' : '');
  }, [initial?.bodyHtml]);

  if (!open) return null;

  const handleSubmit = async (event) => {
    event.preventDefault();
    setLocalError('');

    const trimmedName = name.trim();
    if (trimmedName.length === 0) {
      setLocalError('Vui lòng nhập tên mẫu');
      return;
    }
    if (trimmedName.length > 120) {
      setLocalError('Tên mẫu tối đa 120 ký tự');
      return;
    }

    const trimmedSlug = slug.trim();
    if (trimmedSlug && !/^[a-z0-9-]+$/.test(trimmedSlug)) {
      setLocalError('Slug chỉ chứa chữ thường, số và dấu gạch ngang');
      return;
    }

    const ok = await onSubmit({
      name: trimmedName,
      slug: trimmedSlug,
      description: description.trim() || null,
    });
    if (ok !== true) {
      // Caller đã set errorMessage riêng; không đóng modal.
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <header className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-2">
            <HiOutlineBookmark className="h-5 w-5 text-orange-500" />
            <h2 className="text-lg font-semibold text-slate-900">Lưu thành mẫu mới</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Đóng"
          >
            <HiOutlineX className="h-5 w-5" />
          </button>
        </header>

        <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
          <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
            <p>
              <span className="font-semibold">Dạng:</span> {initial?.typeLabel || initial?.typeKey}
            </p>
            <p className="mt-1 line-clamp-2">
              <span className="font-semibold">Subject:</span> {initial?.subject || '(trống)'}
            </p>
            {previewLine ? (
              <p className="mt-1 line-clamp-2 text-slate-500">
                <span className="font-semibold">Preview:</span> {previewLine}
              </p>
            ) : null}
          </div>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-800">
              Tên mẫu <span className="text-red-500">*</span>
            </span>
            <input
              type="text"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Khuyến mãi T9"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
            <span className="block text-right text-xs text-slate-400">{name.length}/120</span>
            {slug ? (
              <span className="block text-xs text-slate-500">
                Slug tự sinh: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">{slug}</code>
              </span>
            ) : null}
          </label>

          <label className="block space-y-1.5">
            <span className="text-sm font-medium text-slate-800">Mô tả (tuỳ chọn)</span>
            <textarea
              value={description}
              maxLength={500}
              rows={2}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ghi chú ngắn về mẫu này để dễ tìm sau."
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
            />
          </label>

          {(localError || errorMessage) && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {localError || errorMessage}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {submitting && <span className="loading loading-spinner loading-xs" />}
              {submitting ? 'Đang lưu...' : 'Lưu mẫu mới'}
            </button>
          </div>

          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Mẫu gốc (trong <code>Mẫu email theo dạng</code>) sẽ <strong>không</strong> bị thay đổi.
            Sau khi lưu, bạn có thể chọn mẫu này ở tab <strong>Chiến dịch mới</strong>.
          </p>
        </form>
      </div>
    </div>
  );
}

function slugify(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
