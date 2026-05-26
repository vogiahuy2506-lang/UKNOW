import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineDuplicate, HiOutlineLightningBolt, HiOutlineTemplate,
  HiOutlineViewGrid
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

            <div className="rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2 text-xs text-sky-950 space-y-2">
              <p className="font-medium text-sky-900">{t('landingPageEditor.customDomain')}</p>
              {!editingId ? (
                <p className="text-sky-800">{t('landingPageEditor.saveToConfigureDomain')}</p>
              ) : cdLoading ? (
                <p className="text-sky-700">{t('landingPageEditor.loadingConfig')}</p>
              ) : (
                <>
                  <p className="text-sky-800 leading-relaxed">
                    {t('landingPageEditor.domainInstructions')}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      className="flex-1 rounded border border-sky-200/90 bg-white px-2 py-1.5 text-sm font-mono"
                      placeholder={t('landingPageEditor.domainPlaceholder')}
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
                      {t('landingPageEditor.saveHostname')}
                    </button>
                  </div>
                  {cdInfo?.record ? (
                    <div className="space-y-1">
                      <div className="flex justify-between gap-2">
                        <span className="font-medium text-sky-900">{t('landingPageEditor.txtRecord')}</span>
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
                          {t('common.copy')}
                        </button>
                      </div>
                      <textarea
                        readOnly
                        className="w-full h-16 rounded border border-sky-200 bg-white px-2 py-1 text-[11px] font-mono"
                        value={`${t('landingPageEditor.name')}: ${cdInfo.record.name}\n${t('landingPageEditor.value')}: ${cdInfo.record.value}`}
                        spellCheck={false}
                      />
                      <button
                        type="button"
                        className="btn btn-primary text-xs py-1.5"
                        disabled={cdBusy}
                        onClick={verifyCustomDomain}
                      >
                        {t('landingPageEditor.verifyDNS')}
                      </button>
                    </div>
                  ) : null}
                  {cdInfo?.status === 'active' ? (
                    <p className="text-emerald-800 font-medium">{t('landingPageEditor.activated')}: {cdInfo.hostname}</p>
                  ) : null}
                  {cdInfo?.configured ? (
                    <button
                      type="button"
                      className="text-red-600 text-[11px] hover:underline"
                      disabled={cdBusy}
                      onClick={removeCustomDomain}
                    >
                      {t('landingPageEditor.removeDomain')}
                    </button>
                  ) : null}
                </>
              )}
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
