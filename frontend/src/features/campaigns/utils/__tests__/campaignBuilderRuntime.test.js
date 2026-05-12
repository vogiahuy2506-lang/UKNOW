import { describe, it, expect } from 'vitest';
import {
  inferValueType,
  buildSchemaFromRows,
  normalizeKey,
  colLettersToNumber,
  resolveColumnKey,
  parseEmailList,
  renderTemplateString,
  applyMappingsForRow,
} from '../campaignBuilderRuntime';

describe('inferValueType', () => {
  it('null/array nhận diện đặc biệt', () => {
    expect(inferValueType(null)).toBe('null');
    expect(inferValueType([])).toBe('array');
    expect(inferValueType([1, 2])).toBe('array');
  });

  it('typeof cho các giá trị khác', () => {
    expect(inferValueType('hi')).toBe('string');
    expect(inferValueType(42)).toBe('number');
    expect(inferValueType(true)).toBe('boolean');
    expect(inferValueType({ a: 1 })).toBe('object');
    expect(inferValueType(undefined)).toBe('undefined');
  });
});

describe('buildSchemaFromRows', () => {
  it('rows rỗng / không phải mảng / row đầu không phải object → []', () => {
    expect(buildSchemaFromRows([])).toEqual([]);
    expect(buildSchemaFromRows(null)).toEqual([]);
    expect(buildSchemaFromRows(['not-object'])).toEqual([]);
  });

  it('row đầu — extract keys và type, omit messageText', () => {
    const schema = buildSchemaFromRows([
      { name: 'A', age: 30, tags: ['x'], deleted: false, messageText: 'will be omitted' },
    ]);
    const keys = schema.map((c) => c.key);
    expect(keys).not.toContain('messageText');
    expect(schema).toEqual([
      { key: 'name', type: 'string' },
      { key: 'age', type: 'number' },
      { key: 'tags', type: 'array' },
      { key: 'deleted', type: 'boolean' },
    ]);
  });
});

describe('normalizeKey', () => {
  it('trim + cast string; rỗng/null → ""', () => {
    expect(normalizeKey('  foo  ')).toBe('foo');
    expect(normalizeKey(null)).toBe('');
    expect(normalizeKey(undefined)).toBe('');
    expect(normalizeKey(42)).toBe('42');
  });
});

describe('colLettersToNumber', () => {
  it('A→1, Z→26, AA→27, AZ→52, BA→53, ZZ→702', () => {
    expect(colLettersToNumber('A')).toBe(1);
    expect(colLettersToNumber('Z')).toBe(26);
    expect(colLettersToNumber('AA')).toBe(27);
    expect(colLettersToNumber('AZ')).toBe(52);
    expect(colLettersToNumber('BA')).toBe(53);
    expect(colLettersToNumber('ZZ')).toBe(702);
  });

  it('lowercase tự upper', () => {
    expect(colLettersToNumber('a')).toBe(1);
    expect(colLettersToNumber('aa')).toBe(27);
  });

  it('chứa ký tự không phải A-Z → null', () => {
    expect(colLettersToNumber('A1')).toBeNull();
    expect(colLettersToNumber('A-B')).toBeNull();
  });
});

describe('resolveColumnKey', () => {
  it('ref rỗng → ""', () => {
    expect(resolveColumnKey({}, '')).toBe('');
    expect(resolveColumnKey({}, null)).toBe('');
  });

  it("ref dạng chữ cái → col_N", () => {
    expect(resolveColumnKey({}, 'A')).toBe('col_1');
    expect(resolveColumnKey({}, 'aa')).toBe('col_27');
  });

  it('row có key chính xác (ref có ký tự non-letter) → trả key đó', () => {
    expect(resolveColumnKey({ user_name: 'A', name: 'A' }, 'user_name')).toBe('user_name');
  });

  it('row không có exact key → lookup case-insensitive (ref non-letter)', () => {
    expect(resolveColumnKey({ User_Name: 'An' }, 'user_name')).toBe('User_Name');
    expect(resolveColumnKey({ User_Name: 'An' }, 'USER_NAME')).toBe('User_Name');
  });

  it('không match gì → trả ref nguyên (ref non-letter)', () => {
    expect(resolveColumnKey({ name: 'A' }, 'phone_1')).toBe('phone_1');
  });

  it("ref toàn chữ cái → luôn ánh xạ qua col_N (kể cả khi row có key trùng)", () => {
    expect(resolveColumnKey({ name: 'A' }, 'name')).toMatch(/^col_/);
  });
});

describe('parseEmailList', () => {
  it('split theo \\n / , / ; — trim + filter empty', () => {
    expect(parseEmailList('a@x.com, b@x.com;c@x.com\n d@x.com')).toEqual([
      'a@x.com',
      'b@x.com',
      'c@x.com',
      'd@x.com',
    ]);
  });

  it('null/empty → []', () => {
    expect(parseEmailList(null)).toEqual([]);
    expect(parseEmailList('')).toEqual([]);
    expect(parseEmailList('  ,  ;  ')).toEqual([]);
  });
});

describe('renderTemplateString', () => {
  it('replace {{var}} với giá trị', () => {
    expect(renderTemplateString('Hi {{ name }}!', { name: 'An' })).toBe('Hi An!');
    expect(renderTemplateString('{{a}}-{{b}}', { a: 1, b: 2 })).toBe('1-2');
  });

  it('missing var / null / undefined → "" (xóa placeholder)', () => {
    expect(renderTemplateString('Hi {{name}}!', {})).toBe('Hi !');
    expect(renderTemplateString('{{x}}', { x: null })).toBe('');
    expect(renderTemplateString('{{x}}', null)).toBe('');
  });

  it('null/undefined input → ""', () => {
    expect(renderTemplateString(null, {})).toBe('');
    expect(renderTemplateString(undefined, {})).toBe('');
  });
});

describe('applyMappingsForRow', () => {
  it('sourceType=column — pick từ row theo columnName (key có dấu _ để bypass spreadsheet ref)', () => {
    const vars = applyMappingsForRow(
      { full_name: 'An', email: 'a@x.com' },
      [{ variableName: 'fullName', sourceType: 'column', columnName: 'full_name' }]
    );
    expect(vars).toEqual({ fullName: 'An' });
  });

  it('sourceType=column — columnName là chữ cái A → trả row.col_1', () => {
    const vars = applyMappingsForRow(
      { col_1: 'An' },
      [{ variableName: 'fullName', sourceType: 'column', columnName: 'A' }]
    );
    expect(vars).toEqual({ fullName: 'An' });
  });

  it('sourceType=static — dùng formula raw', () => {
    const vars = applyMappingsForRow({}, [
      { variableName: 'greeting', sourceType: 'static', formula: 'Xin chào' },
    ]);
    expect(vars).toEqual({ greeting: 'Xin chào' });
  });

  it('sourceType=formula — thay col_X bằng giá trị row', () => {
    const vars = applyMappingsForRow(
      { col_1: 'An', col_2: 'a@x.com' },
      [{ variableName: 'line', sourceType: 'formula', formula: 'col_A: col_B' }]
    );
    expect(vars).toEqual({ line: 'An: a@x.com' });
  });

  it('mappings rỗng/null → {}', () => {
    expect(applyMappingsForRow({}, null)).toEqual({});
    expect(applyMappingsForRow({}, [])).toEqual({});
  });

  it('variableName trống → bỏ qua mapping', () => {
    const vars = applyMappingsForRow({ name: 'A' }, [
      { variableName: '', sourceType: 'column', columnName: 'name' },
      { variableName: 'keep', sourceType: 'static', formula: 'X' },
    ]);
    expect(vars).toEqual({ keep: 'X' });
  });

  it('row không có key → trả "" (column source)', () => {
    const vars = applyMappingsForRow({}, [
      { variableName: 'a', sourceType: 'column', columnName: 'missing' },
    ]);
    expect(vars).toEqual({ a: '' });
  });
});
