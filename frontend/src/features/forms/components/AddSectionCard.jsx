/**
 * Thẻ thu gọn của một khối tuỳ chọn trong trình soạn biểu mẫu (Đặt lịch hẹn / Thu tiền / Giao diện).
 * Bấm vào thì khối thật mở ra (state do FormEditorPage giữ). Khối đang bật tính năng nào thì
 * FormEditorPage mở sẵn khối đó, không dựng thẻ này.
 *
 * @param {{
 *   id: string,
 *   title: string,
 *   hint?: string,
 *   icon: import('react').ComponentType<{ className?: string }>,
 *   onOpen: () => void,
 * }} props
 */
export default function AddSectionCard({ id, title, hint, icon: Icon, onOpen }) {
  return (
    <button
      type="button"
      id={id}
      aria-expanded="false"
      onClick={onOpen}
      className="w-full flex items-center gap-3 text-left bg-white rounded-2xl border border-dashed border-gray-300 hover:border-orange-300 hover:bg-orange-50/40 px-5 py-4 transition-all group"
    >
      <span className="p-2 rounded-xl bg-gray-100 text-gray-500 group-hover:bg-orange-100 group-hover:text-orange-600 transition-colors shrink-0">
        <Icon className="w-5 h-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-gray-800 group-hover:text-orange-700">{title}</span>
        {hint && <span className="block text-xs text-gray-500 mt-0.5">{hint}</span>}
      </span>
    </button>
  );
}
