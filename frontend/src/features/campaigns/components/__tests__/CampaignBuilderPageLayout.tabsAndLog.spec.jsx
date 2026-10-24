import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ReactFlowProvider } from 'reactflow';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../../../i18n';
import CampaignBuilderPageLayout from '../CampaignBuilderPageLayout';
import { getAllowedActionNodeTypesByCampaignType } from '../../utils/campaignBuilderFlow';

/**
 * Thanh trên gọn dùng chung hai tab. "Chạy thử"/"Dừng" và log chạy thử đã bỏ 23/10/2026 (PLAN_MOT_NUT_GUI).
 */

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function renderLayout(props = {}) {
  const handlers = {};
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
            {...handlers}
            {...props}
          />
        </ReactFlowProvider>
      </I18nProvider>
    </MemoryRouter>
  );
  return handlers;
}

describe('CampaignBuilderPageLayout — không còn Chạy thử / Log chạy thử (chỉ còn MỘT lối gửi: Chạy ngay)', () => {
  it('tab Sơ đồ khối: KHÔNG có Chạy thử / Dừng / khung Log chạy thử; thanh trên vẫn có Lưu / Lên lịch / Chạy ngay / ⋯', () => {
    renderLayout({ activeTab: 'flow' });
    expect(screen.queryByTestId('flow-run-controls')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chạy thử' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dừng' })).not.toBeInTheDocument();
    expect(screen.queryByTestId('test-run-log')).not.toBeInTheDocument();
    expect(screen.queryByText(/Log chạy thử/)).not.toBeInTheDocument();
    for (const name of ['Lưu', 'Lên lịch', 'Chạy ngay', 'Thêm hành động']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('tab Thiết lập: cũng không có Chạy thử / Dừng, nhưng thanh trên vẫn đủ Lưu / Lên lịch / Chạy ngay / ⋯', () => {
    renderLayout({ activeTab: 'settings' });
    expect(screen.getByTestId('settings-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('flow-run-controls')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Chạy thử' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Dừng' })).not.toBeInTheDocument();
    for (const name of ['Lưu', 'Lên lịch', 'Chạy ngay', 'Thêm hành động']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('bấm "Chạy ngay" gọi onRunNow (lối gửi duy nhất, chạy trên máy chủ)', () => {
    const onRunNow = vi.fn();
    renderLayout({ activeTab: 'flow', onRunNow });
    fireEvent.click(screen.getByRole('button', { name: 'Chạy ngay' }));
    expect(onRunNow).toHaveBeenCalledTimes(1);
  });
});
