import { useState, useEffect, useRef } from 'react';
import landingCustomizerApiService from '../services/landingCustomizerApi.service';
import PreviewFrame from './PreviewFrame';
import IconPicker from './IconPicker';

const PAGES = [
  { id: 'hero', label: 'Hero Page', labelVi: 'Trang Hero', path: '/' },
  { id: 'contact', label: 'Contact Page', labelVi: 'Trang Liên hệ', path: '/contact' },
  { id: 'pricing', label: 'Pricing Page', labelVi: 'Trang Bảng giá', path: '/pricing' },
];

// Element definitions for each page
// Element definitions with multiple field types
const ELEMENT_DEFS = {
  hero: [
    // Header Section
    { id: 'hero.tagline', section: 'Header', label: 'Badge Text', type: 'text' },
    { id: 'hero.titleLine1', section: 'Header', label: 'Tiêu đề dòng 1', type: 'text' },
    { id: 'hero.titleAccent', section: 'Header', label: 'Tiêu đề nhấn', type: 'text', accent: true },
    { id: 'hero.titleLine2', section: 'Header', label: 'Tiêu đề dòng 2', type: 'text' },
    { id: 'hero.subtitle', section: 'Header', label: 'Phụ đề', type: 'textarea' },
    { id: 'hero.ctaText', section: 'Header', label: 'Nút CTA chính', type: 'text' },
    { id: 'hero.ctaSecondaryText', section: 'Header', label: 'Nút CTA phụ', type: 'text' },
    { id: 'hero.backgroundColor', section: 'Header', label: 'Màu nền', type: 'color' },
    { id: 'hero.titleColor', section: 'Header', label: 'Màu tiêu đề', type: 'color' },
    { id: 'hero.accentColor', section: 'Header', label: 'Màu nhấn', type: 'color' },
    { id: 'hero.image', section: 'Header', label: 'Ảnh chính', type: 'image' },
    { id: 'hero.imageAlt', section: 'Header', label: 'Alt ảnh', type: 'text' },
    
    // Stats Section
    { id: 'stats.sectionBg', section: 'Thống kê', label: 'Màu nền', type: 'color' },
    { id: 'stats.businesses', section: 'Thống kê', label: 'Doanh nghiệp', type: 'text' },
    { id: 'stats.businessesIcon', section: 'Thống kê', label: 'Icon Doanh nghiệp', type: 'icon' },
    { id: 'stats.leads', section: 'Thống kê', label: 'Leads', type: 'text' },
    { id: 'stats.leadsIcon', section: 'Thống kê', label: 'Icon Leads', type: 'icon' },
    { id: 'stats.campaigns', section: 'Thống kê', label: 'Chiến dịch', type: 'text' },
    { id: 'stats.campaignsIcon', section: 'Thống kê', label: 'Icon Chiến dịch', type: 'icon' },
    { id: 'stats.uptime', section: 'Thống kê', label: 'Uptime', type: 'text' },
    { id: 'stats.uptimeIcon', section: 'Thống kê', label: 'Icon Uptime', type: 'icon' },
    { id: 'stats.numberColor', section: 'Thống kê', label: 'Màu số', type: 'color' },
    { id: 'stats.labelColor', section: 'Thống kê', label: 'Màu nhãn', type: 'color' },
    
    // Features Section
    { id: 'features.sectionTitle', section: 'Tính năng', label: 'Tiêu đề section', type: 'text' },
    { id: 'features.sectionBg', section: 'Tính năng', label: 'Màu nền', type: 'color' },
    { id: 'features.titleColor', section: 'Tính năng', label: 'Màu tiêu đề', type: 'color' },
    { id: 'features.f1.title', section: 'Tính năng', label: 'Tính năng 1 - Tiêu đề', type: 'text' },
    { id: 'features.f1.desc', section: 'Tính năng', label: 'Tính năng 1 - Mô tả', type: 'textarea' },
    { id: 'features.f1.icon', section: 'Tính năng', label: 'Tính năng 1 - Icon', type: 'icon' },
    { id: 'features.f1.iconColor', section: 'Tính năng', label: 'Tính năng 1 - Màu icon', type: 'color' },
    { id: 'features.f2.title', section: 'Tính năng', label: 'Tính năng 2 - Tiêu đề', type: 'text' },
    { id: 'features.f2.desc', section: 'Tính năng', label: 'Tính năng 2 - Mô tả', type: 'textarea' },
    { id: 'features.f2.icon', section: 'Tính năng', label: 'Tính năng 2 - Icon', type: 'icon' },
    { id: 'features.f2.iconColor', section: 'Tính năng', label: 'Tính năng 2 - Màu icon', type: 'color' },
    { id: 'features.f3.title', section: 'Tính năng', label: 'Tính năng 3 - Tiêu đề', type: 'text' },
    { id: 'features.f3.desc', section: 'Tính năng', label: 'Tính năng 3 - Mô tả', type: 'textarea' },
    { id: 'features.f3.icon', section: 'Tính năng', label: 'Tính năng 3 - Icon', type: 'icon' },
    { id: 'features.f3.iconColor', section: 'Tính năng', label: 'Tính năng 3 - Màu icon', type: 'color' },
    { id: 'features.f4.title', section: 'Tính năng', label: 'Tính năng 4 - Tiêu đề', type: 'text' },
    { id: 'features.f4.desc', section: 'Tính năng', label: 'Tính năng 4 - Mô tả', type: 'textarea' },
    { id: 'features.f4.icon', section: 'Tính năng', label: 'Tính năng 4 - Icon', type: 'icon' },
    { id: 'features.f4.iconColor', section: 'Tính năng', label: 'Tính năng 4 - Màu icon', type: 'color' },
    { id: 'features.f5.title', section: 'Tính năng', label: 'Tính năng 5 - Tiêu đề', type: 'text' },
    { id: 'features.f5.desc', section: 'Tính năng', label: 'Tính năng 5 - Mô tả', type: 'textarea' },
    { id: 'features.f5.icon', section: 'Tính năng', label: 'Tính năng 5 - Icon', type: 'icon' },
    { id: 'features.f5.iconColor', section: 'Tính năng', label: 'Tính năng 5 - Màu icon', type: 'color' },
    { id: 'features.f6.title', section: 'Tính năng', label: 'Tính năng 6 - Tiêu đề', type: 'text' },
    { id: 'features.f6.desc', section: 'Tính năng', label: 'Tính năng 6 - Mô tả', type: 'textarea' },
    { id: 'features.f6.icon', section: 'Tính năng', label: 'Tính năng 6 - Icon', type: 'icon' },
    { id: 'features.f6.iconColor', section: 'Tính năng', label: 'Tính năng 6 - Màu icon', type: 'color' },
    
    // Steps Section
    { id: 'steps.sectionBg', section: 'Quy trình', label: 'Màu nền', type: 'color' },
    { id: 'steps.title', section: 'Quy trình', label: 'Tiêu đề', type: 'text' },
    { id: 'steps.s1.title', section: 'Quy trình', label: 'Bước 1 - Tiêu đề', type: 'text' },
    { id: 'steps.s1.desc', section: 'Quy trình', label: 'Bước 1 - Mô tả', type: 'textarea' },
    { id: 'steps.s1.icon', section: 'Quy trình', label: 'Bước 1 - Icon', type: 'icon' },
    { id: 'steps.s1.image', section: 'Quy trình', label: 'Bước 1 - Ảnh', type: 'image' },
    { id: 'steps.s2.title', section: 'Quy trình', label: 'Bước 2 - Tiêu đề', type: 'text' },
    { id: 'steps.s2.desc', section: 'Quy trình', label: 'Bước 2 - Mô tả', type: 'textarea' },
    { id: 'steps.s2.icon', section: 'Quy trình', label: 'Bước 2 - Icon', type: 'icon' },
    { id: 'steps.s2.image', section: 'Quy trình', label: 'Bước 2 - Ảnh', type: 'image' },
    { id: 'steps.s3.title', section: 'Quy trình', label: 'Bước 3 - Tiêu đề', type: 'text' },
    { id: 'steps.s3.desc', section: 'Quy trình', label: 'Bước 3 - Mô tả', type: 'textarea' },
    { id: 'steps.s3.icon', section: 'Quy trình', label: 'Bước 3 - Icon', type: 'icon' },
    { id: 'steps.s3.image', section: 'Quy trình', label: 'Bước 3 - Ảnh', type: 'image' },
    { id: 'steps.s4.title', section: 'Quy trình', label: 'Bước 4 - Tiêu đề', type: 'text' },
    { id: 'steps.s4.desc', section: 'Quy trình', label: 'Bước 4 - Mô tả', type: 'textarea' },
    { id: 'steps.s4.icon', section: 'Quy trình', label: 'Bước 4 - Icon', type: 'icon' },
    { id: 'steps.s4.image', section: 'Quy trình', label: 'Bước 4 - Ảnh', type: 'image' },
    
    // Benefits Section
    { id: 'benefits.sectionBg', section: 'Lợi ích', label: 'Màu nền', type: 'color' },
    { id: 'benefits.title', section: 'Lợi ích', label: 'Tiêu đề', type: 'text' },
    { id: 'benefits.b1.title', section: 'Lợi ích', label: 'Lợi ích 1 - Tiêu đề', type: 'text' },
    { id: 'benefits.b1.desc', section: 'Lợi ích', label: 'Lợi ích 1 - Mô tả', type: 'textarea' },
    { id: 'benefits.b1.icon', section: 'Lợi ích', label: 'Lợi ích 1 - Icon', type: 'icon' },
    { id: 'benefits.b1.iconColor', section: 'Lợi ích', label: 'Lợi ích 1 - Màu icon', type: 'color' },
    { id: 'benefits.b2.title', section: 'Lợi ích', label: 'Lợi ích 2 - Tiêu đề', type: 'text' },
    { id: 'benefits.b2.desc', section: 'Lợi ích', label: 'Lợi ích 2 - Mô tả', type: 'textarea' },
    { id: 'benefits.b2.icon', section: 'Lợi ích', label: 'Lợi ích 2 - Icon', type: 'icon' },
    { id: 'benefits.b2.iconColor', section: 'Lợi ích', label: 'Lợi ích 2 - Màu icon', type: 'color' },
    { id: 'benefits.b3.title', section: 'Lợi ích', label: 'Lợi ích 3 - Tiêu đề', type: 'text' },
    { id: 'benefits.b3.desc', section: 'Lợi ích', label: 'Lợi ích 3 - Mô tả', type: 'textarea' },
    { id: 'benefits.b3.icon', section: 'Lợi ích', label: 'Lợi ích 3 - Icon', type: 'icon' },
    { id: 'benefits.b3.iconColor', section: 'Lợi ích', label: 'Lợi ích 3 - Màu icon', type: 'color' },
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

export default function LandingPageEditor() {
  const [selectedPage, setSelectedPage] = useState('hero');
  const [selectedLang, setSelectedLang] = useState('vi');
  const [overrides, setOverrides] = useState({});
  const [overridesEn, setOverridesEn] = useState({});
  const [editedValues, setEditedValues] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [device, setDevice] = useState('desktop');
  const [hasChanges, setHasChanges] = useState(false);
  const [previewScale, setPreviewScale] = useState(100);
  const [selectedElement, setSelectedElement] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showEditPanel, setShowEditPanel] = useState(false);
  const [hoveredElement, setHoveredElement] = useState(null);
  const [elements, setElements] = useState([]);
  
  const lastLoaded = useRef({ page: null, lang: null });

  // Load element definitions when page changes
  useEffect(() => {
    setElements(ELEMENT_DEFS[selectedPage] || []);
  }, [selectedPage]);

  useEffect(() => {
    const key = `${selectedPage}-${selectedLang}`;
    if (lastLoaded.current.page === selectedPage && lastLoaded.current.lang === selectedLang) {
      return;
    }
    lastLoaded.current = { page: selectedPage, lang: selectedLang };
    loadOverrides(selectedPage, selectedLang);
  }, [selectedPage, selectedLang]);

  useEffect(() => {
    const currentOverrides = selectedLang === 'vi' ? overrides : overridesEn;
    const hasAnyChanges = Object.keys(editedValues).some(key => 
      editedValues[key] !== currentOverrides[key]
    );
    setHasChanges(hasAnyChanges);
  }, [editedValues, overrides, overridesEn, selectedLang]);

  const loadOverrides = async (page, lang) => {
    setIsLoading(true);
    try {
      const [resVi, resEn] = await Promise.all([
        landingCustomizerApiService.getOverrides(page, 'vi'),
        landingCustomizerApiService.getOverrides(page, 'en'),
      ]);
      
      const parseOverrides = (res) => {
        if (res.data?.overrides) {
          return res.data.overrides;
        }
        const map = {};
        if (Array.isArray(res.data)) {
          res.data.forEach(o => {
            map[o.key] = o.valueVi || o.valueEn || o.value || '';
          });
        }
        return map;
      };

      const viData = parseOverrides(resVi);
      const enData = parseOverrides(resEn);

      setOverrides(viData);
      setOverridesEn(enData);
      
      const currentOverrides = lang === 'vi' ? viData : enData;
      setEditedValues(currentOverrides);
    } catch (err) {
      setOverrides({});
      setOverridesEn({});
      setEditedValues({});
    } finally {
      setIsLoading(false);
    }
  };

  const handleValueChange = (key, value) => {
    setEditedValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await landingCustomizerApiService.saveOverrides(selectedPage, selectedLang, editedValues);
      if (selectedLang === 'vi') {
        setOverrides(editedValues);
      } else {
        setOverridesEn(editedValues);
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      alert('Lỗi khi lưu: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    if (selectedLang === 'vi') {
      setEditedValues(overrides);
    } else {
      setEditedValues(overridesEn);
    }
  };

  const handleRefresh = () => {
    loadOverrides(selectedPage, selectedLang);
  };

  // Handle element selected in iframe
  const handleElementSelected = (elementId) => {
    const element = elements.find(el => el.id === elementId);
    if (element) {
      setSelectedElement(element);
      // Load value from editedValues
      setEditValue(editedValues[elementId] || '');
      setShowEditPanel(true);
    }
  };

  // Sync editValue when editedValues changes (e.g., after save)
  useEffect(() => {
    if (selectedElement && showEditPanel) {
      setEditValue(editedValues[selectedElement.id] || '');
    }
  }, [editedValues, selectedElement, showEditPanel]);

  // Handle save from edit panel
  const handlePanelSave = () => {
    if (selectedElement) {
      handleValueChange(selectedElement.id, editValue);
      setShowEditPanel(false);
    }
  };

  // Close edit panel
  const closeEditPanel = () => {
    setShowEditPanel(false);
    setSelectedElement(null);
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closeEditPanel();
      }
      if (e.key === 'Enter' && e.ctrlKey && showEditPanel && selectedElement) {
        handleValueChange(selectedElement.id, editValue);
        setShowEditPanel(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showEditPanel, selectedElement, editValue]);

  const changedCount = Object.keys(editedValues).filter(key => 
    editedValues[key] !== (selectedLang === 'vi' ? overrides : overridesEn)[key]
  ).length;

  return (
    <div className="h-full flex flex-col bg-slate-100">
      {/* Header */}
      <div className="px-6 py-4 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">
              ✏️ Landing Page Visual Editor
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Click trực tiếp vào text để chỉnh sửa
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {hasChanges && (
              <>
                <span className="text-sm text-orange-500 font-medium">
                  {changedCount} thay đổi
                </span>
                <button
                  onClick={handleReset}
                  className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  ↩️ Hoàn tác
                </button>
                <button
                  onClick={handleSave}
                  disabled={isSaving}
                  className={`px-6 py-2 text-sm font-semibold rounded-lg transition-all ${
                    saveSuccess 
                      ? 'bg-green-500 text-white' 
                      : 'bg-orange-500 text-white hover:bg-orange-600'
                  } disabled:opacity-50`}
                >
                  {isSaving ? '⏳ Đang lưu...' : saveSuccess ? '✅ Đã lưu!' : '💾 Lưu thay đổi'}
                </button>
              </>
            )}
            {!hasChanges && (
              <span className="px-4 py-2 text-sm text-green-600 font-medium">
                ✓ Đã lưu
              </span>
            )}
          </div>
        </div>

        {/* Page & Language Selector */}
        <div className="flex items-center gap-4 mt-4 flex-wrap">
          <label className="text-sm font-medium text-slate-600">Trang:</label>
          <div className="flex bg-slate-100 rounded-lg p-1">
            {PAGES.map((page) => (
              <button
                key={page.id}
                onClick={() => { 
                  setSelectedPage(page.id); 
                  setShowEditPanel(false);
                }}
                className={`px-5 py-2.5 text-sm font-semibold rounded-lg transition-all ${
                  selectedPage === page.id
                    ? 'bg-orange-500 text-white shadow-md'
                    : 'text-slate-600 hover:bg-white'
                }`}
              >
                {selectedLang === 'vi' ? page.labelVi : page.label}
              </button>
            ))}
          </div>

          <div className="h-8 w-px bg-slate-300 mx-2" />

          <label className="text-sm font-medium text-slate-600">Ngôn ngữ:</label>
          <div className="flex bg-slate-100 rounded-lg p-1">
            <button
              onClick={() => setSelectedLang('vi')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                selectedLang === 'vi' ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-white'
              }`}
            >
              🇻🇳 Tiếng Việt
            </button>
            <button
              onClick={() => setSelectedLang('en')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${
                selectedLang === 'en' ? 'bg-blue-500 text-white' : 'text-slate-600 hover:bg-white'
              }`}
            >
              🇬🇧 English
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col bg-slate-200">
          {/* Toolbar */}
          <div className="px-4 py-3 bg-white border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-full text-xs font-bold">
                🎯 Click vào text để sửa
              </span>
              {hoveredElement && (
                <span className="text-xs text-slate-500">
                  Hover: {hoveredElement}
                </span>
              )}
            </div>
            
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 bg-slate-100 rounded-lg px-2 py-1">
                <button 
                  onClick={() => setPreviewScale(Math.max(50, previewScale - 25))}
                  className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded"
                >
                  −
                </button>
                <span className="text-xs font-medium text-slate-600 w-12 text-center">
                  {previewScale}%
                </span>
                <button 
                  onClick={() => setPreviewScale(Math.min(150, previewScale + 25))}
                  className="w-7 h-7 flex items-center justify-center text-slate-600 hover:bg-slate-200 rounded"
                >
                  +
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button 
                  onClick={() => setDevice('mobile')} 
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    device === 'mobile' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  📱
                </button>
                <button 
                  onClick={() => setDevice('tablet')} 
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    device === 'tablet' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  📱
                </button>
                <button 
                  onClick={() => setDevice('desktop')} 
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                    device === 'desktop' ? 'bg-orange-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  💻
                </button>
              </div>

              <button
                onClick={handleRefresh}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          {/* Preview Frame */}
          <div className="flex-1 overflow-auto bg-slate-300">
            <PreviewFrame 
              key={`${selectedPage}-${selectedLang}`}
              page={selectedPage} 
              device={device} 
              locale={selectedLang}
              overrides={editedValues}
              onElementSelected={handleElementSelected}
            />
          </div>
        </div>
      </div>

      {/* Edit Panel */}
      {showEditPanel && selectedElement && (
        <div
          className="fixed z-[9999] bg-slate-800 rounded-xl shadow-2xl border border-slate-600 w-[440px] max-h-[80vh] overflow-hidden flex flex-col"
          style={{
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
          }}
        >
          <div className="px-4 py-3 bg-slate-900 border-b border-slate-700 flex items-center justify-between flex-shrink-0">
            <div>
              <div className="text-xs text-orange-400 font-medium">{selectedElement.section}</div>
              <div className="text-white font-semibold text-sm">{selectedElement.label}</div>
            </div>
            <button
              onClick={closeEditPanel}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
            >
              ✕
            </button>
          </div>
          
          <div className="p-4 space-y-3 overflow-y-auto flex-1">
            {selectedElement.type === 'text' && (
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Nhập nội dung..."
                autoFocus
              />
            )}
            
            {selectedElement.type === 'textarea' && (
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="Nhập nội dung..."
                autoFocus
              />
            )}
            
            {selectedElement.type === 'color' && (
              <div className="flex gap-3 items-center">
                <input
                  type="color"
                  value={editValue || '#000000'}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-12 h-10 rounded cursor-pointer border-0 bg-transparent"
                />
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="flex-1 px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                  placeholder="#000000"
                />
                <button
                  onClick={() => setEditValue('')}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-white bg-slate-700 rounded-lg"
                >
                  Clear
                </button>
              </div>
            )}
            
            {selectedElement.type === 'icon' && (
              <IconPicker 
                value={editValue} 
                onChange={setEditValue} 
              />
            )}
            
            {selectedElement.type === 'image' && (
              <div className="space-y-2">
                {editValue && (
                  <div className="relative">
                    <img src={editValue} alt="" className="w-full h-32 object-cover rounded-lg" />
                    <button
                      onClick={() => setEditValue('')}
                      className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs flex items-center justify-center"
                    >
                      ✕
                    </button>
                  </div>
                )}
                <input
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="URL ảnh..."
                />
                <p className="text-xs text-slate-500">Dán URL ảnh hoặc upload ảnh lên server và dán link</p>
              </div>
            )}
            
            <div className="flex gap-2 pt-2">
              <button
                onClick={closeEditPanel}
                className="flex-1 px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
              >
                Hủy
              </button>
              <button
                onClick={handlePanelSave}
                className="flex-1 px-4 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors"
              >
                Lưu
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
