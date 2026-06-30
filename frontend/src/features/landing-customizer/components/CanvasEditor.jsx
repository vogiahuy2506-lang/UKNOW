import { useState, useEffect, useRef, useMemo } from 'react';
import landingCustomizerApiService from '../services/landingCustomizerApi.service';
import PropertiesPanel from './PropertiesPanel';

const PAGES = [
  { id: 'hero', label: 'Hero Page', labelVi: 'Trang Hero', path: '/' },
  { id: 'contact', label: 'Contact Page', labelVi: 'Trang Liên hệ', path: '/contact' },
  { id: 'pricing', label: 'Pricing Page', labelVi: 'Trang Bảng giá', path: '/pricing' },
];

// Element definitions
const ELEMENT_DEFS = {
  hero: [
    // Header Section
    { id: 'hero.tagline', section: 'Header', label: 'Badge Text', type: 'text' },
    { id: 'hero.titleLine1', section: 'Header', label: 'Tiêu đề dòng 1', type: 'text' },
    { id: 'hero.titleAccent', section: 'Header', label: 'Tiêu đề nhấn', type: 'text' },
    { id: 'hero.titleLine2', section: 'Header', label: 'Tiêu đề dòng 2', type: 'text' },
    { id: 'hero.subtitle', section: 'Header', label: 'Phụ đề', type: 'textarea' },
    { id: 'hero.ctaText', section: 'Header', label: 'Nút CTA chính', type: 'text' },
    { id: 'hero.backgroundColor', section: 'Header', label: 'Màu nền Header', type: 'color' },
    { id: 'hero.titleColor', section: 'Header', label: 'Màu tiêu đề', type: 'color' },
    { id: 'hero.accentColor', section: 'Header', label: 'Màu nhấn', type: 'color' },
    { id: 'hero.image', section: 'Header', label: 'Ảnh chính', type: 'image' },
    
    // Stats Section
    { id: 'stats.businesses', section: 'Thống kê', label: 'Doanh nghiệp', type: 'text' },
    { id: 'stats.businessesIcon', section: 'Thống kê', label: 'Icon Doanh nghiệp', type: 'icon' },
    { id: 'stats.leads', section: 'Thống kê', label: 'Leads', type: 'text' },
    { id: 'stats.leadsIcon', section: 'Thống kê', label: 'Icon Leads', type: 'icon' },
    { id: 'stats.campaigns', section: 'Thống kê', label: 'Chiến dịch', type: 'text' },
    { id: 'stats.campaignsIcon', section: 'Thống kê', label: 'Icon Chiến dịch', type: 'icon' },
    { id: 'stats.uptime', section: 'Thống kê', label: 'Uptime', type: 'text' },
    { id: 'stats.uptimeIcon', section: 'Thống kê', label: 'Icon Uptime', type: 'icon' },
    { id: 'stats.bgColor', section: 'Thống kê', label: 'Màu nền', type: 'color' },
    { id: 'stats.numberColor', section: 'Thống kê', label: 'Màu số', type: 'color' },
    { id: 'stats.labelColor', section: 'Thống kê', label: 'Màu nhãn', type: 'color' },
    
    // Features Section
    { id: 'features.badge', section: 'Tính năng', label: 'Badge', type: 'text' },
    { id: 'features.title', section: 'Tính năng', label: 'Tiêu đề', type: 'text' },
    { id: 'features.titleHighlight', section: 'Tính năng', label: 'Tiêu đề nhấn', type: 'text' },
    { id: 'features.subtitle', section: 'Tính năng', label: 'Phụ đề', type: 'textarea' },
    { id: 'features.sectionBg', section: 'Tính năng', label: 'Màu nền', type: 'color' },
    { id: 'features.titleColor', section: 'Tính năng', label: 'Màu tiêu đề', type: 'color' },
    
    // Feature 1
    { id: 'features.f1.title', section: 'Tính năng', label: 'Tính năng 1 - Tiêu đề', type: 'text' },
    { id: 'features.f1.desc', section: 'Tính năng', label: 'Tính năng 1 - Mô tả', type: 'textarea' },
    { id: 'features.f1.icon', section: 'Tính năng', label: 'Tính năng 1 - Icon', type: 'icon' },
    { id: 'features.f1.iconColor', section: 'Tính năng', label: 'Tính năng 1 - Màu icon', type: 'color' },
    
    // Feature 2
    { id: 'features.f2.title', section: 'Tính năng', label: 'Tính năng 2 - Tiêu đề', type: 'text' },
    { id: 'features.f2.desc', section: 'Tính năng', label: 'Tính năng 2 - Mô tả', type: 'textarea' },
    { id: 'features.f2.icon', section: 'Tính năng', label: 'Tính năng 2 - Icon', type: 'icon' },
    { id: 'features.f2.iconColor', section: 'Tính năng', label: 'Tính năng 2 - Màu icon', type: 'color' },
    
    // Feature 3
    { id: 'features.f3.title', section: 'Tính năng', label: 'Tính năng 3 - Tiêu đề', type: 'text' },
    { id: 'features.f3.desc', section: 'Tính năng', label: 'Tính năng 3 - Mô tả', type: 'textarea' },
    { id: 'features.f3.icon', section: 'Tính năng', label: 'Tính năng 3 - Icon', type: 'icon' },
    { id: 'features.f3.iconColor', section: 'Tính năng', label: 'Tính năng 3 - Màu icon', type: 'color' },
    
    // Feature 4
    { id: 'features.f4.title', section: 'Tính năng', label: 'Tính năng 4 - Tiêu đề', type: 'text' },
    { id: 'features.f4.desc', section: 'Tính năng', label: 'Tính năng 4 - Mô tả', type: 'textarea' },
    { id: 'features.f4.icon', section: 'Tính năng', label: 'Tính năng 4 - Icon', type: 'icon' },
    { id: 'features.f4.iconColor', section: 'Tính năng', label: 'Tính năng 4 - Màu icon', type: 'color' },
    
    // Feature 5
    { id: 'features.f5.title', section: 'Tính năng', label: 'Tính năng 5 - Tiêu đề', type: 'text' },
    { id: 'features.f5.desc', section: 'Tính năng', label: 'Tính năng 5 - Mô tả', type: 'textarea' },
    { id: 'features.f5.icon', section: 'Tính năng', label: 'Tính năng 5 - Icon', type: 'icon' },
    { id: 'features.f5.iconColor', section: 'Tính năng', label: 'Tính năng 5 - Màu icon', type: 'color' },
    
    // Feature 6
    { id: 'features.f6.title', section: 'Tính năng', label: 'Tính năng 6 - Tiêu đề', type: 'text' },
    { id: 'features.f6.desc', section: 'Tính năng', label: 'Tính năng 6 - Mô tả', type: 'textarea' },
    { id: 'features.f6.icon', section: 'Tính năng', label: 'Tính năng 6 - Icon', type: 'icon' },
    { id: 'features.f6.iconColor', section: 'Tính năng', label: 'Tính năng 6 - Màu icon', type: 'color' },
    
    // Steps Section
    { id: 'steps.badge', section: 'Quy trình', label: 'Badge', type: 'text' },
    { id: 'steps.title', section: 'Quy trình', label: 'Tiêu đề', type: 'text' },
    { id: 'steps.subtitle', section: 'Quy trình', label: 'Phụ đề', type: 'text' },
    { id: 'steps.bgColor', section: 'Quy trình', label: 'Màu nền', type: 'color' },
    
    // Step 1
    { id: 'steps.s1.title', section: 'Quy trình', label: 'Bước 1 - Tiêu đề', type: 'text' },
    { id: 'steps.s1.desc', section: 'Quy trình', label: 'Bước 1 - Mô tả', type: 'textarea' },
    { id: 'steps.s1.icon', section: 'Quy trình', label: 'Bước 1 - Icon', type: 'icon' },
    
    // Step 2
    { id: 'steps.s2.title', section: 'Quy trình', label: 'Bước 2 - Tiêu đề', type: 'text' },
    { id: 'steps.s2.desc', section: 'Quy trình', label: 'Bước 2 - Mô tả', type: 'textarea' },
    { id: 'steps.s2.icon', section: 'Quy trình', label: 'Bước 2 - Icon', type: 'icon' },
    
    // Step 3
    { id: 'steps.s3.title', section: 'Quy trình', label: 'Bước 3 - Tiêu đề', type: 'text' },
    { id: 'steps.s3.desc', section: 'Quy trình', label: 'Bước 3 - Mô tả', type: 'textarea' },
    { id: 'steps.s3.icon', section: 'Quy trình', label: 'Bước 3 - Icon', type: 'icon' },
    
    // Step 4
    { id: 'steps.s4.title', section: 'Quy trình', label: 'Bước 4 - Tiêu đề', type: 'text' },
    { id: 'steps.s4.desc', section: 'Quy trình', label: 'Bước 4 - Mô tả', type: 'textarea' },
    { id: 'steps.s4.icon', section: 'Quy trình', label: 'Bước 4 - Icon', type: 'icon' },
    
    // Benefits Section
    { id: 'benefits.title', section: 'Lợi ích', label: 'Tiêu đề', type: 'text' },
    { id: 'benefits.bgColor', section: 'Lợi ích', label: 'Màu nền', type: 'color' },
    
    // Benefit 1
    { id: 'benefits.b1.title', section: 'Lợi ích', label: 'Lợi ích 1 - Tiêu đề', type: 'text' },
    { id: 'benefits.b1.desc', section: 'Lợi ích', label: 'Lợi ích 1 - Mô tả', type: 'textarea' },
    { id: 'benefits.b1.icon', section: 'Lợi ích', label: 'Lợi ích 1 - Icon', type: 'icon' },
    { id: 'benefits.b1.iconColor', section: 'Lợi ích', label: 'Lợi ích 1 - Màu icon', type: 'color' },
    
    // Benefit 2
    { id: 'benefits.b2.title', section: 'Lợi ích', label: 'Lợi ích 2 - Tiêu đề', type: 'text' },
    { id: 'benefits.b2.desc', section: 'Lợi ích', label: 'Lợi ích 2 - Mô tả', type: 'textarea' },
    { id: 'benefits.b2.icon', section: 'Lợi ích', label: 'Lợi ích 2 - Icon', type: 'icon' },
    { id: 'benefits.b2.iconColor', section: 'Lợi ích', label: 'Lợi ích 2 - Màu icon', type: 'color' },
    
    // Benefit 3
    { id: 'benefits.b3.title', section: 'Lợi ích', label: 'Lợi ích 3 - Tiêu đề', type: 'text' },
    { id: 'benefits.b3.desc', section: 'Lợi ích', label: 'Lợi ích 3 - Mô tả', type: 'textarea' },
    { id: 'benefits.b3.icon', section: 'Lợi ích', label: 'Lợi ích 3 - Icon', type: 'icon' },
    { id: 'benefits.b3.iconColor', section: 'Lợi ích', label: 'Lợi ích 3 - Màu icon', type: 'color' },
    
    // Benefit 4
    { id: 'benefits.b4.title', section: 'Lợi ích', label: 'Lợi ích 4 - Tiêu đề', type: 'text' },
    { id: 'benefits.b4.desc', section: 'Lợi ích', label: 'Lợi ích 4 - Mô tả', type: 'textarea' },
    { id: 'benefits.b4.icon', section: 'Lợi ích', label: 'Lợi ích 4 - Icon', type: 'icon' },
    { id: 'benefits.b4.iconColor', section: 'Lợi ích', label: 'Lợi ích 4 - Màu icon', type: 'color' },
    
    // CTA Section
    { id: 'cta.title', section: 'CTA', label: 'Tiêu đề', type: 'text' },
    { id: 'cta.subtitle', section: 'CTA', label: 'Phụ đề', type: 'text' },
    { id: 'cta.button', section: 'CTA', label: 'Nút bấm', type: 'text' },
    { id: 'cta.note', section: 'CTA', label: 'Ghi chú', type: 'text' },
    { id: 'cta.bgColor', section: 'CTA', label: 'Màu nền', type: 'color' },
    { id: 'cta.buttonColor', section: 'CTA', label: 'Màu nút', type: 'color' },
  ],
  contact: [
    { id: 'contact.title', section: 'Header', label: 'Tiêu đề', type: 'text' },
    { id: 'contact.subtitle', section: 'Header', label: 'Phụ đề', type: 'text' },
    { id: 'contact.bgColor', section: 'Header', label: 'Màu nền', type: 'color' },
    { id: 'contact.titleColor', section: 'Header', label: 'Màu tiêu đề', type: 'color' },
    { id: 'contact.email.icon', section: 'Liên hệ', label: 'Email - Icon', type: 'icon' },
    { id: 'contact.email.value', section: 'Liên hệ', label: 'Email', type: 'text' },
    { id: 'contact.hotline.icon', section: 'Liên hệ', label: 'Hotline - Icon', type: 'icon' },
    { id: 'contact.hotline.value', section: 'Liên hệ', label: 'Hotline', type: 'text' },
    { id: 'contact.zalo.icon', section: 'Liên hệ', label: 'Zalo - Icon', type: 'icon' },
    { id: 'contact.zalo.value', section: 'Liên hệ', label: 'Zalo', type: 'text' },
    { id: 'contact.office.icon', section: 'Liên hệ', label: 'Địa chỉ - Icon', type: 'icon' },
    { id: 'contact.office.value', section: 'Liên hệ', label: 'Địa chỉ', type: 'textarea' },
    { id: 'contact.mapEmbed', section: 'Liên hệ', label: 'Google Maps Embed', type: 'textarea' },
  ],
  pricing: [
    { id: 'pricing.title', section: 'Header', label: 'Tiêu đề', type: 'text' },
    { id: 'pricing.subtitle', section: 'Header', label: 'Phụ đề', type: 'text' },
    { id: 'pricing.bgColor', section: 'Header', label: 'Màu nền', type: 'color' },
    { id: 'pricing.titleColor', section: 'Header', label: 'Màu tiêu đề', type: 'color' },
    { id: 'pricing.accentColor', section: 'Header', label: 'Màu nhấn', type: 'color' },
  ],
};

const PAGE_URLS = {
  hero: '/',
  contact: '/contact',
  pricing: '/pricing',
};

const INJECT_SCRIPT = `
(function() {
  window.addEventListener('message', function(e) {
    if (e.data?.type === 'OVERRIDES_UPDATED') {
      window.dispatchEvent(new CustomEvent('landing-overrides-updated', { detail: e.data }));
    }
  });
  
  const style = document.createElement('style');
  style.textContent = \`
    [data-edit] { cursor: pointer; }
    [data-edit]:hover { outline: 2px dashed #f97316 !important; outline-offset: 2px !important; }
    [data-edit].canvas-selected { outline: 2px solid #f97316 !important; outline-offset: 2px !important; background-color: rgba(249, 115, 22, 0.1) !important; }
  \`;
  document.head.appendChild(style);

  document.addEventListener('click', function(e) {
    const target = e.target.closest('[data-edit]');
    if (target) {
      e.preventDefault();
      e.stopPropagation();
      const editId = target.dataset.edit;
      window.parent.postMessage({ type: 'ELEMENT_CLICK', editId: editId }, '*');
    }
  }, true);
})();
`;

export default function CanvasEditor() {
  const iframeRef = useRef(null);
  
  // State
  const [selectedPage, setSelectedPage] = useState('hero');
  const [selectedElement, setSelectedElement] = useState(null);
  const [editedValues, setEditedValues] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [device, setDevice] = useState('desktop');
  const [previewScale, setPreviewScale] = useState(1);
  
  const lastLoaded = useRef({ page: null });

  // Load element definitions
  const elements = useMemo(() => ELEMENT_DEFS[selectedPage] || [], [selectedPage]);

  // Load overrides
  useEffect(() => {
    if (lastLoaded.current.page === selectedPage) return;
    lastLoaded.current.page = selectedPage;
    loadOverrides(selectedPage);
  }, [selectedPage]);

  const loadOverrides = async (page) => {
    try {
      const res = await landingCustomizerApiService.getOverrides(page, 'vi');
      let data = {};
      
      if (res.data?.overrides) {
        res.data.overrides.forEach(o => {
          data[o.key] = {
            valueVi: o.valueVi || o.valueEn || '',
            valueEn: o.valueEn || o.valueVi || '',
          };
        });
      } else if (Array.isArray(res.data)) {
        res.data.forEach(o => {
          data[o.key] = {
            valueVi: o.valueVi || o.valueEn || '',
            valueEn: o.valueEn || o.valueVi || '',
          };
        });
      }
      
      setEditedValues(data);
    } catch (err) {
      console.error('Load overrides error:', err);
      setEditedValues({});
    }
  };

  // Sync to localStorage for preview
  useEffect(() => {
    if (Object.keys(editedValues).length > 0) {
      // Convert from { key: { valueVi, valueEn } } to { key_vi: valueVi, key_en: valueEn }
      const previewData = {};
      Object.entries(editedValues).forEach(([key, val]) => {
        if (val?.valueVi) {
          previewData[`${key}_vi`] = val.valueVi;
        }
        if (val?.valueEn) {
          previewData[`${key}_en`] = val.valueEn;
        }
      });
      
      localStorage.setItem(`landing_overrides_${selectedPage}`, JSON.stringify(previewData));
      
      // Also send to iframe immediately
      const iframe = iframeRef.current;
      if (iframe?.contentWindow) {
        iframe.contentWindow.postMessage({ type: 'OVERRIDES_UPDATED', page: selectedPage, data: previewData }, '*');
      }
    }
  }, [editedValues, selectedPage]);

  const handleValueChange = (elementId, lang, value) => {
    setEditedValues(prev => ({
      ...prev,
      [elementId]: {
        ...prev[elementId],
        [`value${lang === 'vi' ? 'Vi' : 'En'}`]: value,
      },
    }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Save both languages
      await landingCustomizerApiService.saveOverrides(selectedPage, 'vi', editedValues);
      await landingCustomizerApiService.saveOverrides(selectedPage, 'en', editedValues);
      alert('Lưu thành công!');
    } catch (err) {
      alert('Lỗi khi lưu: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setEditedValues({});
  };

  // Listen for iframe clicks
  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data?.type === 'ELEMENT_CLICK') {
        const element = elements.find(el => el.id === e.data.editId);
        setSelectedElement(element || null);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [elements]);

  const handleIframeLoad = () => {
    try {
      const script = iframeRef.current?.contentDocument?.createElement('script');
      if (script) {
        script.textContent = INJECT_SCRIPT;
        iframeRef.current.contentDocument.head.appendChild(script);
      }
    } catch (err) {
      console.warn('Cannot inject script:', err);
    }
  };

  const getDeviceWidth = () => {
    switch (device) {
      case 'mobile': return '375px';
      case 'tablet': return '768px';
      default: return '100%';
    }
  };

  const hasChanges = Object.keys(editedValues).length > 0;

  return (
    <div className="h-full flex flex-col bg-slate-100">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              Landing Page Editor
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Click on any element in the preview to edit. Changes save per language.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {hasChanges && (
              <>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Reset
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className={`px-6 py-2 text-sm font-semibold rounded-lg transition-all ${
                    isSaving 
                      ? 'bg-slate-400 text-white' 
                      : 'bg-orange-500 text-white hover:bg-orange-600'
                  }`}
                >
                  {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Page Selector */}
        <div className="flex items-center gap-4 mt-4 flex-wrap">
          <label className="text-sm font-medium text-slate-600">Trang:</label>
          <div className="flex bg-slate-100 rounded-lg p-1">
            {PAGES.map((page) => (
              <button
                key={page.id}
                onClick={() => { setSelectedPage(page.id); setSelectedElement(null); }}
                className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                  selectedPage === page.id
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                {page.labelVi}
              </button>
            ))}
          </div>

          <div className="h-8 w-px bg-slate-300 mx-2" />

          <label className="text-sm font-medium text-slate-600">Ngôn ngữ preview:</label>
          <div className="flex bg-slate-100 rounded-lg p-1">
            <span className={`px-4 py-2 text-sm font-medium rounded-lg ${
              true ? 'bg-blue-500 text-white' : 'text-slate-600'
            }`}>
              Tiếng Việt
            </span>
            <span className={`px-4 py-2 text-sm font-medium rounded-lg ${
              false ? 'bg-blue-500 text-white' : 'text-slate-600'
            }`}>
              English
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Preview Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-bold">
                Preview Mode
              </span>
              {selectedElement && (
                <span className="text-xs text-slate-500">
                  Selected: {selectedElement.label}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              {/* Zoom controls */}
              <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-2 py-1">
                <button 
                  onClick={() => setPreviewScale(Math.max(0.25, previewScale - 0.25))}
                  className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded"
                >
                  −
                </button>
                <span className="text-xs font-medium text-slate-600 w-14 text-center">
                  {Math.round(previewScale * 100)}%
                </span>
                <button 
                  onClick={() => setPreviewScale(Math.min(2, previewScale + 0.25))}
                  className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded"
                >
                  +
                </button>
              </div>

              {/* Device switcher */}
              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setDevice('mobile')} 
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    device === 'mobile' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Mobile
                </button>
                <button 
                  onClick={() => setDevice('tablet')} 
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    device === 'tablet' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Tablet
                </button>
                <button 
                  onClick={() => setDevice('desktop')} 
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    device === 'desktop' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  Desktop
                </button>
              </div>
            </div>
          </div>

          {/* Preview */}
          <div className="flex-1 overflow-auto bg-slate-300 p-4">
            <div className="relative mx-auto bg-white shadow-2xl" style={{ width: getDeviceWidth() }}>
              {/* Browser chrome */}
              <div className="bg-slate-800 px-4 py-2 flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <div className="flex-1 bg-slate-700 rounded-md px-3 py-1 text-xs text-slate-300 truncate">
                  {window.location.origin}{PAGE_URLS[selectedPage]}?lang=vi&preview=edit
                </div>
              </div>

              {/* iframe */}
              <div 
                className="relative overflow-auto"
                style={{ 
                  transform: `scale(${previewScale})`, 
                  transformOrigin: 'top left',
                  width: device === 'desktop' ? '100%' : getDeviceWidth(),
                }}
              >
                <iframe
                  key={`${selectedPage}-vi-${device}`}
                  ref={iframeRef}
                  src={`${window.location.origin}${PAGE_URLS[selectedPage]}?lang=vi&preview=edit`}
                  title={`Preview: ${selectedPage}`}
                  className="border-0 w-full"
                  style={{ height: '800px', minHeight: '800px' }}
                  onLoad={handleIframeLoad}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Edit Form */}
        <div className="w-96 bg-slate-800 border-l border-slate-700 flex flex-col max-h-full overflow-hidden">
          {selectedElement ? (
            <PropertiesPanel
              element={selectedElement}
              value={editedValues[selectedElement.id]}
              onChange={handleValueChange}
              onClose={() => setSelectedElement(null)}
            />
          ) : (
            /* No selection state */
            <div className="flex-1 flex items-center justify-center text-slate-500 text-sm p-6 text-center">
              <div>
                <div className="text-5xl mb-4">👆</div>
                <p className="text-base font-medium mb-2">Click vào phần tử trong preview</p>
                <p className="text-sm">để chỉnh sửa nội dung, màu sắc, icon...</p>
              </div>
            </div>
          )}

          {/* Element list */}
          {/*
          <div className="border-t border-slate-700">
            <div className="px-4 py-2 bg-slate-900 text-xs text-slate-400 font-medium">
              DANH SÁCH PHẦN TỬ ({elements.length})
            </div>
            <div className="max-h-64 overflow-y-auto">
              {elements.map((el) => (
                <button
                  key={el.id}
                  onClick={() => setSelectedElement(el)}
                  className={`w-full px-4 py-2 text-left text-sm hover:bg-slate-700 transition-colors ${
                    selectedElement?.id === el.id ? 'bg-orange-500/20 text-orange-400' : 'text-slate-300'
                  }`}
                >
                  <div className="text-xs text-slate-500">{el.section}</div>
                  <div className="truncate">{el.label}</div>
                </button>
              ))}
            </div>
          </div>
          */}
        </div>
      </div>
    </div>
  );
}
