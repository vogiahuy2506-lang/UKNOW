import { describe, expect, it } from '@jest/globals';
import {
  LANDING_AI_INSTRUCTION_MAX_CHARS,
  LANDING_AI_PROMPT_MAX_CHARS,
  LANDING_AI_TITLE_MAX_CHARS,
  LANDING_AI_USER_SUMMARY_MAX_CHARS,
  findLandingAiInputTooLong,
} from '../landingAiInputLimits.util.js';

describe('landingAiInputLimits (B-2) — trần chữ khách gõ vào AI sinh/sửa landing', () => {
  it('ghim bốn trần: prompt 8.000, instruction 4.000, title 200, userSummary 4.000', () => {
    expect(LANDING_AI_PROMPT_MAX_CHARS).toBe(8000);
    expect(LANDING_AI_INSTRUCTION_MAX_CHARS).toBe(4000);
    expect(LANDING_AI_TITLE_MAX_CHARS).toBe(200);
    expect(LANDING_AI_USER_SUMMARY_MAX_CHARS).toBe(4000);
  });

  it.each([
    ['prompt', 8000, 'LANDING_PROMPT_TOO_LONG'],
    ['instruction', 4000, 'LANDING_INSTRUCTION_TOO_LONG'],
    ['title', 200, 'LANDING_TITLE_TOO_LONG'],
    ['userSummary', 4000, 'LANDING_SUMMARY_TOO_LONG'],
  ])('%s: đúng trần thì qua, trần + 1 thì bị chặn kèm mã %s', (field, max, code) => {
    expect(findLandingAiInputTooLong({ [field]: 'a'.repeat(max) })).toBeNull();
    const hit = findLandingAiInputTooLong({ [field]: 'a'.repeat(max + 1) });
    expect(hit).toMatchObject({ field, code, limit: max, length: max + 1 });
    expect(hit.message).toContain('quá dài');
  });

  it('chỉ kiểm khoá CÓ MẶT: undefined / null không bị chặn, kể cả khi trường khác hợp lệ', () => {
    expect(findLandingAiInputTooLong({})).toBeNull();
    expect(findLandingAiInputTooLong({ prompt: 'ok', title: undefined, userSummary: null })).toBeNull();
    expect(findLandingAiInputTooLong()).toBeNull();
  });

  it('đo trên chuỗi đã trim; giá trị không phải chuỗi được ép về chuỗi', () => {
    expect(findLandingAiInputTooLong({ prompt: `  ${'a'.repeat(8000)}  ` })).toBeNull();
    expect(findLandingAiInputTooLong({ title: 12345 })).toBeNull();
  });

  it('nhiều trường cùng quá dài → báo trường khách gõ chính trước (prompt trước title)', () => {
    const hit = findLandingAiInputTooLong({ title: 'a'.repeat(300), prompt: 'a'.repeat(9000) });
    expect(hit.field).toBe('prompt');
  });

  it('câu báo có số độ dài, trần và nói rõ chưa tốn credit; locale en trả tiếng Anh', () => {
    const vi = findLandingAiInputTooLong({ prompt: 'a'.repeat(9000) }, 'vi');
    expect(vi.message).toContain('9.000');
    expect(vi.message).toContain('8.000');
    expect(vi.message).toMatch(/chưa tốn credit/);

    const en = findLandingAiInputTooLong({ prompt: 'a'.repeat(9000) }, 'en');
    expect(en.message).toContain('9,000');
    expect(en.message).toContain('8,000');
    expect(en.message).toMatch(/too long/);
    expect(en.message).toMatch(/no AI credit was used/);
  });

  it('locale lạ rơi về tiếng Việt', () => {
    const hit = findLandingAiInputTooLong({ title: 'a'.repeat(300) }, 'fr');
    expect(hit.message).toMatch(/quá dài/);
  });
});
