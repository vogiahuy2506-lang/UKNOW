import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import {
    HiOutlineCheckCircle,
    HiArrowRight,
    HiOutlineDocumentText,
    HiOutlineClipboardList,
    HiOutlineShieldCheck,
    HiOutlineDuplicate,
    HiOutlineCheck,
} from 'react-icons/hi';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../i18n';
import checkoutApiService from '../../features/checkout/services/checkoutApi.service';
import { trackEvent } from '../../utils/analytics';

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
                    trackEvent('purchase', {
                        transaction_id: String(code),
                        currency: 'VND',
                        value: Number(data.amount || 0),
                    });
                } else if (data.status === 'failed') {
                    navigate('/checkout', { replace: true });
                } else {
                    navigate('/checkout', { replace: true });
                }
            } catch (err) {
                const status = err?.response?.status;
                if (status === 401) {
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
            <div className="min-h-[60vh] flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (needsLogin && !verified) {
        return (
            <div className="min-h-screen flex items-center justify-center px-4 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-50 via-slate-50 to-slate-100">
                <div className="bg-white/80 border border-white/90 backdrop-blur-xl rounded-3xl shadow-xl shadow-slate-200/50 p-6 md:p-8 max-w-md w-full text-center">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-600 mb-4">
                        Founder AI
                    </p>
                    <div className="flex justify-center mb-5">
                        <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-400/40 flex items-center justify-center">
                            <HiOutlineShieldCheck className="text-3xl text-amber-500" />
                        </div>
                    </div>
                    <h1 className="text-xl font-black text-slate-900 mb-2">
                        {t('paymentSuccess.confirmTitle')}
                    </h1>
                    <p className="text-sm text-slate-600 mb-4">
                        {t('paymentSuccess.confirmLoginHint')}
                    </p>
                    {orderCode && (
                        <p className="font-mono text-sm text-slate-500 mb-6">#{orderCode}</p>
                    )}
                    <Link
                        to={`/login?redirect=${encodeURIComponent(`/payment-success?orderCode=${orderCode || ''}`)}`}
                        className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold text-sm hover:shadow-lg hover:shadow-orange-500/30 transition-all"
                    >
                        {t('paymentSuccess.loginToConfirm')}
                    </Link>
                </div>
            </div>
        );
    }

    if (!verified) return null;

    const invoiceNoteKey = {
        pending: 'paymentSuccess.invoicePending',
        sent: 'paymentSuccess.invoiceSent',
        failed: 'paymentSuccess.invoiceFailed',
        login: 'paymentSuccess.invoiceLoginHint',
    }[invoiceDelivery];

    const handleCopyOrderCode = () => {
        if (!orderCode) return;
        navigator.clipboard.writeText(String(orderCode));
        toast.success(t('checkout.copied'));
    };

    return (
        <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-50 via-slate-50 to-slate-100 py-6 md:py-10 px-4 flex flex-col justify-center">
            <div className="max-w-2xl mx-auto w-full">

                {/* Top header navigation */}
                <div className="flex items-center justify-between mb-3 px-1">
                    <Link
                        to="/pricing"
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-orange-600 transition-colors"
                    >
                        <HiOutlineClipboardList className="w-4 h-4" />
                        {t('paymentSuccess.backToHome')}
                    </Link>
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            {t('paymentSuccess.pageTitle')}
                        </span>
                    </div>
                </div>

                {/* Hero */}
                <div className="bg-white/80 border border-white/90 backdrop-blur-xl rounded-3xl shadow-xl shadow-slate-200/50 p-5 md:p-8 mb-4">
                    <div className="text-center mb-5">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-orange-600 mb-3">
                            Founder AI
                        </p>
                        <div className="flex justify-center mb-4">
                            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-400/40 flex items-center justify-center">
                                <HiOutlineCheckCircle className="text-4xl text-emerald-500" />
                            </div>
                        </div>
                        <h1 className="font-black text-slate-900 mb-2" style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                            {t('paymentSuccess.pageTitle')}
                        </h1>
                        <p className="text-sm text-slate-600 max-w-md mx-auto">
                            {t('paymentSuccess.pageSubtitle')}
                        </p>
                    </div>

                    {/* Order code + amount */}
                    <div className="space-y-2.5">
                        {orderCode && (
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                                <div>
                                    <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                        {t('paymentSuccess.orderCode')}
                                    </span>
                                    <p className="text-sm font-mono font-bold text-slate-800">#{orderCode}</p>
                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                        {t('paymentSuccess.orderCodeHint')}
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleCopyOrderCode}
                                    className="inline-flex items-center gap-1.5 text-xs font-bold text-orange-600 hover:text-orange-700 px-3 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 border border-orange-200/60 transition-colors"
                                >
                                    <HiOutlineDuplicate className="w-4 h-4" />
                                    <span>{t('checkout.copy')}</span>
                                </button>
                            </div>
                        )}

                        {/* Unlocked features */}
                        <div className="bg-emerald-50/50 border border-emerald-200/60 rounded-2xl p-3.5 space-y-2">
                            <div className="flex items-center gap-2 text-xs text-emerald-700">
                                <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                    <HiOutlineCheck className="w-3 h-3 text-emerald-600" />
                                </div>
                                <span className="font-medium">{t('paymentSuccess.feature1')}</span>
                            </div>
                            <div className="flex items-center gap-2 text-xs text-emerald-700">
                                <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                    <HiOutlineCheck className="w-3 h-3 text-emerald-600" />
                                </div>
                                <span className="font-medium">{t('paymentSuccess.feature2')}</span>
                            </div>
                            {invoiceNoteKey && (
                                <div className="flex items-start gap-2 text-xs text-slate-600">
                                    <div className="w-4 h-4 mt-0.5 rounded-full bg-orange-100 flex items-center justify-center shrink-0">
                                        <HiOutlineDocumentText className="w-3 h-3 text-orange-600" />
                                    </div>
                                    <span>{t(invoiceNoteKey)}</span>
                                </div>
                            )}
                            {invoiceDelivery === 'login' && (
                                <Link
                                    to={`/login?redirect=${encodeURIComponent(`/payment-success?orderCode=${orderCode || ''}`)}`}
                                    className="inline-flex text-xs font-semibold text-orange-600 hover:underline ml-6"
                                >
                                    {t('paymentSuccess.loginToViewInvoice')}
                                </Link>
                            )}
                        </div>
                    </div>
                </div>

                {/* Next steps */}
                <div className="bg-white/80 border border-white/90 backdrop-blur-xl rounded-3xl shadow-xl shadow-slate-200/50 p-4 md:p-5 mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2.5">
                        {t('paymentSuccess.nextStepsTitle')}
                    </p>
                    <div className="space-y-2">
                        {[t('paymentSuccess.nextStep1'), t('paymentSuccess.nextStep2'), t('paymentSuccess.nextStep3')].map((step, i) => (
                            <div key={i} className="flex items-center gap-3 text-xs text-slate-700 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
                                <span className="shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-orange-500 to-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm">
                                    {i + 1}
                                </span>
                                <span className="font-medium leading-snug">{step}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* CTA */}
                <div className="space-y-2">
                    <button
                        type="button"
                        onClick={async () => { await initialize(); navigate('/app'); }}
                        className="w-full inline-flex items-center justify-center gap-2 py-3.5 px-6 rounded-xl bg-gradient-to-r from-orange-500 to-red-500 text-white font-bold text-sm hover:shadow-lg hover:shadow-orange-500/30 transition-all group"
                    >
                        {isAuthenticated ? t('paymentSuccess.goToDashboard') : t('paymentSuccess.loginToConfirm')}
                        <HiArrowRight className="group-hover:translate-x-0.5 transition-transform" />
                    </button>
                    <p className="text-[10px] text-center text-slate-400 font-medium">
                        🔒 {t('checkout.securityBadge')}
                    </p>
                </div>
            </div>
        </div>
    );
};

// Hook helpers — gom lại để giữ JSX chính ngắn gọn
export default PaymentSuccessPage;
