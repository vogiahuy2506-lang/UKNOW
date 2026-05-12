import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { HiArrowLeft, HiOutlineDuplicate, HiShieldCheck, HiLightningBolt } from 'react-icons/hi';
import { FaCrown, FaQuestionCircle } from 'react-icons/fa';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';
import api from '../../services/api';
import QRCode from 'qrcode';

const CheckoutPage = () => {
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

    const handleCopy = (text) => {
        navigator.clipboard.writeText(text);
        toast.success('Đã sao chép nội dung!');
    };

    // Tạo payment link khi load trang
    useEffect(() => {
        if (!plan) {
            navigate('/about', { replace: true });
            return;
        }

        const createPayment = async () => {
            try {
                const userEmail = location.state?.userEmail || user?.email;

                if (!userEmail) {
                    if (isAuthLoading) {
                        return;
                    }
                    setError('Không tìm thấy email người dùng. Vui lòng đăng nhập lại.');
                    setLoading(false);
                    return;
                }

                const { data } = await api.post('/payments/create-payment', {
                    planCode: plan.code,
                    userEmail,
                });
                if (!data.success) throw new Error(data.message);

                setOrderCode(data.result.orderCode);
                const qrString = data.result.qrCode;
                const qrDataUrl = await QRCode.toDataURL(qrString, { width: 200, margin: 1 });
                setQrImageUrl(qrDataUrl);
                setOrderCode(data.result.orderCode);
                setError(null);
            } catch (err) {
                setError('Không thể tạo đơn hàng. Vui lòng thử lại.');
            } finally {
                setLoading(false);
            }
        };

        createPayment();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate/location stable; chỉ tạo payment khi plan/user/auth-state đổi
    }, [plan, user, isAuthLoading]);

    // Polling mỗi 3 giây sau khi có orderCode
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
                    toast.error('Giao dịch đã bị huỷ');
                }
            } catch {
                // Bỏ qua lỗi mạng tạm thời, tiếp tục polling
            }
        }, 3000);

        return () => clearInterval(pollingRef.current);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- navigate stable; chỉ poll khi orderCode đổi
    }, [orderCode]);

    if (!plan) return null;

    return (
        <div className="min-h-screen bg-[#fafafa] flex flex-col font-sans">
            <div className="flex-grow pt-10 pb-20">
                <div className="max-w-6xl mx-auto px-4">

                    <button
                        onClick={() => navigate(-1)}
                        className="inline-flex items-center text-sm font-bold text-gray-400 hover:text-orange-500 mb-8 transition-colors group"
                    >
                        <HiArrowLeft className="mr-2 group-hover:-translate-x-1 transition-transform" />
                        Thay đổi gói dịch vụ
                    </button>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">

                        {/* CỘT TRÁI: TÓM TẮT ĐƠN HÀNG */}
                        <div className="lg:col-span-5 space-y-6">
                            <div className="bg-white rounded-3xl p-8 shadow-sm border border-gray-100">
                                <h2 className="text-lg font-black text-gray-900 mb-6">Chi tiết đăng ký</h2>

                                <div className="p-5 rounded-2xl bg-orange-50 border border-orange-100 relative overflow-hidden mb-6">
                                    <div className="relative z-10">
                                        <div className="flex items-center gap-2 mb-1">
                                            <span className="text-[10px] font-bold text-orange-600 uppercase tracking-widest">Gói thành viên</span>
                                            {plan.code === 'pro' && <FaCrown className="text-orange-500 text-xs" />}
                                        </div>
                                        <h3 className="text-2xl font-black text-gray-900">{plan.name}</h3>
                                        <p className="text-sm text-gray-500 mt-1">Thanh toán theo tháng</p>
                                    </div>
                                    <div className="absolute -right-4 -bottom-4 text-orange-200/30 text-8xl font-black italic">U</div>
                                </div>

                                <div className="space-y-4 text-sm font-medium">
                                    <div className="flex justify-between text-gray-500">
                                        <span>Phí dịch vụ</span>
                                        <span>{(plan.price / 1000).toFixed(0)}K</span>
                                    </div>
                                    <div className="flex justify-between text-green-600 italic">
                                        <span>Ưu đãi dùng thử 14 ngày</span>
                                        <span>- 0đ</span>
                                    </div>
                                    <div className="pt-4 border-t border-dashed border-gray-200 flex justify-between items-end">
                                        <div>
                                            <span className="block font-bold text-gray-900 text-base">Tổng cộng</span>
                                            <span className="text-[10px] text-gray-400 font-normal">Đã bao gồm thuế VAT</span>
                                        </div>
                                        <span className="text-3xl font-black text-gray-900">
                                            {(plan.price / 1000).toFixed(0)}K
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center gap-3">
                                    <HiShieldCheck className="text-orange-500 text-2xl shrink-0" />
                                    <span className="text-[11px] font-bold text-gray-500 leading-tight">BẢO MẬT DỮ LIỆU</span>
                                </div>
                                <div className="bg-white p-4 rounded-2xl border border-gray-100 flex items-center gap-3">
                                    <HiLightningBolt className="text-orange-500 text-2xl shrink-0" />
                                    <span className="text-[11px] font-bold text-gray-500 leading-tight">KÍCH HOẠT NHANH</span>
                                </div>
                            </div>
                        </div>

                        {/* CỘT PHẢI: THANH TOÁN */}
                        <div className="lg:col-span-7">
                            <div className="bg-white rounded-[2.5rem] p-10 shadow-2xl shadow-orange-500/5 border border-orange-100 relative">
                                <div className="absolute top-0 right-10 -translate-y-1/2">
                                    <div className="bg-orange-500 text-white px-4 py-1 rounded-full text-[10px] font-black tracking-tighter shadow-lg shadow-orange-500/30">
                                        GIAO DỊCH AN TOÀN
                                    </div>
                                </div>

                                <div className="flex flex-col md:flex-row gap-10 items-center">
                                    {/* QR Code */}
                                    <div className="shrink-0">
                                        <div className="relative group">
                                            <div className="absolute -inset-4 bg-gradient-to-tr from-orange-500/20 to-red-500/20 rounded-[2rem] blur-xl group-hover:blur-2xl transition-all"></div>
                                            <div className="relative bg-white p-3 rounded-[1.5rem] border border-gray-100 shadow-sm w-56 h-56 flex items-center justify-center">
                                                {loading && (
                                                    <div className="w-8 h-8 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
                                                )}
                                                {error && (
                                                    <p className="text-red-500 text-xs text-center">{error}</p>
                                                )}
                                                {qrImageUrl && (
                                                    <img src={qrImageUrl} alt="QR" className="w-48 h-48 rounded-lg" />
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-center mt-4 text-gray-400 font-bold uppercase tracking-widest">Quét để thanh toán</p>
                                    </div>

                                    {/* Hướng dẫn */}
                                    <div className="flex-1 w-full space-y-4">
                                        <div className="text-center md:text-left">
                                            <h2 className="text-xl font-black text-gray-900">Hướng dẫn thanh toán</h2>
                                            <p className="text-sm text-gray-400 mt-1">Vui lòng quét mã QR bằng app ngân hàng để thanh toán.</p>
                                        </div>
                                        {orderCode && (
                                            <div
                                                onClick={() => handleCopy(String(orderCode))}
                                                className="group cursor-pointer p-4 bg-orange-500 rounded-2xl border border-orange-400 shadow-lg shadow-orange-500/20 transition-all hover:scale-[1.02]"
                                            >
                                                <p className="text-[10px] font-black text-orange-100 uppercase mb-1">Mã đơn hàng</p>
                                                <div className="flex justify-between items-center">
                                                    <span className="font-bold text-white text-lg">{orderCode}</span>
                                                    <HiOutlineDuplicate className="text-white/70" />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                {/* Status bar */}
                                <div className="mt-10 pt-8 border-t border-gray-50 flex flex-col items-center">
                                    <div className="flex items-center gap-3 mb-2">
                                        <div className="flex gap-1">
                                            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse"></span>
                                            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse [animation-delay:0.2s]"></span>
                                            <span className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-pulse [animation-delay:0.4s]"></span>
                                        </div>
                                        <span className="text-[11px] font-black text-gray-400 uppercase tracking-widest">Đang kiểm tra giao dịch...</span>
                                    </div>
                                    <p className="text-[10px] text-gray-300 italic">Hệ thống sẽ tự động chuyển hướng khi nhận được tiền</p>
                                </div>
                            </div>

                            <div className="mt-6 flex items-center justify-center gap-2 text-gray-400 text-sm font-medium">
                                <FaQuestionCircle />
                                <span>Gặp khó khăn? <a href="#" className="text-orange-500 underline">Liên hệ hỗ trợ 24/7</a></span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CheckoutPage;
