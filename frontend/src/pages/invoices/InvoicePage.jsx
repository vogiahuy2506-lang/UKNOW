import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { HiOutlineDocumentDownload, HiOutlineExclamation } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import checkoutApiService from '../../features/checkout/services/checkoutApi.service';

const fmtVnd = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;

function statusKey(status) {
  switch (status) {
    case 'pending': return 'invoicePage.statusPending';
    case 'processing': return 'invoicePage.statusPending';
    case 'issued': return 'invoicePage.statusIssued';
    case 'cqt_ok': return 'invoicePage.statusCqtOk';
    case 'cqt_rejected': return 'invoicePage.statusCqtRejected';
    case 'failed': return 'invoicePage.statusFailed';
    default: return 'invoicePage.statusPending';
  }
}

export default function InvoicePage() {
  const { t } = useI18n();
  const { orderCode } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError(null);
        const invoice = await checkoutApiService.getInvoice(orderCode);
        if (cancelled) return;
        setResult(invoice);
      } catch (err) {
        if (cancelled) return;
        const status = err?.response?.status;
        setError(
          status === 404
            ? t('invoicePage.notFound')
            : (err?.response?.data?.message || err?.message || t('invoicePage.loadFailed')),
        );
        setResult(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [orderCode, t]);

  const handleDownload = useCallback(async () => {
    if (!orderCode || !result?.canDownload || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await checkoutApiService.downloadInvoicePdf(orderCode);
    } catch (err) {
      setDownloadError(err?.message || t('invoicePage.downloadFailed'));
    } finally {
      setDownloading(false);
    }
  }, [orderCode, result?.canDownload, downloading, t]);

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-500">
        {t('common.loading')}
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <HiOutlineExclamation className="mx-auto h-10 w-10 text-amber-500" />
        <p className="mt-3 text-base font-semibold text-slate-800">{error}</p>
        <Link to="/app" className="mt-6 inline-block text-sm font-medium text-orange-600 hover:underline">
          {t('invoicePage.backApp')}
        </Link>
      </div>
    );
  }

  if (result && result.hasInvoice === false) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <p className="text-base font-semibold text-slate-800">{t('invoicePage.noVat')}</p>
        <p className="mt-2 text-sm text-slate-500">{t('invoicePage.orderCode', { code: orderCode })}</p>
        <Link to="/app" className="mt-6 inline-block text-sm font-medium text-orange-600 hover:underline">
          {t('invoicePage.backApp')}
        </Link>
      </div>
    );
  }

  const buyer = result?.buyer || {};
  const buyerName = buyer.companyName || buyer.fullName || '—';
  const canDownload = Boolean(result?.canDownload);

  return (
    <div className="mx-auto max-w-xl px-4 py-10 sm:py-14">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">Founder AI</p>
      <h1 className="mt-1 text-2xl font-black text-slate-900">{t('invoicePage.title')}</h1>
      <p className="mt-1 text-sm text-slate-500">{t('invoicePage.orderCode', { code: orderCode })}</p>

      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            {t('invoicePage.statusLabel')}
          </p>
          <p className="mt-1 text-base font-semibold text-slate-900">
            {t(statusKey(result.status))}
          </p>
          {result.status === 'cqt_ok' && result.cqtCode && (
            <p className="mt-1 text-xs text-slate-500 break-all">
              {t('invoicePage.cqtCode')}: {result.cqtCode}
            </p>
          )}
        </div>

        {(result.khhdon || result.soHdon) && (
          <div className="text-sm text-slate-700">
            <span className="text-slate-500">{t('invoicePage.serial')}: </span>
            <span className="font-medium">{[result.khhdon, result.soHdon].filter(Boolean).join(' — ')}</span>
          </div>
        )}

        <div className="border-t border-slate-100 pt-4 text-sm space-y-1.5">
          <div className="flex justify-between gap-3">
            <span className="text-slate-500">{t('invoicePage.buyer')}</span>
            <span className="font-medium text-slate-800 text-right">{buyerName}</span>
          </div>
          {buyer.taxCode && (
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">{t('invoicePage.taxCode')}</span>
              <span className="font-medium text-slate-800">{buyer.taxCode}</span>
            </div>
          )}
          {result.net != null && (
            <div className="flex justify-between gap-3 pt-2">
              <span className="text-slate-500">{t('invoicePage.net')}</span>
              <span>{fmtVnd(result.net)}</span>
            </div>
          )}
          {result.vatAmount != null && result.vatAmount > 0 && (
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">
                {t('invoicePage.vat', { rate: result.vatRate || 10 })}
              </span>
              <span>{fmtVnd(result.vatAmount)}</span>
            </div>
          )}
          {result.gross != null && (
            <div className="flex justify-between gap-3 border-t border-slate-100 pt-2 font-semibold text-slate-900">
              <span>{t('invoicePage.gross')}</span>
              <span>{fmtVnd(result.gross)}</span>
            </div>
          )}
        </div>

        {canDownload ? (
          <div className="space-y-2">
            <button
              type="button"
              disabled={downloading}
              onClick={handleDownload}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-semibold text-white hover:bg-orange-600 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
            >
              <HiOutlineDocumentDownload className="h-5 w-5" />
              {downloading ? t('invoicePage.downloading') : t('invoicePage.downloadPdf')}
            </button>
            {downloadError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-center">
                <p className="text-xs text-red-700">{downloadError}</p>
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={downloading}
                  className="mt-1 text-xs font-semibold text-orange-600 hover:underline disabled:opacity-50"
                >
                  {t('invoicePage.retryDownload')}
                </button>
              </div>
            )}
          </div>
        ) : (
          <p className="rounded-xl bg-slate-50 px-3 py-2.5 text-center text-xs text-slate-500">
            {t('invoicePage.pdfPending')}
          </p>
        )}
      </div>

      <div className="mt-6 text-center">
        <Link to="/app" className="text-sm font-medium text-orange-600 hover:underline">
          {t('invoicePage.backApp')}
        </Link>
      </div>
    </div>
  );
}
