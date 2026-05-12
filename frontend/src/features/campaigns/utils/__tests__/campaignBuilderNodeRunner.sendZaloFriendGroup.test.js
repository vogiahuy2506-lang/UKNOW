import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCampaignNodeRunner } from '../campaignBuilderNodeRunner.js';

/**
 * B14e: send_zalo_friend_request + send_zalo_group + fallback nodeType chưa khớp
 */

function createDeps(overrides = {}) {
  return {
    campaignId: overrides.campaignId ?? 7,
    apiService: {
      previewGoogleSheet: vi.fn(),
      checkGoogleSheet: vi.fn(),
      getInterestedCustomersByQuery: vi.fn(),
      getCourses: vi.fn(),
      previewLandingLeads: vi.fn(),
      getEmailTemplateById: vi.fn(),
      getZaloTemplateById: vi.fn(),
      getZaloAccounts: vi.fn(),
      restoreZaloAccountSession: vi.fn(),
      getPreviewZaloFriends: vi.fn(),
      getPreviewZaloGroups: vi.fn(),
      sendPreviewEmail: vi.fn(),
      sendPreviewZaloPersonal: vi.fn(),
      sendPreviewZaloGroup: vi.fn(),
      sendPreviewZaloFriendRequest: vi.fn(),
      getActiveEmailSettings: vi.fn(),
      ...(overrides.apiService || {}),
    },
    buildSchemaFromRows: vi.fn((rows) => ({ count: Array.isArray(rows) ? rows.length : 0 })),
    applyMappingsForRow: vi.fn(() => ({})),
    normalizeKey: vi.fn((k) => String(k || '').trim().toLowerCase()),
    parseEmailList: vi.fn((text) =>
      String(text || '').split(/[\n,;]/).map((s) => s.trim()).filter(Boolean)
    ),
    renderTemplateString: vi.fn((tpl, vars) =>
      String(tpl || '').replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars?.[k] ?? ''))
    ),
    resolveColumnKey: vi.fn((_row, ref) => String(ref || '')),
    readPreviewSessionData: vi.fn(() => ({ customers: [] })),
    writePreviewSessionData: vi.fn(),
    toastNotifier: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
    isRunCancelledError: vi.fn(() => false),
    logItemsMode: '100',
    ...overrides,
  };
}

function makeCtx(extras = {}) {
  return {
    selectedZaloAccount: { id: 'acc-1', displayName: 'Main', status: 'connected', isActive: true },
    ...extras,
  };
}

let randomSpy;
beforeEach(() => {
  vi.clearAllMocks();
  randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  randomSpy.mockRestore();
});

describe('send_zalo_friend_request', () => {
  function makeNode(config = {}) {
    return { id: 'fr', type: 'send_zalo_friend_request', data: { nodeType: 'send_zalo_friend_request', config } };
  }

  it('thiếu TK → throw', async () => {
    const deps = createDeps();
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await expect(buildRunResultForNode(makeNode({}), {})).rejects.toThrow(/Chưa có tài khoản Zalo gửi/);
  });

  it('contentMode "manual" — payload có message từ zaloFriendRequestMessage trim', async () => {
    const deps = createDeps();
    deps.apiService.sendPreviewZaloFriendRequest.mockResolvedValue({
      data: { data: { items: [{ recipient: '0901', status: 'success' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        zaloFriendSource: 'manual',
        zaloFriendPhones: '0901, 0902',
        zaloFriendContentMode: 'manual',
        zaloFriendRequestMessage: '   Kết bạn nhé   ',
      }),
      makeCtx()
    );
    expect(deps.apiService.sendPreviewZaloFriendRequest).toHaveBeenCalledTimes(2);
    deps.apiService.sendPreviewZaloFriendRequest.mock.calls.forEach(([p]) => {
      expect(p.message).toBe('Kết bạn nhé');
      expect(p.recipients).toHaveLength(1);
    });
    expect(result.output.items).toHaveLength(2);
  });

  it('contentMode "template" + templateId → lấy bodyText từ API, render với mappings', async () => {
    const deps = createDeps();
    deps.apiService.getZaloTemplateById.mockResolvedValue({
      data: { data: { bodyText: 'Hi {{name}}' } },
    });
    deps.apiService.sendPreviewZaloFriendRequest.mockResolvedValue({
      data: { data: { items: [{ status: 'success' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await buildRunResultForNode(
      makeNode({
        zaloFriendSource: 'manual',
        zaloFriendPhones: '0901',
        zaloFriendContentMode: 'template',
        zaloFriendTemplateId: 7,
        zaloFriendTemplateMappings: [{ key: 'name', sourceType: 'manual', value: 'An' }],
      }),
      makeCtx()
    );
    expect(deps.apiService.sendPreviewZaloFriendRequest.mock.calls[0][0].message).toBe('Hi An');
  });

  it('contentMode "template" + fallback bodyHtml khi bodyText rỗng', async () => {
    const deps = createDeps();
    deps.apiService.getZaloTemplateById.mockResolvedValue({
      data: { data: { bodyText: '', bodyHtml: 'Fallback HTML' } },
    });
    deps.apiService.sendPreviewZaloFriendRequest.mockResolvedValue({
      data: { data: { items: [{ status: 'success' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await buildRunResultForNode(
      makeNode({
        zaloFriendSource: 'manual',
        zaloFriendPhones: '0901',
        zaloFriendContentMode: 'template',
        zaloFriendTemplateId: 7,
      }),
      makeCtx()
    );
    expect(deps.apiService.sendPreviewZaloFriendRequest.mock.calls[0][0].message).toBe('Fallback HTML');
  });

  it('item kế thừa requestMessage; meta.sent + meta.failed đúng', async () => {
    const deps = createDeps();
    deps.apiService.sendPreviewZaloFriendRequest
      .mockResolvedValueOnce({ data: { data: { items: [{ recipient: '0901', status: 'success' }] } } })
      .mockResolvedValueOnce({ data: { data: { items: [{ recipient: '0902', status: 'failed' }] } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        zaloFriendSource: 'manual',
        zaloFriendPhones: '0901,0902',
        zaloFriendContentMode: 'manual',
        zaloFriendRequestMessage: 'Hi',
      }),
      makeCtx()
    );
    expect(result.output.items[0].requestMessage).toBe('Hi');
    expect(result.output.meta.sent).toBe(1);
    expect(result.output.meta.failed).toBe(1);
    expect(result.output.meta.totalItems).toBe(2);
  });

  it('onProgress được gọi sau mỗi item', async () => {
    const deps = createDeps();
    deps.apiService.sendPreviewZaloFriendRequest.mockResolvedValue({
      data: { data: { items: [{ status: 'success' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const onProgress = vi.fn();
    await buildRunResultForNode(
      makeNode({
        zaloFriendSource: 'manual',
        zaloFriendPhones: '0901,0902',
        zaloFriendContentMode: 'manual',
        zaloFriendRequestMessage: 'Hi',
      }),
      makeCtx(),
      { onProgress }
    );
    expect(onProgress).toHaveBeenCalledTimes(2);
  });

  it('input echo: recipientSource="manual", contentMode, templateId chỉ khi template', async () => {
    const deps = createDeps();
    deps.apiService.sendPreviewZaloFriendRequest.mockResolvedValue({ data: { data: { items: [] } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        zaloFriendSource: 'manual',
        zaloFriendPhones: '0901',
        zaloFriendContentMode: 'manual',
        zaloFriendRequestMessage: 'Hi',
      }),
      makeCtx()
    );
    expect(result.input.contentMode).toBe('manual');
    expect(result.input.templateId).toBe(null);
    expect(result.input.requestMessage).toBe('Hi');
    expect(result.input.recipientSource).toBe('manual');
  });
});

describe('send_zalo_group — bulk simple message', () => {
  function makeNode(config = {}) {
    return { id: 'gr', type: 'send_zalo_group', data: { nodeType: 'send_zalo_group', config } };
  }

  it('thiếu TK → throw', async () => {
    const deps = createDeps();
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await expect(buildRunResultForNode(makeNode({}), {})).rejects.toThrow(/Chưa có tài khoản Zalo gửi/);
  });

  it('payload: 1 request với groupIds[], message trim', async () => {
    const deps = createDeps();
    deps.apiService.sendPreviewZaloGroup.mockResolvedValue({
      data: {
        data: {
          items: [
            { groupId: 'g1', status: 'success' },
            { groupId: 'g2', status: 'success' },
          ],
        },
      },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({ zaloGroupSource: 'manual', zaloGroupIds: 'g1, g2', zaloGroupMessage: '  Hi all  ' }),
      makeCtx()
    );
    expect(deps.apiService.sendPreviewZaloGroup).toHaveBeenCalledTimes(1);
    const payload = deps.apiService.sendPreviewZaloGroup.mock.calls[0][0];
    expect(payload.groupIds).toEqual(['g1', 'g2']);
    expect(payload.message).toBe('Hi all');
    expect(result.output.items).toHaveLength(2);
    expect(result.output.meta.sent).toBe(2);
  });

  it('groupSource=node → groupIds từ items[field]', async () => {
    const deps = createDeps();
    deps.apiService.sendPreviewZaloGroup.mockResolvedValue({ data: { data: { items: [] } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await buildRunResultForNode(
      makeNode({
        zaloGroupSource: 'node',
        zaloGroupNodeId: 'src',
        zaloGroupField: 'groupId',
      }),
      makeCtx({
        nodeResultsById: {
          src: { output: { items: [{ groupId: 'g1' }, { groupId: 'g2' }] } },
        },
      })
    );
    expect(deps.apiService.sendPreviewZaloGroup.mock.calls[0][0].groupIds).toEqual(['g1', 'g2']);
  });

  it('item.groupId meta build: groupName fallback từ entry.row.title', async () => {
    const deps = createDeps();
    deps.apiService.sendPreviewZaloGroup.mockResolvedValue({
      data: { data: { items: [{ groupId: 'g1', status: 'success' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        zaloGroupSource: 'node',
        zaloGroupNodeId: 'src',
        zaloGroupField: 'groupId',
      }),
      makeCtx({
        nodeResultsById: {
          src: { output: { items: [{ groupId: 'g1', title: 'Group VIP' }] } },
        },
      })
    );
    expect(result.output.items[0].groupName).toBe('Group VIP');
  });
});

describe('send_zalo_group — multi-template-steps', () => {
  function makeNode(config = {}) {
    return { id: 'gr', type: 'send_zalo_group', data: { nodeType: 'send_zalo_group', config } };
  }

  it('template.message rỗng → throw', async () => {
    const deps = createDeps();
    deps.apiService.getZaloTemplateById.mockResolvedValue({
      data: { data: { bodyText: '' } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await expect(
      buildRunResultForNode(
        makeNode({
          zaloGroupSource: 'manual',
          zaloGroupIds: 'g1',
          zaloGroupTemplateSteps: [{ templateId: 10 }],
        }),
        makeCtx()
      )
    ).rejects.toThrow('Template Zalo không có nội dung để gửi');
  });

  it('1 step × 2 groups → 2 API calls, mỗi call 1 groupId', async () => {
    const deps = createDeps();
    deps.apiService.getZaloTemplateById.mockResolvedValue({
      data: { data: { bodyText: 'Hello group!', attachments: [] } },
    });
    deps.apiService.sendPreviewZaloGroup.mockResolvedValue({
      data: { data: { items: [{ status: 'success' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        zaloGroupSource: 'manual',
        zaloGroupIds: 'g1,g2',
        zaloGroupTemplateSteps: [{ templateId: 10 }],
      }),
      makeCtx()
    );
    expect(deps.apiService.sendPreviewZaloGroup).toHaveBeenCalledTimes(2);
    deps.apiService.sendPreviewZaloGroup.mock.calls.forEach(([p]) => {
      expect(p.groupIds).toHaveLength(1);
      expect(p.message).toBe('Hello group!');
    });
    expect(result.output.items).toHaveLength(2);
    expect(result.output.items[0].templateId).toBe(10);
    expect(result.output.items[0].stepIndex).toBe(1);
  });

  it('mappings render qua renderTemplateString; attachments forward', async () => {
    const deps = createDeps();
    deps.apiService.getZaloTemplateById.mockResolvedValue({
      data: { data: { bodyText: 'Xin chào {{name}}', attachments: [{ key: 'uploads/a.jpg' }] } },
    });
    deps.apiService.sendPreviewZaloGroup.mockResolvedValue({
      data: { data: { items: [{ status: 'success' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await buildRunResultForNode(
      makeNode({
        zaloGroupSource: 'manual',
        zaloGroupIds: 'g1',
        zaloGroupTemplateSteps: [
          {
            templateId: 10,
            templateMappings: [{ key: 'name', sourceType: 'manual', value: 'Bạn' }],
          },
        ],
      }),
      makeCtx()
    );
    const payload = deps.apiService.sendPreviewZaloGroup.mock.calls[0][0];
    expect(payload.message).toBe('Xin chào Bạn');
    expect(payload.attachments).toEqual([{ key: 'uploads/a.jpg' }]);
  });

  it('2 steps × 1 group → 2 API calls; meta.totalItems = groupIds × steps', async () => {
    const deps = createDeps();
    deps.apiService.getZaloTemplateById
      .mockResolvedValueOnce({ data: { data: { bodyText: 'S1', attachments: [] } } })
      .mockResolvedValueOnce({ data: { data: { bodyText: 'S2', attachments: [] } } });
    deps.apiService.sendPreviewZaloGroup.mockResolvedValue({
      data: { data: { items: [{ status: 'success' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        zaloGroupSource: 'manual',
        zaloGroupIds: 'g1',
        zaloGroupTemplateSteps: [{ templateId: 10 }, { templateId: 11 }],
      }),
      makeCtx()
    );
    expect(result.output.meta.totalItems).toBe(2);
    expect(result.output.items[0].stepIndex).toBe(1);
    expect(result.output.items[1].stepIndex).toBe(2);
  });
});

describe('fallback nodeType chưa khớp', () => {
  it('nodeType lạ → trả { input: config, output: { ok: true } }', async () => {
    const deps = createDeps();
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      { id: 'x', type: 'unknown', data: { nodeType: 'unknown_xyz', config: { foo: 'bar' } } },
      {}
    );
    expect(result).toEqual({ input: { foo: 'bar' }, output: { ok: true } });
  });

  it('nodeType undefined → fallback', async () => {
    const deps = createDeps();
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode({ id: 'x', data: { config: { a: 1 } } }, {});
    expect(result.output.ok).toBe(true);
  });
});
