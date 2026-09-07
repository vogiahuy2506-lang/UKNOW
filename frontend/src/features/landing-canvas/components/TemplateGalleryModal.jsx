import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineX, HiOutlineSearch, HiOutlineViewGrid, HiOutlineDocumentText,
  HiOutlineTemplate, HiOutlineEye,
} from 'react-icons/hi';
import {
  fetchLandingTemplates,
  fetchLandingTemplateCategories,
  fetchLandingTemplateHtml,
  fetchMyLandingTemplates,
} from '../../landing-pages/services/landingPagesAdminApi.service.js';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';

/**
 * useI18n() trả về context stable (t được memo hóa bên trong provider).
 * Dùng cách này để tránh tc thay đổi reference mỗi render.
 */
function useStableI18n() {
  const { t } = useI18n();
  return (key, params) => t(`landingCanvas.templateGallery.${key}`, params);
}

/**
 * Template Gallery Modal — bật từ topbar icon.
 *
 * Props:
 *  - open: bool
 *  - currentHtml: htmlContent hiện tại
 *  - onApply: (html: string, title: string) => void
 *  - onClose: () => void
 */
export default function TemplateGalleryModal({ open, onApply, onClose }) {
  const tc = useStableI18n();
  const [activeTab, setActiveTab] = useState('public'); // 'public' | 'my'
  const [templates, setTemplates] = useState([]);
  const [myTemplates, setMyTemplates] = useState([]);
  const [categories, setCategories] = useState([]);
  const [activeCategory, setActiveCategory] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(null); // template id đang apply
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const cats = await fetchLandingTemplateCategories();
      if (Array.isArray(cats)) setCategories(cats);
      else if (Array.isArray(cats?.data)) setCategories(cats.data);
    } catch (e) {
      console.warn('[TemplateGallery] Failed to fetch categories:', e);
    }
  }, []);

  const fetchPublicTemplates = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (activeCategory) params.category = activeCategory;
      const tpls = await fetchLandingTemplates(params);
      let arr = Array.isArray(tpls) ? tpls : Array.isArray(tpls?.data) ? tpls.data : [];
      // filter public only
      arr = arr.filter(t => t.isPublic !== false);
      setTemplates(arr);
    } catch (e) {
      console.warn('[TemplateGallery] Failed to fetch templates:', e);
    } finally {
      setLoading(false);
    }
  }, [activeCategory]);

  const fetchMyTemplates = useCallback(async () => {
    try {
      const arr = await fetchMyLandingTemplates();
      setMyTemplates(Array.isArray(arr) ? arr : []);
    } catch (e) {
      console.warn('[TemplateGallery] Failed to fetch my templates:', e);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setSelectedTemplate(null);
    setPreviewHtml(null);
    setSearch('');
    setActiveCategory(null);
    fetchCategories();
    fetchPublicTemplates();
    fetchMyTemplates();
  }, [open, fetchCategories, fetchPublicTemplates, fetchMyTemplates]);

  const handleCategoryClick = useCallback((cat) => {
    setActiveCategory(prev => prev === cat ? null : cat);
    setSelectedTemplate(null);
    setPreviewHtml(null);
  }, []);

  const handleTemplateClick = useCallback(async (template) => {
    if (selectedTemplate?.id === template.id) {
      setSelectedTemplate(null);
      setPreviewHtml(null);
      return;
    }
    setSelectedTemplate(template);
    setPreviewHtml(null);
    setPreviewLoading(true);
    try {
      const htmlData = await fetchLandingTemplateHtml(template.id);
      const html = htmlData?.html || htmlData?.data?.html || htmlData?.data?.htmlContent || '';
      setPreviewHtml(html);
    } catch (e) {
      console.warn('[TemplateGallery] Failed to fetch template HTML:', e);
    } finally {
      setPreviewLoading(false);
    }
  }, [selectedTemplate]);

  const handleApply = useCallback(
    async (template) => {
      setApplying(template.id);
      try {
        const htmlData = await fetchLandingTemplateHtml(template.id);
        const rawHtml = htmlData?.html || htmlData?.data?.html || htmlData?.data?.htmlContent || '';
        onApply?.(rawHtml, template.name || template.title || 'Template');
        onClose?.();
      } catch (e) {
        toast.error(tc('loadError'));
      } finally {
        setApplying(null);
      }
    },
    [onApply, onClose, tc]
  );

  const displayedTemplates = activeTab === 'public' ? templates : myTemplates;

  const filtered = displayedTemplates.filter((t) => {
    const matchCat = !activeCategory || t.category === activeCategory;
    const matchSearch =
      !search ||
      (t.name || '').toLowerCase().includes(search.toLowerCase()) ||
      (t.description || '').toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="relative w-[calc(100vw-48px)] h-[calc(100vh-48px)] max-w-6xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-200 shrink-0">
          <HiOutlineViewGrid className="w-6 h-6 text-gray-500 shrink-0" />
          <h2 className="text-[20px] font-semibold text-gray-900">{tc('title')}</h2>
          <div className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          >
            <HiOutlineX className="w-6 h-6" />
          </button>
        </div>

        {/* Tabs + Search row */}
        <div className="flex items-center gap-4 px-6 py-3 border-b border-gray-100 shrink-0">
          {/* Tabs */}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => { setActiveTab('public'); setSelectedTemplate(null); setPreviewHtml(null); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[14px] font-medium transition-all ${
                activeTab === 'public'
                  ? 'bg-orange-100 text-orange-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <HiOutlineTemplate className="w-4 h-4" />
              {tc('publicTab')}
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[11px] bg-gray-200 text-gray-600">
                {templates.length}
              </span>
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('my'); setSelectedTemplate(null); setPreviewHtml(null); }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[14px] font-medium transition-all ${
                activeTab === 'my'
                  ? 'bg-orange-100 text-orange-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <HiOutlineDocumentText className="w-4 h-4" />
              {tc('myTab')}
              <span className="ml-1 px-1.5 py-0.5 rounded-full text-[11px] bg-gray-200 text-gray-600">
                {myTemplates.length}
              </span>
            </button>
          </div>

          {/* Search */}
          <div className="relative flex-1 max-w-72">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={tc('searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-gray-300 text-[14px] focus:outline-none focus:border-orange-400"
            />
          </div>
        </div>

        {/* Body: sidebar + grid + preview */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Sidebar - Categories */}
          <div className="w-56 border-r border-gray-100 overflow-y-auto shrink-0 p-3">
            <p className="text-[12px] font-semibold text-gray-400 uppercase mb-2 px-2">{tc('categories')}</p>
            <button
              type="button"
              onClick={() => { setActiveCategory(null); setSelectedTemplate(null); setPreviewHtml(null); }}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[14px] font-medium transition-all mb-0.5 ${
                !activeCategory ? 'bg-orange-100 text-orange-700' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <span>{tc('allCategory')}</span>
            </button>
            {categories.map((cat) => {
              const catName = typeof cat === 'string' ? cat : cat.category;
              return (
                <button
                  key={catName}
                  type="button"
                  onClick={() => handleCategoryClick(catName)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-[14px] font-medium transition-all mb-0.5 ${
                    activeCategory === catName ? 'bg-orange-100 text-orange-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span className="truncate">{catName}</span>
                </button>
              );
            })}
          </div>

          {/* Center - Templates Grid */}
          <div className="flex-1 min-w-0 overflow-y-auto p-4">
            {loading ? (
              <div className="flex items-center justify-center h-40">
                <div className="w-8 h-8 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-gray-400 text-[15px]">
                <HiOutlineViewGrid className="w-12 h-12 mb-2" />
                <p>{activeTab === 'my' ? tc('noMyTemplates') : tc('noMatch')}</p>
                <p className="text-[13px] mt-1">
                  {activeTab === 'my' ? tc('noMyTemplatesHint') : tc('noMatchHint')}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {filtered.map((tpl) => (
                  <div
                    key={tpl.id}
                    className={`group rounded-xl border-2 overflow-hidden transition-all cursor-pointer ${
                      selectedTemplate?.id === tpl.id
                        ? 'border-orange-500 shadow-orange-200 shadow-md'
                        : 'border-gray-200 hover:border-orange-300 hover:shadow-md'
                    }`}
                    onClick={() => handleTemplateClick(tpl)}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center relative overflow-hidden">
                      {tpl.thumbnailUrl ? (
                        <img
                          src={tpl.thumbnailUrl}
                          alt={tpl.name}
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            e.target.parentElement.classList.add('flex', 'items-center', 'justify-center');
                          }}
                        />
                      ) : (
                        <HiOutlineViewGrid className="w-10 h-10 text-gray-300" />
                      )}
                      {/* Selected indicator */}
                      {selectedTemplate?.id === tpl.id && (
                        <div className="absolute top-2 right-2 w-6 h-6 bg-orange-500 rounded-full flex items-center justify-center">
                          <HiOutlineEye className="w-3.5 h-3.5 text-white" />
                        </div>
                      )}
                      {/* Visibility badge */}
                      {tpl.isPublic !== undefined && (
                        <div className="absolute bottom-2 left-2">
                          <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            tpl.isPublic
                              ? 'bg-green-100 text-green-700'
                              : 'bg-purple-100 text-purple-700'
                          }`}>
                            {tpl.isPublic ? tc('public') : tc('private')}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="p-2.5">
                      <p className="text-[14px] font-semibold text-gray-900 truncate">{tpl.name || tpl.title}</p>
                      {tpl.description ? (
                        <p className="text-[12px] text-gray-500 mt-1 line-clamp-2">{tpl.description}</p>
                      ) : null}
                      {tpl.category ? (
                        <span className="inline-block mt-2 px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-600">
                          {tpl.category}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Sidebar - Preview */}
          <div className="w-80 border-l border-gray-100 flex flex-col shrink-0 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 shrink-0">
              <p className="text-[13px] font-semibold text-gray-500 uppercase">{tc('preview')}</p>
            </div>
            {selectedTemplate ? (
              <div className="flex-1 min-h-0 flex flex-col">
                <p className="px-4 py-2 text-[14px] font-semibold text-gray-800 shrink-0">
                  {selectedTemplate.name || selectedTemplate.title}
                </p>
                {selectedTemplate.description ? (
                  <p className="px-4 pb-2 text-[13px] text-gray-500 shrink-0">{selectedTemplate.description}</p>
                ) : null}
                <div className="flex-1 min-h-0 bg-gray-100 mx-2 mb-2 rounded-lg overflow-hidden border border-gray-200">
                  {previewLoading ? (
                    <div className="flex items-center justify-center h-full text-gray-400 text-[14px]">
                      <div className="w-6 h-6 border-2 border-gray-300 border-t-orange-500 rounded-full animate-spin mr-2" />
                      {tc('previewLoading')}
                    </div>
                  ) : previewHtml ? (
                    <iframe
                      title="template-preview"
                      className="w-full h-full border-0"
                      srcDoc={previewHtml}
                      sandbox="allow-scripts"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full text-gray-400 text-[13px]">
                      {tc('noPreview')}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-[14px]">
                <HiOutlineEye className="w-10 h-10 mb-2 opacity-40" />
                <p>{tc('selectToPreview')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 px-6 py-3 border-t border-gray-200 shrink-0 bg-gray-50">
          {selectedTemplate ? (
            <p className="text-[14px] text-gray-600 flex-1">
              {tc('selected')}: <span className="font-semibold text-gray-900">{selectedTemplate.name || selectedTemplate.title}</span>
            </p>
          ) : (
            <p className="text-[14px] text-gray-400 flex-1">{tc('selectHint')}</p>
          )}
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-lg border border-gray-300 text-gray-700 text-[14px] font-semibold hover:bg-gray-100 transition-colors"
          >
            {tc('cancel')}
          </button>
          <button
            type="button"
            onClick={() => handleApply(selectedTemplate)}
            disabled={!selectedTemplate || applying}
            className="px-6 py-2.5 rounded-lg bg-orange-500 text-white text-[14px] font-semibold hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {applying ? tc('applyCtaBusy') : tc('applyCta')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
