import { describe, expect, it } from '@jest/globals';
import {
  evaluateNextGate,
  extractWizardState,
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
    expect(gate.response.data.questions[0].options.map((o) => o.value)).toEqual(['once', 'drip_3', 'drip_5']);
  });
});
