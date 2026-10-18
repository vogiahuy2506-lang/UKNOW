import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import axios from 'axios';
import {
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineDownload,
  HiOutlineMail,
  HiOutlinePencil,
  HiOutlinePhone,
  HiOutlinePlus,
  HiOutlineSearch,
  HiOutlineTag,
  HiOutlineTrash,
  HiOutlineUpload,
  HiOutlineUsers,
  HiOutlineX,
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import { PageHeaderActions } from '../../../components/common/PageContainer';
import ConfirmModal from '../../../components/common/ConfirmModal';
import customerApiService from '../services/customerApi.service';
import { formatDateOnly, getCustomerDisplayName } from '../utils/customerDisplay.helpers';
import {
  CONSENT_SOURCE_OPTIONS,
  CUSTOMER_PAGE_SIZE,
  EMAIL_STATUS_OPTIONS,
  buildCustomerFilterParams,
  filenameFromDisposition,
  getCustomerInitial,
  saveBlobAsFile,
} from '../utils/customerList.helpers';
import CustomerEmailStatusBadge from './CustomerEmailStatusBadge';
import CustomerFormModal from './CustomerFormModal';
import CustomerImportModal from './CustomerImportModal';
import CustomerTagAssignModal from './CustomerTagAssignModal';
import CustomerTagChip from './CustomerTagChip';
import CustomerTagFilter from './CustomerTagFilter';
import CustomerTagManageModal from './CustomerTagManageModal';

/** Số chip tag hiện tối đa trong một ô; phần dư gom thành "+n". */
const MAX_VISIBLE_TAGS = 2;

/**
 * Tab "Tất cả khách" của `/app/customers`: toàn bộ khách trong không gian làm việc (không theo chiến dịch),
 * có tìm/lọc, thêm-sửa-xoá, nhập CSV/Excel và xuất CSV theo bộ lọc đang chọn.
 */
export default function AllCustomersTab() {
  const { t } = useI18n();
  const [pendingSearch, setPendingSearch] = useState('');
  const [search, setSearch] = useState('');
  const [consentSource, setConsentSource] = useState('');
  const [emailStatus, setEmailStatus] = useState('');
  const [tagFilter, setTagFilter] = useState([]);
  const [tags, setTags] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [assignMode, setAssignMode] = useState(null); // null | 'assign' | 'unassign'
  const [showManageTags, setShowManageTags] = useState(false);
  const [page, setPage] = useState(1);
  const [reloadKey, setReloadKey] = useState(0);
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
  const [isLoading, setIsLoading] = useState(true);

  const [formState, setFormState] = useState({ open: false, customer: null });
  const [showImport, setShowImport] = useState(false);
  const [customerToDelete, setCustomerToDelete] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const hasFilters = Boolean(search || consentSource || emailStatus || tagFilter.length > 0);

  const loadTags = useCallback(() => {
    return customerApiService
      .getTags()
      .then((res) => {
        const list = res.data?.data || [];
        setTags(list);
        // Tag vừa bị xoá không được kẹt lại trong bộ lọc (sẽ lọc ra danh sách rỗng khó hiểu).
        setTagFilter((prev) => {
          const alive = prev.filter((id) => list.some((tag) => tag.id === id));
          return alive.length === prev.length ? prev : alive;
        });
      })
      .catch(() => toast.error(t('customers.tags.loadFailed')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadTags();
  }, [loadTags]);

  // Chọn khách chỉ có nghĩa trong trang/bộ lọc đang xem.
  useEffect(() => {
    setSelectedIds([]);
  }, [page, search, consentSource, emailStatus, tagFilter]);

  useEffect(() => {
    // Mỗi lần đổi trang/bộ lọc huỷ lượt cũ: lượt chậm trả về sau không được ghi đè kết quả mới.
    const controller = new AbortController();
    setIsLoading(true);
    customerApiService
      .getCustomers(
        { page, limit: CUSTOMER_PAGE_SIZE, ...buildCustomerFilterParams({ search, consentSource, emailStatus, tagIds: tagFilter }) },
        { signal: controller.signal },
      )
      .then((res) => {
        const payload = res.data?.data || {};
        setItems(payload.items || []);
        setPagination({
          total: payload.pagination?.total ?? 0,
          totalPages: Math.max(1, payload.pagination?.totalPages ?? 1),
        });
        setIsLoading(false);
      })
      .catch((error) => {
        if (axios.isCancel(error) || controller.signal.aborted) return;
        toast.error(t('customers.loadFailed'));
        setIsLoading(false);
      });
    return () => controller.abort();
    // `t` đổi tham chiếu không được kéo theo tải lại danh sách.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, search, consentSource, emailStatus, tagFilter, reloadKey]);

  const reload = useCallback(() => setReloadKey((key) => key + 1), []);

  const handleSearch = (event) => {
    event.preventDefault();
    setSearch(pendingSearch.trim());
    setPage(1);
  };

  const clearFilters = () => {
    setPendingSearch('');
    setSearch('');
    setConsentSource('');
    setEmailStatus('');
    setTagFilter([]);
    setPage(1);
  };

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const response = await customerApiService.exportCustomersCsv(
        buildCustomerFilterParams({ search, consentSource, emailStatus, tagIds: tagFilter }),
      );
      const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
      saveBlobAsFile(blob, filenameFromDisposition(response.headers?.['content-disposition']));
      const count = Number(response.headers?.['x-export-row-count']) || 0;
      toast.success(t('customers.exportFlow.success', { count }));
      if (String(response.headers?.['x-export-truncated'] || '').toLowerCase() === 'true') {
        toast(t('customers.exportFlow.truncated'), { duration: 8000 });
      }
    } catch {
      toast.error(t('customers.exportFlow.failed'));
    } finally {
      setIsExporting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!customerToDelete) return;
    setIsDeleting(true);
    try {
      await customerApiService.deleteCustomer(customerToDelete.id);
      toast.success(t('customers.deleteSuccess'));
      setCustomerToDelete(null);
      // Xoá phần tử cuối của trang cuối thì lùi một trang để không rơi vào trang rỗng.
      if (items.length === 1 && page > 1) setPage(page - 1);
      else reload();
    } catch (error) {
      setCustomerToDelete(null);
      if (error?.response?.status === 409) {
        // 409 = khách đã có đơn mua/quan tâm: nói rõ LÝ DO (backend trả sẵn), không báo lỗi chung chung.
        toast.error(error.response.data?.message || t('customers.delete.blocked'), { duration: 8000 });
      } else {
        toast.error(error?.response?.data?.message || t('customers.deleteFailed'));
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const selectClass = 'w-full py-2 px-3 text-sm bg-white dark:bg-dk-inset border border-gray-300 dark:border-dk-border rounded-lg focus:outline-none focus:border-primary-500 text-gray-700 dark:text-dk-text';

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200/90 dark:border-dk-border/90 bg-white dark:bg-dk-surface p-3.5 shadow-2xs space-y-3">
        <form onSubmit={handleSearch} className="flex flex-col lg:flex-row items-stretch lg:items-center gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <HiOutlineSearch className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
              placeholder={t('customers.searchPlaceholder')}
              aria-label={t('customers.searchPlaceholder')}
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 text-slate-800 dark:bg-dk-inset dark:border-dk-border dark:text-dk-text dark:placeholder:text-dk-muted dark:hover:bg-dk-surface dark:focus:bg-dk-inset"
            />
            {pendingSearch && (
              <button
                type="button"
                onClick={() => setPendingSearch('')}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-dk-text"
                aria-label={t('common.close')}
              >
                <HiOutlineX className="w-4 h-4" />
              </button>
            )}
          </div>
          <select
            aria-label={t('customers.all.source')}
            value={consentSource}
            onChange={(e) => { setConsentSource(e.target.value); setPage(1); }}
            className={`${selectClass} lg:w-48`}
          >
            <option value="">{t('customers.all.allSources')}</option>
            {CONSENT_SOURCE_OPTIONS.map((source) => (
              <option key={source} value={source}>{t(`campaignCustomers.consentSources.${source}`)}</option>
            ))}
          </select>
          <select
            aria-label={t('customers.all.emailStatus')}
            value={emailStatus}
            onChange={(e) => { setEmailStatus(e.target.value); setPage(1); }}
            className={`${selectClass} lg:w-56`}
          >
            <option value="">{t('customers.all.allEmailStatuses')}</option>
            {EMAIL_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{t(`customers.all.emailStatuses.${status}`)}</option>
            ))}
          </select>
          <CustomerTagFilter
            tags={tags}
            value={tagFilter}
            onChange={(ids) => { setTagFilter(ids); setPage(1); }}
            className="lg:w-48"
          />
          <button type="submit" className="btn btn-secondary shrink-0">{t('common.search')}</button>
        </form>
        {hasFilters && (
          <div className="text-xs text-slate-500 dark:text-dk-text2 pt-0.5">
            <button type="button" onClick={clearFilters} className="font-medium text-orange-600 hover:underline">
              {t('customers.all.clearFilters')}
            </button>
          </div>
        )}
      </div>

      <PageHeaderActions>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="btn btn-secondary" onClick={() => setShowManageTags(true)}>
            <HiOutlineTag className="w-4 h-4 mr-1.5" aria-hidden="true" />
            {t('customers.tags.manage')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleExport} disabled={isExporting}>
            <HiOutlineDownload className="w-4 h-4 mr-1.5" aria-hidden="true" />
            {isExporting ? t('customers.exportFlow.exporting') : t('customers.exportFlow.button')}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setShowImport(true)}>
            <HiOutlineUpload className="w-4 h-4 mr-1.5" aria-hidden="true" />
            {t('customers.importCustomers')}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => setFormState({ open: true, customer: null })}>
            <HiOutlinePlus className="w-4 h-4 mr-1.5" aria-hidden="true" />
            {t('customers.addCustomer')}
          </button>
        </div>
      </PageHeaderActions>

      {selectedIds.length > 0 && (
        <div
          data-testid="customer-bulk-bar"
          className="flex flex-wrap items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3.5 py-2.5 dark:border-primary-900/50 dark:bg-primary-950/30"
        >
          <span className="text-sm font-medium text-primary-800 dark:text-primary-200">
            {t('customers.tags.selectedCount', { count: selectedIds.length })}
          </span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setAssignMode('assign')}>
            {t('customers.tags.assign')}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setAssignMode('unassign')}>
            {t('customers.tags.unassign')}
          </button>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setSelectedIds([])}>
            {t('customers.tags.clearSelection')}
          </button>
        </div>
      )}

      <div className="card bg-white dark:bg-dk-surface border-slate-200 dark:border-dk-border">
        <div className="table-container">
          <table className="table">
            <thead>
              <tr className="border-b border-gray-200 dark:border-dk-border bg-slate-50/80 dark:bg-dk-raised/50">
                <th className="w-10">
                  <input
                    type="checkbox"
                    aria-label={t('customers.tags.selectAll')}
                    checked={items.length > 0 && selectedIds.length === items.length}
                    disabled={items.length === 0}
                    onChange={(e) => setSelectedIds(e.target.checked ? items.map((item) => item.id) : [])}
                    className="h-4 w-4 rounded border-gray-300 text-primary-600"
                  />
                </th>
                <th className="text-slate-500 dark:text-dk-text2">{t('campaignCustomers.customer')}</th>
                <th className="text-slate-500 dark:text-dk-text2">{t('campaignCustomers.email')}</th>
                <th className="text-slate-500 dark:text-dk-text2">{t('campaignCustomers.phone')}</th>
                <th className="text-slate-500 dark:text-dk-text2">{t('customers.all.emailStatus')}</th>
                <th className="text-slate-500 dark:text-dk-text2">{t('customers.tags.column')}</th>
                <th className="text-slate-500 dark:text-dk-text2">{t('customers.all.source')}</th>
                <th className="text-slate-500 dark:text-dk-text2">{t('customers.all.createdAt')}</th>
                <th className="!text-right text-slate-500 dark:text-dk-text2">{t('customers.all.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dk-border">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center"><div className="spinner w-8 h-8 mx-auto" /></td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-gray-400 dark:text-dk-muted">
                    <HiOutlineUsers className="w-8 h-8 mx-auto mb-2" aria-hidden="true" />
                    {hasFilters ? t('customers.all.emptyFiltered') : t('customers.all.empty')}
                  </td>
                </tr>
              ) : (
                items.map((customer) => (
                  <tr key={customer.id} data-testid="customer-row" className="hover:bg-gray-50 dark:hover:bg-dk-raised/40 transition-colors">
                    <td>
                      <input
                        type="checkbox"
                        aria-label={t('customers.tags.selectRow', { name: getCustomerDisplayName(customer) || `#${customer.id}` })}
                        checked={selectedIds.includes(customer.id)}
                        onChange={(e) => setSelectedIds((prev) => (e.target.checked ? [...prev, customer.id] : prev.filter((id) => id !== customer.id)))}
                        className="h-4 w-4 rounded border-gray-300 text-primary-600"
                      />
                    </td>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-primary-100 dark:bg-primary-950/40 flex items-center justify-center shrink-0">
                          <span className="font-semibold text-sm text-primary-600 dark:text-primary-400">{getCustomerInitial(customer)}</span>
                        </div>
                        <span className="font-medium text-gray-900 dark:text-dk-text truncate max-w-[180px]">
                          {getCustomerDisplayName(customer) || '—'}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5 text-gray-600 dark:text-dk-text min-w-0">
                        <HiOutlineMail className="w-4 h-4 text-gray-400 dark:text-dk-muted shrink-0" />
                        <span className="truncate max-w-[170px]">{customer.email || '--'}</span>
                      </div>
                    </td>
                    <td>
                      {customer.phone ? (
                        <div className="flex items-center gap-1.5 text-gray-600 dark:text-dk-text">
                          <HiOutlinePhone className="w-4 h-4 text-gray-400 dark:text-dk-muted shrink-0" />
                          {customer.phone}
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-dk-muted">--</span>
                      )}
                    </td>
                    <td><CustomerEmailStatusBadge customer={customer} /></td>
                    <td>
                      {customer.tags?.length ? (
                        <div className="flex max-w-[170px] flex-wrap gap-1">
                          {customer.tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
                            <CustomerTagChip key={tag.id} tag={tag} />
                          ))}
                          {customer.tags.length > MAX_VISIBLE_TAGS && (
                            <span
                              className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-dk-raised dark:text-dk-text2"
                              title={customer.tags.slice(MAX_VISIBLE_TAGS).map((tag) => tag.name).join(', ')}
                            >
                              {t('customers.tags.more', { count: customer.tags.length - MAX_VISIBLE_TAGS })}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400 dark:text-dk-muted text-xs">--</span>
                      )}
                    </td>
                    <td>
                      {customer.consentSource ? (
                        <span className="badge badge-info text-xs">
                          {t(`campaignCustomers.consentSources.${customer.consentSource}`, { defaultValue: customer.consentSource })}
                        </span>
                      ) : (
                        <span className="text-gray-400 dark:text-dk-muted text-xs">--</span>
                      )}
                    </td>
                    <td className="text-sm text-gray-500 dark:text-dk-text2 whitespace-nowrap">{formatDateOnly(customer.createdAt)}</td>
                    <td>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setFormState({ open: true, customer })}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-dk-border text-gray-700 dark:text-dk-text bg-white dark:bg-dk-raised hover:bg-gray-50 dark:hover:bg-dk-strong transition-colors whitespace-nowrap"
                        >
                          <HiOutlinePencil className="w-3.5 h-3.5" aria-hidden="true" />
                          {t('customers.all.edit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => setCustomerToDelete(customer)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/30 hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors whitespace-nowrap"
                        >
                          <HiOutlineTrash className="w-3.5 h-3.5" aria-hidden="true" />
                          {t('customers.all.delete')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {pagination.total > 0 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 dark:border-dk-border">
            <p className="text-sm text-gray-500 dark:text-dk-text2">{t('customers.all.total', { total: pagination.total })}</p>
            {pagination.totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPage((p) => p - 1)}
                  disabled={page <= 1}
                  aria-label={t('common.previous')}
                  className="btn btn-secondary btn-sm disabled:opacity-50"
                >
                  <HiOutlineChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm px-1 text-gray-600 dark:text-dk-text">{page} / {pagination.totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= pagination.totalPages}
                  aria-label={t('common.next')}
                  className="btn btn-secondary btn-sm disabled:opacity-50"
                >
                  <HiOutlineChevronRight className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <CustomerFormModal
        isOpen={formState.open}
        customer={formState.customer}
        onClose={() => setFormState({ open: false, customer: null })}
        onSaved={reload}
        allTags={tags}
        onTagsChanged={() => { reload(); loadTags(); }}
      />
      <CustomerImportModal
        isOpen={showImport}
        onClose={() => setShowImport(false)}
        onImported={() => { setPage(1); reload(); }}
      />
      <CustomerTagAssignModal
        isOpen={assignMode !== null}
        mode={assignMode || 'assign'}
        customerIds={selectedIds}
        tags={tags}
        onClose={() => setAssignMode(null)}
        onDone={() => { setSelectedIds([]); reload(); loadTags(); }}
      />
      <CustomerTagManageModal
        isOpen={showManageTags}
        tags={tags}
        onClose={() => setShowManageTags(false)}
        onChanged={() => { reload(); loadTags(); }}
      />
      <ConfirmModal
        isOpen={Boolean(customerToDelete)}
        title={t('customers.delete.title')}
        message={customerToDelete
          ? t('customers.delete.confirmNamed', { name: getCustomerDisplayName(customerToDelete) || `#${customerToDelete.id}` })
          : ''}
        confirmText={t('common.delete')}
        onConfirm={handleConfirmDelete}
        onCancel={() => setCustomerToDelete(null)}
        isLoading={isDeleting}
      />
    </div>
  );
}
