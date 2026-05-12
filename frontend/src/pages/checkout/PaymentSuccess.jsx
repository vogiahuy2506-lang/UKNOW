import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { FaCheckCircle, FaRocket, FaArrowRight } from 'react-icons/fa';
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
            // Lấy orderCode từ URL params (?orderCode=...) hoặc từ navigate state
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
        // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ verify 1 lần lúc mount
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!verified) return null;

    return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-4">
            <div className="max-w-md w-full text-center">
                <div className="relative mb-8">
                    <div className="absolute inset-0 bg-orange-100 rounded-full blur-2xl opacity-50 animate-pulse"></div>
                    <FaCheckCircle className="relative text-8xl text-orange-500 mx-auto" />
                </div>

                <h1 className="text-4xl font-black text-gray-900 mb-2">Thanh toán thành công!</h1>
                <p className="text-gray-500 mb-8 font-medium">
                    Chào mừng bạn đến với Founder AI. Tài khoản của bạn đã được kích hoạt.
                </p>

                <div className="bg-gray-50 rounded-3xl p-6 border border-gray-100 mb-8 text-left">
                    <div className="flex justify-between items-center mb-4 pb-4 border-b border-gray-200">
                        <span className="text-gray-400 text-sm font-bold uppercase tracking-widest">Mã đơn hàng</span>
                        <span className="text-gray-900 font-mono font-bold">#{orderCode}</span>
                    </div>
                    <div className="space-y-3">
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                            <FaRocket className="text-orange-500" />
                            <span>Tất cả tính năng đã được mở khóa</span>
                        </div>
                        <div className="flex items-center gap-3 text-sm text-gray-600">
                            <FaRocket className="text-orange-500" />
                            <span>Hỗ trợ kỹ thuật 24/7 đã sẵn sàng</span>
                        </div>
                    </div>
                </div>

                <button
                    onClick={async () => { await initialize(); navigate('/app'); }}
                    className="w-full bg-gradient-to-r from-orange-600 to-red-500 text-white font-black py-4 rounded-2xl shadow-xl shadow-orange-500/30 hover:scale-[1.02] transition-all flex items-center justify-center gap-2 group"
                >
                    Khám phá Dashboard ngay
                    <FaArrowRight className="group-hover:translate-x-1 transition-transform" />
                </button>

                <p className="mt-8 text-gray-400 text-xs italic">
                    Một bản sao hóa đơn đã được gửi đến email của bạn.
                </p>
            </div>
        </div>
    );
};

export default PaymentSuccessPage;
