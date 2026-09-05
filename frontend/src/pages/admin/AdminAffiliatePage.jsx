import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import affiliateService from '../../services/affiliate.service';

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

export default function AdminAffiliatePage() {
  const { t } = useI18n();

  const [activeTab, setActiveTab] = useState('withdrawals'); // 'withdrawals' | 'periods'

  // Tab withdrawals state
  const [withdrawals, setWithdrawals] = useState([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(false);

  // Tab periods state
  const [periods, setPeriods] = useState([]);
  const [availableMonths, setAvailableMonths] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState('');
  const [loadingPeriods, setLoadingPeriods] = useState(false);

  // Modals state
  const [selectedKycItem, setSelectedKycItem] = useState(null);
  const [approveItem, setApproveItem] = useState(null);
  const [rejectItem, setRejectItem] = useState(null);
  const [rejectReason, setRejectReason] = useState('');

  // Adjustment Modal state
  const [isAdjModalOpen, setIsAdjModalOpen] = useState(false);
  const [adjUserId, setAdjUserId] = useState('');
  const [adjAmount, setAdjAmount] = useState('');
  const [adjNote, setAdjNote] = useState('');
  const [submittingAdj, setSubmittingAdj] = useState(false);

  // Load withdrawals
  const fetchWithdrawals = useCallback(async () => {
    try {
      setLoadingWithdrawals(true);
      const res = await affiliateService.getAdminWithdrawals({
        status: statusFilter || undefined,
      });
      setWithdrawals(res.data || []);
    } catch (err) {
      console.error('Failed to load admin withdrawals:', err);
      toast.error('Không thể tải danh sách yêu cầu rút');
    } finally {
      setLoadingWithdrawals(false);
    }
  }, [statusFilter]);

  // Load available months and periods
  const fetchMonthsAndPeriods = useCallback(async () => {
    try {
      setLoadingPeriods(true);
      const monthsRes = await affiliateService.getAdminAvailableMonths();
      const months = monthsRes.data || [];
      setAvailableMonths(months);

      const monthToFetch = selectedMonth || months[0] || '';
      if (!selectedMonth && months[0]) {
        setSelectedMonth(months[0]);
      }

      const periodsRes = await affiliateService.getAdminPeriods({
        monthKey: monthToFetch || undefined,
      });
      setPeriods(periodsRes.data || []);
    } catch (err) {
      console.error('Failed to load admin periods:', err);
      toast.error('Không thể tải doanh số đối tác');
    } finally {
      setLoadingPeriods(false);
    }
  }, [selectedMonth]);

  useEffect(() => {
    if (activeTab === 'withdrawals') {
      fetchWithdrawals();
    } else {
      fetchMonthsAndPeriods();
    }
  }, [activeTab, fetchWithdrawals, fetchMonthsAndPeriods]);

  // Handle Approve
  const handleApprove = async () => {
    if (!approveItem) return;
    try {
      await affiliateService.approveWithdrawal(approveItem.id);
      toast.success(t('affiliate.statusPaid'));
      setApproveItem(null);
      fetchWithdrawals();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Có lỗi xảy ra khi duyệt';
      toast.error(msg);
    }
  };

  // Handle Reject
  const handleReject = async () => {
    if (!rejectItem) return;
    if (!rejectReason.trim()) {
      toast.error('Vui lòng nhập lý do từ chối');
      return;
    }
    try {
      await affiliateService.rejectWithdrawal(rejectItem.id, rejectReason.trim());
      toast.success(t('affiliate.statusRejected'));
      setRejectItem(null);
      setRejectReason('');
      fetchWithdrawals();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Có lỗi xảy ra khi từ chối';
      toast.error(msg);
    }
  };

  // Handle Adjustment Submit
  const handleAdjustmentSubmit = async (e) => {
    e.preventDefault();
    if (!adjUserId) {
      toast.error('Vui lòng nhập User ID');
      return;
    }
    const numAmount = Math.round(Number(adjAmount) || 0);
    if (!numAmount) {
      toast.error('Số tiền điều chỉnh phải khác 0');
      return;
    }
    if (!adjNote.trim()) {
      toast.error('Vui lòng nhập lý do điều chỉnh');
      return;
    }

    try {
      setSubmittingAdj(true);
      await affiliateService.adminLedgerAdjustment({
        userId: adjUserId,
        amount: numAmount,
        note: adjNote.trim(),
      });
      toast.success(t('affiliate.adjSuccess'));
      setIsAdjModalOpen(false);
      setAdjUserId('');
      setAdjAmount('');
      setAdjNote('');
      if (activeTab === 'withdrawals') fetchWithdrawals();
    } catch (err) {
      const msg = err?.response?.data?.message || err?.message || 'Lỗi khi điều chỉnh số dư';
      toast.error(msg);
    } finally {
      setSubmittingAdj(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Header & Quick Action */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">
            {t('affiliate.adminTitle')}
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('affiliate.adminSubtitle')}
          </p>
        </div>

        {/* Nút mở modal điều chỉnh số dư */}
        <button
          type="button"
          onClick={() => setIsAdjModalOpen(true)}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold text-sm shadow-md shadow-purple-500/20 flex items-center gap-2 self-start sm:self-auto transition-all"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          {t('affiliate.actionAdjustment')}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab('withdrawals')}
          className={`px-4 py-3 font-semibold text-sm border-b-2 transition-colors ${
            activeTab === 'withdrawals'
              ? 'border-orange-500 text-orange-600 dark:text-orange-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {t('affiliate.tabWithdrawals')}
        </button>
        <button
          onClick={() => setActiveTab('periods')}
          className={`px-4 py-3 font-semibold text-sm border-b-2 transition-colors ${
            activeTab === 'periods'
              ? 'border-orange-500 text-orange-600 dark:text-orange-400'
              : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
          }`}
        >
          {t('affiliate.tabPeriods')}
        </button>
      </div>

      {/* TAB 1: YÊU CẦU RÚT TIỀN */}
      {activeTab === 'withdrawals' && (
        <div className="space-y-4">
          {/* Filter status */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t('common.status')}:
            </span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200"
            >
              <option value="">{t('affiliate.filterStatusAll')}</option>
              <option value="pending">{t('affiliate.statusPending')}</option>
              <option value="paid">{t('affiliate.statusPaid')}</option>
              <option value="rejected">{t('affiliate.statusRejected')}</option>
            </select>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              {loadingWithdrawals ? (
                <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
                  {t('common.loading')}
                </div>
              ) : withdrawals.length > 0 ? (
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">
                    <tr>
                      <th className="px-4 py-3">ID</th>
                      <th className="px-4 py-3">{t('affiliate.partnerName')}</th>
                      <th className="px-4 py-3">{t('affiliate.amountGross')}</th>
                      <th className="px-4 py-3">{t('affiliate.taxAmount')}</th>
                      <th className="px-4 py-3">{t('affiliate.amountNet')}</th>
                      <th className="px-4 py-3">{t('affiliate.bankInfo')}</th>
                      <th className="px-4 py-3">{t('common.status')}</th>
                      <th className="px-4 py-3">{t('affiliate.requestedAt')}</th>
                      <th className="px-4 py-3 text-right">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 text-gray-700 dark:text-gray-300">
                    {withdrawals.map((w) => {
                      let statusBadge;
                      if (w.status === 'pending') {
                        statusBadge = (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                            {t('affiliate.statusPending')}
                          </span>
                        );
                      } else if (w.status === 'paid') {
                        statusBadge = (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                            {t('affiliate.statusPaid')}
                          </span>
                        );
                      } else {
                        statusBadge = (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300">
                            {t('affiliate.statusRejected')}
                          </span>
                        );
                      }

                      return (
                        <tr key={w.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-700/30">
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">#{w.id}</td>
                          <td className="px-4 py-3">
                            <div className="font-bold text-gray-900 dark:text-white">{w.full_name}</div>
                            <div className="text-xs text-gray-500">{w.user_email}</div>
                            <div className="text-[11px] text-gray-400">UID: {w.user_id}</div>
                          </td>
                          <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">
                            {formatVnd(w.amount_gross)}
                          </td>
                          <td className="px-4 py-3 text-red-600 dark:text-red-400 text-xs">
                            {formatVnd(w.tax_amount)}
                          </td>
                          <td className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400">
                            {formatVnd(w.amount_net)}
                          </td>
                          <td className="px-4 py-3 text-xs">
                            <div className="font-medium text-gray-800 dark:text-gray-200">{w.bank_name}</div>
                            <div className="font-mono text-gray-500 dark:text-gray-400">
                              {w.bank_account_number}
                            </div>
                            <div className="text-[11px] text-gray-400 uppercase">
                              {w.bank_account_name}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {statusBadge}
                            {w.status === 'rejected' && w.note && (
                              <div className="text-[11px] text-red-600 dark:text-red-400 mt-1 max-w-xs">
                                {w.note}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {formatDate(w.requested_at)}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Xem KYC */}
                              <button
                                onClick={() => setSelectedKycItem(w)}
                                className="px-2.5 py-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-xs font-medium text-gray-700 dark:text-gray-200 transition-colors"
                              >
                                {t('affiliate.actionViewKyc')}
                              </button>

                              {/* Hành động duyệt / từ chối khi pending */}
                              {w.status === 'pending' && (
                                <>
                                  <button
                                    onClick={() => setApproveItem(w)}
                                    className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-xs font-semibold text-white transition-colors"
                                  >
                                    {t('affiliate.actionApprove')}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setRejectItem(w);
                                      setRejectReason('');
                                    }}
                                    className="px-2.5 py-1 rounded bg-red-600 hover:bg-red-700 text-xs font-semibold text-white transition-colors"
                                  >
                                    {t('affiliate.actionReject')}
                                  </button>
                                </>
                              )}

                              {/* Nút nhanh điều chỉnh số dư đối tác này */}
                              <button
                                onClick={() => {
                                  setAdjUserId(String(w.user_id));
                                  setIsAdjModalOpen(true);
                                }}
                                title="Ghi bút toán điều chỉnh cho user này"
                                className="p-1 rounded text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/40"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
                  {t('affiliate.noWithdrawalHistory')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DOANH SỐ ĐỐI TÁC THEO THÁNG */}
      {activeTab === 'periods' && (
        <div className="space-y-4">
          {/* Dropdown chọn tháng */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              {t('affiliate.filterMonth')}:
            </span>
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-semibold text-gray-800 dark:text-gray-200"
            >
              <option value="">{t('affiliate.allMonths')}</option>
              {availableMonths.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200/80 dark:border-gray-700 overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              {loadingPeriods ? (
                <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
                  {t('common.loading')}
                </div>
              ) : periods.length > 0 ? (
                <table className="w-full text-left text-xs sm:text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900/50 text-xs text-gray-500 dark:text-gray-400 uppercase font-semibold">
                    <tr>
                      <th className="px-4 py-3">{t('affiliate.month')}</th>
                      <th className="px-4 py-3">{t('affiliate.partnerName')}</th>
                      <th className="px-4 py-3">{t('affiliate.grossRevenue')}</th>
                      <th className="px-4 py-3">{t('affiliate.currentTier')}</th>
                      <th className="px-4 py-3">{t('affiliate.commissionRate')}</th>
                      <th className="px-4 py-3">{t('affiliate.estimatedCommission')}</th>
                      <th className="px-4 py-3">{t('affiliate.closedAt')}</th>
                      <th className="px-4 py-3 text-right">{t('common.actions')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 text-gray-700 dark:text-gray-300">
                    {periods.map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-700/30">
                        <td className="px-4 py-3 font-bold text-gray-900 dark:text-white">
                          {p.monthKey}
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-bold text-gray-900 dark:text-white">
                            {p.userFullName || '—'}
                          </div>
                          <div className="text-xs text-gray-500">{p.userEmail}</div>
                          <div className="text-[11px] text-gray-400">
                            UID: {p.referrerUserId} {p.referralCode ? `• Ref: ${p.referralCode}` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-semibold text-gray-900 dark:text-white">
                          {formatVnd(p.grossRevenue)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300">
                            {t('affiliate.tierLevel', { level: p.tierLevel })}
                          </span>
                        </td>
                        <td className="px-4 py-3">{p.ratePercent}%</td>
                        <td className="px-4 py-3 font-bold text-emerald-600 dark:text-emerald-400">
                          {formatVnd(p.commissionAmount)}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500">
                          {formatDateTime(p.closedAt)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            onClick={() => {
                              setAdjUserId(String(p.referrerUserId));
                              setIsAdjModalOpen(true);
                            }}
                            className="px-2.5 py-1 rounded bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-300 hover:bg-purple-100 text-xs font-semibold"
                          >
                            {t('affiliate.actionAdjustment')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="text-center py-12 text-sm text-gray-500 dark:text-gray-400">
                  {t('affiliate.noMonthlyHistory')}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL 1: XEM CHI TIẾT KYC (CCCD GIẢI MÃ) */}
      {selectedKycItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-gray-50 dark:bg-gray-800/60">
              <h3 className="font-bold text-gray-900 dark:text-white">
                {t('affiliate.modalKycTitle')} (#{selectedKycItem.id})
              </h3>
              <button
                onClick={() => setSelectedKycItem(null)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                ✕
              </button>
            </div>
            <div className="p-6 space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-gray-500">{t('affiliate.fullNameLabel')}</span>
                  <div className="font-semibold text-gray-900 dark:text-white">
                    {selectedKycItem.full_name}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-gray-500">Email</span>
                  <div className="font-semibold text-gray-900 dark:text-white">
                    {selectedKycItem.user_email || '—'}
                  </div>
                </div>
              </div>

              <div className="p-3.5 bg-blue-50/50 dark:bg-blue-950/20 rounded-xl border border-blue-100 dark:border-blue-900/50 space-y-2">
                <div>
                  <span className="text-xs font-bold text-blue-900 dark:text-blue-300">
                    {t('affiliate.kycIdNumber')}
                  </span>
                  <div className="text-base font-mono font-bold text-blue-900 dark:text-blue-200">
                    {selectedKycItem.id_card_number || '—'}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500">{t('affiliate.kycIssuedDate')}:</span>{' '}
                    <span className="font-medium text-gray-800 dark:text-gray-200">
                      {formatDate(selectedKycItem.id_card_issued_date)}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500">MST:</span>{' '}
                    <span className="font-medium text-gray-800 dark:text-gray-200">
                      {selectedKycItem.tax_code || '—'}
                    </span>
                  </div>
                </div>
                <div className="text-xs">
                  <span className="text-gray-500">{t('affiliate.kycIssuedPlace')}:</span>{' '}
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {selectedKycItem.id_card_issued_place || '—'}
                  </span>
                </div>
              </div>

              <div className="p-3.5 bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 space-y-1 text-xs">
                <div className="font-bold text-gray-700 dark:text-gray-300 uppercase">
                  {t('affiliate.bankTitle')}
                </div>
                <div>{t('affiliate.kycBank')}: <strong className="text-gray-900 dark:text-white">{selectedKycItem.bank_name}</strong></div>
                <div>{t('affiliate.kycAccountNumber')}: <strong className="font-mono text-gray-900 dark:text-white">{selectedKycItem.bank_account_number}</strong></div>
                <div>{t('affiliate.kycAccountName')}: <strong className="text-gray-900 dark:text-white uppercase">{selectedKycItem.bank_account_name}</strong></div>
              </div>

              <p className="text-[11px] text-gray-500 dark:text-gray-400 italic">
                {t('affiliate.kycNotice')}
              </p>
            </div>
            <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/60 border-t border-gray-100 dark:border-gray-800 flex justify-end">
              <button
                onClick={() => setSelectedKycItem(null)}
                className="px-4 py-1.5 rounded-lg bg-gray-200 dark:bg-gray-700 text-gray-800 dark:text-gray-200 font-medium text-xs"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: XÁC NHẬN ĐÃ CHUYỂN KHOẢN */}
      {approveItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full border border-gray-200 dark:border-gray-800 shadow-2xl p-6 space-y-4">
            <h3 className="font-bold text-base text-gray-900 dark:text-white">
              {t('affiliate.modalApproveTitle', { id: approveItem.id })}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-300">
              {t('affiliate.confirmApproveDesc', {
                amount: formatVnd(approveItem.amount_net),
                name: approveItem.full_name,
                bank: approveItem.bank_name,
                account: approveItem.bank_account_number,
              })}
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setApproveItem(null)}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleApprove}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold shadow-md shadow-emerald-600/20"
              >
                {t('affiliate.confirmApproveBtn')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: TỪ CHỐI YÊU CẦU RÚT (BẮT BUỘC NHẬP LÝ DO) */}
      {rejectItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-md w-full border border-gray-200 dark:border-gray-800 shadow-2xl p-6 space-y-4">
            <h3 className="font-bold text-base text-gray-900 dark:text-white text-red-600 dark:text-red-400">
              {t('affiliate.modalRejectTitle', { id: rejectItem.id })}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Khoản tiền <strong>{formatVnd(rejectItem.amount_gross)}</strong> sẽ được hoàn lại số dư ví đối tác.
            </p>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                {t('affiliate.rejectReasonLabel')} <span className="text-red-500">*</span>
              </label>
              <textarea
                rows="3"
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder={t('affiliate.rejectReasonPlaceholder')}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
              />
            </div>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setRejectItem(null)}
                className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={handleReject}
                className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold shadow-md shadow-red-600/20"
              >
                {t('affiliate.confirmReject')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 🔴 MODAL 4: ĐIỀU CHỈNH SỐ DƯ VÍ (LEDGER ADJUSTMENT) */}
      {isAdjModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-900 rounded-2xl max-w-lg w-full border border-gray-200 dark:border-gray-800 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex justify-between items-center bg-purple-50 dark:bg-purple-950/40">
              <h3 className="font-bold text-gray-900 dark:text-white text-base">
                {t('affiliate.modalAdjustmentTitle')}
              </h3>
              <button
                onClick={() => setIsAdjModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAdjustmentSubmit} className="p-6 space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('affiliate.adjUserIdLabel')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  placeholder="Ví dụ: 12"
                  value={adjUserId}
                  onChange={(e) => setAdjUserId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('affiliate.adjAmountLabel')} <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="1000"
                  required
                  placeholder="ÂM để thu hồi (-500000), DƯƠNG để bù (300000)"
                  value={adjAmount}
                  onChange={(e) => setAdjAmount(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white font-bold"
                />
                <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  {t('affiliate.adjAmountHint')}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  {t('affiliate.adjNoteLabel')} <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows="3"
                  required
                  value={adjNote}
                  onChange={(e) => setAdjNote(e.target.value)}
                  placeholder={t('affiliate.adjNotePlaceholder')}
                  className="w-full px-3.5 py-2 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAdjModalOpen(false)}
                  disabled={submittingAdj}
                  className="px-4 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-medium text-gray-700 dark:text-gray-300"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={submittingAdj}
                  className="px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-sm shadow-md shadow-purple-600/20 disabled:opacity-50"
                >
                  {submittingAdj ? t('common.processing') : t('affiliate.submitAdjustment')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
