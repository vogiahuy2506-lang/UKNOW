import { useEffect, useState } from 'react';
import { getTopupLocks, putTopupLocks } from '../../services/topup.service';

const RESOURCE_LABEL_KEYS = {
  zalo_accounts: 'resourceLocks.zaloAccounts',
  email_accounts: 'resourceLocks.emailAccounts',
  landing_pages: 'resourceLocks.landingPages',
  chatbots: 'resourceLocks.chatbots',
  employees: 'resourceLocks.employees',
};

const VALID_RESOURCE_KEYS = [
  'zalo_accounts',
  'email_accounts',
  'landing_pages',
  'chatbots',
  'employees',
];

/**
 * B4 — chọn tài nguyên giữ khi vượt trần hiệu dụng.
 */
const ResourceLocksTab = ({ t }) => {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState(null);
  const [draftKeep, setDraftKeep] = useState({});

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getTopupLocks();
      const data = res?.data?.result || res?.data || {};
      setOverview(data);
      const nextDraft = {};
      for (const [key, block] of Object.entries(data)) {
        if (!VALID_RESOURCE_KEYS.includes(key)) continue;
        nextDraft[key] = (block?.items || [])
          .filter((item) => !item.isLocked)
          .map((item) => item.id);
      }
      setDraftKeep(nextDraft);
    } catch (err) {
      setError(err?.response?.data?.message || t('resourceLocks.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleKeep = (resourceKey, id, ceiling) => {
    setDraftKeep((prev) => {
      const current = new Set(prev[resourceKey] || []);
      if (current.has(id)) {
        current.delete(id);
      } else if (current.size < ceiling) {
        current.add(id);
      }
      return { ...prev, [resourceKey]: [...current] };
    });
  };

  const save = async (resourceKey) => {
    setSavingKey(resourceKey);
    setError('');
    try {
      const res = await putTopupLocks({
        resourceKey,
        keepIds: draftKeep[resourceKey] || [],
      });
      const data = res?.data?.result || res?.data || {};
      setOverview(data);
      const nextDraft = {};
      for (const [key, block] of Object.entries(data)) {
        if (!VALID_RESOURCE_KEYS.includes(key)) continue;
        nextDraft[key] = (block?.items || [])
          .filter((item) => !item.isLocked)
          .map((item) => item.id);
      }
      setDraftKeep(nextDraft);
    } catch (err) {
      setError(err?.response?.data?.message || t('resourceLocks.saveFailed'));
    } finally {
      setSavingKey(null);
    }
  };

  if (loading) {
    return <p className="text-sm text-slate-500">{t('common.loading')}</p>;
  }

  const keys = Object.keys(overview || {}).filter((k) => VALID_RESOURCE_KEYS.includes(k));
  const hasAny = keys.some((k) => (overview[k]?.items || []).length > 0);

  return (
    <div className="space-y-6">
      {overview?.isGraceActive && overview?.overageGraceUntil && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">{t('resourceLocks.graceTitle') || 'Thời gian ân hạn hạ gói (7 ngày)'}</p>
          <p className="mt-1 text-xs text-amber-700">
            {t('resourceLocks.graceNotice', {
              date: new Date(overview.overageGraceUntil).toLocaleDateString('vi-VN'),
            })}
          </p>
        </div>
      )}

      <p className="text-sm text-slate-600">{t('resourceLocks.help')}</p>
      {error && (
        <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}
      {!hasAny && (
        <p className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-4 text-sm text-slate-500">
          {t('resourceLocks.empty')}
        </p>
      )}
      {keys.map((resourceKey) => {
        const block = overview[resourceKey];
        if (!block?.items?.length) return null;
        const ceiling = Number(block.effectiveCeiling) || 0;
        const keep = new Set(draftKeep[resourceKey] || []);
        return (
          <section key={resourceKey} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900">
                {t(RESOURCE_LABEL_KEYS[resourceKey] || resourceKey)}
              </h3>
              <p className="text-xs text-slate-500">
                {t('resourceLocks.ceiling', {
                  keep: keep.size,
                  max: ceiling,
                  grants: block.activeGrants || 0,
                })}
              </p>
            </div>
            <ul className="space-y-2">
              {block.items.map((item) => {
                const checked = keep.has(item.id);
                const isAboutToLock = overview?.isGraceActive && !checked && !item.isLocked;
                return (
                  <li key={item.id} className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleKeep(resourceKey, item.id, ceiling)}
                      disabled={!checked && keep.size >= ceiling}
                      className="h-4 w-4 rounded border-slate-300 text-primary-600"
                    />
                    <span className={item.isLocked && !checked ? 'text-slate-400 line-through' : isAboutToLock ? 'text-rose-700 font-medium' : 'text-slate-800'}>
                      {item.label}
                    </span>
                    {item.isLocked && !checked && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-amber-700">
                        {t('resourceLocks.locked')}
                      </span>
                    )}
                    {isAboutToLock && (
                      <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium uppercase text-rose-700">
                        {t('resourceLocks.aboutToLock')}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <button
              type="button"
              onClick={() => save(resourceKey)}
              disabled={savingKey === resourceKey}
              className="mt-4 rounded-lg bg-primary-600 px-3 py-2 text-sm font-semibold text-white hover:bg-primary-700 disabled:opacity-60"
            >
              {savingKey === resourceKey ? t('common.saving') : t('resourceLocks.save')}
            </button>
          </section>
        );
      })}
    </div>
  );
};

export default ResourceLocksTab;
