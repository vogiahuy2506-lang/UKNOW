import { describe, it, expect } from '@jest/globals';
import { Buffer } from 'node:buffer';
import {
  normalizeDataSelectedColumns,
  applyDataColumnSelectionToItems,
  measureJsonUtf8Bytes,
} from '../dataColumnSelection.util.js';

describe('dataColumnSelection.util', () => {
  describe('normalizeDataSelectedColumns', () => {
    it('trả mảng rỗng nếu input không phải array', () => {
      expect(normalizeDataSelectedColumns(null)).toEqual([]);
      expect(normalizeDataSelectedColumns(undefined)).toEqual([]);
      expect(normalizeDataSelectedColumns('column')).toEqual([]);
      expect(normalizeDataSelectedColumns({})).toEqual([]);
    });

    it('trim và bỏ rỗng', () => {
      expect(normalizeDataSelectedColumns(['  name  ', ' email '])).toEqual(['name', 'email']);
      expect(normalizeDataSelectedColumns(['name', '', '   ', 'email'])).toEqual(['name', 'email']);
    });

    it('deduplicate (giữ thứ tự xuất hiện đầu)', () => {
      expect(normalizeDataSelectedColumns(['a', 'b', 'a', 'c', 'b'])).toEqual(['a', 'b', 'c']);
    });

    it('cast non-string sang string', () => {
      expect(normalizeDataSelectedColumns([123, true, null])).toEqual(['123', 'true']);
    });

    it('mảng rỗng → kết quả rỗng', () => {
      expect(normalizeDataSelectedColumns([])).toEqual([]);
    });
  });

  describe('applyDataColumnSelectionToItems', () => {
    const sampleItems = [
      { id: 1, name: 'Alice', email: 'a@x.com', phone: '0900', extra: 'big-payload' },
      { id: 2, name: 'Bob', email: 'b@x.com', phone: '0901', extra: 'big-payload' },
    ];

    it('không chọn cột → trả nguyên list và meta không active', () => {
      const r = applyDataColumnSelectionToItems(sampleItems, [], 'sheet');
      expect(r.items).toEqual(sampleItems);
      expect(r.dataLoadMeta.columnSelectionActive).toBe(false);
      expect(r.dataLoadMeta.selectedDataColumns).toEqual([]);
      expect(r.dataLoadMeta.batchEstimatedSavingsBytes).toBe(0);
      expect(r.dataLoadMeta.dataColumnSelectionKind).toBe('sheet');
      // bytes phải khớp đo thủ công
      const expected = Buffer.byteLength(JSON.stringify(sampleItems), 'utf8');
      expect(r.dataLoadMeta.batchPayloadBytesUtf8).toBe(expected);
      expect(r.dataLoadMeta.batchPayloadBytesIfAllColumnsUtf8).toBe(expected);
    });

    it('chọn cột → chỉ giữ cột chọn + alwaysKeep theo kind', () => {
      const r = applyDataColumnSelectionToItems(sampleItems, ['name'], 'interested');
      // alwaysKeep cho interested: customerId, id
      expect(r.items[0]).toEqual({ id: 1, name: 'Alice' });
      expect(r.items[0]).not.toHaveProperty('email');
      expect(r.items[0]).not.toHaveProperty('extra');
      expect(r.dataLoadMeta.columnSelectionActive).toBe(true);
      expect(r.dataLoadMeta.selectedDataColumns).toEqual(['name']);
    });

    it('alwaysKeep theo "sheet" giữ row_number', () => {
      const items = [{ row_number: 1, name: 'A', email: 'a@x.com', extra: 'big' }];
      const r = applyDataColumnSelectionToItems(items, ['name'], 'sheet');
      expect(r.items[0]).toEqual({ row_number: 1, name: 'A' });
    });

    it('alwaysKeep theo "landing" giữ leadId và id', () => {
      const items = [{ leadId: 'L1', id: 10, name: 'A', phone: '0900', extra: 'big' }];
      const r = applyDataColumnSelectionToItems(items, ['name'], 'landing');
      expect(r.items[0]).toEqual({ leadId: 'L1', id: 10, name: 'A' });
    });

    it('kind không xác định → alwaysKeep mặc định rỗng', () => {
      const items = [{ id: 1, name: 'A', extra: 'big' }];
      const r = applyDataColumnSelectionToItems(items, ['name'], 'courses_db');
      expect(r.items[0]).toEqual({ name: 'A' });
    });

    it('savings bytes là phần tiết kiệm sau khi lọc', () => {
      const r = applyDataColumnSelectionToItems(sampleItems, ['name'], 'sheet');
      expect(r.dataLoadMeta.batchPayloadBytesIfAllColumnsUtf8).toBeGreaterThan(
        r.dataLoadMeta.batchPayloadBytesUtf8
      );
      expect(r.dataLoadMeta.batchEstimatedSavingsBytes).toBe(
        r.dataLoadMeta.batchPayloadBytesIfAllColumnsUtf8 - r.dataLoadMeta.batchPayloadBytesUtf8
      );
    });

    it('items không phải array → coi như list rỗng', () => {
      const r = applyDataColumnSelectionToItems(null, [], 'sheet');
      expect(r.items).toEqual([]);
      expect(r.dataLoadMeta.batchPayloadBytesUtf8).toBe(Buffer.byteLength('[]', 'utf8'));
    });

    it('item không phải object → giữ nguyên trong output', () => {
      const items = [{ id: 1, name: 'A' }, null, 'string-row', 123, ['array-row']];
      const r = applyDataColumnSelectionToItems(items, ['name'], 'sheet');
      expect(r.items[0]).toEqual({ name: 'A' });
      expect(r.items[1]).toBeNull();
      expect(r.items[2]).toBe('string-row');
      expect(r.items[3]).toBe(123);
      expect(r.items[4]).toEqual(['array-row']);
    });

    it('chỉ giữ key thực sự tồn tại trong row (không tạo undefined)', () => {
      const items = [{ id: 1, name: 'A' }];
      const r = applyDataColumnSelectionToItems(items, ['name', 'missing'], 'sheet');
      expect(r.items[0]).toEqual({ name: 'A' });
      expect(r.items[0]).not.toHaveProperty('missing');
    });

    it('mặc định kind = "sheet" khi không truyền', () => {
      const items = [{ row_number: 1, name: 'A', extra: 'big' }];
      const r = applyDataColumnSelectionToItems(items, ['name']);
      expect(r.dataLoadMeta.dataColumnSelectionKind).toBe('sheet');
      expect(r.items[0]).toHaveProperty('row_number');
    });

    it('savings không bao giờ âm', () => {
      // selected lớn hơn full → bytes có thể tăng, savings sẽ kẹp về 0
      const items = [{ a: 'x' }];
      const r = applyDataColumnSelectionToItems(items, ['a', 'b', 'c'], 'sheet');
      expect(r.dataLoadMeta.batchEstimatedSavingsBytes).toBeGreaterThanOrEqual(0);
    });
  });

  describe('measureJsonUtf8Bytes', () => {
    it('đo bytes UTF-8 của JSON.stringify', () => {
      const items = [{ name: 'Alice' }];
      expect(measureJsonUtf8Bytes(items)).toBe(Buffer.byteLength(JSON.stringify(items), 'utf8'));
    });

    it('null/undefined → đo bytes của "[]"', () => {
      expect(measureJsonUtf8Bytes(null)).toBe(2);
      expect(measureJsonUtf8Bytes(undefined)).toBe(2);
    });

    it('input có ký tự non-ASCII đếm UTF-8 đúng', () => {
      const items = [{ name: 'Tiếng Việt' }];
      const bytes = measureJsonUtf8Bytes(items);
      expect(bytes).toBe(Buffer.byteLength(JSON.stringify(items), 'utf8'));
      // 'Tiếng Việt' có ký tự đa byte → bytes > số ký tự
      expect(bytes).toBeGreaterThan(JSON.stringify(items).length);
    });

    it('throw khi JSON.stringify lỗi (circular) → trả 0', () => {
      const circular = {};
      circular.self = circular;
      expect(measureJsonUtf8Bytes(circular)).toBe(0);
    });
  });
});
