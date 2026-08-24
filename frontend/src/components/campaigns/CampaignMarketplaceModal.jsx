import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineX,
  HiOutlineCheckCircle,
  HiOutlineMail,
  HiOutlineLightBulb,
} from 'react-icons/hi';
import marketplaceService from '../../services/marketplace.service';
import { TagInput } from '../../components/common/FormComponents';
import { useI18n } from '../../i18n';

const CAMPAIGN_TYPE_LABELS = {
  email: 'Email',
  zalo: 'Zalo cá nhân',
  zalo_personal: 'Zalo cá nhân',
  zalo_group: 'Zalo nhóm',
  facebook: 'Facebook',
  telegram: 'Telegram',
  sms: 'SMS',
  mixed: 'Kết hợp',
};

const CampaignMarketplaceModal = ({ open, campaign, onClose, onSuccess }) => {
  const t = useI18n('marketplace');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: '',
    tags: [],
    priceCredits: 0,
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  // Pre-fill from campaign
  useEffect(() => {
    if (open && campaign) {
      setForm(prev => ({
        ...prev,
        title: campaign.campaignName || '',
        description: campaign.description || '',
        category: getCategoryFromCampaignType(campaign.campaignType),
      }));
    }
  }, [open, campaign]);

  // Reset when closed
  useEffect(() => {
    if (!open) {
      setForm({
        title: '',
        description: '',
        category: '',
        tags: [],
        priceCredits: 0,
      });
    }
  }, [open]);

  // Handle escape key
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

  const getCategoryFromCampaignType = (campaignType) => {
    const key = String(campaignType || '').trim().toLowerCase();
    const mapping = {
      email: 'email',
      zalo: 'zalo_personal',
      zalo_personal: 'zalo_personal',
      zalo_group: 'zalo_group',
      facebook: 'facebook',
      telegram: 'telegram',
      sms: 'sms',
    };
    return mapping[key] || null;
  };

  const updateForm = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
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
    if (form.description && form.description.length > 2000) {
      toast.error('Mô tả không được quá 2000 ký tự');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    if (!campaign?.id) return;

    setIsSubmitting(true);
    try {
      await marketplaceService.createListing({
        campaignId: campaign.id,
        title: form.title.trim(),
        description: form.description?.trim() || null,
        category: form.category || null,
        tags: form.tags.length > 0 ? form.tags : null,
        priceCredits: parseInt(form.priceCredits, 10) || 0,
      });
      toast.success(t('createListing.createSuccess') || 'Đăng marketplace thành công!');
      onSuccess?.();
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || t('createListing.createError') || 'Không thể tạo listing');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!open || !mounted || !campaign) return null;

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
              <HiOutlineMail className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Đăng lên Marketplace</h3>
              <p className="text-sm text-gray-500">Chia sẻ chiến dịch với cộng đồng</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-orange-100 rounded-lg transition-colors"
            aria-label="Đóng"
          >
            <HiOutlineX className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          {/* Campaign preview */}
          <div className="flex items-center gap-3 p-3 rounded-xl bg-gray-50 border border-gray-100">
            <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
              <HiOutlineMail className="w-5 h-5 text-orange-600" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-gray-900 truncate">{campaign?.campaignName}</p>
              <p className="text-xs text-gray-500 truncate">
                {CAMPAIGN_TYPE_LABELS[campaign?.campaignType] || campaign?.campaignType}
                {campaign?.totalCustomers ? ` • ${campaign.totalCustomers} khách hàng` : ''}
              </p>
            </div>
          </div>

          {/* Info box */}
          <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
            <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <HiOutlineLightBulb className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-sm text-gray-700">
              Chiến dịch của bạn sẽ được đóng gói thành template để người khác có thể sử dụng làm mẫu cho chiến dịch của họ.
            </p>
          </div>

          {/* Title */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Tiêu đề <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={(e) => updateForm('title', e.target.value)}
              placeholder="Tên template của bạn"
              maxLength={255}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 transition-all"
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
              onChange={(e) => updateForm('description', e.target.value)}
              placeholder="Mô tả ngắn về template chiến dịch..."
              rows={3}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 transition-all resize-none"
            />
            <p className="text-xs text-gray-400 mt-1">{form.description.length}/2000</p>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Tags <span className="font-normal text-gray-400">(tối đa 5)</span>
            </label>
            <TagInput
              value={form.tags}
              onChange={(tags) => updateForm('tags', tags)}
              placeholder="Nhấn Enter để thêm..."
            />
            <p className="text-xs text-gray-500 mt-1.5">
              Giúp người khác tìm thấy template dễ hơn
            </p>
          </div>

          {/* Price */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Giá (credits)
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => updateForm('priceCredits', Math.max(0, parseInt(form.priceCredits, 10) - 10))}
                className="w-10 h-10 rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50 text-gray-700 font-semibold transition-colors"
              >
                −
              </button>
              <input
                type="number"
                value={form.priceCredits}
                onChange={(e) => updateForm('priceCredits', Math.max(0, parseInt(e.target.value, 10) || 0))}
                min="0"
                className="flex-1 px-3.5 py-2.5 text-sm rounded-xl border border-gray-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-400 transition-all text-center font-semibold"
              />
              <button
                type="button"
                onClick={() => updateForm('priceCredits', parseInt(form.priceCredits, 10) + 10)}
                className="w-10 h-10 rounded-xl border border-gray-200 hover:border-orange-300 hover:bg-orange-50 text-gray-700 font-semibold transition-colors"
              >
                +
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Đặt <strong>0 credits</strong> để chia sẻ miễn phí
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
            Hủy
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

export default CampaignMarketplaceModal;
