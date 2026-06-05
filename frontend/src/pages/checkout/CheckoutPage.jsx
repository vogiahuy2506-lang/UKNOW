import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { HiArrowLeft, HiOutlineDuplicate, HiOutlineCheck } from 'react-icons/hi';
import { toast } from 'react-hot-toast';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import { getAvailableVouchers, getVoucherCodeSuggestions, validateVoucher } from '../../services/voucher.service';
import checkoutApiService from '../../features/checkout/services/checkoutApi.service';
import QRCode from 'qrcode';

const fmtVnd = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';

const GLASS_CARD = 'bg-white/60 border border-white/80 backdrop-blur-md rounded-2xl shadow-lg shadow-black/5';
const GLASS_CARD_SOLID = 'bg-white/75 border border-white/90 backdrop-blur-md rounded-2xl shadow-xl shadow-orange-500/10';

const voucherErrorKeyMap = {
    'Voucher không hợp lệ hoặc không đủ điều kiện': 'checkout.invalidVoucher',
    'Gói không tồn tại': 'checkout.planNotFound',
    'Lỗi server': 'checkout.voucherServerError',
};

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
    const [autoPromotion, setAutoPromotion] = useState(null);
    const [manualVoucher, setManualVoucher] = useState(null);
    const [codeVouchers, setCodeVouchers] = useState([]);
    const [voucherCode, setVoucherCode] = useState('');
    const [voucherLoading, setVoucherLoading] = useState(false);
    const [paymentStarted, setPaymentStarted] = useState(false);

    const appliedVoucher = manualVoucher || autoPromotion;
    const discountAmount = Number(appliedVoucher?.discountAmount || 0);
    const finalAmount = Math.max(0, displayPrice - discountAmount);
    const hasManualVoucherInList = manualVoucher
        ? codeVouchers.some((voucher) => voucher.code === manualVoucher.code)
        : false;

    const handleCopy = (text) => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        toast.success(t('checkout.copied'));
        setTimeout(() => setCopied(false), 2000);
    };

    const createPayment = async () => {
        if (!plan) {
            navigate('/pricing', { replace: true });
            return;
        }

        try {
            setPaymentStarted(true);
            setLoading(true);
            const userEmail = location.state?.userEmail || user?.email;
            if (!userEmail) {
                if (isAuthLoading) {
                    setPaymentStarted(false);
                    return;
                }
                setError(t('checkout.userEmailNotFound'));
                setPaymentStarted(false);
                setLoading(false);
                return;
            }

            if (displayPrice <= 0 && !appliedVoucher) {
                const { data } = await checkoutApiService.activateFreePlan({
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

            const { data } = await checkoutApiService.createPayment({
                planCode: plan.code,
                userEmail,
                billingPeriod,
                voucherCode: appliedVoucher?.code || null,
            });
            if (!data.success) throw new Error(data.message);

            if (data.result.noPayment) {
                navigate('/payment-success', {
                    replace: true,
                    state: { orderCode: data.result.orderCode, fromCheckout: true },
                });
                return;
            }

            setOrderCode(data.result.orderCode);
            const qrDataUrl = await QRCode.toDataURL(data.result.qrCode, { width: 220, margin: 1 });
            setQrImageUrl(qrDataUrl);
            setError(null);
        } catch (err) {
            setPaymentStarted(false);
            setError(err?.response?.data?.message || t('checkout.createOrderFailed'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!plan) {
            navigate('/pricing', { replace: true });
            return;
        }
        setLoading(false);
        const loadVouchers = async () => {
            try {
                const [autoRes, codeRes] = await Promise.all([
                    getAvailableVouchers({ planCode: plan.code, billingPeriod }),
                    getVoucherCodeSuggestions({ planCode: plan.code, billingPeriod }),
                ]);
                setAutoPromotion(autoRes.data?.data?.vouchers?.[0] || null);
                setCodeVouchers(codeRes.data?.data?.vouchers || []);
            } catch {
                setAutoPromotion(null);
                setCodeVouchers([]);
            }
        };
        loadVouchers();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [plan, user, isAuthLoading]);

    const applyVoucherCode = async (code = voucherCode) => {
        const normalized = String(code || '').trim().toUpperCase();
        if (!normalized) return;
        setVoucherLoading(true);
        try {
            const { data } = await validateVoucher({ planCode: plan.code, billingPeriod, code: normalized });
            setManualVoucher(data.data.voucher);
            setVoucherCode(normalized);
            toast.success(t('checkout.voucherApplied'));
        } catch (err) {
            const message = err?.response?.data?.message;
            toast.error(message && voucherErrorKeyMap[message] ? t(voucherErrorKeyMap[message]) : t('checkout.invalidVoucher'));
        } finally {
            setVoucherLoading(false);
        }
    };

    useEffect(() => {
        if (!orderCode) return;

        pollingRef.current = setInterval(async () => {
            try {
                const data = await checkoutApiService.getPaymentStatus(orderCode);
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
            <div className="relative pt-4 pb-6 px-4 sm:px-6">
                {/* Compact header bar */}
                <div className="max-w-5xl mx-auto flex items-center justify-between mb-4">
                    <button
                        type="button"
                        onClick={() => navigate(-1)}
                        className="inline-flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white transition-colors group"
                    >
                        <HiArrowLeft className="group-hover:-translate-x-0.5 transition-transform" />
                        {t('checkout.changePlan')}
                    </button>
                    <div className="text-center">
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/40">Founder AI</p>
                        <h1 className="text-xl font-black text-white leading-tight">{t('checkout.pageTitle')}</h1>
                    </div>
                    <div className="w-32" />
                </div>

                <div className="max-w-5xl mx-auto">
                    <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 items-stretch">

                        {/* ── Cột trái: 1 card thống nhất ── */}
                        <div className={`lg:col-span-2 ${GLASS_CARD} p-5 flex flex-col gap-4`}>

                            {/* Section 1: Chi tiết đăng ký */}
                            <div>
                                <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                                    {t('checkout.registrationDetails')}
                                </h2>
                                <div className="bg-gradient-to-br from-orange-50 to-orange-100/60 border border-orange-200/70 rounded-xl p-3 mb-3">
                                    <p className="text-[10px] font-bold text-orange-500 uppercase tracking-widest mb-0.5">
                                        {t('checkout.membershipPlan')}
                                    </p>
                                    <p className="text-lg font-black text-slate-900 leading-tight">{plan.name}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">
                                        {isYearly ? t('checkout.yearlyBilling') : t('checkout.monthlyBilling')}
                                    </p>
                                </div>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between text-slate-500">
                                        <span>{t('checkout.serviceFee')}</span>
                                        <span className="font-medium text-slate-700">{fmtVnd(displayPrice)}</span>
                                    </div>
                                    {isYearly && (
                                        <div className="flex justify-between text-emerald-600 text-xs">
                                            <span>{t('checkout.perMonthApprox', { amount: fmtVnd(Math.round(displayPrice / 12)) })}</span>
                                            <span className="bg-emerald-100/80 px-1.5 py-0.5 rounded font-semibold">
                                                -{Math.round((Number(plan.price) * 12 - displayPrice) / (Number(plan.price) * 12) * 100)}%
                                            </span>
                                        </div>
                                    )}
                                    {appliedVoucher && (
                                        <div className="flex justify-between text-emerald-600 text-xs">
                                            <span>{manualVoucher ? t('checkout.voucherSummary', { code: manualVoucher.code }) : (autoPromotion.name || autoPromotion.code)}</span>
                                            <span className="font-semibold">-{fmtVnd(discountAmount)}</span>
                                        </div>
                                    )}
                                    <div className="pt-2 border-t border-slate-200/60 flex justify-between items-center">
                                        <div>
                                            <span className="block text-sm font-bold text-slate-800">{t('checkout.total')}</span>
                                            <span className="text-[10px] text-slate-400">{t('checkout.vatIncluded')}</span>
                                        </div>
                                        <span className="text-2xl font-black text-slate-900">{fmtVnd(finalAmount)}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Divider */}
                            <div className="border-t border-slate-200/60" />

                            {/* Section 2: Ưu đãi & voucher — flex-1 để fill height */}
                            <div className="flex flex-col gap-3 flex-1">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('checkout.offerAndVoucher')}</h2>
                                    {manualVoucher && (
                                        <button type="button" className="text-xs text-slate-400 hover:text-red-500 transition-colors" onClick={() => { setManualVoucher(null); setVoucherCode(''); }}>
                                            {t('checkout.removeCode')}
                                        </button>
                                    )}
                                </div>
                                {autoPromotion && (
                                    <div className={`rounded-xl border px-3 py-2.5 ${manualVoucher ? 'border-slate-200 bg-white/40' : 'border-emerald-300 bg-emerald-50/80 ring-1 ring-emerald-200'}`}>
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <p className={`text-[10px] font-bold uppercase tracking-widest ${manualVoucher ? 'text-slate-400' : 'text-emerald-600'}`}>
                                                {t('checkout.autoPromotion')}
                                            </p>
                                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${manualVoucher ? 'bg-slate-100 text-slate-400' : 'bg-emerald-100 text-emerald-700'}`}>
                                                {manualVoucher ? t('checkout.availablePromotion') : t('checkout.currentlyApplied')}
                                            </span>
                                        </div>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className={`font-semibold text-sm ${manualVoucher ? 'text-slate-600' : 'text-emerald-800'}`}>
                                                {autoPromotion.name || autoPromotion.code}
                                            </span>
                                            <span className={`text-xs font-bold ${manualVoucher ? 'text-slate-400' : 'text-emerald-700'}`}>
                                                -{fmtVnd(autoPromotion.discountAmount)}
                                            </span>
                                        </div>
                                        <p className={`text-[11px] mt-0.5 ${manualVoucher ? 'text-slate-400' : 'text-emerald-600'}`}>
                                            {manualVoucher ? t('checkout.autoPromotionPaused') : t('checkout.autoPromotionApplied')}
                                        </p>
                                    </div>
                                )}
                                {manualVoucher && !hasManualVoucherInList && (
                                    <div className="rounded-xl border border-orange-200 bg-orange-50/80 px-3 py-2.5">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-orange-500 mb-1">{t('checkout.appliedCode')}</p>
                                        <div className="flex items-center justify-between gap-2">
                                            <span className="font-semibold text-sm text-orange-800">{t('checkout.codeLabel', { code: manualVoucher.code })}</span>
                                            <span className="text-xs font-bold text-orange-700">-{fmtVnd(manualVoucher.discountAmount)}</span>
                                        </div>
                                        <p className="text-[11px] text-orange-600 mt-0.5">{t('checkout.manualVoucherPriority')}</p>
                                    </div>
                                )}
                                {codeVouchers.length > 0 && (
                                    <div className="space-y-1.5 max-h-32 overflow-y-auto pr-1">
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{t('checkout.availableVoucherCodes')}</p>
                                        {codeVouchers.map((voucher) => {
                                            const isSelected = manualVoucher?.code === voucher.code;
                                            const isEligible = voucher.isEligible !== false;
                                            const minOrderAmount = Number(voucher.minOrderAmount || 0);
                                            const conditionText = minOrderAmount > 0
                                                ? t('checkout.voucherMinOrder', { amount: fmtVnd(minOrderAmount) })
                                                : t('checkout.voucherNoMinOrder');
                                            return (
                                                <button
                                                    key={voucher.id || voucher.code}
                                                    type="button"
                                                    className={`w-full rounded-lg border px-3 py-2 text-left transition-colors disabled:cursor-not-allowed ${isSelected ? 'border-orange-400 bg-orange-50 ring-1 ring-orange-200' : isEligible ? 'border-orange-200 bg-orange-50/60 hover:bg-orange-100/70' : 'border-slate-200 bg-white/40 opacity-60'}`}
                                                    onClick={() => applyVoucherCode(voucher.code)}
                                                    disabled={voucherLoading || paymentStarted || isSelected || !isEligible}
                                                >
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className={`font-semibold text-sm truncate ${isEligible ? 'text-orange-800' : 'text-slate-500'}`}>{voucher.name || voucher.code}</p>
                                                            <p className={`text-[11px] truncate ${isEligible ? 'text-orange-600' : 'text-slate-400'}`}>{conditionText} · {t('checkout.codeLabel', { code: voucher.code })}</p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className={`text-xs font-bold ${isEligible ? 'text-orange-700' : 'text-slate-400'}`}>-{fmtVnd(voucher.discountAmount)}</p>
                                                            <p className={`text-[10px] font-semibold ${isSelected ? 'text-orange-600' : isEligible ? 'text-orange-500' : 'text-slate-400'}`}>
                                                                {isSelected ? t('checkout.currentlyApplied') : isEligible ? t('checkout.useCode') : t('checkout.notEligible')}
                                                            </p>
                                                        </div>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                                {/* Voucher input — luôn ở cuối */}
                                <div className="mt-auto flex gap-2">
                                    <input
                                        className="input flex-1 uppercase bg-white/60 text-sm"
                                        value={voucherCode}
                                        onChange={(e) => setVoucherCode(e.target.value)}
                                        placeholder={t('checkout.voucherPlaceholder')}
                                        disabled={paymentStarted}
                                    />
                                    <button
                                        type="button"
                                        className="btn btn-secondary shrink-0 text-sm"
                                        onClick={() => applyVoucherCode()}
                                        disabled={voucherLoading || paymentStarted}
                                    >
                                        {voucherLoading ? t('checkout.applyingVoucher') : t('checkout.applyVoucher')}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* ── Cột phải: Payment Guide ── */}
                        <div className="lg:col-span-3 flex flex-col gap-3">
                            <div className={`${GLASS_CARD_SOLID} overflow-hidden flex flex-col flex-1`}>
                                {/* Header cam */}
                                <div className="bg-gradient-to-r from-orange-500 to-red-500 px-5 py-3 flex items-center justify-between shrink-0">
                                    <span className="text-sm font-bold text-white">{t('checkout.paymentGuide')}</span>
                                    <span className="text-[10px] font-black text-white/90 uppercase tracking-widest bg-white/20 px-2.5 py-1 rounded-full">
                                        {t('checkout.safeTransaction')}
                                    </span>
                                </div>

                                {/* Body — flex-1 để fill chiều cao */}
                                <div className="p-5 flex flex-col flex-1 gap-4">
                                    {/* Amount / order code */}
                                    {orderCode ? (
                                        <button
                                            type="button"
                                            onClick={() => handleCopy(String(orderCode))}
                                            className="w-full text-left px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600 rounded-xl transition-all group shadow-md shadow-orange-500/20 shrink-0"
                                        >
                                            <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-0.5">{t('checkout.orderCode')}</p>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-bold text-white text-lg tracking-wide">{orderCode}</span>
                                                {copied ? <HiOutlineCheck className="text-white shrink-0" /> : <HiOutlineDuplicate className="text-white/70 group-hover:text-white shrink-0 transition-colors" />}
                                            </div>
                                        </button>
                                    ) : paymentStarted ? (
                                        <div className="w-full px-4 py-3 bg-white/50 rounded-xl h-16 animate-pulse border border-white/60 shrink-0" />
                                    ) : (
                                        <div className="w-full px-4 py-3 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl shrink-0">
                                            <p className="text-[10px] font-bold text-white/70 uppercase tracking-widest mb-0.5">{t('checkout.amountDue')}</p>
                                            <span className="font-bold text-white text-xl">{fmtVnd(finalAmount)}</span>
                                        </div>
                                    )}

                                    {/* QR + Steps — flex-1, căn giữa */}
                                    <div className="flex flex-col sm:flex-row gap-5 items-center flex-1">
                                        {/* QR box */}
                                        <div className="shrink-0 flex flex-col items-center gap-2">
                                            <div className="w-44 h-44 rounded-2xl border-2 border-white/80 bg-white/90 flex items-center justify-center shadow-lg">
                                                {loading && paymentStarted && <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />}
                                                {error && <p className="text-red-600 text-xs text-center px-3 font-medium">{error}</p>}
                                                {qrImageUrl && <img src={qrImageUrl} alt="QR" className="w-40 h-40 rounded-xl" />}
                                                {!paymentStarted && (
                                                    <button type="button" onClick={createPayment} className="btn btn-primary text-sm px-4">
                                                        {t('checkout.createPaymentQr')}
                                                    </button>
                                                )}
                                            </div>
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">
                                                {paymentStarted ? t('checkout.scanToPay') : t('checkout.payAmount', { amount: fmtVnd(finalAmount) })}
                                            </p>
                                        </div>

                                        {/* Steps */}
                                        <div className="flex-1 w-full space-y-3">
                                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{t('checkout.paymentGuide')}</p>
                                            {[t('checkout.step1'), t('checkout.step2'), t('checkout.step3')].map((step, i) => (
                                                <div key={step} className="flex items-start gap-3 text-sm text-slate-700">
                                                    <span className="shrink-0 w-6 h-6 rounded-full bg-orange-100 border border-orange-200 text-orange-600 text-[11px] font-bold flex items-center justify-center mt-0.5">
                                                        {i + 1}
                                                    </span>
                                                    <span className="leading-relaxed">{step}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Footer: need help — mt-auto push xuống đáy */}
                                    <div className="mt-auto pt-3 border-t border-slate-200/60 flex items-center justify-between">
                                        <p className="text-sm text-slate-500">
                                            {t('checkout.needHelp')}{' '}
                                            <Link to="/contact" className="text-orange-500 hover:text-orange-600 font-semibold">
                                                {t('checkout.contactSupport')}
                                            </Link>
                                        </p>
                                        {paymentStarted && (
                                            <div className="flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse" />
                                                <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse [animation-delay:0.2s]" />
                                                <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse [animation-delay:0.4s]" />
                                                <span className="text-[11px] font-semibold text-slate-500 ml-1">{t('checkout.checkingTransaction')}</span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};

export default CheckoutPage;
