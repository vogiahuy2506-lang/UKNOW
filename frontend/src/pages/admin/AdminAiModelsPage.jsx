import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineExclamation, HiOutlineRefresh, HiOutlineSparkles } from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import adminAiModelsApiService from '../../features/admin/services/adminAiModelsApi.service';
import { useI18n } from '../../i18n';

const toModelId = (model) => model.modelId || model.model_id;

const fmtUsd = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '—';
  return `$${v.toFixed(2)}`;
};

// 'YYYY-MM-DD' (ngày VN từ backend) → 'DD/MM/YYYY'
const fmtDay = (ymd) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(ymd || '');
};

export default function AdminAiModelsPage() {
  const { t } = useI18n();
  const [models, setModels] = useState([]);
  const [pricingMeta, setPricingMeta] = useState({
    avgPromptTokens: 10000,
    avgOutputTokens: 500,
    basis: 'estimate',
    usdVndRate: 24000,
  });
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [savingFallback, setSavingFallback] = useState(false);
  const [showAll, setShowAll] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAiModelsApiService.list();
      const payload = res.data?.data;
      const nextModels = Array.isArray(payload?.models)
        ? payload.models
        : (Array.isArray(payload) ? payload : []);
      setModels(nextModels);
      if (payload && !Array.isArray(payload)) {
        setPricingMeta({
          avgPromptTokens: Number(payload.avgPromptTokens) || 10000,
          avgOutputTokens: Number(payload.avgOutputTokens) || 500,
          basis: payload.basis === 'actual' ? 'actual' : 'estimate',
          usdVndRate: Number(payload.usdVndRate) || 24000,
        });
      }
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminAiModels.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const visibleModels = useMemo(() => {
    if (!showAll) return models.filter((model) => model.isEnabled || model.isFallback);
    return models.filter(
      (model) => model.isEnabled || model.isFallback || (model.thinking && model.supportsGenerateContent)
    );
  }, [models, showAll]);

  const retiredSystemModel = useMemo(
    () => models.find((m) => m.isEnabled && !m.supportsGenerateContent),
    [models]
  );

  const activeFallbackModel = useMemo(
    () => models.find((m) => m.isFallback && m.supportsGenerateContent),
    [models]
  );

  const retiredFallbackModel = useMemo(
    () => models.find((m) => m.isFallback && !m.supportsGenerateContent),
    [models]
  );

  const systemModelUnpriced = useMemo(
    () => models.find((m) => m.isEnabled && m.pricing && m.pricing.configured === false),
    [models]
  );

  const updateModel = async (model, patch) => {
    const modelId = toModelId(model);
    if (!modelId) return;
    setSavingId(modelId);
    try {
      const res = await adminAiModelsApiService.update(modelId, patch);
      const updated = res.data?.data;
      if (updated) {
        setModels((prev) => prev.map((item) => (
          toModelId(item) === modelId ? { ...item, ...updated, pricing: item.pricing } : item
        )));
      }
      toast.success(t('adminAiModels.saved'));
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminAiModels.saveFailed'));
    } finally {
      setSavingId(null);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await adminAiModelsApiService.sync();
      toast.success(res.data?.message || t('adminAiModels.synced'));
      await load();
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminAiModels.syncFailed'));
    } finally {
      setSyncing(false);
    }
  };

  const chooseSystemModel = async (model) => {
    const modelId = toModelId(model);
    if (!modelId || model.isEnabled) return;
    setSavingId(modelId);
    try {
      await adminAiModelsApiService.setSystemModel(modelId);
      setModels((prev) =>
        prev.map((item) => {
          const isSys = toModelId(item) === modelId;
          return {
            ...item,
            isEnabled: isSys,
            isFallback: isSys ? false : item.isFallback,
          };
        })
      );
      toast.success(t('adminAiModels.systemModelSet'));
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminAiModels.saveFailed'));
    } finally {
      setSavingId(null);
    }
  };

  const handleFallbackChange = async (nextModelId) => {
    const previousModels = models;
    const targetId = nextModelId || null;
    setSavingFallback(true);
    setModels((prev) =>
      prev.map((item) => ({
        ...item,
        isFallback: targetId ? toModelId(item) === targetId : false,
      }))
    );
    try {
      await adminAiModelsApiService.setFallbackModel(targetId);
      if (targetId) {
        toast.success(t('adminAiModels.fallbackSet', { model: targetId }));
      } else {
        toast.success(t('adminAiModels.fallbackCleared'));
      }
    } catch (err) {
      setModels(previousModels);
      toast.error(err?.response?.data?.message || t('adminAiModels.saveFailed'));
    } finally {
      setSavingFallback(false);
    }
  };

  const handleFallbackToggle = (model) => {
    const modelId = toModelId(model);
    if (!modelId || model.isEnabled || !model.supportsGenerateContent) return;
    if (model.isFallback) {
      handleFallbackChange(null);
    } else {
      handleFallbackChange(modelId);
    }
  };

  return (
    <PageContainer
      title={t('adminAiModels.title')}
      subtitle={
        <div>
          <span>{t('adminAiModels.subtitle')}</span>
          <p className="mt-1 max-w-3xl text-sm text-amber-700">{t('adminAiModels.metadataHint')}</p>
        </div>
      }
      icon={HiOutlineSparkles}
      actions={
        <button
          type="button"
          className="btn btn-primary inline-flex items-center gap-2"
          disabled={syncing}
          onClick={sync}
        >
          <HiOutlineRefresh className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? t('adminAiModels.syncing') : t('adminAiModels.sync')}
        </button>
      }
    >

      {systemModelUnpriced && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
          <HiOutlineExclamation className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            {t('adminAiModels.systemModelUnpricedBanner', {
              model: toModelId(systemModelUnpriced),
            })}
          </p>
        </div>
      )}

      {retiredSystemModel && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          <HiOutlineExclamation className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
          <p>
            {t('adminAiModels.systemModelRetiredBanner', {
              model: toModelId(retiredSystemModel),
              active: activeFallbackModel
                ? toModelId(activeFallbackModel)
                : t('adminAiModels.activeDefaultModel'),
            })}
          </p>
        </div>
      )}

      {retiredFallbackModel && (
        <div className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300">
          <HiOutlineExclamation className="mt-0.5 h-5 w-5 shrink-0 text-rose-600 dark:text-rose-400" />
          <p>
            {t('adminAiModels.fallbackRetiredBanner', {
              model: toModelId(retiredFallbackModel),
            })}
          </p>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-dk-border dark:bg-dk-surface">
        <div className="flex flex-col gap-3 border-b border-slate-100 px-5 py-4 dark:border-dk-border sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <HiOutlineSparkles className="h-5 w-5 text-orange-500" />
            <p className="font-semibold text-slate-800 dark:text-dk-text">{t('adminAiModels.catalog')}</p>
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 dark:text-dk-text">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-slate-300 text-orange-600 dark:border-dk-border dark:bg-dk-inset"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
            />
            {t('adminAiModels.showAll')}
          </label>
        </div>
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-400 dark:text-dk-muted">{t('common.loading')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm dark:divide-dk-border">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:bg-dk-raised dark:text-dk-text2">
                <tr>
                  <th className="px-5 py-3">{t('adminAiModels.model')}</th>
                  <th className="px-5 py-3">{t('adminAiModels.displayName')}</th>
                  <th className="px-5 py-3">{t('adminAiModels.pricePerAnswer')}</th>
                  <th className="px-5 py-3">{t('adminAiModels.roleColumn') || t('adminAiModels.systemModelColumn')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-dk-border">
                {visibleModels.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-5 py-10 text-center text-slate-400 dark:text-dk-muted">
                      {models.length === 0 ? t('adminAiModels.noModels') : t('adminAiModels.noEnabledModels')}
                    </td>
                  </tr>
                )}
                {visibleModels.map((model) => {
                  const modelId = toModelId(model);
                  const busy = savingId === modelId;
                  const pricing = model.pricing || {};
                  return (
                    <tr key={modelId} className="align-top">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-mono font-semibold text-slate-800 dark:text-dk-text">{modelId}</p>
                          {model.isFallback && (
                            <span className="inline-flex rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:border-amber-800/50 dark:bg-amber-950/40 dark:text-amber-300">
                              {t('adminAiModels.fallbackBadge')}
                            </span>
                          )}
                        </div>
                        {model.thinking && (
                          <span className="mt-1 inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
                            {t('adminAiModels.thinking')}
                          </span>
                        )}
                        {!model.supportsGenerateContent && (
                          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">{t('adminAiModels.notSupported')}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <input
                          className="input h-9 min-w-[220px] dark:border-dk-border dark:bg-dk-inset dark:text-dk-text"
                          defaultValue={model.displayName}
                          disabled={busy}
                          onBlur={(e) => {
                            if (e.target.value !== model.displayName) updateModel(model, { displayName: e.target.value });
                          }}
                        />
                      </td>
                      <td className="px-5 py-4">
                        {pricing.configured ? (
                          <div>
                            {pricing.measured ? (
                              <>
                                <p className="font-semibold text-slate-800 dark:text-dk-text">
                                  ~{Number(pricing.measured.costPerCallVnd).toLocaleString('vi-VN')}đ
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-dk-text2">
                                  {t('adminAiModels.measuredHint', {
                                    calls: Number(pricing.measured.calls).toLocaleString('vi-VN'),
                                  })}
                                </p>
                              </>
                            ) : (
                              <>
                                <p className="font-semibold text-slate-500 dark:text-dk-text2">
                                  ~{Number(pricing.costPerAnswerVnd).toLocaleString('vi-VN')}đ{' '}
                                  <span className="text-xs font-normal">({t('adminAiModels.estimatedTag')})</span>
                                </p>
                                <p className="mt-0.5 text-xs text-slate-500 dark:text-dk-text2">{t('adminAiModels.noCallsHint')}</p>
                              </>
                            )}
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-dk-text2">
                              {fmtUsd(pricing.inputUsdPerM)} / {fmtUsd(pricing.outputUsdPerM)}{' '}
                              {t('adminAiModels.perMillionTokens')}
                            </p>
                            {pricing.upcoming && (
                              <p className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-300" data-testid={`upcoming-price-${modelId}`}>
                                {t('adminAiModels.upcomingPrice', {
                                  date: fmtDay(pricing.upcoming.from),
                                  input: fmtUsd(pricing.upcoming.inputUsdPerM),
                                  output: fmtUsd(pricing.upcoming.outputUsdPerM),
                                })}
                              </p>
                            )}
                          </div>
                        ) : (
                          <div>
                            <p className="font-semibold text-amber-700 dark:text-amber-400">
                              ⚠ {t('adminAiModels.priceMissing')}
                            </p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-dk-text2">
                              {t('adminAiModels.priceMissingHint')}
                            </p>
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => chooseSystemModel(model)}
                            disabled={busy || !model.supportsGenerateContent || model.isEnabled}
                            aria-pressed={Boolean(model.isEnabled)}
                            title={
                              model.isEnabled
                                ? (t('adminAiModels.primaryActiveTitle') || 'Model chính đang hoạt động')
                                : !model.supportsGenerateContent
                                ? t('adminAiModels.notSupported')
                                : (t('adminAiModels.setPrimaryTitle') || 'Chọn làm model chính')
                            }
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                              model.isEnabled
                                ? 'bg-orange-500 text-white shadow-sm ring-2 ring-orange-400/30 dark:bg-orange-600'
                                : model.supportsGenerateContent && !busy
                                ? 'border border-slate-200 text-slate-600 hover:border-orange-400 hover:text-orange-600 hover:bg-orange-50 dark:border-dk-border dark:text-dk-text2 dark:hover:bg-dk-raised dark:hover:text-dk-text'
                                : 'border border-slate-200 text-slate-300 opacity-40 cursor-not-allowed dark:border-dk-border dark:text-dk-muted'
                            }`}
                          >
                            {t('adminAiModels.rolePrimary') || 'Chính'}
                          </button>

                          <button
                            type="button"
                            onClick={() => handleFallbackToggle(model)}
                            disabled={savingFallback || !model.supportsGenerateContent || model.isEnabled}
                            aria-pressed={Boolean(model.isFallback)}
                            title={
                              model.isEnabled
                                ? (t('adminAiModels.cannotFallbackPrimary') || 'Model chính không thể làm model dự phòng')
                                : model.isFallback
                                ? (t('adminAiModels.fallbackActiveTitle') || 'Model dự phòng (bấm để huỷ)')
                                : !model.supportsGenerateContent
                                ? t('adminAiModels.notSupported')
                                : (t('adminAiModels.setFallbackTitle') || 'Chọn làm model dự phòng')
                            }
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                              model.isFallback
                                ? 'bg-amber-500 text-white shadow-sm ring-2 ring-amber-400/30 dark:bg-amber-600'
                                : model.supportsGenerateContent && !model.isEnabled && !savingFallback
                                ? 'border border-slate-200 text-slate-600 hover:border-amber-400 hover:text-amber-600 hover:bg-amber-50 dark:border-dk-border dark:text-dk-text2 dark:hover:bg-dk-raised dark:hover:text-dk-text'
                                : 'border border-slate-200 text-slate-300 opacity-40 cursor-not-allowed dark:border-dk-border dark:text-dk-muted'
                            }`}
                          >
                            {t('adminAiModels.roleFallback') || 'Phụ'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="border-t border-slate-100 px-5 py-3 text-xs text-slate-500 space-y-1 dark:border-dk-border dark:text-dk-text2">
              <p>
                {t('adminAiModels.usdRateNote', {
                  rate: Number(pricingMeta.usdVndRate).toLocaleString('vi-VN'),
                })}
              </p>
              <p>
                {pricingMeta.basis === 'actual'
                  ? t('adminAiModels.avgBasisActual', {
                    prompt: Number(pricingMeta.avgPromptTokens).toLocaleString('vi-VN'),
                    output: Number(pricingMeta.avgOutputTokens).toLocaleString('vi-VN'),
                  })
                  : t('adminAiModels.avgBasisEstimate', {
                    prompt: Number(pricingMeta.avgPromptTokens).toLocaleString('vi-VN'),
                    output: Number(pricingMeta.avgOutputTokens).toLocaleString('vi-VN'),
                  })}
              </p>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
