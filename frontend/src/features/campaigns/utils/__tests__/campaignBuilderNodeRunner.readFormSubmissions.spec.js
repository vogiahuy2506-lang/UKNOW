import { describe, it, expect, vi } from 'vitest';
import { createCampaignNodeRunner } from '../campaignBuilderNodeRunner';
import { buildSchemaFromRows } from '../campaignBuilderRuntime';

describe('campaignBuilderNodeRunner - read_form_submissions (dry-run, PR-6b)', () => {
  const buildRunner = (previewFormSubmissionsImpl) =>
    createCampaignNodeRunner({
      campaignId: 1,
      apiService: {
        previewFormSubmissions: previewFormSubmissionsImpl,
      },
      buildSchemaFromRows,
      applyMappingsForRow: vi.fn(),
      normalizeKey: (k) => k,
      parseEmailList: vi.fn(),
      renderTemplateString: vi.fn(),
      resolveColumnKey: vi.fn(),
      readPreviewSessionData: vi.fn(),
      writePreviewSessionData: vi.fn(),
      toastNotifier: { success: vi.fn(), error: vi.fn() },
      isRunCancelledError: () => false,
    });

  const buildNode = (config) => ({
    id: 'node_1',
    data: { nodeType: 'read_form_submissions', config },
  });

  const previewResponse = (items, total) => ({
    data: { data: { items, pagination: { total } } },
  });

  it('áp fieldMap.emailKey (chữ thường) và applyDataColumnSelectionToItems kind "form" giữ khoá cố định', async () => {
    const previewFormSubmissions = vi.fn().mockResolvedValue(
      previewResponse(
        [
          {
            submissionId: 1,
            id: 1,
            formId: 9,
            fullName: 'A',
            email: 'a@example.com',
            phone: '0901234567',
            f_company_email: 'CongTy@Example.Com',
            f_service: 'Gói Pro',
            f_notes: 'ghi chú riêng',
          },
        ],
        1
      )
    );
    const runner = buildRunner(previewFormSubmissions);
    const node = buildNode({
      formId: 9,
      fieldMap: { emailKey: 'f_company_email' },
      dataSelectedColumns: ['f_service'],
    });
    const ctx = {};
    const result = await runner.buildRunResultForNode(node, ctx, {});

    expect(previewFormSubmissions).toHaveBeenCalledTimes(1);
    expect(previewFormSubmissions.mock.calls[0][0]).toBe(9);
    expect(previewFormSubmissions.mock.calls[0][1]).toEqual({ limit: 1000 });

    expect(result.output.ok).toBe(true);
    const item = result.output.items[0];
    // fieldMap.emailKey áp đúng, chuyển chữ thường
    expect(item.email).toBe('congty@example.com');
    // dataSelectedColumns chọn f_service -> còn lại
    expect(item.f_service).toBe('Gói Pro');
    // Khoá cố định (ALWAYS_KEEP_BY_KIND.form) sống sót dù không được chọn
    expect(item.submissionId).toBe(1);
    expect(item.id).toBe(1);
    expect(item.phone).toBe('0901234567');
    expect(item.fullName).toBe('A');
    // Cột KHÔNG được chọn và không thuộc khoá cố định -> bị lọc
    expect(item.f_notes).toBeUndefined();

    expect(ctx.sheetRows).toBe(result.output.items);
    expect(result.output.meta.totalItems).toBe(1);
    expect(result.output.meta.fetched).toBe(1);
  });

  it('fieldMap rỗng -> giữ nguyên email/phone/fullName như server trả (theo role)', async () => {
    const previewFormSubmissions = vi.fn().mockResolvedValue(
      previewResponse(
        [
          {
            submissionId: 2,
            id: 2,
            formId: 9,
            fullName: 'B',
            email: 'b@example.com',
            phone: '0909999999',
          },
        ],
        1
      )
    );
    const runner = buildRunner(previewFormSubmissions);
    const node = buildNode({ formId: 9 });
    const result = await runner.buildRunResultForNode(node, {}, {});

    expect(result.output.items[0].email).toBe('b@example.com');
    expect(result.output.items[0].phone).toBe('0909999999');
  });
});
