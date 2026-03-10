import { HiOutlineLink, HiOutlineMail, HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi';
import { buildDefaultCustomerFieldMap } from '../utils/nodeConfigModal.helpers';

/**
 * Section UI for save-customer node configuration.
 *
 * @param {Object} props section props
 * @param {Object} props.formData current node form data
 * @param {Function} props.setFormData React setter for form data
 * @param {string} props.selectedSaveCustomerSection active section id
 * @param {Function} props.setSelectedSaveCustomerSection section state setter
 * @param {Array} props.upstreamNodes upstream nodes list
 * @param {Function} props.getSaveCustomerSchema schema resolver callback
 * @returns {JSX.Element}
 */
export const NodeConfigSaveCustomerSection = ({
  formData,
  setFormData,
  selectedSaveCustomerSection,
  setSelectedSaveCustomerSection,
  upstreamNodes,
  getSaveCustomerSchema,
}) => {
  const safeFieldMap = buildDefaultCustomerFieldMap(
    formData.saveCustomerFieldMap || {},
    formData.saveCustomerNodeId || ''
  );

  const updateFieldMap = (fieldKey, patch) => {
    setFormData((prev) => {
      const base = buildDefaultCustomerFieldMap(prev.saveCustomerFieldMap || {}, prev.saveCustomerNodeId || '');
      return {
        ...prev,
        saveCustomerFieldMap: {
          ...base,
          [fieldKey]: { ...base[fieldKey], ...patch },
        },
      };
    });
  };

  const saveCustomerSections = [
    { id: 'basic', name: 'Thông tin cơ bản', icon: HiOutlineMail },
    { id: 'fields', name: 'Mapping Fields', icon: HiOutlineLink },
    { id: 'custom', name: 'Custom Fields', icon: HiOutlinePlus, badge: (formData.saveCustomerCustomFields || []).length > 0 },
  ];

  const handleAddCustomField = () => {
    setFormData((prev) => ({
      ...prev,
      saveCustomerCustomFields: [
        ...(Array.isArray(prev.saveCustomerCustomFields) ? prev.saveCustomerCustomFields : []),
        { key: '', mode: 'node', nodeId: prev.saveCustomerNodeId || '', field: '', value: '' },
      ],
    }));
  };

  const handleRemoveCustomField = (index) => {
    setFormData((prev) => ({
      ...prev,
      saveCustomerCustomFields: (prev.saveCustomerCustomFields || []).filter((_, i) => i !== index),
    }));
  };

  const handleCustomFieldChange = (index, patch) => {
    setFormData((prev) => ({
      ...prev,
      saveCustomerCustomFields: (prev.saveCustomerCustomFields || []).map((item, i) =>
        i === index ? { ...item, ...patch } : item
      ),
    }));
  };

  const renderMapRow = (label, fieldKey, placeholder, type = 'text') => {
    const mapping = safeFieldMap[fieldKey] || { mode: 'node', nodeId: formData.saveCustomerNodeId || '', field: '', value: '' };
    const selectedNodeId = mapping.nodeId || formData.saveCustomerNodeId || '';
    const schema = getSaveCustomerSchema(selectedNodeId);
    return (
      <div className="border border-gray-200 rounded-lg p-3 space-y-2 bg-gray-50">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">{label}</span>
          <div className="flex gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`save-${fieldKey}-mode`}
                value="manual"
                checked={mapping.mode === 'manual'}
                onChange={() => updateFieldMap(fieldKey, { mode: 'manual' })}
                className="text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Nhập thủ công</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`save-${fieldKey}-mode`}
                value="node"
                checked={mapping.mode === 'node'}
                onChange={() => updateFieldMap(fieldKey, { mode: 'node', nodeId: mapping.nodeId || formData.saveCustomerNodeId || '' })}
                className="text-primary-500 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Lấy từ node trước</span>
            </label>
          </div>
        </div>

        {mapping.mode === 'manual' ? (
          type === 'gender' ? (
            <select
              value={mapping.value || ''}
              onChange={(e) => updateFieldMap(fieldKey, { value: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            >
              <option value="">-- Chọn giới tính --</option>
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
              <option value="other">Khác</option>
            </select>
          ) : (
            <input
              type="text"
              value={mapping.value || ''}
              onChange={(e) => updateFieldMap(fieldKey, { value: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              placeholder={placeholder}
            />
          )
        ) : (
          <div className="space-y-2">
            <div>
              <select
                value={selectedNodeId}
                onChange={(e) => updateFieldMap(fieldKey, { nodeId: e.target.value, field: '' })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">-- Chọn node dữ liệu --</option>
                {upstreamNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.data?.label || n.data?.nodeType || n.type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              {schema.length ? (
                <select
                  value={mapping.field || ''}
                  onChange={(e) => updateFieldMap(fieldKey, { field: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="">-- Chọn cột --</option>
                  {schema.map((f) => (
                    <option key={f.key} value={f.key}>{f.key}</option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={mapping.field || ''}
                  onChange={(e) => updateFieldMap(fieldKey, { field: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Tên cột (vd: email)"
                />
              )}
            </div>
            <p className="text-xs text-gray-400 mt-1">Chọn node dữ liệu trước, sau đó chọn trường dữ liệu</p>
          </div>
        )}
      </div>
    );
  };

  const renderSaveCustomerSection = () => {
    switch (selectedSaveCustomerSection) {
      case 'basic':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên node</label>
              <input
                type="text"
                value={formData.label}
                onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="Lưu khách hàng"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Node dữ liệu mặc định</label>
              <select
                value={formData.saveCustomerNodeId || ''}
                onChange={(e) => {
                  const nodeId = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    saveCustomerNodeId: nodeId,
                    saveCustomerFieldMap: Object.keys(
                      buildDefaultCustomerFieldMap(prev.saveCustomerFieldMap || {}, prev.saveCustomerNodeId || '')
                    ).reduce((acc, key) => {
                      const current = (prev.saveCustomerFieldMap || {})[key] || {};
                      acc[key] = {
                        ...current,
                        nodeId: current.nodeId || nodeId,
                      };
                      return acc;
                    }, {}),
                  }));
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="">-- Chọn node phía trước --</option>
                {upstreamNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.data?.label || n.data?.nodeType || n.type}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 mt-1">Dùng làm mặc định cho các field khi chưa chọn node riêng</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Chế độ cập nhật</label>
              <select
                value={formData.saveCustomerUpsertBy || 'email_or_phone'}
                onChange={(e) => setFormData((prev) => ({ ...prev, saveCustomerUpsertBy: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              >
                <option value="email_or_phone">Theo email hoặc điện thoại</option>
                <option value="email">Theo email</option>
                <option value="phone">Theo điện thoại</option>
              </select>
              <p className="text-xs text-gray-500 mt-2">
                Xác định cách thức tìm và cập nhật khách hàng đã có trong hệ thống
              </p>
            </div>
          </div>
        );

      case 'fields':
        return (
          <div className="space-y-3">
            <h4 className="font-medium text-gray-900 mb-3">Mapping các trường thông tin</h4>
            {renderMapRow('Email', 'email', 'email@domain.com')}
            {renderMapRow('Điện thoại', 'phone', '09xxxxxxxx')}
            {renderMapRow('Họ tên', 'fullName', 'Nguyễn Văn A')}
            {renderMapRow('Giới tính', 'gender', '', 'gender')}
            {renderMapRow('Nguồn khách hàng', 'customerSource', 'campaign')}
            {renderMapRow('Ghi chú', 'notes', 'Ghi chú')}
            {renderMapRow('Zalo ID', 'zaloId', 'zalo_id')}
            {renderMapRow('Zalo Phone', 'zaloPhone', '09xxxxxxxx')}

            <div className="bg-blue-50 p-3 rounded-lg mt-4">
              <p className="text-sm text-blue-700">
                <strong>Lưu ý:</strong> Các trường không có dữ liệu sẽ để trống.
              </p>
            </div>
          </div>
        );

      case 'custom':
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">Custom Fields</h4>
              <button
                type="button"
                onClick={handleAddCustomField}
                className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
              >
                <HiOutlinePlus className="w-4 h-4" />
                Thêm field
              </button>
            </div>

            {(formData.saveCustomerCustomFields || []).length === 0 ? (
              <div className="text-center py-8 text-sm text-gray-500 border-2 border-dashed border-gray-200 rounded-lg">
                Chưa có custom field nào. Thêm field để lưu dữ liệu tùy chỉnh.
              </div>
            ) : (
              <div className="space-y-3">
                {(formData.saveCustomerCustomFields || []).map((item, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-semibold text-gray-800">Field #{index + 1}</label>
                      <button
                        type="button"
                        onClick={() => handleRemoveCustomField(index)}
                        className="text-gray-400 hover:text-red-500 flex items-center gap-1"
                      >
                        <HiOutlineTrash className="w-4 h-4" />
                        <span className="text-xs">Xóa</span>
                      </button>
                    </div>

                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Tên field</label>
                      <input
                        type="text"
                        value={item.key || ''}
                        onChange={(e) => handleCustomFieldChange(index, { key: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                        placeholder="Tên field (vd: khoa_hoc)"
                      />
                    </div>

                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`custom-${index}-mode`}
                          value="manual"
                          checked={item.mode === 'manual'}
                          onChange={() => handleCustomFieldChange(index, { mode: 'manual' })}
                          className="text-primary-500 focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700">Nhập thủ công</span>
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name={`custom-${index}-mode`}
                          value="node"
                          checked={item.mode !== 'manual'}
                          onChange={() => handleCustomFieldChange(index, { mode: 'node' })}
                          className="text-primary-500 focus:ring-primary-500"
                        />
                        <span className="text-sm text-gray-700">Lấy từ node trước</span>
                      </label>
                    </div>

                    {item.mode === 'manual' ? (
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Giá trị</label>
                        <input
                          type="text"
                          value={item.value || ''}
                          onChange={(e) => handleCustomFieldChange(index, { value: e.target.value })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                          placeholder="Giá trị"
                        />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Chọn node dữ liệu</label>
                          <select
                            value={item.nodeId || formData.saveCustomerNodeId || ''}
                            onChange={(e) => handleCustomFieldChange(index, { nodeId: e.target.value, field: '' })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                          >
                            <option value="">-- Chọn node --</option>
                            {upstreamNodes.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.data?.label || n.data?.nodeType || n.type}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Chọn cột dữ liệu</label>
                          {getSaveCustomerSchema(item.nodeId || formData.saveCustomerNodeId).length ? (
                            <select
                              value={item.field || ''}
                              onChange={(e) => handleCustomFieldChange(index, { field: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                            >
                              <option value="">-- Chọn cột --</option>
                              {getSaveCustomerSchema(item.nodeId || formData.saveCustomerNodeId).map((f) => (
                                <option key={f.key} value={f.key}>{f.key}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              type="text"
                              value={item.field || ''}
                              onChange={(e) => handleCustomFieldChange(index, { field: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                              placeholder="Tên cột (vd: khoa_hoc)"
                            />
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Chọn node trước rồi chọn cột dữ liệu</p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="bg-amber-50 p-3 rounded-lg">
              <p className="text-sm text-amber-700">
                <strong>Lưu ý:</strong> Custom fields cho phép bạn lưu thêm thông tin tùy chỉnh cho khách hàng.
              </p>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="flex" style={{ minHeight: '500px' }}>
      <div className="w-64 border-r border-gray-200 flex flex-col">
        <div className="p-3 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700">Cài đặt</h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          {saveCustomerSections.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.id}
                onClick={() => setSelectedSaveCustomerSection(section.id)}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedSaveCustomerSection === section.id
                    ? 'bg-primary-50 border-l-4 border-primary-600'
                    : 'border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${selectedSaveCustomerSection === section.id ? 'text-primary-600' : 'text-gray-500'}`} />
                    <span className={`text-sm ${selectedSaveCustomerSection === section.id ? 'font-medium text-primary-900' : 'text-gray-700'}`}>
                      {section.name}
                    </span>
                  </div>
                  {section.badge && (
                    <span className="w-2 h-2 rounded-full bg-primary-600"></span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {renderSaveCustomerSection()}
      </div>
    </div>
  );
};
