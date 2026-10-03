import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import JSZip from 'jszip';
import ExcelJS from 'exceljs';

const mockPdfParse = jest.fn();
jest.unstable_mockModule('pdf-parse', () => ({ default: (...args) => mockPdfParse(...args) }));

const { extractTextFromBuffer, extractTextFromDocxXml, XLSX_ROWS_PER_BLOCK } = await import('../fileExtractor.util.js');
const { chunkText } = await import('../kbChunker.util.js');

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

async function buildDocx(bodyXml) {
  const zip = new JSZip();
  zip.file('word/document.xml', `<?xml version="1.0" encoding="UTF-8"?><w:document ${W_NS}><w:body>${bodyXml}</w:body></w:document>`);
  return Buffer.from(await zip.generateAsync({ type: 'nodebuffer' }));
}

const paragraph = (text) => `<w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`;

describe('fileExtractor — DOCX giữ ranh giới đoạn (A P0-3, D-11a)', () => {
  it('mỗi </w:p> thành một xuống dòng; tệp 400 đoạn KHÔNG còn là một dòng', async () => {
    const body = Array.from({ length: 400 }, (_, i) => paragraph(`Đoạn số ${i}: bảng giá dịch vụ tháng này.`)).join('');
    const text = await extractTextFromBuffer(await buildDocx(body), 'bang-gia.docx');

    expect(text.split('\n')).toHaveLength(400);
    expect(text.startsWith('Đoạn số 0: bảng giá dịch vụ tháng này.\nĐoạn số 1:')).toBe(true);
    // Hệ quả cuối cùng: chia đoạn ra nhiều đoạn ≤ 1.500 (bản cũ: 1 đoạn).
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(10);
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(1500);
  });

  it('từ bị chia thành nhiều run (<w:r>) vẫn liền nhau, không chèn khoảng trắng giữa run', () => {
    const xml = '<w:p><w:r><w:t>Xin ch</w:t></w:r><w:r><w:t>ào quý khách</w:t></w:r></w:p>';
    expect(extractTextFromDocxXml(xml)).toBe('Xin chào quý khách');
  });

  it('<w:br/> → xuống dòng, <w:tab/> → khoảng trắng', () => {
    const xml = [
      '<w:p><w:r><w:t>Dòng 1</w:t><w:br/><w:t>Dòng 2</w:t></w:r></w:p>',
      '<w:p><w:r><w:t>Cột A</w:t><w:tab/><w:t>Cột B</w:t></w:r></w:p>',
    ].join('');
    expect(extractTextFromDocxXml(xml)).toBe('Dòng 1\nDòng 2\nCột A Cột B');
  });

  it('bảng giá: MỘT hàng bảng = MỘT dòng, các ô cách nhau " | " (ô nhiều đoạn gộp một dòng, ô cuối không dư dấu |)', () => {
    const cell = (...paras) => `<w:tc>${paras.map((p) => paragraph(p)).join('')}</w:tc>`;
    const xml = [
      paragraph('Bảng giá'),
      '<w:tbl>',
      `<w:tr>${cell('Gói')}${cell('Giá')}</w:tr>`,
      `<w:tr>${cell('Cơ bản')}${cell('199.000đ', '/tháng')}</w:tr>`,
      `<w:tr>${cell('Pro')}${cell('499.000đ')}</w:tr>`,
      '</w:tbl>',
      paragraph('Hết'),
    ].join('');
    expect(extractTextFromDocxXml(xml)).toBe('Bảng giá\nGói | Giá\nCơ bản | 199.000đ /tháng\nPro | 499.000đ\nHết');
  });

  it('giải mã thực thể XML sau khi gỡ thẻ; bỏ mã trường, chữ đã xoá và bản dự phòng mc:Fallback', () => {
    const xml = [
      '<w:p><w:r><w:t>Giá &amp; ưu đãi &lt;50%&gt; &#7879; &#x1EC7;</w:t></w:r></w:p>',
      '<w:p><w:r><w:instrText xml:space="preserve"> HYPERLINK "https://x.vn" </w:instrText></w:r><w:r><w:t>Xem thêm</w:t></w:r></w:p>',
      '<w:p><w:del><w:r><w:delText>chữ đã xoá</w:delText></w:r></w:del><w:r><w:t>chữ còn lại</w:t></w:r></w:p>',
      '<mc:AlternateContent><mc:Choice><w:p><w:r><w:t>Hộp chữ</w:t></w:r></w:p></mc:Choice><mc:Fallback><w:p><w:r><w:t>Hộp chữ</w:t></w:r></w:p></mc:Fallback></mc:AlternateContent>',
    ].join('');
    const text = extractTextFromDocxXml(xml);
    expect(text).toContain('Giá & ưu đãi <50%> ệ ệ');
    expect(text).not.toContain('HYPERLINK');
    expect(text).not.toContain('chữ đã xoá');
    expect(text).toContain('chữ còn lại');
    expect(text.match(/Hộp chữ/g)).toHaveLength(1);
  });

  it('không có dòng trống thừa liên tiếp (tối đa một dòng trống giữa hai đoạn)', () => {
    const xml = `${paragraph('A')}<w:p/>${paragraph('')}${paragraph('')}${paragraph('')}${paragraph('B')}`;
    expect(extractTextFromDocxXml(xml)).toBe('A\n\nB');
  });
});

describe('fileExtractor — XLSX nhóm hàng thành khối cách nhau dòng trống (A P2-7)', () => {
  async function buildXlsx(rowCount) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Khách hàng');
    for (let i = 1; i <= rowCount; i += 1) sheet.addRow([`Khách ${i}`, `09${String(i).padStart(8, '0')}`, 'Hà Nội']);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  it(`${XLSX_ROWS_PER_BLOCK} hàng/khối: 60 hàng → 3 khối cách nhau dòng trống, khối đầu mang tên sheet`, async () => {
    const text = await extractTextFromBuffer(await buildXlsx(60), 'khach.xlsx');
    const blocks = text.split('\n\n');
    expect(blocks).toHaveLength(3);
    expect(blocks[0].startsWith('--- Sheet: Khách hàng ---\nRow 1: Khách 1 | ')).toBe(true);
    expect(blocks[0].split('\n').filter((l) => l.startsWith('Row '))).toHaveLength(XLSX_ROWS_PER_BLOCK);
    expect(blocks[1].split('\n')).toHaveLength(XLSX_ROWS_PER_BLOCK);
    expect(blocks[2].split('\n')).toHaveLength(10);
    expect(text).toContain('Row 60: Khách 60 | 0900000060 | Hà Nội');
  });

  it('sổ 2.000 hàng → chia được thành nhiều đoạn ≤ 1.500 (bản cũ: 1 đoạn)', async () => {
    const text = await extractTextFromBuffer(await buildXlsx(2000), 'khach.xlsx');
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(40);
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(1500);
  });
});

describe('fileExtractor — PDF đưa pdf-parse view Uint8Array, không phải Node Buffer (A P2-7, D-11a)', () => {
  beforeEach(() => {
    mockPdfParse.mockReset();
    mockPdfParse.mockResolvedValue({ text: 'Nội dung PDF có chữ rõ ràng, dài hơn năm mươi ký tự để không rơi sang OCR.' });
  });

  it('pdf-parse nhận Uint8Array (không phải Buffer) mang đúng các byte của tệp, kể cả Buffer cấp từ pool (byteOffset ≠ 0)', async () => {
    // Buffer.from(chuỗi ngắn) lấy từ pool dùng chung → byteOffset ≠ 0: view phải tôn trọng offset/length.
    const buffer = Buffer.from('%PDF-1.4 tệp thử');
    await extractTextFromBuffer(buffer, 'tai-lieu.pdf');

    expect(mockPdfParse).toHaveBeenCalledTimes(1);
    const arg = mockPdfParse.mock.calls[0][0];
    expect(arg).toBeInstanceOf(Uint8Array);
    expect(Buffer.isBuffer(arg)).toBe(false);
    expect(arg.byteLength).toBe(buffer.length);
    expect(Array.from(arg)).toEqual(Array.from(buffer));
  });

  it('trả về chữ pdf-parse đọc được', async () => {
    const text = await extractTextFromBuffer(Buffer.from('%PDF-1.4'), 'a.pdf');
    expect(text).toContain('Nội dung PDF có chữ rõ ràng');
  });
});
