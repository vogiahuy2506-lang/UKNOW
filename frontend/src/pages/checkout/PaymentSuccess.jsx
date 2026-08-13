import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { HiOutlineCheckCircle, HiArrowRight, HiOutlineDocumentText } from 'react-icons/hi';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../i18n';
import checkoutApiService from '../../features/checkout/services/checkoutApi.service';
import { trackEvent } from '../../utils/analytics';

const GLASS_CARD = 'bg-white/70 border border-white/90 backdrop-blur-md rounded-2xl shadow-xl shadow-orange-500/10';

const INVOICE_POLL_INTERVAL_MS = 3000;
const INVOICE_POLL_MAX_MS = 30000;

/** Map owner invoice DTO → delivery note key (or null = hide). */
function resolveInvoiceDeliveryKey(invoice) {
  if (!invoice || invoice.hasInvoice === false) return null;
  const status = invoice.emailStatus;
  if (status === 'sent') return 'sent';
  if (status === 'failed') return 'failed';
  // pending | sending | null (legacy / not yet emailed)
  return 'pending';
}

const PaymentSuccessPage = () => {
    const { t } = useI18n();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const initialize = useAuthStore((state) => state.initialize);
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

    const [verified, setVerified] = useState(false);
    const [loading, setLoading] = useState(true);
    const [orderCode, setOrderCode] = useState(null);
    const [needsLogin, setNeedsLogin] = useState(false);
    /** null | 'login' | 'pending' | 'sent' | 'failed' */
    const [invoiceDelivery, setInvoiceDelivery] = useState(null);

    useEffect(() => {
        const verify = async () => {
            const code = searchParams.get('orderCode') || location.state?.orderCode;
            if (!code) {
                navigate('/', { replace: true });
                return;
            }
            setOrderCode(code);
            try {
                const data = await checkoutApiService.getPaymentStatus(code);
                if (data.status === 'success') {
                    setVerified(true);
                    setNeedsLogin(false);
                    // transaction_id = mã đơn → GA4 tự loại trùng khi khách F5 trang này.
                    trackEvent('purchase', {
                        transaction_id: String(code),
                        currency: 'VND',
                        value: Number(data.amount || 0),
                    });
                } else if (data.status === 'failed') {
                    navigate('/checkout', { replace: true });
                } else {
                    // pending — keep showing spinner briefly then allow dashboard login
                    navigate('/checkout', { replace: true });
                }
            } catch (err) {
                const status = err?.response?.status;
                if (status === 401) {
                    // Token missing (e.g. bank in-app browser) — do not bounce to home.
                    setNeedsLogin(true);
                } else {
                    navigate('/', { replace: true });
                }
            } finally {
                setLoading(false);
            }
        };
        verify();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // After success: authenticated → poll invoice delivery; unauthenticated → login CTA only.
    useEffect(() => {
        if (!verified || !orderCode) return undefined;

        if (!isAuthenticated) {
            setInvoiceDelivery('login');
            return undefined;
        }

        let cancelled = false;
        let timerId = null;
        const startedAt = Date.now();

        const scheduleNext = () => {
            if (cancelled) return;
            if (Date.now() - startedAt >= INVOICE_POLL_MAX_MS) return;
            timerId = setTimeout(poll, INVOICE_POLL_INTERVAL_MS);
        };

        const poll = async () => {
            try {
                const invoice = await checkoutApiService.getInvoice(orderCode);
                if (cancelled) return;
                const key = resolveInvoiceDeliveryKey(invoice);
                setInvoiceDelivery(key);
                if (key === null || key === 'sent') return;
            } catch {
                if (cancelled) return;
                // Keep last known state; do not invent invoice facts on error.
            }

            scheduleNext();
        };

        poll();

        return () => {
            cancelled = true;
            if (timerId) clearTimeout(timerId);
        };
    }, [verified, orderCode, isAuthenticated]);

    if (loading) {
        return (
            <div className="relative min-h-[60vh] flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (needsLogin && !verified) {
        return (
            <div className="relative min-h-screen flex items-center justify-center px-4">
                <div className={`${GLASS_CARD} p-8 max-w-md w-full text-center`}>
                    <h1 className="text-xl font-bold text-slate-900 mb-2">{t('paymentSuccess.confirmTitle')}</h1>
                    <p className="text-sm text-slate-600 mb-6">{t('paymentSuccess.confirmLoginHint')}</p>
                    {orderCode && (
                        <p className="font-mono text-sm text-slate-500 mb-6">#{orderCode}</p>
                    )}
                    <Link
                        to={`/login?redirect=${encodeURIComponent(`/payment-success?orderCode=${orderCode || ''}`)}`}
                        className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold"
                    >
                        {t('paymentSuccess.loginToConfirm')}
                    </Link>
                </div>
            </div>
        );
    }

    if (!verified) return null;

    const features = [
        t('paymentSuccess.feature1'),
        t('paymentSuccess.feature2'),
    ];

    const invoiceNoteKey = {
        pending: 'paymentSuccess.invoicePending',
        sent: 'paymentSuccess.invoiceSent',
        failed: 'paymentSuccess.invoiceFailed',
        login: 'paymentSuccess.invoiceLoginHint',
    }[invoiceDelivery];

    return (
        <div className="relative min-h-screen">
            <div className="relative pt-4 pb-20 px-4 sm:px-6">
                <div className="text-center px-4 pt-8 pb-10 max-w-2xl mx-auto">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-1.5">
                        Founder AI
                    </p>
                    <div className="flex justify-center mb-5">
                        <div className="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-400/40 backdrop-blur-sm flex items-center justify-center">
                            <HiOutlineCheckCircle className="text-5xl text-emerald-400" />
                        </div>
                    </div>
                    <h1
                        className="font-black text-white mb-2"
                        style={{ fontSize: 'clamp(28px, 4vw, 44px)', lineHeight: 1.05, letterSpacing: '-0.02em' }}
                    >
                        {t('paymentSuccess.pageTitle')}
                    </h1>
                    <p className="text-sm md:text-base text-white/70">{t('paymentSuccess.pageSubtitle')}</p>
                </div>

                <div className="w-full max-w-md mx-auto">
                    <div className={`${GLASS_CARD} p-6 mb-5`}>
                        <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200/80">
                            <div className="flex items-center gap-2 text-slate-600">
                                <HiOutlineDocumentText className="text-base text-orange-500" />
                                <span className="font-semibold uppercase tracking-wider text-[11px]">
                                    {t('paymentSuccess.orderCode')}
                                </span>
                            </div>
                            <span className="font-mono font-bold text-slate-900 text-sm">#{orderCode}</span>
                        </div>

                        <div className="space-y-3">
                            {features.map((item) => (
                                <div key={item} className="flex items-center gap-3 text-sm text-slate-700">
                                    <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    </div>
                                    <span>{item}</span>
                                </div>
                            ))}
                            {invoiceNoteKey && (
                                <div className="flex items-start gap-3 text-sm text-slate-700">
                                    <div className="w-4 h-4 mt-0.5 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                                        <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                                    </div>
                                    <span>{t(invoiceNoteKey)}</span>
                                </div>
                            )}
                            {invoiceDelivery === 'login' && (
                                <Link
                                    to={`/login?redirect=${encodeURIComponent(`/payment-success?orderCode=${orderCode || ''}`)}`}
                                    className="inline-flex text-sm font-semibold text-orange-600 hover:underline"
                                >
                                    {t('paymentSuccess.loginToViewInvoice')}
                                </Link>
                            )}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={async () => { await initialize(); navigate('/app'); }}
                        className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold text-base hover:shadow-lg hover:shadow-orange-500/30 transition-all group"
                    >
                        {isAuthenticated ? t('paymentSuccess.goToDashboard') : t('paymentSuccess.loginToConfirm')}
                        <HiArrowRight className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PaymentSuccessPage;
