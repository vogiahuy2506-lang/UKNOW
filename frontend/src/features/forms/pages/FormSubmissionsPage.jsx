import { useEffect, useState, useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlineInbox,
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineUser,
  HiOutlineMail,
  HiOutlinePhone,
  HiOutlineX,
  HiOutlinePhotograph,
  HiOutlineClipboardList,
} from 'react-icons/hi';
import PageContainer from '../../../components/common/PageContainer';
import { useI18n } from '../../../i18n';
import {
  fetchFormById,
  fetchFormSubmissions,
  cancelSubmission,
  confirmPayment,
  fetchSubmissionReceiptBlob,
} from '../services/formAdminApi.service';
import { formatAppointmentAtVn, vnToday } from '../utils/bookingFormat.util';
import { isDisplayFieldType } from '../utils/formFieldTypes.util';
import { formatAnswerForDisplay, isDisplayBlockAnswer } from '../utils/formAnswerDisplay.util';
import { formatVnd } from '../../../utils/vietqrParser';

// PR-3b: pending_payment nhận thêm — chủ có thể huỷ một lượt còn đang chờ chuyển khoản (nhả
// chỗ ngay, không cần đợi hold_expires_at trôi qua) — khớp backend cancelSubmission fromStatuses.
const CANCELLABLE_STATUSES = new Set(['submitted', 'confirmed', 'pending_payment']);

/**
 * Trạng thái HIỂN THỊ của một bài nộp — "hết hạn giữ chỗ" không phải trạng thái lưu trong DB
 * (tính lúc đọc, giống backend §4.3) — pending_payment mà hold_expires_at đã qua thì hiện khác
 * với pending_payment còn hạn, dù cột `status` trong DB vẫn là 'pending_payment'.
 *
 * @param {{ status: string, holdExpiresAt: string|null }} sub
 * @returns {'submitted'|'confirmed'|'cancelled'|'pending_payment'|'hold_expired'}
 */
function getDisplayStatus(sub) {
  if (sub.status === 'pending_payment' && sub.holdExpiresAt && new Date(sub.holdExpiresAt).getTime() <= Date.now()) {
    return 'hold_expired';
  }
  return sub.status || 'submitted';
}

function formatReportedPaidAt(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(d).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, {});
  return `${parts.hour}:${parts.minute} ${parts.day}/${parts.month}`;
}

export default function FormSubmissionsPage() {
  const { t, locale } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();

  const [form, setForm] = useState(null);
  const [submissions, setSubmissions] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [cancelTargetId, setCancelTargetId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [confirmPaymentTargetId, setConfirmPaymentTargetId] = useState(null);
  const [confirmingPaymentId, setConfirmingPaymentId] = useState(null);
  const [viewingReceiptSub, setViewingReceiptSub] = useState(null);
  const [receiptBlobUrl, setReceiptBlobUrl] = useState(null);
  const [isLoadingReceipt, setIsLoadingReceipt] = useState(false);
  const [receiptError, setReceiptError] = useState('');

  useEffect(() => {
    return () => {
      if (receiptBlobUrl) {
        URL.revokeObjectURL(receiptBlobUrl);
      }
    };
  }, [receiptBlobUrl]);

  const handleOpenReceipt = async (sub) => {
    setViewingReceiptSub(sub);
    setReceiptError('');
    setIsLoadingReceipt(true);
    if (receiptBlobUrl) {
      URL.revokeObjectURL(receiptBlobUrl);
      setReceiptBlobUrl(null);
    }
    try {
      const blob = await fetchSubmissionReceiptBlob(id, sub.id);
      const url = URL.createObjectURL(blob);
      setReceiptBlobUrl(url);
    } catch {
      setReceiptError(t('forms.submissionsPage.receiptLoadError'));
    } finally {
      setIsLoadingReceipt(false);
    }
  };

  const handleCloseReceipt = () => {
    setViewingReceiptSub(null);
    if (receiptBlobUrl) {
      URL.revokeObjectURL(receiptBlobUrl);
      setReceiptBlobUrl(null);
    }
    setReceiptError('');
  };

  // API chủ form (GET /api/forms/:id) trả khoá `bookingConfig` (form.repository.js
  // findFormByIdAndOwner), KHÔNG PHẢI `booking` — khoá đó chỉ có ở API công khai
  // (getPublicForm, form.service.js). Vẫn hiện cụm UI đặt lịch khi form từng bật rồi tắt
  // nhưng còn bài nộp mang appointmentAt (huỷ lịch cũ vẫn phải làm được).
  const showBookingColumns = useMemo(
    () => Boolean(form?.bookingConfig?.enabled) || submissions.some((s) => Boolean(s.appointmentAt)),
    [form?.bookingConfig?.enabled, submissions]
  );
  // Cùng logic — form từng bật thu tiền rồi tắt vẫn còn bài nộp mang paymentCode, phải hiện cột.
  const showPaymentColumns = useMemo(
    () => Boolean(form?.paymentConfig?.enabled) || submissions.some((s) => Boolean(s.paymentCode)),
    [form?.paymentConfig?.enabled, submissions]
  );
  const showStatusColumn = showBookingColumns || showPaymentColumns;
  const showActionsColumn = showBookingColumns || showPaymentColumns;
  // PR-7a mục 7 — chỉ hiện cột "Nguồn" khi có ÍT NHẤT MỘT bài nộp mang slug landing hoặc utm_source
  // (form không nhúng vào landing nào / khách vào thẳng link thì mọi bài đều rỗng, ẩn hẳn cột).
  const showSourceColumn = useMemo(
    () => submissions.some((s) => Boolean(s.landingPageSlug) || Boolean(s.utmSource)),
    [submissions]
  );

  const formKeyOrderMap = useMemo(() => {
    const map = new Map();
    if (Array.isArray(form?.fields)) {
      form.fields.forEach((f, idx) => {
        if (f.key) map.set(f.key, idx);
      });
    }
    return map;
  }, [form?.fields]);

  // key → loại trường hiện tại (để bỏ khối hiển thị và định dạng rating / yes_no khi ảnh chụp thiếu `type`).
  const formTypeByKey = useMemo(() => {
    const map = new Map();
    if (Array.isArray(form?.fields)) {
      form.fields.forEach((f) => {
        if (f.key && f.type) map.set(f.key, f.type);
      });
    }
    return map;
  }, [form?.fields]);

  const loadData = useCallback(
    async (targetPage = 1) => {
      setIsLoading(true);
      setError('');
      try {
        const [formData, subsData] = await Promise.all([
          fetchFormById(id),
          fetchFormSubmissions(id, { page: targetPage, pageSize: 20, date: dateFilter || undefined }),
        ]);
        setForm(formData);
        setSubmissions(Array.isArray(subsData.submissions) ? subsData.submissions : []);
        setPagination({
          page: Number(subsData.page) || targetPage,
          pageSize: Number(subsData.pageSize) || 20,
          total: Number(subsData.total) || 0,
          totalPages: Number(subsData.totalPages) || 1,
        });
      } catch (err) {
        setError(err.response?.data?.message || t('forms.submissionsPage.loadError'));
      } finally {
        setIsLoading(false);
      }
    },
    [id, t, dateFilter]
  );

  useEffect(() => {
    loadData(1);
  }, [loadData]);

  const handlePageChange = (newPage) => {
    if (newPage < 1 || newPage > pagination.totalPages || newPage === pagination.page) return;
    loadData(newPage);
  };

  const handleSetTodayFilter = () => setDateFilter(vnToday());
  const handleClearFilter = () => setDateFilter('');

  const handleRequestCancel = (submissionId) => setCancelTargetId(submissionId);
  const handleAbortCancel = () => setCancelTargetId(null);

  const handleConfirmCancel = async (submissionId) => {
    setCancellingId(submissionId);
    try {
      const updated = await cancelSubmission(id, submissionId);
      setSubmissions((prev) =>
        prev.map((s) => (s.id === submissionId ? { ...s, status: updated?.status || 'cancelled' } : s))
      );
      toast.success(t('forms.submissionsPage.cancelSuccess'));
      setCancelTargetId(null);
    } catch (err) {
      toast.error(err.response?.data?.message || t('forms.submissionsPage.cancelError'));
      setCancelTargetId(null);
      loadData(pagination.page);
    } finally {
      setCancellingId(null);
    }
  };

  const handleRequestConfirmPayment = (submissionId) => setConfirmPaymentTargetId(submissionId);
  const handleAbortConfirmPayment = () => setConfirmPaymentTargetId(null);

  const handleConfirmPaymentReceived = async (submissionId) => {
    setConfirmingPaymentId(submissionId);
    try {
      const updated = await confirmPayment(id, submissionId);
      setSubmissions((prev) =>
        prev.map((s) =>
          s.id === submissionId
            ? { ...s, status: updated?.status || 'confirmed', paidConfirmedAt: updated?.paidConfirmedAt || new Date().toISOString() }
            : s
        )
      );
      toast.success(t('forms.submissionsPage.confirmPaymentSuccess'));
      setConfirmPaymentTargetId(null);
    } catch (err) {
      const code = err.response?.data?.code;
      const msg =
        code === 'FORM_SLOT_TAKEN'
          ? t('forms.submissionsPage.confirmPaymentSlotTaken')
          : code === 'SUBMISSION_NOT_PENDING_PAYMENT'
            ? t('forms.submissionsPage.confirmPaymentNotPending')
            : err.response?.data?.message || t('forms.submissionsPage.confirmPaymentError');
      toast.error(msg);
      setConfirmPaymentTargetId(null);
      loadData(pagination.page);
    } finally {
      setConfirmingPaymentId(null);
    }
  };

  return (
    <PageContainer
      icon={HiOutlineClipboardList}
      title={t('forms.submissionsPage.title', { title: form?.title || '...' })}
      subtitle={t('forms.submissionsPage.subtitle')}
      onBack={() => navigate('/app/forms')}
      backLabel={t('forms.submissionsPage.backToForms')}
      actions={
        form && (
          <button
            onClick={() => navigate(`/app/forms/${form.id}/edit`)}
            className="btn btn-secondary text-xs"
          >
            {t('forms.submissionsPage.editFormConfig')}
          </button>
        )
      }
    >

      {showBookingColumns && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label htmlFor="date-filter" className="text-xs font-medium text-gray-600 dark:text-dk-text2">
            {t('forms.submissionsPage.dateFilterLabel')}
          </label>
          <input
            id="date-filter"
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-dk-border bg-white dark:bg-dk-inset text-gray-900 dark:text-dk-text text-xs focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
          <button
            type="button"
            onClick={handleSetTodayFilter}
            className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-dk-border bg-white dark:bg-dk-raised text-xs text-gray-600 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-surface"
          >
            {t('forms.submissionsPage.today')}
          </button>
          {dateFilter && (
            <button
              type="button"
              onClick={handleClearFilter}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-dk-border bg-white dark:bg-dk-raised text-xs text-gray-600 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-surface"
            >
              <HiOutlineX className="w-3.5 h-3.5" />
              {t('forms.submissionsPage.clearFilter')}
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 text-sm">
          {error}
        </div>
      )}

      {isLoading ? (
        <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm border border-gray-100 dark:border-dk-border p-12 text-center text-gray-500 dark:text-dk-text2">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 dark:border-dk-border border-t-primary-600 mb-3" />
          <p className="text-sm">{t('forms.submissionsPage.loading')}</p>
        </div>
      ) : submissions.length === 0 ? (
        <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm border border-gray-100 dark:border-dk-border p-12 text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-50 dark:bg-dk-raised text-gray-400 dark:text-dk-muted flex items-center justify-center">
            <HiOutlineInbox className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-dk-text mb-1">
            {t('forms.submissionsPage.empty')}
          </h3>
          <p className="text-sm text-gray-500 dark:text-dk-text2 max-w-sm mx-auto">
            {t('forms.submissionsPage.emptyDescription')}
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-dk-surface rounded-2xl shadow-sm border border-gray-100 dark:border-dk-border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-700 dark:text-dk-text">
              <thead className="bg-gray-50/75 dark:bg-dk-raised/50 border-b border-gray-100 dark:border-dk-border text-xs font-semibold text-gray-600 dark:text-dk-text2 uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-4 sm:px-6 w-44">
                    {t('forms.submissionsPage.colSubmittedAt')}
                  </th>
                  <th className="py-3.5 px-4 sm:px-6 w-60">
                    {t('forms.submissionsPage.colRespondent')}
                  </th>
                  {showBookingColumns && (
                    <th className="py-3.5 px-4 sm:px-6 w-44">
                      {t('forms.submissionsPage.colAppointment')}
                    </th>
                  )}
                  {showPaymentColumns && (
                    <th className="py-3.5 px-4 sm:px-6 w-40">
                      {t('forms.submissionsPage.colPayment')}
                    </th>
                  )}
                  {showStatusColumn && (
                    <th className="py-3.5 px-4 sm:px-6 w-32">
                      {t('forms.submissionsPage.colStatus')}
                    </th>
                  )}
                  {showSourceColumn && (
                    <th className="py-3.5 px-4 sm:px-6 w-40">
                      {t('forms.submissionsPage.colSource')}
                    </th>
                  )}
                  <th className="py-3.5 px-4 sm:px-6 w-36 text-center">
                    {t('forms.submissionsPage.colConsent')}
                  </th>
                  <th className="py-3.5 px-4 sm:px-6">
                    {t('forms.submissionsPage.colAnswers')}
                  </th>
                  {showActionsColumn && (
                    <th className="py-3.5 px-4 sm:px-6 w-40">
                      {t('forms.submissionsPage.colActions')}
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-dk-border">
                {submissions.map((sub) => {
                  const answersObj = sub.answers || {};
                  // PR-4: khối hiển thị (tiêu đề / đoạn chữ / ngắt trang) không có câu trả lời — không hiện thành dòng "nhãn: —".
                  const answerEntries = Object.entries(answersObj)
                    .filter(([key, item]) => !isDisplayBlockAnswer(item) && !isDisplayFieldType(formTypeByKey.get(key)))
                    .sort(([keyA], [keyB]) => {
                    const orderA = formKeyOrderMap.has(keyA) ? formKeyOrderMap.get(keyA) : Number.MAX_SAFE_INTEGER;
                    const orderB = formKeyOrderMap.has(keyB) ? formKeyOrderMap.get(keyB) : Number.MAX_SAFE_INTEGER;
                    if (orderA !== orderB) return orderA - orderB;
                    return keyA.localeCompare(keyB);
                  });

                  return (
                    <tr key={sub.id} className="hover:bg-gray-50/50 dark:hover:bg-dk-raised/40 transition-colors align-top">
                      {/* Thời gian nộp */}
                      <td className="py-4 px-4 sm:px-6 text-xs text-gray-500 dark:text-dk-text2 whitespace-nowrap">
                        {sub.createdAt
                          ? new Date(sub.createdAt).toLocaleString('vi-VN')
                          : '—'}
                      </td>

                      {/* Người nộp */}
                      <td className="py-4 px-4 sm:px-6">
                        <div className="space-y-1">
                          <div className="font-medium text-gray-900 dark:text-dk-text flex items-center gap-1.5">
                            <HiOutlineUser className="w-3.5 h-3.5 text-gray-400 dark:text-dk-muted flex-shrink-0" />
                            <span>{sub.respondentName || t('forms.submissionsPage.notProvided')}</span>
                          </div>
                          {sub.respondentEmail && (
                            <div className="text-xs text-gray-500 dark:text-dk-text2 flex items-center gap-1.5 break-all">
                              <HiOutlineMail className="w-3.5 h-3.5 text-gray-400 dark:text-dk-muted flex-shrink-0" />
                              <span>{sub.respondentEmail}</span>
                            </div>
                          )}
                          {sub.respondentPhone && (
                            <div className="text-xs text-gray-500 dark:text-dk-text2 flex items-center gap-1.5">
                              <HiOutlinePhone className="w-3.5 h-3.5 text-gray-400 dark:text-dk-muted flex-shrink-0" />
                              <span>{sub.respondentPhone}</span>
                            </div>
                          )}
                        </div>
                      </td>

                      {showBookingColumns && (
                        /* Giờ hẹn — LUÔN theo giờ Việt Nam, không phụ thuộc múi giờ trình duyệt */
                        <td className="py-4 px-4 sm:px-6 text-xs text-gray-600 dark:text-dk-text whitespace-nowrap">
                          {sub.appointmentAt ? formatAppointmentAtVn(sub.appointmentAt, locale) : '—'}
                        </td>
                      )}

                      {showPaymentColumns && (
                        /* Mã nội dung chuyển khoản + số tiền — để chủ đối chiếu sao kê */
                        <td className="py-4 px-4 sm:px-6 text-xs whitespace-nowrap">
                          {sub.paymentCode ? (
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono font-semibold text-gray-800 dark:text-dk-text">{sub.paymentCode}</span>
                                {sub.status === 'pending_payment' && sub.payerReportedPaidAt && (
                                  <span
                                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800"
                                    data-testid="badge-payer-reported"
                                  >
                                    {t('forms.submissionsPage.payerReportedPaidBadge', {
                                      time: formatReportedPaidAt(sub.payerReportedPaidAt),
                                    })}
                                  </span>
                                )}
                              </div>
                              <div className="text-gray-500 dark:text-dk-text2">{formatVnd(sub.paymentAmount)}</div>

                              {/* PR-5: Nút xem ảnh chuyển khoản hoặc huy hiệu miễn gửi ảnh */}
                              {sub.paymentReceiptKey && (
                                <div>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReceipt(sub)}
                                    data-testid={`btn-view-receipt-${sub.id}`}
                                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 bg-primary-50 dark:bg-primary-950/30 hover:bg-primary-100 dark:hover:bg-primary-900/40 border border-primary-200 dark:border-primary-800 px-2 py-0.5 rounded transition-colors"
                                  >
                                    <HiOutlinePhotograph className="w-3.5 h-3.5" />
                                    <span>{t('forms.submissionsPage.viewReceiptBtn')}</span>
                                  </button>
                                </div>
                              )}
                              {sub.paymentReceiptWaivedReason && (
                                <div>
                                  <span
                                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50"
                                    data-testid={`badge-receipt-waived-${sub.id}`}
                                  >
                                    {t('forms.submissionsPage.receiptWaivedBadge')}
                                  </span>
                                </div>
                              )}
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}

                      {showStatusColumn && (() => {
                        const displayStatus = getDisplayStatus(sub);
                        const statusClass =
                          displayStatus === 'cancelled'
                            ? 'bg-gray-100 dark:bg-dk-raised text-gray-600 dark:text-dk-text border-gray-200 dark:border-dk-border'
                            : displayStatus === 'confirmed'
                              ? 'bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border-green-200 dark:border-green-900/50'
                              : displayStatus === 'pending_payment'
                                ? 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-900/50'
                                : displayStatus === 'hold_expired'
                                  ? 'bg-red-50 dark:bg-red-950/30 text-red-600 dark:text-red-400 border-red-200 dark:border-red-900/50'
                                  : 'bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-900/50';
                        return (
                          <td className="py-4 px-4 sm:px-6">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusClass}`}>
                              {t(`forms.submissionsPage.status.${displayStatus}`)}
                            </span>
                          </td>
                        );
                      })()}

                      {showSourceColumn && (
                        /* Nguồn: slug landing + utm_source/utm_campaign — chỉ để thống kê, không
                           phải điều kiện nghiệp vụ (PR-7a mục 7). */
                        <td className="py-4 px-4 sm:px-6 text-xs whitespace-nowrap">
                          {sub.landingPageSlug || sub.utmSource || sub.utmCampaign ? (
                            <div className="space-y-0.5">
                              {sub.landingPageSlug && (
                                <div className="font-mono text-gray-700 dark:text-dk-text">{sub.landingPageSlug}</div>
                              )}
                              {(sub.utmSource || sub.utmCampaign) && (
                                <div className="text-gray-500 dark:text-dk-text2">
                                  {[sub.utmSource, sub.utmCampaign].filter(Boolean).join(' · ')}
                                </div>
                              )}
                            </div>
                          ) : (
                            '—'
                          )}
                        </td>
                      )}

                      {/* Đồng ý tiếp thị — rút lại (PR-7b) xét TRƯỚC true/false: sau khi rút,
                          marketingConsent tự về false nhưng phải hiện rõ "Đã rút", không lẫn với
                          "Không" (chưa từng đồng ý) hay "Chưa tích" hồi trước khi rút. */}
                      <td className="py-4 px-4 sm:px-6 text-center">
                        {sub.consentWithdrawnAt ? (
                          <span
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-900/50"
                            title={new Date(sub.consentWithdrawnAt).toLocaleString('vi-VN')}
                          >
                            {t('forms.submissionsPage.consentWithdrawn', {
                              date: new Date(sub.consentWithdrawnAt).toLocaleDateString('vi-VN'),
                            })}
                          </span>
                        ) : sub.marketingConsent === true ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 border border-green-200 dark:border-green-900/50">
                            {t('forms.submissionsPage.consentYes')}
                          </span>
                        ) : sub.marketingConsent === false ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-dk-raised text-gray-600 dark:text-dk-text border border-gray-200 dark:border-dk-border">
                            {t('forms.submissionsPage.consentNo')}
                          </span>
                        ) : (
                          <span className="text-gray-400 dark:text-dk-muted font-medium">
                            {t('forms.submissionsPage.consentNone')}
                          </span>
                        )}
                      </td>

                      {/* Chi tiết câu trả lời theo snapshot label */}
                      <td className="py-4 px-4 sm:px-6">
                        <div className="space-y-1.5 max-w-xl">
                          {answerEntries.length === 0 ? (
                            <span className="text-xs text-gray-400 dark:text-dk-muted italic">{t('forms.submissionsPage.noAnswers')}</span>
                          ) : (
                            answerEntries.map(([fKey, item]) => {
                              // Snapshot dạng { label, type, value }
                              const label =
                                typeof item === 'object' && item !== null && 'label' in item
                                  ? item.label
                                  : fKey;
                              const value =
                                typeof item === 'object' && item !== null && 'value' in item
                                  ? item.value
                                  : item;

                              // rating → "4/5 ★", yes_no → Có / Không; loại khác hiện như cũ.
                              const answerType =
                                typeof item === 'object' && item !== null && typeof item.type === 'string'
                                  ? item.type
                                  : formTypeByKey.get(fKey);
                              const displayVal = formatAnswerForDisplay(answerType, value, t);

                              return (
                                <div key={fKey} className="text-xs leading-relaxed break-words">
                                  <span className="font-semibold text-gray-700 dark:text-dk-text">{label}: </span>
                                  <span className="text-gray-600 dark:text-dk-text">{displayVal || '—'}</span>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </td>

                      {showActionsColumn && (
                        <td className="py-4 px-4 sm:px-6">
                          {confirmPaymentTargetId === sub.id ? (
                            <div className="space-y-1.5">
                              <p className="text-xs text-gray-600 dark:text-dk-text">
                                {t('forms.submissionsPage.confirmPaymentConfirmDesc', {
                                  code: sub.paymentCode,
                                  amount: formatVnd(sub.paymentAmount),
                                })}
                              </p>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleConfirmPaymentReceived(sub.id)}
                                  disabled={confirmingPaymentId === sub.id}
                                  className="px-2.5 py-1 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium disabled:opacity-50"
                                >
                                  {confirmingPaymentId === sub.id
                                    ? t('forms.submissionsPage.confirmPaymentProcessing')
                                    : t('forms.submissionsPage.confirmPaymentConfirmYes')}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleAbortConfirmPayment}
                                  disabled={confirmingPaymentId === sub.id}
                                  className="px-2.5 py-1 rounded-lg border border-gray-300 dark:border-dk-border bg-white dark:bg-dk-raised text-gray-600 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-surface text-xs font-medium"
                                >
                                  {t('forms.submissionsPage.cancelConfirmNo')}
                                </button>
                              </div>
                            </div>
                          ) : cancelTargetId === sub.id ? (
                            <div className="space-y-1.5">
                              <p className="text-xs text-gray-600 dark:text-dk-text">
                                {t('forms.submissionsPage.cancelConfirmDesc')}
                              </p>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleConfirmCancel(sub.id)}
                                  disabled={cancellingId === sub.id}
                                  className="px-2.5 py-1 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium disabled:opacity-50"
                                >
                                  {cancellingId === sub.id
                                    ? t('forms.submissionsPage.cancelling')
                                    : t('forms.submissionsPage.cancelConfirmYes')}
                                </button>
                                <button
                                  type="button"
                                  onClick={handleAbortCancel}
                                  disabled={cancellingId === sub.id}
                                  className="px-2.5 py-1 rounded-lg border border-gray-300 dark:border-dk-border bg-white dark:bg-dk-raised text-gray-600 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-surface text-xs font-medium"
                                >
                                  {t('forms.submissionsPage.cancelConfirmNo')}
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col items-start gap-1.5">
                              {sub.status === 'pending_payment' && (
                                <button
                                  type="button"
                                  onClick={() => handleRequestConfirmPayment(sub.id)}
                                  className="px-2.5 py-1.5 rounded-lg border border-green-200 dark:border-green-900/50 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 text-xs font-medium"
                                >
                                  {t('forms.submissionsPage.confirmPaymentButton')}
                                </button>
                              )}
                              {CANCELLABLE_STATUSES.has(sub.status) && (
                                <button
                                  type="button"
                                  onClick={() => handleRequestCancel(sub.id)}
                                  className="px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-medium"
                                >
                                  {t('forms.submissionsPage.cancelButton')}
                                </button>
                              )}
                              {sub.status !== 'pending_payment' && !CANCELLABLE_STATUSES.has(sub.status) && (
                                <span className="text-gray-300 dark:text-dk-muted text-xs">—</span>
                              )}
                            </div>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Phân trang */}
          {pagination.totalPages > 1 && (
            <div className="px-4 py-3 sm:px-6 border-t border-gray-100 dark:border-dk-border flex items-center justify-between bg-gray-50/50 dark:bg-dk-raised/30">
              <div className="text-xs text-gray-500 dark:text-dk-text2">
                {t('forms.submissionsPage.pageInfo', {
                  page: pagination.page,
                  totalPages: pagination.totalPages,
                  total: pagination.total,
                })}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handlePageChange(pagination.page - 1)}
                  disabled={pagination.page <= 1}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-raised text-gray-600 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-surface disabled:opacity-40 disabled:cursor-not-allowed"
                  title={t('forms.submissionsPage.prevPage')}
                  aria-label={t('forms.submissionsPage.prevPage')}
                >
                  <HiOutlineChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => handlePageChange(pagination.page + 1)}
                  disabled={pagination.page >= pagination.totalPages}
                  className="p-1.5 rounded-lg border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-raised text-gray-600 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-surface disabled:opacity-40 disabled:cursor-not-allowed"
                  title={t('forms.submissionsPage.nextPage')}
                  aria-label={t('forms.submissionsPage.nextPage')}
                >
                  <HiOutlineChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal xem ảnh biên lai chuyển khoản (PR-5) */}
      {viewingReceiptSub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-lg bg-white dark:bg-dk-surface rounded-2xl shadow-xl border border-gray-100 dark:border-dk-border overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-gray-100 dark:border-dk-border flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-gray-900 dark:text-dk-text flex items-center gap-2">
                  <HiOutlinePhotograph className="w-5 h-5 text-gray-600 dark:text-dk-text2" />
                  <span>{t('forms.submissionsPage.receiptModalTitle')}</span>
                </h3>
                <p className="text-xs text-gray-500 dark:text-dk-text2 mt-0.5">
                  {viewingReceiptSub.paymentCode} · {formatVnd(viewingReceiptSub.paymentAmount)} · {viewingReceiptSub.respondentName || '—'}
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseReceipt}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-dk-text p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-dk-raised transition-colors"
                data-testid="btn-close-receipt-modal"
              >
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-gray-50/50 dark:bg-dk-inset min-h-[250px]">
              {isLoadingReceipt ? (
                <div className="text-center py-10 text-gray-500 dark:text-dk-text2">
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 dark:border-dk-border border-t-primary-600 mb-2" />
                  <p className="text-xs">{t('forms.submissionsPage.receiptLoading')}</p>
                </div>
              ) : receiptError ? (
                <div className="text-center py-10 text-red-600 dark:text-red-400 text-sm">
                  <p>{receiptError}</p>
                </div>
              ) : receiptBlobUrl ? (
                <img
                  src={receiptBlobUrl}
                  alt="Receipt"
                  className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-sm border border-gray-200 dark:border-dk-border"
                  data-testid="img-receipt-modal"
                />
              ) : null}
            </div>

            <div className="p-3 border-t border-gray-100 dark:border-dk-border bg-gray-50 dark:bg-dk-bg flex items-center justify-between text-xs text-gray-500 dark:text-dk-text2">
              <span>
                {viewingReceiptSub.paymentReceiptUploadedAt
                  ? new Date(viewingReceiptSub.paymentReceiptUploadedAt).toLocaleString('vi-VN')
                  : ''}
              </span>
              <button
                type="button"
                onClick={handleCloseReceipt}
                className="px-3 py-1.5 rounded-lg bg-white dark:bg-dk-raised border border-gray-300 dark:border-dk-border hover:bg-gray-50 dark:hover:bg-dk-strong font-medium text-gray-700 dark:text-dk-text shadow-sm transition-colors"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  );
}
