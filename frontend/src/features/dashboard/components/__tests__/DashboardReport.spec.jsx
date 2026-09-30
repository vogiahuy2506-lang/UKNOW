import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import viTranslations from '../../../../i18n/vi';
import enTranslations from '../../../../i18n/en';
import { getChannelEngagementInsightForChannel } from '../../utils/dashboardInsightStorage.util';
import DashboardKpiCards from '../DashboardKpiCards';
import DashboardSentChart from '../DashboardSentChart';
import DashboardCampaignsTable from '../DashboardCampaignsTable';
import DashboardReportLinks from '../DashboardReportLinks';

// PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-5 — 4 thẻ + biểu đồ "Đã gửi mỗi ngày" + bảng "Chiến dịch trong kỳ".
// Từ điển THẬT (vi) để kiểm đúng chữ người dùng thấy; recharts giả để đọc được các cột được vẽ.

vi.mock('../../../../i18n', async () => (await import('../../../../test/realI18n.js')).realI18nModule());

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  BarChart: ({ children, data }) => <div data-testid="bar-chart" data-rows={data.length}>{children}</div>,
  Bar: ({ dataKey, name, stackId }) => <div data-testid={`bar-${dataKey}`} data-name={name} data-stack={stackId} />,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  Legend: () => null,
  CartesianGrid: () => null,
}));

/** Cùng bộ số với integration test (dashboardReport.test.js): 15 tin đã gửi, 4 lời mời kết bạn, 3 chưa gửi được… */
const overview = (patch = {}) => ({
  sent: {
    total: 15,
    byChannel: [
      { channel: 'email', sent: 8 },
      { channel: 'zalo_personal', sent: 3 },
      { channel: 'zalo_group', sent: 2 },
      { channel: 'telegram', sent: 2 },
      { channel: 'whatsapp', sent: 0 },
    ],
    friendRequests: 4,
  },
  failed: { total: 3 },
  email: { sent: 8, opened: 3, clicked: 1, openRate: 37.5, clickRate: 12.5 },
  clicks: { total: 2, byChannel: [{ channel: 'email', clicked: 1 }, { channel: 'zalo_personal', clicked: 1 }] },
  orders: {
    completed: 4,
    pending: 4,
    byChannel: [
      { channel: 'email', completed: 2, pending: 1 },
      { channel: 'zalo_personal', completed: 1, pending: 2 },
      { channel: 'other', completed: 1, pending: 1 },
    ],
  },
  ...patch,
});

const renderCards = (data) => render(<MemoryRouter><DashboardKpiCards overview={data} /></MemoryRouter>);

describe('DashboardKpiCards — 4 thẻ', () => {
  it('đủ 4 thẻ, nhãn mới: Đã gửi · Chưa gửi được · Email đã mở / đã bấm link · Khách phản hồi (Để lại thông tin | Đã mua)', () => {
    renderCards(overview());
    expect(screen.getByTestId('kpi-sent')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-failed')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-email')).toBeInTheDocument();
    expect(screen.getByTestId('kpi-customers')).toBeInTheDocument();
    expect(within(screen.getByTestId('dashboard-kpi-cards')).getAllByTestId(/^kpi-(sent|failed|email|customers)$/)).toHaveLength(4);

    expect(screen.getByTestId('kpi-sent')).toHaveTextContent('Đã gửi');
    expect(screen.getByTestId('kpi-failed')).toHaveTextContent('Chưa gửi được');
    expect(screen.getByTestId('kpi-email')).toHaveTextContent('Email đã mở');
    expect(screen.getByTestId('kpi-email')).toHaveTextContent('Email đã bấm link');
    expect(screen.getByTestId('kpi-customers')).toHaveTextContent('Khách phản hồi');
    expect(screen.getByTestId('kpi-customers')).toHaveTextContent('Để lại thông tin');
    expect(screen.getByTestId('kpi-customers')).toHaveTextContent('Đã mua');
  });

  it('nhãn cũ đã bỏ: Tổng gửi / Tổng chiến dịch / Tỷ lệ mở Email / Tỷ lệ click / Đơn chờ / Đơn đã mua', () => {
    renderCards(overview());
    const text = screen.getByTestId('dashboard-kpi-cards').textContent;
    for (const old of ['Tổng gửi', 'Tổng chiến dịch', 'Tỷ lệ mở', 'Tỷ lệ click', 'Đơn chờ', 'Đơn đã mua']) {
      expect(text).not.toContain(old);
    }
  });

  it('Đã gửi: số tổng, chip chỉ kênh > 0 (WhatsApp = 0 không hiện), lời mời kết bạn là dòng riêng', () => {
    renderCards(overview());
    const card = screen.getByTestId('kpi-sent');
    expect(card).toHaveTextContent('15');
    expect(within(card).getByTestId('chip-email')).toHaveTextContent('Email8');
    expect(within(card).getByTestId('chip-zalo_personal')).toHaveTextContent('Zalo cá nhân3');
    expect(within(card).getByTestId('chip-zalo_group')).toHaveTextContent('Zalo nhóm2');
    expect(within(card).getByTestId('chip-telegram')).toHaveTextContent('Telegram2');
    expect(within(card).queryByTestId('chip-whatsapp')).not.toBeInTheDocument();
    expect(within(card).queryByTestId('chip-zalo_friend_request')).not.toBeInTheDocument();
    expect(within(card).getByTestId('kpi-friend-requests')).toHaveTextContent('+ 4 lời mời kết bạn');
  });

  it('không có lời mời kết bạn -> không hiện dòng "+ n lời mời kết bạn"', () => {
    renderCards(overview({ sent: { total: 2, byChannel: [{ channel: 'email', sent: 2 }], friendRequests: 0 } }));
    expect(screen.queryByTestId('kpi-friend-requests')).not.toBeInTheDocument();
  });

  it('Chưa gửi được: số + "tính theo người nhận"', () => {
    renderCards(overview());
    const card = screen.getByTestId('kpi-failed');
    expect(card).toHaveTextContent('3');
    expect(card).toHaveTextContent('Tính theo người nhận');
  });

  it('Email: hai % trên số thư đã gửi trong kỳ (≤ 100%), kèm mẫu số', () => {
    renderCards(overview());
    const card = screen.getByTestId('kpi-email');
    expect(card).toHaveTextContent('37,5%');
    expect(card).toHaveTextContent('12,5%');
    expect(card).toHaveTextContent('Tính trên 8 thư đã gửi trong kỳ');
    expect(screen.getByTestId('kpi-clicks-total')).toHaveTextContent('Lượt nhấp link ở mọi kênh: 2');
  });

  it('thẻ Email ẨN khi kỳ không có thư nào (còn 3 thẻ) — không hiện "0%" vô nghĩa', () => {
    renderCards(overview({
      sent: { total: 3, byChannel: [{ channel: 'zalo_personal', sent: 3 }], friendRequests: 0 },
      email: { sent: 0, opened: 0, clicked: 0, openRate: 0, clickRate: 0 },
    }));
    expect(screen.queryByTestId('kpi-email')).not.toBeInTheDocument();
    expect(screen.getAllByTestId(/^kpi-(sent|failed|email|customers)$/)).toHaveLength(3);
    expect(screen.getByTestId('dashboard-kpi-cards').textContent).not.toContain('Email đã mở');
  });

  it('Khách phản hồi: một nguồn — số tổng = cộng các dòng theo kênh', () => {
    renderCards(overview());
    const card = screen.getByTestId('kpi-customers');
    const byChannel = within(card).getByTestId('kpi-customers-by-channel');
    // Để lại thông tin 4 = Email 1 + Zalo cá nhân 2 + Khác 1; Đã mua 4 = Email 2 + Zalo cá nhân 1 + Khác 1.
    expect(byChannel).toHaveTextContent('Để lại thông tin: Email 1 · Zalo cá nhân 2 · Khác 1');
    expect(byChannel).toHaveTextContent('Đã mua: Email 2 · Zalo cá nhân 1 · Khác 1');
    expect(card).toHaveTextContent('4');
  });

  it('chưa có dữ liệu (overview null) -> vẫn dựng đủ thẻ với số 0 và gợi ý trống, không vỡ', () => {
    renderCards(null);
    expect(screen.getByTestId('kpi-sent')).toHaveTextContent('Chạy chiến dịch để gửi');
    expect(screen.getByTestId('kpi-failed')).toHaveTextContent('0');
    expect(screen.queryByTestId('kpi-email')).not.toBeInTheDocument();
    expect(screen.getByTestId('kpi-customers')).toHaveTextContent('Chưa có khách để lại thông tin hoặc mua hàng');
  });
});

describe('DashboardSentChart — "Đã gửi mỗi ngày"', () => {
  const days = [
    { date: '2026-09-28', total: 5, email: 5, zalo_personal: 0, zalo_group: 0, telegram: 0, whatsapp: 0 },
    { date: '2026-09-29', total: 0, email: 0, zalo_personal: 0, zalo_group: 0, telegram: 0, whatsapp: 0 },
    { date: '2026-09-30', total: 6, email: 3, zalo_personal: 3, zalo_group: 0, telegram: 0, whatsapp: 0 },
  ];

  it('MỘT biểu đồ cột chồng: chỉ vẽ kênh có tin trong khoảng, cùng một stackId', () => {
    render(<DashboardSentChart dailySent={days} />);
    expect(screen.getByText('Đã gửi mỗi ngày')).toBeInTheDocument();
    expect(screen.getAllByTestId('bar-chart')).toHaveLength(1);
    expect(screen.getByTestId('bar-chart')).toHaveAttribute('data-rows', '3');
    expect(screen.getByTestId('bar-email')).toHaveAttribute('data-name', 'Email');
    expect(screen.getByTestId('bar-email')).toHaveAttribute('data-stack', 'sent');
    expect(screen.getByTestId('bar-zalo_personal')).toHaveAttribute('data-stack', 'sent');
    for (const absent of ['bar-zalo_group', 'bar-telegram', 'bar-whatsapp', 'bar-zalo_friend_request']) {
      expect(screen.queryByTestId(absent)).not.toBeInTheDocument();
    }
  });

  it('khoảng không có tin nào -> trạng thái trống, không có biểu đồ', () => {
    render(<DashboardSentChart dailySent={days.map((row) => ({ ...row, total: 0, email: 0, zalo_personal: 0 }))} />);
    expect(screen.getByText('Chưa có tin nào được gửi trong khoảng thời gian này')).toBeInTheDocument();
    expect(screen.queryByTestId('bar-chart')).not.toBeInTheDocument();
  });

  it('xem theo tháng: gộp các ngày cùng tháng thành một cột', () => {
    render(<DashboardSentChart dailySent={days} isMonthlyView />);
    expect(screen.getByTestId('bar-chart')).toHaveAttribute('data-rows', '1');
  });

  it('không có biểu đồ đơn / donut / tab kênh cũ', () => {
    render(<DashboardSentChart dailySent={days} />);
    expect(screen.queryByRole('button', { name: 'Tất cả' })).not.toBeInTheDocument();
    expect(screen.queryByText(/Cơ cấu/)).not.toBeInTheDocument();
  });
});

describe('DashboardCampaignsTable — "Chiến dịch trong kỳ"', () => {
  const rows = [
    { campaignId: 1, campaignName: 'CA Email', campaignType: 'email', sent: 8, failed: 1, opened: 3, clicked: 1, purchased: 2 },
    { campaignId: 2, campaignName: null, campaignType: 'mixed', sent: 4, failed: 0, opened: 0, clicked: 0, purchased: 0 },
    { campaignId: null, campaignName: null, campaignType: null, sent: 2, failed: 0, opened: 0, clicked: 0, purchased: 0 },
  ];

  it('6 cột: Chiến dịch · Đã gửi · Chưa gửi được · Mở · Nhấp · Đã mua', () => {
    render(<DashboardCampaignsTable campaigns={rows} />);
    const headers = screen.getAllByRole('columnheader').map((th) => th.textContent);
    expect(headers).toEqual(['Chiến dịch', 'Đã gửi', 'Chưa gửi được', 'Mở', 'Nhấp', 'Đã mua']);
  });

  it('mỗi dòng đúng số; chiến dịch thiếu tên -> "Chiến dịch #id"; chiến dịch đã xóa -> nhãn riêng; loại chiến dịch có nhãn', () => {
    render(<DashboardCampaignsTable campaigns={rows} />);
    const bodyRows = screen.getAllByTestId('campaign-row');
    expect(bodyRows).toHaveLength(3);
    expect(bodyRows[0]).toHaveTextContent('CA Email');
    expect(bodyRows[0]).toHaveTextContent('Email');
    expect(within(bodyRows[0]).getAllByRole('cell').map((td) => td.textContent.replace(/Email$/, '').trim())).toEqual(
      expect.arrayContaining(['8', '1', '3', '2'])
    );
    expect(bodyRows[1]).toHaveTextContent('Chiến dịch #2');
    expect(bodyRows[1]).toHaveTextContent('Đa kênh');
    expect(bodyRows[2]).toHaveTextContent('Chiến dịch đã xóa');
  });

  it('không có chiến dịch nào -> trạng thái trống, không có bảng rỗng', () => {
    render(<DashboardCampaignsTable campaigns={[]} />);
    expect(screen.getByText('Chưa có chiến dịch nào gửi tin trong khoảng thời gian này')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});

describe('DashboardReportLinks — thay bảng lượt chạy và bảng landing', () => {
  it('link tới Giám sát gửi tin và trang Landing page', () => {
    render(<MemoryRouter><DashboardReportLinks /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /Xem lượt chạy ở Giám sát gửi tin/ })).toHaveAttribute('href', '/app/delivery-monitor');
    expect(screen.getByRole('link', { name: /Xem thống kê landing/ })).toHaveAttribute('href', '/app/settings/landing-pages');
  });

  it('mỗi link chỉ hiện khi người xem có quyền mở trang đích; không quyền nào thì không render gì', () => {
    const { rerender, container } = render(<MemoryRouter><DashboardReportLinks showDeliveryMonitor={false} /></MemoryRouter>);
    expect(screen.queryByRole('link', { name: /Giám sát gửi tin/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Xem thống kê landing/ })).toBeInTheDocument();
    rerender(<MemoryRouter><DashboardReportLinks showDeliveryMonitor={false} showLanding={false} /></MemoryRouter>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('insight biểu đồ "Đã gửi mỗi ngày" — chỉ có phần "Tất cả"', () => {
  const charts = { channelEngagement: { all: 'insight tổng', email: 'insight email' } };
  it('all -> insight; telegram/whatsapp không mượn insight "Tất cả"', () => {
    expect(getChannelEngagementInsightForChannel(charts, 'all')).toBe('insight tổng');
    expect(getChannelEngagementInsightForChannel(charts, 'telegram')).toBe('');
    expect(getChannelEngagementInsightForChannel(charts, 'whatsapp')).toBe('');
  });
});

describe('i18n dashboardReport — đủ khoá ở CẢ vi và en, khoá kênh khớp với module đếm tin', () => {
  const leaves = (obj, prefix = '', out = []) => {
    for (const [k, v] of Object.entries(obj ?? {})) {
      const key = prefix ? `${prefix}.${k}` : k;
      if (v && typeof v === 'object') leaves(v, key, out);
      else out.push(key);
    }
    return out;
  };

  it('cùng bộ khoá', () => {
    const vi = leaves(viTranslations.dashboardReport).sort();
    const en = leaves(enTranslations.dashboardReport).sort();
    expect(vi.length).toBeGreaterThan(30);
    expect(en).toEqual(vi);
  });

  it.each(['email', 'zalo_personal', 'zalo_group', 'telegram', 'whatsapp', 'other'])('nhãn kênh %s', (channel) => {
    expect(typeof viTranslations.dashboardReport.channel[channel]).toBe('string');
    expect(typeof enTranslations.dashboardReport.channel[channel]).toBe('string');
  });
});
