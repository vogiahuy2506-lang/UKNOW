import { HiOutlineTable } from 'react-icons/hi';

/**
 * UI chọn cột dữ liệu cần giữ khi chạy node (giảm kích thước object trong RAM/log).
 *
 * Luồng hoạt động:
 * 1. Danh sách checkbox theo `options`.
 * 2. Rỗng = dùng tất cả cột (hành vi cũ).
 * 3. Có chọn = chỉ giữ các cột đó + các khóa hệ thống (luôn giữ ở backend).
 *
 * @param {object} props
 * @param {string} props.title
 * @param {{ key: string, label: string }[]} props.options
 * @param {string[]} props.selectedKeys
 * @param {function} props.setFormData
 * @param {string} props.formField tên field trong formData (vd: dataSelectedColumns)
 * @param {string} [props.hint]
 * @returns {JSX.Element}
 */
export function NodeConfigDataColumnPicker({
  title = 'Cột dữ liệu cần dùng',
  options = [],
  selectedKeys = [],
  setFormData,
  formField = 'dataSelectedColumns',
  hint = 'Để trống (không chọn cột) = dùng toàn bộ cột. Chọn cột để giảm dung lượng payload trong bộ nhớ và log.',
}) {
  const normalizedSelected = Array.isArray(selectedKeys) ? selectedKeys : [];
  const selectedSet = new Set(normalizedSelected);

  const setKeys = (nextKeys) => {
    setFormData((prev) => ({ ...prev, [formField]: nextKeys }));
  };

  const toggleKey = (key) => {
    const k = String(key || '').trim();
    if (!k) return;
    const next = new Set(normalizedSelected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    setKeys(Array.from(next));
  };

  const selectAllMeaningClear = () => setKeys([]);
  const selectListed = () => setKeys(options.map((o) => o.key).filter(Boolean));

  return (
    <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="flex items-center gap-2">
        <HiOutlineTable className="h-5 w-5 text-green-600" />
        <span className="text-sm font-medium text-gray-800">{title}</span>
        <span className="text-xs text-gray-500">
          (đang chọn {normalizedSelected.length}/{options.length || '—'})
        </span>
      </div>
      <p className="text-xs text-gray-600">{hint}</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={selectAllMeaningClear}
          className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
        >
          Dùng tất cả cột
        </button>
        {options.length > 0 ? (
          <button
            type="button"
            onClick={selectListed}
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
          >
            Chọn hết danh sách
          </button>
        ) : null}
      </div>

      {normalizedSelected.length > 0 ? (
        <div className="flex flex-wrap gap-2 rounded-md border border-dashed border-gray-300 bg-white p-2">
          {normalizedSelected.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => toggleKey(k)}
              className="inline-flex items-center rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-medium text-primary-800 hover:bg-primary-100"
              title="Nhấn để bỏ chọn"
            >
              {k}
              <span className="ml-1 text-primary-500">×</span>
            </button>
          ))}
        </div>
      ) : null}

      {options.length === 0 ? (
        <p className="text-sm text-amber-700">Chưa có danh sách cột. Hãy kiểm tra kết nối / tải mẫu dữ liệu trước.</p>
      ) : (
        <div
          className="max-h-48 space-y-2 overflow-y-auto rounded-md border border-gray-200 bg-white p-3"
          style={{ contain: 'layout paint' }}
        >
          {options.map((opt) => (
            <label key={opt.key} className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-primary-600"
                checked={selectedSet.has(opt.key)}
                onChange={() => toggleKey(opt.key)}
              />
              <span className="font-mono text-xs text-gray-800">{opt.key}</span>
              {opt.label && opt.label !== opt.key ? (
                <span className="text-xs text-gray-500">— {opt.label}</span>
              ) : null}
            </label>
          ))}
        </div>
      )}

      <p className="text-[11px] text-gray-500">
        Khi chạy chiến dịch, log node sẽ hiển thị dung lượng JSON tích lũy (UTF-8) và phần tiết kiệm ước lượng theo batch.
      </p>
    </div>
  );
}
