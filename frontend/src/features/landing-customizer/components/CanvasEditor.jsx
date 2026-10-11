import { useState, useEffect, useRef, useMemo } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineCode,
  HiOutlineCursorClick,
  HiOutlineExternalLink,
  HiOutlineMinus,
  HiOutlinePencilAlt,
  HiOutlinePlus,
  HiOutlineReply,
} from 'react-icons/hi';
import landingCustomizerApiService from '../services/landingCustomizerApi.service';
import PropertiesPanel from './PropertiesPanel';
import EditorModeSettings from './EditorModeSettings';
import {
  AdminEditorShell,
  EditorSettingsModal,
  EditorTopbar,
  TopbarButton,
  TopbarDivider,
  TopbarSaveButton,
  TopbarSegmented,
  TopbarSettingsButton,
  TopbarToolsMenu,
} from '../../../components/editor/AdminEditorShell';
import { DEVICES } from '../../landing-canvas/utils/deviceFrameConfig.js';
import { useI18n } from '../../../i18n';

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
    
    // Stats Section
    { id: 'stats.businesses', section: 'Thống kê', label: 'Số Doanh nghiệp', type: 'text' },
    { id: 'stats.businessesLabel', section: 'Thống kê', label: 'Nhãn Doanh nghiệp', type: 'text' },
    { id: 'stats.leads', section: 'Thống kê', label: 'Số Leads', type: 'text' },
    { id: 'stats.leadsLabel', section: 'Thống kê', label: 'Nhãn Leads', type: 'text' },
    { id: 'stats.campaigns', section: 'Thống kê', label: 'Số Chiến dịch', type: 'text' },
    { id: 'stats.campaignsLabel', section: 'Thống kê', label: 'Nhãn Chiến dịch', type: 'text' },
    { id: 'stats.uptime', section: 'Thống kê', label: 'Uptime', type: 'text' },
    { id: 'stats.uptimeLabel', section: 'Thống kê', label: 'Nhãn Uptime', type: 'text' },
    { id: 'stats.numberColor', section: 'Thống kê', label: 'Màu số', type: 'color' },
    { id: 'stats.labelColor', section: 'Thống kê', label: 'Màu nhãn', type: 'color' },
    
    // Features Section
    { id: 'features.badge', section: 'Tính năng', label: 'Badge', type: 'text' },
    { id: 'features.title', section: 'Tính năng', label: 'Tiêu đề', type: 'text' },
    { id: 'features.titleHighlight', section: 'Tính năng', label: 'Tiêu đề nhấn', type: 'text' },
    { id: 'features.subtitle', section: 'Tính năng', label: 'Phụ đề', type: 'textarea' },
    
    // Feature 1
    { id: 'features.f1.title', section: 'Tính năng', label: 'Tính năng 1 - Tiêu đề', type: 'text' },
    { id: 'features.f1.desc', section: 'Tính năng', label: 'Tính năng 1 - Mô tả', type: 'textarea' },
    { id: 'features.f1.iconColor', section: 'Tính năng', label: 'Tính năng 1 - Màu icon', type: 'color' },
    
    // Feature 2
    { id: 'features.f2.title', section: 'Tính năng', label: 'Tính năng 2 - Tiêu đề', type: 'text' },
    { id: 'features.f2.desc', section: 'Tính năng', label: 'Tính năng 2 - Mô tả', type: 'textarea' },
    { id: 'features.f2.iconColor', section: 'Tính năng', label: 'Tính năng 2 - Màu icon', type: 'color' },
    
    // Feature 3
    { id: 'features.f3.title', section: 'Tính năng', label: 'Tính năng 3 - Tiêu đề', type: 'text' },
    { id: 'features.f3.desc', section: 'Tính năng', label: 'Tính năng 3 - Mô tả', type: 'textarea' },
    { id: 'features.f3.iconColor', section: 'Tính năng', label: 'Tính năng 3 - Màu icon', type: 'color' },
    
    // Feature 4
    { id: 'features.f4.title', section: 'Tính năng', label: 'Tính năng 4 - Tiêu đề', type: 'text' },
    { id: 'features.f4.desc', section: 'Tính năng', label: 'Tính năng 4 - Mô tả', type: 'textarea' },
    { id: 'features.f4.iconColor', section: 'Tính năng', label: 'Tính năng 4 - Màu icon', type: 'color' },
    
    // Feature 5
    { id: 'features.f5.title', section: 'Tính năng', label: 'Tính năng 5 - Tiêu đề', type: 'text' },
    { id: 'features.f5.desc', section: 'Tính năng', label: 'Tính năng 5 - Mô tả', type: 'textarea' },
    { id: 'features.f5.iconColor', section: 'Tính năng', label: 'Tính năng 5 - Màu icon', type: 'color' },
    
    // Feature 6
    { id: 'features.f6.title', section: 'Tính năng', label: 'Tính năng 6 - Tiêu đề', type: 'text' },
    { id: 'features.f6.desc', section: 'Tính năng', label: 'Tính năng 6 - Mô tả', type: 'textarea' },
    { id: 'features.f6.iconColor', section: 'Tính năng', label: 'Tính năng 6 - Màu icon', type: 'color' },
    
    // Steps Section
    { id: 'steps.badge', section: 'Quy trình', label: 'Badge', type: 'text' },
    { id: 'steps.title', section: 'Quy trình', label: 'Tiêu đề', type: 'text' },
    { id: 'steps.subtitle', section: 'Quy trình', label: 'Phụ đề', type: 'text' },
    
    // Step 1
    { id: 'steps.s1.title', section: 'Quy trình', label: 'Bước 1 - Tiêu đề', type: 'text' },
    { id: 'steps.s1.desc', section: 'Quy trình', label: 'Bước 1 - Mô tả', type: 'textarea' },
    
    // Step 2
    { id: 'steps.s2.title', section: 'Quy trình', label: 'Bước 2 - Tiêu đề', type: 'text' },
    { id: 'steps.s2.desc', section: 'Quy trình', label: 'Bước 2 - Mô tả', type: 'textarea' },
    
    // Step 3
    { id: 'steps.s3.title', section: 'Quy trình', label: 'Bước 3 - Tiêu đề', type: 'text' },
    { id: 'steps.s3.desc', section: 'Quy trình', label: 'Bước 3 - Mô tả', type: 'textarea' },
    
    // Step 4
    { id: 'steps.s4.title', section: 'Quy trình', label: 'Bước 4 - Tiêu đề', type: 'text' },
    { id: 'steps.s4.desc', section: 'Quy trình', label: 'Bước 4 - Mô tả', type: 'textarea' },
    
    // Benefits Section
    { id: 'benefits.title', section: 'Lợi ích', label: 'Tiêu đề', type: 'text' },
    
    // Benefit 1
    { id: 'benefits.b1.title', section: 'Lợi ích', label: 'Lợi ích 1 - Tiêu đề', type: 'text' },
    { id: 'benefits.b1.desc', section: 'Lợi ích', label: 'Lợi ích 1 - Mô tả', type: 'textarea' },
    
    // Benefit 2
    { id: 'benefits.b2.title', section: 'Lợi ích', label: 'Lợi ích 2 - Tiêu đề', type: 'text' },
    { id: 'benefits.b2.desc', section: 'Lợi ích', label: 'Lợi ích 2 - Mô tả', type: 'textarea' },
    
    // Benefit 3
    { id: 'benefits.b3.title', section: 'Lợi ích', label: 'Lợi ích 3 - Tiêu đề', type: 'text' },
    { id: 'benefits.b3.desc', section: 'Lợi ích', label: 'Lợi ích 3 - Mô tả', type: 'textarea' },
    
    // Benefit 4
    { id: 'benefits.b4.title', section: 'Lợi ích', label: 'Lợi ích 4 - Tiêu đề', type: 'text' },
    { id: 'benefits.b4.desc', section: 'Lợi ích', label: 'Lợi ích 4 - Mô tả', type: 'textarea' },
    
    // CTA Section
    { id: 'cta.title', section: 'CTA', label: 'Tiêu đề', type: 'text' },
    { id: 'cta.subtitle', section: 'CTA', label: 'Phụ đề', type: 'text' },
    { id: 'cta.button', section: 'CTA', label: 'Nút bấm', type: 'text' },
    { id: 'cta.note', section: 'CTA', label: 'Ghi chú', type: 'text' },
  ],
  contact: [
    { id: 'contact.title', section: 'Header', label: 'Tiêu đề', type: 'text' },
    { id: 'contact.subtitle', section: 'Header', label: 'Phụ đề', type: 'text' },
    { id: 'contact.titleColor', section: 'Header', label: 'Màu tiêu đề', type: 'color' },
    
    // Form
    { id: 'contact.formTitle', section: 'Form', label: 'Tiêu đề Form', type: 'text' },
    { id: 'contact.formSubtitle', section: 'Form', label: 'Phụ đề Form', type: 'text' },
    
    // Contact Channels Header
    { id: 'contact.contactChannels', section: 'Liên hệ', label: 'Tiêu đề Liên hệ', type: 'text' },
    { id: 'contact.contactChannelsSubtitle', section: 'Liên hệ', label: 'Phụ đề Liên hệ', type: 'text' },
    
    // Email
    { id: 'contact.emailHref', section: 'Liên hệ', label: 'Email Link', type: 'text' },
    { id: 'contact.email.label', section: 'Liên hệ', label: 'Email - Nhãn', type: 'text' },
    { id: 'contact.email.value', section: 'Liên hệ', label: 'Email - Giá trị', type: 'text' },
    { id: 'contact.email.desc', section: 'Liên hệ', label: 'Email - Mô tả', type: 'text' },
    
    // Phone
    { id: 'contact.phoneHref', section: 'Liên hệ', label: 'Phone Link', type: 'text' },
    { id: 'contact.phone.label', section: 'Liên hệ', label: 'Phone - Nhãn', type: 'text' },
    { id: 'contact.phone.value', section: 'Liên hệ', label: 'Phone - Giá trị', type: 'text' },
    { id: 'contact.phone.desc', section: 'Liên hệ', label: 'Phone - Mô tả', type: 'text' },
    
    // Zalo
    { id: 'contact.zaloHref', section: 'Liên hệ', label: 'Zalo Link', type: 'text' },
    { id: 'contact.zalo.label', section: 'Liên hệ', label: 'Zalo - Nhãn', type: 'text' },
    { id: 'contact.zalo.value', section: 'Liên hệ', label: 'Zalo - Giá trị', type: 'text' },
    { id: 'contact.zalo.desc', section: 'Liên hệ', label: 'Zalo - Mô tả', type: 'text' },
    
    // Office
    { id: 'contact.office.label', section: 'Liên hệ', label: 'Office - Nhãn', type: 'text' },
    { id: 'contact.office.value', section: 'Liên hệ', label: 'Office - Giá trị', type: 'text' },
    { id: 'contact.office.desc', section: 'Liên hệ', label: 'Office - Mô tả', type: 'text' },
    
    // CTA
    { id: 'contact.readyToStart', section: 'CTA', label: 'Sẵn sàng bắt đầu', type: 'text' },
    { id: 'contact.freeTrial', section: 'CTA', label: 'Dùng thử miễn phí', type: 'text' },
    
    // Map
    { id: 'contact.mapEmbed', section: 'Bản đồ', label: 'Google Maps Embed', type: 'textarea' },
  ],
  pricing: [
    { id: 'pricing.badge', section: 'Header', label: 'Badge', type: 'text' },
    { id: 'pricing.title', section: 'Header', label: 'Tiêu đề', type: 'text' },
    { id: 'pricing.subtitle', section: 'Header', label: 'Phụ đề', type: 'text' },
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

// Bố cục 11/10/2026 (PLAN_TRANG_SOAN_QUAN_TRI): chép kiểu "Tạo landing page" /app — thanh trên 52px (trang · thiết bị · zoom
// ở giữa; Cài đặt · Công cụ · Lưu bên phải), vùng chính chỉ còn xem trước + bảng thuộc tính. CHỈ ĐỔI BỐ CỤC: toàn bộ state,
// `handleValueChange(id, lang, value)`, `saveOverrides(page, lang, overrides)`, cơ chế postMessage xem trước, `ELEMENT_DEFS`
// giữ nguyên — xem test hợp đồng `__tests__/CanvasEditor.contract.spec.jsx`.
const DEVICE_WIDTH_PX = { mobile: 375, tablet: 768 };
const ZOOM_MIN = 0.25;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.25;

export default function CanvasEditor({ editorMode = 'canva', onEditorModeChange }) {
  const { t } = useI18n();
  const iframeRef = useRef(null);

  // State
  const [selectedPage, setSelectedPage] = useState('hero');
  const [selectedElement, setSelectedElement] = useState(null);
  const [editedValues, setEditedValues] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [device, setDevice] = useState('desktop');
  const [previewScale, setPreviewScale] = useState(1);
  // Chỉ phục vụ trình bày: modal Cài đặt + trạng thái hiển thị (chỉ đọc) của trang đang chọn.
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [displayState, setDisplayState] = useState(null);

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
      toast.success(t('landingCustomizer.editor.saveSuccess'));
    } catch (err) {
      toast.error(t('landingCustomizer.editor.saveFailed', { message: err.message }));
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

  // Mở Cài đặt thì hỏi (chỉ đọc) trang này đang hiển thị bản mặc định hay HTML tuỳ chỉnh — chỉnh sửa Canva chỉ có tác dụng
  // khi hiển thị mặc định. Lỗi thì im lặng về 'unknown', không chặn gì.
  useEffect(() => {
    if (!settingsOpen) return undefined;
    let cancelled = false;
    setDisplayState('loading');
    (async () => {
      try {
        const res = await landingCustomizerApiService.getHtmlMode(selectedPage);
        if (!cancelled) setDisplayState(res?.data?.data?.displayMode === 'html' ? 'html' : 'default');
      } catch {
        if (!cancelled) setDisplayState('unknown');
      }
    })();
    return () => { cancelled = true; };
  }, [settingsOpen, selectedPage]);

  const hasChanges = Object.keys(editedValues).length > 0;
  const deviceWidthPx = DEVICE_WIDTH_PX[device] || null;
  const publicUrl = `${window.location.origin}${PAGE_URLS[selectedPage]}`;

  const handlePageChange = (pageId) => {
    setSelectedPage(pageId);
    setSelectedElement(null);
  };

  const pageOptions = PAGES.map((page) => ({
    value: page.id,
    label: t(`landingCustomizer.pages.${page.id}`),
    title: page.path,
  }));
  const deviceOptions = ['mobile', 'tablet', 'desktop'].map((key) => ({
    value: key,
    label: '',
    icon: DEVICES[key].icon,
    title: t(`landingCustomizer.devices.${key}`),
  }));

  const pageSwitcher = (
    <TopbarSegmented value={selectedPage} onChange={handlePageChange} options={pageOptions} ariaLabel={t('landingCustomizer.editor.pageSwitcher')} />
  );
  const deviceSwitcher = (
    <TopbarSegmented value={device} onChange={setDevice} options={deviceOptions} ariaLabel={t('landingCustomizer.editor.deviceSwitcher')} />
  );

  const zoomControl = (
    <div role="group" aria-label={t('landingCustomizer.editor.zoom')} className="hidden xl:flex items-center gap-0.5 p-1 bg-gray-100/90 dark:bg-dk-raised rounded-xl border border-transparent dark:border-dk-border">
      <button
        type="button"
        onClick={() => setPreviewScale(Math.max(ZOOM_MIN, previewScale - ZOOM_STEP))}
        disabled={previewScale <= ZOOM_MIN}
        aria-label={t('landingCustomizer.editor.zoomOut')}
        title={t('landingCustomizer.editor.zoomOut')}
        className="p-1.5 rounded-lg text-gray-500 dark:text-dk-text2 hover:text-gray-900 dark:hover:text-dk-text hover:bg-white/60 dark:hover:bg-dk-strong/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <HiOutlineMinus className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => setPreviewScale(1)}
        title={t('landingCustomizer.editor.zoomReset')}
        className="min-w-[44px] px-1.5 py-1 rounded-lg text-xs font-semibold text-gray-700 dark:text-dk-text hover:text-orange-600 dark:hover:text-orange-400 hover:bg-white/60 dark:hover:bg-dk-strong/60 transition-colors"
      >
        {Math.round(previewScale * 100)}%
      </button>
      <button
        type="button"
        onClick={() => setPreviewScale(Math.min(ZOOM_MAX, previewScale + ZOOM_STEP))}
        disabled={previewScale >= ZOOM_MAX}
        aria-label={t('landingCustomizer.editor.zoomIn')}
        title={t('landingCustomizer.editor.zoomIn')}
        className="p-1.5 rounded-lg text-gray-500 dark:text-dk-text2 hover:text-gray-900 dark:hover:text-dk-text hover:bg-white/60 dark:hover:bg-dk-strong/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <HiOutlinePlus className="w-3.5 h-3.5" />
      </button>
    </div>
  );

  const toolsItems = [
    {
      key: 'reset',
      icon: HiOutlineReply,
      label: t('landingCustomizer.editor.reset'),
      description: t('landingCustomizer.editor.resetDesc'),
      onClick: handleReset,
      disabled: !hasChanges,
      danger: true,
    },
    {
      key: 'open-public',
      icon: HiOutlineExternalLink,
      label: t('landingCustomizer.editor.openPublic'),
      description: PAGE_URLS[selectedPage],
      onClick: () => window.open(publicUrl, '_blank', 'noopener,noreferrer'),
    },
  ];

  return (
    <AdminEditorShell
      topbar={(
        <EditorTopbar
          icon={HiOutlinePencilAlt}
          title={t('landingCustomizer.editor.title')}
          subtitle={t('landingCustomizer.editor.subtitleCanva')}
          center={<>{pageSwitcher}{deviceSwitcher}{zoomControl}</>}
          right={(
            <>
              <TopbarSettingsButton onClick={() => setSettingsOpen(true)} active={settingsOpen} />
              <TopbarToolsMenu items={toolsItems} />
              <TopbarDivider />
              <TopbarSaveButton onClick={handleSave} saving={isSaving} disabled={!hasChanges} />
            </>
          )}
        />
      )}
    >
      <div className="h-full min-h-0 flex flex-col lg:flex-row">
        {/* Xem trước */}
        <div className="flex-1 min-w-0 min-h-0 flex flex-col">
          {/* Dưới md thanh trên ẩn cụm giữa — cho trang (và thiết bị, từ sm) xuống đây */}
          <div className="md:hidden shrink-0 flex items-center gap-2 px-3 py-2 overflow-x-auto bg-white dark:bg-dk-surface border-b border-gray-200/80 dark:border-dk-border">
            {pageSwitcher}
            <span className="hidden sm:inline-flex">{deviceSwitcher}</span>
          </div>

          <div className="shrink-0 h-9 px-3 flex items-center gap-2 text-xs bg-white/70 dark:bg-dk-surface border-b border-gray-200/80 dark:border-dk-border">
            {selectedElement ? (
              <>
                <HiOutlineCursorClick className="w-4 h-4 text-orange-500 shrink-0" aria-hidden="true" />
                <span className="text-gray-500 dark:text-dk-text2 shrink-0">{t('landingCustomizer.editor.selected')}</span>
                <span className="font-semibold text-gray-900 dark:text-dk-text truncate">{selectedElement.label}</span>
              </>
            ) : (
              <span className="text-gray-500 dark:text-dk-text2 truncate">{t('landingCustomizer.editor.hint')}</span>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-auto bg-gray-100 dark:bg-dk-inset p-3">
            <div
              className="mx-auto h-full bg-white dark:bg-dk-surface shadow-lg ring-1 ring-black/5 overflow-hidden"
              style={{ width: deviceWidthPx ? `${deviceWidthPx * previewScale}px` : '100%' }}
            >
              <div
                style={{
                  transform: `scale(${previewScale})`,
                  transformOrigin: 'top left',
                  width: deviceWidthPx ? `${deviceWidthPx}px` : `${100 / previewScale}%`,
                  height: `${100 / previewScale}%`,
                }}
              >
                <iframe
                  key={`${selectedPage}-vi-${device}`}
                  ref={iframeRef}
                  src={`${window.location.origin}${PAGE_URLS[selectedPage]}?lang=vi&preview=edit`}
                  title={`Preview: ${selectedPage}`}
                  className="border-0 w-full h-full"
                  onLoad={handleIframeLoad}
                  sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Bảng thuộc tính — dưới lg xếp dưới xem trước và chỉ hiện khi đã chọn phần tử */}
        <aside
          className={`${selectedElement ? 'flex' : 'hidden lg:flex'} flex-col shrink-0 min-h-0 w-full lg:w-96 h-[48%] lg:h-auto bg-white dark:bg-dk-surface border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-dk-border overflow-hidden`}
        >
          {selectedElement ? (
            <PropertiesPanel
              element={selectedElement}
              value={editedValues[selectedElement.id]}
              onChange={handleValueChange}
              onClose={() => setSelectedElement(null)}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-dk-muted text-sm p-6 text-center">
              <div>
                <span className="mx-auto mb-3 w-12 h-12 rounded-2xl bg-orange-50 dark:bg-orange-950/30 text-orange-500 flex items-center justify-center">
                  <HiOutlineCursorClick className="w-6 h-6" aria-hidden="true" />
                </span>
                <p className="text-base font-medium mb-1 text-gray-800 dark:text-dk-text">{t('landingCustomizer.editor.emptyTitle')}</p>
                <p className="text-sm">{t('landingCustomizer.editor.emptyDesc')}</p>
              </div>
            </div>
          )}
        </aside>
      </div>

      <EditorSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        title={t('landingCustomizer.editor.settings.title')}
        subtitle={t('landingCustomizer.editor.settings.subtitle')}
        footer={<TopbarButton onClick={() => setSettingsOpen(false)}>{t('editorShell.close')}</TopbarButton>}
      >
        <EditorModeSettings
          mode={editorMode}
          onModeChange={onEditorModeChange}
          displayState={displayState}
          pageLabel={t(`landingCustomizer.pages.${selectedPage}`)}
          pagePath={PAGE_URLS[selectedPage]}
        >
          {displayState === 'html' && onEditorModeChange && (
            <TopbarButton icon={HiOutlineCode} onClick={() => onEditorModeChange('html')}>
              {t('landingCustomizer.editor.settings.openHtml')}
            </TopbarButton>
          )}
        </EditorModeSettings>
      </EditorSettingsModal>
    </AdminEditorShell>
  );
}
