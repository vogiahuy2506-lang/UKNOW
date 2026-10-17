import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReactFlowProvider } from 'reactflow';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import CampaignBuilderPageLayout from '../CampaignBuilderPageLayout';
import { getAllowedActionNodeTypesByCampaignType } from '../../utils/campaignBuilderFlow';

/**
 * PLAN_THANH_NUT_VA_LOG_2026-10-17 — thanh trên gọn dùng chung hai tab; "Chạy thử"/"Dừng" và log chạy thử chỉ ở tab Sơ đồ khối.
 */
vi.mock('../../../../components/campaigns/CampaignExecutionLogWorkspace', () => ({
  default: () => <div data-testid="log-workspace" />,
}));

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

const LOG = { id: 'l1', nodeId: 'n1', status: 'success' };

function renderLayout(props = {}) {
  const handlers = {
    onRunCampaign: vi.fn(),
    onStopRun: vi.fn(),
    setShowRunLogs: vi.fn(),
    setRunLogs: vi.fn(),
    setSelectedRunLogId: vi.fn(),
  };
  const allowed = getAllowedActionNodeTypesByCampaignType('mixed', { telegramEnabled: true, whatsappEnabled: true, zaloEnabled: true });
  render(
    <MemoryRouter>
      <I18nProvider>
        <ReactFlowProvider>
          <CampaignBuilderPageLayout
            campaignName="Chiến dịch thử"
            campaignStatus="draft"
            campaignType="email"
            isDirty={false}
            canUseServerRunActions
            viewTabs={<span>tabs</span>}
            settingsPanel={<div data-testid="settings-stub" />}
            activeTab="flow"
            builderSidebarWidth={260}
            searchTerm=""
            setSearchTerm={vi.fn()}
            toggleCategory={vi.fn()}
            expandedCategories={[]}
            filterNodes={(list) => list}
            allowedActionNodeTypes={allowed}
            allowedDataNodeTypes={null}
            zaloEnabled
            nodes={[]}
            edges={[]}
            getAllowedActionNodeTypesByCampaignType={() => allowed}
            getAllowedDataNodeTypesByCampaignType={() => null}
            isTriggerNodeType={() => false}
            nodeTypes={{}}
            edgeTypes={{}}
            isRunning={false}
            runLogs={[]}
            showRunLogs={false}
            {...handlers}
            {...props}
          />
        </ReactFlowProvider>
      </I18nProvider>
    </MemoryRouter>
  );
  return handlers;
}

describe('CampaignBuilderPageLayout — Chạy thử / Dừng', () => {
  it('tab Sơ đồ khối: có "Chạy thử" (gọi onRunCampaign); thanh trên không còn nút này', () => {
    const handlers = renderLayout({ activeTab: 'flow' });
    const runControls = screen.getByTestId('flow-run-controls');
    expect(runControls).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Chạy thử' }));
    expect(handlers.onRunCampaign).toHaveBeenCalledTimes(1);
    // Thanh trên (không nằm trong flow-run-controls) vẫn có Chạy ngay / Lên lịch / Lưu.
    expect(screen.getByRole('button', { name: 'Chạy ngay' })).toBeInTheDocument();
    expect(runControls.contains(screen.getByRole('button', { name: 'Chạy ngay' }))).toBe(false);
  });

  it('tab Sơ đồ khối + đang chạy thử: "Dừng" thay "Chạy thử"', () => {
    renderLayout({ activeTab: 'flow', isRunning: true });
    expect(screen.getByRole('button', { name: 'Dừng' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chạy thử' })).not.toBeInTheDocument();
  });

  it('tab Thiết lập: KHÔNG có Chạy thử / Dừng, nhưng thanh trên vẫn đủ Lưu / Lên lịch / Chạy ngay / ⋯', () => {
    renderLayout({ activeTab: 'settings', isRunning: true });
    expect(screen.getByTestId('settings-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('flow-run-controls')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chạy thử' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dừng' })).not.toBeInTheDocument();
    for (const name of ['Lưu', 'Lên lịch', 'Chạy ngay', 'Thêm hành động']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });
});

describe('CampaignBuilderPageLayout — log chạy thử', () => {
  it('tab Thiết lập: KHÔNG có log dù đã có log chạy thử và log đang mở', () => {
    renderLayout({ activeTab: 'settings', runLogs: [LOG], showRunLogs: true });
    expect(screen.queryByTestId('test-run-log')).not.toBeInTheDocument();
    expect(screen.queryByTestId('log-workspace')).not.toBeInTheDocument();
    expect(screen.queryByText(/Log chạy thử/)).not.toBeInTheDocument();
  });

  it('tab Sơ đồ khối, chưa chạy thử lần nào: không có thanh log (kể cả khi cờ "mở" còn lưu từ lần trước)', () => {
    renderLayout({ activeTab: 'flow', runLogs: [], showRunLogs: true });
    expect(screen.queryByTestId('test-run-log')).not.toBeInTheDocument();
    expect(screen.queryByTestId('log-workspace')).not.toBeInTheDocument();
  });

  it('tab Sơ đồ khối, có log, đang thu: thanh mảnh "Log chạy thử (N)", chưa vẽ nội dung; Mở rộng gọi setShowRunLogs', () => {
    const handlers = renderLayout({ activeTab: 'flow', runLogs: [LOG, { ...LOG, id: 'l2' }], showRunLogs: false });
    expect(screen.getByTestId('test-run-log')).toHaveTextContent('Log chạy thử (2)');
    expect(screen.queryByText('Log chạy chiến dịch')).not.toBeInTheDocument();
    expect(screen.queryByTestId('log-workspace')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mở rộng' }));
    expect(handlers.setShowRunLogs).toHaveBeenCalledTimes(1);
  });

  it('tab Sơ đồ khối, log đang mở: vẽ chi tiết log; Xóa log dọn danh sách', () => {
    const handlers = renderLayout({ activeTab: 'flow', runLogs: [LOG], showRunLogs: true });
    expect(screen.getByTestId('log-workspace')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn' }));
    expect(handlers.setShowRunLogs).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Xóa log' }));
    expect(handlers.setRunLogs).toHaveBeenCalledWith([]);
    expect(handlers.setSelectedRunLogId).toHaveBeenCalledWith(null);
  });

  it('đang chạy thử mà log chưa có dòng nào: thanh log vẫn hiện để người dùng thấy kết quả sắp tới', () => {
    renderLayout({ activeTab: 'flow', isRunning: true, runLogs: [], showRunLogs: true });
    expect(screen.getByTestId('test-run-log')).toHaveTextContent('Log chạy thử (0)');
  });
});
