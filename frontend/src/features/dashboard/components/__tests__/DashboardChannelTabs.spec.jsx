import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import viTranslations from '../../../../i18n/vi';
import enTranslations from '../../../../i18n/en';
import { getChannelEngagementInsightForChannel } from '../../utils/dashboardInsightStorage.util';
import DashboardChannelTabs from '../DashboardChannelTabs';
import { buildChartConfig, buildChannelTabs } from '../../utils/channelChartConfig';

// PLAN_TG_WA_DAY_DU_2026-09-29, P2 bước 5 — biểu đồ tương tác theo ngày có tab + đường Telegram/WhatsApp
// (BE timeline đã trả telegramSent/whatsappSent từ campaign_channel_messages).

const mockT = (key) => {
  const val = viTranslations.dashboardChannelTabs[key];
  return typeof val === 'string' ? val : key;
};

vi.mock('../../../../i18n', () => ({
  useI18n: (ns) => (ns ? mockT : { locale: 'vi', t: mockT }),
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  Line: ({ dataKey }) => <div data-testid={`line-${dataKey}`} />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  CartesianGrid: () => null,
}));

const timelineWith = (extra = {}) => [
  { date: '2026-09-27', emailSent: 4, zaloSent: 2, telegramSent: 0, whatsappSent: 0, ...extra },
  { date: '2026-09-28', emailSent: 1, zaloSent: 0, telegramSent: 0, whatsappSent: 0, ...extra },
];

describe('buildChartConfig — Telegram/WhatsApp', () => {
  it('tab telegram chỉ có đường telegramSent, tab whatsapp chỉ có whatsappSent', () => {
    expect(buildChartConfig('telegram', mockT).map((l) => l.key)).toEqual(['telegramSent']);
    expect(buildChartConfig('whatsapp', mockT).map((l) => l.key)).toEqual(['whatsappSent']);
  });

  it('"Tất cả": chỉ thêm đường TG/WA khi có dữ liệu', () => {
    const none = buildChartConfig('all', mockT).map((l) => l.key);
    expect(none).not.toContain('telegramSent');
    expect(none).not.toContain('whatsappSent');
    const both = buildChartConfig('all', mockT, { hasTelegram: true, hasWhatsapp: true }).map((l) => l.key);
    expect(both).toEqual(expect.arrayContaining(['telegramSent', 'whatsappSent']));
  });
});

describe('buildChannelTabs', () => {
  it('không dữ liệu TG/WA -> 4 tab cũ', () => {
    const ids = buildChannelTabs({ hasTelegram: false, hasWhatsapp: false, activeChannel: 'all', t: mockT }).map((x) => x.id);
    expect(ids).toEqual(['all', 'email', 'zalo', 'zalo_group']);
  });

  it('có dữ liệu -> thêm tab; tab đang chọn không biến mất khi hết dữ liệu', () => {
    const withData = buildChannelTabs({ hasTelegram: true, hasWhatsapp: true, activeChannel: 'all', t: mockT }).map((x) => x.id);
    expect(withData).toEqual(['all', 'email', 'zalo', 'zalo_group', 'telegram', 'whatsapp']);
    const stillActive = buildChannelTabs({ hasTelegram: false, hasWhatsapp: false, activeChannel: 'telegram', t: mockT }).map((x) => x.id);
    expect(stillActive).toContain('telegram');
    expect(stillActive).not.toContain('whatsapp');
  });
});

describe('DashboardChannelTabs — render', () => {
  it('timeline có tin Telegram -> hiện tab Telegram, không hiện tab WhatsApp', () => {
    render(
      <DashboardChannelTabs
        activeChannel="all"
        onChangeChannel={() => {}}
        analytics={{ timeline: timelineWith({ telegramSent: 3 }).map((r, i) => (i === 0 ? r : { ...r, telegramSent: 0 })) }}
      />
    );
    expect(screen.getByRole('button', { name: 'Telegram' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'WhatsApp' })).not.toBeInTheDocument();
    expect(screen.getByTestId('line-telegramSent')).toBeInTheDocument();
    expect(screen.queryByTestId('line-whatsappSent')).not.toBeInTheDocument();
  });

  it('tab WhatsApp đang chọn -> chỉ vẽ đường whatsappSent', () => {
    render(
      <DashboardChannelTabs
        activeChannel="whatsapp"
        onChangeChannel={() => {}}
        analytics={{ timeline: [{ date: '2026-09-27', whatsappSent: 5 }] }}
      />
    );
    expect(screen.getByTestId('line-whatsappSent')).toBeInTheDocument();
    expect(screen.queryByTestId('line-emailSent')).not.toBeInTheDocument();
  });

  it('không có dữ liệu kênh -> không có tab TG/WA (khách không dùng không bị làm rối)', () => {
    render(<DashboardChannelTabs activeChannel="all" onChangeChannel={() => {}} analytics={{ timeline: timelineWith() }} />);
    expect(screen.queryByRole('button', { name: 'Telegram' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'WhatsApp' })).not.toBeInTheDocument();
  });
});

describe('insight theo kênh — Telegram/WhatsApp không mượn insight "Tất cả"', () => {
  const charts = { channelEngagement: { all: 'insight tổng', email: 'insight email' } };
  it('telegram/whatsapp -> chuỗi rỗng; kênh khác giữ nguyên', () => {
    expect(getChannelEngagementInsightForChannel(charts, 'telegram')).toBe('');
    expect(getChannelEngagementInsightForChannel(charts, 'whatsapp')).toBe('');
    expect(getChannelEngagementInsightForChannel(charts, 'email')).toBe('insight email');
    expect(getChannelEngagementInsightForChannel(charts, 'all')).toBe('insight tổng');
  });
});

describe('i18n dashboardChannelTabs — khoá mới có ở CẢ vi và en', () => {
  it.each(['telegram', 'whatsapp', 'telegramEffectiveness', 'whatsappEffectiveness', 'sentOnlyForChannel'])('%s', (key) => {
    expect(typeof viTranslations.dashboardChannelTabs[key]).toBe('string');
    expect(typeof enTranslations.dashboardChannelTabs[key]).toBe('string');
  });
});
