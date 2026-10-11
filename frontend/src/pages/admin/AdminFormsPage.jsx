import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineSearch, HiOutlineRefresh, HiOutlineBan, HiOutlineCheck, HiOutlineClipboardList } from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import { useI18n } from '../../i18n';
import adminFormsApiService from '../../features/admin/services/adminFormsApi.service';

const PAGE_SIZE = 20;

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('vi-VN') : '—');

export default function AdminFormsPage() {
  const { t } = useI18n();
  const [forms, setForms] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [confirmTargetId, setConfirmTargetId] = useState(null);
  const [togglingId, setTogglingId] = useState(null);

  const load = useCallback(async (q, p) => {
    setIsLoading(true);
    try {
      const res = await adminFormsApiService.list({ q: q || undefined, page: p, pageSize: PAGE_SIZE });
      const data = res.data?.data || {};
      setForms(Array.isArray(data.forms) ? data.forms : []);
      setTotal(Number(data.total) || 0);
    } catch {
      toast.error(t('adminForms.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load(query, page);
  }, [load, query, page]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setQuery(draft.trim());
  };

  const handleRequestToggle = (id) => setConfirmTargetId(id);
  const handleAbortToggle = () => setConfirmTargetId(null);

  const handleConfirmToggle = async (form) => {
    setTogglingId(form.id);
    try {
      if (form.adminDisabledAt) {
        await adminFormsApiService.enable(form.id);
        toast.success(t('adminForms.enableSuccess'));
      } else {
        await adminFormsApiService.disable(form.id);
        toast.success(t('adminForms.disableSuccess'));
      }
      setConfirmTargetId(null);
      load(query, page);
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminForms.toggleFailed'));
      setConfirmTargetId(null);
    } finally {
      setTogglingId(null);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <PageContainer
      title={t('adminForms.title')}
      subtitle={t('adminForms.description')}
      icon={HiOutlineClipboardList}
      actions={
        <button
          type="button"
          onClick={() => load(query, page)}
          className="btn btn-secondary"
          disabled={isLoading}
        >
          <HiOutlineRefresh className="w-4 h-4 mr-2" />
          {t('adminForms.refresh')}
        </button>
      }
    >

      <form onSubmit={handleSearch} className="card p-4 flex flex-wrap items-end gap-3 dark:bg-dk-surface dark:border-dk-border">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-gray-500 dark:text-dk-text2 mb-1">{t('adminForms.search')}</label>
          <div className="relative">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-dk-muted" />
            <input
              type="text"
              className="input pl-9 w-full"
              placeholder={t('adminForms.searchPlaceholder')}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
          </div>
        </div>
        <button type="submit" className="btn btn-primary">{t('adminForms.searchButton')}</button>
      </form>

      <div className="card overflow-hidden dark:bg-dk-surface dark:border-dk-border">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-700 dark:text-dk-text">
            <thead className="bg-gray-50/75 dark:bg-dk-raised border-b border-gray-100 dark:border-dk-border text-xs font-semibold text-gray-600 dark:text-dk-text2 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4 sm:px-6">{t('adminForms.colForm')}</th>
                <th className="py-3.5 px-4 sm:px-6">{t('adminForms.colOwner')}</th>
                <th className="py-3.5 px-4 sm:px-6 text-center">{t('adminForms.colPayment')}</th>
                <th className="py-3.5 px-4 sm:px-6 text-center">{t('adminForms.colSubmissions')}</th>
                <th className="py-3.5 px-4 sm:px-6">{t('adminForms.colStatus')}</th>
                <th className="py-3.5 px-4 sm:px-6">{t('adminForms.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-dk-border/60">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-500 dark:text-dk-text2">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-4 border-gray-200 dark:border-dk-border border-t-primary-600" />
                  </td>
                </tr>
              ) : forms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-400 dark:text-dk-muted text-sm">
                    {t('adminForms.empty')}
                  </td>
                </tr>
              ) : (
                forms.map((form) => (
                  <tr key={form.id} className="hover:bg-gray-50/50 dark:hover:bg-dk-raised/40 transition-colors align-top">
                    <td className="py-3.5 px-4 sm:px-6">
                      <div className="font-medium text-gray-900 dark:text-dk-text break-words">{form.title}</div>
                      <div className="text-xs text-gray-400 dark:text-dk-muted font-mono">{form.publicKey}</div>
                      <div className="text-xs text-gray-400 dark:text-dk-muted">{fmtDate(form.createdAt)}</div>
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-xs text-gray-600 dark:text-dk-text2 break-all">{form.ownerEmail || '—'}</td>
                    <td className="py-3.5 px-4 sm:px-6 text-center">
                      {form.hasPayment ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/50">
                          {t('adminForms.paymentYes')}
                        </span>
                      ) : (
                        <span className="text-gray-300 dark:text-dk-muted text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-center text-gray-700 dark:text-dk-text">{form.submissionCount ?? 0}</td>
                    <td className="py-3.5 px-4 sm:px-6">
                      {form.adminDisabledAt ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900/50">
                          {t('adminForms.statusDisabled')}
                        </span>
                      ) : form.isPublished ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-950/40 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-900/50">
                          {t('adminForms.statusPublished')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-dk-raised text-gray-600 dark:text-dk-text2 border border-gray-200 dark:border-dk-border">
                          {t('adminForms.statusDraft')}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 sm:px-6">
                      {confirmTargetId === form.id ? (
                        <div className="space-y-1.5">
                          <p className="text-xs text-gray-600 dark:text-dk-text">
                            {form.adminDisabledAt
                              ? t('adminForms.enableConfirmDesc')
                              : t('adminForms.disableConfirmDesc')}
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleConfirmToggle(form)}
                              disabled={togglingId === form.id}
                              className={`px-2.5 py-1 rounded-lg text-white text-xs font-medium disabled:opacity-50 ${
                                form.adminDisabledAt ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                              }`}
                            >
                              {togglingId === form.id
                                ? t('adminForms.processing')
                                : t('adminForms.confirmYes')}
                            </button>
                            <button
                              type="button"
                              onClick={handleAbortToggle}
                              disabled={togglingId === form.id}
                              className="px-2.5 py-1 rounded-lg border border-gray-300 dark:border-dk-border text-gray-600 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-raised text-xs font-medium"
                            >
                              {t('adminForms.confirmNo')}
                            </button>
                          </div>
                        </div>
                      ) : form.adminDisabledAt ? (
                        <button
                          type="button"
                          onClick={() => handleRequestToggle(form.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-green-200 dark:border-green-800 text-green-700 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-950/30 text-xs font-medium"
                        >
                          <HiOutlineCheck className="w-3.5 h-3.5" />
                          {t('adminForms.enableButton')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRequestToggle(form.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-medium"
                        >
                          <HiOutlineBan className="w-3.5 h-3.5" />
                          {t('adminForms.disableButton')}
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 py-3 sm:px-6 border-t border-gray-100 dark:border-dk-border flex items-center justify-between bg-gray-50/50 dark:bg-dk-raised">
            <div className="text-xs text-gray-500 dark:text-dk-text2">
              {t('adminForms.pageInfo', { page, totalPages, total })}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-surface text-gray-600 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-raised disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors"
              >
                {t('adminForms.prevPage')}
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-surface text-gray-600 dark:text-dk-text hover:bg-gray-50 dark:hover:bg-dk-raised disabled:opacity-40 disabled:cursor-not-allowed text-xs transition-colors"
              >
                {t('adminForms.nextPage')}
              </button>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
