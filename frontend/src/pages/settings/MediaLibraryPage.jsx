import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
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
import StorageUsageSection from '../../features/storage/StorageUsageSection';
import { resolveStorageCategory } from '../../features/storage/storageCategories';
import { resolveReferenceLabel, resolveSourceLabel } from '../../features/storage/storageReferenceLabels';
import { notifyStorageQuotaRefresh } from '../../features/storage/storageEvents';
import { useAuthStore } from '../../stores/authStore';

const PAGE_SIZE = 24;
const SEARCH_DEBOUNCE_MS = 300;
/** Bản lưu tự động của landing: tốn dung lượng nên có thẻ tổng, nhưng không phải tệp người dùng xoá tay (ẩn khỏi lưới). */
const HIDDEN_FROM_GRID = 'landing_version';
const SORT_OPTIONS = [
  { value: 'size', labelKey: 'mediaLibrary.sortSize' },
  { value: 'newest', labelKey: 'mediaLibrary.sortNewest' },
];

function CategoryBadge({ category, t }) {
  const item = resolveStorageCategory(category, t);
  return (
    <span className={`text-[11px] font-medium border px-2 py-0.5 rounded-md ${item.color}`}>
      {item.label}
    </span>
  );
}

const formatDate = (value, locale) => new Date(value).toLocaleDateString(locale === 'en' ? 'en-US' : 'vi-VN', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/**
 * Câu lỗi theo `code` của backend, dịch theo ngôn ngữ người dùng — KHÔNG in nguyên văn `message` tiếng Việt của máy chủ
 * (người dùng tiếng Anh vẫn đọc tiếng Việt) và không bao giờ in `err.message` thô. Mã lạ → câu chung của thao tác.
 */
function describeMediaError(err, t, fallback) {
  const data = err?.response?.data;
  const code = data?.code;
  if (code === 'STORAGE_REFERENCE_ALIVE') {
    const place = resolveReferenceLabel(data?.data?.referenceType, data?.data?.referenceLabel, t);
    const name = data?.data?.referenceName;
    return name ? t('mediaLibrary.errors.inUse', { place, name }) : t('mediaLibrary.errors.inUseNoName', { place });
  }
  if (code === 'MEDIA_NOT_FOUND') return t('mediaLibrary.errors.notFound');
  if (code === 'MEDIA_ID_INVALID') return t('mediaLibrary.errors.invalidId');
  if (err?.response?.status === 403) return t('mediaLibrary.errors.forbidden');
  return fallback;
}

/** Dòng trạng thái của thẻ tệp: đang dùng ở đâu (bấm được) / tệp chat đến từ đâu / không còn dùng — kèm ngày tự xoá nếu có. */
function UsageLine({ item, t, locale }) {
  const usedBy = item.inUse ? item.usedBy : null;
  const sourceLabel = item.category === 'chat' ? resolveSourceLabel(item.source, t) : null;
  const autoDelete = item.autoDeleteAt ? t('mediaLibrary.autoDeleteOn', { date: formatDate(item.autoDeleteAt, locale) }) : '';

  let main;
  if (usedBy) {
    const place = resolveReferenceLabel(usedBy.referenceType, usedBy.label, t);
    const text = usedBy.name
      ? t('mediaLibrary.usedByNamed', { place, name: usedBy.name })
      : t('mediaLibrary.usedBy', { place });
    main = usedBy.url
      ? <Link to={usedBy.url} className="text-blue-600 hover:text-blue-700 hover:underline">{text}</Link>
      : <span>{text}</span>;
  } else if (item.category === 'chat') {
    main = sourceLabel ? <span>{t('mediaLibrary.fromSource', { source: sourceLabel })}</span> : null;
  } else {
    main = <span>{t('mediaLibrary.freeToDelete')}</span>;
  }

  if (!main && !autoDelete) return null;
  return (
    <div data-testid="usage-line" className="text-[11px] text-slate-500 mt-1 leading-snug">
      {main}
      {main && autoDelete ? ' · ' : ''}
      {autoDelete}
    </div>
  );
}

function StorageObjectCard({ item, onDeleteClick, t, locale = 'vi' }) {
  const isImage = item.type === 'image' || String(item.mimeType || '').startsWith('image/');
  const [imageError, setImageError] = useState(false);
  const name = item.displayName || item.name || '—';
  const usedPlace = item.inUse && item.usedBy
    ? resolveReferenceLabel(item.usedBy.referenceType, item.usedBy.label, t)
    : '';

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
              alt={name === '—' ? '' : name}
              loading="lazy"
              decoding="async"
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
              onError={() => setImageError(true)}
            />
            <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity flex items-center justify-center text-white text-xs gap-1 font-medium">
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
          <div className="text-xs font-medium text-slate-800 truncate" title={name}>
            {name}
          </div>
          {item.createdAt && (
            <div className="text-[11px] text-slate-400 mt-0.5">{formatDate(item.createdAt, locale)}</div>
          )}
          <UsageLine item={item} t={t} locale={locale} />
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
        {onDeleteClick && (
          <button
            type="button"
            onClick={() => onDeleteClick(item)}
            disabled={item.inUse}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40 disabled:hover:text-slate-400 disabled:hover:bg-transparent disabled:cursor-not-allowed"
            title={item.inUse ? t('mediaLibrary.deleteLocked', { place: usedPlace }) : t('mediaLibrary.deleteBtn')}
            aria-label={`${t('mediaLibrary.deleteBtn')}: ${name}`}
          >
            <HiOutlineTrash className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function MediaLibraryPage() {
  const { t, locale } = useI18n();
  const activeContext = useAuthStore((state) => state.activeContext);
  const isEmployee = activeContext?.type === 'employee';
  const canManage = !isEmployee || activeContext?.permissions?.media_library_manage === true;
  const [category, setCategory] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('size');
  const [items, setItems] = useState([]);
  const [categorySummary, setCategorySummary] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1, limit: PAGE_SIZE });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [conflictBanner, setConflictBanner] = useState(null);

  // Deletion modal state
  const [deletingItem, setDeletingItem] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Chỉ lượt gọi MỚI NHẤT được ghi vào màn hình: gõ nhanh / đổi bộ lọc liên tiếp thì phản hồi về trễ của chữ cũ không
  // đè kết quả của chữ mới (api.js khử trùng theo URL+params nên các lượt khác chữ không tự huỷ nhau).
  const requestRef = useRef(0);

  // Debounce ô tìm: mỗi phím gõ từng là 1 request kéo theo 3 truy vấn SQL.
  // Chỉ về trang 1 khi chữ tìm THẬT SỰ đổi: lượt chạy đầu (chữ rỗng, chưa gõ gì) mà cũng đặt lại trang thì người dùng
  // bấm "Sau" trong 300 ms đầu sẽ bị kéo về trang 1.
  const appliedSearchRef = useRef('');
  useEffect(() => {
    const timer = setTimeout(() => {
      const next = searchInput.trim();
      if (next === appliedSearchRef.current) return;
      appliedSearchRef.current = next;
      setSearch(next);
      setPage(1);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError('');
    setConflictBanner(null);
    try {
      const params = { page, limit: PAGE_SIZE, sort };
      if (category) params.category = category;
      if (search) params.search = search;

      const res = await api.get('/media-library/objects', { params });
      if (requestId !== requestRef.current) return;
      const data = res.data?.data || [];
      const nextPagination = res.data?.pagination || { total: 0, pages: 1, limit: PAGE_SIZE };
      // Xoá tệp cuối của trang cuối: lùi một trang thay vì hiện "Chưa có tệp nào" kèm "3 / 2".
      if (data.length === 0 && page > 1) {
        setPage(Math.max(1, Math.min(page - 1, nextPagination.pages || 1)));
        return;
      }
      setItems(data);
      setCategorySummary(res.data?.categorySummary || []);
      setPagination(nextPagination);
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setError(describeMediaError(err, t, t('mediaLibrary.loadError')));
      setItems([]);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [category, search, sort, page, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDeleteConfirm = async () => {
    if (!deletingItem) return;
    setIsDeleting(true);
    setConflictBanner(null);
    try {
      const res = await api.delete(`/media-library/objects/${deletingItem.id}`);
      const freed = Number(res.data?.data?.sizeBytes ?? deletingItem.sizeBytes ?? deletingItem.size ?? 0);
      setDeletingItem(null);
      notifyStorageQuotaRefresh();
      toast.success(t('mediaLibrary.deleteSuccess', { size: formatBytes(freed) }));
      await load();
    } catch (err) {
      const message = describeMediaError(err, t, t('mediaLibrary.deleteError'));
      if (err.response?.status === 409 && err.response?.data?.code === 'STORAGE_REFERENCE_ALIVE') {
        // Banner cho đường dẫn tới nơi đang dùng; toast để không lỡ khi đang cuộn ở trang sau (banner nằm đầu trang).
        setConflictBanner({ message, url: err.response.data.data?.url });
      }
      toast.error(message, { id: 'media-delete-error' });
      setDeletingItem(null);
    } finally {
      setIsDeleting(false);
    }
  };

  const gridSummary = categorySummary.filter((summary) => summary.category !== HIDDEN_FROM_GRID);
  const allCount = gridSummary.reduce((sum, summary) => sum + Number(summary.count || 0), 0);
  const allBytes = gridSummary.reduce((sum, summary) => sum + Number(summary.totalBytes || 0), 0);

  const selectCategory = (next) => {
    setCategory(next);
    setPage(1);
  };

  const tileClass = (selected) => `p-2.5 rounded-xl border text-left transition-all ${
    selected
      ? 'border-orange-500 bg-orange-50/50 ring-2 ring-orange-200'
      : 'border-slate-200 bg-white hover:border-slate-300'
  }`;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={HiOutlinePhotograph}
        title={t('mediaLibrary.title')}
        subtitle={t('mediaLibrary.subtitle')}
      />

      <div className="space-y-2">
        <StorageUsageSection />
        {!isEmployee && (
          <div className="text-right">
            <Link to="/app/topup" className="text-xs font-semibold text-orange-600 hover:text-orange-700 hover:underline">
              {t('mediaLibrary.buyMoreStorage')} &rarr;
            </Link>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-500">
        {t('mediaLibrary.zaloNote', { inbox: t('nav.inbox') })}
      </p>

      {/* Thẻ tổng theo loại tệp — bấm để lọc; "Tất cả" thay cho ô chọn danh mục cũ. */}
      {categorySummary.length > 0 && (
        <div className="space-y-2">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400">
            {t('mediaLibrary.categorySummary')}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5">
            <button
              type="button"
              data-testid="tile-all"
              aria-pressed={category === ''}
              onClick={() => selectCategory('')}
              className={tileClass(category === '')}
            >
              <div className="text-xs text-slate-500 truncate">
                <span className="text-[11px] font-medium border px-2 py-0.5 rounded-md bg-slate-900 text-white border-slate-900">
                  {t('mediaLibrary.allFiles')}
                </span>
              </div>
              <div className="text-sm font-bold text-slate-800 mt-1.5">{formatBytes(allBytes)}</div>
              <div className="text-[11px] text-slate-400">{t('mediaLibrary.fileCount', { count: allCount })}</div>
            </button>
            {categorySummary.map((summary) => {
              const content = (
                <>
                  <div className="text-xs text-slate-500 truncate">
                    <CategoryBadge category={summary.category} t={t} />
                  </div>
                  <div className="text-sm font-bold text-slate-800 mt-1.5">
                    {formatBytes(summary.totalBytes)}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    {t('mediaLibrary.fileCount', { count: summary.count })}
                  </div>
                </>
              );
              if (summary.category === HIDDEN_FROM_GRID) {
                return (
                  <div
                    key={summary.category}
                    data-testid="tile-landing-version"
                    title={t('mediaLibrary.landingVersionHint')}
                    className="p-2.5 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-left cursor-default"
                  >
                    {content}
                  </div>
                );
              }
              const isSelected = category === summary.category;
              return (
                <button
                  key={summary.category}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => selectCategory(isSelected ? '' : summary.category)}
                  className={tileClass(isSelected)}
                >
                  {content}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Tìm theo tên + sắp xếp */}
      <div className="flex flex-wrap gap-2.5 items-center justify-between bg-slate-50/80 p-2.5 rounded-xl border border-slate-200">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <HiOutlineSearch className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder={t('mediaLibrary.searchPlaceholder')}
            aria-label={t('mediaLibrary.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
          />
        </div>

        <div className="flex items-center gap-1.5" role="group" aria-label={t('mediaLibrary.sortLabel')}>
          {SORT_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={sort === option.value}
              onClick={() => {
                setSort(option.value);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                sort === option.value ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
            >
              {t(option.labelKey)}
            </button>
          ))}
        </div>
      </div>

      {conflictBanner && (
        <div className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start justify-between gap-3">
          <div className="flex gap-2 items-start">
            <HiOutlineExclamation className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium">{conflictBanner.message}</p>
              {conflictBanner.url && (
                <Link
                  to={conflictBanner.url}
                  className="text-xs text-amber-800 underline hover:text-amber-950 mt-1 inline-block font-semibold"
                >
                  {t('mediaLibrary.goToManageScreen')} &rarr;
                </Link>
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
        <div role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-3.5 py-2.5">{error}</div>
      )}

      {loading ? (
        <div className="text-sm text-slate-500 py-16 text-center">{t('common.loading')}</div>
      ) : items.length === 0 ? (
        // Có lỗi thì chỉ hiện khối lỗi ở trên: "Chưa có tệp nào" cạnh một lỗi tải là nói sai.
        !error && (
          <div className="text-sm text-slate-500 py-16 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
            {search ? t('mediaLibrary.emptySearch', { q: search }) : t('mediaLibrary.empty')}
          </div>
        )
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
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="media-delete-title"
            className="bg-white rounded-2xl max-w-md w-full p-5 space-y-4 shadow-xl border border-slate-200"
          >
            <div className="flex items-center gap-3 text-red-600">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <HiOutlineTrash className="w-5 h-5" />
              </div>
              <h3 id="media-delete-title" className="text-base font-bold text-slate-900">
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
