import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../../i18n';
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

const INTERESTED_COURSE_STATUS_OPTIONS = ['publish', 'draft', 'pending', 'private'];

const normalizeCourseStatus = (status) => String(status || '').trim().toLowerCase() || 'publish';

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
  const { t } = useI18n();
  const [lastAutoLoadTestKey, setLastAutoLoadTestKey] = useState('');

  const INTERESTED_COURSE_STATUS_LABELS = {
    publish: t('readInterestedCustomers.publish', { defaultValue: 'Publish (Công khai)' }),
    draft: t('readInterestedCustomers.draft', { defaultValue: 'Draft (Nháp)' }),
    pending: t('readInterestedCustomers.pending', { defaultValue: 'Pending (Chờ duyệt)' }),
    private: t('readInterestedCustomers.private', { defaultValue: 'Private (Riêng tư)' }),
    trash: t('readInterestedCustomers.trash', { defaultValue: 'Trash (Đã xóa)' }),
  };

  const getCourseStatusLabel = (status) => {
    const normalized = normalizeCourseStatus(status);
    return INTERESTED_COURSE_STATUS_LABELS[normalized] || normalized;
  };

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
    { id: 'basic', name: t('nodeConfig.basicInfo'), icon: HiOutlineDocument },
    {
      id: 'filter',
      name: t('nodeConfig.filterCourses'),
      icon: HiOutlineSearch,
      badge: selectedCourseIds.length > 0,
      badgeLabel: selectedCourseIds.length,
    },
    {
      id: 'columns',
      name: t('nodeConfig.dataColumns'),
      icon: HiOutlineTable,
      badge: selectedDataCols.length > 0,
      badgeLabel: selectedDataCols.length,
    },
    {
      id: 'test',
      name: t('nodeConfig.selectCustomers'),
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
      toast.error(t('nodeConfig.cannotLoadPreview'));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- handleLoadTestPreview là helper trong scope, không nên trigger refetch
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
          { value: 'interested', label: t('nodeConfig.interestedStatus'), desc: t('nodeConfig.interestedDesc') },
          { value: 'purchased', label: t('nodeConfig.purchased'), desc: t('nodeConfig.purchasedDesc') },
          { value: 'both', label: t('nodeConfig.both'), desc: t('nodeConfig.bothDesc') },
        ];
        const dataSourceOpts = [
          { value: 'database', label: t('nodeConfig.database'), desc: t('nodeConfig.databaseDesc') },
          { value: 'api', label: t('nodeConfig.api'), desc: t('nodeConfig.apiDesc') },
        ];
        const currentCustomerType = formData.interestedCustomerType || 'interested';
        const currentDataSource = formData.interestedDataSource || 'database';
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('nodeConfig.nodeName')}</label>
              <input
                type="text"
                value={formData.label}
                onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder={t('nodeConfig.placeholderNodeName')}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('nodeConfig.dataSource')}</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-2">{t('nodeConfig.filterByCondition')}</label>
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
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('nodeConfig.maxRecords')}</label>
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
                  ? t('nodeConfig.purchasedNote')
                  : currentCustomerType === 'both'
                    ? t('nodeConfig.bothNote')
                    : t('nodeConfig.interestedNote')}
              </p>
            </div>

            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>{t('nodeConfig.note')}</strong>{' '}
                {currentDataSource === 'database'
                  ? t('nodeConfig.databaseTip')
                  : t('nodeConfig.apiTip')}
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
                <label className="block text-sm font-medium text-gray-700">{t('nodeConfig.filterCourses')}</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs rounded-lg bg-primary-50 hover:bg-primary-100 text-primary-700 font-medium transition-colors"
                    onClick={() => setFormData((prev) => ({ ...prev, interestedCourseIds: selectableIds }))}
                    disabled={!selectableIds.length}
                  >
                    {t('nodeConfig.selectAll')}
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
                    onClick={() => setFormData((prev) => ({ ...prev, interestedCourseIds: [] }))}
                    disabled={!selectedCourseIds.length}
                  >
                    {t('nodeConfig.deselectAll')}
                  </button>
                </div>
              </div>

              {selectedCourseIds.length > 0 && (
                <div className="mb-3 p-2 bg-primary-50 rounded-lg">
                  <p className="text-xs text-primary-700">
                    <strong>{selectedCourseIds.length}</strong> {t('nodeConfig.coursesSelected', { count: selectedCourseIds.length, defaultValue: `khóa học đã được chọn` })}
                  </p>
                </div>
              )}

              <div className="mb-3">
                <input
                  type="text"
                  placeholder={t('nodeConfig.searchCourses')}
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
                <p className="text-xs font-medium text-gray-600 mb-2">{t('nodeConfig.filterByStatus')}</p>
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
                    <p className="text-sm text-gray-500">{t('nodeConfig.loadingCourses')}</p>
                  </div>
                ) : interestedCourseOptions.length === 0 ? (
                  <div className="text-center py-8">
                    <HiOutlineDocumentText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">{t('nodeConfig.noCourses')}</p>
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
                            {t('nodeConfig.noCoursesMatch')}
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
                                  <span>{t('nodeConfig.customers', { count: totalItems, defaultValue: `${totalItems} khách hàng` })}</span>
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
                <strong>{t('nodeConfig.note')}</strong> {t('nodeConfig.noCoursesFilter')}
              </p>
            </div>

            <div className="bg-amber-50 p-3 rounded-lg">
              <p className="text-sm text-amber-700">
                <strong>{t('nodeConfig.tip')}</strong> {t('nodeConfig.filterTip')}
              </p>
            </div>
          </div>
        );

      case 'columns':
        return (
          <div className="space-y-4">
            <NodeConfigDataColumnPicker
              title={t('nodeConfig.keepCustomerFields')}
              options={INTERESTED_CUSTOMER_COLUMN_OPTIONS}
              selectedKeys={selectedDataCols}
              setFormData={setFormData}
              formField="dataSelectedColumns"
              hint={t('nodeConfig.keepFieldsHint')}
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
                {isLoadingTestPreview ? t('nodeConfig.loading') : testPreviewItems.length > 0 ? t('nodeConfig.reload') : t('nodeConfig.loadTestData')}
              </button>
              {testPreviewItems.length > 0 && (
                <span className="text-sm text-gray-500">
                  {testPreviewItems.length} {t('nodeConfig.records', { defaultValue: 'bản ghi' })} · {t('nodeConfig.selected', { defaultValue: 'đã chọn' })}{' '}
                  {interestedSelectionMode === 'fixed' ? (
                    <strong className="text-primary-700">{selectedTestIds.length}</strong>
                  ) : interestedSelectionMode === 'all_exclude' ? (
                    <strong className="text-red-600">{excludedTestIds.length}</strong>
                  ) : (
                    <strong className="text-primary-700">{t('nodeConfig.all')}</strong>
                  )}
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {[
                { value: 'all', label: t('nodeConfig.all'), desc: t('nodeConfig.allDesc') },
                { value: 'fixed', label: t('nodeConfig.fixed'), desc: t('nodeConfig.fixedDesc') },
                { value: 'all_exclude', label: t('nodeConfig.allExclude'), desc: t('nodeConfig.allExcludeDesc') },
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
              {t('nodeConfig.testPreviewNote')}
            </p>

            {isLoadingTestPreview ? (
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-10 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
                <p className="text-sm text-gray-500">{t('nodeConfig.loadingData')}</p>
              </div>
            ) : testPreviewItems.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-lg p-10 text-center">
                <HiOutlineDocumentText className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-500">{t('nodeConfig.noData')}</p>
                <p className="text-xs text-gray-400 mt-1">{t('nodeConfig.loadTestDataHint')}</p>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="text"
                    placeholder={t('nodeConfig.searchByName')}
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
                      ? t('nodeConfig.takingAll')
                      : allSelected ? t('nodeConfig.deselectAll2') : t('nodeConfig.selectAll2')}
                  </button>
                </div>

                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="max-h-96 overflow-y-auto">
                    {filteredPreview.length === 0 ? (
                      <div className="p-6 text-center">
                        <p className="text-sm text-gray-500">{t('nodeConfig.noResults')}</p>
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
                                {item.fullName || t('nodeConfig.noName')}
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
                                    ? t('nodeConfig.interested')
                                    : t('nodeConfig.purchasedShort')}
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
                        ? <>{t('nodeConfig.selectedCount', { count: selectedTestIds.length, defaultValue: `Đã chọn ${selectedTestIds.length} khách hàng. Khi chạy node sẽ chỉ lấy những khách hàng này.` })}</>
                        : <>{t('nodeConfig.excludedCount', { count: excludedTestIds.length, defaultValue: `Đã loại trừ ${excludedTestIds.length} khách hàng. Continuous vẫn lấy khách mới nhưng bỏ qua danh sách loại trừ.` })}</>}
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
                      {t('nodeConfig.clearSelection')}
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="bg-green-50 p-3 rounded-lg">
              <p className="text-sm text-green-700">
                <strong>{t('nodeConfig.note')}</strong>{' '}
                {interestedSelectionMode === 'all'
                  ? t('nodeConfig.allModeNote')
                  : interestedSelectionMode === 'fixed'
                    ? t('nodeConfig.fixedModeNote')
                    : t('nodeConfig.allExcludeModeNote')}
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
          <h3 className="text-sm font-semibold text-gray-700">{t('nodeConfig.settings')}</h3>
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
