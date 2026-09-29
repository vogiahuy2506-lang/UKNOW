import { useState } from 'react';
import PolicyHistory from './components/PolicyHistory.jsx';

function getLangClass(activeLang, itemLang) {
  return activeLang === itemLang ? '' : 'hidden';
}

function RefundPolicy() {
  const [language, setLanguage] = useState('vi');
  const lc = getLangClass;

  const historyEntries = [
    {
      date: '2026-09-29',
      note: {
        vi: 'Đổi tên thành “Chính sách chấm dứt dịch vụ và hoàn tiền” và bổ sung nội dung tối thiểu theo Điều 16 Nghị định 248/2026/NĐ-CP (các trường hợp chấm dứt, thời điểm chấm dứt, quy trình và thời hạn phản hồi, cách thức hoàn tiền); thêm quyền huỷ trong 07 ngày đầu chưa sử dụng (hoàn 100%); chuyển các nội dung chấm dứt dịch vụ từ trang Điều kiện cung cấp dịch vụ sang trang này.',
        en: 'Renamed “Service Termination and Refund Policy” and added the minimum content required by Article 16 of Decree 248/2026/NĐ-CP (cases of termination, time of termination, procedure and response times, refund method); added the right to cancel within the first 07 days if unused (100% refund); moved the service termination content from the Service Terms page to this page.',
      },
    },
    {
      date: '2026-09-28',
      note: {
        vi: 'Đồng bộ ngày hiệu lực về 28/09/2026 theo yêu cầu cập nhật founderai.biz 25.09 (Nghị định 248/2026/NĐ-CP).',
        en: 'Aligned effective date to 28/09/2026 per the founderai.biz 25.09 update request (Decree 248/2026/NĐ-CP).',
      },
    },
    {
      date: '2026-10-13',
      note: {
        vi: 'Phiên bản trước — ngày hiệu lực 13/10/2026 (đã thay thế).',
        en: 'Previous version — effective 13/10/2026 (now superseded).',
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
              Chính sách chấm dứt dịch vụ <span className="text-orange-400">và hoàn tiền</span>
            </h1>
            <h1 className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'en')}`}>
              Service Termination <span className="text-orange-400">and Refund Policy</span>
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
              1. Phạm vi áp dụng
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              1. Scope
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Chính sách này áp dụng đối với các trường hợp chấm dứt dịch vụ và hoàn tiền phát sinh từ giao dịch trên founderai.biz; căn cứ vào điều kiện của từng dịch vụ, thông tin giao dịch và pháp luật hiện hành.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              This policy applies to cases of service termination and refunds arising from transactions on founderai.biz, based on the conditions of each service, the transaction information and applicable law.
            </p>
          </section>

          {/* Section 2 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              2. Các trường hợp chấm dứt dịch vụ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              2. Cases of Service Termination
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Dịch vụ có thể chấm dứt trong các trường hợp sau:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              The service may be terminated in the following cases:
            </p>
            <ul className={`list-none pl-0 text-slate-700 mb-4 space-y-2 ${lc(language, 'vi')}`}>
              <li>a) Hợp đồng đã hoàn thành hoặc hết thời hạn sử dụng theo gói đã mua. Founder AI không tự động trừ tiền để gia hạn;</li>
              <li>b) Khách hàng yêu cầu chấm dứt do không còn nhu cầu sử dụng, hoặc yêu cầu xóa tài khoản;</li>
              <li>c) Các bên thỏa thuận chấm dứt;</li>
              <li>d) Cá nhân giao kết hợp đồng chết, pháp nhân giao kết hợp đồng chấm dứt tồn tại mà hợp đồng phải do chính cá nhân, pháp nhân đó thực hiện;</li>
              <li>đ) Dịch vụ không còn khả năng cung cấp;</li>
              <li>e) Hợp đồng chấm dứt khi hoàn cảnh thay đổi cơ bản theo Điều 420 Bộ luật Dân sự 2015;</li>
              <li>f) DIGISO chấm dứt dịch vụ theo mục 5 dưới đây;</li>
              <li>g) Khách hàng không thanh toán phí dịch vụ sau thời hạn quy định tại <a href="/payment-policy" className="text-orange-600 hover:underline">Chính sách về thanh toán</a>;</li>
              <li>h) Các trường hợp khác theo thỏa thuận giữa các bên hoặc theo quy định của pháp luật.</li>
            </ul>
            <ul className={`list-none pl-0 text-slate-700 mb-4 space-y-2 ${lc(language, 'en')}`}>
              <li>a) The contract has been completed or the term of the purchased package has expired. Founder AI does not automatically charge fees to renew;</li>
              <li>b) The Customer requests termination because they no longer need the service, or requests deletion of the account;</li>
              <li>c) The parties agree to terminate;</li>
              <li>d) The individual party to the contract dies, or the legal entity ceases to exist, where the contract must be performed by that individual or entity itself;</li>
              <li>e) The service can no longer be provided;</li>
              <li>f) The contract terminates on a fundamental change of circumstances under Article 420 of the 2015 Civil Code;</li>
              <li>g) DIGISO terminates the service under section 5 below;</li>
              <li>h) The Customer fails to pay service fees after the deadline specified in the <a href="/payment-policy" className="text-orange-600 hover:underline">Payment Policy</a>;</li>
              <li>i) Other cases as agreed between the parties or as provided by law.</li>
            </ul>
          </section>

          {/* Section 3 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              3. Chấm dứt dịch vụ từ phía khách hàng
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              3. Termination by the Customer
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Khách hàng có quyền yêu cầu chấm dứt trong trường hợp dịch vụ và điều kiện áp dụng cho phép. Yêu cầu được tiếp nhận và xử lý căn cứ thông tin giao dịch, tình trạng dịch vụ và điều kiện áp dụng.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              The Customer has the right to request termination where the service and the applicable conditions allow. The request is received and processed based on the transaction information, the status of the service and the applicable conditions.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              <strong>Thời điểm hợp đồng chấm dứt</strong> khi khách hàng là bên chấm dứt là thời điểm DIGISO nhận được yêu cầu hợp lệ từ khách hàng và xác nhận (DIGISO xác nhận trong thời hạn nêu tại mục 7), hoặc thời điểm muộn hơn do khách hàng lựa chọn (ví dụ: cuối chu kỳ hiện tại). Nếu DIGISO không xác nhận trong thời hạn nêu tại mục 7, thời điểm khách hàng gửi yêu cầu được coi là thời điểm hợp đồng chấm dứt.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              <strong>The time the contract terminates</strong> when the Customer is the terminating party is the moment DIGISO receives a valid request from the Customer and confirms it (DIGISO confirms within the period stated in section 7), or a later time chosen by the Customer (for example, the end of the current cycle). If DIGISO does not confirm within the period stated in section 7, the time the Customer sent the request is deemed the time the contract terminates.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              <strong>Cách thức thanh toán phí dịch vụ khi khách hàng chấm dứt:</strong> các khoản phí phát sinh trước thời điểm chấm dứt được xử lý theo điều kiện dịch vụ và thỏa thuận; khách hàng thanh toán phần phí còn phải trả (nếu có) theo thông báo xác nhận cuối cùng của DIGISO.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              <strong>How service fees are settled when the Customer terminates:</strong> fees incurred before the time of termination are handled under the service conditions and the agreement; the Customer pays any remaining fees (if any) as stated in DIGISO's final confirmation notice.
            </p>
          </section>

          {/* Section 4 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              4. Cách thức giải quyết hậu quả của việc chấm dứt
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              4. Handling the Consequences of Termination
            </h2>
            <ul className={`list-none pl-0 text-slate-700 mb-4 space-y-2 ${lc(language, 'vi')}`}>
              <li>a) Quyền truy cập và sử dụng các tính năng thuộc gói dịch vụ bị chấm dứt sẽ dừng kể từ thời điểm chấm dứt có hiệu lực;</li>
              <li>b) Các khoản phí phát sinh trước thời điểm chấm dứt được xử lý theo điều kiện dịch vụ và thỏa thuận; các nghĩa vụ còn lại thực hiện theo điều kiện dịch vụ và pháp luật;</li>
              <li>c) Khi khách hàng tự chấm dứt, phần thời gian chưa sử dụng của gói đã kích hoạt không được hoàn tiền, trừ trường hợp mục 8.2.đ (huỷ trong 07 ngày đầu, chưa sử dụng). Trường hợp lỗi thuộc về DIGISO, việc hoàn tiền thực hiện theo mục 8;</li>
              <li>d) Trường hợp DIGISO chấm dứt dịch vụ trước thời hạn vì lý do thuộc về DIGISO mà không xuất phát từ vi phạm của khách hàng, DIGISO hoàn trả phần phí tương ứng với phần dịch vụ chưa cung cấp, trừ trường hợp các bên có thỏa thuận khác hoặc pháp luật có quy định khác;</li>
              <li>đ) Lượt AI (credit) đã sử dụng trước thời điểm chấm dứt không được hoàn lại;</li>
              <li>e) Việc chấm dứt dịch vụ không mặc nhiên đồng nghĩa với việc xóa ngay dữ liệu. Việc lưu giữ, xóa dữ liệu thực hiện theo <a href="/privacy-policy" className="text-orange-600 hover:underline">Chính sách bảo mật</a> và quy định pháp luật;</li>
              <li>g) Việc chấm dứt dịch vụ không ảnh hưởng đến quyền khiếu nại, đối soát và các quyền, nghĩa vụ đã phát sinh trước thời điểm chấm dứt.</li>
            </ul>
            <ul className={`list-none pl-0 text-slate-700 mb-4 space-y-2 ${lc(language, 'en')}`}>
              <li>a) The right to access and use the features of the terminated service package stops from the time the termination takes effect;</li>
              <li>b) Fees incurred before the time of termination are handled under the service conditions and the agreement; remaining obligations are performed under the service conditions and the law;</li>
              <li>c) When the Customer terminates on their own, the unused portion of an activated package is not refunded, except in the case of section 8.2.đ (cancellation within the first 07 days, not yet used). Where the fault lies with DIGISO, refunds are made under section 8;</li>
              <li>d) Where DIGISO terminates the service early for reasons attributable to DIGISO and not arising from the Customer's breach, DIGISO refunds the fee corresponding to the portion of the service not yet provided, unless otherwise agreed by the parties or provided by law;</li>
              <li>e) AI usage (credits) already consumed before the time of termination is not refunded;</li>
              <li>f) Termination of the service does not automatically mean immediate deletion of data. Data retention and deletion are carried out under the <a href="/privacy-policy" className="text-orange-600 hover:underline">Privacy Policy</a> and applicable law;</li>
              <li>g) Termination of the service does not affect the right to complain, reconcile accounts, or any rights and obligations that arose before the time of termination.</li>
            </ul>
          </section>

          {/* Section 5 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              5. Chấm dứt dịch vụ từ phía DIGISO
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              5. Termination by DIGISO
            </h2>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO có thể chấm dứt dịch vụ trong các trường hợp:
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO may terminate the service in the following cases:
            </p>
            <ul className={`list-none pl-0 text-slate-700 mb-4 space-y-2 ${lc(language, 'vi')}`}>
              <li>a) Người dùng vi phạm nghiêm trọng Điều khoản sử dụng, chính sách và không khắc phục trong vòng 07 ngày kể từ khi nhận thông báo;</li>
              <li>b) Không thanh toán phí theo thỏa thuận;</li>
              <li>c) Có hành vi trái pháp luật, truy cập trái phép, phát tán mã độc, hoặc nguy cơ ảnh hưởng an toàn hệ thống;</li>
              <li>d) Có yêu cầu của cơ quan chức năng;</li>
              <li>đ) Sự kiện bất khả kháng, hoặc vì lý do kỹ thuật, an toàn, bảo mật cần thiết;</li>
              <li>e) DIGISO ngừng cung cấp dịch vụ theo quyết định kinh doanh, với thông báo trước ít nhất 30 ngày;</li>
              <li>f) Các trường hợp khác theo Điều khoản sử dụng, hợp đồng hoặc pháp luật.</li>
            </ul>
            <ul className={`list-none pl-0 text-slate-700 mb-4 space-y-2 ${lc(language, 'en')}`}>
              <li>a) The User seriously breaches the Terms of Service or policies and fails to remedy within 07 days of receiving notice;</li>
              <li>b) Failure to pay fees as agreed;</li>
              <li>c) Unlawful conduct, unauthorised access, distribution of malware, or a risk to system safety;</li>
              <li>d) A request from a competent authority;</li>
              <li>e) A force majeure event, or for necessary technical, safety or security reasons;</li>
              <li>f) DIGISO discontinues the service under a business decision, with at least 30 days' prior notice;</li>
              <li>g) Other cases under the Terms of Service, the contract or the law.</li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO thông báo về việc chấm dứt, thời điểm chấm dứt và phương án xử lý, trừ trường hợp pháp luật hoặc yêu cầu xử lý khẩn cấp không cho phép.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO notifies the termination, the time of termination and the handling arrangement, except where the law or an urgent-handling requirement does not allow it.
            </p>
          </section>

          {/* Section 6 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              6. Thời điểm chấm dứt dịch vụ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              6. Time of Termination
            </h2>
            <ul className={`list-none pl-0 text-slate-700 mb-4 space-y-2 ${lc(language, 'vi')}`}>
              <li>a) Khi hết thời hạn sử dụng của gói dịch vụ;</li>
              <li>b) Khi khách hàng yêu cầu chấm dứt và DIGISO xác nhận (hoặc theo quy định tại mục 3);</li>
              <li>c) Theo thỏa thuận giữa hai bên;</li>
              <li>d) Khi DIGISO thông báo chấm dứt do không còn khả năng cung cấp dịch vụ;</li>
              <li>đ) Thời điểm nêu trong thông báo khi DIGISO đơn phương chấm dứt theo mục 5;</li>
              <li>e) Thời điểm khác theo quy định của pháp luật.</li>
            </ul>
            <ul className={`list-none pl-0 text-slate-700 mb-4 space-y-2 ${lc(language, 'en')}`}>
              <li>a) When the term of the service package ends;</li>
              <li>b) When the Customer requests termination and DIGISO confirms (or as provided in section 3);</li>
              <li>c) As agreed between the two parties;</li>
              <li>d) When DIGISO announces termination because it can no longer provide the service;</li>
              <li>e) The time stated in the notice when DIGISO terminates unilaterally under section 5;</li>
              <li>f) Another time as provided by law.</li>
            </ul>
          </section>

          {/* Section 7 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              7. Quy trình yêu cầu chấm dứt từ khách hàng và thời hạn phản hồi
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              7. Customer Termination Request Procedure and Response Times
            </h2>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                <strong>Bước 1 — Gửi yêu cầu:</strong> khách hàng liên hệ DIGISO qua email info@digiso.vn hoặc hotline 0877909606 (Zalo 0877 909 606), kèm email tài khoản, gói dịch vụ cần chấm dứt và lý do (và mong muốn hoàn tiền, nếu có).
              </li>
              <li className={lc(language, 'en')}>
                <strong>Step 1 — Submit the request:</strong> the Customer contacts DIGISO by email at info@digiso.vn or by hotline 0877909606 (Zalo 0877 909 606), stating the account email, the service package to be terminated and the reason (and any desired refund).
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bước 2 — Cung cấp thông tin xác minh và xác nhận tiếp nhận:</strong> khách hàng cung cấp thông tin xác minh (đơn hàng, thông tin khác). <strong>DIGISO phản hồi, xác nhận đã nhận yêu cầu trong vòng 24 giờ</strong> kể từ khi nhận được. Nếu yêu cầu thiếu thông tin, DIGISO thông báo để khách hàng bổ sung; thời hạn xử lý được tính lại từ khi nhận đủ thông tin.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Step 2 — Provide verification information and acknowledgement:</strong> the Customer provides verification information (order, other information). <strong>DIGISO responds and confirms receipt of the request within 24 hours</strong> of receiving it. If the request lacks information, DIGISO notifies the Customer to supplement it; the processing deadline is recalculated from when complete information is received.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bước 3 — Tiếp nhận và kiểm tra:</strong> DIGISO tiếp nhận, kiểm tra đơn hàng, tình trạng dịch vụ và đối soát thanh toán.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Step 3 — Receipt and review:</strong> DIGISO receives the request and checks the order, the service status and reconciles payment.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bước 4 — Xác định điều kiện chấm dứt và thông báo kết quả:</strong> trong thời hạn <strong>03 ngày làm việc</strong> kể từ khi xác nhận yêu cầu hợp lệ, DIGISO gửi thông báo xác nhận cuối cùng, gồm: thời điểm chấm dứt; gói dịch vụ bị chấm dứt; khoản phí đã sử dụng và khoản phải thanh toán (nếu có); số tiền được hoàn trả (nếu có); phương thức và thời gian dự kiến hoàn tiền; các quyền và nghĩa vụ còn tiếp tục có hiệu lực.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Step 4 — Determine the termination conditions and notify the result:</strong> within <strong>03 business days</strong> of confirming the request is valid, DIGISO sends a final confirmation notice including: the time of termination; the terminated service package; fees already used and any amount payable (if any); the refund amount (if any); the refund method and expected timeframe; and the rights and obligations that remain in effect.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bước 5 — Chấm dứt:</strong> nếu đủ điều kiện, DIGISO chấm dứt dịch vụ theo thời điểm đã xác nhận và vô hiệu hóa tài khoản và các dịch vụ liên quan trong vòng 01 ngày làm việc sau khi chấp thuận.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Step 5 — Termination:</strong> if the conditions are met, DIGISO terminates the service at the confirmed time and disables the account and related services within 01 business day of approval.
              </li>
              <li className={lc(language, 'vi')}>
                <strong>Bước 6 — Hoàn tiền (nếu có):</strong> nếu phát sinh hoàn tiền, DIGISO hoàn theo mục 8 của Chính sách này.
              </li>
              <li className={lc(language, 'en')}>
                <strong>Step 6 — Refund (if any):</strong> if a refund arises, DIGISO refunds it under section 8 of this policy.
              </li>
            </ul>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO không đặt ra thủ tục bất hợp lý nhằm cản trở khách hàng thực hiện quyền chấm dứt dịch vụ.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO does not impose unreasonable procedures to hinder the Customer from exercising the right to terminate the service.
            </p>
          </section>

          {/* Section 8 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              8. Cách thức hoàn tiền khi chấm dứt dịch vụ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              8. Refund Method upon Termination
            </h2>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              8.1. Nguyên tắc hoàn tiền
            </h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              8.1. Refund Principle
            </h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              DIGISO hoàn tiền trong hai nhóm trường hợp: (i) lỗi thuộc về DIGISO (mục 8.2.a–d); (ii) Khách hàng đổi ý sớm (mục 8.2.đ). Ngoài hai nhóm này DIGISO không hoàn tiền, nhằm bảo đảm quyền lợi chính đáng của khách hàng.
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              DIGISO refunds in two groups of cases: (i) the fault lies with DIGISO (sections 8.2.a–d); (ii) the Customer changes their mind early (section 8.2.đ). Outside these two groups DIGISO does not refund, in order to protect the Customer's legitimate interests.
            </p>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              8.2. Điều kiện hoàn tiền
            </h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              8.2. Refund Conditions
            </h3>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                a) DIGISO không thể cung cấp dịch vụ do sự cố kỹ thuật hoặc hạ tầng từ phía DIGISO kéo dài từ 7 ngày trở lên, hoặc không cung cấp được dịch vụ đã cam kết.
              </li>
              <li className={lc(language, 'en')}>
                a) DIGISO cannot provide the service due to a technical or infrastructure incident on DIGISO's side lasting 7 days or more, or cannot provide the service it committed to.
              </li>
              <li className={lc(language, 'vi')}>
                b) Khách hàng thanh toán thừa, thanh toán trùng hoặc giao dịch bị lỗi (thu hai lần, thu sai số tiền do hệ thống).
              </li>
              <li className={lc(language, 'en')}>
                b) The Customer overpays, pays twice, or the transaction is faulty (double charge, wrong amount charged by the system).
              </li>
              <li className={lc(language, 'vi')}>
                c) Dịch vụ không đúng nội dung đã xác nhận khi mua.
              </li>
              <li className={lc(language, 'en')}>
                c) The service does not match what was confirmed at purchase.
              </li>
              <li className={lc(language, 'vi')}>
                d) DIGISO chấm dứt dịch vụ trước thời hạn vì lý do thuộc về DIGISO: hoàn phần phí tương ứng với phần dịch vụ chưa cung cấp.
              </li>
              <li className={lc(language, 'en')}>
                d) DIGISO terminates the service early for reasons attributable to DIGISO: the fee corresponding to the service not yet provided is refunded.
              </li>
              <li className={lc(language, 'vi')}>
                đ) Khách hàng đổi ý sớm: Khách hàng gửi yêu cầu trong vòng 07 ngày kể từ ngày thanh toán và chưa sử dụng dịch vụ — được hiểu là tài khoản chưa phát sinh lượt gửi tin nhắn/email nào và chưa tiêu credit AI kể từ lần thanh toán đó — thì được hoàn 100% số tiền đã thanh toán cho gói hoặc lượt nạp credit đó. Áp dụng cho gói trả phí và nạp credit AI; không áp dụng cho gói dùng thử miễn phí.
              </li>
              <li className={lc(language, 'en')}>
                đ) Early change of mind: the Customer submits a request within 07 days of the payment date and has not yet used the service — meaning the account has not sent any message/email and has not spent any AI credit since that payment — and is refunded 100% of the amount paid for that package or credit top-up. Applies to paid packages and AI credit top-ups; does not apply to free trial packages.
              </li>
            </ul>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              8.3. Trường hợp không được hoàn tiền
            </h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              8.3. Cases Not Eligible for a Refund
            </h3>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Khách hàng tự chấm dứt dịch vụ khi gói đã được kích hoạt, ngoài trường hợp mục 8.2.đ (quá 07 ngày hoặc đã sử dụng) — phần thời gian/credit còn lại không được hoàn.
              </li>
              <li className={lc(language, 'en')}>
                The Customer terminates the service on their own after the package has been activated, other than in the case of section 8.2.đ (past 07 days or already used) — the remaining period/credits are not refunded.
              </li>
              <li className={lc(language, 'vi')}>
                Dịch vụ bị chấm dứt do khách hàng vi phạm Điều khoản sử dụng hoặc pháp luật.
              </li>
              <li className={lc(language, 'en')}>
                The service is terminated because the Customer violated the Terms of Service or the law.
              </li>
              <li className={lc(language, 'vi')}>
                Lượt AI (credit) đã sử dụng.
              </li>
              <li className={lc(language, 'en')}>
                AI usage (credits) already consumed.
              </li>
              <li className={lc(language, 'vi')}>
                Yêu cầu hoàn tiền không thuộc các trường hợp tại mục 8.2.
              </li>
              <li className={lc(language, 'en')}>
                Refund requests that do not fall within the cases in section 8.2.
              </li>
              <li className={lc(language, 'vi')}>
                Gói dùng thử miễn phí.
              </li>
              <li className={lc(language, 'en')}>
                Free trial packages.
              </li>
            </ul>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              8.4. Quy trình hoàn tiền
            </h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              8.4. Refund Procedure
            </h3>
            <ul className="list-disc pl-6 text-slate-700 space-y-2 mb-4">
              <li className={lc(language, 'vi')}>
                Gửi yêu cầu hoàn tiền kèm thông tin nhận tiền (số tài khoản, tên chủ tài khoản, tên ngân hàng) qua email info@digiso.vn hoặc Hotline/Zalo 0877 909 606.
              </li>
              <li className={lc(language, 'en')}>
                Send a refund request together with the receiving details (account number, account holder name, bank name) by email at info@digiso.vn or via Hotline/Zalo 0877 909 606.
              </li>
              <li className={lc(language, 'vi')}>
                DIGISO xác nhận tiếp nhận trong tối đa 24 giờ và phản hồi kết quả xét duyệt trong tối đa 02 ngày làm việc.
              </li>
              <li className={lc(language, 'en')}>
                DIGISO confirms receipt within 24 hours at most and responds with the review result within 02 business days at most.
              </li>
              <li className={lc(language, 'vi')}>
                Tiền hoàn được chuyển về tài khoản ngân hàng của khách hàng trong 07–10 ngày làm việc kể từ khi yêu cầu được duyệt. Khoản thanh toán thừa hoặc trùng được hoàn trong 07–10 ngày làm việc kể từ khi xác minh.
              </li>
              <li className={lc(language, 'en')}>
                The refund is transferred to the Customer's bank account within 07–10 business days of the request being approved. An overpayment or duplicate payment is refunded within 07–10 business days of verification.
              </li>
            </ul>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'vi')}`}>
              8.5. Phương thức hoàn tiền
            </h3>
            <h3 className={`text-lg font-semibold text-slate-800 mb-2 ${lc(language, 'en')}`}>
              8.5. Refund Method
            </h3>
            <p className={`text-slate-700 mb-4 ${lc(language, 'vi')}`}>
              Khoản hoàn được thực hiện bằng chuyển khoản ngân hàng, theo phương thức khách hàng đã thanh toán ban đầu hoặc tài khoản do khách hàng cung cấp, hoặc phương thức khác theo thỏa thuận. Thời gian nhận tiền thực tế có thể phụ thuộc vào đơn vị thanh toán, ngân hàng và phương thức thanh toán. Phí giao dịch ngân hàng phát sinh khi hoàn tiền do khách hàng chịu (nếu có). Xem thêm <a href="/payment-policy" className="text-orange-600 hover:underline">Chính sách về thanh toán</a> (mục 8).
            </p>
            <p className={`text-slate-700 mb-4 ${lc(language, 'en')}`}>
              Refunds are made by bank transfer, by the method the Customer originally paid with or to an account provided by the Customer, or by another method as agreed. The actual time to receive the money may depend on the payment provider, the bank and the payment method. Bank transaction fees arising from the refund are borne by the Customer (if any). See also the <a href="/payment-policy" className="text-orange-600 hover:underline">Payment Policy</a> (section 8).
            </p>
          </section>

          {/* Section 9 */}
          <section className="mb-6 pp-section p-6">
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'vi')}`}>
              9. Liên hệ
            </h2>
            <h2 className={`text-xl font-bold text-slate-900 mb-4 ${lc(language, 'en')}`}>
              9. Contact
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

export default RefundPolicy;
