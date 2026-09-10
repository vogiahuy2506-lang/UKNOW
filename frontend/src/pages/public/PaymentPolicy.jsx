import { useState } from 'react';

function getLangClass(activeLang, itemLang) {
  return activeLang === itemLang ? '' : 'hidden';
}

function PaymentPolicy() {
  const [language, setLanguage] = useState('vi');
  const lc = getLangClass;

  return (
    <div className="min-h-screen bg-slate-100/90 text-slate-900 antialiased">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');
        .pp-body { font-family: 'Be Vietnam Pro', system-ui, sans-serif; line-height: 1.7; font-size: 15px; }
        .pp-section {
          border-radius: 0.75rem;
          border: 1px solid rgb(226 232 240 / 0.95);
          background: #fff;
          box-shadow: 0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px -4px rgb(15 23 42 / 0.06);
        }
        .pp-section:hover {
          box-shadow: 0 1px 2px rgb(15 23 42 / 0.05), 0 12px 32px -6px rgb(15 23 42 / 0.08);
        }
        .pp-list {
          list-style-type: decimal;
          padding-left: 1.5rem;
        }
        .pp-list li {
          margin-bottom: 0.5rem;
        }
      `}</style>
      <div className="pp-body">
        {/* Header */}
        <header className="relative border-b border-slate-800/80 bg-slate-950 text-white">
          <div className="h-1 bg-gradient-to-r from-orange-500 via-red-500 to-pink-500" aria-hidden />
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage:
                'radial-gradient(ellipse 80% 50% at 50% -20%, rgb(249 115 22 / 0.12), transparent), radial-gradient(ellipse 60% 40% at 100% 0%, rgb(244 63 94 / 0.08), transparent)',
            }}
            aria-hidden
          />

          <div className="relative mx-auto max-w-4xl px-5 pb-12 pt-10 sm:px-8 sm:pb-14 sm:pt-12">
            <div className="mb-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 text-[13px] text-slate-400">
              <span className="font-semibold tracking-wide text-slate-200">DIGISO</span>
              <span className="hidden sm:inline text-slate-600" aria-hidden>|</span>
              <span className="rounded-md border border-slate-600/80 bg-slate-900/50 px-2.5 py-1 text-slate-300">
                founderai.biz
              </span>
            </div>

            <h1 className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'vi')}`}>
              Chính sách <span className="text-orange-400">Thanh toán</span>
            </h1>
            <h1 className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'en')}`}>
              Payment <span className="text-orange-400">Policy</span>
            </h1>

            <p className={`mt-3 text-center text-sm text-slate-400 ${lc(language, 'vi')}`}>
              Công ty TNHH Giải pháp số DIGISO
            </p>
            <p className={`mt-3 text-center text-sm text-slate-400 ${lc(language, 'en')}`}>
              DIGISO Digital Solutions Co., Ltd.
            </p>

            {/* Language Switcher */}
            <div className="mx-auto mt-8 flex w-full max-w-xs justify-center rounded-lg border border-slate-600/60 bg-slate-900/40 p-1 shadow-inner">
              <button
                type="button"
                onClick={() => setLanguage('vi')}
                className={`flex-1 rounded-md px-4 py-2.5 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                  language === 'vi'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                Tiếng Việt
              </button>
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`flex-1 rounded-md px-4 py-2.5 text-[13px] font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/80 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${
                  language === 'en'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'
                }`}
              >
                English
              </button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-4xl px-5 pb-24 pt-10 sm:px-8">
          {/* Meta info */}
          <div className="mb-8 flex flex-wrap items-start gap-x-4 gap-y-3 rounded-xl border border-slate-200/90 bg-white px-5 py-4 shadow-sm">
            <span
              className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-orange-500 ring-4 ring-orange-500/15"
              aria-hidden
            />
            <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-slate-600">
              <span className={lc(language, 'vi')}>
                Cập nhật: <strong>10 tháng 09 năm 2026</strong>
                {'\u00a0'}|{'\u00a0'}
                Áp dụng cho: founderai.biz
              </span>
              <span className={lc(language, 'en')}>
                Last updated: <strong>September 10, 2026</strong>
                {'\u00a0'}|{'\u00a0'}
                Applies to: founderai.biz
              </span>
            </p>
          </div>

          {/* Section 1: Payment Methods */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              1. Phương thức Thanh toán
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              1. Payment Methods
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO hỗ trợ các phương thức thanh toán an toàn và tiện lợi sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO supports the following safe and convenient payment methods:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Thanh toán qua QR Code (PayOS):</strong> Hỗ trợ tất cả ngân hàng và ví điện tử tại Việt Nam.
              </li>
              <li className={lc(language, 'en')}>
                <strong>QR Code Payment (PayOS):</strong> Supports all banks and e-wallets in Vietnam.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Chuyển khoản ngân hàng:</strong> Thông tin tài khoản được cung cấp trong quá trình thanh toán.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Bank transfer:</strong> Account information is provided during the payment process.
              </li>
            </ul>
          </section>

          {/* Section 2: Payment Security */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              2. Bảo mật Thanh toán
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              2. Payment Security
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cam kết đảm bảo an toàn cho mọi giao dịch thanh toán:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO commits to ensuring security for all payment transactions:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Mã hóa SSL 256-bit:</strong> Tất cả thông tin thanh toán được mã hóa bảo mật.
              </li>
              <li className={lc(language, 'en')}>
                <strong>256-bit SSL encryption:</strong> All payment information is securely encrypted.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>PayOS:</strong> Xử lý thanh toán qua cổng thanh toán uy tín PayOS.
              </li>
              <li className={lc(language, 'en')}>
                <strong>PayOS:</strong> Payment processing through the trusted PayOS payment gateway.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Kích hoạt tự động:</strong> Dịch vụ được kích hoạt ngay khi xác nhận thanh toán thành công.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Automatic activation:</strong> Services are activated immediately upon successful payment confirmation.
              </li>
            </ul>
          </section>

          {/* Section 3: Payment Process */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              3. Quy trình Thanh toán
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              3. Payment Process
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Quy trình thanh toán trên founderai.biz:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Payment process on founderai.biz:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Chọn gói dịch vụ phù hợp với nhu cầu.
              </li>
              <li className={lc(language, 'en')}>
                Select a service package that suits your needs.
              </li>
              <li className={lc(language, 'vi')}>
                Điền thông tin xuất hóa đơn (nếu cần).
              </li>
              <li className={lc(language, 'en')}>
                Fill in invoice information (if needed).
              </li>
              <li className={lc(language, 'vi')}>
                Xác nhận và đồng ý với các điều khoản thanh toán.
              </li>
              <li className={lc(language, 'en')}>
                Confirm and agree to the payment terms.
              </li>
              <li className={lc(language, 'vi')}>
                Thực hiện thanh toán qua QR Code hoặc chuyển khoản.
              </li>
              <li className={lc(language, 'en')}>
                Make payment via QR Code or bank transfer.
              </li>
              <li className={lc(language, 'vi')}>
                Hệ thống tự động kích hoạt dịch vụ sau khi xác nhận.
              </li>
              <li className={lc(language, 'en')}>
                System automatically activates service after confirmation.
              </li>
            </ul>
          </section>

          {/* Section 4: Payment Confirmation */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              4. Xác nhận Thanh toán
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              4. Payment Confirmation
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Sau khi thanh toán thành công, bạn sẽ nhận được:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              After successful payment, you will receive:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Email xác nhận thanh toán từ DIGISO.
              </li>
              <li className={lc(language, 'en')}>
                Payment confirmation email from DIGISO.
              </li>
              <li className={lc(language, 'vi')}>
                Thông báo kích hoạt dịch vụ trên nền tảng.
              </li>
              <li className={lc(language, 'en')}>
                Service activation notification on the platform.
              </li>
              <li className={lc(language, 'vi')}>
                Hóa đơn VAT (nếu đã yêu cầu xuất hóa đơn).
              </li>
              <li className={lc(language, 'en')}>
                VAT invoice (if invoice was requested).
              </li>
            </ul>
            <p className={`text-slate-700 ${lc(language, 'vi')}`}>
              <strong>Lưu ý:</strong> Thời gian xử lý thanh toán thông thường là vài giây đến vài phút. Trong một số trường hợp đặc biệt (ngân hàng bảo trì, lỗi mạng), thời gian có thể kéo dài hơn.
            </p>
            <p className={`text-slate-700 ${lc(language, 'en')}`}>
              <strong>Note:</strong> Normal payment processing time is a few seconds to a few minutes. In special cases (bank maintenance, network errors), processing time may take longer.
            </p>
          </section>

          {/* Section 5: VAT Invoice */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              5. Hóa đơn VAT
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              5. VAT Invoice
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO thực hiện xuất hóa đơn VAT theo đúng quy định của pháp luật:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO issues VAT invoices in accordance with legal regulations:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Hóa đơn VAT được xuất ngay khi thanh toán thành công.
              </li>
              <li className={lc(language, 'en')}>
                VAT invoice is issued immediately upon successful payment.
              </li>
              <li className={lc(language, 'vi')}>
                Thông tin xuất hóa đơn được cung cấp trước khi thanh toán.
              </li>
              <li className={lc(language, 'en')}>
                Invoice information is provided before payment.
              </li>
              <li className={lc(language, 'vi')}>
                Bạn có thể tải hóa đơn từ tài khoản của mình sau khi thanh toán.
              </li>
              <li className={lc(language, 'en')}>
                You can download the invoice from your account after payment.
              </li>
            </ul>
          </section>

          {/* Section 6: Payment Issues */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              6. Xử lý sự cố Thanh toán
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              6. Payment Issue Resolution
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Nếu gặp sự cố trong quá trình thanh toán:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              If you encounter issues during the payment process:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Kiểm tra kết nối internet và thử lại.
              </li>
              <li className={lc(language, 'en')}>
                Check your internet connection and try again.
              </li>
              <li className={lc(language, 'vi')}>
                Liên hệ ngân hàng nếu tài khoản bị giữ hoặc từ chối.
              </li>
              <li className={lc(language, 'en')}>
                Contact your bank if the account is held or declined.
              </li>
              <li className={lc(language, 'vi')}>
                Liên hệ bộ phận hỗ trợ DIGISO qua email hoặc điện thoại.
              </li>
              <li className={lc(language, 'en')}>
                Contact DIGISO support via email or phone.
              </li>
            </ul>
            <p className={`text-slate-700 ${lc(language, 'vi')}`}>
              <strong>Hotline hỗ trợ:</strong> 0877909606 (8:00 - 22:00, Thứ 2 - Thứ 7)
            </p>
            <p className={`text-slate-700 ${lc(language, 'en')}`}>
              <strong>Support hotline:</strong> 0877909606 (8:00 AM - 10:00 PM, Monday - Saturday)
            </p>
          </section>

          {/* Section 7: Contact */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              7. Liên hệ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              7. Contact
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Nếu bạn có câu hỏi về Chính sách Thanh toán, vui lòng liên hệ:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              If you have questions about the Payment Policy, please contact:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li>
                <strong>Email:</strong> <a href="mailto:info@digiso.vn" className="text-orange-600 hover:underline">info@digiso.vn</a>
              </li>
              <li>
                <strong>Điện thoại:</strong> 0877909606
              </li>
              <li>
                <strong>Website:</strong> <a href="https://founderai.biz" className="text-orange-600 hover:underline">founderai.biz</a>
              </li>
            </ul>
          </section>

          {/* Contact Block */}
          <div className="mt-10 overflow-hidden rounded-2xl border border-slate-700/30 bg-gradient-to-b from-slate-900 to-slate-950 px-5 py-8 text-white shadow-xl sm:px-8 sm:py-10">
            <div className="mb-6 max-w-2xl">
              <h2 className={`text-lg font-bold tracking-tight text-white sm:text-xl ${lc(language, 'vi')}`}>
                Liên hệ hỗ trợ
              </h2>
              <h2 className={`text-lg font-bold tracking-tight text-white sm:text-xl ${lc(language, 'en')}`}>
                Contact Support
              </h2>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Email</div>
                <div className="break-words text-[13.5px]">
                  <a href="mailto:info@digiso.vn" className="text-orange-400 hover:underline">info@digiso.vn</a>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Điện thoại</div>
                <div className="break-words text-[13.5px] text-slate-100">0877909606</div>
              </div>
            </div>
          </div>
        </div>

        <footer className="border-t border-slate-200 bg-white px-5 py-8 text-center text-[12px] text-slate-500">
          <p className={lc(language, 'vi')}>
            © 2026 Công ty TNHH Giải pháp số DIGISO. Mọi quyền được bảo lưu.
          </p>
          <p className={lc(language, 'en')}>
            © 2026 DIGISO Digital Solutions Co., Ltd. All rights reserved.
          </p>
          <p className={`mt-2 text-slate-400 ${lc(language, 'vi')}`}>
            Chính sách này được cập nhật và có hiệu lực từ ngày 10/09/2026.
          </p>
          <p className={`mt-2 text-slate-400 ${lc(language, 'en')}`}>
            This policy was last updated and effective from September 10, 2026.
          </p>
        </footer>
      </div>
    </div>
  );
}

export default PaymentPolicy;
