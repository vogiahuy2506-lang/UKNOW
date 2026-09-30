import { useState } from 'react';
import PrivacyPolicyProcessorPanel from './PrivacyPolicyProcessorPanel';
import PrivacyPolicyControllerPanel from './PrivacyPolicyControllerPanel';
import PolicyHistory from './components/PolicyHistory.jsx';

/**
 * Trả về class hiển thị theo ngôn ngữ đang chọn.
 *
 * Luồng hoạt động:
 * 1. Nếu item cùng ngôn ngữ đang active thì trả về class rỗng để hiển thị.
 * 2. Ngược lại trả về `hidden` để ẩn đúng phần nội dung.
 *
 * @param {'vi' | 'en'} activeLang Ngôn ngữ hiện tại.
 * @param {'vi' | 'en'} itemLang Ngôn ngữ của block cần hiển thị.
 * @returns {string} Class điều khiển trạng thái hiển thị.
 */
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
 * PHẦN (I) — thông tin DIGISO thu thập trực tiếp từ người dùng.
 * Tám mục đầu tương ứng đúng 8 điểm tối thiểu của Điều 5 khoản 1 Nghị định 248/2026/NĐ-CP
 * (`ref` = điểm a, b, c, d, đ, e, g, h). KHÔNG được bỏ mục nào; sửa nội dung phải giữ đủ 8 mục.
 */
const PART_I_SECTIONS = [
  {
    id: 'p1-thu-thap',
    ref: 'a',
    num: '1',
    title: { vi: 'Mục đích và phạm vi thu thập thông tin', en: 'Purpose and Scope of Information Collection' },
    blocks: [
      H('1.1 – Dữ liệu cá nhân cơ bản', '1.1 – Basic Personal Data'),
      UL(
        LI('Họ tên, địa chỉ email, số điện thoại, mật khẩu (chỉ lưu dạng băm bcrypt, không lưu bản rõ).', 'Full name, email address, phone number, password (stored only as a bcrypt hash, never in clear text).', 'Thông tin đăng ký', 'Registration information'),
        LI('Nếu bạn chọn đăng nhập bằng Google, DIGISO tiếp nhận họ tên, địa chỉ email đã xác minh và ảnh đại diện của tài khoản Google theo phạm vi quyền bạn chấp thuận.', 'If you choose to sign in with Google, DIGISO receives the Google account’s full name, verified email address and profile photo within the permission scope you grant.', 'Đăng nhập bằng dịch vụ bên thứ ba', 'Sign-in with a third-party service'),
        LI('Lịch sử thanh toán gói dịch vụ, thông tin đơn hàng và thông tin xuất hóa đơn điện tử (tên hoặc đơn vị, mã số thuế, địa chỉ, email nhận hóa đơn) khi bạn yêu cầu.', 'Service plan payment history, order information and electronic invoice details (name or entity, tax code, address, invoice email) when you request an invoice.', 'Dữ liệu giao dịch', 'Transaction data'),
        LI('Địa chỉ IP, loại thiết bị và trình duyệt, nhật ký hoạt động trên tài khoản.', 'IP address, device and browser type, activity logs on your account.', 'Dữ liệu kỹ thuật', 'Technical data')
      ),
      H('1.2 – Dữ liệu cá nhân nhạy cảm', '1.2 – Sensitive Personal Data'),
      UL(
        LI('Số Căn cước công dân (CCCD) và thông tin tài khoản ngân hàng phục vụ đối soát hoa hồng và quyết toán thuế thu nhập cá nhân. Các thông tin này được mã hóa AES-256-GCM khi lưu trữ.', 'Citizen ID (CCCD) number and bank account information used for commission reconciliation and personal income tax settlement. This information is encrypted with AES-256-GCM at rest.', 'Thông tin định danh đối tác giới thiệu (chỉ áp dụng với đối tác đăng ký chương trình giới thiệu)', 'Referral partner identification (applies only to partners in the referral program)')
      ),
      H('1.3 – Mục đích thu thập và sử dụng', '1.3 – Purposes of Collection and Use'),
      P(
        'DIGISO thu thập và sử dụng thông tin dựa trên sự đồng ý tự nguyện của bạn, việc thực hiện hợp đồng với bạn hoặc nghĩa vụ theo pháp luật, nhằm:',
        'DIGISO collects and uses information based on your voluntary consent, performance of a contract with you, or legal obligations, in order to:'
      ),
      UL(
        LI('Tạo tài khoản; xác nhận đơn hàng; xử lý thanh toán; gửi email xác nhận; giải quyết khiếu nại; chăm sóc khách hàng.', 'Create accounts; confirm orders; process payments; send confirmation emails; resolve complaints; provide customer care.'),
        LI('Xác thực danh tính, bảo vệ tài khoản và phòng chống gian lận.', 'Verify identity, protect accounts and prevent fraud.'),
        LI('Thực hiện các nghĩa vụ chi trả, kế toán và thuế theo quy định pháp luật.', 'Fulfil payment, accounting and tax obligations under the law.')
      ),
      H('1.4 – Cookie và bộ nhớ trình duyệt', '1.4 – Cookies and Browser Storage'),
      P(
        'Nền tảng lưu tại trình duyệt của bạn mã phiên đăng nhập và tùy chọn giao diện/ngôn ngữ. DIGISO có thể dùng Google Analytics để đo lưu lượng truy cập trước đăng ký; Google Analytics vận hành độc lập và có chính sách riêng.',
        'The platform stores your login session token and interface/language preferences in your browser. DIGISO may use Google Analytics to measure pre-registration traffic; Google Analytics operates independently and has its own policy.'
      ),
    ],
  },
  {
    id: 'p1-su-dung',
    ref: 'b',
    num: '2',
    title: { vi: 'Phạm vi sử dụng thông tin', en: 'Scope of Use of Information' },
    blocks: [
      P(
        'Thông tin cá nhân của bạn chỉ được sử dụng cho các mục đích đã thông báo tại Mục 1. DIGISO cam kết không kinh doanh, bán, cho thuê hoặc trao đổi thông tin này cho bên thứ ba vì mục đích thương mại, ngoại trừ:',
        'Your personal information is used only for the purposes notified in Section 1. DIGISO commits not to trade, sell, rent or exchange it with third parties for commercial purposes, except:'
      ),
      UL(
        LI('Khi nhận được sự đồng ý xác nhận từ bạn.', 'When we receive your explicit consent.', 'Có sự cho phép', 'With permission'),
        LI('Các đơn vị hỗ trợ kỹ thuật (hạ tầng lưu trữ, hệ thống gửi email, đối tác thanh toán, dịch vụ AI) trong giới hạn tối thiểu để duy trì dịch vụ — xem danh sách tại Mục 4.', 'Technical support providers (storage infrastructure, email delivery, payment partners, AI service) within the minimum needed to maintain the service — see the list in Section 4.', 'Đối tác vận hành', 'Operating partners'),
        LI('Khi có yêu cầu chính thức từ cơ quan quản lý nhà nước có thẩm quyền theo quy định pháp luật.', 'Upon an official request from a competent state authority under the law.', 'Nghĩa vụ pháp lý', 'Legal obligations')
      ),
      H('Chia sẻ với bên thứ ba', 'Sharing with Third Parties'),
      P(
        'DIGISO không bán, cho thuê hoặc trao đổi thông tin cá nhân của bạn vì mục đích thương mại. Thông tin chỉ được chia sẻ với: cổng thanh toán PayOS và Mắt Bão e-Invoice để hoàn tất nghĩa vụ thanh toán và xuất chứng từ hợp pháp; các đối tác vận hành nêu tại Mục 4; cơ quan nhà nước có thẩm quyền theo quy định pháp luật Việt Nam.',
        'DIGISO does not sell, rent or exchange your personal information for commercial purposes. Information is shared only with: the PayOS payment gateway and Mat Bao e-Invoice to complete payment obligations and issue lawful documents; the operating partners listed in Section 4; and competent state authorities under Vietnamese law.'
      ),
      H('Chuyển dữ liệu xuyên biên giới', 'Cross-Border Data Transfer'),
      P(
        'Tệp tải lên được lưu trên Google Cloud Storage; khi bạn dùng tính năng AI, nội dung cần xử lý được gửi tới Google Gemini API; lưu lượng truy cập đi qua Cloudflare. Các nhà cung cấp này có hạ tầng đặt ngoài lãnh thổ Việt Nam, nên đây là hoạt động chuyển dữ liệu cá nhân xuyên biên giới. DIGISO thực hiện các thủ tục theo Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP, gồm lập và lưu hồ sơ đánh giá tác động chuyển dữ liệu cá nhân ra nước ngoài khi thuộc trường hợp phải thực hiện.',
        'Uploaded files are stored on Google Cloud Storage; when you use AI features, the content to be processed is sent to the Google Gemini API; traffic passes through Cloudflare. These providers have infrastructure outside Vietnam, so this is a cross-border personal data transfer. DIGISO follows Personal Data Protection Law No. 91/2025/QH15 and Decree 356/2025/NĐ-CP, including preparing and keeping a cross-border transfer impact assessment where required.'
      ),
    ],
  },
  {
    id: 'p1-luu-tru',
    ref: 'c',
    num: '3',
    title: { vi: 'Thời gian lưu trữ thông tin', en: 'Information Retention Period' },
    blocks: [
      UL(
        LI('Dữ liệu hồ sơ tài khoản được lưu trong suốt thời gian tài khoản hoạt động.', 'Account profile data is kept for as long as the account is active.'),
        LI('Khi bạn gửi yêu cầu xóa tài khoản, dữ liệu định danh của bạn được xóa hoặc ẩn danh hóa sau khi DIGISO xác minh yêu cầu, trừ dữ liệu phải lưu giữ để tuân thủ pháp luật.', 'When you request account deletion, your identifying data is deleted or anonymized after DIGISO verifies the request, except data that must be retained to comply with the law.'),
        LI('Chứng từ thanh toán, hóa đơn và chứng từ kế toán được lưu theo Luật Kế toán và pháp luật thuế (tối thiểu 10 năm).', 'Payment records, invoices and accounting documents are kept under the Accounting Law and tax law (at least 10 years).'),
        LI('Thông tin liên quan đến hợp đồng, giao dịch điện tử được lưu tối thiểu 03 năm kể từ thời điểm giao kết theo Luật Thương mại điện tử 2025.', 'Information relating to electronic contracts and transactions is kept for at least 3 years from conclusion under the 2025 E-Commerce Law.'),
        LI('Dữ liệu biểu mẫu liên hệ và thống kê truy cập trang đích được lưu theo các thời hạn nêu tại Phần (III), mục 8.', 'Contact form data and landing page traffic statistics are kept for the periods stated in Part (III), Section 8.')
      ),
      P(
        'Phương pháp xác định: dữ liệu được giữ cho đến khi hết mục đích thu thập, hết thời hạn pháp luật yêu cầu hoặc khi bạn yêu cầu xóa hợp lệ — tùy thời điểm nào đến trước, trừ dữ liệu bắt buộc phải lưu giữ.',
        'How the period is determined: data is kept until the purpose of collection ends, the legal retention period expires, or you make a valid deletion request — whichever comes first, except data that must be retained.'
      ),
    ],
  },
  {
    id: 'p1-tiep-can',
    ref: 'd',
    num: '4',
    title: { vi: 'Tổ chức, cá nhân có thể được tiếp cận thông tin cá nhân', en: 'Parties Who May Access Personal Information' },
    blocks: [
      P(
        'Thông tin cá nhân của bạn được bảo mật và chỉ được tiếp cận, xử lý bởi các tổ chức, cá nhân có thẩm quyền, có nhu cầu cần thiết và trong phạm vi phù hợp với mục đích đã thông báo hoặc theo quy định pháp luật, gồm:',
        'Your personal information is kept confidential and may be accessed and processed only by authorized organizations and individuals with a genuine need, within the scope of the notified purposes or as required by law, including:'
      ),
      OL(
        LI('Nhân viên, người lao động, bộ phận chuyên môn được giao nhiệm vụ vận hành, quản trị, hỗ trợ người dùng, bảo đảm an toàn hệ thống; tiếp cận đúng thẩm quyền, đúng phạm vi và có nghĩa vụ bảo mật.', 'Employees and specialist teams assigned to operate, administer, support users and keep the system secure; access is proper in authority and scope and subject to confidentiality duties.', '(a) Nhân sự của Công ty TNHH Giải pháp số DIGISO', '(a) Personnel of DIGISO Digital Solutions Co., Ltd.'),
        LI('Trong phạm vi tối thiểu cần thiết để thực hiện dịch vụ, gồm: nhà cung cấp hosting máy chủ tại Việt Nam (Công ty Cổ phần AZDIGI); Google (Cloud Storage lưu tệp, Gemini API xử lý tính năng AI, Analytics); Cloudflare (CDN, bảo mật, SSL); máy chủ SMTP gửi email; PayOS (thanh toán); Mắt Bão e-Invoice (hóa đơn điện tử).', 'Within the minimum needed to deliver the service, including: the hosting provider for servers in Vietnam (AZDIGI Joint Stock Company); Google (Cloud Storage for files, Gemini API for AI features, Analytics); Cloudflare (CDN, security, SSL); SMTP servers for email; PayOS (payments); Mat Bao e-Invoice (electronic invoices).', '(b) Tổ chức cung cấp dịch vụ hoặc đối tác của DIGISO', '(b) DIGISO’s service providers and partners'),
        LI('Bạn có quyền tiếp cận thông tin cá nhân của mình, hoặc tổ chức, cá nhân được bạn ủy quyền hợp pháp.', 'You may access your own personal information, as may organizations or individuals you lawfully authorize.', '(c) Người dùng hoặc người được ủy quyền hợp pháp', '(c) Users or lawfully authorized persons'),
        LI('Cung cấp khi có yêu cầu hợp pháp phục vụ quản lý nhà nước, thanh tra, điều tra theo quy định pháp luật.', 'Provided upon a lawful request for state management, inspection or investigation under the law.', '(d) Cơ quan nhà nước có thẩm quyền', '(d) Competent state authorities'),
        LI('Chỉ chia sẻ khi có sự đồng ý rõ ràng của bạn hoặc pháp luật cho phép.', 'Shared only with your explicit consent or where the law permits.', '(e) Tổ chức, cá nhân khác khi có sự đồng ý của bạn', '(e) Other parties with your consent')
      ),
    ],
  },
  {
    id: 'p1-bao-mat',
    ref: 'đ',
    num: '5',
    title: { vi: 'Biện pháp bảo mật thông tin, dữ liệu của người sử dụng', en: 'Measures to Protect Users’ Information and Data' },
    blocks: [
      UL(
        LI('Toàn bộ truy cập founderai.biz qua HTTPS/TLS.', 'All access to founderai.biz is over HTTPS/TLS.', 'Mã hóa truyền tải', 'Encryption in transit'),
        LI('Mật khẩu được băm bằng bcrypt, không lưu bản rõ. Số CCCD của đối tác giới thiệu và thông tin phiên kết nối các kênh nhắn tin được mã hóa AES-256-GCM khi lưu trữ.', 'Passwords are hashed with bcrypt and never stored in clear text. Referral partners’ citizen ID numbers and the session data of connected messaging channels are encrypted with AES-256-GCM at rest.', 'Mã hóa và băm dữ liệu nhạy cảm', 'Encryption and hashing of sensitive data'),
        LI('Phân quyền theo vai trò (chủ tài khoản, nhân viên) và theo nhóm chức năng; dữ liệu của mỗi tài khoản được tách riêng khỏi tài khoản khác.', 'Role-based permissions (account owner, employee) and per feature group; each account’s data is separated from other accounts.', 'Kiểm soát truy cập', 'Access control'),
        LI('Giới hạn số lần đăng nhập sai; nhật ký hoạt động (audit log) đối với các thao tác quản trị.', 'Limits on failed login attempts; activity (audit) logs for administrative actions.', 'Giám sát', 'Monitoring'),
        LI('Sao lưu cơ sở dữ liệu tự động hằng ngày, lưu giữ 07 bản gần nhất trên máy chủ đặt tại Việt Nam, để khôi phục khi có sự cố.', 'Automated daily database backups, with the latest 07 copies kept on servers located in Vietnam, for recovery in the event of an incident.', 'Sao lưu', 'Backups'),
        LI('Nhân sự của DIGISO chỉ được tiếp cận dữ liệu theo phân công công việc và có nghĩa vụ bảo mật.', 'DIGISO personnel access data only as their duties require and are bound by confidentiality obligations.', 'Nguyên tắc cần biết', 'Need-to-know principle')
      ),
      P(
        'Khi phát hiện sự cố bảo mật ảnh hưởng tới dữ liệu cá nhân, DIGISO sẽ thông báo cho chủ thể dữ liệu và báo cáo cơ quan có thẩm quyền trong thời gian sớm nhất theo quy định của pháp luật. Nội dung xử lý dữ liệu cá nhân của DIGISO tuân thủ pháp luật về dữ liệu và bảo vệ dữ liệu cá nhân, gồm Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15 và Nghị định 356/2025/NĐ-CP.',
        'Upon discovering a security incident affecting personal data, DIGISO will notify affected data subjects and report to the competent authority as soon as possible as required by law. DIGISO’s processing of personal data complies with data and personal data protection law, including Personal Data Protection Law No. 91/2025/QH15 and Decree 356/2025/NĐ-CP.'
      ),
    ],
  },
  {
    id: 'p1-xem-sua',
    ref: 'e',
    num: '6',
    title: { vi: 'Phương thức, quy trình để chủ thể dữ liệu xem, chỉnh sửa dữ liệu', en: 'How Data Subjects View and Edit Their Data' },
    blocks: [
      P(
        'Bạn có quyền xem, chỉnh sửa hoặc yêu cầu chỉnh sửa dữ liệu của mình trên nền tảng bằng một trong các cách:',
        'You have the right to view, edit or request correction of your data on the platform in any of these ways:'
      ),
      OL(
        LI('Đăng nhập vào tài khoản và xem, chỉnh sửa thông tin cá nhân tại trang Thông tin tài khoản; hoặc', 'Sign in to your account and view or edit your personal information on the Account Information page; or'),
        LI('Liên hệ bộ phận chăm sóc khách hàng qua Hotline: (+84) 877 909 606 hoặc Email: info@digiso.vn; hoặc', 'Contact customer care by Hotline: (+84) 877 909 606 or Email: info@digiso.vn; or'),
        LI('Gửi yêu cầu bằng văn bản về địa chỉ trụ sở công ty (Phòng I.101B Toà nhà A, Khu Công nghệ Phần mềm Đại học Quốc gia Tp. Hồ Chí Minh, Đ. Võ Trường Toản, Khu phố 33, Phường Linh Xuân, Thành phố Hồ Chí Minh).', 'Send a written request to the company’s head office (Room I.101B, Building A, Software Technology Park, Vietnam National University HCMC, Vo Truong Toan St., Quarter 33, Linh Xuan Ward, Ho Chi Minh City).')
      ),
    ],
  },
  {
    id: 'p1-xoa-han-che',
    ref: 'g',
    num: '7',
    title: { vi: 'Phương thức, quy trình tiếp nhận yêu cầu xóa, hủy hoặc hạn chế xử lý dữ liệu', en: 'How Requests to Delete, Destroy or Restrict Processing Are Received' },
    blocks: [
      P(
        'Bạn có quyền yêu cầu xóa, hủy hoặc hạn chế xử lý dữ liệu của mình đã cung cấp bằng cách:',
        'You have the right to request deletion, destruction or restriction of the processing of the data you provided by:'
      ),
      OL(
        LI('Liên hệ bộ phận chăm sóc khách hàng qua Hotline (+84) 877 909 606 hoặc Email info@digiso.vn, nêu rõ dữ liệu và yêu cầu (xóa, hủy hoặc hạn chế xử lý); hoặc', 'Contacting customer care by Hotline (+84) 877 909 606 or Email info@digiso.vn, stating the data concerned and your request (delete, destroy or restrict processing); or'),
        LI('Gửi yêu cầu bằng văn bản về địa chỉ trụ sở công ty.', 'Sending a written request to the company’s head office.')
      ),
      P(
        'Quy trình: DIGISO xác minh danh tính người yêu cầu, xác nhận tiếp nhận trong vòng 24 giờ làm việc, thực hiện yêu cầu trong thời hạn theo quy định của pháp luật và thông báo kết quả cho bạn. DIGISO có thể từ chối hoặc chỉ thực hiện một phần trong trường hợp pháp luật yêu cầu phải lưu giữ dữ liệu (ví dụ chứng từ kế toán) và sẽ nêu rõ lý do. Để ngừng nhận email marketing, bạn có thể dùng liên kết hủy đăng ký trong email mà không cần đăng nhập.',
        'Process: DIGISO verifies the requester’s identity, acknowledges receipt within 24 working hours, carries out the request within the period required by law and informs you of the outcome. DIGISO may decline or only partly fulfil a request where the law requires the data to be retained (for example accounting records) and will state the reason. To stop marketing email you can use the unsubscribe link in the email without logging in.'
      ),
    ],
  },
  {
    id: 'p1-khieu-nai',
    ref: 'h',
    num: '8',
    title: { vi: 'Phương thức, quy trình tiếp nhận và giải quyết khiếu nại, yêu cầu, phản ánh liên quan đến bảo mật thông tin', en: 'How Complaints, Requests and Feedback on Information Security Are Received and Resolved' },
    blocks: [
      H('(i) Phương thức tiếp nhận', '(i) Channels'),
      UL(
        LI('Hotline: (+84) 877 909 606 | Email: info@digiso.vn', 'Hotline: (+84) 877 909 606 | Email: info@digiso.vn', 'Trực tuyến', 'Online'),
        LI('Phòng I.101B Toà nhà A, Khu Công nghệ Phần mềm Đại học Quốc gia Tp. Hồ Chí Minh, Đ. Võ Trường Toản, Khu phố 33, Phường Linh Xuân, Thành phố Hồ Chí Minh, Việt Nam.', 'Room I.101B, Building A, Software Technology Park, Vietnam National University HCMC, Vo Truong Toan St., Quarter 33, Linh Xuan Ward, Ho Chi Minh City, Vietnam.', 'Trực tiếp', 'In person')
      ),
      H('(ii) Quy trình giải quyết 4 bước', '(ii) Four-Step Resolution Process'),
      OL(
        LI('Khách hàng gửi yêu cầu/phản ánh kèm tài liệu, hình ảnh chứng minh (nếu có).', 'The customer submits the request/complaint with supporting documents or images (if any).', 'Bước 1 – Gửi yêu cầu', 'Step 1 – Submit'),
        LI('DIGISO xác nhận tiếp nhận và phản hồi ban đầu trong vòng 24 giờ làm việc.', 'DIGISO acknowledges receipt and gives an initial response within 24 working hours.', 'Bước 2 – Tiếp nhận', 'Step 2 – Receive'),
        LI('Bộ phận phụ trách kiểm tra, đối chiếu; thời gian giải quyết thông thường từ 3 đến 7 ngày làm việc. Nếu cần kéo dài do nguyên nhân khách quan, DIGISO thông báo trước lý do và thời gian dự kiến giải quyết cho khách hàng.', 'The responsible team reviews and cross-checks; resolution normally takes 3 to 7 working days. If more time is needed for objective reasons, DIGISO tells the customer the reason and the expected time in advance.', 'Bước 3 – Xác minh và xử lý', 'Step 3 – Verify and resolve'),
        LI('Thông báo kết quả và phương án xử lý qua kênh liên hệ đã đăng ký.', 'The outcome and solution are communicated through the registered contact channel.', 'Bước 4 – Phản hồi kết quả', 'Step 4 – Respond')
      ),
      P(
        'Nếu chưa hài lòng với kết quả, bạn có quyền khiếu nại, tố cáo hoặc khởi kiện theo quy định pháp luật.',
        'If you are not satisfied with the outcome, you may complain, report or sue in accordance with the law.'
      ),
      P(
        'Chi tiết về phương thức tiếp nhận và giải quyết phản ánh, yêu cầu, khiếu nại nói chung xem tại trang “Phương thức tiếp nhận và giải quyết phản ánh, yêu cầu, khiếu nại”.',
        'For the general procedure for receiving and resolving feedback, requests and complaints, see the page “Methods of receiving and resolving feedback, requests and complaints”.'
      ),
    ],
  },
  {
    id: 'p1-cap-nhat',
    ref: '',
    num: '9',
    title: { vi: 'Thay đổi chính sách', en: 'Changes to This Policy' },
    blocks: [
      P(
        'DIGISO có thể cập nhật Chính sách bảo mật này. Khi có thay đổi quan trọng, DIGISO thông báo qua email hoặc thông báo trên hệ thống ít nhất 15 ngày trước khi có hiệu lực; các phiên bản trước được lưu tại mục Lịch sử cập nhật ở cuối trang.',
        'DIGISO may update this Privacy Policy. For significant changes, DIGISO notifies you by email or an in-system notice at least 15 days before they take effect; earlier versions are kept in the Update history section at the bottom of the page.'
      ),
      P(
        'DIGISO không coi việc bạn tiếp tục truy cập dịch vụ là sự đồng ý đối với thay đổi liên quan đến xử lý dữ liệu cá nhân. Khi thay đổi cần sự đồng ý, DIGISO sẽ yêu cầu bạn xác nhận đồng ý rõ ràng; bạn có quyền không đồng ý, ngừng sử dụng dịch vụ và yêu cầu đóng tài khoản.',
        'DIGISO does not treat your continued access to the service as consent to changes affecting personal data processing. Where a change needs consent, DIGISO will ask you to give explicit confirmation; you may disagree, stop using the service and request account closure.'
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
      <h4 className={subBar}>
        <span className="inline-block h-4 w-1 shrink-0 rounded-full bg-orange-500" aria-hidden />
        {block[language]}
      </h4>
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
    return <ol className="mb-[10px] list-decimal space-y-[7px] pl-5 text-slate-600 leading-relaxed">{block.items.map(renderItem)}</ol>;
  }
  return <ul className="mb-[10px] list-disc space-y-[7px] pl-5 text-slate-600 leading-relaxed">{block.items.map(renderItem)}</ul>;
}

/** Tiêu đề lớn của từng phần (I)/(II)/(III), có id để mục lục nhảy tới. */
const PARTS = [
  {
    id: 'phan-1',
    roman: 'I',
    title: {
      vi: 'Chính sách bảo mật — thông tin DIGISO thu thập trực tiếp từ bạn',
      en: 'Privacy Policy — information DIGISO collects directly from you',
    },
    lead: {
      vi: 'Áp dụng cho người truy cập founderai.biz, người đăng ký tài khoản hoặc dùng thử, khách hàng sử dụng phần mềm Founder AI và người dùng được khách hàng cấp tài khoản. Nội dung dưới đây gồm 8 nội dung tối thiểu của chính sách bảo mật theo Điều 5 Nghị định 248/2026/NĐ-CP.',
      en: 'Applies to visitors of founderai.biz, people who register or trial an account, customers using the Founder AI software and users given accounts by customers. The content below covers the 8 minimum items of a privacy policy under Article 5 of Decree 248/2026/NĐ-CP.',
    },
  },
  {
    id: 'phan-2',
    roman: 'II',
    title: {
      vi: 'DIGISO là Bên xử lý dữ liệu — khi bạn là khách hàng của khách hàng DIGISO',
      en: 'DIGISO as Data Processor — when you are a customer of a DIGISO customer',
    },
    lead: {
      vi: 'Áp dụng khi khách hàng của DIGISO (doanh nghiệp, cá nhân dùng Founder AI) là Bên kiểm soát dữ liệu và DIGISO chỉ xử lý dữ liệu theo ủy thác của họ.',
      en: 'Applies when a DIGISO customer (a business or individual using Founder AI) is the Data Controller and DIGISO only processes data on their behalf.',
    },
  },
  {
    id: 'phan-3',
    roman: 'III',
    title: {
      vi: 'DIGISO là Bên kiểm soát và xử lý dữ liệu — dữ liệu DIGISO tự quyết định mục đích xử lý',
      en: 'DIGISO as Data Controller and Processor — data for which DIGISO decides the purposes',
    },
    lead: {
      vi: 'Áp dụng đối với dữ liệu DIGISO trực tiếp thu thập từ bạn qua đăng ký tài khoản, biểu mẫu, thanh toán và các kênh của DIGISO.',
      en: 'Applies to data DIGISO collects directly from you through account registration, forms, payments and DIGISO’s own channels.',
    },
  },
];

function PartHeading({ part, language }) {
  return (
    <div id={part.id} className="mb-5 mt-12 scroll-mt-6">
      <div className="flex items-start gap-3">
        <span className="mt-1 inline-flex h-8 min-w-[2rem] shrink-0 items-center justify-center rounded-md bg-slate-900 px-2 text-sm font-bold text-white">
          {part.roman}
        </span>
        <h2 className="text-xl font-bold leading-snug tracking-tight text-slate-900 sm:text-2xl">{part.title[language]}</h2>
      </div>
      <p className="mt-3 text-[14px] leading-relaxed text-slate-600">{part.lead[language]}</p>
    </div>
  );
}

/**
 * Trang chính sách bảo mật public render hoàn toàn bằng React.
 *
 * Luồng hoạt động:
 * 1. Quản lý ngôn ngữ (vi/en) bằng state.
 * 2. Hiển thị ba phần liên tiếp, có mục lục nhảy tới từng phần:
 *    (I) thông tin DIGISO thu thập trực tiếp (8 nội dung tối thiểu Điều 5 NĐ 248/2026/NĐ-CP),
 *    (II) DIGISO là Bên xử lý dữ liệu, (III) DIGISO là Bên kiểm soát và xử lý dữ liệu.
 * 3. Phần (II)/(III) nằm ở hai file `PrivacyPolicyProcessorPanel` / `PrivacyPolicyControllerPanel`.
 *
 * @returns {JSX.Element} Trang privacy policy.
 */
function PrivacyPolicy() {
  const [language, setLanguage] = useState('vi');
  const lc = getLangClass;

  return (
    <div className="min-h-screen bg-slate-100/90 text-slate-900 antialiased">
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&display=swap');
          .pp-body { font-family: 'Be Vietnam Pro', system-ui, sans-serif; line-height: 1.7; font-size: 15px; }
          /* Thẻ nội dung: bóng nhẹ, viền tinh để giống tài liệu pháp lý in trên nền sạch */
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
        {/* Thanh nhấn mạnh pháp lý + header tối giản, uy tín */}
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
              <span className="hidden sm:inline text-slate-600" aria-hidden>
                |
              </span>
              <span className="rounded-md border border-slate-600/80 bg-slate-900/50 px-2.5 py-1 text-slate-300">
                digiso.vn
              </span>
              <span className="text-slate-600">·</span>
              <span className="rounded-md border border-slate-600/80 bg-slate-900/50 px-2.5 py-1 text-slate-300">
                founderai.biz
              </span>
            </div>

            <h1
              className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'vi')}`}
            >
              Chính Sách <span className="text-orange-400">Bảo Mật</span>
            </h1>
            <h1
              className={`text-center text-[clamp(1.5rem,4.5vw,2.35rem)] font-bold leading-tight tracking-tight text-white ${lc(language, 'en')}`}
            >
              Privacy <span className="text-orange-400">Policy</span>
            </h1>

            <p className={`mt-3 text-center text-sm text-slate-400 ${lc(language, 'vi')}`}>
              Công ty TNHH Giải pháp số DIGISO
            </p>
            <p className={`mt-3 text-center text-sm text-slate-400 ${lc(language, 'en')}`}>
              DIGISO Digital Solutions Co., Ltd.
            </p>

            {/* Chuyển ngôn ngữ: dạng phân đoạn, không dùng emoji — trông trang trọng hơn */}
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
          {/* Thanh meta: ngày cập nhật và áp dụng phải đúng thời điểm thực tế tải lên */}
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
                Áp dụng cho: founderai.biz
              </span>
              <span className={lc(language, 'en')}>
                Updated on <strong>29/09/2026</strong> — Effective from <strong>29/09/2026</strong>
                {' · '}<a href="#lich-su-cap-nhat" className="font-medium text-orange-600 hover:underline">Archived versions</a>
                {' '}|{' '}
                Applies to: founderai.biz
              </span>
            </p>
          </div>

          <div className="pp-section px-5 py-6 sm:px-8 sm:py-7">
            <p className={`mb-3 text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
              Chính sách bảo mật này mô tả cách Công ty TNHH Giải pháp số DIGISO (&quot;chúng tôi&quot;) thu thập, sử dụng, lưu trữ và bảo vệ thông tin cá nhân của bạn khi sử dụng nền tảng Founder AI (founderai.biz), tuân thủ Luật Bảo vệ dữ liệu cá nhân số 91/2025/QH15, Nghị định số 356/2025/NĐ-CP, Luật Thương mại điện tử 2025, Nghị định số 248/2026/NĐ-CP, Luật Bảo vệ quyền lợi người tiêu dùng và các quy định pháp luật khác có liên quan.
            </p>
            <p className={`mb-3 text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
              This Privacy Policy describes how DIGISO Digital Solutions Co., Ltd. (&quot;we&quot;) collects, uses, stores and protects your personal information when you use the Founder AI platform (founderai.biz), in compliance with Personal Data Protection Law No. 91/2025/QH15, Decree No. 356/2025/NĐ-CP, the 2025 E-Commerce Law, Decree No. 248/2026/NĐ-CP, the Consumer Protection Law and other relevant regulations.
            </p>
            <p className={`text-slate-600 leading-relaxed ${lc(language, 'vi')}`}>
              DIGISO có hai vai trò khác nhau tùy tình huống, nên chính sách được chia thành ba phần. Hãy chọn phần đúng với trường hợp của bạn:
            </p>
            <p className={`text-slate-600 leading-relaxed ${lc(language, 'en')}`}>
              DIGISO plays two different roles depending on the situation, so this policy is divided into three parts. Choose the part that matches your situation:
            </p>
            <nav className="mt-4" aria-label={language === 'vi' ? 'Mục lục' : 'Contents'}>
              <ol className="space-y-2 text-[14px]">
                {PARTS.map((part) => (
                  <li key={part.id}>
                    <a
                      href={`#${part.id}`}
                      className="block rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-medium text-slate-800 no-underline transition-colors hover:border-orange-300 hover:bg-orange-50"
                    >
                      <span className="mr-2 font-bold text-orange-600">{part.roman}.</span>
                      {part.title[language]}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>
          </div>

          {/* PHẦN (I) */}
          <PartHeading part={PARTS[0]} language={language} />
          <div className="space-y-6">
            {PART_I_SECTIONS.map((s) => (
              <section key={s.id} id={s.id} className="pp-section scroll-mt-6 px-5 py-6 sm:px-8 sm:py-8">
                <div className="mb-5 flex items-start gap-4 border-b border-slate-100 pb-4">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[13px] font-semibold tabular-nums text-slate-800 shadow-sm">
                    {s.num}
                  </div>
                  <div>
                    <h3 className="pt-0.5 text-lg font-bold tracking-tight text-slate-900 sm:text-xl">{s.title[language]}</h3>
                    {s.ref ? (
                      <p className="mt-0.5 text-[12px] text-slate-400">
                        {language === 'vi' ? 'Điều 5 khoản 1 điểm ' : 'Article 5(1)(point '}
                        {s.ref}
                        {language === 'vi' ? ' Nghị định 248/2026/NĐ-CP' : ') of Decree 248/2026/NĐ-CP'}
                      </p>
                    ) : null}
                  </div>
                </div>
                {s.blocks.map((b, i) => (
                  <Block key={i} block={b} language={language} />
                ))}
              </section>
            ))}
          </div>

          {/* PHẦN (II) */}
          <PartHeading part={PARTS[1]} language={language} />
          <PrivacyPolicyProcessorPanel language={language} lc={lc} />

          {/* PHẦN (III) */}
          <PartHeading part={PARTS[2]} language={language} />
          <PrivacyPolicyControllerPanel language={language} lc={lc} />

          {/* Khối liên hệ: tông tối chừng mực, lưới thẻ rõ ràng */}
          <div className="mt-10 overflow-hidden rounded-2xl border border-slate-700/30 bg-gradient-to-b from-slate-900 to-slate-950 px-5 py-8 text-white shadow-xl sm:px-8 sm:py-10">
            <div className="mb-6 max-w-2xl">
              <h2 className={`text-lg font-bold tracking-tight text-white sm:text-xl ${lc(language, 'vi')}`}>
                Liên hệ về Quyền riêng tư
              </h2>
              <h2 className={`text-lg font-bold tracking-tight text-white sm:text-xl ${lc(language, 'en')}`}>
                Privacy Contact
              </h2>
              <p className={`mt-2 text-[14px] leading-relaxed text-slate-300 ${lc(language, 'vi')}`}>
                Nếu bạn có câu hỏi hoặc yêu cầu liên quan đến chính sách bảo mật và dữ liệu cá nhân, vui lòng liên hệ:
              </p>
              <p className={`mt-2 text-[14px] leading-relaxed text-slate-300 ${lc(language, 'en')}`}>
                For questions or requests regarding this privacy policy and personal data, please contact:
              </p>
            </div>
            {/* Grid cho tiếng Việt */}
            <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${lc(language, 'vi')}`}>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Công ty</div>
                <div className="break-words text-[13.5px] leading-snug text-slate-100">Công ty TNHH Giải pháp số DIGISO</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Website</div>
                <div className="break-words text-[13.5px] leading-relaxed text-slate-100">
                  <a href="https://digiso.vn" target="_blank" rel="noopener noreferrer" className="text-orange-400 no-underline hover:underline">digiso.vn</a>
                  {'\u00a0'}·{'\u00a0'}
                  <a href="https://founderai.biz" target="_blank" rel="noopener noreferrer" className="text-orange-400 no-underline hover:underline">founderai.biz</a>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Email Bảo mật</div>
                <div className="break-words text-[13.5px]">
                  <a href="mailto:info@digiso.vn" className="text-orange-400 no-underline hover:underline">info@digiso.vn</a>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Điện thoại</div>
                <div className="break-words text-[13.5px] text-slate-100">0877 909 606</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">MST</div>
                <div className="break-words text-[13.5px] text-slate-100">0316725362</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Địa chỉ</div>
                <div className="break-words text-[13.5px] text-slate-100 leading-relaxed">
                  Phòng I.101B Toà nhà A, Khu Công nghệ Phần mềm Đại học Quốc gia Tp. Hồ Chí Minh
                </div>
              </div>
            </div>

            {/* Grid cho tiếng Anh */}
            <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${lc(language, 'en')}`}>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Company</div>
                <div className="break-words text-[13.5px] leading-snug text-slate-100">DIGISO Digital Solutions Co., Ltd.</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Website</div>
                <div className="break-words text-[13.5px] leading-relaxed text-slate-100">
                  <a href="https://digiso.vn" target="_blank" rel="noopener noreferrer" className="text-orange-400 no-underline hover:underline">digiso.vn</a>
                  {'\u00a0'}·{'\u00a0'}
                  <a href="https://founderai.biz" target="_blank" rel="noopener noreferrer" className="text-orange-400 no-underline hover:underline">founderai.biz</a>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Privacy Email</div>
                <div className="break-words text-[13.5px]">
                  <a href="mailto:info@digiso.vn" className="text-orange-400 no-underline hover:underline">info@digiso.vn</a>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Phone</div>
                <div className="break-words text-[13.5px] text-slate-100">0877 909 606</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Tax ID</div>
                <div className="break-words text-[13.5px] text-slate-100">0316725362</div>
              </div>
              <div className="rounded-xl border border-white/10 bg-white/[0.06] px-4 py-4 backdrop-blur-sm transition-colors hover:bg-white/[0.09]">
                <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-orange-400/95">Address</div>
                <div className="break-words text-[13.5px] text-slate-100 leading-relaxed">
                  Room I.101B, Building A, Software Technology Park, Vietnam National University HCMC
                </div>
              </div>
            </div>
          </div>
        </div>

        <footer className="border-t border-slate-200 bg-white px-5 py-8 text-center text-[12px] text-slate-500">
          <p className={lc(language, 'vi')}>
            © 2026 Công ty TNHH Giải pháp số DIGISO. Mọi quyền được bảo lưu.
            {'\u00a0'}|{'\u00a0'}
            <a href="https://digiso.vn" className="font-medium text-slate-700 no-underline hover:underline">
              digiso.vn
            </a>
            {'\u00a0'}·{'\u00a0'}
            <a href="https://founderai.biz" className="font-medium text-slate-700 no-underline hover:underline">
              founderai.biz
            </a>
          </p>
          <p className={lc(language, 'en')}>
            © 2026 DIGISO Digital Solutions Co., Ltd. All rights reserved.
            {'\u00a0'}|{'\u00a0'}
            <a href="https://digiso.vn" className="font-medium text-slate-700 no-underline hover:underline">
              digiso.vn
            </a>
            {'\u00a0'}·{'\u00a0'}
            <a href="https://founderai.biz" className="font-medium text-slate-700 no-underline hover:underline">
              founderai.biz
            </a>
          </p>
          <p className={lc(language, 'vi')}>
            Chính sách này được cập nhật và có hiệu lực từ ngày 29/09/2026.
          </p>
          <p className={lc(language, 'en')}>
            This policy was last updated and effective from September 29, 2026.
          </p>
        </footer>
        <PolicyHistory slug="privacy" language={language} lc={lc} />
      </div>
    </div>
  );
}

export default PrivacyPolicy;
