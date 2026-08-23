import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  HiOutlinePlus,
  HiOutlineRefresh,
  HiOutlinePencil,
  HiOutlineDatabase,
  HiOutlineDocumentText,
  HiOutlineTrash,
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

  // Show row for each unique slug.
  const rows = useMemo(() => {
    const bySlug = new Map();
    for (const a of articles) {
      const key = a.slug;
      if (!bySlug.has(key)) bySlug.set(key, { vi: null, en: null });
      const bucket = bySlug.get(key);
      if ((a.locale || 'vi') === 'en') bucket.en = a;
      else bucket.vi = a;
    }
    return [...bySlug.values()]
      .map(({ vi, en }) => {
        const primary = vi || en;
        return {
          ...primary,
          _vi: vi,
          _en: en,
          _hasVi: Boolean(vi),
          _hasEn: Boolean(en),
          _enStale: Boolean(en?.is_stale),
        };
      })
      .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id);
  }, [articles]);

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

  const deleteArticle = async (article) => {
    if (!window.confirm(t('adminHelp.confirmDelete'))) return;
    setSavingId(article.id);
    try {
      await help.adminDeleteHelpArticle(article.id);
      toast.success(t('adminHelp.deleteSuccess'));
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminHelp.deleteFailed'));
    } finally {
      setSavingId(null);
    }
  };

  const seed = async () => {
    // Seed GHI ĐÈ cả body_md lẫn body_html của mọi bài trong bộ mẫu bằng bản
    // trong repo — ảnh admin đã chèn tay bị thay lại bằng chú thích "[ẢNH: ...]"
    // và KHÔNG khôi phục được (vị trí ảnh chỉ tồn tại trong body_html).
    // Đã xảy ra thật ngày 22/08/2026: mất toàn bộ ảnh của nhiều bài chỉ vì một
    // cú bấm nhầm, do nút này trước đây chạy thẳng không hỏi lại.
    // Bắt gõ đúng chữ xác nhận, không dùng confirm() thường — nút nằm cạnh các
    // nút vô hại nên quá dễ bấm nhầm rồi Enter cho qua.
    const typed = window.prompt(t('adminHelp.seedConfirmPrompt'));
    if (typed === null) return;
    if (typed.trim().toUpperCase() !== 'SEED') {
      toast.error(t('adminHelp.seedConfirmMismatch'));
      return;
    }
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
        ) : rows.length === 0 ? (
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
                  <th className="px-5 py-3">{t('adminHelp.locale')}</th>
                  <th className="px-5 py-3">{t('adminHelp.featureKey')}</th>
                  <th className="px-5 py-3">{t('adminHelp.published')}</th>
                  <th className="px-5 py-3">{t('adminHelp.updatedAt')}</th>
                  <th className="px-5 py-3 text-right">{t('common.actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((article) => {
                  const busy = savingId === article.id;
                  return (
                    <tr key={article.slug} className="align-top">
                      <td className="px-5 py-4">
                        <p className="font-medium text-slate-900">{article.title}</p>
                        <p className="mt-0.5 text-xs text-slate-500">/huong-dan/{article.slug}</p>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1">
                          {article._hasVi ? (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-700">
                              {t('adminHelp.localeVi')}
                            </span>
                          ) : (
                            <span className="rounded bg-red-50 px-1.5 py-0.5 text-xs text-red-600 font-medium" title="Lỗi: Bài viết này bị mất bản gốc tiếng Việt!">
                              Thiếu VI
                            </span>
                          )}
                          {article._hasEn ? (
                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                              article._enStale
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                            >
                              {article._enStale ? t('adminHelp.enStale') : t('adminHelp.hasEn')}
                            </span>
                          ) : (
                            <span className="rounded bg-slate-50 px-1.5 py-0.5 text-xs text-slate-400">
                              {t('adminHelp.noEn')}
                            </span>
                          )}
                        </div>
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
                          <button
                            type="button"
                            onClick={() => deleteArticle(article)}
                            disabled={busy}
                            className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                            title={t('common.delete')}
                          >
                            <HiOutlineTrash className="h-4 w-4" />
                          </button>
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
