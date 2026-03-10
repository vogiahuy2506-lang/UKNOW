import { useEffect, useMemo, useState } from 'react';
import {
  HiOutlineDocument,
  HiOutlineLink,
  HiOutlineTable,
} from 'react-icons/hi';

/**
 * Section UI for read-sheet node configuration.
 *
 * @param {Object} props section props
 * @param {Object} props.formData current node form data
 * @param {Function} props.setFormData React setter for form data
 * @param {string} props.selectedReadSheetSection active section id
 * @param {Function} props.setSelectedReadSheetSection section state setter
 * @param {Function} props.handleCheckSheetConnection sheet connection callback
 * @param {boolean} props.isCheckingSheet loading flag for check connection action
 * @returns {JSX.Element}
 */
export const NodeConfigReadSheetSection = ({
  formData,
  setFormData,
  selectedReadSheetSection,
  setSelectedReadSheetSection,
  handleCheckSheetConnection,
  isCheckingSheet,
}) => {
  const [lastAutoCheckConnectionKey, setLastAutoCheckConnectionKey] = useState('');
  const connectionSignature = useMemo(
    () => [
      formData.sheetUrl || '',
      formData.sheetName || 'Sheet1',
      formData.headerRow || 1,
      formData.dataStartRow || 2,
    ].join('|'),
    [formData.dataStartRow, formData.headerRow, formData.sheetName, formData.sheetUrl]
  );

  useEffect(() => {
    if (selectedReadSheetSection !== 'connection') return;
    if (isCheckingSheet) return;
    if (!String(formData.sheetUrl || '').trim()) return;
    if (Array.isArray(formData.columns) && formData.columns.length > 0) return;
    if (lastAutoCheckConnectionKey === connectionSignature) return;

    setLastAutoCheckConnectionKey(connectionSignature);
    handleCheckSheetConnection();
  }, [
    connectionSignature,
    formData.columns,
    formData.sheetUrl,
    handleCheckSheetConnection,
    isCheckingSheet,
    lastAutoCheckConnectionKey,
    selectedReadSheetSection,
  ]);

  const readSheetSections = [
    { id: 'basic', name: 'Thông tin cơ bản', icon: HiOutlineDocument },
    { id: 'config', name: 'Cấu hình Sheet', icon: HiOutlineTable },
    {
      id: 'connection',
      name: 'Kết nối',
      icon: HiOutlineLink,
      badge: Array.isArray(formData.columns) && formData.columns.length > 0,
    },
  ];

  const renderReadSheetSection = () => {
    switch (selectedReadSheetSection) {
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
                placeholder="Đọc dữ liệu Sheet"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                URL Google Sheet <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={formData.sheetUrl}
                onChange={(e) => setFormData((prev) => ({ ...prev, sheetUrl: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="https://docs.google.com/spreadsheets/d/..."
              />
              <p className="text-xs text-gray-500 mt-1">Đảm bảo sheet đã được chia sẻ quyền đọc</p>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Lưu ý:</strong> Đọc dữ liệu từ Google Sheet để sử dụng trong các bước tiếp theo của chiến dịch.
              </p>
            </div>
          </div>
        );

      case 'config':
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên Sheet</label>
                <input
                  type="text"
                  value={formData.sheetName}
                  onChange={(e) => setFormData((prev) => ({ ...prev, sheetName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  placeholder="Sheet1"
                />
                <p className="text-xs text-gray-500 mt-1">Tên tab sheet trong file Google Sheets</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Dòng tiêu đề</label>
                <input
                  type="number"
                  min={1}
                  value={formData.headerRow}
                  onChange={(e) => setFormData((prev) => ({ ...prev, headerRow: parseInt(e.target.value, 10) }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
                <p className="text-xs text-gray-500 mt-1">Dòng chứa tiêu đề của các cột</p>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Dòng bắt đầu dữ liệu</label>
              <input
                type="number"
                min={1}
                value={formData.dataStartRow}
                onChange={(e) => setFormData((prev) => ({ ...prev, dataStartRow: parseInt(e.target.value, 10) }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-xs text-gray-500 mt-1">Dòng đầu tiên có dữ liệu thực tế (thường là dòng sau tiêu đề)</p>
            </div>
            <div className="bg-amber-50 p-3 rounded-lg">
              <p className="text-sm text-amber-700">
                <strong>Mẹo:</strong> Nếu tiêu đề ở dòng 1 và dữ liệu bắt đầu từ dòng 2, hãy đặt dòng tiêu đề = 1, dòng bắt đầu dữ liệu = 2.
              </p>
            </div>
          </div>
        );

      case 'connection':
        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCheckSheetConnection}
                disabled={isCheckingSheet}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isCheckingSheet
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-primary-600 text-white hover:bg-primary-700'
                }`}
              >
                {isCheckingSheet ? 'Đang kiểm tra...' : 'Kiểm tra kết nối'}
              </button>
            </div>
            <p className="text-xs text-gray-500">Nhấn để kiểm tra kết nối và lấy danh sách các cột từ sheet</p>

            {Array.isArray(formData.columns) && formData.columns.length > 0 ? (
              <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
                <div className="flex items-center gap-2 mb-3">
                  <HiOutlineTable className="w-5 h-5 text-green-600" />
                  <span className="text-sm font-medium text-gray-700">Danh sách cột ({formData.columns.length})</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.columns.map((col, idx) => (
                    <span
                      key={`${col}-${idx}`}
                      className="inline-flex items-center px-3 py-1.5 rounded-lg text-sm bg-white border border-gray-200 text-gray-700 font-medium"
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center">
                <HiOutlineTable className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Chưa có cột nào được tải</p>
                <p className="text-xs text-gray-400 mt-1">Nhấn "Kiểm tra kết nối" để tải danh sách cột</p>
              </div>
            )}

            <div className="bg-green-50 p-3 rounded-lg">
              <p className="text-sm text-green-700">
                <strong>Thành công!</strong> Sau khi kiểm tra kết nối, các cột sẽ được hiển thị ở đây và có thể sử dụng trong các node tiếp theo.
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
          {readSheetSections.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.id}
                onClick={() => setSelectedReadSheetSection(section.id)}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedReadSheetSection === section.id
                    ? 'bg-primary-50 border-l-4 border-primary-600'
                    : 'border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${selectedReadSheetSection === section.id ? 'text-primary-600' : 'text-gray-500'}`} />
                    <span className={`text-sm ${selectedReadSheetSection === section.id ? 'font-medium text-primary-900' : 'text-gray-700'}`}>
                      {section.name}
                    </span>
                  </div>
                  {section.badge && <span className="w-2 h-2 rounded-full bg-primary-600"></span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">{renderReadSheetSection()}</div>
    </div>
  );
};
