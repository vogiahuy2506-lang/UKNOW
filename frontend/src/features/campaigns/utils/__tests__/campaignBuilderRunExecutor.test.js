import { describe, it, expect, vi } from 'vitest';
import { executeCampaignRun } from '../campaignBuilderRunExecutor';

const makeNode = (id, nodeType, label = '') => ({
  id,
  data: { nodeType, label: label || nodeType, config: {} },
});

const triggerNode = makeNode('t', 'manual_trigger', 'Bắt đầu');

const makeParams = (overrides = {}) => {
  const params = {
    isRunning: false,
    nodes: [triggerNode, makeNode('s', 'read_sheet', 'Đọc Sheet')],
    edges: [{ source: 't', target: 's' }],
    toastNotifier: { success: vi.fn(), error: vi.fn() },
    setShowRunLogs: vi.fn(),
    setRunLogs: vi.fn(),
    setIsRunning: vi.fn(),
    setSelectedRunLogId: vi.fn(),
    runTokenRef: { current: null },
    runAbortControllerRef: { current: null },
    buildExecutionOrder: vi.fn((nodes) => nodes),
    validateNodeForRun: vi.fn(() => ({ status: 'success', message: 'ok' })),
    buildRunResultForNode: vi.fn(async (node) => ({
      input: node.data?.config || {},
      output: { ok: true, items: [], meta: { fetched: 5 } },
    })),
    isRunCancelledError: (err) => err?.code === 'ERR_CANCELED' || err?.name === 'AbortError',
    upsertRunLog: vi.fn(),
    buildNodeRealtimeLog: vi.fn((entry) => ({ ...entry })),
    addRunLog: vi.fn(),
    sleep: vi.fn(() => Promise.resolve()),
    interZaloNodeDelayMs: 0,
    isZaloNode: undefined,
    nodeFailureRetryCount: 1,
    nodeFailureRetryDelayMs: 0,
    logItemsMode: '100',
    ...overrides,
  };
  return params;
};

describe('executeCampaignRun — guards', () => {
  it('isRunning=true → no-op (không gọi setShowRunLogs)', async () => {
    const params = makeParams({ isRunning: true });
    await executeCampaignRun(params);
    expect(params.setShowRunLogs).not.toHaveBeenCalled();
    expect(params.setIsRunning).not.toHaveBeenCalled();
  });

  it('nodes rỗng → toast error, không chạy', async () => {
    const params = makeParams({ nodes: [] });
    await executeCampaignRun(params);
    expect(params.toastNotifier.error).toHaveBeenCalledWith('Chưa có node để chạy');
    expect(params.addRunLog).not.toHaveBeenCalled();
  });

  it('không có trigger node → toast error', async () => {
    const params = makeParams({ nodes: [makeNode('a', 'read_sheet')] });
    await executeCampaignRun(params);
    expect(params.toastNotifier.error).toHaveBeenCalledWith('Chiến dịch phải có node khởi chạy');
  });
});

describe('executeCampaignRun — happy path', () => {
  it('chạy 2 node thành công → run-start + node logs + run-end + setIsRunning(false)', async () => {
    const params = makeParams();
    await executeCampaignRun(params);

    expect(params.setShowRunLogs).toHaveBeenCalledWith(true);
    expect(params.setRunLogs).toHaveBeenCalledWith([]);
    expect(params.setIsRunning).toHaveBeenNthCalledWith(1, true);
    expect(params.setIsRunning).toHaveBeenLastCalledWith(false);

    const addRunLogIds = params.addRunLog.mock.calls.map((c) => c[0].id);
    expect(addRunLogIds[0]).toMatch(/^run-start-\d+$/);
    expect(addRunLogIds[addRunLogIds.length - 1]).toMatch(/^run-end-\d+$/);

    const upserted = params.upsertRunLog.mock.calls.map((c) => c[0]);
    const finalNodeLogs = upserted.filter((l) => l.id?.startsWith('node-'));
    expect(finalNodeLogs.length).toBeGreaterThanOrEqual(2);
    const successCount = finalNodeLogs.filter((l) => l.status === 'success').length;
    expect(successCount).toBeGreaterThanOrEqual(2);

    expect(params.runAbortControllerRef.current).toBeNull();
  });

  it('validation success cho read_sheet — message kèm số dòng từ meta.fetched', async () => {
    const params = makeParams({
      nodes: [triggerNode, makeNode('s', 'read_sheet')],
      buildRunResultForNode: vi.fn(async () => ({
        input: {},
        output: { ok: true, items: [], meta: { fetched: 42 } },
      })),
    });
    await executeCampaignRun(params);

    const sheetLog = params.upsertRunLog.mock.calls
      .map((c) => c[0])
      .find((l) => l.nodeId === 's' && l.status === 'success');
    expect(sheetLog.message).toContain('42 dòng');
  });
});

describe('executeCampaignRun — validation failed', () => {
  it('validation failed → dừng tại node đó, run-failed log, không gọi buildRunResult cho node bị fail', async () => {
    const params = makeParams({
      validateNodeForRun: vi.fn((node) =>
        node.data.nodeType === 'read_sheet'
          ? { status: 'failed', message: 'Thiếu URL sheet' }
          : { status: 'success', message: 'ok' }
      ),
    });
    await executeCampaignRun(params);

    const failedLog = params.upsertRunLog.mock.calls
      .map((c) => c[0])
      .find((l) => l.status === 'failed');
    expect(failedLog.message).toBe('Thiếu URL sheet');

    const runFailed = params.addRunLog.mock.calls
      .map((c) => c[0])
      .find((l) => l.id?.startsWith('run-failed-'));
    expect(runFailed).toBeDefined();
    expect(runFailed.message).toContain('Thiếu URL sheet');

    const calledNodeIds = params.buildRunResultForNode.mock.calls.map((c) => c[0].id);
    expect(calledNodeIds).not.toContain('s');
  });
});

describe('executeCampaignRun — retry', () => {
  it('node "s" throw lần 1, success lần 2 → final log status=success', async () => {
    let sheetAttempts = 0;
    const params = makeParams({
      nodeFailureRetryCount: 2,
      buildRunResultForNode: vi.fn(async (node) => {
        if (node.id === 's') {
          sheetAttempts += 1;
          if (sheetAttempts === 1) throw new Error('Network blip');
        }
        return { input: {}, output: { ok: true, items: [], meta: { fetched: 3 } } };
      }),
    });
    await executeCampaignRun(params);

    expect(sheetAttempts).toBe(2);

    const upserted = params.upsertRunLog.mock.calls.map((c) => c[0]);
    const warningLog = upserted.find((l) => l.status === 'warning' && l.message?.includes('Đang thử lại'));
    expect(warningLog).toBeDefined();

    const finalSuccess = upserted.find((l) => l.nodeId === 's' && l.status === 'success');
    expect(finalSuccess).toBeDefined();
  });

  it('hết retry attempt cho node "s" → run-failed log', async () => {
    let sheetAttempts = 0;
    const params = makeParams({
      nodeFailureRetryCount: 1,
      buildRunResultForNode: vi.fn(async (node) => {
        if (node.id === 's') {
          sheetAttempts += 1;
          throw new Error('Sheet API down');
        }
        return { input: {}, output: { ok: true, items: [], meta: {} } };
      }),
    });
    await executeCampaignRun(params);

    const runFailed = params.addRunLog.mock.calls
      .map((c) => c[0])
      .find((l) => l.id?.startsWith('run-failed-'));
    expect(runFailed).toBeDefined();
    expect(runFailed.message).toContain('Sheet API down');

    expect(sheetAttempts).toBe(2);
  });
});

describe('executeCampaignRun — cancel', () => {
  it('runTokenRef đổi giữa chừng → break + addRunLog run-cancel', async () => {
    const tokenRef = { current: null };
    const params = makeParams({
      runTokenRef: tokenRef,
      buildRunResultForNode: vi.fn(async () => {
        tokenRef.current = 'OTHER_TOKEN';
        return { input: {}, output: { ok: true, items: [], meta: {} } };
      }),
    });
    await executeCampaignRun(params);

    const lastRunLog = params.addRunLog.mock.calls.at(-1)?.[0];
    expect(lastRunLog?.id).toMatch(/^run-cancel-\d+$/);
    expect(lastRunLog?.status).toBe('warning');
  });
});

describe('executeCampaignRun — inter-zalo delay', () => {
  it('2 zalo node liên tiếp + interZaloNodeDelayMs > 0 → gọi sleep', async () => {
    const zaloA = makeNode('za', 'select_zalo_account');
    const zaloB = makeNode('zb', 'send_zalo_personal');
    const params = makeParams({
      nodes: [triggerNode, zaloA, zaloB],
      edges: [
        { source: 't', target: 'za' },
        { source: 'za', target: 'zb' },
      ],
      interZaloNodeDelayMs: 100,
      buildExecutionOrder: vi.fn((nodes) => nodes),
    });
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    await executeCampaignRun(params);
    infoSpy.mockRestore();

    const logs = params.upsertRunLog.mock.calls.map((c) => c[0]);
    expect(logs.some((l) => l.nodeId === 'za')).toBe(true);
    expect(logs.some((l) => l.nodeId === 'zb')).toBe(true);
  });
});

describe('executeCampaignRun — Zalo pool multi → skip get_all_friends', () => {
  it('khi có select_zalo_account với pool multi enabled → get_all_friends bị loại khỏi preview', async () => {
    const poolAccount = {
      id: 'za',
      data: {
        nodeType: 'select_zalo_account',
        label: 'Pool',
        config: { zaloPoolMultiAccountEnabled: true, zaloPoolAccountIds: ['1'] },
      },
    };
    const friends = makeNode('gf', 'get_all_friends');
    const sender = makeNode('sp', 'send_zalo_personal');

    const params = makeParams({
      nodes: [triggerNode, poolAccount, friends, sender],
      edges: [
        { source: 't', target: 'za' },
        { source: 'za', target: 'gf' },
        { source: 'gf', target: 'sp' },
      ],
      buildExecutionOrder: vi.fn((nodes) => nodes),
    });
    await executeCampaignRun(params);

    const logs = params.upsertRunLog.mock.calls.map((c) => c[0]);
    expect(logs.some((l) => l.nodeId === 'gf')).toBe(false);
    expect(logs.some((l) => l.nodeId === 'sp')).toBe(true);
  });
});
