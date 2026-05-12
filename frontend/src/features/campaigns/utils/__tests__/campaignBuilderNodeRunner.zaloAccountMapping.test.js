import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createCampaignNodeRunner } from '../campaignBuilderNodeRunner.js';

/**
 * B14b: zalo account/friends/groups + mapping_data + save_customer
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
    renderTemplateString: vi.fn((tpl) => String(tpl || '')),
    resolveColumnKey: vi.fn((rows, ref) => String(ref || '')),
    readPreviewSessionData: vi.fn(() => ({ customers: [] })),
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

describe('buildRunResultForNode — select_zalo_account', () => {
  function makeNode(config = {}) {
    return { id: 'sel', type: 'select_zalo_account', data: { nodeType: 'select_zalo_account', config } };
  }

  it('zaloAccountId rỗng + pool off → throw "Chưa chọn tài khoản Zalo hoặc pool rỗng"', async () => {
    const deps = createDeps();
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await expect(buildRunResultForNode(makeNode({}), {})).rejects.toThrow(/Chưa chọn tài khoản/);
  });

  it('pool off — TK connected/isActive → trả 1 item __zaloAccountSelected=true, ctx set', async () => {
    const deps = createDeps();
    deps.apiService.getZaloAccounts.mockResolvedValue({
      data: { data: { items: [{ id: 'acc-1', displayName: 'A', status: 'connected', isActive: true }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = {};
    const result = await buildRunResultForNode(makeNode({ zaloAccountId: 'acc-1' }), ctx);

    expect(result.output.items).toHaveLength(1);
    expect(result.output.items[0].id).toBe('acc-1');
    expect(result.output.items[0].__zaloAccountSelected).toBe(true);
    expect(ctx.selectedZaloAccount?.id).toBe('acc-1');
    expect(ctx.zaloPoolFromSelect).toBe(null);
    expect(ctx.zaloPreviewPoolBinding).toBeInstanceOf(Map);
    expect(result.output.meta.poolEnabled).toBe(false);
  });

  it('TK disconnected → tự gọi restoreZaloAccountSession và fetch lại', async () => {
    const deps = createDeps();
    deps.apiService.getZaloAccounts
      .mockResolvedValueOnce({
        data: { data: { items: [{ id: 'a', displayName: 'A', status: 'disconnected', isActive: true }] } },
      })
      .mockResolvedValueOnce({
        data: { data: { items: [{ id: 'a', displayName: 'A', status: 'connected', isActive: true }] } },
      });
    deps.apiService.restoreZaloAccountSession.mockResolvedValue({});
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);

    const result = await buildRunResultForNode(makeNode({ zaloAccountId: 'a' }), {});
    expect(deps.apiService.restoreZaloAccountSession).toHaveBeenCalledWith('a', expect.any(Object));
    expect(result.output.items[0].status).toBe('connected');
  });

  it('TK disconnected + restore lỗi server message → throw kèm message', async () => {
    const deps = createDeps();
    deps.apiService.getZaloAccounts.mockResolvedValue({
      data: { data: { items: [{ id: 'a', displayName: 'A', status: 'disconnected', isActive: true }] } },
    });
    deps.apiService.restoreZaloAccountSession.mockRejectedValue({
      response: { data: { message: 'Token hết hạn' } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await expect(buildRunResultForNode(makeNode({ zaloAccountId: 'a' }), {})).rejects.toThrow(
      /Không thể tự khôi phục.*Token hết hạn/
    );
  });

  it('TK không tồn tại trong list → throw "không còn tồn tại"', async () => {
    const deps = createDeps();
    deps.apiService.getZaloAccounts.mockResolvedValue({ data: { data: { items: [] } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await expect(buildRunResultForNode(makeNode({ zaloAccountId: 'x' }), {})).rejects.toThrow(
      'Tài khoản Zalo đã chọn không còn tồn tại'
    );
  });

  it('pool ON với 3 ids — items map theo accounts, ctx pool đầy đủ', async () => {
    const deps = createDeps();
    deps.apiService.getZaloAccounts.mockResolvedValue({
      data: {
        data: {
          items: [
            { id: 'a', displayName: 'A', status: 'connected', isActive: true },
            { id: 'b', displayName: 'B', status: 'connected', isActive: true },
            { id: 'c', displayName: 'C', status: 'connected', isActive: true },
          ],
        },
      },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = {};
    const result = await buildRunResultForNode(
      makeNode({
        zaloPoolMultiAccountEnabled: true,
        zaloPoolAccountIds: ['a', 'b', 'c'],
      }),
      ctx
    );

    expect(result.output.items).toHaveLength(3);
    expect(result.output.items[0].__zaloAccountSelected).toBe(true);
    expect(result.output.items[1].__zaloAccountSelected).toBe(false);
    expect(result.output.items[0].__zaloPoolAccountIds).toEqual(['a', 'b', 'c']);
    expect(result.output.meta.poolEnabled).toBe(true);
    expect(result.output.meta.poolSize).toBe(3);
    expect(ctx.zaloPoolFromSelect).toEqual(['a', 'b', 'c']);
    expect(ctx.zaloPoolAccountById).toBeInstanceOf(Map);
    expect(ctx.zaloPoolAccountById.size).toBe(3);
  });
});

describe('buildRunResultForNode — get_all_friends', () => {
  function makeNode(config = {}) {
    return { id: 'fr', type: 'get_all_friends', data: { nodeType: 'get_all_friends', config } };
  }

  function ctxWithAccount() {
    return {
      selectedZaloAccount: { id: 'acc-1', displayName: 'A', status: 'connected', isActive: true },
    };
  }

  it('ensureSelectedZaloAccount: ctx.selectedZaloAccount thiếu → throw', async () => {
    const deps = createDeps();
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await expect(buildRunResultForNode(makeNode({}), {})).rejects.toThrow(/Chưa có tài khoản Zalo gửi/);
  });

  it('default count=200 page=1; forward accountId từ ctx', async () => {
    const deps = createDeps();
    deps.apiService.getPreviewZaloFriends.mockResolvedValue({ data: { data: { items: [] } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await buildRunResultForNode(makeNode({}), ctxWithAccount());
    expect(deps.apiService.getPreviewZaloFriends).toHaveBeenCalledWith(
      { accountId: 'acc-1', count: 200, page: 1 },
      expect.any(Object)
    );
  });

  it('lấy account từ source node khi zaloFriendAccountNodeId set', async () => {
    const deps = createDeps();
    deps.apiService.getPreviewZaloFriends.mockResolvedValue({ data: { data: { items: [] } } });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = {
      nodeResultsById: {
        src: { output: { items: [{ id: 'src-acc', displayName: 'Src', status: 'connected', isActive: true }] } },
      },
    };
    await buildRunResultForNode(makeNode({ zaloFriendAccountNodeId: 'src' }), ctx);
    expect(deps.apiService.getPreviewZaloFriends.mock.calls[0][0].accountId).toBe('src-acc');
  });

  it('selectionMode fixed + selectedFriendIds → filter theo uid/id/userId', async () => {
    const deps = createDeps();
    deps.apiService.getPreviewZaloFriends.mockResolvedValue({
      data: { data: { items: [{ uid: 'u1' }, { id: 'u2' }, { userId: 'u3' }, { uid: 'u4' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({ zaloSelectedFriendIds: ['u1', 'u3'] }),
      ctxWithAccount()
    );
    expect(result.output.items).toHaveLength(2);
    expect(result.input.selectionMode).toBe('fixed');
    expect(result.output.meta.filtered).toBe(true);
  });

  it('selectionMode all_exclude → loại theo excludedFriendIds', async () => {
    const deps = createDeps();
    deps.apiService.getPreviewZaloFriends.mockResolvedValue({
      data: { data: { items: [{ uid: 'u1' }, { uid: 'u2' }, { uid: 'u3' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({ zaloFriendSelectionMode: 'all_exclude', zaloExcludedFriendIds: ['u2'] }),
      ctxWithAccount()
    );
    expect(result.output.items.map((it) => it.uid)).toEqual(['u1', 'u3']);
    expect(result.input.selectionMode).toBe('all_exclude');
  });
});

describe('buildRunResultForNode — get_all_groups', () => {
  function makeNode(config = {}) {
    return { id: 'gr', type: 'get_all_groups', data: { nodeType: 'get_all_groups', config } };
  }
  function ctxWithAccount() {
    return { selectedZaloAccount: { id: 'acc-1', isActive: true } };
  }

  it('selectedGroupIds rỗng + snapshot off → trả allItems', async () => {
    const deps = createDeps();
    deps.apiService.getPreviewZaloGroups.mockResolvedValue({
      data: { data: { items: [{ groupId: 'g1' }, { groupId: 'g2' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(makeNode({}), ctxWithAccount());
    expect(result.output.items).toHaveLength(2);
    expect(result.output.meta.filtered).toBe(false);
  });

  it('selectedGroupIds → chỉ giữ matches', async () => {
    const deps = createDeps();
    deps.apiService.getPreviewZaloGroups.mockResolvedValue({
      data: { data: { items: [{ groupId: 'g1' }, { groupId: 'g2' }, { groupId: 'g3' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({ zaloSelectedGroupIds: ['g1', 'g3'] }),
      ctxWithAccount()
    );
    expect(result.output.items.map((it) => it.groupId)).toEqual(['g1', 'g3']);
    expect(result.output.meta.filtered).toBe(true);
  });

  it('snapshot locked + selected rỗng → filter theo set rỗng (kết quả rỗng)', async () => {
    const deps = createDeps();
    deps.apiService.getPreviewZaloGroups.mockResolvedValue({
      data: { data: { items: [{ groupId: 'g1' }, { groupId: 'g2' }] } },
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(
      makeNode({ zaloGroupSelectionSnapshotLocked: true }),
      ctxWithAccount()
    );
    expect(result.output.items).toHaveLength(0);
    expect(result.input.selectionSnapshotLocked).toBe(true);
  });
});

describe('buildRunResultForNode — mapping_data', () => {
  function makeNode(config = {}) {
    return { id: 'map', type: 'mapping_data', data: { nodeType: 'mapping_data', config } };
  }

  it('rows từ ctx.sheetRows + apply mappings + __row index', async () => {
    const deps = createDeps();
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = { sheetRows: [{ A: 'alice@x' }, { A: 'bob@x' }] };
    const result = await buildRunResultForNode(
      makeNode({
        mappingTemplateId: 5,
        mappings: [{ variableName: 'email', column: 'A' }],
      }),
      ctx
    );
    expect(result.output.items).toEqual([
      { __row: 1, email: 'alice@x' },
      { __row: 2, email: 'bob@x' },
    ]);
    expect(result.output.variables).toEqual(['email']);
    expect(result.output.meta.totalItems).toBe(2);
    expect(result.output.meta.variablesCount).toBe(1);
    expect(ctx.mapping).toEqual({ templateId: 5, mappings: result.input.mappings });
  });

  it('previewLogMode "all" từ ctx → preview cả 200 rows', async () => {
    const deps = createDeps();
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = {
      sheetRows: Array.from({ length: 200 }, (_, i) => ({ A: `v${i}` })),
      builderPreviewLogMode: 'all',
    };
    const result = await buildRunResultForNode(
      makeNode({ mappings: [{ variableName: 'v', column: 'A' }] }),
      ctx
    );
    expect(result.output.items).toHaveLength(200);
    expect(result.output.meta.previewed).toBe(200);
  });

  it('previewLogMode "100" (default ctx) → cap 100 rows', async () => {
    const deps = createDeps();
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = { sheetRows: Array.from({ length: 250 }, (_, i) => ({ A: i })) };
    const result = await buildRunResultForNode(
      makeNode({ mappings: [{ variableName: 'v', column: 'A' }] }),
      ctx
    );
    expect(result.output.items).toHaveLength(100);
    expect(result.output.meta.totalItems).toBe(250);
    expect(result.output.meta.previewed).toBe(100);
  });

  it('mappings undefined / variableName rỗng → variables []', async () => {
    const deps = createDeps();
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const result = await buildRunResultForNode(makeNode({}), { sheetRows: [{ A: 1 }] });
    expect(result.output.variables).toEqual([]);
    expect(result.output.meta.variablesCount).toBe(0);
  });
});

describe('buildRunResultForNode — save_customer', () => {
  function makeNode(config = {}) {
    return { id: 'sav', type: 'save_customer', data: { nodeType: 'save_customer', config } };
  }

  it('không có items từ source node nào → throw "Chưa có dữ liệu từ node đã chọn"', async () => {
    const deps = createDeps();
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    await expect(
      buildRunResultForNode(
        makeNode({
          saveCustomerFieldMap: { email: { nodeId: 'src', field: 'email', mode: 'node' } },
        }),
        { nodeResultsById: { src: { output: { items: [] } } } }
      )
    ).rejects.toThrow('Chưa có dữ liệu từ node đã chọn');
  });

  it('mapped customers: email/phone từ row, customFields chỉ giữ value non-empty', async () => {
    const deps = createDeps();
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = {
      nodeResultsById: {
        src: {
          output: {
            items: [
              { Email: 'a@b', Phone: '0901', Note: 'VIP', extra: '' },
              { Email: 'c@d', Phone: '0902', Note: '', extra: 'X' },
            ],
          },
        },
      },
    };
    const result = await buildRunResultForNode(
      makeNode({
        saveCustomerFieldMap: {
          email: { nodeId: 'src', field: 'Email', mode: 'node' },
          phone: { nodeId: 'src', field: 'Phone', mode: 'node' },
        },
        saveCustomerCustomFields: [
          { key: 'note', nodeId: 'src', field: 'Note', mode: 'node' },
          { key: 'extra', nodeId: 'src', field: 'extra', mode: 'node' },
        ],
      }),
      ctx
    );
    expect(result.output.items).toHaveLength(2);
    expect(result.output.items[0].email).toBe('a@b');
    expect(result.output.items[0].phone).toBe('0901');
    expect(result.output.items[0].customFields).toEqual({ note: 'VIP' });
    expect(result.output.items[1].customFields).toEqual({ extra: 'X' });
  });

  it('manual mode mapping → dùng value trực tiếp, trim rỗng → null', async () => {
    const deps = createDeps();
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = {
      nodeResultsById: {
        src: { output: { items: [{ Email: 'a@b' }] } },
      },
    };
    const result = await buildRunResultForNode(
      makeNode({
        saveCustomerFieldMap: {
          email: { nodeId: 'src', field: 'Email', mode: 'node' },
          fullName: { mode: 'manual', value: 'Static Name' },
          notes: { mode: 'manual', value: '   ' },
        },
      }),
      ctx
    );
    expect(result.output.items[0].fullName).toBe('Static Name');
    expect(result.output.items[0].notes).toBe(null);
  });

  it('upsert preview: existing customer cập nhật → updated; mới → inserted; thiếu email+phone → skipped', async () => {
    const deps = createDeps();
    deps.readPreviewSessionData.mockReturnValue({
      customers: [{ email: 'a@b', phone: '0901', fullName: 'Old' }],
    });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = {
      nodeResultsById: {
        src: {
          output: {
            items: [
              { Email: 'a@b', Phone: '0901', Name: 'New' },
              { Email: 'c@d', Phone: '0902', Name: 'Bob' },
              { Email: '', Phone: '', Name: 'Lost' },
            ],
          },
        },
      },
    };
    const result = await buildRunResultForNode(
      makeNode({
        saveCustomerFieldMap: {
          email: { nodeId: 'src', field: 'Email', mode: 'node' },
          phone: { nodeId: 'src', field: 'Phone', mode: 'node' },
          fullName: { nodeId: 'src', field: 'Name', mode: 'node' },
        },
      }),
      ctx
    );
    expect(result.output.meta.totalItems).toBe(3);
    expect(result.output.meta.updated).toBe(1);
    expect(result.output.meta.inserted).toBe(1);
    expect(result.output.meta.skipped).toBe(1);
    expect(deps.writePreviewSessionData).toHaveBeenCalled();
    const writtenArg = deps.writePreviewSessionData.mock.calls[0][0];
    expect(writtenArg.customers).toHaveLength(2);
  });

  it('campaignId echo input + upsertBy default "email_or_phone"', async () => {
    const deps = createDeps({ campaignId: '42' });
    const { buildRunResultForNode } = createCampaignNodeRunner(deps);
    const ctx = {
      nodeResultsById: { src: { output: { items: [{ Email: 'a@b' }] } } },
    };
    const result = await buildRunResultForNode(
      makeNode({
        saveCustomerFieldMap: { email: { nodeId: 'src', field: 'Email', mode: 'node' } },
      }),
      ctx
    );
    expect(result.input.campaignId).toBe(42);
    expect(result.input.upsertBy).toBe('email_or_phone');
  });
});
