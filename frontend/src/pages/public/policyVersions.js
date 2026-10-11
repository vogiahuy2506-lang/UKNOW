/**
 * Sổ phiên bản của 11 chính sách công khai (Nghị định 248/2026/NĐ-CP).
 *
 * - `versions`: ngày bắt đầu có hiệu lực (YYYY-MM-DD), MỚI NHẤT TRƯỚC. `versions[0]` = phiên bản hiện hành.
 * - `files`: các file trang cấu thành văn bản (thứ tự cố định, dùng để băm).
 * - `currentHash`: sha256 nội dung `files` (xem `__tests__/policyHash.js`). Guard
 *   `__tests__/PolicyVersionsGuard.spec.js` đỏ khi file bị sửa mà hash chưa được cập nhật.
 * - Toàn văn các phiên bản CŨ nằm ở `policyArchive/<slug>/<YYYY-MM-DD>/`, nạp qua `policyArchive/index.js`.
 *
 * QUY TRÌNH khi sửa lời văn một chính sách (thay đổi thực chất):
 *   1. Thông báo người dùng TRƯỚC ÍT NHẤT 15 NGÀY (cam kết trong chính văn bản):
 *      ngày hiệu lực mới >= ngày thông báo + 15.
 *   2. TRƯỚC khi sửa: chép nguyên các file trong `files` sang
 *      `policyArchive/<slug>/<ngày hiện hành cũ>/`, sửa đường import tương đối cho chạy được,
 *      BỎ `<PolicyHistory>` và liên kết "Các phiên bản đã lưu trữ" đầu trang trong bản chép;
 *      thêm loader vào `policyArchive/index.js`.
 *      Từ phiên bản lưu trữ ĐẦU TIÊN, `PolicyHistory` sinh `<Link>` → 9 ca test đang render trang trần không có
 *      Router (`__tests__/PolicyPages.spec.jsx`, `__tests__/PrivacyPolicyPage.spec.jsx`) sẽ đỏ "useHref() may be
 *      used only in the context of a <Router>": bọc chúng trong `<MemoryRouter>`, đừng đổi `Link` thành `<a>`.
 *   3. Sửa file trang; đổi dòng "Cập nhật ngày … — Áp dụng từ …"; thêm ngày mới vào ĐẦU `versions`;
 *      cập nhật `currentHash`.
 *   4. Nếu là terms/privacy/dpa: tăng `version` + `hash` ở `backend/src/config/legalDocuments.config.js`
 *      (người dùng sẽ phải đồng ý lại).
 *
 * Sửa KHÔNG thực chất (chính tả hiển thị, class CSS…): chỉ cập nhật `currentHash`
 * (và `hash` backend nếu là 3 văn bản terms/privacy/dpa) — không tăng version, không thêm phiên bản.
 */
export const POLICY_VERSIONS = {
  terms: {
    path: '/terms',
    titleVi: 'Điều khoản sử dụng dịch vụ',
    titleEn: 'Terms of Service',
    files: ['TermsOfService.jsx'],
    currentHash: '77a0a5b6d4bce7f17747cdeb29f47bd66c7dcb093df149a9647066081234129d',
    versions: ['2026-09-29'],
  },
  privacy: {
    path: '/privacy-policy',
    titleVi: 'Chính Sách Bảo Mật',
    titleEn: 'Privacy Policy',
    files: ['PrivacyPolicy.jsx', 'PrivacyPolicyControllerPanel.jsx', 'PrivacyPolicyProcessorPanel.jsx'],
    currentHash: '39342dac26e364b0fc6e49bc0f07f103b02d88fc4e8a3127088af2f6a407fbb2',
    versions: ['2026-09-29'],
  },
  dpa: {
    path: '/public-dpa',
    titleVi: 'Thỏa Thuận Xử Lý Dữ Liệu Cá Nhân',
    titleEn: 'Personal Data Processing Agreement',
    files: ['PublicDPA.jsx'],
    currentHash: '03ef0da3326dc74d9ae84883094c013585a5c8c79b8c80c567680d4a857c5807',
    versions: ['2026-09-29'],
  },
  pricing: {
    path: '/pricing-policy',
    titleVi: 'Chính sách về giá',
    titleEn: 'Pricing Policy',
    files: ['PricingPolicy.jsx'],
    currentHash: 'e5992f4457ad2556543e7f6cb4ff0246ea1e6465202b28b840bafe344d9590cd',
    versions: ['2026-09-29'],
  },
  payment: {
    path: '/payment-policy',
    titleVi: 'Chính sách về thanh toán',
    titleEn: 'Payment Policy',
    files: ['PaymentPolicy.jsx'],
    currentHash: '4f0a022086b8888fb606c8e7aefe145dec6e213ab9b2430c3e0dee482aa14460',
    versions: ['2026-09-29'],
  },
  complaint: {
    path: '/complaint-policy',
    titleVi: 'Phương thức tiếp nhận và giải quyết phản ánh, yêu cầu, khiếu nại',
    titleEn: 'Procedure for Receiving and Resolving Feedback, Requests and Complaints',
    files: ['ComplaintPolicy.jsx'],
    currentHash: 'a6aede37f4e3adef9b4cc3637e4b03c1ac4cc5edaee97bbb327145cb4ebb9e67',
    versions: ['2026-09-29'],
  },
  serviceTerms: {
    path: '/service-terms',
    titleVi: 'Các điều kiện hoặc hạn chế trong việc cung cấp dịch vụ trên nền tảng',
    titleEn: 'Conditions and Restrictions on the Provision of Services on the Platform',
    files: ['ServiceTerms.jsx'],
    currentHash: 'd6e67e81d5e0248534ae35ab27892e58136e18d3aa45c697ee6494ea6b8c411b',
    versions: ['2026-09-29'],
  },
  delivery: {
    path: '/service-delivery-policy',
    titleVi: 'Chính sách về phương thức cung cấp dịch vụ',
    titleEn: 'Service Delivery Policy',
    files: ['ServiceDeliveryPolicy.jsx'],
    currentHash: 'ae9ff6658ce33155750ea1aebaec3addac0f630c352f13e0942c2c47bfe02af4',
    versions: ['2026-09-29'],
  },
  refund: {
    path: '/refund-policy',
    titleVi: 'Chính sách chấm dứt dịch vụ và hoàn tiền',
    titleEn: 'Service Termination and Refund Policy',
    files: ['RefundPolicy.jsx'],
    currentHash: '21299ae09ebe6efc52648f15e2fdc68741c6b54f2387bdcb057795765d073c27',
    versions: ['2026-09-29'],
  },
  rights: {
    path: '/rights-and-duties',
    titleVi: 'Quyền và nghĩa vụ của các bên',
    titleEn: 'Rights and Obligations of the Parties',
    files: ['RightsAndDuties.jsx'],
    currentHash: 'dc5d1921af7a3ba0d219cb5cd1f272b687d60598ef7d4fceb24b3c95105fd6ba',
    versions: ['2026-09-29'],
  },
  support: {
    path: '/support',
    titleVi: 'Hình thức hỗ trợ trực tuyến',
    titleEn: 'Online Support',
    files: ['Support.jsx'],
    currentHash: '1551a36162dc4d989a3a1f554012ec16663a28aba05ab96c4b5403b3039d4b8d',
    versions: ['2026-09-29'],
  },
};
