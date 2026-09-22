import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { HiOutlineClipboardList, HiOutlineQrcode } from 'react-icons/hi';
import { lookupBankByBin, formatAccountNumber } from '../../../utils/payosBankBinMap';

/**
 * VietQrMessage — render card VietQR trong chat message (vietqr-chat-hero-landing).
 *
 * Props:
 *  - vietqrString: chuỗi EMVCo đã có CRC (BE trả về từ /api/system/payment-account/qr)
 *  - account: { account_name, account_number, bank_bin, bank_name }
 *  - amount: number (VND)
 *  - description: string | null
 *
 * Render: card chứa thông tin TK (copy-able) + ảnh QR 220x220 + caption "Quét QR để thanh toán".
 *
 * NOTE: formatAccountNumber/lookupBankByBin từ payosBankBinMap.js (đã có sẵn ở
 * `frontend/src/utils/payosBankBinMap.js` — dùng chung với CheckoutPage). Tránh
 * duplicate code, lợi dụng hàm có sẵn để format STK + tra BIN.
 */
export default function VietQrMessage({
  vietqrString,
  account,
  amount,
  description,
  t,
}) {
  const [qrUrl, setQrUrl] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let mounted = true;
    QRCode.toDataURL(vietqrString, {
      width: 400,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#000000',
        light: '#FFFFFF',
      },
    })
      .then((url) => {
        if (mounted) setQrUrl(url);
      })
      .catch((e) => {
        if (mounted) setErr(e.message);
      });
    return () => {
      mounted = false;
    };
  }, [vietqrString]);

  if (err) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
        Không render được QR: {err}
      </div>
    );
  }

  const bank = lookupBankByBin(account.bank_bin);
  const fmtVnd = (n) => Number(n || 0).toLocaleString('vi-VN') + ' đ';

  const handleCopy = async (value) => {
    try {
      await navigator.clipboard.writeText(String(value ?? ''));
    } catch {
      // Silent fail — copy is nice-to-have, không block UX
    }
  };

  return (
    <div className="mt-2 max-w-xs rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <HiOutlineClipboardList className="h-4 w-4 text-orange-500" />
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-900">
          {t?.('heroPage.heroConsultation.paymentQrTitle') || 'Thông tin thanh toán'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-1 text-xs">
        <CopyRow
          label={t?.('heroPage.heroConsultation.paymentBankLabel') || 'Ngân hàng'}
          value={bank ? `${bank.name} (${bank.short})` : account.bank_name}
          onCopy={() => handleCopy(account.bank_name)}
        />
        <CopyRow
          label={t?.('heroPage.heroConsultation.paymentAccountLabel') || 'Số TK'}
          value={formatAccountNumber(account.account_number) || account.account_number}
          onCopy={() => handleCopy(account.account_number)}
        />
        <CopyRow
          label={t?.('heroPage.heroConsultation.paymentNameLabel') || 'Tên TK'}
          value={account.account_name}
          onCopy={() => handleCopy(account.account_name)}
        />
        <CopyRow
          label={t?.('heroPage.heroConsultation.paymentAmountLabel') || 'Số tiền'}
          value={fmtVnd(amount)}
          onCopy={() => handleCopy(String(amount))}
        />
        {description && (
          <CopyRow
            label={t?.('heroPage.heroConsultation.paymentDescLabel') || 'Nội dung CK'}
            value={description}
            onCopy={() => handleCopy(description)}
          />
        )}
      </div>

      <div className="mt-3 flex flex-col items-center">
        {qrUrl ? (
          <img
            src={qrUrl}
            alt="VietQR"
            width={280}
            height={280}
            className="rounded-lg border border-slate-200"
            style={{ width: '280px', height: '280px' }}
          />
        ) : (
          <div className="flex h-[280px] w-[280px] items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
            <HiOutlineQrcode className="h-12 w-12 animate-pulse text-slate-300" />
          </div>
        )}
        <p className="mt-2 text-[11px] text-slate-500">
          {t?.('heroPage.heroConsultation.paymentScanQr') || 'Quét mã QR để thanh toán'}
        </p>
      </div>
    </div>
  );
}

function CopyRow({ label, value, onCopy }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded border border-slate-100 bg-slate-50 px-2 py-1">
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
        <p className="break-all text-xs font-medium text-slate-900">{value}</p>
      </div>
      <button
        type="button"
        onClick={onCopy}
        className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium text-orange-600 hover:bg-orange-100"
        title="Copy"
      >
        Copy
      </button>
    </div>
  );
}
