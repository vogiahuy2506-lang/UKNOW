/**
 * Section UI for select-zalo-account node configuration.
 *
 * @param {Object} props section props
 * @param {Object} props.formData current node form data
 * @param {Function} props.setFormData React setter for form data
 * @param {Array<{id: string, displayName: string, status: string, isActive: boolean, isDefault: boolean}>} props.zaloAccounts Zalo account options
 * @returns {JSX.Element}
 */
export const NodeConfigSelectZaloAccountSection = ({ formData, setFormData, zaloAccounts = [] }) => {
  const sortedAccounts = [...zaloAccounts].sort((a, b) => {
    if (a.isDefault && !b.isDefault) return -1;
    if (!a.isDefault && b.isDefault) return 1;
    return a.displayName.localeCompare(b.displayName, 'vi');
  });

  const handleAccountChange = (value) => {
    const selected = sortedAccounts.find((item) => item.id === value);
    setFormData((prev) => ({
      ...prev,
      zaloAccountId: value,
      zaloAccountName: selected?.displayName || '',
    }));
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

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Tài khoản Zalo gửi <span className="text-red-500">*</span>
        </label>
        <select
          value={formData.zaloAccountId || ''}
          onChange={(e) => handleAccountChange(e.target.value)}
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

      {sortedAccounts.length === 0 && (
        <div className="bg-amber-50 p-3 rounded-lg text-sm text-amber-700">
          Chưa có tài khoản Zalo khả dụng. Vui lòng vào trang Cài đặt Zalo để đăng nhập tài khoản.
        </div>
      )}

      {formData.zaloAccountId && (
        <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-700">
          Tài khoản được chọn sẽ dùng làm nguồn gửi cho các node Zalo ở phía sau.
        </div>
      )}
    </div>
  );
};
