import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import affiliateService from '../../services/affiliate.service';
import WithdrawalModal from './WithdrawalModal';

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

export default function AffiliatePage() {
  const { t } = useI18n();

  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

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
          <span className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading')}</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 mb-3">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h3 className="text-base font-bold text-gray-900 dark:text-white">{error}</h3>
        <button
          onClick={fetchOverview}
          className="mt-4 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-sm font-medium"
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const {
    referralCode,
    referralLink,
    currentBalance = 0,
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
  } = data || {};

  const canWithdraw = currentBalance >= MIN_WITHDRAWAL_AMOUNT && !hasPendingWithdrawal;

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">
          {t('affiliate.title')}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          {t('affiliate.subtitle')}
        </p>
      </div>

      {/* Top Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Card 1: Referral link & code */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200/80 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t('affiliate.referralInfo')}
              </span>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300">
                Active
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">{t('affiliate.referralCode')}</span>
                <div className="mt-1 flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-gray-700 font-mono font-bold text-gray-800 dark:text-gray-200">
                  <span>{referralCode || '—'}</span>
                  {referralCode && (
                    <button
                      onClick={() => handleCopy(referralCode, 'affiliate.copiedSuccess')}
                      className="text-xs font-sans text-orange-600 hover:text-orange-700 dark:text-orange-400 font-semibold px-2 py-1 rounded hover:bg-orange-50 dark:hover:bg-orange-950/40 transition-colors"
                    >
                      {t('affiliate.copyCode')}
                    </button>
                  )}
                </div>
              </div>

              <div>
                <span className="text-xs text-gray-500 dark:text-gray-400">{t('affiliate.referralLink')}</span>
                <div className="mt-1 flex items-center justify-between p-2.5 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 truncate">
                  <span className="truncate mr-2">{referralLink || '—'}</span>
                  {referralLink && (
                    <button
                      onClick={() => handleCopy(referralLink, 'affiliate.copiedSuccess')}
                      className="text-orange-600 hover:text-orange-700 dark:text-orange-400 font-semibold px-2 py-1 rounded hover:bg-orange-50 dark:hover:bg-orange-950/40 transition-colors flex-shrink-0"
                    >
                      {t('affiliate.copyLink')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Card 2: Bậc hoa hồng & Doanh thu tháng này */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200/80 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t('affiliate.currentTier')}
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800 dark:bg-indigo-950/80 dark:text-indigo-300">
                {t('affiliate.tierLevel', { level: currentTier.level })} ({currentTier.ratePercent}%)
              </span>
            </div>
            <div className="space-y-2.5">
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-500 dark:text-gray-400">{t('affiliate.monthRevenue')}</span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">
                  {formatVnd(currentMonthGross)}
                </span>
              </div>
              <div className="flex justify-between items-baseline">
                <span className="text-xs text-gray-500 dark:text-gray-400">{t('affiliate.estimatedCommission')}</span>
                <span className="text-base font-bold text-orange-600 dark:text-orange-400">
                  {formatVnd(estimatedCommission)}
                </span>
              </div>

              {/* Tiến độ lên bậc kế */}
              <div className="pt-2 border-t border-gray-100 dark:border-gray-700/60">
                {nextTier ? (
                  <div className="space-y-1.5">
                    <div className="text-[11px] text-gray-500 dark:text-gray-400">
                      {t('affiliate.nextTierHint', {
                        amount: formatVnd(amountToNextTier),
                        nextLevel: nextTier.level,
                        nextRate: nextTier.ratePercent,
                      })}
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                      <div
                        className="bg-gradient-to-r from-orange-500 to-amber-500 h-2 rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round((currentMonthGross / nextTier.minRevenue) * 100)
                          )}%`,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <p className="text-xs font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    {t('affiliate.maxTierReached')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Card 3: Số dư ví & Rút tiền */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-5 border border-gray-200/80 dark:border-gray-700 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t('affiliate.walletBalance')}
              </span>
              <span className="p-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </span>
            </div>
            <div className="text-2xl font-extrabold text-emerald-600 dark:text-emerald-400">
              {formatVnd(currentBalance)}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/60 space-y-2">
            <button
              onClick={() => setIsModalOpen(true)}
              disabled={!canWithdraw}
              className={`w-full py-2.5 px-4 rounded-xl font-bold text-sm transition-all shadow-md ${
                canWithdraw
                  ? 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white shadow-orange-500/20 active:scale-[0.99]'
                  : 'bg-gray-100 dark:bg-gray-700/60 text-gray-400 dark:text-gray-500 cursor-not-allowed shadow-none'
              }`}
            >
              {t('affiliate.requestWithdrawal')}
            </button>

            {!canWithdraw && (
              <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-tight">
                {hasPendingWithdrawal
                  ? t('affiliate.hasPendingNotice')
                  : t('affiliate.minWithdrawalNotice', {
                      balance: formatVnd(currentBalance),
                    })}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* 🔴 Card 4: MỤC "ĐANG CHỜ ĐỦ ĐIỀU KIỆN" (BẮT BUỘC CÓ) */}
      <div className="bg-amber-50/70 dark:bg-amber-950/20 rounded-2xl p-5 border border-amber-200 dark:border-amber-900/60 shadow-sm space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex-shrink-0 mt-0.5">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-bold text-amber-900 dark:text-amber-200">
              {t('affiliate.pendingApprovalTitle')}
            </h3>
            <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-1 max-w-3xl leading-relaxed">
              {t('affiliate.pendingApprovalDesc')}
            </p>
          </div>
        </div>

        {/* THÔNG TIN CHÍNH NỔI BẬT: Số lượng + Tổng tiền treo */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="bg-white/80 dark:bg-gray-900/80 rounded-xl p-4 border border-amber-200/80 dark:border-amber-900/60 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider block">
                {t('affiliate.pendingRevenueAmount')}
              </span>
              <span className="text-2xl font-black text-amber-900 dark:text-amber-100 mt-0.5 block">
                {formatVnd(pendingApproval.pendingRevenue)}
              </span>
            </div>
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center text-lg font-bold">
              ₫
            </div>
          </div>
          <div className="bg-white/80 dark:bg-gray-900/80 rounded-xl p-4 border border-amber-200/80 dark:border-amber-900/60 shadow-xs flex items-center justify-between">
            <div>
              <span className="text-xs font-semibold text-amber-800 dark:text-amber-300 uppercase tracking-wider block">
                {t('affiliate.pendingBuyersCount')}
              </span>
              <span className="text-2xl font-black text-amber-900 dark:text-amber-100 mt-0.5 block">
                {pendingApproval.pendingBuyersCount}
              </span>
            </div>
            <div className="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 flex items-center justify-center">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Danh sách các event đang chờ đủ điều kiện (thông tin phụ) */}
        {pendingApproval.events && pendingApproval.events.length > 0 ? (
          <div className="overflow-x-auto rounded-xl border border-amber-200/80 dark:border-amber-900/60 bg-white/70 dark:bg-gray-900/60">
            <table className="w-full text-left text-xs">
              <thead className="bg-amber-100/60 dark:bg-amber-950/40 text-amber-900 dark:text-amber-300 font-bold">
                <tr>
                  <th className="px-4 py-2.5">{t('affiliate.buyerEmail')}</th>
                  <th className="px-4 py-2.5">{t('affiliate.orderAmount')}</th>
                  <th className="px-4 py-2.5">{t('affiliate.orderDate')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100/60 dark:divide-amber-900/40 text-gray-700 dark:text-gray-300">
                {pendingApproval.events.map((ev) => (
                  <tr key={ev.id} className="hover:bg-amber-50/50 dark:hover:bg-amber-950/20">
                    <td className="px-4 py-2.5 font-medium font-mono text-gray-800 dark:text-gray-200">
                      {ev.buyerEmailMasked || ev.buyerEmail}
                    </td>
                    <td className="px-4 py-2.5 font-semibold text-amber-800 dark:text-amber-300">
                      {formatVnd(ev.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400">
                      {formatDate(ev.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-2 text-xs text-amber-700 dark:text-amber-400 italic">
            {t('affiliate.noPendingOrders')}
          </div>
        )}
      </div>

      {/* Tabs / Tables: Lịch sử tháng, Lịch sử rút, Biến động ví */}
      <div className="space-y-6">
        {/* Lịch sử theo tháng */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-white text-base">
              {t('affiliate.monthlyHistoryTitle')}
            </h3>
          </div>
          <div className="overflow-x-auto">
            {monthlyHistory.length > 0 ? (
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">{t('affiliate.month')}</th>
                    <th className="px-6 py-3">{t('affiliate.grossRevenue')}</th>
                    <th className="px-6 py-3">{t('affiliate.currentTier')}</th>
                    <th className="px-6 py-3">{t('affiliate.commissionRate')}</th>
                    <th className="px-6 py-3">{t('affiliate.estimatedCommission')}</th>
                    <th className="px-6 py-3">{t('affiliate.closedAt')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 text-gray-700 dark:text-gray-300">
                  {monthlyHistory.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-700/30">
                      <td className="px-6 py-3.5 font-bold text-gray-900 dark:text-white">
                        {item.monthKey}
                      </td>
                      <td className="px-6 py-3.5 font-medium">{formatVnd(item.grossRevenue)}</td>
                      <td className="px-6 py-3.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                          {t('affiliate.tierLevel', { level: item.tierLevel })}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">{item.ratePercent}%</td>
                      <td className="px-6 py-3.5 font-bold text-emerald-600 dark:text-emerald-400">
                        {formatVnd(item.commissionAmount)}
                      </td>
                      <td className="px-6 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                        {formatDateTime(item.closedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                {t('affiliate.noMonthlyHistory')}
              </div>
            )}
          </div>
        </div>

        {/* Lịch sử rút hoa hồng */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-white text-base">
              {t('affiliate.withdrawalHistoryTitle')}
            </h3>
          </div>
          <div className="overflow-x-auto">
            {withdrawalHistory.length > 0 ? (
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">{t('affiliate.requestedAt')}</th>
                    <th className="px-6 py-3">{t('affiliate.amountGross')}</th>
                    <th className="px-6 py-3">{t('affiliate.taxAmount')}</th>
                    <th className="px-6 py-3">{t('affiliate.amountNet')}</th>
                    <th className="px-6 py-3">{t('affiliate.bankInfo')}</th>
                    <th className="px-6 py-3">{t('common.status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 text-gray-700 dark:text-gray-300">
                  {withdrawalHistory.map((w) => {
                    let statusBadge;
                    if (w.status === 'pending') {
                      statusBadge = (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          {t('affiliate.statusPending')}
                        </span>
                      );
                    } else if (w.status === 'paid') {
                      statusBadge = (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                          {t('affiliate.statusPaid')}
                        </span>
                      );
                    } else {
                      statusBadge = (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                          {t('affiliate.statusRejected')}
                        </span>
                      );
                    }

                    return (
                      <tr key={w.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-700/30">
                        <td className="px-6 py-3.5 text-xs text-gray-500 dark:text-gray-400">
                          {formatDateTime(w.requested_at)}
                        </td>
                        <td className="px-6 py-3.5 font-semibold text-gray-900 dark:text-white">
                          {formatVnd(w.amount_gross)}
                        </td>
                        <td className="px-6 py-3.5 text-red-600 dark:text-red-400 text-xs">
                          {formatVnd(w.tax_amount)}
                        </td>
                        <td className="px-6 py-3.5 font-bold text-emerald-600 dark:text-emerald-400">
                          {formatVnd(w.amount_net)}
                        </td>
                        <td className="px-6 py-3.5 text-xs">
                          <div className="font-medium text-gray-800 dark:text-gray-200">{w.bank_name}</div>
                          <div className="text-gray-500 dark:text-gray-400 font-mono">
                            {w.bank_account_number} — {w.bank_account_name}
                          </div>
                        </td>
                        <td className="px-6 py-3.5">
                          {statusBadge}
                          {w.status === 'rejected' && w.note && (
                            <div className="text-[11px] text-red-600 dark:text-red-400 mt-1 max-w-xs">
                              {w.note}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                {t('affiliate.noWithdrawalHistory')}
              </div>
            )}
          </div>
        </div>

        {/* Biến động ví hoa hồng */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700 overflow-hidden shadow-sm">
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700">
            <h3 className="font-bold text-gray-900 dark:text-white text-base">
              {t('affiliate.ledgerHistoryTitle')}
            </h3>
          </div>
          <div className="overflow-x-auto">
            {ledgerHistory.length > 0 ? (
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">
                  <tr>
                    <th className="px-6 py-3">{t('common.date')}</th>
                    <th className="px-6 py-3">{t('affiliate.entryType')}</th>
                    <th className="px-6 py-3">{t('affiliate.amountGross')}</th>
                    <th className="px-6 py-3">{t('affiliate.note')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 text-gray-700 dark:text-gray-300">
                  {ledgerHistory.map((item) => {
                    const isPositive = item.amount > 0;
                    return (
                      <tr key={item.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-700/30">
                        <td className="px-6 py-3 text-xs text-gray-500 dark:text-gray-400">
                          {formatDateTime(item.createdAt)}
                        </td>
                        <td className="px-6 py-3 text-xs font-semibold">
                          {item.entryType === 'commission' && (
                            <span className="text-emerald-600 dark:text-emerald-400">
                              {t('affiliate.entryCommission')}
                            </span>
                          )}
                          {item.entryType === 'withdrawal' && (
                            <span className="text-amber-600 dark:text-amber-400">
                              {t('affiliate.entryWithdrawal')}
                            </span>
                          )}
                          {item.entryType === 'adjustment' && (
                            <span className="text-purple-600 dark:text-purple-400">
                              {t('affiliate.entryAdjustment')}
                            </span>
                          )}
                        </td>
                        <td className={`px-6 py-3 font-bold ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                          {isPositive ? `+${formatVnd(item.amount)}` : formatVnd(item.amount)}
                        </td>
                        <td className="px-6 py-3 text-xs text-gray-600 dark:text-gray-400">
                          {item.note || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-8 text-sm text-gray-500 dark:text-gray-400">
                {t('affiliate.noLedgerHistory')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal rút tiền */}
      <WithdrawalModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        currentBalance={currentBalance}
        onSuccess={fetchOverview}
      />
    </div>
  );
}
