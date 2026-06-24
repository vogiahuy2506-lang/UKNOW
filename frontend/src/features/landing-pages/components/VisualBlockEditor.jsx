/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps, react-refresh/only-export-components */
import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  HiOutlineTrash, HiOutlineDuplicate,
  HiOutlineChevronUp, HiOutlineChevronDown, HiOutlinePlus,
  HiOutlineTemplate, HiOutlineViewGrid,
  HiOutlineCode, HiOutlineSave, HiOutlineClipboard, HiOutlineCheck,
  HiOutlineX
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import SaveTemplateModal from './SaveTemplateModal.jsx';

/**
 * Block definitions - each block has a default HTML template
 */
export const BLOCK_TYPES = {
  HERO: {
    id: 'hero',
    name: 'Hero Section',
    icon: '🎯',
    defaultHtml: `
      <section style="background: linear-gradient(135deg, {{primary_color}}, {{accent_color}}); padding: 80px 24px;">
        <div style="max-width: 1152px; margin: 0 auto; text-align: center;">
          <h1 style="font-size: 3rem; font-weight: bold; margin-bottom: 24px; color: white;">{{headline}}</h1>
          <p style="font-size: 1.25rem; margin-bottom: 32px; opacity: 0.9; max-width: 672px; margin-left: auto; margin-right: auto; color: white;">{{subheadline}}</p>
          <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 16px;">
            <button style="background: white; color: {{primary_color}}; padding: 16px 32px; border-radius: 12px; font-weight: bold; font-size: 1.125rem; border: none; cursor: pointer;">{{cta_primary}}</button>
            <button style="border: 2px solid white; color: white; padding: 16px 32px; border-radius: 12px; font-weight: bold; font-size: 1.125rem; background: transparent; cursor: pointer;">{{cta_secondary}}</button>
          </div>
        </div>
      </section>
    `,
    defaultDataKeys: ['headline', 'subheadline', 'cta_primary', 'cta_secondary', 'primary_color', 'accent_color', 'bg_color', 'text_color'],
  },
  FEATURES: {
    id: 'features',
    name: 'Tính năng',
    icon: '✨',
    defaultHtml: `
      <section style="padding: 64px 24px; background: white;">
        <div style="max-width: 1152px; margin: 0 auto;">
          <h2 style="font-size: 2.25rem; font-weight: bold; text-align: center; margin-bottom: 48px; color: #1f2937;">{{section_title}}</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 32px;">
            <div style="text-align: center; padding: 32px; border-radius: 16px; background: {{accent_color}}10; border: 1px solid {{accent_color}}20;">
              <div style="width: 72px; height: 72px; border-radius: 16px; background: {{accent_color}}; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 2rem;">🚀</div>
              <h3 style="font-size: 1.25rem; font-weight: bold; margin-bottom: 12px; color: #1f2937;">{{feature_1_title}}</h3>
              <p style="color: #6b7280; line-height: 1.6;">{{feature_1_desc}}</p>
            </div>
            <div style="text-align: center; padding: 32px; border-radius: 16px; background: {{primary_color}}10; border: 1px solid {{primary_color}}20;">
              <div style="width: 72px; height: 72px; border-radius: 16px; background: {{primary_color}}; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 2rem;">⚡</div>
              <h3 style="font-size: 1.25rem; font-weight: bold; margin-bottom: 12px; color: #1f2937;">{{feature_2_title}}</h3>
              <p style="color: #6b7280; line-height: 1.6;">{{feature_2_desc}}</p>
            </div>
            <div style="text-align: center; padding: 32px; border-radius: 16px; background: {{accent_color}}10; border: 1px solid {{accent_color}}20;">
              <div style="width: 72px; height: 72px; border-radius: 16px; background: {{accent_color}}; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; font-size: 2rem;">🛡️</div>
              <h3 style="font-size: 1.25rem; font-weight: bold; margin-bottom: 12px; color: #1f2937;">{{feature_3_title}}</h3>
              <p style="color: #6b7280; line-height: 1.6;">{{feature_3_desc}}</p>
            </div>
          </div>
        </div>
      </section>
    `,
    defaultDataKeys: ['section_title', 'feature_1_title', 'feature_1_desc', 'feature_2_title', 'feature_2_desc', 'feature_3_title', 'feature_3_desc', 'primary_color', 'accent_color', 'bg_color', 'text_color'],
  },
  FORM: {
    id: 'form',
    name: 'Form đăng ký',
    icon: '📝',
    defaultHtml: `
      <section style="padding: 80px 24px; background: linear-gradient(135deg, #f9fafb 0%, #eff6ff 100%);">
        <div style="max-width: 560px; margin: 0 auto;">
          <h2 style="font-size: 2rem; font-weight: bold; text-align: center; margin-bottom: 12px; color: #1f2937;">{{form_title}}</h2>
          <p style="text-align: center; color: #6b7280; margin-bottom: 32px;">{{form_subtitle}}</p>
          <form style="background: white; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.15); padding: 40px; display: flex; flex-direction: column; gap: 20px;">
            <div>
              <input type="text" placeholder="{{form_full_name_placeholder}}" style="width: 100%; padding: 16px 20px; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 1rem; outline: none; transition: border-color 0.2s; box-sizing: border-box;" />
            </div>
            <div>
              <input type="email" placeholder="{{form_email_placeholder}}" style="width: 100%; padding: 16px 20px; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 1rem; outline: none; transition: border-color 0.2s; box-sizing: border-box;" />
            </div>
            <div>
              <input type="tel" placeholder="{{form_phone_placeholder}}" style="width: 100%; padding: 16px 20px; border: 2px solid #e5e7eb; border-radius: 12px; font-size: 1rem; outline: none; transition: border-color 0.2s; box-sizing: border-box;" />
            </div>
            <button type="submit" style="width: 100%; background: {{accent_color}}; color: white; padding: 18px; border-radius: 12px; font-weight: 600; font-size: 1.125rem; border: none; cursor: pointer; transition: transform 0.2s;">{{submit_text}}</button>
            <p style="text-align: center; font-size: 0.875rem; color: #9ca3af;">{{privacy_text}}</p>
          </form>
        </div>
      </section>
    `,
    defaultDataKeys: ['form_title', 'form_subtitle', 'form_full_name_placeholder', 'form_email_placeholder', 'form_phone_placeholder', 'submit_text', 'privacy_text', 'primary_color', 'accent_color', 'bg_color', 'text_color'],
  },
  TESTIMONIAL: {
    id: 'testimonial',
    name: 'Đánh giá',
    icon: '💬',
    defaultHtml: `
      <section style="padding: 64px 24px; background: #f9fafb;">
        <div style="max-width: 1152px; margin: 0 auto;">
          <h2 style="font-size: 2.25rem; font-weight: bold; text-align: center; margin-bottom: 48px; color: #1f2937;">{{section_title}}</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 24px;">
            <div style="background: white; border-radius: 20px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); position: relative;">
              <div style="position: absolute; top: -12px; left: 24px; font-size: 4rem; color: {{accent_color}}20; line-height: 1;">"</div>
              <p style="color: #374151; line-height: 1.7; margin-bottom: 24px; font-size: 1.0625rem;">{{reviewer_1_content}}</p>
              <div style="display: flex; align-items: center; gap: 16px;">
                <div style="width: 48px; height: 48px; background: linear-gradient(135deg, {{primary_color}}, {{accent_color}}); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 1.25rem;">{{reviewer_1_avatar}}</div>
                <div>
                  <p style="font-weight: 600; color: #1f2937;">{{reviewer_1_name}}</p>
                  <p style="font-size: 0.875rem; color: #6b7280;">{{reviewer_1_role}}</p>
                </div>
              </div>
            </div>
            <div style="background: white; border-radius: 20px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); position: relative;">
              <div style="position: absolute; top: -12px; left: 24px; font-size: 4rem; color: {{accent_color}}20; line-height: 1;">"</div>
              <p style="color: #374151; line-height: 1.7; margin-bottom: 24px; font-size: 1.0625rem;">{{reviewer_2_content}}</p>
              <div style="display: flex; align-items: center; gap: 16px;">
                <div style="width: 48px; height: 48px; background: linear-gradient(135deg, {{accent_color}}, {{primary_color}}); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 1.25rem;">{{reviewer_2_avatar}}</div>
                <div>
                  <p style="font-weight: 600; color: #1f2937;">{{reviewer_2_name}}</p>
                  <p style="font-size: 0.875rem; color: #6b7280;">{{reviewer_2_role}}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    `,
    defaultDataKeys: ['section_title', 'reviewer_1_name', 'reviewer_1_role', 'reviewer_1_avatar', 'reviewer_1_content', 'reviewer_2_name', 'reviewer_2_role', 'reviewer_2_avatar', 'reviewer_2_content', 'primary_color', 'accent_color', 'bg_color', 'text_color'],
  },
  CTA: {
    id: 'cta',
    name: 'Kêu gọi hành động',
    icon: '🎯',
    defaultHtml: `
      <section style="padding: 80px 24px; background: linear-gradient(135deg, {{primary_color}} 0%, {{accent_color}} 100%);">
        <div style="max-width: 800px; margin: 0 auto; text-align: center;">
          <h2 style="font-size: 2.5rem; font-weight: bold; margin-bottom: 16px; color: white;">{{cta_title}}</h2>
          <p style="font-size: 1.25rem; opacity: 0.9; margin-bottom: 32px; color: white; max-width: 600px; margin-left: auto; margin-right: auto;">{{cta_subtitle}}</p>
          <button style="background: white; color: {{primary_color}}; padding: 18px 48px; border-radius: 12px; font-weight: 600; font-size: 1.125rem; border: none; cursor: pointer; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.2);">{{cta_button}}</button>
        </div>
      </section>
    `,
    defaultDataKeys: ['cta_title', 'cta_subtitle', 'cta_button', 'primary_color', 'accent_color', 'bg_color', 'text_color'],
  },
  FAQ: {
    id: 'faq',
    name: 'Câu hỏi thường gặp',
    icon: '❓',
    defaultHtml: `
      <section style="padding: 64px 24px; background: white;">
        <div style="max-width: 768px; margin: 0 auto;">
          <h2 style="font-size: 2.25rem; font-weight: bold; text-align: center; margin-bottom: 48px; color: #1f2937;">{{section_title}}</h2>
          <div style="display: flex; flex-direction: column; gap: 16px;">
            <details style="background: #f9fafb; border-radius: 16px; padding: 24px; border: 1px solid #e5e7eb;">
              <summary style="font-weight: 600; cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; color: #1f2937; font-size: 1.0625rem;">{{faq_1_q}} <span style="color: {{accent_color}}; font-size: 1.25rem;">+</span></summary>
              <p style="margin-top: 16px; color: #6b7280; line-height: 1.7;">{{faq_1_a}}</p>
            </details>
            <details style="background: #f9fafb; border-radius: 16px; padding: 24px; border: 1px solid #e5e7eb;">
              <summary style="font-weight: 600; cursor: pointer; list-style: none; display: flex; justify-content: space-between; align-items: center; color: #1f2937; font-size: 1.0625rem;">{{faq_2_q}} <span style="color: {{accent_color}}; font-size: 1.25rem;">+</span></summary>
              <p style="margin-top: 16px; color: #6b7280; line-height: 1.7;">{{faq_2_a}}</p>
            </details>
          </div>
        </div>
      </section>
    `,
    defaultDataKeys: ['section_title', 'faq_1_q', 'faq_1_a', 'faq_2_q', 'faq_2_a', 'primary_color', 'accent_color', 'bg_color', 'text_color'],
  },
  FOOTER: {
    id: 'footer',
    name: 'Footer',
    icon: '📍',
    defaultHtml: `
      <footer style="padding: 64px 24px 32px; background: #111827;">
        <div style="max-width: 1152px; margin: 0 auto;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 48px; margin-bottom: 48px;">
            <div>
              <h4 style="color: white; font-weight: bold; font-size: 1.25rem; margin-bottom: 16px;">{{brand_name}}</h4>
              <p style="color: #9ca3af; line-height: 1.7;">{{brand_desc}}</p>
            </div>
            <div>
              <h4 style="color: white; font-weight: 600; margin-bottom: 16px;">{{footer_contact}}</h4>
              <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 12px;">
                <li style="color: #9ca3af;">📍 {{address}}</li>
                <li style="color: #9ca3af;">📞 {{phone}}</li>
                <li style="color: #9ca3af;">✉️ {{email}}</li>
              </ul>
            </div>
          </div>
          <div style="border-top: 1px solid #374151; padding-top: 32px; text-align: center; color: #6b7280;">
            <p>© {{current_year}} {{brand_name}}. All rights reserved.</p>
          </div>
        </div>
      </footer>
    `,
    defaultDataKeys: ['brand_name', 'brand_desc', 'footer_contact', 'address', 'phone', 'email', 'current_year', 'primary_color', 'accent_color', 'bg_color', 'text_color'],
  },
};

const BLOCK_LIST = Object.values(BLOCK_TYPES);

/**
 * Get default data for a block type
 */
function getBlockDefaultData(blockType, t) {
  const defaults = {
    hero: {
      headline: 'Chào mừng đến với sản phẩm của chúng tôi',
      subheadline: 'Giải pháp tốt nhất cho doanh nghiệp của bạn. Đăng ký ngay để trải nghiệm!',
      cta_primary: 'Đăng ký ngay',
      cta_secondary: 'Tìm hiểu thêm',
      primary_color: '#f97316',
      accent_color: '#ea580c',
      bg_color: '#ffffff',
      text_color: '#1f2937',
    },
    features: {
      section_title: 'Tại sao chọn chúng tôi?',
      feature_1_title: 'Nhanh chóng',
      feature_1_desc: 'Triển khai trong vài phút với công nghệ hiện đại nhất.',
      feature_2_title: 'Bảo mật',
      feature_2_desc: 'Dữ liệu được mã hóa và bảo vệ an toàn tuyệt đối.',
      feature_3_title: 'Hỗ trợ 24/7',
      feature_3_desc: 'Đội ngũ chuyên gia luôn sẵn sàng hỗ trợ bạn mọi lúc.',
      primary_color: '#f97316',
      accent_color: '#ea580c',
      bg_color: '#ffffff',
      text_color: '#1f2937',
    },
    form: {
      form_title: 'Đăng ký ngay hôm nay',
      form_subtitle: 'Điền thông tin để nhận tư vấn miễn phí từ đội ngũ chuyên gia',
      form_full_name_placeholder: 'Họ và tên đầy đủ',
      form_email_placeholder: 'Email của bạn',
      form_phone_placeholder: 'Số điện thoại',
      submit_text: 'Gửi đăng ký',
      privacy_text: 'Chúng tôi cam kết bảo mật thông tin của bạn',
      primary_color: '#f97316',
      accent_color: '#ea580c',
      bg_color: '#f9fafb',
      text_color: '#1f2937',
    },
    testimonial: {
      section_title: 'Khách hàng nói gì về chúng tôi',
      reviewer_1_name: 'Nguyễn Văn A',
      reviewer_1_role: 'CEO, Công ty ABC',
      reviewer_1_avatar: 'A',
      reviewer_1_content: 'Sản phẩm tuyệt vời! Đã giúp tôi tiết kiệm rất nhiều thời gian và chi phí vận hành.',
      reviewer_2_name: 'Trần Thị B',
      reviewer_2_role: 'Founder, Startup XYZ',
      reviewer_2_avatar: 'B',
      reviewer_2_content: 'Dịch vụ chuyên nghiệp, hỗ trợ tận tình. Highly recommended cho mọi người!',
      primary_color: '#f97316',
      accent_color: '#ea580c',
      bg_color: '#f9fafb',
      text_color: '#1f2937',
    },
    cta: {
      cta_title: 'Sẵn sàng bắt đầu?',
      cta_subtitle: 'Đăng ký ngay hôm nay để trải nghiệm dịch vụ tuyệt vời của chúng tôi. Không có rủi ro, chỉ có cơ hội!',
      cta_button: 'Bắt đầu ngay',
      primary_color: '#f97316',
      accent_color: '#ea580c',
      bg_color: '#ffffff',
      text_color: '#1f2937',
    },
    faq: {
      section_title: 'Câu hỏi thường gặp',
      faq_1_q: 'Dịch vụ này có miễn phí không?',
      faq_1_a: 'Chúng tôi cung cấp gói miễn phí với các tính năng cơ bản. Bạn có thể nâng cấp lên gói trả phí để sử dụng thêm nhiều tính năng nâng cao.',
      faq_2_q: 'Làm sao để liên hệ hỗ trợ?',
      faq_2_a: 'Bạn có thể liên hệ qua email support@digiso.vn hoặc gọi hotline 0901 234 567 vào giờ hành chính.',
      primary_color: '#f97316',
      accent_color: '#ea580c',
      bg_color: '#ffffff',
      text_color: '#1f2937',
    },
    footer: {
      brand_name: 'Your Brand',
      brand_desc: 'Mang đến giải pháp tốt nhất cho doanh nghiệp của bạn.',
      footer_contact: 'Liên hệ',
      address: '123 Đường ABC, Quận 1, TP.HCM',
      phone: '0901 234 567',
      email: 'contact@example.com',
      current_year: new Date().getFullYear(),
      primary_color: '#f97316',
      accent_color: '#ea580c',
      bg_color: '#111827',
      text_color: '#9ca3af',
    },
  };

  return defaults[blockType.id] || {};
}

/**
 * Visual Block Editor - Drag and drop landing page builder
 */
export default function VisualBlockEditor({ 
  isOpen, 
  initialHtml, 
  initialData, 
  onSave, 
  onClose,
  onSaveAsTemplate 
}) {
  const { t } = useI18n();
  const [blocks, setBlocks] = useState([]);
  const [selectedBlockId, setSelectedBlockId] = useState(null);
  const [viewMode, setViewMode] = useState('visual');
  const [draggedBlockType, setDraggedBlockType] = useState(null);
  const [hoveredBlockId, setHoveredBlockId] = useState(null);
  const [expandedBlockId, setExpandedBlockId] = useState(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const canvasRef = useRef(null);

  // Toggle expanded state for a block
  const toggleExpand = (blockId) => {
    setExpandedBlockId(prev => prev === blockId ? null : blockId);
  };

  useEffect(() => {
    if (initialData && Object.keys(initialData).length > 0) {
      const parsedBlocks = [];
      for (const blockType of BLOCK_LIST) {
        const blockData = {};
        const defaultData = getBlockDefaultData(blockType, t);
        let hasData = false;
        for (const key of blockType.defaultDataKeys || []) {
          if (initialData[key]) {
            blockData[key] = initialData[key];
            hasData = true;
          } else if (defaultData[key]) {
            blockData[key] = defaultData[key];
            hasData = true;
          }
        }
        if (hasData) {
          parsedBlocks.push({
            id: `${blockType.id}_${Date.now()}_${Math.random()}`,
            type: blockType.id,
            data: { ...defaultData, ...blockData },
          });
        }
      }
      if (parsedBlocks.length > 0) {
        setBlocks(parsedBlocks);
        return;
      }
    }
  }, [initialData, t]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (showTemplateModal) {
          setShowTemplateModal(false);
        } else {
          onClose?.();
        }
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      return () => window.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, blocks, showTemplateModal]);

  const selectedBlock = blocks.find(b => b.id === selectedBlockId);

  const handleDragStart = (e, blockType) => {
    setDraggedBlockType(blockType);
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleDrop = (e, targetIndex = null) => {
    e.preventDefault();
    if (!draggedBlockType) return;

    const defaultData = getBlockDefaultData(draggedBlockType, t);
    const newBlock = {
      id: `${draggedBlockType.id}_${Date.now()}`,
      type: draggedBlockType.id,
      data: { ...defaultData },
    };

    setBlocks(prev => {
      const newBlocks = [...prev];
      const insertIndex = targetIndex !== null ? targetIndex : newBlocks.length;
      newBlocks.splice(insertIndex, 0, newBlock);
      return newBlocks;
    });

    setDraggedBlockType(null);
    setSelectedBlockId(newBlock.id);
  };

  const handleAddBlock = (blockType) => {
    const defaultData = getBlockDefaultData(blockType, t);
    const newBlock = {
      id: `${blockType.id}_${Date.now()}`,
      type: blockType.id,
      data: { ...defaultData },
    };
    setBlocks(prev => [...prev, newBlock]);
    setSelectedBlockId(newBlock.id);
  };

  const handleDeleteBlock = (blockId) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
    if (selectedBlockId === blockId) {
      setSelectedBlockId(null);
    }
  };

  const handleDuplicateBlock = (block) => {
    const newBlock = {
      id: `${block.type}_${Date.now()}`,
      type: block.type,
      data: { ...block.data },
    };
    const index = blocks.findIndex(b => b.id === block.id);
    setBlocks(prev => {
      const newBlocks = [...prev];
      newBlocks.splice(index + 1, 0, newBlock);
      return newBlocks;
    });
    setSelectedBlockId(newBlock.id);
  };

  const handleMoveBlock = (blockId, direction) => {
    const index = blocks.findIndex(b => b.id === blockId);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === blocks.length - 1) return;

    setBlocks(prev => {
      const newBlocks = [...prev];
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      [newBlocks[index], newBlocks[targetIndex]] = [newBlocks[targetIndex], newBlocks[index]];
      return newBlocks;
    });
  };

  const handleUpdateBlockData = (blockId, key, value) => {
    setBlocks(prev => prev.map(b =>
      b.id === blockId ? { ...b, data: { ...b.data, [key]: value } } : b
    ));
  };

  const generateHtml = useCallback(() => {
    if (blocks.length === 0) return '';

    let blocksHtml = '';
    for (const block of blocks) {
      const blockDef = BLOCK_LIST.find(b => b.id === block.type);
      if (blockDef) {
        let blockHtml = blockDef.defaultHtml;
        for (const [key, value] of Object.entries(block.data)) {
          blockHtml = blockHtml.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
        }
        blocksHtml += blockHtml;
      }
    }

    const fullHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${blocks[0]?.data?.headline || blocks[0]?.data?.form_title || blocks[0]?.data?.section_title || 'Landing Page'}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
  </style>
</head>
<body>
${blocksHtml}
</body>
</html>`;

    return fullHtml;
  }, [blocks]);

  const handleSave = () => {
    const html = generateHtml();
    const data = {};
    for (const block of blocks) {
      Object.assign(data, block.data);
    }
    onSave?.({ html, data });
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(generateHtml());
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const blockDef = selectedBlock ? BLOCK_LIST.find(b => b.id === selectedBlock.type) : null;

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[400] flex flex-col bg-gray-50">
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between gap-4 px-6 py-4 bg-white border-b border-gray-200 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <HiOutlineViewGrid className="w-6 h-6 text-orange-500" />
            <h2 className="text-lg font-semibold text-gray-900">
              Trình chỉnh sửa khối
            </h2>
          </div>
          <div className="flex items-center bg-gray-100 rounded-lg p-1">
            <button
              onClick={() => setViewMode('visual')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                viewMode === 'visual' ? 'bg-white shadow text-orange-500' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <HiOutlineViewGrid className="w-4 h-4" />
              Khối
            </button>
            <button
              onClick={() => setViewMode('code')}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                viewMode === 'code' ? 'bg-white shadow text-orange-500' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <HiOutlineCode className="w-4 h-4" />
              Mã
            </button>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {onSaveAsTemplate && blocks.length > 0 && (
            <button
              onClick={() => setShowTemplateModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg font-medium hover:bg-gray-50 transition-colors text-sm"
            >
              <HiOutlineTemplate className="w-4 h-4" />
              Lưu template
            </button>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
          >
            Hủy
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors shadow-sm"
          >
            <HiOutlineSave className="w-4 h-4" />
            Lưu
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left Panel - Block Library */}
        <div className="w-64 shrink-0 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="p-4 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Thêm khối mới</h3>
          </div>
          <div className="p-3 space-y-2">
            {BLOCK_LIST.map(bt => (
              <div
                key={bt.id}
                draggable
                onDragStart={(e) => handleDragStart(e, bt)}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e)}
                onClick={() => handleAddBlock(bt)}
                className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl cursor-grab hover:bg-orange-50 hover:ring-2 hover:ring-orange-200 transition-all active:cursor-grabbing group"
              >
                <span className="text-xl">{bt.icon}</span>
                <span className="font-medium text-gray-700 text-sm group-hover:text-orange-600">{bt.name}</span>
              </div>
            ))}
          </div>

          <div className="p-4 border-t border-gray-100">
            <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-4 border border-orange-100">
              <p className="text-xs text-orange-600 font-medium mb-2">Mẹo</p>
              <p className="text-xs text-gray-500">Kéo hoặc click để thêm khối. Click vào khối để chỉnh sửa nội dung.</p>
            </div>
          </div>
        </div>

        {/* Main Canvas */}
        <div className="flex-1 overflow-y-auto bg-gray-100" ref={canvasRef}>
          {viewMode === 'visual' ? (
            <div className="max-w-4xl mx-auto py-6 px-4">
              {blocks.length === 0 && !draggedBlockType && (
                <div
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, 0)}
                  className="border-2 border-dashed border-gray-300 bg-white rounded-2xl p-16 text-center"
                >
                  <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <HiOutlinePlus className="w-10 h-10 text-orange-400" />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-700 mb-2">Bắt đầu xây dựng landing page</h3>
                  <p className="text-gray-500 mb-6">Kéo khối từ bên trái hoặc click để thêm</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    {BLOCK_LIST.slice(0, 4).map(bt => (
                      <button
                        key={bt.id}
                        onClick={() => handleAddBlock(bt)}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-orange-50 text-gray-700 hover:text-orange-600 rounded-lg text-sm font-medium transition-colors"
                      >
                        <span>{bt.icon}</span>
                        {bt.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {blocks.map((block, index) => {
                  const def = BLOCK_LIST.find(b => b.id === block.type);
                  const isSelected = selectedBlockId === block.id;
                  const isHovered = hoveredBlockId === block.id;
                  const isExpanded = expandedBlockId === block.id;
                  const previewHeight = isExpanded ? '600px' : '400px';

                  return (
                    <div
                      key={block.id}
                      onClick={() => setSelectedBlockId(block.id)}
                      onMouseEnter={() => setHoveredBlockId(block.id)}
                      onMouseLeave={() => setHoveredBlockId(null)}
                      className={`relative bg-white rounded-xl overflow-hidden transition-all cursor-pointer ${
                        isSelected ? 'ring-2 ring-orange-500 shadow-lg' : isHovered ? 'ring-2 ring-orange-200 shadow-md' : 'shadow-sm hover:shadow-md'
                      }`}
                    >
                      {/* Block Controls */}
                      <div className={`flex items-center gap-1 bg-white/95 backdrop-blur-sm rounded-lg p-1.5 shadow-lg z-30 ${
                        isSelected || isHovered ? 'opacity-100' : 'opacity-0'
                      }`} style={{ position: 'absolute', top: '12px', right: '12px' }}>
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleExpand(block.id); }}
                          className="p-2 hover:bg-gray-100 rounded-md transition-colors bg-orange-50 hover:bg-orange-100"
                          title={isExpanded ? 'Thu nhỏ' : 'Mở rộng'}
                        >
                          {isExpanded ? (
                            <svg className="w-4 h-4 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                            </svg>
                          ) : (
                            <svg className="w-4 h-4 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                            </svg>
                          )}
                        </button>
                        <div className="w-px h-6 bg-gray-200 mx-0.5" />
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveBlock(block.id, 'up'); }}
                          disabled={index === 0}
                          className="p-2 hover:bg-gray-100 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors bg-gray-50"
                          title="Di chuyển lên"
                        >
                          <HiOutlineChevronUp className="w-5 h-5 text-gray-700" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveBlock(block.id, 'down'); }}
                          disabled={index === blocks.length - 1}
                          className="p-2 hover:bg-gray-100 rounded-md disabled:opacity-30 disabled:cursor-not-allowed transition-colors bg-gray-50"
                          title="Di chuyển xuống"
                        >
                          <HiOutlineChevronDown className="w-5 h-5 text-gray-700" />
                        </button>
                        <div className="w-px h-6 bg-gray-200 mx-0.5" />
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDuplicateBlock(block); }}
                          className="p-2 hover:bg-gray-100 rounded-md transition-colors bg-gray-50"
                          title="Nhân bản"
                        >
                          <HiOutlineDuplicate className="w-5 h-5 text-gray-700" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleDeleteBlock(block.id); }}
                          className="p-2 hover:bg-red-50 text-red-500 rounded-md transition-colors bg-red-50 hover:bg-red-100"
                          title="Xóa"
                        >
                          <HiOutlineTrash className="w-5 h-5" />
                        </button>
                      </div>

                      {/* Block Label */}
                      <div className={`px-3 py-1.5 rounded-md text-xs font-medium shadow-sm flex items-center gap-1.5 z-30 transition-opacity ${
                        isSelected || isHovered ? 'opacity-100' : 'opacity-0'
                      } ${isSelected ? 'bg-orange-500 text-white' : 'bg-gray-800 text-white'}`} style={{ position: 'absolute', top: '12px', left: '12px' }}>
                        <span>{def?.icon}</span>
                        <span>{def?.name}</span>
                      </div>

                      {/* Block Preview */}
                      <div className="pointer-events-none select-none">
                        <iframe
                          title={`Block preview ${block.id}`}
                          className="w-full border-0 bg-white"
                          style={{ height: previewHeight }}
                          srcDoc={`<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
  ${(() => {
    const blockDef = BLOCK_LIST.find(b => b.id === block.type);
    if (!blockDef) return '';
    let html = blockDef.defaultHtml;
    for (const [key, value] of Object.entries(block.data)) {
      html = html.replace(new RegExp(`{{${key}}}`, 'g'), value || '');
    }
    return html;
  })()}
</body>
</html>`}
                          sandbox="allow-scripts allow-forms"
                        />
                      </div>

                      {/* Selected indicator */}
                      {isSelected && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-orange-500" />
                      )}
                    </div>
                  );
                })}

                {/* Add block button at bottom */}
                {blocks.length > 0 && (
                  <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-orange-300 hover:bg-orange-50/30 transition-colors">
                    <p className="text-sm text-gray-500 mb-3">Thêm khối mới</p>
                    <div className="flex flex-wrap justify-center gap-2">
                      {BLOCK_LIST.map(bt => (
                        <button
                          key={bt.id}
                          onClick={() => handleAddBlock(bt)}
                          className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-orange-50 text-gray-600 hover:text-orange-600 rounded-lg text-xs font-medium border border-gray-200 hover:border-orange-200 transition-colors"
                        >
                          <span>{bt.icon}</span>
                          {bt.name}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {draggedBlockType && (
                  <div
                    onDragOver={handleDragOver}
                    onDrop={(e) => handleDrop(e)}
                    className="border-2 border-dashed border-orange-300 bg-orange-50 rounded-xl p-6 text-center animate-pulse"
                  >
                    <p className="text-orange-600 font-medium">Thả để thêm khối {draggedBlockType.name}</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto py-6 px-4">
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
                  <span className="text-sm font-medium text-gray-700">HTML Code</span>
                  <button
                    onClick={handleCopyCode}
                    className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-gray-100 text-gray-600 hover:text-gray-900 rounded-lg text-sm font-medium border border-gray-200 transition-colors"
                  >
                    {copiedCode ? (
                      <>
                        <HiOutlineCheck className="w-4 h-4 text-green-500" />
                        <span className="text-green-600">Đã copy!</span>
                      </>
                    ) : (
                      <>
                        <HiOutlineClipboard className="w-4 h-4" />
                        Copy code
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-4 overflow-x-auto text-xs font-mono whitespace-pre-wrap max-h-[calc(100vh-200px)] bg-gray-900 text-gray-100">
                  {generateHtml()}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Block Properties */}
        <div className="w-72 shrink-0 bg-white border-l border-gray-200 overflow-y-auto">
          <div className="p-4 border-b border-gray-100 bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-700">Thuộc tính khối</h3>
          </div>

          {selectedBlock && blockDef ? (
            <div className="p-4 space-y-4">
              <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-orange-50 to-amber-50 rounded-xl border border-orange-100">
                <span className="text-2xl">{blockDef.icon}</span>
                <div>
                  <p className="font-medium text-gray-900">{blockDef.name}</p>
                  <p className="text-xs text-gray-500">ID: {selectedBlock.type}</p>
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Màu sắc</h4>
                <div className="space-y-3">
                  {[
                    { key: 'primary_color', label: 'Màu chính', default: '#f97316' },
                    { key: 'accent_color', label: 'Màu nhấn', default: '#ea580c' },
                    { key: 'bg_color', label: 'Màu nền', default: '#ffffff' },
                    { key: 'text_color', label: 'Màu chữ', default: '#1f2937' },
                  ].map(({ key, label, default: defaultColor }) => (
                    <div key={key} className="flex items-center justify-between gap-2">
                      <label className="text-xs text-gray-600 w-16">{label}</label>
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="color"
                          value={selectedBlock.data[key] || defaultColor}
                          onChange={(e) => handleUpdateBlockData(selectedBlock.id, key, e.target.value)}
                          className="w-8 h-8 rounded cursor-pointer border border-gray-200"
                        />
                        <input
                          type="text"
                          value={selectedBlock.data[key] || defaultColor}
                          onChange={(e) => handleUpdateBlockData(selectedBlock.id, key, e.target.value)}
                          className="flex-1 px-2 py-1 border border-gray-200 rounded text-xs font-mono"
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Nội dung</h4>
                <div className="space-y-3">
                  {(blockDef.defaultDataKeys || []).filter(key => !['bg_color', 'text_color', 'primary_color', 'accent_color', 'current_year'].includes(key)).map((key) => {
                    const defaultValue = selectedBlock.data[key] || '';
                    const label = key
                      .replace(/_/g, ' ')
                      .replace(/\b\w/g, c => c.toUpperCase())
                      .replace(/^Gioi Tinh/, 'Giới tính')
                      .replace(/^Sdt/, 'SĐT');

                    return (
                      <div key={key}>
                        <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                        {typeof defaultValue === 'string' && defaultValue.length > 60 ? (
                          <textarea
                            value={selectedBlock.data[key] || ''}
                            onChange={(e) => handleUpdateBlockData(selectedBlock.id, key, e.target.value)}
                            rows={3}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none"
                          />
                        ) : (
                          <input
                            type="text"
                            value={selectedBlock.data[key] || ''}
                            onChange={(e) => handleUpdateBlockData(selectedBlock.id, key, e.target.value)}
                            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={() => handleDeleteBlock(selectedBlock.id)}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-50 text-red-600 rounded-lg font-medium hover:bg-red-100 transition-colors mt-4"
              >
                <HiOutlineTrash className="w-4 h-4" />
                Xóa khối này
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 p-6 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                <HiOutlineTemplate className="w-8 h-8" />
              </div>
              <p className="text-sm font-medium text-gray-500 mb-1">Chưa có khối nào được chọn</p>
              <p className="text-xs text-gray-400">Click vào khối trong canvas để chỉnh sửa</p>
            </div>
          )}
        </div>
      </div>

      {/* Keyboard shortcuts hint */}
      <div className="shrink-0 px-6 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-400 text-center">
        <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded mr-1">Ctrl</span>+<span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded mx-1">S</span> để lưu
        <span className="mx-3">|</span>
        <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded mr-1">Esc</span> để đóng
      </div>

      {/* Save as Template Modal */}
      <SaveTemplateModal
        isOpen={showTemplateModal}
        onClose={() => setShowTemplateModal(false)}
        htmlContent={generateHtml()}
        landingPageTitle={`Visual Editor (${blocks.length} blocks)`}
        onSuccess={() => {
          toast.success('Đã lưu template thành công');
        }}
      />
    </div>,
    document.body
  );
}
