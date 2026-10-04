import { describe, expect, it } from '@jest/globals';
import {
  extractFirstJsonObject,
  parseAiJson,
  validateWorkflowNodes,
} from '../aiJsonParse.util.js';

describe('parseAiJson', () => {
  it('parses clean JSON and normalizes type', () => {
    const out = parseAiJson('{"type":"text","content":"xin chào","missing_fields":[]}');
    expect(out).toMatchObject({ type: 'text', content: 'xin chào' });
  });

  it('rescues first object when trailing garbage follows (no throw)', () => {
    const out = parseAiJson('{"type":"text","content":"ok"} trailing junk from model');
    expect(out).toMatchObject({ type: 'text', content: 'ok' });
  });

  it('uses the first object when two objects are concatenated', () => {
    const out = parseAiJson('{"type":"text","content":"first"}{"type":"text","content":"second"}');
    expect(out.content).toBe('first');
  });

  it('escapes unescaped control chars inside strings', () => {
    const raw = '{"type":"text","content":"line1\nline2"}';
    const out = parseAiJson(raw);
    expect(out.type).toBe('text');
    expect(out.content).toContain('line1');
    expect(out.content).toContain('line2');
  });

  it('falls back to friendly text for empty / non-JSON that looks like JSON', () => {
    const out = parseAiJson('{not-json');
    expect(out).toMatchObject({
      type: 'text',
      data: null,
      missing_fields: [],
    });
    expect(out.content).toMatch(/lỗi định dạng/i);
  });

  it('returns original plain text when parse fails and input is not JSON-like', () => {
    const out = parseAiJson('xin chào bạn');
    expect(out).toMatchObject({ type: 'text', content: 'xin chào bạn' });
  });

  // C P3-1 (PLAN_SUA_AI_DOT4 PR-3): cờ `parseFailed` chỉ gắn khi AI KHÔNG tạo được câu trả lời dùng được (lời xin lỗi soạn sẵn).
  describe('cờ parseFailed (controller dựa vào đây để không trừ credit)', () => {
    it('JSON hỏng (trông giống JSON) → parseFailed: true', () => {
      expect(parseAiJson('{not-json').parseFailed).toBe(true);
      expect(parseAiJson('```json\n{"type":"text","content":"cắt giữa').parseFailed).toBe(true);
    });

    it('văn xuôi thuần là câu trả lời THẬT → KHÔNG có cờ (vẫn được trừ credit)', () => {
      expect(parseAiJson('xin chào bạn')).not.toHaveProperty('parseFailed');
    });

    it('JSON hợp lệ (kể cả cứu được từ rác phía sau) → KHÔNG có cờ', () => {
      expect(parseAiJson('{"type":"text","content":"ok"}')).not.toHaveProperty('parseFailed');
      expect(parseAiJson('{"type":"text","content":"ok"} trailing junk')).not.toHaveProperty('parseFailed');
    });
  });

  it('maps text/response fields onto content', () => {
    expect(parseAiJson('{"type":"text","text":"a"}').content).toBe('a');
    expect(parseAiJson('{"type":"text","response":"b"}').content).toBe('b');
  });
});

describe('extractFirstJsonObject', () => {
  it('returns null when no brace', () => {
    expect(extractFirstJsonObject('nope')).toBeNull();
  });

  it('ignores braces inside strings', () => {
    const s = '{"a":"x{y}z","b":1} trailing';
    expect(extractFirstJsonObject(s)).toBe('{"a":"x{y}z","b":1}');
  });
});

describe('validateWorkflowNodes', () => {
  it('passes through objects without nodes', () => {
    const parsed = { type: 'text' };
    expect(validateWorkflowNodes(parsed)).toBe(parsed);
  });
});
