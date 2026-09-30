import { Suspense, lazy, useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { POLICY_VERSIONS } from './policyVersions.js';
import { ARCHIVED_POLICY_LOADERS } from './policyArchive/index.js';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function fmt(iso) {
  const [y, m, d] = String(iso).split('-');
  return { vi: `${d}/${m}/${y}`, en: `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}` };
}

function NotFound({ currentPath }) {
  return (
    <div className="mx-auto max-w-2xl px-5 py-20 text-center">
      <h1 className="mb-2 text-xl font-semibold text-slate-800">Không tìm thấy phiên bản này</h1>
      <p className="mb-6 text-sm text-slate-500">Version not found</p>
      <Link to={currentPath} className="font-medium text-orange-600 hover:underline">
        Xem phiên bản hiện hành / View current version
      </Link>
    </div>
  );
}

/**
 * Trang xem toàn văn một phiên bản chính sách đã lưu trữ: `/policy-versions/:slug/:date`.
 * Dữ liệu: `policyVersions.js` (sổ) + `policyArchive/index.js` (bảng nạp lười).
 */
export default function PolicyArchivedVersionPage() {
  const { slug, date } = useParams();
  const entry = Object.prototype.hasOwnProperty.call(POLICY_VERSIONS, slug) ? POLICY_VERSIONS[slug] : null;
  const idx = entry ? entry.versions.indexOf(date) : -1;
  const key = `${slug}/${date}`;
  const loader = idx > 0 && Object.prototype.hasOwnProperty.call(ARCHIVED_POLICY_LOADERS, key)
    ? ARCHIVED_POLICY_LOADERS[key]
    : null;

  const Archived = useMemo(() => (loader ? lazy(loader) : null), [loader]);

  if (!entry) return <NotFound currentPath="/" />;
  if (idx === 0) return <Navigate to={entry.path} replace />;
  if (idx < 0 || !Archived) return <NotFound currentPath={entry.path} />;

  const own = fmt(date);
  const next = fmt(entry.versions[idx - 1]);

  return (
    <div>
      <div
        data-policy-archive-banner
        className="border-b border-amber-200 bg-amber-50 px-5 py-3 text-center text-[13px] leading-relaxed text-amber-900"
      >
        <p>
          Đây là phiên bản lưu trữ của {entry.titleVi}, có hiệu lực từ {own.vi} và đã được thay thế bởi phiên bản có
          hiệu lực từ {next.vi}.
        </p>
        <p>
          This is an archived version of {entry.titleEn}, effective from {own.en} and replaced by the version
          effective from {next.en}.
        </p>
        <p className="mt-1">
          <Link to={entry.path} className="font-medium text-orange-600 hover:underline">
            Xem phiên bản hiện hành / View current version
          </Link>
        </p>
      </div>
      <Suspense fallback={<div className="px-5 py-20 text-center text-sm text-slate-500">...</div>}>
        <Archived />
      </Suspense>
    </div>
  );
}
