import { describe, expect, it } from '@jest/globals';
import { resolveCampaignResources } from '../campaignResourceResolver.service.js';

describe('PR-2.2: campaignResourceResolver.service', () => {
  const sampleEmailSenders = [
    { id: 1, name: 'Active Sender', email: 'active@example.com', status: 'active', is_active: true },
    { id: 2, name: 'Inactive Sender', email: 'inactive@example.com', status: 'inactive', is_active: false },
  ];

  const sampleZaloAccounts = [
    { id: 10, displayName: 'Connected Zalo', status: 'connected', isActive: true },
    { id: 20, displayName: 'Disconnected Zalo', status: 'disconnected', isActive: true },
  ];

  it('xác thực thành công email sender đang active', async () => {
    const intent = {
      version: 1,
      channel: 'email',
      sender: { type: 'email_account', id: 1 },
      audience: { type: 'db' },
      schedule: { type: 'once' },
    };

    const res = await resolveCampaignResources(intent, { emailSenders: sampleEmailSenders });
    expect(res.ok).toBe(true);
    expect(res.resolved.senderAccount).toEqual(sampleEmailSenders[0]);
    expect(res.errors).toEqual([]);
  });

  it('từ chối email sender không tồn tại hoặc inactive', async () => {
    const intentNonExistent = {
      version: 1,
      channel: 'email',
      sender: { type: 'email_account', id: 99 },
    };
    const res1 = await resolveCampaignResources(intentNonExistent, { emailSenders: sampleEmailSenders });
    expect(res1.ok).toBe(false);
    expect(res1.errors[0]).toContain('không tồn tại');

    const intentInactive = {
      version: 1,
      channel: 'email',
      sender: { type: 'email_account', id: 2 },
    };
    const res2 = await resolveCampaignResources(intentInactive, { emailSenders: sampleEmailSenders });
    expect(res2.ok).toBe(false);
    expect(res2.errors[0]).toContain('không hoạt động');
  });

  it('từ chối Zalo account đã disconnected (Bảo vệ preflight resource A4)', async () => {
    const intentZalo = {
      version: 1,
      channel: 'zalo',
      sender: { type: 'zalo_account', id: 20 },
    };

    const res = await resolveCampaignResources(intentZalo, { zaloAccounts: sampleZaloAccounts });
    expect(res.ok).toBe(false);
    expect(res.errors[0]).toContain('mất kết nối');
  });

  it('kiểm tra Google Sheet đúng kênh liên hệ', async () => {
    const intentSheet = {
      version: 1,
      channel: 'email',
      sender: { type: 'email_account', id: 1 },
      audience: { type: 'sheet', url: 'https://sheet.url' },
    };

    // Case 1: Sheet OK
    const mockCheckOk = async () => ({ status: 'ok', emailCount: 5, phoneCount: 0 });
    const resOk = await resolveCampaignResources(intentSheet, {
      emailSenders: sampleEmailSenders,
      checkSheetFn: mockCheckOk,
    });
    expect(resOk.ok).toBe(true);

    // Case 2: Sheet sai kênh (không có email cho kênh email)
    const mockCheckWrongChannel = async () => ({ status: 'wrong_channel', emailCount: 0, phoneCount: 10 });
    const resWrong = await resolveCampaignResources(intentSheet, {
      emailSenders: sampleEmailSenders,
      checkSheetFn: mockCheckWrongChannel,
    });
    expect(resWrong.ok).toBe(false);
    expect(resWrong.errors[0]).toContain('không có cột chứa thông tin email');
  });
});
