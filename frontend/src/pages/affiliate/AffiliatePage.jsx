import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineCurrencyDollar } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import affiliateService from '../../services/affiliate.service';
import WithdrawalModal from './WithdrawalModal';
import PageHeader from '../../components/common/PageHeader';
import Notice from '../../components/common/Notice';
import StatusChip from '../../components/common/StatusChip';

const MIN_WITHDRAWAL_AMOUNT = 1_000_000;

function formatVnd(amount) {
  return `${Number(amount || 0).toLocaleString('vi-VN')} đ`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

function formatDateTime(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function maskBankAccount(accountNumber) {
  const str = String(accountNumber || '');
  if (!str) return '—';
  if (str.length <= 4) return str;
  return `••• ${str.slice(-4)}`;
}

function TierLadder({ tiers, currentTier, currentMonthGross }) {
  if (!tiers || tiers.length === 0) return null;

  return (
    <div className="flex items-stretch gap-1.5">
      {tiers.map((tier, idx) => {
        const isPast = tier.level < currentTier.level;
        const isCurrent = tier.level === currentTier.level;
        let fillPercent = 0;
        if (isPast) {
          fillPercent = 100;
        } else if (isCurrent) {
          const nextTierData = tiers[idx + 1];
          if (nextTierData) {
            const range = nextTierData.minRevenue - tier.minRevenue;
            const progress = currentMonthGross - tier.minRevenue;
            fillPercent = range > 0 ? Math.min(100, Math.max(0, Math.round((progress / range) * 100))) : 100;
          } else {
            fillPercent = 100;
          }
        }

        return (
          <div key={tier.level} className="flex-1 min-w-0">
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isPast || isCurrent ? 'bg-orange-500' : 'bg-gray-100'
                }`}
                style={{ width: `${fillPercent}%` }}
              />
            </div>
            <div className={`mt-1 text-[10px] leading-tight ${isCurrent ? 'font-bold text-orange-700' : 'text-gray-400'}`}>
              <div>{tier.ratePercent}%</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function AffiliatePage() {
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [showPendingList, setShowPendingList] = useState(false);
  const [activeTab, setActiveTab] = useState('month'); // 'month' | 'withdrawal' | 'ledger'

  const fetchOverview = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await affiliateService.getOverview();
      setData(res.data);
    } catch (err) {
      console.error('Failed to load affiliate overview:', err);
      setError(err?.response?.data?.message || err?.message || 'Không thể tải dữ liệu');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  const handleCopy = (text, messageKey) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast.success(t(messageKey || 'affiliate.copiedSuccess'));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="flex flex-col items-center gap-3">
          <svg className="animate-spin w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span className="text-sm text-gray-500">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 text-red-600 mb-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-gray-900">{error}</h3>
        <button onClick={fetchOverview} className="btn btn-primary mt-4">
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const {
    referralCode,
    referralLink,
    currentBalance = 0,
    currentMonthKey = '',
    currentMonthGross = 0,
    currentTier = { level: 1, ratePercent: 10 },
    nextTier = null,
    amountToNextTier = 0,
    estimatedCommission = 0,
    hasPendingWithdrawal = false,
    pendingApproval = { pendingRevenue: 0, pendingBuyersCount: 0, events: [] },
    monthlyHistory = [],
    withdrawalHistory = [],
    ledgerHistory = [],
    tiers = [],
  } = data || {};

  const canWithdraw = currentBalance >= MIN_WITHDRAWAL_AMOUNT && !hasPendingWithdrawal;
  const pendingBuyersCount = pendingApproval.pendingBuyersCount || 0;
  const pendingEvents = pendingApproval.events || [];
  const pendingCommissionEstimated = Math.round((pendingApproval.pendingRevenue || 0) * (currentTier.ratePercent / 100));

  const taxAmount = Math.round(currentBalance * 0.1);
  const netAmount = currentBalance - taxAmount;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <PageHeader
        icon={HiOutlineCurrencyDollar}
        title={t('affiliate.title')}
        subtitle={t('affiliate.subtitle')}
        actions={
          referralLink && (
            <button
              type="button"
              onClick={() => handleCopy(referralLink, 'affiliate.copiedSuccess')}
              className="btn btn-primary"
            >
              {t('affiliate.copyLink')}
            </button>
          )
        }
      />

      {/* Hàng 3 thẻ */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-[1fr_1.35fr_1fr] gap-5">
        {/* Card 1: Mã & link giới thiệu */}
        <div className="card card-body order-2 lg:order-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                {t('affiliate.referralInfo')}
              </span>
              <StatusChip tone="good">{t('affiliate.activeStatus')}</StatusChip>
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-xs text-gray-500">{t('affiliate.referralCode')}</span>
                <div className="mt-1 flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-200 font-mono font-bold text-gray-800">
                  <span>{referralCode || '—'}</span>
                  {referralCode && (
                    <button
                      type="button"
                      onClick={() => handleCopy(referralCode, 'affiliate.copiedSuccess')}
                      className="text-xs font-sans text-orange-600 hover:text-orange-700 font-semibold px-2 py-1 rounded hover:bg-orange-50 transition-colors"
                    >
                      {t('affiliate.copyCode')}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <span className="text-xs text-gray-500">{t('affiliate.referralLink')}</span>
                <div className="mt-1 flex items-center justify-between p-2.5 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-700">
                  <span className="truncate mr-2">{referralLink || '—'}</span>
                  {referralLink && (
                    <button
                      type="button"
                      onClick={() => handleCopy(referralLink, 'affiliate.copiedSuccess')}
                      className="text-orange-600 hover:text-orange-700 font-semibold px-2 py-1 rounded hover:bg-orange-50 transition-colors shrink-0"
                    >
                      {t('affiliate.copyLink')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Hoa hồng tháng này + thang bậc */}
        <div className="card card-body order-1 md:col-span-2 lg:order-2 lg:col-span-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                {t('affiliate.commissionMonthLabel', { month: currentMonthKey })}
              </span>
              <StatusChip tone="accent">
                {t('affiliate.tierLevel', { level: currentTier.level })} · {currentTier.ratePercent}%
              </StatusChip>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-500">{t('affiliate.monthRevenue')}</span>
                <span className="text-lg font-bold text-gray-900">{formatVnd(currentMonthGross)}</span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-500">{t('affiliate.estimatedCommission')}</span>
                <span className="text-base font-bold text-orange-600">{formatVnd(estimatedCommission)}</span>
              </div>

              <div className="pt-3 border-t border-gray-100">
                <TierLadder tiers={tiers} currentTier={currentTier} currentMonthGross={currentMonthGross} />
                <p className="mt-2 text-[11px] text-gray-500">
                  {nextTier
                    ? t('affiliate.nextTierHint', {
                        amount: formatVnd(amountToNextTier),
                        nextLevel: nextTier.level,
                        nextRate: nextTier.ratePercent,
                      })
                    : t('affiliate.maxTierReached')}
                </p>
                <p className="mt-1 text-[11px] text-gray-400">{t('affiliate.closingNotice')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Số dư ví & rút tiền */}
        <div className="card card-body order-3 lg:order-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500">
                {t('affiliate.walletBalance')}
              </span>
              <StatusChip tone="muted">
                {t('affiliate.minWithdrawalChip', { amount: formatVnd(MIN_WITHDRAWAL_AMOUNT) })}
              </StatusChip>
            </div>
            <div className="text-2xl font-extrabold text-emerald-600">{formatVnd(currentBalance)}</div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 space-y-2">
            {canWithdraw && (
              <div className="text-[11px] text-gray-500 space-y-1 mb-2">
                <div className="flex justify-between">
                  <span>{t('affiliate.withdrawalAll')}</span>
                  <span className="font-medium text-gray-700">{formatVnd(currentBalance)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('affiliate.taxDeduction')}</span>
                  <span className="font-medium text-red-600">{formatVnd(taxAmount)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('affiliate.netPayout')}</span>
                  <span className="font-bold text-emerald-600">{formatVnd(netAmount)}</span>
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsModalOpen(true)}
              disabled={!canWithdraw}
              className={`btn w-full ${canWithdraw ? 'btn-primary' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
            >
              {t('affiliate.requestWithdrawal')}
            </button>

            {!canWithdraw && (
              <p className="text-[11px] text-amber-700 leading-tight">
                {hasPendingWithdrawal
                  ? t('affiliate.hasPendingNotice')
                  : t('affiliate.minWithdrawalNotice', { balance: formatVnd(currentBalance) })}
              </p>
            )}
            {canWithdraw && <p className="text-[11px] text-gray-400 leading-tight">{t('affiliate.withdrawalProcessingNotice')}</p>}
          </div>
        </div>
      </div>

      {/* Khung cảnh báo: CHỈ khi còn đơn chưa tính hoa hồng */}
      {pendingBuyersCount > 0 && (
        <Notice
          variant="warning"
          title={t('affiliate.pendingNoticeTitle', { count: pendingBuyersCount })}
          action={
            <button
              type="button"
              onClick={() => setShowPendingList((v) => !v)}
              className="btn btn-secondary text-xs py-1.5 px-3"
            >
              {showPendingList
                ? t('affiliate.hidePendingOrders')
                : t('affiliate.viewPendingOrders', { count: pendingBuyersCount })}
            </button>
          }
        >
          <p>{t('affiliate.pendingApprovalDesc')}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <span className="block text-[11px] uppercase tracking-wide font-semibold">
                {t('affiliate.pendingRevenueAmount')}
              </span>
              <span className="block text-base font-bold">{formatVnd(pendingApproval.pendingRevenue)}</span>
            </div>
            <div>
              <span className="block text-[11px] uppercase tracking-wide font-semibold">
                {t('affiliate.pendingCommissionEstimated')}
              </span>
              <span className="block text-base font-bold">{formatVnd(pendingCommissionEstimated)}</span>
            </div>
          </div>

          {showPendingList && (
            <div className="mt-3 overflow-x-auto rounded-lg border border-amber-200 bg-white">
              {pendingEvents.length > 0 ? (
                <table className="w-full text-left text-xs">
                  <thead className="bg-amber-50 text-amber-900 font-semibold">
                    <tr>
                      <th className="px-3 py-2">{t('affiliate.buyerEmail')}</th>
                      <th className="px-3 py-2">{t('affiliate.orderAmount')}</th>
                      <th className="px-3 py-2">{t('affiliate.orderDate')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-amber-100 text-gray-700">
                    {pendingEvents.map((ev) => (
                      <tr key={ev.id}>
                        <td className="px-3 py-2 font-mono">{ev.buyerEmailMasked}</td>
                        <td className="px-3 py-2 font-semibold">{formatVnd(ev.amount)}</td>
                        <td className="px-3 py-2 text-gray-500">{formatDate(ev.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-2 text-xs text-amber-700 italic">{t('affiliate.noPendingOrders')}</div>
              )}
            </div>
          )}
        </Notice>
      )}

      {/* 3 tab: theo tháng / rút tiền / biến động ví */}
      <div className="card overflow-hidden">
        <div className="flex items-center gap-2 border-b border-gray-100 px-2">
          <button
            type="button"
            onClick={() => setActiveTab('month')}
            className={`px-4 py-3 font-semibold text-sm border-b-2 transition-colors ${
              activeTab === 'month' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('affiliate.monthlyHistoryTitle')} ({monthlyHistory.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('withdrawal')}
            className={`px-4 py-3 font-semibold text-sm border-b-2 transition-colors ${
              activeTab === 'withdrawal' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('affiliate.withdrawalHistoryTitle')} ({withdrawalHistory.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('ledger')}
            className={`px-4 py-3 font-semibold text-sm border-b-2 transition-colors ${
              activeTab === 'ledger' ? 'border-orange-500 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t('affiliate.ledgerHistoryTitle')} ({ledgerHistory.length})
          </button>
        </div>

        {activeTab === 'month' && (
          <div className="table-container">
            {monthlyHistory.length > 0 ? (
              <table className="table text-left">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">{t('affiliate.month')}</th>
                    <th className="px-6 py-3 text-right">{t('affiliate.grossRevenue')}</th>
                    <th className="px-6 py-3">{t('affiliate.currentTier')}</th>
                    <th className="px-6 py-3 text-right">{t('affiliate.estimatedCommission')}</th>
                    <th className="px-6 py-3">{t('affiliate.closedAt')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {monthlyHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/60">
                      <td className="px-6 py-3.5 font-bold text-gray-900">{item.monthKey}</td>
                      <td className="px-6 py-3.5 text-right tabular-nums font-medium">{formatVnd(item.grossRevenue)}</td>
                      <td className="px-6 py-3.5">
                        <StatusChip tone="accent">
                          {t('affiliate.tierLevel', { level: item.tierLevel })} · {item.ratePercent}%
                        </StatusChip>
                      </td>
                      <td className="px-6 py-3.5 text-right tabular-nums font-bold text-emerald-600">
                        {formatVnd(item.commissionAmount)}
                      </td>
                      <td className="px-6 py-3.5 text-xs text-gray-500">{formatDateTime(item.closedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-sm text-gray-500">{t('affiliate.monthlyHistoryEmpty')}</div>
            )}
          </div>
        )}

        {activeTab === 'withdrawal' && (
          <div className="table-container">
            {withdrawalHistory.length > 0 ? (
              <table className="table text-left">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">{t('affiliate.requestedAt')}</th>
                    <th className="px-6 py-3 text-right">{t('affiliate.amountGross')}</th>
                    <th className="px-6 py-3 text-right">{t('affiliate.taxAmount')}</th>
                    <th className="px-6 py-3 text-right">{t('affiliate.amountNet')}</th>
                    <th className="px-6 py-3">{t('affiliate.bankInfo')}</th>
                    <th className="px-6 py-3">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {withdrawalHistory.map((w) => {
                    let statusTone = 'warning';
                    let statusLabel = t('affiliate.statusPending');
                    if (w.status === 'paid') {
                      statusTone = 'good';
                      statusLabel = t('affiliate.statusPaid');
                    } else if (w.status === 'rejected') {
                      statusTone = 'danger';
                      statusLabel = t('affiliate.statusRejected');
                    }

                    return (
                      <tr key={w.id} className="hover:bg-gray-50/60">
                        <td className="px-6 py-3.5 text-xs text-gray-500">{formatDateTime(w.requested_at)}</td>
                        <td className="px-6 py-3.5 text-right tabular-nums font-semibold text-gray-900">
                          {formatVnd(w.amount_gross)}
                        </td>
                        <td className="px-6 py-3.5 text-right tabular-nums text-red-600 text-xs">
                          {formatVnd(w.tax_amount)}
                        </td>
                        <td className="px-6 py-3.5 text-right tabular-nums font-bold text-emerald-600">
                          {formatVnd(w.amount_net)}
                        </td>
                        <td className="px-6 py-3.5 text-xs">
                          <div className="font-medium text-gray-800">{w.bank_name}</div>
                          <div className="text-gray-500 font-mono">{maskBankAccount(w.bank_account_number)}</div>
                        </td>
                        <td className="px-6 py-3.5">
                          <StatusChip tone={statusTone}>{statusLabel}</StatusChip>
                          {w.status === 'rejected' && w.note && (
                            <div className="text-[11px] text-red-600 mt-1 max-w-xs">{w.note}</div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-sm text-gray-500">{t('affiliate.noWithdrawalHistory')}</div>
            )}
          </div>
        )}

        {activeTab === 'ledger' && (
          <div className="table-container">
            {ledgerHistory.length > 0 ? (
              <table className="table text-left">
                <thead className="bg-gray-50 text-xs text-gray-500 uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">{t('common.date')}</th>
                    <th className="px-6 py-3">{t('affiliate.entryType')}</th>
                    <th className="px-6 py-3 text-right">{t('affiliate.amountGross')}</th>
                    <th className="px-6 py-3">{t('affiliate.note')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-gray-700">
                  {ledgerHistory.map((item) => {
                    const isPositive = item.amount > 0;
                    let entryLabel = null;
                    if (item.entryType === 'commission') entryLabel = <span className="text-emerald-600">{t('affiliate.entryCommission')}</span>;
                    else if (item.entryType === 'withdrawal') entryLabel = <span className="text-amber-600">{t('affiliate.entryWithdrawal')}</span>;
                    else if (item.entryType === 'adjustment') entryLabel = <span className="text-purple-600">{t('affiliate.entryAdjustment')}</span>;

                    return (
                      <tr key={item.id} className="hover:bg-gray-50/60">
                        <td className="px-6 py-3 text-xs text-gray-500">{formatDateTime(item.createdAt)}</td>
                        <td className="px-6 py-3 text-xs font-semibold">{entryLabel}</td>
                        <td className={`px-6 py-3 text-right tabular-nums font-bold ${isPositive ? 'text-emerald-600' : 'text-red-600'}`}>
                          {isPositive ? `+${formatVnd(item.amount)}` : formatVnd(item.amount)}
                        </td>
                        <td className="px-6 py-3 text-xs text-gray-600">{item.note || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-sm text-gray-500">{t('affiliate.noLedgerHistory')}</div>
            )}
          </div>
        )}
      </div>

      <WithdrawalModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentBalance={currentBalance}
        onSuccess={fetchOverview}
      />
    </div>
  );
}
