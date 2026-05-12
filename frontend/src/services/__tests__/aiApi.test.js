import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock axios instance (./api default export).
vi.mock('../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

// Import sau khi mock đã đăng ký.
const { default: aiApi } = await import('../aiApi');
const { default: api } = await import('../api');

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.put.mockReset();
});

describe('aiApi.generateCampaign', () => {
  it('POST /ai/generate-campaign với { prompt, files } + timeout 120s', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: { campaignName: 'X' } } });
    const result = await aiApi.generateCampaign('Tạo chiến dịch', [{ tempId: 't1', originalName: 'a.pdf' }]);
    expect(api.post).toHaveBeenCalledWith(
      '/ai/generate-campaign',
      { prompt: 'Tạo chiến dịch', files: [{ tempId: 't1', originalName: 'a.pdf' }] },
      { timeout: 120000 }
    );
    expect(result).toEqual({ success: true, data: { campaignName: 'X' } });
  });

  it('files mặc định = [] khi không truyền', async () => {
    api.post.mockResolvedValue({ data: { success: true } });
    await aiApi.generateCampaign('prompt only');
    expect(api.post.mock.calls[0][1]).toEqual({ prompt: 'prompt only', files: [] });
  });

  it('axios reject → throw lên caller', async () => {
    api.post.mockRejectedValue(new Error('Network down'));
    await expect(aiApi.generateCampaign('x')).rejects.toThrow('Network down');
  });
});

describe('aiApi.executeCampaign', () => {
  it('POST /ai/execute-campaign với spread script + autoRun', async () => {
    api.post.mockResolvedValue({ data: { success: true } });
    const script = { campaignName: 'Y', nodes: [] };
    await aiApi.executeCampaign(script, false);
    expect(api.post).toHaveBeenCalledWith('/ai/execute-campaign', {
      campaignName: 'Y',
      nodes: [],
      autoRun: false,
    });
  });

  it('autoRun mặc định = true', async () => {
    api.post.mockResolvedValue({ data: {} });
    await aiApi.executeCampaign({ campaignName: 'Z' });
    expect(api.post.mock.calls[0][1].autoRun).toBe(true);
  });
});

describe('aiApi.chat', () => {
  it('POST /ai/chat với { history, files } + timeout 120s', async () => {
    api.post.mockResolvedValue({ data: { success: true, data: { type: 'text' } } });
    const history = [{ role: 'user', content: 'hi' }];
    await aiApi.chat(history, [{ tempId: 't1' }]);
    expect(api.post).toHaveBeenCalledWith(
      '/ai/chat',
      { history, files: [{ tempId: 't1' }] },
      { timeout: 120000 }
    );
  });

  it('files mặc định = []', async () => {
    api.post.mockResolvedValue({ data: {} });
    await aiApi.chat([{ role: 'user', content: 'x' }]);
    expect(api.post.mock.calls[0][1].files).toEqual([]);
  });
});

describe('aiApi.getBusinessProfile / saveBusinessProfile', () => {
  it('GET /ai/business-profile', async () => {
    api.get.mockResolvedValue({ data: { success: true, data: null } });
    const res = await aiApi.getBusinessProfile();
    expect(api.get).toHaveBeenCalledWith('/ai/business-profile');
    expect(res).toEqual({ success: true, data: null });
  });

  it('PUT /ai/business-profile với body profile', async () => {
    api.put.mockResolvedValue({ data: { success: true, data: { company_name: 'ACME' } } });
    const res = await aiApi.saveBusinessProfile({ company_name: 'ACME', industry: 'AI' });
    expect(api.put).toHaveBeenCalledWith('/ai/business-profile', {
      company_name: 'ACME',
      industry: 'AI',
    });
    expect(res.data.company_name).toBe('ACME');
  });
});
