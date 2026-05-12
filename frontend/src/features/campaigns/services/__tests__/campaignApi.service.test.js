import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../services/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from '../../../../services/api';
import { campaignApiService } from '../campaignApi.service';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('campaignApiService', () => {
  it('getCampaigns không params → params {}', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignApiService.getCampaigns();
    expect(api.get).toHaveBeenCalledWith('/campaigns', { params: {} });
  });

  it('getCampaigns với params → forward params', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignApiService.getCampaigns({ page: 2, limit: 50 });
    expect(api.get).toHaveBeenCalledWith('/campaigns', { params: { page: 2, limit: 50 } });
  });

  it('getCampaignById → GET /campaigns/{id}', () => {
    api.get.mockReturnValueOnce(Promise.resolve({}));
    campaignApiService.getCampaignById(7);
    expect(api.get).toHaveBeenCalledWith('/campaigns/7');
  });

  it('createCampaign → POST /campaigns với payload', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    campaignApiService.createCampaign({ name: 'X' });
    expect(api.post).toHaveBeenCalledWith('/campaigns', { name: 'X' });
  });

  it('updateCampaign → PUT /campaigns/{id} với payload', () => {
    api.put.mockReturnValueOnce(Promise.resolve({}));
    campaignApiService.updateCampaign(9, { name: 'Y' });
    expect(api.put).toHaveBeenCalledWith('/campaigns/9', { name: 'Y' });
  });

  it('deleteCampaign → DELETE /campaigns/{id}', () => {
    api.delete.mockReturnValueOnce(Promise.resolve({}));
    campaignApiService.deleteCampaign(11);
    expect(api.delete).toHaveBeenCalledWith('/campaigns/11');
  });

  it('runCampaign default payload {}', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    campaignApiService.runCampaign(7);
    expect(api.post).toHaveBeenCalledWith('/campaigns/7/run', {});
  });

  it('runCampaign payload custom', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    campaignApiService.runCampaign(7, { force: true });
    expect(api.post).toHaveBeenCalledWith('/campaigns/7/run', { force: true });
  });

  it('pauseCampaign → POST /campaigns/{id}/pause (no body)', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    campaignApiService.pauseCampaign(7);
    expect(api.post).toHaveBeenCalledWith('/campaigns/7/pause');
  });

  it('resumeCampaign → POST /campaigns/{id}/resume (no body)', () => {
    api.post.mockReturnValueOnce(Promise.resolve({}));
    campaignApiService.resumeCampaign(7);
    expect(api.post).toHaveBeenCalledWith('/campaigns/7/resume');
  });
});
