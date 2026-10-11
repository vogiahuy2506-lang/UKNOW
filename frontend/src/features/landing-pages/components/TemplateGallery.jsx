/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
import { useEffect, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineX, HiOutlineSearch, HiOutlineCheck,
  HiOutlineTemplate, HiOutlineColorSwatch, HiOutlineUser,
  HiOutlineGlobeAlt, HiOutlineStar, HiOutlineTrash, HiOutlineSwitchHorizontal
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import api from '../../../services/api.js';
import { updateLandingTemplate } from '../services/landingPagesAdminApi.service.js';

/**
 * Template Gallery Modal - Browse and select landing page templates
 */
export default function TemplateGallery({ isOpen, onClose, onSelect, onGenerateWithAi }) {
  const modalRef = useRef(null);
  const t = useI18n('templateGallery');
  const [activeTab, setActiveTab] = useState('public'); // 'public' | 'my'
  const [categories, setCategories] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [myTemplates, setMyTemplates] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [previewHtml, setPreviewHtml] = useState(null);
  const [confirmModal, setConfirmModal] = useState(null); // { action: 'delete'|'togglePublic', template: object }

  const handleConfirmAction = async () => {
    if (!confirmModal) return;
    const { action, template } = confirmModal;

    try {
      if (action === 'delete') {
        await api.delete(`/landing-templates/${template.id}`);
        toast.success('Đã xóa template');
        fetchMyTemplates();
        if (selectedTemplate?.id === template.id) {
          setSelectedTemplate(null);
          setPreviewHtml(null);
        }
      } else if (action === 'togglePublic') {
        await updateLandingTemplate(template.id, {
          isPublic: !template.isPublic,
        });
        toast.success(template.isPublic ? 'Đã hủy công khai template' : 'Đã công khai template');
        fetchMyTemplates();
        if (selectedTemplate?.id === template.id) {
          setSelectedTemplate(prev => ({ ...prev, isPublic: !prev.isPublic }));
        }
      }
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Có lỗi xảy ra');
    } finally {
      setConfirmModal(null);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchCategories();
      fetchPublicTemplates();
      fetchMyTemplates();
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

  const fetchPublicTemplates = async () => {
    setLoading(true);
    try {
      const params = selectedCategory ? { category: selectedCategory } : {};
      params.isPublic = true;
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

  const fetchMyTemplates = async () => {
    try {
      const res = await api.get('/landing-templates/my');
      if (res?.data?.success) {
        setMyTemplates(res.data.data || []);
      }
    } catch (e) {
      console.warn('[TemplateGallery] Failed to fetch my templates:', e);
    }
  };

  const handleCategoryClick = (category) => {
    setSelectedCategory(selectedCategory === category ? null : category);
    if (activeTab === 'public') {
      fetchPublicTemplates();
    }
  };

  const handleTemplateClick = async (template) => {
    setSelectedTemplate(template);
    setPreviewHtml(null);
    
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

  const handleDeleteTemplate = (templateId, e) => {
    e.stopPropagation();
    const template = myTemplates.find(t => t.id === templateId);
    if (template) {
      setConfirmModal({ action: 'delete', template });
    }
  };

  const handleTogglePublic = (template, e) => {
    e.stopPropagation();
    setConfirmModal({ action: 'togglePublic', template });
  };

  const displayedTemplates = activeTab === 'public' ? templates : myTemplates;
  
  const filteredTemplates = displayedTemplates.filter(t =>
    t.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    t.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div
        ref={modalRef}
        className="bg-white dark:bg-dk-surface rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden animate-modal-pop"
      >
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-dk-border bg-gray-50 dark:bg-dk-raised">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 dark:bg-orange-950/40 rounded-xl flex items-center justify-center">
              <HiOutlineTemplate className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-dk-text">Thư viện Template</h2>
              <p className="text-sm text-gray-500 dark:text-dk-text2">Chọn template cho landing page của bạn</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-dk-strong rounded-lg transition-colors"
            >
              <HiOutlineX className="w-5 h-5 text-gray-500 dark:text-dk-text2" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="shrink-0 flex items-center gap-1 px-6 py-3 border-b border-gray-200 dark:border-dk-border bg-white dark:bg-dk-surface">
          <button
            onClick={() => { setActiveTab('public'); setSelectedTemplate(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'public'
                ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300'
                : 'text-gray-600 dark:text-dk-text2 hover:bg-gray-100 dark:hover:bg-dk-strong'
            }`}
          >
            <HiOutlineGlobeAlt className="w-4 h-4" />
            Template công khai
            <span className="ml-1 px-1.5 py-0.5 bg-gray-200 dark:bg-dk-strong text-gray-600 dark:text-dk-text2 rounded text-xs">
              {templates.length}
            </span>
          </button>
          <button
            onClick={() => { setActiveTab('my'); setSelectedTemplate(null); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'my'
                ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300'
                : 'text-gray-600 dark:text-dk-text2 hover:bg-gray-100 dark:hover:bg-dk-strong'
            }`}
          >
            <HiOutlineUser className="w-4 h-4" />
            Template của tôi
            <span className="ml-1 px-1.5 py-0.5 bg-gray-200 dark:bg-dk-strong text-gray-600 dark:text-dk-text2 rounded text-xs">
              {myTemplates.length}
            </span>
          </button>
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left Sidebar - Categories & Filters */}
          <div className="w-64 shrink-0 border-r border-gray-200 dark:border-dk-border bg-gray-50 dark:bg-dk-raised overflow-y-auto p-4">
            <div className="mb-4">
              <div className="relative">
                <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-dk-muted" />
                <input
                  type="text"
                  placeholder="Tìm kiếm..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 bg-white dark:bg-dk-inset border border-gray-300 dark:border-dk-border-strong rounded-lg text-sm dark:text-dk-text dark:placeholder-dk-muted focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500"
                />
              </div>
            </div>

            {activeTab === 'public' && (
              <div className="space-y-1">
                <button
                  onClick={() => { setSelectedCategory(null); fetchPublicTemplates(); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    !selectedCategory ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300' : 'text-gray-600 dark:text-dk-text2 hover:bg-gray-100 dark:hover:bg-dk-strong'
                  }`}
                >
                  <HiOutlineTemplate className="w-4 h-4" />
                  Tất cả
                </button>

                {categories.map(cat => (
                  <button
                    key={cat.category}
                    onClick={() => handleCategoryClick(cat.category)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedCategory === cat.category ? 'bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-300' : 'text-gray-600 dark:text-dk-text2 hover:bg-gray-100 dark:hover:bg-dk-strong'
                    }`}
                  >
                    <HiOutlineColorSwatch className="w-4 h-4" />
                    {cat.category}
                    <span className="ml-auto text-xs text-gray-400 dark:text-dk-muted">{cat.count}</span>
                  </button>
                ))}
              </div>
            )}

            {activeTab === 'my' && (
              <div className="space-y-3">
                <div className="text-xs font-semibold text-gray-500 dark:text-dk-text2 uppercase tracking-wide">Bộ lọc</div>
                <div className="space-y-1">
                  <button
                    onClick={() => setSelectedCategory('public')}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedCategory === 'public' ? 'bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-300' : 'text-gray-600 dark:text-dk-text2 hover:bg-gray-100 dark:hover:bg-dk-strong'
                    }`}
                  >
                    <HiOutlineGlobeAlt className="w-4 h-4" />
                    Công khai
                  </button>
                  <button
                    onClick={() => setSelectedCategory('private')}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                      selectedCategory === 'private' ? 'bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300' : 'text-gray-600 dark:text-dk-text2 hover:bg-gray-100 dark:hover:bg-dk-strong'
                    }`}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Riêng tư
                  </button>
                </div>

                <div className="border-t border-gray-200 dark:border-dk-border pt-3 mt-3">
                  <div className="text-xs font-semibold text-gray-500 dark:text-dk-text2 uppercase tracking-wide mb-2">Thống kê</div>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="bg-green-50 dark:bg-green-950/40 rounded-lg p-2">
                      <div className="text-lg font-bold text-green-600 dark:text-green-400">
                        {myTemplates.filter(t => t.isPublic).length}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-dk-text2">Công khai</div>
                    </div>
                    <div className="bg-purple-50 dark:bg-purple-950/40 rounded-lg p-2">
                      <div className="text-lg font-bold text-purple-600 dark:text-purple-400">
                        {myTemplates.filter(t => !t.isPublic).length}
                      </div>
                      <div className="text-xs text-gray-500 dark:text-dk-text2">Riêng tư</div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Main Content - Templates Grid */}
          <div className="flex-1 overflow-y-auto p-6 bg-gray-100 dark:bg-dk-inset">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-orange-300 dark:border-orange-700 border-t-orange-500 rounded-full animate-spin" />
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-gray-400 dark:text-dk-muted">
                <div className="w-16 h-16 bg-gray-200 dark:bg-dk-strong rounded-full flex items-center justify-center mb-4">
                  <HiOutlineTemplate className="w-8 h-8" />
                </div>
                <p className="text-lg font-medium text-gray-500 dark:text-dk-text2">
                  {activeTab === 'my' ? 'Bạn chưa có template nào' : 'Không có template nào'}
                </p>
                <p className="text-sm text-gray-400 dark:text-dk-muted mt-1 mb-4">
                  {activeTab === 'my' 
                    ? 'Tạo landing page và lưu lại làm template'
                    : 'Hãy tạo template đầu tiên của bạn'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredTemplates.map(template => (
                  <div
                    key={template.id}
                    onClick={() => handleTemplateClick(template)}
                    className={`group cursor-pointer bg-white dark:bg-dk-surface rounded-xl border-2 overflow-hidden transition-all hover:shadow-lg ${
                      selectedTemplate?.id === template.id
                        ? 'border-orange-500 shadow-orange-500/20'
                        : 'border-gray-200 dark:border-dk-border hover:border-orange-300 dark:hover:border-orange-700'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-[16/10] bg-gradient-to-br from-gray-100 dark:from-dk-raised to-gray-50 dark:to-dk-raised relative overflow-hidden">
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
                          <HiOutlineTemplate className="w-12 h-12 text-gray-300 dark:text-dk-muted" />
                        </div>
                      )}
                      
                      {/* Selected indicator */}
                      {selectedTemplate?.id === template.id && (
                        <div className="absolute top-3 right-3 w-7 h-7 bg-orange-500 rounded-full flex items-center justify-center shadow-lg">
                          <HiOutlineCheck className="w-4 h-4 text-white" />
                        </div>
                      )}
                      
                      {/* Visibility badge */}
                      <div className={`absolute bottom-3 left-3 px-2 py-1 backdrop-blur-sm rounded-lg text-xs font-medium flex items-center gap-1 ${
                        template.isPublic 
                          ? 'bg-green-500/90 text-white' 
                          : 'bg-purple-500/90 text-white'
                      }`}>
                        {template.isPublic ? (
                          <>
                            <HiOutlineGlobeAlt className="w-3 h-3" />
                            Công khai
                          </>
                        ) : (
                          <>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                            </svg>
                            Riêng tư
                          </>
                        )}
                      </div>

                      {/* Featured badge */}
                      {template.isFeatured && (
                        <div className="absolute top-3 left-3 px-2 py-1 bg-amber-500/90 backdrop-blur-sm rounded-lg text-xs font-medium text-white flex items-center gap-1">
                          <HiOutlineStar className="w-3 h-3" />
                          Nổi bật
                        </div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-gray-900 dark:text-dk-text mb-1 group-hover:text-orange-600 dark:group-hover:text-orange-400 transition-colors truncate">
                            {template.name}
                          </h3>
                          <p className="text-sm text-gray-500 dark:text-dk-text2 line-clamp-2">
                            {template.description || 'Không có mô tả'}
                          </p>
                        </div>
                        
                        {activeTab === 'my' && (
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => handleTogglePublic(template, e)}
                              className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                                template.isPublic
                                  ? 'text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/60 hover:text-green-700 dark:hover:text-green-300'
                                  : 'text-gray-400 dark:text-dk-muted hover:text-green-600 dark:hover:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/60'
                              }`}
                              title={template.isPublic ? 'Hủy công khai' : 'Công khai'}
                            >
                              <HiOutlineSwitchHorizontal className="w-4 h-4" />
                            </button>
                            <button
                              onClick={(e) => handleDeleteTemplate(template.id, e)}
                              className="p-1.5 text-gray-400 dark:text-dk-muted hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/60 rounded-lg transition-colors flex-shrink-0"
                              title="Xóa template"
                            >
                              <HiOutlineTrash className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                      
                      {template.category && (
                        <div className="mt-2 flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-gray-100 dark:bg-dk-raised text-gray-600 dark:text-dk-text2 rounded text-xs">
                            {template.category}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right Sidebar - Preview */}
          <div className="w-96 shrink-0 border-l border-gray-200 dark:border-dk-border bg-white dark:bg-dk-surface overflow-hidden flex flex-col">
            <div className="shrink-0 px-4 py-3 border-b border-gray-200 dark:border-dk-border bg-gray-50 dark:bg-dk-raised">
              <h3 className="font-semibold text-gray-900 dark:text-dk-text">Xem trước</h3>
              {selectedTemplate && (
                <p className="text-sm text-gray-500 dark:text-dk-text2 mt-0.5 truncate">{selectedTemplate.name}</p>
              )}
            </div>
            <div className="flex-1 overflow-auto p-4 bg-gray-50 dark:bg-dk-inset">
              {selectedTemplate ? (
                // giữ sáng: iframe xem trước là HTML trang của khách (bg-white, không dark:); chỉ viền khung bao theo chế độ tối
                <div className="bg-white rounded-xl border border-gray-200 dark:border-dk-border overflow-hidden shadow-sm">
                  <iframe
                    title="Template Preview"
                    className="w-full h-[500px] border-0"
                    srcDoc={`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50">
  ${previewHtml || `<div class="p-8 text-center text-gray-500">Đang tải...</div>`}
</body>
</html>`}
                    sandbox="allow-scripts"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-gray-400 dark:text-dk-muted">
                  <div className="w-16 h-16 bg-gray-200 dark:bg-dk-strong rounded-full flex items-center justify-center mb-4">
                    <HiOutlineTemplate className="w-8 h-8" />
                  </div>
                  <p className="text-sm text-center">Chọn một template để xem trước</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-dk-border bg-gray-50 dark:bg-dk-raised">
          <div className="text-sm text-gray-500 dark:text-dk-text2">
            {selectedTemplate ? (
              <span>Đã chọn: <strong className="text-gray-900 dark:text-dk-text">{selectedTemplate.name}</strong></span>
            ) : (
              <span>Chọn template để tiếp tục</span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="btn btn-secondary text-sm"
            >
              Hủy
            </button>
            <button
              onClick={handleSelect}
              disabled={!selectedTemplate}
              className="btn btn-primary text-sm"
            >
              Sử dụng template
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-dk-surface rounded-xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="p-6">
              <div className={`w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center ${
                confirmModal.action === 'delete' ? 'bg-red-100 dark:bg-red-950/40' : 'bg-orange-100 dark:bg-orange-950/40'
              }`}>
                {confirmModal.action === 'delete' ? (
                  <HiOutlineTrash className="w-6 h-6 text-red-600 dark:text-red-400" />
                ) : (
                  <HiOutlineGlobeAlt className={`w-6 h-6 ${confirmModal.template.isPublic ? 'text-green-600 dark:text-green-400' : 'text-orange-600 dark:text-orange-400'}`} />
                )}
              </div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-dk-text text-center mb-2">
                {confirmModal.action === 'delete' ? 'Xóa template?' : (
                  confirmModal.template.isPublic ? 'Hủy công khai?' : 'Công khai template?'
                )}
              </h3>
              <p className="text-sm text-gray-500 dark:text-dk-text2 text-center mb-6">
                {confirmModal.action === 'delete' ? (
                  `Bạn có chắc muốn xóa template "${confirmModal.template.name}"? Hành động này không thể hoàn tác.`
                ) : (
                  confirmModal.template.isPublic ? (
                    `Template "${confirmModal.template.name}" sẽ không còn hiển thị với người dùng khác.`
                  ) : (
                    `Template "${confirmModal.template.name}" sẽ được hiển thị công khai cho mọi người.`
                  )
                )}
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => setConfirmModal(null)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-dk-border-strong rounded-lg text-gray-700 dark:text-dk-text font-medium hover:bg-gray-50 dark:hover:bg-dk-raised transition-colors"
                >
                  Hủy
                </button>
                <button
                  onClick={handleConfirmAction}
                  className={`flex-1 px-4 py-2 rounded-lg text-white font-medium transition-colors ${
                    confirmModal.action === 'delete'
                      ? 'bg-red-600 hover:bg-red-700'
                      : confirmModal.template.isPublic
                        ? 'bg-gray-600 hover:bg-gray-700'
                        : 'bg-orange-600 hover:bg-orange-700'
                  }`}
                >
                  {confirmModal.action === 'delete' ? 'Xóa' : (
                    confirmModal.template.isPublic ? 'Hủy công khai' : 'Công khai'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <>
        <style>{`
          @keyframes modalPop {
            from { opacity: 0; transform: scale(0.95) translateY(10px); }
            to { opacity: 1; transform: scale(1) translateY(0); }
          }
          .animate-modal-pop { animation: modalPop 200ms ease-out; }
        `}</style>
      </>
    </div>,
    document.body
  );
}
