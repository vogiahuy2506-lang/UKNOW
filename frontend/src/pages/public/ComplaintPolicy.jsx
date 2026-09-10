import { useState } from 'react';

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
              Tiếp nhận & Giải quyết <span className="text-orange-400">Khiếu nại</span>
            </h1>
            <h1 className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'en')}`}>
              Complaint Handling <span className="text-orange-400">Policy</span>
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

          {/* Section 1: Scope */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              1. Phạm vi áp dụng
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              1. Scope
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Chính sách này quy định quy trình tiếp nhận và giải quyết phản ánh, yêu cầu, khiếu nại của khách hàng đối với các dịch vụ cung cấp trên nền tảng founderai.biz.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              This policy establishes the procedure for receiving and resolving customer feedback, requests, and complaints regarding services provided on the founderai.biz platform.
            </p>
          </section>

          {/* Section 2: How to Submit */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              2. Cách thức tiếp nhận
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              2. How to Submit
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO tiếp nhận phản ánh, yêu cầu, khiếu nại qua các kênh sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO receives feedback, requests, and complaints through the following channels:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Email:</strong> info@digiso.vn
              </li>
              <li className={lc(language, 'en')}>
                <strong>Email:</strong> info@digiso.vn
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Điện thoại:</strong> 0877909606 (8:00 - 22:00, Thứ 2 - Thứ 7)
              </li>
              <li className={lc(language, 'en')}>
                <strong>Phone:</strong> 0877909606 (8:00 AM - 10:00 PM, Monday - Saturday)
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Trang liên hệ:</strong> founderai.biz/contact
              </li>
              <li className={lc(language, 'en')}>
                <strong>Contact page:</strong> founderai.biz/contact
              </li>
            </ul>
          </section>

          {/* Section 3: Process */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              3. Quy trình giải quyết
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              3. Resolution Process
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cam kết giải quyết khiếu nại theo quy trình sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO commits to resolving complaints through the following process:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Tiếp nhận:</strong> DIGISO tiếp nhận và xác nhận đã nhận được khiếu nại trong vòng 24 giờ làm việc.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Receipt:</strong> DIGISO receives and confirms receipt of the complaint within 24 business hours.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Xác minh:</strong> DIGISO xác minh thông tin và thu thập bằng chứng liên quan trong vòng 3 ngày làm việc.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Verification:</strong> DIGISO verifies information and gathers relevant evidence within 3 business days.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Xử lý:</strong> DIGISO đưa ra phương án xử lý và phản hồi trong vòng 7 ngày làm việc.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Handling:</strong> DIGISO provides a resolution and response within 7 business days.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Theo dõi:</strong> DIGISO theo dõi và đảm bảo khiếu nại được giải quyết triệt để.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Follow-up:</strong> DIGISO monitors and ensures complaints are thoroughly resolved.
              </li>
            </ul>
          </section>

          {/* Section 4: Types of Complaints */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              4. Các loại khiếu nại được tiếp nhận
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              4. Types of Complaints Received
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO tiếp nhận các loại khiếu nại sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO receives the following types of complaints:
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
                Technical errors affecting service usage.
              </li>
              <li className={lc(language, 'vi')}>
                Thanh toán và hoàn tiền.
              </li>
              <li className={lc(language, 'en')}>
                Payment and refund issues.
              </li>
              <li className={lc(language, 'vi')}>
                Bảo mật và quyền riêng tư.
              </li>
              <li className={lc(language, 'en')}>
                Security and privacy concerns.
              </li>
              <li className={lc(language, 'vi')}>
                Hành vi của nhân viên hoặc đại lý.
              </li>
              <li className={lc(language, 'en')}>
                Employee or agent conduct.
              </li>
            </ul>
          </section>

          {/* Section 5: Response Time */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              5. Thời hạn phản hồi
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              5. Response Timeframes
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO cam kết các thời hạn phản hồi sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO commits to the following response timeframes:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Xác nhận tiếp nhận:</strong> Trong vòng 24 giờ làm việc.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Acknowledgment:</strong> Within 24 business hours.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Khiếu nại đơn giản:</strong> Giải quyết trong vòng 3 ngày làm việc.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Simple complaints:</strong> Resolved within 3 business days.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Khiếu nại phức tạp:</strong> Giải quyết trong vòng 7 ngày làm việc.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Complex complaints:</strong> Resolved within 7 business days.
              </li>
            </ul>
          </section>

          {/* Section 6: Escalation */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              6. Khiếu nại lên cấp cao hơn
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              6. Escalation
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Nếu không hài lòng với phương án giải quyết, bạn có thể:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              If not satisfied with the resolution, you may:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Yêu cầu chuyển lên cấp quản lý cao hơn của DIGISO.
              </li>
              <li className={lc(language, 'en')}>
                Request escalation to a higher level of DIGISO management.
              </li>
              <li className={lc(language, 'vi')}>
                Gửi khiếu nại đến cơ quan có thẩm quyền theo quy định.
              </li>
              <li className={lc(language, 'en')}>
                Submit complaint to competent authorities as regulated.
              </li>
            </ul>
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
              Nếu bạn có câu hỏi hoặc cần hỗ trợ, vui lòng liên hệ:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              If you have questions or need assistance, please contact:
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

export default ComplaintPolicy;
