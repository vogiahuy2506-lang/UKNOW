import { describe, it, expect } from 'vitest';
import {
  normalizeDataSelectedColumns,
  applyDataColumnSelectionToItems,
  measureJsonUtf8Bytes,
  formatDataPayloadBytes,
} from '../dataColumnSelection';

describe('normalizeDataSelectedColumns', () => {
  it('non-array → []', () => {
    expect(normalizeDataSelectedColumns(null)).toEqual([]);
    expect(normalizeDataSelectedColumns(undefined)).toEqual([]);
    expect(normalizeDataSelectedColumns('a,b,c')).toEqual([]);
    expect(normalizeDataSelectedColumns({})).toEqual([]);
  });

  it('dedupe + trim, bỏ chuỗi rỗng', () => {
    expect(normalizeDataSelectedColumns(['a', ' a ', 'b', '', '   ', 'b'])).toEqual(['a', 'b']);
  });

  it('cast non-string thành string', () => {
    expect(normalizeDataSelectedColumns([1, 2, '1'])).toEqual(['1', '2']);
  });

  it('null/undefined trong mảng bị bỏ', () => {
    expect(normalizeDataSelectedColumns([null, undefined, 'name'])).toEqual(['name']);
  });
});

describe('applyDataColumnSelectionToItems', () => {
  it('selected rỗng → giữ nguyên items, columnSelectionActive=false', () => {
    const items = [{ a: 1, b: 2 }];
    const { items: out, dataLoadMeta } = applyDataColumnSelectionToItems(items, [], 'sheet');
    expect(out).toEqual(items);
    expect(dataLoadMeta.columnSelectionActive).toBe(false);
    expect(dataLoadMeta.selectedDataColumns).toEqual([]);
    expect(dataLoadMeta.batchEstimatedSavingsBytes).toBe(0);
    expect(dataLoadMeta.dataColumnSelectionKind).toBe('sheet');
    expect(dataLoadMeta.batchPayloadBytesUtf8).toBeGreaterThan(0);
  });

  it('selected non-empty (kind=sheet) — pick keys + alwaysKeep row_number', () => {
    const items = [
      { row_number: 1, name: 'A', email: 'a@x.com', extra: 'X' },
      { row_number: 2, name: 'B', email: 'b@x.com', extra: 'Y' },
    ];
    const { items: out, dataLoadMeta } = applyDataColumnSelectionToItems(items, ['name'], 'sheet');
    expect(out).toEqual([
      { row_number: 1, name: 'A' },
      { row_number: 2, name: 'B' },
    ]);
    expect(dataLoadMeta.columnSelectionActive).toBe(true);
    expect(dataLoadMeta.selectedDataColumns).toEqual(['name']);
    expect(dataLoadMeta.batchEstimatedSavingsBytes).toBeGreaterThan(0);
  });

  it('kind=interested — alwaysKeep customerId, id', () => {
    const items = [{ customerId: 1, id: 10, fullName: 'A', email: 'a@x.com' }];
    const { items: out } = applyDataColumnSelectionToItems(items, ['fullName'], 'interested');
    expect(out[0]).toEqual({ customerId: 1, id: 10, fullName: 'A' });
  });

  it('kind=landing — alwaysKeep leadId, id', () => {
    const items = [{ leadId: 1, id: 10, fullName: 'A', email: 'a@x.com' }];
    const { items: out } = applyDataColumnSelectionToItems(items, ['email'], 'landing');
    expect(out[0]).toEqual({ leadId: 1, id: 10, email: 'a@x.com' });
  });

  it('kind=courses_db — alwaysKeep rỗng', () => {
    const items = [{ id: 1, courseName: 'A', extra: 'X' }];
    const { items: out } = applyDataColumnSelectionToItems(items, ['courseName'], 'courses_db');
    expect(out[0]).toEqual({ courseName: 'A' });
  });

  it('row không phải object → pass-through', () => {
    const items = [null, 'string-row', 42, { a: 1 }];
    const { items: out } = applyDataColumnSelectionToItems(items, ['a'], 'sheet');
    expect(out[0]).toBeNull();
    expect(out[1]).toBe('string-row');
    expect(out[2]).toBe(42);
    expect(out[3]).toEqual({ a: 1 });
  });

  it('items không phải mảng → []', () => {
    const { items: out } = applyDataColumnSelectionToItems(null, ['a'], 'sheet');
    expect(out).toEqual([]);
  });
});

describe('measureJsonUtf8Bytes', () => {
  it('mảng có ký tự ASCII — đếm bytes UTF-8', () => {
    const bytes = measureJsonUtf8Bytes([{ a: 1 }]);
    expect(bytes).toBe(JSON.stringify([{ a: 1 }]).length);
  });

  it('null/undefined → coi như [] → 2 bytes', () => {
    expect(measureJsonUtf8Bytes(null)).toBe(2);
    expect(measureJsonUtf8Bytes(undefined)).toBe(2);
  });

  it('ký tự multi-byte UTF-8 (tiếng Việt) — count > char length', () => {
    const bytes = measureJsonUtf8Bytes([{ name: 'ă' }]);
    expect(bytes).toBeGreaterThan(JSON.stringify([{ name: 'ă' }]).length);
  });
});

describe('formatDataPayloadBytes', () => {
  it('NaN/negative → em-dash', () => {
    expect(formatDataPayloadBytes(NaN)).toBe('—');
    expect(formatDataPayloadBytes(-1)).toBe('—');
    expect(formatDataPayloadBytes('abc')).toBe('—');
  });

  it('< 1KB → bytes', () => {
    expect(formatDataPayloadBytes(0)).toBe('0 B');
    expect(formatDataPayloadBytes(512)).toBe('512 B');
  });

  it('1KB ≤ n < 1MB → KB (1 chữ số sau dấu phẩy)', () => {
    expect(formatDataPayloadBytes(1024)).toBe('1.0 KB');
    expect(formatDataPayloadBytes(2048)).toBe('2.0 KB');
  });

  it('≥ 1MB → MB (2 chữ số)', () => {
    expect(formatDataPayloadBytes(1024 * 1024)).toBe('1.00 MB');
    expect(formatDataPayloadBytes(1024 * 1024 * 2.5)).toBe('2.50 MB');
  });
});
