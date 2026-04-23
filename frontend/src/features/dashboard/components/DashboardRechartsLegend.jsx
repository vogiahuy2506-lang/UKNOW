/**
 * Chú thích tùy chỉnh cho Recharts: căn giữa, xuống dòng khi nhiều series — tránh cắt bên phải.
 *
 * Luồng: Recharts truyền `payload` (màu + nhãn); render flex-wrap + justify-center.
 *
 * @param {object} props
 * @param {Array<{ value?: string, color?: string }>} [props.payload]
 * @returns {JSX.Element|null}
 */
export default function DashboardRechartsLegend({ payload }) {
  if (!payload?.length) return null;

  return (
    <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 px-1 pt-3 text-[12px] leading-snug text-slate-500">
      {payload.map((entry, i) => (
        <span
          key={`legend-${entry.dataKey ?? entry.value ?? i}`}
          className="inline-flex items-center gap-1.5 max-w-full"
        >
          <span
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.color }}
            aria-hidden
          />
          <span className="break-words text-left">{entry.value}</span>
        </span>
      ))}
    </div>
  );
}
