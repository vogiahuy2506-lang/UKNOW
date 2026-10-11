import { useCallback, useEffect, useState } from 'react';
import { HiOutlineBell, HiOutlineCheck, HiOutlineRefresh } from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import adminAlertsApiService from '../../features/admin/services/adminAlertsApi.service';
import { useI18n } from '../../i18n';

const fmtDate = (d, locale) => (d ? new Date(d).toLocaleString(locale === 'en' ? 'en-US' : 'vi-VN') : '—');

const AdminAlertsPage = () => {
  const { t, locale } = useI18n();
  const [rules, setRules] = useState([]);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminAlertsApiService.getOverview();
      const data = res?.data?.data || res?.data || {};
      setRules(data.rules || []);
      setEvents(data.events || []);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || t('adminAlerts.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);

  const toggleRule = async (rule) => {
    setBusyId(rule.id);
    try {
      await adminAlertsApiService.updateRule(rule.id, { enabled: !rule.enabled });
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setBusyId(null);
    }
  };

  const resolve = async (eventId) => {
    setBusyId(eventId);
    try {
      await adminAlertsApiService.resolveEvent(eventId);
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setBusyId(null);
    }
  };

  const runNow = async () => {
    setBusyId('eval');
    try {
      await adminAlertsApiService.evaluateNow();
      await load();
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (loading) {
    return <div className="card p-10 text-center text-gray-500 dark:text-dk-text2 dark:bg-dk-surface dark:border-dk-border">{t('adminAlerts.loading')}</div>;
  }

  return (
    <PageContainer
      title={t('adminAlerts.title')}
      subtitle={t('adminAlerts.subtitle')}
      icon={HiOutlineBell}
      actions={
        <div className="flex gap-2">
          <button type="button" className="btn btn-secondary" onClick={load}>
            <HiOutlineRefresh className="w-4 h-4 mr-2" /> {t('adminAlerts.refresh')}
          </button>
          <button type="button" className="btn btn-primary" onClick={runNow} disabled={busyId === 'eval'}>
            {t('adminAlerts.evaluateNow')}
          </button>
        </div>
      }
    >

      {error && <div className="card p-4 text-red-600 dark:text-rose-400 dark:bg-rose-950/20 dark:border-rose-900/40 text-sm">{error}</div>}

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-dk-border">
          <h2 className="font-semibold text-gray-800 dark:text-dk-text">{t('adminAlerts.rulesTitle')}</h2>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('adminAlerts.colCode')}</th>
                <th>{t('adminAlerts.colName')}</th>
                <th>{t('adminAlerts.colThreshold')}</th>
                <th>{t('adminAlerts.colWindow')}</th>
                <th>{t('adminAlerts.colSeverity')}</th>
                <th>{t('adminAlerts.colChannel')}</th>
                <th>{t('adminAlerts.colToggle')}</th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r) => (
                <tr key={r.id}>
                  <td className="text-xs font-mono text-gray-500 dark:text-dk-text2">{r.code}</td>
                  <td>
                    <div className="font-medium text-gray-800 dark:text-dk-text">
                      {t(`adminAlerts.rules.${r.code}.name`, r.name)}
                    </div>
                    <div className="text-xs text-gray-400 dark:text-dk-text2 max-w-md">
                      {t(`adminAlerts.rules.${r.code}.desc`, r.description)}
                    </div>
                  </td>
                  <td className="text-sm dark:text-dk-text">{r.thresholdValue ?? '—'}</td>
                  <td className="text-sm dark:text-dk-text">{r.windowMinutes ? `${r.windowMinutes}p` : '—'}</td>
                  <td>
                    {/* `badge-danger` không có trong index.css nên mức "critical" không có màu; lớp đúng là badge-error (C-15). */}
                    <span className={`badge ${r.severity === 'critical' ? 'badge-error' : 'badge-warning'}`}>
                      {r.severity}
                    </span>
                  </td>
                  <td className="text-sm dark:text-dk-text">{r.channel}</td>
                  <td>
                    <button
                      type="button"
                      className={`btn btn-sm ${r.enabled ? 'btn-primary' : 'btn-secondary'}`}
                      disabled={busyId === r.id}
                      onClick={() => toggleRule(r)}
                    >
                      {r.enabled ? t('adminAlerts.enable') : t('adminAlerts.disable')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 dark:border-dk-border">
          <h2 className="font-semibold text-gray-800 dark:text-dk-text">{t('adminAlerts.historyTitle')}</h2>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('adminAlerts.colTime')}</th>
                <th>{t('adminAlerts.colRule')}</th>
                <th>{t('adminAlerts.colValue')}</th>
                <th>{t('adminAlerts.colMessage')}</th>
                <th>{t('adminAlerts.colStatus')}</th>
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr><td colSpan={5} className="text-center text-gray-400 dark:text-dk-muted py-8">{t('adminAlerts.noEvents')}</td></tr>
              )}
              {events.map((e) => (
                <tr key={e.id}>
                  <td className="text-sm whitespace-nowrap dark:text-dk-text">{fmtDate(e.firedAt, locale)}</td>
                  <td className="text-sm font-medium dark:text-dk-text">
                    {e.ruleCode ? t(`adminAlerts.rules.${e.ruleCode}.name`, e.ruleName) : e.ruleName}
                  </td>
                  <td className="text-sm dark:text-dk-text">{e.measuredValue ?? '—'}</td>
                  <td className="text-sm text-gray-600 dark:text-dk-text max-w-lg">{e.message}</td>
                  <td>
                    {e.resolved ? (
                      <span className="badge badge-success">{t('adminAlerts.resolved')}</span>
                    ) : (
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        disabled={busyId === e.id}
                        onClick={() => resolve(e.id)}
                      >
                        <HiOutlineCheck className="w-4 h-4 mr-1" /> {t('adminAlerts.markResolved')}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
};

export default AdminAlertsPage;
