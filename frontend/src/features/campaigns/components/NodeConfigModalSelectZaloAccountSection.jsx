/**
 * Section UI cho node chọn tài khoản Zalo: một TK mặc định hoặc pool nhiều TK (gán bền theo slot).
 *
 * Luồng:
 * - Tắt pool: chọn đúng một TK như trước (dropdown).
 * - Bật pool: tick các TK dùng cho chiến dịch; TK mặc định lấy tài khoản đầu trong danh sách đã chọn.
 *
 * @param {Object} props
 * @param {Object} props.formData
 * @param {Function} props.setFormData
 * @param {Array<{id: string, displayName: string, status: string, isActive: boolean, isDefault: boolean}>} props.zaloAccounts
 * @returns {JSX.Element}
 */
export const NodeConfigSelectZaloAccountSection = ({ formData, setFormData, zaloAccounts = [] }) => {
  const sortedAccounts = [...zaloAccounts].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.displayName.localeCompare(b.displayName, 'vi');
  });

  const poolEnabled = Boolean(formData.zaloPoolMultiAccountEnabled);
  const poolIds = Array.isArray(formData.zaloPoolAccountIds)
    ? formData.zaloPoolAccountIds.map(String).filter(Boolean)
    : [];

  const handleSingleAccountChange = (value) => {
    const selected = sortedAccounts.find((item) => item.id === value);
    setFormData((prev) => ({
      ...prev,
      zaloAccountId: value,
      zaloAccountName: selected?.displayName || '',
    }));
  };

  const togglePoolAccount = (idStr, checked) => {
    setFormData((prev) => {
      const cur = Array.isArray(prev.zaloPoolAccountIds)
        ? prev.zaloPoolAccountIds.map(String)
        : [];
      const next = checked
        ? [...new Set([...cur, idStr])]
        : cur.filter((x) => x !== idStr);
      const first = next[0] || '';
      const acc = sortedAccounts.find((item) => String(item.id) === first);
      return {
        ...prev,
        zaloPoolAccountIds: next,
        zaloAccountId: first,
        zaloAccountName: acc?.displayName || prev.zaloAccountName || '',
      };
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Tên node</label>
        <input
          type="text"
          value={formData.label}
          onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          placeholder="Chọn tài khoản Zalo"
        />
      </div>

      <div className="rounded-lg border border-gray-200 p-3 space-y-3">
        <label className="flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            checked={poolEnabled}
            onChange={(e) => {
              const on = e.target.checked;
              setFormData((prev) => {
                if (on) {
                  const seed = String(prev.zaloAccountId || '').trim();
                  const initialPool = seed ? [seed] : [];
                  const acc = sortedAccounts.find((item) => String(item.id) === seed);
                  return {
                    ...prev,
                    zaloPoolMultiAccountEnabled: true,
                    zaloPoolAccountIds: initialPool,
                    zaloAccountName: acc?.displayName || prev.zaloAccountName || '',
                  };
                }
                const singleId = String(prev.zaloAccountId || '').trim();
                const acc = sortedAccounts.find((item) => String(item.id) === singleId);
                return {
                  ...prev,
                  zaloPoolMultiAccountEnabled: false,
                  zaloPoolAccountIds: [],
                  zaloAccountName: acc?.displayName || prev.zaloAccountName || '',
                };
              });
            }}
          />
          <span className="text-sm text-gray-800">
            <span className="font-medium text-gray-900">Gửi qua nhiều tài khoản Zalo (pool)</span>
            <span className="block mt-1 text-gray-600 leading-snug">
              Tick các tài khoản bên dưới để tạo nhóm gửi. Mỗi số điện thoại nhận tin sẽ được gắn cố định một tài khoản
              trong nhóm; hệ thống phân bổ ngẫu nhiên theo từng lượt gửi để chia đều tải.
            </span>
          </span>
        </label>

        {poolEnabled ? (
          <div className="space-y-2 pl-1">
            <div className="text-sm font-medium text-gray-700">Chọn tài khoản dùng cho chiến dịch</div>
            <div className="max-h-44 overflow-y-auto space-y-2 border border-gray-100 rounded p-2">
              {sortedAccounts.map((acc) => {
                const idStr = String(acc.id || '');
                const selected = poolIds.includes(idStr);
                return (
                  <label key={idStr} className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                      checked={selected}
                      onChange={(e) => togglePoolAccount(idStr, e.target.checked)}
                    />
                    {acc.displayName || idStr}
                    {acc.isDefault ? ' (Mặc định)' : ''}
                  </label>
                );
              })}
            </div>
            {sortedAccounts.length === 0 && (
              <p className="text-xs text-amber-700">Chưa có tài khoản Zalo. Vui lòng thêm ở Cài đặt Zalo.</p>
            )}
            <p className="text-xs text-amber-800 bg-amber-50 p-2 rounded">
              Khi bật pool: node «Lấy danh sách bạn bè Zalo» sẽ bị <strong>gỡ khỏi sơ đồ</strong> khi bạn bấm Lưu (không dùng
              làm nguồn gửi). Trên palette, node này cũng bị ẩn; preview và chạy thật sẽ không thực hiện bước lấy danh sách bạn bè.
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tài khoản Zalo gửi <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.zaloAccountId || ''}
              onChange={(e) => handleSingleAccountChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="">-- Chọn tài khoản --</option>
              {sortedAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.displayName}
                  {account.isDefault ? ' (Mặc định)' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {sortedAccounts.length === 0 && (
        <div className="bg-amber-50 p-3 rounded-lg text-sm text-amber-700">
          Chưa có tài khoản Zalo khả dụng. Vui lòng vào trang Cài đặt Zalo để đăng nhập tài khoản.
        </div>
      )}

      {!poolEnabled && formData.zaloAccountId && (
        <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700">
          Tài khoản được chọn sẽ dùng làm nguồn gửi cho các node Zalo ở phía sau (trừ khi bật pool nhiều tài khoản ở trên).
        </div>
      )}
    </div>
  );
};
