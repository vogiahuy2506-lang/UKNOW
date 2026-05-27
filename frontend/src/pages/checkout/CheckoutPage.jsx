import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HiArrowLeft, HiOutlineDuplicate, HiOutlineCheck } from 'react-icons/hi';
import { HiOutlineShieldCheck, HiBolt } from 'react-icons/hi2';
import { toast } from 'react-hot-toast';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import api from '../../services/api';
import QRCode from 'qrcode';

const fmtVnd = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';

const CheckoutPage = () => {
    const { t } = useI18n();
    const location = useLocation();
    const navigate = useNavigate();
    const pollingRef = useRef(null);

    const plan = location.state?.plan;

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

                const { data } = await api.post('/payments/create-payment', {
                    planCode: plan.code,
                    userEmail,
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
        <div className="min-h-screen bg-slate-50">
            <div className="max-w-5xl mx-auto px-4 py-8 sm:py-12">

                {/* Back button */}
                <button
                    onClick={() => navigate(-1)}
                    className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-primary-600 mb-8 transition-colors group"
                >
                    <HiArrowLeft className="group-hover:-translate-x-0.5 transition-transform" />
                    {t('checkout.changePlan')}
                </button>

                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">

                    {/* ── CỘT TRÁI: Tóm tắt đơn hàng ─────────────────── */}
                    <div className="lg:col-span-2 space-y-4">

                        {/* Plan card */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                            <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">
                                {t('checkout.registrationDetails')}
                            </h2>

                            <div className="bg-primary-50 border border-primary-100 rounded-xl p-4 mb-5">
                                <p className="text-[11px] font-bold text-primary-600 uppercase tracking-widest mb-1">
                                    {t('checkout.membershipPlan')}
                                </p>
                                <p className="text-xl font-black text-slate-900">{plan.name}</p>
                                <p className="text-sm text-slate-500 mt-0.5">{t('checkout.monthlyBilling')}</p>
                            </div>

                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between text-slate-500">
                                    <span>{t('checkout.serviceFee')}</span>
                                    <span className="font-medium text-slate-700">{fmtVnd(plan.price)}</span>
                                </div>
                                <div className="flex justify-between text-emerald-600 text-xs italic">
                                    <span>{t('checkout.trialOffer')}</span>
                                    <span>- 0 đ</span>
                                </div>
                                <div className="pt-3 border-t border-dashed border-slate-200 flex justify-between items-end">
                                    <div>
                                        <span className="block font-semibold text-slate-900">{t('checkout.total')}</span>
                                        <span className="text-[11px] text-slate-400">{t('checkout.vatIncluded')}</span>
                                    </div>
                                    <span className="text-2xl font-black text-slate-900">{fmtVnd(plan.price)}</span>
                                </div>
                            </div>
                        </div>

                        {/* Trust badges */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-2.5 shadow-sm">
                                <HiOutlineShieldCheck className="text-primary-500 text-lg shrink-0" />
                                <span className="text-xs font-semibold text-slate-500 leading-tight">{t('checkout.dataSecurity')}</span>
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200 p-3 flex items-center gap-2.5 shadow-sm">
                                <HiBolt className="text-primary-500 text-lg shrink-0" />
                                <span className="text-xs font-semibold text-slate-500 leading-tight">{t('checkout.quickActivation')}</span>
                            </div>
                        </div>
                    </div>

                    {/* ── CỘT PHẢI: Thanh toán ─────────────────────────── */}
                    <div className="lg:col-span-3">
                        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

                            {/* Header stripe */}
                            <div className="bg-primary-500 px-6 py-3 flex items-center justify-between">
                                <span className="text-sm font-bold text-white">{t('checkout.paymentGuide')}</span>
                                <span className="text-[10px] font-black text-primary-100 uppercase tracking-widest bg-white/20 px-2.5 py-1 rounded-full">
                                    {t('checkout.safeTransaction')}
                                </span>
                            </div>

                            <div className="p-6">
                                <p className="text-sm text-slate-500 mb-6">{t('checkout.paymentGuideText')}</p>

                                <div className="flex flex-col sm:flex-row gap-6 items-center">
                                    {/* QR code */}
                                    <div className="shrink-0 flex flex-col items-center gap-3">
                                        <div className="w-52 h-52 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center shadow-inner">
                                            {loading && (
                                                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
                                            )}
                                            {error && (
                                                <p className="text-red-500 text-xs text-center px-3">{error}</p>
                                            )}
                                            {qrImageUrl && (
                                                <img src={qrImageUrl} alt="QR" className="w-48 h-48 rounded-lg" />
                                            )}
                                        </div>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                            {t('checkout.scanToPay')}
                                        </p>
                                    </div>

                                    {/* Order info */}
                                    <div className="flex-1 w-full space-y-3">
                                        {/* Order code */}
                                        {orderCode ? (
                                            <button
                                                type="button"
                                                onClick={() => handleCopy(String(orderCode))}
                                                className="w-full text-left p-4 bg-primary-500 hover:bg-primary-600 rounded-xl transition-colors group"
                                            >
                                                <p className="text-[10px] font-bold text-primary-100 uppercase tracking-widest mb-1">
                                                    {t('checkout.orderCode')}
                                                </p>
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="font-bold text-white text-lg tracking-wide">{orderCode}</span>
                                                    {copied
                                                        ? <HiOutlineCheck className="text-white shrink-0" />
                                                        : <HiOutlineDuplicate className="text-primary-200 group-hover:text-white shrink-0 transition-colors" />
                                                    }
                                                </div>
                                            </button>
                                        ) : (
                                            <div className="w-full p-4 bg-slate-100 rounded-xl h-[72px] animate-pulse" />
                                        )}

                                        {/* How to pay steps */}
                                        <div className="space-y-2">
                                            {[t('checkout.step1'), t('checkout.step2'), t('checkout.step3')].map((step, i) => (
                                                <div key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
                                                    <span className="shrink-0 w-5 h-5 rounded-full bg-primary-50 border border-primary-200 text-primary-600 text-[10px] font-bold flex items-center justify-center mt-0.5">
                                                        {i + 1}
                                                    </span>
                                                    <span>{step}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Status footer */}
                            <div className="border-t border-slate-100 bg-slate-50 px-6 py-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-pulse" />
                                    <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-pulse [animation-delay:0.2s]" />
                                    <span className="w-1.5 h-1.5 bg-primary-500 rounded-full animate-pulse [animation-delay:0.4s]" />
                                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest ml-1">
                                        {t('checkout.checkingTransaction')}
                                    </span>
                                </div>
                                <p className="text-[10px] text-slate-400 italic hidden sm:block">{t('checkout.autoRedirect')}</p>
                            </div>
                        </div>

                        <p className="mt-4 text-center text-sm text-slate-400">
                            {t('checkout.needHelp')}{' '}
                            <a href="#" className="text-primary-500 hover:underline font-medium">
                                {t('checkout.contactSupport')}
                            </a>
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CheckoutPage;
