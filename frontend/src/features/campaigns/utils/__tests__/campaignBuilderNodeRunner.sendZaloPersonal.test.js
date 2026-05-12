import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCampaignNodeRunner } from '../campaignBuilderNodeRunner.js';

/**
 * B14d: send_zalo_personal node
 * - Bulk simple message mode (no templateSteps)
 * - Multi-template-steps mode (1+ template steps)
 * - Pool parallel vs single-account sequential
 *
 * Math.random mock về 0 → delay tối thiểu (zalo: 25ms; email: 50ms) tránh test chậm.
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

function makeNode(config = {}) {
  return { id: 'zalo-p', type: 'send_zalo_personal', data: { nodeType: 'send_zalo_personal', config } };
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

describe('send_zalo_personal — bulk simple message mode', () => {
  it('không có TK được chọn → throw', async () => {
    const deps = createDeps();
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await expect(buildRunResultForNode(makeNode({}), {})).rejects.toThrow(/Chưa có tài khoản Zalo gửi/);
  });

  it('recipients manual → parse, payload có accountId + recipientType="phone" mặc định + message', async () => {
    const deps = createDeps();
    deps.apiService.sendPreviewZaloPersonal.mockResolvedValue({
      data: {
        data: {
          items: [
            { recipient: '0901', status: 'success' },
            { recipient: '0902', status: 'success' },
          ],
        },
      },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        zaloRecipientSource: 'manual',
        zaloRecipientPhones: '0901\n0902',
        zaloMessage: '  Xin chào  ',
      }),
      makeCtx()
    );
    const payload = deps.apiService.sendPreviewZaloPersonal.mock.calls[0][0];
    expect(payload.accountId).toBe('acc-1');
    expect(payload.recipientType).toBe('phone');
    expect(payload.message).toBe('Xin chào');
    expect(payload.recipients).toEqual(['0901', '0902']);
    expect(result.output.items).toHaveLength(2);
    expect(result.output.meta.sent).toBe(2);
  });

  it('recipientType "uid" được forward', async () => {
    const deps = createDeps();
    deps.apiService.sendPreviewZaloPersonal.mockResolvedValue({ data: { data: { items: [] } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await buildRunResultForNode(
      makeNode({
        zaloRecipientSource: 'manual',
        zaloRecipientType: 'uid',
        zaloRecipientPhones: 'uid-1',
      }),
      makeCtx()
    );
    expect(deps.apiService.sendPreviewZaloPersonal.mock.calls[0][0].recipientType).toBe('uid');
  });

  it('recipientSource=node → entries từ items[field]', async () => {
    const deps = createDeps();
    deps.apiService.sendPreviewZaloPersonal.mockResolvedValue({ data: { data: { items: [] } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await buildRunResultForNode(
      makeNode({
        zaloRecipientSource: 'node',
        zaloRecipientNodeId: 'src',
        zaloRecipientField: 'phone',
      }),
      makeCtx({
        nodeResultsById: {
          src: { output: { items: [{ phone: '0901' }, { phone: '0902' }] } },
        },
      })
    );
    expect(deps.apiService.sendPreviewZaloPersonal.mock.calls[0][0].recipients).toEqual(['0901', '0902']);
  });

  it('item.status=success → mark recipient completed; failed → not marked', async () => {
    const deps = createDeps();
    deps.apiService.sendPreviewZaloPersonal.mockResolvedValue({
      data: {
        data: {
          items: [
            { recipient: '0901', status: 'success' },
            { recipient: '0902', status: 'failed', error: 'blocked' },
          ],
        },
      },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = makeCtx();
    const result = await buildRunResultForNode(
      makeNode({ zaloRecipientSource: 'manual', zaloRecipientPhones: '0901, 0902', zaloMessage: 'hi' }),
      ctx
    );
    expect(result.output.meta.sent).toBe(1);
    expect(result.output.meta.failed).toBe(1);

    expect(ctx.recipientProgressByNode).toBeInstanceOf(Map);
    const progress = ctx.recipientProgressByNode.get('zalo_personal:zalo-p');
    expect(progress.get('0901')).toBe(1);
    expect(progress.has('0902')).toBe(false);
  });

  it('onProgress được gọi mỗi item với attempted/totalItems', async () => {
    const deps = createDeps();
    deps.apiService.sendPreviewZaloPersonal.mockResolvedValue({
      data: {
        data: {
          items: [
            { recipient: '0901', status: 'success' },
            { recipient: '0902', status: 'success' },
          ],
        },
      },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const onProgress = vi.fn();
    await buildRunResultForNode(
      makeNode({ zaloRecipientSource: 'manual', zaloRecipientPhones: '0901,0902', zaloMessage: 'hi' }),
      makeCtx(),
      { onProgress }
    );
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress.mock.calls[1][0].result.output.meta.attempted).toBe(2);
  });

  it('pool TK > 1 → mỗi recipient gọi 1 request riêng (Promise.all batches)', async () => {
    const deps = createDeps();
    deps.apiService.sendPreviewZaloPersonal.mockResolvedValue({
      data: { data: { items: [{ recipient: 'x', status: 'success' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = makeCtx({
      zaloPoolFromSelect: ['acc-1', 'acc-2'],
      zaloPoolAccountById: new Map([
        ['acc-1', { id: 'acc-1', displayName: 'A1', status: 'connected', isActive: true }],
        ['acc-2', { id: 'acc-2', displayName: 'A2', status: 'connected', isActive: true }],
      ]),
    });
    await buildRunResultForNode(
      makeNode({ zaloRecipientSource: 'manual', zaloRecipientPhones: '0901,0902,0903,0904', zaloMessage: 'hi' }),
      ctx
    );
    expect(deps.apiService.sendPreviewZaloPersonal).toHaveBeenCalledTimes(4);
    deps.apiService.sendPreviewZaloPersonal.mock.calls.forEach(([p]) => {
      expect(p.recipients).toHaveLength(1);
    });
  });

  it('item.recipient meta build: sentAt từ API, fallback senderName từ account', async () => {
    const deps = createDeps();
    deps.apiService.sendPreviewZaloPersonal.mockResolvedValue({
      data: { data: { items: [{ recipient: '0901', status: 'success', sentAt: '2026-05-12T00:00:00Z' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({ zaloRecipientSource: 'manual', zaloRecipientPhones: '0901', zaloMessage: 'hi' }),
      makeCtx()
    );
    expect(result.output.items[0].sentAt).toBe('2026-05-12T00:00:00Z');
    expect(result.output.items[0].senderName).toBe('Main');
  });

  it('input echo recipientSource/Type/message/accountName', async () => {
    const deps = createDeps();
    deps.apiService.sendPreviewZaloPersonal.mockResolvedValue({ data: { data: { items: [] } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        zaloRecipientSource: 'manual',
        zaloRecipientType: 'phone',
        zaloRecipientPhones: '0901',
        zaloMessage: 'hi',
      }),
      makeCtx()
    );
    expect(result.input.accountId).toBe('acc-1');
    expect(result.input.accountName).toBe('Main');
    expect(result.input.recipientSource).toBe('manual');
    expect(result.input.recipientType).toBe('phone');
    expect(result.input.message).toBe('hi');
    expect(result.input.recipientPhones).toBe('0901');
    expect(result.input.recipientNodeId).toBe(null);
  });
});

describe('send_zalo_personal — multi-template-steps mode', () => {
  it('template.message rỗng → throw "Template Zalo không có nội dung để gửi"', async () => {
    const deps = createDeps();
    deps.apiService.getZaloTemplateById.mockResolvedValue({
      data: { data: { bodyText: '', bodyHtml: '', attachments: [] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await expect(
      buildRunResultForNode(
        makeNode({
          zaloRecipientSource: 'manual',
          zaloRecipientPhones: '0901',
          zaloPersonalTemplateSteps: [{ templateId: 10 }],
        }),
        makeCtx()
      )
    ).rejects.toThrow('Template Zalo không có nội dung để gửi');
  });

  it('1 step × 1 recipient → 1 API call sendPreviewZaloPersonal với message từ template', async () => {
    const deps = createDeps();
    deps.apiService.getZaloTemplateById.mockResolvedValue({
      data: { data: { bodyText: 'Hello!', attachments: [] } },
    });
    deps.apiService.sendPreviewZaloPersonal.mockResolvedValue({
      data: { data: { items: [{ recipient: '0901', status: 'success' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        zaloRecipientSource: 'manual',
        zaloRecipientPhones: '0901',
        zaloPersonalTemplateSteps: [{ templateId: 10 }],
      }),
      makeCtx()
    );
    expect(deps.apiService.sendPreviewZaloPersonal.mock.calls[0][0].message).toBe('Hello!');
    expect(result.output.items[0].templateId).toBe(10);
    expect(result.output.items[0].stepIndex).toBe(1);
  });

  it('mappings render qua renderTemplateString với variables resolve', async () => {
    const deps = createDeps();
    deps.apiService.getZaloTemplateById.mockResolvedValue({
      data: { data: { bodyText: 'Xin chào {{name}}', attachments: [] } },
    });
    deps.apiService.sendPreviewZaloPersonal.mockResolvedValue({
      data: { data: { items: [{ recipient: '0901', status: 'success' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await buildRunResultForNode(
      makeNode({
        zaloRecipientSource: 'manual',
        zaloRecipientPhones: '0901',
        zaloPersonalTemplateSteps: [
          {
            templateId: 10,
            templateMappings: [{ key: 'name', sourceType: 'manual', value: 'An' }],
          },
        ],
      }),
      makeCtx()
    );
    expect(deps.apiService.sendPreviewZaloPersonal.mock.calls[0][0].message).toBe('Xin chào An');
  });

  it('attachments từ template → forward sang payload', async () => {
    const deps = createDeps();
    deps.apiService.getZaloTemplateById.mockResolvedValue({
      data: { data: { bodyText: 'hi', attachments: [{ key: 'uploads/a.jpg' }] } },
    });
    deps.apiService.sendPreviewZaloPersonal.mockResolvedValue({
      data: { data: { items: [{ recipient: '0901', status: 'success' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        zaloRecipientSource: 'manual',
        zaloRecipientPhones: '0901',
        zaloPersonalTemplateSteps: [{ templateId: 10 }],
      }),
      makeCtx()
    );
    expect(deps.apiService.sendPreviewZaloPersonal.mock.calls[0][0].attachments).toEqual([
      { key: 'uploads/a.jpg' },
    ]);
    expect(result.output.items[0].attachments).toEqual([{ key: 'uploads/a.jpg' }]);
    expect(result.output.items[0].attachmentsCount).toBe(1);
  });

  it('2 steps × 1 recipient → 2 API calls, stepIndex 1 và 2; templateContentCache dùng lại', async () => {
    const deps = createDeps();
    deps.apiService.getZaloTemplateById
      .mockResolvedValueOnce({ data: { data: { bodyText: 'S1', attachments: [] } } })
      .mockResolvedValueOnce({ data: { data: { bodyText: 'S2', attachments: [] } } });
    deps.apiService.sendPreviewZaloPersonal.mockResolvedValue({
      data: { data: { items: [{ recipient: '0901', status: 'success' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        zaloRecipientSource: 'manual',
        zaloRecipientPhones: '0901',
        zaloPersonalTemplateSteps: [{ templateId: 10 }, { templateId: 11 }],
      }),
      makeCtx()
    );
    expect(result.output.items).toHaveLength(2);
    expect(result.output.items[0].stepIndex).toBe(1);
    expect(result.output.items[1].stepIndex).toBe(2);
    expect(deps.apiService.sendPreviewZaloPersonal).toHaveBeenCalledTimes(2);
  });

  it('pool TK > 1 → batch song song theo poolSize (2 TK, 4 recipients = 2 batch × 2 song song)', async () => {
    const deps = createDeps();
    deps.apiService.getZaloTemplateById.mockResolvedValue({
      data: { data: { bodyText: 'hi', attachments: [] } },
    });
    deps.apiService.sendPreviewZaloPersonal.mockResolvedValue({
      data: { data: { items: [{ recipient: 'x', status: 'success' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = makeCtx({
      zaloPoolFromSelect: ['acc-1', 'acc-2'],
      zaloPoolAccountById: new Map([
        ['acc-1', { id: 'acc-1', displayName: 'A1', status: 'connected', isActive: true }],
        ['acc-2', { id: 'acc-2', displayName: 'A2', status: 'connected', isActive: true }],
      ]),
    });
    await buildRunResultForNode(
      makeNode({
        zaloRecipientSource: 'manual',
        zaloRecipientPhones: '0901,0902,0903,0904',
        zaloPersonalTemplateSteps: [{ templateId: 10 }],
      }),
      ctx
    );
    expect(deps.apiService.sendPreviewZaloPersonal).toHaveBeenCalledTimes(4);
  });

  it('item success → mark progress; skip step tiếp theo nếu đã completed', async () => {
    const deps = createDeps();
    deps.apiService.getZaloTemplateById.mockResolvedValue({
      data: { data: { bodyText: 'hi', attachments: [] } },
    });
    deps.apiService.sendPreviewZaloPersonal.mockResolvedValue({
      data: { data: { items: [{ recipient: '0901', status: 'success' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = makeCtx();
    await buildRunResultForNode(
      makeNode({
        zaloRecipientSource: 'manual',
        zaloRecipientPhones: '0901',
        zaloPersonalTemplateSteps: [{ templateId: 10 }],
      }),
      ctx
    );
    const progress = ctx.recipientProgressByNode.get('zalo_personal:zalo-p');
    expect(progress.get('0901')).toBe(1);
  });

  it('templateSteps: input echo accountId + templateSteps; meta.totalItems = recipients × steps', async () => {
    const deps = createDeps();
    deps.apiService.getZaloTemplateById.mockResolvedValue({
      data: { data: { bodyText: 'hi', attachments: [] } },
    });
    deps.apiService.sendPreviewZaloPersonal.mockResolvedValue({
      data: { data: { items: [{ recipient: 'x', status: 'success' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        zaloRecipientSource: 'manual',
        zaloRecipientPhones: '0901,0902',
        zaloPersonalTemplateSteps: [{ templateId: 10 }, { templateId: 11 }],
      }),
      makeCtx()
    );
    expect(result.input.accountId).toBe('acc-1');
    expect(result.input.templateSteps).toHaveLength(2);
    expect(result.output.meta.totalItems).toBe(4);
    expect(result.output.meta.attempted).toBe(4);
    expect(result.output.meta.sent).toBe(4);
  });

  it('pool >1 → input có zaloPoolMultiAccountEnabled + zaloPoolAccountIds', async () => {
    const deps = createDeps();
    deps.apiService.getZaloTemplateById.mockResolvedValue({
      data: { data: { bodyText: 'hi', attachments: [] } },
    });
    deps.apiService.sendPreviewZaloPersonal.mockResolvedValue({
      data: { data: { items: [{ recipient: 'x', status: 'success' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = makeCtx({
      zaloPoolFromSelect: ['acc-1', 'acc-2'],
      zaloPoolAccountById: new Map([
        ['acc-1', { id: 'acc-1', displayName: 'A1', status: 'connected', isActive: true }],
        ['acc-2', { id: 'acc-2', displayName: 'A2', status: 'connected', isActive: true }],
      ]),
    });
    const result = await buildRunResultForNode(
      makeNode({
        zaloRecipientSource: 'manual',
        zaloRecipientPhones: '0901',
        zaloPersonalTemplateSteps: [{ templateId: 10 }],
      }),
      ctx
    );
    expect(result.input.zaloPoolMultiAccountEnabled).toBe(true);
    expect(result.input.zaloPoolAccountIds).toEqual(['acc-1', 'acc-2']);
  });
});
