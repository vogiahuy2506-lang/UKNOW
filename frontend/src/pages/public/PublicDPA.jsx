import { useState } from 'react';
import PolicyHistory from './components/PolicyHistory.jsx';

function getLangClass(activeLang, itemLang) {
  return activeLang === itemLang ? '' : 'hidden';
}

const P = (vi, en) => ({ k: 'p', vi, en });
const H = (vi, en) => ({ k: 'h', vi, en });
const N = (vi, en) => ({ k: 'n', vi, en });
const UL = (...items) => ({ k: 'ul', items });
const OL = (...items) => ({ k: 'ol', items });
/** Một dòng danh sách: (vi, en, nhãn đậm vi, nhãn đậm en). */
const LI = (vi, en, bvi, ben) => ({ vi, en, bvi, ben });

/**
 * Thỏa thuận xử lý dữ liệu cá nhân giữa DIGISO (Bên xử lý) và Khách hàng (Bên kiểm soát).
 *
 * Khung 15 điều lấy từ mẫu `hanhchinh-privacy-policy.txt` do sếp chỉ định, điều chỉnh cho Founder AI:
 * bỏ phần thư ký cuộc họp/văn bản hành chính, thêm dữ liệu khách hàng/lead/chiến dịch/chatbot,
 * bỏ cơ chế "tiếp tục sử dụng = chấp nhận" đối với dữ liệu cá nhân. Chỉ nêu nhà cung cấp và biện pháp
 * bảo mật mà hệ thống thực sự có (đối chiếu bảng sự thật hạ tầng trong plan PR-L1).
 */
const ARTICLES = [
  {
    num: '1',
    title: { vi: 'Căn cứ, định nghĩa và vai trò của các bên', en: 'Basis, Definitions and Roles of the Parties' },
    blocks: [
      P(
        'Thỏa thuận xử lý dữ liệu cá nhân này (“Thỏa thuận”) được lập giữa Công ty TNHH Giải pháp số DIGISO (“DIGISO”, Bên xử lý dữ liệu) và tổ chức, cá nhân đăng ký hoặc sử dụng nền tảng Founder AI tại founderai.biz (“Khách hàng”, Bên kiểm soát dữ liệu), căn cứ Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15, Nghị định số 356/2025/NĐ-CP và các quy định pháp luật liên quan. Thỏa thuận là một phần của Hợp đồng dịch vụ (gồm Điều khoản sử dụng dịch vụ) giữa hai bên.',
        'This Personal Data Processing Agreement (the “Agreement”) is made between DIGISO Digital Solutions Co., Ltd. (“DIGISO”, the Data Processor) and the organization or individual who registers for or uses the Founder AI platform at founderai.biz (the “Customer”, the Data Controller), under Personal Data Protection Law No. 91/2025/QH15, Decree No. 356/2025/NĐ-CP and related regulations. It forms part of the service contract (including the Terms of Service) between the parties.'
      ),
      UL(
        LI('Tổ chức, cá nhân quyết định mục đích và phương tiện xử lý dữ liệu cá nhân — ở đây là Khách hàng đối với dữ liệu do Khách hàng đưa vào nền tảng.', 'The organization or individual that decides the purposes and means of processing personal data — here, the Customer for data the Customer puts on the platform.', 'Bên kiểm soát dữ liệu', 'Data Controller'),
        LI('Tổ chức, cá nhân xử lý dữ liệu cá nhân thay mặt Bên kiểm soát — ở đây là DIGISO.', 'The organization or individual that processes personal data on behalf of the Controller — here, DIGISO.', 'Bên xử lý dữ liệu', 'Data Processor'),
        LI('Cá nhân được dữ liệu cá nhân phản ánh (ví dụ: khách hàng của Khách hàng, khách hàng tiềm năng, người nhắn tin với chatbot, nhân viên của Khách hàng).', 'The individual to whom the personal data relates (for example: the Customer’s own customers, leads, people chatting with a chatbot, the Customer’s employees).', 'Chủ thể dữ liệu', 'Data Subject'),
        LI('Dữ liệu số hoặc thông tin dưới dạng khác xác định hoặc giúp xác định một con người cụ thể, gồm dữ liệu cá nhân cơ bản và nhạy cảm; “xử lý dữ liệu cá nhân” có nghĩa như trong Luật 91/2025/QH15.', 'Digital data or information in other forms identifying or helping identify a specific individual, including basic and sensitive data; “processing” has the meaning given in Law 91/2025/QH15.', 'Dữ liệu cá nhân', 'Personal Data')
      ),
      P(
        'Đối với dữ liệu tài khoản của chính Khách hàng (đăng ký, thanh toán, hóa đơn), DIGISO là bên kiểm soát và xử lý dữ liệu theo Phần (I) và Phần (III) của Chính sách bảo mật, không thuộc phạm vi ủy thác của Thỏa thuận này.',
        'For the Customer’s own account data (registration, payment, invoicing), DIGISO is a controller and processor under Parts (I) and (III) of the Privacy Policy and that data is outside the scope of delegation under this Agreement.'
      ),
    ],
  },
  {
    num: '2',
    title: { vi: 'Mục đích, phạm vi và thời hạn xử lý', en: 'Purpose, Scope and Duration of Processing' },
    blocks: [
      P(
        'DIGISO chỉ xử lý dữ liệu cá nhân do Khách hàng đưa vào nền tảng để cung cấp các tính năng của Founder AI theo Hợp đồng, gồm:',
        'DIGISO processes personal data put on the platform by the Customer only to provide the Founder AI features under the Agreement, including:'
      ),
      UL(
        LI('Lưu trữ, tổ chức, phân đoạn danh sách khách hàng, lead, dữ liệu mua hàng, hành trình khách hàng.', 'Storing, organizing and segmenting customer lists, leads, purchase data and customer journeys.', 'Quản lý khách hàng', 'Customer management'),
        LI('Gửi email, Zalo và tin nhắn chiến dịch theo cấu hình và lệnh của Khách hàng; ghi nhận kết quả gửi.', 'Sending email, Zalo and campaign messages as configured and instructed by the Customer; recording delivery results.', 'Chiến dịch marketing', 'Marketing campaigns'),
        LI('Tạo, vận hành và hiển thị trang đích, biểu mẫu thu thập thông tin của Khách hàng.', 'Creating, operating and displaying the Customer’s landing pages and data collection forms.', 'Trang đích và biểu mẫu', 'Landing pages and forms'),
        LI('Chatbot, kho tri thức và hộp thư hợp nhất: nhận, lưu và trả lời hội thoại giữa chatbot/nhân viên của Khách hàng với chủ thể dữ liệu qua widget web và các kênh Khách hàng kết nối.', 'Chatbots, knowledge base and unified inbox: receiving, storing and answering conversations between the Customer’s chatbot/staff and data subjects through the web widget and channels the Customer connects.', 'Chatbot và hộp thư', 'Chatbots and inbox'),
        LI('Lưu trữ, hỗ trợ kỹ thuật, bảo mật và các thao tác khác Khách hàng yêu cầu bằng cách sử dụng dịch vụ.', 'Hosting, technical support, security and other operations the Customer requests by using the service.', 'Vận hành', 'Operations')
      ),
      P(
        'Thời hạn xử lý là thời gian Hợp đồng còn hiệu lực, cộng thời gian lưu giữ để trích xuất và xóa dữ liệu tại Điều 12. DIGISO không xử lý dữ liệu này cho mục đích riêng của DIGISO.',
        'Processing lasts while the Agreement is in force, plus the retention period for export and deletion under Article 12. DIGISO does not process this data for its own purposes.'
      ),
    ],
  },
  {
    num: '3',
    title: { vi: 'Loại dữ liệu và chủ thể dữ liệu', en: 'Types of Data and Data Subjects' },
    blocks: [
      P(
        'Tùy cách Khách hàng sử dụng dịch vụ, dữ liệu do Khách hàng đưa vào có thể gồm (Khách hàng tự quyết định và chịu trách nhiệm về loại dữ liệu đưa vào):',
        'Depending on how the Customer uses the service, the data put in by the Customer may include (the Customer decides and is responsible for what it puts in):'
      ),
      UL(
        LI('Họ tên, ngày sinh, giới tính, số điện thoại, email, địa chỉ, tên doanh nghiệp, chức danh.', 'Full name, date of birth, gender, phone number, email, address, company name, job title.', 'Dữ liệu cá nhân cơ bản', 'Basic personal data'),
        LI('Lịch sử mua hàng, đăng ký sự kiện, tương tác email/Zalo/chatbot, phản hồi chiến dịch, nội dung hội thoại, thông tin lead từ biểu mẫu (kèm địa chỉ IP, thời gian gửi).', 'Purchase history, event registrations, email/Zalo/chatbot interactions, campaign responses, conversation content, lead information from forms (with IP address and submission time).', 'Dữ liệu chiến dịch, lead và hội thoại', 'Campaign, lead and conversation data'),
        LI('Số CMND/CCCD, hộ chiếu, tài khoản ngân hàng, thông tin sức khỏe hoặc dữ liệu nhạy cảm khác — chỉ khi Khách hàng tự đưa vào và có cơ sở pháp lý phù hợp.', 'ID/citizen ID numbers, passport, bank accounts, health information or other sensitive data — only if the Customer puts it in and has an appropriate legal basis.', 'Dữ liệu nhạy cảm (nếu có)', 'Sensitive data (if any)')
      ),
      P(
        'Chủ thể dữ liệu gồm: khách hàng và khách hàng tiềm năng của Khách hàng, người tương tác với chatbot hoặc kênh nhắn tin của Khách hàng, học viên của Khách hàng và nhân viên được Khách hàng cấp tài khoản.',
        'Data subjects include: the Customer’s customers and leads, people interacting with the Customer’s chatbot or messaging channels, the Customer’s learners and employees given accounts by the Customer.'
      ),
    ],
  },
  {
    num: '4',
    title: { vi: 'Quyền và nghĩa vụ của Khách hàng (Bên kiểm soát)', en: 'Rights and Obligations of the Customer (Controller)' },
    blocks: [
      UL(
        LI('Bảo đảm có cơ sở pháp lý cho mọi dữ liệu đưa vào nền tảng (đặc biệt là sự đồng ý rõ ràng, tự nguyện của chủ thể dữ liệu) và thông báo cho chủ thể dữ liệu về việc xử lý, gồm việc DIGISO là Bên xử lý.', 'Ensure a legal basis for all data put on the platform (in particular the data subject’s explicit and voluntary consent) and inform data subjects of the processing, including that DIGISO acts as Processor.'),
        LI('Chỉ gửi tin nhắn tiếp thị tới người đã đồng ý nhận và tôn trọng yêu cầu rút lại đồng ý, hủy nhận tin của chủ thể dữ liệu.', 'Send marketing messages only to people who have consented and honor data subjects’ requests to withdraw consent or unsubscribe.'),
        LI('Không xử lý dữ liệu của trẻ em nếu chưa có sự đồng ý của người đại diện theo pháp luật theo quy định; không đưa vào nền tảng dữ liệu nhạy cảm không cần thiết.', 'Not process children’s data without the legal representative’s consent as required by law; not put unnecessary sensitive data on the platform.'),
        LI('Đưa ra hướng dẫn xử lý hợp pháp thông qua việc cấu hình và sử dụng tính năng; chịu trách nhiệm về quyết định phân quyền cho nhân viên của mình.', 'Give lawful processing instructions through configuring and using the features; be responsible for the permissions it grants to its own staff.'),
        LI('Tiếp nhận và giải quyết yêu cầu của chủ thể dữ liệu (Điều 10); thực hiện nghĩa vụ báo cáo, đánh giá tác động theo quy định đối với hoạt động xử lý của mình.', 'Receive and resolve data subjects’ requests (Article 10); perform reporting and impact assessment duties required for its own processing.'),
        LI('Bảo mật thông tin đăng nhập tài khoản và thông báo ngay cho DIGISO khi phát hiện truy cập trái phép.', 'Keep account credentials secure and notify DIGISO immediately upon discovering unauthorized access.')
      ),
    ],
  },
  {
    num: '5',
    title: { vi: 'Quyền và nghĩa vụ của DIGISO (Bên xử lý)', en: 'Rights and Obligations of DIGISO (Processor)' },
    blocks: [
      UL(
        LI('Chỉ xử lý dữ liệu theo Hợp đồng và hướng dẫn hợp pháp của Khách hàng, trong phạm vi Điều 2; không bán, cho thuê hoặc dùng dữ liệu cho mục đích khác.', 'Process data only under the Agreement and the Customer’s lawful instructions, within Article 2; not sell, rent or use the data for other purposes.'),
        LI('Bảo đảm nhân sự được tiếp cận dữ liệu chỉ theo phân công công việc và có nghĩa vụ bảo mật.', 'Ensure personnel access data only as assigned and are bound by confidentiality.'),
        LI('Áp dụng biện pháp bảo mật tại Điều 9; chỉ thuê bên xử lý phụ theo Điều 7.', 'Apply the security measures in Article 9; engage sub-processors only under Article 7.'),
        LI('Thông báo cho Khách hàng nếu cho rằng một hướng dẫn trái quy định pháp luật; hỗ trợ Khách hàng thực hiện quyền của chủ thể dữ liệu (Điều 10) và xử lý sự cố (Điều 11).', 'Tell the Customer if it believes an instruction violates the law; help the Customer fulfil data subjects’ rights (Article 10) and handle incidents (Article 11).'),
        LI('Cung cấp thông tin hợp lý để Khách hàng chứng minh việc tuân thủ và phối hợp với cơ quan nhà nước có thẩm quyền theo yêu cầu bằng văn bản.', 'Provide reasonable information for the Customer to demonstrate compliance and cooperate with competent state authorities upon written request.'),
        LI('Được thu phí dịch vụ theo Chính sách về giá; không chịu trách nhiệm về tính hợp pháp của dữ liệu và hướng dẫn do Khách hàng đưa ra.', 'Entitled to charge fees under the Pricing Policy; not responsible for the lawfulness of the data and instructions provided by the Customer.')
      ),
    ],
  },
  {
    num: '6',
    title: { vi: 'Xử lý bằng AI và kênh nhắn tin tích hợp', en: 'AI Processing and Integrated Messaging Channels' },
    blocks: [
      UL(
        LI('Khi Khách hàng dùng chatbot, trợ lý hoặc tính năng tạo nội dung bằng AI, nội dung cần xử lý (câu hỏi, đoạn trích từ kho tri thức, thông tin ngữ cảnh) được gửi tới Google Gemini API để tạo phản hồi và được trả về nền tảng.', 'When the Customer uses a chatbot, assistant or AI content feature, the content to be processed (questions, excerpts from the knowledge base, context information) is sent to the Google Gemini API to generate a response, which is returned to the platform.', 'Google Gemini', 'Google Gemini'),
        LI('Kho tri thức của chatbot thuộc tài khoản của Khách hàng và được tách riêng khỏi tài khoản khác. Khách hàng chịu trách nhiệm về nội dung đưa vào kho tri thức.', 'A chatbot’s knowledge base belongs to the Customer’s account and is separated from other accounts. The Customer is responsible for the content it adds to the knowledge base.', 'Kho tri thức', 'Knowledge base'),
        LI('Khi Khách hàng kết nối Zalo, Telegram, WhatsApp hoặc kênh khác, tin nhắn đi qua nền tảng của chính kênh đó theo điều khoản của kênh; Khách hàng chịu trách nhiệm tuân thủ điều khoản và giới hạn gửi của kênh.', 'When the Customer connects Zalo, Telegram, WhatsApp or another channel, messages pass through that channel’s own platform under its terms; the Customer is responsible for complying with the channel’s terms and sending limits.', 'Kênh nhắn tin', 'Messaging channels'),
        LI('Kết quả do AI tạo ra có thể không chính xác; Khách hàng chịu trách nhiệm rà soát trước khi sử dụng vào quyết định ảnh hưởng đến chủ thể dữ liệu.', 'AI-generated output may be inaccurate; the Customer is responsible for reviewing it before using it in decisions affecting data subjects.', 'Tính chính xác', 'Accuracy')
      ),
    ],
  },
  {
    num: '7',
    title: { vi: 'Bên xử lý phụ', en: 'Sub-processors' },
    blocks: [
      P(
        'Khách hàng đồng ý để DIGISO sử dụng các bên xử lý phụ sau, chỉ trong phạm vi tối thiểu cần thiết để cung cấp dịch vụ:',
        'The Customer agrees that DIGISO may use the following sub-processors, only to the minimum extent necessary to provide the service:'
      ),
      UL(
        LI('Hosting máy chủ ứng dụng, cơ sở dữ liệu tại Việt Nam.', 'Hosting of application servers and database in Vietnam.', 'Công ty Cổ phần AZDIGI', 'AZDIGI Joint Stock Company'),
        LI('Lưu trữ tệp tải lên (Google Cloud Storage); xử lý AI (Gemini API).', 'Storage of uploaded files (Google Cloud Storage); AI processing (Gemini API).', 'Google', 'Google'),
        LI('Mạng phân phối nội dung, bảo mật, chứng chỉ SSL cho founderai.biz và tên miền tùy chỉnh.', 'Content delivery network, security and SSL certificates for founderai.biz and custom domains.', 'Cloudflare', 'Cloudflare'),
        LI('Máy chủ SMTP hạ tầng của DIGISO hoặc SMTP riêng do Khách hàng cấu hình, dùng để gửi email chiến dịch và thông báo.', 'DIGISO’s SMTP infrastructure or the Customer’s own SMTP configuration, used to send campaign and notification email.', 'Gửi email', 'Email delivery'),
        LI('Cổng thanh toán và hóa đơn điện tử, chỉ liên quan dữ liệu thanh toán của Khách hàng.', 'Payment gateway and electronic invoicing, relating only to the Customer’s payment data.', 'PayOS và Mắt Bão e-Invoice', 'PayOS and Mat Bao e-Invoice')
      ),
      P(
        'DIGISO ràng buộc bên xử lý phụ bằng nghĩa vụ bảo mật và bảo vệ dữ liệu phù hợp. Khi thêm hoặc thay đổi bên xử lý phụ, DIGISO cập nhật danh sách này và thông báo cho Khách hàng ít nhất 15 ngày trước khi áp dụng; Khách hàng có quyền phản đối bằng văn bản, và nếu không thể thống nhất, Khách hàng có quyền chấm dứt sử dụng dịch vụ theo Điều 14.',
        'DIGISO binds sub-processors with suitable confidentiality and data protection obligations. When adding or changing a sub-processor, DIGISO updates this list and notifies the Customer at least 15 days before it applies; the Customer may object in writing and, if no agreement is reached, may stop using the service under Article 14.'
      ),
    ],
  },
  {
    num: '8',
    title: { vi: 'Chuyển dữ liệu cá nhân xuyên biên giới', en: 'Cross-Border Transfer of Personal Data' },
    blocks: [
      P(
        'Google Cloud Storage, Google Gemini API và Cloudflare có hạ tầng đặt ngoài lãnh thổ Việt Nam. Việc dữ liệu được lưu trữ, xử lý hoặc đi qua hạ tầng đó là hoạt động chuyển dữ liệu cá nhân xuyên biên giới. DIGISO thực hiện các thủ tục theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP, gồm lập và lưu hồ sơ đánh giá tác động chuyển dữ liệu cá nhân ra nước ngoài khi thuộc trường hợp phải thực hiện.',
        'Google Cloud Storage, the Google Gemini API and Cloudflare have infrastructure outside Vietnam. Data being stored, processed or passing through that infrastructure is a cross-border personal data transfer. DIGISO follows Personal Data Protection Law No. 91/2025/QH15 and Decree 356/2025/NĐ-CP, including preparing and keeping a cross-border transfer impact assessment where required.'
      ),
      P(
        'Khách hàng, với tư cách Bên kiểm soát, tự chịu trách nhiệm về nghĩa vụ của mình đối với hoạt động chuyển dữ liệu do Khách hàng quyết định (ví dụ: kết nối kênh nhắn tin của nước ngoài), và DIGISO cung cấp thông tin cần thiết để Khách hàng thực hiện nghĩa vụ đó.',
        'The Customer, as Controller, is responsible for its own obligations for transfers it decides (for example, connecting a foreign messaging channel), and DIGISO provides the information the Customer needs to perform them.'
      ),
    ],
  },
  {
    num: '9',
    title: { vi: 'Biện pháp bảo mật', en: 'Security Measures' },
    blocks: [
      UL(
        LI('Truy cập founderai.biz qua HTTPS/TLS.', 'Access to founderai.biz over HTTPS/TLS.', 'Mã hóa truyền tải', 'Encryption in transit'),
        LI('Mật khẩu băm bcrypt, không lưu bản rõ; thông tin phiên kết nối các kênh nhắn tin do Khách hàng liên kết được mã hóa AES-256-GCM khi lưu trữ.', 'Passwords hashed with bcrypt, never stored in clear text; session data of messaging channels linked by the Customer is encrypted with AES-256-GCM at rest.', 'Mã hóa và băm', 'Encryption and hashing'),
        LI('Phân quyền theo vai trò (chủ tài khoản, nhân viên) và theo nhóm chức năng; dữ liệu của mỗi tài khoản Khách hàng được tách riêng.', 'Role-based permissions (account owner, employee) and per feature group; each Customer account’s data is separated.', 'Kiểm soát truy cập', 'Access control'),
        LI('Giới hạn đăng nhập sai; nhật ký hoạt động (audit log) đối với các thao tác quản trị.', 'Failed-login limits; activity (audit) logs for administrative operations.', 'Giám sát', 'Monitoring'),
        LI('Nhân sự DIGISO chỉ tiếp cận dữ liệu theo phân công và có nghĩa vụ bảo mật.', 'DIGISO personnel access data only as assigned and are bound by confidentiality.', 'Nguyên tắc cần biết', 'Need-to-know')
      ),
      P(
        'DIGISO rà soát và cải thiện các biện pháp này phù hợp với rủi ro và quy định pháp luật.',
        'DIGISO reviews and improves these measures in line with risk and legal requirements.'
      ),
    ],
  },
  {
    num: '10',
    title: { vi: 'Hỗ trợ thực hiện quyền của chủ thể dữ liệu', en: 'Assistance with Data Subjects’ Rights' },
    blocks: [
      P(
        'Chủ thể dữ liệu có các quyền theo Luật 91/2025/QH15: được biết, đồng ý hoặc không đồng ý, truy cập, chỉnh sửa, rút lại đồng ý, xóa dữ liệu, hạn chế xử lý, phản đối, yêu cầu cung cấp dữ liệu, bồi thường, khiếu nại, tố cáo, khởi kiện.',
        'Data subjects have rights under Law 91/2025/QH15: to be informed, consent or refuse, access, correct, withdraw consent, erasure, restriction, object, data provision, compensation, complaint, denunciation and lawsuit.'
      ),
      UL(
        LI('Yêu cầu của chủ thể dữ liệu gửi tới DIGISO sẽ được chuyển tiếp cho Khách hàng tương ứng; Khách hàng là đầu mối trả lời chủ thể dữ liệu.', 'Requests sent by data subjects to DIGISO are forwarded to the relevant Customer; the Customer is the point of contact for answering data subjects.'),
        LI('DIGISO hỗ trợ Khách hàng xem, xuất, chỉnh sửa, xóa hoặc hạn chế xử lý dữ liệu thông qua tính năng của nền tảng hoặc theo yêu cầu bằng văn bản gửi tới info@digiso.vn, trong thời hạn hợp lý để Khách hàng đáp ứng thời hạn luật định.', 'DIGISO helps the Customer view, export, edit, delete or restrict data through platform features or upon a written request to info@digiso.vn, within a reasonable time so the Customer can meet statutory deadlines.'),
        LI('Thông điệp tiếp thị gửi qua nền tảng kèm liên kết hủy nhận tin để chủ thể dữ liệu rút lại đồng ý ngay mà không cần đăng nhập.', 'Marketing messages sent through the platform carry an unsubscribe link so data subjects can withdraw consent immediately without logging in.')
      ),
    ],
  },
  {
    num: '11',
    title: { vi: 'Sự cố an toàn dữ liệu', en: 'Data Security Incidents' },
    blocks: [
      P(
        'Khi phát hiện sự cố bảo mật ảnh hưởng tới dữ liệu cá nhân Khách hàng ủy thác, DIGISO thông báo cho Khách hàng trong thời gian sớm nhất kèm thông tin đã biết (bản chất sự cố, dữ liệu bị ảnh hưởng, biện pháp khắc phục) và phối hợp để Khách hàng hoàn thành nghĩa vụ thông báo chủ thể dữ liệu và báo cáo cơ quan có thẩm quyền trong thời hạn luật định. DIGISO nhanh chóng khắc phục và giảm thiểu hậu quả.',
        'Upon discovering a security incident affecting personal data delegated by the Customer, DIGISO notifies the Customer as soon as possible with the information known (nature of the incident, affected data, remedial measures) and cooperates so the Customer can meet its duties to notify data subjects and report to the competent authority within statutory deadlines. DIGISO promptly remedies and mitigates the consequences.'
      ),
    ],
  },
  {
    num: '12',
    title: { vi: 'Thời hạn lưu trữ, xóa và trả dữ liệu', en: 'Retention, Deletion and Return of Data' },
    blocks: [
      UL(
        LI('Lưu trong thời gian tài khoản còn hoạt động và tối đa 90 ngày sau khi Hợp đồng chấm dứt để Khách hàng trích xuất dữ liệu, sau đó DIGISO xóa hoặc ẩn danh hóa dữ liệu.', 'Kept while the account is active and for up to 90 days after the Agreement ends so the Customer can export its data, after which DIGISO deletes or anonymizes it.', 'Dữ liệu Khách hàng đưa vào', 'Data entered by the Customer'),
        LI('Lưu tối đa 24 tháng kể từ lần tương tác cuối của chủ thể dữ liệu.', 'Kept for up to 24 months from the data subject’s last interaction.', 'Khách hàng tiềm năng (lead) từ trang đích', 'Leads from landing pages'),
        LI('Lưu tối đa 24 tháng phục vụ đối soát, thống kê.', 'Kept for up to 24 months for reconciliation and statistics.', 'Lịch sử gửi chiến dịch', 'Campaign delivery history'),
        LI('Lưu theo thời hạn của pháp luật kế toán và thuế.', 'Kept for the period required by accounting and tax law.', 'Dữ liệu giao dịch và chứng từ', 'Transaction data and records')
      ),
      P(
        'Khách hàng có thể yêu cầu xóa dữ liệu sớm hơn bằng văn bản. DIGISO có thể giữ lại dữ liệu ở mức tối thiểu khi pháp luật yêu cầu và sẽ thông báo lý do.',
        'The Customer may request earlier deletion in writing. DIGISO may retain the minimum data where the law requires and will state the reason.'
      ),
    ],
  },
  {
    num: '13',
    title: { vi: 'Trách nhiệm của các bên', en: 'Responsibilities of the Parties' },
    blocks: [
      P(
        'Mỗi bên chịu trách nhiệm về các hành vi vi phạm nghĩa vụ của mình theo Thỏa thuận này, Điều khoản sử dụng dịch vụ và pháp luật. Khách hàng chịu trách nhiệm về tính hợp pháp của dữ liệu và hướng dẫn xử lý do mình đưa ra; DIGISO chịu trách nhiệm về việc xử lý ngoài hướng dẫn hợp pháp của Khách hàng hoặc không thực hiện các biện pháp bảo mật đã cam kết tại Thỏa thuận này. Giới hạn trách nhiệm (nếu có) thực hiện theo Điều khoản sử dụng dịch vụ và quy định pháp luật.',
        'Each party is responsible for its own breaches of this Agreement, the Terms of Service and the law. The Customer is responsible for the lawfulness of the data and instructions it provides; DIGISO is responsible for processing outside the Customer’s lawful instructions or for failing to apply the security measures it committed to in this Agreement. Any limitation of liability follows the Terms of Service and the law.'
      ),
    ],
  },
  {
    num: '14',
    title: { vi: 'Hiệu lực, chấm dứt và sửa đổi Thỏa thuận', en: 'Effect, Termination and Amendment' },
    blocks: [
      UL(
        LI('Thỏa thuận có hiệu lực từ khi Khách hàng xác nhận đồng ý (khi đăng ký hoặc khi xác nhận lại) và kéo dài cùng Hợp đồng.', 'The Agreement takes effect when the Customer confirms acceptance (at registration or on re-confirmation) and lasts as long as the service contract.'),
        LI('Thỏa thuận chấm dứt khi Hợp đồng chấm dứt; các nghĩa vụ về bảo mật, xóa và trả dữ liệu (Điều 12) vẫn tiếp tục cho đến khi hoàn tất.', 'The Agreement ends when the service contract ends; confidentiality, deletion and return obligations (Article 12) continue until completed.'),
        LI('DIGISO có thể cập nhật Thỏa thuận khi pháp luật hoặc hoạt động dịch vụ thay đổi và thông báo qua email hoặc thông báo trên hệ thống ít nhất 15 ngày trước khi có hiệu lực. Các phiên bản trước được lưu tại mục Lịch sử cập nhật.', 'DIGISO may update the Agreement when the law or the service changes and will notify by email or an in-system notice at least 15 days before it takes effect. Earlier versions are kept in the Update history section.'),
        LI('DIGISO không coi việc Khách hàng im lặng hoặc chỉ tiếp tục truy cập dịch vụ là sự đồng ý đối với thay đổi liên quan đến xử lý dữ liệu cá nhân; khi cần sự đồng ý, DIGISO sẽ yêu cầu Khách hàng xác nhận rõ ràng. Nếu không đồng ý, Khách hàng có quyền ngừng sử dụng dịch vụ và yêu cầu chấm dứt Hợp đồng.', 'DIGISO does not treat the Customer’s silence or mere continued access as consent to changes affecting personal data processing; where consent is needed, DIGISO will ask the Customer to confirm explicitly. If it disagrees, the Customer may stop using the service and request termination of the contract.')
      ),
    ],
  },
  {
    num: '15',
    title: { vi: 'Liên hệ, khiếu nại và giải quyết tranh chấp', en: 'Contact, Complaints and Dispute Resolution' },
    blocks: [
      P(
        'Mọi yêu cầu, phản ánh, khiếu nại liên quan đến Thỏa thuận được gửi qua Hotline (+84) 877 909 606, Email info@digiso.vn hoặc bằng văn bản tới trụ sở công ty. DIGISO xác nhận tiếp nhận và phản hồi ban đầu trong vòng 24 giờ làm việc; thời gian giải quyết thông thường từ 3 đến 7 ngày làm việc và nếu cần kéo dài do nguyên nhân khách quan, DIGISO thông báo trước lý do và thời gian dự kiến. Kết quả được thông báo qua kênh liên hệ đã đăng ký.',
        'Any request, feedback or complaint concerning this Agreement may be sent by Hotline (+84) 877 909 606, Email info@digiso.vn or in writing to the company’s head office. DIGISO acknowledges receipt and responds initially within 24 working hours; resolution normally takes 3 to 7 working days and, if more time is needed for objective reasons, DIGISO tells the reason and expected time in advance. The outcome is notified through the registered contact channel.'
      ),
      P(
        'Thỏa thuận được điều chỉnh bởi pháp luật Việt Nam. Tranh chấp được ưu tiên giải quyết bằng thương lượng; nếu không thành, mỗi bên có quyền đưa ra cơ quan có thẩm quyền theo quy định pháp luật Việt Nam.',
        'This Agreement is governed by Vietnamese law. Disputes are resolved first by negotiation; failing that, either party may bring them before the competent authority under Vietnamese law.'
      ),
    ],
  },
];

function Block({ block, language }) {
  const subBar = 'mb-3 mt-[18px] flex items-center gap-2.5 text-sm font-semibold text-slate-800';
  const body = 'mb-3 text-slate-700 leading-relaxed';
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
    return <h3 className={subBar}>{block[language]}</h3>;
  }
  if (block.k === 'p') return <p className={body}>{block[language]}</p>;
  if (block.k === 'n') {
    return (
      <div className="mt-3 rounded-lg border border-slate-200/90 border-l-4 border-l-orange-500 bg-slate-50 px-[18px] py-[14px] text-[13.5px] text-slate-800 shadow-sm">
        {block[language]}
      </div>
    );
  }
  if (block.k === 'ol') {
    return <ol className="mb-3 list-decimal space-y-2 pl-6 text-slate-700 leading-relaxed">{block.items.map(renderItem)}</ol>;
  }
  return <ul className="mb-3 list-disc space-y-2 pl-6 text-slate-700 leading-relaxed">{block.items.map(renderItem)}</ul>;
}

/**
 * Trang Thỏa thuận xử lý dữ liệu cá nhân (Public DPA) — route `/public-dpa`.
 * Nội dung theo Luật 91/2025/QH15, Nghị định 356/2025/NĐ-CP; mỗi điều có id để mục lục nhảy tới.
 */
function PublicDPA() {
  const [language, setLanguage] = useState('vi');
  const lc = getLangClass;

  return (
    <div className="min-h-screen bg-slate-100/90 text-slate-900 antialiased">
      <style>
        {`
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
        `}
      </style>
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

            <h1
              className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'vi')}`}
            >
              Thỏa Thuận <span className="text-orange-400">Xử Lý Dữ Liệu</span> Cá Nhân
            </h1>
            <h1
              className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'en')}`}
            >
              Personal Data <span className="text-orange-400">Processing</span> Agreement
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
                {' '}|{' '}
                Luật 91/2025/QH15 · Nghị định 356/2025/NĐ-CP
              </span>
              <span className={lc(language, 'en')}>
                Updated on <strong>29/09/2026</strong> — Effective from <strong>29/09/2026</strong>
                {' · '}<a href="#lich-su-cap-nhat" className="font-medium text-orange-600 hover:underline">Archived versions</a>
                {' '}|{' '}
                Law 91/2025/QH15 · Decree 356/2025/NĐ-CP
              </span>
            </p>
          </div>

          {/* Mục lục */}
          <nav className="pp-section mb-6 p-6" aria-label={language === 'vi' ? 'Mục lục' : 'Contents'}>
            <h2 className="mb-3 text-base font-bold text-slate-900">{language === 'vi' ? 'Mục lục' : 'Contents'}</h2>
            <ol className="grid gap-x-6 gap-y-1.5 text-[14px] sm:grid-cols-2">
              {ARTICLES.map((a) => (
                <li key={a.num}>
                  <a href={`#dieu-${a.num}`} className="text-slate-700 no-underline hover:text-orange-600 hover:underline">
                    <span className="mr-1.5 font-semibold text-orange-600">
                      {language === 'vi' ? 'Điều' : 'Art.'} {a.num}.
                    </span>
                    {a.title[language]}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="space-y-6">
            {ARTICLES.map((a) => (
              <section key={a.num} id={`dieu-${a.num}`} className="pp-section scroll-mt-6 p-6">
                <h2 className="mb-4 text-xl font-bold text-slate-900">
                  {language === 'vi' ? 'Điều' : 'Article'} {a.num}. {a.title[language]}
                </h2>
                {a.blocks.map((b, i) => (
                  <Block key={i} block={b} language={language} />
                ))}
              </section>
            ))}
          </div>

          {/* Contact */}
          <div className="mt-10 rounded-2xl border border-slate-700/30 bg-gradient-to-b from-slate-900 to-slate-950 px-5 py-8 text-white shadow-xl sm:px-8">
            <h2 className={`text-lg font-bold tracking-tight text-white sm:text-xl ${lc(language, 'vi')}`}>
              Thông tin liên hệ
            </h2>
            <h2 className={`text-lg font-bold tracking-tight text-white sm:text-xl ${lc(language, 'en')}`}>
              Contact
            </h2>
            <div className={`mt-4 space-y-1 text-[14px] leading-relaxed text-slate-200 ${lc(language, 'vi')}`}>
              <p>Công ty TNHH Giải pháp số DIGISO — MST 0316725362</p>
              <p>Phòng I.101B Toà nhà A, Khu Công nghệ Phần mềm Đại học Quốc gia Tp. Hồ Chí Minh, Đ. Võ Trường Toản, Khu phố 33, Phường Linh Xuân, Thành phố Hồ Chí Minh</p>
              <p>
                Email:{' '}
                <a href="mailto:info@digiso.vn" className="text-orange-400 no-underline hover:underline">info@digiso.vn</a>
                {' '}| Hotline: (+84) 877 909 606
              </p>
            </div>
            <div className={`mt-4 space-y-1 text-[14px] leading-relaxed text-slate-200 ${lc(language, 'en')}`}>
              <p>DIGISO Digital Solutions Co., Ltd. — Tax ID 0316725362</p>
              <p>Room I.101B, Building A, Software Technology Park, Vietnam National University HCMC, Vo Truong Toan St., Quarter 33, Linh Xuan Ward, Ho Chi Minh City</p>
              <p>
                Email:{' '}
                <a href="mailto:info@digiso.vn" className="text-orange-400 no-underline hover:underline">info@digiso.vn</a>
                {' '}| Hotline: (+84) 877 909 606
              </p>
            </div>
          </div>
        </div>

        <footer className="border-t border-slate-200 bg-white px-5 py-8 text-center text-[12px] text-slate-500">
          <p className={lc(language, 'vi')}>
            © 2026 Công ty TNHH Giải pháp số DIGISO. Mọi quyền được bảo lưu. Thỏa thuận này được cập nhật và có hiệu lực từ ngày 29/09/2026.
          </p>
          <p className={lc(language, 'en')}>
            © 2026 DIGISO Digital Solutions Co., Ltd. All rights reserved. This Agreement was last updated and effective from September 29, 2026.
          </p>
        </footer>
        <PolicyHistory slug="dpa" language={language} lc={lc} />
      </div>
    </div>
  );
}

export default PublicDPA;
