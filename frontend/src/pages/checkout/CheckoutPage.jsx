import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { HiArrowLeft, HiOutlineDuplicate, HiOutlineCheck } from 'react-icons/hi';
import { HiOutlineShieldCheck, HiBolt } from 'react-icons/hi2';
import { toast } from 'react-hot-toast';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import api from '../../services/api';
import QRCode from 'qrcode';

const fmtVnd = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';

const GLASS_CARD = 'bg-white/60 border border-white/80 backdrop-blur-md rounded-2xl shadow-lg shadow-black/5';
const GLASS_CARD_SOLID = 'bg-white/75 border border-white/90 backdrop-blur-md rounded-2xl shadow-xl shadow-orange-500/10';

const CheckoutPage = () => {
    const { t } = useI18n();
    const location = useLocation();
    const navigate = useNavigate();
    const pollingRef = useRef(null);

    const plan = location.state?.plan;
    const billingPeriod = location.state?.billingPeriod || 'monthly';
    const isYearly = billingPeriod === 'yearly' && plan?.price_yearly;
    const displayPrice = isYearly ? Number(plan?.price_yearly) : Number(plan?.price || 0);

    const [orderCode, setOrderCode] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const user = useAuthStore((state) => state.user);
    const isAuthLoading = useAuthStore((state) => state.isLoading);
    const [qrImageUrl, setQrImageUrl] = useState(null);
    const [copied, setCopied] = useState(false);

    const handleCopy = (text) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success(t('checkout.copied'));
        setTimeout(() => setCopied(false), 2000);
    };

    useEffect(() => {
        if (!plan) {
            navigate('/pricing', { replace: true });
            return;
        }

        const createPayment = async () => {
            try {
                const userEmail = location.state?.userEmail || user?.email;
                if (!userEmail) {
                    if (isAuthLoading) return;
                    setError(t('checkout.userEmailNotFound'));
                    setLoading(false);
                    return;
                }

                if (displayPrice <= 0) {
                    const { data } = await api.post('/payments/activate-free', {
                        planCode: plan.code,
                        billingPeriod,
                    });
                    if (!data.success) throw new Error(data.message);
                    navigate('/payment-success', {
                        replace: true,
                        state: { orderCode: data.result.orderCode, fromCheckout: true },
                    });
                    return;
                }

                const { data } = await api.post('/payments/create-payment', {
                    planCode: plan.code,
                    userEmail,
                    billingPeriod,
                });
                if (!data.success) throw new Error(data.message);

                setOrderCode(data.result.orderCode);
                const qrDataUrl = await QRCode.toDataURL(data.result.qrCode, { width: 220, margin: 1 });
                setQrImageUrl(qrDataUrl);
                setError(null);
            } catch {
                setError(t('checkout.createOrderFailed'));
            } finally {
                setLoading(false);
            }
        };

        createPayment();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan, user, isAuthLoading]);

    useEffect(() => {
        if (!orderCode) return;

        pollingRef.current = setInterval(async () => {
            try {
                const res = await fetch(`/api/payments/status/${orderCode}`);
                const data = await res.json();
                if (data.status === 'success') {
                    clearInterval(pollingRef.current);
                    navigate('/payment-success', { state: { orderCode, fromCheckout: true } });
                } else if (data.status === 'cancelled') {
                    clearInterval(pollingRef.current);
                    toast.error(t('checkout.transactionCancelled'));
                }
            } catch {
                // Bỏ qua lỗi mạng tạm thời
            }
        }, 3000);

        return () => clearInterval(pollingRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [orderCode]);

    if (!plan) return null;

    return (
        <div className="relative min-h-screen">
            <div className="relative pt-4 pb-16 px-4 sm:px-6">
                {/* Page hero — đồng bộ /pricing */}
                <div className="text-center px-4 pt-6 pb-8 max-w-3xl mx-auto">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/50 mb-1.5">
                        Founder AI
                    </p>
                    <h1
                        className="font-black text-white mb-2"
                        style={{ fontSize: 'clamp(28px, 4vw, 44px)', lineHeight: 1.05, letterSpacing: '-0.02em' }}
                    >
                        {t('checkout.pageTitle')}
                    </h1>
                    <p className="text-sm md:text-base text-white/70">{t('checkout.pageSubtitle')}</p>
                </div>

                <div className="max-w-5xl mx-auto">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="inline-flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white mb-6 transition-colors group"
                    >
                        <HiArrowLeft className="group-hover:-translate-x-0.5 transition-transform" />
                        {t('checkout.changePlan')}
                    </button>

                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
                        {/* Tóm tắt đơn hàng */}
                        <div className="lg:col-span-2 space-y-4">
                            <div className={`${GLASS_CARD} p-6`}>
                                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
                                    {t('checkout.registrationDetails')}
                                </h2>

                                <div className="bg-orange-500/15 border border-orange-300/50 rounded-xl p-4 mb-5">
                                    <p className="text-[11px] font-bold text-orange-600 uppercase tracking-widest mb-1">
                                        {t('checkout.membershipPlan')}
                                    </p>
                                    <p className="text-xl font-black text-slate-900">{plan.name}</p>
                                    <p className="text-sm text-slate-600 mt-0.5">
                                        {isYearly ? t('checkout.yearlyBilling') : t('checkout.monthlyBilling')}
                                    </p>
                                </div>

                                <div className="space-y-3 text-sm">
                                    <div className="flex justify-between text-slate-600">
                                        <span>{t('checkout.serviceFee')}</span>
                                        <span className="font-semibold text-slate-900">{fmtVnd(displayPrice)}</span>
                                    </div>
                                    {isYearly && (
                                        <div className="flex justify-between text-emerald-700 text-xs">
                                            <span>≈ {fmtVnd(Math.round(displayPrice / 12))} / tháng</span>
                                            <span className="bg-emerald-100/80 px-1.5 py-0.5 rounded font-semibold">
                                                -{Math.round((Number(plan.price) * 12 - displayPrice) / (Number(plan.price) * 12) * 100)}%
                                            </span>
                                        </div>
                                    )}
                                    <div className="pt-3 border-t border-slate-200/80 flex justify-between items-end">
                                        <div>
                                            <span className="block font-semibold text-slate-900">{t('checkout.total')}</span>
                                            <span className="text-[11px] text-slate-500">{t('checkout.vatIncluded')}</span>
                                        </div>
                                        <span className="text-2xl font-black text-slate-900">{fmtVnd(displayPrice)}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className={`${GLASS_CARD} p-3 flex items-center gap-2.5`}>
                                    <HiOutlineShieldCheck className="text-orange-500 text-lg shrink-0" />
                                    <span className="text-xs font-semibold text-slate-600 leading-tight">{t('checkout.dataSecurity')}</span>
                                </div>
                                <div className={`${GLASS_CARD} p-3 flex items-center gap-2.5`}>
                                    <HiBolt className="text-orange-500 text-lg shrink-0" />
                                    <span className="text-xs font-semibold text-slate-600 leading-tight">{t('checkout.quickActivation')}</span>
                                </div>
                            </div>
                        </div>

                        {/* Thanh toán QR */}
                        <div className="lg:col-span-3">
                            <div className={`${GLASS_CARD_SOLID} overflow-hidden`}>
                                <div className="bg-gradient-to-r from-orange-500 to-red-500 px-6 py-3 flex items-center justify-between">
                                    <span className="text-sm font-bold text-white">{t('checkout.paymentGuide')}</span>
                                    <span className="text-[10px] font-black text-white/90 uppercase tracking-widest bg-white/20 px-2.5 py-1 rounded-full">
                                        {t('checkout.safeTransaction')}
                                    </span>
                                </div>

                                <div className="p-6">
                                    <p className="text-sm text-slate-600 mb-6">{t('checkout.paymentGuideText')}</p>

                                    <div className="flex flex-col sm:flex-row gap-6 items-center">
                                        <div className="shrink-0 flex flex-col items-center gap-3">
                                            <div className="w-52 h-52 rounded-xl border border-white/90 bg-white/90 flex items-center justify-center shadow-inner">
                                                {loading && (
                                                    <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                                                )}
                                                {error && (
                                                    <p className="text-red-600 text-xs text-center px-3 font-medium">{error}</p>
                                                )}
                                                {qrImageUrl && (
                                                    <img src={qrImageUrl} alt="QR" className="w-48 h-48 rounded-lg" />
                                                )}
                                            </div>
                                            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                                                {t('checkout.scanToPay')}
                                            </p>
                                        </div>

                                        <div className="flex-1 w-full space-y-3">
                                            {orderCode ? (
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopy(String(orderCode))}
                                                    className="w-full text-left p-4 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 rounded-xl transition-all group shadow-md shadow-orange-500/20"
                                                >
                                                    <p className="text-[10px] font-bold text-white/80 uppercase tracking-widest mb-1">
                                                        {t('checkout.orderCode')}
                                                    </p>
                                                    <div className="flex items-center justify-between gap-2">
                                                        <span className="font-bold text-white text-lg tracking-wide">{orderCode}</span>
                                                        {copied
                                                            ? <HiOutlineCheck className="text-white shrink-0" />
                                                            : <HiOutlineDuplicate className="text-white/70 group-hover:text-white shrink-0 transition-colors" />
                                                        }
                                                    </div>
                                                </button>
                                            ) : (
                                                <div className="w-full p-4 bg-white/50 rounded-xl h-[72px] animate-pulse border border-white/60" />
                                            )}

                                            <div className="space-y-2">
                                                {[t('checkout.step1'), t('checkout.step2'), t('checkout.step3')].map((step, i) => (
                                                    <div key={step} className="flex items-start gap-2.5 text-sm text-slate-700">
                                                        <span className="shrink-0 w-5 h-5 rounded-full bg-orange-100 border border-orange-200 text-orange-600 text-[10px] font-bold flex items-center justify-center mt-0.5">
                                                            {i + 1}
                                                        </span>
                                                        <span>{step}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div className="border-t border-white/60 bg-white/40 backdrop-blur-sm px-6 py-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
                                        <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse [animation-delay:0.2s]" />
                                        <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse [animation-delay:0.4s]" />
                                        <span className="text-[11px] font-semibold text-slate-600 uppercase tracking-widest ml-1">
                                            {t('checkout.checkingTransaction')}
                                        </span>
                                    </div>
                                    <p className="text-[10px] text-slate-500 italic hidden sm:block">{t('checkout.autoRedirect')}</p>
                                </div>
                            </div>

                            <p className="mt-4 text-center text-sm text-white/70">
                                {t('checkout.needHelp')}{' '}
                                <Link to="/contact" className="text-orange-300 hover:text-orange-200 font-semibold underline-offset-2 hover:underline">
                                    {t('checkout.contactSupport')}
                                </Link>
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CheckoutPage;
