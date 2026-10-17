import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockPreview = jest.fn();
const mockBuildCreateDraft = jest.fn();
const mockCleanup = jest.fn();
const mockCreateCampaign = jest.fn();
const mockLogWorkspace = jest.fn();

class MockSimpleCampaignError extends Error {
  constructor(statusCode, code, message, extra = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.extra = extra;
  }
}

jest.unstable_mockModule('../../services/campaign/campaignSimple.service.js', () => ({
  default: {
    previewSimpleCampaign: mockPreview,
    buildSimpleCreateDraft: mockBuildCreateDraft,
    cleanupCreatedTemplates: mockCleanup,
  },
  SimpleCampaignError: MockSimpleCampaignError,
}));
jest.unstable_mockModule('../../services/audit.service.js', () => ({
  logWorkspace: mockLogWorkspace,
  AUDIT_ACTIONS: { CAMPAIGN_UPDATED: 'CAMPAIGN_UPDATED' },
  AUDIT_ENTITY_TYPES: { CAMPAIGN: 'campaign' },
}));
jest.unstable_mockModule('../campaign.controller.js', () => ({
  default: { create: mockCreateCampaign },
}));

const { default: controller } = await import('../campaignSimple.controller.js');

const makeRes = () => {
  const res = { status: jest.fn(() => res), json: jest.fn(() => res) };
  return res;
};
const makeReq = (overrides = {}) => ({
  user: { id: 7, role: 'user', activeContext: { type: 'self' } },
  body: { channel: 'email' },
  ...overrides,
});

const draft = {
  ownerId: 7,
  campaignName: 'Email – 14/10/2026 10:05',
  channel: 'email',
  nodes: [{ id: 'n1' }],
  connections: [],
  recipientCountHint: 2,
};

describe('campaignSimple.controller.create', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBuildCreateDraft.mockResolvedValue(draft);
    mockCleanup.mockResolvedValue(undefined);
    mockCreateCampaign.mockImplementation(async (req, res) => res.status(201).json({ success: true, data: { id: 55 } }));
  });

  it('tạo thành công → 201 { campaignId, campaignName, channel, recipientCountHint }; gắn campaignVia = simple và body chiến dịch thường', async () => {
    const res = makeRes();
    await controller.create(makeReq(), res);

    expect(mockCreateCampaign).toHaveBeenCalledTimes(1);
    const [createReq] = mockCreateCampaign.mock.calls[0];
    expect(createReq.campaignVia).toBe('simple');
    expect(createReq.body).toEqual({
      campaignName: 'Email – 14/10/2026 10:05',
      description: '',
      campaignType: 'email',
      nodes: [{ id: 'n1' }],
      connections: [],
    });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { campaignId: 55, campaignName: 'Email – 14/10/2026 10:05', channel: 'email', recipientCountHint: 2 },
    });
    expect(mockCleanup).not.toHaveBeenCalled();
  });

  it('campaignController.create báo lỗi hạn mức (400) → trả nguyên trạng thái + body, DỌN mẫu vừa tạo', async () => {
    mockCreateCampaign.mockImplementation(async (req, res) => res.status(400).json({ success: false, message: 'Đã đạt giới hạn', limitReached: true }));
    const res = makeRes();
    await controller.create(makeReq(), res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Đã đạt giới hạn', limitReached: true });
    expect(mockCleanup).toHaveBeenCalledTimes(1);
    expect(mockCleanup.mock.calls[0][1]).toBe(7);
  });

  it('service ném lỗi nghiệp vụ → trả statusCode + code + message + extra, KHÔNG gọi tạo chiến dịch', async () => {
    mockBuildCreateDraft.mockRejectedValue(new MockSimpleCampaignError(400, 'ZALO_GROUPS_REQUIRED', 'Vui lòng chọn ít nhất một nhóm Zalo để gửi.', { issues: [] }));
    const res = makeRes();
    await controller.create(makeReq(), res);

    expect(mockCreateCampaign).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      code: 'ZALO_GROUPS_REQUIRED',
      message: 'Vui lòng chọn ít nhất một nhóm Zalo để gửi.',
      issues: [],
    });
  });

  it('lỗi có statusCode từ util (vd INVALID_MANUAL_RECIPIENTS) cũng đi qua đúng mã', async () => {
    const error = Object.assign(new Error('Có email không hợp lệ trong danh sách.'), { statusCode: 400, code: 'INVALID_MANUAL_RECIPIENTS' });
    mockBuildCreateDraft.mockRejectedValue(error);
    const res = makeRes();
    await controller.create(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, code: 'INVALID_MANUAL_RECIPIENTS', message: 'Có email không hợp lệ trong danh sách.' });
  });

  it('lỗi lạ → 500 thông điệp chung (không lộ chi tiết nội bộ) và dọn mẫu đã tạo giữa chừng theo ĐÚNG chủ workspace', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockBuildCreateDraft.mockRejectedValue(new Error('connection to server at 10.0.0.5 failed'));
    const res = makeRes();
    await controller.create(makeReq({ user: { id: 8, role: 'user', activeContext: { type: 'employee', ownerId: 3 } } }), res);

    expect(res.status).toHaveBeenCalledWith(500);
    const body = res.json.mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(JSON.stringify(body)).not.toContain('10.0.0.5');
    expect(mockCleanup).toHaveBeenCalledTimes(1);
    expect(mockCleanup.mock.calls[0][1]).toBe(3);
    console.error.mockRestore();
  });

  it('đã tạo chiến dịch xong rồi mà trả lời hỏng thì KHÔNG xoá mẫu (mẫu đã gắn vào chiến dịch)', async () => {
    const res = makeRes();
    res.status.mockImplementationOnce(() => { throw new Error('socket closed'); });
    jest.spyOn(console, 'error').mockImplementation(() => {});
    await controller.create(makeReq(), res);
    expect(mockCleanup).not.toHaveBeenCalled();
    console.error.mockRestore();
  });
});

describe('campaignSimple.controller.preview', () => {
  beforeEach(() => jest.clearAllMocks());

  it('trả { success, data } từ service, KHÔNG gọi tạo chiến dịch', async () => {
    mockPreview.mockResolvedValue({ readyToCreate: true, issues: [] });
    const res = makeRes();
    await controller.preview(makeReq(), res);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { readyToCreate: true, issues: [] } });
    expect(mockCreateCampaign).not.toHaveBeenCalled();
    expect(mockBuildCreateDraft).not.toHaveBeenCalled();
  });

  it('lỗi nghiệp vụ → đúng mã HTTP', async () => {
    mockPreview.mockRejectedValue(new MockSimpleCampaignError(403, 'CHANNEL_NOT_IN_PLAN', 'Gói của bạn không có kênh Zalo'));
    const res = makeRes();
    await controller.preview(makeReq(), res);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, code: 'CHANNEL_NOT_IN_PLAN', message: 'Gói của bạn không có kênh Zalo' });
  });
});

