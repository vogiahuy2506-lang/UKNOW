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
