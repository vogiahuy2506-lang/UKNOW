import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { HiOutlineCheckCircle, HiArrowRight, HiOutlineDocumentText } from 'react-icons/hi';
import { useAuthStore } from '../../stores/authStore';

const PaymentSuccessPage = () => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const location = useLocation();
    const initialize = useAuthStore((state) => state.initialize);

    const [verified, setVerified] = useState(false);
    const [loading, setLoading] = useState(true);
    const [orderCode, setOrderCode] = useState(null);

    useEffect(() => {
        const verify = async () => {
            const code = searchParams.get('orderCode') || location.state?.orderCode;
            if (!code) {
                navigate('/', { replace: true });
                return;
            }
            try {
                const res = await fetch(`/api/payments/status/${code}`);
                const data = await res.json();
                if (data.status === 'success') {
                    setVerified(true);
                    setOrderCode(code);
                } else {
                    navigate('/checkout', { replace: true });
                }
            } catch {
                navigate('/', { replace: true });
            } finally {
                setLoading(false);
            }
        };
        verify();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!verified) return null;

    return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
            <div className="w-full max-w-md">

                {/* Icon */}
                <div className="flex justify-center mb-6">
                    <div className="w-20 h-20 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                        <HiOutlineCheckCircle className="text-5xl text-emerald-500" />
                    </div>
                </div>

                {/* Title */}
                <div className="text-center mb-6">
                    <h1 className="text-2xl font-black text-slate-900 mb-1">Thanh toán thành công!</h1>
                    <p className="text-sm text-slate-500">
                        Chào mừng bạn đến với Founder AI. Tài khoản của bạn đã được kích hoạt.
                    </p>
                </div>

                {/* Order summary card */}
                <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 mb-4">
                    <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100">
                        <div className="flex items-center gap-2 text-sm text-slate-500">
                            <HiOutlineDocumentText className="text-base" />
                            <span className="font-semibold uppercase tracking-wider text-[11px]">Mã đơn hàng</span>
                        </div>
                        <span className="font-mono font-bold text-slate-900 text-sm">#{orderCode}</span>
                    </div>

                    <div className="space-y-3">
                        {[
                            'Tất cả tính năng đã được mở khóa',
                            'Hỗ trợ kỹ thuật 24/7 đã sẵn sàng',
                            'Hoá đơn đã được gửi đến email của bạn',
                        ].map((item) => (
                            <div key={item} className="flex items-center gap-3 text-sm text-slate-600">
                                <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                </div>
                                <span>{item}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* CTA button */}
                <button
                    onClick={async () => { await initialize(); navigate('/app'); }}
                    className="w-full btn btn-primary py-3 font-bold text-base rounded-xl gap-2 group"
                >
                    Khám phá Dashboard ngay
                    <HiArrowRight className="group-hover:translate-x-0.5 transition-transform" />
                </button>
            </div>
        </div>
    );
};

export default PaymentSuccessPage;
