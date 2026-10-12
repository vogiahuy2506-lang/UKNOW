/**
 * PR-7b — node read_form_submissions nhận NHIỀU biểu mẫu: danh sách chuẩn hoá (khớp backend campaignFormIds.util.js), đường gọi preview theo
 * số biểu mẫu, và hộp cấu hình (createNodeConfigFormData / handleNodeConfigSaveClick) đổi `formId` cũ sang `formIds`.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_READ_FORM_SUBMISSIONS_FORM_IDS,
  normalizeFormIdList,
  getFormIdsFromConfig,
  previewFormSubmissionsForIds,
} from '../readFormSubmissionsFormIds';
import { createNodeConfigFormData, handleNodeConfigSaveClick } from '../nodeConfigModal.helpers';

vi.mock('../../services/campaignBuilderApi.service', () => ({
  default: {
    previewFormSubmissions: vi.fn(),
    previewFormsSubmissions: vi.fn(),
  },
}));

describe('getFormIdsFromConfig / normalizeFormIdList', () => {
  it('formIds hợp lệ thắng formId cũ; chuỗi số → số; bỏ trùng và rác; giữ thứ tự', () => {
    expect(getFormIdsFromConfig({ formIds: ['5', 6, 5, 'x', 0, -1, null, 7.5], formId: 9 })).toEqual([5, 6]);
  });

  it('đồ thị CŨ chỉ có formId (số hoặc chuỗi) → [formId]', () => {
    expect(getFormIdsFromConfig({ formId: 12 })).toEqual([12]);
    expect(getFormIdsFromConfig({ formId: '12' })).toEqual([12]);
  });

  it('formIds rỗng/rác → rơi về formId cũ; không có gì → []', () => {
    expect(getFormIdsFromConfig({ formIds: [], formId: 4 })).toEqual([4]);
    expect(getFormIdsFromConfig({ formIds: ['x'], formId: '' })).toEqual([]);
    expect(getFormIdsFromConfig({})).toEqual([]);
    expect(getFormIdsFromConfig(null)).toEqual([]);
  });

  it('chặn trần số biểu mẫu', () => {
    const many = Array.from({ length: MAX_READ_FORM_SUBMISSIONS_FORM_IDS + 10 }, (_, i) => i + 1);
    expect(normalizeFormIdList(many)).toHaveLength(MAX_READ_FORM_SUBMISSIONS_FORM_IDS);
  });
});

describe('previewFormSubmissionsForIds', () => {
  const service = () => ({ previewFormSubmissions: vi.fn(), previewFormsSubmissions: vi.fn() });

  it('đúng MỘT biểu mẫu → API preview một biểu mẫu (y như trước PR-7b)', () => {
    const s = service();
    previewFormSubmissionsForIds(s, ['9'], { limit: 50 }, { signal: 'S' });
    expect(s.previewFormSubmissions).toHaveBeenCalledWith(9, { limit: 50 }, { signal: 'S' });
    expect(s.previewFormsSubmissions).not.toHaveBeenCalled();
  });

  it('từ HAI biểu mẫu → API preview gộp với danh sách chuẩn hoá', () => {
    const s = service();
    previewFormSubmissionsForIds(s, [5, '6', 5], { limit: 50 });
    expect(s.previewFormsSubmissions).toHaveBeenCalledWith([5, 6], { limit: 50 }, {});
    expect(s.previewFormSubmissions).not.toHaveBeenCalled();
  });
});

describe('createNodeConfigFormData — read_form_submissions', () => {
  it('config cũ chỉ có formId → formIds [formId] và KHÔNG còn khoá formId trong formData (lưu lại là hết dạng cũ)', () => {
    const formData = createNodeConfigFormData({ config: { formId: '5' }, nodeType: 'read_form_submissions' });
    expect(formData.formIds).toEqual([5]);
    expect(formData).not.toHaveProperty('formId');
  });

  it('config mới có formIds → giữ nguyên danh sách', () => {
    const formData = createNodeConfigFormData({ config: { formIds: [3, 4, 5] }, nodeType: 'read_form_submissions' });
    expect(formData.formIds).toEqual([3, 4, 5]);
  });

  it('node trống → formIds []', () => {
    expect(createNodeConfigFormData({ config: {}, nodeType: 'read_form_submissions' }).formIds).toEqual([]);
  });
});

describe('handleNodeConfigSaveClick — read_form_submissions', () => {
  const baseArgs = () => ({
    nodeType: 'read_form_submissions',
    onSave: vi.fn(),
    handleCheckSheetConnection: vi.fn(),
    setIsLoadingTestPreview: vi.fn(),
    toastNotifier: { success: vi.fn(), error: vi.fn() },
    campaignId: 1,
  });

  it('chưa chọn biểu mẫu nào → báo lỗi, KHÔNG lưu', async () => {
    const args = baseArgs();
    await handleNodeConfigSaveClick({ ...args, formData: { formIds: [] } });
    expect(args.toastNotifier.error).toHaveBeenCalledWith('Vui lòng chọn ít nhất một biểu mẫu trước khi lưu');
    expect(args.onSave).not.toHaveBeenCalled();
  });

  it('nhiều biểu mẫu → kiểm bằng preview gộp rồi lưu formIds đã chuẩn hoá, KHÔNG kèm formId cũ', async () => {
    const { default: api } = await import('../../services/campaignBuilderApi.service');
    api.previewFormsSubmissions.mockResolvedValueOnce({ data: { data: { pagination: { total: 7 } } } });
    const args = baseArgs();

    await handleNodeConfigSaveClick({ ...args, formData: { formIds: ['5', 6], formId: 99, fieldMap: {} } });

    expect(api.previewFormsSubmissions).toHaveBeenCalledWith([5, 6], { limit: 50 }, {});
    expect(args.onSave).toHaveBeenCalledTimes(1);
    const saved = args.onSave.mock.calls[0][0];
    expect(saved.formIds).toEqual([5, 6]);
    expect(saved).not.toHaveProperty('formId');
  });

  it('một biểu mẫu → kiểm bằng preview MỘT biểu mẫu (đường cũ) rồi lưu [id]', async () => {
    const { default: api } = await import('../../services/campaignBuilderApi.service');
    api.previewFormSubmissions.mockResolvedValueOnce({ data: { data: { pagination: { total: 2 } } } });
    const args = baseArgs();

    await handleNodeConfigSaveClick({ ...args, formData: { formIds: [8] } });

    expect(api.previewFormSubmissions).toHaveBeenCalledWith(8, { limit: 50 }, {});
    expect(args.onSave.mock.calls[0][0].formIds).toEqual([8]);
  });

  it('preview lỗi (biểu mẫu đã xoá) → báo lỗi và KHÔNG lưu', async () => {
    const { default: api } = await import('../../services/campaignBuilderApi.service');
    api.previewFormSubmissions.mockRejectedValueOnce(Object.assign(new Error('x'), { response: { data: { message: 'Biểu mẫu đã bị xoá' } } }));
    const args = baseArgs();
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await handleNodeConfigSaveClick({ ...args, formData: { formIds: [8] } });

    expect(args.toastNotifier.error).toHaveBeenCalledWith('Biểu mẫu đã bị xoá');
    expect(args.onSave).not.toHaveBeenCalled();
    errSpy.mockRestore();
  });
});
