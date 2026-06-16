/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineTemplate,
  HiOutlineViewGrid, HiOutlineGlobeAlt, HiOutlineChevronDown, HiOutlineChevronRight,
  HiOutlineClipboard, HiOutlineTrash, HiOutlineCheck, HiOutlineExternalLink,
  HiOutlineQuestionMarkCircle, HiOutlineCode, HiOutlineX
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
import SaveTemplateModal from './SaveTemplateModal.jsx';
import { normalizeLandingLpTrackApiBase } from '../utils/normalizeLandingLpTrackApiBase.js';
import TemplateGallery from './TemplateGallery.jsx';
import VisualBlockEditor from './VisualBlockEditor.jsx';

const LP_FORM_MARKER = '<!-- UKNOW_LP_FORM -->';
const BASE_DOMAIN = 'founderai.biz';

const getAiErrorMessage = (error, t, fallbackKey) => {
  const data = error?.response?.data || {};
  if (data.resource === 'ai_token' || data.code === 'RESOURCE_LIMIT_EXCEEDED') {
    return t('aiChatbot.aiTokenExceeded');
  }
  return data.message || error?.message || t(fallbackKey);
};

// AI Templates for quick generation
const AI_TEMPLATES = {
  saas: {
    name: 'SaaS / Phần mềm',
    icon: '💻',
    color: '#3b82f6',
    prompt: 'Tạo landing page cho một sản phẩm SaaS với các section: Hero với headline mạnh, Tính năng chính 3 cột, Đánh giá khách hàng, FAQ, Form đăng ký, và Footer. Sử dụng tone chuyên nghiệp, hiện đại.'
  },
  course: {
    name: 'Khóa học online',
    icon: '📚',
    color: '#8b5cf6',
    prompt: 'Tạo landing page cho khóa học online với: Hero với tiêu đề hấp dẫn, Giới thiệu khóa học, Lợi ích khi học, Testimonials từ học viên, FAQ, Form đăng ký, và Footer. Sử dụng tone truyền cảm hứng, đáng tin cậy.'
  },
  ecommerce: {
    name: 'Cửa hàng online',
    icon: '🛒',
    color: '#10b981',
    prompt: 'Tạo landing page cho cửa hàng online với: Hero với sản phẩm nổi bật, Cam kết của cửa hàng, Danh mục sản phẩm, Đánh giá khách hàng, Ưu đãi đặc biệt, Form liên hệ, và Footer. Sử dụng tone thân thiện, đáng tin.'
  },
  agency: {
    name: 'Dịch vụ/Agency',
    icon: '🎯',
    color: '#f59e0b',
    prompt: 'Tạo landing page cho agency dịch vụ với: Hero với USP rõ ràng, Dịch vụ cung cấp, Case study thành công, Đội ngũ chuyên gia, Quy trình làm việc, Form tư vấn, và Footer. Sử dụng tone chuyên nghiệp, đáng tin.'
  },
  event: {
    name: 'Sự kiện/Hội thảo',
    icon: '🎪',
    color: '#ec4899',
    prompt: 'Tạo landing page cho sự kiện/hội thảo với: Hero với thông tin sự kiện, Diễn giả nổi bật, Lịch trình sự kiện, Địa điểm và thời gian, Testimonials, Form đăng ký tham gia, và Footer. Sử dụng tone năng động, hấp dẫn.'
  },
};

function SectionCard({ title, icon: Icon, children, defaultOpen = false }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-gray-600" />}
          <span className="font-medium text-gray-800">{title}</span>
        </div>
        {isOpen ? (
          <HiOutlineChevronDown className="w-5 h-5 text-gray-400" />
        ) : (
          <HiOutlineChevronRight className="w-5 h-5 text-gray-400" />
        )}
      </button>
      {isOpen && (
        <div className="p-4 border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  );
}

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
    const result = getLandingManualInsertSnippets({ slug, frontendOrigin: origin, apiBase }, t);
    return {
      ...result,
      publicUrl: slug ? `https://${encodeURIComponent(slug)}.${BASE_DOMAIN}` : '',
    };
  }, [form.slug, t]);

  const [aiOpen, setAiOpen] = useState(false);
  const [aiMode, setAiMode] = useState('select'); // 'select' | 'custom'
  const [aiTemplate, setAiTemplate] = useState('saas');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [templateGalleryOpen, setTemplateGalleryOpen] = useState(false);
  const [visualEditorOpen, setVisualEditorOpen] = useState(false);
  const [saveTemplateModalOpen, setSaveTemplateModalOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setAiOpen(false);
      setAiPrompt('');
      setAiBusy(false);
      setAiMode('select');
      setAiTemplate('saas');
      setTemplateGalleryOpen(false);
      setVisualEditorOpen(false);
      setSaveTemplateModalOpen(false);
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
      setAiMode('select');
      setAiTemplate('saas');
    } catch (e) {
      toast.error(getAiErrorMessage(e, t, 'landingPageEditor.htmlFailed'));
    } finally {
      setAiBusy(false);
    }
  };

  // Quick generate with template
  const runQuickAiGenerate = async () => {
    const template = AI_TEMPLATES[aiTemplate];
    if (!template) return;
    
    setAiBusy(true);
    try {
      const res = await generateLandingHtmlWithAi({
        prompt: template.prompt,
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
      setAiMode('select');
      setAiTemplate('saas');
    } catch (e) {
      toast.error(getAiErrorMessage(e, t, 'landingPageEditor.htmlFailed'));
    } finally {
      setAiBusy(false);
    }
  };

  const handleTemplateSelect = ({ template, html, cssVariables: _cssVariables, defaultConfig: _defaultConfig }) => {
    let finalHtml = html;
    if (!finalHtml.includes(LP_FORM_MARKER) && snippetContext?.iframeBlock) {
      finalHtml += `\n${LP_FORM_MARKER}`;
    }
    setForm((prev) => ({
      ...prev,
      htmlContent: finalHtml,
      templateId: template.id,
      templateName: template.name,
    }));
    toast.success(t('landingPageEditor.templateUsed'));
  };

  const handleVisualEditorSave = ({ html, data: _data }) => {
    let finalHtml = html;
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

  // Save current landing page as template - uses SaveTemplateModal instead
  const handleSaveAsTemplate = () => {
    if (!form.htmlContent || !form.htmlContent.trim()) {
      toast.error('Không có nội dung để lưu template');
      return;
    }
    setSaveTemplateModalOpen(true);
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

  const slug = String(form.slug || '').trim().toLowerCase();
  const publicUrl = slug ? `https://${slug}.${BASE_DOMAIN}` : '';

  const overlay = (
    <div className="fixed inset-0 z-[200] flex flex-col bg-white">
      <header className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center gap-3">
          <HiOutlineGlobeAlt className="w-5 h-5 text-gray-600" />
          <h2 className="text-lg font-semibold text-gray-900">
            {editingId ? t('landingPageEditor.editLanding') : t('landingPageEditor.createLanding')}
          </h2>
          {slug && (
            <code className="text-sm bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono">
              {slug}.{BASE_DOMAIN}
            </code>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {publicUrl && (
            <>
              <button
                type="button"
                onClick={() => copyText('URL', publicUrl)}
                className="p-2 rounded text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
                title="Copy URL"
              >
                <HiOutlineClipboard className="w-4 h-4" />
              </button>
              <a
                href={publicUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded text-gray-500 hover:bg-gray-100 hover:text-blue-600 transition-colors"
                title="Mở trong tab mới"
              >
                <HiOutlineExternalLink className="w-4 h-4" />
              </a>
            </>
          )}
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
            onClick={handleSaveAsTemplate}
            className="btn btn-secondary text-sm flex items-center gap-1.5"
            title="Lưu thành template"
          >
            <HiOutlineTemplate className="w-4 h-4" />
            Lưu template
          </button>
          <button
            type="button"
            onClick={() => setTemplateGalleryOpen(true)}
            className="btn btn-secondary text-sm flex items-center gap-1.5"
            title={t('landingPageEditor.selectTemplate')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Template
          </button>
          <button
            type="button"
            onClick={() => setAiOpen(true)}
            className="btn btn-secondary text-sm flex items-center gap-1.5"
            title={t('landingPageEditor.generateWithAI')}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            <span>{t('landingPageEditor.aiGenerate')}</span>
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
          <div className="shrink-0 p-4 space-y-3 border-b border-gray-100 bg-white overflow-y-auto max-h-[55vh] lg:max-h-[55%]">

            {/* Basic Info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('landingPagesAdmin.slug')}</label>
                <div className="flex items-center rounded-lg border border-gray-300 overflow-hidden focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
                  <input
                    className="flex-1 px-3 py-2 text-sm font-mono outline-none min-w-0"
                    value={form.slug}
                    onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value.replace(/^\/+/, '') }))}
                    placeholder="your-slug"
                  />
                  <span className="px-3 py-2 text-sm text-gray-500 bg-gray-50 border-l border-gray-300 font-mono flex-shrink-0">
                    .{BASE_DOMAIN}
                  </span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('landingPageEditor.pageTitle')}</label>
                <input
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
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
                className="rounded border-gray-300 text-blue-600"
              />
              {t('landingPageEditor.publish')}
            </label>

            {/* Custom Domain Section */}
            <SectionCard title="Custom Domain" icon={HiOutlineGlobeAlt} defaultOpen={true}>
              <div className="space-y-4">
                {/* Quick Help */}
                <div className="flex items-start gap-2 text-sm text-gray-600 bg-blue-50 p-3 rounded-lg">
                  <HiOutlineQuestionMarkCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-blue-500" />
                  <p>
                    Sử dụng domain riêng như <code className="bg-blue-100 px-1 rounded">yoursite.com</code> thay vì <code className="bg-blue-100 px-1 rounded">slug.{BASE_DOMAIN}</code>.
                    <span className="block mt-1">Nếu domain thuộc Cloudflare đã được hệ thống cấu hình, DNS sẽ được tạo tự động; nếu không, hãy thêm CNAME theo hướng dẫn bên dưới.</span>
                  </p>
                </div>

                {!editingId ? (
                  <p className="text-sm text-gray-500 text-center py-4">
                    Lưu landing page trước để cấu hình custom domain
                  </p>
                ) : cdLoading ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
                  </div>
                ) : (
                  <>
                    {/* Domain Already Active */}
                    {cdInfo?.status === 'active' && (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-4 bg-green-50 border border-green-200 rounded-lg">
                          <HiOutlineCheck className="w-6 h-6 text-green-600 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="font-semibold text-green-800 text-lg">{cdInfo.hostname}</p>
                            <p className="text-sm text-green-600">
                              {cdInfo.cfManaged ? 'Domain đã kích hoạt tự động qua Cloudflare.' : 'Domain đã kích hoạt.'}
                            </p>
                          </div>
                          <a
                            href={`https://${cdInfo.hostname}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="btn btn-sm btn-outline"
                          >
                            Mở domain
                          </a>
                        </div>
                        <button
                          type="button"
                          className="text-sm text-red-600 hover:text-red-700 hover:underline"
                          onClick={removeCustomDomain}
                        >
                          Xóa domain này
                        </button>
                      </div>
                    )}

                    {/* No Domain Configured - Main UX */}
                    {(!cdInfo?.configured || cdInfo?.status !== 'active') && (
                      <div className="space-y-4">
                        {/* Domain Input + Add Button */}
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            className="flex-1 rounded-lg border border-gray-300 px-4 py-3 text-base font-mono focus:border-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-opacity-20"
                            placeholder="yoursite.com"
                            value={cdHostnameDraft}
                            onChange={(e) => setCdHostnameDraft(e.target.value)}
                          />
                          <button
                            type="button"
                            className="btn btn-primary py-3 px-6 text-base font-medium whitespace-nowrap"
                            disabled={!cdHostnameDraft.trim() || cdBusy}
                            onClick={saveCustomDomainHostname}
                          >
                            {cdBusy ? 'Đang xử lý...' : 'Thêm Domain'}
                          </button>
                        </div>

                        {/* Manual DNS Instructions - Only show if domain is pending */}
                        {cdInfo?.configured && cdInfo?.status === 'pending_verification' && (
                          <div className="border border-amber-200 rounded-lg overflow-hidden">
                            <div className="bg-amber-50 px-4 py-2 border-b border-amber-200">
                              <p className="font-medium text-amber-800">
                                Domain đang chờ xác minh
                              </p>
                            </div>
                            <div className="p-4 space-y-4">
                              <p className="text-sm text-gray-600">
                                Thêm bản ghi CNAME tại nhà cung cấp domain của bạn:
                              </p>
                              <div className="bg-gray-50 rounded-lg p-3 font-mono text-sm">
                                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                                  <span className="text-gray-500">Type:</span><span>CNAME</span>
                                  <span className="text-gray-500">Name:</span><span>{cdInfo.hostname}</span>
                                  <span className="text-gray-500">Value:</span>
                                  <span className="break-all">{cdInfo.record?.value || 'verify.founderai.biz'}</span>
                                </div>
                              </div>
                              <button
                                type="button"
                                className="btn btn-primary w-full"
                                disabled={cdBusy}
                                onClick={verifyCustomDomain}
                              >
                                {cdBusy ? 'Đang xác minh...' : 'Đã thêm DNS - Xác minh ngay'}
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Remove Domain */}
                        {cdInfo?.configured && (
                          <div className="pt-2 border-t border-gray-100">
                            <button
                              type="button"
                              className="text-sm text-gray-500 hover:text-red-600"
                              onClick={removeCustomDomain}
                            >
                              Hủy bỏ cấu hình domain
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </SectionCard>

            {/* LP Track Snippets */}
            <SectionCard title="Mã nhúng & Tracking" icon={HiOutlineCode} defaultOpen={false}>
              <div className="space-y-4">
                <p className="text-sm text-gray-600">
                  {t('landingPageEditor.whenSave')}: {t('landingPageEditor.saveDescription')}
                </p>

                {!snippetContext.combined ? (
                  <div className="flex items-center justify-center py-8 text-sm text-gray-400">
                    <HiOutlineCode className="w-5 h-5 mr-2" />
                    {t('landingPageEditor.enterSlugToSeeCode')}
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* URL Preview */}
                    <div className="p-3 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-100">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <span className="text-xs font-medium text-orange-700">{t('landingPageEditor.landingUrl')}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-xs font-mono text-gray-700 truncate">
                          {snippetContext.publicUrl}
                        </code>
                        <button
                          type="button"
                          className="flex-shrink-0 px-2 py-1 text-xs bg-white hover:bg-orange-100 text-orange-600 rounded border border-orange-200 transition-colors"
                          onClick={() => copyText('URL', snippetContext.publicUrl)}
                        >
                          Copy URL
                        </button>
                      </div>
                    </div>

                    {/* Embed Code Cards */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Iframe Form */}
                      <div className="rounded-lg border border-gray-200 overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-blue-100 rounded-lg flex items-center justify-center">
                              <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                              </svg>
                            </div>
                            <div>
                              <span className="text-sm font-medium text-gray-800">{t('landingPageEditor.iframeFormLabel')}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-1"
                            onClick={() => copyText('iframe form', snippetContext.iframeBlock)}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy
                          </button>
                        </div>
                        <div className="p-3 bg-[#1e1e1e]">
                          <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap break-all leading-relaxed">
                            {snippetContext.iframeBlock}
                          </pre>
                        </div>
                      </div>

                      {/* Tracking Script */}
                      <div className="rounded-lg border border-gray-200 overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 bg-purple-100 rounded-lg flex items-center justify-center">
                              <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                              </svg>
                            </div>
                            <div>
                              <span className="text-sm font-medium text-gray-800">{t('landingPageEditor.trackingScriptLabel')}</span>
                            </div>
                          </div>
                          <button
                            type="button"
                            className="px-2.5 py-1 text-xs font-medium bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors flex items-center gap-1"
                            onClick={() => copyText('script tracking', snippetContext.scriptBlock)}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            Copy
                          </button>
                        </div>
                        <div className="p-3 bg-[#1e1e1e]">
                          <pre className="text-xs font-mono text-green-400 whitespace-pre-wrap break-all leading-relaxed">
                            {snippetContext.scriptBlock}
                          </pre>
                        </div>
                      </div>
                    </div>

                    {/* Copy Both Button */}
                    <button
                      type="button"
                      className="w-full py-2.5 px-4 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-sm font-medium rounded-lg transition-all flex items-center justify-center gap-2 shadow-sm"
                      onClick={() => copyText('cả hai khối', snippetContext.combined)}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                      {t('landingPageEditor.copyBothBlocks')}
                    </button>
                  </div>
                )}
              </div>
            </SectionCard>
          </div>

          {/* HTML Editor */}
          <div className="flex-1 flex flex-col min-h-0 p-4 bg-white">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <label className="block text-sm font-medium text-gray-700">
                HTML Content
              </label>
            </div>
            <textarea
              className="flex-1 w-full min-h-[200px] rounded-lg border border-gray-300 px-3 py-2 text-xs font-mono resize-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              value={form.htmlContent}
              onChange={(e) => setForm((p) => ({ ...p, htmlContent: e.target.value }))}
              placeholder={t('landingPageEditor.htmlPlaceholder')}
              spellCheck={false}
            />
          </div>
        </section>

        <section className="flex flex-col min-h-[40vh] lg:min-h-0 lg:w-1/2 bg-gray-50 border-t lg:border-t-0 border-gray-200">
          <div className="shrink-0 px-3 py-2 text-xs font-medium text-gray-500 border-b border-gray-200 bg-gray-100 flex items-center justify-between">
            <span>{t('landingPageEditor.preview')}</span>
            <div className="flex items-center gap-2">
              {slug && (
                <a
                  href={publicUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-blue-600 hover:underline"
                >
                  <HiOutlineExternalLink className="w-3 h-3" />
                  Mở trong tab mới
                </a>
              )}
             
            </div>
          </div>
          <iframe
            title={t('landingPageEditor.landingPreview')}
            className="flex-1 w-full min-h-0 border-0 bg-white"
            sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin"
            srcDoc={
              previewSrcDoc ||
              `<!DOCTYPE html><html><body><p class="p-4 text-gray-500 text-sm text-center">${t('landingPageEditor.enterSlugHtmlToPreview')}</p></body></html>`
            }
          />
        </section>
      </div>
    </div>
  );

  // AI Modal Overlay
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
          className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Modal Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-gray-50">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
                <svg className="w-5 h-5 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Tạo landing page với AI</h3>
                <p className="text-sm text-gray-500">Chọn loại hoặc nhập mô tả tùy chỉnh</p>
              </div>
            </div>
            <button
              onClick={() => !aiBusy && setAiOpen(false)}
              className="p-2 hover:bg-gray-200 rounded-lg transition-colors"
            >
              <HiOutlineX className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Modal Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Mode Tabs */}
            <div className="flex items-center gap-1 mb-6 bg-gray-100 p-1 rounded-lg">
              <button
                onClick={() => setAiMode('select')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  aiMode === 'select'
                    ? 'bg-white shadow text-orange-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <HiOutlineTemplate className="w-4 h-4" />
                Chọn mẫu có sẵn
              </button>
              <button
                onClick={() => setAiMode('custom')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  aiMode === 'custom'
                    ? 'bg-white shadow text-orange-600'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Mô tả tùy chỉnh
              </button>
            </div>

            {aiMode === 'select' ? (
              <>
                {/* Template Selection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-3">
                    Chọn loại sản phẩm/dịch vụ
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(AI_TEMPLATES).map(([key, template]) => (
                      <button
                        key={key}
                        onClick={() => setAiTemplate(key)}
                        className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                          aiTemplate === key
                            ? 'border-orange-500 bg-orange-50 shadow-md'
                            : 'border-gray-200 bg-white hover:border-orange-300 hover:bg-orange-50/50'
                        }`}
                      >
                        <span className="text-2xl">{template.icon}</span>
                        <span className="text-sm font-medium text-gray-700 text-left">{template.name}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Template Preview */}
                <div className="bg-orange-50 rounded-xl p-4 border border-orange-100">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <h4 className="text-sm font-medium text-orange-700">AI sẽ tạo:</h4>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">1</span>
                      Hero Section với headline
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">2</span>
                      Tính năng 3 cột
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">3</span>
                      Testimonials
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">4</span>
                      FAQ
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">5</span>
                      Form đăng ký
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-orange-100 rounded-full flex items-center justify-center text-orange-600">6</span>
                      Footer
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <>
                {/* Custom Prompt */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Mô tả landing page bạn muốn tạo
                  </label>
                  <textarea
                    className="w-full min-h-[160px] rounded-xl border border-gray-300 px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 resize-none"
                    placeholder={`Ví dụ: Tạo landing page cho một ứng dụng học tiếng Anh online với tone trẻ trung, năng động. Bao gồm section giới thiệu ứng dụng, các tính năng nổi bật, đánh giá từ người dùng, và form đăng ký dùng thử miễn phí.`}
                    value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    disabled={aiBusy}
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    <svg className="w-3 h-3 inline mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    Mô tả càng chi tiết, kết quả càng chính xác
                  </p>
                </div>

                {/* Quick Templates */}
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Hoặc chọn nhanh:</h4>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(AI_TEMPLATES).map(([key, template]) => (
                      <button
                        key={key}
                        onClick={() => setAiPrompt(template.prompt)}
                        className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-orange-50 text-gray-600 hover:text-orange-600 rounded-lg text-xs font-medium border border-gray-200 hover:border-orange-200 transition-colors"
                      >
                        <span>{template.icon}</span>
                        {template.name}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end gap-3">
            <button
              type="button"
              className="btn btn-secondary text-sm"
              onClick={() => !aiBusy && setAiOpen(false)}
              disabled={aiBusy}
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={aiMode === 'select' ? runQuickAiGenerate : runAiGenerate}
              disabled={aiBusy || (aiMode === 'custom' && !aiPrompt.trim())}
              className="btn btn-primary text-sm flex items-center gap-2"
            >
              {aiBusy ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Đang tạo...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  {aiMode === 'select' ? 'Tạo nhanh' : 'Tạo với AI'}
                </>
              )}
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
        onSaveAsTemplate={handleSaveAsTemplate}
      />

      {/* Save Template Modal */}
      <SaveTemplateModal
        isOpen={saveTemplateModalOpen}
        onClose={() => setSaveTemplateModalOpen(false)}
        htmlContent={form.htmlContent}
        landingPageTitle={form.title}
        onSuccess={() => {
          // Refresh template list if template gallery is open
        }}
      />
    </>
  );
}
