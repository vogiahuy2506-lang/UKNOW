import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import toast from 'react-hot-toast';
import { HiOutlineDuplicate, HiOutlineCheck } from 'react-icons/hi';
import { renderModal, MODAL_PANEL } from './planUtils.jsx';

// ── PaymentResultModal — hiển thị QR thanh toán sau khi tạo link PayOS ────────
export const PaymentResultModal = ({ qrCode, checkoutUrl, orderCode, planName, userEmail, onClose, onPaid }) => {
  const [qrImageUrl, setQrImageUrl] = useState(null);
  const [copied, setCopied] = useState(false);
  // Trạng thái đơn hàng được poll từ backend: pending | success | cancelled
  const [paymentStatus, setPaymentStatus] = useState('pending');

  useEffect(() => {
    if (qrCode) {
      QRCode.toDataURL(qrCode, { width: 200, margin: 1 }).then(setQrImageUrl);
    }
  }, [qrCode]);

  // Polling mỗi 3s để biết khách đã thanh toán hay chưa
  useEffect(() => {
    if (!orderCode || paymentStatus !== 'pending') return;
    const intervalId = setInterval(async () => {
      try {
        const res = await fetch(`/api/payments/status/${orderCode}`);
        const data = await res.json();
        if (data.status === 'success') {
          setPaymentStatus('success');
          toast.success(`Khách hàng ${userEmail} đã thanh toán thành công!`, { duration: 6000 });
          onPaid?.();
        } else if (data.status === 'cancelled') {
          setPaymentStatus('cancelled');
          toast.error('Khách hàng đã huỷ giao dịch');
        }
      } catch {
        // Bỏ qua lỗi mạng tạm thời, tiếp tục poll
      }
    }, 3000);
    return () => clearInterval(intervalId);
  }, [orderCode, paymentStatus, userEmail, onPaid]);

  const handleCopy = () => {
    navigator.clipboard.writeText(checkoutUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const isPaid = paymentStatus === 'success';
  const isCancelled = paymentStatus === 'cancelled';

  return renderModal(
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold text-gray-900">
          {isPaid ? 'Đã thanh toán thành công' : isCancelled ? 'Giao dịch đã huỷ' : 'Link thanh toán đã sẵn sàng'}
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Gói <strong>{planName}</strong> — {isPaid
            ? <>đã kích hoạt cho <strong>{userEmail}</strong>.</>
            : <>gửi QR hoặc link này cho <strong>{userEmail}</strong> qua Zalo.</>}
        </p>
      </div>

      {/* Trạng thái polling — chỉ hiện khi chưa thanh toán */}
      {!isPaid && !isCancelled && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-700">
          <div className="w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <span>Đang chờ khách hàng thanh toán… (tự cập nhật mỗi 3s)</span>
        </div>
      )}

      {isPaid && (
        <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-3 py-3 text-sm text-green-700">
          <HiOutlineCheck className="w-5 h-5 shrink-0" />
          <span>Gói đã được gán cho khách hàng. Đóng modal này để xem lại trong danh sách gói.</span>
        </div>
      )}

      {/* QR code — chỉ hiện khi chưa thanh toán */}
      {!isPaid && (
        <div className="flex flex-col items-center gap-3">
          <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm w-52 h-52 flex items-center justify-center">
            {qrImageUrl
              ? <img src={qrImageUrl} alt="QR thanh toán" className="w-44 h-44 rounded-lg" />
              : <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
            }
          </div>
          <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">Quét để thanh toán</p>
        </div>
      )}

      {/* Order code */}
      <div
        onClick={() => { navigator.clipboard.writeText(String(orderCode)); toast.success('Đã copy mã đơn hàng'); }}
        className={`cursor-pointer flex items-center justify-between text-white rounded-xl px-4 py-3 ${
          isPaid ? 'bg-green-600' : isCancelled ? 'bg-gray-500' : 'bg-orange-500'
        }`}
      >
        <div>
          <p className="text-[10px] font-bold text-white/70 uppercase mb-0.5">Mã đơn hàng</p>
          <p className="font-bold text-lg">{orderCode}</p>
        </div>
        <HiOutlineDuplicate className="w-5 h-5 text-white/70" />
      </div>

      {/* Checkout URL — chỉ hiện khi chưa thanh toán */}
      {!isPaid && (
        <div className="flex items-center gap-2">
          <input
            readOnly
            value={checkoutUrl}
            className="input flex-1 text-xs text-gray-500 truncate"
          />
          <button type="button" onClick={handleCopy} className={`btn shrink-0 ${copied ? 'btn-primary' : 'btn-secondary'}`}>
            {copied
              ? <><HiOutlineCheck className="w-4 h-4 mr-1" />Đã copy</>
              : <><HiOutlineDuplicate className="w-4 h-4 mr-1" />Copy link</>
            }
          </button>
        </div>
      )}

      <button type="button" className={`btn w-full ${isPaid ? 'btn-primary bg-green-600 hover:bg-green-700 border-green-600' : 'btn-primary'}`} onClick={onClose}>
        {isPaid ? 'Đóng' : 'Đóng (tiếp tục chờ ở background)'}
      </button>
    </div>,
    onClose,
    MODAL_PANEL
  );
};
