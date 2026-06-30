import { useEffect, useState, useCallback } from 'react';
import api from '../../../services/api';

let cachedOverrides = {};

export function useLandingOverrides(page) {
  const [overrides, setOverrides] = useState({});

  const fetchOverrides = useCallback(async () => {
    if (typeof window === 'undefined') return {};

    // Check localStorage for preview overrides first
    const previewOverrides = localStorage.getItem(`landing_overrides_${page}`);
    if (previewOverrides) {
      try {
        const parsed = JSON.parse(previewOverrides);
        cachedOverrides[page] = parsed;
        setOverrides(parsed);
        return parsed;
      } catch (e) {}
    }
    
    try {
      const res = await api.get(`/public/landing-overrides/${page}`);
      const data = res.data?.data || {};
      cachedOverrides[page] = data;
      setOverrides(data);
      return data;
    } catch (err) {
      cachedOverrides[page] = {};
      setOverrides({});
      return {};
    }
  }, [page]);

  useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides]);

  // Listen for postMessage from editor
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleMessage = (e) => {
      if (e.data?.type === 'OVERRIDES_UPDATED' && e.data.page === page) {
        cachedOverrides[page] = e.data.data;
        setOverrides(e.data.data);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [page]);

  // Listen for custom event from iframe
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleUpdate = (e) => {
      if (e.detail?.data) {
        cachedOverrides[page] = e.detail.data;
        setOverrides(e.detail.data);
      }
    };

    window.addEventListener('landing-overrides-updated', handleUpdate);
    return () => window.removeEventListener('landing-overrides-updated', handleUpdate);
  }, [page]);

  // Poll for changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const interval = setInterval(() => {
      const previewOverrides = localStorage.getItem(`landing_overrides_${page}`);
      if (previewOverrides) {
        try {
          const parsed = JSON.parse(previewOverrides);
          if (JSON.stringify(parsed) !== JSON.stringify(cachedOverrides[page])) {
            cachedOverrides[page] = parsed;
            setOverrides(parsed);
          }
        } catch (e) {}
      }
    }, 300);

    return () => clearInterval(interval);
  }, [page]);

  // Get override value - handles both old format and new _vi/_en format
  const getOverride = useCallback((key, fallback = null) => {
    if (!key || !overrides) return fallback;
    
    // Try direct key first
    if (overrides[key]) {
      return overrides[key];
    }
    
    // Try with locale suffix
    const viKey = `${key}_vi`;
    const enKey = `${key}_en`;
    
    if (overrides[viKey] || overrides[enKey]) {
      return overrides[viKey] || overrides[enKey] || fallback;
    }
    
    return fallback;
  }, [overrides]);

  const getOverrideLocalized = useCallback((key, locale = 'vi') => {
    if (!key || !overrides) return null;
    
    // Try locale-specific key first
    const localeKey = locale === 'en' ? `${key}_en` : `${key}_vi`;
    if (overrides[localeKey]) {
      return overrides[localeKey];
    }
    
    // Fallback to direct key
    if (overrides[key]) {
      return overrides[key];
    }
    
    return null;
  }, [overrides]);

  const refetch = useCallback(() => {
    cachedOverrides[page] = null;
    return fetchOverrides();
  }, [page, fetchOverrides]);

  return { 
    overrides,
    getOverride, 
    getOverrideLocalized,
    refetch 
  };
}

// Alias for backward compatibility
export const usePublicLandingOverrides = useLandingOverrides;

export function invalidateOverridesCache(page) {
  if (page) {
    cachedOverrides[page] = null;
  } else {
    cachedOverrides = {};
  }
}
