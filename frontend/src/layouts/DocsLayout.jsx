import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  HiOutlineHome,
  HiOutlineSearch,
  HiOutlineMenu,
  HiOutlineX,
  HiOutlineDocumentText,
} from 'react-icons/hi';
import { listHelpArticles } from '../services/help.service';
import { useI18n } from '../i18n';

/**
 * Layout công khai cho trung tâm hướng dẫn (/huong-dan).
 * Sidebar trái liệt kê bài viết theo nhóm (feature_key), có ô tìm kiếm.
 * Trên mobile, sidebar thu vào dạng drawer.
 */
export default function DocsLayout() {
  const { t } = useI18n();
  const location = useLocation();
  const [articles, setArticles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [location.pathname]);

  useEffect(() => {
    let mounted = true;
    listHelpArticles()
      .then((res) => {
        if (!mounted) return;
        setArticles(res.data?.result || []);
      })
      .catch(() => {
        if (mounted) setArticles([]);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [location.pathname]);

  const filteredArticles = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter((a) => (
      a.title?.toLowerCase().includes(q) || a.summary?.toLowerCase().includes(q)
    ));
  }, [articles, search]);

  const groups = useMemo(() => {
    const map = new Map();
    for (const article of filteredArticles) {
      const key = article.featureKey || 'khac';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(article);
    }
    return [...map.entries()].map(([featureKey, items]) => ({
      featureKey,
      items: items.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    }));
  }, [filteredArticles]);

  const sidebarContent = (
    <div className="flex h-full flex-col">
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 focus-within:border-primary-400 focus-within:ring-1 focus-within:ring-primary-400">
          <HiOutlineSearch className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('helpDocs.searchPlaceholder')}
            className="ml-2 w-full bg-transparent text-sm text-slate-700 outline-none placeholder:text-slate-400"
          />
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        {isLoading ? (
          <p className="px-3 text-sm text-slate-400">{t('common.loading')}</p>
        ) : groups.length === 0 ? (
          <p className="px-3 text-sm text-slate-400">{t('helpDocs.noResults')}</p>
        ) : (
          groups.map((group) => (
            <div key={group.featureKey}>
              <p className="px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                {t(`helpDocs.featureGroups.${group.featureKey}`) !== `helpDocs.featureGroups.${group.featureKey}`
                  ? t(`helpDocs.featureGroups.${group.featureKey}`)
                  : group.featureKey}
              </p>
              <ul className="mt-1 space-y-0.5">
                {group.items.map((article) => (
                  <li key={article.slug}>
                    <NavLink
                      to={`/huong-dan/${article.slug}`}
                      className={({ isActive }) => (
                        `flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? 'bg-primary-50 text-primary-700 font-medium'
                            : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`
                      )}
                    >
                      <HiOutlineDocumentText className="h-4 w-4 shrink-0" />
                      <span className="truncate">{article.title}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </nav>
    </div>
  );

  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="sticky top-0 z-40 border-b border-slate-100 bg-white/95 backdrop-blur">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <button
            type="button"
            className="lg:hidden p-2 -ml-2 text-slate-500 hover:text-slate-800"
            onClick={() => setMobileSidebarOpen(true)}
            aria-label={t('helpDocs.openMenu')}
          >
            <HiOutlineMenu className="h-5 w-5" />
          </button>
          <Link to="/" className="flex items-center gap-2 text-slate-500 hover:text-slate-800">
            <HiOutlineHome className="h-4 w-4" />
            <span className="text-sm">{t('helpDocs.home')}</span>
          </Link>
          <span className="text-slate-300">/</span>
          <Link to="/huong-dan" className="text-sm font-semibold text-slate-900">
            {t('helpDocs.title')}
          </Link>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block w-72 shrink-0 border-r border-slate-100">
          {sidebarContent}
        </aside>

        {/* Mobile sidebar drawer */}
        {mobileSidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileSidebarOpen(false)}
              aria-hidden="true"
            />
            <div className="relative z-10 w-72 max-w-[85vw] bg-white shadow-xl flex flex-col">
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                <span className="text-sm font-semibold text-slate-900">{t('helpDocs.title')}</span>
                <button
                  type="button"
                  className="p-1.5 text-slate-400 hover:text-slate-700"
                  onClick={() => setMobileSidebarOpen(false)}
                  aria-label={t('common.close')}
                >
                  <HiOutlineX className="h-5 w-5" />
                </button>
              </div>
              {sidebarContent}
            </div>
          </div>
        )}

        <main className="flex-1 min-w-0">
          <div className="mx-auto max-w-3xl px-4 sm:px-8 py-8">
            <Outlet context={{ articles, groups, isLoading }} />
          </div>
        </main>
      </div>
    </div>
  );
}
