import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { HiOutlineSparkles, HiOutlineExclamationCircle } from 'react-icons/hi';
import { getHelpArticle } from '../../services/help.service';
import { renderMiniMarkdown } from '../../utils/miniMarkdown';
import { useI18n } from '../../i18n';

/**
 * Trang chi tiết 1 bài hướng dẫn (/huong-dan/:slug).
 */
export default function HelpArticlePage() {
  const { t } = useI18n();
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

    getHelpArticle(slug)
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
  }, [slug]);

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
        className="border-t border-slate-100 pt-6 help-article-body
          [&_h2]:mt-6 [&_h2]:mb-3 [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:text-slate-900
          [&_h3]:mt-5 [&_h3]:mb-2 [&_h3]:text-xl [&_h3]:font-semibold
          [&_h4]:mt-4 [&_h4]:mb-2 [&_h4]:text-lg [&_h4]:font-semibold
          [&_p]:my-3 [&_p]:leading-relaxed [&_p]:text-slate-700
          [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5
          [&_li]:my-1 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-200 [&_blockquote]:pl-4 [&_blockquote]:italic
          [&_a]:text-primary-600 [&_a]:underline
          [&_img]:my-4 [&_img]:max-w-full [&_img]:rounded-lg [&_img]:border [&_img]:border-slate-200
          [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-900 [&_pre]:p-3 [&_pre]:text-slate-100
          [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:text-sm
          [&_table]:w-full [&_table]:border-collapse [&_th]:border [&_td]:border [&_th]:border-slate-200 [&_td]:border-slate-200 [&_th]:bg-slate-50 [&_th]:p-2 [&_td]:p-2"
      >
        {article.bodyHtml ? (
          <div className="overflow-x-auto">
            <div dangerouslySetInnerHTML={{ __html: article.bodyHtml }} />
          </div>
        ) : (
          renderMiniMarkdown(article.bodyMd)
        )}
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
