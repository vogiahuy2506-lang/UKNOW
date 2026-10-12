import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockGetCampaignDataForForms = jest.fn();

jest.unstable_mockModule('axios', () => ({
  default: { get: jest.fn() },
}));

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignNodeData.repository.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../lead/lead.service.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../campaignFlow.service.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../../repositories/campaign/campaignCustomer.repository.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../customer/customerInterested.service.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../customer/customerHelper.service.js', () => ({
  default: {},
}));

jest.unstable_mockModule('../../queue/outboundMessageQueue.service.js', () => ({
  default: {
    isQueueFeatureEnabled: () => false,
  },
  OUTBOUND_MESSAGE_JOB_TYPES: {},
}));

jest.unstable_mockModule('../../form.service.js', () => ({
  default: {
    getCampaignDataForForms: mockGetCampaignDataForForms,
  },
}));

const { default: campaignNodeDataService } = await import('../campaignNodeData.service.js');

describe('campaignNodeDataService.getCustomersFromDataNode — read_form_submissions (PR-6a, PR-7b)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('đồ thị CŨ chỉ có formId -> gọi formService.getCampaignDataForForms([formId]) với userId là chủ workspace, fieldMap, limit đúng config', async () => {
    mockGetCampaignDataForForms.mockResolvedValue({
      items: [
        { submissionId: 1, id: 1, formId: 10, email: 'a@x.com', phone: '0900000001', fullName: 'A' },
      ],
      form: { id: 10, fields: [] },
    });

    const node = {
      id: 'node_form_1',
      node_subtype: 'read_form_submissions',
      config: {
        formId: 10,
        fieldMap: { emailKey: 'f_email' },
        formSubmissionsLimit: 500,
      },
    };

    const result = await campaignNodeDataService.getCustomersFromDataNode(node, 99, []);

    expect(mockGetCampaignDataForForms).toHaveBeenCalledWith([10], 99, {
      fieldMap: { emailKey: 'f_email' },
      limit: 500,
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0].email).toBe('a@x.com');
  });

  it('PR-7b: formId cũ dạng chuỗi số ("10", như select FE lưu) vẫn chạy như cũ -> [10]', async () => {
    mockGetCampaignDataForForms.mockResolvedValue({ items: [], forms: [] });
    const node = { id: 'node_form_legacy_str', node_subtype: 'read_form_submissions', config: { formId: '10' } };
    await campaignNodeDataService.getCustomersFromDataNode(node, 99, []);
    expect(mockGetCampaignDataForForms).toHaveBeenCalledWith([10], 99, expect.any(Object));
  });

  it('PR-7b: formIds nhiều biểu mẫu -> truyền ĐỦ danh sách theo thứ tự, bỏ trùng + giá trị rác', async () => {
    mockGetCampaignDataForForms.mockResolvedValue({ items: [], forms: [] });
    const node = {
      id: 'node_form_multi',
      node_subtype: 'read_form_submissions',
      config: { formIds: [7, '8', 7, 'abc', -1, 9], formSubmissionsLimit: 250 },
    };
    await campaignNodeDataService.getCustomersFromDataNode(node, 99, []);
    expect(mockGetCampaignDataForForms).toHaveBeenCalledWith([7, 8, 9], 99, {
      fieldMap: undefined,
      limit: 250,
    });
  });

  it('PR-7b: formIds hợp lệ THẮNG formId cũ còn sót trong config (không trộn hai nguồn)', async () => {
    mockGetCampaignDataForForms.mockResolvedValue({ items: [], forms: [] });
    const node = {
      id: 'node_form_both',
      node_subtype: 'read_form_submissions',
      config: { formIds: [21, 22], formId: 10 },
    };
    await campaignNodeDataService.getCustomersFromDataNode(node, 99, []);
    expect(mockGetCampaignDataForForms).toHaveBeenCalledWith([21, 22], 99, expect.any(Object));
  });

  it('PR-7b: formIds rỗng/toàn rác và không có formId -> throw "Chưa chọn biểu mẫu", KHÔNG gọi formService', async () => {
    const node = { id: 'node_form_empty', node_subtype: 'read_form_submissions', config: { formIds: [null, 'x', 0] } };
    await expect(campaignNodeDataService.getCustomersFromDataNode(node, 99, [])).rejects.toThrow(/Chưa chọn biểu mẫu/);
    expect(mockGetCampaignDataForForms).not.toHaveBeenCalled();
  });

  it('áp applyDataColumnSelectionToItems với kind "form" — chọn 1 cột thì item chỉ còn cột đó + khoá cố định', async () => {
    mockGetCampaignDataForForms.mockResolvedValue({
      items: [
        {
          submissionId: 5,
          id: 5,
          formId: 10,
          email: 'b@x.com',
          phone: '0900000002',
          fullName: 'B',
          f_service: 'Gói Pro',
          f_notes: 'ghi chú riêng',
        },
      ],
      form: { id: 10, fields: [] },
    });

    const node = {
      id: 'node_form_2',
      node_subtype: 'read_form_submissions',
      config: {
        formId: 10,
        dataSelectedColumns: ['f_service'],
      },
    };

    const result = await campaignNodeDataService.getCustomersFromDataNode(node, 99, []);
    const item = result.items[0];

    // Khoá cố định ALWAYS_KEEP_BY_KIND.form luôn còn, dù không được chọn
    expect(item.submissionId).toBe(5);
    expect(item.id).toBe(5);
    expect(item.email).toBe('b@x.com');
    expect(item.phone).toBe('0900000002');
    expect(item.fullName).toBe('B');
    // Cột được chọn còn lại
    expect(item.f_service).toBe('Gói Pro');
    // Cột KHÔNG được chọn và KHÔNG nằm trong ALWAYS_KEEP -> bị lọc bỏ
    expect(item.f_notes).toBeUndefined();
  });

  it('formId thiếu/không hợp lệ -> throw lỗi rõ, KHÔNG gọi formService (chặn sớm)', async () => {
    const node = {
      id: 'node_form_3',
      node_subtype: 'read_form_submissions',
      config: {},
    };

    await expect(campaignNodeDataService.getCustomersFromDataNode(node, 99, [])).rejects.toThrow(
      /Chưa chọn biểu mẫu/
    );
    expect(mockGetCampaignDataForForms).not.toHaveBeenCalled();
  });

  it('form đã bị xoá / không thuộc workspace -> lỗi từ formService bay nguyên lên (không bị nuốt thành rỗng)', async () => {
    const notFoundError = new Error('Biểu mẫu đã bị xoá hoặc không thuộc quyền quản lý của bạn');
    notFoundError.statusCode = 404;
    notFoundError.code = 'FORM_NOT_FOUND';
    mockGetCampaignDataForForms.mockRejectedValue(notFoundError);

    const node = {
      id: 'node_form_4',
      node_subtype: 'read_form_submissions',
      config: { formId: 999 },
    };

    await expect(campaignNodeDataService.getCustomersFromDataNode(node, 99, [])).rejects.toThrow(
      'Biểu mẫu đã bị xoá hoặc không thuộc quyền quản lý của bạn'
    );
  });
});
