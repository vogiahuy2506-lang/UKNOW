/**
 * Phần (II) của Chính sách bảo mật — «DIGISO là Bên xử lý dữ liệu».
 *
 * Nội dung theo Mẫu số 01 mục 4 (phần "Chính sách xử lý dữ liệu — Bên xử lý"), viết lại cho khớp
 * hạ tầng và cách vận hành thật của Founder AI. Chỉ nêu nhà cung cấp/biện pháp mà hệ thống thực sự có.
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
        'Phần này quy định về những thông tin mà Công ty TNHH Giải pháp số DIGISO xử lý trên hoặc thông qua website founderai.biz và các ứng dụng, dịch vụ liên quan khi DIGISO đóng vai trò là Bên xử lý dữ liệu cá nhân.',
        'This part governs information that DIGISO Digital Solutions Co., Ltd. processes on or through the founderai.biz website and related applications and services when DIGISO acts as a personal data processor.'
      ),
      P(
        'Phần này áp dụng khi bạn là khách hàng của khách hàng DIGISO (ví dụ: người để lại thông tin trên trang đích, biểu mẫu, khung chat hoặc kênh nhắn tin của một doanh nghiệp đang dùng Founder AI), hoặc là người dùng được khách hàng của DIGISO cấp quyền sử dụng dịch vụ. Trong các trường hợp này, khách hàng của DIGISO là Bên kiểm soát dữ liệu, còn DIGISO chỉ xử lý dữ liệu theo ủy thác của họ.',
        'This part applies when you are a customer of a DIGISO customer (for example, a person who leaves information on a landing page, form, chat widget or messaging channel of a business using Founder AI), or a user granted access by a DIGISO customer. In these cases the DIGISO customer is the Data Controller and DIGISO only processes data on their behalf.'
      ),
      P(
        'Thông tin do DIGISO trực tiếp thu thập từ bạn khi bạn đăng ký và sử dụng tài khoản Founder AI được nêu tại Phần (I) và Phần (III) của Chính sách bảo mật này.',
        'Information that DIGISO collects directly from you when you register and use a Founder AI account is described in Part (I) and Part (III) of this Privacy Policy.'
      ),
    ],
  },
  {
    num: '1',
    title: { vi: 'Định nghĩa', en: 'Definitions' },
    blocks: [
      UL(
        LI('Công ty TNHH Giải pháp số DIGISO, đơn vị chủ quản nền tảng Founder AI (founderai.biz).', 'DIGISO Digital Solutions Co., Ltd., the operator of the Founder AI platform (founderai.biz).', 'DIGISO / chúng tôi', 'DIGISO / we'),
        LI('Tổ chức hoặc cá nhân ký hợp đồng hoặc đăng ký sử dụng dịch vụ với DIGISO, đóng vai trò là Bên kiểm soát dữ liệu cá nhân đối với dữ liệu do mình đưa vào nền tảng.', 'Organization or individual that contracts or registers with DIGISO and acts as the Data Controller for the data it puts on the platform.', 'Khách hàng', 'Customer'),
        LI('Cá nhân truy cập, sử dụng dịch vụ của DIGISO dưới sự quản lý của Khách hàng (ví dụ: nhân viên được Khách hàng cấp tài khoản).', 'Individual who accesses DIGISO services under a Customer’s management (for example, an employee given an account by the Customer).', 'Người dùng', 'User'),
        LI('Cá nhân được dữ liệu cá nhân phản ánh, là đối tượng của hoạt động xử lý dữ liệu.', 'Individual to whom personal data relates, being the subject of data processing activities.', 'Chủ thể dữ liệu', 'Data Subject'),
        LI('Điều khoản sử dụng dịch vụ, Thỏa thuận xử lý dữ liệu cá nhân và các thỏa thuận khác giữa DIGISO và Khách hàng, quy định phạm vi và trách nhiệm của mỗi bên.', 'The Terms of Service, the Personal Data Processing Agreement and other agreements between DIGISO and the Customer, defining each party’s scope and responsibilities.', 'Hợp đồng', 'Agreement'),
        LI('Nền tảng Founder AI tại founderai.biz (tự động hóa marketing, chatbot AI, trang đích, quản lý khách hàng, khóa học), ứng dụng web và các dịch vụ liên quan.', 'The Founder AI platform at founderai.biz (marketing automation, AI chatbots, landing pages, customer management, courses), web applications and related services.', 'Dịch vụ', 'Services'),
        LI('Dữ liệu số hoặc thông tin dưới dạng khác xác định hoặc giúp xác định một con người cụ thể, gồm dữ liệu cá nhân cơ bản và dữ liệu cá nhân nhạy cảm, theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15.', 'Digital data or information in other forms that identifies or helps identify a specific individual, including basic and sensitive personal data, under Personal Data Protection Law No. 91/2025/QH15.', 'Dữ liệu cá nhân', 'Personal Data'),
        LI('Hoạt động tác động tới dữ liệu cá nhân: thu thập, phân tích, tổng hợp, mã hóa, giải mã, chỉnh sửa, xóa, hủy, khử nhận dạng, cung cấp, công khai, chuyển giao và hoạt động khác.', 'Any activity affecting personal data: collection, analysis, aggregation, encryption, decryption, editing, deletion, destruction, de-identification, provision, disclosure, transfer and others.', 'Xử lý dữ liệu cá nhân', 'Personal Data Processing'),
        LI('Tổ chức, cá nhân quyết định mục đích và phương tiện xử lý dữ liệu cá nhân.', 'Organization or individual that determines the purposes and means of processing personal data.', 'Bên kiểm soát dữ liệu', 'Data Controller'),
        LI('Tổ chức, cá nhân thực hiện việc xử lý dữ liệu cá nhân thay mặt Bên kiểm soát dữ liệu theo hợp đồng hoặc thỏa thuận.', 'Organization or individual that processes personal data on behalf of the Data Controller under a contract or agreement.', 'Bên xử lý dữ liệu', 'Data Processor'),
        LI('Tổ chức, cá nhân vừa quyết định mục đích, phương tiện, vừa trực tiếp xử lý dữ liệu cá nhân. DIGISO ở vai trò này đối với dữ liệu tài khoản của chính bạn (Phần III).', 'Organization or individual that both determines the purposes and means and directly processes personal data. DIGISO acts in this role for your own account data (Part III).', 'Bên kiểm soát và xử lý dữ liệu', 'Data Controller and Processor'),
        LI('Tổ chức, cá nhân ngoài chủ thể dữ liệu, Bên kiểm soát, Bên xử lý tham gia vào việc xử lý dữ liệu cá nhân theo quy định pháp luật.', 'Organization or individual other than the data subject, Controller and Processor that takes part in processing personal data under the law.', 'Bên thứ ba', 'Third Party')
      ),
    ],
  },
  {
    num: '2',
    title: { vi: 'Dữ liệu cá nhân DIGISO xử lý', en: 'Personal Data We Process' },
    blocks: [
      P(
        'Với tư cách Bên xử lý, DIGISO không chủ động thu thập dữ liệu cá nhân của khách hàng của Khách hàng mà xử lý dữ liệu theo ủy thác của Bên kiểm soát thông qua Hợp đồng, chỉ trong phạm vi và mục đích được Khách hàng ủy quyền.',
        'As Processor, DIGISO does not independently collect personal data of a Customer’s own customers but processes it on behalf of the Controller under the Agreement, only within the scope and purposes authorized by the Customer.'
      ),
      H('2.1 – Dữ liệu do Khách hàng cung cấp', '2.1 – Data Provided by the Customer'),
      P(
        'Tùy cách Khách hàng sử dụng dịch vụ, Khách hàng có thể đưa vào nền tảng các loại dữ liệu cá nhân sau của Người dùng và của khách hàng của mình:',
        'Depending on how the Customer uses the service, the Customer may put the following types of personal data of Users and of its own customers on the platform:'
      ),
      UL(
        LI('Họ tên, ngày sinh, giới tính, quốc tịch, dân tộc, tôn giáo (nếu Khách hàng tự đưa vào).', 'Full name, date of birth, gender, nationality, ethnicity, religion (if entered by the Customer).', 'Thông tin nhân thân', 'Personal information'),
        LI('Số điện thoại, địa chỉ email, địa chỉ liên hệ, thường trú, tạm trú.', 'Phone number, email address, contact, permanent and temporary address.', 'Thông tin liên lạc', 'Contact information'),
        LI('Hình ảnh, số CMND/CCCD, số định danh cá nhân, hộ chiếu, giấy phép lái xe, mã số thuế, số BHXH (nếu Khách hàng tự đưa vào).', 'Photo, ID/citizen ID number, personal identification number, passport, driver’s license, tax code, social insurance number (if entered by the Customer).', 'Giấy tờ tùy thân', 'Identity documents'),
        LI('Thông tin tài khoản ngân hàng, lịch sử hoạt động trực tuyến, địa chỉ IP, cookie (nếu Khách hàng thu thập).', 'Bank account information, online activity history, IP address, cookies (if collected by the Customer).', 'Thông tin tài khoản', 'Account information'),
        LI('Tình trạng hôn nhân, thông tin người thân (nếu cần thiết cho mục đích của Khách hàng).', 'Marital status, relatives’ information (if necessary for the Customer’s purposes).', 'Thông tin gia đình', 'Family information'),
        LI('Tiến độ khóa học, kết quả kiểm tra, bài tập, chứng chỉ hoàn thành, lịch sử học tập.', 'Course progress, assessment results, assignments, completion certificates, learning history.', 'Dữ liệu học tập', 'Learning data'),
        LI('Thông tin đăng ký sự kiện, phản hồi chiến dịch, lịch sử tương tác qua email, Zalo và các kênh nhắn tin do Khách hàng kết nối.', 'Event registrations, campaign responses, interaction history through email, Zalo and the messaging channels the Customer connects.', 'Dữ liệu chiến dịch marketing', 'Marketing campaign data'),
        LI('Thông tin khách hàng tiềm năng (lead) từ trang đích và biểu mẫu do Khách hàng tạo; nội dung hội thoại giữa khách hàng của Khách hàng với chatbot hoặc nhân viên trong hộp thư hợp nhất.', 'Prospect (lead) information from landing pages and forms created by the Customer; conversation content between the Customer’s customers and chatbots or staff in the unified inbox.', 'Lead và hội thoại', 'Leads and conversations')
      ),
      N(
        'Khách hàng chịu trách nhiệm về tính hợp pháp của việc thu thập và cung cấp các dữ liệu này cho nền tảng, gồm việc thông báo cho chủ thể dữ liệu và có cơ sở pháp lý (như sự đồng ý) phù hợp.',
        'The Customer is responsible for the lawfulness of collecting and providing this data to the platform, including notifying data subjects and having an appropriate legal basis (such as consent).'
      ),
      H('2.2 – Dữ liệu tự động thu thập', '2.2 – Automatically Collected Data'),
      P(
        'Khi Người dùng sử dụng Dịch vụ, hệ thống tự động ghi nhận một số thông tin kỹ thuật:',
        'When Users use the Services, the system automatically records certain technical information:'
      ),
      UL(
        LI('Địa chỉ IP của thiết bị khi kết nối với máy chủ.', 'IP address of the device when connecting to the servers.', 'Địa chỉ IP', 'IP address'),
        LI('Loại thiết bị, hệ điều hành, loại trình duyệt và phiên bản.', 'Device type, operating system, browser type and version.', 'Thông tin thiết bị', 'Device information'),
        LI('Trang đã truy cập, thời gian truy cập, nguồn dẫn đến, tham số chiến dịch.', 'Pages visited, time of access, referral source, campaign parameters.', 'Hành vi truy cập', 'Access behavior'),
        LI('Mã định danh phiên đăng nhập và tùy chọn ngôn ngữ lưu tại trình duyệt.', 'Login session identifiers and language preferences stored in the browser.', 'Cookie và bộ nhớ trình duyệt', 'Cookies and browser storage')
      ),
      H('2.3 – Dữ liệu từ dịch vụ tích hợp', '2.3 – Data from Integrated Services'),
      UL(
        LI('Khi đăng nhập bằng Google, DIGISO nhận họ tên, địa chỉ email đã xác minh và ảnh đại diện của tài khoản theo phạm vi quyền được chấp thuận.', 'When signing in with Google, DIGISO receives the account’s full name, verified email address and profile photo within the permission scope granted.', 'Đăng nhập Google', 'Google sign-in'),
        LI('Khi Khách hàng kết nối các kênh như Zalo, Telegram, WhatsApp, nội dung tin nhắn và thông tin liên hệ của người nhắn đi qua nền tảng để Khách hàng gửi, nhận và quản lý hội thoại.', 'When the Customer connects channels such as Zalo, Telegram or WhatsApp, message content and contact details of the senders pass through the platform so that the Customer can send, receive and manage conversations.', 'Kênh nhắn tin do Khách hàng kết nối', 'Messaging channels connected by the Customer')
      ),
    ],
  },
  {
    num: '3',
    title: { vi: 'Mục đích xử lý dữ liệu', en: 'Purpose of Data Processing' },
    blocks: [
      P(
        'DIGISO xử lý dữ liệu cá nhân cho các mục đích sau, theo đúng phạm vi được ủy quyền từ Khách hàng:',
        'DIGISO processes personal data for the following purposes, within the scope authorized by the Customer:'
      ),
      UL(
        LI('Duy trì và cung cấp các tính năng của founderai.biz; bảo đảm hệ thống hoạt động ổn định, an toàn.', 'Maintain and deliver the features of founderai.biz; keep the system stable and secure.', 'Vận hành dịch vụ', 'Service operation'),
        LI('Phân tích việc sử dụng ở mức tổng hợp để nâng cao trải nghiệm và phát triển tính năng.', 'Analyze usage in aggregate to improve the experience and develop features.', 'Cải thiện sản phẩm', 'Product improvement'),
        LI('Gửi thông báo dịch vụ, phản hồi yêu cầu hỗ trợ, xử lý khiếu nại.', 'Send service notices, respond to support requests, handle complaints.', 'Giao tiếp và hỗ trợ', 'Communication and support'),
        LI('Gửi email, Zalo và tin nhắn chiến dịch theo lệnh của Khách hàng tới người đã đồng ý nhận; đo lường hiệu quả chiến dịch.', 'Send email, Zalo and campaign messages on the Customer’s instruction to recipients who have consented; measure campaign performance.', 'Marketing', 'Marketing'),
        LI('Quản lý tiến độ học tập, cấp chứng chỉ điện tử, thống kê kết quả học tập.', 'Manage learning progress, issue digital certificates, report learning results.', 'Đào tạo', 'Training'),
        LI('Sử dụng Google Analytics để đo lưu lượng truy cập trước đăng ký; Google Analytics vận hành độc lập và có chính sách riêng.', 'Use Google Analytics to measure pre-registration traffic; Google Analytics operates independently and has its own policy.', 'Phân tích thống kê', 'Analytics'),
        LI('Phát hiện và ngăn chặn gian lận, lạm dụng hệ thống, tấn công mạng; tuân thủ yêu cầu pháp luật.', 'Detect and prevent fraud, system abuse and cyber attacks; comply with legal requirements.', 'Bảo mật và giám sát', 'Security and monitoring')
      ),
    ],
  },
  {
    num: '4',
    title: { vi: 'Tiết lộ dữ liệu cho bên thứ ba', en: 'Disclosure to Third Parties' },
    blocks: [
      P(
        'DIGISO không tiết lộ dữ liệu cá nhân mà không có chấp thuận của Khách hàng, trừ các trường hợp dưới đây:',
        'DIGISO does not disclose personal data without the Customer’s consent, except in the cases below:'
      ),
      UL(
        LI('DIGISO sử dụng các nhà cung cấp sau để vận hành dịch vụ; họ chỉ tiếp cận dữ liệu trong phạm vi tối thiểu cần thiết:', 'DIGISO uses the following providers to operate the service; they access data only to the minimum extent necessary:', 'Nhà cung cấp dịch vụ', 'Service providers'),
      ),
      UL(
        LI('Máy chủ ứng dụng, cơ sở dữ liệu và bộ nhớ đệm đặt tại Việt Nam, do Công ty cổ phần giải pháp mạng Bạch Kim cung cấp hosting.', 'Application servers, database and cache located in Vietnam, hosted by Bach Kim Network Solutions Joint Stock Company.', 'Hạ tầng máy chủ', 'Server infrastructure'),
        LI('Tệp tải lên (hình ảnh, tài liệu, tệp đính kèm hội thoại) được lưu trên Google Cloud Storage.', 'Uploaded files (images, documents, conversation attachments) are stored on Google Cloud Storage.', 'Lưu trữ tệp', 'File storage'),
        LI('Khi Khách hàng sử dụng tính năng AI (chatbot, trợ lý, tạo nội dung), nội dung cần xử lý được gửi tới Google Gemini API để tạo phản hồi.', 'When the Customer uses AI features (chatbots, assistant, content generation), the content to be processed is sent to the Google Gemini API to generate a response.', 'Xử lý AI', 'AI processing'),
        LI('Lưu lượng truy cập founderai.biz và tên miền tùy chỉnh đi qua Cloudflare (mạng phân phối nội dung, bảo mật, chứng chỉ SSL).', 'Traffic to founderai.biz and custom domains passes through Cloudflare (content delivery network, security, SSL certificates).', 'Mạng, CDN và SSL', 'Network, CDN and SSL'),
        LI('Email được gửi qua máy chủ SMTP hạ tầng của DIGISO hoặc SMTP riêng do Khách hàng cấu hình; nhà cung cấp SMTP chỉ nhận địa chỉ người nhận và nội dung cần gửi.', 'Email is sent through DIGISO’s SMTP infrastructure or the Customer’s own SMTP; the SMTP provider only receives the recipient address and the content to be delivered.', 'Gửi email', 'Email delivery'),
        LI('PayOS (thanh toán QR) và Mắt Bão e-Invoice (hóa đơn điện tử) — chỉ liên quan dữ liệu thanh toán, xuất hóa đơn của chủ tài khoản.', 'PayOS (QR payments) and Mat Bao e-Invoice (electronic invoices) — only for the account owner’s payment and invoicing data.', 'Thanh toán và hóa đơn', 'Payment and invoicing'),
        LI('Zalo, Telegram, WhatsApp (khi Khách hàng chủ động kết nối): dữ liệu tin nhắn đi qua nền tảng của chính kênh đó theo điều khoản của kênh.', 'Zalo, Telegram, WhatsApp (when connected by the Customer): message data passes through that channel’s own platform under its terms.', 'Kênh nhắn tin', 'Messaging channels')
      ),
      UL(
        LI('Quản trị viên trong tổ chức của Khách hàng có thể truy cập dữ liệu theo phân quyền do Khách hàng thiết lập. DIGISO không chịu trách nhiệm về quyết định phân quyền của Khách hàng.', 'Administrators in the Customer’s organization may access data according to permissions the Customer sets. DIGISO is not responsible for the Customer’s permission decisions.', 'Người dùng nội bộ cùng hệ thống', 'Internal users of the same account'),
        LI('Khi có yêu cầu bằng văn bản của cơ quan nhà nước có thẩm quyền theo quy định của pháp luật Việt Nam.', 'Upon a written request from a competent state authority under Vietnamese law.', 'Cơ quan nhà nước có thẩm quyền', 'State authorities'),
        LI('Trong trường hợp mua bán, sáp nhập, chuyển nhượng tài sản, bên nhận dữ liệu phải cam kết bảo mật và sử dụng dữ liệu tương đương Chính sách này.', 'In a sale, merger or asset transfer, the receiving party must commit to equivalent confidentiality and data use under this Policy.', 'Tổ chức lại doanh nghiệp', 'Business restructuring')
      ),
    ],
  },
  {
    num: '5',
    title: { vi: 'Quyền và nghĩa vụ của chủ thể dữ liệu', en: 'Rights and Obligations of Data Subjects' },
    blocks: [
      H('5.1 – Quyền của chủ thể dữ liệu', '5.1 – Rights of Data Subjects'),
      P(
        'Theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15, chủ thể dữ liệu có các quyền sau:',
        'Under Personal Data Protection Law No. 91/2025/QH15, data subjects have the following rights:'
      ),
      UL(
        LI('Được biết về hoạt động xử lý dữ liệu cá nhân của mình.', 'Be informed about the processing of your personal data.', 'Quyền được biết', 'Right to know'),
        LI('Đồng ý hoặc không đồng ý cho phép xử lý dữ liệu cá nhân.', 'Consent or refuse consent to personal data processing.', 'Quyền đồng ý hoặc không đồng ý', 'Right to consent or refuse'),
        LI('Xem, tiếp cận dữ liệu cá nhân của mình.', 'View and access your personal data.', 'Quyền truy cập', 'Right to access'),
        LI('Rút lại sự đồng ý bất kỳ lúc nào.', 'Withdraw consent at any time.', 'Quyền rút lại sự đồng ý', 'Right to withdraw consent'),
        LI('Yêu cầu xóa dữ liệu cá nhân trong các trường hợp pháp luật cho phép.', 'Request deletion of personal data in cases permitted by law.', 'Quyền xóa dữ liệu', 'Right to erasure'),
        LI('Yêu cầu tạm ngừng một phần hoặc toàn bộ việc xử lý dữ liệu.', 'Request suspension of part or all of the processing.', 'Quyền hạn chế xử lý', 'Right to restriction'),
        LI('Phản đối việc xử lý dữ liệu cho mục đích quảng cáo, tiếp thị.', 'Object to processing for advertising and marketing purposes.', 'Quyền phản đối', 'Right to object'),
        LI('Yêu cầu cung cấp dữ liệu cá nhân của mình.', 'Request that your personal data be provided to you.', 'Quyền yêu cầu cung cấp dữ liệu', 'Right to data provision'),
        LI('Yêu cầu bồi thường thiệt hại do vi phạm quy định bảo vệ dữ liệu cá nhân.', 'Claim compensation for damage caused by violations of personal data protection rules.', 'Quyền bồi thường', 'Right to compensation'),
        LI('Khiếu nại, tố cáo hoặc khởi kiện theo quy định pháp luật.', 'Complain, report or sue in accordance with the law.', 'Quyền khiếu nại, tố cáo, khởi kiện', 'Right to complain, report and sue')
      ),
      H('5.2 – Nghĩa vụ của chủ thể dữ liệu', '5.2 – Obligations of Data Subjects'),
      UL(
        LI('Tự chịu trách nhiệm về tính chính xác của thông tin đã cung cấp cho Bên kiểm soát.', 'Take responsibility for the accuracy of information provided to the Controller.', 'Trách nhiệm về thông tin', 'Information accuracy'),
        LI('Tuân thủ quy định bảo vệ dữ liệu của Bên kiểm soát và pháp luật.', 'Comply with the Controller’s data protection rules and the law.', 'Tuân thủ quy định', 'Compliance'),
        LI('Kịp thời thông báo cho Bên kiểm soát khi phát hiện dấu hiệu vi phạm bảo mật dữ liệu.', 'Promptly notify the Controller upon noticing signs of a data security breach.', 'Thông báo vi phạm', 'Breach reporting'),
        LI('Bảo mật thông tin đăng nhập, không chia sẻ cho người khác.', 'Keep login information secure and do not share it with others.', 'Bảo mật tài khoản', 'Account security')
      ),
      H('5.3 – Cách thực hiện quyền', '5.3 – How to Exercise Your Rights'),
      UL(
        LI('Vui lòng liên hệ trực tiếp Khách hàng (Bên kiểm soát dữ liệu) — đơn vị đã ủy quyền cho DIGISO xử lý dữ liệu của bạn. Yêu cầu gửi tới DIGISO sẽ được chuyển tiếp tới Khách hàng tương ứng để xử lý, và DIGISO hỗ trợ Khách hàng thực hiện yêu cầu.', 'Please contact the Customer (Data Controller) directly — the entity that authorized DIGISO to process your data. Requests sent to DIGISO will be forwarded to the relevant Customer, and DIGISO supports the Customer in fulfilling them.', 'Thực thi quyền', 'Exercising rights'),
        LI('Khi thông điệp tiếp thị được gửi qua nền tảng, nội dung có kèm liên kết hủy nhận tin để bạn rút lại sự đồng ý ngay mà không cần đăng nhập.', 'When marketing messages are sent through the platform, they include an unsubscribe link so you can withdraw consent immediately without logging in.', 'Rút lại đồng ý tiếp thị', 'Withdrawing marketing consent')
      ),
    ],
  },
  {
    num: '6',
    title: { vi: 'Bảo vệ dữ liệu', en: 'Data Security' },
    blocks: [
      P(
        'DIGISO áp dụng các biện pháp kỹ thuật và tổ chức sau để bảo vệ dữ liệu cá nhân:',
        'DIGISO applies the following technical and organizational measures to protect personal data:'
      ),
      UL(
        LI('Toàn bộ truy cập founderai.biz qua HTTPS/TLS.', 'All access to founderai.biz is over HTTPS/TLS.', 'Mã hóa truyền tải', 'Encryption in transit'),
        LI('Mật khẩu tài khoản được băm bằng bcrypt, không lưu bản rõ. Số CCCD của đối tác giới thiệu và thông tin phiên kết nối các kênh nhắn tin được mã hóa AES-256-GCM khi lưu trữ.', 'Account passwords are hashed with bcrypt and never stored in clear text. Referral partners’ citizen ID numbers and the session data of connected messaging channels are encrypted with AES-256-GCM at rest.', 'Mã hóa và băm dữ liệu nhạy cảm', 'Encryption and hashing of sensitive data'),
        LI('Phân quyền theo vai trò (chủ tài khoản, nhân viên) và theo từng nhóm chức năng; dữ liệu của mỗi tài khoản được tách riêng khỏi tài khoản khác.', 'Role-based permissions (account owner, employee) and per feature group; each account’s data is separated from other accounts.', 'Kiểm soát truy cập', 'Access control'),
        LI('Giới hạn số lần đăng nhập sai; nhật ký hoạt động (audit log) đối với các thao tác quản trị.', 'Limits on failed login attempts; activity (audit) logs for administrative actions.', 'Giám sát', 'Monitoring'),
        LI('Nhân sự của DIGISO chỉ được tiếp cận dữ liệu theo phân công công việc và có nghĩa vụ bảo mật.', 'DIGISO personnel access data only as their duties require and are bound by confidentiality obligations.', 'Nguyên tắc cần biết', 'Need-to-know principle')
      ),
      P(
        'Khi phát hiện sự cố bảo mật ảnh hưởng tới dữ liệu cá nhân, DIGISO sẽ thông báo cho Khách hàng và chủ thể dữ liệu, đồng thời báo cáo cơ quan có thẩm quyền trong thời gian sớm nhất theo quy định của pháp luật.',
        'Upon discovering a security incident affecting personal data, DIGISO will notify the Customer and affected data subjects and report to the competent authority as soon as possible as required by law.'
      ),
    ],
  },
  {
    num: '7',
    title: { vi: 'Lưu trữ & Chuyển dữ liệu', en: 'Data Retention & Transfer' },
    blocks: [
      P(
        'Dữ liệu cá nhân chỉ được lưu trữ trong thời gian tài khoản còn hoạt động hoặc thời gian cần thiết theo mục đích thu thập ban đầu và quy định pháp luật. DIGISO không sở hữu dữ liệu của Khách hàng và Người dùng — dữ liệu này thuộc về Khách hàng.',
        'Personal data is retained only while the account is active or as long as needed for the original purpose and the law. DIGISO does not own Customer or User data — it belongs to the Customer.'
      ),
      UL(
        LI('Dữ liệu xử lý theo ủy thác được lưu theo các thời hạn sau:', 'Data processed under delegation is retained for the following periods:', 'Thời gian lưu trữ', 'Retention period'),
      ),
      UL(
        LI('Lưu trong thời gian tài khoản còn hoạt động và tối đa 90 ngày sau khi tài khoản chấm dứt để hỗ trợ trích xuất dữ liệu, sau đó xóa vĩnh viễn.', 'Retained while the account is active and for up to 90 days after termination to support data export, then permanently deleted.', 'Dữ liệu Khách hàng đưa vào', 'Data entered by the Customer'),
        LI('Lưu trong vòng 24 tháng kể từ lần tương tác cuối cùng của chủ thể dữ liệu.', 'Retained for 24 months from the data subject’s last interaction.', 'Khách hàng tiềm năng (lead) từ trang đích', 'Prospect (lead) data from landing pages'),
        LI('Lưu trong vòng 24 tháng phục vụ đối soát, thống kê và báo cáo hiệu quả.', 'Retained for 24 months for reconciliation, statistics and performance reporting.', 'Lịch sử gửi chiến dịch (email, tin nhắn, thông báo)', 'Campaign delivery history (emails, messages, notifications)'),
        LI('Lưu tối thiểu theo thời hạn quy định của pháp luật kế toán và thuế.', 'Retained at least for the period required by accounting and tax law.', 'Dữ liệu giao dịch và chứng từ', 'Transaction and billing records')
      ),
      UL(
        LI('Máy chủ ứng dụng và cơ sở dữ liệu đặt tại Việt Nam; tệp tải lên lưu trên Google Cloud Storage.', 'Application servers and database are located in Vietnam; uploaded files are stored on Google Cloud Storage.', 'Địa điểm lưu trữ', 'Storage location'),
        LI('Một số nhà cung cấp nêu tại Mục 4 (Google Cloud Storage, Google Gemini API, Cloudflare) có hạ tầng đặt ngoài lãnh thổ Việt Nam. Việc dữ liệu được lưu trữ, xử lý hoặc đi qua các hạ tầng đó là hoạt động chuyển dữ liệu cá nhân xuyên biên giới. DIGISO thực hiện các thủ tục theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP, gồm lập và lưu hồ sơ đánh giá tác động chuyển dữ liệu cá nhân ra nước ngoài khi thuộc trường hợp phải thực hiện.', 'Some providers listed in Section 4 (Google Cloud Storage, Google Gemini API, Cloudflare) have infrastructure located outside Vietnam. Data being stored, processed or passing through that infrastructure is a cross-border personal data transfer. DIGISO follows Personal Data Protection Law No. 91/2025/QH15 and Decree 356/2025/NĐ-CP, including preparing and keeping a cross-border transfer impact assessment where required.', 'Chuyển dữ liệu xuyên biên giới', 'Cross-border transfer'),
        LI('Sau khi hết thời hạn lưu trữ hoặc theo yêu cầu hợp lệ của Khách hàng, dữ liệu được xóa hoặc ẩn danh hóa, trừ dữ liệu phải lưu giữ theo quy định pháp luật.', 'After the retention period or upon a valid request from the Customer, data is deleted or anonymized, except data that must be kept under the law.', 'Xóa dữ liệu', 'Data deletion')
      ),
    ],
  },
  {
    num: '8',
    title: { vi: 'Cập nhật chính sách', en: 'Policy Updates' },
    blocks: [
      P(
        'DIGISO cập nhật Chính sách này định kỳ hoặc khi có thay đổi về pháp luật, công nghệ hoặc hoạt động kinh doanh. Thay đổi quan trọng được thông báo qua email hoặc thông báo nổi bật trên website ít nhất 15 ngày trước khi có hiệu lực.',
        'DIGISO updates this Policy periodically or when the law, technology or business operations change. Significant changes are announced by email or a prominent website notice at least 15 days before taking effect.'
      ),
      P(
        'Đối với thay đổi liên quan đến mục đích hoặc phạm vi xử lý dữ liệu cá nhân, DIGISO không coi việc bạn im lặng hoặc chỉ truy cập dịch vụ là sự đồng ý; DIGISO sẽ yêu cầu bạn hoặc Khách hàng xác nhận đồng ý rõ ràng khi pháp luật đòi hỏi. Bạn có quyền không đồng ý, ngừng sử dụng dịch vụ và yêu cầu đóng tài khoản.',
        'For changes affecting the purposes or scope of personal data processing, DIGISO does not treat your silence or mere access to the service as consent; DIGISO will ask you or the Customer to give explicit consent where the law requires. You may disagree, stop using the service and request account closure.'
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

export default function PrivacyPolicyProcessorPanel({ language }) {
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
