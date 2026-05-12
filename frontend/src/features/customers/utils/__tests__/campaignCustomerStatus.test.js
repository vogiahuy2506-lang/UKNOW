import { describe, it, expect } from 'vitest';
import { resolveCampaignStatus, getCampaignStatusMeta } from '../campaignCustomerStatus';

describe('resolveCampaignStatus', () => {
  it('orderStatus completed → "completed"', () => {
    expect(resolveCampaignStatus({ orderStatus: 'completed' })).toBe('completed');
    expect(resolveCampaignStatus({ orderStatus: 'purchased' })).toBe('completed');
    expect(resolveCampaignStatus({ orderStatus: 'processing' })).toBe('completed');
  });

  it('orderStatus on-hold/lead/interested → "on-hold"', () => {
    expect(resolveCampaignStatus({ orderStatus: 'on-hold' })).toBe('on-hold');
    expect(resolveCampaignStatus({ orderStatus: 'on_hold' })).toBe('on-hold');
    expect(resolveCampaignStatus({ orderStatus: 'onhold' })).toBe('on-hold');
    expect(resolveCampaignStatus({ orderStatus: 'lead' })).toBe('on-hold');
    expect(resolveCampaignStatus({ orderStatus: 'interested' })).toBe('on-hold');
  });

  it('orderStatus case-insensitive + trim', () => {
    expect(resolveCampaignStatus({ orderStatus: '  COMPLETED  ' })).toBe('completed');
    expect(resolveCampaignStatus({ orderStatus: 'On-Hold' })).toBe('on-hold');
  });

  it('không có order: campaignHasClicked → "campaign_clicked"', () => {
    expect(resolveCampaignStatus({ campaignHasClicked: true })).toBe('campaign_clicked');
  });

  it('không có order, không click, có opened → "campaign_opened"', () => {
    expect(resolveCampaignStatus({ campaignHasOpened: true })).toBe('campaign_opened');
  });

  it('chỉ có receivedCount > 0 → "campaign_sent"', () => {
    expect(resolveCampaignStatus({ campaignEmailReceivedCount: 5 })).toBe('campaign_sent');
  });

  it('receivedCount = 0 hoặc undefined → null', () => {
    expect(resolveCampaignStatus({ campaignEmailReceivedCount: 0 })).toBeNull();
    expect(resolveCampaignStatus({})).toBeNull();
  });

  it('priority: orderStatus completed thắng cả campaign flags', () => {
    expect(resolveCampaignStatus({
      orderStatus: 'completed',
      campaignHasClicked: true,
      campaignHasOpened: true,
    })).toBe('completed');
  });

  it('priority: clicked > opened > sent', () => {
    expect(resolveCampaignStatus({
      campaignHasClicked: true,
      campaignHasOpened: true,
      campaignEmailReceivedCount: 5,
    })).toBe('campaign_clicked');
    expect(resolveCampaignStatus({
      campaignHasOpened: true,
      campaignEmailReceivedCount: 5,
    })).toBe('campaign_opened');
  });

  it('customer undefined → null (default object)', () => {
    expect(resolveCampaignStatus()).toBeNull();
  });
});

describe('getCampaignStatusMeta', () => {
  it('status null/undefined/"" → null', () => {
    expect(getCampaignStatusMeta(null)).toBeNull();
    expect(getCampaignStatusMeta(undefined)).toBeNull();
    expect(getCampaignStatusMeta('')).toBeNull();
  });

  it('completed → "Đã mua" + badge-success', () => {
    expect(getCampaignStatusMeta('completed')).toEqual({ label: 'Đã mua', cls: 'badge-success' });
    expect(getCampaignStatusMeta('purchased')).toEqual({ label: 'Đã mua', cls: 'badge-success' });
  });

  it('on-hold / lead → "Để lại thông tin" + badge-warning', () => {
    expect(getCampaignStatusMeta('on-hold').label).toBe('Để lại thông tin');
    expect(getCampaignStatusMeta('lead').cls).toBe('badge-warning');
  });

  it('campaign_clicked: email campaign → "Đã click link"', () => {
    expect(getCampaignStatusMeta('campaign_clicked', { campaignType: 'email' })).toEqual({
      label: 'Đã click link',
      cls: 'badge-info',
    });
  });

  it('campaign_clicked: Zalo campaign → "Đã nhấp link"', () => {
    expect(getCampaignStatusMeta('campaign_clicked', { campaignType: 'zalo' }).label).toBe('Đã nhấp link');
    expect(getCampaignStatusMeta('campaign_clicked', { campaignType: 'zalo_group' }).label).toBe('Đã nhấp link');
  });

  it('campaign_opened: zalo → "Đã có tương tác", email → "Đã xem email"', () => {
    expect(getCampaignStatusMeta('campaign_opened', { campaignType: 'zalo' }).label).toBe('Đã có tương tác');
    expect(getCampaignStatusMeta('campaign_opened', {}).label).toBe('Đã xem email');
  });

  it('campaign_sent: zalo → "Đã nhận tin Zalo", default → "Đã nhận email"', () => {
    expect(getCampaignStatusMeta('campaign_sent', { campaignType: 'zalo' }).label).toBe('Đã nhận tin Zalo');
    expect(getCampaignStatusMeta('campaign_sent').label).toBe('Đã nhận email');
  });

  it('status không khớp map → fallback label = status nguyên + badge-gray', () => {
    expect(getCampaignStatusMeta('weird_status')).toEqual({ label: 'weird_status', cls: 'badge-gray' });
  });
});
