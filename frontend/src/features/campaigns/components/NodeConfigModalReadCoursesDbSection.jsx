import { useEffect, useMemo, useState } from 'react';
import {
  HiOutlineDocument,
  HiOutlineSearch,
  HiOutlineShoppingCart,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';

const COURSE_STATUS_OPTIONS = ['publish', 'draft', 'pending', 'private'];

const normalizeCourseStatus = (status) => String(status || '').trim().toLowerCase() || 'publish';

const getCourseStatusLabel = (status, t) => {
  const normalized = normalizeCourseStatus(status);
  if (normalized === 'publish') return t('readCoursesDb.statusPublish');
  if (normalized === 'draft') return t('readCoursesDb.statusDraft');
  if (normalized === 'pending') return t('readCoursesDb.statusPending');
  if (normalized === 'private') return t('readCoursesDb.statusPrivate');
  if (normalized === 'trash') return t('readCoursesDb.statusTrash');
  return normalized;
};

const getCourseStatusClassName = (status) => {
  const normalized = normalizeCourseStatus(status);
  if (normalized === 'publish') return 'text-green-600';
  if (normalized === 'pending') return 'text-amber-600';
  if (normalized === 'private') return 'text-purple-600';
  return 'text-gray-500';
};

/**
 * Section UI for read-courses-db node configuration.
 *
 * @param {Object} props section props
 * @param {Object} props.formData current node form data
 * @param {Function} props.setFormData React setter for form data
 * @param {string} props.selectedReadCoursesDbSection active section id
 * @param {Function} props.setSelectedReadCoursesDbSection section state setter
 * @param {Function} props.handleLoadCoursesPreview action to load courses list
 * @param {boolean} props.isLoadingCoursesPreview loading flag for courses list
 * @param {Array} props.coursesPreviewItems loaded courses list
 * @returns {JSX.Element}
 */
export const NodeConfigReadCoursesDbSection = ({
  formData,
  setFormData,
  selectedReadCoursesDbSection,
  setSelectedReadCoursesDbSection,
  handleLoadCoursesPreview,
  isLoadingCoursesPreview,
  coursesPreviewItems,
}) => {
  const { t } = useI18n();
  const [lastAutoLoadCoursesKey, setLastAutoLoadCoursesKey] = useState('');
  const selectedCoursesDbIds = (Array.isArray(formData.coursesDbSelectedIds) ? formData.coursesDbSelectedIds : [])
    .map((v) => parseInt(v, 10))
    .filter((v, idx, arr) => Number.isFinite(v) && arr.indexOf(v) === idx);
  const autoLoadCoursesSignature = useMemo(
    () => [
      formData.coursesDbLimit || 1000,
      formData.coursesDbSearchTerm || '',
      (Array.isArray(formData.coursesDbStatuses) ? formData.coursesDbStatuses : [])
        .map((item) => String(item || '').trim().toLowerCase())
        .filter(Boolean)
        .sort()
        .join(','),
    ].join('|'),
    [formData.coursesDbLimit, formData.coursesDbSearchTerm, formData.coursesDbStatuses]
  );

  useEffect(() => {
    if (selectedReadCoursesDbSection !== 'select') return;
    if (isLoadingCoursesPreview) return;
    if (lastAutoLoadCoursesKey === autoLoadCoursesSignature) return;

    setLastAutoLoadCoursesKey(autoLoadCoursesSignature);
    handleLoadCoursesPreview();
  }, [
    autoLoadCoursesSignature,
    handleLoadCoursesPreview,
    isLoadingCoursesPreview,
    lastAutoLoadCoursesKey,
    selectedReadCoursesDbSection,
  ]);

  const toggleCourseDb = (courseId) => {
    const id = parseInt(courseId, 10);
    if (!Number.isFinite(id)) return;
    setFormData((prev) => ({ ...prev, coursesDbSelectedIds: [id] }));
  };

  const toggleCourseStatusFilter = (status) => {
    const normalized = normalizeCourseStatus(status);
    setFormData((prev) => {
      const current = (Array.isArray(prev.coursesDbStatuses) ? prev.coursesDbStatuses : [])
        .map((item) => normalizeCourseStatus(item))
        .filter((item, idx, arr) => item && arr.indexOf(item) === idx);
      const next = current.includes(normalized)
        ? current.filter((item) => item !== normalized)
        : [...current, normalized];
      return { ...prev, coursesDbStatuses: next };
    });
  };

  const readCoursesDbSections = [
    { id: 'basic', name: t('readCoursesDb.basicInfo'), icon: HiOutlineDocument },
    {
      id: 'select',
      name: t('readCoursesDb.filterByCourse'),
      icon: HiOutlineSearch,
      badge: selectedCoursesDbIds.length > 0,
      badgeLabel: selectedCoursesDbIds.length,
    },
  ];

  const renderReadCoursesDbSection = () => {
    switch (selectedReadCoursesDbSection) {
      case 'basic':
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('readCoursesDb.nodeName')}</label>
              <input
                type="text"
                value={formData.label}
                onChange={(e) => setFormData((prev) => ({ ...prev, label: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                placeholder={t('readCoursesDb.readCoursesPlaceholder')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('readCoursesDb.maxRecords')}</label>
              <input
                type="number"
                min={1}
                max={5000}
                value={formData.coursesDbLimit || 1000}
                onChange={(e) => setFormData((prev) => ({ ...prev, coursesDbLimit: parseInt(e.target.value, 10) || 1000 }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
              />
              <p className="text-xs text-gray-500 mt-1">{t('readCoursesDb.maxRecordsHint')}</p>
            </div>
            <div className="bg-blue-50 p-3 rounded-lg">
              <p className="text-sm text-blue-700">
                <strong>{t('readCoursesDb.note')}:</strong> {t('readCoursesDb.readCoursesNote')}
              </p>
            </div>
          </div>
        );

      case 'select':
        return (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">{t('readCoursesDb.filterByCourse')}</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoadCoursesPreview}
                    disabled={isLoadingCoursesPreview}
                    className="px-3 py-1.5 text-xs rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 font-medium transition-colors"
                  >
                    {isLoadingCoursesPreview ? t('readCoursesDb.loading') : t('readCoursesDb.loadList')}
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-xs rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
                    onClick={() => setFormData((prev) => ({ ...prev, coursesDbSelectedIds: [] }))}
                    disabled={!selectedCoursesDbIds.length}
                  >
                    {t('readCoursesDb.deselect')}
                  </button>
                </div>
              </div>

              {selectedCoursesDbIds.length > 0 && (
                <div className="mb-3 p-2 bg-primary-50 rounded-lg">
                  <p className="text-xs text-primary-700">
                    <strong>1</strong> {t('readCoursesDb.courseSelected')}
                  </p>
                </div>
              )}

              <div className="mb-3">
                <input
                  type="text"
                  placeholder={t('readCoursesDb.searchCourse')}
                  value={formData.coursesDbSearchTerm || ''}
                  onChange={(e) => setFormData((prev) => ({ ...prev, coursesDbSearchTerm: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div className="mb-3">
                <p className="text-xs font-medium text-gray-600 mb-2">{t('readCoursesDb.filterByStatus')}</p>
                <div className="flex flex-wrap gap-2">
                  {COURSE_STATUS_OPTIONS.map((status) => {
                    const activeStatuses = (Array.isArray(formData.coursesDbStatuses) ? formData.coursesDbStatuses : [])
                      .map((item) => normalizeCourseStatus(item));
                    const checked = activeStatuses.includes(status);
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
                        {getCourseStatusLabel(status, t)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="border border-gray-200 rounded-lg p-4 max-h-96 overflow-auto bg-gray-50">
                {isLoadingCoursesPreview ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto mb-2"></div>
                    <p className="text-sm text-gray-500">{t('readCoursesDb.loadingCoursesList')}</p>
                  </div>
                ) : coursesPreviewItems.length === 0 ? (
                  <div className="text-center py-8">
                    <HiOutlineShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                    <p className="text-sm text-gray-500">{t('readCoursesDb.noCourses')}</p>
                    <p className="text-xs text-gray-400 mt-1">{t('readCoursesDb.pressLoadList')}</p>
                  </div>
                ) : (
                  (() => {
                    const searchTerm = String(formData.coursesDbSearchTerm || '').toLowerCase().trim();
                    const filteredCourses = coursesPreviewItems.filter((item) => {
                      if (!searchTerm) return true;
                      const courseName = String(item.courseName || '').toLowerCase();
                      const courseCode = String(item.courseCode || '').toLowerCase();
                      return courseName.includes(searchTerm) || courseCode.includes(searchTerm);
                    });

                    if (filteredCourses.length === 0) {
                      return (
                        <div className="text-center py-8">
                          <HiOutlineShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-2" />
                          <p className="text-sm text-gray-500">{t('readCoursesDb.noCoursesFound', { searchTerm: formData.coursesDbSearchTerm })}</p>
                        </div>
                      );
                    }

                    return (
                      <div className="space-y-2">
                        {filteredCourses.map((course, idx) => {
                          const courseId = parseInt(course.id, 10);
                          const checked = Number.isFinite(courseId) && selectedCoursesDbIds.includes(courseId);
                          const courseName = String(course.courseName || `${t('readCoursesDb.course')} #${idx + 1}`);
                          const courseCode = String(course.courseCode || '').trim();
                          const price = course.price ? `${course.price.toLocaleString()}đ` : t('readCoursesDb.noPrice');
                          return (
                            <label
                              key={`${course.id || 'none'}-${idx}`}
                              className={`flex items-start gap-3 p-3 rounded-lg cursor-pointer transition-colors ${
                                checked ? 'bg-primary-50 border border-primary-200' : 'bg-white border border-gray-200 hover:bg-gray-50'
                              }`}
                            >
                              <input
                                type="radio"
                                name="selected-course"
                                className="mt-1 border-gray-300 text-primary-600 focus:ring-primary-500"
                                checked={checked}
                                onChange={() => toggleCourseDb(courseId)}
                                disabled={!Number.isFinite(courseId)}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium text-gray-900">
                                  {courseName}
                                  {courseCode && <span className="text-gray-500 ml-1 font-mono">({courseCode})</span>}
                                </div>
                                <div className="flex items-center gap-2 text-xs text-gray-500 mt-0.5">
                                  <span>{price}</span>
                                  {course.status !== undefined && course.status !== null && (
                                    <>
                                      <span>•</span>
                                      <span className={getCourseStatusClassName(course.status)}>
                                        {getCourseStatusLabel(course.status, t)}
                                      </span>
                                    </>
                                  )}
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
                <strong>{t('readCoursesDb.note')}:</strong> {t('readCoursesDb.noSelectionNote')}
              </p>
            </div>

            <div className="bg-amber-50 p-3 rounded-lg">
              <p className="text-sm text-amber-700">
                <strong>{t('readCoursesDb.tip')}:</strong> {t('readCoursesDb.tipContent')}
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
          <h3 className="text-sm font-semibold text-gray-700">{t('readCoursesDb.settings')}</h3>
        </div>
        <div className="flex-1 overflow-y-auto">
          {readCoursesDbSections.map((section) => {
            const Icon = section.icon;
            return (
              <div
                key={section.id}
                onClick={() => setSelectedReadCoursesDbSection(section.id)}
                className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                  selectedReadCoursesDbSection === section.id
                    ? 'bg-primary-50 border-l-4 border-primary-600'
                    : 'border-l-4 border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={`w-4 h-4 ${selectedReadCoursesDbSection === section.id ? 'text-primary-600' : 'text-gray-500'}`} />
                    <span className={`text-sm ${selectedReadCoursesDbSection === section.id ? 'font-medium text-primary-900' : 'text-gray-700'}`}>
                      {section.name}
                    </span>
                  </div>
                  {section.badge && (
                    section.badgeLabel ? (
                      <span className="px-2 py-0.5 rounded-full bg-primary-600 text-white text-xs font-medium">
                        {section.badgeLabel}
                      </span>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-primary-600"></span>
                    )
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {renderReadCoursesDbSection()}
      </div>
    </div>
  );
};
