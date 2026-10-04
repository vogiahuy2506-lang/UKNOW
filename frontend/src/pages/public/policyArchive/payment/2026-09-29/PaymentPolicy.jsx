import { useState } from 'react';
import PolicyChangeNotice from '../../../components/PolicyChangeNotice.jsx';

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
              Chính sách về <span className="text-orange-400">thanh toán</span>
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
                Cập nhật ngày <strong>29/09/2026</strong> — Áp dụng từ <strong>29/09/2026</strong>
                {'\u00a0'}|{'\u00a0'}
                Áp dụng cho: founderai.biz
              </span>
              <span className={lc(language, 'en')}>
                Last updated on <strong>September 29, 2026</strong> — Effective from <strong>September 29, 2026</strong>
                {'\u00a0'}|{'\u00a0'}
                Applies to: founderai.biz
              </span>
            </p>
          </div>
          <PolicyChangeNotice language={language} lc={lc} />

          {/* Section 1 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              1. Phương thức Thanh toán
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              1. Payment Methods
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO áp dụng hai phương thức thanh toán sau. Hai phương thức này đều được thực hiện trên trang thanh toán của đơn hàng:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO applies the following two payment methods. Both are carried out on the order's payment page:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Thanh toán qua mã QR (cổng PayOS):</strong> Hệ thống hiển thị mã QR của đơn hàng; bạn mở ứng dụng ngân hàng (hoặc ứng dụng khác có hỗ trợ quét mã VietQR), quét mã và xác nhận thanh toán. Số tiền và nội dung chuyển khoản được điền sẵn theo đơn hàng; hệ thống tự động ghi nhận khi giao dịch thành công.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Payment via QR code (PayOS gateway):</strong> The system displays the order's QR code; you open a banking application (or another application that supports VietQR scanning), scan the code and confirm the payment. The amount and transfer content are pre-filled from the order; the system records the payment automatically once it succeeds.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Chuyển khoản ngân hàng:</strong> Thông tin tài khoản nhận (ngân hàng, số tài khoản, chủ tài khoản), số tiền và nội dung chuyển khoản được hiển thị ngay trên trang thanh toán trong quá trình thanh toán. Bạn chuyển khoản đúng số tiền và đúng nội dung chuyển khoản do hệ thống hiển thị để đơn hàng được nhận diện và kích hoạt tự động.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Bank transfer:</strong> The receiving account information (bank, account number, account holder), the amount and the transfer content are displayed on the payment page during checkout. Please transfer the exact amount with the exact transfer content shown so that the order is identified and activated automatically.
              </li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Bạn có thể chọn phương thức thuận tiện nhất cho mình; mỗi đơn hàng chỉ cần thanh toán một lần theo một trong hai cách trên.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              You may choose whichever method is most convenient; each order only needs to be paid once, using one of the two methods above.
            </p>
          </section>

          {/* Section 2 */}
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
              DIGISO is committed to the safety of every payment transaction:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Mã hóa SSL/TLS:</strong> Thông tin trao đổi giữa bạn và nền tảng được mã hóa trên đường truyền.
              </li>
              <li className={lc(language, 'en')}>
                <strong>SSL/TLS encryption:</strong> Information exchanged between you and the platform is encrypted in transit.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>PayOS:</strong> Giao dịch QR được xử lý qua cổng thanh toán PayOS.
              </li>
              <li className={lc(language, 'en')}>
                <strong>PayOS:</strong> QR transactions are processed through the PayOS payment gateway.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Kích hoạt tự động:</strong> Dịch vụ được kích hoạt ngay khi xác nhận thanh toán thành công.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Automatic activation:</strong> The service is activated as soon as the payment is successfully confirmed.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
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
              The payment process on founderai.biz:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Bước 1:</strong> Chọn gói dịch vụ phù hợp với nhu cầu.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Step 1:</strong> Choose the service package that suits your needs.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bước 2:</strong> Điền thông tin xuất hóa đơn (nếu cần).
              </li>
              <li className={lc(language, 'en')}>
                <strong>Step 2:</strong> Enter invoicing information (if needed).
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bước 3:</strong> Kiểm tra thông tin đơn hàng gồm tên gói, số lượng (nếu có), giá bán, tổng giá trị, mã giảm giá (voucher) và thông tin thanh toán trước khi giao dịch.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Step 3:</strong> Review the order information — package name, quantity (if any), price, total value, discount code (voucher) and payment details — before making the transaction.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bước 4:</strong> Xác nhận và đồng ý với các điều khoản thanh toán.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Step 4:</strong> Confirm and agree to the payment terms.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bước 5:</strong> Thực hiện thanh toán qua mã QR hoặc chuyển khoản.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Step 5:</strong> Make the payment by QR code or bank transfer.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bước 6:</strong> Hệ thống tự động kích hoạt dịch vụ sau khi xác nhận thanh toán.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Step 6:</strong> The system activates the service automatically after the payment is confirmed.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
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
              After a successful payment, you will receive:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Email xác nhận thanh toán từ DIGISO.
              </li>
              <li className={lc(language, 'en')}>
                A payment confirmation email from DIGISO.
              </li>
              <li className={lc(language, 'vi')}>
                Thông báo kích hoạt dịch vụ trên nền tảng.
              </li>
              <li className={lc(language, 'en')}>
                A service activation notice on the platform.
              </li>
              <li className={lc(language, 'vi')}>
                Hóa đơn điện tử (nếu đã yêu cầu xuất hóa đơn).
              </li>
              <li className={lc(language, 'en')}>
                An e-invoice (if invoicing was requested).
              </li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              <strong>Lưu ý:</strong> Thời gian xử lý thanh toán thông thường là vài giây đến vài phút. Trong một số trường hợp đặc biệt (ngân hàng bảo trì, lỗi mạng), thời gian có thể kéo dài hơn.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              <strong>Note:</strong> Payment processing normally takes a few seconds to a few minutes. In special cases (bank maintenance, network errors) it may take longer.
            </p>
          </section>

          {/* Section 5 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              5. Hóa đơn điện tử
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              5. E-invoice
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO thực hiện xuất hóa đơn theo đúng quy định của pháp luật:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO issues invoices in accordance with the law:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Hóa đơn được xuất ngay khi thanh toán thành công.
              </li>
              <li className={lc(language, 'en')}>
                The invoice is issued as soon as the payment succeeds.
              </li>
              <li className={lc(language, 'vi')}>
                Thông tin xuất hóa đơn được cung cấp trước khi thanh toán.
              </li>
              <li className={lc(language, 'en')}>
                Invoicing information is provided before payment.
              </li>
              <li className={lc(language, 'vi')}>
                Bạn có thể tải hóa đơn từ tài khoản của mình sau khi thanh toán.
              </li>
              <li className={lc(language, 'en')}>
                You can download the invoice from your account after payment.
              </li>
              <li className={lc(language, 'vi')}>
                Hóa đơn ghi thuế suất KCT (không chịu thuế GTGT), đúng bản chất dịch vụ phần mềm.
              </li>
              <li className={lc(language, 'en')}>
                The invoice shows the tax rate as KCT (not subject to VAT), in line with the nature of a software service.
              </li>
            </ul>
          </section>

          {/* Section 6 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              6. Xử lý sự cố Thanh toán
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              6. Handling Payment Issues
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Nếu gặp sự cố trong quá trình thanh toán:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              If you encounter a problem during payment:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Kiểm tra kết nối internet và thử lại.
              </li>
              <li className={lc(language, 'en')}>
                Check your internet connection and try again.
              </li>
              <li className={lc(language, 'vi')}>
                Liên hệ ngân hàng nếu tài khoản bị giữ hoặc từ chối giao dịch.
              </li>
              <li className={lc(language, 'en')}>
                Contact your bank if your account is held or the transaction is declined.
              </li>
              <li className={lc(language, 'vi')}>
                Liên hệ bộ phận hỗ trợ DIGISO qua email hoặc điện thoại.
              </li>
              <li className={lc(language, 'en')}>
                Contact DIGISO support by email or phone.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Hotline hỗ trợ:</strong> 0877909606 (8:00 - 22:00, Thứ 2 - Thứ 7).
              </li>
              <li className={lc(language, 'en')}>
                <strong>Support hotline:</strong> 0877909606 (8:00 AM - 10:00 PM, Monday - Saturday).
              </li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              7. Trường hợp thanh toán sai số tiền hoặc sai thông tin chuyển khoản
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              7. Incorrect Payment Amount or Transfer Information
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Với chuyển khoản ngân hàng, khách hàng có trách nhiệm thanh toán đúng số tiền và đúng thông tin do founderai.biz hiển thị. Trường hợp Người dùng chuyển khoản sai số tiền, sai nội dung, sai tài khoản thụ hưởng hoặc gửi nhầm giao dịch, DIGISO xử lý như sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              For bank transfers, the customer is responsible for paying the exact amount and using the exact information displayed by founderai.biz. If the User transfers the wrong amount, uses wrong content, uses a wrong beneficiary account or sends a transaction by mistake, DIGISO handles it as follows:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Người dùng thông báo ngay cho DIGISO qua email info@digiso.vn hoặc hotline 0877909606, cung cấp thông tin giao dịch, kèm ảnh chụp sao kê giao dịch, để DIGISO kiểm tra, đối soát và hướng dẫn xử lý.
              </li>
              <li className={lc(language, 'en')}>
                The User notifies DIGISO immediately by email at info@digiso.vn or by hotline 0877909606, providing the transaction details and a screenshot of the transaction statement, so that DIGISO can check, reconcile and advise on handling.
              </li>
              <li className={lc(language, 'vi')}>
                DIGISO đối chiếu và phản hồi trong vòng 24 giờ làm việc kể từ khi nhận thông báo đầy đủ.
              </li>
              <li className={lc(language, 'en')}>
                DIGISO reconciles and responds within 24 business hours of receiving the complete notice.
              </li>
              <li className={lc(language, 'vi')}>
                Giao dịch chuyển nhầm sang tài khoản hệ thống: DIGISO hoàn trả đúng số tiền đã nhận sau khi xác minh và trừ phí ngân hàng phát sinh (nếu có) trong vòng 3–7 ngày làm việc.
              </li>
              <li className={lc(language, 'en')}>
                Transactions mistakenly sent to the system account: DIGISO refunds the exact amount received after verification, less any bank fees incurred, within 3–7 business days.
              </li>
              <li className={lc(language, 'vi')}>
                Giao dịch chuyển nhầm sang tài khoản bên thứ ba không thuộc DIGISO: DIGISO hỗ trợ cung cấp thông tin giao dịch để Người dùng tự liên hệ ngân hàng hoặc đơn vị liên quan yêu cầu tra soát và hoàn tiền. Lỗi do khách hàng dẫn đến việc DIGISO không nhận được phí thì DIGISO không chịu trách nhiệm đối với khoản tiền đã chuyển đi.
              </li>
              <li className={lc(language, 'en')}>
                Transactions mistakenly sent to a third-party account not belonging to DIGISO: DIGISO helps provide transaction information so the User can contact the bank or the relevant party to request a trace and refund. Where the customer's error results in DIGISO not receiving the fee, DIGISO is not responsible for the amount already transferred.
              </li>
              <li className={lc(language, 'vi')}>
                Việc xử lý căn cứ kết quả kiểm tra giao dịch thực tế và xác nhận từ ngân hàng hoặc đơn vị liên quan.
              </li>
              <li className={lc(language, 'en')}>
                Handling is based on the actual transaction check and confirmation from the bank or the relevant party.
              </li>
            </ul>
          </section>

          {/* Section 8 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              8. Phương thức hoàn tiền trong trường hợp chấm dứt dịch vụ hoặc đổi trả
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              8. Refund Method upon Service Termination or Return
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Nếu đủ điều kiện hoàn tiền theo <a href="/refund-policy" className="text-orange-600 hover:underline">Chính sách chấm dứt dịch vụ và hoàn tiền</a>, khoản hoàn được thực hiện như sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              If the conditions for a refund under the <a href="/refund-policy" className="text-orange-600 hover:underline">Service Termination and Refund Policy</a> are met, the refund is made as follows:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Hình thức hoàn tiền:</strong> chuyển khoản ngân hàng về tài khoản đã dùng để thanh toán ban đầu hoặc tài khoản do Người dùng cung cấp (hoặc phương thức khác theo thỏa thuận).
              </li>
              <li className={lc(language, 'en')}>
                <strong>Refund method:</strong> bank transfer to the account originally used for payment or to an account provided by the User (or another method as agreed).
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Thời hạn hoàn tiền:</strong> theo thời hạn quy định tại Chính sách chấm dứt dịch vụ và hoàn tiền; thời gian nhận tiền thực tế có thể phụ thuộc vào đơn vị thanh toán, ngân hàng và phương thức thanh toán.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Refund timeframe:</strong> as specified in the Service Termination and Refund Policy; the actual time to receive the money may depend on the payment provider, the bank and the payment method.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Phí giao dịch ngân hàng</strong> phát sinh khi hoàn tiền do Người dùng chịu (nếu có).
              </li>
              <li className={lc(language, 'en')}>
                <strong>Bank transaction fees</strong> arising from the refund are borne by the User (if any).
              </li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Toàn bộ điều kiện, phạm vi và mức hoàn tiền được quy định tại Chính sách chấm dứt dịch vụ và hoàn tiền công khai tại founderai.biz.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              All conditions, scope and amounts of refunds are set out in the Service Termination and Refund Policy published at founderai.biz.
            </p>
          </section>

          {/* Section 9 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              9. Cơ chế điểm thưởng, ưu đãi quy đổi
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              9. Reward Points and Redeemable Offers
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Founder AI hiện không áp dụng cơ chế tích điểm, hoàn điểm hoặc ưu đãi quy đổi điểm khi thanh toán. Nếu áp dụng trong tương lai, DIGISO sẽ công khai cách hình thành và sử dụng điểm, phạm vi, điều kiện, tỷ lệ, giới hạn quy đổi và trách nhiệm của các bên; điểm không được quy đổi để rút tiền mặt.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Founder AI does not currently apply any points accrual, points refund or points-redemption offers for payments. If introduced in the future, DIGISO will publish how points are earned and used, their scope, conditions, rates, redemption limits and the parties' responsibilities; points cannot be exchanged for cash.
            </p>
          </section>

          {/* Section 10 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              10. Liên hệ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              10. Contact
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Nếu bạn có câu hỏi về Chính sách về thanh toán, vui lòng liên hệ:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              If you have questions about the Payment Policy, please contact:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Email:</strong> <a href="mailto:info@digiso.vn" className="text-orange-600 hover:underline">info@digiso.vn</a>
              </li>
              <li className={lc(language, 'en')}>
                <strong>Email:</strong> <a href="mailto:info@digiso.vn" className="text-orange-600 hover:underline">info@digiso.vn</a>
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Điện thoại:</strong> 0877909606
              </li>
              <li className={lc(language, 'en')}>
                <strong>Phone:</strong> 0877909606
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Website:</strong> <a href="https://founderai.biz" className="text-orange-600 hover:underline">founderai.biz</a>
              </li>
              <li className={lc(language, 'en')}>
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
            Chính sách này được cập nhật và có hiệu lực từ ngày 29/09/2026.
          </p>
          <p className={`mt-2 text-slate-400 ${lc(language, 'en')}`}>
            This policy was last updated and effective from September 29, 2026.
          </p>
        </footer>
      </div>
    </div>
  );
}

export default PaymentPolicy;
