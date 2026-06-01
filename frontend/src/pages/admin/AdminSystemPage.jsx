import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  HiOutlineChip,
  HiOutlineClock,
  HiOutlineDatabase,
  HiOutlineExclamationCircle,
  HiOutlineRefresh,
  HiOutlineServer,
  HiOutlineTerminal,
} from 'react-icons/hi';
import adminSystemApiService from '../../features/admin/services/adminSystemApi.service';
import { useI18n } from '../../i18n';

const fmtBytes = (value) => {
  const n = Number(value || 0);
  if (n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const idx = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / (1024 ** idx)).toFixed(idx === 0 ? 0 : 1)} ${units[idx]}`;
};

const fmtPercent = (n) => `${Number(n || 0).toFixed(1)}%`;

const fmtDuration = (seconds, t) => {
  const total = Math.max(0, Math.floor(Number(seconds || 0)));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (days > 0) return t('adminSystem.durationDays', { days, hours });
  if (hours > 0) return t('adminSystem.durationHours', { hours, minutes });
  return t('adminSystem.durationMinutes', { minutes });
};

const metricTone = (value, warning, critical) => {
  if (value >= critical) return 'red';
  if (value >= warning) return 'yellow';
  return 'green';
};

const toneClass = {
  green: {
    text: 'text-emerald-700',
    bg: 'bg-emerald-50',
    bar: 'bg-emerald-500',
    border: 'border-emerald-100',
  },
  yellow: {
    text: 'text-amber-700',
    bg: 'bg-amber-50',
    bar: 'bg-amber-500',
    border: 'border-amber-100',
  },
  red: {
    text: 'text-red-700',
    bg: 'bg-red-50',
    bar: 'bg-red-500',
    border: 'border-red-100',
  },
};

const MetricCard = ({ icon: Icon, title, value, detail, percent, tone = 'green' }) => {
  const cls = toneClass[tone] || toneClass.green;
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-gray-500">{title}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
        </div>
        <div className={`${cls.bg} ${cls.border} rounded-xl border p-3`}>
          <Icon className={`h-6 w-6 ${cls.text}`} />
        </div>
      </div>
      {typeof percent === 'number' && (
        <div className="mt-4 h-2 rounded-full bg-gray-100 overflow-hidden">
          <div className={`h-full ${cls.bar}`} style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
        </div>
      )}
      {detail && <p className="mt-3 text-xs text-gray-500">{detail}</p>}
    </div>
  );
};

const AlertList = ({ alerts, t }) => {
  if (!alerts?.length) {
    return (
      <div className="card p-5 border-emerald-100 bg-emerald-50/50">
        <p className="text-sm font-semibold text-emerald-700">{t('adminSystem.noAlerts')}</p>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <h2 className="text-sm font-semibold text-gray-700 mb-3">{t('adminSystem.alerts')}</h2>
      <div className="space-y-2">
        {alerts.map((alert, index) => (
          <div
            key={`${alert.code}-${index}`}
            className={`rounded-xl border px-3 py-2 text-sm ${
              alert.level === 'critical'
                ? 'border-red-100 bg-red-50 text-red-700'
                : 'border-amber-100 bg-amber-50 text-amber-700'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              <HiOutlineExclamationCircle className="h-4 w-4" />
              {t(`adminSystem.alert.${alert.code}`)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const DockerPanel = ({ docker, t }) => (
  <div className="card p-5">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 className="text-sm font-semibold text-gray-700">{t('adminSystem.containers')}</h2>
      <span className={`badge text-xs ${docker?.available ? 'badge-success' : 'badge-gray'}`}>
        {docker?.available ? t('adminSystem.dockerConnected') : t('adminSystem.dockerNotConnected')}
      </span>
    </div>

    {!docker?.available ? (
      <p className="text-sm text-gray-500">{t('adminSystem.dockerSocketHint')}</p>
    ) : docker.containers.length === 0 ? (
      <p className="text-sm text-gray-500">{t('adminSystem.noContainers')}</p>
    ) : (
      <div className="space-y-3">
        {docker.containers.map((container) => (
          <div key={container.id} className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-gray-900">{container.name}</p>
                <p className="text-xs text-gray-500 truncate">{container.image}</p>
              </div>
              <span className={`badge text-xs ${container.state === 'running' ? 'badge-success' : 'badge-error'}`}>
                {container.state}
              </span>
            </div>
            <p className="mt-2 text-xs text-gray-500">{container.status}</p>
          </div>
        ))}
      </div>
    )}
  </div>
);

const LogsPanel = ({ activeLogService, setActiveLogService, logs, logsLoading, onRefreshLogs, t }) => (
  <div className="card overflow-hidden">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-700">{t('adminSystem.logs')}</h2>
        <p className="mt-0.5 text-xs text-gray-400">{t('adminSystem.logsDescription')}</p>
      </div>
      <div className="flex items-center gap-2">
        {['backend', 'frontend'].map((service) => (
          <button
            key={service}
            type="button"
            onClick={() => setActiveLogService(service)}
            className={`rounded-lg px-3 py-2 text-sm font-semibold ${
              activeLogService === service
                ? 'bg-orange-50 text-orange-700'
                : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            {t(`adminSystem.${service}`)}
          </button>
        ))}
        <button type="button" className="btn btn-secondary" onClick={onRefreshLogs} disabled={logsLoading}>
          <HiOutlineRefresh className="mr-2 h-4 w-4" />
          {t('adminSystem.refresh')}
        </button>
      </div>
    </div>
    <div className="p-5">
      {!logs?.available ? (
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          {t('adminSystem.logsUnavailable')}
        </div>
      ) : logs.lines.length === 0 ? (
        <p className="text-sm text-gray-400">{t('adminSystem.noLogs')}</p>
      ) : (
        <pre className="max-h-[460px] overflow-auto rounded-xl bg-slate-950 p-4 text-xs leading-relaxed text-slate-100">
          {logs.lines.join('\n')}
        </pre>
      )}
    </div>
  </div>
);

export default function AdminSystemPage() {
  const { t } = useI18n();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeLogService, setActiveLogService] = useState('backend');
  const [logs, setLogs] = useState(null);
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminSystemApiService.getOverview();
      setOverview(res.data.data);
    } catch (err) {
      setError(err?.response?.data?.message || t('adminSystem.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  const fetchLogs = useCallback(async (service = activeLogService) => {
    setLogsLoading(true);
    try {
      const res = await adminSystemApiService.getLogs(service, 200);
      setLogs(res.data.data);
    } catch {
      setLogs({ available: false, lines: [] });
    } finally {
      setLogsLoading(false);
    }
  }, [activeLogService]);

  useEffect(() => {
    fetchOverview();
    const id = setInterval(fetchOverview, 15000);
    return () => clearInterval(id);
  }, [fetchOverview]);

  useEffect(() => {
    fetchLogs(activeLogService);
  }, [activeLogService, fetchLogs]);

  const metrics = useMemo(() => {
    if (!overview) return null;
    const cpuTone = metricTone(overview.cpu?.percent, 75, 90);
    const memoryTone = metricTone(overview.memory?.percent, 85, 95);
    const diskTone = metricTone(overview.disk?.percent, 80, 90);
    return { cpuTone, memoryTone, diskTone };
  }, [overview]);

  if (loading && !overview) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 rounded-xl bg-gray-100 animate-pulse" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-40 rounded-2xl bg-gray-100 animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="card p-10 text-center">
        <p className="mb-3 text-red-500">{error}</p>
        <button type="button" className="btn btn-primary" onClick={fetchOverview}>{t('adminSystem.retry')}</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('adminSystem.title')}</h1>
          <p className="mt-1 text-gray-500">{t('adminSystem.subtitle')}</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={fetchOverview} disabled={loading}>
          <HiOutlineRefresh className="mr-2 h-4 w-4" />
          {t('adminSystem.refresh')}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <MetricCard
          icon={HiOutlineChip}
          title={t('adminSystem.cpu')}
          value={fmtPercent(overview.cpu?.percent)}
          detail={t('adminSystem.cpuDetail', {
            cores: overview.cpu?.cores || 0,
            load: Number(overview.cpu?.loadAverage?.[0] || 0).toFixed(2),
          })}
          percent={overview.cpu?.percent}
          tone={metrics.cpuTone}
        />
        <MetricCard
          icon={HiOutlineServer}
          title={t('adminSystem.memory')}
          value={fmtPercent(overview.memory?.percent)}
          detail={`${fmtBytes(overview.memory?.used)} / ${fmtBytes(overview.memory?.total)}`}
          percent={overview.memory?.percent}
          tone={metrics.memoryTone}
        />
        <MetricCard
          icon={HiOutlineDatabase}
          title={t('adminSystem.disk')}
          value={fmtPercent(overview.disk?.percent)}
          detail={`${fmtBytes(overview.disk?.used)} / ${fmtBytes(overview.disk?.total)}`}
          percent={overview.disk?.percent}
          tone={metrics.diskTone}
        />
        <MetricCard
          icon={HiOutlineClock}
          title={t('adminSystem.uptime')}
          value={fmtDuration(overview.host?.uptime, t)}
          detail={t('adminSystem.processUptime', { uptime: fmtDuration(overview.process?.uptime, t) })}
          tone="green"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <MetricCard
          icon={HiOutlineTerminal}
          title={t('adminSystem.networkIn')}
          value={`${fmtBytes(overview.network?.rxRate)}/s`}
          detail={t('adminSystem.networkTotal', { total: fmtBytes(overview.network?.rxBytes) })}
          tone="green"
        />
        <MetricCard
          icon={HiOutlineTerminal}
          title={t('adminSystem.networkOut')}
          value={`${fmtBytes(overview.network?.txRate)}/s`}
          detail={t('adminSystem.networkTotal', { total: fmtBytes(overview.network?.txBytes) })}
          tone="green"
        />
        <AlertList alerts={overview.alerts} t={t} />
      </div>

      <DockerPanel docker={overview.docker} t={t} />

      <LogsPanel
        activeLogService={activeLogService}
        setActiveLogService={setActiveLogService}
        logs={logs}
        logsLoading={logsLoading}
        onRefreshLogs={() => fetchLogs(activeLogService)}
        t={t}
      />
    </div>
  );
}
