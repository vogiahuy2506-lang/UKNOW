import { describe, it, expect } from '@jest/globals';
import { EventEmitter } from 'node:events';
import {
  CSV_BOM,
  CSV_EOL,
  CSV_EXPORT_MAX_ROWS,
  neutralizeFormula,
  escapeCsvCell,
  buildCsvLine,
  formatCsvDateTimeVn,
  formatExportFileStamp,
  slugifyForFilename,
  streamCsv,
} from '../csvExport.util.js';

/** Bộ nhận giả đủ hình dạng `res`: ghi vào mảng, `write` có thể báo đầy bộ đệm. */
function createSink({ fullAfter = Infinity } = {}) {
  const sink = new EventEmitter();
  sink.chunks = [];
  sink.destroyed = false;
  sink.writableEnded = false;
  sink.drains = 0;
  sink.write = (chunk) => {
    sink.chunks.push(chunk);
    if (sink.chunks.length >= fullAfter) {
      setImmediate(() => { sink.drains += 1; sink.emit('drain'); });
      return false;
    }
    return true;
  };
  return sink;
}

describe('hằng số', () => {
  it('BOM UTF-8, CRLF, trần 20.000 dòng', () => {
    expect(CSV_BOM).toBe('﻿');
    expect(CSV_EOL).toBe('\r\n');
    expect(CSV_EXPORT_MAX_ROWS).toBe(20000);
  });
});

describe('escapeCsvCell — RFC 4180', () => {
  it('chữ thường giữ nguyên, null/undefined thành rỗng', () => {
    expect(escapeCsvCell('Nguyễn Văn A')).toBe('Nguyễn Văn A');
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
  });

  it('dấu phẩy, nháy kép, xuống dòng (LF / CR / CRLF) → bọc nháy kép, nháy kép nhân đôi', () => {
    expect(escapeCsvCell('a,b')).toBe('"a,b"');
    expect(escapeCsvCell('nói "xin chào"')).toBe('"nói ""xin chào"""');
    expect(escapeCsvCell('dòng 1\ndòng 2')).toBe('"dòng 1\ndòng 2"');
    expect(escapeCsvCell('dòng 1\r\ndòng 2')).toBe('"dòng 1\r\ndòng 2"');
    expect(escapeCsvCell('giữa\rdòng')).toBe('"giữa\rdòng"');
  });

  it('số và boolean thành chữ', () => {
    expect(escapeCsvCell(42)).toBe('42');
    expect(escapeCsvCell(3.5)).toBe('3.5');
    expect(escapeCsvCell(NaN)).toBe('');
    expect(escapeCsvCell(true)).toBe('true');
  });

  it('Date thành ISO', () => {
    expect(escapeCsvCell(new Date('2026-10-12T01:02:03.000Z'))).toBe('2026-10-12T01:02:03.000Z');
  });
});

describe('chống CSV / formula injection', () => {
  it.each([
    ['=HYPERLINK("http://evil","x")', `"'=HYPERLINK(""http://evil"",""x"")"`],
    ['=1+1', "'=1+1"],
    ['+84901234567', "'+84901234567"],
    ['+cmd|\' /C calc\'!A0', `'+cmd|' /C calc'!A0`],
    ['-2+3', "'-2+3"],
    ['-5', "'-5"],
    ['@SUM(A1:A9)', "'@SUM(A1:A9)"],
    ['\t=1+1', "'\t=1+1"],
  ])('chuỗi %j bắt đầu bằng ký tự công thức → chèn nháy đơn đầu ô', (input, expected) => {
    expect(escapeCsvCell(input)).toBe(expected);
  });

  it('CR đầu ô: chèn nháy đơn rồi bọc nháy kép (vì có CR)', () => {
    expect(escapeCsvCell('\r=1+1')).toBe('"\'\r=1+1"');
  });

  it('ký tự công thức ở GIỮA ô không bị đụng', () => {
    expect(escapeCsvCell('a=b')).toBe('a=b');
    expect(escapeCsvCell('x-y+z@w')).toBe('x-y+z@w');
  });

  it('số thật (kiểu number) âm vẫn là số, không thêm nháy', () => {
    expect(escapeCsvCell(-5)).toBe('-5');
    expect(escapeCsvCell(-0.5)).toBe('-0.5');
  });

  it('neutralizeFormula chỉ chèn khi cần', () => {
    expect(neutralizeFormula('=x')).toBe("'=x");
    expect(neutralizeFormula('bình thường')).toBe('bình thường');
    expect(neutralizeFormula('')).toBe('');
  });

  it('áp cho cả dòng tiêu đề (nhãn trường do chủ biểu mẫu tự gõ)', () => {
    expect(buildCsvLine(['=cmd', 'Họ tên'])).toBe("'=cmd,Họ tên\r\n");
  });
});

describe('buildCsvLine', () => {
  it('nối bằng dấu phẩy, kết thúc CRLF', () => {
    expect(buildCsvLine(['a', 'b,c', 1])).toBe('a,"b,c",1\r\n');
  });

  it('mảng rỗng / thiếu → chỉ CRLF', () => {
    expect(buildCsvLine([])).toBe('\r\n');
    expect(buildCsvLine(undefined)).toBe('\r\n');
  });
});

describe('thời gian giờ Việt Nam', () => {
  it('formatCsvDateTimeVn: dd/MM/yyyy HH:mm theo +07, kể cả khi sang ngày', () => {
    expect(formatCsvDateTimeVn('2026-10-12T17:30:00.000Z')).toBe('13/10/2026 00:30');
    expect(formatCsvDateTimeVn(new Date('2026-10-12T00:05:00.000Z'))).toBe('12/10/2026 07:05');
  });

  it('rỗng / không đọc được → rỗng', () => {
    expect(formatCsvDateTimeVn(null)).toBe('');
    expect(formatCsvDateTimeVn('không phải ngày')).toBe('');
  });

  it('formatExportFileStamp: YYYYMMDD-HHmm theo giờ VN', () => {
    expect(formatExportFileStamp(new Date('2026-10-12T17:30:00.000Z'))).toBe('20261013-0030');
    expect(formatExportFileStamp(new Date('2026-01-02T03:04:00.000Z'))).toBe('20260102-1004');
  });
});

describe('slugifyForFilename', () => {
  it('bỏ dấu tiếng Việt, đ → d, chữ thường, gạch nối', () => {
    expect(slugifyForFilename('Đăng ký Khoá học Tiếng Anh!')).toBe('dang-ky-khoa-hoc-tieng-anh');
  });

  it('chuỗi không còn ký tự hợp lệ → dùng fallback', () => {
    expect(slugifyForFilename('???')).toBe('bieu-mau');
    expect(slugifyForFilename('', { fallback: 'x' })).toBe('x');
  });

  it('cắt độ dài và không để gạch nối thừa ở đuôi', () => {
    const slug = slugifyForFilename('a'.repeat(30) + ' ' + 'b'.repeat(30), { maxLength: 31 });
    expect(slug).toBe('a'.repeat(30));
    expect(slug.length).toBeLessThanOrEqual(31);
  });

  it('không bao giờ chứa ký tự gây hại cho header (nháy, xuống dòng, dấu chấm phẩy)', () => {
    expect(slugifyForFilename('a"b\r\nc;d/e\\f')).toBe('a-b-c-d-e-f');
  });
});

describe('streamCsv', () => {
  const rowsById = (all) => async (ids) => ids.map((id) => all[id]).filter(Boolean);

  it('ghi BOM + tiêu đề trước, rồi dữ liệu theo ĐÚNG thứ tự khung id', async () => {
    const sink = createSink();
    const all = { 3: { id: 3, name: 'C' }, 1: { id: 1, name: 'A' }, 2: { id: 2, name: 'B' } };
    const result = await streamCsv(sink, {
      headerCells: ['Mã', 'Tên'],
      ids: ['3', '1', '2'],
      loadRows: rowsById(all),
      rowId: (row) => row.id,
      toCells: (row) => [row.id, row.name],
    });
    expect(result).toEqual({ rowsWritten: 3, aborted: false });
    const text = sink.chunks.join('');
    expect(text.startsWith(CSV_BOM)).toBe(true);
    expect(text).toBe(`${CSV_BOM}Mã,Tên\r\n3,C\r\n1,A\r\n2,B\r\n`);
  });

  it('đọc theo từng lô (không dồn cả bảng): batchSize 2 với 5 id → 3 lần gọi loadRows', async () => {
    const sink = createSink();
    const batches = [];
    const all = Object.fromEntries([1, 2, 3, 4, 5].map((n) => [n, { id: n }]));
    await streamCsv(sink, {
      headerCells: ['Mã'],
      ids: ['1', '2', '3', '4', '5'],
      batchSize: 2,
      loadRows: async (ids) => { batches.push([...ids]); return ids.map((id) => all[id]); },
      rowId: (row) => row.id,
      toCells: (row) => [row.id],
    });
    expect(batches).toEqual([['1', '2'], ['3', '4'], ['5']]);
  });

  it('id đã bị xoá giữa chừng (loadRows không trả) thì bỏ qua, không ném lỗi', async () => {
    const sink = createSink();
    const result = await streamCsv(sink, {
      headerCells: ['Mã'],
      ids: ['1', '2', '3'],
      loadRows: rowsById({ 1: { id: 1 }, 3: { id: 3 } }),
      rowId: (row) => row.id,
      toCells: (row) => [row.id],
    });
    expect(result.rowsWritten).toBe(2);
    expect(sink.chunks.join('')).toBe(`${CSV_BOM}Mã\r\n1\r\n3\r\n`);
  });

  it('không có dòng nào → vẫn ghi BOM + tiêu đề', async () => {
    const sink = createSink();
    const result = await streamCsv(sink, {
      headerCells: ['A', 'B'],
      ids: [],
      loadRows: async () => [],
      rowId: (row) => row.id,
      toCells: () => [],
    });
    expect(result).toEqual({ rowsWritten: 0, aborted: false });
    expect(sink.chunks.join('')).toBe(`${CSV_BOM}A,B\r\n`);
  });

  it('bộ đệm đầy → chờ drain rồi ghi tiếp, không mất dòng nào', async () => {
    const sink = createSink({ fullAfter: 1 });
    const all = Object.fromEntries([1, 2, 3].map((n) => [n, { id: n }]));
    const result = await streamCsv(sink, {
      headerCells: ['Mã'],
      ids: ['1', '2', '3'],
      batchSize: 1,
      loadRows: rowsById(all),
      rowId: (row) => row.id,
      toCells: (row) => [row.id],
    });
    expect(result.rowsWritten).toBe(3);
    expect(sink.drains).toBeGreaterThan(0);
    expect(sink.chunks.join('')).toBe(`${CSV_BOM}Mã\r\n1\r\n2\r\n3\r\n`);
  });

  it('chờ drain nhiều lần không để rò listener trên response (MaxListenersExceededWarning khi xuất 20.000 dòng)', async () => {
    const sink = createSink({ fullAfter: 1 });
    const all = Object.fromEntries(Array.from({ length: 30 }, (_, n) => [n + 1, { id: n + 1 }]));
    await streamCsv(sink, {
      headerCells: ['Mã'],
      ids: Object.keys(all),
      batchSize: 1,
      loadRows: rowsById(all),
      rowId: (row) => row.id,
      toCells: (row) => [row.id],
    });
    expect(sink.drains).toBeGreaterThanOrEqual(30);
    expect(sink.listenerCount('drain')).toBe(0);
    expect(sink.listenerCount('close')).toBe(0);
    expect(sink.listenerCount('error')).toBe(0);
  });

  it('phía nhận đóng giữa lúc chờ drain → thoát, không treo', async () => {
    const sink = new EventEmitter();
    sink.destroyed = false;
    sink.writableEnded = false;
    sink.chunks = [];
    sink.write = (chunk) => {
      sink.chunks.push(chunk);
      setImmediate(() => { sink.destroyed = true; sink.emit('close'); });
      return false; // đầy bộ đệm; khách huỷ tải trước khi kịp drain
    };
    const result = await streamCsv(sink, {
      headerCells: ['Mã'],
      ids: ['1', '2'],
      loadRows: async (ids) => ids.map((id) => ({ id })),
      rowId: (row) => row.id,
      toCells: (row) => [row.id],
    });
    expect(result.aborted).toBe(true);
    expect(sink.listenerCount('close')).toBe(0);
  });

  it('phía nhận đã đóng (khách huỷ tải) → dừng ngay, không đọc thêm DB', async () => {
    const sink = createSink();
    sink.destroyed = true;
    let loads = 0;
    const result = await streamCsv(sink, {
      headerCells: ['Mã'],
      ids: ['1', '2'],
      loadRows: async () => { loads += 1; return []; },
      rowId: (row) => row.id,
      toCells: () => [],
    });
    expect(result.aborted).toBe(true);
    expect(loads).toBe(0);
  });

  it('ô trong dữ liệu được escape + chống injection', async () => {
    const sink = createSink();
    await streamCsv(sink, {
      headerCells: ['Tên', 'Ghi chú'],
      ids: ['1'],
      loadRows: async () => [{ id: 1 }],
      rowId: (row) => row.id,
      toCells: () => ['=cmd', 'a,b\n"c"'],
    });
    expect(sink.chunks.join('')).toBe(`${CSV_BOM}Tên,Ghi chú\r\n'=cmd,"a,b\n""c"""\r\n`);
  });
});
