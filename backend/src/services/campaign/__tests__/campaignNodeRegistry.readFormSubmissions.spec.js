import { describe, it, expect } from '@jest/globals';
import campaignNodeRegistryService from '../campaignNodeRegistry.service.js';

/**
 * PR-7b — node `read_form_submissions` nhận `formIds` (nhiều biểu mẫu); `formId` là dạng cũ vẫn hợp lệ. Cần ÍT NHẤT một biểu mẫu.
 * Đường kiểm này chặn bản nháp AI (ai.controller.js 400 INVALID_NODE_CONFIG) — nếu vẫn bắt `formId` thì node `formIds` do AI/compiler
 * dựng cho landing nhiều biểu mẫu bị từ chối oan.
 */
describe('campaignNodeRegistry.validateNodeConfig — read_form_submissions (PR-7b)', () => {
  const validate = (config) => campaignNodeRegistryService.validateNodeConfig('read_form_submissions', config);

  it('formIds có id hợp lệ -> hợp lệ (không cần formId)', () => {
    expect(validate({ formIds: [3, 4, 5] })).toEqual({ valid: true, errors: [] });
  });

  it('đồ thị CŨ chỉ có formId (số hoặc chuỗi số) -> vẫn hợp lệ', () => {
    expect(validate({ formId: 12 }).valid).toBe(true);
    expect(validate({ formId: '12' }).valid).toBe(true);
  });

  it('không có biểu mẫu nào -> lỗi rõ', () => {
    for (const config of [{}, { formIds: [] }, { formId: null }, { formId: '' }, { formIds: ['x'], formId: 0 }]) {
      const result = validate(config);
      expect(result.valid).toBe(false);
      expect(result.errors.join(' ')).toMatch(/formIds/);
    }
  });

  it('registry công bố cả formIds (mảng) lẫn formId (dạng cũ) và KHÔNG còn ép formId bắt buộc', () => {
    const schema = campaignNodeRegistryService.nodeTypes.read_form_submissions.configSchema;
    expect(schema.formIds.type).toBe('array');
    expect(schema.formId.required).toBeUndefined();
    expect(schema.formIds.required).toBeUndefined();
  });
});
