import { useEffect, useState } from 'react';
import { fetchPublishedLandingByHost } from '../../features/landing-pages/services/landingPagePublicApi.service.js';
import { useRecordLandingView } from '../../features/landing-pages/hooks/useRecordLandingView.js';

/**
 * Khi mở SPA trên hostname custom (www.*) — tải HTML theo `Host`, không dùng route `/lp/:slug`.
 */
export default function LpRendererByHost() {
  const host = typeof window !== 'undefined' ? String(window.location.hostname || '').trim().toLowerCase() : '';
  const [slug, setSlug] = useState('');
  const [title, setTitle] = useState('');
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  useRecordLandingView(slug);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!host) {
        setErr('Thiếu hostname');
        setLoading(false);
        return;
      }
      setLoading(true);
      setErr('');
      try {
        const data = await fetchPublishedLandingByHost(host);
        if (cancelled) return;
        setSlug(String(data.slug || '').trim().toLowerCase());
        setTitle(data.title || data.slug || host);
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
  }, [host]);

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
        <p className="text-center text-red-600 text-sm max-w-md">{err}</p>
      </div>
    );
  }

  return (
    <iframe
      title={title || slug || host}
      className="w-full min-h-screen border-0 block"
      sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
      srcDoc={html}
    />
  );
}
