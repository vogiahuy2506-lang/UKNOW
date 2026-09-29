import { describe, expect, it } from '@jest/globals';
import { getResponseStyleInstruction, RESPONSE_STYLE_INSTRUCTIONS } from '../chatbotResponseStyle.util.js';

// Khop ALLOWED_RESPONSE_STYLES trong chatbot.controller.js (khong export duoc: khai bao cuc bo).
const STYLES = ['friendly', 'professional', 'casual', 'empathetic', 'concise', 'creative'];

describe('chatbotResponseStyle.util - moi phong cach cho phep co cau rieng', () => {
  it.each(STYLES)('%s co cau rieng', (style) => {
    expect(RESPONSE_STYLE_INSTRUCTIONS[style]).toEqual(expect.any(String));
    expect(RESPONSE_STYLE_INSTRUCTIONS[style].length).toBeGreaterThan(5);
    expect(getResponseStyleInstruction(style)).toBe(RESPONSE_STYLE_INSTRUCTIONS[style]);
  });

  it.each(STYLES.filter((s) => s !== 'friendly'))('%s KHONG roi ve cau friendly (emoji)', (style) => {
    expect(getResponseStyleInstruction(style)).not.toBe(RESPONSE_STYLE_INSTRUCTIONS.friendly);
  });

  it('6 cau doi mot khac nhau', () => {
    expect(new Set(STYLES.map((s) => getResponseStyleInstruction(s))).size).toBe(6);
  });

  it('khoa la / thieu -> friendly', () => {
    expect(getResponseStyleInstruction('xyz')).toBe(RESPONSE_STYLE_INSTRUCTIONS.friendly);
    expect(getResponseStyleInstruction(undefined)).toBe(RESPONSE_STYLE_INSTRUCTIONS.friendly);
  });
});
