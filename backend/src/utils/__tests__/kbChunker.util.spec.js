import { describe, expect, it } from '@jest/globals';
import {
  CHUNK_MAX_CHARS,
  CHUNK_OVERLAP_CHARS,
  CHUNK_TARGET_CHARS,
  chunkText,
} from '../kbChunker.util.js';

const sentence = (i) => `Câu số ${i} nói về sản phẩm Trà Sen Tây Hồ, giá ${i * 1000} đồng một hộp.`;

describe('kbChunker.chunkText — trần kích thước (A P0-3: đoạn 219.902 ký tự)', () => {
  it('văn bản KHÔNG xuống dòng 200k ký tự (nhiều câu) → mọi đoạn ≤ 1.500', () => {
    const text = Array.from({ length: 3000 }, (_, i) => sentence(i)).join(' ');
    expect(text.length).toBeGreaterThan(200000);
    expect(text).not.toContain('\n');

    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(100);
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
  });

  it('chuỗi 200k ký tự không có khoảng trắng nào (cắt cứng) → mọi đoạn ≤ 1.500', () => {
    const chunks = chunkText('a'.repeat(200000));
    expect(chunks.length).toBeGreaterThan(100);
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
  });

  it('một "đoạn văn" 5.000 ký tự không có dấu chấm nhưng có khoảng trắng → cắt ở khoảng trắng, ≤ 1.500, không cắt giữa từ', () => {
    const words = Array.from({ length: 800 }, (_, i) => `tu${i}`);
    const chunks = chunkText(words.join(' '));
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
    const valid = new Set(words);
    for (const chunk of chunks) {
      for (const token of chunk.split(/\s+/)) expect(valid.has(token)).toBe(true);
    }
  });

  it('đoạn mục tiêu ~1.100: nhiều đoạn ngắn được gộp lại, không mỗi đoạn một mảnh', () => {
    const paragraphs = Array.from({ length: 300 }, (_, i) => `Đoạn ${i}: ${'lorem ipsum '.repeat(10)}`);
    const chunks = chunkText(paragraphs.join('\n\n'));
    expect(chunks.length).toBeLessThan(80);
    const sizes = chunks.slice(0, -1).map((c) => c.length);
    expect(Math.min(...sizes)).toBeGreaterThan(800);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(CHUNK_TARGET_CHARS + CHUNK_OVERLAP_CHARS + 2);
  });

  it('XLSX/DOCX chỉ có xuống dòng đơn (không dòng trống) vẫn được chia theo dòng, ≤ 1.500', () => {
    const lines = Array.from({ length: 2000 }, (_, i) => `Row ${i}: Khách ${i} | 09${String(i).padStart(8, '0')} | Hà Nội`);
    const chunks = chunkText(lines.join('\n'));
    expect(chunks.length).toBeGreaterThan(50);
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
    // Chia theo dòng: đoạn không bắt đầu giữa một dòng "Row N: …" (đoạn kế bắt đầu bằng đuôi chồng lấn rồi tới dòng nguyên).
    for (const chunk of chunks) expect(chunk).toMatch(/Row \d+/);
  });
});

describe('kbChunker.chunkText — không mất nội dung, không đoạn rỗng', () => {
  it('mọi câu của nguồn đều xuất hiện nguyên vẹn trong ít nhất một đoạn', () => {
    const sentences = Array.from({ length: 600 }, (_, i) => sentence(i));
    const chunks = chunkText(sentences.join(' '));
    const joined = chunks.join('\n');
    for (const s of sentences) expect(joined).toContain(s);
  });

  it('bỏ đoạn rỗng: văn bản chỉ có khoảng trắng/dòng trống → []', () => {
    expect(chunkText('')).toEqual([]);
    expect(chunkText('   \n\n \t  ')).toEqual([]);
    expect(chunkText(null)).toEqual([]);
    expect(chunkText(undefined)).toEqual([]);
  });

  it('không có đoạn rỗng khi giữa các đoạn có nhiều dòng trống', () => {
    const chunks = chunkText(`${'a '.repeat(900)}\n\n\n\n\n\n${'b '.repeat(900)}\n\n\n\n${'c '.repeat(900)}`);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(chunk.trim().length).toBeGreaterThan(0);
  });

  it('văn bản ngắn → đúng một đoạn, giữ nguyên chữ (đã cắt khoảng trắng hai đầu)', () => {
    expect(chunkText('  Xin chào, cửa hàng mở cửa 8h–21h.  ')).toEqual(['Xin chào, cửa hàng mở cửa 8h–21h.']);
  });

  it('CRLF được coi như xuống dòng (không còn \\r trong đoạn)', () => {
    const chunks = chunkText(`Dòng một.\r\n\r\nDòng hai.\r\nDòng ba.`);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).not.toContain('\r');
    expect(chunks[0]).toContain('Dòng một.\n\nDòng hai.\nDòng ba.');
  });
});

describe('kbChunker.chunkText — chồng lấn ~150 ký tự giữa đoạn liền kề', () => {
  it('đầu đoạn kế là đuôi (100–150 ký tự, bắt đầu ở đầu từ) của đoạn trước', () => {
    const text = Array.from({ length: 400 }, (_, i) => sentence(i)).join(' ');
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(5);
    for (let i = 1; i < chunks.length; i += 1) {
      let found = 0;
      for (let t = CHUNK_OVERLAP_CHARS; t >= 100; t -= 1) {
        if (chunks[i - 1].endsWith(chunks[i].slice(0, t))) {
          found = t;
          break;
        }
      }
      expect(found).toBeGreaterThanOrEqual(100);
      // Bắt đầu ở đầu từ: ký tự đầu của đoạn kế không nằm giữa một từ của đoạn trước.
      const tail = chunks[i].slice(0, found);
      const before = chunks[i - 1].slice(0, chunks[i - 1].length - found);
      expect(before === '' || /\s$/.test(before)).toBe(true);
      expect(tail.length).toBeLessThanOrEqual(CHUNK_OVERLAP_CHARS);
    }
  });

  it('chồng lấn không làm đoạn vượt 1.500 kể cả khi thân đoạn là một câu dài tới giới hạn', () => {
    // Câu 1.300 ký tự (không dấu chấm giữa chừng) nối tiếp nhau.
    const long = (i) => `${'chữ'.repeat(430)} số ${i}.`;
    const chunks = chunkText(Array.from({ length: 30 }, (_, i) => long(i)).join(' '));
    expect(chunks.length).toBeGreaterThan(20);
    expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
  });

  it('đoạn văn 1.403 ký tự nhiều câu (vừa lọt trần 1.500 nhưng KHÔNG đủ chỗ cho chồng lấn) → tách theo câu, mọi đoạn kết thúc ở cuối câu', () => {
    // Review G1 (03/10): bỏ phần chừa chỗ cho chồng lấn (unitMax = maxSize) thì đoạn văn này thành MỘT đơn vị, đuôi chồng lấn
    // đẩy đoạn lên ~1.555 ký tự, lưới an toàn cắt cứng GIỮA câu + để lại mẩu vụn — mọi ca khác vẫn xanh.
    const sentence = (i) => `Câu số ${String(i).padStart(3, '0')} nói về chính sách bảo hành sản phẩm và đổi trả trong ba mươi ngày.`;
    const paragraph = (p) => Array.from({ length: 18 }, (_, i) => sentence(p * 18 + i)).join(' ');
    expect(paragraph(0).length).toBeGreaterThan(CHUNK_MAX_CHARS - CHUNK_OVERLAP_CHARS);
    expect(paragraph(0).length).toBeLessThan(CHUNK_MAX_CHARS);
    const chunks = chunkText(Array.from({ length: 4 }, (_, p) => paragraph(p)).join('\n\n'));
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
      expect(chunk.trimEnd().endsWith('ngày.')).toBe(true);
    }
  });

  it('tuỳ chọn overlap = 0 → các đoạn không trùng nhau', () => {
    const text = Array.from({ length: 200 }, (_, i) => sentence(i)).join(' ');
    const chunks = chunkText(text, { overlap: 0 });
    for (let i = 1; i < chunks.length; i += 1) {
      expect(chunks[i - 1].endsWith(chunks[i].slice(0, 40))).toBe(false);
    }
  });
});

describe('kbChunker.chunkText — không cắt giữa ký tự', () => {
  // Dấu sắc kết hợp (U+0301): "x" + dấu này KHÔNG có dạng dựng sẵn nên NFC giữ nguyên hai ký tự.
  const ACUTE = String.fromCharCode(0x301);
  const COMBINING_AT_START = /^\p{M}/u;

  it('tiếng Việt có dấu dạng NFD (chữ + dấu kết hợp) → chuẩn hoá NFC, không đoạn nào mở đầu bằng dấu kết hợp', () => {
    const nfd = 'Tiếng Việt có dấu: Nguyễn Thị Hương ở Đà Nẵng. '.normalize('NFD').repeat(400);
    expect(nfd).not.toBe(nfd.normalize('NFC'));
    const chunks = chunkText(nfd);
    expect(chunks.length).toBeGreaterThan(5);
    for (const chunk of chunks) {
      expect(chunk).toBe(chunk.normalize('NFC'));
      expect(chunk).not.toMatch(COMBINING_AT_START);
    }
  });

  it('chuỗi liền không khoảng trắng gồm chữ + dấu kết hợp: không đoạn nào mở đầu bằng dấu kết hợp và ghép lại đúng nguyên văn', () => {
    // Hai tiền tố để điểm cắt lần lượt rơi vào chữ cái và vào đúng dấu kết hợp (độ chẵn lẻ của vị trí).
    // overlap = 0: phần chồng lấn sẽ che mất đoạn mở đầu bằng dấu kết hợp, nên đo riêng thân đoạn.
    for (const prefix of ['', 'a']) {
      const text = `${prefix}${`x${ACUTE}`.repeat(5000)}`;
      const chunks = chunkText(text, { overlap: 0 });
      expect(chunks.length).toBeGreaterThan(5);
      expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
      for (const chunk of chunks) expect(chunk).not.toMatch(COMBINING_AT_START);
      expect(chunks.join('')).toBe(text);

      const withOverlap = chunkText(text);
      for (const chunk of withOverlap) expect(chunk).not.toMatch(COMBINING_AT_START);
    }
  });

  it('emoji (cặp surrogate) trong chuỗi liền không khoảng trắng → không đoạn nào chứa surrogate lẻ, ghép lại đúng nguyên văn', () => {
    for (const prefix of ['', 'a']) {
      const text = `${prefix}${'😀'.repeat(6000)}`;
      const chunks = chunkText(text, { overlap: 0 });
      expect(chunks.length).toBeGreaterThan(5);
      expect(Math.max(...chunks.map((c) => c.length))).toBeLessThanOrEqual(CHUNK_MAX_CHARS);
      for (const chunk of chunks) expect(chunk.isWellFormed()).toBe(true);
      expect(chunks.join('')).toBe(text);

      for (const chunk of chunkText(text)) expect(chunk.isWellFormed()).toBe(true);
    }
  });
});
