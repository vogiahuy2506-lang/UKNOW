/**
 * Phần (III) của Chính sách bảo mật — «DIGISO là Bên kiểm soát và xử lý dữ liệu».
 *
 * Nội dung theo Mẫu số 01 mục 4 (phần "Chính sách xử lý dữ liệu cá nhân — Bên kiểm soát dữ liệu"),
 * viết lại cho khớp hạ tầng và cách vận hành thật của Founder AI. Chỉ nêu nhà cung cấp/biện pháp
 * mà hệ thống thực sự có. Không dùng cơ chế "tiếp tục sử dụng = đồng ý" cho dữ liệu cá nhân.
 *
 * @param {object} props
 * @param {'vi' | 'en'} props.language Ngôn ngữ đang hiển thị.
 */

const P = (vi, en) => ({ k: 'p', vi, en });
const H = (vi, en) => ({ k: 'h', vi, en });
const N = (vi, en) => ({ k: 'n', vi, en });
const UL = (...items) => ({ k: 'ul', items });
const OL = (...items) => ({ k: 'ol', items });
/** Một dòng danh sách: (vi, en, nhãn đậm vi, nhãn đậm en). */
const LI = (vi, en, bvi, ben) => ({ vi, en, bvi, ben });

const SECTIONS = [
  {
    num: '▸',
    title: { vi: 'Lời nói đầu', en: 'Introduction' },
    blocks: [
      P(
        'Phần này quy định mục đích và phương tiện mà Công ty TNHH Giải pháp số DIGISO sử dụng để xử lý dữ liệu cá nhân với tư cách bên kiểm soát và xử lý dữ liệu, thông qua website founderai.biz và các kênh giao tiếp liên quan. Đó là dữ liệu DIGISO trực tiếp thu thập từ bạn khi bạn truy cập, đăng ký, dùng thử hoặc sử dụng tài khoản Founder AI.',
        'This part sets out the purposes and means by which DIGISO Digital Solutions Co., Ltd. processes personal data as a data controller and processor, through the founderai.biz website and related communication channels. It covers data DIGISO collects directly from you when you visit, register, trial or use a Founder AI account.'
      ),
      P(
        'Nếu bạn là khách hàng của một doanh nghiệp đang dùng Founder AI (không trực tiếp dùng dịch vụ của DIGISO), vui lòng xem Phần (II) — DIGISO là Bên xử lý dữ liệu.',
        'If you are a customer of a business using Founder AI (and do not use DIGISO’s services directly), please see Part (II) — DIGISO as Data Processor.'
      ),
    ],
  },
  {
    num: '1',
    title: { vi: 'Định nghĩa', en: 'Definitions' },
    blocks: [
      OL(
        LI('Công ty TNHH Giải pháp số DIGISO, đơn vị chủ quản nền tảng Founder AI (founderai.biz).', 'DIGISO Digital Solutions Co., Ltd., the operator of the Founder AI platform (founderai.biz).', 'DIGISO / chúng tôi', 'DIGISO / we'),
        LI('Cá nhân mà DIGISO trực tiếp thu thập và xử lý dữ liệu cá nhân để thực hiện các mục đích tại Chính sách này, tức người sử dụng trực tiếp dịch vụ của DIGISO mà không thông qua Khách hàng (bên kiểm soát).', 'Individual from whom DIGISO directly collects and processes personal data for the purposes of this Policy, i.e. a person who uses DIGISO services directly and not through a Customer (controller).', 'Chủ thể dữ liệu', 'Data Subject'),
        LI('Dữ liệu số hoặc thông tin dưới dạng khác xác định hoặc giúp xác định một con người cụ thể, theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP.', 'Digital data or information in other forms that identifies or helps identify a specific individual, under Personal Data Protection Law No. 91/2025/QH15 and Decree 356/2025/NĐ-CP.', 'Dữ liệu cá nhân', 'Personal Data'),
        LI('Một hoặc nhiều hoạt động tác động tới dữ liệu cá nhân như thu thập, ghi, phân tích, lưu trữ, chỉnh sửa, công khai, truy cập, mã hóa, giải mã, sao chép, chia sẻ, truyền đưa, cung cấp, chuyển giao, xóa, hủy.', 'One or more activities affecting personal data such as collection, recording, analysis, storage, editing, disclosure, access, encryption, decryption, copying, sharing, transmission, provision, transfer, deletion or destruction.', 'Xử lý dữ liệu cá nhân', 'Personal Data Processing'),
        LI('DIGISO là bên kiểm soát và xử lý dữ liệu cá nhân khi tự quyết định mục đích, phương tiện và trực tiếp xử lý dữ liệu.', 'DIGISO is the data controller and processor when it determines the purposes and means and directly processes the data.', 'Bên kiểm soát và xử lý dữ liệu', 'Data Controller and Processor'),
        LI('Tổ chức, cá nhân ngoài chủ thể dữ liệu, bên kiểm soát và xử lý, tham gia vào việc xử lý dữ liệu cá nhân theo quy định pháp luật.', 'Organization or individual other than the data subject and the controller/processor that takes part in processing personal data under the law.', 'Bên thứ ba', 'Third Party')
      ),
    ],
  },
  {
    num: '2',
    title: { vi: 'Dữ liệu DIGISO thu thập & xử lý', en: 'Data DIGISO Collects & Processes' },
    blocks: [
      P(
        'Tùy dịch vụ bạn sử dụng, DIGISO trực tiếp thu thập và xử lý các loại dữ liệu cá nhân sau:',
        'Depending on the services you use, DIGISO directly collects and processes the following types of personal data:'
      ),
      H('2.1 – Dữ liệu cá nhân cơ bản', '2.1 – Basic Personal Data'),
      UL(
        LI('Họ tên; các thông tin như ngày sinh, giới tính, quốc tịch, dân tộc, nơi ở, thường trú, tạm trú chỉ khi bạn tự cung cấp hoặc khi cần cho dịch vụ bạn yêu cầu.', 'Full name; details such as date of birth, gender, nationality, ethnicity, residence, permanent and temporary address only where you provide them or they are needed for a service you request.', 'Thông tin nhân thân', 'Personal information'),
        LI('Số điện thoại, địa chỉ email, địa chỉ liên hệ; địa chỉ giao hàng (nếu có).', 'Phone number, email address, contact address; delivery address (if any).', 'Thông tin liên lạc', 'Contact information'),
        LI('Hình ảnh cá nhân, số CMND/CCCD, hộ chiếu, giấy phép lái xe, mã số thuế, số BHXH, số tài khoản ngân hàng — chỉ khi cần cho một dịch vụ hoặc nghĩa vụ cụ thể (ví dụ: mã số thuế, tên và địa chỉ để xuất hóa đơn điện tử; CCCD và tài khoản ngân hàng của đối tác giới thiệu để đối soát hoa hồng).', 'Personal photo, ID/citizen ID number, passport, driver’s license, tax code, social insurance number, bank account number — only where needed for a specific service or obligation (for example: tax code, name and address for electronic invoices; a referral partner’s citizen ID and bank account for commission reconciliation).', 'Giấy tờ tùy thân', 'Identity documents'),
        LI('Tài khoản người dùng trên nền tảng, mật khẩu (chỉ lưu dạng băm), ảnh đại diện, lịch sử hoạt động trực tuyến, địa chỉ IP, cookie, tùy chọn ngôn ngữ.', 'User account on the platform, password (stored only as a hash), profile photo, online activity history, IP address, cookies, language preferences.', 'Thông tin tài khoản', 'Account information'),
        LI('Lịch sử thanh toán gói dịch vụ, thông tin đơn hàng, thông tin xuất hóa đơn điện tử.', 'Service plan payment history, order information, electronic invoice details.', 'Dữ liệu giao dịch', 'Transaction data'),
        LI('Tiến độ khóa học, kết quả kiểm tra, bài tập, chứng chỉ hoàn thành, lịch sử học tập, hoạt động trên nền tảng.', 'Course progress, assessment results, assignments, completion certificates, learning history, platform activity.', 'Dữ liệu học tập', 'Learning data'),
        LI('Thông tin đăng ký sự kiện, phản hồi chiến dịch, lịch sử tương tác với email, Zalo, tùy chọn nhận thông tin.', 'Event registrations, campaign responses, interaction history with email and Zalo, information preferences.', 'Dữ liệu chiến dịch marketing', 'Marketing campaign data'),
        LI('Họ tên, địa chỉ email, số điện thoại, tên doanh nghiệp, nội dung yêu cầu và địa chỉ IP tại thời điểm gửi biểu mẫu.', 'Full name, email address, phone number, company name, inquiry content and IP address at the time the form is submitted.', 'Dữ liệu biểu mẫu liên hệ', 'Contact form data')
      ),
      H('2.2 – Dữ liệu cá nhân nhạy cảm', '2.2 – Sensitive Personal Data'),
      UL(
        LI('Số CCCD và thông tin tài khoản ngân hàng của đối tác giới thiệu, phục vụ đối soát hoa hồng và nghĩa vụ thuế; được mã hóa AES-256-GCM khi lưu trữ.', 'Referral partners’ citizen ID numbers and bank account information, used for commission reconciliation and tax obligations; encrypted with AES-256-GCM at rest.', 'Thông tin định danh đối tác giới thiệu', 'Referral partner identification'),
        LI('Hiện DIGISO không thu thập dữ liệu sinh trắc học (vân tay, khuôn mặt) hay dữ liệu vị trí. Nếu sau này triển khai tính năng cần các dữ liệu này, DIGISO sẽ thông báo và chỉ xử lý khi có sự đồng ý riêng, rõ ràng của bạn.', 'DIGISO currently does not collect biometric data (fingerprints, face) or location data. If a future feature needs such data, DIGISO will notify you and process it only with your separate, explicit consent.', 'Sinh trắc học và vị trí', 'Biometrics and location')
      ),
      N(
        'DIGISO không thu thập dữ liệu liên quan đến tôn giáo, quan điểm chính trị hay đời tư không liên quan đến dịch vụ.',
        'DIGISO does not collect data related to religion, political views or private matters unrelated to the service.'
      ),
      H('2.3 – Dữ liệu tiếp thị', '2.3 – Marketing Data'),
      UL(
        LI('Dữ liệu cookie, lịch sử duyệt web, hành vi trên website.', 'Cookie data, browsing history, website behavior.', 'Cookie và tracking', 'Cookie and tracking'),
        LI('Phản hồi với email marketing: tỷ lệ mở, nhấp liên kết, lựa chọn hủy đăng ký.', 'Responses to marketing email: opens, link clicks, unsubscribe choices.', 'Dữ liệu email marketing', 'Email marketing data'),
        LI('DIGISO có thể dùng Google Analytics để đo lưu lượng truy cập trước đăng ký (nguồn truy cập, trang dẫn tới đăng ký).', 'DIGISO may use Google Analytics to measure pre-registration traffic (traffic sources, pages leading to registration).', 'Phân tích', 'Analytics'),
        LI('Đối với mọi lượt xem trang đích do hệ thống vận hành, chúng tôi tự động ghi nhận một mã nhận diện ngẫu nhiên lưu tại trình duyệt (để nhận biết lượt quay lại), loại trình duyệt và thiết bị, trang web nguồn dẫn đến (referrer) và các tham số chiến dịch quảng cáo. Dữ liệu này chỉ phục vụ mục đích thống kê lượt truy cập cho chủ sở hữu trang.', 'For all visits to landing pages operated on our platform, we automatically record a randomized identifier stored in the browser (to recognize returning visits), browser and device type, referring URL and advertising campaign parameters. This data is collected solely to provide traffic statistics to the page owner.', 'Theo dõi lượt truy cập trang đích', 'Landing page visit tracking')
      ),
    ],
  },
  {
    num: '3',
    title: { vi: 'Cách thức thu thập dữ liệu', en: 'How We Collect Data' },
    blocks: [
      UL(
        LI('Khi ký kết hoặc đăng ký hợp đồng cung cấp dịch vụ với DIGISO, khách hàng cung cấp tên, địa chỉ, mã số thuế, thông tin người đại diện, email, số điện thoại để thiết lập và thực hiện hợp đồng.', 'When contracting or registering for services with DIGISO, customers provide name, address, tax code, representative details, email and phone number to set up and perform the contract.', 'Giao kết hợp đồng', 'Contract execution'),
        LI('Thông tin cung cấp khi đăng ký tài khoản trên founderai.biz, gồm thông tin cá nhân, thông tin doanh nghiệp và thông tin thanh toán.', 'Information provided when registering an account on founderai.biz, including personal, company and payment information.', 'Đăng ký dịch vụ', 'Service registration'),
        LI('Thông tin cung cấp khi điền biểu mẫu trên website như biểu mẫu liên hệ, đăng ký tư vấn, tham gia sự kiện, webinar. Khi bạn gửi biểu mẫu liên hệ, hệ thống tự động lưu địa chỉ IP và thời gian gửi làm dấu vết kỹ thuật của lượt gửi biểu mẫu, phục vụ đối chiếu khi có tranh chấp hoặc sự cố. Ràng buộc mục đích: địa chỉ email và thông tin thu thập từ biểu mẫu liên hệ chỉ dùng duy nhất để phản hồi yêu cầu đó; DIGISO không dùng thông tin này để gửi tiếp thị khi chưa có sự đồng ý riêng.', 'Information provided when filling out website forms such as contact, consultation registration, event and webinar forms. When you submit a contact form, the system automatically records your IP address and submission time as a technical record of the submission, used for verification in case of disputes or incidents. Mandatory limitation: email addresses and information collected from contact forms are used solely to respond to that inquiry; DIGISO does not use it for marketing without separate consent.', 'Điền biểu mẫu trên website', 'Website form submissions'),
        LI('Cookie, địa chỉ IP, thông tin thiết bị, lịch sử truy cập website và dữ liệu thống kê lượt xem trang đích (định danh ngẫu nhiên trình duyệt, nguồn truy cập, tham số chiến dịch) được thu thập tự động khi truy cập.', 'Cookies, IP addresses, device information, website access history and landing page analytics (randomized browser identifier, referring source, campaign parameters) are collected automatically when you visit.', 'Tự động thu thập', 'Automatic collection'),
        LI('Tài khoản Google khi bạn chọn đăng nhập bằng Google.', 'Your Google account when you choose to sign in with Google.', 'Dịch vụ tích hợp bên thứ ba', 'Third-party integrated services'),
        LI('Từ đối tác marketing, khách mời hội thảo, webinar do DIGISO tổ chức; từ chương trình giới thiệu (affiliate).', 'From marketing partners, guests at events and webinars hosted by DIGISO; from the referral (affiliate) program.', 'Đối tác và sự kiện', 'Partners and events'),
        LI('Thông tin thu thập trong quá trình hỗ trợ qua email, điện thoại và trợ lý AI trên nền tảng.', 'Information collected during support via email, phone and the platform’s AI assistant.', 'Hỗ trợ khách hàng', 'Customer support')
      ),
    ],
  },
  {
    num: '4',
    title: { vi: 'Mục đích xử lý dữ liệu', en: 'Purpose of Processing' },
    blocks: [
      UL(
        LI('Cung cấp và duy trì các tính năng của founderai.biz; phản hồi yêu cầu hỗ trợ; quản lý tài khoản người dùng.', 'Provide and maintain the features of founderai.biz; respond to support requests; manage user accounts.', 'Vận hành dịch vụ', 'Service operations'),
        LI('Phân tích xu hướng sử dụng, phát triển tính năng mới, tối ưu giao diện và trải nghiệm.', 'Analyze usage trends, develop new features, optimize the interface and experience.', 'Cải thiện sản phẩm', 'Product improvement'),
        LI('Gửi thông báo dịch vụ, cập nhật tính năng, thông tin quan trọng về tài khoản; gửi email marketing chỉ khi có sự đồng ý rõ ràng của bạn.', 'Send service notices, feature updates and important account information; send marketing email only with your explicit consent.', 'Giao tiếp và thông báo', 'Communication and notifications'),
        LI('Quản lý, đo lường và tối ưu hóa chiến dịch quảng cáo của DIGISO; gửi email, Zalo tới người đã đồng ý; phân tích hiệu quả chiến dịch.', 'Manage, measure and optimize DIGISO’s advertising campaigns; send email and Zalo messages to people who have consented; analyze campaign effectiveness.', 'Quảng cáo và chiến dịch', 'Advertising and campaigns'),
        LI('Quản lý học viên và tiến độ học tập; cấp chứng chỉ điện tử; phân tích dữ liệu học tập để cải thiện chất lượng khóa học.', 'Manage learners and learning progress; issue digital certificates; analyze learning data to improve course quality.', 'Đào tạo', 'Training'),
        LI('Sử dụng Google Analytics để hiểu lưu lượng truy cập trước đăng ký; Google Analytics vận hành độc lập và có chính sách bảo mật riêng.', 'Use Google Analytics to understand pre-registration traffic; Google Analytics operates independently and has its own privacy policy.', 'Phân tích thống kê', 'Analytics'),
        LI('Phát hiện và ngăn chặn gian lận, lạm dụng hệ thống, tấn công mạng; xác minh danh tính người dùng.', 'Detect and prevent fraud, system abuse and cyber attacks; verify user identity.', 'Bảo mật và phát hiện gian lận', 'Security and fraud detection'),
        LI('Theo yêu cầu của cơ quan có thẩm quyền, pháp luật về thuế, kế toán và các quy định liên quan.', 'As required by competent authorities, tax and accounting law and other relevant regulations.', 'Tuân thủ pháp lý', 'Legal compliance')
      ),
    ],
  },
  {
    num: '5',
    title: { vi: 'Tiết lộ dữ liệu', en: 'Data Disclosure' },
    blocks: [
      P(
        'DIGISO không tiết lộ dữ liệu cá nhân khi không có sự chấp thuận của chủ thể dữ liệu, ngoại trừ các trường hợp sau:',
        'DIGISO does not disclose personal data without the data subject’s consent, except in the following cases:'
      ),
      UL(
        LI('DIGISO sử dụng các nhà cung cấp sau; họ chỉ tiếp cận dữ liệu trong phạm vi tối thiểu cần thiết:', 'DIGISO uses the following providers; they access data only to the minimum extent necessary:', 'Nhà cung cấp dịch vụ', 'Service providers')
      ),
      UL(
        LI('Máy chủ ứng dụng, cơ sở dữ liệu đặt tại Việt Nam, hosting do Công ty Cổ phần AZDIGI cung cấp.', 'Application servers and database located in Vietnam, hosted by AZDIGI Joint Stock Company.', 'Hạ tầng máy chủ', 'Server infrastructure'),
        LI('Google Cloud Storage lưu tệp tải lên; Google Gemini API xử lý nội dung khi bạn dùng tính năng AI; Google Analytics đo lưu lượng truy cập.', 'Google Cloud Storage stores uploaded files; the Google Gemini API processes content when you use AI features; Google Analytics measures traffic.', 'Google', 'Google'),
        LI('Cloudflare cung cấp mạng phân phối nội dung, bảo mật và chứng chỉ SSL; lưu lượng truy cập đi qua hạ tầng của Cloudflare.', 'Cloudflare provides content delivery, security and SSL certificates; traffic passes through Cloudflare’s infrastructure.', 'Cloudflare', 'Cloudflare'),
        LI('Máy chủ SMTP gửi email thông báo và email chiến dịch của DIGISO.', 'SMTP servers deliver DIGISO’s notification and campaign email.', 'Gửi email', 'Email delivery'),
        LI('PayOS (thanh toán QR) và Mắt Bão e-Invoice (hóa đơn điện tử) để hoàn tất nghĩa vụ thanh toán và xuất chứng từ hợp pháp.', 'PayOS (QR payments) and Mat Bao e-Invoice (electronic invoices) to complete payment obligations and issue lawful documents.', 'Thanh toán và hóa đơn', 'Payment and invoicing')
      ),
      UL(
        LI('DIGISO có thể chia sẻ dữ liệu tổng hợp, ẩn danh cho bên thứ ba phục vụ báo cáo, nghiên cứu thị trường; dữ liệu này không thể nhận dạng cá nhân cụ thể.', 'DIGISO may share aggregated, anonymized data with third parties for reporting and market research; this data cannot identify specific individuals.', 'Dữ liệu tổng hợp và ẩn danh', 'Aggregated and anonymized data'),
        LI('Theo yêu cầu của cơ quan nhà nước có thẩm quyền theo quy định của pháp luật Việt Nam.', 'Upon requests from competent state authorities under Vietnamese law.', 'Yêu cầu pháp lý', 'Legal requirements'),
        LI('Khi cần thiết để bảo vệ quyền lợi hợp pháp của DIGISO hoặc người dùng theo quy định pháp luật.', 'Where necessary to protect the lawful rights of DIGISO or users in accordance with the law.', 'Bảo vệ quyền lợi', 'Rights protection'),
        LI('Trong trường hợp mua bán, sáp nhập, chuyển nhượng tài sản, bên nhận dữ liệu phải cam kết bảo mật tương đương Chính sách này.', 'In a sale, merger or asset transfer, the receiving party must commit to equivalent confidentiality under this Policy.', 'Tổ chức lại doanh nghiệp', 'Business restructuring')
      ),
    ],
  },
  {
    num: '6',
    title: { vi: 'Quyền và nghĩa vụ của chủ thể dữ liệu', en: 'Rights and Obligations of Data Subjects' },
    blocks: [
      H('6.1 – Quyền của chủ thể dữ liệu', '6.1 – Your Rights'),
      P(
        'Theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15, bạn có các quyền sau:',
        'Under Personal Data Protection Law No. 91/2025/QH15, you have the following rights:'
      ),
      OL(
        LI('Được biết về mọi hoạt động xử lý dữ liệu cá nhân của mình trên nền tảng của DIGISO.', 'Be informed about all processing of your personal data on DIGISO platforms.', 'Quyền được biết', 'Right to know'),
        LI('Đồng ý hoặc không đồng ý cho phép xử lý dữ liệu cá nhân.', 'Consent or refuse consent to personal data processing.', 'Quyền đồng ý', 'Right to consent'),
        LI('Xem, kiểm tra, truy cập dữ liệu cá nhân của mình đang được DIGISO xử lý.', 'View, check and access your personal data being processed by DIGISO.', 'Quyền truy cập', 'Right to access'),
        LI('Yêu cầu chỉnh sửa, cập nhật thông tin không chính xác hoặc đã thay đổi.', 'Request correction or update of inaccurate or changed information.', 'Quyền chỉnh sửa', 'Right to correction'),
        LI('Rút lại sự đồng ý đã cho bất kỳ lúc nào; việc rút lại không ảnh hưởng đến các hoạt động xử lý đã thực hiện trước đó.', 'Withdraw consent previously given at any time; withdrawal does not affect processing already carried out.', 'Quyền rút lại đồng ý', 'Right to withdraw consent'),
        LI('Yêu cầu xóa dữ liệu cá nhân trong các trường hợp pháp luật cho phép.', 'Request deletion of personal data in cases permitted by law.', 'Quyền xóa dữ liệu', 'Right to erasure'),
        LI('Yêu cầu tạm ngừng một phần hoặc toàn bộ việc xử lý dữ liệu cá nhân.', 'Request suspension of part or all of the processing.', 'Quyền hạn chế xử lý', 'Right to restriction'),
        LI('Yêu cầu DIGISO cung cấp dữ liệu cá nhân của bạn đang được xử lý.', 'Request DIGISO to provide the personal data of yours that it processes.', 'Quyền cung cấp dữ liệu', 'Right to data provision'),
        LI('Phản đối việc xử lý dữ liệu cho mục đích quảng cáo, tiếp thị.', 'Object to processing for advertising and marketing purposes.', 'Quyền phản đối', 'Right to object'),
        LI('Yêu cầu bồi thường khi có thiệt hại do vi phạm quy định bảo vệ dữ liệu cá nhân.', 'Claim compensation for damage caused by violations of personal data protection rules.', 'Quyền bồi thường', 'Right to compensation'),
        LI('Hủy nhận email marketing bất kỳ lúc nào qua liên kết hủy đăng ký (Unsubscribe) trong mỗi email.', 'Unsubscribe from marketing email at any time via the unsubscribe link in each email.', 'Quyền hủy đăng ký email', 'Right to unsubscribe'),
        LI('Khiếu nại, tố cáo hoặc khởi kiện theo quy định pháp luật.', 'Complain, report or sue in accordance with the law.', 'Quyền khiếu nại, tố cáo, khởi kiện', 'Right to complain, report and sue')
      ),
      H('6.2 – Nghĩa vụ của chủ thể dữ liệu', '6.2 – Obligations'),
      UL(
        LI('Tự chịu trách nhiệm về tính chính xác, đầy đủ của thông tin đã cung cấp; thông báo khi thông tin thay đổi.', 'Take responsibility for the accuracy and completeness of the information you provide; notify us when it changes.', 'Trách nhiệm về thông tin', 'Information accuracy'),
        LI('Tuân thủ quy định bảo vệ dữ liệu cá nhân của DIGISO và pháp luật Việt Nam.', 'Comply with DIGISO’s personal data protection rules and Vietnamese law.', 'Tuân thủ quy định', 'Compliance'),
        LI('Bảo mật thông tin đăng nhập, mật khẩu, không chia sẻ cho người khác, đăng xuất khi dùng thiết bị chung.', 'Keep login information and passwords secure, do not share them, and log out on shared devices.', 'Bảo mật tài khoản', 'Account security'),
        LI('Kịp thời thông báo cho DIGISO khi phát hiện vi phạm bảo mật liên quan đến tài khoản của bạn.', 'Promptly notify DIGISO of any security breach related to your account.', 'Thông báo vi phạm', 'Breach reporting')
      ),
      N(
        'Thực thi quyền: vui lòng liên hệ DIGISO qua email info@digiso.vn hoặc hotline (+84) 877 909 606, hoặc dùng trang Thông tin tài khoản để xem và chỉnh sửa thông tin. Quy trình chi tiết tại Phần (I), mục 6, 7 và 8.',
        'Exercising rights: please contact DIGISO at info@digiso.vn or hotline (+84) 877 909 606, or use the Account Information page to view and edit your details. Detailed procedures are in Part (I), Sections 6, 7 and 8.'
      ),
    ],
  },
  {
    num: '7',
    title: { vi: 'Bảo vệ dữ liệu', en: 'Data Security' },
    blocks: [
      P(
        'DIGISO áp dụng các biện pháp kỹ thuật và tổ chức như tại Phần (II), mục 6: truy cập qua HTTPS/TLS; mật khẩu băm bcrypt; mã hóa AES-256-GCM đối với số CCCD của đối tác giới thiệu và phiên kết nối kênh nhắn tin; phân quyền theo vai trò; tách dữ liệu theo từng tài khoản; giới hạn đăng nhập sai; nhật ký hoạt động; nhân sự chỉ tiếp cận theo phân công và có nghĩa vụ bảo mật.',
        'DIGISO applies the technical and organizational measures described in Part (II), Section 6: HTTPS/TLS access; bcrypt-hashed passwords; AES-256-GCM encryption for referral partners’ citizen ID numbers and messaging-channel sessions; role-based permissions; per-account data separation; failed-login limits; activity logs; personnel access only as assigned and under confidentiality.'
      ),
      P(
        'Khi xảy ra sự cố bảo mật, DIGISO sẽ thông báo tới chủ thể dữ liệu trong thời gian sớm nhất và phối hợp với cơ quan chức năng để xử lý theo quy định của Luật Bảo vệ dữ liệu cá nhân.',
        'In case of a security incident, DIGISO will notify data subjects as soon as possible and cooperate with competent authorities to handle it in accordance with the Personal Data Protection Law.'
      ),
    ],
  },
  {
    num: '8',
    title: { vi: 'Lưu trữ & Chuyển dữ liệu', en: 'Retention & Transfer' },
    blocks: [
      UL(
        LI('Dữ liệu cá nhân được lưu trữ theo các thời hạn cụ thể:', 'Personal data is retained for the following periods:', 'Thời gian lưu trữ', 'Retention period')
      ),
      UL(
        LI('Lưu trữ trong 13 tháng.', 'Retained for 13 months.', 'Thống kê lượt xem và dữ liệu truy cập trang đích', 'Page view analytics and landing page access data'),
        LI('Lưu trữ trong 24 tháng kể từ ngày gửi.', 'Retained for 24 months from the submission date.', 'Dữ liệu biểu mẫu liên hệ (địa chỉ IP và nội dung)', 'Contact form submissions (including IP address)'),
        LI('Lưu trữ tối thiểu 10 năm theo quy định của Luật Kế toán và pháp luật thuế.', 'Retained for at least 10 years under the Accounting Law and tax law.', 'Chứng từ kế toán (đơn hàng, hoa hồng, hóa đơn)', 'Accounting records (orders, commissions, invoices)'),
        LI('Lưu trữ trong thời gian tài khoản hoạt động; sau khi chấm dứt tài khoản hoặc khi có yêu cầu xóa hợp lệ, dữ liệu được xóa hoặc ẩn danh hóa, trừ dữ liệu phải lưu giữ theo quy định pháp luật.', 'Retained while the account is active; after account termination or a valid deletion request, data is deleted or anonymized, except data that must be kept by law.', 'Dữ liệu tài khoản người dùng', 'User account data'),
        LI('Thông tin liên quan đến hợp đồng, giao dịch điện tử được lưu tối thiểu 03 năm kể từ thời điểm giao kết theo Luật Thương mại điện tử 2025.', 'Information relating to electronic contracts and transactions is kept for at least 3 years from conclusion under the 2025 E-Commerce Law.', 'Thông tin hợp đồng, giao dịch điện tử', 'Electronic contract and transaction information')
      ),
      UL(
        LI('Máy chủ ứng dụng và cơ sở dữ liệu đặt tại Việt Nam; tệp tải lên lưu trên Google Cloud Storage.', 'Application servers and database are located in Vietnam; uploaded files are stored on Google Cloud Storage.', 'Địa điểm lưu trữ', 'Storage location'),
        LI('Việc dữ liệu được lưu trữ, xử lý hoặc đi qua hạ tầng đặt ngoài Việt Nam của Google (Cloud Storage, Gemini API, Analytics) và Cloudflare là hoạt động chuyển dữ liệu cá nhân xuyên biên giới. DIGISO tuân thủ Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP, gồm lập và lưu hồ sơ đánh giá tác động chuyển dữ liệu cá nhân ra nước ngoài khi thuộc trường hợp phải thực hiện.', 'Data being stored, processed or passing through Google’s (Cloud Storage, Gemini API, Analytics) and Cloudflare’s infrastructure outside Vietnam is a cross-border personal data transfer. DIGISO complies with Personal Data Protection Law No. 91/2025/QH15 and Decree 356/2025/NĐ-CP, including preparing and keeping a cross-border transfer impact assessment where required.', 'Chuyển dữ liệu xuyên biên giới', 'Cross-border transfer'),
        LI('Sau khi hết thời hạn lưu trữ hoặc khi nhận được yêu cầu xóa hợp lệ, dữ liệu được xóa hoặc ẩn danh hóa.', 'After the retention period ends or upon a valid deletion request, data is deleted or anonymized.', 'Xóa dữ liệu', 'Data deletion')
      ),
    ],
  },
  {
    num: '9',
    title: { vi: 'Cam kết của DIGISO', en: 'DIGISO’s Commitments' },
    blocks: [
      UL(
        LI('DIGISO cam kết không thu thập dữ liệu cá nhân nhạy cảm liên quan đến tôn giáo, quan điểm chính trị, nguồn gốc sắc tộc hoặc thông tin riêng tư không liên quan đến dịch vụ.', 'DIGISO commits not to collect sensitive personal data related to religion, political views, ethnic origin or private information unrelated to the service.'),
        LI('DIGISO cam kết không bán, không chuyển nhượng dữ liệu cá nhân của người dùng cho bất kỳ bên thứ ba nào vì mục đích thương mại.', 'DIGISO commits not to sell or transfer users’ personal data to any third party for commercial purposes.'),
        LI('DIGISO không sử dụng dữ liệu cá nhân cho các mục đích khác ngoài các mục đích đã thông báo và có sự đồng ý.', 'DIGISO does not use personal data for purposes other than those notified and consented to.'),
        LI('Nếu bạn phát hiện DIGISO xử lý dữ liệu ngoài phạm vi cho phép hoặc có lo ngại về bảo vệ dữ liệu cá nhân, vui lòng liên hệ info@digiso.vn.', 'If you find DIGISO processing data beyond the permitted scope or have concerns about personal data protection, please contact info@digiso.vn.')
      ),
    ],
  },
  {
    num: '10',
    title: { vi: 'Cập nhật chính sách', en: 'Policy Updates' },
    blocks: [
      P(
        'DIGISO thông báo mọi thay đổi quan trọng về Chính sách này ít nhất 15 ngày trước khi có hiệu lực, qua email hoặc thông báo nổi bật trên website. Phiên bản mới nhất luôn được đăng trên trang này và các phiên bản trước được lưu tại mục Lịch sử cập nhật.',
        'DIGISO announces any significant change to this Policy at least 15 days before it takes effect, by email or a prominent website notice. The latest version is always published on this page and previous versions are kept in the Update history section.'
      ),
      P(
        'DIGISO không coi việc bạn tiếp tục truy cập dịch vụ là sự đồng ý đối với thay đổi liên quan đến xử lý dữ liệu cá nhân. Khi thay đổi cần sự đồng ý, DIGISO sẽ yêu cầu bạn xác nhận đồng ý rõ ràng; bạn có quyền không đồng ý, ngừng sử dụng dịch vụ, yêu cầu đóng tài khoản và rút lại sự đồng ý.',
        'DIGISO does not treat your continued access to the service as consent to changes affecting personal data processing. Where a change needs consent, DIGISO will ask you to give explicit confirmation; you may disagree, stop using the service, request account closure and withdraw consent.'
      ),
    ],
  },
];

function Block({ block, language }) {
  const subBar = 'mb-3 mt-[18px] flex items-center gap-2.5 text-sm font-semibold text-slate-800';
  const body = 'mb-[10px] text-slate-600 leading-relaxed';
  const renderItem = (it, i) => {
    const bold = language === 'vi' ? it.bvi : it.ben;
    return (
      <li key={i}>
        {bold ? <strong>{bold}: </strong> : null}
        {it[language]}
      </li>
    );
  };
  if (block.k === 'h') {
    return (
      <h3 className={subBar}>
        <span className="inline-block h-4 w-1 shrink-0 rounded-full bg-orange-500" aria-hidden />
        {block[language]}
      </h3>
    );
  }
  if (block.k === 'p') return <p className={body}>{block[language]}</p>;
  if (block.k === 'n') {
    return (
      <div className="mt-[14px] rounded-lg border border-slate-200/90 border-l-4 border-l-orange-500 bg-slate-50 px-[18px] py-[14px] text-[13.5px] text-slate-800 shadow-sm">
        {block[language]}
      </div>
    );
  }
  if (block.k === 'ol') {
    return <ol className="list-decimal space-y-[7px] pl-5 text-slate-600 leading-relaxed mb-[10px]">{block.items.map(renderItem)}</ol>;
  }
  return <ul className="mb-[10px] list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed">{block.items.map(renderItem)}</ul>;
}

export default function PrivacyPolicyControllerPanel({ language }) {
  return (
    <div className="space-y-6">
      {SECTIONS.map((s) => (
        <section key={s.num} className="pp-section px-5 py-6 sm:px-8 sm:py-8">
          <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
              {s.num}
            </div>
            <h3 className="pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{s.title[language]}</h3>
          </div>
          {s.blocks.map((b, i) => (
            <Block key={i} block={b} language={language} />
          ))}
        </section>
      ))}
    </div>
  );
}
