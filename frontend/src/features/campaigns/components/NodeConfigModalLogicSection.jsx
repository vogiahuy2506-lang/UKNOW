import { useI18n } from '../../../i18n';

const OPERATORS = [
  { value: 'equals', labelVi: 'Bằng', labelEn: 'Equals' },
  { value: 'not_equals', labelVi: 'Khác', labelEn: 'Not equals' },
  { value: 'contains', labelVi: 'Chứa', labelEn: 'Contains' },
  { value: 'not_contains', labelVi: 'Không chứa', labelEn: 'Not contains' },
  { value: 'gt', labelVi: 'Lớn hơn', labelEn: 'Greater than' },
  { value: 'gte', labelVi: 'Lớn hơn hoặc bằng', labelEn: 'Greater or equal' },
  { value: 'lt', labelVi: 'Nhỏ hơn', labelEn: 'Less than' },
  { value: 'lte', labelVi: 'Nhỏ hơn hoặc bằng', labelEn: 'Less or equal' },
  { value: 'exists', labelVi: 'Tồn tại (khác rỗng)', labelEn: 'Exists (not empty)' },
  { value: 'empty', labelVi: 'Rỗng / trống', labelEn: 'Empty' },
];

const getOperatorLabel = (locale, op) => {
  const found = OPERATORS.find((o) => o.value === op);
  if (!found) return op;
  return locale === 'vi' ? found.labelVi : found.labelEn;
};

/**
 * Section UI for «Điều kiện» (condition) node configuration.
 *
 * @param {Object} props
 * @param {Object} props.formData
 * @param {Function} props.setFormData
 * @returns {JSX.Element}
 */
export const NodeConfigConditionSection = ({ formData, setFormData }) => {
  const { t, locale } = useI18n();
  const tr = (key, fallback) => t(`campaignNodeConfig.condition.${key}`, fallback);
  const rules = Array.isArray(formData.rules) && formData.rules.length
    ? formData.rules
    : [{ field: '', operator: 'equals', value: '' }];

  const updateRule = (idx, patch) => {
    setFormData((prev) => {
      const next = (Array.isArray(prev.rules) && prev.rules.length)
        ? prev.rules
        : [{ field: '', operator: 'equals', value: '' }];
      const updated = next.map((rule, i) => (i === idx ? { ...rule, ...patch } : rule));
      return { ...prev, rules: updated };
    });
  };

  const addRule = () => {
    setFormData((prev) => {
      const next = Array.isArray(prev.rules) ? prev.rules : [];
      return { ...prev, rules: [...next, { field: '', operator: 'equals', value: '' }] };
    });
  };

  const removeRule = (idx) => {
    setFormData((prev) => {
      const next = Array.isArray(prev.rules) ? prev.rules : [];
      const filtered = next.filter((_, i) => i !== idx);
      return { ...prev, rules: filtered.length ? filtered : [{ field: '', operator: 'equals', value: '' }] };
    });
  };

  return (
    <div className="space-y-4">
      {/* Node name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{tr('nodeName', 'Tên node')}</label>
        <input
          type="text"
          value={formData.label}
          onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          placeholder={tr('nodeNamePlaceholder', 'Điều kiện')}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{tr('description', 'Mô tả')}</label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          rows={2}
          placeholder={tr('descriptionPlaceholder', 'Mô tả điều kiện...')}
        />
      </div>

      {/* Match mode */}
      <div className="flex items-center gap-3">
        <span className="text-sm font-medium text-gray-700">{tr('matchMode', 'Kết hợp')}</span>
        <div className="flex rounded-lg border border-gray-300 overflow-hidden text-sm">
          {['all', 'any'].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setFormData((prev) => ({ ...prev, matchMode: mode }))}
              className={`px-3 py-1.5 ${
                (formData.matchMode || 'all') === mode
                  ? 'bg-primary-500 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              {mode === 'all' ? tr('matchAll', 'Tất cả (AND)') : tr('matchAny', 'Bất kỳ (OR)')}
            </button>
          ))}
        </div>
      </div>

      {/* Rules */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="block text-sm font-medium text-gray-700">{tr('rules', 'Điều kiện')}</label>
          <button
            type="button"
            onClick={addRule}
            className="text-xs px-2 py-1 rounded bg-primary-50 text-primary-600 hover:bg-primary-100"
          >
            + {tr('addRule', 'Thêm điều kiện')}
          </button>
        </div>

        <div className="space-y-2">
          {rules.map((rule, idx) => (
            <div key={idx} className="grid grid-cols-12 gap-2 items-start p-2.5 rounded-lg border border-gray-200 bg-gray-50">
              {/* Field */}
              <div className="col-span-12 sm:col-span-4">
                <input
                  type="text"
                  value={rule.field || ''}
                  onChange={(e) => updateRule(idx, { field: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 bg-white"
                  placeholder={tr('fieldPlaceholder', 'Trường (vd: email, tag)')}
                />
              </div>

              {/* Operator */}
              <div className="col-span-6 sm:col-span-3">
                <select
                  value={rule.operator || 'equals'}
                  onChange={(e) => updateRule(idx, { operator: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 bg-white"
                >
                  {OPERATORS.map((op) => (
                    <option key={op.value} value={op.value}>
                      {getOperatorLabel(locale, op.value)}
                    </option>
                  ))}
                </select>
              </div>

              {/* Value */}
              <div className="col-span-5 sm:col-span-4">
                <input
                  type="text"
                  value={rule.value ?? ''}
                  onChange={(e) => updateRule(idx, { value: e.target.value })}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-primary-500 bg-white"
                  placeholder={tr('valuePlaceholder', 'Giá trị')}
                  disabled={rule.operator === 'exists' || rule.operator === 'empty'}
                />
              </div>

              {/* Remove */}
              <div className="col-span-1 flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => removeRule(idx)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 rounded p-1"
                  title="Xóa"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-blue-50 p-3 rounded-lg">
        <p className="text-sm text-blue-700">
          <strong>{tr('note', 'Ghi chú')}:</strong> {tr('noteHelp', 'Các điều kiện được đánh giá theo thứ tự; node tiếp theo sẽ chạy nếu tổ hợp khớp (theo chế độ AND/OR).')}
        </p>
      </div>
    </div>
  );
};

/**
 * Section UI for «Gắn tag» (tag_contact) node configuration.
 *
 * @param {Object} props
 * @param {Object} props.formData
 * @param {Function} props.setFormData
 * @param {Array} [props.upstreamNodes]
 * @returns {JSX.Element}
 */
export const NodeConfigTagContactSection = ({ formData, setFormData, upstreamNodes = [] }) => {
  const { t } = useI18n();
  const tr = (key, fallback) => t(`campaignNodeConfig.tagContact.${key}`, fallback);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{tr('nodeName', 'Tên node')}</label>
        <input
          type="text"
          value={formData.label}
          onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          placeholder={tr('nodeNamePlaceholder', 'Gắn tag')}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{tr('description', 'Mô tả')}</label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          rows={2}
          placeholder={tr('descriptionPlaceholder', 'Mô tả gắn tag...')}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{tr('action', 'Hành động')}</label>
          <select
            value={formData.tagAction || 'add'}
            onChange={(e) => setFormData((prev) => ({ ...prev, tagAction: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          >
            <option value="add">{tr('actionAdd', 'Thêm tag')}</option>
            <option value="remove">{tr('actionRemove', 'Xóa tag')}</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{tr('tagName', 'Tên tag')}</label>
          <input
            type="text"
            value={formData.tagName || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, tagName: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            placeholder={tr('tagNamePlaceholder', 'vd: lead-hot, vip, contacted')}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{tr('sourceNode', 'Nguồn danh sách liên hệ')}</label>
        <select
          value={formData.tagSourceNodeId || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, tagSourceNodeId: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          <option value="">{tr('sourceNodePlaceholder', '— Chọn node cung cấp danh sách —')}</option>
          {upstreamNodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.data?.label || n.data?.nodeType || n.id}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-blue-50 p-3 rounded-lg">
        <p className="text-sm text-blue-700">
          <strong>{tr('note', 'Ghi chú')}:</strong> {tr('noteHelp', 'Hành động gắn/xóa tag sẽ áp dụng cho tất cả liên hệ lấy từ node nguồn đã chọn.')}
        </p>
      </div>
    </div>
  );
};

/**
 * Section UI for «Cập nhật thuộc tính» (update_attribute) node configuration.
 *
 * @param {Object} props
 * @param {Object} props.formData
 * @param {Function} props.setFormData
 * @param {Array} [props.upstreamNodes]
 * @returns {JSX.Element}
 */
export const NodeConfigUpdateAttributeSection = ({ formData, setFormData, upstreamNodes = [] }) => {
  const { t } = useI18n();
  const tr = (key, fallback) => t(`campaignNodeConfig.updateAttribute.${key}`, fallback);

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{tr('nodeName', 'Tên node')}</label>
        <input
          type="text"
          value={formData.label}
          onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          placeholder={tr('nodeNamePlaceholder', 'Cập nhật thuộc tính')}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{tr('description', 'Mô tả')}</label>
        <textarea
          value={formData.description || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
          rows={2}
          placeholder={tr('descriptionPlaceholder', 'Mô tả cập nhật thuộc tính...')}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{tr('field', 'Trường cần cập nhật')}</label>
          <input
            type="text"
            value={formData.attributeField || ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, attributeField: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            placeholder={tr('fieldPlaceholder', 'vd: status, score, lastContactAt')}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">{tr('value', 'Giá trị mới')}</label>
          <input
            type="text"
            value={formData.attributeValue ?? ''}
            onChange={(e) => setFormData((prev) => ({ ...prev, attributeValue: e.target.value }))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            placeholder={tr('valuePlaceholder', 'Giá trị (text/số)')}
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{tr('sourceNode', 'Nguồn danh sách liên hệ')}</label>
        <select
          value={formData.attributeSourceNodeId || ''}
          onChange={(e) => setFormData((prev) => ({ ...prev, attributeSourceNodeId: e.target.value }))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        >
          <option value="">{tr('sourceNodePlaceholder', '— Chọn node cung cấp danh sách —')}</option>
          {upstreamNodes.map((n) => (
            <option key={n.id} value={n.id}>
              {n.data?.label || n.data?.nodeType || n.id}
            </option>
          ))}
        </select>
      </div>

      <div className="bg-blue-50 p-3 rounded-lg">
        <p className="text-sm text-blue-700">
          <strong>{tr('note', 'Ghi chú')}:</strong> {tr('noteHelp', 'Trường được cập nhật cho tất cả liên hệ lấy từ node nguồn. Nếu cần cập nhật khác nhau theo từng dòng, dùng node Data + ánh xạ trước.')}
        </p>
      </div>
    </div>
  );
};
