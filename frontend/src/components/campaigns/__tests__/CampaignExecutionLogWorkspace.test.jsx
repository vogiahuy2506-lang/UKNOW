import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../../../features/campaigns/utils/campaignDateTime.helpers', () => ({
  formatCampaignDateTime: (value) => (value ? `DT(${value})` : ''),
  formatCampaignTime: (value) => (value ? `TIME(${String(value)})` : ''),
}));

vi.mock('../../../features/campaigns/utils/dataColumnSelection', () => ({
  formatDataPayloadBytes: (b) => `${b}B`,
}));

import CampaignExecutionLogWorkspace from '../CampaignExecutionLogWorkspace';

function renderWorkspace(props = {}) {
  return render(<CampaignExecutionLogWorkspace {...props} />);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('<CampaignExecutionLogWorkspace /> — danh sách (list) bên trái', () => {
  it('logs rỗng → hiển thị emptyListText mặc định + "0 log"', () => {
    renderWorkspace();
    expect(screen.getByText('Chưa có log')).toBeInTheDocument();
    expect(screen.getByText('0 log')).toBeInTheDocument();
  });

  it('emptyListText custom prop', () => {
    renderWorkspace({ emptyListText: 'No data yet' });
    expect(screen.getByText('No data yet')).toBeInTheDocument();
  });

  it('render mỗi log với nodeName + message + count', () => {
    const logs = [
      { id: 'a', status: 'success', nodeName: 'Send Email', message: 'OK', timestamp: '2024-01-01' },
      { id: 'b', status: 'failed', nodeSubtype: 'Send Zalo', message: 'fail', timestamp: '2024-01-02' },
    ];
    renderWorkspace({ logs });
    expect(screen.getByText('Send Email')).toBeInTheDocument();
    expect(screen.getByText('Send Zalo')).toBeInTheDocument();
    expect(screen.getByText('2 log')).toBeInTheDocument();
  });

  it('fallback nodeName "Hệ thống" khi log thiếu name/subtype/actionType', () => {
    const logs = [{ id: 'a', status: 'info', message: '-' }];
    renderWorkspace({ logs });
    expect(screen.getByText('Hệ thống')).toBeInTheDocument();
  });

  it('message fallback chuỗi "-" khi log thiếu mọi field message', () => {
    const logs = [{ id: 'a', status: 'info' }];
    renderWorkspace({ logs });
    expect(screen.getByText(/— -/)).toBeInTheDocument();
  });

  it('emptyDetailText hiển thị khi chưa chọn log nào', () => {
    renderWorkspace();
    expect(screen.getByText(/Chọn 1 log để xem chi tiết/)).toBeInTheDocument();
  });

  it('click log → onSelectLogId được gọi với id', async () => {
    const onSelect = vi.fn();
    const logs = [
      { id: 'a', status: 'success', nodeName: 'X', message: 'm' },
      { id: 'b', status: 'failed', nodeName: 'Y', message: 'm2' },
    ];
    const user = userEvent.setup();
    renderWorkspace({ logs, onSelectLogId: onSelect });
    await user.click(screen.getByText('Y'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('auto-select log đầu tiên khi selectedLogId không khớp', () => {
    const onSelect = vi.fn();
    renderWorkspace({
      logs: [{ id: 'x', status: 'success', nodeName: 'N', message: 'm' }],
      selectedLogId: 'nonexistent',
      onSelectLogId: onSelect,
    });
    expect(onSelect).toHaveBeenCalledWith('x');
  });

  it('không gọi onSelectLogId nếu selectedLogId đã khớp', () => {
    const onSelect = vi.fn();
    renderWorkspace({
      logs: [{ id: 'x', status: 'success', nodeName: 'N', message: 'm' }],
      selectedLogId: 'x',
      onSelectLogId: onSelect,
    });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('badge "Có kết quả" hiện khi log.result tồn tại', () => {
    const logs = [
      {
        id: 'a',
        status: 'success',
        nodeName: 'X',
        message: 'm',
        result: { input: null, output: { items: [] } },
      },
    ];
    renderWorkspace({ logs });
    expect(screen.getByText('Có kết quả')).toBeInTheDocument();
  });
});

describe('<CampaignExecutionLogWorkspace /> — chi tiết log + tab table', () => {
  const baseLog = {
    id: 'a',
    status: 'success',
    nodeName: 'Read Sheet',
    message: 'done',
    timestamp: '2024-05-01T10:00:00Z',
    result: {
      input: { x: 1 },
      output: {
        items: Array.from({ length: 30 }, (_, i) => ({
          email: `u${i}@x.com`,
          sentAt: '2024-05-01T10:00:00Z',
          payload: { foo: 'bar' },
        })),
        meta: { totalItems: 30, sentCount: 28, failedCount: 2 },
      },
    },
  };

  it('header detail: nodeName + status badge + message', () => {
    renderWorkspace({ logs: [baseLog], selectedLogId: 'a' });
    expect(screen.getAllByText('Read Sheet').length).toBeGreaterThan(0);
    expect(screen.getByText('success')).toBeInTheDocument();
    expect(screen.getAllByText('done').length).toBeGreaterThan(0);
  });

  it('hiển thị summary "Tổng đã gửi" + "Gửi lỗi" từ meta', () => {
    renderWorkspace({ logs: [baseLog], selectedLogId: 'a' });
    expect(screen.getByText(/Tổng đã gửi: 28/)).toBeInTheDocument();
    expect(screen.getByText(/Gửi lỗi: 2/)).toBeInTheDocument();
  });

  it('hiển thị totalItems từ meta thay vì items.length', () => {
    renderWorkspace({ logs: [baseLog], selectedLogId: 'a' });
    expect(screen.getByText('30 items')).toBeInTheDocument();
  });

  it('table tab mặc định: render header columns + page size 25', () => {
    renderWorkspace({ logs: [baseLog], selectedLogId: 'a' });
    expect(screen.getByText('email')).toBeInTheDocument();
    expect(screen.getByText('sentAt')).toBeInTheDocument();
    expect(screen.getByText('payload')).toBeInTheDocument();
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('cột "sentAt" được format qua formatCampaignDateTime', () => {
    renderWorkspace({ logs: [baseLog], selectedLogId: 'a' });
    expect(screen.getAllByText('DT(2024-05-01T10:00:00Z)').length).toBeGreaterThan(0);
  });

  it('cột object (payload) hiển thị JSON.stringify', () => {
    renderWorkspace({ logs: [baseLog], selectedLogId: 'a' });
    expect(screen.getAllByText(/\{"foo":"bar"\}/).length).toBeGreaterThan(0);
  });

  it('pagination: › chuyển sang trang 2', async () => {
    const user = userEvent.setup();
    renderWorkspace({ logs: [baseLog], selectedLogId: 'a' });
    await user.click(screen.getByText('›'));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    expect(screen.getByText('u25@x.com')).toBeInTheDocument();
  });

  it('pagination « về trang 1; » đến trang cuối', async () => {
    const user = userEvent.setup();
    renderWorkspace({ logs: [baseLog], selectedLogId: 'a' });
    await user.click(screen.getByText('»'));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    await user.click(screen.getByText('«'));
    expect(screen.getByText('1 / 2')).toBeInTheDocument();
  });

  it('thay đổi page size → reset về trang 1', async () => {
    const user = userEvent.setup();
    renderWorkspace({ logs: [baseLog], selectedLogId: 'a' });
    await user.click(screen.getByText('»'));
    expect(screen.getByText('2 / 2')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox'), '50');
    expect(screen.getByText('1 / 1')).toBeInTheDocument();
  });

  it('click cell → toggle expandedCell (style truncate vs whitespace-normal)', async () => {
    const user = userEvent.setup();
    renderWorkspace({ logs: [baseLog], selectedLogId: 'a' });
    const cellBtn = screen.getAllByText('u0@x.com')[0].closest('button');
    expect(cellBtn.className).toMatch(/truncate/);
    await user.click(cellBtn);
    expect(cellBtn.className).toMatch(/whitespace-normal/);
    await user.click(cellBtn);
    expect(cellBtn.className).toMatch(/truncate/);
  });
});

describe('<CampaignExecutionLogWorkspace /> — tab schema & json', () => {
  const log = {
    id: 'a',
    status: 'success',
    nodeName: 'N',
    result: {
      input: null,
      output: {
        items: [{ a: 1, b: 'text', c: [1, 2] }],
        schema: [
          { key: 'a', type: 'number' },
          { key: 'b', type: 'string' },
          { key: 'c', type: 'array' },
        ],
      },
    },
  };

  it('chuyển sang tab Schema → render danh sách field + type', async () => {
    const user = userEvent.setup();
    renderWorkspace({ logs: [log], selectedLogId: 'a' });
    await user.click(screen.getByText('Schema'));
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('number')).toBeInTheDocument();
    expect(screen.getByText('array')).toBeInTheDocument();
  });

  it('tab JSON → render JSON.stringify outputData', async () => {
    const user = userEvent.setup();
    renderWorkspace({ logs: [log], selectedLogId: 'a' });
    await user.click(screen.getByText('JSON'));
    expect(screen.getByText(/"items":/)).toBeInTheDocument();
    expect(screen.getByText(/"schema":/)).toBeInTheDocument();
  });

  it('schema fallback: outputData không có schema → build từ items', async () => {
    const logWithoutSchema = {
      id: 'a',
      status: 'success',
      nodeName: 'N',
      result: { input: null, output: { items: [{ a: 1, b: 'x' }] } },
    };
    const user = userEvent.setup();
    renderWorkspace({ logs: [logWithoutSchema], selectedLogId: 'a' });
    await user.click(screen.getByText('Schema'));
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('number')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(screen.getByText('string')).toBeInTheDocument();
  });

  it('schema rỗng → hiển thị "Không có schema."', async () => {
    const emptyLog = {
      id: 'a',
      status: 'success',
      nodeName: 'N',
      result: { input: null, output: { items: [] } },
    };
    const user = userEvent.setup();
    renderWorkspace({ logs: [emptyLog], selectedLogId: 'a' });
    await user.click(screen.getByText('Schema'));
    expect(screen.getByText('Không có schema.')).toBeInTheDocument();
  });
});

describe('<CampaignExecutionLogWorkspace /> — INPUT/OUTPUT switch', () => {
  const log = {
    id: 'a',
    status: 'success',
    nodeName: 'N',
    result: {
      input: { foo: 'bar' },
      output: { items: [{ x: 1 }] },
    },
  };

  it('mặc định active=output → tab buttons (Schema/Table/JSON) visible', () => {
    renderWorkspace({ logs: [log], selectedLogId: 'a' });
    expect(screen.getByText('Schema')).toBeInTheDocument();
    expect(screen.getByText('Table')).toBeInTheDocument();
    expect(screen.getByText('JSON')).toBeInTheDocument();
  });

  it('click INPUT → hiển thị JSON input thay vì tabs', async () => {
    const user = userEvent.setup();
    renderWorkspace({ logs: [log], selectedLogId: 'a' });
    await user.click(screen.getByText('INPUT'));
    expect(screen.getByText('Input')).toBeInTheDocument();
    expect(screen.getByText(/"foo":\s*"bar"/)).toBeInTheDocument();
    expect(screen.queryByText('Schema')).not.toBeInTheDocument();
  });

  it('quay lại OUTPUT từ INPUT vẫn render lại tabs', async () => {
    const user = userEvent.setup();
    renderWorkspace({ logs: [log], selectedLogId: 'a' });
    await user.click(screen.getByText('INPUT'));
    expect(screen.getByText('Input')).toBeInTheDocument();
    await user.click(screen.getByText('OUTPUT'));
    expect(screen.getByText('Schema')).toBeInTheDocument();
    expect(screen.getByText('Table')).toBeInTheDocument();
  });
});

describe('<CampaignExecutionLogWorkspace /> — splitter', () => {
  it('showSplitter=false → không render separator', () => {
    renderWorkspace({ showSplitter: false });
    expect(screen.queryByRole('separator')).not.toBeInTheDocument();
  });

  it('showSplitter=true → render separator + handler mouse down', () => {
    const onResize = vi.fn();
    renderWorkspace({ showSplitter: true, onSplitResizeStart: onResize });
    const separator = screen.getByRole('separator');
    expect(separator).toBeInTheDocument();
    fireEvent.mouseDown(separator);
    expect(onResize).toHaveBeenCalledTimes(1);
  });

  it('isResizingSplit=true → separator có class bg-primary-100', () => {
    renderWorkspace({ showSplitter: true, isResizingSplit: true });
    const separator = screen.getByRole('separator');
    expect(separator.className).toMatch(/bg-primary-100/);
  });
});

describe('<CampaignExecutionLogWorkspace /> — payload meta badges', () => {
  it('hasAcc → badge "Payload ~<bytes>"', () => {
    const log = {
      id: 'a',
      status: 'success',
      nodeName: 'N',
      result: {
        input: null,
        output: {
          items: [{ x: 1 }],
          meta: { accumulatedPayloadBytesUtf8: 5120 },
        },
      },
    };
    renderWorkspace({ logs: [log], selectedLogId: 'a' });
    expect(screen.getByText(/Payload ~5120B/)).toBeInTheDocument();
  });

  it('hasSavings (cần columnSelectionActive) → badge "Tiết kiệm batch"', () => {
    const log = {
      id: 'a',
      status: 'success',
      nodeName: 'N',
      result: {
        input: null,
        output: {
          items: [{ x: 1 }],
          meta: {
            accumulatedPayloadBytesUtf8: 100,
            dataLoadMeta: { batchEstimatedSavingsBytes: 4096, columnSelectionActive: true },
          },
        },
      },
    };
    renderWorkspace({ logs: [log], selectedLogId: 'a' });
    expect(screen.getByText(/Tiết kiệm batch ~4096B/)).toBeInTheDocument();
  });

  it('columnSelectionActive=false → KHÔNG render badge tiết kiệm', () => {
    const log = {
      id: 'a',
      status: 'success',
      nodeName: 'N',
      result: {
        input: null,
        output: {
          items: [{ x: 1 }],
          meta: {
            dataLoadMeta: { batchEstimatedSavingsBytes: 4096, columnSelectionActive: false },
          },
        },
      },
    };
    renderWorkspace({ logs: [log], selectedLogId: 'a' });
    expect(screen.queryByText(/Tiết kiệm batch/)).not.toBeInTheDocument();
  });
});

describe('<CampaignExecutionLogWorkspace /> — normalizeLogs corner cases', () => {
  it('items là array trực tiếp (không nằm trong items field) cũng nhận được', async () => {
    const log = {
      id: 'a',
      status: 'success',
      nodeName: 'N',
      result: {
        input: null,
        output: [{ a: 1 }, { a: 2 }],
      },
    };
    renderWorkspace({ logs: [log], selectedLogId: 'a' });
    expect(screen.getByText('2 items')).toBeInTheDocument();
  });

  it('items là object đơn → wrap thành array 1 item', () => {
    const log = {
      id: 'a',
      status: 'success',
      nodeName: 'N',
      result: { input: null, output: { foo: 'bar' } },
    };
    renderWorkspace({ logs: [log], selectedLogId: 'a' });
    expect(screen.getByText('1 items')).toBeInTheDocument();
  });

  it('items rỗng → tab Table hiển thị "Không có dữ liệu."', () => {
    const log = {
      id: 'a',
      status: 'success',
      nodeName: 'N',
      result: { input: null, output: { items: [] } },
    };
    renderWorkspace({ logs: [log], selectedLogId: 'a' });
    expect(screen.getByText('Không có dữ liệu.')).toBeInTheDocument();
  });

  it('log với executionData làm output fallback', () => {
    const log = {
      id: 'a',
      status: 'success',
      nodeName: 'N',
      executionData: { items: [{ k: 1 }] },
    };
    renderWorkspace({ logs: [log], selectedLogId: 'a' });
    expect(screen.getByText('1 items')).toBeInTheDocument();
  });

  it('message fallback errorMessage khi không có message', () => {
    const log = { id: 'a', status: 'failed', nodeName: 'N', errorMessage: 'Boom' };
    renderWorkspace({ logs: [log], selectedLogId: 'a' });
    expect(screen.getAllByText('Boom').length).toBeGreaterThan(0);
  });
});
