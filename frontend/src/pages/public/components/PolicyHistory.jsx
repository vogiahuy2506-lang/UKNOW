/**
 * Khối "Lịch sử cập nhật" đặt cuối mỗi trang chính sách — đáp ứng yêu cầu tại
 * `Hướng dẫn cập nhật founderai.biz 25.09.md` Section 5: mỗi lần cập nhật phải
 * được lưu vết, khách hàng có thể xem lại bản cập nhật trước đó (tuân thủ Nghị định
 * 248/2026/NĐ-CP).
 *
 * Cập nhật hướng dẫn: thêm 1 entry mới ở đầu mảng `entries` mỗi lần policy đổi.
 * Mỗi entry là 1 dòng: `{ date: 'YYYY-MM-DD', note: { vi, en } }`.
 *
 * Props:
 *   @param {string} language   'vi' | 'en'
 *   @param {(a, b) => string} lc  Hàm class ẩn/hiện theo ngôn ngữ
 *   @param {Array<{ date: string, note: { vi: string, en: string } }>} entries
 *     Danh sách lịch sử cập nhật (mới nhất trước). Nếu bỏ trống, không render gì.
 *
 * @returns {JSX.Element | null}
 */
export default function PolicyHistory({ language, lc, entries }) {
  if (!Array.isArray(entries) || entries.length === 0) return null;

  const labels = {
    vi: {
      title: 'Lịch sử cập nhật',
      hint: 'Bạn có thể xem lại các phiên bản trước của chính sách này theo mốc thời gian bên dưới. Việc cập nhật được lưu vết theo quy định tại Nghị định 248/2026/NĐ-CP.',
    },
    en: {
      title: 'Update history',
      hint: 'You can review previous versions of this policy by date below. Update records are retained in accordance with Decree 248/2026/NĐ-CP.',
    },
  };

  const formatDate = (iso) => {
    if (!iso || typeof iso !== 'string') return iso;
    // 'YYYY-MM-DD' → 'DD/MM/YYYY' (VI) / 'Month DD, YYYY' (EN).
    const [y, m, d] = iso.split('-');
    if (!y || !m || !d) return iso;
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    return {
      vi: `${d}/${m}/${y}`,
      en: `${months[Number(m) - 1]} ${Number(d)}, ${y}`,
    };
  };

  return (
    <section
      className="mt-10 rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-7 sm:py-6"
      aria-label={language === 'vi' ? 'Lịch sử cập nhật' : 'Update history'}
    >
      <h3 className={`mb-1.5 text-base font-semibold text-slate-800 ${lc(language, 'vi')}`}>
        {labels.vi.title}
      </h3>
      <h3 className={`mb-1.5 text-base font-semibold text-slate-800 ${lc(language, 'en')}`}>
        {labels.en.title}
      </h3>
      <p className={`mb-4 text-[13px] text-slate-500 ${lc(language, 'vi')}`}>
        {labels.vi.hint}
      </p>
      <p className={`mb-4 text-[13px] text-slate-500 ${lc(language, 'en')}`}>
        {labels.en.hint}
      </p>
      <ol className="space-y-2.5">
        {entries.map((entry, idx) => {
          const fmt = formatDate(entry.date);
          const dateLabel = typeof fmt === 'object' ? fmt : { vi: fmt, en: fmt };
          return (
            <li
              key={`${entry.date}-${idx}`}
              className="flex flex-col gap-0.5 border-l-2 border-orange-400/70 pl-3 text-[13px] text-slate-600 sm:flex-row sm:gap-3"
            >
              <span className={`font-semibold tabular-nums text-slate-700 ${lc(language, 'vi')}`}>{dateLabel.vi}</span>
              <span className={`font-semibold tabular-nums text-slate-700 ${lc(language, 'en')}`}>{dateLabel.en}</span>
              <span className={`hidden sm:inline ${lc(language, 'vi')}`}>—</span>
              <span className={`hidden sm:inline ${lc(language, 'en')}`}>—</span>
              <span className={lc(language, 'vi')}>{entry.note.vi}</span>
              <span className={lc(language, 'en')}>{entry.note.en}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
