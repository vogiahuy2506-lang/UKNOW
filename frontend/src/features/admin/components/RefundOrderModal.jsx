import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import toast from 'react-hot-toast';
import Modal from '../../../components/Modal';
import { useI18n } from '../../../i18n';
import adminOrdersApiService from '../services/adminOrdersApi.service';

// PLAN_HOAN_TIEN_DON_HANG PR-3 — admin GHI NHẬN một đơn đã được kế toán chuyển khoản hoàn tay.
// Modal gọi preview để nói trước 3 hệ quả (gói / hoá đơn / hoa hồng) bằng lời thường; server kiểm lại
// mọi điều kiện trên dòng đã khoá, preview chỉ để hiển thị.

const fmtVnd = (n) => `${Math.round(Number(n) || 0).toLocaleString('vi-VN')} đ`;

const PLAN_KEYS = {
  revoked: 'adminOrders.refundPlanRevoked',
  untouched: 'adminOrders.refundPlanUntouched',
  no_user: 'adminOrders.refundPlanNoUser',
  not_applicable: 'adminOrders.refundPlanNotApplicable',
};

const EINVOICE_KEYS = {
  none: 'adminOrders.refundEinvoiceNone',
  cancelled: 'adminOrders.refundEinvoiceCancelled',
  needs_adjustment: 'adminOrders.refundEinvoiceNeedsAdjustment',
  in_flight: 'adminOrders.refundEinvoiceInFlight',
  untouched: 'adminOrders.refundEinvoiceUntouched',
};

function describeAffiliate(affiliate, t) {
  if (!affiliate) return [t('adminOrders.refundAffiliateNone')];
  const month = affiliate.monthKey;
  if (affiliate.period === 'not_closed') return [t('adminOrders.refundAffiliateNotClosed', { month })];
  if (affiliate.period === 'unchanged') return [t('adminOrders.refundAffiliateUnchanged', { month })];
  const lines = [t('adminOrders.refundAffiliateAdjusted', {
    month,
    prev: fmtVnd(affiliate.prevCommission),
    next: fmtVnd(affiliate.newCommission),
    deducted: fmtVnd(affiliate.deducted),
  })];
  if (affiliate.shortfall > 0 && affiliate.pendingWithdrawal) {
    lines.push(t('adminOrders.refundAffiliatePendingWithdrawal', {
      id: affiliate.pendingWithdrawal.id,
      shortfall: fmtVnd(affiliate.shortfall),
    }));
  } else if (affiliate.shortfall > 0) {
    lines.push(t('adminOrders.refundAffiliateShortfall', { shortfall: fmtVnd(affiliate.shortfall) }));
  }
  return lines;
}

const RefundOrderModal = ({ orderCode, onClose, onRefunded }) => {
  const { t } = useI18n();
  const [preview, setPreview] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [reason, setReason] = useState('');
  const [transferRef, setTransferRef] = useState('');
  const [acknowledge, setAcknowledge] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    adminOrdersApiService.getRefundPreview(orderCode)
      .then((res) => { if (alive) setPreview(res.data.data); })
      .catch((err) => { if (alive) setLoadError(err?.response?.data?.message || t('adminOrders.refundFailed')); });
    return () => { alive = false; };
  }, [orderCode, t]);

  const affiliate = preview?.affiliate || null;
  const needsAcknowledge = Boolean(affiliate && affiliate.shortfall > 0 && affiliate.pendingWithdrawal);
  const canSubmit = preview?.eligible && reason.trim() && (!needsAcknowledge || acknowledge) && !submitting;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      await adminOrdersApiService.refundOrder(orderCode, {
        reason: reason.trim(),
        transferRef: transferRef.trim() || undefined,
        acknowledgeShortfall: needsAcknowledge ? acknowledge : undefined,
      });
      toast.success(t('adminOrders.refundSuccess'));
      onRefunded();
    } catch (err) {
      const body = err?.response?.data;
      // 409 thiếu hụt: số dư ví vừa đổi giữa lúc xem trước và lúc bấm — cập nhật lại phần hoa hồng
      // theo số server tính trên dòng đã khoá rồi để admin xác nhận.
      if (body?.code === 'AFFILIATE_SHORTFALL_PENDING_WITHDRAWAL' && body?.details?.affiliate) {
        setPreview((p) => ({ ...p, affiliate: body.details.affiliate }));
        setAcknowledge(false);
      }
      toast.error(body?.message || t('adminOrders.refundFailed'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={t('adminOrders.refundTitle', { orderCode })} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-gray-600">{t('adminOrders.refundIntro')}</p>

        {loadError && <p className="text-sm text-red-600">{loadError}</p>}
        {!preview && !loadError && <p className="text-sm text-gray-400">{t('adminOrders.refundLoading')}</p>}

        {preview && !preview.eligible && (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {t('adminOrders.refundNotEligible', { reason: preview.reason })}
          </p>
        )}

        {preview?.eligible && (
          <>
            <p className="text-sm font-semibold text-gray-900">
              {t('adminOrders.refundAmount', { amount: fmtVnd(preview.amount) })}
            </p>
            <ul className="space-y-1.5 rounded-lg bg-gray-50 px-4 py-3 text-sm text-gray-700" data-testid="refund-consequences">
              <li>{t(PLAN_KEYS[preview.plan] || PLAN_KEYS.untouched)}</li>
              <li>{t(EINVOICE_KEYS[preview.einvoice] || EINVOICE_KEYS.untouched, { status: preview.einvoiceStatusBefore || '—' })}</li>
              {describeAffiliate(affiliate, t).map((line) => <li key={line}>{line}</li>)}
            </ul>

            {needsAcknowledge && (
              <label className="flex items-start gap-2 text-sm text-amber-800">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={acknowledge}
                  onChange={(e) => setAcknowledge(e.target.checked)}
                />
                {t('adminOrders.refundAcknowledge', { shortfall: fmtVnd(affiliate.shortfall) })}
              </label>
            )}

            <div>
              <label htmlFor="refund-reason" className="block text-xs text-gray-500 mb-1">{t('adminOrders.refundReasonLabel')}</label>
              <textarea
                id="refund-reason"
                className="input w-full"
                rows={2}
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="refund-transfer-ref" className="block text-xs text-gray-500 mb-1">{t('adminOrders.refundTransferRefLabel')}</label>
              <input
                id="refund-transfer-ref"
                type="text"
                className="input w-full"
                maxLength={200}
                value={transferRef}
                onChange={(e) => setTransferRef(e.target.value)}
              />
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn btn-secondary" onClick={onClose}>{t('adminOrders.cancel')}</button>
          {preview?.eligible && (
            <button type="submit" className="btn btn-primary bg-red-600 hover:bg-red-700" disabled={!canSubmit}>
              {t('adminOrders.refundConfirm')}
            </button>
          )}
        </div>
      </form>
    </Modal>
  );
};

RefundOrderModal.propTypes = {
  orderCode: PropTypes.string.isRequired,
  onClose: PropTypes.func.isRequired,
  onRefunded: PropTypes.func.isRequired,
};

export default RefundOrderModal;
