import { useState, useEffect } from 'react';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import {
  HiOutlineAcademicCap,
  HiOutlineSearch,
  HiOutlineChevronRight,
  HiOutlineChevronLeft,
  HiOutlineRefresh,
} from 'react-icons/hi';

const COURSE_STATUS_LABELS = (t) => ({
  publish: t('courses.publish'),
  draft: t('courses.draft'),
  pending: t('courses.pending'),
  private: t('courses.private'),
  trash: t('courses.trash'),
});

const normalizeCourseStatus = (status) => {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized || 'publish';
};

const StatusBadge = ({ status, t }) => {
  const normalizedStatus = normalizeCourseStatus(status);
  const labels = COURSE_STATUS_LABELS(t);
  const label = labels[normalizedStatus] || normalizedStatus;
  const statusClassName =
    normalizedStatus === 'publish'
      ? 'bg-green-100 text-green-700'
      : normalizedStatus === 'pending'
        ? 'bg-amber-100 text-amber-700'
        : normalizedStatus === 'private'
          ? 'bg-purple-100 text-purple-700'
          : 'bg-gray-100 text-gray-600';

  return (
    <span className={`badge ${statusClassName}`}>
      {label}
    </span>
  );
};

const formatDate = (v) => {
  if (!v) return '--';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '--' : d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN');
};

const formatPrice = (price) => {
  if (!price || price === 0) return 'Miễn phí';
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
  }).format(price);
};

const Courses = () => {
  const { t } = useI18n();
  const [courses, setCourses] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });

  useEffect(() => {
    fetchCourses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, search]);

  const fetchCourses = async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        page: pagination.page,
        limit: 20,
        ...(search && { search }),
      });
      const res = await api.get(`/courses?${params}`);
      const data = res.data?.data || {};
      setCourses(data.courses || []);
      setPagination((p) => ({
        ...p,
        total: data.pagination?.total ?? 0,
        totalPages: data.pagination?.totalPages ?? 1,
      }));
    } catch (error) {
      toast.error(t('courses.loadFailed'));
      console.error('Error fetching courses:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(pendingSearch);
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const res = await api.post('/courses/sync');

      if (res.data?.success) {
        toast.success(res.data.message || t('courses.syncSuccess'));
        // Refresh danh sách sau khi sync
        await fetchCourses();
      } else {
        toast.error(res.data?.message || t('courses.syncFailed'));
      }
    } catch (error) {
      toast.error(t('courses.syncError'));
      console.error('Error syncing courses:', error);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('courses.courseManagement')}</h1>
          <p className="mt-1 text-gray-500">
            {t('courses.courseDescription')}
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="btn btn-primary flex items-center gap-2"
        >
          <HiOutlineRefresh className={`w-5 h-5 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? t('courses.syncing') : t('courses.syncNow')}
        </button>
      </div>

      {/* Search */}
      <div className="card p-4">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="flex items-center flex-1 min-w-0 rounded-lg border border-gray-300 bg-white transition-base focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
            <span className="pl-3 pr-2 text-gray-400 pointer-events-none shrink-0">
              <HiOutlineSearch className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
              placeholder={t('courses.searchPlaceholder')}
              className="w-full py-2 pr-3 text-sm bg-transparent border-0 rounded-lg focus:outline-none"
            />
          </div>
          <button type="submit" className="btn btn-secondary shrink-0">
            {t('common.search')}
          </button>
        </form>
      </div>

      {/* Courses table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="spinner w-8 h-8" />
          </div>
        ) : courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-3">
            <HiOutlineAcademicCap className="w-10 h-10" />
            <p>{t('courses.noCourses')}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('courses.courseCode')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('courses.courseName')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('courses.price')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('common.status')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('courses.lastUpdated')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {courses.map((course) => (
                    <tr key={course.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {course.courseCode}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-50 shrink-0 mr-3">
                            <HiOutlineAcademicCap className="w-5 h-5 text-primary-600" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {course.courseName}
                            </div>
                            {course.category && (
                              <div className="text-xs text-gray-500 mt-1">
                                {course.category}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                        {formatPrice(course.price)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={course.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(course.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">{t('courses.totalCourses', { total: pagination.total })}</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                    disabled={pagination.page === 1}
                    className="btn btn-secondary btn-sm disabled:opacity-50"
                  >
                    <HiOutlineChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm px-1 text-gray-600">
                    {pagination.page} / {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                    disabled={pagination.page === pagination.totalPages}
                    className="btn btn-secondary btn-sm disabled:opacity-50"
                  >
                    <HiOutlineChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default Courses;
