import { describe, expect, it } from '@jest/globals';
import { buildChatbotSystemPrompt } from '../chatbotSystemPrompt.util.js';

/**
 * Khung system prompt chung của chatbot (A P2-5: tách khỏi chatRouter để đường web dùng chung).
 * Hàm thuần — không mock gì.
 */
describe('buildChatbotSystemPrompt — bố cục khung', () => {
  it('thứ tự: CACH HOAT DONG → PHONG CACH → tài liệu/hồ sơ → QUY TAC → HUONG DAN TUY CHINH → ghi chú liên hệ', () => {
    const prompt = buildChatbotSystemPrompt({
      settings: { system_instruction: 'Chỉ bán khoá học AI.', response_style: 'professional' },
      ragContext: 'RAG_MARKER',
      profileContext: 'PROFILE_MARKER',
      contactNote: 'NOTE_MARKER',
    });
    const at = (needle) => prompt.indexOf(needle);
    expect(at('## CACH HOAT DONG')).toBeGreaterThanOrEqual(0);
    expect(at('## CACH HOAT DONG')).toBeLessThan(at('## PHONG CACH TRA LOI'));
    expect(at('## PHONG CACH TRA LOI')).toBeLessThan(at('RAG_MARKER'));
    expect(at('RAG_MARKER')).toBeLessThan(at('PROFILE_MARKER'));
    expect(at('PROFILE_MARKER')).toBeLessThan(at('## QUY TAC QUAN TRONG'));
    expect(at('## QUY TAC QUAN TRONG')).toBeLessThan(at('## HUONG DAN TUY CHINH'));
    expect(at('## HUONG DAN TUY CHINH')).toBeLessThan(at('NOTE_MARKER'));
    expect(prompt).toContain('Chuyen nghiep, ngan gon, suc tich.');
    expect(prompt.endsWith('NOTE_MARKER')).toBe(true);
  });

  it('không có chỉ dẫn tuỳ chỉnh / ghi chú / lời chào → không sinh các khối đó', () => {
    const prompt = buildChatbotSystemPrompt({});
    expect(prompt).not.toContain('## HUONG DAN TUY CHINH');
    expect(prompt).not.toContain('## TIN NHAN DAU TIEN');
    expect(prompt).not.toContain('## MO TA');
    expect(prompt).toContain('Than thien, gan gui, dung emoji phu hop.');
  });

  it('tin đầu tiên → lời chào (welcome_message > greeting_msg của sub-assistant > câu mặc định)', () => {
    expect(buildChatbotSystemPrompt({ isFirstMessage: true, settings: { welcome_message: 'Chào bạn nhé' }, subAssistant: { greeting_msg: 'Hi sub' } }))
      .toContain('"Chào bạn nhé"');
    expect(buildChatbotSystemPrompt({ isFirstMessage: true, subAssistant: { greeting_msg: 'Hi sub' } })).toContain('"Hi sub"');
    expect(buildChatbotSystemPrompt({ isFirstMessage: true })).toContain('"Xin chao! Toi co the giup gi cho ban?"');
  });

  it('mô tả chatbot (nếu truyền) vào khối MO TA', () => {
    expect(buildChatbotSystemPrompt({ chatbot: { description: 'Tư vấn khoá học AI' } })).toContain('## MO TA\nTư vấn khoá học AI');
  });
});
