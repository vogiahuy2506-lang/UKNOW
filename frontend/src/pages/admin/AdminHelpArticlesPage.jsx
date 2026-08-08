import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus,
  HiOutlineRefresh,
  HiOutlinePencil,
  HiOutlineDatabase,
  HiOutlineDocumentText,
} from 'react-icons/hi';
import { useI18n } from '../../i18n';
import help from '../../services/help.service';

const formatDate = (v) => {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN');
};

export default function AdminHelpArticlesPage() {
  const { t } = useI18n();
  const [articles, setArticles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [seeding, setSeeding] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await help.adminListHelpArticles();
      setArticles(res.data?.result || []);
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminHelp.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const togglePublish = async (article) => {
    setSavingId(article.id);
    try {
      await help.adminUpdateHelpArticle(article.id, { is_published: !article.is_published });
      setArticles((prev) => prev.map((a) => (
        a.id === article.id ? { ...a, is_published: !a.is_published } : a
      )));
      toast.success(t('adminHelp.saved'));
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminHelp.saveFailed'));
    } finally {
      setSavingId(null);
    }
  };

  const reindex = async (article) => {
    setSavingId(article.id);
    try {
      const res = await help.adminReindexHelpArticle(article.id);
      toast.success(t('adminHelp.reindexSuccess', { count: res.data?.result?.chunkCount ?? 0 }));
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminHelp.reindexFailed'));
    } finally {
      setSavingId(null);
    }
  };

  const seed = async () => {
    setSeeding(true);
    try {
      const res = await help.adminSeedHelpArticles(true);
      const count = res.data?.result?.created ?? res.data?.result?.length ?? 0;
      toast.success(t('adminHelp.seedSuccess', { count }));
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminHelp.seedFailed'));
    } finally {
      setSeeding(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('adminHelp.title')}</h1>
          <p className="mt-1 text-gray-500">{t('adminHelp.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={seed}
            disabled={seeding}
            className="btn btn-secondary inline-flex items-center gap-2"
          >
            <HiOutlineDatabase className={`h-4 w-4 ${seeding ? 'animate-pulse' : ''}`} />
            {seeding ? t('adminHelp.seeding') : t('adminHelp.seedGroup1')}
          </button>
          <Link to="/admin/help-articles/new" className="btn btn-primary inline-flex items-center gap-2">
            <HiOutlinePlus className="h-4 w-4" />
            {t('adminHelp.newArticle')}
          </Link>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {isLoading ? (
          <div className="p-10 text-center text-sm text-slate-400">{t('common.loading')}</div>
        ) : articles.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 p-14 text-slate-400">
            <HiOutlineDocumentText className="h-10 w-10" />
            <p>{t('adminHelp.noArticles')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">{t('adminHelp.article')}</th>
                  <th className="px-5 py-3">{t('adminHelp.featureKey')}</th>
                  <th className="px-5 py-3">{t('adminHelp.published')}</th>
                  <th className="px-5 py-3">{t('adminHelp.updatedAt')}</th>
                  <th className="px-5 py-3 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {articles.map((article) => {
                  const busy = savingId === article.id;
                  return (
                    <tr key={article.id} className="align-top">
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-900">{article.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">/huong-dan/{article.slug}</p>
                      </td>
                      <td className="px-5 py-4 text-slate-600">{article.feature_key}</td>
                      <td className="px-5 py-4">
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-primary-600"
                            checked={Boolean(article.is_published)}
                            disabled={busy}
                            onChange={() => togglePublish(article)}
                          />
                          <span className={article.is_published ? 'font-medium text-emerald-700' : 'text-slate-400'}>
                            {article.is_published ? t('adminHelp.publishedYes') : t('adminHelp.publishedNo')}
                          </span>
                        </label>
                      </td>
                      <td className="px-5 py-4 text-slate-500">{formatDate(article.updated_at)}</td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => reindex(article)}
                            disabled={busy}
                            className="p-2 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors disabled:opacity-50"
                            title={t('adminHelp.reindex')}
                          >
                            <HiOutlineRefresh className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
                          </button>
                          <Link
                            to={`/admin/help-articles/${article.id}`}
                            className="p-2 text-slate-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            title={t('common.edit')}
                          >
                            <HiOutlinePencil className="h-4 w-4" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
