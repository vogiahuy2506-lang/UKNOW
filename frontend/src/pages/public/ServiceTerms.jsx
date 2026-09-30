import { useState } from 'react';
import PolicyHistory from './components/PolicyHistory.jsx';

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
              Các điều kiện hoặc hạn chế trong việc cung cấp dịch vụ <span className="text-orange-400">trên nền tảng</span>
            </h1>
            <h1 className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'en')}`}>
              Conditions and Restrictions on the Provision of Services <span className="text-orange-400">on the Platform</span>
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
                {' · '}<a href="#lich-su-cap-nhat" className="font-medium text-orange-600 hover:underline">Các phiên bản đã lưu trữ</a>
                {'\u00a0'}|{'\u00a0'}
                Áp dụng cho: founderai.biz
              </span>
              <span className={lc(language, 'en')}>
                Last updated on <strong>September 29, 2026</strong> — Effective from <strong>September 29, 2026</strong>
                {' · '}<a href="#lich-su-cap-nhat" className="font-medium text-orange-600 hover:underline">Archived versions</a>
                {'\u00a0'}|{'\u00a0'}
                Applies to: founderai.biz
              </span>
            </p>
          </div>

          {/* Section 1 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              1. Phạm vi dịch vụ và hạn chế sử dụng
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              1. Service Scope and Usage Restrictions
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cung cấp nền tảng Marketing Automation tên founderai.biz bao gồm: Landing Page Builder, Email Marketing, Zalo Marketing, CRM, AI Chatbot, Analytics & Reports. Khách hàng chỉ được sử dụng dịch vụ trong phạm vi dịch vụ đã đăng ký hoặc đã thỏa thuận với DIGISO.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO provides the founderai.biz Marketing Automation platform including: Landing Page Builder, Email Marketing, Zalo Marketing, CRM, AI Chatbot, Analytics & Reports. Customers may use the service only within the scope of the services registered or agreed with DIGISO.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Người dùng không được:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Users must not:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Chia sẻ, cho thuê, chuyển nhượng tài khoản hoặc quyền sử dụng dịch vụ trái phép.
              </li>
              <li className={lc(language, 'en')}>
                Share, lease or transfer accounts or the right to use the service without authorisation.
              </li>
              <li className={lc(language, 'vi')}>
                Sử dụng dịch vụ cho mục đích vi phạm pháp luật.
              </li>
              <li className={lc(language, 'en')}>
                Use the service for unlawful purposes.
              </li>
              <li className={lc(language, 'vi')}>
                Tải lên nội dung xuyên tạc, chống phá Nhà nước, vi phạm bản quyền, chứa mã độc hoặc vi phạm thuần phong mỹ tục.
              </li>
              <li className={lc(language, 'en')}>
                Upload content that distorts facts or opposes the State, infringes copyright, contains malware or violates public morals.
              </li>
              <li className={lc(language, 'vi')}>
                Cố ý can thiệp, tấn công, quét lỗ hổng hoặc truy cập trái phép vào dữ liệu của người khác.
              </li>
              <li className={lc(language, 'en')}>
                Deliberately interfere with, attack or scan for vulnerabilities in the system, or gain unauthorised access to other people's data.
              </li>
              <li className={lc(language, 'vi')}>
                Dùng bot hoặc công cụ khai thác quá mức làm nghẽn hệ thống.
              </li>
              <li className={lc(language, 'en')}>
                Use bots or tools that exploit the service excessively and congest the system.
              </li>
              <li className={lc(language, 'vi')}>
                Bán lại, phân phối lại, cấp phép lại dịch vụ cho bên thứ ba khi chưa có thỏa thuận bằng văn bản với DIGISO.
              </li>
              <li className={lc(language, 'en')}>
                Resell, redistribute or sub-license the service to third parties without a written agreement with DIGISO.
              </li>
              <li className={lc(language, 'vi')}>
                Truy cập trái phép tài khoản, dữ liệu hoặc hệ thống của người khác.
              </li>
              <li className={lc(language, 'en')}>
                Gain unauthorised access to other people's accounts, data or systems.
              </li>
            </ul>
          </section>

          {/* Section 2 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              2. Điều kiện cung cấp
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              2. Conditions of Provision
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Để được cung cấp dịch vụ, người dùng cần đáp ứng các điều kiện sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              To be provided with the service, users must meet the following conditions:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Đối tượng:</strong> từ đủ 18 tuổi và có năng lực hành vi dân sự đầy đủ (đối với tổ chức, người đại diện đáp ứng điều kiện này).
              </li>
              <li className={lc(language, 'en')}>
                <strong>Eligibility:</strong> at least 18 years old with full civil legal capacity (for organisations, the representative meets this condition).
              </li>
              <li className={lc(language, 'vi')}>
                Đăng ký tài khoản hợp lệ và xác thực email.
              </li>
              <li className={lc(language, 'en')}>
                Register a valid account and verify the email address.
              </li>
              <li className={lc(language, 'vi')}>
                Đồng ý với các điều khoản và chính sách của nền tảng.
              </li>
              <li className={lc(language, 'en')}>
                Agree to the platform's terms and policies.
              </li>
              <li className={lc(language, 'vi')}>
                Với gói dịch vụ phải thanh toán: thực hiện đầy đủ nghĩa vụ thanh toán.
              </li>
              <li className={lc(language, 'en')}>
                For paid packages: fulfil the payment obligations in full.
              </li>
              <li className={lc(language, 'vi')}>
                Sử dụng thiết bị phù hợp, kết nối Internet ổn định và trình duyệt phù hợp.
              </li>
              <li className={lc(language, 'en')}>
                Use a suitable device, a stable Internet connection and a suitable browser.
              </li>
              <li className={lc(language, 'vi')}>
                Tuân thủ pháp luật Việt Nam về thương mại điện tử và bảo vệ dữ liệu.
              </li>
              <li className={lc(language, 'en')}>
                Comply with Vietnamese law on e-commerce and data protection.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Phạm vi địa lý:</strong> nền tảng được xây dựng và vận hành cho tổ chức, cá nhân hoạt động tại Việt Nam; DIGISO không áp dụng giới hạn kỹ thuật về nơi truy cập, nhưng người dùng phải tuân thủ pháp luật Việt Nam và chính sách của các nền tảng bên thứ ba mà mình kết nối.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Geographic scope:</strong> the platform is built and operated for organisations and individuals operating in Vietnam; DIGISO does not impose a technical restriction on where the service is accessed from, but users must comply with Vietnamese law and the policies of the third-party platforms they connect.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              3. Giới hạn của dịch vụ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              3. Service Limits
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Dịch vụ được cung cấp có giới hạn theo từng gói, gồm:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              The service is provided subject to limits that depend on the package, including:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Số lượng lượt AI (credits).
              </li>
              <li className={lc(language, 'en')}>
                The number of AI usage credits.
              </li>
              <li className={lc(language, 'vi')}>
                Số tài khoản Email, Zalo kết nối.
              </li>
              <li className={lc(language, 'en')}>
                The number of connected Email and Zalo accounts.
              </li>
              <li className={lc(language, 'vi')}>
                Số mẫu template tin nhắn, email.
              </li>
              <li className={lc(language, 'en')}>
                The number of message and email templates.
              </li>
              <li className={lc(language, 'vi')}>
                Giới hạn số landing page.
              </li>
              <li className={lc(language, 'en')}>
                The limit on landing pages.
              </li>
              <li className={lc(language, 'vi')}>
                Giới hạn số email, tin nhắn gửi đi (theo gói, theo ngày và theo giờ).
              </li>
              <li className={lc(language, 'en')}>
                The limit on emails and messages sent (per package, per day and per hour).
              </li>
              <li className={lc(language, 'vi')}>
                Dung lượng lưu trữ.
              </li>
              <li className={lc(language, 'en')}>
                Storage capacity.
              </li>
              <li className={lc(language, 'vi')}>
                Số lượng nhân viên (tài khoản nhân viên).
              </li>
              <li className={lc(language, 'en')}>
                The number of employees (staff accounts).
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Giới hạn về thời gian:</strong> dịch vụ trực tuyến hoạt động liên tục, trừ thời gian bảo trì hoặc gián đoạn theo mục 4. Riêng tin nhắn Zalo không được gửi trong khung giờ yên lặng từ 23:00 đến 06:00 (giờ Việt Nam); chiến dịch đang chạy tạm dừng và tiếp tục gửi lại từ 06:00.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Time limits:</strong> the online service runs continuously, except during maintenance or interruptions described in section 4. In particular, Zalo messages are not sent during the quiet hours from 23:00 to 06:00 (Vietnam time); running campaigns pause and resume from 06:00.
              </li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Phạm vi tính năng, dung lượng, số nhân viên, thời hạn và giới hạn kỹ thuật khác được xác định theo gói tại trang <a href="/pricing" className="text-orange-600 hover:underline">Bảng giá</a>, đơn đặt hàng, tự cấu hình hạn mức, hợp đồng hoặc thỏa thuận. Không sử dụng dịch vụ cho mục đích spam, lừa đảo, vi phạm pháp luật. Hành vi tạo nhiều tài khoản giả mạo để lạm dụng chính sách dùng thử hoặc khuyến mãi là hành vi vi phạm chính sách, điều kiện sử dụng.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              The scope of features, storage, number of employees, term and other technical limits are determined by the package on the <a href="/pricing" className="text-orange-600 hover:underline">Pricing</a> page, the order, self-configured quotas, the contract or the agreement. The service must not be used for spam, fraud or unlawful purposes. Creating multiple fake accounts to abuse the trial or promotion policies is a violation of the policy and conditions of use.
            </p>
          </section>

          {/* Section 4 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              4. Các điều kiện về tính khả dụng của dịch vụ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              4. Service Availability Conditions
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Dịch vụ có thể bị ngừng tạm thời hoặc gián đoạn trong các trường hợp sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              The service may be temporarily suspended or interrupted in the following cases:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Bảo trì, nâng cấp theo kế hoạch hoặc đột xuất để khắc phục lỗ hổng an ninh.
              </li>
              <li className={lc(language, 'en')}>
                Scheduled or unscheduled maintenance and upgrades, including to fix security vulnerabilities.
              </li>
              <li className={lc(language, 'vi')}>
                Sự cố kỹ thuật ngoài tầm kiểm soát từ hạ tầng máy chủ, đường truyền của bên thứ ba.
              </li>
              <li className={lc(language, 'en')}>
                Technical incidents beyond control from server infrastructure or third-party transmission lines.
              </li>
              <li className={lc(language, 'vi')}>
                Yêu cầu khẩn cấp của cơ quan nhà nước có thẩm quyền.
              </li>
              <li className={lc(language, 'en')}>
                Urgent requests from competent state authorities.
              </li>
              <li className={lc(language, 'vi')}>
                Sự kiện bất khả kháng hoặc trở ngại khách quan.
              </li>
              <li className={lc(language, 'en')}>
                Force majeure events or objective obstacles.
              </li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              <strong>Sự kiện bất khả kháng</strong> là sự kiện xảy ra một cách khách quan, không thể lường trước và không thể khắc phục được dù đã áp dụng mọi biện pháp cần thiết và khả năng cho phép, gồm thiên tai, hỏa hoạn, lũ lụt, động đất, dịch bệnh, chiến tranh, bạo loạn, đình công diện rộng, đứt cáp quang quốc tế, sự cố hạ tầng Internet diện rộng ngoài tầm kiểm soát hợp lý của DIGISO…
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              <strong>A force majeure event</strong> is an event that occurs objectively, cannot be foreseen and cannot be remedied despite all necessary measures and capabilities, including natural disasters, fires, floods, earthquakes, epidemics, war, riots, widespread strikes, international submarine cable cuts, and large-scale Internet infrastructure failures beyond DIGISO's reasonable control.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Đối với bảo trì theo kế hoạch có ảnh hưởng đáng kể đến việc sử dụng, DIGISO thông báo trước ít nhất 24 giờ trên giao diện website hoặc qua email, trừ trường hợp bảo trì khẩn cấp vì lý do an ninh mạng.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              For scheduled maintenance that significantly affects use, DIGISO gives at least 24 hours' prior notice on the website interface or by email, except for emergency maintenance for cybersecurity reasons.
            </p>
          </section>

          {/* Section 5 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              5. Quyền từ chối cung cấp dịch vụ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              5. Right to Refuse Service
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO có quyền từ chối cung cấp hoặc chấm dứt cung cấp dịch vụ khi:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO has the right to refuse or stop providing the service when:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Người dùng cung cấp thông tin giả mạo, sai lệch khi đăng ký hoặc giao dịch.
              </li>
              <li className={lc(language, 'en')}>
                The user provides false or misleading information when registering or transacting.
              </li>
              <li className={lc(language, 'vi')}>
                Người dùng vi phạm Điều khoản sử dụng, chính sách hoặc pháp luật.
              </li>
              <li className={lc(language, 'en')}>
                The user violates the Terms of Service, policies or the law.
              </li>
              <li className={lc(language, 'vi')}>
                Có hành vi gian lận, tấn công mạng, khai thác trái phép ảnh hưởng đến hoạt động của nền tảng hoặc quyền lợi của người dùng khác.
              </li>
              <li className={lc(language, 'en')}>
                There is fraud, a cyberattack or unauthorised exploitation that affects the operation of the platform or the rights of other users.
              </li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Trường hợp hủy dịch vụ do lỗi từ phía DIGISO, khách hàng được thông báo cụ thể và được hoàn trả toàn bộ số tiền tương ứng với phần dịch vụ chưa sử dụng.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Where a service is cancelled due to DIGISO's fault, the customer will be notified specifically and refunded in full the amount corresponding to the unused portion of the service.
            </p>
          </section>

          {/* Section 6 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              6. Chấm dứt dịch vụ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              6. Service Termination
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO có quyền tạm ngừng hoặc chấm dứt cung cấp dịch vụ khi:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO has the right to suspend or terminate the service when:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Người dùng vi phạm điều khoản.
              </li>
              <li className={lc(language, 'en')}>
                The user breaches the terms.
              </li>
              <li className={lc(language, 'vi')}>
                Người dùng không thanh toán.
              </li>
              <li className={lc(language, 'en')}>
                The user fails to pay.
              </li>
              <li className={lc(language, 'vi')}>
                Có hành vi trái pháp luật, truy cập trái phép, phát tán mã độc hoặc nguy cơ ảnh hưởng an toàn hệ thống.
              </li>
              <li className={lc(language, 'en')}>
                There is unlawful conduct, unauthorised access, malware distribution or a risk to system safety.
              </li>
              <li className={lc(language, 'vi')}>
                Cần bảo trì, nâng cấp, khắc phục sự cố.
              </li>
              <li className={lc(language, 'en')}>
                Maintenance, upgrades or incident remediation are needed.
              </li>
              <li className={lc(language, 'vi')}>
                Có yêu cầu của cơ quan chức năng.
              </li>
              <li className={lc(language, 'en')}>
                A competent authority so requests.
              </li>
              <li className={lc(language, 'vi')}>
                Xảy ra sự kiện bất khả kháng hoặc trường hợp khác theo Điều khoản sử dụng và pháp luật.
              </li>
              <li className={lc(language, 'en')}>
                A force majeure event or another case under the Terms of Service and the law occurs.
              </li>
              <li className={lc(language, 'vi')}>
                Theo quyết định của DIGISO, với thông báo trước ít nhất 30 ngày.
              </li>
              <li className={lc(language, 'en')}>
                By DIGISO's decision, with at least 30 days' prior notice.
              </li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO thông báo phù hợp cho khách hàng, trừ trường hợp xử lý khẩn cấp để bảo vệ hệ thống, dữ liệu, người sử dụng hoặc theo yêu cầu của cơ quan có thẩm quyền. Các trường hợp chấm dứt dịch vụ, hậu quả và việc hoàn tiền được quy định chi tiết tại <a href="/refund-policy" className="text-orange-600 hover:underline">Chính sách chấm dứt dịch vụ và hoàn tiền</a>.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO gives appropriate notice to the customer, except where emergency action is needed to protect the system, data or users, or at the request of a competent authority. The cases of termination, their consequences and refunds are set out in detail in the <a href="/refund-policy" className="text-orange-600 hover:underline">Service Termination and Refund Policy</a>.
            </p>
          </section>

          {/* Section 7 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              7. Liên hệ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              7. Contact
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
        <PolicyHistory slug="serviceTerms" language={language} lc={lc} />
      </div>
    </div>
  );
}

export default ServiceTerms;
