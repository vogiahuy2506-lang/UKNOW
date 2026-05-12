import { describe, it, expect } from 'vitest';
import { getCampaignEngagementStatDefinitions } from '../campaignDetailEngagementLabels';

describe('getCampaignEngagementStatDefinitions', () => {
  it('email → 3 eventType email_* và opened có sẵn', () => {
    const defs = getCampaignEngagementStatDefinitions('email');
    expect(defs.sent.eventType).toBe('email_sent');
    expect(defs.opened.eventType).toBe('email_opened');
    expect(defs.opened.unavailableReason).toBeNull();
    expect(defs.clicked.eventType).toBe('email_clicked');
  });

  it('zalo → eventType zalo_*, opened bị disable (unavailableReason)', () => {
    const defs = getCampaignEngagementStatDefinitions('zalo');
    expect(defs.sent.eventType).toBe('zalo_sent');
    expect(defs.opened.eventType).toBeNull();
    expect(defs.opened.unavailableReason).toMatch(/không tracking/);
    expect(defs.clicked.eventType).toBe('zalo_clicked');
  });

  it('zalo_group → giống zalo (opened bị disable)', () => {
    const defs = getCampaignEngagementStatDefinitions('zalo_group');
    expect(defs.sent.eventType).toBe('zalo_sent');
    expect(defs.opened.eventType).toBeNull();
    expect(defs.clicked.eventType).toBe('zalo_clicked');
  });

  it('mixed/unknown/empty → fallback về email_*', () => {
    expect(getCampaignEngagementStatDefinitions('mixed').sent.eventType).toBe('email_sent');
    expect(getCampaignEngagementStatDefinitions(null).sent.eventType).toBe('email_sent');
    expect(getCampaignEngagementStatDefinitions(undefined).sent.eventType).toBe('email_sent');
    expect(getCampaignEngagementStatDefinitions('').sent.eventType).toBe('email_sent');
    expect(getCampaignEngagementStatDefinitions('sms_legacy').sent.eventType).toBe('email_sent');
  });

  it('chuẩn hoá whitespace + case', () => {
    expect(getCampaignEngagementStatDefinitions('  ZALO  ').sent.eventType).toBe('zalo_sent');
    expect(getCampaignEngagementStatDefinitions('Zalo_Group').sent.eventType).toBe('zalo_sent');
  });

  it('label "Đã gửi", "Đã mở", "Đã click" áp dụng cho cả email và zalo', () => {
    for (const type of ['email', 'zalo', 'zalo_group']) {
      const defs = getCampaignEngagementStatDefinitions(type);
      expect(defs.sent.label).toBe('Đã gửi');
      expect(defs.opened.label).toBe('Đã mở');
      expect(defs.clicked.label).toBe('Đã click');
    }
  });
});
