import { HELP_UI_GLOSSARY, glossaryPromptBlock } from '../helpGlossary.js';

describe('helpGlossary', () => {
  it('includes key nav labels with exact EN casing', () => {
    const map = Object.fromEntries(HELP_UI_GLOSSARY);
    expect(map['Gửi nhanh']).toBe('Quick Send');
    expect(map['Hồ sơ doanh nghiệp']).toBe('Business Profile');
    expect(map['Gói & Thanh toán']).toBe('Plan & Billing');
    expect(map['Quản lý kênh gửi']).toBe('Channel Management');
    expect(map['Tạo chiến dịch mới']).toBe('Create Campaign');
  });

  it('glossaryPromptBlock lists pairs', () => {
    const block = glossaryPromptBlock();
    expect(block).toContain('"Gửi nhanh" → "Quick Send"');
  });
});
