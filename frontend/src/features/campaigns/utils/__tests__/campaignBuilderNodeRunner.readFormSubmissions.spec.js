import { describe, it, expect, vi } from 'vitest';
import { createCampaignNodeRunner } from '../campaignBuilderNodeRunner';
import { buildSchemaFromRows } from '../campaignBuilderRuntime';

describe('campaignBuilderNodeRunner - read_form_submissions (dry-run, PR-6b)', () => {
  const buildRunner = (previewFormSubmissionsImpl, previewFormsSubmissionsImpl = vi.fn()) =>
    createCampaignNodeRunner({
      campaignId: 1,
      apiService: {
        previewFormSubmissions: previewFormSubmissionsImpl,
        previewFormsSubmissions: previewFormsSubmissionsImpl,
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
    expect(result.input.formIds).toEqual([9]);

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

  it('PR-7b: formId cũ dạng chuỗi (select FE lưu "9") vẫn đi đường MỘT biểu mẫu với id số', async () => {
    const previewFormSubmissions = vi.fn().mockResolvedValue(previewResponse([], 0));
    const previewFormsSubmissions = vi.fn();
    const runner = buildRunner(previewFormSubmissions, previewFormsSubmissions);
    await runner.buildRunResultForNode(buildNode({ formId: '9' }), {}, {});

    expect(previewFormSubmissions).toHaveBeenCalledTimes(1);
    expect(previewFormSubmissions.mock.calls[0][0]).toBe(9);
    expect(previewFormsSubmissions).not.toHaveBeenCalled();
  });

  it('PR-7b: formIds nhiều biểu mẫu -> gọi preview GỘP một lần với đủ danh sách; fieldMap vẫn áp lại ở client', async () => {
    const previewFormSubmissions = vi.fn();
    const previewFormsSubmissions = vi.fn().mockResolvedValue(
      previewResponse(
        [
          { submissionId: 3, id: 3, formId: 7, fullName: 'C', email: 'c@x.com', f_company_email: 'Corp@X.com' },
          { submissionId: 1, id: 1, formId: 5, fullName: 'A', email: 'a@x.com' },
        ],
        2
      )
    );
    const runner = buildRunner(previewFormSubmissions, previewFormsSubmissions);
    const node = buildNode({ formIds: [5, '6', 7], fieldMap: { emailKey: 'f_company_email' } });
    const result = await runner.buildRunResultForNode(node, {}, {});

    expect(previewFormSubmissions).not.toHaveBeenCalled();
    expect(previewFormsSubmissions).toHaveBeenCalledTimes(1);
    expect(previewFormsSubmissions.mock.calls[0][0]).toEqual([5, 6, 7]);
    expect(previewFormsSubmissions.mock.calls[0][1]).toEqual({ limit: 1000 });
    expect(result.input.formIds).toEqual([5, 6, 7]);
    expect(result.output.items[0].email).toBe('corp@x.com');
    expect(result.output.items[1].email).toBe('a@x.com');
    expect(result.output.meta.totalItems).toBe(2);
  });
});
