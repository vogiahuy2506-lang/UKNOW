import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineDuplicate, HiOutlineLightningBolt } from 'react-icons/hi';
import toast from 'react-hot-toast';
import {
  deleteLandingCustomDomain,
  fetchLandingCustomDomain,
  generateLandingHtmlWithAi,
  postLandingCustomDomainVerify,
  putLandingCustomDomain,
} from '../services/landingPagesAdminApi.service.js';
import { getLandingManualInsertSnippets } from '../utils/injectLandingEnhancements.js';
import { normalizeLandingLpTrackApiBase } from '../utils/normalizeLandingLpTrackApiBase.js';

/** Khớp backend `aiLandingPage.service.js` — thay bằng iframe khi đã có slug. */
const LP_FORM_MARKER = '<!-- UKNOW_LP_FORM -->';

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

  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setAiOpen(false);
      setAiPrompt('');
      setAiBusy(false);
    }
  }, [open]);

  const runAiGenerate = async () => {
    const p = String(aiPrompt || '').trim();
    if (!p) {
      toast.error('Nhập mô tả trang (chủ đề, đối tượng, CTA…) cho AI');
      return;
    }
    setAiBusy(true);
    try {
      const res = await generateLandingHtmlWithAi({
        prompt: p,
        title: String(form.title || '').trim() || undefined,
      });
      if (!res?.success || !res?.data?.html) {
        throw new Error(res?.message || 'Phản hồi không hợp lệ');
      }
      let html = String(res.data.html);
      const nextTitle = String(res.data.title || '').trim();
      if (snippetContext.iframeBlock && html.includes(LP_FORM_MARKER)) {
        html = html.split(LP_FORM_MARKER).join(snippetContext.iframeBlock);
      } else if (snippetContext.iframeBlock && !html.includes(LP_FORM_MARKER)) {
        toast('HTML không có vị trí form chuẩn — dán iframe từ khối bên trên vào chỗ phù hợp.', { icon: 'ℹ️' });
      } else if (!snippetContext.iframeBlock) {
        toast('Nhập slug hợp lệ để tự chèn form embed vào HTML.', { icon: 'ℹ️' });
      }
      setForm((prev) => ({
        ...prev,
        htmlContent: html,
        ...(nextTitle ? { title: nextTitle } : {}),
      }));
      toast.success('Đã sinh HTML — xem trước bên phải, chỉnh sửa rồi Lưu');
      setAiOpen(false);
      setAiPrompt('');
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || 'Không sinh được HTML');
    } finally {
      setAiBusy(false);
    }
  };

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

  const [cdLoading, setCdLoading] = useState(false);
  const [cdBusy, setCdBusy] = useState(false);
  const [cdHostnameDraft, setCdHostnameDraft] = useState('');
  const [cdInfo, setCdInfo] = useState(null);

  useEffect(() => {
    if (!open || !editingId) {
      setCdInfo(null);
      setCdHostnameDraft('');
      return;
    }
    let cancelled = false;
    setCdLoading(true);
    fetchLandingCustomDomain(editingId)
      .then((res) => {
        if (cancelled || !res?.success) return;
        setCdInfo(res.data);
        setCdHostnameDraft(res.data?.hostname ? String(res.data.hostname) : '');
      })
      .catch(() => {
        if (!cancelled) toast.error('Không tải được cấu hình tên miền');
      })
      .finally(() => {
        if (!cancelled) setCdLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, editingId]);

  const saveCustomDomainHostname = async () => {
    if (!editingId) return;
    const h = String(cdHostnameDraft || '').trim().toLowerCase();
    if (!h) {
      toast.error('Nhập hostname dạng www.ví-dụ.com');
      return;
    }
    setCdBusy(true);
    try {
      const res = await putLandingCustomDomain(editingId, h);
      if (!res?.success) throw new Error(res?.message || 'Không lưu được');
      setCdInfo(res.data);
      toast.success('Đã lưu — thêm TXT DNS theo hướng dẫn rồi bấm Xác minh');
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || 'Không lưu được');
    } finally {
      setCdBusy(false);
    }
  };

  const verifyCustomDomain = async () => {
    if (!editingId) return;
    setCdBusy(true);
    try {
      const res = await postLandingCustomDomainVerify(editingId);
      if (!res?.success) throw new Error(res?.message || 'Xác minh thất bại');
      setCdInfo(res.data);
      toast.success('Đã xác minh — trỏ CNAME www về frontend theo hướng dẫn vận hành');
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || 'Xác minh thất bại');
    } finally {
      setCdBusy(false);
    }
  };

  const removeCustomDomain = async () => {
    if (!editingId) return;
    if (!window.confirm('Gỡ tên miền tùy chỉnh khỏi landing này?')) return;
    setCdBusy(true);
    try {
      const res = await deleteLandingCustomDomain(editingId);
      if (!res?.success) throw new Error(res?.message || 'Không xóa được');
      setCdInfo({ configured: false, instructions: null, record: null });
      setCdHostnameDraft('');
      toast.success('Đã gỡ tên miền');
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || 'Không xóa được');
    } finally {
      setCdBusy(false);
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
          <button
            type="button"
            className="btn btn-secondary text-sm flex items-center gap-1.5"
            onClick={() => setAiOpen(true)}
            title="Sinh HTML đầy đủ với Tailwind (Gemini + hồ sơ DN)"
          >
            <HiOutlineLightningBolt className="w-4 h-4" />
            Tạo bằng AI
          </button>
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
                  onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value.replace(/^\/+/, '') }))}
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

            <div className="rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2 text-xs text-sky-950 space-y-2">
              <p className="font-medium text-sky-900">Tên miền riêng (www)</p>
              {!editingId ? (
                <p className="text-sky-800">Lưu landing (tạo mới) một lần, rồi mở lại Sửa để gắn www — tối đa 1 hostname / landing, quota theo gói (cùng giới hạn số landing).</p>
              ) : cdLoading ? (
                <p className="text-sky-700">Đang tải cấu hình…</p>
              ) : (
                <>
                  <p className="text-sky-800 leading-relaxed">
                    Chỉ dùng dạng <code className="bg-white/90 px-1 rounded">www.ten-mien.com</code>. Khách tự thêm bản ghi TXT tại DNS, sau đó bấm Xác minh.{' '}
                    <code className="bg-white/90 px-1 rounded">domain.com</code> (apex) nên redirect 301 → www (cấu hình ngoài app: nginx/Cloudflare). Đăng nhập app vẫn dùng domain FounderAI.
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      className="flex-1 rounded border border-sky-200/90 bg-white px-2 py-1.5 text-sm font-mono"
                      placeholder="www.vi-du.com"
                      value={cdHostnameDraft}
                      onChange={(e) => setCdHostnameDraft(e.target.value)}
                      disabled={cdBusy || cdInfo?.status === 'active'}
                    />
                    <button
                      type="button"
                      className="btn btn-secondary text-xs py-1.5 shrink-0"
                      disabled={cdBusy || cdInfo?.status === 'active'}
                      onClick={saveCustomDomainHostname}
                    >
                      Lưu hostname
                    </button>
                  </div>
                  {cdInfo?.record ? (
                    <div className="space-y-1">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium text-sky-900">TXT xác minh</span>
                        <button
                          type="button"
                          className="text-primary-600 text-[11px] shrink-0"
                          onClick={() =>
                            copyText(
                              'TXT',
                              `${cdInfo.record.name}\tTXT\t${cdInfo.record.value}`
                            )
                          }
                        >
                          Copy
                        </button>
                      </div>
                      <textarea
                        readOnly
                        className="w-full h-16 rounded border border-sky-200 bg-white px-2 py-1 text-[11px] font-mono"
                        value={`Tên: ${cdInfo.record.name}\nGiá trị: ${cdInfo.record.value}`}
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        className="btn btn-primary text-xs py-1.5"
                        disabled={cdBusy}
                        onClick={verifyCustomDomain}
                      >
                        Xác minh DNS
                      </button>
                    </div>
                  ) : null}
                  {cdInfo?.status === 'active' ? (
                    <p className="text-emerald-800 font-medium">Đã kích hoạt: {cdInfo.hostname}</p>
                  ) : null}
                  {cdInfo?.configured ? (
                    <button
                      type="button"
                      className="text-red-600 text-[11px] hover:underline"
                      disabled={cdBusy}
                      onClick={removeCustomDomain}
                    >
                      Gỡ tên miền
                    </button>
                  ) : null}
                </>
              )}
            </div>

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
            <label className="block text-sm font-medium text-gray-700 mb-1 shrink-0">
              HTML (dán tay hoặc dùng «Tạo bằng AI» — một file đầy đủ, Tailwind CDN)
            </label>
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

  const aiOverlay =
    aiOpen &&
    createPortal(
      <div
        className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/40"
        role="dialog"
        aria-modal="true"
        onClick={() => !aiBusy && setAiOpen(false)}
      >
        <div
          className="bg-white rounded-xl shadow-xl max-w-lg w-full p-5 space-y-4 border border-gray-200"
          onClick={(e) => e.stopPropagation()}
        >
          <h3 className="text-lg font-semibold text-gray-900">Tạo landing bằng AI</h3>
          <p className="text-sm text-gray-600 leading-relaxed">
            Mô tả trang (sản phẩm, ưu đãi, đối tượng, tone). Hệ thống dùng{' '}
            <strong>hồ sơ doanh nghiệp</strong> (RAG nếu có) + Gemini để sinh{' '}
            <strong>một HTML đầy đủ</strong> với Tailwind CDN. Tiêu đề tab lấy từ ô «Tiêu đề» bên trái làm gợi ý; slug đúng thì form embed được chèn tự động vào vị trí chuẩn.
          </p>
          <textarea
            className="w-full min-h-[120px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
            placeholder="Ví dụ: Landing khóa học marketing online, CTA đăng ký tư vấn 15 phút, màu xanh dương, 3 lợi ích nổi bật…"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            disabled={aiBusy}
          />
          <div className="flex justify-end gap-2 flex-wrap">
            <button type="button" className="btn btn-secondary text-sm" onClick={() => !aiBusy && setAiOpen(false)}>
              Hủy
            </button>
            <button type="button" className="btn btn-primary text-sm" onClick={runAiGenerate} disabled={aiBusy}>
              {aiBusy ? 'Đang sinh…' : 'Sinh HTML'}
            </button>
          </div>
        </div>
      </div>,
      document.body
    );

  return (
    <>
      {createPortal(overlay, document.body)}
      {aiOverlay}
    </>
  );
}
