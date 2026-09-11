import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { I18nProvider } from '../../i18n';
import CampaignBuilder from './CampaignBuilder';

const { mockReadCampaignDraft, mockToastError, mockToastSuccess } = vi.hoisted(() => ({
  mockReadCampaignDraft: vi.fn(),
  mockToastError: vi.fn(),
  mockToastSuccess: vi.fn(),
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}));

vi.mock('../../features/templates/utils/fetchAllTemplateListPages', () => ({
  default: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../features/campaigns/services/campaignBuilderApi.service', () => ({
  default: {
    getActiveEmailSettings: vi.fn().mockResolvedValue({ data: { data: { items: [] } } }),
  },
}));

vi.mock('../../features/campaigns/hooks/useBrowserRouterBlocker', () => ({
  default: () => ({ state: 'unblocked', proceed: vi.fn(), reset: vi.fn() }),
}));

vi.mock('../../features/campaigns/hooks/useCampaignBuilderLayoutState', () => ({
  default: () => ({
    runLogHeight: 240,
    isResizingLog: false,
    logListWidth: 240,
    isResizingLogSplit: false,
    builderSidebarWidth: 240,
    isResizingBuilderSidebar: false,
    logPanelRef: { current: null },
    handleLogResizeStart: vi.fn(),
    handleLogSplitResizeStart: vi.fn(),
    handleBuilderSidebarResizeStart: vi.fn(),
  }),
}));

vi.mock('../../utils/campaignDraftStorage', () => ({
  readCampaignDraft: mockReadCampaignDraft,
  writeCampaignDraft: vi.fn(),
  clearCampaignDraft: vi.fn(),
}));

const buildSheetDraft = () => ({
    campaignName: 'Chiến dịch clipboard',
    campaignType: 'email',
    _aiScript: {
      nodes: [{
        tempId: 'read_sheet-1',
        nodeSubtype: 'read_sheet',
        nodeName: 'Lấy dữ liệu Excel',
        positionX: 100,
        positionY: 200,
        config: {
          sheetUrl: 'https://docs.google.com/spreadsheets/d/example/edit',
          sheetName: 'Khách hàng',
          columns: [{ key: 'email', label: 'Email' }],
        },
      }],
      connections: [],
    },
});

vi.mock('../../features/campaigns/components/CampaignBuilderPageLayout', () => ({
  default: ({
    nodes,
    onNodeClick,
    onCopyNode,
    onPasteNode,
    canPasteNode,
  }) => (
    <div>
      <span data-testid="node-count">{nodes.length}</span>
      <pre data-testid="nodes-json">{JSON.stringify(nodes)}</pre>
      <button type="button" onClick={() => onNodeClick({}, nodes[0])} disabled={!nodes[0]}>
        Chọn node đầu
      </button>
      <button type="button" onClick={onCopyNode}>Sao chép node</button>
      <button type="button" onClick={onPasteNode} disabled={!canPasteNode}>Dán node</button>
      <input aria-label="Ô đang nhập" />
    </div>
  ),
}));

describe('CampaignBuilder node clipboard', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.clearAllMocks();
    mockReadCampaignDraft.mockImplementation(buildSheetDraft);
  });

  it('copy/paste node Excel bằng phím tắt và nút, không chiếm paste trong ô nhập', async () => {
    render(
      <MemoryRouter initialEntries={['/app/campaigns/new']}>
        <I18nProvider>
          <Routes>
            <Route path="/app/campaigns/:id" element={<CampaignBuilder />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByTestId('node-count')).toHaveTextContent('1'));
    fireEvent.click(screen.getByRole('button', { name: 'Chọn node đầu' }));
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });

    await waitFor(() => expect(screen.getByTestId('node-count')).toHaveTextContent('2'));
    let nodes = JSON.parse(screen.getByTestId('nodes-json').textContent);
    expect(nodes[1]).toMatchObject({
      type: 'task',
      position: { x: 140, y: 240 },
      data: {
        label: 'Lấy dữ liệu Excel (Bản sao)',
        nodeType: 'read_sheet',
        config: {
          sheetUrl: 'https://docs.google.com/spreadsheets/d/example/edit',
          sheetName: 'Khách hàng',
          columns: [{ key: 'email', label: 'Email' }],
        },
      },
    });
    expect(nodes[1].id).not.toBe(nodes[0].id);

    fireEvent.click(screen.getByRole('button', { name: 'Dán node' }));
    await waitFor(() => expect(screen.getByTestId('node-count')).toHaveTextContent('3'));

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Ô đang nhập' }), {
      key: 'v',
      ctrlKey: true,
    });
    expect(screen.getByTestId('node-count')).toHaveTextContent('3');

    nodes = JSON.parse(screen.getByTestId('nodes-json').textContent);
    expect(nodes[2].data.label).toBe('Lấy dữ liệu Excel (Bản sao) 2');
    expect(mockToastSuccess).toHaveBeenCalledWith('Đã sao chép node');
    expect(mockToastSuccess).toHaveBeenCalledWith('Đã tạo bản sao node');
  });

  it('không cho copy/paste node điểm khởi đầu', async () => {
    mockReadCampaignDraft.mockReturnValue({
      campaignName: 'Chiến dịch trigger',
      campaignType: 'email',
      _aiScript: {
        nodes: [{
          tempId: 'trigger-1',
          nodeSubtype: 'manual_trigger',
          nodeName: 'Bắt đầu',
          positionX: 100,
          positionY: 100,
          config: {},
        }],
        connections: [],
      },
    });

    render(
      <MemoryRouter initialEntries={['/app/campaigns/new']}>
        <I18nProvider>
          <Routes>
            <Route path="/app/campaigns/:id" element={<CampaignBuilder />} />
          </Routes>
        </I18nProvider>
      </MemoryRouter>
    );

    await waitFor(() => expect(screen.getByTestId('node-count')).toHaveTextContent('1'));
    fireEvent.click(screen.getByRole('button', { name: 'Chọn node đầu' }));
    fireEvent.keyDown(window, { key: 'c', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'v', ctrlKey: true });

    expect(screen.getByTestId('node-count')).toHaveTextContent('1');
    expect(mockToastError).toHaveBeenCalledWith('Không thể nhân bản node điểm khởi đầu');
  });
});
