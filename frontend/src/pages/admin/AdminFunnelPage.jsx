import { useCallback, useEffect, useState } from 'react';
import { HiOutlineFilter, HiOutlineRefresh } from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import adminFunnelApiService from '../../features/admin/services/adminFunnelApi.service';
import { useI18n } from '../../i18n';

// Bốn bước theo thứ tự — khoá trùng với API (adminFunnel.service.js FUNNEL_STEP_KEYS).
const STEP_KEYS = ['registered', 'channelConnected', 'firstSend', 'paid'];

const fmtNumber = (v) => Number(v || 0).toLocaleString('vi-VN');
const fmtOrDash = (v, suffix = '') => (
  v == null || Number.isNaN(Number(v))
    ? '—'
    : `${Number(v).toLocaleString('vi-VN')}${suffix}`
);
// 'YYYY-MM-DD' → 'DD/MM/YYYY' bằng cắt chuỗi (không dựng Date: tránh lùi một ngày do múi giờ).
const ymdToVn = (value) => (value ? String(value).split('-').reverse().join('/') : '');

const AdminFunnelPage = () => {
  const { t } = useI18n();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await adminFunnelApiService.getOverview();
      setData(res?.data?.data || res?.data || null);
    } catch (err) {
      setError(err?.response?.data?.message || err.message || t('adminFunnel.loadFailed'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- t đổi khi đổi ngôn ngữ, không cần tải lại số liệu
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="card p-10 text-center text-gray-500">{t('adminFunnel.loading')}</div>;
  if (error) {
    return (
      <div className="card p-10 text-center">
        <p className="text-red-500 mb-3">{error}</p>
        <button type="button" className="btn btn-primary" onClick={load}>{t('adminFunnel.retry')}</button>
      </div>
    );
  }

  const steps = data?.steps || [];
  const ttf = data?.timeToFirstSend || {};
  const cohorts = data?.cohorts || [];

  return (
    <PageContainer
      title="Phễu kích hoạt"
      subtitle={
        <div>
          <span>Đăng ký → nối kênh → tạo chiến dịch → chạy → trả tiền.</span>
          {data?.dataSince && (
            <span className="block text-xs text-amber-700 mt-1">
              Dữ liệu từ {data.dataSince}. {data.note}
            </span>
          )}
        </div>
      }
      icon={HiOutlineFilter}
      actions={
        <button type="button" className="btn btn-secondary" onClick={load}>
          <HiOutlineRefresh className="w-4 h-4 mr-2" /> Làm mới
        </button>
      }
    >

      <p className="text-sm text-gray-500" data-testid="funnel-scope">
        {t('adminFunnel.scopeNote', { since: ymdToVn(data?.since) })}
      </p>

      {/* Bốn bước: mỗi bước là tập con của bước trước */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        {steps.map((s) => (
          <div key={s.key} className="card p-4" data-testid={`funnel-step-${s.key}`}>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{t(`adminFunnel.steps.${s.key}`)}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{fmtNumber(s.count)}</p>
            {s.pctOfPrevious == null ? (
              <p className="text-xs text-gray-400 mt-1">{t('adminFunnel.firstStepHint')}</p>
            ) : (
              <>
                <p className="text-xs text-gray-700 mt-1 font-medium">
                  {t('adminFunnel.pctOfPrevious', { pct: fmtNumber(s.pctOfPrevious) })}
                </p>
                <p className="text-xs text-gray-400">{t('adminFunnel.lost', { n: fmtNumber(s.lost) })}</p>
              </>
            )}
            <p className="text-[11px] text-gray-400 mt-2">{t(`adminFunnel.stepHints.${s.key}`)}</p>
          </div>
        ))}
      </div>

      {Number(data?.paidWithoutSend) > 0 && (
        <p className="text-xs text-amber-700" data-testid="funnel-paid-without-send">
          {t('adminFunnel.paidWithoutSend', { n: fmtNumber(data.paidWithoutSend) })}
        </p>
      )}

      <div className="card p-5">
        <div className="mb-4">
          <h2 className="font-semibold text-gray-800">{t('adminFunnel.ttf.title')}</h2>
          <p className="text-xs text-gray-500 mt-1">{t('adminFunnel.ttf.description')}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{t('adminFunnel.ttf.median')}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">
              {ttf.medianMinutes == null ? '—' : t('adminFunnel.ttf.minutes', { n: fmtNumber(ttf.medianMinutes) })}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{t('adminFunnel.ttf.under10')}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{fmtOrDash(ttf.pctUnder10, '%')}</p>
            <p className="text-[11px] text-gray-400 mt-1">{t('adminFunnel.ttf.under10Hint')}</p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{t('adminFunnel.ttf.sent')}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{fmtNumber(ttf.sentCount)}</p>
            <p className="text-[11px] text-gray-400 mt-1">
              {t('adminFunnel.ttf.sentOf', { sent: fmtNumber(ttf.sentCount), total: fmtNumber(ttf.totalCustomers) })}
            </p>
          </div>
          <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-xs text-gray-500 uppercase tracking-wide">{t('adminFunnel.ttf.notSent7d')}</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{fmtOrDash(ttf.pctNotSentAfter7d, '%')}</p>
            <p className="text-[11px] text-gray-400 mt-1">
              {t('adminFunnel.ttf.notSentOf', { n: fmtNumber(ttf.notSentAfter7d), eligible: fmtNumber(ttf.eligibleAfter7d) })}
            </p>
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-800">{t('adminFunnel.cohort.title')}</h2>
        </div>
        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>{t('adminFunnel.cohort.month')}</th>
                {STEP_KEYS.map((key) => (
                  <th key={key} className="text-right">{t(`adminFunnel.steps.${key}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {cohorts.length === 0 && (
                <tr><td colSpan={STEP_KEYS.length + 1} className="text-center text-gray-400 py-8">{t('adminFunnel.cohort.empty')}</td></tr>
              )}
              {cohorts.map((c) => (
                <tr key={c.cohortKey}>
                  <td className="font-medium">{c.cohort}</td>
                  {STEP_KEYS.map((key) => (
                    <td key={key} className="text-right">
                      {fmtNumber(c[key])}
                      {key !== 'registered' && c.registered > 0 && (
                        <span className="text-xs text-gray-400 ml-1">
                          ({fmtNumber(Math.round((c[key] / c.registered) * 100))}%)
                        </span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
};

export default AdminFunnelPage;
