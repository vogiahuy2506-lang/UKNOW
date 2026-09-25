import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineX,
  HiOutlineCheckCircle,
  HiOutlineGlobeAlt,
} from 'react-icons/hi';
import marketplaceService from '../../services/marketplace.service';
import { useI18n } from '../../i18n';

/**
 * Modal đăng landing page của tôi lên Marketplace.
 *
 * Resource-type: landing_page.
 * Backend: POST /api/marketplace/landing-pages
 *   Payload: { landingPageId, title, description, tags, priceCredits }
 *   (xem backend/src/controllers/marketplace.controller.js:582-624)
 *
 * Tách riêng khỏi MarketplaceListingModal (chatbot) vì modal đó đang hard-code
 * cho chatbot — avatar_url, hasKnowledgeBase, knowledge base chunks. Sửa chung
 * sẽ kéo theo nhánh if lồng nhau và phá test hiện tại.
 *
 * Props:
 *   - open: boolean
 *   - landingPage: { id, title, description? } | null
 *   - onClose: () => void
 *   - onSuccess: () => void  (gọi sau khi tạo listing thành công, vd reload danh sách)
 */
const LandingPageMarketplaceModal = ({ open, landingPage, onClose, onSuccess }) => {
  const { t } = useI18n();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    tags: [],
    priceCredits: 0,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Pre-fill từ landing page
  useEffect(() => {
    if (open && landingPage) {
      setForm((prev) => ({
        ...prev,
        title: landingPage.title || '',
        description: landingPage.description || '',
      }));
    }
  }, [open, landingPage]);

  // Reset khi đóng
  useEffect(() => {
    if (!open) {
      setForm({
        title: '',
        description: '',
        tags: [],
        priceCredits: 0,
      });
      setTagInput('');
    }
  }, [open]);

  // Escape + khóa scroll
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

  // Tag handlers — mirror backend giới hạn 10 tag, mỗi tag ≤ 50 ký tự
  const handleAddTag = () => {
    const tag = tagInput.trim().substring(0, 50);
    if (tag && !form.tags.includes(tag) && form.tags.length < 10) {
      setForm((prev) => ({ ...prev, tags: [...prev.tags, tag] }));
      setTagInput('');
    }
  };

  const handleRemoveTag = (tagToRemove) => {
    setForm((prev) => ({
      ...prev,
      tags: prev.tags.filter((tg) => tg !== tagToRemove),
    }));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleAddTag();
    }
  };

  const validate = () => {
    if (!form.title.trim()) {
      toast.error(t('landingPagesAdmin.publishTitleRequired'));
      return false;
    }
    if (form.title.length > 255) {
      toast.error(t('landingPagesAdmin.publishTitleTooLong'));
      return false;
    }
    if (form.description && form.description.length > 2000) {
      toast.error(t('landingPagesAdmin.publishDescTooLong'));
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!landingPage?.id) return;

    setIsSubmitting(true);
    try {
      await marketplaceService.createLandingPageListing({
        landingPageId: landingPage.id,
        title: form.title.trim(),
        description: form.description?.trim() || null,
        tags: form.tags.length > 0 ? form.tags : null,
        priceCredits: parseInt(form.priceCredits, 10) || 0,
      });
      toast.success(t('landingPagesAdmin.publishSuccess'));
      onSuccess?.();
      onClose();
    } catch (error) {
      toast.error(
        error.response?.data?.message ||
          t('landingPagesAdmin.publishFailed')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open || !mounted || !landingPage) return null;

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
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-orange-50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center">
              <HiOutlineGlobeAlt className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {t('landingPagesAdmin.publishToMarketplace')}
              </h3>
              <p className="text-sm text-gray-500">
                {t('landingPagesAdmin.publishSubtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-orange-100 rounded-lg transition-colors"
            aria-label={t('common.close') || 'Đóng'}
          >
            <HiOutlineX className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Landing page preview */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
              <HiOutlineGlobeAlt className="w-5 h-5 text-orange-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 truncate">
                {landingPage.title || '—'}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {landingPage.slug
                  ? `${landingPage.slug}.founderai.biz`
                  : landingPage.customDomainHostname || '—'}
              </p>
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('landingPagesAdmin.publishFieldTitle')}{' '}
              <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder={t('landingPagesAdmin.publishFieldTitlePlaceholder')}
              maxLength={255}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 transition-all"
            />
            <p className="text-xs text-gray-400 mt-1">{form.title.length}/255</p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('landingPagesAdmin.publishFieldDescription')}
            </label>
            <textarea
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder={t('landingPagesAdmin.publishFieldDescriptionPlaceholder')}
              rows={3}
              maxLength={2000}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 transition-all resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">
              {form.description.length}/2000
            </p>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('landingPagesAdmin.publishFieldTags')}{' '}
              <span className="font-normal text-gray-400">
                ({t('landingPagesAdmin.publishFieldTagsHint')})
              </span>
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {form.tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 text-xs rounded-full"
                >
                  {tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-orange-900"
                    aria-label={`Remove tag ${tag}`}
                  >
                    <HiOutlineX className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
            {form.tags.length < 10 && (
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={t('landingPagesAdmin.publishFieldTagsPlaceholder')}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 transition-all"
              />
            )}
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              {t('landingPagesAdmin.publishFieldPrice')}
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    priceCredits: Math.max(0, prev.priceCredits - 10),
                  }))
                }
                className="w-10 h-10 rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50 text-gray-700 font-semibold transition-colors"
              >
                −
              </button>
              <input
                type="number"
                value={form.priceCredits}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    priceCredits: Math.max(0, parseInt(e.target.value, 10) || 0),
                  }))
                }
                min="0"
                className="flex-1 px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 transition-all text-center font-semibold"
              />
              <button
                type="button"
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    priceCredits: prev.priceCredits + 10,
                  }))
                }
                className="w-10 h-10 rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50 text-gray-700 font-semibold transition-colors"
              >
                +
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {t('landingPagesAdmin.publishPriceFreeHint')}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-200 rounded-xl transition-colors disabled:opacity-50"
          >
            {t('common.cancel') || 'Hủy'}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting || !form.title.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-orange-500 hover:bg-orange-600 rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                {t('landingPagesAdmin.publishSubmitting')}
              </>
            ) : (
              <>
                <HiOutlineCheckCircle className="w-4 h-4" />
                {t('landingPagesAdmin.publishSubmit')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default LandingPageMarketplaceModal;
