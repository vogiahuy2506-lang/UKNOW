import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import PageContainer from '../../components/common/PageContainer';
import courseApiService from '../../features/courses/services/courseApi.service';
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

const StatusBadge = ({ status }) => {
  const { t } = useI18n();
  const normalizedStatus = normalizeCourseStatus(status);
  const labels = COURSE_STATUS_LABELS(t);
  const label = labels[normalizedStatus] || normalizedStatus;
  const statusConfig =
    normalizedStatus === 'publish'
      ? { cls: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800', dot: 'bg-emerald-500' }
      : normalizedStatus === 'pending'
        ? { cls: 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800', dot: 'bg-amber-500' }
        : normalizedStatus === 'private'
          ? { cls: 'bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border-purple-200/80 dark:border-purple-800', dot: 'bg-purple-500' }
          : { cls: 'bg-slate-100 dark:bg-dk-raised text-slate-600 dark:text-dk-text2 border-slate-200 dark:border-dk-border', dot: 'bg-slate-400' };

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border shadow-2xs ${statusConfig.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dot}`} />
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
      const params = {
        page: pagination.page,
        limit: 20,
        ...(search && { search }),
      };
      const res = await courseApiService.getCourses(params);
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
      const res = await courseApiService.syncCourses();

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
    <PageContainer
      icon={HiOutlineAcademicCap}
      title={t('courses.courseManagement')}
      subtitle={t('courses.courseDescription')}
      actions={
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-xs sm:text-sm font-bold shadow-sm hover:shadow transition-all duration-150 disabled:opacity-50"
        >
          <HiOutlineRefresh className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? t('courses.syncing') : t('courses.syncNow')}
        </button>
      }
    >
      {/* Search */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-dk-border/90 bg-white dark:bg-dk-surface p-3.5 shadow-2xs">
        <form onSubmit={handleSearch} className="flex gap-2 sm:gap-3">
          <div className="relative flex-1">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-dk-muted pointer-events-none" />
            <input
              type="text"
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
              placeholder={t('courses.searchPlaceholder')}
              className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 dark:bg-dk-inset dark:text-dk-text hover:bg-slate-100/70 dark:hover:bg-dk-strong/70 focus:bg-white dark:focus:bg-dk-raised border border-slate-200 dark:border-dk-border rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 dark:placeholder:text-dk-muted"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface hover:bg-slate-50 dark:hover:bg-dk-raised text-xs sm:text-sm font-semibold text-slate-700 dark:text-dk-text transition-colors shadow-2xs shrink-0"
          >
            {t('common.search')}
          </button>
        </form>
      </div>

      {/* Courses table */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-dk-border/90 bg-white dark:bg-dk-surface shadow-2xs overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-slate-200 dark:border-dk-border border-t-orange-500 rounded-full animate-spin" />
          </div>
        ) : courses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400 dark:text-dk-muted gap-2">
            <HiOutlineAcademicCap className="w-10 h-10 text-slate-300 dark:text-dk-muted" />
            <p className="text-sm">{t('courses.noCourses')}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 dark:divide-dk-border">
                <thead className="bg-slate-50/80 dark:bg-dk-raised/80">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider">
                      {t('courses.courseCode')}
                    </th>
                    <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider">
                      {t('courses.courseName')}
                    </th>
                    <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider">
                      {t('courses.price')}
                    </th>
                    <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider">
                      {t('common.status')}
                    </th>
                    <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider">
                      {t('courses.lastUpdated')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dk-surface divide-y divide-slate-100 dark:divide-dk-border">
                  {courses.map((course) => (
                    <tr key={course.id} className="hover:bg-slate-50/70 dark:hover:bg-dk-raised/70 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-xs sm:text-sm font-mono text-slate-500 dark:text-dk-text2">
                        {course.courseCode}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-100/80 dark:border-orange-800 text-orange-600 dark:text-orange-400 shrink-0 mr-3 shadow-2xs">
                            <HiOutlineAcademicCap className="w-5 h-5" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-dk-text truncate">
                              {course.courseName}
                            </div>
                            {course.category && (
                              <div className="text-xs text-slate-400 dark:text-dk-muted mt-0.5 truncate">
                                {course.category}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs sm:text-sm text-slate-900 dark:text-dk-text font-semibold">
                        {formatPrice(course.price)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={course.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs sm:text-sm text-slate-500 dark:text-dk-text2">
                        {formatDate(course.updatedAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-dk-border bg-slate-50/50 dark:bg-dk-raised/50">
                <p className="text-xs sm:text-sm text-slate-500 dark:text-dk-text2 font-medium">{t('courses.totalCourses', { total: pagination.total })}</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                    disabled={pagination.page === 1}
                    className="p-1.5 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface hover:bg-slate-50 dark:hover:bg-dk-raised text-slate-600 dark:text-dk-text2 disabled:opacity-40 transition-colors shadow-2xs"
                  >
                    <HiOutlineChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs sm:text-sm px-1.5 font-semibold text-slate-700 dark:text-dk-text">
                    {pagination.page} / {pagination.totalPages}
                  </span>
                  <button
                    onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                    disabled={pagination.page === pagination.totalPages}
                    className="p-1.5 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface hover:bg-slate-50 dark:hover:bg-dk-raised text-slate-600 dark:text-dk-text2 disabled:opacity-40 transition-colors shadow-2xs"
                  >
                    <HiOutlineChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </PageContainer>
  );
};

export default Courses;
