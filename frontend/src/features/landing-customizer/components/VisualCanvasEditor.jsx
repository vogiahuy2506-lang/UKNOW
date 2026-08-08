import { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';

/**
 * VisualCanvasEditor - Overlay cho phép click trực tiếp vào element để edit
 * 
 * Cách hoạt động:
 * 1. Overlay preview với border để nhận diện
 * 2. Hover hiển thị highlight + icon edit
 * 3. Click mở inline editor panel
 * 4. Edit xong save vào overrides
 */

export default function VisualCanvasEditor({
  page,
  overrides,
  onValueChange,
  isSaving,
  previewRef,
  children,
}) {
  const [selectedElement, setSelectedElement] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showPanel, setShowPanel] = useState(false);
  const [panelPosition, setPanelPosition] = useState({ x: 0, y: 0 });

  // Close panel
  const closePanel = useCallback(() => {
    setShowPanel(false);
    setSelectedElement(null);
    setEditValue('');
  }, []);

  // Element map - định nghĩa các element có thể edit trên mỗi page
  const ELEMENT_MAP = {
    hero: [
      // Hero Header
      { id: 'hero.tagline', selector: '[data-edit="hero.tagline"]', section: 'Header', label: 'Badge Text', type: 'text' },
      { id: 'hero.titleLine1', selector: '[data-edit="hero.titleLine1"]', section: 'Header', label: 'Tiêu đề dòng 1', type: 'text' },
      { id: 'hero.titleAccent', selector: '[data-edit="hero.titleAccent"]', section: 'Header', label: 'Tiêu đề nhấn', type: 'text' },
      { id: 'hero.titleLine2', selector: '[data-edit="hero.titleLine2"]', section: 'Header', label: 'Tiêu đề dòng 2', type: 'text' },
      { id: 'hero.subtitle', selector: '[data-edit="hero.subtitle"]', section: 'Header', label: 'Phụ đề', type: 'textarea' },
      
      // Stats
      { id: 'stats.businesses', selector: '[data-edit="stats.businesses"]', section: 'Thống kê', label: 'Doanh nghiệp', type: 'text' },
      { id: 'stats.leads', selector: '[data-edit="stats.leads"]', section: 'Thống kê', label: 'Leads', type: 'text' },
      { id: 'stats.campaigns', selector: '[data-edit="stats.campaigns"]', section: 'Thống kê', label: 'Chiến dịch', type: 'text' },
      { id: 'stats.uptime', selector: '[data-edit="stats.uptime"]', section: 'Thống kê', label: 'Uptime', type: 'text' },
      
      // Features
      { id: 'features.f1.title', selector: '[data-edit="features.f1.title"]', section: 'Tính năng', label: 'Tính năng 1 - Tiêu đề', type: 'text' },
      { id: 'features.f1.desc', selector: '[data-edit="features.f1.desc"]', section: 'Tính năng', label: 'Tính năng 1 - Mô tả', type: 'textarea' },
      { id: 'features.f2.title', selector: '[data-edit="features.f2.title"]', section: 'Tính năng', label: 'Tính năng 2 - Tiêu đề', type: 'text' },
      { id: 'features.f2.desc', selector: '[data-edit="features.f2.desc"]', section: 'Tính năng', label: 'Tính năng 2 - Mô tả', type: 'textarea' },
      { id: 'features.f3.title', selector: '[data-edit="features.f3.title"]', section: 'Tính năng', label: 'Tính năng 3 - Tiêu đề', type: 'text' },
      { id: 'features.f3.desc', selector: '[data-edit="features.f3.desc"]', section: 'Tính năng', label: 'Tính năng 3 - Mô tả', type: 'textarea' },
      { id: 'features.f4.title', selector: '[data-edit="features.f4.title"]', section: 'Tính năng', label: 'Tính năng 4 - Tiêu đề', type: 'text' },
      { id: 'features.f4.desc', selector: '[data-edit="features.f4.desc"]', section: 'Tính năng', label: 'Tính năng 4 - Mô tả', type: 'textarea' },
      { id: 'features.f5.title', selector: '[data-edit="features.f5.title"]', section: 'Tính năng', label: 'Tính năng 5 - Tiêu đề', type: 'text' },
      { id: 'features.f5.desc', selector: '[data-edit="features.f5.desc"]', section: 'Tính năng', label: 'Tính năng 5 - Mô tả', type: 'textarea' },
      { id: 'features.f6.title', selector: '[data-edit="features.f6.title"]', section: 'Tính năng', label: 'Tính năng 6 - Tiêu đề', type: 'text' },
      { id: 'features.f6.desc', selector: '[data-edit="features.f6.desc"]', section: 'Tính năng', label: 'Tính năng 6 - Mô tả', type: 'textarea' },
      
      // Steps
      { id: 'steps.s1.title', selector: '[data-edit="steps.s1.title"]', section: 'Quy trình', label: 'Bước 1 - Tiêu đề', type: 'text' },
      { id: 'steps.s1.desc', selector: '[data-edit="steps.s1.desc"]', section: 'Quy trình', label: 'Bước 1 - Mô tả', type: 'textarea' },
      { id: 'steps.s2.title', selector: '[data-edit="steps.s2.title"]', section: 'Quy trình', label: 'Bước 2 - Tiêu đề', type: 'text' },
      { id: 'steps.s2.desc', selector: '[data-edit="steps.s2.desc"]', section: 'Quy trình', label: 'Bước 2 - Mô tả', type: 'textarea' },
      { id: 'steps.s3.title', selector: '[data-edit="steps.s3.title"]', section: 'Quy trình', label: 'Bước 3 - Tiêu đề', type: 'text' },
      { id: 'steps.s3.desc', selector: '[data-edit="steps.s3.desc"]', section: 'Quy trình', label: 'Bước 3 - Mô tả', type: 'textarea' },
      { id: 'steps.s4.title', selector: '[data-edit="steps.s4.title"]', section: 'Quy trình', label: 'Bước 4 - Tiêu đề', type: 'text' },
      { id: 'steps.s4.desc', selector: '[data-edit="steps.s4.desc"]', section: 'Quy trình', label: 'Bước 4 - Mô tả', type: 'textarea' },
      
      // CTA
      { id: 'cta.title', selector: '[data-edit="cta.title"]', section: 'CTA', label: 'Tiêu đề', type: 'text' },
      { id: 'cta.subtitle', selector: '[data-edit="cta.subtitle"]', section: 'CTA', label: 'Phụ đề', type: 'text' },
      { id: 'cta.button', selector: '[data-edit="cta.button"]', section: 'CTA', label: 'Nút bấm', type: 'text' },
      { id: 'cta.note', selector: '[data-edit="cta.note"]', section: 'CTA', label: 'Ghi chú', type: 'text' },
    ],
    contact: [
      { id: 'contact.title', selector: '[data-edit="contact.title"]', section: 'Header', label: 'Tiêu đề', type: 'text' },
      { id: 'contact.subtitle', selector: '[data-edit="contact.subtitle"]', section: 'Header', label: 'Phụ đề', type: 'text' },
      { id: 'contact.email.value', selector: '[data-edit="contact.email.value"]', section: 'Liên hệ', label: 'Email', type: 'text' },
      { id: 'contact.hotline.value', selector: '[data-edit="contact.hotline.value"]', section: 'Liên hệ', label: 'Hotline', type: 'text' },
      { id: 'contact.zalo.value', selector: '[data-edit="contact.zalo.value"]', section: 'Liên hệ', label: 'Zalo', type: 'text' },
      { id: 'contact.office.value', selector: '[data-edit="contact.office.value"]', section: 'Liên hệ', label: 'Địa chỉ', type: 'textarea' },
    ],
    pricing: [
      { id: 'pricing.title', selector: '[data-edit="pricing.title"]', section: 'Header', label: 'Tiêu đề', type: 'text' },
    ],
  };

  // ELEMENT_MAP được tạo trong mỗi render nên không thể đưa vào deps (sẽ vô hiệu memo).
  // Logic chỉ phụ thuộc vào `page`, đã đúng.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const elements = useMemo(() => ELEMENT_MAP[page] || [], [page]);

  // Handle save value
  const handleSave = useCallback(() => {
    if (selectedElement) {
      onValueChange(selectedElement.id, editValue);
      closePanel();
    }
  }, [selectedElement, editValue, onValueChange, closePanel]);

  // Handle keyboard
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        closePanel();
      }
      if (e.key === 'Enter' && e.ctrlKey && selectedElement) {
        onValueChange(selectedElement.id, editValue);
        closePanel();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedElement, editValue, closePanel, onValueChange]);

  // Inject hover styles into preview
  useEffect(() => {
    if (!previewRef?.current?.contentDocument) return;
    
    const style = previewRef.current.contentDocument.createElement('style');
    style.id = 'visual-editor-styles';
    style.textContent = `
      [data-edit] {
        cursor: pointer;
        position: relative;
        transition: outline 0.2s;
      }
      [data-edit]:hover {
        outline: 2px dashed #f97316;
        outline-offset: 2px;
      }
      [data-edit].hovered {
        outline: 2px solid #f97316 !important;
        outline-offset: 4px;
      }
      [data-edit].selected {
        outline: 3px solid #3b82f6 !important;
        outline-offset: 4px;
      }
    `;
    
    previewRef.current.contentDocument.head.appendChild(style);
    
    // Add click listener
    const handlePreviewClick = (e) => {
      const target = e.target.closest('[data-edit]');
      if (target) {
        e.preventDefault();
        e.stopPropagation();
        
        const editId = target.dataset.edit;
        const element = elements.find(el => el.id === editId);
        
        if (element) {
          // Remove selected class from all
          previewRef.current.contentDocument.querySelectorAll('[data-edit]').forEach(el => {
            el.classList.remove('selected');
          });
          
          target.classList.add('selected');
          
          setSelectedElement(element);
          setEditValue(overrides[editId] || target.textContent || '');
          
          const rect = target.getBoundingClientRect();
          const previewRect = previewRef.current.getBoundingClientRect();
          setPanelPosition({
            x: Math.min(previewRect.right + 10, window.innerWidth - 320),
            y: Math.max(rect.top - 10, 10),
          });
          setShowPanel(true);
        }
      }
    };
    
    previewRef.current.contentDocument.addEventListener('click', handlePreviewClick);

    // Copy vào biến cục bộ để cleanup dùng đúng giá trị tại thời điểm effect chạy.
    const docForCleanup = previewRef.current?.contentDocument;
    return () => {
      if (docForCleanup) {
        docForCleanup.removeEventListener('click', handlePreviewClick);
      }
    };
  }, [previewRef, elements, overrides]);

  // Render edit panel
  const renderEditPanel = () => {
    if (!showPanel || !selectedElement) return null;
    
    return createPortal(
      <div
        className="fixed z-[9999] bg-slate-800 rounded-xl shadow-2xl border border-slate-600 w-80 overflow-hidden"
        style={{
          left: panelPosition.x,
          top: panelPosition.y,
          maxHeight: 'calc(100vh - 40px)',
          overflow: 'auto',
        }}
      >
        {/* Header */}
        <div className="px-4 py-3 bg-slate-900 border-b border-slate-700 flex items-center justify-between">
          <div>
            <div className="text-xs text-orange-400 font-medium">{selectedElement.section}</div>
            <div className="text-white font-semibold text-sm">{selectedElement.label}</div>
          </div>
          <button
            onClick={closePanel}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg"
          >
            ✕
          </button>
        </div>
        
        {/* Input */}
        <div className="p-4 space-y-3">
          {selectedElement.type === 'textarea' ? (
            <textarea
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              rows={4}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Nhập nội dung..."
            />
          ) : selectedElement.type === 'color' ? (
            <div className="space-y-2">
              <input
                type="color"
                value={editValue || '#000000'}
                onChange={(e) => setEditValue(e.target.value)}
                className="w-full h-12 rounded-lg cursor-pointer border border-slate-600"
              />
              <input
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="#000000"
                className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm font-mono focus:outline-none focus:ring-2 focus:ring-orange-500"
              />
            </div>
          ) : (
            <input
              type="text"
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
              placeholder="Nhập nội dung..."
            />
          )}
          
          {/* Actions */}
          <div className="flex gap-2">
            <button
              onClick={closePanel}
              className="flex-1 px-4 py-2 text-sm font-medium text-slate-300 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors"
            >
              Hủy
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="flex-1 px-4 py-2 text-sm font-semibold bg-orange-500 hover:bg-orange-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {isSaving ? 'Đang lưu...' : 'Lưu'}
            </button>
          </div>
          
          {/* Hint */}
          <div className="text-xs text-slate-500 text-center">
            Ctrl+Enter để lưu nhanh • Esc để đóng
          </div>
        </div>
      </div>,
      document.body
    );
  };

  return (
    <div className="relative">
      {/* Edit mode indicator */}
      <div className="absolute top-2 left-2 z-50 bg-orange-500 text-white px-3 py-1.5 rounded-full text-xs font-bold shadow-lg flex items-center gap-2">
        <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
        Chế độ chỉnh sửa - Click vào text để sửa
      </div>
      
      {/* Children (preview content) */}
      {children}
      
      {/* Edit panel */}
      {renderEditPanel()}
    </div>
  );
}

// Higher-order component to wrap any element with editable capability
export function Editable({ id, children, className }) {
  return (
    <span data-edit={id} className={className}>
      {children}
    </span>
  );
}
