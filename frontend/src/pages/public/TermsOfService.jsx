import { useState } from 'react';

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
                digiso.vn
              </span>
              <span className="text-slate-600">·</span>
              <span className="rounded-md border border-slate-600/80 bg-slate-900/50 px-2.5 py-1 text-slate-300">
                founderai.biz
              </span>
            </div>

            <h1
              className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'vi')}`}
            >
              Điều Khoản <span className="text-orange-400">Sử Dụng</span>
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
                Cập nhật: <strong>04 tháng 08 năm 2026</strong>
                {'\u00a0'}|{'\u00a0'}
                Áp dụng cho: digiso.vn, founderai.biz
              </span>
              <span className={lc(language, 'en')}>
                Last updated: <strong>August 04, 2026</strong>
                {'\u00a0'}|{'\u00a0'}
                Applies to: digiso.vn, founderai.biz
              </span>
            </p>
          </div>

          {/* Section 1: Acceptance */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              1. Chấp nhận Điều khoản
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              1. Acceptance of Terms
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Bằng việc truy cập, sử dụng hoặc đăng ký tài khoản trên các nền tảng <strong>digiso.vn</strong>, <strong>founderai.biz</strong> và các dịch vụ liên quan (sau đây gọi chung là <strong>&quot;Nền tảng&quot;</strong> hoặc <strong>&quot;Dịch vụ&quot;</strong>) của <strong>Công ty TNHH Giải pháp số DIGISO</strong> (sau đây gọi là <strong>&quot;DIGISO&quot;</strong>, <strong>&quot;Chúng tôi&quot;</strong>, hoặc <strong>&quot;Công ty&quot;</strong>), bạn (sau đây gọi là <strong>&quot;Bạn&quot;</strong>, <strong>&quot;Người dùng&quot;</strong>, hoặc <strong>&quot;Khách hàng&quot;</strong>) xác nhận rằng bạn đã đọc, hiểu và đồng ý bị ràng buộc bởi các Điều khoản Sử dụng này (sau đây gọi là <strong>&quot;Điều khoản&quot;</strong>).
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              By accessing, using, or registering an account on <strong>digiso.vn</strong>, <strong>founderai.biz</strong> and related services (collectively referred to as the <strong>&quot;Platform&quot;</strong> or <strong>&quot;Service&quot;</strong>) of <strong>DIGISO Digital Solutions Co., Ltd.</strong> (hereinafter referred to as <strong>&quot;DIGISO&quot;</strong>, <strong>&quot;We&quot;</strong>, or <strong>&quot;Company&quot;</strong>), you (hereinafter referred to as <strong>&quot;You&quot;</strong>, <strong>&quot;User&quot;</strong>, or <strong>&quot;Customer&quot;</strong>) confirm that you have read, understood, and agree to be bound by these Terms of Service (hereinafter referred to as <strong>&quot;Terms&quot;</strong>).
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Nếu bạn không đồng ý với bất kỳ phần nào của các Điều khoản này, vui lòng không sử dụng Dịch vụ của DIGISO. Việc tiếp tục sử dụng Dịch vụ đồng nghĩa với việc bạn chấp nhận và đồng ý tuân thủ các Điều khoản này.
            </p>
            <p className={`text-slate-700 ${lc(language, 'en')}`}>
              If you do not agree with any part of these Terms, please do not use DIGISO&apos;s Service. Continued use of the Service constitutes your acceptance and agreement to comply with these Terms.
            </p>
          </section>

          {/* Section 2: Services Description */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              2. Mô tả Dịch vụ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              2. Description of Services
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cung cấp các giải pháp số và nền tảng công nghệ cho doanh nghiệp Việt Nam, bao gồm nhưng không giới hạn:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO provides digital solutions and technology platforms for Vietnamese businesses, including but not limited to:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>digiso.vn:</strong> Nền tảng tự động hóa marketing tất cả trong một: tạo trang đích, quản lý khách hàng tiềm năng (CRM), và tự động hóa Email/Zalo cho doanh nghiệp Việt Nam.
              </li>
              <li className={lc(language, 'en')}>
                <strong>digiso.vn:</strong> All-in-one marketing automation platform: landing page creation, customer relationship management (CRM), and Email/Zalo automation for Vietnamese businesses.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>founderai.biz:</strong> Nền tảng AI dành cho founder, startup và doanh nhân: cung cấp các công cụ trí tuệ nhân tạo, khóa học trực tuyến, và các tài nguyên hỗ trợ phát triển kinh doanh.
              </li>
              <li className={lc(language, 'en')}>
                <strong>founderai.biz:</strong> AI platform for founders, startups, and entrepreneurs: providing artificial intelligence tools, online courses, and resources to support business development.
              </li>
            </ul>
            <p className={`text-slate-700 ${lc(language, 'vi')}`}>
              DIGISO có quyền thay đổi, bổ sung hoặc ngừng cung cấp bất kỳ dịch vụ nào bất kỳ lúc nào mà không cần thông báo trước.
            </p>
            <p className={`text-slate-700 ${lc(language, 'en')}`}>
              DIGISO reserves the right to change, supplement, or discontinue any service at any time without prior notice.
            </p>
          </section>

          {/* Section 3: Account Registration */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              3. Đăng ký và Quản lý Tài khoản
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              3. Account Registration and Management
            </h2>

            <h3 className={`text-lg font-semibold text-slate-800 mb-3 ${lc(language, 'vi')}`}>
              3.1. Điều kiện đăng ký
            </h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-3 ${lc(language, 'en')}`}>
              3.1. Registration Requirements
            </h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Để đăng ký và sử dụng Dịch vụ, bạn phải đáp ứng các điều kiện sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              To register and use the Service, you must meet the following requirements:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Đủ <strong>18 tuổi</strong> trở lên và có năng lực hành vi dân sự đầy đủ theo quy định của pháp luật Việt Nam.
              </li>
              <li className={lc(language, 'en')}>
                Be at least <strong>18 years old</strong> and have full civil act capacity under Vietnamese law.
              </li>
              <li className={lc(language, 'vi')}>
                Cung cấp thông tin chính xác, đầy đủ và cập nhật khi đăng ký.
              </li>
              <li className={lc(language, 'en')}>
                Provide accurate, complete, and up-to-date information during registration.
              </li>
              <li className={lc(language, 'vi')}>
                Cam kết không sử dụng tài khoản cho bất kỳ mục đích bất hợp pháp nào.
              </li>
              <li className={lc(language, 'en')}>
                Commit not to use the account for any illegal purposes.
              </li>
              <li className={lc(language, 'vi')}>
                Đồng ý với <strong>Thoả thuận Xử lý Dữ liệu Công khai</strong> và <strong>Chính sách Bảo mật</strong> của DIGISO.
              </li>
              <li className={lc(language, 'en')}>
                Agree to DIGISO&apos;s <strong>Public Data Processing Agreement</strong> and <strong>Privacy Policy</strong>.
              </li>
            </ul>

            <h3 className={`text-lg font-semibold text-slate-800 mb-3 ${lc(language, 'vi')}`}>
              3.2. Trách nhiệm bảo mật tài khoản
            </h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-3 ${lc(language, 'en')}`}>
              3.2. Account Security Responsibilities
            </h3>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                Bạn chịu trách nhiệm bảo mật thông tin đăng nhập (tên đăng nhập, mật khẩu, mã xác thực).
              </li>
              <li className={lc(language, 'en')}>
                You are responsible for securing login information (username, password, verification code).
              </li>
              <li className={lc(language, 'vi')}>
                Không chia sẻ thông tin tài khoản cho bất kỳ người nào khác.
              </li>
              <li className={lc(language, 'en')}>
                Do not share account information with anyone else.
              </li>
              <li className={lc(language, 'vi')}>
                Thông báo ngay cho DIGISO khi phát hiện bất kỳ vi phạm bảo mật nào.
              </li>
              <li className={lc(language, 'en')}>
                Immediately notify DIGISO when discovering any security breach.
              </li>
              <li className={lc(language, 'vi')}>
                Bạn chịu trách nhiệm về mọi hoạt động xảy ra dưới tài khoản của mình.
              </li>
              <li className={lc(language, 'en')}>
                You are responsible for all activities occurring under your account.
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

          {/* Section 7: Payment and Fees */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              7. Thanh toán và Phí dịch vụ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              7. Payment and Service Fees
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Một số Dịch vụ của DIGISO có thu phí. Chi tiết về giá cả, gói dịch vụ và phương thức thanh toán sẽ được thông báo cụ thể trên Nền tảng.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Some DIGISO Services may be chargeable. Details about pricing, service packages, and payment methods will be specifically announced on the Platform.
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                Phí dịch vụ được thanh toán theo chu kỳ (hàng tháng/hàng năm) hoặc theo usage tùy gói dịch vụ.
              </li>
              <li className={lc(language, 'en')}>
                Service fees are paid on a recurring basis (monthly/annually) or based on usage depending on the service package.
              </li>
              <li className={lc(language, 'vi')}>
                DIGISO có quyền thay đổi giá phí với thông báo trước ít nhất <strong>30 ngày</strong>.
              </li>
              <li className={lc(language, 'en')}>
                DIGISO reserves the right to change fees with at least <strong>30 days</strong> prior notice.
              </li>
              <li className={lc(language, 'vi')}>
                Bạn chịu trách nhiệm thanh toán đầy đủ và đúng hạn các khoản phí.
              </li>
              <li className={lc(language, 'en')}>
                You are responsible for paying all fees fully and on time.
              </li>
              <li className={lc(language, 'vi')}>
                DIGISO không hoàn lại phí đã thanh toán trừ trường hợp pháp luật có quy định khác.
              </li>
              <li className={lc(language, 'en')}>
                DIGISO will not refund paid fees unless otherwise required by law.
              </li>
            </ul>
          </section>

          {/* Section 8: Service Availability */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              8. Khả năng sử dụng Dịch vụ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              8. Service Availability
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cam kết nỗ lực đảm bảo Dịch vụ hoạt động ổn định và liên tục. Tuy nhiên, DIGISO không đảm bảo Dịch vụ sẽ không bị gián đoạn, trễ hoặc không có lỗi.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO commits to making efforts to ensure the Service operates stably and continuously. However, DIGISO does not guarantee that the Service will not be interrupted, delayed, or error-free.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO có quyền tạm ngừng hoặc ngừng cung cấp Dịch vụ trong các trường hợp:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO reserves the right to suspend or discontinue the Service in the following cases:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                Bảo trì hệ thống theo kế hoạch hoặc khẩn cấp.
              </li>
              <li className={lc(language, 'en')}>
                Planned or emergency system maintenance.
              </li>
              <li className={lc(language, 'vi')}>
                Người dùng vi phạm các Điều khoản Sử dụng.
              </li>
              <li className={lc(language, 'en')}>
                User violates the Terms of Service.
              </li>
              <li className={lc(language, 'vi')}>
                Yêu cầu từ cơ quan nhà nước có thẩm quyền.
              </li>
              <li className={lc(language, 'en')}>
                Request from competent state authorities.
              </li>
              <li className={lc(language, 'vi')}>
                Sự cố kỹ thuật nằm ngoài tầm kiểm soát của DIGISO.
              </li>
              <li className={lc(language, 'en')}>
                Technical issues beyond DIGISO&apos;s control.
              </li>
            </ul>
          </section>

          {/* Section 9: Limitation of Liability */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              9. Giới hạn trách nhiệm
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              9. Limitation of Liability
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Trong phạm vi tối đa được pháp luật cho phép:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              To the maximum extent permitted by law:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                DIGISO cung cấp Dịch vụ &quot;như hiện có&quot; và &quot;theo khả năng có sẵn&quot;. DIGISO không bảo đảm rằng Dịch vụ sẽ đáp ứng mọi yêu cầu cụ thể của bạn.
              </li>
              <li className={lc(language, 'en')}>
                DIGISO provides the Service &quot;as is&quot; and &quot;as available&quot;. DIGISO does not guarantee that the Service will meet your specific requirements.
              </li>
              <li className={lc(language, 'vi')}>
                DIGISO không chịu trách nhiệm về bất kỳ thiệt hại gián tiếp, đặc biệt, ngẫu nhiên hoặc do hậu quả nào phát sinh từ việc sử dụng Dịch vụ.
              </li>
              <li className={lc(language, 'en')}>
                DIGISO is not liable for any indirect, special, incidental, or consequential damages arising from use of the Service.
              </li>
              <li className={lc(language, 'vi')}>
                Trách nhiệm của DIGISO trong mọi trường hợp không vượt quá số tiền phí bạn đã thanh toán cho DIGISO trong 12 tháng trước khi xảy ra sự kiện gây ra khiếu nại.
              </li>
              <li className={lc(language, 'en')}>
                DIGISO&apos;s liability in any case shall not exceed the amount of fees you paid to DIGISO in the 12 months preceding the event giving rise to the claim.
              </li>
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

          {/* Section 11: Termination */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              11. Chấm dứt Dịch vụ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              11. Termination of Service
            </h2>
            <h3 className={`text-lg font-semibold text-slate-800 mb-3 ${lc(language, 'vi')}`}>
              11.1. Chấm dứt bởi Người dùng
            </h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-3 ${lc(language, 'en')}`}>
              11.1. Termination by User
            </h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Bạn có thể yêu cầu chấm dứt tài khoản bất kỳ lúc nào thông qua cài đặt tài khoản hoặc liên hệ với bộ phận hỗ trợ khách hàng của DIGISO. Việc chấm dứt sẽ có hiệu lực theo chính sách xử lý dữ liệu của DIGISO.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              You may request account termination at any time through account settings or by contacting DIGISO&apos;s customer support. Termination will take effect according to DIGISO&apos;s data processing policy.
            </p>

            <h3 className={`text-lg font-semibold text-slate-800 mb-3 ${lc(language, 'vi')}`}>
              11.2. Chấm dứt bởi DIGISO
            </h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-3 ${lc(language, 'en')}`}>
              11.2. Termination by DIGISO
            </h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO có quyền chấm dứt hoặc đình chỉ tài khoản của bạn ngay lập tức nếu:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO reserves the right to terminate or suspend your account immediately if:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                Bạn vi phạm các Điều khoản Sử dụng này.
              </li>
              <li className={lc(language, 'en')}>
                You violate these Terms of Service.
              </li>
              <li className={lc(language, 'vi')}>
                Bạn thực hiện hoặc bị nghi ngờ thực hiện hành vi gian lận, bất hợp pháp.
              </li>
              <li className={lc(language, 'en')}>
                You engage in or are suspected of fraudulent or illegal activities.
              </li>
              <li className={lc(language, 'vi')}>
                Bạn không thanh toán phí dịch vụ đúng hạn.
              </li>
              <li className={lc(language, 'en')}>
                You fail to pay service fees on time.
              </li>
              <li className={lc(language, 'vi')}>
                DIGISO ngừng cung cấp dịch vụ liên quan.
              </li>
              <li className={lc(language, 'en')}>
                DIGISO discontinues the related service.
              </li>
            </ul>
          </section>

          {/* Section 12: Privacy */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              12. Quyền riêng tư và Bảo vệ dữ liệu
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              12. Privacy and Data Protection
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Việc bạn sử dụng Dịch vụ cũng chịu sự điều chỉnh của <strong>Chính sách Bảo mật</strong> và <strong>Thoả thuận Xử lý Dữ liệu Công khai</strong> của DIGISO. Bạn đồng ý cho DIGISO thu thập, sử dụng, lưu trữ và xử lý dữ liệu cá nhân của bạn theo các chính sách này.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Your use of the Service is also subject to DIGISO&apos;s <strong>Privacy Policy</strong> and <strong>Public Data Processing Agreement</strong>. You agree to allow DIGISO to collect, use, store, and process your personal data according to these policies.
            </p>
            <p className={`text-slate-700 ${lc(language, 'vi')}`}>
              DIGISO cam kết bảo vệ dữ liệu cá nhân của bạn và tuân thủ các quy định pháp luật về bảo vệ dữ liệu cá nhân hiện hành tại Việt Nam, bao gồm Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 13/2023/NĐ-CP.
            </p>
            <p className={`text-slate-700 ${lc(language, 'en')}`}>
              DIGISO commits to protecting your personal data and complying with current personal data protection regulations in Vietnam, including Personal Data Protection Law No. 91/2025/QH15 and Decree 13/2023/ND-CP.
            </p>
          </section>

          {/* Section 13: Modifications */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              13. Sửa đổi Điều khoản
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              13. Modification of Terms
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO có quyền sửa đổi, bổ sung các Điều khoản này bất kỳ lúc nào. Khi có thay đổi quan trọng, DIGISO sẽ thông báo cho bạn thông qua:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO reserves the right to modify these Terms at any time. When significant changes occur, DIGISO will notify you through:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Thông báo trên Nền tảng (banner, pop-up)
              </li>
              <li className={lc(language, 'en')}>
                Notice on the Platform (banner, pop-up)
              </li>
              <li className={lc(language, 'vi')}>
                Email gửi đến địa chỉ email đã đăng ký
              </li>
              <li className={lc(language, 'en')}>
                Email sent to the registered email address
              </li>
              <li className={lc(language, 'vi')}>
                Cập nhật trên trang Điều khoản Sử dụng
              </li>
              <li className={lc(language, 'en')}>
                Update on the Terms of Service page
              </li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Thay đổi sẽ có hiệu lực sau <strong>15 ngày</strong> kể từ ngày thông báo. Nếu bạn không đồng ý với các thay đổi, bạn có thể chấm dứt tài khoản trước khi thay đổi có hiệu lực. Việc tiếp tục sử dụng Dịch vụ sau khi thay đổi có hiệu lực đồng nghĩa với việc bạn chấp nhận các thay đổi đó.
            </p>
            <p className={`text-slate-700 ${lc(language, 'en')}`}>
              Changes will take effect <strong>15 days</strong> after notification. If you do not agree with the changes, you may terminate your account before the changes take effect. Continued use of the Service after changes take effect constitutes your acceptance of those changes.
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

          {/* Section 15: Contact */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              15. Liên hệ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              15. Contact
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Nếu bạn có bất kỳ câu hỏi hoặc yêu cầu nào liên quan đến các Điều khoản Sử dụng này, vui lòng liên hệ:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              If you have any questions or requests regarding these Terms of Service, please contact:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2">
              <li className={lc(language, 'vi')}>
                <strong>Công ty:</strong> Công ty TNHH Giải pháp số DIGISO
              </li>
              <li className={lc(language, 'en')}>
                <strong>Company:</strong> DIGISO Digital Solutions Co., Ltd.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Email:</strong> <a href="mailto:hotro.digibook@gmail.com" className="text-orange-600 hover:underline">hotro.digibook@gmail.com</a>
              </li>
              <li className={lc(language, 'en')}>
                <strong>Email:</strong> <a href="mailto:hotro.digibook@gmail.com" className="text-orange-600 hover:underline">hotro.digibook@gmail.com</a>
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Website:</strong> <a href="https://digiso.vn" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">https://digiso.vn</a>
              </li>
              <li className={lc(language, 'en')}>
                <strong>Website:</strong> <a href="https://digiso.vn" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">https://digiso.vn</a>
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
                Nếu bạn có câu hỏi hoặc yêu cầu liên quan đến Điều khoản Sử dụng này, vui lòng liên hệ:
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
                  <a href="mailto:hotro.digibook@gmail.com" className="text-orange-400 no-underline hover:underline">hotro.digibook@gmail.com</a>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Điện thoại</div>
                <div className="break-words text-[13.5px] text-slate-100">0877 909 606</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Website</div>
                <div className="break-words text-[13.5px] leading-relaxed text-slate-100">
                  <a href="https://digiso.vn" target="_blank" rel="noopener noreferrer" className="text-orange-400 no-underline hover:underline">digiso.vn</a>
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
                  <a href="mailto:hotro.digibook@gmail.com" className="text-orange-400 no-underline hover:underline">hotro.digibook@gmail.com</a>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Phone</div>
                <div className="break-words text-[13.5px] text-slate-100">0877 909 606</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Website</div>
                <div className="break-words text-[13.5px] leading-relaxed text-slate-100">
                  <a href="https://digiso.vn" target="_blank" rel="noopener noreferrer" className="text-orange-400 no-underline hover:underline">digiso.vn</a>
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
            <a href="https://digiso.vn" className="font-medium text-slate-700 no-underline hover:underline">
              digiso.vn
            </a>
            {'\u00a0'}·{'\u00a0'}
            <a href="https://founderai.biz" className="font-medium text-slate-700 no-underline hover:underline">
              founderai.biz
            </a>
          </p>
          <p className={lc(language, 'en')}>
            © 2026 DIGISO Digital Solutions Co., Ltd. All rights reserved.
            {'\u00a0'}|{'\u00a0'}
            <a href="https://digiso.vn" className="font-medium text-slate-700 no-underline hover:underline">
              digiso.vn
            </a>
            {'\u00a0'}·{'\u00a0'}
            <a href="https://founderai.biz" className="font-medium text-slate-700 no-underline hover:underline">
              founderai.biz
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}

export default TermsOfService;
