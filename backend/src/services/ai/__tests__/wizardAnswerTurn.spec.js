import { describe, expect, it } from '@jest/globals';
import {
  isWizardAnswerTurn,
  GATE_PROMPT_TYPES,
} from '../aiCampaignWizard.service.js';

describe('isWizardAnswerTurn', () => {
  it('tin user cuối là marker [wizard]{...} → true', () => {
    expect(isWizardAnswerTurn([
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"zalo"}\nTôi chọn Zalo.' },
    ])).toBe(true);
  });

  it('assistant liền trước type ask_sender_account, user gõ tay → true', () => {
    expect(isWizardAnswerTurn([
      { role: 'assistant', type: 'ask_sender_account', content: 'Chọn tài khoản' },
      { role: 'user', content: 'Zalo' },
    ])).toBe(true);
  });

  it('assistant liền trước type template_draft (kết quả) → false', () => {
    expect(isWizardAnswerTurn([
      { role: 'assistant', type: 'template_draft', content: 'Đây là bản nháp' },
      { role: 'user', content: 'sửa lại giọng thân thiện hơn' },
    ])).toBe(false);
  });

  it('chỉ có 1 tin user thường → false', () => {
    expect(isWizardAnswerTurn([
      { role: 'user', content: 'tạo chiến dịch Zalo' },
    ])).toBe(false);
  });

  it('rỗng → false', () => {
    expect(isWizardAnswerTurn([])).toBe(false);
    expect(isWizardAnswerTurn(null)).toBe(false);
  });

  it('GATE_PROMPT_TYPES không gồm thẻ kết quả', () => {
    for (const t of ['template_draft', 'landing_page', 'content_plan', 'auto_created_success']) {
      expect(GATE_PROMPT_TYPES.has(t)).toBe(false);
    }
    expect(GATE_PROMPT_TYPES.has('ask_campaign_details')).toBe(true);
    expect(GATE_PROMPT_TYPES.has('confirm_create')).toBe(true);
  });
});
