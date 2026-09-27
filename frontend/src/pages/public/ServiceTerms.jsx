import { useState } from 'react';

function getLangClass(activeLang, itemLang) {
  return activeLang === itemLang ? '' : 'hidden';
}

function ServiceTerms() {
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
      `}</style>
      <div className="pp-body">
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
              Điều kiện <span className="text-orange-400">Cung cấp Dịch vụ</span>
            </h1>
            <h1 className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'en')}`}>
              Terms of <span className="text-orange-400">Service</span>
            </h1>
            <p className={`mt-3 text-center text-sm text-slate-400 ${lc(language, 'vi')}`}>Công ty TNHH Giải pháp số DIGISO</p>
            <p className={`mt-3 text-center text-sm text-slate-400 ${lc(language, 'en')}`}>DIGISO Digital Solutions Co., Ltd.</p>
            <div className="mx-auto mt-8 flex w-full max-w-xs justify-center rounded-lg border border-slate-600/60 bg-slate-900/40 p-1 shadow-inner">
              <button type="button" onClick={() => setLanguage('vi')} className={`flex-1 rounded-md px-4 py-2.5 text-[13px] font-semibold transition-colors ${language === 'vi' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'}`}>Tiếng Việt</button>
              <button type="button" onClick={() => setLanguage('en')} className={`flex-1 rounded-md px-4 py-2.5 text-[13px] font-semibold transition-colors ${language === 'en' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:bg-slate-800/80 hover:text-white'}`}>English</button>
            </div>
          </div>
        </header>

        <div className="mx-auto max-w-4xl px-5 pb-24 pt-10 sm:px-8">
          <div className="mb-8 flex flex-wrap items-start gap-x-4 gap-y-3 rounded-xl border border-slate-200/90 bg-white px-5 py-4 shadow-sm">
            <span className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full bg-orange-500 ring-4 ring-orange-500/15" aria-hidden />
            <p className="min-w-0 flex-1 text-[13px] leading-relaxed text-slate-600">
              <span className={lc(language, 'vi')}>Cập nhật: <strong>10 tháng 09 năm 2026</strong> | Áp dụng cho: founderai.biz</span>
              <span className={lc(language, 'en')}>Last updated: <strong>September 10, 2026</strong> | Applies to: founderai.biz</span>
            </p>
          </div>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>1. Phạm vi dịch vụ</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>1. Service Scope</h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cung cấp nền tảng Marketing Automation tên founderai.biz bao gồm: Landing Page Builder, Email Marketing, Zalo Marketing, CRM, AI Chatbot, Analytics & Reports.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO provides the founderai.biz Marketing Automation platform including: Landing Page Builder, Email Marketing, Zalo Marketing, CRM, AI Chatbot, Analytics & Reports.
            </p>
          </section>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>2. Điều kiện cung cấp</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>2. Service Conditions</h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>Người dùng phải đăng ký tài khoản hợp lệ và xác thực email.</li>
              <li className={lc(language, 'en')}>Users must register a valid account and verify their email.</li>
              <li className={lc(language, 'vi')}>Người dùng phải đồng ý với các điều khoản và chính sách của nền tảng.</li>
              <li className={lc(language, 'en')}>Users must agree to the platform's terms and policies.</li>
              <li className={lc(language, 'vi')}>Tuân thủ quy định pháp luật Việt Nam về thương mại điện tử và bảo vệ dữ liệu.</li>
              <li className={lc(language, 'en')}>Comply with Vietnamese law on e-commerce and data protection.</li>
            </ul>
          </section>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>3. Hạn chế dịch vụ</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>3. Service Limitations</h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>Giới hạn số lượng email/tin nhắn theo từng gói dịch vụ.</li>
              <li className={lc(language, 'en')}>Email/message limits based on service package.</li>
              <li className={lc(language, 'vi')}>Giới hạn dung lượng lưu trữ theo từng gói.</li>
              <li className={lc(language, 'en')}>Storage limits based on package.</li>
              <li className={lc(language, 'vi')}>Không sử dụng cho mục đích spam, lừa đảo, vi phạm pháp luật.</li>
              <li className={lc(language, 'en')}>Not for spam, fraud, or illegal purposes.</li>
            </ul>
          </section>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>4. Chấm dứt dịch vụ</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>4. Service Termination</h2>

            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>4.1. Các trường hợp chấm dứt dịch vụ</h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>4.1. Cases of Service Termination</h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Dịch vụ có thể chấm dứt trong các trường hợp sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              The Service may be terminated in the following cases:
            </p>
            <ul className={`list-none pl-0 text-slate-700 mb-4 space-y-2 ${lc(language, 'vi')}`}>
              <li>a) Khách hàng chủ động yêu cầu chấm dứt do không còn nhu cầu sử dụng;</li>
              <li>b) Gói dịch vụ hết hạn mà khách hàng không gia hạn. Founder AI không tự động trừ tiền để gia hạn;</li>
              <li>c) Khách hàng yêu cầu xoá tài khoản;</li>
              <li>d) DIGISO chấm dứt dịch vụ do khách hàng vi phạm pháp luật, Điều khoản sử dụng hoặc có hành vi gây ảnh hưởng đến an toàn, bảo mật, hoạt động bình thường của nền tảng hoặc người dùng khác;</li>
              <li>đ) DIGISO chấm dứt hoặc tạm ngừng một phần hay toàn bộ dịch vụ do sự kiện bất khả kháng, yêu cầu của cơ quan nhà nước có thẩm quyền hoặc vì lý do kỹ thuật, an toàn, bảo mật cần thiết;</li>
              <li>e) DIGISO ngừng cung cấp dịch vụ theo quyết định kinh doanh, với thông báo trước ít nhất 30 ngày;</li>
              <li>g) Các trường hợp khác theo thoả thuận giữa các bên hoặc theo quy định của pháp luật.</li>
            </ul>
            <ul className={`list-none pl-0 text-slate-700 mb-4 space-y-2 ${lc(language, 'en')}`}>
              <li>a) The Customer proactively requests termination because they no longer need the Service;</li>
              <li>b) The service package expires and the Customer does not renew it. Founder AI does not automatically charge fees to renew;</li>
              <li>c) The Customer requests deletion of the account;</li>
              <li>d) DIGISO terminates the Service because the Customer violates the law, the Terms of Use, or engages in conduct that affects the safety, security, or normal operation of the platform or other users;</li>
              <li>đ) DIGISO terminates or suspends part or all of the Service due to a force majeure event, a request from a competent state authority, or for necessary technical, safety, or security reasons;</li>
              <li>e) DIGISO discontinues the Service based on a business decision, with at least 30 days' prior notice;</li>
              <li>g) Other cases as agreed between the parties or as provided by law.</li>
            </ul>

            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>4.2. Hệ quả khi chấm dứt dịch vụ</h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>4.2. Consequences of Service Termination</h3>
            <ul className={`list-none pl-0 text-slate-700 mb-4 space-y-2 ${lc(language, 'vi')}`}>
              <li>a) Quyền truy cập và sử dụng các tính năng thuộc gói dịch vụ bị chấm dứt sẽ dừng kể từ thời điểm chấm dứt có hiệu lực;</li>
              <li>b) Khi khách hàng tự chấm dứt, phần thời gian chưa sử dụng của gói đã kích hoạt không được hoàn tiền. Trường hợp lỗi thuộc về DIGISO, việc hoàn tiền thực hiện theo Chính sách hoàn tiền;</li>
              <li>c) Trường hợp DIGISO chấm dứt dịch vụ trước thời hạn vì lý do thuộc về DIGISO mà không xuất phát từ vi phạm của khách hàng, DIGISO hoàn trả phần phí tương ứng với phần dịch vụ chưa cung cấp, trừ trường hợp các bên có thoả thuận khác hoặc pháp luật có quy định khác;</li>
              <li>d) Lượt AI (credit) đã sử dụng trước thời điểm chấm dứt không được hoàn lại;</li>
              <li>đ) Việc chấm dứt dịch vụ không mặc nhiên đồng nghĩa với việc xoá ngay dữ liệu. Việc lưu giữ, xoá dữ liệu thực hiện theo Chính sách bảo mật và quy định pháp luật;</li>
              <li>e) Việc chấm dứt dịch vụ không ảnh hưởng đến quyền khiếu nại, đối soát và các quyền, nghĩa vụ đã phát sinh trước thời điểm chấm dứt.</li>
            </ul>
            <ul className={`list-none pl-0 text-slate-700 mb-4 space-y-2 ${lc(language, 'en')}`}>
              <li>a) The right to access and use the features of the terminated service package stops from the date the termination takes effect;</li>
              <li>b) When the Customer terminates on their own, the unused portion of an activated package is not refunded. Where the fault lies with DIGISO, refunds are handled under the Refund Policy;</li>
              <li>c) Where DIGISO terminates the Service early for reasons attributable to DIGISO and not arising from the Customer's breach, DIGISO refunds the fee corresponding to the portion of the service not yet provided, unless otherwise agreed by the parties or provided by law;</li>
              <li>d) AI usage (credits) already consumed before termination is not refunded;</li>
              <li>đ) Termination of the Service does not automatically mean immediate deletion of data. Data retention and deletion are carried out under the Privacy Policy and applicable law;</li>
              <li>e) Termination of the Service does not affect the right to complain, reconcile accounts, or any rights and obligations that arose before the termination.</li>
            </ul>

            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>4.3. Cách gửi yêu cầu chấm dứt và thời hạn phản hồi</h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>4.3. How to Submit a Termination Request and Response Timeline</h3>
            <p className={`text-slate-700 mb-3 ${lc(language, 'vi')}`}>
              Khách hàng gửi yêu cầu chấm dứt dịch vụ (và yêu cầu xoá tài khoản nếu có) qua email info@digiso.vn hoặc Hotline/Zalo 0877 909 606, kèm email tài khoản và gói dịch vụ cần chấm dứt.
            </p>
            <p className={`text-slate-700 mb-3 ${lc(language, 'en')}`}>
              The Customer submits a request to terminate the Service (and to delete the account, if applicable) via email to info@digiso.vn or Hotline/Zalo 0877 909 606, together with the account email and the service package to be terminated.
            </p>
            <ul className={`list-disc pl-6 text-slate-700 space-y-2 ${lc(language, 'vi')}`}>
              <li>Thời điểm chấm dứt: là thời điểm DIGISO ghi nhận yêu cầu hợp lệ, hoặc thời điểm khác do khách hàng lựa chọn (ví dụ: cuối chu kỳ hiện tại).</li>
              <li>DIGISO xác nhận đã tiếp nhận yêu cầu trong tối đa 24 giờ kể từ khi nhận được. Trường hợp cần đối soát thanh toán hoặc xác định số tiền hoàn trả, DIGISO phản hồi kết quả trong tối đa 02 ngày làm việc kể từ khi xác nhận yêu cầu hợp lệ. Nếu yêu cầu thiếu thông tin, DIGISO thông báo để khách hàng bổ sung trong 24 giờ; thời hạn xử lý được tính lại từ khi nhận đủ thông tin.</li>
              <li>Sau khi xử lý, DIGISO gửi thông báo xác nhận cuối cùng, gồm: thời điểm chấm dứt; gói dịch vụ bị chấm dứt; khoản phí đã sử dụng và khoản phải thanh toán (nếu có); số tiền được hoàn trả (nếu có); phương thức và thời gian dự kiến hoàn tiền; các quyền và nghĩa vụ còn tiếp tục có hiệu lực.</li>
              <li>DIGISO không đặt ra thủ tục bất hợp lý nhằm cản trở khách hàng thực hiện quyền chấm dứt dịch vụ.</li>
            </ul>
            <ul className={`list-disc pl-6 text-slate-700 space-y-2 ${lc(language, 'en')}`}>
              <li>Termination date: the date DIGISO records a valid request, or another date chosen by the Customer (for example, the end of the current cycle).</li>
              <li>DIGISO confirms receipt of the request within 24 hours of receiving it. Where payment reconciliation or determination of the refund amount is required, DIGISO responds with the result within 02 business days of confirming the request is valid. If the request lacks information, DIGISO notifies the Customer to supplement it within 24 hours; the processing deadline is recalculated from when complete information is received.</li>
              <li>After processing, DIGISO sends a final confirmation notice including: the termination date; the terminated service package; fees already used and any amount payable (if any); the refund amount (if any); the refund method and expected timeframe; and the rights and obligations that remain in effect.</li>
              <li>DIGISO does not impose unreasonable procedures to hinder the Customer from exercising the right to terminate the Service.</li>
            </ul>
          </section>

          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>5. Liên hệ</h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>5. Contact</h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li><strong>Email:</strong> <a href="mailto:info@digiso.vn" className="text-orange-600 hover:underline">info@digiso.vn</a></li>
              <li><strong>Điện thoại:</strong> 0877909606</li>
            </ul>
          </section>
        </div>

        <footer className="border-t border-slate-200 bg-white px-5 py-8 text-center text-[12px] text-slate-500">
          <p className={lc(language, 'vi')}>© 2026 Công ty TNHH Giải pháp số DIGISO. Mọi quyền được bảo lưu.</p>
          <p className={lc(language, 'en')}>© 2026 DIGISO Digital Solutions Co., Ltd. All rights reserved.</p>
          <p className={`mt-2 text-slate-400 ${lc(language, 'vi')}`}>
            Chính sách này được cập nhật và có hiệu lực từ ngày 13/10/2026.
          </p>
          <p className={`mt-2 text-slate-400 ${lc(language, 'en')}`}>
            This policy was last updated and effective from October 13, 2026.
          </p>
        </footer>
      </div>
    </div>
  );
}

export default ServiceTerms;
