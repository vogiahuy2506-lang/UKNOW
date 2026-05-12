import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCampaignNodeRunner } from '../campaignBuilderNodeRunner.js';

/**
 * B14a: helpers (checkSheetConnection) + 4 read node types
 *   read_sheet, read_interested_customers, read_courses_db, read_landing_leads
 *
 * Utility imports (dataColumnSelection, builderLogItems, landingLeadsNodeLimits)
 * dùng thật để bao trùm pipeline meta.
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
    applyMappingsForRow: vi.fn((mapping, row) => ({ ...row })),
    normalizeKey: vi.fn((k) => String(k || '').trim().toLowerCase()),
    parseEmailList: vi.fn((text) =>
      String(text || '')
        .split(/[\n,;]/)
        .map((s) => s.trim())
        .filter(Boolean)
    ),
    renderTemplateString: vi.fn((tpl, vars) =>
      String(tpl || '').replace(/\{\{(\w+)\}\}/g, (_, k) => String(vars?.[k] ?? ''))
    ),
    resolveColumnKey: vi.fn((rows, ref) => String(ref || '')),
    readPreviewSessionData: vi.fn(() => null),
    writePreviewSessionData: vi.fn(),
    toastNotifier: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
    isRunCancelledError: vi.fn(() => false),
    logItemsMode: '100',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createCampaignNodeRunner — checkSheetConnection', () => {
  it('default sheetName "Sheet1" khi config rỗng/null/whitespace', async () => {
    const deps = createDeps();
    deps.apiService.checkGoogleSheet.mockResolvedValue({ data: { data: { ok: true } } });
    const { checkSheetConnection } = createCampaignNodeRunner(deps);

    await checkSheetConnection({ sheetUrl: 'https://x', sheetName: '   ' });
    await checkSheetConnection({ sheetUrl: 'https://x', sheetName: null });
    await checkSheetConnection({ sheetUrl: 'https://x' });

    deps.apiService.checkGoogleSheet.mock.calls.forEach(([payload]) => {
      expect(payload.sheetName).toBe('Sheet1');
    });
  });

  it('headerRow parse default 1 nếu NaN; clamp tối thiểu 1', async () => {
    const deps = createDeps();
    deps.apiService.checkGoogleSheet.mockResolvedValue({ data: { data: {} } });
    const { checkSheetConnection } = createCampaignNodeRunner(deps);

    await checkSheetConnection({ sheetUrl: 'https://x', headerRow: 'abc' });
    await checkSheetConnection({ sheetUrl: 'https://x', headerRow: -5 });
    await checkSheetConnection({ sheetUrl: 'https://x', headerRow: 3 });

    expect(deps.apiService.checkGoogleSheet.mock.calls[0][0].headerRow).toBe(1);
    expect(deps.apiService.checkGoogleSheet.mock.calls[1][0].headerRow).toBe(1);
    expect(deps.apiService.checkGoogleSheet.mock.calls[2][0].headerRow).toBe(3);
  });

  it('trả response.data?.data', async () => {
    const deps = createDeps();
    deps.apiService.checkGoogleSheet.mockResolvedValue({ data: { data: { spreadsheetId: 'sp-1' } } });
    const { checkSheetConnection } = createCampaignNodeRunner(deps);
    const out = await checkSheetConnection({ sheetUrl: 'https://x', sheetName: 'Tab' });
    expect(out).toEqual({ spreadsheetId: 'sp-1' });
  });
});

describe('buildRunResultForNode — read_sheet', () => {
  function makeNode(config = {}) {
    return { id: 'n1', type: 'read_sheet', data: { nodeType: 'read_sheet', config } };
  }

  it('success → rows từ data.items + schema + meta đầy đủ + ctx set', async () => {
    const deps = createDeps();
    deps.apiService.previewGoogleSheet.mockResolvedValue({
      data: {
        data: {
          items: [{ a: 1 }, { a: 2 }],
          meta: { spreadsheetId: 'sp-1', sheetName: 'Tab', csvUrl: 'http://x/csv', dataLoadMeta: { x: 1 } },
        },
      },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = {};
    const result = await buildRunResultForNode(
      makeNode({ sheetUrl: 'https://x', sheetName: 'Tab', headerRow: 2, dataStartRow: 3 }),
      ctx
    );

    expect(result.output.items).toEqual([{ a: 1 }, { a: 2 }]);
    expect(result.output.schema).toEqual({ count: 2 });
    expect(result.output.meta.fetched).toBe(2);
    expect(result.output.meta.spreadsheetId).toBe('sp-1');
    expect(result.output.meta.csvUrl).toBe('http://x/csv');
    expect(result.output.meta.dataLoadMeta).toEqual({ x: 1 });
    expect(result.output.meta.previewApiLimit).toBe(100);
    expect(typeof result.output.meta.accumulatedPayloadBytesUtf8).toBe('number');
    expect(ctx.sheetRows).toBe(result.output.items);
    expect(ctx.builderPreviewLogMode).toBe('100');
  });

  it('data.items không phải array → []', async () => {
    const deps = createDeps();
    deps.apiService.previewGoogleSheet.mockResolvedValue({ data: { data: { items: 'oops' } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = {};
    const result = await buildRunResultForNode(makeNode({ sheetUrl: 'https://x' }), ctx);
    expect(result.output.items).toEqual([]);
    expect(result.output.meta.fetched).toBe(0);
    expect(result.output.meta.dataLoadMeta).toEqual({});
  });

  it('previewLimit lấy từ builderSheetPreviewRowLimit; logItemsMode "all" + node không set → 20000', async () => {
    const deps = createDeps({ logItemsMode: 'all' });
    deps.apiService.previewGoogleSheet.mockResolvedValue({ data: { data: { items: [] } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await buildRunResultForNode(makeNode({ sheetUrl: 'https://x' }), {});
    expect(deps.apiService.previewGoogleSheet.mock.calls[0][0].limit).toBe(20000);

    deps.apiService.previewGoogleSheet.mockClear();
    await buildRunResultForNode(makeNode({ sheetUrl: 'https://x', builderSheetPreviewRowLimit: 250 }), {});
    expect(deps.apiService.previewGoogleSheet.mock.calls[0][0].limit).toBe(250);
  });

  it('forward signal vào API call', async () => {
    const deps = createDeps();
    deps.apiService.previewGoogleSheet.mockResolvedValue({ data: { data: { items: [] } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const controller = new AbortController();
    await buildRunResultForNode(makeNode({ sheetUrl: 'https://x' }), {}, { signal: controller.signal });
    expect(deps.apiService.previewGoogleSheet.mock.calls[0][1]).toEqual({ signal: controller.signal });
  });

  it('input echo config (sheetUrl/sheetName/headerRow/dataStartRow/recipientColumn/mapping/dataSelectedColumns)', async () => {
    const deps = createDeps();
    deps.apiService.previewGoogleSheet.mockResolvedValue({ data: { data: { items: [] } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        sheetUrl: 'https://x',
        sheetName: 'Sheet2',
        headerRow: 2,
        dataStartRow: 3,
        recipientColumn: 'email',
        mapping: { full_name: 'A' },
        dataSelectedColumns: ['email', 'full_name'],
        builderSheetPreviewRowLimit: 50,
      }),
      {}
    );
    expect(result.input.sheetUrl).toBe('https://x');
    expect(result.input.sheetName).toBe('Sheet2');
    expect(result.input.recipientColumn).toBe('email');
    expect(result.input.mapping).toEqual({ full_name: 'A' });
    expect(result.input.dataSelectedColumns).toEqual(['email', 'full_name']);
    expect(result.input.builderSheetPreviewRowLimit).toBe(50);
  });
});

describe('buildRunResultForNode — read_interested_customers', () => {
  function makeNode(config = {}) {
    return { id: 'n1', type: 'read_interested_customers', data: { nodeType: 'read_interested_customers', config } };
  }

  it('selectionMode auto-fixed khi có selectedCustomerIds → filter chỉ giữ matches', async () => {
    const deps = createDeps();
    deps.apiService.getInterestedCustomersByQuery.mockResolvedValue({
      data: { data: { items: [{ customerId: 1 }, { customerId: 2 }, { customerId: 3 }], pagination: { total: 3, limit: 1000 } } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        interestedLimit: 1000,
        interestedSelectedCustomerIds: ['1', '3'],
      }),
      {}
    );
    expect(result.output.items.map((r) => r.customerId)).toEqual([1, 3]);
    expect(result.input.selectionMode).toBe('fixed');
    expect(result.output.meta.filtered).toBe(true);
  });

  it('selectionMode="all_exclude" với excludedCustomerIds → exclude matches', async () => {
    const deps = createDeps();
    deps.apiService.getInterestedCustomersByQuery.mockResolvedValue({
      data: { data: { items: [{ customerId: 1 }, { customerId: 2 }, { customerId: 3 }], pagination: { total: 3 } } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({
        interestedSelectionMode: 'all_exclude',
        interestedExcludedCustomerIds: ['2'],
      }),
      {}
    );
    expect(result.output.items.map((r) => r.customerId)).toEqual([1, 3]);
    expect(result.input.selectionMode).toBe('all_exclude');
    expect(result.output.meta.filtered).toBe(true);
  });

  it('không có selectedIds + không exclude → selectionMode "all" + không filter', async () => {
    const deps = createDeps();
    deps.apiService.getInterestedCustomersByQuery.mockResolvedValue({
      data: { data: { items: [{ customerId: 1 }, { customerId: 2 }], pagination: { total: 2 } } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(makeNode({}), {});
    expect(result.output.items).toHaveLength(2);
    expect(result.input.selectionMode).toBe('all');
    expect(result.output.meta.filtered).toBe(false);
  });

  it('limit clamp tối thiểu 1, tối đa 5000', async () => {
    const deps = createDeps();
    deps.apiService.getInterestedCustomersByQuery.mockResolvedValue({
      data: { data: { items: [], pagination: { total: 0 } } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);

    await buildRunResultForNode(makeNode({ interestedLimit: 99999 }), {});
    await buildRunResultForNode(makeNode({ interestedLimit: -5 }), {});

    const q1 = deps.apiService.getInterestedCustomersByQuery.mock.calls[0][0];
    const q2 = deps.apiService.getInterestedCustomersByQuery.mock.calls[1][0];
    expect(new URLSearchParams(q1).get('limit')).toBe('5000');
    expect(new URLSearchParams(q2).get('limit')).toBe('1');
  });

  it('forward courseIds dedupe/numeric, courseQuery trim, courseStatuses lowercase dedupe', async () => {
    const deps = createDeps();
    deps.apiService.getInterestedCustomersByQuery.mockResolvedValue({
      data: { data: { items: [], pagination: { total: 0 } } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);

    await buildRunResultForNode(
      makeNode({
        interestedCourseIds: ['1', '2', '2', 'abc', '3'],
        interestedCourseQuery: '  AI  ',
        interestedCourseStatuses: ['Active', 'active', 'Pending'],
      }),
      {}
    );

    const qs = new URLSearchParams(deps.apiService.getInterestedCustomersByQuery.mock.calls[0][0]);
    expect(qs.get('courseIds')).toBe('1,2,3');
    expect(qs.get('courseQuery')).toBe('AI');
    expect(qs.get('courseStatuses')).toBe('active,pending');
  });

  it('ctx.sheetRows = slimRows; dataSource forward; campaignId echo input', async () => {
    const deps = createDeps({ campaignId: '42' });
    deps.apiService.getInterestedCustomersByQuery.mockResolvedValue({
      data: { data: { items: [{ customerId: 1, name: 'An' }], pagination: { total: 1, limit: 1000 } } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = {};
    const result = await buildRunResultForNode(
      makeNode({ interestedDataSource: 'api', interestedCustomerType: 'all_customers' }),
      ctx
    );
    expect(ctx.sheetRows).toBe(result.output.items);
    expect(deps.apiService.getInterestedCustomersByQuery.mock.calls[0][1]).toBe('api');
    expect(result.input.campaignId).toBe(42);
    expect(result.input.customerType).toBe('all_customers');
  });
});

describe('buildRunResultForNode — read_courses_db', () => {
  function makeNode(config = {}) {
    return { id: 'n1', type: 'read_courses_db', data: { nodeType: 'read_courses_db', config } };
  }

  it('selectedIds rỗng → throw "Chưa chọn khóa học"', async () => {
    const deps = createDeps();
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await expect(buildRunResultForNode(makeNode({}), {})).rejects.toThrow('Chưa chọn khóa học');
    expect(deps.apiService.getCourses).not.toHaveBeenCalled();
  });

  it('filter courses theo selectedCourseIds', async () => {
    const deps = createDeps();
    deps.apiService.getCourses.mockResolvedValue({
      data: { data: { courses: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }, { id: 3, name: 'C' }], pagination: { total: 3 } } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = {};
    const result = await buildRunResultForNode(
      makeNode({ coursesDbSelectedIds: ['1', '3'] }),
      ctx
    );
    expect(result.output.items.map((c) => c.id)).toEqual([1, 3]);
    expect(ctx.coursesRows).toBe(result.output.items);
    expect(result.output.meta.totalItems).toBe(3);
    expect(result.output.meta.filtered).toBe(true);
  });

  it('forward search + status (lowercase dedupe) khi có config', async () => {
    const deps = createDeps();
    deps.apiService.getCourses.mockResolvedValue({
      data: { data: { courses: [{ id: 5 }], pagination: { total: 1 } } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await buildRunResultForNode(
      makeNode({
        coursesDbSelectedIds: ['5'],
        coursesDbSearchTerm: 'AI Foundation',
        coursesDbStatuses: ['Active', 'active', 'Draft'],
        coursesDbLimit: 50,
      }),
      {}
    );
    const params = deps.apiService.getCourses.mock.calls[0][0];
    expect(params).toEqual({ limit: 50, search: 'AI Foundation', status: 'active,draft' });
  });

  it('không có search/statuses → params chỉ có limit default 1000', async () => {
    const deps = createDeps();
    deps.apiService.getCourses.mockResolvedValue({
      data: { data: { courses: [{ id: 5 }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await buildRunResultForNode(makeNode({ coursesDbSelectedIds: ['5'] }), {});
    expect(deps.apiService.getCourses.mock.calls[0][0]).toEqual({ limit: 1000 });
  });

  it('pagination null → totalItems fallback courses.length', async () => {
    const deps = createDeps();
    deps.apiService.getCourses.mockResolvedValue({
      data: { data: { courses: [{ id: 5 }, { id: 6 }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({ coursesDbSelectedIds: ['5', '6'] }),
      {}
    );
    expect(result.output.meta.totalItems).toBe(2);
  });
});

describe('buildRunResultForNode — read_landing_leads', () => {
  function makeNode(config = {}) {
    return { id: 'n1', type: 'read_landing_leads', data: { nodeType: 'read_landing_leads', config } };
  }

  it('clamp landingLeadsLimit theo LANDING_LEADS_MAX_RECORDS=10000', async () => {
    const deps = createDeps();
    deps.apiService.previewLandingLeads.mockResolvedValue({
      data: { data: { items: [], pagination: { total: 0 } } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);

    await buildRunResultForNode(makeNode({ landingLeadsLimit: 99999 }), {});
    await buildRunResultForNode(makeNode({ landingLeadsLimit: -3 }), {});
    await buildRunResultForNode(makeNode({ landingLeadsLimit: 'abc' }), {});

    const p1 = deps.apiService.previewLandingLeads.mock.calls[0][0];
    const p2 = deps.apiService.previewLandingLeads.mock.calls[1][0];
    const p3 = deps.apiService.previewLandingLeads.mock.calls[2][0];
    expect(p1.landingLeadsLimit).toBe(10000);
    expect(p2.landingLeadsLimit).toBe(1);
    expect(p3.landingLeadsLimit).toBe(1000);
  });

  it('normalize arrays: mảng / chuỗi JSON / null → JSON string đúng', async () => {
    const deps = createDeps();
    deps.apiService.previewLandingLeads.mockResolvedValue({
      data: { data: { items: [], pagination: { total: 0 } } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);

    await buildRunResultForNode(
      makeNode({
        landingLeadsOccupations: ['Student', '  Teacher  ', ''],
        landingLeadsInterests: '["ai","marketing"]',
        landingLeadsSlugs: null,
      }),
      {}
    );

    const params = deps.apiService.previewLandingLeads.mock.calls[0][0];
    expect(JSON.parse(params.landingLeadsOccupations)).toEqual(['Student', 'Teacher']);
    expect(JSON.parse(params.landingLeadsInterests)).toEqual(['ai', 'marketing']);
    expect(JSON.parse(params.landingLeadsSlugs)).toEqual([]);
  });

  it('slugs → lowercase', async () => {
    const deps = createDeps();
    deps.apiService.previewLandingLeads.mockResolvedValue({
      data: { data: { items: [], pagination: { total: 0 } } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await buildRunResultForNode(
      makeNode({ landingLeadsSlugs: ['Founder-AI', 'CRM-LANDING'] }),
      {}
    );
    const params = deps.apiService.previewLandingLeads.mock.calls[0][0];
    expect(JSON.parse(params.landingLeadsSlugs)).toEqual(['founder-ai', 'crm-landing']);
  });

  it('landingLeadsUseDateRange: true/"true" → true; false → false', async () => {
    const deps = createDeps();
    deps.apiService.previewLandingLeads.mockResolvedValue({
      data: { data: { items: [], pagination: { total: 0 } } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);

    await buildRunResultForNode(makeNode({ landingLeadsUseDateRange: true }), {});
    await buildRunResultForNode(makeNode({ landingLeadsUseDateRange: 'true' }), {});
    await buildRunResultForNode(makeNode({ landingLeadsUseDateRange: '1' }), {});
    await buildRunResultForNode(makeNode({}), {});

    const calls = deps.apiService.previewLandingLeads.mock.calls;
    expect(calls[0][0].landingLeadsUseDateRange).toBe(true);
    expect(calls[1][0].landingLeadsUseDateRange).toBe(true);
    expect(calls[2][0].landingLeadsUseDateRange).toBe(false);
    expect(calls[3][0].landingLeadsUseDateRange).toBe(false);
  });

  it('data null → items []; totalItems fallback length', async () => {
    const deps = createDeps();
    deps.apiService.previewLandingLeads.mockResolvedValue({ data: { data: null } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(makeNode({}), {});
    expect(result.output.items).toEqual([]);
    expect(result.output.meta.totalItems).toBe(0);
    expect(result.output.meta.fetched).toBe(0);
  });

  it('ctx.sheetRows = slimRows; input echo dataSelectedColumns', async () => {
    const deps = createDeps();
    deps.apiService.previewLandingLeads.mockResolvedValue({
      data: { data: { items: [{ leadId: 1, name: 'A', email: 'a@b' }], pagination: { total: 1 } } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = {};
    const result = await buildRunResultForNode(
      makeNode({ dataSelectedColumns: ['name'] }),
      ctx
    );
    expect(ctx.sheetRows).toBe(result.output.items);
    expect(result.input.dataSelectedColumns).toEqual(['name']);
    expect(result.output.items[0]).toHaveProperty('leadId');
    expect(result.output.items[0]).toHaveProperty('name');
    expect(result.output.items[0]).not.toHaveProperty('email');
    expect(result.output.meta.dataLoadMeta.columnSelectionActive).toBe(true);
  });
});
