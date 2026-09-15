import { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineSearch, HiOutlineRefresh, HiOutlineBan, HiOutlineCheck } from 'react-icons/hi';
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
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('adminForms.title')}</h1>
          <p className="text-gray-500 mt-1">{t('adminForms.description')}</p>
        </div>
        <button
          type="button"
          onClick={() => load(query, page)}
          className="btn btn-secondary"
          disabled={isLoading}
        >
          <HiOutlineRefresh className="w-4 h-4 mr-2" />
          {t('adminForms.refresh')}
        </button>
      </div>

      <form onSubmit={handleSearch} className="card p-4 flex flex-wrap items-end gap-3">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs text-gray-500 mb-1">{t('adminForms.search')}</label>
          <div className="relative">
            <HiOutlineSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
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

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-700">
            <thead className="bg-gray-50/75 border-b border-gray-100 text-xs font-semibold text-gray-600 uppercase tracking-wider">
              <tr>
                <th className="py-3.5 px-4 sm:px-6">{t('adminForms.colForm')}</th>
                <th className="py-3.5 px-4 sm:px-6">{t('adminForms.colOwner')}</th>
                <th className="py-3.5 px-4 sm:px-6 text-center">{t('adminForms.colPayment')}</th>
                <th className="py-3.5 px-4 sm:px-6 text-center">{t('adminForms.colSubmissions')}</th>
                <th className="py-3.5 px-4 sm:px-6">{t('adminForms.colStatus')}</th>
                <th className="py-3.5 px-4 sm:px-6">{t('adminForms.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-500">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-4 border-gray-200 border-t-primary-600" />
                  </td>
                </tr>
              ) : forms.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-10 text-center text-gray-400 text-sm">
                    {t('adminForms.empty')}
                  </td>
                </tr>
              ) : (
                forms.map((form) => (
                  <tr key={form.id} className="hover:bg-gray-50/50 transition-colors align-top">
                    <td className="py-3.5 px-4 sm:px-6">
                      <div className="font-medium text-gray-900 break-words">{form.title}</div>
                      <div className="text-xs text-gray-400 font-mono">{form.publicKey}</div>
                      <div className="text-xs text-gray-400">{fmtDate(form.createdAt)}</div>
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-xs text-gray-600 break-all">{form.ownerEmail || '—'}</td>
                    <td className="py-3.5 px-4 sm:px-6 text-center">
                      {form.hasPayment ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                          {t('adminForms.paymentYes')}
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 sm:px-6 text-center text-gray-700">{form.submissionCount ?? 0}</td>
                    <td className="py-3.5 px-4 sm:px-6">
                      {form.adminDisabledAt ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                          {t('adminForms.statusDisabled')}
                        </span>
                      ) : form.isPublished ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200">
                          {t('adminForms.statusPublished')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                          {t('adminForms.statusDraft')}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 sm:px-6">
                      {confirmTargetId === form.id ? (
                        <div className="space-y-1.5">
                          <p className="text-xs text-gray-600">
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
                              className="px-2.5 py-1 rounded-lg border border-gray-300 text-gray-600 hover:bg-gray-50 text-xs font-medium"
                            >
                              {t('adminForms.confirmNo')}
                            </button>
                          </div>
                        </div>
                      ) : form.adminDisabledAt ? (
                        <button
                          type="button"
                          onClick={() => handleRequestToggle(form.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-green-200 text-green-700 hover:bg-green-50 text-xs font-medium"
                        >
                          <HiOutlineCheck className="w-3.5 h-3.5" />
                          {t('adminForms.enableButton')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleRequestToggle(form.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-xs font-medium"
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
          <div className="px-4 py-3 sm:px-6 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
            <div className="text-xs text-gray-500">
              {t('adminForms.pageInfo', { page, totalPages, total })}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
              >
                {t('adminForms.prevPage')}
              </button>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="px-2.5 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs"
              >
                {t('adminForms.nextPage')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
