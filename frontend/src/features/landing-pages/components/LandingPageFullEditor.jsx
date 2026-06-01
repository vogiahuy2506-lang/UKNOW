import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineDuplicate, HiOutlineLightningBolt, HiOutlineTemplate,
  HiOutlineViewGrid, HiOutlineGlobeAlt, HiOutlineShieldCheck,
  HiOutlineClock, HiOutlineServer, HiOutlineSave,
  HiOutlineClipboard, HiOutlineTrash, HiOutlineCheck
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import {
  deleteLandingCustomDomain,
  fetchLandingCustomDomain,
  generateLandingHtmlWithAi,
  postLandingCustomDomainVerify,
  putLandingCustomDomain,
} from '../services/landingPagesAdminApi.service.js';
import { getLandingManualInsertSnippets } from '../utils/injectLandingEnhancements.js';
import { normalizeLandingLpTrackApiBase } from '../utils/normalizeLandingLpTrackApiBase.js';
import TemplateGallery from './TemplateGallery.jsx';
import VisualBlockEditor from './VisualBlockEditor.jsx';

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
  const { t } = useI18n();
  const snippetContext = useMemo(() => {
    const slug = String(form.slug || '').trim().toLowerCase();
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const apiBase = normalizeLandingLpTrackApiBase(
      String(import.meta.env.VITE_API_URL || `${origin}/api`)
    );
    return getLandingManualInsertSnippets({ slug, frontendOrigin: origin, apiBase }, t);
  }, [form.slug, t]);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [visualEditorOpen, setVisualEditorOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setAiOpen(false);
      setAiPrompt('');
      setAiBusy(false);
      setTemplateGalleryOpen(false);
      setVisualEditorOpen(false);
    }
  }, [open]);

  const runAiGenerate = async () => {
    const p = String(aiPrompt || '').trim();
    if (!p) {
      toast.error(t('landingPageEditor.enterDescription'));
      return;
    }
    setAiBusy(true);
    try {
      const res = await generateLandingHtmlWithAi({
        prompt: p,
        title: String(form.title || '').trim() || undefined,
      });
      if (!res?.success || !res?.data?.html) {
        throw new Error(res?.message || t('landingPageEditor.invalidResponse'));
      }
      let html = String(res.data.html);
      const nextTitle = String(res.data.title || '').trim();
      if (snippetContext.iframeBlock && html.includes(LP_FORM_MARKER)) {
        html = html.split(LP_FORM_MARKER).join(snippetContext.iframeBlock);
      } else if (snippetContext.iframeBlock && !html.includes(LP_FORM_MARKER)) {
        toast(t('landingPageEditor.noFormPosition'), { icon: 'ℹ️' });
      } else if (!snippetContext.iframeBlock) {
        toast(t('landingPageEditor.enterSlugForEmbed'), { icon: 'ℹ️' });
      }
      setForm((prev) => ({
        ...prev,
        htmlContent: html,
        ...(nextTitle ? { title: nextTitle } : {}),
      }));
      toast.success(t('landingPageEditor.htmlGenerated'));
      setAiOpen(false);
      setAiPrompt('');
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || t('landingPageEditor.htmlFailed'));
    } finally {
      setAiBusy(false);
    }
  };

  const handleTemplateSelect = ({ template, html, cssVariables: _cssVariables, defaultConfig: _defaultConfig }) => {
    let finalHtml = html;
    // Insert form marker if not present
    if (!finalHtml.includes(LP_FORM_MARKER) && snippetContext?.iframeBlock) {
      finalHtml += `\n${LP_FORM_MARKER}`;
    }
    setForm((prev) => ({
      ...prev,
      htmlContent: finalHtml,
      // Also save template info if needed
      templateId: template.id,
      templateName: template.name,
    }));
    toast.success(t('landingPageEditor.templateUsed'));
  };

  const handleVisualEditorSave = ({ html, data: _data }) => {
    let finalHtml = html;
    // Insert form marker if not present
    if (!finalHtml.includes(LP_FORM_MARKER) && snippetContext?.iframeBlock) {
      finalHtml += `\n${LP_FORM_MARKER}`;
    }
    setForm((prev) => ({
      ...prev,
      htmlContent: finalHtml,
    }));
      toast.success(t('landingPageEditor.visualSaved'));
    setVisualEditorOpen(false);
  };

  const copyText = async (label, text) => {
    if (!String(text || '').trim()) {
      toast.error(t('landingPageEditor.noContentToCopy'));
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('landingPageEditor.copied'));
    } catch {
      toast.error(t('landingPageEditor.copyFailed'));
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
        if (!cancelled) toast.error(t('landingPageEditor.loadDomainFailed'));
      })
      .finally(() => {
        if (!cancelled) setCdLoading(false);
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingId]);

  const saveCustomDomainHostname = async () => {
    if (!editingId) return;
    const h = String(cdHostnameDraft || '').trim().toLowerCase();
    if (!h) {
      toast.error(t('landingPageEditor.hostnameFormat'));
      return;
    }
    setCdBusy(true);
    try {
      const res = await putLandingCustomDomain(editingId, h);
      if (!res?.success) throw new Error(res?.message || t('landingPageEditor.saveFailed'));
      setCdInfo(res.data);
      toast.success(t('landingPageEditor.dnsSaved'));
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || t('landingPageEditor.saveDomainFailed'));
    } finally {
      setCdBusy(false);
    }
  };

  const verifyCustomDomain = async () => {
    if (!editingId) return;
    setCdBusy(true);
    try {
      const res = await postLandingCustomDomainVerify(editingId);
      if (!res?.success) throw new Error(res?.message || t('landingPageEditor.verifyFailed'));
      setCdInfo(res.data);
      toast.success(t('landingPageEditor.domainVerified'));
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || t('landingPageEditor.verifyFailed'));
    } finally {
      setCdBusy(false);
    }
  };

  const removeCustomDomain = async () => {
    if (!editingId) return;
    if (!window.confirm(t('landingPageEditor.confirmRemoveDomain'))) return;
    setCdBusy(true);
    try {
      const res = await deleteLandingCustomDomain(editingId);
      if (!res?.success) throw new Error(res?.message || t('landingPageEditor.deleteFailed'));
      setCdInfo({ configured: false, instructions: null, record: null });
      setCdHostnameDraft('');
      toast.success(t('landingPageEditor.domainRemoved'));
    } catch (e) {
      toast.error(e?.response?.data?.message || e?.message || t('landingPageEditor.deleteDomainFailed'));
    } finally {
      setCdBusy(false);
    }
  };

  if (!open) return null;

  const overlay = (
    <div className="fixed inset-0 z-[200] flex flex-col bg-white">
      <header className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50/90">
        <h2 className="text-lg font-semibold text-gray-900">
          {editingId ? t('landingPageEditor.editLanding') : t('landingPageEditor.createLanding')}
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
              {t('landingPageEditor.openInNewTab')}
            </a>
          ) : null}
          <button
            type="button"
            className="btn btn-secondary text-sm flex items-center gap-1.5"
            onClick={() => setVisualEditorOpen(true)}
            title={t('landingPageEditor.visualEditor')}
          >
            <HiOutlineViewGrid className="w-4 h-4" />
            {t('landingPageEditor.visualEditor')}
          </button>
          <button
            type="button"
            className="btn btn-secondary text-sm flex items-center gap-1.5"
            onClick={() => setTemplateGalleryOpen(true)}
            title={t('landingPageEditor.selectTemplate')}
          >
            <HiOutlineTemplate className="w-4 h-4" />
            {t('landingPageEditor.template')}
          </button>
          <button
            type="button"
            className="btn btn-secondary text-sm flex items-center gap-1.5"
            onClick={() => setAiOpen(true)}
            title={t('landingPageEditor.generateWithAI')}
          >
            <HiOutlineLightningBolt className="w-4 h-4" />
            {t('landingPageEditor.aiGenerate')}
          </button>
          <button type="button" className="btn btn-secondary text-sm" onClick={onClose}>
            {t('common.close')}
          </button>
          <button type="button" className="btn btn-primary text-sm" onClick={onSave} disabled={saving}>
            {saving ? t('landingPageEditor.saving') : t('landingPageEditor.save')}
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        <section className="flex flex-col min-h-[40vh] lg:min-h-0 lg:w-1/2 lg:border-r border-gray-200 overflow-hidden">
          <div className="shrink-0 p-4 space-y-3 border-b border-gray-100 bg-white overflow-y-auto max-h-[48vh] lg:max-h-[50%]">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('landingPageEditor.slug')}</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono"
                  value={form.slug}
                  onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value.replace(/^\/+/, '') }))}
                  placeholder={t('landingPageEditor.slugPlaceholder')}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('landingPageEditor.pageTitle')}</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  value={form.title}
                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                  placeholder={t('landingPageEditor.pageTitlePlaceholder')}
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
              {t('landingPageEditor.publish')}
            </label>

            {/* Custom Domain Section */}
            <div className="rounded-2xl border-2 border-slate-200 bg-gradient-to-br from-slate-50 to-blue-50 overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-4 py-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <HiOutlineGlobeAlt className="w-5 h-5 text-white" />
                    <h3 className="font-bold text-white">Custom Domain</h3>
                  </div>
                  {cdInfo?.status === 'active' && (
                    <span className="px-2 py-1 bg-green-500 text-white text-xs font-bold rounded-full flex items-center gap-1">
                      <HiOutlineShieldCheck className="w-3 h-3" />
                      Active
                    </span>
                  )}
                </div>
              </div>

              <div className="p-4 space-y-4">
                {/* What is this */}
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <h4 className="font-bold text-blue-800 mb-2 flex items-center gap-2">
                    <HiOutlineGlobeAlt className="w-4 h-4" />
                    Custom Domain là gì?
                  </h4>
                  <p className="text-sm text-blue-700 leading-relaxed">
                    Thay vì dùng link <code className="bg-blue-100 px-1 rounded">app.uknow.io/lp/yourpage</code>, 
                    bạn có thể dùng domain riêng như <code className="bg-blue-100 px-1 rounded">yoursite.com</code>. 
                    Tạo thương hiệu chuyên nghiệp hơn!
                  </p>
                </div>

                {!editingId ? (
                  <div className="text-center py-6 bg-slate-100 rounded-xl">
                    <HiOutlineGlobeAlt className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                    <p className="font-medium text-slate-600">Lưu landing page trước</p>
                    <p className="text-sm text-slate-500 mt-1">để cấu hình custom domain</p>
                  </div>
                ) : cdLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-8 h-8 border-3 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                  </div>
                ) : (
                  <>
                    {/* Status Cards */}
                    {cdInfo?.status === 'active' ? (
                      <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center shadow-lg shadow-green-200">
                            <HiOutlineCheck className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="font-bold text-green-800 text-lg">{cdInfo.hostname}</p>
                            <p className="text-sm text-green-600">Domain đã được kích hoạt thành công!</p>
                          </div>
                        </div>
                      </div>
                    ) : cdInfo?.configured ? (
                      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-300 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 bg-amber-500 rounded-full flex items-center justify-center shadow-lg shadow-amber-200">
                            <HiOutlineClock className="w-6 h-6 text-white" />
                          </div>
                          <div className="flex-1">
                            <p className="font-bold text-amber-800 text-lg">{cdInfo.hostname}</p>
                            <p className="text-sm text-amber-600">Đang chờ xác minh DNS</p>
                          </div>
                        </div>
                      </div>
                    ) : null}

                    {/* Input Domain */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                      <label className="block text-sm font-bold text-slate-700 mb-3">
                        Nhập tên miền của bạn
                      </label>
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          className="flex-1 rounded-xl border-2 border-slate-200 px-4 py-3 text-sm font-mono outline-none focus:border-blue-400 transition-colors"
                          placeholder="ví dụ: yoursite.com"
                          value={cdHostnameDraft}
                          onChange={(e) => setCdHostnameDraft(e.target.value)}
                          disabled={cdBusy || cdInfo?.status === 'active'}
                        />
                        <button
                          type="button"
                          className="px-8 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-200"
                          disabled={cdBusy || cdInfo?.status === 'active' || !cdHostnameDraft.trim()}
                          onClick={saveCustomDomainHostname}
                        >
                          {cdBusy ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <>
                              <HiOutlineSave className="w-5 h-5" />
                              Lưu Domain
                            </>
                          )}
                        </button>
                      </div>
                      <p className="text-xs text-slate-500 mt-2">
                        Hỗ trợ cả apex domain (yoursite.com) và www domain (www.yoursite.com)
                      </p>
                    </div>

                    {/* DNS Records & Guide */}
                    {cdInfo?.record && cdInfo?.status !== 'active' && (
                      <div className="space-y-4">
                        {/* DNS Record Card */}
                        <div className="bg-white border-2 border-purple-200 rounded-xl overflow-hidden">
                          <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3">
                            <h4 className="font-bold text-white flex items-center gap-2">
                              <HiOutlineServer className="w-5 h-5" />
                              Thêm DNS Record này vào nhà cung cấp domain
                            </h4>
                          </div>
                          <div className="p-4 space-y-4">
                            <div className="flex items-center gap-3">
                              <span className="px-4 py-2 bg-blue-500 text-white text-sm font-bold rounded-lg">TXT</span>
                              <div className="flex-1">
                                <p className="text-xs text-slate-500">Hostname</p>
                                <code className="text-sm font-mono font-bold text-slate-800">
                                  {cdInfo.record.name || '(root/@)'}
                                </code>
                              </div>
                            </div>
                            <div>
                              <p className="text-xs text-slate-500 mb-2">Giá trị (Value)</p>
                              <div className="flex items-center gap-2">
                                <code className="flex-1 bg-slate-100 px-4 py-3 rounded-xl text-sm font-mono break-all">
                                  {cdInfo.record.value}
                                </code>
                                <button
                                  onClick={() => copyText(cdInfo.record.value, 'txt-value')}
                                  className="p-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors"
                                  title="Copy giá trị"
                                >
                                  <HiOutlineClipboard className="w-5 h-5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Simple Guide */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                          <p className="text-sm text-slate-600 leading-relaxed">
                            <strong>Cách thêm:</strong> Đăng nhập vào trang quản lý domain của bạn → Tìm mục DNS Settings → Thêm TXT record với thông tin bên trên → Lưu.
                          </p>
                        </div>

                        {/* Verify Button */}
                        <button
                          type="button"
                          className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-3 shadow-lg shadow-green-200"
                          disabled={cdBusy}
                          onClick={verifyCustomDomain}
                        >
                          {cdBusy ? (
                            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <>
                              <HiOutlineShieldCheck className="w-6 h-6" />
                              Xác minh DNS
                            </>
                          )}
                        </button>

                        {/* Warning */}
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                          <p className="text-sm text-amber-800">
                            <strong>⏱️ Lưu ý:</strong> DNS có thể mất 5-30 phút để cập nhật. Đôi khi cần đến 24 giờ.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Remove Domain */}
                    {cdInfo?.configured && (
                      <button
                        type="button"
                        className="w-full py-3 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl font-medium transition-colors flex items-center justify-center gap-2"
                        disabled={cdBusy}
                        onClick={removeCustomDomain}
                      >
                        <HiOutlineTrash className="w-5 h-5" />
                        Xóa domain đã cấu hình
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="rounded-lg bg-amber-50 border border-amber-100 px-3 py-2 text-xs text-amber-950 leading-relaxed space-y-2">
              <p>
                <strong>{t('landingPageEditor.whenSave')}:</strong> {t('landingPageEditor.saveDescription')}
              </p>
              {!snippetContext.combined ? (
                <p className="text-amber-800">{t('landingPageEditor.enterSlugForCode')}</p>
              ) : (
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <span>{t('landingPageEditor.formIframeBlock')}</span>
                      <button
                        type="button"
                        className="text-primary-600 flex items-center gap-1 shrink-0 text-[11px]"
                        onClick={() => copyText('iframe form', snippetContext.iframeBlock)}
                      >
                        <HiOutlineDuplicate className="w-3.5 h-3.5" />
                        {t('common.copy')}
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
                      <span>{t('landingPageEditor.scriptTrackingBlock')}</span>
                      <button
                        type="button"
                        className="text-primary-600 flex items-center gap-1 shrink-0 text-[11px]"
                        onClick={() => copyText('script tracking', snippetContext.scriptBlock)}
                      >
                        <HiOutlineDuplicate className="w-3.5 h-3.5" />
                        {t('common.copy')}
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
                    {t('landingPageEditor.copyBothBlocks')}
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
                  {t('landingPageEditor.copyUrl')}
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
              placeholder={t('landingPageEditor.htmlPlaceholder')}
              spellCheck={false}
            />
          </div>
        </section>

        <section className="flex flex-col min-h-[40vh] lg:min-h-0 lg:w-1/2 bg-gray-100 border-t lg:border-t-0 border-gray-200">
          <div className="shrink-0 px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-200 bg-gray-50">
            {t('landingPageEditor.preview')}
          </div>
          <iframe
            title={t('landingPageEditor.landingPreview')}
            className="flex-1 w-full min-h-0 border-0 bg-white"
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin"
            srcDoc={
              previewSrcDoc ||
              `<!DOCTYPE html><html><body><p class="p-4 text-gray-500 text-sm">${t('landingPageEditor.enterSlugHtmlToPreview')}</p></body></html>`
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
        <h3 className="text-lg font-semibold text-gray-900">{t('landingPageEditor.createWithAI')}</h3>
        <p className="text-sm text-gray-600 leading-relaxed">
          {t('landingPageEditor.aiGenerationDescription')}
        </p>
        <textarea
          className="w-full min-h-[120px] rounded-lg border border-gray-300 px-3 py-2 text-sm"
          placeholder={t('landingPageEditor.aiPromptPlaceholder')}
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          disabled={aiBusy}
        />
        <div className="flex justify-end gap-2 flex-wrap">
          <button type="button" className="btn btn-secondary text-sm" onClick={() => !aiBusy && setAiOpen(false)}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary text-sm" onClick={runAiGenerate} disabled={aiBusy}>
            {aiBusy ? t('landingPageEditor.generating') : t('landingPageEditor.generate')}
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

      {/* Template Gallery Modal */}
      <TemplateGallery
        isOpen={templateGalleryOpen}
        onClose={() => setTemplateGalleryOpen(false)}
        onSelect={handleTemplateSelect}
        onGenerateWithAi={() => {
          setTemplateGalleryOpen(false);
          setAiOpen(true);
        }}
      />

      {/* Visual Block Editor Modal */}
      <VisualBlockEditor
        isOpen={visualEditorOpen}
        initialHtml={form.htmlContent}
        initialData={{}}
        onSave={handleVisualEditorSave}
        onClose={() => setVisualEditorOpen(false)}
      />
    </>
  );
}
