import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import CampaignRunLogsPanel from '../CampaignRunLogsPanel';
import viTranslations from '../../../../i18n/vi';

// PR-8a (UI nói thật) Việc 1 — CampaignRunLogsPanel.jsx:75, 140 phải in nhãn Việt hoá của
// campaign_runs.status (trước đây in thô "running"/"failed"/"stopped" tiếng Anh trần).

const getNestedTranslation = (obj, path) => path.split('.').reduce((acc, part) => acc?.[part], obj);

const mockT = (key, params) => {
  const val = getNestedTranslation(viTranslations, key);
  if (typeof val === 'string') {
    if (params) {
      let str = val;
      for (const [k, v] of Object.entries(params)) {
        str = str.replace(`{${k}}`, v);
      }
      return str;
    }
    return val;
  }
  return key;
};

vi.mock('../../../../i18n', () => ({
  useI18n: () => ({ t: mockT }),
}));

describe('CampaignRunLogsPanel — Việt hoá trạng thái lượt chạy (4 trạng thái)', () => {
  const baseProps = {
    selectedCampaignForLogs: { id: 1, campaignName: 'Chiến dịch A' },
    isLoadingRunDetail: false,
    workspaceLogs: [],
    selectedExecutionLogId: null,
    onSelectExecutionLogId: () => {},
    onViewRunDetail: () => {},
  };

  it.each([
    ['running', 'Đang chạy'],
    ['completed', 'Đã hoàn thành'],
    ['failed', 'Lỗi'],
    ['stopped', 'Đã dừng'],
  ])('ô "Trạng thái" của lượt đang chọn: status=%s → nhãn "%s" (không phải chuỗi status gốc)', (status, expectedLabel) => {
    render(
      <CampaignRunLogsPanel
        {...baseProps}
        selectedRunDetail={{ id: 10, campaignName: 'Chiến dịch A', status }}
        campaignRunHistory={[]}
      />
    );

    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    expect(screen.queryByText(status)).not.toBeInTheDocument();
  });

  it('bảng lịch sử lượt chạy: mỗi dòng in nhãn Việt hoá, đủ cả 4 trạng thái cùng lúc', () => {
    render(
      <CampaignRunLogsPanel
        {...baseProps}
        selectedRunDetail={{ id: 10, campaignName: 'Chiến dịch A', status: 'running' }}
        campaignRunHistory={[
          { id: 1, campaignName: 'A', status: 'running', startedAt: '2026-09-27T00:00:00Z' },
          { id: 2, campaignName: 'A', status: 'completed', startedAt: '2026-09-27T00:00:00Z' },
          { id: 3, campaignName: 'A', status: 'failed', startedAt: '2026-09-27T00:00:00Z' },
          { id: 4, campaignName: 'A', status: 'stopped', startedAt: '2026-09-27T00:00:00Z' },
        ]}
      />
    );

    expect(screen.getAllByText('Đang chạy').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Đã hoàn thành')).toBeInTheDocument();
    expect(screen.getByText('Lỗi')).toBeInTheDocument();
    expect(screen.getByText('Đã dừng')).toBeInTheDocument();
    // KHÔNG còn chuỗi status gốc trần nào lọt ra màn hình.
    expect(screen.queryByText('completed')).not.toBeInTheDocument();
    expect(screen.queryByText('failed')).not.toBeInTheDocument();
    expect(screen.queryByText('stopped')).not.toBeInTheDocument();
  });

  it('status lạ (chưa biết) → in thô nguyên status, không in tên khoá i18n', () => {
    render(
      <CampaignRunLogsPanel
        {...baseProps}
        selectedRunDetail={{ id: 10, campaignName: 'Chiến dịch A', status: 'queued' }}
        campaignRunHistory={[]}
      />
    );

    expect(screen.getByText('queued')).toBeInTheDocument();
    expect(screen.queryByText(/campaignRun\.runStatus/)).not.toBeInTheDocument();
  });
});
