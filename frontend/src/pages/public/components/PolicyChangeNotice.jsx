/**
 * Khung thông báo thay đổi giờ hỗ trợ hotline (đăng 04/10/2026, có hiệu lực 19/10/2026), đặt ngay dưới dòng
 * "Cập nhật ngày … — Áp dụng từ …" của ba trang chính sách còn ghi giờ cũ: Support, PaymentPolicy, ComplaintPolicy.
 *
 * Vì sao có khung này: rút giờ hỗ trợ là thay đổi THỰC CHẤT; Điều khoản sử dụng (mục 13) cam kết báo trước >= 15 ngày
 * và công bố ngày hiệu lực cụ thể (04/10 + 15 ngày = 19/10/2026). Tới hết 18/10/2026 văn bản 8:00 – 22:00, Thứ 2 – Thứ 7
 * vẫn là văn bản hiện hành — khung này chỉ NÓI TRƯỚC, không đổi điều khoản.
 *
 * Chữ viết thẳng ở đây (không qua i18n), cùng kiểu với phần thân các trang chính sách: từ điển i18n bị
 * `src/test/publicFalseClaims.spec.js` cấm các chuỗi giờ cũ (22:00 / Thứ 2 - Thứ 7).
 *
 * Component này KHÔNG nằm trong `files` của `policyVersions.js` nên không vào hash chính sách.
 * Khi bản giờ mới lên (PR-P2), ba trang bỏ khung này; các bản lưu trữ `policyArchive/<slug>/2026-09-29/` vẫn dùng nó
 * (đó là văn bản đã hiển thị lúc đó) — đừng sửa chữ hay xoá file mà không xem các bản lưu trữ.
 *
 * Props:
 *   @param {string} language   'vi' | 'en'
 *   @param {(a, b) => string} lc  Hàm class ẩn/hiện theo ngôn ngữ (cùng chữ ký với các trang chính sách)
 *
 * @returns {JSX.Element}
 */
export default function PolicyChangeNotice({ language, lc }) {
  return (
    <aside
      data-policy-change-notice
      role="note"
      aria-label={language === 'vi' ? 'Thông báo thay đổi giờ hỗ trợ' : 'Notice of change to support hours'}
      className="-mt-4 mb-8 rounded-xl border border-amber-300 border-l-4 border-l-amber-500 bg-amber-50 px-5 py-4 text-[13px] leading-relaxed text-amber-950 shadow-sm"
    >
      <p className={lc(language, 'vi')}>
        <strong>Thông báo thay đổi giờ hỗ trợ</strong> (đăng ngày 04/10/2026): Từ ngày <strong>19/10/2026</strong>, hotline
        hỗ trợ làm việc <strong>Thứ 2 – Thứ 6, 8:30 – 17:00</strong> (giờ Việt Nam), thay cho 8:00 – 22:00, Thứ 2 – Thứ 7.
        Đến hết ngày 18/10/2026, giờ hỗ trợ hiện hành vẫn được áp dụng.
      </p>
      <p className={lc(language, 'en')}>
        <strong>Notice of change to support hours</strong> (posted October 4, 2026): From <strong>October 19, 2026</strong>,
        the support hotline will operate <strong>Monday – Friday, 8:30 AM – 5:00 PM</strong> (Vietnam time), replacing
        8:00 AM – 10:00 PM, Monday – Saturday. Until the end of October 18, 2026, the current support hours continue to
        apply.
      </p>
    </aside>
  );
}
