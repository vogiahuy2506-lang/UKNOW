import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { HiOutlineSparkles, HiOutlineExclamationCircle } from 'react-icons/hi';
import { getHelpArticle } from '../../services/help.service';
import { miniMarkdownToHtml } from '../../utils/miniMarkdownToHtml';
import { useI18n } from '../../i18n';
import { HELP_ARTICLE_BODY_RICH_CLASS } from '../../constants/helpArticleBodyStyle';

/**
 * Trang chi tiết 1 bài hướng dẫn (/huong-dan/:slug).
 */
export default function HelpArticlePage() {
  const { t, locale } = useI18n();
  const { slug } = useParams();
  const navigate = useNavigate();
  const [article, setArticle] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let mounted = true;
    setIsLoading(true);
    setNotFound(false);
    setArticle(null);

    getHelpArticle(slug, locale)
      .then((res) => {
        if (!mounted) return;
        setArticle(res.data?.result || null);
      })
      .catch(() => {
        if (mounted) setNotFound(true);
      })
      .finally(() => {
        if (mounted) setIsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [slug, locale]);

  const askAssistant = () => {
    navigate(`/app?ask=${encodeURIComponent(slug)}`);
  };

  if (isLoading) {
    return <p className="text-sm text-slate-400">{t('common.loading')}</p>;
  }

  if (notFound || !article) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-6 py-14 text-center text-slate-500">
        <HiOutlineExclamationCircle className="h-8 w-8 text-slate-400" />
        <p>{t('helpDocs.articleNotFound')}</p>
      </div>
    );
  }

  return (
    <article className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">{article.title}</h1>
        {article.summary && <p className="text-slate-500">{article.summary}</p>}
      </header>

      <button
        type="button"
        onClick={askAssistant}
        className="inline-flex items-center gap-2 rounded-lg bg-primary-500 px-4 py-2 text-sm font-medium text-white hover:bg-primary-600 active:bg-primary-700 transition-base"
      >
        <HiOutlineSparkles className="h-4 w-4" />
        {t('helpDocs.askAssistant')}
      </button>

      <div
        className={`border-t border-slate-100 pt-6 ${HELP_ARTICLE_BODY_RICH_CLASS}`}
      >
        {/* Bài chỉ có bodyMd cũng đi qua miniMarkdownToHtml — cùng bộ render với
            nút "Chuyển sang rich" bên admin, nên bảng / danh sách đánh số /
            code block hiện đúng thay vì rơi ra chữ thô. */}
        <div className="overflow-x-auto">
          <div
            dangerouslySetInnerHTML={{
              __html: article.bodyHtml || miniMarkdownToHtml(article.bodyMd || ''),
            }}
          />
        </div>
      </div>

      {Array.isArray(article.media) && article.media.length > 0 && (
        <div className="space-y-4 border-t border-slate-100 pt-6">
          {article.media.map((item) => (
            <figure key={item.id} className="space-y-2">
              {item.type === 'video' ? (
                <video src={item.url} controls className="w-full rounded-lg border border-slate-200" />
              ) : (
                <img src={item.url} alt={item.caption || article.title} className="w-full rounded-lg border border-slate-200" />
              )}
              {item.caption && (
                <figcaption className="text-sm text-slate-500 text-center">{item.caption}</figcaption>
              )}
            </figure>
          ))}
        </div>
      )}
    </article>
  );
}
