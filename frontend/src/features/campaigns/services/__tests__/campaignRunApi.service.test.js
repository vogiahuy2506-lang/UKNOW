import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../../../services/api';
import campaignRunApiService from '../campaignRunApi.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('campaignRunApiService — list & detail', () => {
  it('getCampaignById → GET /campaigns/{id}', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignRunApiService.getCampaignById(7);
    expect(api.get).toHaveBeenCalledWith('/campaigns/7', {});
  });

  it('getCampaignsByStatus default limit=100', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignRunApiService.getCampaignsByStatus('active');
    expect(api.get).toHaveBeenCalledWith('/campaigns?status=active&limit=100', {});
  });

  it('getCampaignsByStatus với limit custom', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignRunApiService.getCampaignsByStatus('paused', 25);
    expect(api.get).toHaveBeenCalledWith('/campaigns?status=paused&limit=25', {});
  });

  it('getCampaignSchedules → GET /campaign-schedules', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignRunApiService.getCampaignSchedules();
    expect(api.get).toHaveBeenCalledWith('/campaign-schedules', {});
  });

  it('getCampaignRuns default paramsQuery="limit=100"', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignRunApiService.getCampaignRuns();
    expect(api.get).toHaveBeenCalledWith('/campaign-runs?limit=100', {});
  });

  it('getCampaignRuns với paramsQuery custom', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignRunApiService.getCampaignRuns('campaignId=5&limit=20');
    expect(api.get).toHaveBeenCalledWith('/campaign-runs?campaignId=5&limit=20', {});
  });
});

describe('campaignRunApiService — getCampaignRunDetail (query builder)', () => {
  it('không tham số → URL không có "?"', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignRunApiService.getCampaignRunDetail(99);
    expect(api.get).toHaveBeenCalledWith('/campaign-runs/99', {});
  });

  it('executionLogsLimit, executionLogsAfterId, executionLogsUpdatedAfter → URL kèm query', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignRunApiService.getCampaignRunDetail(99, {
      executionLogsLimit: 50,
      executionLogsAfterId: 1234,
      executionLogsUpdatedAfter: '2026-05-01T00:00:00Z',
    });
    const url = api.get.mock.calls[0][0];
    expect(url.startsWith('/campaign-runs/99?')).toBe(true);
    const u = new URLSearchParams(url.split('?')[1]);
    expect(u.get('executionLogsLimit')).toBe('50');
    expect(u.get('executionLogsAfterId')).toBe('1234');
    expect(u.get('executionLogsUpdatedAfter')).toBe('2026-05-01T00:00:00Z');
  });

  it('executionLogsLimit/AfterId rỗng/null → KHÔNG gắn vào query', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignRunApiService.getCampaignRunDetail(99, {
      executionLogsLimit: '',
      executionLogsAfterId: null,
    });
    expect(api.get).toHaveBeenCalledWith('/campaign-runs/99', {});
  });

  it('chỉ executionLogsUpdatedAfter → query chỉ chứa nó', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignRunApiService.getCampaignRunDetail('abc', {
      executionLogsUpdatedAfter: '2026-05-01',
    });
    expect(api.get).toHaveBeenCalledWith(
      '/campaign-runs/abc?executionLogsUpdatedAfter=2026-05-01',
      {}
    );
  });
});

describe('campaignRunApiService — actions', () => {
  it('runCampaign default payload {} + options', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    campaignRunApiService.runCampaign(7);
    expect(api.post).toHaveBeenCalledWith('/campaigns/7/run', {}, {});
  });

  it('runCampaign payload custom', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    campaignRunApiService.runCampaign(7, { force: true });
    expect(api.post).toHaveBeenCalledWith('/campaigns/7/run', { force: true }, {});
  });

  it('stopCampaignRun → POST /campaign-runs/{id}/stop body rỗng', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    campaignRunApiService.stopCampaignRun(123);
    expect(api.post).toHaveBeenCalledWith('/campaign-runs/123/stop', {}, {});
  });

  it('publishCampaign → POST /campaigns/{id}/publish body rỗng', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    campaignRunApiService.publishCampaign(8);
    expect(api.post).toHaveBeenCalledWith('/campaigns/8/publish', {}, {});
  });
});

describe('campaignRunApiService — schedules CRUD', () => {
  it('createCampaignSchedule → POST /campaign-schedules', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    campaignRunApiService.createCampaignSchedule({ cron: '* * * * *' });
    expect(api.post).toHaveBeenCalledWith('/campaign-schedules', { cron: '* * * * *' }, {});
  });

  it('deleteCampaignSchedule → DELETE /campaign-schedules/{id}', () => {
    api.delete.mockReturnValueOnce(Promise.resolve({}));
    campaignRunApiService.deleteCampaignSchedule(11);
    expect(api.delete).toHaveBeenCalledWith('/campaign-schedules/11', {});
  });

  it('updateCampaignSchedule → PATCH /campaign-schedules/{id} payload', () => {
    api.patch.mockReturnValueOnce(Promise.resolve({}));
    campaignRunApiService.updateCampaignSchedule(12, { enabled: false });
    expect(api.patch).toHaveBeenCalledWith('/campaign-schedules/12', { enabled: false }, {});
  });
});
