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
    currentHash: '16957d7458a662fcf7952fe93bb67e106c7a3911902ce2db22e1af607e92f2c5',
    versions: ['2026-09-29'],
  },
  privacy: {
    path: '/privacy-policy',
    titleVi: 'Chính Sách Bảo Mật',
    titleEn: 'Privacy Policy',
    files: ['PrivacyPolicy.jsx', 'PrivacyPolicyControllerPanel.jsx', 'PrivacyPolicyProcessorPanel.jsx'],
    currentHash: 'f6d6180cdd611767a18e2747bd76db2017ff2bcd90e04a890fd1e9aa3f57231a',
    versions: ['2026-09-29'],
  },
  dpa: {
    path: '/public-dpa',
    titleVi: 'Thỏa Thuận Xử Lý Dữ Liệu Cá Nhân',
    titleEn: 'Personal Data Processing Agreement',
    files: ['PublicDPA.jsx'],
    currentHash: 'b7d0d37f50a039637ebabc3a6b05669f84206f34bdcd14857e663c3439479310',
    versions: ['2026-09-29'],
  },
  pricing: {
    path: '/pricing-policy',
    titleVi: 'Chính sách về giá',
    titleEn: 'Pricing Policy',
    files: ['PricingPolicy.jsx'],
    currentHash: '4d8ba3d18a9b6556ef5a2cdb5299664fcda8f350681526be67b896b0b8a2aa60',
    versions: ['2026-09-29'],
  },
  payment: {
    path: '/payment-policy',
    titleVi: 'Chính sách về thanh toán',
    titleEn: 'Payment Policy',
    files: ['PaymentPolicy.jsx'],
    currentHash: 'c3bba7958e50596fcaa0b625f2796e23de64d8351f0b1aa9b79909794609c6cd',
    versions: ['2026-09-29'],
  },
  complaint: {
    path: '/complaint-policy',
    titleVi: 'Phương thức tiếp nhận và giải quyết phản ánh, yêu cầu, khiếu nại',
    titleEn: 'Procedure for Receiving and Resolving Feedback, Requests and Complaints',
    files: ['ComplaintPolicy.jsx'],
    currentHash: 'c9d9798469a424021682c2e7cad4e60dc0c5e307081c93286373f3750c9ba0d1',
    versions: ['2026-09-29'],
  },
  serviceTerms: {
    path: '/service-terms',
    titleVi: 'Các điều kiện hoặc hạn chế trong việc cung cấp dịch vụ trên nền tảng',
    titleEn: 'Conditions and Restrictions on the Provision of Services on the Platform',
    files: ['ServiceTerms.jsx'],
    currentHash: 'bed02a6b3d6a44fed086a2cad91af04560a47612a60592e9012260f1847055a9',
    versions: ['2026-09-29'],
  },
  delivery: {
    path: '/service-delivery-policy',
    titleVi: 'Chính sách về phương thức cung cấp dịch vụ',
    titleEn: 'Service Delivery Policy',
    files: ['ServiceDeliveryPolicy.jsx'],
    currentHash: 'ff96dc15c306f3e26f462539268b4f6244d5d7fb0ee957f8a2588b0e3f7880c2',
    versions: ['2026-09-29'],
  },
  refund: {
    path: '/refund-policy',
    titleVi: 'Chính sách chấm dứt dịch vụ và hoàn tiền',
    titleEn: 'Service Termination and Refund Policy',
    files: ['RefundPolicy.jsx'],
    currentHash: '98674c8190aee5958b22004f3376c750ab4077475056a94a37103b8e702311e2',
    versions: ['2026-09-29'],
  },
  rights: {
    path: '/rights-and-duties',
    titleVi: 'Quyền và nghĩa vụ của các bên',
    titleEn: 'Rights and Obligations of the Parties',
    files: ['RightsAndDuties.jsx'],
    currentHash: '6a7b5a9264c60d50c2b6500492e530cfd349e50cfba8b73f47d78fdd78dc87c5',
    versions: ['2026-09-29'],
  },
  support: {
    path: '/support',
    titleVi: 'Hình thức hỗ trợ trực tuyến',
    titleEn: 'Online Support',
    files: ['Support.jsx'],
    currentHash: 'a25ad5789084846fdb2809754356da88833cc5b2694f25713ab3d2d5e9cf893c',
    versions: ['2026-09-29'],
  },
};
