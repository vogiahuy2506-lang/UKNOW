import { Link, useOutletContext } from 'react-router-dom';
import { HiOutlineDocumentText, HiOutlineSparkles } from 'react-icons/hi';
import { useI18n } from '../../i18n';

/**
 * Trang chủ của trung tâm hướng dẫn (/huong-dan) — giới thiệu + danh sách bài viết theo nhóm.
 * Dữ liệu (articles/groups) được nạp một lần ở DocsLayout và truyền xuống qua Outlet context.
 */
export default function HelpIndexPage() {
  const { t } = useI18n();
  const { groups = [], isLoading } = useOutletContext() || {};

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">{t('helpDocs.title')}</h1>
        <p className="mt-2 text-slate-500">{t('helpDocs.intro')}</p>
      </div>

      {isLoading ? (
        <p className="text-sm text-slate-400">{t('common.loading')}</p>
      ) : groups.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-6 py-10 text-center text-slate-400">
          {t('helpDocs.noArticles')}
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.featureKey}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 mb-2">
                {t(`helpDocs.featureGroups.${group.featureKey}`) !== `helpDocs.featureGroups.${group.featureKey}`
                  ? t(`helpDocs.featureGroups.${group.featureKey}`)
                  : group.featureKey}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {group.items.map((article) => (
                  <Link
                    key={article.slug}
                    to={`/huong-dan/${article.slug}`}
                    className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:border-primary-300 hover:shadow-sm transition-all"
                  >
                    <HiOutlineDocumentText className="h-5 w-5 text-primary-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900">{article.title}</p>
                      {article.summary && (
                        <p className="mt-1 text-sm text-slate-500 line-clamp-2">{article.summary}</p>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center gap-2 rounded-xl border border-primary-100 bg-primary-50 px-4 py-3 text-sm text-primary-700">
        <HiOutlineSparkles className="h-5 w-5 shrink-0" />
        <span>{t('helpDocs.assistantHint')}</span>
      </div>
    </div>
  );
}
