import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCampaignNodeRunner } from '../campaignBuilderNodeRunner.js';

/**
 * B14c: send_email node
 *
 * Lưu ý timing: skipApiDelay=true cho từng send trong wave (theo source code),
 * nhưng giữa các recipient có `waitRandomTemplateStepDelay` 50-250ms.
 * Test mock Math.random về 0 để delay luôn = minMs (50ms) → tổng <2s/test với 2-3 recipient.
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
    applyMappingsForRow: vi.fn((row, mappings) => {
      const out = {};
      (Array.isArray(mappings) ? mappings : []).forEach((m) => {
        out[m.variableName] = row?.[m.column];
      });
      return out;
    }),
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
  return { id: 'mail', type: 'send_email', data: { nodeType: 'send_email', config } };
}

function makeCtx(extras = {}) {
  return { templateCache: new Map(), ...extras };
}

function setupTemplate(deps, { id = 10, subject = 'Hi {{name}}', bodyHtml = '<p>{{body}}</p>', bodyText = 'plain', attachments = [] } = {}) {
  deps.apiService.getEmailTemplateById.mockResolvedValue({
    data: { data: { id, subject, bodyHtml, bodyText, attachments } },
  });
}

let randomSpy;
beforeEach(() => {
  vi.clearAllMocks();
  randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
});

afterEach(() => {
  randomSpy.mockRestore();
});

describe('send_email — recipient resolution', () => {
  it('manual → parseEmailList(config.recipientEmails); unique lowercase', async () => {
    const deps = createDeps();
    setupTemplate(deps);
    deps.apiService.sendPreviewEmail.mockResolvedValue({ data: { data: { messageId: 'm1' } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        recipientSource: 'manual',
        recipientEmails: 'A@x.com, b@x.com\nA@X.COM',
        fromEmailId: 1,
        emailSteps: [{ templateId: 10 }],
      }),
      makeCtx()
    );
    expect(result.output.items).toHaveLength(2);
    expect(deps.apiService.sendPreviewEmail).toHaveBeenCalledTimes(2);
  });

  it('node + thiếu source → throw "Chưa có dữ liệu từ node đã chọn"', async () => {
    const deps = createDeps();
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await expect(
      buildRunResultForNode(
        makeNode({
          recipientSource: 'node',
          recipientNodeId: 'missing',
          recipientField: 'email',
          emailSteps: [{ templateId: 10 }],
        }),
        { nodeResultsById: {} }
      )
    ).rejects.toThrow('Chưa có dữ liệu từ node đã chọn');
  });

  it('node + thiếu field → throw "Chưa chọn cột email"', async () => {
    const deps = createDeps();
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await expect(
      buildRunResultForNode(
        makeNode({
          recipientSource: 'node',
          recipientNodeId: 'src',
          recipientField: '',
          emailSteps: [{ templateId: 10 }],
        }),
        { nodeResultsById: { src: { output: { items: [{ email: 'a@b' }] } } } }
      )
    ).rejects.toThrow('Chưa chọn cột email');
  });

  it('node → push từng email từ items[field]; mảng cũng được trải', async () => {
    const deps = createDeps();
    setupTemplate(deps);
    deps.apiService.sendPreviewEmail.mockResolvedValue({ data: { data: { messageId: 'm' } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = makeCtx({
      nodeResultsById: {
        src: {
          output: {
            items: [
              { email: 'a@x.com' },
              { email: ['b@x.com', 'c@x.com'] },
            ],
          },
        },
      },
    });
    const result = await buildRunResultForNode(
      makeNode({
        recipientSource: 'node',
        recipientNodeId: 'src',
        recipientField: 'email',
        fromEmailId: 1,
        emailSteps: [{ templateId: 10 }],
      }),
      ctx
    );
    expect(result.output.items).toHaveLength(3);
  });

  it('default (column) → từ ctx.sheetRows + resolveColumnKey', async () => {
    const deps = createDeps();
    setupTemplate(deps);
    deps.apiService.sendPreviewEmail.mockResolvedValue({ data: { data: { messageId: 'm' } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = makeCtx({ sheetRows: [{ Email: 'a@x' }, { Email: 'b@x' }] });
    deps.resolveColumnKey.mockImplementation(() => 'Email');
    await buildRunResultForNode(
      makeNode({
        recipientColumn: 'Email',
        fromEmailId: 1,
        emailSteps: [{ templateId: 10 }],
      }),
      ctx
    );
    expect(deps.apiService.sendPreviewEmail).toHaveBeenCalledTimes(2);
  });

  it('maxSendEnabled + maxSendCount → slice recipients; meta.limitedTo', async () => {
    const deps = createDeps();
    setupTemplate(deps);
    deps.apiService.sendPreviewEmail.mockResolvedValue({ data: { data: { messageId: 'm' } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        recipientSource: 'manual',
        recipientEmails: 'a@x, b@x, c@x, d@x',
        maxSendEnabled: true,
        maxSendCount: 2,
        fromEmailId: 1,
        emailSteps: [{ templateId: 10 }],
      }),
      makeCtx()
    );
    expect(result.output.items).toHaveLength(2);
    expect(result.output.meta.limitedTo).toBe(2);
  });
});

describe('send_email — CC/BCC', () => {
  it('ccEnabled=false → ccList rỗng', async () => {
    const deps = createDeps();
    setupTemplate(deps);
    deps.apiService.sendPreviewEmail.mockResolvedValue({ data: { data: { messageId: 'm' } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await buildRunResultForNode(
      makeNode({
        recipientSource: 'manual',
        recipientEmails: 'a@x',
        fromEmailId: 1,
        emailSteps: [{ templateId: 10 }],
      }),
      makeCtx()
    );
    expect(deps.apiService.sendPreviewEmail.mock.calls[0][0].cc).toEqual([]);
    expect(deps.apiService.sendPreviewEmail.mock.calls[0][0].bcc).toEqual([]);
  });

  it('ccEnabled + ccSource=manual → cc emails parse từ ccEmails; bcc tương tự', async () => {
    const deps = createDeps();
    setupTemplate(deps);
    deps.apiService.sendPreviewEmail.mockResolvedValue({ data: { data: { messageId: 'm' } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await buildRunResultForNode(
      makeNode({
        recipientSource: 'manual',
        recipientEmails: 'a@x',
        ccEnabled: true,
        ccSource: 'manual',
        ccEmails: 'cc1@x, cc2@x',
        bccEnabled: true,
        bccSource: 'manual',
        bccEmails: 'bcc@x',
        fromEmailId: 1,
        emailSteps: [{ templateId: 10 }],
      }),
      makeCtx()
    );
    expect(deps.apiService.sendPreviewEmail.mock.calls[0][0].cc).toEqual(['cc1@x', 'cc2@x']);
    expect(deps.apiService.sendPreviewEmail.mock.calls[0][0].bcc).toEqual(['bcc@x']);
  });
});

describe('send_email — template & API responses', () => {
  it('template không tìm thấy (null từ API) → status="failed" với error', async () => {
    const deps = createDeps();
    deps.apiService.getEmailTemplateById.mockResolvedValue({ data: { data: null } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        recipientSource: 'manual',
        recipientEmails: 'a@x',
        fromEmailId: 1,
        emailSteps: [{ templateId: 99 }],
      }),
      makeCtx()
    );
    expect(result.output.items[0].status).toBe('failed');
    expect(result.output.items[0].error).toBe('Không tìm thấy template email');
    expect(deps.apiService.sendPreviewEmail).not.toHaveBeenCalled();
  });

  it('success → status="success", messageId/sentAt/tracking từ response', async () => {
    const deps = createDeps();
    setupTemplate(deps);
    deps.apiService.sendPreviewEmail.mockResolvedValue({
      data: { data: { messageId: 'msg-1', from: 'noreply@u', sentAt: '2026-05-01', tracking: { ok: 1 } } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        recipientSource: 'manual',
        recipientEmails: 'a@x',
        fromEmailId: 1,
        emailSteps: [{ templateId: 10 }],
      }),
      makeCtx()
    );
    const item = result.output.items[0];
    expect(item.status).toBe('success');
    expect(item.messageId).toBe('msg-1');
    expect(item.from).toBe('noreply@u');
    expect(item.tracking).toEqual({ ok: 1 });
    expect(result.output.meta.sent).toBe(1);
  });

  it('skipped reason=unsubscribed → status="skipped"', async () => {
    const deps = createDeps();
    setupTemplate(deps);
    deps.apiService.sendPreviewEmail.mockRejectedValue({
      response: { data: { data: { skipped: true, reason: 'unsubscribed' } } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        recipientSource: 'manual',
        recipientEmails: 'a@x',
        fromEmailId: 1,
        emailSteps: [{ templateId: 10 }],
      }),
      makeCtx()
    );
    expect(result.output.items[0].status).toBe('skipped');
    expect(result.output.items[0].reason).toBe('unsubscribed');
  });

  it('bounced → status="bounced" + bounceType/bounceReason', async () => {
    const deps = createDeps();
    setupTemplate(deps);
    deps.apiService.sendPreviewEmail.mockRejectedValue({
      response: { data: { data: { bounced: true, bounceType: 'hard', bounceReason: '550 5.1.1' } } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        recipientSource: 'manual',
        recipientEmails: 'a@x',
        fromEmailId: 1,
        emailSteps: [{ templateId: 10 }],
      }),
      makeCtx()
    );
    expect(result.output.items[0].status).toBe('bounced');
    expect(result.output.items[0].bounceType).toBe('hard');
    expect(result.output.items[0].bounceReason).toBe('550 5.1.1');
  });

  it('errorType=smtp_config → status="failed" + errorType', async () => {
    const deps = createDeps();
    setupTemplate(deps);
    deps.apiService.sendPreviewEmail.mockRejectedValue({
      response: { data: { data: { errorType: 'smtp_config', error: '535 Auth' } } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        recipientSource: 'manual',
        recipientEmails: 'a@x',
        fromEmailId: 1,
        emailSteps: [{ templateId: 10 }],
      }),
      makeCtx()
    );
    expect(result.output.items[0].status).toBe('failed');
    expect(result.output.items[0].errorType).toBe('smtp_config');
    expect(result.output.items[0].error).toBe('535 Auth');
  });

  it('error chung không có response.data → status="failed" với fallback message', async () => {
    const deps = createDeps();
    setupTemplate(deps);
    deps.apiService.sendPreviewEmail.mockRejectedValue(new Error('network down'));
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        recipientSource: 'manual',
        recipientEmails: 'a@x',
        fromEmailId: 1,
        emailSteps: [{ templateId: 10 }],
      }),
      makeCtx()
    );
    expect(result.output.items[0].status).toBe('failed');
    expect(result.output.items[0].error).toBe('network down');
  });

  it('isRunCancelledError true → throw để executor xử lý cancel', async () => {
    const deps = createDeps();
    setupTemplate(deps);
    deps.apiService.sendPreviewEmail.mockRejectedValue(new Error('cancelled'));
    deps.isRunCancelledError.mockReturnValue(true);
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await expect(
      buildRunResultForNode(
        makeNode({
          recipientSource: 'manual',
          recipientEmails: 'a@x',
          fromEmailId: 1,
          emailSteps: [{ templateId: 10 }],
        }),
        makeCtx()
      )
    ).rejects.toThrow('cancelled');
  });

  it('tracking warnings → toastNotifier.error gọi với id "tracking-base-url-warning"', async () => {
    const deps = createDeps();
    setupTemplate(deps);
    deps.apiService.sendPreviewEmail.mockResolvedValue({
      data: { data: { messageId: 'm', tracking: { warnings: ['TRACKING_BASE_URL chưa cấu hình'] } } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await buildRunResultForNode(
      makeNode({
        recipientSource: 'manual',
        recipientEmails: 'a@x',
        fromEmailId: 1,
        emailSteps: [{ templateId: 10 }],
      }),
      makeCtx()
    );
    expect(deps.toastNotifier.error).toHaveBeenCalledWith(
      'TRACKING_BASE_URL chưa cấu hình',
      { id: 'tracking-base-url-warning' }
    );
  });
});

describe('send_email — template variables + UTM', () => {
  it('mapping manual + URL value → addUtmToUrl (utm_source + utm_campaign)', async () => {
    const deps = createDeps({ campaignId: 42 });
    setupTemplate(deps, { subject: '{{cta}}', bodyHtml: '<a>{{cta}}</a>' });
    deps.apiService.sendPreviewEmail.mockResolvedValue({ data: { data: { messageId: 'm' } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await buildRunResultForNode(
      makeNode({
        recipientSource: 'manual',
        recipientEmails: 'a@x',
        fromEmailId: 1,
        emailSteps: [
          {
            templateId: 10,
            templateMappings: [
              { key: 'cta', sourceType: 'manual', value: 'https://founderai.biz/course' },
            ],
          },
        ],
      }),
      makeCtx()
    );
    const subject = deps.apiService.sendPreviewEmail.mock.calls[0][0].subject;
    expect(subject).toContain('utm_source=email_campaign');
    expect(subject).toContain('utm_campaign=42');
  });

  it('URL có sẵn utm_source → KHÔNG ghi đè', async () => {
    const deps = createDeps({ campaignId: 42 });
    setupTemplate(deps, { subject: '{{cta}}', bodyHtml: '<a>{{cta}}</a>' });
    deps.apiService.sendPreviewEmail.mockResolvedValue({ data: { data: { messageId: 'm' } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await buildRunResultForNode(
      makeNode({
        recipientSource: 'manual',
        recipientEmails: 'a@x',
        fromEmailId: 1,
        emailSteps: [
          {
            templateId: 10,
            templateMappings: [
              { key: 'cta', sourceType: 'manual', value: 'https://x.com/?utm_source=manual' },
            ],
          },
        ],
      }),
      makeCtx()
    );
    const subject = deps.apiService.sendPreviewEmail.mock.calls[0][0].subject;
    expect(subject).toBe('https://x.com/?utm_source=manual&utm_campaign=42');
  });

  it('mapping node + field tên có "url" → addUtmToUrl', async () => {
    const deps = createDeps({ campaignId: 42 });
    setupTemplate(deps, { subject: '{{url}}', bodyHtml: '{{url}}' });
    deps.apiService.sendPreviewEmail.mockResolvedValue({ data: { data: { messageId: 'm' } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = makeCtx({
      nodeResultsById: {
        crs: { output: { items: [{ courseUrl: 'https://founderai.biz/x' }] } },
      },
    });
    await buildRunResultForNode(
      makeNode({
        recipientSource: 'manual',
        recipientEmails: 'a@x',
        fromEmailId: 1,
        emailSteps: [
          {
            templateId: 10,
            templateMappings: [
              { key: 'url', sourceType: 'node', nodeId: 'crs', field: 'courseUrl' },
            ],
          },
        ],
      }),
      ctx
    );
    const subject = deps.apiService.sendPreviewEmail.mock.calls[0][0].subject;
    expect(subject).toContain('utm_source=email_campaign');
  });
});

describe('send_email — multi-step + progress', () => {
  it('2 steps × 1 recipient → 2 send results theo thứ tự, stepIndex 1/2', async () => {
    const deps = createDeps();
    setupTemplate(deps);
    deps.apiService.sendPreviewEmail.mockResolvedValue({ data: { data: { messageId: 'm' } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        recipientSource: 'manual',
        recipientEmails: 'a@x',
        fromEmailId: 1,
        emailSteps: [{ templateId: 10 }, { templateId: 11 }],
      }),
      makeCtx()
    );
    expect(result.output.items).toHaveLength(2);
    expect(result.output.items[0].stepIndex).toBe(1);
    expect(result.output.items[1].stepIndex).toBe(2);
  });

  it('unsubscribed ở step 1 → step 2 bỏ qua recipient này (chỉ 1 result)', async () => {
    const deps = createDeps();
    setupTemplate(deps);
    deps.apiService.sendPreviewEmail
      .mockRejectedValueOnce({
        response: { data: { data: { skipped: true, reason: 'unsubscribed' } } },
      });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        recipientSource: 'manual',
        recipientEmails: 'a@x',
        fromEmailId: 1,
        emailSteps: [{ templateId: 10 }, { templateId: 11 }],
      }),
      makeCtx()
    );
    expect(result.output.items).toHaveLength(1);
    expect(result.output.items[0].status).toBe('skipped');
    expect(deps.apiService.sendPreviewEmail).toHaveBeenCalledTimes(1);
  });

  it('onProgress được gọi sau mỗi send với attempted/sent counts', async () => {
    const deps = createDeps();
    setupTemplate(deps);
    deps.apiService.sendPreviewEmail.mockResolvedValue({ data: { data: { messageId: 'm' } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const onProgress = vi.fn();
    await buildRunResultForNode(
      makeNode({
        recipientSource: 'manual',
        recipientEmails: 'a@x, b@x',
        fromEmailId: 1,
        emailSteps: [{ templateId: 10 }],
      }),
      makeCtx(),
      { onProgress }
    );
    expect(onProgress).toHaveBeenCalledTimes(2);
    const last = onProgress.mock.calls[1][0];
    expect(last.result.output.meta.attempted).toBe(2);
    expect(last.result.output.meta.sent).toBe(2);
  });

  it('input echo các config field (sendMode default "all", emailSteps, maxSendCount null khi disabled)', async () => {
    const deps = createDeps();
    setupTemplate(deps);
    deps.apiService.sendPreviewEmail.mockResolvedValue({ data: { data: { messageId: 'm' } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        recipientSource: 'manual',
        recipientEmails: 'a@x',
        fromEmailId: 9,
        emailSteps: [{ templateId: 10 }],
      }),
      makeCtx()
    );
    expect(result.input.fromEmailId).toBe(9);
    expect(result.input.recipientSource).toBe('manual');
    expect(result.input.sendMode).toBe('all');
    expect(result.input.maxSendEnabled).toBe(false);
    expect(result.input.maxSendCount).toBe(null);
    expect(result.input.emailSteps).toHaveLength(1);
  });

  it('payload sendPreviewEmail có previewMode/isPreview/builderMode=true; runId=null', async () => {
    const deps = createDeps();
    setupTemplate(deps);
    deps.apiService.sendPreviewEmail.mockResolvedValue({ data: { data: { messageId: 'm' } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await buildRunResultForNode(
      makeNode({
        recipientSource: 'manual',
        recipientEmails: 'a@x',
        fromEmailId: 1,
        emailSteps: [{ templateId: 10 }],
      }),
      makeCtx()
    );
    const payload = deps.apiService.sendPreviewEmail.mock.calls[0][0];
    expect(payload.previewMode).toBe(true);
    expect(payload.isPreview).toBe(true);
    expect(payload.builderMode).toBe(true);
    expect(payload.runId).toBe(null);
    expect(payload.saveMessageLog).toBe(false);
    expect(payload.customerId).toBe(null);
  });
});
