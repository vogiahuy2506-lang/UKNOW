import { useState, useEffect, useCallback } from 'react';
import landingCustomizerApiService from '../services/landingCustomizerApi.service';

export function useLandingOverrides() {
  const [overrides, setOverrides] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOverrides = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await landingCustomizerApiService.getAllOverrides();
      setOverrides(res.data.data || []);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load overrides');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides]);

  return { overrides, isLoading, error, refetch: fetchOverrides };
}

export function useLandingOverridesByPage(page) {
  const [overrides, setOverrides] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchOverrides = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await landingCustomizerApiService.getOverridesByPage(page);
      const data = res.data.data || {};
      // Convert map { section: { key: item } } back to array for components that use .find()
      const arr = [];
      for (const [section, keys] of Object.entries(data)) {
        for (const [key, value] of Object.entries(keys)) {
          arr.push({ section, key, ...value });
        }
      }
      setOverrides(arr);
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to load overrides');
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchOverrides();
  }, [fetchOverrides]);

  const saveOverride = async (section, key, valueVi, valueEn, extraData) => {
    try {
      await landingCustomizerApiService.createOverride({
        page,
        section,
        key,
        valueVi,
        valueEn,
        extraData,
      });
      await fetchOverrides();
      return true;
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to save override');
      return false;
    }
  };

  const deleteOverride = async (id) => {
    try {
      await landingCustomizerApiService.deleteOverride(id);
      await fetchOverrides();
      return true;
    } catch (err) {
      setError(err?.response?.data?.message || 'Failed to delete override');
      return false;
    }
  };

  return { overrides, isLoading, error, refetch: fetchOverrides, saveOverride, deleteOverride };
}
