import { useState } from 'react';
import PolicyHistory from './components/PolicyHistory.jsx';

/**
 * Returns CSS class based on language selection.
 */
function getLangClass(activeLang, itemLang) {
  return activeLang === itemLang ? '' : 'hidden';
}

/**
 * Terms of Service page.
 * Comprehensive terms for DIGISO platforms.
 *
 * @returns {JSX.Element} Terms of Service page.
 */
function TermsOfService() {
  const [language, setLanguage] = useState('vi');
  const lc = getLangClass;

  return (
    <div className="min-h-screen bg-slate-100/90 text-slate-900 antialiased">
      <style>
        {`
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
        `}
      </style>
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

            <h1
              className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'vi')}`}
            >
              Điều khoản <span className="text-orange-400">sử dụng dịch vụ</span>
            </h1>
            <h1
              className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'en')}`}
            >
              Terms of <span className="text-orange-400">Service</span>
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
              1. Chấp nhận Điều khoản
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              1. Acceptance of Terms
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Công ty TNHH Giải pháp số DIGISO (sau đây gọi là <strong>“DIGISO”</strong>, <strong>“Chúng tôi”</strong> hoặc <strong>“Công ty”</strong>) cung cấp nền tảng và các dịch vụ liên quan tại <strong>founderai.biz</strong> (sau đây gọi chung là <strong>“Nền tảng”</strong> hoặc <strong>“Dịch vụ”</strong>). Các Điều khoản Sử dụng này (sau đây gọi là <strong>“Điều khoản”</strong>) quy định quyền và nghĩa vụ của DIGISO và người sử dụng Dịch vụ (sau đây gọi là <strong>“Bạn”</strong>, <strong>“Người dùng”</strong> hoặc <strong>“Khách hàng”</strong>).
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO Digital Solutions Co., Ltd. (hereinafter <strong>“DIGISO”</strong>, <strong>“We”</strong> or the <strong>“Company”</strong>) provides the platform and related services at <strong>founderai.biz</strong> (collectively the <strong>“Platform”</strong> or the <strong>“Service”</strong>). These Terms of Service (the <strong>“Terms”</strong>) set out the rights and obligations of DIGISO and the users of the Service (hereinafter <strong>“You”</strong>, <strong>“User”</strong> or <strong>“Customer”</strong>).
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              <strong>Việc truy cập Nền tảng để tham khảo thông tin không mặc nhiên được xem là sự chấp thuận đối với Điều khoản.</strong> Trước khi Bạn đăng ký tài khoản, đặt mua hoặc sử dụng Dịch vụ thuộc phạm vi áp dụng của Điều khoản, DIGISO công khai Điều khoản để Bạn xem xét và thực hiện cơ chế xác nhận chấp thuận phù hợp. <strong>Bằng việc chủ động xác nhận đồng ý với Điều khoản thông qua giao diện điện tử của Nền tảng</strong>, Bạn xác nhận đã được cung cấp và có cơ hội xem xét nội dung Điều khoản và đồng ý tuân thủ các Điều khoản này.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              <strong>Accessing the Platform to browse information is not by itself deemed acceptance of the Terms.</strong> Before You register an account, place an order or use a Service within the scope of the Terms, DIGISO publishes the Terms for You to review and applies an appropriate acceptance mechanism. <strong>By actively confirming Your agreement to the Terms through the Platform's electronic interface</strong>, You confirm that You have been provided with, and have had the opportunity to review, the content of the Terms and agree to comply with them.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Nếu Bạn không đồng ý với Điều khoản, Bạn có quyền không đăng ký, không tiếp tục giao kết hoặc không sử dụng Dịch vụ.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              If You do not agree to the Terms, You have the right not to register, not to proceed with the transaction, or not to use the Service.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              <strong>Việc chấp thuận Điều khoản không đồng nghĩa với sự đồng ý đối với việc xử lý dữ liệu cá nhân cho các mục đích mà pháp luật yêu cầu phải có sự đồng ý riêng.</strong> Cơ chế lấy, thay đổi và rút lại sự đồng ý được thực hiện theo <a href="/privacy-policy" className="text-orange-600 hover:underline">Chính sách bảo mật</a> và quy định pháp luật.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              <strong>Acceptance of the Terms does not amount to consent to the processing of personal data for purposes for which the law requires separate consent.</strong> The mechanism for giving, changing and withdrawing consent follows the <a href="/privacy-policy" className="text-orange-600 hover:underline">Privacy Policy</a> and applicable law.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Khi nội dung Điều khoản, các chính sách hoặc điều kiện giao dịch được sửa đổi, DIGISO công bố và xác định thời điểm áp dụng theo Điều khoản này và quy định pháp luật.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              When the Terms, the policies or the conditions of transaction are amended, DIGISO publishes them and determines the time they apply in accordance with these Terms and applicable law.
            </p>
          </section>

          {/* Section 2 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              2. Mô tả Dịch vụ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              2. Description of Services
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              <strong>founderai.biz:</strong> Nền tảng AI dành cho founder, startup và doanh nhân: cung cấp các công cụ trí tuệ nhân tạo, khóa học trực tuyến, và các tài nguyên hỗ trợ phát triển kinh doanh. Phạm vi và phương thức cung cấp dịch vụ được nêu tại <a href="/service-delivery-policy" className="text-orange-600 hover:underline">Chính sách về phương thức cung cấp dịch vụ</a>.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              <strong>founderai.biz:</strong> An AI platform for founders, startups and entrepreneurs, providing artificial intelligence tools, online courses and resources to support business development. The scope and method of providing the service are set out in the <a href="/service-delivery-policy" className="text-orange-600 hover:underline">Service Delivery Policy</a>.
            </p>
          </section>

          {/* Section 3 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              3. Đăng ký và Quản lý Tài khoản
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              3. Account Registration and Management
            </h2>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              3.1. Điều kiện đăng ký
            </h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              3.1. Registration Conditions
            </h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Để đăng ký và sử dụng Dịch vụ, bạn phải đáp ứng các điều kiện sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              To register for and use the Service, You must meet the following conditions:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Đủ 18 tuổi trở lên và có năng lực hành vi dân sự đầy đủ theo quy định của pháp luật Việt Nam.
              </li>
              <li className={lc(language, 'en')}>
                Be at least 18 years old and have full civil legal capacity under Vietnamese law.
              </li>
              <li className={lc(language, 'vi')}>
                Cung cấp thông tin chính xác, đầy đủ và cập nhật khi đăng ký.
              </li>
              <li className={lc(language, 'en')}>
                Provide accurate, complete and up-to-date information when registering.
              </li>
              <li className={lc(language, 'vi')}>
                Cam kết không sử dụng tài khoản cho bất kỳ mục đích bất hợp pháp nào.
              </li>
              <li className={lc(language, 'en')}>
                Undertake not to use the account for any unlawful purpose.
              </li>
              <li className={lc(language, 'vi')}>
                Đồng ý với <a href="/public-dpa" className="text-orange-600 hover:underline">Thỏa thuận xử lý dữ liệu cá nhân</a>, <a href="/privacy-policy" className="text-orange-600 hover:underline">Chính sách bảo mật</a> và các điều khoản, chính sách khác trên Nền tảng.
              </li>
              <li className={lc(language, 'en')}>
                Agree to the <a href="/public-dpa" className="text-orange-600 hover:underline">Personal Data Processing Agreement</a>, the <a href="/privacy-policy" className="text-orange-600 hover:underline">Privacy Policy</a> and the other terms and policies on the Platform.
              </li>
            </ul>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              3.2. Trách nhiệm bảo mật tài khoản
            </h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              3.2. Account Security Responsibilities
            </h3>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Bạn có trách nhiệm bảo mật thông tin đăng nhập (tên đăng nhập, mật khẩu, mã xác thực) trong phạm vi kiểm soát của mình.
              </li>
              <li className={lc(language, 'en')}>
                You are responsible for keeping Your login information (username, password, verification code) secure within Your control.
              </li>
              <li className={lc(language, 'vi')}>
                Không chia sẻ thông tin tài khoản cho người khác, trừ khi được DIGISO chấp thuận hoặc thông qua cơ chế chính thức của Nền tảng.
              </li>
              <li className={lc(language, 'en')}>
                Do not share account information with others unless approved by DIGISO or through the Platform's official mechanisms.
              </li>
              <li className={lc(language, 'vi')}>
                Thông báo ngay cho DIGISO khi phát hiện hoặc nghi ngờ có truy cập trái phép hoặc vi phạm bảo mật.
              </li>
              <li className={lc(language, 'en')}>
                Notify DIGISO immediately upon discovering or suspecting unauthorised access or a security breach.
              </li>
              <li className={lc(language, 'vi')}>
                Bạn chịu trách nhiệm về các hoạt động do chính Bạn thực hiện, cho phép thực hiện, hoặc phát sinh do việc Bạn không tuân thủ nghĩa vụ bảo mật, trừ trường hợp phát sinh do lỗi hoặc sự cố bảo mật thuộc trách nhiệm của DIGISO hoặc trường hợp khác theo quy định pháp luật.
              </li>
              <li className={lc(language, 'en')}>
                You are responsible for activities that You carry out, permit, or that arise from Your failure to comply with security obligations, except where they arise from a fault or security incident for which DIGISO is responsible or in other cases under the law.
              </li>
              <li className={lc(language, 'vi')}>
                DIGISO thực hiện các biện pháp bảo vệ tài khoản và dữ liệu cá nhân theo quy định pháp luật và Chính sách bảo mật.
              </li>
              <li className={lc(language, 'en')}>
                DIGISO applies measures to protect accounts and personal data in accordance with the law and the Privacy Policy.
              </li>
            </ul>
          </section>

          {/* Section 4: User Obligations */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              4. Quyền và Nghĩa vụ của Người dùng
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              4. User Rights and Obligations
            </h2>

            <h3 className={`text-lg font-semibold text-slate-800 mb-3 ${lc(language, 'vi')}`}>
              4.1. Quyền của Người dùng
            </h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-3 ${lc(language, 'en')}`}>
              4.1. User Rights
            </h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Khi sử dụng Dịch vụ, bạn có các quyền sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              When using the Service, you have the following rights:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Sử dụng Dịch vụ theo đúng mục đích và phạm vi cho phép.
              </li>
              <li className={lc(language, 'en')}>
                Use the Service for its intended purpose and within the permitted scope.
              </li>
              <li className={lc(language, 'vi')}>
                Yêu cầu hỗ trợ kỹ thuật khi gặp sự cố liên quan đến Dịch vụ.
              </li>
              <li className={lc(language, 'en')}>
                Request technical support when experiencing issues related to the Service.
              </li>
              <li className={lc(language, 'vi')}>
                Thực hiện các quyền liên quan đến dữ liệu cá nhân theo Chính sách Bảo mật.
              </li>
              <li className={lc(language, 'en')}>
                Exercise rights related to personal data according to the Privacy Policy.
              </li>
              <li className={lc(language, 'vi')}>
                Gửi phản hồi, đề xuất cải tiến Dịch vụ cho DIGISO.
              </li>
              <li className={lc(language, 'en')}>
                Submit feedback and suggestions for Service improvement to DIGISO.
              </li>
            </ul>

            <h3 className={`text-lg font-semibold text-slate-800 mb-3 ${lc(language, 'vi')}`}>
              4.2. Nghĩa vụ của Người dùng
            </h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-3 ${lc(language, 'en')}`}>
              4.2. User Obligations
            </h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Khi sử dụng Dịch vụ, bạn cam kết tuân thủ các nghĩa vụ sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              When using the Service, you commit to complying with the following obligations:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                <strong>Tuân thủ pháp luật:</strong> Sử dụng Dịch vụ tuân thủ quy định pháp luật Việt Nam, không thực hiện hành vi vi phạm pháp luật.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Legal compliance:</strong> Use the Service in compliance with Vietnamese law, do not engage in illegal activities.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bảo mật thông tin:</strong> Không tiết lộ thông tin mật, tài liệu nội bộ của DIGISO cho bên thứ ba.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Information security:</strong> Do not disclose DIGISO&apos;s confidential information or internal documents to third parties.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Không spam:</strong> Không sử dụng Dịch vụ để gửi thư rác, tin nhắn quảng cáo không mong muốn.
              </li>
              <li className={lc(language, 'en')}>
                <strong>No spam:</strong> Do not use the Service to send spam or unsolicited advertising messages.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Không xâm nhập:</strong> Không cố gắng xâm nhập, tấn công hoặc làm gián đoạn hệ thống của DIGISO.
              </li>
              <li className={lc(language, 'en')}>
                <strong>No intrusion:</strong> Do not attempt to intrude, attack, or disrupt DIGISO&apos;s systems.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bảo vệ dữ liệu:</strong> Tuân thủ các quy định về bảo vệ dữ liệu cá nhân khi xử lý dữ liệu trên Nền tảng.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Data protection:</strong> Comply with personal data protection regulations when processing data on the Platform.
              </li>
            </ul>
          </section>

          {/* Section 5: Prohibited Activities */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              5. Hành vi bị Nghiêm cấm
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              5. Prohibited Activities
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Nghiêm cấm Người dùng thực hiện các hành vi sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Users are strictly prohibited from engaging in the following activities:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                Sử dụng Dịch vụ cho mục đích bất hợp pháp, lừa đảo, hoặc vi phạm quyền của bất kỳ bên nào.
              </li>
              <li className={lc(language, 'en')}>
                Use the Service for illegal purposes, fraud, or violation of any party&apos;s rights.
              </li>
              <li className={lc(language, 'vi')}>
                Vi phạm quyền sở hữu trí tuệ của DIGISO hoặc bên thứ ba.
              </li>
              <li className={lc(language, 'en')}>
                Violate intellectual property rights of DIGISO or third parties.
              </li>
              <li className={lc(language, 'vi')}>
                Phát tán virus, phần mềm độc hại, hoặc bất kỳ mã có hại nào.
              </li>
              <li className={lc(language, 'en')}>
                Distribute viruses, malware, or any harmful code.
              </li>
              <li className={lc(language, 'vi')}>
                Thu thập thông tin của người dùng khác mà không có sự đồng ý.
              </li>
              <li className={lc(language, 'en')}>
                Collect information from other users without their consent.
              </li>
              <li className={lc(language, 'vi')}>
                Gian lận, lạm dụng hoặc can thiệp vào hoạt động của Dịch vụ.
              </li>
              <li className={lc(language, 'en')}>
                Fraud, abuse, or interfere with the operation of the Service.
              </li>
              <li className={lc(language, 'vi')}>
                Sử dụng automated bots, scripts, hoặc công cụ khai thác trái phép Dịch vụ.
              </li>
              <li className={lc(language, 'en')}>
                Use automated bots, scripts, or tools to exploit the Service illegally.
              </li>
              <li className={lc(language, 'vi')}>
                Xâm nhập trái phép vào hệ thống, cơ sở dữ liệu của DIGISO.
              </li>
              <li className={lc(language, 'en')}>
                Illegally intrude into DIGISO&apos;s systems or databases.
              </li>
              <li className={lc(language, 'vi')}>
                Vi phạm Luật An ninh mạng, Luật An toàn thông tin mạng của Việt Nam.
              </li>
              <li className={lc(language, 'en')}>
                Violate Vietnam&apos;s Cybersecurity Law or Network Information Security Law.
              </li>
            </ul>
          </section>

          {/* Section 6: Intellectual Property */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              6. Sở hữu trí tuệ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              6. Intellectual Property
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Tất cả quyền sở hữu trí tuệ liên quan đến Dịch vụ, bao gồm nhưng không giới hạn: phần mềm, mã nguồn, giao diện người dùng, thiết kế, logo, nhãn hiệu, nội dung, tài liệu, và tất cả các yếu tố khác của Nền tảng đều thuộc quyền sở hữu của DIGISO hoặc các bên cấp phép của DIGISO.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              All intellectual property rights related to the Service, including but not limited to: software, source code, user interface, design, logos, trademarks, content, documents, and all other elements of the Platform are owned by DIGISO or DIGISO&apos;s licensors.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Bạn được cấp quyền sử dụng hạn chế, không độc quyền, có thể thu hồi để sử dụng Dịch vụ theo các Điều khoản này. Bạn không được phép:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              You are granted a limited, non-exclusive, revocable right to use the Service under these Terms. You are not allowed to:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                Sao chép, sửa đổi, phân phối lại mã nguồn hoặc phần mềm của DIGISO.
              </li>
              <li className={lc(language, 'en')}>
                Copy, modify, or redistribute DIGISO&apos;s source code or software.
              </li>
              <li className={lc(language, 'vi')}>
                Sử dụng nhãn hiệu, logo của DIGISO cho mục đích thương mại mà không có sự cho phép bằng văn bản.
              </li>
              <li className={lc(language, 'en')}>
                Use DIGISO&apos;s trademarks or logos for commercial purposes without written permission.
              </li>
              <li className={lc(language, 'vi')}>
                Reverse engineer, decompile, hoặc giải mã phần mềm của DIGISO.
              </li>
              <li className={lc(language, 'en')}>
                Reverse engineer, decompile, or decode DIGISO&apos;s software.
              </li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              7. Thanh toán và Phí dịch vụ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              7. Payment and Service Fees
            </h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Một số Dịch vụ của DIGISO có thu phí. Chi tiết về giá cả, gói dịch vụ và phương thức thanh toán được thông báo cụ thể trên Nền tảng (xem <a href="/pricing-policy" className="text-orange-600 hover:underline">Chính sách về giá</a> và <a href="/payment-policy" className="text-orange-600 hover:underline">Chính sách về thanh toán</a>).
              </li>
              <li className={lc(language, 'en')}>
                Some of DIGISO's Services are charged. Details of prices, service packages and payment methods are announced on the Platform (see the <a href="/pricing-policy" className="text-orange-600 hover:underline">Pricing Policy</a> and the <a href="/payment-policy" className="text-orange-600 hover:underline">Payment Policy</a>).
              </li>
              <li className={lc(language, 'vi')}>
                Phí dịch vụ được thanh toán theo chu kỳ (hàng tháng/hàng năm) hoặc theo mức sử dụng tùy gói dịch vụ.
              </li>
              <li className={lc(language, 'en')}>
                Service fees are paid per cycle (monthly/yearly) or by usage depending on the service package.
              </li>
              <li className={lc(language, 'vi')}>
                DIGISO có quyền thay đổi giá phí với thông báo trước ít nhất 30 ngày.
              </li>
              <li className={lc(language, 'en')}>
                DIGISO has the right to change prices and fees with at least 30 days' prior notice.
              </li>
              <li className={lc(language, 'vi')}>
                Bạn chịu trách nhiệm thanh toán đầy đủ và đúng hạn các khoản phí.
              </li>
              <li className={lc(language, 'en')}>
                You are responsible for paying all fees in full and on time.
              </li>
              <li className={lc(language, 'vi')}>
                DIGISO không hoàn lại phí đã thanh toán, trừ trường hợp pháp luật có quy định khác hoặc các trường hợp nêu tại <a href="/refund-policy" className="text-orange-600 hover:underline">Chính sách chấm dứt dịch vụ và hoàn tiền</a> trên Nền tảng.
              </li>
              <li className={lc(language, 'en')}>
                DIGISO does not refund fees already paid, except as otherwise provided by law or in the cases set out in the <a href="/refund-policy" className="text-orange-600 hover:underline">Service Termination and Refund Policy</a> on the Platform.
              </li>
            </ul>
          </section>

          {/* Section 8 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              8. Khả năng sử dụng Dịch vụ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              8. Availability of the Service
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cam kết nỗ lực đảm bảo Dịch vụ hoạt động ổn định và liên tục. Tuy nhiên, DIGISO không đảm bảo Dịch vụ sẽ không bị gián đoạn, trễ hoặc không có lỗi.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO undertakes to make reasonable efforts to keep the Service stable and continuous. However, DIGISO does not guarantee that the Service will be free from interruption, delay or errors.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO có quyền tạm ngừng hoặc ngừng cung cấp Dịch vụ trong các trường hợp:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO has the right to suspend or discontinue the Service in the following cases:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Bảo trì hệ thống theo kế hoạch hoặc khẩn cấp.
              </li>
              <li className={lc(language, 'en')}>
                Scheduled or emergency system maintenance.
              </li>
              <li className={lc(language, 'vi')}>
                Người dùng vi phạm các Điều khoản Sử dụng.
              </li>
              <li className={lc(language, 'en')}>
                The User violates the Terms of Service.
              </li>
              <li className={lc(language, 'vi')}>
                Yêu cầu từ cơ quan nhà nước có thẩm quyền.
              </li>
              <li className={lc(language, 'en')}>
                A request from a competent state authority.
              </li>
              <li className={lc(language, 'vi')}>
                Sự cố kỹ thuật nằm ngoài tầm kiểm soát của DIGISO.
              </li>
              <li className={lc(language, 'en')}>
                Technical incidents beyond DIGISO's control.
              </li>
              <li className={lc(language, 'vi')}>
                Các trường hợp khác theo chính sách của Nền tảng hoặc quy định pháp luật (xem <a href="/service-terms" className="text-orange-600 hover:underline">Các điều kiện hoặc hạn chế trong việc cung cấp dịch vụ trên nền tảng</a>).
              </li>
              <li className={lc(language, 'en')}>
                Other cases under the Platform's policies or the law (see <a href="/service-terms" className="text-orange-600 hover:underline">Conditions and Restrictions on the Provision of Services on the Platform</a>).
              </li>
            </ul>
          </section>

          {/* Section 9 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              9. Giới hạn trách nhiệm
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              9. Limitation of Liability
            </h2>
            <ul className={`list-none pl-0 text-slate-700 mb-4 space-y-2 ${lc(language, 'vi')}`}>
              <li><strong>9.1.</strong> DIGISO cung cấp Dịch vụ theo tính năng, phạm vi và điều kiện được công bố tại thời điểm đăng ký hoặc sử dụng. DIGISO nỗ lực duy trì Dịch vụ ổn định nhưng không bảo đảm Dịch vụ đáp ứng mọi yêu cầu riêng của Bạn hoặc không bị gián đoạn do lý do kỹ thuật, bảo trì, sự cố mạng, sự kiện bất khả kháng hoặc nguyên nhân khách quan khác.</li>
              <li><strong>9.2.</strong> Trong phạm vi pháp luật cho phép, DIGISO không chịu trách nhiệm đối với thiệt hại phát sinh do: (a) Bạn sử dụng Dịch vụ không đúng hướng dẫn, điều kiện hoặc quy định pháp luật; (b) thông tin, dữ liệu do Bạn cung cấp không chính xác; (c) dịch vụ, hệ thống của bên thứ ba mà DIGISO không kiểm soát.</li>
              <li><strong>9.3.</strong> Trong phạm vi pháp luật cho phép, tổng trách nhiệm bồi thường của DIGISO đối với Bạn không vượt quá tổng số phí mà Bạn đã thực tế thanh toán cho DIGISO trong 12 tháng liền trước sự kiện làm phát sinh yêu cầu.</li>
              <li><strong>9.4.</strong> Giới hạn tại mục 9.3 không áp dụng đối với các trường hợp pháp luật không cho phép hạn chế hoặc loại trừ trách nhiệm, bao gồm: hành vi cố ý vi phạm pháp luật; nghĩa vụ đối với người tiêu dùng theo quy định pháp luật; trách nhiệm bồi thường thiệt hại do xử lý dữ liệu cá nhân mà pháp luật quy định DIGISO phải chịu; và các trường hợp khác theo quy định pháp luật.</li>
              <li><strong>9.5.</strong> Không có nội dung nào tại Điều khoản này hạn chế hoặc loại trừ quyền khiếu nại, giải quyết tranh chấp, đòi bồi thường và các quyền hợp pháp khác của người tiêu dùng theo quy định pháp luật.</li>
            </ul>
            <ul className={`list-none pl-0 text-slate-700 mb-4 space-y-2 ${lc(language, 'en')}`}>
              <li><strong>9.1.</strong> DIGISO provides the Service according to the features, scope and conditions published at the time of registration or use. DIGISO makes efforts to keep the Service stable but does not guarantee that the Service will meet all of Your specific requirements or will not be interrupted due to technical reasons, maintenance, network incidents, force majeure or other objective causes.</li>
              <li><strong>9.2.</strong> To the extent permitted by law, DIGISO is not liable for damage arising from: (a) Your use of the Service contrary to the instructions, conditions or the law; (b) inaccurate information or data provided by You; (c) third-party services or systems that DIGISO does not control.</li>
              <li><strong>9.3.</strong> To the extent permitted by law, DIGISO's total liability to You shall not exceed the total fees You have actually paid to DIGISO in the 12 months immediately preceding the event giving rise to the claim.</li>
              <li><strong>9.4.</strong> The limit in section 9.3 does not apply where the law does not permit liability to be limited or excluded, including: intentional violations of the law; obligations to consumers under the law; liability for damages arising from personal data processing for which the law requires DIGISO to be responsible; and other cases provided by law.</li>
              <li><strong>9.5.</strong> Nothing in these Terms limits or excludes the consumer's right to complain, resolve disputes, claim compensation and other lawful rights under the law.</li>
            </ul>
          </section>

          {/* Section 10: Indemnification */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              10. Bồi thường
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              10. Indemnification
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Bạn đồng ý bồi thường, bảo vệ và giữ cho DIGISO, các giám đốc, nhân viên, đối tác và đại lý của DIGISO không bị tổn thương trước bất kỳ khiếu nại, yêu cầu, hành động, thiệt hại, tổn thất, chi phí (bao gồm phí pháp lý hợp lý) phát sinh từ:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              You agree to indemnify, defend, and hold harmless DIGISO, its directors, employees, partners, and agents from any claims, demands, actions, damages, losses, costs (including reasonable legal fees) arising from:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                Việc bạn sử dụng Dịch vụ vi phạm các Điều khoản này.
              </li>
              <li className={lc(language, 'en')}>
                Your use of the Service in violation of these Terms.
              </li>
              <li className={lc(language, 'vi')}>
                Việc bạn vi phạm quyền của bất kỳ bên thứ ba nào.
              </li>
              <li className={lc(language, 'en')}>
                Your violation of any third party&apos;s rights.
              </li>
              <li className={lc(language, 'vi')}>
                Việc bạn tải lên, chia sẻ hoặc truyền nội dung bất hợp pháp.
              </li>
              <li className={lc(language, 'en')}>
                Your uploading, sharing, or transmitting illegal content.
              </li>
            </ul>
          </section>

          {/* Section 11 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              11. Chấm dứt Dịch vụ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              11. Termination of the Service
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Các trường hợp chấm dứt Dịch vụ, thời điểm chấm dứt, quy trình yêu cầu chấm dứt, hậu quả của việc chấm dứt và việc hoàn tiền được quy định tại <a href="/refund-policy" className="text-orange-600 hover:underline">Chính sách chấm dứt dịch vụ và hoàn tiền</a> công bố trên Nền tảng.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              The cases of termination of the Service, the time of termination, the procedure for requesting termination, the consequences of termination and refunds are set out in the <a href="/refund-policy" className="text-orange-600 hover:underline">Service Termination and Refund Policy</a> published on the Platform.
            </p>
          </section>

          {/* Section 12 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              12. Quyền riêng tư và Bảo vệ dữ liệu
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              12. Privacy and Data Protection
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Việc Bạn sử dụng Dịch vụ chịu sự điều chỉnh của <a href="/privacy-policy" className="text-orange-600 hover:underline">Chính sách bảo mật</a> và <a href="/public-dpa" className="text-orange-600 hover:underline">Thỏa thuận xử lý dữ liệu cá nhân</a> của DIGISO.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Your use of the Service is governed by DIGISO's <a href="/privacy-policy" className="text-orange-600 hover:underline">Privacy Policy</a> and <a href="/public-dpa" className="text-orange-600 hover:underline">Personal Data Processing Agreement</a>.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cam kết bảo vệ dữ liệu cá nhân của Bạn và tuân thủ Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO undertakes to protect Your personal data and to comply with Law No. 91/2025/QH15 on Personal Data Protection and Decree 356/2025/NĐ-CP.
            </p>
          </section>

          {/* Section 13 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              13. Sửa đổi Điều khoản
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              13. Amendment of the Terms
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO có thể sửa đổi, bổ sung Điều khoản, các chính sách và nội dung liên quan để phù hợp với thay đổi về Dịch vụ, kỹ thuật, an toàn, bảo mật hoặc quy định pháp luật. DIGISO <strong>công bố nội dung sửa đổi và thời điểm có hiệu lực cụ thể</strong> trên founderai.biz và thông báo cho Người dùng qua phương thức liên hệ phù hợp.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO may amend or supplement the Terms, the policies and related content to reflect changes to the Service, technology, safety, security or the law. DIGISO <strong>publishes the amended content and the specific effective date</strong> on founderai.biz and notifies Users through an appropriate means of contact.
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Trừ trường hợp pháp luật có quy định khác, các sửa đổi <strong>làm thay đổi đáng kể quyền, nghĩa vụ, giá/phí, phạm vi dịch vụ, thời hạn hoặc điều kiện chấm dứt</strong> sẽ được thông báo trước <strong>ít nhất 15 ngày</strong> trước ngày dự kiến có hiệu lực. Nếu không đồng ý, Bạn có quyền ngừng sử dụng và/hoặc chấm dứt Dịch vụ.
              </li>
              <li className={lc(language, 'en')}>
                Unless otherwise provided by law, amendments that <strong>materially change rights, obligations, prices/fees, service scope, term or termination conditions</strong> will be notified <strong>at least 15 days</strong> before the intended effective date. If You do not agree, You have the right to stop using and/or terminate the Service.
              </li>
              <li className={lc(language, 'vi')}>
                Đối với sửa đổi liên quan đến việc <strong>thu thập, xử lý, sử dụng, chia sẻ dữ liệu cá nhân</strong> mà pháp luật yêu cầu phải có sự đồng ý, DIGISO sẽ lấy <strong>sự đồng ý rõ ràng, cụ thể, theo từng mục đích</strong> của Bạn trước khi thực hiện; <strong>việc tiếp tục sử dụng, im lặng hoặc không phản hồi không được xem là sự đồng ý</strong> trong trường hợp pháp luật yêu cầu phải có sự đồng ý.
              </li>
              <li className={lc(language, 'en')}>
                For amendments relating to the <strong>collection, processing, use or sharing of personal data</strong> where the law requires consent, DIGISO will obtain Your <strong>clear and specific consent, for each purpose,</strong> before proceeding; <strong>continued use, silence or non-response is not deemed consent</strong> where the law requires consent.
              </li>
              <li className={lc(language, 'vi')}>
                Đối với thay đổi nhằm thực hiện nghĩa vụ bắt buộc theo quy định pháp luật hoặc yêu cầu của cơ quan nhà nước có thẩm quyền: thay đổi áp dụng kể từ thời điểm quy định pháp luật hoặc yêu cầu đó có hiệu lực; DIGISO sẽ thông báo sớm nhất có thể.
              </li>
              <li className={lc(language, 'en')}>
                For changes made to perform mandatory obligations under the law or at the request of a competent state authority: the change applies from the time that legal provision or request takes effect; DIGISO will give notice as early as possible.
              </li>
              <li className={lc(language, 'vi')}>
                Đối với thay đổi không thuộc trường hợp phải có sự chấp thuận riêng, việc Bạn tiếp tục sử dụng Dịch vụ sau ngày hiệu lực có thể được hiểu là Bạn tiếp tục sử dụng theo nội dung đã công bố, trong phạm vi pháp luật cho phép.
              </li>
              <li className={lc(language, 'en')}>
                For changes that do not require separate acceptance, Your continued use of the Service after the effective date may be understood as continued use on the terms published, to the extent permitted by law.
              </li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Khi có thay đổi quan trọng, DIGISO thông báo qua: thông báo trên Nền tảng (banner, pop-up); email gửi đến địa chỉ email đã đăng ký; cập nhật trên trang Điều khoản Sử dụng. Bạn có thể xem lại các phiên bản trước tại mục “Lịch sử cập nhật” cuối trang này.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              For important changes, DIGISO gives notice through: notices on the Platform (banner, pop-up); email to the registered email address; and an update on the Terms of Service page. You can review earlier versions in the “Update history” section at the bottom of this page.
            </p>
          </section>

          {/* Section 14: Governing Law */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              14. Luật áp dụng và Giải quyết tranh chấp
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              14. Governing Law and Dispute Resolution
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Các Điều khoản Sử dụng này được điều chỉnh và giải thích theo quy định của pháp luật <strong>nước Cộng hòa Xã hội Chủ nghĩa Việt Nam</strong>.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              These Terms of Service are governed by and interpreted in accordance with the laws of the <strong>Socialist Republic of Vietnam</strong>.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Mọi tranh chấp phát sinh từ hoặc liên quan đến các Điều khoản này sẽ được giải quyết trước tiên thông qua thương lượng, hòa giải trên tinh thần hợp tác. Trong trường hợp không thể giải quyết bằng thương lượng trong vòng <strong>30 ngày</strong>, tranh chấp sẽ được đưa ra <strong>Tòa án nhân dân có thẩm quyền tại Thành phố Hồ Chí Minh</strong> để giải quyết.
            </p>
            <p className={`text-slate-700 ${lc(language, 'en')}`}>
              Any disputes arising from or related to these Terms will first be resolved through negotiation and reconciliation in a spirit of cooperation. If unable to resolve through negotiation within <strong>30 days</strong>, the dispute will be submitted to the <strong>Competent People&apos;s Court in Ho Chi Minh City</strong> for resolution.
            </p>
          </section>

          {/* Section 15: Affiliate Program */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              15. Chương trình Đối tác Giới thiệu
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              15. Referral Partner Program
            </h2>

            <h3 className={`text-lg font-semibold text-slate-900 mb-2 ${lc(language, 'vi')}`}>15.1. Tham gia và cách tính hoa hồng</h3>
            <h3 className={`text-lg font-semibold text-slate-900 mb-2 ${lc(language, 'en')}`}>15.1. Participation and commission calculation</h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Khi đăng ký tài khoản, bạn đương nhiên trở thành Đối tác Cấp 1, không cần xét duyệt. Hoa hồng được tính trên <strong>doanh thu phát sinh trong từng tháng</strong> từ những khách hàng bạn giới thiệu, theo bậc đã công bố. Khi doanh thu trong tháng vượt ngưỡng lên bậc cao hơn, <strong>tỉ lệ mới áp cho toàn bộ doanh thu của tháng đó</strong>. Doanh thu tính bậc được đặt lại về 0 vào đầu mỗi tháng; số dư hoa hồng đã ghi nhận thì được bảo lưu cho tới khi bạn rút.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Upon registering an account, you automatically become a Level 1 Partner with no approval required. Commission is calculated on <strong>revenue generated within each calendar month</strong> from customers you referred, according to the published tiers. When monthly revenue crosses a higher tier threshold, <strong>the new rate applies to that entire month&apos;s revenue</strong>. Tier revenue resets to zero at the start of each month; commission already recorded is retained until you withdraw it.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Chương trình chỉ có <strong>một cấp giới thiệu</strong>. Nếu A giới thiệu B và B giới thiệu C, A không được hưởng hoa hồng từ giao dịch của C. Người giới thiệu được ghi nhận <strong>một lần duy nhất tại thời điểm khách hàng đăng ký</strong> và không thay đổi về sau.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              The program has <strong>a single referral level</strong>. If A refers B and B refers C, A earns nothing from C&apos;s transactions. The referrer is recorded <strong>once, at the time the customer registers</strong>, and is not changed thereafter.
            </p>

            <h3 className={`text-lg font-semibold text-slate-900 mb-2 ${lc(language, 'vi')}`}>15.2. Hành vi bị cấm và quyền thu hồi hoa hồng</h3>
            <h3 className={`text-lg font-semibold text-slate-900 mb-2 ${lc(language, 'en')}`}>15.2. Prohibited conduct and right to reclaim commission</h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Bạn không được thực hiện các hành vi sau nhằm hưởng hoa hồng không chính đáng:
            </p>
            <ul className={`list-disc pl-6 text-slate-700 mb-4 space-y-1 ${lc(language, 'vi')}`}>
              <li>Tự mua dịch vụ cho chính mình thông qua tài khoản khác do bạn hoặc người thân của bạn kiểm soát;</li>
              <li>Tạo tài khoản giả, dùng thông tin của người khác, hoặc mua bán/trao đổi mã giới thiệu;</li>
              <li>Quảng bá sai lệch về giá, tính năng hoặc cam kết của DIGISO;</li>
              <li>Gửi thư rác, tin nhắn hàng loạt không được phép, hoặc mọi hình thức tiếp thị vi phạm pháp luật.</li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              You must not engage in the following in order to obtain commission improperly: purchasing services for yourself through another account controlled by you or your relatives; creating fake accounts, using another person&apos;s information, or selling/trading referral codes; misrepresenting DIGISO&apos;s pricing, features, or commitments; sending spam, unauthorised bulk messages, or any unlawful marketing.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Khi có căn cứ hợp lý cho rằng một khoản hoa hồng phát sinh từ các hành vi nêu trên, DIGISO có quyền <strong>từ chối chi trả, thu hồi khoản hoa hồng đó khỏi số dư của bạn, và chấm dứt việc tham gia chương trình</strong>. Mọi thao tác thu hồi đều được ghi nhận kèm lý do trong lịch sử số dư để bạn đối chiếu. Hoa hồng phát sinh từ đơn hàng bị huỷ hoặc hoàn tiền cũng được điều chỉnh tương ứng.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Where there are reasonable grounds to believe a commission arose from the conduct above, DIGISO may <strong>refuse payment, reclaim that commission from your balance, and terminate your participation</strong>. Every reclaim is recorded with its reason in your balance history for your review. Commission arising from cancelled or refunded orders is adjusted accordingly.
            </p>

            <h3 className={`text-lg font-semibold text-slate-900 mb-2 ${lc(language, 'vi')}`}>15.3. Rút hoa hồng, thuế và dữ liệu cá nhân</h3>
            <h3 className={`text-lg font-semibold text-slate-900 mb-2 ${lc(language, 'en')}`}>15.3. Withdrawal, tax and personal data</h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Bạn có thể yêu cầu rút khi số tiền muốn rút đạt từ <strong>1.000.000 VNĐ</strong> trở lên. DIGISO chi trả trong vòng <strong>07 ngày làm việc</strong> kể từ khi nhận yêu cầu. Với đối tác là <strong>cá nhân</strong>, DIGISO thay mặt bạn khấu trừ <strong>10% thuế thu nhập cá nhân</strong>, nộp Ngân sách Nhà nước và cấp cho bạn <strong>chứng từ khấu trừ thuế</strong>.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              You may request a withdrawal when the requested amount reaches <strong>1,000,000 VND</strong> or more. DIGISO pays within <strong>07 working days</strong> of receiving the request. For <strong>individual</strong> partners, DIGISO withholds <strong>10% personal income tax</strong> on your behalf, remits it to the State Budget, and issues you a <strong>tax withholding certificate</strong>.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Để thực hiện nghĩa vụ thuế và chuyển khoản nêu trên, tại <strong>bước gửi yêu cầu rút</strong> — chứ không phải khi đăng ký tài khoản — DIGISO thu thập của bạn: <strong>họ tên, số CCCD/CMND kèm ngày cấp và nơi cấp, tên ngân hàng, số tài khoản và tên chủ tài khoản</strong>. Các dữ liệu này chỉ được dùng cho <strong>đúng mục đích khấu trừ, kê khai thuế và chi trả hoa hồng</strong>, không dùng cho mục đích nào khác và không cung cấp cho bên thứ ba ngoài cơ quan thuế và ngân hàng thực hiện lệnh chuyển tiền. Số CCCD/CMND được <strong>mã hoá khi lưu trữ</strong> và không xuất hiện trong email thông báo. Dữ liệu được lưu trong thời hạn mà pháp luật về thuế và kế toán yêu cầu, sau đó được xoá hoặc ẩn danh.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              To fulfil the tax and payment obligations above, at the <strong>withdrawal request step</strong> — not at account registration — DIGISO collects from you: <strong>full name, national ID number with its issue date and place, bank name, account number and account holder name</strong>. This data is used <strong>solely for withholding, tax declaration and commission payment</strong>, for no other purpose, and is not provided to third parties other than the tax authority and the bank executing the transfer. The national ID number is <strong>encrypted at rest</strong> and never appears in notification emails. Data is retained for the period required by tax and accounting law, after which it is deleted or anonymised.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Việc cung cấp các dữ liệu này là <strong>tự nguyện và chỉ cần thiết nếu bạn muốn rút hoa hồng</strong>. Bạn có thể tiếp tục sử dụng toàn bộ Dịch vụ mà không cung cấp chúng; khi đó số dư hoa hồng của bạn vẫn được bảo lưu. Bạn có quyền yêu cầu xem, chỉnh sửa hoặc xoá dữ liệu này theo Chính sách Bảo mật, trừ phần mà pháp luật về thuế và kế toán buộc DIGISO phải lưu giữ.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Providing this data is <strong>voluntary and necessary only if you wish to withdraw commission</strong>. You may continue using the full Service without providing it, and your commission balance remains preserved. You may request access to, correction of, or deletion of this data under the Privacy Policy, except where tax and accounting law requires DIGISO to retain it.
            </p>

            <h3 className={`text-lg font-semibold text-slate-900 mb-2 ${lc(language, 'vi')}`}>15.4. Thay đổi hoặc chấm dứt chương trình</h3>
            <h3 className={`text-lg font-semibold text-slate-900 mb-2 ${lc(language, 'en')}`}>15.4. Changes to or termination of the program</h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO có quyền điều chỉnh tỉ lệ hoa hồng, các bậc, ngưỡng rút hoặc điều kiện tham gia, và có quyền tạm dừng hoặc chấm dứt chương trình. Mọi thay đổi bất lợi cho đối tác sẽ được <strong>thông báo trước ít nhất 30 ngày</strong> qua email hoặc thông báo trong tài khoản. <strong>Hoa hồng đã được ghi nhận trước thời điểm thay đổi có hiệu lực vẫn được giữ nguyên và chi trả</strong> theo điều kiện tại thời điểm phát sinh.
            </p>
            <p className={`text-slate-700 ${lc(language, 'en')}`}>
              DIGISO may adjust commission rates, tiers, withdrawal thresholds or participation conditions, and may suspend or terminate the program. Any change adverse to partners will be <strong>notified at least 30 days in advance</strong> by email or in-account notice. <strong>Commission already recorded before a change takes effect remains valid and payable</strong> under the conditions in force when it arose.
            </p>
          </section>

          {/* Section 16 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              16. Liên hệ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              16. Contact
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Nếu bạn có bất kỳ câu hỏi hoặc yêu cầu nào liên quan đến các Điều khoản Sử dụng này, vui lòng liên hệ:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              If you have any questions or requests regarding these Terms of Service, please contact:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Công ty:</strong> Công ty TNHH Giải pháp số DIGISO
              </li>
              <li className={lc(language, 'en')}>
                <strong>Company:</strong> DIGISO Digital Solutions Co., Ltd.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Email:</strong> <a href="mailto:info@digiso.vn" className="text-orange-600 hover:underline">info@digiso.vn</a>
              </li>
              <li className={lc(language, 'en')}>
                <strong>Email:</strong> <a href="mailto:info@digiso.vn" className="text-orange-600 hover:underline">info@digiso.vn</a>
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Địa chỉ:</strong> Phòng I.101B Toà nhà A, Khu Công nghệ Phần mềm Đại học Quốc gia Tp. Hồ Chí Minh, Đ. Võ Trường Toản, Khu phố 33, Phường Linh Xuân, TP Hồ Chí Minh, Việt Nam
              </li>
              <li className={lc(language, 'en')}>
                <strong>Address:</strong> Room I.101B, Building A, Software Technology Park, Vietnam National University HCMC, Vo Truong Toan Street, Quarter 33, Linh Xuan Ward, Ho Chi Minh City, Vietnam
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Điện thoại:</strong> 0877 909 606
              </li>
              <li className={lc(language, 'en')}>
                <strong>Phone:</strong> 0877 909 606
              </li>
              <li className={lc(language, 'vi')}>
                <strong>MST:</strong> 0316725362
              </li>
              <li className={lc(language, 'en')}>
                <strong>Tax ID:</strong> 0316725362
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
              <p className={`mt-2 text-[14px] leading-relaxed text-slate-300 ${lc(language, 'vi')}`}>
                Nếu bạn có câu hỏi hoặc yêu cầu liên quan đến Điều khoản sử dụng dịch vụ này, vui lòng liên hệ:
              </p>
              <p className={`mt-2 text-[14px] leading-relaxed text-slate-300 ${lc(language, 'en')}`}>
                If you have questions or requests regarding these Terms of Service, please contact:
              </p>
            </div>
            {/* Grid cho tiếng Việt */}
            <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${lc(language, 'vi')}`}>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Công ty</div>
                <div className="break-words text-[13.5px] leading-snug text-slate-100">Công ty TNHH Giải pháp số DIGISO</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Email</div>
                <div className="break-words text-[13.5px]">
                  <a href="mailto:info@digiso.vn" className="text-orange-400 no-underline hover:underline">info@digiso.vn</a>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Điện thoại</div>
                <div className="break-words text-[13.5px] text-slate-100">0877 909 606</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Website</div>
                <div className="break-words text-[13.5px] leading-relaxed text-slate-100">
                  <a href="https://founderai.biz" target="_blank" rel="noopener noreferrer" className="text-orange-400 no-underline hover:underline">founderai.biz</a>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">MST</div>
                <div className="break-words text-[13.5px] text-slate-100">0316725362</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Địa chỉ</div>
                <div className="break-words text-[13.5px] text-slate-100 leading-relaxed">
                  Phòng I.101B Toà nhà A, Khu Công nghệ Phần mềm Đại học Quốc gia Tp. Hồ Chí Minh
                </div>
              </div>
            </div>

            {/* Grid cho tiếng Anh */}
            <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${lc(language, 'en')}`}>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Company</div>
                <div className="break-words text-[13.5px] leading-snug text-slate-100">DIGISO Digital Solutions Co., Ltd.</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Email</div>
                <div className="break-words text-[13.5px]">
                  <a href="mailto:info@digiso.vn" className="text-orange-400 no-underline hover:underline">info@digiso.vn</a>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Phone</div>
                <div className="break-words text-[13.5px] text-slate-100">0877 909 606</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Website</div>
                <div className="break-words text-[13.5px] leading-relaxed text-slate-100">
                  <a href="https://founderai.biz" target="_blank" rel="noopener noreferrer" className="text-orange-400 no-underline hover:underline">founderai.biz</a>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Tax ID</div>
                <div className="break-words text-[13.5px] text-slate-100">0316725362</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Address</div>
                <div className="break-words text-[13.5px] text-slate-100 leading-relaxed">
                  Room I.101B, Building A, Software Technology Park, Vietnam National University HCMC
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="border-t border-slate-200 bg-white px-5 py-8 text-center text-[12px] text-slate-500">
          <p className={lc(language, 'vi')}>
            © 2026 Công ty TNHH Giải pháp số DIGISO. Mọi quyền được bảo lưu.
            {'\u00a0'}|{'\u00a0'}
            <a href="https://founderai.biz" className="font-medium text-slate-700 no-underline hover:underline">
              founderai.biz
            </a>
          </p>
          <p className={lc(language, 'en')}>
            © 2026 DIGISO Digital Solutions Co., Ltd. All rights reserved.
            {'\u00a0'}|{'\u00a0'}
            <a href="https://founderai.biz" className="font-medium text-slate-700 no-underline hover:underline">
              founderai.biz
            </a>
          </p>
          <p className={lc(language, 'vi')}>
            Điều khoản này được cập nhật và có hiệu lực từ ngày 29/09/2026.
          </p>
          <p className={lc(language, 'en')}>
            These terms were last updated and effective from September 29, 2026.
          </p>
        </footer>
        <PolicyHistory slug="terms" language={language} lc={lc} />
      </div>
    </div>
  );
}

export default TermsOfService;
