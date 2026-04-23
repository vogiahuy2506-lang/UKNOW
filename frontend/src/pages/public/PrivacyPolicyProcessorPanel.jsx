/**
 * Tab «Chính sách xử lý dữ liệu – Bên xử lý» — nội dung khớp file HTML mẫu `privacy-policy-digiso.html`.
 *
 * @param {object} props
 * @param {'vi' | 'en'} props.language Ngôn ngữ đang hiển thị.
 * @param {(a: 'vi'|'en', b: 'vi'|'en') => string} props.lc Hàm class ẩn/hiện theo ngôn ngữ (getLangClass).
 */
export default function PrivacyPolicyProcessorPanel({ language, lc }) {
  /** Nhãn mục phụ (2.1, 2.2…): tông trung tính, dễ quét như tài liệu pháp lý */
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
          Chính sách xử lý dữ liệu cá nhân – Bên xử lý dữ liệu (sau đây gọi tắt là <strong>&quot;Chính sách&quot;</strong>) quy định về những thông tin mà Công ty TNHH Giải pháp số DIGISO thu thập trên hoặc thông qua các website:{' '}
          <strong>digiso.vn</strong>, <strong>uknow.edu.vn</strong>, <strong>campaign.digiso.vn</strong> và các ứng dụng, dịch vụ liên quan.
        </p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          This Data Processing Policy – Processor (hereinafter &quot;<strong>Policy</strong>&quot;) governs information collected by DIGISO Digital Solutions Co., Ltd. through its websites: <strong>digiso.vn</strong>, <strong>uknow.edu.vn</strong>,{' '}
          <strong>campaign.digiso.vn</strong> and related applications and services.
        </p>
        <p className={`text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          Chính sách này được áp dụng khi DIGISO đóng vai trò là <strong>bên xử lý dữ liệu</strong>. Trường hợp bạn là người dùng của khách hàng đã ký hợp đồng với DIGISO, Chính sách này áp dụng cho bạn.
        </p>
        <p className={`text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          This Policy applies when DIGISO acts as a <strong>data processor</strong>. If you are a user under a customer organization that has contracted with DIGISO, this Policy applies to you.
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
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li>
            <strong>DIGISO / chúng tôi:</strong> Công ty TNHH Giải pháp số DIGISO.
          </li>
          <li>
            <strong>Khách hàng:</strong> Tổ chức/cá nhân ký hợp đồng với DIGISO, là bên kiểm soát dữ liệu.
          </li>
          <li>
            <strong>Người dùng:</strong> Cá nhân truy cập, sử dụng các dịch vụ DIGISO dưới sự quản lý của Khách hàng.
          </li>
          <li>
            <strong>Chủ thể dữ liệu:</strong> Cá nhân được dữ liệu cá nhân phản ánh.
          </li>
          <li>
            <strong>Hợp đồng:</strong> Hợp đồng cung cấp dịch vụ phần mềm/giải pháp số ký kết giữa DIGISO và Khách hàng.
          </li>
          <li>
            <strong>Dịch vụ:</strong> Bao gồm các website digiso.vn, uknow.edu.vn, campaign.digiso.vn, ứng dụng và các dịch vụ liên quan.
          </li>
          <li>
            <strong>Dữ liệu cá nhân:</strong> Thông tin gắn liền hoặc giúp xác định một cá nhân cụ thể, theo quy định tại Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15.
          </li>
        </ul>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li>
            <strong>DIGISO / we:</strong> DIGISO Digital Solutions Co., Ltd.
          </li>
          <li>
            <strong>Customer:</strong> Organization/individual contracting with DIGISO, acting as data controller.
          </li>
          <li>
            <strong>User:</strong> Individual accessing DIGISO services under a Customer&apos;s management.
          </li>
          <li>
            <strong>Data Subject:</strong> Individual to whom personal data relates.
          </li>
          <li>
            <strong>Agreement:</strong> Service agreement signed between DIGISO and the Customer.
          </li>
          <li>
            <strong>Services:</strong> Includes digiso.vn, uknow.edu.vn, campaign.digiso.vn websites, applications, and related services.
          </li>
          <li>
            <strong>Personal Data:</strong> Information linked to or that identifies a specific individual, as defined under Vietnam&apos;s Personal Data Protection Law No. 91/2025/QH15.
          </li>
        </ul>
      </section>

      {/* 2. Dữ liệu xử lý */}
      <section className="pp-section px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
            2
          </div>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'vi')}`}>Dữ liệu cá nhân DIGISO xử lý</h2>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'en')}`}>Personal Data We Process</h2>
        </div>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          Với tư cách Bên xử lý, DIGISO không chủ động thu thập dữ liệu cá nhân mà xử lý dữ liệu theo ủy thác của Bên kiểm soát thông qua Hợp đồng.
        </p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          As Processor, DIGISO does not independently collect personal data but processes it on behalf of the Controller under the Agreement.
        </p>

        <div className="mt-[18px]">
          <h3 className={`${subBar} ${lc(language, 'vi')}`}>
            {bar}
            2.1 – Dữ liệu do Khách hàng cung cấp
          </h3>
          <h3 className={`${subBar} ${lc(language, 'en')}`}>
            {bar}
            2.1 – Data Provided by the Customer
          </h3>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            <li>Họ tên, ngày tháng năm sinh, giới tính, quốc tịch</li>
            <li>Số điện thoại, địa chỉ email, địa chỉ liên hệ</li>
            <li>Hình ảnh cá nhân, CMND/CCCD, số định danh cá nhân, hộ chiếu</li>
            <li>Thông tin tài khoản số, lịch sử hoạt động trực tuyến</li>
            <li>Tình trạng hôn nhân, thông tin quan hệ gia đình (nếu cần thiết)</li>
            <li>Dữ liệu học tập: tiến độ khóa học, kết quả kiểm tra, chứng chỉ (Uknow.edu.vn)</li>
            <li>Dữ liệu chiến dịch marketing: thông tin đăng ký, phản hồi chiến dịch (campaign.digiso.vn)</li>
          </ul>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            <li>Full name, date of birth, gender, nationality</li>
            <li>Phone number, email address, contact address</li>
            <li>Personal photo, ID/citizen ID, passport, individual ID number</li>
            <li>Digital account information, online activity history</li>
            <li>Marital status, family relationship information (if required)</li>
            <li>Learning data: course progress, assessment results, certificates (Uknow.edu.vn)</li>
            <li>Marketing campaign data: registration info, campaign responses (campaign.digiso.vn)</li>
          </ul>
        </div>

        <div className="mt-[18px]">
          <h3 className={`${subBar} ${lc(language, 'vi')}`}>
            {bar}
            2.2 – Dữ liệu tự động thu thập
          </h3>
          <h3 className={`${subBar} ${lc(language, 'en')}`}>
            {bar}
            2.2 – Automatically Collected Data
          </h3>
          <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            Khi Người dùng sử dụng Dịch vụ, DIGISO tự động thu thập: địa chỉ IP, loại thiết bị/trình duyệt, trang đã truy cập, thời gian truy cập thông qua cookie và các công nghệ tương tự.
          </p>
          <p className={`text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            When Users access the Services, DIGISO automatically collects: IP address, device/browser type, pages visited, access time via cookies and similar technologies.
          </p>
        </div>

        <div className="mt-[18px]">
          <h3 className={`${subBar} ${lc(language, 'vi')}`}>
            {bar}
            2.3 – Dữ liệu từ dịch vụ tích hợp
          </h3>
          <h3 className={`${subBar} ${lc(language, 'en')}`}>
            {bar}
            2.3 – Data from Integrated Services
          </h3>
          <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            Người dùng có thể đăng nhập qua Google, Apple ID. Khi đó, DIGISO tiếp nhận tên, email, ngày sinh, giới tính, ảnh đại diện theo phạm vi quyền được chấp thuận.
          </p>
          <p className={`text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            Users may log in via Google or Apple ID. In such cases, DIGISO receives name, email, date of birth, gender, and profile photo within the authorized permission scope.
          </p>
        </div>
      </section>

      {/* 3. Mục đích xử lý */}
      <section className="pp-section px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
            3
          </div>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'vi')}`}>Mục đích xử lý dữ liệu</h2>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'en')}`}>Purpose of Data Processing</h2>
        </div>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li>
            <strong>Vận hành dịch vụ:</strong> Duy trì và cung cấp đầy đủ tính năng của các nền tảng digiso.vn, uknow.edu.vn, campaign.digiso.vn.
          </li>
          <li>
            <strong>Cải thiện sản phẩm:</strong> Phân tích hành vi người dùng để nâng cao trải nghiệm và phát triển tính năng mới.
          </li>
          <li>
            <strong>Giao tiếp:</strong> Gửi thông báo dịch vụ, cập nhật tính năng, hỗ trợ khách hàng.
          </li>
          <li>
            <strong>Marketing (campaign.digiso.vn):</strong> Quản lý và theo dõi hiệu quả các chiến dịch marketing với sự đồng ý của người dùng.
          </li>
          <li>
            <strong>Đào tạo (uknow.edu.vn):</strong> Quản lý tiến độ học, cấp chứng chỉ điện tử, theo dõi kết quả.
          </li>
          <li>
            <strong>Phân tích thống kê:</strong> Thông qua Google Analytics — vận hành độc lập và có chính sách bảo mật riêng.
          </li>
        </ul>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li>
            <strong>Service operation:</strong> Maintain and deliver full features of digiso.vn, uknow.edu.vn, campaign.digiso.vn.
          </li>
          <li>
            <strong>Product improvement:</strong> Analyze user behavior to enhance experience and develop new features.
          </li>
          <li>
            <strong>Communication:</strong> Send service notifications, feature updates, and customer support.
          </li>
          <li>
            <strong>Marketing (campaign.digiso.vn):</strong> Manage and track marketing campaign performance with user consent.
          </li>
          <li>
            <strong>Training (uknow.edu.vn):</strong> Manage learning progress, issue digital certificates, track results.
          </li>
          <li>
            <strong>Analytics:</strong> Via Google Analytics — independently operated with its own privacy policy.
          </li>
        </ul>
      </section>

      {/* 4. Tiết lộ dữ liệu */}
      <section className="pp-section px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
            4
          </div>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'vi')}`}>Tiết lộ dữ liệu cho bên thứ ba</h2>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'en')}`}>Disclosure to Third Parties</h2>
        </div>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>DIGISO không tiết lộ dữ liệu cá nhân mà không có sự chấp thuận của Khách hàng, ngoại trừ các trường hợp sau:</p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>DIGISO does not disclose personal data without Customer consent, except in the following cases:</p>
        <ul className={`mb-[10px] list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li>
            <strong>Nhà cung cấp dịch vụ:</strong> Google (phân tích, lưu trữ GCP), Microsoft, Twilio SendGrid (email), FPT Smart Cloud (máy chủ trong nước) — chỉ tiếp cận dữ liệu đã mã hóa/ẩn danh trong phạm vi cần thiết.
          </li>
          <li>
            <strong>Người dùng nội bộ cùng hệ thống:</strong> Quản trị viên trong tổ chức của Khách hàng có thể truy cập một số dữ liệu cơ bản theo phân quyền.
          </li>
          <li>
            <strong>Cơ quan nhà nước:</strong> Khi có quyết định/yêu cầu từ cơ quan tố tụng hoặc cơ quan có thẩm quyền.
          </li>
          <li>
            <strong>Tổ chức lại doanh nghiệp:</strong> Trong trường hợp mua bán, sáp nhập — bên nhận dữ liệu phải cam kết bảo mật tương đương.
          </li>
        </ul>
        <ul className={`mb-[10px] list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li>
            <strong>Service providers:</strong> Google (Analytics, GCP storage), Microsoft, Twilio SendGrid (email), FPT Smart Cloud (domestic servers) — only access encrypted/anonymized data as necessary.
          </li>
          <li>
            <strong>Internal users of same system:</strong> Customer&apos;s admins may access certain basic data according to role permissions.
          </li>
          <li>
            <strong>State authorities:</strong> When required by court order or competent authority.
          </li>
          <li>
            <strong>Business restructuring:</strong> In mergers/acquisitions — recipient must commit to equivalent data protection.
          </li>
        </ul>
        <div className={`rounded-lg border border-slate-200/90 border-l-4 border-l-teal-600 bg-slate-50 px-[18px] py-[14px] text-[13.5px] text-slate-800 shadow-sm ${lc(language, 'vi')}`}>
          DIGISO sử dụng <strong>Twilio SendGrid</strong> để gửi email thông báo và chiến dịch qua <strong>campaign.digiso.vn</strong>. SendGrid chỉ nhận địa chỉ email và nội dung cần gửi.
        </div>
        <div className={`rounded-lg border border-slate-200/90 border-l-4 border-l-teal-600 bg-slate-50 px-[18px] py-[14px] text-[13.5px] text-slate-800 shadow-sm ${lc(language, 'en')}`}>
          DIGISO uses <strong>Twilio SendGrid</strong> for sending notification and campaign emails via <strong>campaign.digiso.vn</strong>. SendGrid only receives email addresses and the content to be delivered.
        </div>
      </section>

      {/* 5. Quyền và nghĩa vụ */}
      <section className="pp-section px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
            5
          </div>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'vi')}`}>Quyền và nghĩa vụ của chủ thể dữ liệu</h2>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'en')}`}>Rights and Obligations of Data Subjects</h2>
        </div>
        <div className="mt-[18px]">
          <h3 className={`${subBar} ${lc(language, 'vi')}`}>
            {bar}
            5.1 – Quyền của chủ thể dữ liệu
          </h3>
          <h3 className={`${subBar} ${lc(language, 'en')}`}>
            {bar}
            5.1 – Rights of Data Subjects
          </h3>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            <li>Quyền được biết về hoạt động xử lý dữ liệu</li>
            <li>Quyền đồng ý hoặc không đồng ý cho phép xử lý</li>
            <li>Quyền truy cập và chỉnh sửa dữ liệu cá nhân</li>
            <li>Quyền rút lại sự đồng ý bất kỳ lúc nào</li>
            <li>Quyền xóa dữ liệu, hạn chế xử lý, phản đối xử lý</li>
            <li>Quyền yêu cầu cung cấp dữ liệu, bồi thường thiệt hại</li>
            <li>Quyền khiếu nại, tố cáo, khởi kiện</li>
          </ul>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            <li>Right to know about data processing activities</li>
            <li>Right to consent or withhold consent to processing</li>
            <li>Right to access and correct personal data</li>
            <li>Right to withdraw consent at any time</li>
            <li>Right to erasure, restriction of processing, objection to processing</li>
            <li>Right to data portability and compensation for damages</li>
            <li>Right to complain, report, and bring legal action</li>
          </ul>
        </div>
        <div className="mt-[18px]">
          <h3 className={`${subBar} ${lc(language, 'vi')}`}>
            {bar}
            5.2 – Nghĩa vụ của chủ thể dữ liệu
          </h3>
          <h3 className={`${subBar} ${lc(language, 'en')}`}>
            {bar}
            5.2 – Obligations of Data Subjects
          </h3>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            <li>Tự chịu trách nhiệm về tính đúng đắn của thông tin cung cấp</li>
            <li>Tuân thủ các quy định bảo vệ dữ liệu của Bên kiểm soát và Bên xử lý</li>
            <li>Kịp thời thông báo khi phát hiện dấu hiệu vi phạm bảo mật</li>
          </ul>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            <li>Take responsibility for the accuracy of data provided</li>
            <li>Comply with data protection regulations of both Controller and Processor</li>
            <li>Promptly report any suspected security breach</li>
          </ul>
        </div>
        <div className={`mt-[14px] rounded-lg border border-slate-200/90 border-l-4 border-l-teal-600 bg-slate-50 px-[18px] py-[14px] text-[13.5px] text-slate-800 shadow-sm ${lc(language, 'vi')}`}>
          <strong>Thực thi quyền:</strong> Để thực hiện quyền của mình, chủ thể dữ liệu vui lòng liên hệ trực tiếp với <strong>Khách hàng (Bên kiểm soát dữ liệu)</strong>. Mọi yêu cầu gửi về DIGISO sẽ được chuyển tiếp đến Khách hàng tương ứng.
        </div>
        <div className={`mt-[14px] rounded-lg border border-slate-200/90 border-l-4 border-l-teal-600 bg-slate-50 px-[18px] py-[14px] text-[13.5px] text-slate-800 shadow-sm ${lc(language, 'en')}`}>
          <strong>Exercising rights:</strong> To exercise your rights, please contact the <strong>Customer (Data Controller)</strong> directly. Any requests sent to DIGISO will be forwarded to the relevant Customer.
        </div>
      </section>

      {/* 6. Bảo vệ dữ liệu */}
      <section className="pp-section px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
            6
          </div>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'vi')}`}>Bảo vệ dữ liệu</h2>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'en')}`}>Data Security</h2>
        </div>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li>Mã hóa dữ liệu tại tầng vật lý (encrypt-at-rest) và tầng truyền tải (encrypt-in-transit / HTTPS SSL/TLS)</li>
          <li>Hạ tầng đám mây: Google Cloud Platform (GCP Singapore) và máy chủ trong nước do FPT Smart Cloud cung cấp</li>
          <li>Xác thực 2 yếu tố (2FA), kiểm soát truy cập theo IP, Single Sign-On (SAML 2.0)</li>
          <li>Giám sát bảo mật liên tục, sao lưu dữ liệu định kỳ</li>
        </ul>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li>Data encryption at rest and in transit (HTTPS/SSL/TLS)</li>
          <li>Cloud infrastructure: Google Cloud Platform (GCP Singapore) and domestic servers via FPT Smart Cloud</li>
          <li>Two-factor authentication (2FA), IP-based access control, Single Sign-On (SAML 2.0)</li>
          <li>Continuous security monitoring, regular data backups</li>
        </ul>
        <p className={`mt-3 text-[13.5px] text-slate-500 ${lc(language, 'vi')}`}>
          Khi phát hiện sự cố bảo mật, DIGISO sẽ thông báo cho chủ thể dữ liệu và trình báo cơ quan chức năng trong thời gian sớm nhất.
        </p>
        <p className={`mt-3 text-[13.5px] text-slate-500 ${lc(language, 'en')}`}>
          Upon discovering a security incident, DIGISO will notify affected data subjects and report to competent authorities as soon as possible.
        </p>
      </section>

      {/* 7. Lưu trữ và chuyển dữ liệu */}
      <section className="pp-section px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
            7
          </div>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'vi')}`}>Lưu trữ &amp; Chuyển dữ liệu</h2>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'en')}`}>Data Retention &amp; Transfer</h2>
        </div>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          Dữ liệu cá nhân chỉ được lưu trữ trong thời gian tài khoản còn hoạt động hoặc trong thời gian cần thiết theo mục đích thu thập ban đầu và quy định pháp luật (tối thiểu 5 năm đối với dữ liệu giao dịch). DIGISO không sở hữu dữ liệu của Khách hàng và Người dùng.
        </p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          Personal data is retained only while the account is active or as long as required for the original collection purpose and applicable law (minimum 5 years for transaction data). DIGISO does not own Customer or User data.
        </p>
        <p className={`mt-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          Dữ liệu hiện được lưu trữ tại <strong>GCP Singapore</strong> và máy chủ đặt tại Việt Nam. Khi có chuyển dữ liệu xuyên biên giới, DIGISO đảm bảo tuân thủ đầy đủ quy định pháp luật hiện hành.
        </p>
        <p className={`mt-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          Data is currently stored at <strong>GCP Singapore</strong> and servers located in Vietnam. For any cross-border transfers, DIGISO ensures full compliance with applicable regulations.
        </p>
      </section>

      {/* 8. Cập nhật chính sách */}
      <section className="pp-section px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
            8
          </div>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'vi')}`}>Cập nhật chính sách</h2>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'en')}`}>Policy Updates</h2>
        </div>
        <p className={`text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          DIGISO sẽ cập nhật Chính sách này định kỳ. Mọi thay đổi quan trọng sẽ được thông báo qua email hoặc thông báo trên website ít nhất <strong>15 ngày</strong> trước khi có hiệu lực. Việc tiếp tục sử dụng dịch vụ sau khi chính sách có hiệu lực đồng nghĩa với việc chấp thuận phiên bản mới.
        </p>
        <p className={`text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          DIGISO will update this Policy periodically. Significant changes will be communicated via email or website notice at least <strong>15 days</strong> before taking effect. Continued use of services after the updated policy takes effect constitutes acceptance.
        </p>
      </section>
    </div>
  );
}
