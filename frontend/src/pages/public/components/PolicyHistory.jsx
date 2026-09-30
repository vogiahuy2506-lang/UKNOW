import { Link } from 'react-router-dom';
import { POLICY_VERSIONS } from '../policyVersions.js';

/**
 * Khối "Lịch sử cập nhật" đặt cuối mỗi trang chính sách.
 *
 * Chỉ liệt kê NGÀY của từng phiên bản (mới nhất trước). Phiên bản hiện hành có nhãn, không liên kết;
 * phiên bản cũ liên kết tới toàn văn tại `/policy-versions/<slug>/<date>`. Không có lý do/ghi chú cập nhật.
 * Nguồn dữ liệu: `policyVersions.js`.
 *
 * Props:
 *   @param {string} slug       Khoá trong POLICY_VERSIONS (vd 'terms')
 *   @param {string} language   'vi' | 'en'
 *   @param {(a, b) => string} lc  Hàm class ẩn/hiện theo ngôn ngữ
 *
 * @returns {JSX.Element | null}
 */
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// 'YYYY-MM-DD' → { vi: 'DD/MM/YYYY', en: 'Month D, YYYY' }
function formatPolicyDate(iso) {
  if (!iso || typeof iso !== 'string') return { vi: iso, en: iso };
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return { vi: iso, en: iso };
  return {
    vi: `${d}/${m}/${y}`,
    en: `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`,
  };
}

export default function PolicyHistory({ slug, language, lc }) {
  const entry = POLICY_VERSIONS[slug];
  const versions = entry?.versions;
  if (!Array.isArray(versions) || versions.length === 0) return null;

  const labels = {
    vi: {
      title: 'Lịch sử cập nhật',
      hint: 'Toàn văn các phiên bản của chính sách này, theo ngày bắt đầu có hiệu lực.',
      current: 'Phiên bản hiện hành',
    },
    en: {
      title: 'Update history',
      hint: 'The full text of every version of this policy, by the date it took effect.',
      current: 'Current version',
    },
  };

  const dateClass = 'font-semibold tabular-nums';

  return (
    <section
      id="lich-su-cap-nhat"
      data-policy-history
      className="mt-10 scroll-mt-6 rounded-xl border border-slate-200 bg-white px-5 py-5 shadow-sm sm:px-7 sm:py-6"
      aria-label={language === 'vi' ? 'Lịch sử cập nhật' : 'Update history'}
    >
      <h3 className={`mb-1.5 text-base font-semibold text-slate-800 ${lc(language, 'vi')}`}>
        {labels.vi.title}
      </h3>
      <h3 className={`mb-1.5 text-base font-semibold text-slate-800 ${lc(language, 'en')}`}>
        {labels.en.title}
      </h3>
      <p className={`mb-4 text-[13px] text-slate-500 ${lc(language, 'vi')}`}>{labels.vi.hint}</p>
      <p className={`mb-4 text-[13px] text-slate-500 ${lc(language, 'en')}`}>{labels.en.hint}</p>
      <ol className="space-y-2.5">
        {versions.map((date, idx) => {
          const label = formatPolicyDate(date);
          return (
            <li
              key={date}
              className="flex flex-col gap-0.5 border-l-2 border-orange-400/70 pl-3 text-[13px] text-slate-600 sm:flex-row sm:gap-3"
            >
              {idx === 0 ? (
                <>
                  <span className={`${dateClass} text-slate-700 ${lc(language, 'vi')}`}>{label.vi}</span>
                  <span className={`${dateClass} text-slate-700 ${lc(language, 'en')}`}>{label.en}</span>
                  <span className={lc(language, 'vi')}>{labels.vi.current}</span>
                  <span className={lc(language, 'en')}>{labels.en.current}</span>
                </>
              ) : (
                <>
                  <Link
                    to={`/policy-versions/${slug}/${date}`}
                    className={`${dateClass} text-orange-600 hover:underline ${lc(language, 'vi')}`}
                  >
                    {label.vi}
                  </Link>
                  <Link
                    to={`/policy-versions/${slug}/${date}`}
                    className={`${dateClass} text-orange-600 hover:underline ${lc(language, 'en')}`}
                  >
                    {label.en}
                  </Link>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
