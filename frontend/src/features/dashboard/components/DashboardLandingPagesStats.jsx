import { useEffect, useMemo, useState } from 'react';

const PAGE_SIZE = 5;

/**
 * Bảng tổng hợp hiệu quả landing: view, click, submit (theo slug) — số liệu toàn thời gian (không theo bộ lọc ngày dashboard).
 *
 * @param {object} props
 * @param {{ filters?: object, rows?: object[] }} props.data
 */
const DashboardLandingPagesStats = ({ data }) => {
  const rows = useMemo(
    () => (Array.isArray(data?.rows) ? data.rows : []),
    [data?.rows]
  );
  const [page, setPage] = useState(1);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));

  useEffect(() => {
    setPage(1);
  }, [rows.length, data?.filters]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, page]);

  if (rows.length === 0) {
    return (
      <div className="card p-5 md:p-6">
        <h3 className="text-base font-semibold text-gray-900">Landing pages</h3>
        <p className="text-xs text-gray-400 mt-0.5">
          Lượt xem, click (link tracking), gửi form (toàn thời gian) — chưa có dữ liệu.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-5 md:p-6 overflow-x-auto">
      <h3 className="text-base font-semibold text-gray-900">Landing pages</h3>
      <p className="text-xs text-gray-400 mt-0.5 mb-4">
        Toàn thời gian — theo slug: lượt xem, click qua link trung gian, form submit; CTR = click/view; tỷ lệ form/view =
        submit/view.
      </p>
      <table className="min-w-[640px] w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
            <th className="pb-2 pr-3 font-medium">Slug</th>
            <th className="pb-2 pr-3 font-medium tabular-nums">Xem</th>
            <th className="pb-2 pr-3 font-medium tabular-nums">Click</th>
            <th className="pb-2 pr-3 font-medium tabular-nums">Form</th>
            <th className="pb-2 pr-3 font-medium tabular-nums">CTR %</th>
            <th className="pb-2 font-medium tabular-nums">Form/view %</th>
          </tr>
        </thead>
        <tbody>
          {pageRows.map((r) => (
            <tr key={r.slug} className="border-b border-gray-50 text-gray-800">
              <td className="py-2 pr-3 font-mono text-xs">{r.slug}</td>
              <td className="py-2 pr-3 tabular-nums">{Number(r.viewCount || 0).toLocaleString('vi-VN')}</td>
              <td className="py-2 pr-3 tabular-nums">{Number(r.clickCount || 0).toLocaleString('vi-VN')}</td>
              <td className="py-2 pr-3 tabular-nums">{Number(r.submitCount || 0).toLocaleString('vi-VN')}</td>
              <td className="py-2 pr-3 tabular-nums">{Number(r.clickThroughRatePct || 0).toLocaleString('vi-VN')}</td>
              <td className="py-2 tabular-nums">{Number(r.submitRateVsViewsPct || 0).toLocaleString('vi-VN')}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > PAGE_SIZE ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
          <span>
            Trang {page}/{totalPages} — {rows.length.toLocaleString('vi-VN')} slug
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-secondary text-xs py-1.5 px-3"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Trước
            </button>
            <button
              type="button"
              className="btn btn-secondary text-xs py-1.5 px-3"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Sau
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DashboardLandingPagesStats;
