import { HiOutlinePlus, HiOutlineTrash } from 'react-icons/hi';

/**
 * Section UI for mapping-data node configuration.
 *
 * @param {Object} props section props
 * @param {Object} props.formData current node form data
 * @param {Function} props.setFormData React setter for form data
 * @param {Array} props.emailTemplates available email templates
 * @param {Object|null} props.mappingTemplate selected mapping template detail
 * @param {Function} props.handleMappingTemplateSelect callback to select mapping template
 * @returns {JSX.Element}
 */
export const NodeConfigMappingDataSection = ({
  formData,
  setFormData,
  emailTemplates,
  mappingTemplate,
  handleMappingTemplateSelect,
}) => {
  const handleAddMapping = () => {
    setFormData((prev) => ({
      ...prev,
      mappings: [...prev.mappings, { variableName: '', sourceType: 'column', columnName: '', formula: '' }],
    }));
  };

  const handleRemoveMapping = (index) => {
    setFormData((prev) => ({
      ...prev,
      mappings: prev.mappings.filter((_, i) => i !== index),
    }));
  };

  const handleMappingFieldChange = (index, field, value) => {
    setFormData((prev) => ({
      ...prev,
      mappings: prev.mappings.map((m, i) => (i === index ? { ...m, [field]: value } : m)),
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
          placeholder="Mapping dữ liệu"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          Template áp dụng <span className="text-red-500">*</span>
        </label>
        <select
          value={formData.mappingTemplateId || ''}
          onChange={(e) => handleMappingTemplateSelect(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          <option value="">-- Chọn template để lấy biến --</option>
          {emailTemplates.map((tpl) => (
            <option key={tpl.id} value={tpl.id}>
              {tpl.templateName} ({tpl.category})
            </option>
          ))}
        </select>
        {mappingTemplate && (
          <p className="text-xs text-gray-500 mt-1">
            Đã tải template: <span className="font-medium">{mappingTemplate.templateName}</span>
          </p>
        )}
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">Định nghĩa các biến</label>
          <button
            type="button"
            onClick={handleAddMapping}
            className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
          >
            <HiOutlinePlus className="w-4 h-4" />
            Thêm biến
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-3">
          Mapping tên biến với cột trong Sheet hoặc giá trị theo hàm/công thức
        </p>

        <div className="space-y-3">
          {formData.mappings.map((mapping, index) => (
            <div key={index} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <label className="block text-xs text-gray-500 mb-1">Tên biến (dùng trong template)</label>
                  <div className="flex items-center gap-1">
                    <span className="text-gray-400 text-sm">{'{{'}</span>
                    <input
                      type="text"
                      value={mapping.variableName}
                      onChange={(e) => handleMappingFieldChange(index, 'variableName', e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500"
                      placeholder="ten_khach"
                    />
                    <span className="text-gray-400 text-sm">{'}}'}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveMapping(index)}
                  className="p-1 text-gray-400 hover:text-red-500 mt-5"
                  disabled={formData.mappings.length === 1}
                >
                  <HiOutlineTrash className="w-4 h-4" />
                </button>
              </div>

              <div className="mt-2">
                <label className="block text-xs text-gray-500 mb-1">Nguồn dữ liệu</label>
                <select
                  value={mapping.sourceType}
                  onChange={(e) => handleMappingFieldChange(index, 'sourceType', e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500"
                >
                  <option value="column">📊 Từ cột trong Sheet</option>
                  <option value="formula">⚡ Hàm / Công thức</option>
                  <option value="static">📝 Giá trị cố định</option>
                </select>
              </div>

              {mapping.sourceType === 'column' && (
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">Tên cột / Ký hiệu cột</label>
                  <input
                    type="text"
                    value={mapping.columnName}
                    onChange={(e) => handleMappingFieldChange(index, 'columnName', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500"
                    placeholder="VD: A, B, Tên khách hàng, Email..."
                  />
                  <p className="text-xs text-gray-400 mt-1">Nhập tên cột hoặc ký hiệu cột (A, B, C...)</p>
                </div>
              )}

              {mapping.sourceType === 'formula' && (
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">Công thức / Hàm</label>
                  <input
                    type="text"
                    value={mapping.formula}
                    onChange={(e) => handleMappingFieldChange(index, 'formula', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono focus:ring-2 focus:ring-primary-500"
                    placeholder="VD: CONCAT(col_A, ' ', col_B) hoặc DATE_FORMAT(NOW(), '%d/%m/%Y')"
                  />
                  <p className="text-xs text-gray-400 mt-1">Sử dụng col_X để tham chiếu cột, hỗ trợ các hàm: CONCAT, UPPER, LOWER, DATE_FORMAT, NOW, IF...</p>
                </div>
              )}

              {mapping.sourceType === 'static' && (
                <div className="mt-2">
                  <label className="block text-xs text-gray-500 mb-1">Giá trị cố định</label>
                  <input
                    type="text"
                    value={mapping.formula}
                    onChange={(e) => handleMappingFieldChange(index, 'formula', e.target.value)}
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500"
                    placeholder="Nhập giá trị cố định..."
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="bg-amber-50 p-3 rounded-lg">
        <p className="text-sm text-amber-700">
          <strong>Ví dụ:</strong>
        </p>
        <ul className="text-xs text-amber-600 mt-1 space-y-1 list-disc list-inside">
          <li><code className="bg-amber-100 px-1 rounded">ten_khach</code> → Cột "Tên khách hàng" hoặc cột A</li>
          <li><code className="bg-amber-100 px-1 rounded">ho_ten_day_du</code> → Hàm: CONCAT(col_B, ' ', col_C)</li>
          <li><code className="bg-amber-100 px-1 rounded">ngay_gui</code> → Hàm: DATE_FORMAT(NOW(), '%d/%m/%Y')</li>
        </ul>
      </div>
    </div>
  );
};
