import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineDocument,
  HiOutlineDocumentText,
  HiOutlinePlay,
  HiOutlineSearch,
  HiOutlineTable,
} from 'react-icons/hi';
import { fetchInterestedCustomerCoursesLocal } from '../utils/nodeConfigModal.helpers';
import { INTERESTED_CUSTOMER_COLUMN_OPTIONS } from '../constants/dataNodeColumnOptions';
import { NodeConfigDataColumnPicker } from './NodeConfigDataColumnPicker';

const INTERESTED_COURSE_STATUS_LABELS = {
  publish: 'Publish (Công khai)',
  draft: 'Draft (Nháp)',
  pending: 'Pending (Chờ duyệt)',
  private: 'Private (Riêng tư)',
  trash: 'Trash (Đã xóa)',
};
const INTERESTED_COURSE_STATUS_OPTIONS = ['publish', 'draft', 'pending', 'private'];

const normalizeCourseStatus = (status) => String(status || '').trim().toLowerCase() || 'publish';

const getCourseStatusLabel = (status) => {
  const normalized = normalizeCourseStatus(status);
  return INTERESTED_COURSE_STATUS_LABELS[normalized] || normalized;
};

const getCourseStatusClassName = (status) => {
  const normalized = normalizeCourseStatus(status);
  if (normalized === 'publish') return 'text-green-600';
  if (normalized === 'pending') return 'text-amber-600';
  if (normalized === 'private') return 'text-purple-600';
  return 'text-gray-500';
};

/**
 * Section UI for read-interested-customers node configuration.
 *
 * @param {Object} props section props
 * @param {Object} props.formData current node form data
 * @param {Function} props.setFormData React setter for form data
 * @param {string} props.selectedReadInterestedCustomersSection active section id
 * @param {Function} props.setSelectedReadInterestedCustomersSection section state setter
 * @param {Array} props.interestedCourseOptions selectable course list
 * @param {boolean} props.isLoadingInterestedCourses loading flag for course list
 * @param {string} props.courseSearchQuery search keyword for course list
 * @param {Function} props.setCourseSearchQuery setter for course search keyword
 * @param {Array} props.testPreviewItems loaded preview customers
 * @param {Function} props.setTestPreviewItems setter for preview customers
 * @param {boolean} props.isLoadingTestPreview loading flag for preview customer list
 * @param {Function} props.setIsLoadingTestPreview setter for preview loading flag
 * @param {string} props.testPreviewSearchQuery search keyword for preview customers
 * @param {Function} props.setTestPreviewSearchQuery setter for preview customer search keyword
 * @param {number|string|null} props.campaignId current campaign id
 * @returns {JSX.Element}
 */
export const NodeConfigReadInterestedCustomersSection = ({
  formData,
  setFormData,
  selectedReadInterestedCustomersSection,
  setSelectedReadInterestedCustomersSection,
  interestedCourseOptions,
  isLoadingInterestedCourses,
  courseSearchQuery,
  setCourseSearchQuery,
  testPreviewItems,
  setTestPreviewItems,
  isLoadingTestPreview,
  setIsLoadingTestPreview,
  testPreviewSearchQuery,
  setTestPreviewSearchQuery,
  campaignId,
}) => {
  const [lastAutoLoadTestKey, setLastAutoLoadTestKey] = useState('');

  const selectedCourseIds = (Array.isArray(formData.interestedCourseIds) ? formData.interestedCourseIds : [])
    .map((v) => parseInt(v, 10))
    .filter((v, idx, arr) => Number.isFinite(v) && arr.indexOf(v) === idx);
  const selectedCourseStatuses = (Array.isArray(formData.interestedCourseStatuses)
    ? formData.interestedCourseStatuses
    : []
  )
    .map((v) => normalizeCourseStatus(v))
    .filter((v, idx, arr) => v && arr.indexOf(v) === idx);
  const interestedSelectionMode = (() => {
    const explicitMode = String(formData.interestedSelectionMode || '').trim().toLowerCase();
    if (explicitMode === 'fixed' || explicitMode === 'all_exclude') return explicitMode;
    const hasSelectedCustomers = Array.isArray(formData.interestedSelectedCustomerIds)
      && formData.interestedSelectedCustomerIds.length > 0;
    return hasSelectedCustomers ? 'fixed' : 'all';
  })();
  const selectedCourseIdsKey = useMemo(
    () => selectedCourseIds.slice().sort((a, b) => a - b).join(','),
    [selectedCourseIds]
  );

  const toggleCourse = (courseId, checked) => {
    const id = parseInt(courseId, 10);
    if (!Number.isFinite(id)) return;
    setFormData((prev) => {
      const current = (Array.isArray(prev.interestedCourseIds) ? prev.interestedCourseIds : [])
        .map((v) => parseInt(v, 10))
        .filter((v, idx, arr) => Number.isFinite(v) && arr.indexOf(v) === idx);
      const next = checked ? Array.from(new Set([...current, id])) : current.filter((v) => v !== id);
      return { ...prev, interestedCourseIds: next };
    });
  };

  /**
   * Bật/tắt trạng thái khóa học dùng để lọc danh sách.
   *
   * Luồng hoạt động:
   * 1. Chuẩn hóa trạng thái đang thao tác về lowercase.
   * 2. Lấy danh sách trạng thái hiện tại và loại trùng.
   * 3. Nếu đã có thì bỏ ra, nếu chưa có thì thêm vào.
   *
   * @param {string} status Trạng thái khóa học cần bật/tắt
   * @returns {void}
   */
  const toggleCourseStatusFilter = (status) => {
    const normalized = normalizeCourseStatus(status);
    setFormData((prev) => {
      const current = (Array.isArray(prev.interestedCourseStatuses) ? prev.interestedCourseStatuses : [])
        .map((item) => normalizeCourseStatus(item))
        .filter((item, idx, arr) => item && arr.indexOf(item) === idx);
      const next = current.includes(normalized)
        ? current.filter((item) => item !== normalized)
        : [...current, normalized];
      return { ...prev, interestedCourseStatuses: next };
    });
  };

  const selectableIds = interestedCourseOptions
    .map((item) => parseInt(item.courseId, 10))
    .filter((v, idx, arr) => Number.isFinite(v) && arr.indexOf(v) === idx);

  const selectedDataCols = Array.isArray(formData.dataSelectedColumns) ? formData.dataSelectedColumns : [];

  const readInterestedCustomersSections = [
    { id: 'basic', name: 'Thông tin cơ bản', icon: HiOutlineDocument },
    {
      id: 'filter',
      name: 'Lọc khóa học',
      icon: HiOutlineSearch,
      badge: selectedCourseIds.length > 0,
      badgeLabel: selectedCourseIds.length,
    },
    {
      id: 'columns',
      name: 'Cột dữ liệu',
      icon: HiOutlineTable,
      badge: selectedDataCols.length > 0,
      badgeLabel: selectedDataCols.length,
    },
    {
      id: 'test',
      name: 'Lựa chọn khách',
      icon: HiOutlinePlay,
      badge: testPreviewItems.length > 0,
      badgeLabel: testPreviewItems.length,
    },
  ];

  const handleLoadTestPreview = async () => {
    try {
      setIsLoadingTestPreview(true);
      setTestPreviewItems([]);
      const data = await fetchInterestedCustomerCoursesLocal({
        campaignId,
        config: {
          ...formData,
          interestedLimit: Math.min(formData.interestedLimit || 1000, 5000),
        },
      });
      setTestPreviewItems(Array.isArray(data?.items) ? data.items : []);
    } catch {
      toast.error('Không thể tải dữ liệu thử');
    } finally {
      setIsLoadingTestPreview(false);
    }
  };

  useEffect(() => {
    if (selectedReadInterestedCustomersSection !== 'test') return;
    if (isLoadingTestPreview) return;
    if (testPreviewItems.length > 0) return;

    const autoLoadKey = [
      campaignId || '',
      formData.interestedDataSource || 'database',
      formData.interestedCustomerType || 'interested',
      formData.interestedLimit || 1000,
      formData.interestedCourseQuery || '',
      selectedCourseIdsKey,
    ].join('|');
    if (lastAutoLoadTestKey === autoLoadKey) return;

    setLastAutoLoadTestKey(autoLoadKey);
    handleLoadTestPreview();
  }, [
    campaignId,
    formData.interestedCourseQuery,
    formData.interestedCustomerType,
    formData.interestedDataSource,
    formData.interestedLimit,
    isLoadingTestPreview,
    lastAutoLoadTestKey,
    selectedCourseIdsKey,
    selectedReadInterestedCustomersSection,
    testPreviewItems.length,
  ]);

  const renderReadInterestedCustomersSection = () => {
    switch (selectedReadInterestedCustomersSection) {
      case 'basic': {
        const customerTypeOpts = [
          { value: 'interested', label: 'Để lại thông tin', desc: 'Khách có trạng thái on-hold / interested' },
          { value: 'purchased', label: 'Đã mua khóa học', desc: 'Khách có đơn hàng completed / processing' },
          { value: 'both', label: 'Cả hai', desc: 'Bao gồm cả để lại thông tin lẫn đã mua' },
        ];
        const dataSourceOpts = [
          { value: 'database', label: 'Database Founder AI Campaign', desc: 'Lấy dữ liệu từ database của hệ thống' },
          { value: 'api', label: 'API Founder AI.edu.vn', desc: 'Lấy dữ liệu từ WooCommerce API (orders)' },
        ];
        const currentCustomerType = formData.interestedCustomerType || 'interested';
        const currentDataSource = formData.interestedDataSource || 'database';
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Tên node</label>
              <input
                type="text"
                value={formData.label}
                onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder="Lấy dữ liệu khách"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Nguồn dữ liệu</label>
              <div className="space-y-2">
                {dataSourceOpts.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      currentDataSource === opt.value
                        ? 'bg-primary-50 border-primary-400'
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="interestedDataSource"
                      value={opt.value}
                      checked={currentDataSource === opt.value}
                      onChange={() => {
                        if (currentDataSource === opt.value) return;
                        setFormData((prev) => ({
                          ...prev,
                          interestedDataSource: opt.value,
                          interestedCourseIds: [],
                          interestedCourseStatuses: [],
                          interestedCourseQuery: '',
                          interestedSelectedCustomerIds: [],
                          interestedExcludedCustomerIds: [],
                          interestedSelectionMode: 'all',
                        }));
                        setCourseSearchQuery('');
                        setTestPreviewSearchQuery('');
                        setTestPreviewItems([]);
                      }}
                      className="mt-0.5 text-primary-600 focus:ring-primary-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${currentDataSource === opt.value ? 'text-primary-900' : 'text-gray-800'}`}>
                        {opt.label}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Lọc theo điều kiện</label>
              <div className="space-y-2">
                {customerTypeOpts.map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                      currentCustomerType === opt.value
                        ? 'bg-primary-50 border-primary-400'
                        : 'bg-white border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="interestedCustomerType"
                      value={opt.value}
                      checked={currentCustomerType === opt.value}
                      onChange={() => setFormData((prev) => ({ ...prev, interestedCustomerType: opt.value }))}
                      className="mt-0.5 text-primary-600 focus:ring-primary-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm font-medium ${currentCustomerType === opt.value ? 'text-primary-900' : 'text-gray-800'}`}>
                        {opt.label}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Số bản ghi tối đa</label>
              <input
                type="number"
                min={1}
                max={5000}
                value={formData.interestedLimit || 1000}
                onChange={(e) => setFormData((prev) => ({ ...prev, interestedLimit: parseInt(e.target.value, 10) || 1000 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                {currentCustomerType === 'purchased'
                  ? 'Node sẽ lấy các khách đã mua khóa học (completed / processing).'
                  : currentCustomerType === 'both'
                    ? 'Node sẽ lấy tất cả khách: cả để lại thông tin lẫn đã mua.'
                    : 'Node sẽ lấy các khách có trạng thái để lại thông tin (on-hold / interested).'}
              </p>
            </div>

            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>Lưu ý:</strong>{' '}
                {currentDataSource === 'database'
                  ? 'Nếu đang sửa chiến dịch cụ thể thì ưu tiên lấy dữ liệu trong chiến dịch đó, nếu không sẽ lấy toàn bộ dữ liệu của tài khoản.'
                  : 'Dữ liệu sẽ được lấy trực tiếp từ WooCommerce API của Founder AI.edu.vn. Đảm bảo đã cấu hình đúng thông tin API key.'}
              </p>
            </div>
          </div>
        );
      }

      case 'filter':
        return (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Lọc theo khóa học</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs rounded-lg bg-primary-50 hover:bg-primary-100 text-primary-700 font-medium transition-colors"
                    onClick={() => setFormData((prev) => ({ ...prev, interestedCourseIds: selectableIds }))}
                    disabled={!selectableIds.length}
                  >
                    Chọn tất cả
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
                    onClick={() => setFormData((prev) => ({ ...prev, interestedCourseIds: [] }))}
                    disabled={!selectedCourseIds.length}
                  >
                    Bỏ chọn
                  </button>
                </div>
              </div>

              {selectedCourseIds.length > 0 && (
                <div className="mb-3 p-2 bg-primary-50 rounded-lg">
                  <p className="text-xs text-primary-700">
                    <strong>{selectedCourseIds.length}</strong> khóa học đã được chọn
                  </p>
                </div>
              )}

              <div className="mb-3">
                <input
                  type="text"
                  placeholder="Tìm kiếm khóa học theo tên hoặc mã..."
                  value={courseSearchQuery}
                  onChange={(e) => {
                    const nextQuery = e.target.value;
                    setCourseSearchQuery(nextQuery);
                    setFormData((prev) => ({ ...prev, interestedCourseQuery: nextQuery }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-600 mb-2">Lọc theo trạng thái</p>
                <div className="flex flex-wrap gap-2">
                  {INTERESTED_COURSE_STATUS_OPTIONS.map((status) => {
                    const checked = selectedCourseStatuses.includes(status);
                    return (
                      <button
                        key={status}
                        type="button"
                        onClick={() => toggleCourseStatusFilter(status)}
                        className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                          checked
                            ? 'bg-primary-50 border-primary-300 text-primary-700'
                            : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        {getCourseStatusLabel(status)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-4 max-h-96 overflow-auto bg-gray-50">
                {isLoadingInterestedCourses ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
                    <p className="text-sm text-gray-500">Đang tải danh sách khóa học...</p>
                  </div>
                ) : interestedCourseOptions.length === 0 ? (
                  <div className="text-center py-8">
                    <HiOutlineDocumentText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">Chưa có khóa học phù hợp dữ liệu quan tâm.</p>
                  </div>
                ) : (
                  (() => {
                    const filteredCourses = interestedCourseOptions.filter((item) => {
                      if (!courseSearchQuery.trim()) return true;
                      const searchLower = courseSearchQuery.toLowerCase();
                      const courseName = String(item.courseName || '').toLowerCase();
                      const courseCode = String(item.courseCode || '').toLowerCase();
                      return courseName.includes(searchLower) || courseCode.includes(searchLower);
                    });
                    const filteredByStatus = filteredCourses.filter((item) => {
                      if (selectedCourseStatuses.length === 0) return true;
                      const normalizedStatus = normalizeCourseStatus(item.status);
                      return selectedCourseStatuses.includes(normalizedStatus);
                    });

                    if (filteredByStatus.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <HiOutlineDocumentText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">
                            Không tìm thấy khóa học phù hợp với bộ lọc hiện tại
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        {filteredByStatus.map((item, idx) => {
                          const courseId = parseInt(item.courseId, 10);
                          const checked = Number.isFinite(courseId) && selectedCourseIds.includes(courseId);
                          const courseName = String(item.courseName || item.courseCode || `Course #${idx + 1}`);
                          const courseCode = String(item.courseCode || '').trim();
                          const totalItems = Number(item.totalItems || 0);
                          const courseStatus = normalizeCourseStatus(item.status);
                          return (
                            <label
                              key={`${item.courseId || 'none'}-${idx}`}
                              className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                                checked ? 'bg-primary-50 border border-primary-200' : 'bg-white border border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-1 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                                checked={checked}
                                onChange={(e) => toggleCourse(courseId, e.target.checked)}
                                disabled={!Number.isFinite(courseId)}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900">
                                  {courseName}
                                  {courseCode && <span className="text-gray-500 ml-1">({courseCode})</span>}
                                </div>
                                <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                                  <span>{totalItems} khách hàng</span>
                                  <span>•</span>
                                  <span className={getCourseStatusClassName(courseStatus)}>
                                    {getCourseStatusLabel(courseStatus)}
                                  </span>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    );
                  })()
                )}
              </div>
              <p className="text-xs text-gray-500 mt-2">
                <strong>Lưu ý:</strong> Không chọn khóa học = lấy tất cả khách theo điều kiện đã chọn.
              </p>
            </div>

            <div className="bg-amber-50 p-3 rounded-lg">
              <p className="text-sm text-amber-700">
                <strong>Mẹo:</strong> Sử dụng bộ lọc khóa học để thu hẹp đối tượng nhận email hoặc tin nhắn, giúp nội dung phù hợp hơn với từng nhóm khách hàng.
              </p>
            </div>
          </div>
        );

      case 'columns':
        return (
          <div className="space-y-4">
            <NodeConfigDataColumnPicker
              title="Chỉ giữ các trường khách cần dùng"
              options={INTERESTED_CUSTOMER_COLUMN_OPTIONS}
              selectedKeys={selectedDataCols}
              setFormData={setFormData}
              formField="dataSelectedColumns"
              hint="API/DB vẫn trả đủ cột; server chỉ giữ các trường đã chọn trong bộ nhớ và log. Luôn giữ thêm customerId và id. Hãy chọn email/phone nếu node sau cần gửi tin."
            />
          </div>
        );

      case 'test': {
        const selectedTestIds = Array.isArray(formData.interestedSelectedCustomerIds)
          ? formData.interestedSelectedCustomerIds
          : [];
        const excludedTestIds = Array.isArray(formData.interestedExcludedCustomerIds)
          ? formData.interestedExcludedCustomerIds
          : [];
        const activeTestIds = interestedSelectionMode === 'fixed' ? selectedTestIds : excludedTestIds;

        const toggleTestCustomer = (customerId) => {
          if (interestedSelectionMode === 'all') return;
          setFormData((prev) => {
            const currentSelected = Array.isArray(prev.interestedSelectedCustomerIds)
              ? prev.interestedSelectedCustomerIds
              : [];
            const currentExcluded = Array.isArray(prev.interestedExcludedCustomerIds)
              ? prev.interestedExcludedCustomerIds
              : [];
            const mode = String(prev.interestedSelectionMode || '').trim().toLowerCase() || 'all';
            if (mode === 'fixed') {
              const nextSelected = currentSelected.includes(customerId)
                ? currentSelected.filter((id) => id !== customerId)
                : [...currentSelected, customerId];
              return { ...prev, interestedSelectedCustomerIds: nextSelected };
            }
            if (mode === 'all_exclude') {
              const nextExcluded = currentExcluded.includes(customerId)
                ? currentExcluded.filter((id) => id !== customerId)
                : [...currentExcluded, customerId];
              return { ...prev, interestedExcludedCustomerIds: nextExcluded };
            }
            return prev;
          });
        };

        const filteredPreview = testPreviewItems.filter((item) => {
          if (!testPreviewSearchQuery.trim()) return true;
          const q = testPreviewSearchQuery.toLowerCase();
          return (
            String(item.fullName || '').toLowerCase().includes(q) ||
            String(item.email || '').toLowerCase().includes(q) ||
            String(item.phone || '').toLowerCase().includes(q)
          );
        });

        const allFilteredIds = filteredPreview
          .map((i) => i.customerId)
          .filter(Boolean);
        const allSelected =
          allFilteredIds.length > 0 &&
          allFilteredIds.every((id) => activeTestIds.includes(id));

        const toggleAllFiltered = () => {
          if (interestedSelectionMode === 'all') return;
          setFormData((prev) => {
            const currentSelected = Array.isArray(prev.interestedSelectedCustomerIds)
              ? prev.interestedSelectedCustomerIds
              : [];
            const currentExcluded = Array.isArray(prev.interestedExcludedCustomerIds)
              ? prev.interestedExcludedCustomerIds
              : [];
            const mode = String(prev.interestedSelectionMode || '').trim().toLowerCase() || 'all';
            if (mode === 'fixed') {
              const nextSelected = allSelected
                ? currentSelected.filter((id) => !allFilteredIds.includes(id))
                : Array.from(new Set([...currentSelected, ...allFilteredIds]));
              return { ...prev, interestedSelectedCustomerIds: nextSelected };
            }
            if (mode === 'all_exclude') {
              const nextExcluded = allSelected
                ? currentExcluded.filter((id) => !allFilteredIds.includes(id))
                : Array.from(new Set([...currentExcluded, ...allFilteredIds]));
              return { ...prev, interestedExcludedCustomerIds: nextExcluded };
            }
            return prev;
          });
        };

        return (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleLoadTestPreview}
                disabled={isLoadingTestPreview}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isLoadingTestPreview
                    ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                    : 'bg-primary-600 text-white hover:bg-primary-700'
                }`}
              >
                {isLoadingTestPreview ? 'Đang tải...' : testPreviewItems.length > 0 ? 'Tải lại' : 'Tải dữ liệu thử'}
              </button>
              {testPreviewItems.length > 0 && (
                <span className="text-sm text-gray-500">
                  {testPreviewItems.length} bản ghi · đã chọn{' '}
                  {interestedSelectionMode === 'fixed' ? (
                    <strong className="text-primary-700">{selectedTestIds.length}</strong>
                  ) : interestedSelectionMode === 'all_exclude' ? (
                    <strong className="text-red-600">{excludedTestIds.length}</strong>
                  ) : (
                    <strong className="text-primary-700">tất cả</strong>
                  )}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {[
                { value: 'all', label: 'Tất cả', desc: 'Mặc định lấy toàn bộ, continuous sẽ cập nhật khách mới.' },
                { value: 'fixed', label: 'Cố định', desc: 'Chỉ chạy danh sách đã chọn, không nhận khách mới ngoài danh sách.' },
                { value: 'all_exclude', label: 'Tất cả trừ', desc: 'Lấy tất cả nhưng loại trừ những khách đã tick.' },
              ].map((option) => (
                <label
                  key={option.value}
                  className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                    interestedSelectionMode === option.value
                      ? 'bg-primary-50 border-primary-400'
                      : 'bg-white border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="interestedSelectionMode"
                      className="mt-0.5 text-primary-600 focus:ring-primary-500"
                      checked={interestedSelectionMode === option.value}
                      onChange={() => {
                        setFormData((prev) => ({
                          ...prev,
                          interestedSelectionMode: option.value,
                          ...(option.value === 'all'
                            ? { interestedSelectedCustomerIds: [], interestedExcludedCustomerIds: [] }
                            : option.value === 'fixed'
                              ? { interestedExcludedCustomerIds: [] }
                              : { interestedSelectedCustomerIds: [] }),
                        }));
                      }}
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-900">{option.label}</p>
                      <p className="text-xs text-gray-500 mt-0.5">{option.desc}</p>
                    </div>
                  </div>
                </label>
              ))}
            </div>
            <p className="text-xs text-gray-500">
              Nhấn để thử lấy dữ liệu theo cấu hình hiện tại. Kết quả chỉ để xem trước, không ảnh hưởng đến chiến dịch.
            </p>

            {isLoadingTestPreview ? (
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-10 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-500">Đang tải dữ liệu...</p>
              </div>
            ) : testPreviewItems.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-10 text-center">
                <HiOutlineDocumentText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">Chưa có dữ liệu</p>
                <p className="text-xs text-gray-400 mt-1">Nhấn "Tải dữ liệu thử" để xem trước danh sách khách hàng</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    placeholder="Tìm theo tên, email, SĐT..."
                    value={testPreviewSearchQuery}
                    onChange={(e) => setTestPreviewSearchQuery(e.target.value)}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                  />
                  <button
                    type="button"
                    onClick={toggleAllFiltered}
                    disabled={interestedSelectionMode === 'all'}
                    className="px-3 py-2 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors whitespace-nowrap"
                  >
                    {interestedSelectionMode === 'all'
                      ? 'Đang lấy tất cả'
                      : allSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả'}
                  </button>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="max-h-96 overflow-y-auto">
                    {filteredPreview.length === 0 ? (
                      <div className="p-6 text-center">
                        <p className="text-sm text-gray-500">Không tìm thấy kết quả phù hợp</p>
                      </div>
                    ) : (
                      filteredPreview.map((item, idx) => {
                        const cid = item.customerId;
                        const checked = cid && activeTestIds.includes(cid);
                        return (
                          <label
                            key={`${cid}-${idx}`}
                            className={`flex items-start gap-3 px-4 py-3 cursor-pointer border-b border-gray-100 last:border-b-0 transition-colors ${
                              checked ? 'bg-primary-50' : 'bg-white hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                              checked={!!checked}
                              onChange={() => toggleTestCustomer(cid)}
                              disabled={!cid || interestedSelectionMode === 'all'}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">
                                {item.fullName || '(Chưa có tên)'}
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2 flex-wrap">
                                {item.email && <span>{item.email}</span>}
                                {item.phone && <span>· {item.phone}</span>}
                                {item.courseName && (
                                  <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 truncate max-w-[160px]">
                                    {item.courseName}
                                  </span>
                                )}
                              </div>
                              <div className="mt-1">
                                <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                                  item.orderStatus === 'on-hold' || item.itemStatus === 'interested'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : 'bg-green-100 text-green-700'
                                }`}>
                                  {item.orderStatus === 'on-hold' || item.itemStatus === 'interested'
                                    ? 'Để lại TT'
                                    : 'Đã mua'}
                                </span>
                              </div>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                {interestedSelectionMode !== 'all' && activeTestIds.length > 0 && (
                  <div className="mt-2 p-2 bg-primary-50 rounded-lg flex items-center justify-between">
                    <p className={`text-xs ${interestedSelectionMode === 'all_exclude' ? 'text-red-700' : 'text-primary-700'}`}>
                      {interestedSelectionMode === 'fixed'
                        ? <>Đã chọn <strong>{selectedTestIds.length}</strong> khách hàng. Khi chạy node sẽ chỉ lấy những khách hàng này.</>
                        : <>Đã loại trừ <strong>{excludedTestIds.length}</strong> khách hàng. Continuous vẫn lấy khách mới nhưng bỏ qua danh sách loại trừ.</>}
                    </p>
                    <button
                      type="button"
                      onClick={() => setFormData((prev) => ({
                        ...prev,
                        ...(interestedSelectionMode === 'fixed'
                          ? { interestedSelectedCustomerIds: [] }
                          : { interestedExcludedCustomerIds: [] }),
                      }))}
                      className="text-xs text-gray-500 hover:text-red-500 ml-3 flex-shrink-0"
                    >
                      Xóa chọn
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="bg-green-50 p-3 rounded-lg">
              <p className="text-sm text-green-700">
                <strong>Lưu ý:</strong>{' '}
                {interestedSelectionMode === 'all'
                  ? 'Đang ở chế độ lấy tất cả (mặc định). Continuous sẽ tự lấy thêm khách mới theo chu kỳ.'
                  : interestedSelectionMode === 'fixed'
                    ? 'Đang ở chế độ cố định. Chỉ những khách hàng đã tích mới đi vào luồng.'
                    : 'Đang ở chế độ tất cả trừ. Continuous sẽ lấy thêm khách mới, trừ những khách đã tích loại trừ.'}
              </p>
            </div>
          </div>
        );
      }

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
          {readInterestedCustomersSections.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.id}
                onClick={() => setSelectedReadInterestedCustomersSection(section.id)}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedReadInterestedCustomersSection === section.id
                    ? 'bg-primary-50 border-l-4 border-primary-600'
                    : 'border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${selectedReadInterestedCustomersSection === section.id ? 'text-primary-600' : 'text-gray-500'}`} />
                    <span className={`text-sm ${selectedReadInterestedCustomersSection === section.id ? 'font-medium text-primary-900' : 'text-gray-700'}`}>
                      {section.name}
                    </span>
                  </div>
                  {section.badge && (
                    <span className="px-2 py-0.5 text-xs rounded-full bg-primary-600 text-white font-medium">
                      {section.badgeLabel}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {renderReadInterestedCustomersSection()}
      </div>
    </div>
  );
};
