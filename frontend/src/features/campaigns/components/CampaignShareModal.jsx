import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
import campaignApiService from '../services/campaignApi.service';
import EmailTagsInput from '../../../components/common/EmailTagsInput';

/**
 * Modal chia sẻ chiến dịch — tách khỏi Campaigns.jsx (PLAN_NUT_HANH_DONG_TRONG_SO_DO_CHIEN_DICH_2026-09-16,
 * PR-2) để dùng chung được ở cả trang danh sách lẫn thanh công cụ trình dựng. Refactor thuần: giữ
 * nguyên giao diện, thông báo, luật (3 trường: email, shareType, canRun).
 *
 * Chỉ dành cho chiến dịch tự tạo (`origin === 'self_created'`) — nơi gọi (menu danh sách, toolbar
 * trình dựng) chịu trách nhiệm ẩn nút mở modal này khi không đúng điều kiện; bản thân modal không
 * tự kiểm tra lại `origin`.
 *
 * @param {object} props
 * @param {{ id: number|string, campaignName?: string }|null} props.campaign
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {() => void} [props.onDone] gọi sau khi chia sẻ thành công (trước khi đóng modal)
 */
const CampaignShareModal = ({ campaign, open, onClose, onDone }) => {
  const { t } = useI18n();
  const [shareForm, setShareForm] = useState({
    emails: [],
    shareType: 'view',
    canRun: false,
  });
  const [isSharing, setIsSharing] = useState(false);

  useEffect(() => {
    if (open) {
      setShareForm({ emails: [], shareType: 'view', canRun: false });
    }
  }, [open, campaign]);

  if (!open) return null;

  const handleShare = async () => {
    if (shareForm.emails.length === 0) {
      toast.error(t('campaigns.enterEmail') || 'Vui lòng nhập ít nhất 1 email');
      return;
    }

    setIsSharing(true);
    const results = await Promise.allSettled(
      shareForm.emails.map((email) =>
        campaignApiService.shareCampaign(campaign.id, {
          recipientEmail: email,
          shareType: shareForm.shareType,
          canRun: shareForm.canRun,
        }),
      ),
    );
    const succeeded = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.length - succeeded;
    if (succeeded > 0) {
      // Phân nhánh thông báo theo isExistingUser từ server (PR-2):
      //  - existing: đã gửi mail cho tài khoản user.
      //  - pending: email chưa có tài khoản → server lưu share + gửi mail mời đăng ký.
      // Cấu trúc response: axios { data: { success, data: { isExistingUser, ... } } }
      const fulfilledResults = results
        .filter((r) => r.status === 'fulfilled')
        .map((r) => r.value?.data?.data);
      const existingCount = fulfilledResults.filter(
        (d) => d?.isExistingUser === true
      ).length;
      const pendingCount = fulfilledResults.filter(
        (d) => d?.isExistingUser === false
      ).length;

      if (failed > 0) {
        toast.success(
          t('campaigns.sharePartialSuccess', {
            succeeded,
            total: results.length,
            existing: existingCount,
            pending: pendingCount,
          }) || `Đã chia sẻ cho ${succeeded}/${results.length} người (${existingCount} đã có tài khoản, ${pendingCount} chờ đăng ký)`
        );
      } else if (pendingCount > 0 && existingCount === 0) {
        toast.success(t('campaigns.shareToastAllPending') || 'Đã lưu quyền chia sẻ. Hệ thống sẽ gửi email mời người nhận đăng ký để nhận chiến dịch');
      } else if (existingCount > 0 && pendingCount === 0) {
        toast.success(t('campaigns.shareToastAllExisting') || 'Đã chia sẻ và gửi email thông báo');
      } else {
        // Hỗn hợp
        toast.success(t('campaigns.shareSuccess') || 'Chia sẻ thành công');
      }
    }
    if (failed > 0) {
      const firstFail = results.find((r) => r.status === 'rejected');
      const msg = firstFail?.reason?.response?.data?.message || t('campaigns.shareFailed');
      toast.error(msg);
    }
    setIsSharing(false);
    if (succeeded > 0) {
      onDone?.();
      onClose();
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {t('campaigns.shareModalTitle') || 'Chia sẻ chiến dịch'}
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            {campaign?.campaignName}
          </p>
        </div>
        <div className="px-6 py-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('campaigns.recipientEmail') || 'Email người nhận'}
            </label>
            <EmailTagsInput
              value={shareForm.emails}
              onChange={(emails) => setShareForm({ ...shareForm, emails })}
              disabled={isSharing}
              placeholder="Nhập email và nhấn Enter để thêm..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('campaigns.sharePermission') || 'Quyền chia sẻ'}
            </label>
            <select
              value={shareForm.shareType}
              onChange={(e) => setShareForm({ ...shareForm, shareType: e.target.value })}
              className="input w-full"
            >
              <option value="view">{t('campaigns.viewOnly') || 'Chỉ xem'}</option>
              <option value="edit">{t('campaigns.viewAndEdit') || 'Xem và chỉnh sửa'}</option>
            </select>
          </div>
          <div className="flex items-center">
            <input
              type="checkbox"
              id="canRun"
              checked={shareForm.canRun}
              onChange={(e) => setShareForm({ ...shareForm, canRun: e.target.checked })}
              className="h-4 w-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
            />
            <label htmlFor="canRun" className="ml-2 text-sm text-gray-700">
              {t('campaigns.canRunCampaign') || 'Cho phép chạy chiến dịch'}
            </label>
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            disabled={isSharing}
            className="btn btn-secondary"
          >
            {t('common.cancel')}
          </button>
          <button
            onClick={handleShare}
            disabled={isSharing || shareForm.emails.length === 0}
            className="btn btn-primary"
          >
            {isSharing ? (
              <>
                <div className="spinner w-4 h-4 mr-2"></div>
                {t('common.processing')}
              </>
            ) : shareForm.emails.length > 1 ? (
              `Chia sẻ (${shareForm.emails.length})`
            ) : (
              t('campaigns.share')
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CampaignShareModal;
