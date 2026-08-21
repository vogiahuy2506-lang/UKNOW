import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
    HiArrowLeft,
    HiOutlineDuplicate,
    HiOutlineCheck,
    HiOutlineShieldCheck,
    HiOutlineLightningBolt,
    HiOutlineChatAlt2,
    HiOutlineClipboardList,
    HiOutlineClock,
    HiOutlineExclamationCircle,
} from 'react-icons/hi';
import { toast } from 'react-hot-toast';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import { getAvailableVouchers, getVoucherCodeSuggestions, validateVoucher } from '../../services/voucher.service';
import checkoutApiService from '../../features/checkout/services/checkoutApi.service';
import InvoiceVatForm, { computeDisplayVat, isInvoiceInfoValid } from '../../features/checkout/components/InvoiceVatForm';
import { isInvoiceVatUiEnabled } from '../../constants/invoiceVat';
import { trackEvent } from '../../utils/analytics';
import { parseVietQR, formatCountdown } from '../../utils/vietqrParser';
import { lookupBankByBin, formatAccountNumber } from '../../utils/payosBankBinMap';
import QRCode from 'qrcode';

const fmtVnd = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';

const camelItemKey = (key) => {
    const map = {
        base_fee: 'baseFee',
        zalo_messages: 'zaloMessages',
        emails: 'emails',
        ai_credits: 'aiCredits',
        zalo_accounts: 'zaloAccounts',
        email_accounts: 'emailAccounts',
        landing_pages: 'landingPages',
        chatbots: 'chatbots',
        employees: 'employees',
        campaigns: 'campaigns',
        zalo_campaigns: 'zaloCampaigns',
        zalo_group_campaigns: 'zaloGroupCampaigns',
        email_campaigns: 'emailCampaigns',
        email_templates: 'emailTemplates',
        zalo_templates: 'zaloTemplates',
    };
    return map[key] || key;
};

const voucherErrorKeyMap = {
    'Voucher không hợp lệ hoặc không đủ điều kiện': 'checkout.invalidVoucher',
    'Gói không tồn tại': 'checkout.planNotFound',
    'Lỗi server': 'checkout.voucherServerError',
};

/** Compact copy cell: txt + button copy. Toast + 1.5s checkmark feedback. */
function CopyRow({ label, value, displayValue, onCopied, t, hint }) {
    const [copied, setCopied] = useState(false);
    const handle = () => {
        if (!value) return;
        try {
            navigator.clipboard.writeText(String(value));
            setCopied(true);
            toast.success(t('checkout.copied'));
            onCopied?.();
            setTimeout(() => setCopied(false), 1500);
        } catch {
            toast.error('Copy failed');
        }
    };
    return (
        <div className="flex items-center justify-between gap-3 py-2.5 px-3 rounded-lg bg-white border border-slate-200/80 hover:border-orange-200 transition-colors">
            <div className="min-w-0 flex-1">
                <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                    {label}
                </div>
                <div className="text-sm font-mono font-bold text-slate-800 truncate">
                    {displayValue || '—'}
                </div>
                {hint && (
                    <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{hint}</div>
                )}
            </div>
            <button
                type="button"
                onClick={handle}
                disabled={!value}
                className="shrink-0 inline-flex items-center gap-1 text-[11px] font-bold text-orange-600 hover:text-orange-700 px-2.5 py-1.5 rounded-lg bg-orange-50 hover:bg-orange-100 border border-orange-200/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
                {copied ? (
                    <>
                        <HiOutlineCheck className="w-3.5 h-3.5" />
                        <span>{t('checkout.copiedField')}</span>
                    </>
                ) : (
                    <>
                        <HiOutlineDuplicate className="w-3.5 h-3.5" />
                        <span>{t('checkout.copyField')}</span>
                    </>
                )}
            </button>
        </div>
    );
}

const CheckoutPage = () => {
    const { t } = useI18n();
    const location = useLocation();
    const navigate = useNavigate();
    const pollingRef = useRef(null);

    const plan = location.state?.plan;
    const isCustomPlan = Boolean(location.state?.isCustomPlan);
    const customQuantities = location.state?.quantities || null;
    const customQuote = location.state?.quote || null;
    const reusePlanId = location.state?.reusePlanId || null;
    const billingPeriod = location.state?.billingPeriod || 'monthly';
    const isYearly = isCustomPlan
        ? billingPeriod === 'yearly'
        : billingPeriod === 'yearly' && plan?.price_yearly;
    const displayPrice = isCustomPlan
        ? Number(customQuote?.total || 0)
        : (isYearly ? Number(plan?.price_yearly) : Number(plan?.price || 0));
    const planName = isCustomPlan
        ? (customQuote ? t('customPlan.checkoutPlanName') : t('customPlan.title'))
        : plan?.name;
    const voucherPlanCode = isCustomPlan ? 'custom' : plan?.code;

    const [currentStep, setCurrentStep] = useState('info'); // 'info' | 'qr'
    const [orderCode, setOrderCode] = useState(null);
    const [qrRawCode, setQrRawCode] = useState(null); // raw EMVCo string from PayOS
    const [expiredAt, setExpiredAt] = useState(null); // unix seconds
    const [secondsLeft, setSecondsLeft] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const user = useAuthStore((state) => state.user);
    const isAuthLoading = useAuthStore((state) => state.isLoading);
    const [qrImageUrl, setQrImageUrl] = useState(null);
    const [autoPromotion, setAutoPromotion] = useState(null);
    const [manualVoucher, setManualVoucher] = useState(null);
    const [codeVouchers, setCodeVouchers] = useState([]);
    const [voucherCode, setVoucherCode] = useState('');
    const [voucherLoading, setVoucherLoading] = useState(false);
    const [authoritativePayment, setAuthoritativePayment] = useState(null);
    const [invoiceInfo, setInvoiceInfo] = useState({ wantInvoice: false });
    const invoiceVatUiEnabled = isInvoiceVatUiEnabled();

    const appliedVoucher = manualVoucher || autoPromotion;
    const effectiveOriginalAmount = Number(authoritativePayment?.originalAmount ?? displayPrice);
    const discountAmount = Number(
        authoritativePayment?.discountAmount ?? appliedVoucher?.discountAmount ?? 0,
    );
    const finalAmount = Number(
        authoritativePayment?.discount?.finalAmount ??
        Math.max(0, effectiveOriginalAmount - discountAmount),
    );
    const vatBreakdown = computeDisplayVat(finalAmount);
    const payableAmount = Number(authoritativePayment?.amount ?? vatBreakdown.gross);
    const isInvoiceValid = !invoiceVatUiEnabled || finalAmount <= 0 || isInvoiceInfoValid(invoiceInfo);

    // Parse VietQR một lần khi raw code đổi
    const qrInfo = useMemo(() => (qrRawCode ? parseVietQR(qrRawCode) : null), [qrRawCode]);
    const bank = useMemo(() => (qrInfo?.bin ? lookupBankByBin(qrInfo.bin) : null), [qrInfo]);

    // Countdown tới expiredAt
    useEffect(() => {
        if (!expiredAt) {
            setSecondsLeft(null);
            return undefined;
        }
        const tick = () => {
            const now = Math.floor(Date.now() / 1000);
            const left = Math.max(0, expiredAt - now);
            setSecondsLeft(left);
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => clearInterval(id);
    }, [expiredAt]);

    const qrExpired = expiredAt !== null && secondsLeft !== null && secondsLeft <= 0;

    const applyAuthoritativePayment = (result) => {
        const serverDiscount = result?.discount || null;
        const source = serverDiscount?.source || null;
        const serverDiscountAmount = Number(result?.discountAmount ?? serverDiscount?.discountAmount ?? 0);
        const serverOriginalAmount = Number(result?.originalAmount ?? displayPrice);
        const serverFinalAmount = Number(
            serverDiscount?.finalAmount ?? Math.max(0, serverOriginalAmount - serverDiscountAmount),
        );
        const serverAmount = Number(result?.amount ?? serverFinalAmount);
        const previewSource = manualVoucher
            ? (manualVoucher.offerMode || 'public_code')
            : (autoPromotion ? 'automatic' : null);
        const previewCode = manualVoucher?.code || null;
        const changed =
            source !== previewSource ||
            (source && source !== 'automatic' && serverDiscount?.code !== previewCode) ||
            serverDiscountAmount !== discountAmount ||
            serverAmount !== payableAmount;

        setAuthoritativePayment({
            originalAmount: serverOriginalAmount,
            discountAmount: serverDiscountAmount,
            amount: serverAmount,
            discount: {
                ...serverDiscount,
                source,
                originalAmount: serverOriginalAmount,
                discountAmount: serverDiscountAmount,
                finalAmount: serverFinalAmount,
            },
        });

        if (source === 'automatic') {
            setManualVoucher(null);
            setAutoPromotion((current) => ({
                ...current,
                ...serverDiscount,
                offerMode: 'automatic',
                discountAmount: serverDiscountAmount,
                finalAmount: serverFinalAmount,
            }));
        } else if (source === 'public_code' || source === 'private_code') {
            setManualVoucher((current) => ({
                ...current,
                ...(result?.voucher || {}),
                ...serverDiscount,
                offerMode: source,
                discountAmount: serverDiscountAmount,
                finalAmount: serverFinalAmount,
            }));
        } else {
            setManualVoucher(null);
            setAutoPromotion(null);
        }

        if (changed) toast(t('checkout.discountUpdated'));
    };

    const createPayment = async ({ regenerate = false } = {}) => {
        if (!isCustomPlan && !plan) {
            navigate('/pricing', { replace: true });
            return;
        }
        if (isCustomPlan && !customQuantities) {
            navigate('/pricing', { replace: true });
            return;
        }

        try {
            if (invoiceVatUiEnabled && finalAmount > 0 && !isInvoiceInfoValid(invoiceInfo)) {
                toast.error(t('invoiceVat.fillRequiredFields'));
                return;
            }
            setLoading(true);
            if (!regenerate) {
                trackEvent('begin_checkout', {
                    currency: 'VND',
                    value: payableAmount,
                    items: [{ item_id: voucherPlanCode, item_name: planName }],
                });
            }
            const userEmail = location.state?.userEmail || user?.email;
            if (!userEmail) {
                if (isAuthLoading) {
                    return;
                }
                setError(t('checkout.userEmailNotFound'));
                setLoading(false);
                return;
            }

            if (isCustomPlan) {
                const { data } = await checkoutApiService.createCustomPayment({
                    quantities: customQuantities,
                    billingPeriod,
                    explicitVoucherCode: manualVoucher?.code || null,
                    voucherCode: null,
                    reusePlanId,
                    invoiceInfo: invoiceVatUiEnabled ? invoiceInfo : { wantInvoice: false },
                });
                if (!data.success) throw new Error(data.message);

                applyAuthoritativePayment(data.result);

                if (data.result.noPayment) {
                    navigate('/payment-success', {
                        replace: true,
                        state: { orderCode: data.result.orderCode, fromCheckout: true },
                    });
                    return;
                }

                setOrderCode(data.result.orderCode);
                setQrRawCode(data.result.qrCode);
                setExpiredAt(data.result.expiredAt || null);
                const qrDataUrl = await QRCode.toDataURL(data.result.qrCode, { width: 240, margin: 1 });
                setQrImageUrl(qrDataUrl);
                setError(null);
                setCurrentStep('qr');
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
                billingPeriod,
                explicitVoucherCode: manualVoucher?.code || null,
                voucherCode: null,
                invoiceInfo: invoiceVatUiEnabled ? invoiceInfo : { wantInvoice: false },
            });
            if (!data.success) throw new Error(data.message);

            applyAuthoritativePayment(data.result);

            if (data.result.noPayment) {
                navigate('/payment-success', {
                    replace: true,
                    state: { orderCode: data.result.orderCode, fromCheckout: true },
                });
                return;
            }

            setOrderCode(data.result.orderCode);
            setQrRawCode(data.result.qrCode);
            setExpiredAt(data.result.expiredAt || null);
            const qrDataUrl = await QRCode.toDataURL(data.result.qrCode, { width: 240, margin: 1 });
            setQrImageUrl(qrDataUrl);
            setError(null);
            setCurrentStep('qr');
        } catch (err) {
            setError(err?.response?.data?.message || t('checkout.createOrderFailed'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isCustomPlan && !plan) {
            navigate('/pricing', { replace: true });
            return;
        }
        if (isCustomPlan && !customQuantities) {
            navigate('/pricing', { replace: true });
            return;
        }
        setLoading(false);
        const loadVouchers = async () => {
            try {
                const voucherParams = {
                    planCode: voucherPlanCode,
                    billingPeriod,
                    ...(isCustomPlan ? { amount: displayPrice } : {}),
                };
                const [autoRes, codeRes] = await Promise.all([
                    getAvailableVouchers(voucherParams),
                    getVoucherCodeSuggestions(voucherParams),
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
    }, [plan, isCustomPlan, user, isAuthLoading]);

    const applyVoucherCode = async (code = voucherCode) => {
        const normalized = String(code || '').trim().toUpperCase();
        if (!normalized) return;
        setVoucherLoading(true);
        try {
            const { data } = await validateVoucher({
                planCode: voucherPlanCode,
                billingPeriod,
                code: normalized,
                ...(isCustomPlan ? { amount: displayPrice } : {}),
            });
            setManualVoucher(data.data.voucher);
            setAuthoritativePayment(null);
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

    if (!isCustomPlan && !plan) return null;

    return (
        <div className="min-h-screen bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-orange-50 via-slate-50 to-slate-100 py-4 md:py-6 px-4 flex flex-col justify-center">
            <div className="max-w-5xl mx-auto w-full">

                {/* Top header navigation */}
                <div className="flex items-center justify-between mb-3 px-1">
                    {currentStep === 'info' ? (
                        <Link
                            to="/pricing"
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-orange-600 transition-colors"
                        >
                            <HiArrowLeft className="w-4 h-4" />
                            {t('checkout.changePlan')}
                        </Link>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setCurrentStep('info')}
                            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-orange-600 transition-colors"
                        >
                            <HiArrowLeft className="w-4 h-4" />
                            {t('checkout.backToEdit')}
                        </button>
                    )}

                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${currentStep === 'info' ? 'bg-orange-500' : 'bg-emerald-500'}`} />
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                            {currentStep === 'info' ? t('checkout.step1Title') : t('checkout.step2Title')}
                        </span>
                    </div>
                </div>

                {/* Main Card */}
                {currentStep === 'info' ? (
                    <div className="bg-white/80 border border-white/90 backdrop-blur-xl rounded-3xl shadow-xl shadow-slate-200/50 p-4 md:p-6">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">

                            {/* Cột Trái (7/12): Form VAT + lý do an tâm thanh toán */}
                            <div className="md:col-span-7 flex flex-col gap-3">
                                {invoiceVatUiEnabled && (
                                    <InvoiceVatForm
                                        netAmount={finalAmount}
                                        defaultEmail={user?.email || ''}
                                        defaultFullName={user?.name || user?.fullName || ''}
                                        defaultPhone={user?.phone || ''}
                                        onChange={setInvoiceInfo}
                                    />
                                )}

                                <div className="flex-1" />

                                <div className="rounded-2xl border border-slate-200/70 bg-slate-50/80 p-3.5 space-y-2">
                                    <div className="flex items-center gap-2 text-xs text-slate-600">
                                        <HiOutlineShieldCheck className="w-4 h-4 text-orange-500 shrink-0" />
                                        <span>{t('checkout.trustBadge1')}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-slate-600">
                                        <HiOutlineLightningBolt className="w-4 h-4 text-orange-500 shrink-0" />
                                        <span>{t('checkout.trustBadge2')}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-slate-600">
                                        <HiOutlineChatAlt2 className="w-4 h-4 text-orange-500 shrink-0" />
                                        <span>{t('checkout.trustBadge3')}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Cột Phải (5/12): Tóm tắt đơn hàng & Voucher & Chi tiết giá */}
                            <div className="md:col-span-5 space-y-3">
                                {/* Card Gói dịch vụ */}
                                <div className="bg-gradient-to-br from-orange-500/10 via-orange-500/5 to-transparent border border-orange-200/70 rounded-2xl p-4">
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                        <div>
                                            <span className="text-[10px] font-black uppercase tracking-widest text-orange-600">
                                                {t('checkout.membershipPlan')}
                                            </span>
                                            <h2 className="text-lg font-black text-slate-900 leading-tight mt-0.5">{planName}</h2>
                                        </div>
                                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200 shrink-0">
                                            {isYearly ? t('checkout.yearlyBilling') : t('checkout.monthlyBilling')}
                                        </span>
                                    </div>

                                    {/* Breakdown gói custom nếu có */}
                                    {isCustomPlan && customQuantities && (
                                        <div className="mt-2 pt-2 border-t border-orange-200/50 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-slate-600">
                                            {Object.entries(customQuantities)
                                                .filter(([k, v]) => k !== 'base_fee' && Number(v) > 0)
                                                .slice(0, 6)
                                                .map(([key, qty]) => (
                                                    <div key={key} className="flex justify-between">
                                                        <span className="text-slate-500 truncate">{t(`customPlan.items.${camelItemKey(key)}`)}:</span>
                                                        <span className="font-bold text-slate-800 ml-1">{Number(qty).toLocaleString('vi-VN')}</span>
                                                    </div>
                                                ))}
                                        </div>
                                    )}
                                </div>

                                {/* Mã giảm giá & Ưu đãi */}
                                <div className="bg-slate-50/80 border border-slate-200/70 rounded-2xl p-3">
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={voucherCode}
                                            onChange={(e) => setVoucherCode(e.target.value.toUpperCase())}
                                            placeholder={t('checkout.voucherPlaceholder')}
                                            className="flex-1 bg-white border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-200 focus:border-orange-300 font-mono uppercase"
                                        />
                                        {manualVoucher ? (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setManualVoucher(null);
                                                    setVoucherCode('');
                                                    setAuthoritativePayment(null);
                                                }}
                                                className="btn btn-secondary text-xs px-3 py-1.5 shrink-0"
                                            >
                                                {t('checkout.removeCode')}
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => applyVoucherCode()}
                                                disabled={voucherLoading || !voucherCode.trim()}
                                                className="btn btn-primary text-xs px-3 py-1.5 shrink-0 disabled:opacity-50"
                                            >
                                                {voucherLoading ? '...' : t('checkout.applyVoucher')}
                                            </button>
                                        )}
                                    </div>

                                    {/* Voucher chips */}
                                    {codeVouchers.length > 0 && !manualVoucher && (
                                        <div className="flex flex-wrap gap-1.5 mt-2">
                                            {codeVouchers.slice(0, 3).map((v) => (
                                                <button
                                                    key={v.code}
                                                    type="button"
                                                    onClick={() => applyVoucherCode(v.code)}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-orange-100/70 hover:bg-orange-200/80 border border-orange-200 text-[10px] font-bold text-orange-700 transition-colors"
                                                >
                                                    <span>🏷️ {v.code}</span>
                                                    <span className="opacity-75">(-{fmtVnd(v.discountAmount)})</span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Chi tiết giá tiền */}
                                <div className="bg-slate-50/80 border border-slate-200/70 rounded-2xl p-3.5 space-y-2 text-xs">
                                    <div className="flex justify-between text-slate-600">
                                        <span>{t('checkout.serviceFee')}</span>
                                        <span className="font-semibold text-slate-800">{fmtVnd(effectiveOriginalAmount)}</span>
                                    </div>

                                    {discountAmount > 0 && (
                                        <div className="flex justify-between text-emerald-600 font-semibold">
                                            <span>{t('checkout.discount')} ({appliedVoucher?.code || 'Ưu đãi'})</span>
                                            <span>-{fmtVnd(discountAmount)}</span>
                                        </div>
                                    )}

                                    <div className="flex justify-between text-slate-500 text-[11px] pt-1 border-t border-slate-200/60">
                                        <span>{t('checkout.vatExempt')}</span>
                                        <span>0 đ</span>
                                    </div>

                                    <div className="flex justify-between items-baseline pt-2 border-t border-slate-200 font-bold text-slate-900">
                                        <span className="text-sm">{t('checkout.total')}</span>
                                        <span className="text-xl font-black text-orange-600">{fmtVnd(payableAmount)}</span>
                                    </div>
                                </div>

                                {error && (
                                    <p className="text-red-600 text-xs text-center font-medium bg-red-50 p-2 rounded-xl border border-red-200">
                                        {error}
                                    </p>
                                )}

                                {/* Nút CTA Tiếp tục thanh toán */}
                                <button
                                    type="button"
                                    onClick={() => createPayment()}
                                    disabled={loading || !isInvoiceValid}
                                    title={!isInvoiceValid ? t('invoiceVat.fillRequiredFields') : undefined}
                                    className="w-full btn btn-primary py-3 rounded-xl text-sm font-bold shadow-lg shadow-orange-500/20 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.01]"
                                >
                                    {loading ? (
                                        <span>{t('checkout.checkingTransaction')}</span>
                                    ) : (
                                        <>
                                            <span>{t('checkout.proceedToPayment')}</span>
                                            <span className="bg-black/10 px-2 py-0.5 rounded-full text-xs font-black">
                                                {fmtVnd(payableAmount)}
                                            </span>
                                            <span>→</span>
                                        </>
                                    )}
                                </button>

                                <p className="text-[10px] text-center text-slate-400 font-medium">
                                    🔒 {t('checkout.securityBadge')}
                                </p>
                            </div>
                        </div>
                    </div>
                ) : (
                    /* Step 2: Màn hình QR + thông tin thanh toán */
                    <div className="bg-white/85 border border-white/90 backdrop-blur-xl rounded-3xl shadow-xl shadow-slate-200/50 p-4 md:p-6">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-start">

                            {/* Cột Trái (5/12): QR + countdown */}
                            <div className="md:col-span-5 flex flex-col items-center">
                                <div className="bg-gradient-to-b from-orange-500/5 to-transparent border border-orange-200/50 rounded-2xl p-4 w-full flex flex-col items-center">
                                    <div className="bg-white p-3 rounded-2xl shadow-md border border-slate-100 mb-3">
                                        {qrExpired ? (
                                            <div className="w-52 h-52 flex flex-col items-center justify-center text-center text-slate-500 gap-2 px-2">
                                                <HiOutlineExclamationCircle className="w-10 h-10 text-red-500" />
                                                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
                                                    {t('checkout.qrExpired')}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => createPayment({ regenerate: true })}
                                                    disabled={loading}
                                                    className="mt-1 text-[10px] font-bold text-orange-600 hover:text-orange-700 underline disabled:opacity-50"
                                                >
                                                    {loading ? t('checkout.qrRegenerating') : t('checkout.qrRegenerate')}
                                                </button>
                                            </div>
                                        ) : qrImageUrl ? (
                                            <img src={qrImageUrl} alt="Mã QR thanh toán PayOS" className="w-52 h-52 object-contain rounded-lg" />
                                        ) : (
                                            <div className="w-52 h-52 flex items-center justify-center text-slate-400 text-xs">
                                                {t('checkout.checkingTransaction')}
                                            </div>
                                        )}
                                    </div>

                                    {/* Countdown */}
                                    {!qrExpired && secondsLeft !== null && (
                                        <div className={`inline-flex items-center gap-1.5 text-[11px] font-bold bg-white/80 px-3 py-1.5 rounded-full border shadow-sm ${
                                            secondsLeft <= 60
                                                ? 'text-red-600 border-red-200 animate-pulse'
                                                : 'text-slate-700 border-orange-200'
                                        }`}>
                                            <HiOutlineClock className="w-3.5 h-3.5" />
                                            <span>{t('checkout.qrExpiresIn')}</span>
                                            <span className="font-mono">{formatCountdown(secondsLeft)}</span>
                                        </div>
                                    )}

                                    {/* Auto redirect hint */}
                                    <p className="text-[10px] text-slate-400 mt-3 text-center leading-tight">
                                        {t('checkout.autoRedirect')}
                                    </p>
                                </div>
                            </div>

                            {/* Cột Phải (7/12): Số tiền, Order Code, Bank info, Manual transfer guide */}
                            <div className="md:col-span-7 space-y-4">

                                {/* Box Số tiền cần thanh toán */}
                                <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-2xl p-4 shadow-lg shadow-orange-500/20 flex items-center justify-between">
                                    <div>
                                        <p className="text-[10px] font-bold uppercase tracking-widest text-orange-100">
                                            {t('checkout.amountDue')}
                                        </p>
                                        <p className="text-xs text-white/90 mt-0.5">{planName} ({isYearly ? t('checkout.yearlyBilling') : t('checkout.monthlyBilling')})</p>
                                    </div>
                                    <span className="text-2xl font-black">{fmtVnd(payableAmount)}</span>
                                </div>

                                {/* Box Mã đơn hàng */}
                                {orderCode && (
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-between">
                                        <div>
                                            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                                                {t('checkout.orderCode')}
                                            </span>
                                            <p className="text-sm font-mono font-bold text-slate-800">#{orderCode}</p>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                navigator.clipboard.writeText(String(orderCode));
                                                toast.success(t('checkout.copied'));
                                            }}
                                            className="btn btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5"
                                        >
                                            <HiOutlineDuplicate className="w-4 h-4" />
                                            <span>{t('checkout.copy')}</span>
                                        </button>
                                    </div>
                                )}

                                {/* Bank info block */}
                                <div className="bg-slate-50/80 border border-slate-200/70 rounded-2xl p-3.5 space-y-2.5">
                                    <div className="flex items-center gap-2 mb-1">
                                        <HiOutlineClipboardList className="w-4 h-4 text-orange-500 shrink-0" />
                                        <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                            {t('checkout.bankInfoTitle')}
                                        </p>
                                    </div>
                                    <p className="text-[11px] text-slate-500 leading-snug">
                                        {t('checkout.bankInfoSubtitle')}
                                    </p>

                                    {!qrInfo?.valid ? (
                                        <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg p-3 flex items-start gap-2">
                                            <HiOutlineExclamationCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                            <p className="text-[11px] text-amber-700 leading-snug">
                                                {qrInfo?.error ? t('checkout.qrCorrupted') : t('checkout.checkingTransaction')}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 gap-1.5 mt-1">
                                            <CopyRow
                                                label={t('checkout.bankNameLabel')}
                                                value={bank?.name || qrInfo.bin}
                                                displayValue={bank ? `${bank.name} (${bank.short})` : qrInfo.bin}
                                                t={t}
                                            />
                                            <CopyRow
                                                label={t('checkout.accountNumberLabel')}
                                                value={qrInfo.accountNumber}
                                                displayValue={qrInfo.accountNumber ? formatAccountNumber(qrInfo.accountNumber) : '—'}
                                                t={t}
                                            />
                                            <CopyRow
                                                label={t('checkout.accountNameLabel')}
                                                value={qrInfo.merchantName}
                                                displayValue={qrInfo.merchantName || '—'}
                                                hint={qrInfo.merchantName ? t('checkout.accountNameDisclaimer') : null}
                                                t={t}
                                            />
                                            <CopyRow
                                                label={t('checkout.amountLabel')}
                                                value={String(payableAmount)}
                                                displayValue={fmtVnd(payableAmount)}
                                                t={t}
                                            />
                                            <CopyRow
                                                label={t('checkout.descriptionLabel')}
                                                value={qrInfo.description || (orderCode ? `TT ${orderCode}` : null)}
                                                displayValue={qrInfo.description || (orderCode ? `TT ${orderCode}` : '—')}
                                                hint={t('checkout.descriptionHint')}
                                                t={t}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Manual transfer guide */}
                                <div className="bg-gradient-to-br from-orange-50/60 to-transparent border border-orange-200/70 rounded-2xl p-3.5 space-y-2">
                                    <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                                        {t('checkout.manualTransferTitle')}
                                    </p>
                                    {[t('checkout.manualTransferStep1'), t('checkout.manualTransferStep2'), t('checkout.manualTransferStep3')].map((step, i) => (
                                        <div key={i} className="flex items-center gap-3 text-xs text-slate-700 bg-white/80 p-2.5 rounded-xl border border-white">
                                            <span className="shrink-0 w-5 h-5 rounded-full bg-gradient-to-br from-orange-500 to-red-500 text-white text-[10px] font-black flex items-center justify-center shadow-sm">
                                                {i + 1}
                                            </span>
                                            <span className="font-medium leading-snug">{step}</span>
                                        </div>
                                    ))}
                                    <p className="text-[10px] text-slate-500 italic leading-tight pt-1 border-t border-orange-200/40">
                                        {t('checkout.manualTransferCaveat')}
                                    </p>
                                </div>

                                {/* Footer support */}
                                <div className="pt-2 border-t border-slate-200/70 flex items-center justify-between text-xs text-slate-500">
                                    <p>
                                        {t('checkout.needHelp')}{' '}
                                        <Link to="/contact" className="text-orange-600 hover:text-orange-700 font-bold underline">
                                            {t('checkout.contactSupport')}
                                        </Link>
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setCurrentStep('info')}
                                        className="text-xs text-slate-500 hover:text-slate-800 font-medium underline"
                                    >
                                        {t('checkout.backToEdit')}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default CheckoutPage;
