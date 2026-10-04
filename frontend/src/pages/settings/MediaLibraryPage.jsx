import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlinePhotograph,
  HiOutlineExclamation,
  HiOutlineTrash,
  HiOutlineSearch,
  HiOutlineExternalLink,
} from 'react-icons/hi';
import api from '../../services/api';
import { FileTypeIcon } from '../../components/MessageAttachments';
import PageHeader from '../../components/common/PageHeader';
import { useI18n } from '../../i18n';
import { formatBytes } from '../../features/storage/storageUtils';
import { STORAGE_CATEGORIES, resolveStorageCategory } from '../../features/storage/storageCategories';
import { notifyStorageQuotaRefresh } from '../../features/storage/storageEvents';
import { useAuthStore } from '../../stores/authStore';

function CategoryBadge({ category, t }) {
  const item = resolveStorageCategory(category, t);
  return (
    <span className={`text-[11px] font-medium border px-2 py-0.5 rounded-md ${item.color}`}>
      {item.label}
    </span>
  );
}

function StorageObjectCard({ item, onDeleteClick, t, locale = 'vi' }) {
  const isImage = item.type === 'image' || String(item.mimeType || '').startsWith('image/');
  const [imageError, setImageError] = useState(false);

  return (
    <div className="border border-slate-200 rounded-xl p-3 bg-white flex flex-col justify-between gap-3 hover:shadow-sm transition-shadow">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <CategoryBadge category={item.category} t={t} />
          <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded">
            {formatBytes(item.sizeBytes || item.size)}
          </span>
        </div>

        {isImage && item.url && !imageError ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block aspect-video w-full overflow-hidden rounded-lg bg-slate-50 border border-slate-100 group relative"
          >
            <img
              src={item.url}
              alt={item.displayName || item.name || ''}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              onError={() => setImageError(true)}
            />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs gap-1 font-medium">
              <HiOutlineExternalLink className="w-4 h-4" /> {t('mediaLibrary.openView')}
            </div>
          </a>
        ) : (
          <div className="aspect-video w-full rounded-lg bg-slate-50 border border-slate-100 flex flex-col items-center justify-center gap-1.5 p-3">
            <FileTypeIcon fileName={item.displayName || item.name} className="w-8 h-8" />
            <span className="text-[11px] text-slate-500 font-mono uppercase">
              {item.displayName?.split('.').pop() || 'FILE'}
            </span>
          </div>
        )}

        <div>
          <div className="text-xs font-medium text-slate-800 truncate" title={item.displayName || item.name}>
            {item.displayName || item.name || '—'}
          </div>
          {item.createdAt && (
            <div className="text-[11px] text-slate-400 mt-0.5">
              {new Date(item.createdAt).toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
              })}
            </div>
          )}
        </div>
      </div>

      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-blue-600 hover:text-blue-700 flex items-center gap-1 font-medium"
          >
            <HiOutlineExternalLink className="w-3.5 h-3.5" />
            {t('mediaLibrary.viewFile')}
          </a>
        ) : (
          <span />
        )}
        {onDeleteClick && <button
          type="button"
          onClick={() => onDeleteClick(item)}
          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title={t('mediaLibrary.deleteBtn')}
        >
          <HiOutlineTrash className="w-4 h-4" />
        </button>}
      </div>
    </div>
  );
}

export default function MediaLibraryPage() {
  const { t, locale } = useI18n();
  const activeContext = useAuthStore((state) => state.activeContext);
  const canManage = activeContext?.type !== 'employee'
    || activeContext?.permissions?.media_library_manage === true;
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [categorySummary, setCategorySummary] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, limit: 24 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [conflictBanner, setConflictBanner] = useState(null);

  // Deletion modal state
  const [deletingItem, setDeletingItem] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setConflictBanner(null);
    try {
      const params = { page, limit: 24 };
      if (category) params.category = category;
      if (search) params.search = search;

      const res = await api.get('/media-library/objects', { params });
      setItems(res.data?.data || []);
      setCategorySummary(res.data?.categorySummary || []);
      setPagination(res.data?.pagination || { total: 0, pages: 1, limit: 24 });
    } catch (err) {
      setError(err.response?.data?.message || err.message || t('mediaLibrary.loadError'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [category, search, page, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeleteConfirm = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    setConflictBanner(null);
    try {
      await api.delete(`/media-library/objects/${deletingItem.id}`);
      setDeletingItem(null);
      notifyStorageQuotaRefresh();
      await load();
    } catch (err) {
      const responseData = err.response?.data;
      if (err.response?.status === 409 && responseData?.message) {
        setConflictBanner({
          message: responseData.message,
          url: responseData.data?.url,
        });
      } else {
        setError(responseData?.message || t('mediaLibrary.deleteError'));
      }
      setDeletingItem(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const categoryOptions = useMemo(() => ([
    { value: '', label: t('mediaLibrary.allCategories') },
    ...STORAGE_CATEGORIES.map((item) => ({ value: item.value, label: t(item.labelKey) })),
  ]), [t]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={HiOutlinePhotograph}
        title={t('mediaLibrary.title')}
        subtitle={t('mediaLibrary.subtitle')}
      />

      <p className="text-xs text-slate-500">
        {t('mediaLibrary.zaloNote', { inbox: t('nav.inbox') })}
      </p>

      {/* Thẻ tổng theo danh mục — bấm để lọc */}
      {categorySummary.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {t('mediaLibrary.categorySummary')}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
            {categorySummary.map((summary) => {
              const isSelected = category === summary.category;
              return (
                <button
                  key={summary.category}
                  type="button"
                  onClick={() => {
                    setCategory(isSelected ? '' : summary.category);
                    setPage(1);
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    isSelected
                      ? 'border-orange-500 bg-orange-50/50 ring-2 ring-orange-200'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="text-xs text-slate-500 truncate">
                    <CategoryBadge category={summary.category} t={t} />
                  </div>
                  <div className="text-sm font-bold text-slate-800 mt-1.5">
                    {formatBytes(summary.totalBytes)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {t('mediaLibrary.fileCount', { count: summary.count })}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Thanh lọc: lọc theo danh mục = lọc theo việc dùng tệp. */}
      <div className="flex flex-wrap gap-2.5 items-center justify-between bg-slate-50/80 p-2.5 rounded-xl border border-slate-200">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <HiOutlineSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('mediaLibrary.searchPlaceholder')}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
        </div>

        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className="border border-slate-200 rounded-lg text-sm px-3 py-1.5 bg-white text-slate-700"
        >
          {categoryOptions.map((opt) => (
            <option key={opt.value || 'all'} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {conflictBanner && (
        <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start justify-between gap-3">
          <div className="flex gap-2 items-start">
            <HiOutlineExclamation className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">{conflictBanner.message}</p>
              {conflictBanner.url && (
                <a
                  href={conflictBanner.url}
                  className="text-xs text-amber-800 underline hover:text-amber-950 mt-1 inline-block font-semibold"
                >
                  {t('mediaLibrary.goToManageScreen')} &rarr;
                </a>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setConflictBanner(null)}
            className="text-xs text-amber-600 hover:text-amber-800 px-2 py-1"
          >
            {t('common.close')}
          </button>
        </div>
      )}

      {error && (
        <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500 py-16 text-center">{t('common.loading')}</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-slate-500 py-16 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
          {t('mediaLibrary.empty')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {items.map((item) => (
            <StorageObjectCard
              key={item.id}
              item={item}
              onDeleteClick={canManage ? (target) => setDeletingItem(target) : undefined}
              t={t}
              locale={locale}
            />
          ))}
        </div>
      )}

      {pagination.pages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="px-3.5 py-1.5 text-sm rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 bg-white"
          >
            {t('common.previous')}
          </button>
          <span className="text-sm text-slate-600">{page} / {pagination.pages}</span>
          <button
            type="button"
            disabled={page >= pagination.pages}
            onClick={() => setPage((p) => p + 1)}
            className="px-3.5 py-1.5 text-sm rounded-lg border border-slate-200 disabled:opacity-40 hover:bg-slate-50 bg-white"
          >
            {t('common.next')}
          </button>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingItem && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200">
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <HiOutlineTrash className="w-5 h-5" />
              </div>
              <h3 className="text-base font-bold text-slate-900">
                {t('mediaLibrary.deleteConfirmTitle')}
              </h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">
              {t('mediaLibrary.deleteConfirmMessage', {
                name: deletingItem.displayName || deletingItem.name,
                size: formatBytes(deletingItem.sizeBytes || deletingItem.size),
              })}
            </p>
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setDeletingItem(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteConfirm}
                className="px-4 py-2 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {isDeleting ? t('common.processing') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
