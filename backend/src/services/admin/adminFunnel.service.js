import {
  getFunnelSteps,
  getFunnelCohorts,
  FUNNEL_DATA_SINCE,
} from '../../repositories/admin/adminFunnel.repository.js';

export async function getFunnelOverview({ since } = {}) {
  const dataSince = since || FUNNEL_DATA_SINCE;
  const [steps, cohorts] = await Promise.all([
    getFunnelSteps({ since: dataSince }),
    getFunnelCohorts({ since: dataSince }),
  ]);

  const registered = Number(steps.registered || 0) || 1;
  const pct = (n) => Math.round((Number(n || 0) / registered) * 1000) / 10;

  return {
    dataSince,
    steps: {
      registered: Number(steps.registered || 0),
      channelConnected: Number(steps.channelConnected || 0),
      campaignCreated: Number(steps.campaignCreated || 0),
      campaignRunStarted: Number(steps.campaignRunStarted || 0),
      paid: Number(steps.paid || 0),
    },
    conversionFromRegistered: {
      channelConnected: pct(steps.channelConnected),
      campaignCreated: pct(steps.campaignCreated),
      campaignRunStarted: pct(steps.campaignRunStarted),
      paid: pct(steps.paid),
    },
    cohorts,
    note: 'Dữ liệu funnel từ audit_logs (migration 040+) và orders. Bước nối kênh cần EMAIL/ZALO_ACCOUNT_CONNECTED đã ghi từ PR1.',
  };
}
