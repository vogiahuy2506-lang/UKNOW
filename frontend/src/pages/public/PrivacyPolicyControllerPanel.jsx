/**
 * Tab «Chính sách xử lý dữ liệu – Bên kiểm soát» — nội dung khớp file HTML mẫu.
 *
 * @param {object} props
 * @param {'vi' | 'en'} props.language Ngôn ngữ đang hiển thị.
 * @param {(a: 'vi'|'en', b: 'vi'|'en') => string} props.lc Hàm class ẩn/hiện theo ngôn ngữ (getLangClass).
 */
export default function PrivacyPolicyControllerPanel({ language, lc }) {
  /** Nhãn mục phụ: kiểu tài liệu pháp lý, dễ đọc lướt */
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
          Chính sách xử lý dữ liệu cá nhân – Bên kiểm soát dữ liệu này (sau đây gọi tắt là <strong>&quot;Chính sách&quot;</strong>) quy định mục đích và phương tiện mà Công ty TNHH Giải pháp số DIGISO sử dụng để xử lý dữ liệu cá nhân với tư cách <strong>bên kiểm soát dữ liệu</strong>, thông qua các website <strong>digiso.vn</strong>, <strong>founderai.biz</strong> và các kênh giao tiếp liên quan.
        </p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          This Data Processing Policy – Controller (hereinafter &quot;<strong>Policy</strong>&quot;) sets out the purpose and means by which DIGISO Digital Solutions Co., Ltd. processes personal data as a <strong>data controller</strong>, through the websites <strong>digiso.vn</strong>, <strong>founderai.biz</strong> and related communication channels.
        </p>
        <p className={`text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          Nếu bạn là người dùng của Khách hàng đã ký hợp đồng với DIGISO, vui lòng tham khảo tab <em>Chính sách xử lý dữ liệu – Bên xử lý</em> để biết thêm thông tin về cách DIGISO xử lý dữ liệu thay mặt cho Khách hàng của bạn.
        </p>
        <p className={`text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          If you are a user under a Customer that has contracted with DIGISO, please refer to the <em>Data Processing Policy – Processor</em> tab for more information on how DIGISO processes data on behalf of your Customer.
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
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          Trong Chính sách này, các thuật ngữ dưới đây được hiểu như sau:
        </p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          In this Policy, the following terms are understood as follows:
        </p>
        <ol className={`list-decimal space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li>
            <strong>DIGISO / chúng tôi:</strong> Công ty TNHH Giải pháp số DIGISO, đơn vị cung cấp các giải pháp số và nền tảng công nghệ cho doanh nghiệp Việt Nam.
          </li>
          <li>
            <strong>Chủ thể dữ liệu:</strong> Cá nhân mà DIGISO trực tiếp thu thập và xử lý dữ liệu cá nhân để thực hiện các mục đích tại Chính sách này. Đây là những cá nhân sử dụng trực tiếp dịch vụ của DIGISO mà không thông qua Khách hàng (bên kiểm soát).
          </li>
          <li>
            <strong>Dữ liệu cá nhân:</strong> Thông tin dưới dạng ký hiệu, chữ viết, chữ số, hình ảnh, âm thanh hoặc dạng tương tự trên môi trường điện tử gắn liền với một con người cụ thể hoặc giúp xác định một con người cụ thể, theo quy định tại Luật Bảo vệ Dữ liệu Cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP hướng dẫn thi hành.
          </li>
          <li>
            <strong>Xử lý dữ liệu cá nhân:</strong> Một hoặc nhiều hoạt động tác động tới dữ liệu cá nhân, như: thu thập, ghi, phân tích, xác nhận, lưu trữ, chỉnh sửa, công khai, kết hợp, truy cập, truy xuất, thu hồi, mã hóa, giải mã, sao chép, chia sẻ, truyền đưa, cung cấp, chuyển giao, xóa, hủy dữ liệu cá nhân.
          </li>
          <li>
            <strong>Bên kiểm soát dữ liệu:</strong> DIGISO là bên kiểm soát dữ liệu cá nhân khi xác định mục đích và phương tiện xử lý dữ liệu cá nhân một cách độc lập.
          </li>
        </ol>
        <ol className={`list-decimal space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li>
            <strong>DIGISO / we:</strong> DIGISO Digital Solutions Co., Ltd., a digital solutions and technology platform provider for Vietnamese businesses.
          </li>
          <li>
            <strong>Data Subject:</strong> Individual from whom DIGISO directly collects and processes personal data under this Policy. These are individuals who use DIGISO services directly without going through a Customer (controller).
          </li>
          <li>
            <strong>Personal Data:</strong> Information in the form of symbols, writing, numbers, images, sounds, or similar forms on electronic media associated with a specific individual or enabling identification of a specific individual, as defined under Vietnam&apos;s Personal Data Protection Law No. 91/2025/QH15 and Decree 356/2025/NĐ-CP guiding implementation.
          </li>
          <li>
            <strong>Personal Data Processing:</strong> One or more activities affecting personal data, such as: collection, recording, analysis, confirmation, storage, modification, disclosure, combination, access, retrieval, encryption, decryption, copying, sharing, transmission, provision, transfer, deletion, or destruction of personal data.
          </li>
          <li>
            <strong>Data Controller:</strong> DIGISO is the data controller when independently determining the purposes and means of processing personal data.
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
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          Với tư cách Bên kiểm soát, DIGISO trực tiếp thu thập và xử lý các loại dữ liệu cá nhân sau:
        </p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          As Controller, DIGISO directly collects and processes the following types of personal data:
        </p>
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
            <li><strong>Thông tin nhân thân:</strong> Họ tên đầy đủ, ngày tháng năm sinh, giới tính, quốc tịch, dân tộc, nơi ở, địa chỉ thường trú, địa chỉ tạm trú</li>
            <li><strong>Thông tin liên lạc:</strong> Số điện thoại di động, địa chỉ email, địa chỉ liên hệ, địa chỉ giao hàng (nếu có)</li>
            <li><strong>Giấy tờ tùy thân:</strong> Hình ảnh cá nhân, số CMND/CCCD, số hộ chiếu, số giấy phép lái xe (GPLX), số mã số thuế, số BHXH, số tài khoản ngân hàng</li>
            <li><strong>Thông tin tài khoản:</strong> Thông tin tài khoản người dùng trên nền tảng, lịch sử hoạt động trực tuyến, địa chỉ IP, cookie, tùy chọn ngôn ngữ</li>
            <li><strong>Dữ liệu học tập (founderai.biz):</strong> Tiến độ khóa học, kết quả kiểm tra, bài tập, chứng chỉ hoàn thành, lịch sử học tập, hoạt động trên nền tảng</li>
            <li><strong>Dữ liệu chiến dịch marketing:</strong> Thông tin đăng ký sự kiện, phản hồi chiến dịch, lịch sử tương tác với email, SMS, Zalo, tùy chọn nhận thông tin</li>
          </ul>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            <li><strong>Personal information:</strong> Full name, date of birth, gender, nationality, ethnicity, residence, permanent address, temporary address</li>
            <li><strong>Contact information:</strong> Mobile phone number, email address, contact address, delivery address (if applicable)</li>
            <li><strong>Identity documents:</strong> Personal photo, ID/citizen ID number, passport number, driver&apos;s license number, tax code, social insurance number, bank account number</li>
            <li><strong>Account information:</strong> User account information on the platform, online activity history, IP address, cookies, language preferences</li>
            <li><strong>Learning data (founderai.biz):</strong> Course progress, assessment results, assignments, completion certificates, learning history, platform activity</li>
            <li><strong>Marketing campaign data:</strong> Event registration information, campaign responses, history of interactions with email, SMS, Zalo, information subscription preferences</li>
          </ul>
        </div>
        <div className="mt-[18px]">
          <h3 className={`${subBar} ${lc(language, 'vi')}`}>
            {bar}
            2.2 – Dữ liệu cá nhân nhạy cảm (có thể xử lý với sự đồng ý)
          </h3>
          <h3 className={`${subBar} ${lc(language, 'en')}`}>
            {bar}
            2.2 – Sensitive Personal Data (may be processed with consent)
          </h3>
          <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            DIGISO có thể thu thập và xử lý một số dữ liệu cá nhân nhạy cảm trong các trường hợp sau, với sự đồng ý rõ ràng của chủ thể dữ liệu:
          </p>
          <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            DIGISO may collect and process certain sensitive personal data in the following cases, with explicit consent from the data subject:
          </p>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            <li><strong>Thông tin sinh trắc học:</strong> Dữ liệu vân tay, khuôn mặt (nếu sử dụng tính năng xác thực sinh trắc học)</li>
            <li><strong>Dữ liệu vị trí:</strong> Thông tin vị trí địa lý từ dịch vụ định vị (nếu người dùng cho phép)</li>
            <li><strong>Dữ liệu cá nhân đặc thù:</strong> Các loại dữ liệu cá nhân đặc thù khác theo quy định pháp luật Việt Nam, chỉ khi được sự đồng ý rõ ràng</li>
          </ul>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            <li><strong>Biometric information:</strong> Fingerprint data, facial data (if using biometric authentication features)</li>
            <li><strong>Location data:</strong> Geographic location information from location services (if user permits)</li>
            <li><strong>Other specific personal data:</strong> Other types of specific personal data as defined by Vietnamese law, only with explicit consent</li>
          </ul>
          <p className={`mt-[10px] text-[13.5px] italic ${lc(language, 'vi')}`}>
            <em><strong>Lưu ý quan trọng:</strong> DIGISO tuyệt đối không thu thập dữ liệu liên quan đến tôn giáo, quan điểm chính trị, đời tư cá nhân không liên quan đến dịch vụ.</em>
          </p>
          <p className={`mt-[10px] text-[13.5px] italic ${lc(language, 'en')}`}>
            <em><strong>Important note:</strong> DIGISO strictly does not collect data related to religion, political views, or personal privacy unrelated to the service.</em>
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
            DIGISO thu thập một số dữ liệu để phục vụ hoạt động tiếp thị và cải thiện trải nghiệm người dùng:
          </p>
          <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            DIGISO collects certain data for marketing activities and improving user experience:
          </p>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            <li><strong>Cookie và tracking:</strong> Dữ liệu cookie, clickstream, lịch sử duyệt web, hành vi trên website</li>
            <li><strong>Dữ liệu email marketing:</strong> Phản hồi với email marketing, tỷ lệ mở email, tỷ lệ nhấp liên kết, lựa chọn hủy đăng ký</li>
            <li><strong>Phân tích:</strong> Thông tin từ Google Analytics và các công cụ phân tích khác</li>
          </ul>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            <li><strong>Cookie and tracking:</strong> Cookie data, clickstream, browsing history, website behavior</li>
            <li><strong>Email marketing data:</strong> Marketing email responses, email open rates, link click rates, unsubscribe preferences</li>
            <li><strong>Analytics:</strong> Information from Google Analytics and other analytics tools</li>
          </ul>
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
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          DIGISO thu thập dữ liệu cá nhân thông qua các phương thức sau:
        </p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          DIGISO collects personal data through the following methods:
        </p>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li>
            <strong>Giao kết hợp đồng:</strong> Khi ký kết hợp đồng cung cấp dịch vụ với DIGISO, khách hàng cung cấp: tên công ty, địa chỉ, mã số thuế, thông tin người đại diện, email, số điện thoại, thông tin tài khoản ngân hàng để soạn thảo và ký kết văn bản.
          </li>
          <li>
            <strong>Đăng ký dịch vụ:</strong> Thông tin cung cấp khi đăng ký tài khoản trên digiso.vn, founderai.biz, bao gồm thông tin cá nhân, thông tin công ty, thông tin thanh toán.
          </li>
          <li>
            <strong>Điền form trên website:</strong> Thông tin cung cấp khi điền vào các biểu mẫu trên website như form liên hệ, form đăng ký tư vấn, form tham gia sự kiện, webinar.
          </li>
          <li>
            <strong>Tự động thu thập:</strong> Cookie, web beacon, địa chỉ IP, thông tin thiết bị, lịch sử truy cập được thu thập tự động khi truy cập website.
          </li>
          <li>
            <strong>Dịch vụ tích hợp bên thứ ba:</strong> Google, Apple ID khi đăng nhập qua tài khoản bên thứ ba; thông tin từ các nền tảng mạng xã hội khi tương tác.
          </li>
          <li>
            <strong>Đối tác và sự kiện:</strong> Từ đối tác marketing, nhà cung cấp, khách mời hội thảo, webinar do DIGISO tổ chức; từ các chương trình liên kết (affiliate).
          </li>
          <li>
            <strong>Hỗ trợ khách hàng:</strong> Thông tin thu thập trong quá trình hỗ trợ qua chat, email, điện thoại.
          </li>
        </ul>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li>
            <strong>Contract execution:</strong> When signing service contracts with DIGISO, customers provide: company name, address, tax code, representative information, email, phone number, bank account information for drafting and signing agreements.
          </li>
          <li>
            <strong>Service registration:</strong> Information provided when registering accounts on digiso.vn, founderai.biz, including personal information, company information, payment information.
          </li>
          <li>
            <strong>Website form submissions:</strong> Information provided when filling out forms on the website such as contact forms, consultation registration forms, event registration forms, webinars.
          </li>
          <li>
            <strong>Automatic collection:</strong> Cookies, web beacons, IP addresses, device information, access history automatically collected when visiting the website.
          </li>
          <li>
            <strong>Third-party integrated services:</strong> Google, Apple ID when signing in via third-party accounts; information from social media platforms when interacting.
          </li>
          <li>
            <strong>Partners and events:</strong> From marketing partners, vendors, guests at DIGISO-hosted events, webinars; from affiliate programs.
          </li>
          <li>
            <strong>Customer support:</strong> Information collected during support interactions via chat, email, phone.
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
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          DIGISO xử lý dữ liệu cá nhân cho các mục đích sau:
        </p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          DIGISO processes personal data for the following purposes:
        </p>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li>
            <strong>Vận hành dịch vụ:</strong> Cung cấp và duy trì đầy đủ tính năng của các nền tảng digiso.vn, founderai.biz; phản hồi yêu cầu hỗ trợ khách hàng; quản lý tài khoản người dùng.
          </li>
          <li>
            <strong>Cải thiện sản phẩm:</strong> Phân tích xu hướng sử dụng, nghiên cứu hành vi người dùng, phát triển tính năng mới, tối ưu hóa giao diện và trải nghiệm người dùng.
          </li>
          <li>
            <strong>Giao tiếp và thông báo:</strong> Gửi thông báo dịch vụ, cập nhật tính năng, thông tin quan trọng về tài khoản; gửi email marketing (chỉ khi có sự đồng ý rõ ràng của người dùng).
          </li>
          <li>
            <strong>Dịch vụ</strong> Quản lý, đo lường và tối ưu hóa chiến dịch quảng cáo; gửi email, SMS, Zalo notification đến người dùng đã đồng ý; phân tích hiệu quả chiến dịch.
          </li>
          <li>
            <strong>Đào tạo (founderai.biz):</strong> Quản lý học viên và tiến độ học tập; cấp chứng chỉ điện tử; phân tích dữ liệu học tập để cải thiện chất lượng khóa học; theo dõi kết quả học tập.
          </li>
          <li>
            <strong>Phân tích thống kê:</strong> Sử dụng Google Analytics và các công cụ phân tích khác để hiểu lưu lượng truy cập, hành vi người dùng, hiệu quả marketing. Google Analytics vận hành độc lập và có chính sách bảo mật riêng.
          </li>
          <li>
            <strong>Bảo mật và phát hiện gian lận:</strong> Phát hiện và ngăn chặn các hoạt động gian lận, lạm dụng hệ thống, tấn công mạng; xác minh danh tính người dùng.
          </li>
          <li>
            <strong>Tuân thủ pháp lý:</strong> Theo yêu cầu của cơ quan có thẩm quyền, quy định pháp luật về thuế, kế toán, và các quy định khác có liên quan.
          </li>
        </ul>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li>
            <strong>Service operations:</strong> Provide and maintain full features of digiso.vn, founderai.biz; respond to customer support requests; manage user accounts.
          </li>
          <li>
            <strong>Product improvement:</strong> Analyze usage trends, study user behavior, develop new features, optimize interface and user experience.
          </li>
          <li>
            <strong>Communication and notifications:</strong> Send service notifications, feature updates, important account information; send marketing emails (only with explicit user consent).
          </li>
          <li>
            <strong>Service</strong> Manage, measure, and optimize advertising campaigns; send email, SMS, Zalo notifications to users who have consented; analyze campaign effectiveness.
          </li>
          <li>
            <strong>Training (founderai.biz):</strong> Manage learners and learning progress; issue digital certificates; analyze learning data to improve course quality; track learning outcomes.
          </li>
          <li>
            <strong>Analytics:</strong> Use Google Analytics and other analytics tools to understand traffic, user behavior, marketing effectiveness. Google Analytics operates independently and has its own privacy policy.
          </li>
          <li>
            <strong>Security and fraud detection:</strong> Detect and prevent fraud, system abuse, cyber attacks; verify user identity.
          </li>
          <li>
            <strong>Legal compliance:</strong> As required by competent authorities, tax and accounting regulations, and other relevant laws.
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
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          DIGISO cam kết không tiết lộ dữ liệu cá nhân khi không có sự chấp thuận của chủ thể dữ liệu, ngoại trừ các trường hợp đặc biệt theo quy định pháp luật:
        </p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          DIGISO commits not to disclose personal data without the data subject&apos;s consent, except in exceptional cases provided by law:
        </p>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li>
            <strong>Nhà cung cấp dịch vụ:</strong> DIGISO sử dụng các nhà cung cấp bên thứ ba để vận hành hạ tầng và dịch vụ. Các nhà cung cấp này chỉ tiếp cận dữ liệu trong phạm vi tối thiểu cần thiết và cam kết bảo mật:
            <ul className="list-[circle] ml-6 mt-2 space-y-1">
              <li><strong>Google:</strong> GCP (lưu trữ dữ liệu tại Singapore), Google Analytics</li>
              <li><strong>Microsoft:</strong> Azure Active Directory (xác thực)</li>
              <li><strong>Twilio SendGrid:</strong> Dịch vụ gửi email thông báo và chiến dịch email marketing</li>
              <li><strong>FPT Smart Cloud:</strong> Máy chủ đặt tại Việt Nam</li>
            </ul>
          </li>
          <li>
            <strong>Dữ liệu tổng hợp và ẩn danh:</strong> DIGISO có thể chia sẻ dữ liệu tổng hợp, ẩn danh cho bên thứ ba phục vụ mục đích báo cáo, nghiên cứu thị trường. Dữ liệu này không thể nhận dạng cá nhân cụ thể.
          </li>
          <li>
            <strong>Yêu cầu pháp lý:</strong> Theo lệnh tòa án, yêu cầu từ cơ quan nhà nước có thẩm quyền theo quy định của pháp luật Việt Nam.
          </li>
          <li>
            <strong>Bảo vệ quyền lợi:</strong> Khi cần thiết để bảo vệ quyền lợi và tài sản của DIGISO, người dùng hoặc công chúng.
          </li>
          <li>
            <strong>Tổ chức lại doanh nghiệp:</strong> Trong trường hợp mua bán, sáp nhập, chuyển nhượng tài sản — bên nhận dữ liệu phải cam kết bảo mật tương đương với Chính sách này.
          </li>
        </ul>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li>
            <strong>Service providers:</strong> DIGISO uses third-party providers to operate infrastructure and services. These providers only access data within the minimum scope necessary and commit to confidentiality:
            <ul className="list-[circle] ml-6 mt-2 space-y-1">
              <li><strong>Google:</strong> GCP (data storage in Singapore), Google Analytics</li>
              <li><strong>Microsoft:</strong> Azure Active Directory (authentication)</li>
              <li><strong>Twilio SendGrid:</strong> Notification and email marketing campaign services</li>
              <li><strong>FPT Smart Cloud:</strong> Servers located in Vietnam</li>
            </ul>
          </li>
          <li>
            <strong>Aggregated and anonymized data:</strong> DIGISO may share aggregated, anonymized data with third parties for reporting and market research purposes. This data cannot identify specific individuals.
          </li>
          <li>
            <strong>Legal requirements:</strong> Per court orders, requests from competent state authorities under Vietnamese law.
          </li>
          <li>
            <strong>Rights protection:</strong> When necessary to protect the rights and assets of DIGISO, users, or the public.
          </li>
          <li>
            <strong>Business restructuring:</strong> In cases of sale, merger, asset transfer — the receiving party must commit to equivalent confidentiality under this Policy.
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
          <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            Theo quy định của Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15, bạn có các quyền sau:
          </p>
          <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            Under Vietnam&apos;s Personal Data Protection Law No. 91/2025/QH15, you have the following rights:
          </p>
          <ol className={`list-decimal space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            <li>
              <strong>Quyền được biết:</strong> Được biết về mọi hoạt động xử lý dữ liệu cá nhân của mình trên các nền tảng DIGISO.
            </li>
            <li>
              <strong>Quyền đồng ý:</strong> Đồng ý hoặc không đồng ý cho phép xử lý dữ liệu cá nhân, bao gồm quyền rút lại sự đồng ý bất kỳ lúc nào.
            </li>
            <li>
              <strong>Quyền truy cập:</strong> Xem, kiểm tra, truy cập vào dữ liệu cá nhân của mình đang được DIGISO xử lý.
            </li>
            <li>
              <strong>Quyền chỉnh sửa:</strong> Yêu cầu chỉnh sửa, cập nhật thông tin cá nhân không chính xác hoặc đã thay đổi.
            </li>
            <li>
              <strong>Quyền rút lại đồng ý:</strong> Rút lại sự đồng ý đã cho trước đó bất kỳ lúc nào. Việc rút lại đồng ý không ảnh hưởng đến các hoạt động xử lý đã thực hiện trước đó.
            </li>
            <li>
              <strong>Quyền xóa dữ liệu:</strong> Yêu cầu xóa dữ liệu cá nhân trong các trường hợp pháp luật cho phép.
            </li>
            <li>
              <strong>Quyền hạn chế xử lý:</strong> Yêu cầu tạm ngừng một phần hoặc toàn bộ việc xử lý dữ liệu cá nhân.
            </li>
            <li>
              <strong>Quyền cung cấp dữ liệu:</strong> Yêu cầu DIGISO cung cấp cho bạn dữ liệu cá nhân của bạn đang được xử lý.
            </li>
            <li>
              <strong>Quyền phản đối:</strong> Phản đối việc xử lý dữ liệu cho mục đích marketing, tiếp thị.
            </li>
            <li>
              <strong>Quyền bồi thường:</strong> Yêu cầu bồi thường khi có thiệt hại do vi phạm quy định bảo vệ dữ liệu cá nhân.
            </li>
            <li>
              <strong>Quyền hủy đăng ký email:</strong> Hủy nhận email marketing bất kỳ lúc nào qua link &quot;Unsubscribe&quot; trong mỗi email từ email.
            </li>
          </ol>
          <ol className={`list-decimal space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            <li>
              <strong>Right to know:</strong> Be informed about all processing activities involving your personal data on DIGISO platforms.
            </li>
            <li>
              <strong>Right to consent:</strong> Consent or withhold consent to personal data processing, including the right to withdraw consent at any time.
            </li>
            <li>
              <strong>Right to access:</strong> View, inspect, and access your personal data being processed by DIGISO.
            </li>
            <li>
              <strong>Right to correction:</strong> Request correction or update of inaccurate or changed personal information.
            </li>
            <li>
              <strong>Right to withdraw consent:</strong> Withdraw consent previously given at any time. Withdrawal of consent does not affect processing activities already performed.
            </li>
            <li>
              <strong>Right to erasure:</strong> Request deletion of personal data in legally permitted cases.
            </li>
            <li>
              <strong>Right to restriction:</strong> Request partial or full suspension of personal data processing.
            </li>
            <li>
              <strong>Right to data portability:</strong> Request DIGISO to provide you with your personal data being processed.
            </li>
            <li>
              <strong>Right to object:</strong> Object to processing of data for marketing purposes.
            </li>
            <li>
              <strong>Right to compensation:</strong> Claim compensation for damages arising from violations of personal data protection regulations.
            </li>
            <li>
              <strong>Right to unsubscribe:</strong> Unsubscribe from marketing emails at any time via the &quot;Unsubscribe&quot; link in each email from email.
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
          <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            Khi sử dụng dịch vụ của DIGISO, bạn có các nghĩa vụ sau:
          </p>
          <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            When using DIGISO services, you have the following obligations:
          </p>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
            <li><strong>Trách nhiệm về thông tin:</strong> Tự chịu trách nhiệm về tính chính xác, đầy đủ của thông tin đã cung cấp cho DIGISO. Thông báo ngay cho DIGISO khi thông tin thay đổi.</li>
            <li><strong>Tuân thủ quy định:</strong> Tuân thủ các quy định bảo vệ dữ liệu cá nhân của DIGISO và pháp luật Việt Nam.</li>
            <li><strong>Bảo mật tài khoản:</strong> Bảo mật thông tin đăng nhập, mật khẩu, không chia sẻ cho người khác, đăng xuất khi sử dụng thiết bị chung.</li>
            <li><strong>Thông báo vi phạm:</strong> Kịp thời thông báo cho DIGISO khi phát hiện bất kỳ vi phạm bảo mật dữ liệu nào liên quan đến tài khoản của bạn.</li>
          </ul>
          <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
            <li><strong>Information accuracy:</strong> Take responsibility for the accuracy and completeness of information provided to DIGISO. Notify DIGISO immediately when information changes.</li>
            <li><strong>Compliance:</strong> Comply with DIGISO&apos;s personal data protection regulations and Vietnamese law.</li>
            <li><strong>Account security:</strong> Secure login information, passwords, do not share with others, log out when using shared devices.</li>
            <li><strong>Breach reporting:</strong> Promptly notify DIGISO when discovering any data security breach related to your account.</li>
          </ul>
        </div>
        <div className={`mt-[14px] rounded-lg border border-slate-200/90 border-l-4 border-l-orange-500 bg-slate-50 px-[18px] py-[14px] text-[13.5px] text-slate-800 shadow-sm ${lc(language, 'vi')}`}>
          <strong>Thực thi quyền:</strong> Để thực thi các quyền của mình, vui lòng liên hệ DIGISO qua email <strong>hotro.digibook@gmail.com</strong> hoặc sử dụng các tính năng tự phục vụ trên website. DIGISO sẽ phản hồi trong thời gian sớm nhất theo quy định pháp luật.
        </div>
        <div className={`mt-[14px] rounded-lg border border-slate-200/90 border-l-4 border-l-orange-500 bg-slate-50 px-[18px] py-[14px] text-[13.5px] text-slate-800 shadow-sm ${lc(language, 'en')}`}>
          <strong>Exercising your rights:</strong> To exercise your rights, please contact DIGISO via email at <strong>hotro.digibook@gmail.com</strong> or use self-service features available on the website. DIGISO will respond as soon as possible in accordance with the law.
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
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          DIGISO áp dụng các biện pháp bảo vệ dữ liệu cá nhân tiên tiến và phù hợp với các tiêu chuẩn quốc tế:
        </p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          DIGISO applies advanced personal data protection measures in line with international standards:
        </p>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li>
            <strong>Mã hóa dữ liệu:</strong>
            <ul className="list-[circle] ml-6 mt-1 space-y-1">
              <li>Mã hóa SSL/TLS cho toàn bộ kết nối trên digiso.vn, founderai.biz</li>
              <li>Mã hóa dữ liệu tại tầng vật lý (encrypt-at-rest) sử dụng AES-256</li>
              <li>Mã hóa tất cả các bản sao lưu (backup encryption)</li>
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
            <strong>Kiểm soát truy cập:</strong>
            <ul className="list-[circle] ml-6 mt-1 space-y-1">
              <li>Phân quyền theo vai trò (Role-Based Access Control - RBAC)</li>
              <li>Xác thực 2 lớp (2FA) cho tài khoản quản trị</li>
              <li>Single Sign-On (SSO) qua SAML 2.0 cho doanh nghiệp</li>
              <li>Kiểm soát truy cập theo IP (IP whitelist)</li>
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
              <li>SSL/TLS encryption for all connections on digiso.vn, founderai.biz</li>
              <li>Data encryption at rest using AES-256</li>
              <li>Full backup encryption</li>
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
            <strong>Access control:</strong>
            <ul className="list-[circle] ml-6 mt-1 space-y-1">
              <li>Role-Based Access Control (RBAC)</li>
              <li>Two-factor authentication (2FA) for admin accounts</li>
              <li>Single Sign-On (SSO) via SAML 2.0 for enterprises</li>
              <li>IP-based access control (IP whitelist)</li>
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
        <p className={`mt-3 text-[13.5px] ${lc(language, 'vi')}`}>
          Khi xảy ra sự cố bảo mật, DIGISO sẽ thông báo tới chủ thể dữ liệu trong thời gian sớm nhất và phối hợp với cơ quan chức năng để xử lý theo quy định của Luật Bảo vệ dữ liệu cá nhân.
        </p>
        <p className={`mt-3 text-[13.5px] ${lc(language, 'en')}`}>
          In case of a security incident, DIGISO will notify data subjects promptly and cooperate with competent authorities to handle the matter in accordance with Vietnam&apos;s Personal Data Protection Law.
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
          DIGISO cam kết lưu trữ và xử lý dữ liệu cá nhân một cách an toàn và tuân thủ pháp luật:
        </p>
        <p className={`mb-[10px] text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          DIGISO commits to storing and processing personal data safely and in compliance with the law:
        </p>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li><strong>Thời gian lưu trữ:</strong> Dữ liệu cá nhân được lưu trữ trong thời gian cần thiết để thực hiện mục đích thu thập hoặc theo quy định pháp luật. Dữ liệu giao dịch được giữ tối thiểu <strong>5 năm</strong> theo quy định về thuế và kế toán.</li>
          <li><strong>Địa điểm lưu trữ:</strong> Dữ liệu được lưu trữ tại Việt Nam (FPT Smart Cloud) và GCP Singapore theo cơ chế backup.</li>
          <li><strong>Chuyển dữ liệu xuyên biên giới:</strong> Mọi chuyển dữ liệu ra nước ngoài đều tuân thủ đầy đủ quy định pháp luật Việt Nam, bao gồm đánh giá tác động và các thủ tục cần thiết.</li>
          <li><strong>Xóa dữ liệu:</strong> Sau khi hết thời hạn lưu trữ hoặc khi nhận được yêu cầu xóa hợp lệ, dữ liệu sẽ được xóa an toàn không thể phục hồi hoặc ẩn danh hóa theo tiêu chuẩn.</li>
        </ul>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li><strong>Retention period:</strong> Personal data is retained for the time necessary to achieve the collection purpose or as required by law. Transaction data is kept for a minimum of <strong>5 years</strong> under tax and accounting regulations.</li>
          <li><strong>Storage location:</strong> Data is stored in Vietnam (FPT Smart Cloud) and GCP Singapore under backup mechanisms.</li>
          <li><strong>Cross-border transfer:</strong> All cross-border data transfers comply fully with Vietnamese law, including impact assessments and necessary procedures.</li>
          <li><strong>Data deletion:</strong> After the retention period expires or upon receiving a valid deletion request, data will be securely and irreversibly deleted or anonymized according to standards.</li>
        </ul>
      </section>

      {/* 9. Cam kết không thực hiện */}
      <section className="pp-section px-5 py-6 sm:px-8 sm:py-8">
        <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
            9
          </div>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'vi')}`}>Cam kết của DIGISO</h2>
          <h2 className={`pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl ${lc(language, 'en')}`}>DIGISO&apos;s Commitments</h2>
        </div>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
          <li>
            DIGISO <strong>cam kết không thu thập</strong> dữ liệu cá nhân nhạy cảm liên quan đến tôn giáo, quan điểm chính trị, nguồn gốc sắc tộc, hoặc các thông tin riêng tư không liên quan đến dịch vụ.
          </li>
          <li>
            DIGISO <strong>cam kết không bán, không chuyển nhượng</strong> dữ liệu cá nhân của người dùng cho bất kỳ bên thứ ba nào vì mục đích thương mại.
          </li>
          <li>
            DIGISO <strong>không sử dụng dữ liệu cá nhân</strong> cho các mục đích khác ngoài các mục đích đã được thông báo và có sự đồng ý.
          </li>
          <li>
            Nếu bạn phát hiện DIGISO đang xử lý dữ liệu ngoài phạm vi cho phép hoặc có bất kỳ lo ngại nào về việc bảo vệ dữ liệu cá nhân, vui lòng liên hệ ngay qua email <strong>hotro.digibook@gmail.com</strong>.
          </li>
        </ul>
        <ul className={`list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          <li>
            DIGISO <strong>commits not to collect</strong> sensitive personal data related to religion, political views, ethnic origin, or private information unrelated to the service.
          </li>
          <li>
            DIGISO <strong>commits not to sell or transfer</strong> users&apos; personal data to any third party for commercial purposes.
          </li>
          <li>
            DIGISO <strong>does not use personal data</strong> for purposes other than those notified and consented to.
          </li>
          <li>
            If you discover DIGISO is processing data beyond the permitted scope or have any concerns about personal data protection, please contact us immediately at <strong>hotro.digibook@gmail.com</strong>.
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
          DIGISO sẽ thông báo mọi thay đổi quan trọng về Chính sách này ít nhất <strong>15 ngày</strong> trước khi có hiệu lực qua email hoặc thông báo nổi bật trên website. Phiên bản mới nhất của Chính sách sẽ luôn có hiệu lực trên trang này. Việc tiếp tục sử dụng dịch vụ sau khi chính sách mới có hiệu lực đồng nghĩa với sự chấp nhận và đồng ý tuân thủ chính sách đã được cập nhật.
        </p>
        <p className={`text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
          DIGISO will notify any significant changes to this Policy at least <strong>15 days</strong> before they take effect via email or prominent website notice. The latest version of the Policy will always be in effect on this page. Continued use of services after the updated policy takes effect constitutes acceptance and agreement to comply with the updated policy.
        </p>
      </section>
    </div>
  );
}
