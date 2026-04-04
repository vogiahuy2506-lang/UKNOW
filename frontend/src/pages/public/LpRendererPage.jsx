import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { fetchPublishedLandingHtml } from '../../features/landing-pages/services/landingPagePublicApi.service.js';
import { useRecordLandingView } from '../../features/landing-pages/hooks/useRecordLandingView.js';

/**
 * Render HTML do admin upload — hiển thị trong iframe sandbox (tách origin khỏi app cha).
 * Route: `/lp/:slug`
 */
export default function LpRendererPage() {
  const { slug: slugParam } = useParams();
  const slug = String(slugParam || '').trim().toLowerCase();
  const [title, setTitle] = useState('');
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useRecordLandingView(slug);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!slug) {
        setErr('Thiếu slug');
        setLoading(false);
        return;
      }
      setLoading(true);
      setErr('');
      try {
        const data = await fetchPublishedLandingHtml(slug);
        if (cancelled) return;
        setTitle(data.title || slug);
        setHtml(data.htmlContent || '');
      } catch (e) {
        if (cancelled) return;
        setErr(e?.response?.data?.message || e?.message || 'Không tải được trang');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (title) document.title = title;
  }, [title]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-500 text-sm">
        Đang tải…
      </div>
    );
  }

  if (err) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <p className="text-center text-red-600 text-sm">{err}</p>
      </div>
    );
  }

  return (
    <iframe
      title={title || slug}
      className="w-full min-h-screen border-0 block"
      sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation allow-same-origin"
      srcDoc={html}
    />
  );
}
