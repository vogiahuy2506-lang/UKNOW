/**
 * Tab «Chính sách xử lý dữ liệu – Bên xử lý» — nội dung khớp file HTML mẫu.
 *
 * @param {object} props
 * @param {'vi' | 'en'} props.language Ngôn ngữ đang hiển thị.
 * @param {(a: 'vi'|'en', b: 'vi'|'en') => string} props.lc Hàm class ẩn/hiện theo ngôn ngữ (getLangClass).
 */
export default function PrivacyPolicyProcessorPanel({ language, lc }) {
  /** Nhãn mục phụ (2.1, 2.2…): tông trung tính, dễ quét như tài liệu pháp lý */
  const subBar = 'mb-3 flex items-center gap-2.5 text-sm font-semibold text-slate-800';
  const bar = <span className="inline-block h-4 w-1 shrink-0 rounded-full bg-orange-500" aria-hidden />;

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
          <strong>digiso.vn</strong>, <strong>founderai.biz</strong> và các ứng dụng, dịch vụ liên quan.
        </p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          This Data Processing Policy – Processor (hereinafter &quot;<strong>Policy</strong>&quot;) governs information collected by DIGISO Digital Solutions Co., Ltd. through its websites: <strong>digiso.vn</strong>, <strong>founderai.biz</strong>,{' '}
          <strong>and related applications and services.</strong>
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
            <strong>DIGISO / chúng tôi:</strong> Công ty TNHH Giải pháp số DIGISO, đơn vị cung cấp các giải pháp số và nền tảng công nghệ cho doanh nghiệp Việt Nam.
          </li>
          <li>
            <strong>Khách hàng:</strong> Tổ chức hoặc cá nhân ký hợp đồng với DIGISO, đóng vai trò là bên kiểm soát dữ liệu cá nhân.
          </li>
          <li>
            <strong>Người dùng:</strong> Cá nhân truy cập, sử dụng các dịch vụ của DIGISO dưới sự quản lý của Khách hàng.
          </li>
          <li>
            <strong>Chủ thể dữ liệu:</strong> Cá nhân được dữ liệu cá nhân phản ánh, là đối tượng của hoạt động xử lý dữ liệu.
          </li>
          <li>
            <strong>Hợp đồng:</strong> Hợp đồng cung cấp dịch vụ phần mềm/giải pháp số được ký kết giữa DIGISO và Khách hàng, quy định rõ phạm vi và trách nhiệm của mỗi bên.
          </li>
          <li>
            <strong>Dịch vụ:</strong> Bao gồm các website digiso.vn (nền tảng quản lý marketing), founderai.biz (nền tảng AI cho founder), ứng dụng web và các dịch vụ liên quan.
          </li>
          <li>
            <strong>Dữ liệu cá nhân:</strong> Thông tin dưới dạng ký hiệu, chữ viết, chữ số, hình ảnh, âm thanh hoặc dạng tương tự trên môi trường điện tử gắn liền với một con người cụ thể hoặc giúp xác định một con người cụ thể, theo quy định tại Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15.
          </li>
        </ul>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li>
            <strong>DIGISO / we:</strong> DIGISO Digital Solutions Co., Ltd., a digital solutions and technology platform provider for Vietnamese businesses.
          </li>
          <li>
            <strong>Customer:</strong> Organization or individual contracting with DIGISO, acting as data controller.
          </li>
          <li>
            <strong>User:</strong> Individual accessing DIGISO services under a Customer&apos;s management.
          </li>
          <li>
            <strong>Data Subject:</strong> Individual to whom personal data relates, being the target of data processing activities.
          </li>
          <li>
            <strong>Agreement:</strong> Service agreement signed between DIGISO and the Customer, specifying scope and responsibilities of each party.
          </li>
          <li>
            <strong>Services:</strong> Includes digiso.vn (marketing management platform), founderai.biz (AI platform for founders), web applications, and related services.
          </li>
          <li>
            <strong>Personal Data:</strong> Information in the form of symbols, writing, numbers, images, sounds, or similar forms on electronic media associated with a specific individual or enabling identification of a specific individual, as defined under Vietnam&apos;s Personal Data Protection Law No. 91/2025/QH15.
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
          Với tư cách Bên xử lý, DIGISO không chủ động thu thập dữ liệu cá nhân mà xử lý dữ liệu theo ủy thác của Bên kiểm soát thông qua Hợp đồng. DIGISO chỉ xử lý dữ liệu trong phạm vi và mục đích được Khách hàng ủy quyền, tuân thủ nghiêm ngặt các điều khoản đã thỏa thuận.
        </p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          As Processor, DIGISO does not independently collect personal data but processes it on behalf of the Controller under the Agreement. DIGISO only processes data within the scope and purposes authorized by the Customer, strictly complying with the agreed terms.
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
          <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            Khi sử dụng dịch vụ của DIGISO, Khách hàng có thể cung cấp các loại dữ liệu cá nhân sau của Người dùng:
          </p>
          <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            When using DIGISO services, Customers may provide the following types of personal data of Users:
          </p>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            <li><strong>Thông tin nhân thân:</strong> Họ tên đầy đủ, ngày tháng năm sinh, giới tính, quốc tịch, dân tộc, tôn giáo (nếu có)</li>
            <li><strong>Thông tin liên lạc:</strong> Số điện thoại di động, địa chỉ email, địa chỉ liên hệ, địa chỉ thường trú, địa chỉ tạm trú</li>
            <li><strong>Giấy tờ tùy thân:</strong> Hình ảnh cá nhân, số CMND/CCCD, số định danh cá nhân, số hộ chiếu, số giấy phép lái xe, số mã số thuế, số BHXH</li>
            <li><strong>Thông tin tài khoản:</strong> Thông tin tài khoản ngân hàng, lịch sử hoạt động trực tuyến, địa chỉ IP, cookie</li>
            <li><strong>Thông tin gia đình:</strong> Tình trạng hôn nhân, thông tin vợ/chồng, con cái, người thân (nếu cần thiết cho mục đích dịch vụ)</li>
            <li><strong>Dữ liệu học tập (founderai.biz):</strong> Tiến độ khóa học, kết quả kiểm tra, bài tập, chứng chỉ hoàn thành, lịch sử học tập</li>
            <li><strong>Dữ liệu chiến dịch marketing:</strong> Thông tin đăng ký sự kiện, phản hồi chiến dịch, lịch sử tương tác với email, SMS, Zalo</li>
          </ul>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            <li><strong>Personal information:</strong> Full name, date of birth, gender, nationality, ethnicity, religion (if applicable)</li>
            <li><strong>Contact information:</strong> Mobile phone number, email address, contact address, permanent residence, temporary residence</li>
            <li><strong>Identity documents:</strong> Personal photo, ID/citizen ID number, individual identification number, passport number, driver&apos;s license, tax code, social insurance number</li>
            <li><strong>Account information:</strong> Bank account information, online activity history, IP address, cookies</li>
            <li><strong>Family information:</strong> Marital status, spouse information, children, relatives (if necessary for service purposes)</li>
            <li><strong>Learning data (founderai.biz):</strong> Course progress, assessment results, assignments, completion certificates, learning history</li>
            <li><strong>Marketing campaign data:</strong> Event registration information, campaign responses, history of interactions with email, SMS, Zalo</li>
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
            Khi Người dùng sử dụng Dịch vụ, DIGISO tự động thu thập một số thông tin kỹ thuật thông qua cookie và các công nghệ tương tự:
          </p>
          <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            When Users access the Services, DIGISO automatically collects certain technical information through cookies and similar technologies:
          </p>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            <li><strong>Địa chỉ IP:</strong> Địa chỉ giao thức Internet của thiết bị khi kết nối với máy chủ DIGISO</li>
            <li><strong>Thông tin thiết bị:</strong> Loại thiết bị (máy tính, điện thoại, máy tính bảng), hệ điều hành, loại trình duyệt và phiên bản</li>
            <li><strong>Hành vi truy cập:</strong> Các trang đã truy cập, thời gian truy cập, liên kết đã nhấp, từ khóa tìm kiếm</li>
            <li><strong>Cookie:</strong> Mã định danh phiên, mã định danh người dùng, tùy chọn ngôn ngữ, lịch sử hoạt động</li>
          </ul>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            <li><strong>IP Address:</strong> Internet protocol address of the device when connecting to DIGISO servers</li>
            <li><strong>Device information:</strong> Device type (computer, phone, tablet), operating system, browser type and version</li>
            <li><strong>Access behavior:</strong> Pages visited, time of access, links clicked, search keywords</li>
            <li><strong>Cookies:</strong> Session identifiers, user identifiers, language preferences, activity history</li>
          </ul>
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
            Người dùng có thể đăng nhập qua các dịch vụ bên thứ ba như Google hoặc Apple ID. Khi đó, DIGISO tiếp nhận các thông tin sau theo phạm vi quyền được chấp thuận:
          </p>
          <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            Users may log in via third-party services such as Google or Apple ID. In such cases, DIGISO receives the following information within the authorized permission scope:
          </p>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            <li>Họ và tên (theo tài khoản Google/Apple)</li>
            <li>Địa chỉ email (email chính của tài khoản)</li>
            <li>Ngày sinh (nếu được cung cấp)</li>
            <li>Giới tính (nếu được cung cấp)</li>
            <li>Ảnh đại diện từ tài khoản</li>
          </ul>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            <li>Full name (as per Google/Apple account)</li>
            <li>Email address (primary email of the account)</li>
            <li>Date of birth (if provided)</li>
            <li>Gender (if provided)</li>
            <li>Profile photo from the account</li>
          </ul>
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
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          DIGISO xử lý dữ liệu cá nhân cho các mục đích sau, theo đúng phạm vi được ủy quyền từ Khách hàng:
        </p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          DIGISO processes personal data for the following purposes, within the scope authorized by the Customer:
        </p>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li>
            <strong>Vận hành dịch vụ:</strong> Duy trì và cung cấp đầy đủ tính năng của các nền tảng digiso.vn, founderai.biz, đảm bảo hệ thống hoạt động ổn định, an toàn và liên tục.
          </li>
          <li>
            <strong>Cải thiện sản phẩm:</strong> Phân tích hành vi người dùng để hiểu nhu cầu, nâng cao trải nghiệm người dùng và phát triển các tính năng mới phù hợp với thị trường Việt Nam.
          </li>
          <li>
            <strong>Giao tiếp và hỗ trợ:</strong> Gửi thông báo dịch vụ, cập nhật tính năng, phản hồi yêu cầu hỗ trợ khách hàng, xử lý khiếu nại và tranh chấp.
          </li>
          <li>
            <strong>Marketing:</strong> Quản lý và theo dõi hiệu quả các chiến dịch marketing, gửi email/SMS/Zalo notification đến người dùng đã đồng ý, đo lường tỷ lệ chuyển đổi và ROI.
          </li>
          <li>
            <strong>Đào tạo (founderai.biz):</strong> Quản lý tiến độ học tập của học viên, cấp chứng chỉ điện tử, theo dõi kết quả học tập, phân tích dữ liệu để cải thiện chất lượng khóa học.
          </li>
          <li>
            <strong>Phân tích thống kê:</strong> Sử dụng Google Analytics để phân tích lưu lượng truy cập, hành vi người dùng trên website. Google Analytics vận hành độc lập và có chính sách bảo mật riêng.
          </li>
          <li>
            <strong>Bảo mật và giám sát:</strong> Phát hiện và ngăn chặn các hoạt động gian lận, lạm dụng hệ thống, tấn công mạng; đảm bảo tuân thủ các quy định pháp luật.
          </li>
        </ul>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li>
            <strong>Service operation:</strong> Maintain and deliver full features of digiso.vn, founderai.biz, ensuring the system operates stably, securely, and continuously.
          </li>
          <li>
            <strong>Product improvement:</strong> Analyze user behavior to understand needs, enhance user experience, and develop new features suitable for the Vietnamese market.
          </li>
          <li>
            <strong>Communication and support:</strong> Send service notifications, feature updates, respond to customer support requests, handle complaints and disputes.
          </li>
          <li>
            <strong>Marketing:</strong> Manage and track marketing campaign performance, send email/SMS/Zalo notifications to users who have consented, measure conversion rates and ROI.
          </li>
          <li>
            <strong>Training (founderai.biz):</strong> Manage learner progress, issue digital certificates, track learning outcomes, analyze data to improve course quality.
          </li>
          <li>
            <strong>Analytics:</strong> Use Google Analytics to analyze website traffic and user behavior. Google Analytics operates independently and has its own privacy policy.
          </li>
          <li>
            <strong>Security and monitoring:</strong> Detect and prevent fraud, system abuse, cyber attacks; ensure compliance with legal regulations.
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
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          DIGISO cam kết không tiết lộ dữ liệu cá nhân của Người dùng mà không có sự chấp thuận của Khách hàng. Việc tiết lộ chỉ được thực hiện trong các trường hợp đặc biệt theo quy định dưới đây:
        </p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          DIGISO commits not to disclose Users&apos; personal data without Customer consent. Disclosure is only made in exceptional cases as specified below:
        </p>
        <ul className={`mb-[10px] list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li>
            <strong>Nhà cung cấp dịch vụ:</strong> DIGISO sử dụng các nhà cung cấp bên thứ ba để vận hành hạ tầng và dịch vụ:
            <ul className="list-[circle] ml-6 mt-2 space-y-1">
              <li><strong>Google Cloud Platform (GCP):</strong> Lưu trữ dữ liệu tại Singapore, cung cấp các dịch vụ điện toán đám mây</li>
              <li><strong>Microsoft Azure:</strong> Các dịch vụ xác thực và quản lý identity</li>
              <li><strong>Twilio SendGrid:</strong> Dịch vụ gửi email thông báo và chiến dịch email marketing</li>
              <li><strong>FPT Smart Cloud:</strong> Máy chủ đặt tại Việt Nam, cung cấp hạ tầng nội địa</li>
              <li>Các nhà cung cấp này chỉ tiếp cận dữ liệu đã được mã hóa hoặc ẩn danh, trong phạm vi tối thiểu cần thiết để thực hiện dịch vụ.</li>
            </ul>
          </li>
          <li>
            <strong>Người dùng nội bộ cùng hệ thống:</strong> Quản trị viên trong tổ chức của Khách hàng có thể truy cập một số dữ liệu cơ bản của Người dùng theo phân quyền đã thiết lập. DIGISO không chịu trách nhiệm về quyết định truy cập của Khách hàng.
          </li>
          <li>
            <strong>Cơ quan nhà nước có thẩm quyền:</strong> Khi có quyết định, yêu cầu bằng văn bản từ cơ quan tố tụng hoặc cơ quan nhà nước có thẩm quyền theo quy định của pháp luật Việt Nam.
          </li>
          <li>
            <strong>Tổ chức lại doanh nghiệp:</strong> Trong trường hợp mua bán, sáp nhập, chuyển nhượng tài sản — bên nhận dữ liệu phải cam kết bảo mật và sử dụng dữ liệu tương đương với Chính sách này.
          </li>
        </ul>
        <ul className={`mb-[10px] list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li>
            <strong>Service providers:</strong> DIGISO uses third-party providers to operate infrastructure and services:
            <ul className="list-[circle] ml-6 mt-2 space-y-1">
              <li><strong>Google Cloud Platform (GCP):</strong> Data storage in Singapore, providing cloud computing services</li>
              <li><strong>Microsoft Azure:</strong> Authentication and identity management services</li>
              <li><strong>Twilio SendGrid:</strong> Notification and email marketing campaign services</li>
              <li><strong>FPT Smart Cloud:</strong> Servers located in Vietnam, providing domestic infrastructure</li>
              <li>These providers only access encrypted or anonymized data, within the minimum scope necessary to perform services.</li>
            </ul>
          </li>
          <li>
            <strong>Internal users of same system:</strong> Customer&apos;s administrators may access certain basic User data according to established permissions. DIGISO is not responsible for Customer&apos;s access decisions.
          </li>
          <li>
            <strong>State authorities:</strong> When there is a written decision or request from judicial authorities or competent state agencies under Vietnamese law.
          </li>
          <li>
            <strong>Business restructuring:</strong> In cases of sale, merger, asset transfer — the receiving party must commit to confidentiality and equivalent data use under this Policy.
          </li>
        </ul>
        <div className={`rounded-lg border border-slate-200/90 border-l-4 border-l-orange-500 bg-slate-50 px-[18px] py-[14px] text-[13.5px] text-slate-800 shadow-sm ${lc(language, 'vi')}`}>
          <strong>Lưu ý về Twilio SendGrid:</strong> DIGISO sử dụng <strong>Twilio SendGrid</strong> để gửi email thông báo và chiến dịch. SendGrid chỉ nhận địa chỉ email của người nhận và nội dung cần gửi. SendGrid không được phép sử dụng dữ liệu này cho bất kỳ mục đích nào khác.
        </div>
        <div className={`rounded-lg border border-slate-200/90 border-l-4 border-l-orange-500 bg-slate-50 px-[18px] py-[14px] text-[13.5px] text-slate-800 shadow-sm ${lc(language, 'en')}`}>
          <strong>Note about Twilio SendGrid:</strong> DIGISO uses <strong>Twilio SendGrid</strong> for sending notification and campaign emails. SendGrid only receives the recipient&apos;s email address and the content to be delivered. SendGrid is not permitted to use this data for any other purposes.
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
          <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            Theo quy định của Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15, chủ thể dữ liệu có các quyền sau:
          </p>
          <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            Under Vietnam&apos;s Personal Data Protection Law No. 91/2025/QH15, data subjects have the following rights:
          </p>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            <li><strong>Quyền được biết:</strong> Được biết về hoạt động xử lý dữ liệu cá nhân của mình</li>
            <li><strong>Quyền đồng ý hoặc không đồng ý:</strong> Đồng ý hoặc không đồng ý cho phép xử lý dữ liệu cá nhân</li>
            <li><strong>Quyền truy cập:</strong> Được xem, chỉnh sửa dữ liệu cá nhân của mình</li>
            <li><strong>Quyền rút lại sự đồng ý:</strong> Rút lại sự đồng ý bất kỳ lúc nào</li>
            <li><strong>Quyền xóa dữ liệu:</strong> Yêu cầu xóa dữ liệu cá nhân trong các trường hợp pháp luật cho phép</li>
            <li><strong>Quyền hạn chế xử lý:</strong> Yêu cầu tạm ngừng một phần hoặc toàn bộ việc xử lý dữ liệu</li>
            <li><strong>Quyền phản đối:</strong> Phản đối việc xử lý dữ liệu cho mục đích marketing</li>
            <li><strong>Quyền yêu cầu cung cấp dữ liệu:</strong> Yêu cầu DIGISO cung cấp dữ liệu của mình</li>
            <li><strong>Quyền bồi thường:</strong> Yêu cầu bồi thường khi có thiệt hại do vi phạm</li>
            <li><strong>Quyền khiếu nại, tố cáo, khởi kiện:</strong> Khiếu nại, tố cáo hoặc khởi kiện về hành vi vi phạm</li>
          </ul>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            <li><strong>Right to know:</strong> Be informed about processing activities involving your personal data</li>
            <li><strong>Right to consent:</strong> Consent or withhold consent to personal data processing</li>
            <li><strong>Right to access:</strong> View and correct your personal data</li>
            <li><strong>Right to withdraw consent:</strong> Withdraw consent at any time</li>
            <li><strong>Right to erasure:</strong> Request deletion of personal data in legally permitted cases</li>
            <li><strong>Right to restriction:</strong> Request suspension of partial or full data processing</li>
            <li><strong>Right to object:</strong> Object to data processing for marketing purposes</li>
            <li><strong>Right to data portability:</strong> Request DIGISO to provide your data to you</li>
            <li><strong>Right to compensation:</strong> Claim compensation for damages arising from violations</li>
            <li><strong>Right to complain, report, and sue:</strong> Complain, report, or sue regarding violations</li>
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
            <li><strong>Trách nhiệm về thông tin:</strong> Tự chịu trách nhiệm về tính đúng đắn, chính xác của thông tin đã cung cấp cho Bên kiểm soát</li>
            <li><strong>Tuân thủ quy định:</strong> Tuân thủ các quy định bảo vệ dữ liệu của Bên kiểm soát và Bên xử lý</li>
            <li><strong>Thông báo vi phạm:</strong> Kịp thời thông báo cho Bên kiểm soát khi phát hiện dấu hiệu vi phạm bảo mật dữ liệu</li>
            <li><strong>Bảo mật tài khoản:</strong> Bảo mật thông tin đăng nhập, mật khẩu và không chia sẻ cho người khác</li>
          </ul>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            <li><strong>Information accuracy:</strong> Take responsibility for the accuracy of information provided to the Controller</li>
            <li><strong>Compliance:</strong> Comply with data protection regulations of both Controller and Processor</li>
            <li><strong>Breach reporting:</strong> Promptly report to the Controller when discovering suspected data security breaches</li>
            <li><strong>Account security:</strong> Secure login information, passwords, and do not share with others</li>
          </ul>
        </div>
        <div className={`mt-[14px] rounded-lg border border-slate-200/90 border-l-4 border-l-orange-500 bg-slate-50 px-[18px] py-[14px] text-[13.5px] text-slate-800 shadow-sm ${lc(language, 'vi')}`}>
          <strong>Thực thi quyền:</strong> Để thực hiện quyền của mình, chủ thể dữ liệu vui lòng liên hệ trực tiếp với <strong>Khách hàng (Bên kiểm soát dữ liệu)</strong> — đơn vị đã ủy quyền cho DIGISO xử lý dữ liệu. Mọi yêu cầu gửi trực tiếp về DIGISO sẽ được chuyển tiếp đến Khách hàng tương ứng để xử lý.
        </div>
        <div className={`mt-[14px] rounded-lg border border-slate-200/90 border-l-4 border-l-orange-500 bg-slate-50 px-[18px] py-[14px] text-[13.5px] text-slate-800 shadow-sm ${lc(language, 'en')}`}>
          <strong>Exercising rights:</strong> To exercise your rights, please contact the <strong>Customer (Data Controller)</strong> directly — the entity that authorized DIGISO to process your data. Any requests sent directly to DIGISO will be forwarded to the relevant Customer for handling.
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
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          DIGISO áp dụng các biện pháp kỹ thuật và tổ chức tiên tiến để bảo vệ dữ liệu cá nhân:
        </p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          DIGISO applies advanced technical and organizational measures to protect personal data:
        </p>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li>
            <strong>Mã hóa dữ liệu:</strong>
            <ul className="list-[circle] ml-6 mt-1 space-y-1">
              <li>Mã hóa dữ liệu tại tầng vật lý (encrypt-at-rest) sử dụng AES-256</li>
              <li>Mã hóa dữ liệu tại tầng truyền tải (encrypt-in-transit) sử dụng HTTPS SSL/TLS</li>
              <li>Mã hóa các bản sao lưu (backup encryption)</li>
            </ul>
          </li>
          <li>
            <strong>Hạ tầng đám mây:</strong>
            <ul className="list-[circle] ml-6 mt-1 space-y-1">
              <li><strong>Google Cloud Platform (GCP Singapore):</strong> Hạ tầng cloud toàn cầu với các tính năng bảo mật nâng cao</li>
              <li><strong>FPT Smart Cloud:</strong> Máy chủ đặt tại Việt Nam, đáp ứng yêu cầu lưu trữ dữ liệu trong nước</li>
            </ul>
          </li>
          <li>
            <strong>Xác thực và kiểm soát truy cập:</strong>
            <ul className="list-[circle] ml-6 mt-1 space-y-1">
              <li>Xác thực 2 yếu tố (2FA) cho tài khoản quản trị</li>
              <li>Kiểm soát truy cập theo địa chỉ IP (IP whitelist)</li>
              <li>Single Sign-On (SSO) qua SAML 2.0 cho doanh nghiệp</li>
              <li>Phân quyền theo vai trò (Role-Based Access Control)</li>
            </ul>
          </li>
          <li>
            <strong>Giám sát và sao lưu:</strong>
            <ul className="list-[circle] ml-6 mt-1 space-y-1">
              <li>Giám sát bảo mật liên tục 24/7</li>
              <li>Sao lưu dữ liệu định kỳ hàng ngày</li>
              <li>Kiểm thử xâm nhập định kỳ (penetration testing)</li>
              <li>Cập nhật bản vá bảo mật kịp thời</li>
            </ul>
          </li>
        </ul>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li>
            <strong>Data encryption:</strong>
            <ul className="list-[circle] ml-6 mt-1 space-y-1">
              <li>Data encryption at rest using AES-256</li>
              <li>Data encryption in transit using HTTPS SSL/TLS</li>
              <li>Backup encryption</li>
            </ul>
          </li>
          <li>
            <strong>Cloud infrastructure:</strong>
            <ul className="list-[circle] ml-6 mt-1 space-y-1">
              <li><strong>Google Cloud Platform (GCP Singapore):</strong> Global cloud infrastructure with advanced security features</li>
              <li><strong>FPT Smart Cloud:</strong> Servers located in Vietnam, meeting domestic data storage requirements</li>
            </ul>
          </li>
          <li>
            <strong>Authentication and access control:</strong>
            <ul className="list-[circle] ml-6 mt-1 space-y-1">
              <li>Two-factor authentication (2FA) for admin accounts</li>
              <li>IP-based access control (IP whitelist)</li>
              <li>Single Sign-On (SSO) via SAML 2.0 for enterprises</li>
              <li>Role-Based Access Control (RBAC)</li>
            </ul>
          </li>
          <li>
            <strong>Monitoring and backup:</strong>
            <ul className="list-[circle] ml-6 mt-1 space-y-1">
              <li>24/7 continuous security monitoring</li>
              <li>Regular daily data backups</li>
              <li>Periodic penetration testing</li>
              <li>Timely security patch updates</li>
            </ul>
          </li>
        </ul>
        <p className={`mt-3 text-[13.5px] text-slate-500 ${lc(language, 'vi')}`}>
          Khi phát hiện sự cố bảo mật, DIGISO sẽ thông báo cho chủ thể dữ liệu và trình báo cơ quan chức năng trong thời gian sớm nhất theo quy định của Luật Bảo vệ dữ liệu cá nhân.
        </p>
        <p className={`mt-3 text-[13.5px] text-slate-500 ${lc(language, 'en')}`}>
          Upon discovering a security incident, DIGISO will notify affected data subjects and report to competent authorities as soon as possible under Vietnam&apos;s Personal Data Protection Law.
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
          Dữ liệu cá nhân chỉ được lưu trữ trong thời gian tài khoản còn hoạt động hoặc trong thời gian cần thiết theo mục đích thu thập ban đầu và quy định pháp luật. DIGISO không sở hữu dữ liệu của Khách hàng và Người dùng — dữ liệu này thuộc về Khách hàng.
        </p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          Personal data is retained only while the account is active or as long as required for the original collection purpose and applicable law. DIGISO does not own Customer or User data — this data belongs to the Customer.
        </p>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li><strong>Thời gian lưu trữ:</strong> Theo thỏa thuận với Khách hàng trong Hợp đồng, tối thiểu 5 năm đối với dữ liệu giao dịch theo quy định pháp luật Việt Nam</li>
          <li><strong>Địa điểm lưu trữ:</strong> Dữ liệu được lưu trữ tại GCP Singapore và máy chủ đặt tại Việt Nam (FPT Smart Cloud)</li>
          <li><strong>Chuyển dữ liệu xuyên biên giới:</strong> Khi có chuyển dữ liệu ra nước ngoài, DIGISO đảm bảo tuân thủ đầy đủ quy định pháp luật hiện hành về chuyển dữ liệu cá nhân ra nước ngoài</li>
          <li><strong>Xóa dữ liệu:</strong> Sau khi hết thời hạn lưu trữ hoặc theo yêu cầu của Khách hàng, dữ liệu sẽ được xóa an toàn không thể phục hồi hoặc ẩn danh hóa</li>
        </ul>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li><strong>Retention period:</strong> Per agreement with Customer in the Contract, minimum 5 years for transaction data under Vietnamese law</li>
          <li><strong>Storage location:</strong> Data is stored at GCP Singapore and servers located in Vietnam (FPT Smart Cloud)</li>
          <li><strong>Cross-border transfer:</strong> For any cross-border transfers, DIGISO ensures full compliance with applicable regulations on personal data transfer abroad</li>
          <li><strong>Data deletion:</strong> After the retention period expires or upon Customer request, data will be securely and irreversibly deleted or anonymized</li>
        </ul>
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
          DIGISO sẽ cập nhật Chính sách này định kỳ hoặc khi có thay đổi về quy định pháp luật, công nghệ hoặc hoạt động kinh doanh. Mọi thay đổi quan trọng sẽ được thông báo qua email hoặc thông báo nổi bật trên website ít nhất <strong>15 ngày</strong> trước khi có hiệu lực. Việc tiếp tục sử dụng dịch vụ sau khi chính sách có hiệu lực đồng nghĩa với việc chấp thuận phiên bản mới của Chính sách.
        </p>
        <p className={`text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          DIGISO will update this Policy periodically or when there are changes in legal regulations, technology, or business operations. Significant changes will be communicated via email or prominent website notice at least <strong>15 days</strong> before taking effect. Continued use of services after the updated policy takes effect constitutes acceptance of the new version of the Policy.
        </p>
      </section>
    </div>
  );
}
