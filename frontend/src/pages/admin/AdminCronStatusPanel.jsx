import { useCallback, useEffect, useMemo, useState } from 'react';
import { HiOutlineRefresh } from 'react-icons/hi';
import adminAlertsApiService from '../../features/admin/services/adminAlertsApi.service';
import { useI18n } from '../../i18n';

const fmtDate = (d) => (d ? new Date(d).toLocaleString('vi-VN') : '—');

function statusBadgeClass(kind) {
  if (kind === 'failure') return 'badge-error';
  if (kind === 'noop' || kind === 'untracked' || kind === 'disabled') return 'badge-gray';
  if (kind === 'running') return 'badge-info';
  return 'badge-success';
}

function resolveRowStatus(job, run, t) {
  if (run) {
    const key = String(run.status || '').toLowerCase();
    if (key === 'success') return { kind: 'success', label: t('adminHealth.statusSuccess') };
    if (key === 'failure' || key === 'failed' || key === 'error') {
      return { kind: 'failure', label: t('adminHealth.statusFailure') };
    }
    if (key === 'noop') return { kind: 'noop', label: t('adminHealth.statusNoop') };
    if (key === 'running' || key === 'started') {
      return { kind: 'running', label: t('adminHealth.statusRunning') };
    }
    return { kind: 'success', label: run.status || '—' };
  }
  if (job?.optional && job?.tracked) {
    return { kind: 'disabled', label: t('adminHealth.statusDisabledByConfig') };
  }
  return { kind: 'untracked', label: t('adminHealth.statusUntracked') };
}

function showImpact(statusKind) {
  return statusKind === 'failure' || statusKind === 'untracked';
}

const AdminCronStatusPanel = () => {
  const { t } = useI18n();
  const [jobs, setJobs] = useState(null);
  const [latest, setLatest] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminAlertsApiService.getCronStatus({ limit: 40 });
      const data = res?.data?.data || res?.data || {};
      setJobs(Array.isArray(data.jobs) ? data.jobs : null);
      setLatest(data.latest || []);
      setRecent(data.recent || []);
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const latestByCode = useMemo(() => {
    const map = new Map();
    for (const r of latest) {
      if (r?.jobCode && !map.has(r.jobCode)) map.set(r.jobCode, r);
    }
    return map;
  }, [latest]);

  const tableRows = useMemo(() => {
    if (jobs?.length) {
      return jobs.map((job) => ({
        key: job.code,
        job,
        run: latestByCode.get(job.code) || null,
      }));
    }
    return latest.map((r) => ({
      key: r.id,
      job: { code: r.jobCode, label: r.jobCode, schedule: '', description: '', impact: '', tracked: true },
      run: r,
    }));
  }, [jobs, latest, latestByCode]);

  const trackingSummary = useMemo(() => {
    if (!jobs?.length) return null;
    const tracked = jobs.filter((j) => j.tracked).length;
    return { tracked, total: jobs.length };
  }, [jobs]);

  if (loading) {
    return <div className="card p-8 text-center text-gray-500">{t('adminHealth.cronLoading')}</div>;
  }
  if (error) return <div className="card p-8 text-red-500">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        {trackingSummary ? (
          <p className="text-sm text-gray-600 max-w-2xl">
            {t('adminHealth.cronTrackingSummary', {
              n: trackingSummary.tracked,
              total: trackingSummary.total,
            })}
          </p>
        ) : (
          <span />
        )}
        <button type="button" className="btn btn-secondary shrink-0 self-end" onClick={load}>
          <HiOutlineRefresh className="w-4 h-4 mr-2" /> {t('adminHealth.cronRefresh')}
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 font-semibold">
          {t('adminHealth.cronLatestTitle')}
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('adminHealth.colJob')}</th>
                <th>{t('adminHealth.colStarted')}</th>
                <th>{t('adminHealth.colFinished')}</th>
                <th>{t('adminHealth.colDurationMs')}</th>
                <th>{t('adminHealth.colStatus')}</th>
                <th>{t('adminHealth.colResult')}</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center text-gray-400 py-6">
                    {t('adminHealth.cronEmpty')}
                  </td>
                </tr>
              )}
              {tableRows.map(({ key, job, run }) => {
                const status = resolveRowStatus(job, run, t);
                return (
                  <tr key={key}>
                    <td className="align-top min-w-[14rem] max-w-sm">
                      <div className="font-semibold text-sm text-gray-900">
                        {job.label || job.code}
                      </div>
                      <div className="text-xs text-gray-400 mt-0.5 font-mono">
                        {job.code}
                        {job.schedule ? ` · ${job.schedule}` : ''}
                      </div>
                      {job.description ? (
                        <div
                          className="text-xs text-gray-500 mt-1 truncate"
                          title={job.description}
                        >
                          {job.description}
                        </div>
                      ) : null}
                      {showImpact(status.kind) && job.impact ? (
                        <div className="text-xs text-amber-700 mt-1.5">
                          {t('adminHealth.cronImpactPrefix')} {job.impact}
                        </div>
                      ) : null}
                    </td>
                    <td className="text-sm whitespace-nowrap align-top">
                      {run ? fmtDate(run.startedAt) : '—'}
                    </td>
                    <td className="text-sm whitespace-nowrap align-top">
                      {run ? fmtDate(run.finishedAt) : '—'}
                    </td>
                    <td className="text-sm align-top">{run?.durationMs ?? '—'}</td>
                    <td className="align-top">
                      <span className={`badge ${statusBadgeClass(status.kind)}`}>
                        {status.label}
                      </span>
                    </td>
                    <td className="text-xs text-gray-500 max-w-xs truncate align-top">
                      {run
                        ? (run.errorMessage || JSON.stringify(run.result || {}))
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 font-semibold">
          {t('adminHealth.cronRecentTitle')}
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('adminHealth.colJob')}</th>
                <th>{t('adminHealth.colTime')}</th>
                <th>{t('adminHealth.colStatus')}</th>
                <th>{t('adminHealth.colSynced')}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((r) => {
                const status = resolveRowStatus(null, r, t);
                return (
                  <tr key={r.id}>
                    <td className="font-mono text-xs">{r.jobCode}</td>
                    <td className="text-sm">{fmtDate(r.startedAt)}</td>
                    <td className="text-sm">{status.label}</td>
                    <td className="text-sm">{r.result?.synced ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default AdminCronStatusPanel;
