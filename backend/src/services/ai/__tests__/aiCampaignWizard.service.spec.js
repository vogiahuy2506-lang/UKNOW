import { describe, expect, it } from '@jest/globals';
import {
  evaluateNextGate,
  extractWizardState,
  isContentPlanRevisionText,
} from '../aiCampaignWizard.service.js';

describe('aiCampaignWizard.service', () => {
  it('extracts only gate answers after the latest channel marker', () => {
    const state = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nZalo cá nhân' },
      { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo","accountId":1,"accountName":"A"}\nChọn A' },
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nĐổi qua email' },
    ]);

    expect(state.channel).toBe('email');
    expect(state.senderAccountId).toBeNull();
  });

  it('asks sender account before datasource even when only one account exists', () => {
    const state = extractWizardState([
      { role: 'user', content: 'Tạo chiến dịch email chăm sóc khách hàng từ DB' },
      { role: 'assistant', type: 'confirm_create', content: 'ok', data: { campaignType: 'email' } },
    ]);

    const gate = evaluateNextGate(state, {
      emailSenders: [{ id: 7, name: 'Sales', email: 'sales@example.com', status: 'active' }],
    });

    expect(gate.gate).toBe('senderAccount');
    expect(gate.response.type).toBe('ask_sender_account');
    expect(gate.response.data.accounts).toHaveLength(1);
  });

  it('returns onboarding card when email sender setup is requested', () => {
    const state = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
      { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","other":true}\nTài khoản khác' },
    ]);

    const gate = evaluateNextGate(state, { emailSenders: [] });

    expect(gate.gate).toBe('senderAccount');
    expect(gate.response.type).toBe('email_setup_guide');
  });

  it('asks group picker for zalo_group after sender account', () => {
    const state = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo_group"}\nZalo nhóm' },
      { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo_group","accountId":12}\nTK 12' },
    ]);

    const gate = evaluateNextGate(state, {});

    expect(gate.gate).toBe('zaloGroups');
    expect(gate.response).toMatchObject({
      type: 'zalo_group_picker',
      data: { accountId: 12 },
    });
  });

  it('re-asks schedule when drip is missing day count', () => {
    const state = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
      { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7}\nSales' },
      { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' },
      { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip"}\nLịch gửi Chuỗi nhiều ngày' },
    ]);

    const gate = evaluateNextGate(state, {});

    expect(gate.gate).toBe('schedule');
    expect(gate.response.data.questions[0].options.map((opt) => opt.value)).toEqual(['once', 'drip']);
  });

  it('accepts drip schedule when day count is provided', () => {
    const state = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
      { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7}\nSales' },
      { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' },
      { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip","days":5,"slotsPerDay":2}\nLịch gửi: 5 ngày, mỗi ngày 2 tin' },
    ]);

    const gate = evaluateNextGate(state, {});

    expect(gate).toBeNull();
  });

  it('asks schedule after datasource for personal channels', () => {
    const state = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nZalo' },
      { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo","accountId":12}\nTK 12' },
      { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' },
    ]);

    const gate = evaluateNextGate(state, {});

    expect(gate.gate).toBe('schedule');
    expect(gate.response.type).toBe('ask_campaign_details');
  });

  it('shows Zalo QR reconnect when all accounts are disconnected', () => {
    const state = extractWizardState([
      { role: 'user', content: 'Tạo chiến dịch Zalo cá nhân chăm sóc lead landing page' },
    ]);

    const gate = evaluateNextGate(state, {
      zaloAccounts: [
        { id: 1, displayName: 'SIM1', status: 'disconnected', isActive: true },
        { id: 2, displayName: 'Account 2', status: 'disconnected', isActive: true },
      ],
    });

    expect(gate.gate).toBe('senderAccount');
    expect(gate.response.type).toBe('zalo_qr_login');
    expect(gate.response.content).toMatch(/mất kết nối|disconnected/i);
  });

  it('still asks sender picker when at least one Zalo account is connected', () => {
    const state = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nZalo' },
    ]);

    const gate = evaluateNextGate(state, {
      zaloAccounts: [
        { id: 1, displayName: 'Offline', status: 'disconnected', isActive: true },
        { id: 2, displayName: 'Online', status: 'connected', isActive: true },
      ],
    });

    expect(gate.gate).toBe('senderAccount');
    expect(gate.response.type).toBe('ask_sender_account');
    expect(gate.response.data.accounts).toHaveLength(2);
    expect(gate.response.data.accounts.filter((account) => account.usable)).toHaveLength(1);
  });

  it('clears stale content plan state when user sends revision feedback', () => {
    const state = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nZalo' },
      { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"zalo","accountId":12}\nTK 12' },
      { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' },
      { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip","days":5,"slotsPerDay":1}\n5 ngày' },
      {
        role: 'assistant',
        type: 'content_plan',
        content: 'Kế hoạch 5 ngày',
        data: { totalDays: 5, days: [{ day: 1, channel: 'zalo', slots: [{ channel: 'zalo', summary: 'Chào' }] }] },
      },
      { role: 'user', content: 'Góp ý chỉnh kế hoạch: chỉ 4 ngày thôi' },
    ]);

    expect(isContentPlanRevisionText('Góp ý chỉnh kế hoạch: chỉ 4 ngày')).toBe(true);
    expect(state.hasContentPlan).toBe(false);
    expect(state.planApproved).toBe(false);
    expect(evaluateNextGate(state, {})).toBeNull();
  });

  it('infers plan approval from drafted templates when the marker is missing', () => {
    const state = extractWizardState([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
      { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7}\nSales' },
      { role: 'user', content: '[wizard]{"gate":"dataSource","value":"sheet"}\nGoogle Sheet' },
      { role: 'user', content: '[wizard]{"gate":"schedule","value":"drip","mode":"drip","days":3,"slotsPerDay":1}\n3 ngày' },
      {
        role: 'assistant',
        type: 'content_plan',
        content: 'Kế hoạch 3 ngày',
        data: { totalDays: 3, days: [{ day: 1, channel: 'email', slots: [{ channel: 'email', summary: 'Ra mắt' }] }] },
      },
      // Không có marker planApproved (mất do session reload) nhưng template đã được soạn
      { role: 'assistant', type: 'template_draft', content: 'Email 1', data: { channel: 'email', templateName: 'Email 1' } },
    ]);

    expect(state.planApproved).toBe(true);
    expect(evaluateNextGate(state, {
      emailSenders: [{ id: 7, name: 'Sales', email: 'sales@example.com', status: 'active' }],
    })).toBeNull();
  });

  it('does not infer plan approval from templates drafted without a content plan', () => {
    const state = extractWizardState([
      { role: 'user', content: 'Tạo chiến dịch email ra mắt sản phẩm trong 3 ngày' },
      { role: 'assistant', type: 'template_draft', content: 'Email 1', data: { channel: 'email', templateName: 'Email 1' } },
    ]);

    expect(state.planApproved).toBe(false);
  });

  it('re-asks schedule when free-text infers recurring (not yet supported)', () => {
    const state = extractWizardState([
      { role: 'user', content: 'Tạo chiến dịch email gửi mỗi 7 ngày cho khách trong DB' },
      { role: 'assistant', type: 'confirm_create', content: 'ok', data: { campaignType: 'email' } },
      { role: 'user', content: '[wizard]{"gate":"senderAccount","channel":"email","accountId":7}\nSales' },
      { role: 'user', content: '[wizard]{"gate":"dataSource","value":"db"}\nDB' },
    ]);

    const gate = evaluateNextGate(state, {
      emailSenders: [{ id: 7, name: 'Sales', email: 'sales@example.com', status: 'active' }],
    });

    expect(gate.gate).toBe('schedule');
    expect(gate.response.content).toMatch(/lặp định kỳ|recurring/i);
    expect(gate.response.data.questions[0].options.map((o) => o.value)).toEqual(['once', 'drip']);
  });
});
