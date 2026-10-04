import { useState } from 'react';
import PolicyChangeNotice from '../../../components/PolicyChangeNotice.jsx';

function getLangClass(activeLang, itemLang) {
  return activeLang === itemLang ? '' : 'hidden';
}

function ComplaintPolicy() {
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
              Phương thức tiếp nhận và giải quyết <span className="text-orange-400">phản ánh, yêu cầu, khiếu nại</span>
            </h1>
            <h1 className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'en')}`}>
              Procedure for Receiving and Resolving <span className="text-orange-400">Feedback, Requests and Complaints</span>
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
              1. Phạm vi áp dụng
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              1. Scope
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Chính sách này quy định phương thức, quy trình tiếp nhận và giải quyết phản ánh, yêu cầu, khiếu nại của khách hàng đối với các dịch vụ cung cấp trên nền tảng founderai.biz do Công ty TNHH Giải pháp số DIGISO (DIGISO) là chủ quản, theo Điều 7 Nghị định 248/2026/NĐ-CP.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              This policy sets out the methods and procedure for receiving and resolving feedback, requests and complaints from customers about the services provided on the founderai.biz platform operated by DIGISO Digital Solutions Co., Ltd. (DIGISO), in accordance with Article 7 of Decree 248/2026/NĐ-CP.
            </p>
          </section>

          {/* Section 2 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              2. Cách thức tiếp nhận
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              2. How to Submit
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO tiếp nhận phản ánh, yêu cầu, khiếu nại qua các kênh sau (trong đó có phương thức liên hệ trực tuyến là email và trang liên hệ):
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO receives feedback, requests and complaints through the following channels (including online contact by email and the contact page):
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Email:</strong> <a href="mailto:info@digiso.vn" className="text-orange-600 hover:underline">info@digiso.vn</a>
              </li>
              <li className={lc(language, 'en')}>
                <strong>Email:</strong> <a href="mailto:info@digiso.vn" className="text-orange-600 hover:underline">info@digiso.vn</a>
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Điện thoại:</strong> 0877909606 (8:00 - 22:00, Thứ 2 - Thứ 7)
              </li>
              <li className={lc(language, 'en')}>
                <strong>Phone:</strong> 0877909606 (8:00 AM - 10:00 PM, Monday - Saturday)
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Trang liên hệ:</strong> <a href="/contact" className="text-orange-600 hover:underline">founderai.biz/contact</a>
              </li>
              <li className={lc(language, 'en')}>
                <strong>Contact page:</strong> <a href="/contact" className="text-orange-600 hover:underline">founderai.biz/contact</a>
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              3. Trình tự, thủ tục tiếp nhận và xử lý
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              3. Receiving and Handling Procedure
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO giải quyết phản ánh, yêu cầu, khiếu nại theo các bước sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO handles feedback, requests and complaints through the following steps:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Bước 1 — Tiếp nhận:</strong> DIGISO tiếp nhận phản ánh, yêu cầu, khiếu nại qua các kênh được công bố tại mục 2.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Step 1 — Receipt:</strong> DIGISO receives the feedback, request or complaint through the channels published in section 2.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bước 2 — Xác nhận:</strong> Sau khi tiếp nhận đầy đủ thông tin, DIGISO xác nhận đã nhận trong vòng 24 giờ làm việc và có thể liên hệ để xác minh thêm thông tin.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Step 2 — Acknowledgement:</strong> After receiving complete information, DIGISO confirms receipt within 24 business hours and may contact you to verify further information.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bước 3 — Kiểm tra và xác minh:</strong> DIGISO kiểm tra, xác minh dựa trên thông tin đơn hàng, lịch sử giao dịch, thanh toán và tài liệu khách hàng cung cấp; phối hợp bộ phận, đơn vị liên quan khi cần. Việc xác minh và thu thập bằng chứng được thực hiện trong vòng 3 ngày làm việc.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Step 3 — Review and verification:</strong> DIGISO reviews and verifies based on order information, transaction and payment history, and the documents you provide, coordinating with relevant departments or units where needed. Verification and evidence collection are completed within 3 business days.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bước 4 — Đánh giá và đưa ra phương án xử lý:</strong> DIGISO đánh giá nguyên nhân, trách nhiệm của các bên và đưa ra phương án xử lý phù hợp với chính sách của nền tảng, thỏa thuận giao dịch và quy định pháp luật; phản hồi trong vòng 7 ngày làm việc.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Step 4 — Assessment and resolution proposal:</strong> DIGISO assesses the cause and the responsibilities of the parties and proposes a resolution consistent with the platform policies, the transaction agreement and applicable law; DIGISO responds within 7 business days.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bước 5 — Thông báo kết quả:</strong> DIGISO thông báo kết quả xử lý qua email, điện thoại hoặc phương thức khác đã thỏa thuận.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Step 5 — Notification of result:</strong> DIGISO notifies the outcome by email, phone or another agreed method.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bước 6 — Theo dõi và hoàn tất:</strong> DIGISO theo dõi việc thực hiện phương án xử lý và bảo đảm khiếu nại được giải quyết triệt để.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Step 6 — Follow-up and closure:</strong> DIGISO follows up on the implementation of the resolution and ensures the complaint is fully resolved.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              4. Các loại khiếu nại được tiếp nhận và thông tin cần cung cấp
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              4. Types of Complaints Received and Information Required
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO tiếp nhận các loại phản ánh, yêu cầu, khiếu nại sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO receives the following types of feedback, requests and complaints:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Chất lượng dịch vụ không đúng như công bố.
              </li>
              <li className={lc(language, 'en')}>
                Service quality not as advertised.
              </li>
              <li className={lc(language, 'vi')}>
                Lỗi kỹ thuật ảnh hưởng đến việc sử dụng dịch vụ.
              </li>
              <li className={lc(language, 'en')}>
                Technical errors affecting the use of the service.
              </li>
              <li className={lc(language, 'vi')}>
                Thanh toán và hoàn tiền.
              </li>
              <li className={lc(language, 'en')}>
                Payment and refunds.
              </li>
              <li className={lc(language, 'vi')}>
                Bảo mật và quyền riêng tư.
              </li>
              <li className={lc(language, 'en')}>
                Security and privacy.
              </li>
              <li className={lc(language, 'vi')}>
                Hành vi của nhân viên hoặc đại lý.
              </li>
              <li className={lc(language, 'en')}>
                Conduct of employees or agents.
              </li>
              <li className={lc(language, 'vi')}>
                Các quyền, lợi ích hợp pháp khác của khách hàng hoặc theo quy định của pháp luật.
              </li>
              <li className={lc(language, 'en')}>
                Other lawful rights and interests of the customer or as provided by law.
              </li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Để việc xử lý nhanh chóng, khi gửi phản ánh, yêu cầu, khiếu nại, vui lòng cung cấp:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              For prompt handling, please provide the following when submitting:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Tên công ty, mã số thuế (đối với doanh nghiệp, tổ chức); họ và tên (đối với cá nhân).
              </li>
              <li className={lc(language, 'en')}>
                Company name and tax code (for businesses and organisations); full name (for individuals).
              </li>
              <li className={lc(language, 'vi')}>
                Số điện thoại hoặc email liên hệ chính xác.
              </li>
              <li className={lc(language, 'en')}>
                An accurate contact phone number or email.
              </li>
              <li className={lc(language, 'vi')}>
                Thông tin gói dịch vụ hoặc tài khoản liên quan.
              </li>
              <li className={lc(language, 'en')}>
                Information on the relevant service package or account.
              </li>
              <li className={lc(language, 'vi')}>
                Nội dung cụ thể của phản ánh, yêu cầu, khiếu nại.
              </li>
              <li className={lc(language, 'en')}>
                The specific content of the feedback, request or complaint.
              </li>
              <li className={lc(language, 'vi')}>
                Thời gian, địa điểm phát sinh vấn đề.
              </li>
              <li className={lc(language, 'en')}>
                When and where the issue arose.
              </li>
              <li className={lc(language, 'vi')}>
                Tài liệu, hình ảnh, hóa đơn, chứng từ liên quan (nếu có).
              </li>
              <li className={lc(language, 'en')}>
                Related documents, images, invoices and vouchers (if any).
              </li>
              <li className={lc(language, 'vi')}>
                Phương án giải quyết mong muốn.
              </li>
              <li className={lc(language, 'en')}>
                Your desired resolution.
              </li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cam kết bảo mật thông tin của người gửi và chỉ sử dụng thông tin đó để xác minh, xử lý vụ việc.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO undertakes to keep the sender's information confidential and to use it only to verify and handle the matter.
            </p>
          </section>

          {/* Section 5 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              5. Thời hạn phản hồi
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              5. Response Timeframes
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cam kết các thời hạn phản hồi ban đầu và thời hạn dự kiến giải quyết như sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO commits to the following initial response and expected resolution timeframes:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Xác nhận tiếp nhận (phản hồi ban đầu):</strong> trong vòng 24 giờ làm việc.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Acknowledgement (initial response):</strong> within 24 business hours.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Khiếu nại đơn giản:</strong> giải quyết trong vòng 3 ngày làm việc.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Simple complaints:</strong> resolved within 3 business days.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Khiếu nại phức tạp:</strong> giải quyết trong vòng 7 ngày làm việc.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Complex complaints:</strong> resolved within 7 business days.
              </li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Thời hạn được tính từ ngày DIGISO nhận đủ thông tin và tài liệu cần thiết. Trường hợp cần kéo dài thời hạn, DIGISO thông báo cho khách hàng lý do và thời gian dự kiến giải quyết.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Timeframes are counted from the date DIGISO receives the complete information and documents required. If more time is needed, DIGISO will notify you of the reason and the expected resolution time.
            </p>
          </section>

          {/* Section 6 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              6. Biện pháp và công cụ hỗ trợ giải quyết
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              6. Measures and Tools Used to Support Resolution
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Để hỗ trợ giải quyết, DIGISO áp dụng các biện pháp, công cụ sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              To support resolution, DIGISO applies the following measures and tools:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Đối soát đơn hàng, lịch sử thanh toán và hóa đơn của tài khoản liên quan trên hệ thống.
              </li>
              <li className={lc(language, 'en')}>
                Reconciling the orders, payment history and invoices of the relevant account on the system.
              </li>
              <li className={lc(language, 'vi')}>
                Kiểm tra nhật ký hoạt động và nhật ký gửi (nếu có) của tài khoản liên quan để xác minh sự việc.
              </li>
              <li className={lc(language, 'en')}>
                Checking the activity logs and sending logs (if any) of the relevant account to verify the matter.
              </li>
              <li className={lc(language, 'vi')}>
                Trao đổi trực tiếp với khách hàng qua email hoặc điện thoại để thu thập thêm thông tin, hướng dẫn xử lý.
              </li>
              <li className={lc(language, 'en')}>
                Communicating directly with the customer by email or phone to collect further information and guide resolution.
              </li>
              <li className={lc(language, 'vi')}>
                Phối hợp với đơn vị thanh toán, ngân hàng hoặc đơn vị cung cấp dịch vụ liên quan khi cần đối soát.
              </li>
              <li className={lc(language, 'en')}>
                Coordinating with payment providers, banks or relevant service providers when reconciliation is needed.
              </li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              7. Trường hợp không đạt được thỏa thuận
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              7. Where No Agreement Is Reached
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Nếu không hài lòng với phương án giải quyết của DIGISO, khách hàng có thể yêu cầu DIGISO xem xét lại và cung cấp thêm tài liệu, thông tin. Trường hợp không giải quyết được bằng thương lượng, khách hàng có quyền:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              If you are not satisfied with DIGISO's resolution, you may ask DIGISO to reconsider and provide additional documents and information. If the matter cannot be resolved by negotiation, you have the right to:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Yêu cầu chuyển lên cấp quản lý cao hơn của DIGISO qua email <a href="mailto:info@digiso.vn" className="text-orange-600 hover:underline">info@digiso.vn</a>.
              </li>
              <li className={lc(language, 'en')}>
                Request escalation to a higher level of DIGISO management via email <a href="mailto:info@digiso.vn" className="text-orange-600 hover:underline">info@digiso.vn</a>.
              </li>
              <li className={lc(language, 'vi')}>
                Đề nghị cơ quan quản lý nhà nước có thẩm quyền, tổ chức bảo vệ quyền lợi người tiêu dùng hoặc Tòa án có thẩm quyền tại Việt Nam giải quyết theo quy định pháp luật, trong đó có Sở Công Thương nơi DIGISO đặt trụ sở (Thành phố Hồ Chí Minh).
              </li>
              <li className={lc(language, 'en')}>
                Petition the competent state management authority, a consumer protection organisation or the competent court in Vietnam to resolve the matter under the law, including the Department of Industry and Trade of the locality where DIGISO is headquartered (Ho Chi Minh City).
              </li>
              <li className={lc(language, 'vi')}>
                Gọi Tổng đài hỗ trợ khách hàng và tiếp nhận phản ánh về hoạt động thương mại điện tử: <strong>1800-6838</strong> (Sở Công Thương TP.HCM / Cục Thương mại điện tử & Kinh tế số).
              </li>
              <li className={lc(language, 'en')}>
                Call the customer support hotline for e-commerce complaints: <strong>1800-6838</strong> (Ho Chi Minh City Department of Industry and Trade / Department of E-commerce and Digital Economy).
              </li>
            </ul>
          </section>

          {/* Section 8 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              8. Liên hệ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              8. Contact
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Nếu bạn có câu hỏi hoặc cần hỗ trợ, vui lòng liên hệ:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              If you have questions or need assistance, please contact:
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

export default ComplaintPolicy;
