import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineDuplicate } from 'react-icons/hi';
import toast from 'react-hot-toast';
import { getLandingManualInsertSnippets } from '../utils/injectLandingEnhancements.js';
import { normalizeLandingLpTrackApiBase } from '../utils/normalizeLandingLpTrackApiBase.js';

/**
 * Editor toàn màn hình (portal ra `document.body`): một nửa nhập HTML/metadata + lệnh chèn tay, một nửa iframe preview thuần HTML.
 *
 * Luồng:
 * 1. Portal tránh bị layout cha (`transform` / max-width) cắt `fixed` — phủ kín viewport.
 * 2. Preview `srcDoc` do trang cha chuẩn hóa (gần giống bản lưu) + sandbox có `allow-same-origin` để iframe form cùng site hiển thị.
 * 3. Khối «lệnh HTML» để copy iframe + script khi host HTML ngoài app; khi Lưu, backend chỉ strip/rewrite + chèn `lp-track.js` (iframe do bạn dán tay vào HTML).
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {number|null} props.editingId
 * @param {object} props.form { slug, title, htmlContent, isPublished }
 * @param {function} props.setForm
 * @param {boolean} props.saving
 * @param {string} props.previewSrcDoc HTML đầy đủ đưa vào iframe (đã là bản thuần từ trang cha)
 * @param {{ preview: string }} props.links Link mở tab `/lp/slug` khi đã có slug
 * @param {function} props.onClose
 * @param {function} props.onSave
 */
export default function LandingPageFullEditor({
  open,
  editingId,
  form,
  setForm,
  saving,
  previewSrcDoc,
  links,
  onClose,
  onSave,
}) {
  const snippetContext = useMemo(() => {
    const slug = String(form.slug || '').trim().toLowerCase();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const apiBase = normalizeLandingLpTrackApiBase(
      String(import.meta.env.VITE_API_URL || `${origin}/api`)
    );
    return getLandingManualInsertSnippets({ slug, frontendOrigin: origin, apiBase });
  }, [form.slug]);

  const copyText = async (label, text) => {
    if (!String(text || '').trim()) {
      toast.error('Chưa có nội dung để copy');
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Đã copy ${label}`);
    } catch {
      toast.error('Không copy được — thử chọn và copy thủ công');
    }
  };

  if (!open) return null;

  const overlay = (
    <div className="fixed inset-0 z-[200] flex flex-col bg-white">
      <header className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50/90">
        <h2 className="text-lg font-semibold text-gray-900">
          {editingId ? 'Sửa landing page' : 'Tạo landing page'}
        </h2>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {links?.preview ? (
            <a
              href={links.preview}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary-600 hover:underline max-w-[200px] truncate"
              title={links.preview}
            >
              Mở /lp (tab mới)
            </a>
          ) : null}
          <button type="button" className="btn btn-secondary text-sm" onClick={onClose}>
            Đóng
          </button>
          <button type="button" className="btn btn-primary text-sm" onClick={onSave} disabled={saving}>
            {saving ? 'Đang lưu…' : 'Lưu'}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        <section className="flex flex-col min-h-[40vh] lg:min-h-0 lg:w-1/2 lg:border-r border-gray-200 overflow-hidden">
          <div className="shrink-0 p-4 space-y-3 border-b border-gray-100 bg-white overflow-y-auto max-h-[48vh] lg:max-h-[50%]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Slug (URL /lp/…)</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                  value={form.slug}
                  onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                  placeholder="vd: ai, khoahoc"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tiêu đề (tab trình duyệt)</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={Boolean(form.isPublished)}
                onChange={(e) => setForm((p) => ({ ...p, isPublished: e.target.checked }))}
                className="rounded border-gray-300"
              />
              Công bố (cho phép GET công khai)
            </label>

            <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-950 leading-relaxed space-y-2">
              <p>
                <strong>Khi bấm Lưu:</strong> hệ thống gắn link tracking cho <code className="bg-white/80 px-1 rounded">&lt;a href=&quot;http(s)…&quot;&gt;</code> và chèn{' '}
                <code className="bg-white/80 px-1 rounded">lp-track.js</code>. Không tự chèn iframe — dán khối (1) vào chỗ bạn muốn trên HTML. 
              </p>
              {!snippetContext.combined ? (
                <p className="text-amber-800">Nhập slug hợp lệ để sinh mã — cần slug để gắn <code className="bg-white/80 px-1 rounded">data-slug</code> và URL form.</p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-medium text-amber-900">1) Iframe form đăng ký</span>
                      <button
                        type="button"
                        className="text-primary-600 flex items-center gap-1 shrink-0 text-[11px]"
                        onClick={() => copyText('iframe form', snippetContext.iframeBlock)}
                      >
                        <HiOutlineDuplicate className="w-3.5 h-3.5" />
                        Copy
                      </button>
                    </div>
                    <textarea
                      readOnly
                      className="w-full h-24 rounded border border-amber-200/80 bg-white px-2 py-1.5 text-[11px] font-mono"
                      value={snippetContext.iframeBlock}
                      spellCheck={false}
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span className="font-medium text-amber-900">2) Script tracking (lp-track.js)</span>
                      <button
                        type="button"
                        className="text-primary-600 flex items-center gap-1 shrink-0 text-[11px]"
                        onClick={() => copyText('script tracking', snippetContext.scriptBlock)}
                      >
                        <HiOutlineDuplicate className="w-3.5 h-3.5" />
                        Copy
                      </button>
                    </div>
                    <textarea
                      readOnly
                      className="w-full h-20 rounded border border-amber-200/80 bg-white px-2 py-1.5 text-[11px] font-mono"
                      value={snippetContext.scriptBlock}
                      spellCheck={false}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-secondary text-xs py-1.5"
                    onClick={() => copyText('cả hai khối', snippetContext.combined)}
                  >
                    Copy cả hai khối (form + script)
                  </button>
                </div>
              )}
            </div>

            {form.slug.trim() && links?.preview ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
                <span className="truncate max-w-full">{links.preview}</span>
                <button
                  type="button"
                  className="text-primary-600 flex items-center gap-1 shrink-0"
                  onClick={() => copyText('URL', links.preview)}
                >
                  <HiOutlineDuplicate className="w-3.5 h-3.5" />
                  Copy URL
                </button>
              </div>
            ) : null}
          </div>
          <div className="flex-1 flex flex-col min-h-0 p-4 bg-white">
            <label className="block text-sm font-medium text-gray-700 mb-1 shrink-0">HTML (paste từ Gemini)</label>
            <textarea
              className="flex-1 w-full min-h-[200px] rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono resize-none"
              value={form.htmlContent}
              onChange={(e) => setForm((p) => ({ ...p, htmlContent: e.target.value }))}
              placeholder="<!DOCTYPE html>..."
              spellCheck={false}
            />
          </div>
        </section>

        <section className="flex flex-col min-h-[40vh] lg:min-h-0 lg:w-1/2 bg-gray-100 border-t lg:border-t-0 border-gray-200">
          <div className="shrink-0 px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-200 bg-gray-50">
            Xem trước (sau Lưu: tracking + script; form chỉ có nếu HTML đã dán iframe từ mục 1)
          </div>
          <iframe
            title="Landing preview"
            className="flex-1 w-full min-h-0 border-0 bg-white"
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin"
            srcDoc={
              previewSrcDoc ||
              '<!DOCTYPE html><html><body><p class="p-4 text-gray-500 text-sm">Nhập slug và HTML để xem trước.</p></body></html>'
            }
          />
        </section>
      </div>
    </div>
  );

  return createPortal(overlay, document.body);
}
