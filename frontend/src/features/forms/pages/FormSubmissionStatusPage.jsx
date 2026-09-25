import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useSearchParams, Link } from 'react-router-dom';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { HiOutlineClipboardCopy, HiOutlineCheck, HiOutlineExclamationCircle, HiOutlineDownload } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import { fetchPublicSubmissionStatus, reportSubmissionPaid } from '../services/formPublicApi.service';
import { formatAppointmentAtVn } from '../utils/bookingFormat.util';
import { formatVnd, formatCountdown } from '../../../utils/vietqrParser';
import { useFormEmbedResize } from '../hooks/useFormEmbedResize';
import { useFormFont } from '../utils/useFormFont';
import { buildFormFontFamily } from '../constants/formTheme';
import { getReadableTextColor } from '../utils/formTheme.util';

const POLL_INTERVAL_MS = 30000;

/**
 * Một dòng thông tin có thể sao chép (ngân hàng/STK/chủ TK/số tiền/mã nội dung) — PR-3b.
 * Không dùng chung `CopyRow` của features/checkout: component đó hardcode i18n namespace
 * `checkout.*` bên trong (không tham số hoá được tên khoá), tạo phụ thuộc chéo feature không
 * cần thiết cho một component trình bày đơn giản.
 */
function CopyableRow({ label, value, displayValue, hint }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      toast.success(t('publicForm.payment.copied'));
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('publicForm.payment.copyError'));
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg bg-white border border-gray-200">
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-400">{label}</div>
        <div className="text-sm font-mono font-bold text-gray-800 break-all">{displayValue || '—'}</div>
        {hint && <div className="text-[10px] text-gray-400 mt-0.5 leading-tight">{hint}</div>}
      </div>
      <button
        type="button"
        onClick={handleCopy}
        disabled={!value}
        className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-primary-600 hover:text-primary-700 px-2.5 py-1.5 rounded-lg bg-primary-50 hover:bg-primary-100 border border-primary-200/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        {copied ? <HiOutlineCheck className="w-3.5 h-3.5" /> : <HiOutlineClipboardCopy className="w-3.5 h-3.5" />}
        <span>{copied ? t('publicForm.payment.copied') : t('publicForm.payment.copyAction')}</span>
      </button>
    </div>
  );
}

function formatTimeOnly(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return '';
  const formatter = new Intl.DateTimeFormat('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return formatter.format(d);
}

export default function FormSubmissionStatusPage() {
  const { t, locale } = useI18n();
  const { publicKey, accessToken } = useParams();
  const [searchParams] = useSearchParams();
  const embedMode = searchParams.get('embed') === '1';

  const [statusData, setStatusData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [httpStatus, setHttpStatus] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [countdownSeconds, setCountdownSeconds] = useState(null);
  const [isReportingPaid, setIsReportingPaid] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  // Chặn refetch-do-đếm-ngược-về-0 bắn liên tiếp nhiều lần trong cùng một giây làm tròn.
  const hasFiredZeroRefetch = useRef(false);
  // Đọc statusData "mới nhất" trong catch của load() mà không phải thêm statusData vào deps
  // của useCallback (sẽ tạo lại hàm mỗi lần re-render, phá interval đang chạy).
  const statusDataRef = useRef(null);
  useEffect(() => {
    statusDataRef.current = statusData;
  }, [statusData]);

  const load = useCallback(async () => {
    try {
      const data = await fetchPublicSubmissionStatus(publicKey, accessToken);
      setStatusData(data);
      setHttpStatus(null);
    } catch (err) {
      const status = err.response?.status || 500;
      // Review 15/09: lỗi mạng tạm thời ở vòng tự làm mới (poll 30s) từng xoá sạch QR/thông tin
      // đã tải — chuyển thẳng khách sang màn "Không tìm thấy bài nộp" dù dữ liệu cũ vẫn đúng.
      // Đã có dữ liệu VÀ lỗi không phải 404 (form/bài nộp thật sự không còn) -> giữ nguyên màn
      // đang hiện, bỏ qua lỗi lần này. Lần tải ĐẦU TIÊN (chưa có statusData) hoặc 404 vẫn báo lỗi
      // như cũ.
      if (statusDataRef.current && status !== 404) {
        return;
      }
      setHttpStatus(status);
    } finally {
      setIsLoading(false);
    }
  }, [publicKey, accessToken]);

  useEffect(() => {
    load();
  }, [load]);

  const isPendingPayment = statusData?.status === 'pending_payment';
  const isPendingActive = isPendingPayment && !statusData?.holdExpired;

  // Tự làm mới mỗi 30 giây khi còn ở trạng thái chờ thanh toán — CẢ KHI đã hết hạn giữ chỗ
  // (review 15/09: khách chuyển khoản sát giờ/muộn vẫn cần thấy "Đã xác nhận" ngay khi chủ bấm
  // "Đã nhận tiền", chủ vẫn xác nhận được submission dù đã hết hạn — xem FormSubmissionsPage).
  // Đếm ngược (effect dưới) thì NGƯỢC LẠI, chỉ chạy khi còn hạn — không đếm lùi quá 0.
  useEffect(() => {
    if (!isPendingPayment) return undefined;
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isPendingPayment, load]);

  // Đồng hồ đếm ngược tới holdExpiresAt — hết giờ đếm ngược thì gọi lại API NGAY (không đợi
  // vòng 30 giây ở trên), để chuyển đúng sang màn "hết thời gian giữ chỗ" không trễ nhịp.
  useEffect(() => {
    if (!isPendingActive || !statusData?.holdExpiresAt) {
      setCountdownSeconds(null);
      hasFiredZeroRefetch.current = false;
      return undefined;
    }
    const targetMs = new Date(statusData.holdExpiresAt).getTime();
    const tick = () => {
      const remaining = Math.max(0, Math.round((targetMs - Date.now()) / 1000));
      setCountdownSeconds(remaining);
      if (remaining <= 0 && !hasFiredZeroRefetch.current) {
        hasFiredZeroRefetch.current = true;
        load();
      }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [isPendingActive, statusData?.holdExpiresAt, load]);

  useEffect(() => {
    if (!statusData?.payment?.qrString) {
      setQrDataUrl('');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(statusData.payment.qrString, { width: 320, margin: 4 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrDataUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [statusData?.payment?.qrString]);

  const handleConfirmPaid = async () => {
    setIsReportingPaid(true);
    try {
      const res = await reportSubmissionPaid(publicKey, accessToken);
      setStatusData((prev) => ({
        ...prev,
        holdExpiresAt: res?.holdExpiresAt || prev?.holdExpiresAt,
        payerReportedPaidAt: res?.payerReportedPaidAt || new Date().toISOString(),
      }));
      setShowConfirmModal(false);
      toast.success(t('publicForm.payment.reportedToast'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('publicForm.payment.reportPaidError'));
      setShowConfirmModal(false);
    } finally {
      setIsReportingPaid(false);
    }
  };

  // PR-5 — depsKey theo trạng thái hiển thị hiện tại (loading/404/từng nhánh status) để chiều
  // cao gửi cho form-embed.js luôn khớp nội dung thật khi trạng thái đổi.
  const renderState = isLoading ? 'loading' : httpStatus ? `error-${httpStatus}` : statusData?.status || 'unknown';
  const embedRootRef = useFormEmbedResize({ enabled: embedMode, formKey: publicKey, depsKey: renderState });

  const wrapperClass = embedMode
    ? 'py-3 px-2 flex flex-col items-center overflow-x-hidden box-border'
    : 'min-h-screen bg-gray-50/60 py-6 sm:py-12 px-3 sm:px-6 flex flex-col items-center overflow-x-hidden box-border';
  const cardClass = 'w-full max-w-md mx-auto p-5 sm:p-6 bg-white rounded-2xl shadow-sm border border-gray-100';

  // Theme của form gốc, chiếu qua API trạng thái (buildPublicFormTheme — chỉ có
  // bannerUrl/logoUrl, không có khoá). Không có banner ở trang này (PLAN PR-4b mục 5 chỉ liệt
  // font + màu chủ đạo + nền + logo, không nhắc banner).
  const theme = statusData?.theme || {};
  const primaryColor = theme.primaryColor || null;
  const primaryTextColor = primaryColor ? getReadableTextColor(primaryColor) : null;
  const fontFamilyCss = buildFormFontFamily(theme.fontFamily);
  useFormFont(theme.fontFamily);
  const themeRootStyle = {
    ...(primaryColor ? { '--form-primary': primaryColor } : {}),
    ...(primaryTextColor ? { '--form-primary-text': primaryTextColor } : {}),
    ...(fontFamilyCss ? { fontFamily: fontFamilyCss } : {}),
    ...(!embedMode && theme.backgroundColor ? { backgroundColor: theme.backgroundColor } : {}),
  };

  if (isLoading) {
    return (
      <div ref={embedRootRef} className={wrapperClass}>
        <div className="text-center text-gray-500 py-10">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-gray-200 border-t-primary-600 mb-3" />
          <p className="text-sm">{t('publicForm.payment.statusLoading')}</p>
        </div>
      </div>
    );
  }

  if (httpStatus || !statusData) {
    return (
      <div ref={embedRootRef} className={wrapperClass}>
        <div className={cardClass}>
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-2xl font-bold">
            ?
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2 text-center">
            {t('publicForm.payment.statusNotFoundTitle')}
          </h2>
          <p className="text-sm text-gray-500 leading-relaxed text-center">
            {t('publicForm.payment.statusNotFoundDesc')}
          </p>
        </div>
      </div>
    );
  }

  const { status, formTitle, appointmentAt, payment, holdExpired } = statusData;

  return (
    <div ref={embedRootRef} className={wrapperClass} style={themeRootStyle}>
      <div className={cardClass}>
        {theme.logoUrl && (
          <img
            src={theme.logoUrl}
            alt=""
            className="h-12 max-w-[200px] object-contain mx-auto mb-3"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        )}
        <h1 className="text-lg font-bold text-gray-900 mb-1 text-center break-words">{formTitle}</h1>

        {appointmentAt && (
          <p className="text-xs text-gray-500 text-center mb-4">
            {t('publicForm.payment.appointmentLine', { time: formatAppointmentAtVn(appointmentAt, locale) })}
          </p>
        )}

        {status === 'pending_payment' && !holdExpired && payment && (
          <div className="space-y-4">
            <div className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-semibold">
              {countdownSeconds !== null && (
                <span data-testid="hold-countdown">
                  {t('publicForm.payment.holdCountdown', { time: formatCountdown(countdownSeconds) })}
                </span>
              )}
            </div>

            {payment.method === 'momo' ? (
              <>
                {payment.qrString ? (
                  <>
                    <p
                      className="font-semibold text-sm sm:text-base text-center mb-1"
                      style={{ color: 'var(--form-primary, #059669)' }}
                    >
                      {t('publicForm.payment.momoScanInstruction')}
                    </p>

                    {payment.momoName && (
                      <p className="text-xs text-amber-800 bg-amber-50 p-2 rounded-lg border border-amber-200 text-center mb-3 font-medium">
                        {t('publicForm.payment.momoVerifyRecipient', { name: payment.momoName })}
                      </p>
                    )}

                    {qrDataUrl ? (
                      <img
                        src={qrDataUrl}
                        alt={t('publicForm.payment.qrAlt')}
                        className="w-60 h-60 mx-auto rounded-xl border border-gray-200 bg-white"
                      />
                    ) : (
                      <div className="w-60 h-60 mx-auto flex items-center justify-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
                        {t('publicForm.payment.qrGenerating')}
                      </div>
                    )}

                    {qrDataUrl && (
                      <div className="text-center my-3">
                        <a
                          href={qrDataUrl}
                          download={`qr-${payment.code || 'payment'}.png`}
                          data-testid="btn-save-qr"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 shadow-sm transition-colors"
                        >
                          <HiOutlineDownload className="w-4 h-4 text-gray-500" />
                          {t('publicForm.payment.saveQrBtn')}
                        </a>
                        <p className="text-xs text-gray-400 mt-1">
                          {t('publicForm.payment.saveQrHint')}
                        </p>
                      </div>
                    )}

                    <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-xl border border-gray-100 text-center mb-2">
                      {t('publicForm.payment.momoManualHintWithQr')}
                    </p>
                  </>
                ) : (
                  <p className="text-xs text-gray-500 bg-gray-50 p-3 rounded-xl border border-gray-100 text-center">
                    {t('publicForm.payment.momoHint')}
                  </p>
                )}

                <div className="space-y-2">
                  <CopyableRow
                    label={t('publicForm.payment.momoPhoneLabel')}
                    value={payment.momoPhone}
                    displayValue={payment.momoPhone}
                  />
                  <CopyableRow
                    label={t('publicForm.payment.momoNameLabel')}
                    value={payment.momoName}
                    displayValue={payment.momoName}
                  />
                  <CopyableRow
                    label={t('publicForm.payment.amountLabel')}
                    value={String(payment.amount)}
                    displayValue={formatVnd(payment.amount)}
                  />
                  <CopyableRow
                    label={t('publicForm.payment.codeLabel')}
                    value={payment.code}
                    displayValue={payment.code}
                    hint={t('publicForm.payment.codeHint')}
                  />
                </div>
              </>
            ) : (
              <>
                <p
                  className="font-semibold text-sm sm:text-base text-center mb-3"
                  style={{ color: 'var(--form-primary, #059669)' }}
                >
                  {t('publicForm.payment.scanInstruction')}
                </p>

                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={t('publicForm.payment.qrAlt')}
                    className="w-60 h-60 mx-auto rounded-xl border border-gray-200 bg-white"
                  />
                ) : (
                  <div className="w-60 h-60 mx-auto flex items-center justify-center text-xs text-gray-400 border border-dashed border-gray-200 rounded-xl">
                    {t('publicForm.payment.qrGenerating')}
                  </div>
                )}

                {qrDataUrl && (
                  <div className="text-center my-3">
                    <a
                      href={qrDataUrl}
                      download={`qr-${payment.code || 'payment'}.png`}
                      data-testid="btn-save-qr"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-xs font-medium text-gray-700 shadow-sm transition-colors"
                    >
                      <HiOutlineDownload className="w-4 h-4 text-gray-500" />
                      {t('publicForm.payment.saveQrBtn')}
                    </a>
                    <p className="text-xs text-gray-400 mt-1">
                      {t('publicForm.payment.saveQrHint')}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <CopyableRow
                    label={t('publicForm.payment.bankLabel')}
                    value={payment.bankName}
                    displayValue={payment.bankName}
                  />
                  <CopyableRow
                    label={t('publicForm.payment.accountNumberLabel')}
                    value={payment.accountNumber}
                    displayValue={payment.accountNumber}
                  />
                  <CopyableRow
                    label={t('publicForm.payment.accountNameLabel')}
                    value={payment.accountName}
                    displayValue={payment.accountName}
                  />
                  <CopyableRow
                    label={t('publicForm.payment.amountLabel')}
                    value={String(payment.amount)}
                    displayValue={formatVnd(payment.amount)}
                  />
                  <CopyableRow
                    label={t('publicForm.payment.codeLabel')}
                    value={payment.code}
                    displayValue={payment.code}
                    hint={t('publicForm.payment.codeHint')}
                  />
                </div>
              </>
            )}

            {/* PR-2: Nút xác nhận chuyển khoản hoặc thông báo đã ghi nhận */}
            {statusData?.payerReportedPaidAt ? (
              <div
                data-testid="block-payer-reported-success"
                className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs sm:text-sm text-emerald-800 flex items-start gap-2.5"
              >
                <div className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-600 flex-shrink-0 flex items-center justify-center font-bold text-xs mt-0.5">
                  ✓
                </div>
                <div className="leading-relaxed">
                  {t('publicForm.payment.reportedSuccessMsg', {
                    reportedTime: formatTimeOnly(statusData.payerReportedPaidAt),
                    recipientName: (payment?.method === 'momo' ? payment?.momoName : payment?.accountName) || t('publicForm.payment.accountNameLabel'),
                    holdTime: formatAppointmentAtVn(statusData.holdExpiresAt, locale),
                  })}
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowConfirmModal(true)}
                disabled={isReportingPaid}
                data-testid="btn-confirm-paid"
                className="w-full py-3 px-4 rounded-xl font-semibold text-sm transition-all shadow-sm flex items-center justify-center gap-2 bg-[color:var(--form-primary,#059669)] text-[color:var(--form-primary-text,#ffffff)] hover:brightness-95 disabled:opacity-50"
              >
                <HiOutlineCheck className="w-5 h-5" />
                <span>{t('publicForm.payment.confirmPaidBtn')}</span>
              </button>
            )}
          </div>
        )}

        {status === 'pending_payment' && holdExpired && (
          <div className="text-center py-4">
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center">
              <HiOutlineExclamationCircle className="w-7 h-7" />
            </div>
            <h2 className="text-base font-semibold text-gray-900 mb-2">{t('publicForm.payment.holdExpiredTitle')}</h2>
            <p className="text-sm text-gray-500 mb-4">{t('publicForm.payment.holdExpiredDesc')}</p>
            <Link
              to={`/f/${encodeURIComponent(publicKey)}${embedMode ? '?embed=1' : ''}`}
              className="inline-flex items-center px-4 py-2 rounded-xl bg-[color:var(--form-primary,#df5c0e)] hover:brightness-95 text-[color:var(--form-primary-text,#ffffff)] text-sm font-medium transition-colors"
            >
              {t('publicForm.payment.backToForm')}
            </Link>
          </div>
        )}

        {status === 'confirmed' && (
          <div className="text-center py-4">
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-green-50 text-green-600 flex items-center justify-center text-2xl font-bold">
              ✓
            </div>
            <h2 className="text-base font-semibold text-gray-900">{t('publicForm.payment.confirmedTitle')}</h2>
          </div>
        )}

        {status === 'cancelled' && (
          <div className="text-center py-4">
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center text-2xl font-bold">
              ✕
            </div>
            <h2 className="text-base font-semibold text-gray-900">{t('publicForm.payment.cancelledTitle')}</h2>
          </div>
        )}

        {(status === 'submitted') && (
          <div className="text-center py-4">
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-2xl font-bold">
              ✓
            </div>
            <h2 className="text-base font-semibold text-gray-900">{t('publicForm.payment.submittedTitle')}</h2>
          </div>
        )}

        <div className="mt-5 pt-4 border-t border-gray-100 space-y-2">
          <p className="text-[11px] text-gray-400 leading-relaxed text-center">
            {(payment?.method === 'momo' ? payment?.momoName : payment?.accountName)
              ? t('publicForm.payment.disclaimerNamed', {
                  name: payment?.method === 'momo' ? payment?.momoName : payment?.accountName,
                })
              : t('publicForm.payment.disclaimer')}
          </p>
          <p className="text-center">
            <a
              href="/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-[color:var(--form-primary,#df5c0e)] hover:brightness-95 font-medium underline"
            >
              {t('publicForm.payment.reportLink')}
            </a>
          </p>
        </div>
      </div>

      {/* Modal xác nhận đã chuyển khoản (PR-2) */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl border border-gray-100 p-6 text-center">
            <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <HiOutlineCheck className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-gray-900 mb-2">
              {t('publicForm.payment.confirmPaidModalTitle')}
            </h3>
            <p className="text-xs sm:text-sm text-gray-600 mb-6 leading-relaxed">
              {t('publicForm.payment.confirmPaidModalQuestion')}
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                disabled={isReportingPaid}
                className="flex-1 py-2.5 px-4 rounded-xl border border-gray-200 text-gray-700 hover:bg-gray-50 text-xs sm:text-sm font-medium transition-colors"
              >
                {t('publicForm.payment.confirmPaidModalCancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmPaid}
                disabled={isReportingPaid}
                data-testid="btn-confirm-paid-submit"
                className="flex-1 py-2.5 px-4 rounded-xl bg-[color:var(--form-primary,#059669)] text-[color:var(--form-primary-text,#ffffff)] hover:brightness-95 text-xs sm:text-sm font-medium transition-colors shadow-sm disabled:opacity-50"
              >
                {isReportingPaid ? '...' : t('publicForm.payment.confirmPaidModalConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
