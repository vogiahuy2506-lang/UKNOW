/**
 * Tab «Chính sách xử lý dữ liệu – Bên kiểm soát» — nội dung khớp file HTML mẫu `privacy-policy-digiso.html`.
 *
 * @param {object} props
 * @param {'vi' | 'en'} props.language Ngôn ngữ đang hiển thị.
 * @param {(a: 'vi'|'en', b: 'vi'|'en') => string} props.lc Hàm class ẩn/hiện theo ngôn ngữ (getLangClass).
 */
export default function PrivacyPolicyControllerPanel({ language, lc }) {
  /** Nhãn mục phụ: kiểu tài liệu pháp lý, dễ đọc lướt */
  const subBar = 'mb-3 flex items-center gap-2.5 text-sm font-semibold text-slate-800';
  const bar = <span className="inline-block h-4 w-1 shrink-0 rounded-full bg-teal-600" aria-hidden />;

  return (
    <div className="space-y-6">
      {/* Lời nói đầu */}
      <section className="pp-section px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
            ▸
          </div>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'vi')}`}>Lời nói đầu</h2>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'en')}`}>Introduction</h2>
        </div>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          Chính sách xử lý dữ liệu cá nhân – Bên kiểm soát dữ liệu quy định mục đích và phương tiện mà DIGISO sử dụng để xử lý dữ liệu cá nhân với tư cách <strong>bên kiểm soát dữ liệu</strong>, thông qua các website <strong>digiso.vn</strong>, <strong>uknow.edu.vn</strong>, <strong>campaign.digiso.vn</strong> và các kênh giao tiếp liên quan.
        </p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          This Data Processing Policy – Controller sets out the purpose and means by which DIGISO processes personal data as a <strong>data controller</strong>, through the websites <strong>digiso.vn</strong>, <strong>uknow.edu.vn</strong>, <strong>campaign.digiso.vn</strong> and related communication channels.
        </p>
        <p className={`text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          Nếu bạn là người dùng của Khách hàng đã ký hợp đồng với DIGISO, vui lòng tham khảo tab <em>Chính sách xử lý dữ liệu – Bên xử lý</em>.
        </p>
        <p className={`text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          If you are a user under a Customer that has contracted with DIGISO, please refer to the <em>Data Processing Policy – Processor</em> tab.
        </p>
      </section>

      {/* 1. Định nghĩa */}
      <section className="pp-section px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
            1
          </div>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'vi')}`}>Định nghĩa</h2>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'en')}`}>Definitions</h2>
        </div>
        <ol className={`list-decimal space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li>
            <strong>DIGISO / chúng tôi:</strong> Công ty TNHH Giải pháp số DIGISO.
          </li>
          <li>
            <strong>Chủ thể dữ liệu:</strong> Cá nhân mà DIGISO trực tiếp thu thập và xử lý dữ liệu cá nhân để thực hiện các mục đích tại Chính sách này.
          </li>
          <li>
            <strong>Dữ liệu cá nhân:</strong> Thông tin gắn liền hoặc giúp xác định cá nhân, theo Luật Bảo vệ DLCN số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP.
          </li>
        </ol>
        <ol className={`list-decimal space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li>
            <strong>DIGISO / we:</strong> DIGISO Digital Solutions Co., Ltd.
          </li>
          <li>
            <strong>Data Subject:</strong> Individual from whom DIGISO directly collects and processes personal data under this Policy.
          </li>
          <li>
            <strong>Personal Data:</strong> Information linked to or identifying an individual, under Personal Data Protection Law No. 91/2025/QH15 and Decree 356/2025/NĐ-CP.
          </li>
        </ol>
      </section>

      {/* 2. Dữ liệu thu thập */}
      <section className="pp-section px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
            2
          </div>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'vi')}`}>Dữ liệu DIGISO thu thập &amp; xử lý</h2>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'en')}`}>Data DIGISO Collects &amp; Processes</h2>
        </div>
        <div className="mt-[18px]">
          <h3 className={`${subBar} ${lc(language, 'vi')}`}>
            {bar}
            2.1 – Dữ liệu cá nhân cơ bản
          </h3>
          <h3 className={`${subBar} ${lc(language, 'en')}`}>
            {bar}
            2.1 – Basic Personal Data
          </h3>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            <li>Họ tên, ngày sinh, giới tính, quốc tịch, nơi ở</li>
            <li>Số điện thoại, email, địa chỉ liên hệ</li>
            <li>Hình ảnh, CMND/CCCD, hộ chiếu, GPLX, mã số thuế, BHXH</li>
            <li>Thông tin tài khoản số, lịch sử hoạt động trực tuyến</li>
            <li>Dữ liệu học tập và tiến độ khóa học (uknow.edu.vn)</li>
            <li>Thông tin đăng ký chiến dịch và hành vi tương tác (campaign.digiso.vn)</li>
          </ul>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            <li>Full name, date of birth, gender, nationality, residence</li>
            <li>Phone number, email, contact address</li>
            <li>Photo, ID/citizen ID, passport, driver&apos;s license, tax code, social insurance</li>
            <li>Digital account information, online activity history</li>
            <li>Learning data and course progress (uknow.edu.vn)</li>
            <li>Campaign registration info and interaction behavior (campaign.digiso.vn)</li>
          </ul>
        </div>
        <div className="mt-[18px]">
          <h3 className={`${subBar} ${lc(language, 'vi')}`}>
            {bar}
            2.2 – Dữ liệu cá nhân nhạy cảm (có thể xử lý)
          </h3>
          <h3 className={`${subBar} ${lc(language, 'en')}`}>
            {bar}
            2.2 – Sensitive Personal Data (may be processed)
          </h3>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            <li>Thông tin đặc điểm di truyền, sinh trắc học (nếu có)</li>
            <li>Dữ liệu vị trí (từ dịch vụ định vị)</li>
            <li>Dữ liệu cá nhân đặc thù theo quy định pháp luật</li>
          </ul>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            <li>Genetic or biometric characteristics (if applicable)</li>
            <li>Location data (from location services)</li>
            <li>Other specific personal data as defined by law</li>
          </ul>
          <p className={`mt-[10px] text-[13.5px] italic ${lc(language, 'vi')}`}>
            <em>DIGISO tuyệt đối không thu thập dữ liệu liên quan đến tôn giáo, quan điểm chính trị.</em>
          </p>
          <p className={`mt-[10px] text-[13.5px] italic ${lc(language, 'en')}`}>
            <em>DIGISO strictly does not collect data related to religion or political views.</em>
          </p>
        </div>
        <div className="mt-[18px]">
          <h3 className={`${subBar} ${lc(language, 'vi')}`}>
            {bar}
            2.3 – Dữ liệu tiếp thị
          </h3>
          <h3 className={`${subBar} ${lc(language, 'en')}`}>
            {bar}
            2.3 – Marketing Data
          </h3>
          <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            Dữ liệu cookie, clickstream, lịch sử duyệt web, phản hồi với email marketing, lựa chọn hủy đăng ký — thu thập qua <strong>campaign.digiso.vn</strong> và các nền tảng liên quan.
          </p>
          <p className={`text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            Cookie data, clickstream, browsing history, marketing email responses, unsubscribe preferences — collected via <strong>campaign.digiso.vn</strong> and related platforms.
          </p>
        </div>
      </section>

      {/* 3. Cách thức thu thập */}
      <section className="pp-section px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
            3
          </div>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'vi')}`}>Cách thức thu thập dữ liệu</h2>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'en')}`}>How We Collect Data</h2>
        </div>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li>
            <strong>Giao kết hợp đồng:</strong> Tên, email, số điện thoại, tài khoản ngân hàng để soạn thảo và ký kết văn bản.
          </li>
          <li>
            <strong>Đăng ký dịch vụ:</strong> Thông tin cung cấp khi đăng ký tài khoản, điền form trên digiso.vn, uknow.edu.vn, campaign.digiso.vn.
          </li>
          <li>
            <strong>Tự động thu thập:</strong> Cookie, web beacon, địa chỉ IP khi truy cập website.
          </li>
          <li>
            <strong>Dịch vụ tích hợp:</strong> Google, Apple ID khi đăng nhập bên thứ ba.
          </li>
          <li>
            <strong>Đối tác &amp; sự kiện:</strong> Từ đối tác marketing, nhà cung cấp, khách mời hội thảo/webinar do DIGISO tổ chức.
          </li>
        </ul>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li>
            <strong>Contract execution:</strong> Name, email, phone, bank details for drafting and signing agreements.
          </li>
          <li>
            <strong>Service registration:</strong> Information provided when signing up or filling forms on digiso.vn, uknow.edu.vn, campaign.digiso.vn.
          </li>
          <li>
            <strong>Automatic collection:</strong> Cookies, web beacons, IP addresses during website visits.
          </li>
          <li>
            <strong>Integrated services:</strong> Google, Apple ID when signing in via third-party accounts.
          </li>
          <li>
            <strong>Partners &amp; events:</strong> From marketing partners, vendors, guests at DIGISO-hosted events/webinars.
          </li>
        </ul>
      </section>

      {/* 4. Mục đích xử lý */}
      <section className="pp-section px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
            4
          </div>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'vi')}`}>Mục đích xử lý dữ liệu</h2>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'en')}`}>Purpose of Processing</h2>
        </div>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li>
            <strong>Vận hành:</strong> Cung cấp và duy trì tính năng của các nền tảng, phản hồi yêu cầu hỗ trợ.
          </li>
          <li>
            <strong>Cải thiện sản phẩm:</strong> Phân tích xu hướng sử dụng, phát triển tính năng mới.
          </li>
          <li>
            <strong>Giao tiếp:</strong> Gửi thông báo dịch vụ, email marketing (chỉ khi có đồng ý).
          </li>
          <li>
            <strong>Chiến dịch marketing (campaign.digiso.vn):</strong> Quản lý, đo lường và tối ưu hóa chiến dịch quảng cáo.
          </li>
          <li>
            <strong>Đào tạo (uknow.edu.vn):</strong> Quản lý học viên, cấp chứng chỉ, phân tích tiến độ học tập.
          </li>
          <li>
            <strong>Phân tích:</strong> Sử dụng Google Analytics để hiểu lưu lượng truy cập và hành vi người dùng.
          </li>
          <li>
            <strong>Tuân thủ pháp lý:</strong> Theo yêu cầu của cơ quan có thẩm quyền và quy định pháp luật.
          </li>
        </ul>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li>
            <strong>Operations:</strong> Provide and maintain platform features, respond to support requests.
          </li>
          <li>
            <strong>Product improvement:</strong> Analyze usage trends, develop new features.
          </li>
          <li>
            <strong>Communication:</strong> Send service notifications, marketing emails (with consent only).
          </li>
          <li>
            <strong>Marketing campaigns (campaign.digiso.vn):</strong> Manage, measure, and optimize advertising campaigns.
          </li>
          <li>
            <strong>Training (uknow.edu.vn):</strong> Manage learners, issue certificates, analyze learning progress.
          </li>
          <li>
            <strong>Analytics:</strong> Use Google Analytics to understand traffic and user behavior.
          </li>
          <li>
            <strong>Legal compliance:</strong> As required by competent authorities and applicable law.
          </li>
        </ul>
      </section>

      {/* 5. Tiết lộ dữ liệu */}
      <section className="pp-section px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
            5
          </div>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'vi')}`}>Tiết lộ dữ liệu</h2>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'en')}`}>Data Disclosure</h2>
        </div>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>DIGISO không tiết lộ dữ liệu cá nhân khi không có sự chấp thuận của chủ thể dữ liệu, trừ các trường hợp:</p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>DIGISO does not disclose personal data without the data subject&apos;s consent, except in the following cases:</p>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li>
            <strong>Nhà cung cấp dịch vụ:</strong> Google, Microsoft, Twilio SendGrid (email/chiến dịch), FPT Smart Cloud — chỉ tiếp cận dữ liệu cần thiết và cam kết bảo mật.
          </li>
          <li>
            <strong>Dữ liệu tổng hợp/ẩn danh:</strong> Có thể chia sẻ cho bên thứ ba phục vụ báo cáo, nghiên cứu — không thể nhận dạng cá nhân.
          </li>
          <li>
            <strong>Yêu cầu pháp lý:</strong> Theo lệnh tòa án hoặc cơ quan nhà nước có thẩm quyền.
          </li>
          <li>
            <strong>Bảo vệ quyền lợi:</strong> Khi cần thiết để bảo vệ quyền lợi và tài sản của DIGISO hoặc người dùng.
          </li>
          <li>
            <strong>Tổ chức lại doanh nghiệp:</strong> Trong trường hợp M&amp;A, bên nhận dữ liệu phải cam kết bảo mật tương đương.
          </li>
        </ul>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li>
            <strong>Service providers:</strong> Google, Microsoft, Twilio SendGrid (email/campaigns), FPT Smart Cloud — access only what is necessary and commit to confidentiality.
          </li>
          <li>
            <strong>Aggregated/anonymized data:</strong> May be shared with third parties for reporting, research — cannot identify individuals.
          </li>
          <li>
            <strong>Legal requirements:</strong> Per court order or competent authority directive.
          </li>
          <li>
            <strong>Rights protection:</strong> When necessary to protect rights and assets of DIGISO or users.
          </li>
          <li>
            <strong>Business restructuring:</strong> In M&amp;A scenarios, recipient must commit to equivalent data protection.
          </li>
        </ul>
      </section>

      {/* 6. Quyền của chủ thể */}
      <section className="pp-section px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
            6
          </div>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'vi')}`}>Quyền và nghĩa vụ của chủ thể dữ liệu</h2>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'en')}`}>Rights and Obligations of Data Subjects</h2>
        </div>
        <div className="mt-[18px]">
          <h3 className={`${subBar} ${lc(language, 'vi')}`}>
            {bar}
            6.1 – Quyền của chủ thể dữ liệu
          </h3>
          <h3 className={`${subBar} ${lc(language, 'en')}`}>
            {bar}
            6.1 – Your Rights
          </h3>
          <ol className={`list-decimal space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            <li>
              <strong>Quyền được biết:</strong> Biết về mọi hoạt động xử lý dữ liệu cá nhân của mình.
            </li>
            <li>
              <strong>Quyền đồng ý:</strong> Đồng ý hoặc không đồng ý cho phép xử lý dữ liệu.
            </li>
            <li>
              <strong>Quyền truy cập:</strong> Xem, chỉnh sửa dữ liệu cá nhân của mình.
            </li>
            <li>
              <strong>Quyền rút lại đồng ý:</strong> Rút lại bất kỳ lúc nào.
            </li>
            <li>
              <strong>Quyền xóa dữ liệu:</strong> Yêu cầu xóa trong giới hạn pháp luật cho phép.
            </li>
            <li>
              <strong>Quyền hạn chế xử lý:</strong> Yêu cầu tạm ngừng một phần hoặc toàn bộ việc xử lý.
            </li>
            <li>
              <strong>Quyền cung cấp dữ liệu:</strong> Yêu cầu DIGISO cung cấp dữ liệu của mình.
            </li>
            <li>
              <strong>Quyền phản đối:</strong> Phản đối việc xử lý cho mục đích marketing.
            </li>
            <li>
              <strong>Quyền bồi thường:</strong> Yêu cầu bồi thường khi có vi phạm.
            </li>
            <li>
              <strong>Quyền hủy đăng ký email:</strong> Hủy nhận email marketing qua link Unsubscribe trong mỗi email từ campaign.digiso.vn.
            </li>
          </ol>
          <ol className={`list-decimal space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            <li>
              <strong>Right to know:</strong> Know about all processing activities involving your personal data.
            </li>
            <li>
              <strong>Right to consent:</strong> Consent or withhold consent to processing.
            </li>
            <li>
              <strong>Right to access:</strong> View and correct your personal data.
            </li>
            <li>
              <strong>Right to withdraw consent:</strong> Withdraw at any time.
            </li>
            <li>
              <strong>Right to erasure:</strong> Request deletion within legally permitted limits.
            </li>
            <li>
              <strong>Right to restriction:</strong> Request partial or full suspension of processing.
            </li>
            <li>
              <strong>Right to data portability:</strong> Request DIGISO to provide your data to you.
            </li>
            <li>
              <strong>Right to object:</strong> Object to processing for marketing purposes.
            </li>
            <li>
              <strong>Right to compensation:</strong> Claim damages when a violation occurs.
            </li>
            <li>
              <strong>Right to unsubscribe:</strong> Unsubscribe from marketing emails via the Unsubscribe link in each email from campaign.digiso.vn.
            </li>
          </ol>
        </div>
        <div className="mt-[18px]">
          <h3 className={`${subBar} ${lc(language, 'vi')}`}>
            {bar}
            6.2 – Nghĩa vụ của chủ thể dữ liệu
          </h3>
          <h3 className={`${subBar} ${lc(language, 'en')}`}>
            {bar}
            6.2 – Obligations
          </h3>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            <li>Tự chịu trách nhiệm về tính chính xác của thông tin cung cấp cho DIGISO.</li>
            <li>Tuân thủ các quy định bảo vệ dữ liệu cá nhân của DIGISO.</li>
            <li>Kịp thời thông báo khi phát hiện vi phạm bảo mật dữ liệu.</li>
          </ul>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            <li>Take responsibility for the accuracy of information provided to DIGISO.</li>
            <li>Comply with DIGISO&apos;s personal data protection regulations.</li>
            <li>Promptly report any data security breach discovered.</li>
          </ul>
        </div>
        <div className={`mt-[14px] rounded-lg border border-slate-200/90 border-l-4 border-l-teal-600 bg-slate-50 px-[18px] py-[14px] text-[13.5px] text-slate-800 shadow-sm ${lc(language, 'vi')}`}>
          Để thực thi quyền của mình, chủ thể dữ liệu liên hệ DIGISO qua email <strong>nhthong@digiso.vn</strong> hoặc sử dụng các tính năng tự phục vụ trên website.
        </div>
        <div className={`mt-[14px] rounded-lg border border-slate-200/90 border-l-4 border-l-teal-600 bg-slate-50 px-[18px] py-[14px] text-[13.5px] text-slate-800 shadow-sm ${lc(language, 'en')}`}>
          To exercise your rights, contact DIGISO via <strong>nhthong@digiso.vn</strong> or use self-service features available on the website.
        </div>
      </section>

      {/* 7. Bảo vệ dữ liệu */}
      <section className="pp-section px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
            7
          </div>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'vi')}`}>Bảo vệ dữ liệu</h2>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'en')}`}>Data Security</h2>
        </div>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li>Mã hóa SSL/TLS cho toàn bộ kết nối trên digiso.vn, uknow.edu.vn, campaign.digiso.vn</li>
          <li>Hạ tầng GCP Singapore + máy chủ nội địa FPT Smart Cloud</li>
          <li>Kiểm soát truy cập theo vai trò (RBAC), xác thực 2 lớp (2FA)</li>
          <li>Sao lưu định kỳ và giám sát bảo mật liên tục</li>
        </ul>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li>SSL/TLS encryption for all connections on digiso.vn, uknow.edu.vn, campaign.digiso.vn</li>
          <li>GCP Singapore infrastructure + domestic FPT Smart Cloud servers</li>
          <li>Role-based access control (RBAC), two-factor authentication (2FA)</li>
          <li>Regular backups and continuous security monitoring</li>
        </ul>
        <p className={`mt-3 text-[13.5px] ${lc(language, 'vi')}`}>
          Khi xảy ra sự cố bảo mật, DIGISO thông báo tới chủ thể dữ liệu trong thời gian sớm nhất và phối hợp với cơ quan chức năng xử lý.
        </p>
        <p className={`mt-3 text-[13.5px] ${lc(language, 'en')}`}>
          In case of a security incident, DIGISO will notify data subjects promptly and cooperate with competent authorities.
        </p>
      </section>

      {/* 8. Lưu trữ */}
      <section className="pp-section px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
            8
          </div>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'vi')}`}>Lưu trữ &amp; Chuyển dữ liệu</h2>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'en')}`}>Retention &amp; Transfer</h2>
        </div>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          Dữ liệu cá nhân được lưu trữ trong thời gian cần thiết để thực hiện mục đích thu thập hoặc theo quy định pháp luật. Dữ liệu giao dịch được giữ tối thiểu <strong>5 năm</strong>. Sau khi hết thời hạn, dữ liệu sẽ được xóa hoặc ẩn danh hóa an toàn.
        </p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          Personal data is retained for the time necessary to achieve the collection purpose or as required by law. Transaction data is kept for a minimum of <strong>5 years</strong>. After expiry, data will be securely deleted or anonymized.
        </p>
        <p className={`mt-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          Dữ liệu được lưu trữ tại Việt Nam (FPT Smart Cloud) và GCP Singapore. Mọi chuyển dữ liệu xuyên biên giới đều tuân thủ đầy đủ quy định pháp luật Việt Nam.
        </p>
        <p className={`mt-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          Data is stored in Vietnam (FPT Smart Cloud) and GCP Singapore. All cross-border transfers comply fully with Vietnamese law.
        </p>
      </section>

      {/* 9. Cam kết không thực hiện */}
      <section className="pp-section px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
            9
          </div>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'vi')}`}>Cam kết không thực hiện</h2>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'en')}`}>Commitments on Non-Performance</h2>
        </div>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li>
            DIGISO <strong>không thu thập</strong> dữ liệu cá nhân nhạy cảm liên quan đến tôn giáo, chính trị.
          </li>
          <li>
            DIGISO <strong>không bán, không chuyển nhượng</strong> dữ liệu cá nhân cho bất kỳ bên thứ ba nào.
          </li>
          <li>
            Nếu phát hiện DIGISO đang xử lý dữ liệu ngoài phạm vi cho phép, vui lòng liên hệ ngay <strong>nhthong@digiso.vn</strong>.
          </li>
        </ul>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li>
            DIGISO <strong>does not collect</strong> sensitive personal data related to religion or politics.
          </li>
          <li>
            DIGISO <strong>does not sell or transfer</strong> personal data to any third party.
          </li>
          <li>
            If you discover DIGISO is processing data beyond permitted scope, please contact <strong>nhthong@digiso.vn</strong> immediately.
          </li>
        </ul>
      </section>

      {/* 10. Cập nhật chính sách */}
      <section className="pp-section px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
            10
          </div>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'vi')}`}>Cập nhật chính sách</h2>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'en')}`}>Policy Updates</h2>
        </div>
        <p className={`text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          DIGISO sẽ thông báo mọi thay đổi quan trọng ít nhất <strong>15 ngày</strong> trước khi có hiệu lực qua email hoặc thông báo trên website. Việc tiếp tục sử dụng dịch vụ sau khi chính sách mới có hiệu lực đồng nghĩa với sự chấp thuận.
        </p>
        <p className={`text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          DIGISO will notify any significant changes at least <strong>15 days</strong> before they take effect via email or website notice. Continued use of services after the updated policy takes effect constitutes acceptance.
        </p>
      </section>
    </div>
  );
}
