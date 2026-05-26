import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineX, HiOutlineSearch, HiOutlineCheck, HiOutlineSparkles,
  HiOutlinePhotograph, HiOutlineTemplate, HiOutlineColorSwatch
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import api from '../../../services/api.js';

/**
 * Template Gallery Modal - Browse and select landing page templates
 * 
 * @param {object} props
 * @param {boolean} props.isOpen
 * @param {function} props.onClose
 * @param {function} props.onSelect - Called with { template, html } when user picks a template
 * @param {function} props.onGenerateWithAi - Called when user wants AI generation
 */
export default function TemplateGallery({ isOpen, onClose, onSelect, onGenerateWithAi }) {
  const t = useI18n('templateGallery');
  const [categories, setCategories] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [previewHtml, setPreviewHtml] = useState(null);

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
      fetchTemplates();
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedCategory(null);
      setSelectedTemplate(null);
      setPreviewHtml(null);
      setSearchTerm('');
    }
  }, [isOpen]);

  const fetchCategories = async () => {
    try {
      const res = await api.get('/landing-templates/categories');
      if (res?.data?.success) {
        setCategories(res.data.data || []);
      }
    } catch (e) {
      console.warn('[TemplateGallery] Failed to fetch categories:', e);
    }
  };

  const fetchTemplates = async () => {
    setLoading(true);
    try {
      const params = selectedCategory ? { category: selectedCategory } : {};
      const res = await api.get('/landing-templates', { params });
      if (res?.data?.success) {
        setTemplates(res.data.data || []);
      }
    } catch (e) {
      console.warn('[TemplateGallery] Failed to fetch templates:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryClick = (category) => {
    setSelectedCategory(selectedCategory === category ? null : category);
    fetchTemplates();
  };

  const handleTemplateClick = async (template) => {
    setSelectedTemplate(template);
    // Fetch full HTML structure for preview
    try {
      const res = await api.get(`/landing-templates/${template.id}/html`);
      if (res?.data?.success) {
        setPreviewHtml(res.data.data.htmlStructure);
      }
    } catch (e) {
      console.warn('[TemplateGallery] Failed to fetch template HTML:', e);
    }
  };

  const handleSelect = () => {
    if (selectedTemplate && previewHtml) {
      onSelect?.({
        template: selectedTemplate,
        html: previewHtml,
        cssVariables: selectedTemplate.cssVariables,
        defaultConfig: selectedTemplate.defaultConfig,
      });
      onClose?.();
    }
  };

  const filteredTemplates = templates.filter(t =>
    t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/50">
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-500 rounded-xl flex items-center justify-center">
              <HiOutlineTemplate className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">{t('templateLibrary')}</h2>
              <p className="text-sm text-gray-500">{t('selectTemplateDescription')}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onGenerateWithAi}
              className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-indigo-500 text-white rounded-xl font-medium hover:from-purple-600 hover:to-indigo-600 transition-all shadow-lg shadow-purple-500/25"
            >
              <HiOutlineSparkles className="w-4 h-4" />
              {t('generateWithAI')}
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <HiOutlineX className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Sidebar - Categories */}
          <div className="w-64 shrink-0 border-r border-gray-100 bg-gray-50/50 overflow-y-auto p-4">
            <div className="mb-4">
              <div className="relative">
                <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('searchTemplate')}
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-400"
                />
              </div>
            </div>

            <div className="space-y-1">
              <button
                onClick={() => { setSelectedCategory(null); fetchTemplates(); }}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                  !selectedCategory ? 'bg-orange-100 text-orange-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <HiOutlineTemplate className="w-4 h-4" />
                {t('all')} ({categories.reduce((sum, c) => sum + c.count, 0)})
              </button>

              {categories.map(cat => (
                <button
                  key={cat.category}
                  onClick={() => handleCategoryClick(cat.category)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all ${
                    selectedCategory === cat.category ? 'bg-orange-100 text-orange-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <HiOutlineColorSwatch className="w-4 h-4" />
                  {cat.category} ({cat.count})
                </button>
              ))}
            </div>
          </div>

          {/* Main Content - Templates Grid */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-3 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                <HiOutlineTemplate className="w-12 h-12 mb-3" />
                <p className="text-lg font-medium">{t('noTemplates')}</p>
                <p className="text-sm">{t('tryAnotherCategory')}</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredTemplates.map(template => (
                  <div
                    key={template.id}
                    onClick={() => handleTemplateClick(template)}
                    className={`group cursor-pointer rounded-2xl border-2 overflow-hidden transition-all hover:shadow-lg ${
                      selectedTemplate?.id === template.id
                        ? 'border-orange-500 shadow-orange-500/20'
                        : 'border-gray-100 hover:border-orange-300'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-[16/10] bg-gradient-to-br from-gray-100 to-gray-50 relative overflow-hidden">
                      {template.thumbnailUrl ? (
                        <img
                          src={template.thumbnailUrl}
                          alt={template.name}
                          className="w-full h-full object-cover"
                          onError={e => {
                            e.target.style.display = 'none';
                            e.target.parentElement.classList.add('flex', 'items-center', 'justify-center');
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <HiOutlinePhotograph className="w-12 h-12 text-gray-300" />
                        </div>
                      )}
                      {/* Selected indicator */}
                      {selectedTemplate?.id === template.id && (
                        <div className="absolute top-3 right-3 w-7 h-7 bg-orange-500 rounded-full flex items-center justify-center shadow-lg">
                          <HiOutlineCheck className="w-4 h-4 text-white" />
                        </div>
                      )}
                      {/* Category badge */}
                      <div className="absolute bottom-3 left-3 px-2 py-1 bg-white/90 backdrop-blur-sm rounded-lg text-xs font-medium text-gray-700">
                        {template.category}
                      </div>
                    </div>

                    {/* Info */}
                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900 mb-1 group-hover:text-orange-600 transition-colors">
                        {template.name}
                      </h3>
                      <p className="text-sm text-gray-500 line-clamp-2">
                        {template.description || t('noDescription')}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Sidebar - Preview */}
          <div className="w-96 shrink-0 border-l border-gray-100 bg-gray-50/50 overflow-hidden flex flex-col">
            <div className="shrink-0 px-4 py-3 border-b border-gray-100 bg-white">
              <h3 className="font-semibold text-gray-900">{t('preview')}</h3>
              {selectedTemplate && (
                <p className="text-sm text-gray-500 mt-0.5">{selectedTemplate.name}</p>
              )}
            </div>
            <div className="flex-1 overflow-auto p-4">
              {selectedTemplate ? (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                  <iframe
                    title="Template Preview"
                    className="w-full h-[600px] border-0"
                    srcDoc={`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50">
  ${previewHtml || `<div class="p-8 text-center text-gray-500">${t('loadingPreview')}</div>`}
</body>
</html>`}
                    sandbox="allow-scripts"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                  <HiOutlineTemplate className="w-12 h-12 mb-3" />
                  <p className="text-sm text-center">{t('chooseTemplate')}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50/50">
          <div className="text-sm text-gray-500">
            {selectedTemplate ? (
              <span>{t('selected')}: <strong className="text-gray-900">{selectedTemplate.name}</strong></span>
            ) : (
              <span>{t('selectToContinue')}</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-medium transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              onClick={handleSelect}
              disabled={!selectedTemplate}
              className="px-6 py-2 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {t('useTemplate')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
