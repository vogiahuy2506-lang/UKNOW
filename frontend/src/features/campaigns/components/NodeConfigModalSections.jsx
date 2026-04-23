/**
 * Section UI for manual trigger node configuration.
 *
 * @param {Object} props section props
 * @param {Object} props.formData current node form data
 * @param {Function} props.setFormData React setter for form data
 * @returns {JSX.Element}
 */
export const NodeConfigManualTriggerSection = ({ formData, setFormData }) => (
  <div className="space-y-4">
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Tên node</label>
      <input
        type="text"
        value={formData.label}
        onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        placeholder="Khởi chạy"
      />
    </div>
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">Mô tả</label>
      <textarea
        value={formData.description}
        onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
        rows={3}
        placeholder="Mô tả về trigger này..."
      />
    </div>
    <div className="bg-blue-50 p-3 rounded-lg">
      <p className="text-sm text-blue-700">
        <strong>Lưu ý:</strong> Node này sẽ khởi chạy chiến dịch khi bạn bấm nút "Chạy".
      </p>
    </div>
  </div>
);
