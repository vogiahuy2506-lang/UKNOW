import { useState } from 'react';
import PolicyHistory from './components/PolicyHistory.jsx';

function getLangClass(activeLang, itemLang) {
  return activeLang === itemLang ? '' : 'hidden';
}

function ServiceDeliveryPolicy() {
  const [language, setLanguage] = useState('vi');
  const lc = getLangClass;

  const historyEntries = [
    {
      date: '2026-09-29',
      note: {
        vi: 'Ban hành lần đầu dưới dạng chính sách riêng theo Điều 15 Nghị định 248/2026/NĐ-CP (trước đây là mục 3A của trang Điều kiện cung cấp dịch vụ).',
        en: 'First issued as a separate policy under Article 15 of Decree 248/2026/NĐ-CP (previously section 3A of the Service Terms page).',
      },
    },
  ];

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
              Chính sách về phương thức <span className="text-orange-400">cung cấp dịch vụ</span>
            </h1>
            <h1 className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'en')}`}>
              Service Delivery <span className="text-orange-400">Policy</span>
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

          {/* Section 1 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              1. Phạm vi dịch vụ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              1. Service Scope
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Chính sách này áp dụng đối với dịch vụ cung cấp trên nền tảng founderai.biz do Công ty TNHH Giải pháp số DIGISO (DIGISO) làm chủ quản, theo Điều 15 Nghị định 248/2026/NĐ-CP.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              This policy applies to services provided on the founderai.biz platform operated by DIGISO Digital Solutions Co., Ltd. (DIGISO), under Article 15 of Decree 248/2026/NĐ-CP.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              founderai.biz là nền tảng AI dành cho founder, startup và doanh nhân, cung cấp công cụ trí tuệ nhân tạo, khóa học trực tuyến và tài nguyên hỗ trợ phát triển kinh doanh; đồng thời là nền tảng Marketing Automation gồm: Landing Page Builder, Email Marketing, Zalo Marketing, CRM, AI Chatbot, Analytics & Reports. Khách hàng chỉ được sử dụng dịch vụ trong phạm vi đã đăng ký; các hành vi không được thực hiện được nêu tại <a href="/service-terms" className="text-orange-600 hover:underline">Các điều kiện hoặc hạn chế trong việc cung cấp dịch vụ trên nền tảng</a>.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              founderai.biz is an AI platform for founders, startups and entrepreneurs, providing artificial intelligence tools, online courses and resources to support business development; it is also a Marketing Automation platform comprising: Landing Page Builder, Email Marketing, Zalo Marketing, CRM, AI Chatbot, Analytics & Reports. Customers may use the service only within the scope registered; prohibited conduct is set out in <a href="/service-terms" className="text-orange-600 hover:underline">Conditions and Restrictions on the Provision of Services on the Platform</a>.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Toàn bộ dịch vụ được sử dụng trực tiếp trên nền tảng. Nền tảng không cung cấp dịch vụ theo hình thức đặt hàng trước, sử dụng sau tại địa điểm cung cấp dịch vụ.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              All services are used directly on the platform. The platform does not provide services on a pre-order, use-later basis at a service location.
            </p>
          </section>

          {/* Section 2 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              2. Thời hạn sử dụng, loại thiết bị và số lượng thiết bị sử dụng đồng thời
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              2. Term of Use, Device Types and Number of Concurrent Devices
            </h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Thời hạn sử dụng dịch vụ:</strong> gói theo tháng có thời hạn 30 ngày, gói theo năm có thời hạn 12 tháng (365 ngày), tính từ thời điểm kích hoạt đăng ký thành công, hoặc theo hợp đồng, thỏa thuận riêng. Founder AI không tự động trừ tiền để gia hạn; hết thời hạn, khách hàng chủ động đặt mua gia hạn nếu tiếp tục sử dụng.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Term of use:</strong> monthly packages have a 30-day term and yearly packages a 12-month (365-day) term, counted from the moment the registration is successfully activated, or under a separate contract or agreement. Founder AI does not automatically charge to renew; when the term ends, the customer chooses whether to purchase a renewal.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Loại thiết bị phù hợp:</strong> máy tính, điện thoại hoặc thiết bị tương thích có kết nối Internet và trình duyệt web đáp ứng yêu cầu kỹ thuật DIGISO khuyến nghị.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Suitable device types:</strong> computers, phones or compatible devices with an Internet connection and a web browser that meets the technical requirements recommended by DIGISO.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Số lượng thiết bị được phép sử dụng đồng thời:</strong> nền tảng không giới hạn số thiết bị đăng nhập đồng thời trên một tài khoản. Tuy nhiên, tài khoản chỉ dành cho người đã đăng ký và không được chia sẻ cho người khác; nếu nhiều người cùng làm việc, chủ tài khoản cấp tài khoản nhân viên theo số lượng nhân viên của gói đã đăng ký.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Number of devices allowed concurrently:</strong> the platform does not limit the number of devices signed in at the same time on one account. However, an account is for the registered person only and must not be shared with others; where several people work together, the account owner creates staff accounts within the number of employees included in the registered package.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              3. Mô tả cách sử dụng dịch vụ và các tính năng chính
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              3. How to Use the Service and Main Features
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Founder AI cung cấp dịch vụ trực tuyến dưới dạng phần mềm (SaaS). Các bước sử dụng cơ bản:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Founder AI provides an online service as software (SaaS). The basic steps of use are:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Đăng ký tài khoản và đăng nhập</strong> tại founderai.biz, xác thực email; chọn gói dịch vụ và thanh toán (nếu gói có thu phí) — dịch vụ được kích hoạt tự động ngay khi thanh toán được xác nhận thành công.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Register an account and sign in</strong> at founderai.biz and verify your email; choose a service package and pay (if the package is paid) — the service is activated automatically as soon as payment is successfully confirmed.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Cung cấp thông tin, nội dung và yêu cầu</strong> phục vụ marketing của mình; sử dụng các công cụ AI để hỗ trợ xây dựng, quản lý và tự động hóa marketing.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Provide information, content and requirements</strong> for your marketing; use the AI tools to support building, managing and automating marketing.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Kết nối các kênh được hỗ trợ</strong> như Zalo và Email để thiết lập và thực hiện chiến dịch.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Connect the supported channels</strong>, such as Zalo and Email, to set up and run campaigns.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Tạo và quản lý biểu mẫu</strong>, trang đích (landing page) thu thập thông tin khách hàng tiềm năng và quản lý khách hàng (CRM).
              </li>
              <li className={lc(language, 'en')}>
                <strong>Create and manage forms</strong> and landing pages that collect lead information, and manage customers (CRM).
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Theo dõi, đánh giá hiệu quả</strong> và thử nghiệm một số nội dung, phương án thông qua báo cáo trên nền tảng.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Track and evaluate performance</strong> and test some content and options through the reports on the platform.
              </li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Một số tính năng được cung cấp theo từng gói, điều kiện sử dụng hoặc khả năng tích hợp tại từng thời điểm. Người dùng có trách nhiệm kiểm tra, rà soát nội dung do AI tạo ra trước khi sử dụng hoặc gửi tới bên thứ ba. Hướng dẫn sử dụng chi tiết có tại <a href="/huong-dan" className="text-orange-600 hover:underline">trang Hướng dẫn</a>.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Some features are provided depending on the package, conditions of use or integration availability at any given time. Users are responsible for checking and reviewing AI-generated content before using it or sending it to third parties. Detailed instructions are available on the <a href="/huong-dan" className="text-orange-600 hover:underline">Help page</a>.
            </p>
          </section>

          {/* Section 4 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              4. Phương thức cung cấp
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              4. Method of Delivery
            </h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Nền tảng trực tuyến (SaaS):</strong> dịch vụ được cung cấp dưới dạng phần mềm dịch vụ trên nền tảng web tại <a href="https://founderai.biz" className="text-orange-600 hover:underline">founderai.biz</a>; Người dùng truy cập qua trình duyệt và đăng nhập tài khoản để sử dụng.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Online platform (SaaS):</strong> the service is delivered as Software-as-a-Service on the web platform at <a href="https://founderai.biz" className="text-orange-600 hover:underline">founderai.biz</a>; Users access it through a browser after signing in.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Tự phục vụ (self-service):</strong> Người dùng tự thao tác các chức năng trên giao diện nền tảng để tạo chiến dịch, quản lý khách hàng, gửi tin nhắn, nạp tiền và tải xuất dữ liệu.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Self-service:</strong> Users operate the platform features themselves to create campaigns, manage customers, send messages, top up and export data.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Kích hoạt tự động:</strong> sau khi thanh toán được xác nhận thành công (qua mã QR PayOS hoặc chuyển khoản ngân hàng), dịch vụ được kích hoạt tự động và Người dùng có thể sử dụng ngay.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Automatic activation:</strong> after payment is successfully confirmed (via PayOS QR code or bank transfer), the service is activated automatically and Users can use it immediately.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Hỗ trợ trực tuyến:</strong> DIGISO hỗ trợ Người dùng qua email, hotline và trang <a href="/support" className="text-orange-600 hover:underline">Hình thức hỗ trợ trực tuyến</a>.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Online support:</strong> DIGISO supports Users by email, hotline and the <a href="/support" className="text-orange-600 hover:underline">Online Support</a> page.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Không giao nhận vật lý:</strong> toàn bộ dịch vụ là dịch vụ số; không có sản phẩm vật lý, không phát sinh chi phí vận chuyển.
              </li>
              <li className={lc(language, 'en')}>
                <strong>No physical delivery:</strong> all services are digital; there are no physical products and no shipping costs.
              </li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              5. Các hạn chế trong quá trình sử dụng
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              5. Restrictions During Use
            </h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Dịch vụ được cung cấp qua Internet nên khả năng truy cập và một số tính năng có thể bị ảnh hưởng bởi kết nối, thiết bị, tình trạng hệ thống hoặc phụ thuộc vào dịch vụ, giao diện lập trình (API), chính sách của bên thứ ba (nền tảng nhắn tin, thư điện tử được tích hợp).
              </li>
              <li className={lc(language, 'en')}>
                The service is delivered over the Internet, so access and some features may be affected by connectivity, devices, system status or depend on the services, APIs and policies of third parties (the integrated messaging and email platforms).
              </li>
              <li className={lc(language, 'vi')}>
                Nội dung do AI tạo ra mang tính hỗ trợ, có thể chưa chính xác hoặc đầy đủ; người dùng tự kiểm tra và chịu trách nhiệm khi sử dụng. Dịch vụ không thay thế tư vấn chuyên môn.
              </li>
              <li className={lc(language, 'en')}>
                AI-generated content is for assistance only and may be inaccurate or incomplete; users must check it and are responsible for its use. The service does not replace professional advice.
              </li>
              <li className={lc(language, 'vi')}>
                Giới hạn về tính năng, dung lượng, số chiến dịch, tần suất gửi, hạn mức tài khoản theo gói và theo yêu cầu của nền tảng tích hợp.
              </li>
              <li className={lc(language, 'en')}>
                Limits on features, storage, number of campaigns, sending frequency and account quotas according to the package and the requirements of the integrated platforms.
              </li>
              <li className={lc(language, 'vi')}>
                Không dùng dịch vụ để gửi thư rác, tin nhắn trái phép, lừa đảo, mạo danh, vi phạm sở hữu trí tuệ, quyền riêng tư.
              </li>
              <li className={lc(language, 'en')}>
                The service must not be used to send spam or unauthorised messages, for fraud, impersonation, or to infringe intellectual property or privacy rights.
              </li>
              <li className={lc(language, 'vi')}>
                Người dùng phải có đầy đủ quyền và căn cứ hợp pháp khi cung cấp, sử dụng dữ liệu của khách hàng, người nhận.
              </li>
              <li className={lc(language, 'en')}>
                Users must have full rights and a lawful basis when providing and using their customers' and recipients' data.
              </li>
              <li className={lc(language, 'vi')}>
                DIGISO có thể tạm hạn chế hoặc gián đoạn một phần dịch vụ để bảo trì, nâng cấp, bảo đảm an toàn hệ thống hoặc theo yêu cầu của cơ quan nhà nước và sẽ thông báo trong phạm vi phù hợp.
              </li>
              <li className={lc(language, 'en')}>
                DIGISO may temporarily restrict or interrupt part of the service for maintenance, upgrades, system safety or at the request of state authorities, and will give notice to an appropriate extent.
              </li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Các hạn chế nêu trên không loại trừ quyền của người tiêu dùng và trách nhiệm của DIGISO theo quy định của pháp luật.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              The above restrictions do not exclude consumers' rights or DIGISO's responsibilities under the law.
            </p>
          </section>

          {/* Section 6 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              6. Liên hệ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              6. Contact
            </h2>
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
            </ul>
          </section>

        </div>

        <footer className="border-t border-slate-200 bg-white px-5 py-8 text-center text-[12px] text-slate-500">
          <p className={lc(language, 'vi')}>© 2026 Công ty TNHH Giải pháp số DIGISO. Mọi quyền được bảo lưu.</p>
          <p className={lc(language, 'en')}>© 2026 DIGISO Digital Solutions Co., Ltd. All rights reserved.</p>
          <p className={`mt-2 text-slate-400 ${lc(language, 'vi')}`}>
            Chính sách này được cập nhật và có hiệu lực từ ngày 29/09/2026.
          </p>
          <p className={`mt-2 text-slate-400 ${lc(language, 'en')}`}>
            This policy was last updated and effective from September 29, 2026.
          </p>
        </footer>
        <PolicyHistory language={language} lc={lc} entries={historyEntries} />
      </div>
    </div>
  );
}

export default ServiceDeliveryPolicy;
