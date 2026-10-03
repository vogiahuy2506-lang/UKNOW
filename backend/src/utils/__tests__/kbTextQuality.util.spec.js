import { describe, expect, it } from '@jest/globals';
import { PDF_PARSER_FIX_AT, detectRawPdfGarbage } from '../kbTextQuality.util.js';

/** Bộ đọc PDF thô TRƯỚC commit 0399b781 — chép nguyên thuật toán (git show 0399b781^:backend/src/utils/fileExtractor.util.js). */
function oldRawPdfReader(buffer) {
  const text = buffer.toString('latin1');
  const lines = text.split('\n');
  const content = [];
  for (const line of lines) {
    if (line.includes('BT') || line.includes('ET')) continue;
    const cleaned = line.replace(/[^\x20-\x7E\n]/g, ' ').trim();
    if (cleaned.length > 5) content.push(cleaned);
  }
  return content.join('\n');
}

/** Byte giả ngẫu nhiên có hạt giống (kết quả lặp lại được, không phụ thuộc crypto). */
function seededBytes(length, seed = 12345) {
  const bytes = Buffer.alloc(length);
  let state = seed;
  for (let i = 0; i < length; i += 1) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    bytes[i] = (state >> 16) & 0xff;
  }
  return bytes;
}

function fakePdf({ streams = 20, streamBytes = 6000 } = {}) {
  const parts = [Buffer.from('%PDF-1.7\n')];
  for (let i = 1; i <= streams; i += 1) {
    parts.push(Buffer.from(`${i} 0 obj\n<< /Type /Page /Filter /FlateDecode /Length ${streamBytes} >>\nstream\n`));
    parts.push(seededBytes(streamBytes, i));
    parts.push(Buffer.from('\nendstream\nendobj\n'));
  }
  parts.push(Buffer.from('xref\n0 21\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'));
  return Buffer.concat(parts);
}

const VIETNAMESE = 'Công ty chúng tôi chuyên cung cấp giải pháp tự động hoá marketing cho doanh nghiệp vừa và nhỏ tại Việt Nam. '
  + 'Khách hàng có thể đăng ký dùng thử miễn phí trong 14 ngày, không cần thẻ tín dụng, và được hỗ trợ qua Zalo mỗi ngày. '.repeat(40);
const ENGLISH = 'Our platform helps small businesses automate email and messaging campaigns, with segmentation and reporting. '.repeat(40);

describe('detectRawPdfGarbage — nhận ra rác của bộ đọc PDF thô cũ (A P0-3, G1.7)', () => {
  it('mốc bộ đọc cũ là commit 0399b781 lúc 24/08/2026 11:47:08 +07', () => {
    expect(PDF_PARSER_FIX_AT).toBe('2026-08-24T11:47:08+07:00');
  });

  it('đầu ra thật của bộ đọc cũ trên PDF nén → garbage vì cấu trúc PDF còn nguyên dạng chữ (pdf_markers), KHÔNG cần mốc ngày', () => {
    const stored = oldRawPdfReader(fakePdf());
    expect(stored.length).toBeGreaterThan(20000);

    const result = detectRawPdfGarbage(stored);
    expect(result.garbage).toBe(true);
    expect(result.reason).toBe('pdf_markers');
    expect(result.metrics.markers).toBeGreaterThanOrEqual(3);
  });

  it('chính đầu ra đó KHÔNG có ký tự điều khiển (bộ đọc cũ đã thay hết bằng khoảng trắng) — tỉ lệ ký tự không in được không phải dấu hiệu chính', () => {
    const stored = oldRawPdfReader(fakePdf());
    expect(detectRawPdfGarbage(stored).metrics.controlRatio).toBe(0);
  });

  it('chỉ phần luồng nén (không còn chữ cấu trúc): nạp TRƯỚC bản vá → bắt bằng tỉ lệ ký hiệu; nạp SAU bản vá → không bắt (tránh nhầm PDF hợp lệ nhiều ký hiệu)', () => {
    const streamOnly = oldRawPdfReader(Buffer.concat([seededBytes(60000, 7), Buffer.from('\n')]));
    expect(streamOnly.length).toBeGreaterThan(1000);

    const before = detectRawPdfGarbage(streamOnly, { beforeParserFix: true });
    expect(before.garbage).toBe(true);
    expect(before.reason).toBe('symbol_ratio');
    expect(before.metrics.symbolRatio).toBeGreaterThan(0.25);

    expect(detectRawPdfGarbage(streamOnly, { beforeParserFix: false }).garbage).toBe(false);
  });

  it('văn bản tiếng Việt / tiếng Anh bình thường → không phải rác (kể cả khi tài liệu nạp trước bản vá)', () => {
    for (const text of [VIETNAMESE, ENGLISH]) {
      for (const beforeParserFix of [true, false]) {
        const result = detectRawPdfGarbage(text, { beforeParserFix });
        expect(result.garbage).toBe(false);
        expect(result.metrics.symbolRatio).toBeLessThan(0.15);
      }
    }
  });

  it('một hai từ khoá cấu trúc PDF trong văn bản thường (bài viết nói về PDF) → chưa đủ 3 lần, không bị nhầm', () => {
    const text = `${VIETNAMESE}\nTrong tệp PDF có bảng xref và các đối tượng endobj, nhưng đây chỉ là bài giải thích.`;
    expect(detectRawPdfGarbage(text).garbage).toBe(false);
  });

  it('nhiều ký tự điều khiển / ký tự thay thế U+FFFD (nhị phân đọc sai mã hoá) → control_chars', () => {
    const bad = `${'Xin chào '.repeat(30)}${String.fromCharCode(0xfffd, 0x01, 0x02).repeat(80)}`;
    const result = detectRawPdfGarbage(bad);
    expect(result.garbage).toBe(true);
    expect(result.reason).toBe('control_chars');
  });

  it('rỗng / chỉ khoảng trắng / null → không phải rác', () => {
    for (const text of ['', '   \n\n ', null, undefined]) {
      expect(detectRawPdfGarbage(text, { beforeParserFix: true }).garbage).toBe(false);
    }
  });
});
