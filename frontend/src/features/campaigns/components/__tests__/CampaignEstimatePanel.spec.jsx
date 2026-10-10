/**
 * PR-3 ước tính thời gian gửi — khối hiển thị dùng chung (hộp Chạy / hộp Đặt lịch / thẻ xác nhận AI).
 * Ví dụ chiến dịch 438: 798 SĐT, 1 nick, 3 ngày — hình dạng dữ liệu theo hợp đồng API thật.
 */
import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import CampaignEstimatePanel from '../CampaignEstimatePanel';
import { ESTIMATE_438 } from '../../utils/__tests__/campaignEstimate.fixtures';
import viDict from '../../../../i18n/vi';
import enDict from '../../../../i18n/en';

const makeT = (dict) => (key, params = {}) => {
  let current = dict;
  for (const part of key.split('.')) current = current?.[part];
  const text = typeof current === 'string' ? current : key;
  return text.replace(/\{(\w+)\}/g, (_, name) => (params[name] !== undefined ? String(params[name]) : `{${name}}`));
};

describe('CampaignEstimatePanel', () => {
  it('chiến dịch 438: số chính là finishAtLatest (08/10 21:25) kèm "khoảng 4 ngày"; khoảng nhanh–chậm ở dòng nhỏ', () => {
    render(<CampaignEstimatePanel status="ready" estimate={ESTIMATE_438} t={makeT(viDict)} />);

    expect(screen.getByTestId('campaign-estimate-finish')).toHaveTextContent('08/10/2026 21:25');
    expect(screen.getByTestId('campaign-estimate-finish')).not.toHaveTextContent('07/10/2026 07:25');
    expect(screen.getByTestId('campaign-estimate-finish').parentElement).toHaveTextContent('(khoảng 4 ngày)');
    expect(screen.getByTestId('campaign-estimate-range')).toHaveTextContent('07/10/2026 07:25 đến 08/10/2026 21:25');
    expect(screen.getByText(/1596 thao tác gửi/)).toBeInTheDocument();
  });

  it('bảng thao tác/ngày theo nick, nhãn lấy từ accounts[].label', () => {
    render(<CampaignEstimatePanel status="ready" estimate={ESTIMATE_438} t={makeT(viDict)} />);
    const table = screen.getByTestId('campaign-estimate-table');
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(4); // 1 tiêu đề + 3 ngày
    expect(rows[1]).toHaveTextContent('05/10');
    expect(rows[1]).toHaveTextContent('Nick Minh Zalo');
    expect(rows[1]).toHaveTextContent('560');
    expect(rows[3]).toHaveTextContent('07/10');
    expect(rows[3]).toHaveTextContent('476');
  });

  it('hiện cảnh báo multi_day, zalo_over_safe_daily, zalo_phone_lookup_unmodeled + dòng nhỏ "có thể lâu hơn"', () => {
    render(<CampaignEstimatePanel status="ready" estimate={ESTIMATE_438} t={makeT(viDict)} />);
    const list = screen.getByTestId('campaign-estimate-warnings');
    expect(within(list).getAllByRole('listitem')).toHaveLength(3);
    expect(list).toHaveTextContent('kéo dài khoảng 4 ngày (dự kiến xong 08/10/2026 21:25)');
    expect(list).toHaveTextContent('Nick Minh Zalo gửi hơn 150 tin mỗi ngày');
    expect(list).toHaveTextContent('Zalo có thể giới hạn tra số');
    expect(screen.getByText(/có thể lâu hơn nếu Zalo khoá tra số hoặc máy chủ email chặn gửi/)).toBeInTheDocument();
  });

  it('bản tiếng Anh dùng từ điển en', () => {
    render(<CampaignEstimatePanel status="ready" estimate={ESTIMATE_438} t={makeT(enDict)} />);
    expect(screen.getByText('Sending time estimate')).toBeInTheDocument();
    expect(screen.getByText(/Expected to finish/)).toBeInTheDocument();
    expect(screen.getByTestId('campaign-estimate-warnings')).toHaveTextContent('about 4 day(s)');
  });

  it('mã cảnh báo lạ → câu chung, panel vẫn hiện số', () => {
    const estimate = { ...ESTIMATE_438, warnings: [{ code: 'ma_moi_chua_biet', params: {} }] };
    render(<CampaignEstimatePanel status="ready" estimate={estimate} t={makeT(viDict)} />);
    expect(screen.getByTestId('campaign-estimate-warnings')).toHaveTextContent(viDict.campaignEstimate.warning.unknown);
    expect(screen.getByTestId('campaign-estimate-finish')).toHaveTextContent('08/10/2026 21:25');
  });

  it('tải lỗi → câu nhẹ "Chưa ước tính được", không ném', () => {
    render(<CampaignEstimatePanel status="error" estimate={null} t={makeT(viDict)} />);
    expect(screen.getByTestId('campaign-estimate-unavailable')).toHaveTextContent('Chưa ước tính được thời gian gửi');
  });

  it('đang tải → dòng chờ; idle → không hiện gì', () => {
    const { rerender, container } = render(<CampaignEstimatePanel status="loading" estimate={null} t={makeT(viDict)} />);
    expect(screen.getByTestId('campaign-estimate-loading')).toBeInTheDocument();
    rerender(<CampaignEstimatePanel status="idle" estimate={null} t={makeT(viDict)} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('chiến dịch không có thao tác gửi (0 thao tác) → không ghi "dự kiến xong", chỉ cảnh báo', () => {
    const estimate = {
      startAt: '2026-10-05T00:00:00Z', finishAtEarliest: '2026-10-05T00:00:00Z', finishAtTypical: '2026-10-05T00:00:00Z',
      finishAtLatest: '2026-10-05T00:00:00Z', totalActions: 0, perNode: [], perDay: [], accounts: [],
      warnings: [{ code: 'no_send_node', params: {} }],
    };
    render(<CampaignEstimatePanel status="ready" estimate={estimate} t={makeT(viDict)} />);
    expect(screen.queryByTestId('campaign-estimate-finish')).not.toBeInTheDocument();
    expect(screen.getByTestId('campaign-estimate-warnings')).toHaveTextContent('chưa có bước gửi tin nào');
  });
});
