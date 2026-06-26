import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiOutlineRefresh, HiOutlineSparkles } from 'react-icons/hi';
import adminAiModelsApiService from '../../features/admin/services/adminAiModelsApi.service';
import { useI18n } from '../../i18n';

const toModelId = (model) => model.modelId || model.model_id;

export default function AdminAiModelsPage() {
  const { t } = useI18n();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [savingId, setSavingId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await adminAiModelsApiService.list();
      setModels(Array.isArray(res.data?.data) ? res.data.data : []);
    } catch (err) {
      toast.error(err?.response?.data?.message || t('adminAiModels.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  const updateModel = async (model, patch) => {
    const modelId = toModelId(model);
    if (!modelId) return;
    setSavingId(modelId);
    try {
      const res = await adminAiModelsApiService.update(modelId, patch);
      const updated = res.data?.data;
      if (updated) {
        setModels((prev) => prev.map((item) => (toModelId(item) === modelId ? updated : item)));
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('adminAiModels.title')}</h1>
          <p className="mt-1 text-gray-500">{t('adminAiModels.subtitle')}</p>
          <p className="mt-2 max-w-3xl text-sm text-amber-700">{t('adminAiModels.rankHint')}</p>
        </div>
        <button
          type="button"
          className="btn btn-primary inline-flex items-center gap-2"
          disabled={syncing}
          onClick={sync}
        >
          <HiOutlineRefresh className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? t('adminAiModels.syncing') : t('adminAiModels.sync')}
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <HiOutlineSparkles className="h-5 w-5 text-orange-500" />
            <p className="font-semibold text-slate-800">{t('adminAiModels.catalog')}</p>
          </div>
        </div>
        {loading ? (
          <div className="p-10 text-center text-sm text-slate-400">{t('common.loading')}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-5 py-3">{t('adminAiModels.model')}</th>
                  <th className="px-5 py-3">{t('adminAiModels.displayName')}</th>
                  <th className="px-5 py-3">{t('adminAiModels.rank')}</th>
                  <th className="px-5 py-3">{t('adminAiModels.status')}</th>
                  <th className="px-5 py-3">{t('adminAiModels.source')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {models.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-slate-400">{t('adminAiModels.noModels')}</td>
                  </tr>
                )}
                {models.map((model) => {
                  const modelId = toModelId(model);
                  const busy = savingId === modelId;
                  return (
                    <tr key={modelId} className="align-top">
                      <td className="px-5 py-4">
                        <p className="font-mono font-semibold text-slate-800">{modelId}</p>
                        {!model.supportsGenerateContent && (
                          <p className="mt-1 text-xs text-amber-600">{t('adminAiModels.notSupported')}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <input
                          className="input h-9 min-w-[220px]"
                          defaultValue={model.displayName}
                          disabled={busy}
                          onBlur={(e) => {
                            if (e.target.value !== model.displayName) updateModel(model, { displayName: e.target.value });
                          }}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <input
                          type="number"
                          className="input h-9 w-24"
                          defaultValue={model.tierRank}
                          disabled={busy}
                          onBlur={(e) => {
                            const next = Number(e.target.value);
                            if (Number.isFinite(next) && next !== Number(model.tierRank)) updateModel(model, { tierRank: next });
                          }}
                        />
                      </td>
                      <td className="px-5 py-4">
                        <label className="inline-flex cursor-pointer items-center gap-2">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-orange-600"
                            checked={Boolean(model.isEnabled)}
                            disabled={busy || (!model.supportsGenerateContent && !model.isEnabled)}
                            onChange={(e) => updateModel(model, { isEnabled: e.target.checked })}
                          />
                          <span className={model.isEnabled ? 'text-emerald-700' : 'text-slate-500'}>
                            {model.isEnabled ? t('adminAiModels.enabled') : t('adminAiModels.disabled')}
                          </span>
                        </label>
                      </td>
                      <td className="px-5 py-4 text-slate-500">{model.source || 'manual'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
