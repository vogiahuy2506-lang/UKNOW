import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import campaignApiService from '../services/campaignApi.service';

/**
 * Modal nhân bản chiến dịch — tách khỏi Campaigns.jsx (PLAN_NUT_HANH_DONG_TRONG_SO_DO_CHIEN_DICH_2026-09-16,
 * PR-2) để dùng chung được ở cả trang danh sách lẫn thanh công cụ trình dựng. Refactor thuần: giữ
 * nguyên giao diện, thông báo, luật hiện có.
 *
 * @param {object} props
 * @param {{ id: number|string, campaignName?: string }|null} props.campaign
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {(duplicatedCampaign: { id: number|string, campaignName?: string, campaignType?: string, status?: string }) => void} [props.onDone]
 *   gọi với dữ liệu chiến dịch VỪA nhân bản (đọc thẳng từ `response.data.data` — API trả 201 với
 *   `{ data: <campaign đã nhân bản> }`, KHÔNG đoán hình dạng khác) sau khi nhân bản thành công,
 *   trước khi đóng modal.
 */
const CampaignDuplicateModal = ({ campaign, open, onClose, onDone }) => {
  const { t } = useI18n();
  const [duplicateName, setDuplicateName] = useState('');
  const [isDuplicating, setIsDuplicating] = useState(false);

  useEffect(() => {
    if (open && campaign) {
      setDuplicateName(`${campaign.campaignName || ''} (${t('campaigns.copy')})`);
    }
  }, [open, campaign, t]);

  if (!open) return null;

  const handleDuplicate = async () => {
    if (!duplicateName.trim()) {
      toast.error(t('campaigns.enterCampaignName'));
      return;
    }

    setIsDuplicating(true);
    try {
      const response = await campaignApiService.duplicateCampaign(campaign.id, {
        campaignName: duplicateName.trim(),
      });
      toast.success(t('campaigns.duplicateSuccess'));
      onDone?.(response.data?.data);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.message || t('campaigns.duplicateFailed'));
    } finally {
      setIsDuplicating(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative bg-white dark:bg-dk-surface rounded-lg shadow-xl max-w-md w-full border border-transparent dark:border-dk-border text-gray-900 dark:text-dk-text">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-dk-border">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dk-text">{t('campaigns.duplicateModalTitle')}</h3>
        </div>
        <div className="px-6 py-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-dk-text mb-2">
            {t('campaigns.newCampaignName')}
          </label>
          <input
            type="text"
            value={duplicateName}
            onChange={(e) => setDuplicateName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleDuplicate();
              if (e.key === 'Escape') onClose();
            }}
            placeholder={t('campaigns.newCampaignNamePlaceholder')}
            className="input w-full dark:bg-dk-raised dark:border-dk-border dark:text-dk-text"
            autoFocus
          />
        </div>
        <div className="px-6 py-4 border-t border-gray-200 dark:border-dk-border bg-gray-50 dark:bg-dk-bg rounded-b-lg flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isDuplicating}
            className="btn btn-secondary dark:bg-dk-raised dark:border-dk-border dark:text-dk-text dark:hover:bg-dk-strong"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleDuplicate}
            disabled={isDuplicating}
            className="btn btn-primary"
          >
            {isDuplicating ? (
              <>
                <div className="spinner w-4 h-4 mr-2"></div>
                {t('common.processing')}
              </>
            ) : (
              t('campaigns.duplicate')
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CampaignDuplicateModal;
