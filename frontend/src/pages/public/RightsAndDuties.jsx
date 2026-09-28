import { useState } from 'react';
import PolicyHistory from './components/PolicyHistory.jsx';

function getLangClass(activeLang, itemLang) {
  return activeLang === itemLang ? '' : 'hidden';
}

function RightsAndDuties() {
  const [language, setLanguage] = useState('vi');
  const lc = getLangClass;

  const historyEntries = [
    {
      date: '2026-09-28',
      note: {
        vi: 'Tách riêng thành chính sách độc lập theo Mẫu số 01 (trang 46) và Điều 6 Nghị định 248/2026/NĐ-CP.',
        en: 'Split into a standalone policy per Mẫu số 01 (page 46) and Article 6 of Decree 248/2026/NĐ-CP.',
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
              Quyền & <span className="text-orange-400">Nghĩa vụ</span>
            </h1>
            <h1 className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'en')}`}>
              Rights & <span className="text-orange-400">Duties</span>
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
                Cập nhật: <strong>28 tháng 9 năm 2026</strong>
                {'\u00a0'}|{'\u00a0'}
                Áp dụng cho: founderai.biz
              </span>
              <span className={lc(language, 'en')}>
                Last updated: <strong>September 28, 2026</strong>
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
              Chính sách này quy định quyền và nghĩa vụ của Công ty TNHH Giải pháp số DIGISO (chủ quản nền tảng founderai.biz) và của Người dùng khi đăng ký, sử dụng dịch vụ trên nền tảng, tuân thủ theo Điều 6 Nghị định 248/2026/NĐ-CP.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              This policy sets forth the rights and duties of DIGISO Digital Solutions Co., Ltd. (operator of founderai.biz) and Users when registering and using services on the platform, in compliance with Article 6 of Decree 248/2026/NĐ-CP.
            </p>
          </section>

          {/* Section 2: Rights and Duties of DIGISO */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              2. Quyền và nghĩa vụ của Công ty TNHH Giải pháp số DIGISO
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              2. Rights and Duties of DIGISO Digital Solutions Co., Ltd.
            </h2>
            <h3 className={`text-base font-semibold text-slate-800 mb-3 ${lc(language, 'vi')}`}>
              2.1. Quyền của DIGISO
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-3 ${lc(language, 'en')}`}>
              2.1. Rights of DIGISO
            </h3>
            <ol className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Từ chối cung cấp dịch vụ nếu Người dùng cung cấp thông tin không trung thực, không chính xác, vi phạm pháp luật hoặc không đáp ứng điều kiện sử dụng.
              </li>
              <li className={lc(language, 'en')}>
                Refuse to provide services if the User supplies false or inaccurate information, breaches the law, or fails to meet the conditions of use.
              </li>
              <li className={lc(language, 'vi')}>
                Tạm ngừng hoặc chấm dứt cung cấp dịch vụ đối với Người dùng vi phạm Điều khoản sử dụng hoặc các chính sách công bố trên nền tảng.
              </li>
              <li className={lc(language, 'en')}>
                Suspend or terminate service provision to Users who violate the Terms of Service or any policies published on the platform.
              </li>
              <li className={lc(language, 'vi')}>
                Thu hồi, xóa bỏ nội dung, tài khoản hoặc dữ liệu do Người dùng đăng tải nếu vi phạm pháp luật hoặc ảnh hưởng đến quyền lợi của bên thứ ba.
              </li>
              <li className={lc(language, 'en')}>
                Remove or delete User content, accounts, or data that violates the law or adversely affects the rights of third parties.
              </li>
              <li className={lc(language, 'vi')}>
                Yêu cầu Người dùng cập nhật, bổ sung thông tin khi cần thiết để phục vụ hoạt động quản lý, vận hành nền tảng và tuân thủ pháp luật.
              </li>
              <li className={lc(language, 'en')}>
                Request Users to update or supplement information as necessary for platform operation and legal compliance.
              </li>
              <li className={lc(language, 'vi')}>
                Điều chỉnh, thay đổi tính năng, giao diện và các điều khoản dịch vụ với thông báo trước theo các chính sách công bố trên nền tảng.
              </li>
              <li className={lc(language, 'en')}>
                Modify features, interfaces, and service terms with prior notice in accordance with the policies published on the platform.
              </li>
              <li className={lc(language, 'vi')}>
                Phối hợp với cơ quan nhà nước có thẩm quyền trong việc giải quyết khiếu nại, tố cáo và các vấn đề pháp lý liên quan đến hoạt động trên nền tảng.
              </li>
              <li className={lc(language, 'en')}>
                Cooperate with competent state authorities in handling complaints, denunciations, and legal matters relating to activity on the platform.
              </li>
            </ol>

            <h3 className={`text-base font-semibold text-slate-800 mb-3 mt-5 ${lc(language, 'vi')}`}>
              2.2. Nghĩa vụ của DIGISO
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-3 mt-5 ${lc(language, 'en')}`}>
              2.2. Duties of DIGISO
            </h3>
            <ol className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Công bố công khai, đầy đủ, chính xác các chính sách theo quy định tại Điều 4 đến Điều 17 Nghị định 248/2026/NĐ-CP trên nền tảng founderai.biz.
              </li>
              <li className={lc(language, 'en')}>
                Publicly disclose complete and accurate policies as required by Articles 4 to 17 of Decree 248/2026/NĐ-CP on founderai.biz.
              </li>
              <li className={lc(language, 'vi')}>
                Cung cấp dịch vụ đúng với mô tả, đảm bảo chất lượng, ổn định và bảo mật thông tin của Người dùng theo quy định pháp luật.
              </li>
              <li className={lc(language, 'en')}>
                Provide services as described, ensuring quality, stability, and the security of User information in compliance with the law.
              </li>
              <li className={lc(language, 'vi')}>
                Hỗ trợ, giải đáp thắc mắc, tiếp nhận phản ánh và giải quyết khiếu nại của Người dùng trong thời hạn cam kết tại Chính sách tiếp nhận và giải quyết khiếu nại.
              </li>
              <li className={lc(language, 'en')}>
                Support Users, answer inquiries, and resolve complaints within the timeframes committed in the Complaint Handling Policy.
              </li>
              <li className={lc(language, 'vi')}>
                Bảo vệ thông tin, dữ liệu cá nhân của Người dùng theo Luật Bảo vệ dữ liệu cá nhân 2025 (Luật 91/2025/QH15) và Nghị định 356/2025/NĐ-CP; không chia sẻ cho bên thứ ba khi chưa có sự đồng ý, trừ trường hợp pháp luật yêu cầu.
              </li>
              <li className={lc(language, 'en')}>
                Protect Users' personal data in accordance with the Personal Data Protection Act 2025 (Law 91/2025/QH15) and Decree 356/2025/NĐ-CP; do not share with third parties without consent, except as required by law.
              </li>
              <li className={lc(language, 'vi')}>
                Gửi thông báo đến Người dùng khi có thay đổi về chính sách, giá dịch vụ, tính năng hoặc sự cố ảnh hưởng đến hoạt động sử dụng dịch vụ theo Điều 17, 23 Nghị định 248/2026/NĐ-CP.
              </li>
              <li className={lc(language, 'en')}>
                Notify Users of changes to policies, service prices, features, or incidents affecting service use per Articles 17 and 23 of Decree 248/2026/NĐ-CP.
              </li>
              <li className={lc(language, 'vi')}>
                Lưu trữ hồ sơ, dữ liệu liên quan đến giao dịch và sử dụng dịch vụ theo đúng quy định pháp luật về lưu trữ và an toàn thông tin.
              </li>
              <li className={lc(language, 'en')}>
                Retain records and data relating to transactions and service use in accordance with legal provisions on record-keeping and information security.
              </li>
            </ol>
          </section>

          {/* Section 3: Rights and Duties of Users */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              3. Quyền và nghĩa vụ của Người dùng
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              3. Rights and Duties of Users
            </h2>
            <h3 className={`text-base font-semibold text-slate-800 mb-3 ${lc(language, 'vi')}`}>
              3.1. Quyền của Người dùng
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-3 ${lc(language, 'en')}`}>
              3.1. Rights of Users
            </h3>
            <ol className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Được cung cấp đầy đủ thông tin về dịch vụ, giá, điều khoản và các chính sách liên quan trước và trong quá trình sử dụng.
              </li>
              <li className={lc(language, 'en')}>
                Receive full information about services, pricing, terms, and related policies before and during use.
              </li>
              <li className={lc(language, 'vi')}>
                Được hỗ trợ, giải đáp thắc mắc, khiếu nại và yêu cầu hoàn tiền theo các chính sách công bố trên nền tảng.
              </li>
              <li className={lc(language, 'en')}>
                Receive support, answers, complaint handling, and refund requests in accordance with the policies published on the platform.
              </li>
              <li className={lc(language, 'vi')}>
                Được bảo mật thông tin cá nhân theo quy định pháp luật và Thỏa thuận xử lý dữ liệu cá nhân công bố trên nền tảng.
              </li>
              <li className={lc(language, 'en')}>
                Have personal data protected in accordance with the law and the Personal Data Processing Agreement published on the platform.
              </li>
              <li className={lc(language, 'vi')}>
                Được chấm dứt sử dụng dịch vụ, yêu cầu xóa tài khoản và dữ liệu cá nhân theo Chính sách chấm dứt dịch vụ và hoàn tiền.
              </li>
              <li className={lc(language, 'en')}>
                Terminate service use and request account and personal data deletion per the Termination and Refund Policy.
              </li>
              <li className={lc(language, 'vi')}>
                Phản ánh, khiếu nại về chất lượng dịch vụ hoặc hành vi vi phạm của DIGISO tới các cơ quan có thẩm quyền theo quy định pháp luật.
              </li>
              <li className={lc(language, 'en')}>
                Lodge complaints or denunciations about service quality or DIGISO's conduct with competent authorities in accordance with the law.
              </li>
            </ol>

            <h3 className={`text-base font-semibold text-slate-800 mb-3 mt-5 ${lc(language, 'vi')}`}>
              3.2. Nghĩa vụ của Người dùng
            </h3>
            <h3 className={`text-base font-semibold text-slate-800 mb-3 mt-5 ${lc(language, 'en')}`}>
              3.2. Duties of Users
            </h3>
            <ol className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Cung cấp đầy đủ, chính xác thông tin khi đăng ký tài khoản và chịu trách nhiệm về tính xác thực của thông tin đã cung cấp.
              </li>
              <li className={lc(language, 'en')}>
                Provide complete and accurate information when registering and be responsible for the truthfulness of the information supplied.
              </li>
              <li className={lc(language, 'vi')}>
                Tuân thủ Điều khoản sử dụng và các chính sách công bố trên nền tảng founderai.biz cũng như quy định pháp luật hiện hành.
              </li>
              <li className={lc(language, 'en')}>
                Comply with the Terms of Service and policies published on founderai.biz, as well as applicable laws.
              </li>
              <li className={lc(language, 'vi')}>
                Thanh toán đầy đủ, đúng hạn phí dịch vụ theo gói đã đăng ký và giá đã được công bố trên nền tảng.
              </li>
              <li className={lc(language, 'en')}>
                Pay service fees in full and on time for the subscribed package at the prices published on the platform.
              </li>
              <li className={lc(language, 'vi')}>
                Không sử dụng dịch vụ cho mục đích vi phạm pháp luật, xâm phạm quyền lợi của tổ chức, cá nhân khác hoặc gây mất an toàn, an ninh thông tin.
              </li>
              <li className={lc(language, 'en')}>
                Do not use the service for unlawful purposes, to infringe the rights of other organizations or individuals, or to compromise information safety or security.
              </li>
              <li className={lc(language, 'vi')}>
                Bảo mật tài khoản, mật khẩu và thông báo ngay cho DIGISO khi phát hiện truy cập trái phép hoặc dấu hiệu bất thường.
              </li>
              <li className={lc(language, 'en')}>
                Keep the account and password secure, and promptly notify DIGISO of any unauthorized access or unusual activity.
              </li>
              <li className={lc(language, 'vi')}>
                Tự chịu trách nhiệm về nội dung thông tin, hình ảnh, dữ liệu mà mình đăng tải, lưu trữ hoặc truyền gửi qua nền tảng.
              </li>
              <li className={lc(language, 'en')}>
                Be solely responsible for the content, images, and data uploaded, stored, or transmitted through the platform.
              </li>
            </ol>
          </section>

          {/* Section 4: Mutual Commitments */}
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
              Both parties commit to performing the rights and duties above in good faith, with cooperation, and in compliance with Vietnamese law. Any dispute shall first be resolved through amicable negotiation; failing that, either party may refer the matter to a competent People's Court in accordance with the law.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              <strong>Phạm vi vai trò của DIGISO:</strong> DIGISO là chủ quản nền tảng thương mại điện tử founderai.biz — cung cấp các công cụ quản lý khách hàng, marketing và vận hành cho doanh nghiệp. DIGISO không trực tiếp bán hàng hóa hay dịch vụ cuối cùng đến người tiêu dùng cuối của Khách hàng; mọi giao dịch giữa Khách hàng và khách hàng cuối của họ là quan hệ riêng giữa các bên đó và không thuộc trách nhiệm trực tiếp của DIGISO, trừ trường hợp pháp luật có quy định khác.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              <strong>Scope of DIGISO's role:</strong> DIGISO operates the founderai.biz e-commerce platform — providing customer management, marketing, and operations tools to businesses. DIGISO does not directly sell goods or final services to the end consumers of Customers; any transaction between a Customer and its own end consumers is a separate relationship between those parties and is not DIGISO's direct responsibility, unless otherwise provided by law.
            </p>
          </section>

          {/* Section 5: Contact */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              5. Thông tin liên hệ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              5. Contact Information
            </h2>
            <p className={`text-slate-700 mb-3 ${lc(language, 'vi')}`}>
              Mọi yêu cầu liên quan đến quyền và nghĩa vụ, vui lòng liên hệ:
            </p>
            <p className={`text-slate-700 mb-3 ${lc(language, 'en')}`}>
              For any request relating to rights and duties, please contact:
            </p>
            <ul className="list-disc pl-6 text-slate-700 space-y-1">
              <li><strong>Công ty TNHH Giải pháp số DIGISO</strong></li>
              <li><strong>DIGISO Digital Solutions Co., Ltd.</strong></li>
              <li>Email: <a href="mailto:info@digiso.vn" className="text-orange-600 hover:underline">info@digiso.vn</a> | <a href="mailto:hotro.uweb@gmail.com" className="text-orange-600 hover:underline">hotro.uweb@gmail.com</a></li>
              <li>Điện thoại / Phone: 0877909606</li>
              <li>Website: <a href="https://founderai.biz" className="text-orange-600 hover:underline">founderai.biz</a></li>
            </ul>
          </section>

          {/* History */}
          <PolicyHistory language={language} entries={historyEntries} />
        </div>
      </div>
    </div>
  );
}

export default RightsAndDuties;
