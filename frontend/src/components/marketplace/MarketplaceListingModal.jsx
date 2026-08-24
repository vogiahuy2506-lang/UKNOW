import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineX,
  HiOutlineCheckCircle,
  HiOutlineChat,
} from 'react-icons/hi';
import marketplaceService from '../../services/marketplace.service';
import { useI18n } from '../../i18n';


const MarketplaceListingModal = ({ open, chatbot, onClose, onSuccess }) => {
  const { t } = useI18n();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [includeKnowledgeBase, setIncludeKnowledgeBase] = useState(true);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'support',
    tags: [],
    priceCredits: 0,
  });
  const [tagInput, setTagInput] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Pre-fill from chatbot
  useEffect(() => {
    if (open && chatbot) {
      setForm(prev => ({
        ...prev,
        title: chatbot.name || '',
        description: chatbot.description || '',
      }));
    }
  }, [open, chatbot]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setForm({
        title: '',
        description: '',
        category: 'support',
        tags: [],
        priceCredits: 0,
      });
      setTagInput('');
      setIncludeKnowledgeBase(true);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !isSubmitting) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, isSubmitting, onClose]);

  const handleAddTag = () => {
    const tag = tagInput.trim();
    if (tag && !form.tags.includes(tag) && form.tags.length < 5) {
      setForm(prev => ({ ...prev, tags: [...prev.tags, tag] }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setForm(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tagToRemove) }));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const validate = () => {
    if (!form.title.trim()) {
      toast.error('Vui lòng nhập tiêu đề');
      return false;
    }
    if (form.title.length > 255) {
      toast.error('Tiêu đề không được quá 255 ký tự');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!chatbot?.id) return;

    setIsSubmitting(true);
    try {
      await marketplaceService.createChatbotListing({
        chatbotId: chatbot.id,
        title: form.title.trim(),
        description: form.description?.trim() || null,
        category: form.category || null,
        tags: form.tags.length > 0 ? form.tags : null,
        priceCredits: parseInt(form.priceCredits, 10) || 0,
        includeKnowledgeBase,
      });
      toast.success(t('createListing.createSuccess') || 'Đăng marketplace thành công!');
      onSuccess?.();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể tạo listing');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open || !mounted || !chatbot) return null;

  const modal = (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-violet-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
              <HiOutlineChat className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Đăng lên Marketplace</h3>
              <p className="text-sm text-gray-500">Chia sẻ chatbot với cộng đồng</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-violet-100 rounded-lg transition-colors"
            aria-label="Đóng"
          >
            <HiOutlineX className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Chatbot preview */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
            {chatbot?.avatar_url ? (
              <img
                src={chatbot.avatar_url}
                alt=""
                className="w-10 h-10 rounded-xl object-cover ring-1 ring-gray-200"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white">
                <HiOutlineChat className="w-5 h-5" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 truncate">{chatbot?.name}</p>
              <p className="text-xs text-gray-500 truncate">
                {chatbot?.description || 'Không có mô tả'}
              </p>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Tiêu đề <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => setForm(prev => ({ ...prev, title: e.target.value }))}
              placeholder="Tên chatbot của bạn"
              maxLength={255}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all"
            />
            <p className="text-xs text-gray-400 mt-1">{form.title.length}/255</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Mô tả
            </label>
            <textarea
              value={form.description}
              onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Mô tả ngắn về chatbot..."
              rows={3}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all resize-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Tags <span className="font-normal text-gray-400">(tối đa 5)</span>
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-violet-100 text-violet-700 text-xs rounded-full"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-violet-900"
                  >
                    <HiOutlineX className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            {form.tags.length < 5 && (
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Nhấn Enter để thêm tag"
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all"
              />
            )}
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Giá (credits)
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, priceCredits: Math.max(0, prev.priceCredits - 10) }))}
                className="w-10 h-10 rounded-xl border border-gray-200 hover:border-violet-300 hover:bg-violet-50 text-gray-700 font-semibold transition-colors"
              >
                -
              </button>
              <input
                type="number"
                value={form.priceCredits}
                onChange={(e) => setForm(prev => ({ ...prev, priceCredits: Math.max(0, parseInt(e.target.value, 10) || 0) }))}
                min="0"
                className="flex-1 px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-violet-200 focus:border-violet-400 transition-all text-center font-semibold"
              />
              <button
                type="button"
                onClick={() => setForm(prev => ({ ...prev, priceCredits: prev.priceCredits + 10 }))}
                className="w-10 h-10 rounded-xl border border-gray-200 hover:border-violet-300 hover:bg-violet-50 text-gray-700 font-semibold transition-colors"
              >
                +
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Đặt <strong>0 credits</strong> để chia sẻ miễn phí
            </p>
          </div>

          {/* Knowledge Base option */}
          {chatbot?.hasKnowledgeBase && (
            <div className="flex items-start gap-3 p-3 bg-violet-50 rounded-xl border border-violet-100">
              <input
                type="checkbox"
                id="includeKb"
                checked={includeKnowledgeBase}
                onChange={(e) => setIncludeKnowledgeBase(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-violet-600 rounded border-gray-300 focus:ring-violet-500"
              />
              <div>
                <label htmlFor="includeKb" className="text-sm font-medium text-gray-900 cursor-pointer">
                  Bao gồm Knowledge Base
                </label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Chatbot này có {chatbot.chunkCount || 0} chunks. Người mua sẽ nhận được nội dung knowledge base.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !form.title.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-violet-500 hover:bg-violet-600 rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Đang đăng...
              </>
            ) : (
              <>
                <HiOutlineCheckCircle className="w-4 h-4" />
                Đăng ngay
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default MarketplaceListingModal;
