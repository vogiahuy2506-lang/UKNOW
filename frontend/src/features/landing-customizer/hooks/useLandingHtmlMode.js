import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { useI18n } from '../../../i18n';

const baseURL = import.meta.env.VITE_API_URL || '/api';

const publicClient = axios.create({
  baseURL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 30000,
});

export function useLandingHtmlMode(page) {
  const { locale } = useI18n();
  const [loading, setLoading] = useState(true);
  const [displayMode, setDisplayMode] = useState('default');
  const [htmlContent, setHtmlContent] = useState('');
  const [cssContent, setCssContent] = useState('');
  const [error, setError] = useState('');

  const fetchMode = useCallback(async () => {
    if (!page) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await publicClient.get(`/public/landing-page-html/${encodeURIComponent(page)}`, {
        params: { lang: locale },
      });
      const payload = data?.data || {};
      setDisplayMode(payload.displayMode === 'html' ? 'html' : 'default');
      setHtmlContent(payload.htmlContent || '');
      setCssContent(payload.cssContent || '');
    } catch (err) {
      setDisplayMode('default');
      setHtmlContent('');
      setCssContent('');
      setError(err?.response?.data?.message || err?.message || '');
    } finally {
      setLoading(false);
    }
  }, [page, locale]);

  useEffect(() => {
    fetchMode();
  }, [fetchMode]);

  return {
    loading,
    error,
    displayMode,
    htmlContent,
    cssContent,
    isHtmlMode: displayMode === 'html' && Boolean(htmlContent?.trim()),
    refetch: fetchMode,
  };
}
