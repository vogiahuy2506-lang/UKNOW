import { useState } from 'react';
import PolicyHistory from './components/PolicyHistory.jsx';

function getLangClass(activeLang, itemLang) {
  return activeLang === itemLang ? '' : 'hidden';
}

function RightsAndDuties() {
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
              Quyền và nghĩa vụ <span className="text-orange-400">của các bên</span>
            </h1>
            <h1 className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'en')}`}>
              Rights and Obligations <span className="text-orange-400">of the Parties</span>
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
              1. Phạm vi áp dụng
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              1. Scope
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Chính sách này quy định quyền và nghĩa vụ của Công ty TNHH Giải pháp số DIGISO (chủ quản nền tảng founderai.biz) và của Người dùng khi đăng ký, sử dụng dịch vụ trên nền tảng, tuân thủ theo Điều 6 Nghị định 248/2026/NĐ-CP.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              This policy sets out the rights and obligations of DIGISO Digital Solutions Co., Ltd. (the operator of the founderai.biz platform) and of Users when registering for and using services on the platform, in accordance with Article 6 of Decree 248/2026/NĐ-CP.
            </p>
          </section>

          {/* Section 2 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              2. Quyền và nghĩa vụ của Chủ quản nền tảng (DIGISO)
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              2. Rights and Obligations of the Platform Operator (DIGISO)
            </h2>
            <ul className={`list-none pl-0 text-slate-700 mb-4 space-y-2 ${lc(language, 'vi')}`}>
              <li>a) Ban hành, công khai và tổ chức thực hiện điều kiện hoạt động, điều kiện giao dịch;</li>
              <li>b) Xây dựng, công khai tiêu chuẩn dịch vụ, quy trình tham gia hoạt động trên nền tảng;</li>
              <li>c) Thu phí dịch vụ theo <a href="/pricing-policy" className="text-orange-600 hover:underline">Chính sách về giá</a> đã công khai;</li>
              <li>d) Thông tin đầy đủ hoặc tóm tắt về hình thức khuyến mại được áp dụng cung cấp cho người mua trước khi đặt hàng;</li>
              <li>đ) Bảo đảm vận hành an toàn, ổn định nền tảng;</li>
              <li>e) Quy định các trường hợp tạm ngừng, chấm dứt, hạn chế tài khoản người dùng;</li>
              <li>g) Áp dụng các biện pháp cần thiết để bảo đảm an toàn thông tin liên quan đến bí mật kinh doanh của người sử dụng và thông tin cá nhân của người tiêu dùng;</li>
              <li>h) Tiếp nhận, giải quyết yêu cầu, phản ánh, khiếu nại từ người sử dụng theo <a href="/complaint-policy" className="text-orange-600 hover:underline">Phương thức tiếp nhận và giải quyết phản ánh, yêu cầu, khiếu nại</a>;</li>
              <li>i) Giám sát, ngăn chặn hành vi vi phạm pháp luật; phối hợp và cung cấp thông tin, dữ liệu theo yêu cầu của cơ quan nhà nước có thẩm quyền.</li>
            </ul>
            <ul className={`list-none pl-0 text-slate-700 mb-4 space-y-2 ${lc(language, 'en')}`}>
              <li>a) Issue, publish and implement the conditions of operation and conditions of transaction;</li>
              <li>b) Develop and publish service standards and the procedure for participating in activities on the platform;</li>
              <li>c) Collect service fees in accordance with the published <a href="/pricing-policy" className="text-orange-600 hover:underline">Pricing Policy</a>;</li>
              <li>d) Provide full or summary information on the promotions that apply to the buyer before an order is placed;</li>
              <li>e) Ensure the safe and stable operation of the platform;</li>
              <li>f) Specify the cases in which user accounts are suspended, terminated or restricted;</li>
              <li>g) Apply the necessary measures to ensure the security of information relating to users' business secrets and consumers' personal information;</li>
              <li>h) Receive and resolve requests, feedback and complaints from users under the <a href="/complaint-policy" className="text-orange-600 hover:underline">Procedure for Receiving and Resolving Feedback, Requests and Complaints</a>;</li>
              <li>i) Monitor and prevent violations of the law; coordinate and provide information and data at the request of competent state authorities.</li>
            </ul>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              Các quyền và nghĩa vụ bổ sung của DIGISO
            </h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              Additional rights and obligations of DIGISO
            </h3>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Từ chối cung cấp dịch vụ nếu Người dùng cung cấp thông tin không trung thực, không chính xác, vi phạm pháp luật hoặc không đáp ứng điều kiện sử dụng.
              </li>
              <li className={lc(language, 'en')}>
                Refuse to provide the service if the User provides untruthful or inaccurate information, violates the law or does not meet the conditions of use.
              </li>
              <li className={lc(language, 'vi')}>
                Tạm ngừng hoặc chấm dứt cung cấp dịch vụ đối với Người dùng vi phạm Điều khoản sử dụng hoặc các chính sách công bố trên nền tảng (xem <a href="/refund-policy" className="text-orange-600 hover:underline">Chính sách chấm dứt dịch vụ và hoàn tiền</a>).
              </li>
              <li className={lc(language, 'en')}>
                Suspend or terminate the service for Users who violate the Terms of Service or the policies published on the platform (see the <a href="/refund-policy" className="text-orange-600 hover:underline">Service Termination and Refund Policy</a>).
              </li>
              <li className={lc(language, 'vi')}>
                Thu hồi, xóa bỏ nội dung, tài khoản hoặc dữ liệu do Người dùng đăng tải nếu vi phạm pháp luật hoặc ảnh hưởng đến quyền lợi của bên thứ ba.
              </li>
              <li className={lc(language, 'en')}>
                Remove or delete content, accounts or data uploaded by the User if they violate the law or affect the rights of third parties.
              </li>
              <li className={lc(language, 'vi')}>
                Yêu cầu Người dùng cập nhật, bổ sung thông tin khi cần thiết để phục vụ hoạt động quản lý, vận hành nền tảng và tuân thủ pháp luật.
              </li>
              <li className={lc(language, 'en')}>
                Require the User to update or supplement information where necessary for the management and operation of the platform and for legal compliance.
              </li>
              <li className={lc(language, 'vi')}>
                Điều chỉnh, thay đổi tính năng, giao diện và các điều khoản dịch vụ với thông báo trước theo các chính sách công bố trên nền tảng.
              </li>
              <li className={lc(language, 'en')}>
                Adjust and change features, interface and service terms with prior notice under the policies published on the platform.
              </li>
              <li className={lc(language, 'vi')}>
                Bảo vệ thông tin, dữ liệu cá nhân của Người dùng theo Luật Bảo vệ dữ liệu cá nhân 2025 (Luật 91/2025/QH15) và Nghị định 356/2025/NĐ-CP; không chia sẻ cho bên thứ ba khi chưa có sự đồng ý, trừ trường hợp pháp luật yêu cầu.
              </li>
              <li className={lc(language, 'en')}>
                Protect Users' personal information and data under the 2025 Law on Personal Data Protection (Law 91/2025/QH15) and Decree 356/2025/NĐ-CP; not share it with third parties without consent, except where required by law.
              </li>
              <li className={lc(language, 'vi')}>
                Gửi thông báo đến Người dùng khi có thay đổi về chính sách, giá dịch vụ, tính năng hoặc sự cố ảnh hưởng đến việc sử dụng dịch vụ.
              </li>
              <li className={lc(language, 'en')}>
                Notify Users of changes to policies, service prices or features, or incidents affecting use of the service.
              </li>
              <li className={lc(language, 'vi')}>
                Lưu trữ hồ sơ, dữ liệu liên quan đến giao dịch và sử dụng dịch vụ theo đúng quy định pháp luật về lưu trữ và an toàn thông tin.
              </li>
              <li className={lc(language, 'en')}>
                Retain records and data relating to transactions and use of the service in accordance with the law on retention and information security.
              </li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              3. Quyền và nghĩa vụ của Người dùng
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              3. Rights and Obligations of Users
            </h2>
            <ul className={`list-none pl-0 text-slate-700 mb-4 space-y-2 ${lc(language, 'vi')}`}>
              <li>a) Được bảo đảm quyền lợi của người tiêu dùng; được cung cấp thông tin đầy đủ, chính xác về dịch vụ và nhà cung cấp;</li>
              <li>b) Được lựa chọn dịch vụ, phương thức thanh toán; được bảo vệ dữ liệu cá nhân; được giải quyết phản ánh, yêu cầu, khiếu nại;</li>
              <li>c) Cung cấp thông tin cần thiết, chính xác; thanh toán đầy đủ, đúng hạn;</li>
              <li>d) Tuân thủ quy định pháp luật, điều kiện hoạt động và điều kiện giao dịch của nền tảng; không lợi dụng nền tảng để thực hiện hành vi vi phạm pháp luật;</li>
              <li>đ) Chịu trách nhiệm đối với thiệt hại phát sinh do lỗi của mình;</li>
              <li>e) Các quyền, nghĩa vụ khác theo <a href="/terms" className="text-orange-600 hover:underline">Điều khoản sử dụng dịch vụ</a>, các chính sách và pháp luật.</li>
            </ul>
            <ul className={`list-none pl-0 text-slate-700 mb-4 space-y-2 ${lc(language, 'en')}`}>
              <li>a) Be guaranteed consumer rights; be provided with full and accurate information about the service and the provider;</li>
              <li>b) Be able to choose services and payment methods; have personal data protected; have feedback, requests and complaints resolved;</li>
              <li>c) Provide necessary and accurate information; pay in full and on time;</li>
              <li>d) Comply with the law and with the platform's conditions of operation and transaction; not use the platform to commit violations of the law;</li>
              <li>e) Be liable for damage arising from their own fault;</li>
              <li>f) Other rights and obligations under the <a href="/terms" className="text-orange-600 hover:underline">Terms of Service</a>, the policies and the law.</li>
            </ul>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              Các quyền và nghĩa vụ bổ sung của Người dùng
            </h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              Additional rights and obligations of Users
            </h3>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Được hỗ trợ, giải đáp thắc mắc, khiếu nại và yêu cầu hoàn tiền theo các chính sách công bố trên nền tảng.
              </li>
              <li className={lc(language, 'en')}>
                Be supported and have questions answered, and be able to complain and request refunds under the policies published on the platform.
              </li>
              <li className={lc(language, 'vi')}>
                Được chấm dứt sử dụng dịch vụ, yêu cầu xóa tài khoản và dữ liệu cá nhân theo <a href="/refund-policy" className="text-orange-600 hover:underline">Chính sách chấm dứt dịch vụ và hoàn tiền</a> và <a href="/privacy-policy" className="text-orange-600 hover:underline">Chính sách bảo mật</a>.
              </li>
              <li className={lc(language, 'en')}>
                Be able to stop using the service and request deletion of the account and personal data under the <a href="/refund-policy" className="text-orange-600 hover:underline">Service Termination and Refund Policy</a> and the <a href="/privacy-policy" className="text-orange-600 hover:underline">Privacy Policy</a>.
              </li>
              <li className={lc(language, 'vi')}>
                Phản ánh, khiếu nại về chất lượng dịch vụ hoặc hành vi vi phạm của DIGISO tới các cơ quan có thẩm quyền theo quy định pháp luật.
              </li>
              <li className={lc(language, 'en')}>
                Report or complain about service quality or violations by DIGISO to the competent authorities as provided by law.
              </li>
              <li className={lc(language, 'vi')}>
                Bảo mật tài khoản, mật khẩu và thông báo ngay cho DIGISO khi phát hiện truy cập trái phép hoặc dấu hiệu bất thường.
              </li>
              <li className={lc(language, 'en')}>
                Keep the account and password secure and notify DIGISO immediately upon discovering unauthorised access or unusual signs.
              </li>
              <li className={lc(language, 'vi')}>
                Tự chịu trách nhiệm về nội dung thông tin, hình ảnh, dữ liệu mà mình đăng tải, lưu trữ hoặc truyền gửi qua nền tảng.
              </li>
              <li className={lc(language, 'en')}>
                Be responsible for the information, images and data that they upload, store or transmit through the platform.
              </li>
            </ul>
          </section>

          {/* Section 4 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              4. Cam kết chung
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              4. Mutual Commitments
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Hai bên cam kết thực hiện đúng và đầy đủ các quyền, nghĩa vụ nêu trên trên tinh thần hợp tác, thiện chí và tuân thủ pháp luật Việt Nam. Mọi tranh chấp phát sinh sẽ được ưu tiên giải quyết thông qua thương lượng; nếu không thương lượng được, các bên có quyền yêu cầu Tòa án nhân dân có thẩm quyền giải quyết theo quy định pháp luật.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Both parties undertake to properly and fully perform the rights and obligations above in a spirit of cooperation and goodwill and in compliance with Vietnamese law. Any dispute will first be resolved through negotiation; if negotiation fails, the parties have the right to request the competent People's Court to resolve it under the law.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              <strong>Phạm vi vai trò của DIGISO:</strong> DIGISO là chủ quản nền tảng thương mại điện tử founderai.biz — cung cấp các công cụ quản lý khách hàng, marketing và vận hành cho doanh nghiệp. DIGISO không trực tiếp bán hàng hóa hay dịch vụ cuối cùng đến người tiêu dùng cuối của Khách hàng; mọi giao dịch giữa Khách hàng và khách hàng cuối của họ là quan hệ riêng giữa các bên đó và không thuộc trách nhiệm trực tiếp của DIGISO, trừ trường hợp pháp luật có quy định khác.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              <strong>Scope of DIGISO's role:</strong> DIGISO is the operator of the founderai.biz e-commerce platform — providing customer management, marketing and operations tools for businesses. DIGISO does not directly sell goods or services to the Customer's end consumers; every transaction between the Customer and its end customers is a private relationship between those parties and is not DIGISO's direct responsibility, except as otherwise provided by law.
            </p>
          </section>

          {/* Section 5 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              5. Thông tin liên hệ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              5. Contact Information
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Mọi yêu cầu liên quan đến quyền và nghĩa vụ, vui lòng liên hệ:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              For any request relating to rights and obligations, please contact:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Công ty TNHH Giải pháp số DIGISO</strong>
              </li>
              <li className={lc(language, 'en')}>
                <strong>DIGISO Digital Solutions Co., Ltd.</strong>
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Email:</strong> <a href="mailto:info@digiso.vn" className="text-orange-600 hover:underline">info@digiso.vn</a> | hotro.uweb@gmail.com
              </li>
              <li className={lc(language, 'en')}>
                <strong>Email:</strong> <a href="mailto:info@digiso.vn" className="text-orange-600 hover:underline">info@digiso.vn</a> | hotro.uweb@gmail.com
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

          {/* History */}
          <PolicyHistory slug="rights" language={language} lc={lc} />
        </div>
      </div>
    </div>
  );
}

export default RightsAndDuties;
