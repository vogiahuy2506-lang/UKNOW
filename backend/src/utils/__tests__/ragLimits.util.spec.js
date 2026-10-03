import { describe, expect, it } from '@jest/globals';
import {
  MAX_RAG_CHUNK_CHARS,
  MAX_RAG_TOTAL_CHARS,
  capChunkRows,
  capChunkTexts,
  truncateForPrompt,
} from '../ragLimits.util.js';

describe('ragLimits.truncateForPrompt', () => {
  it('văn bản ngắn hơn trần → giữ nguyên', () => {
    expect(truncateForPrompt('Xin chào', 1500)).toBe('Xin chào');
    expect(truncateForPrompt('', 1500)).toBe('');
    expect(truncateForPrompt(null, 1500)).toBe('');
  });

  it('đoạn 200k ký tự → đúng trần, kèm dấu … ở cuối', () => {
    const out = truncateForPrompt('a'.repeat(200000), 1500);
    expect(out.length).toBeLessThanOrEqual(1500);
    expect(out.endsWith('…')).toBe(true);
  });

  it('ưu tiên cắt ở khoảng trắng gần cuối, không cắt giữa từ', () => {
    const words = Array.from({ length: 2000 }, (_, i) => `tu${i}`).join(' ');
    const out = truncateForPrompt(words, 1500);
    expect(out.length).toBeLessThanOrEqual(1500);
    const lastWord = out.slice(0, -1).split(' ').pop();
    expect(lastWord).toMatch(/^tu\d+$/);
    expect(words.startsWith(out.slice(0, -1))).toBe(true);
  });

  it('không cắt giữa cặp surrogate (emoji)', () => {
    for (const prefix of ['', 'a']) {
      const out = truncateForPrompt(`${prefix}${'😀'.repeat(5000)}`, 1500);
      expect(out.length).toBeLessThanOrEqual(1500);
      expect(out.isWellFormed()).toBe(true);
    }
  });
});

describe('ragLimits.capChunkTexts — trần prompt (A P0-3)', () => {
  it('một đoạn 219.902 ký tự (đúng số đo production) → ≤ 1.500', () => {
    const out = capChunkTexts(['x'.repeat(219902)]);
    expect(out).toHaveLength(1);
    expect(out[0].length).toBeLessThanOrEqual(MAX_RAG_CHUNK_CHARS);
  });

  it('5 đoạn cùng 3.000 ký tự → mỗi đoạn ≤ 1.500 và TỔNG ≤ 6.000, giữ thứ tự độ liên quan', () => {
    const texts = ['A', 'B', 'C', 'D', 'E'].map((c) => `${c} `.repeat(1500));
    const out = capChunkTexts(texts);
    const total = out.reduce((sum, t) => sum + t.length, 0);
    expect(total).toBeLessThanOrEqual(MAX_RAG_TOTAL_CHARS);
    for (const t of out) expect(t.length).toBeLessThanOrEqual(MAX_RAG_CHUNK_CHARS);
    expect(out.map((t) => t[0])).toEqual(['A', 'B', 'C', 'D']);
  });

  it('đoạn nhỏ (dưới trần) giữ nguyên toàn bộ — không động vào dữ liệu đã chia đúng cỡ', () => {
    const texts = Array.from({ length: 5 }, (_, i) => `Đoạn ${i}: ${'nội dung '.repeat(100)}`.trim());
    expect(capChunkTexts(texts)).toEqual(texts);
  });

  it('hết ngân sách → bỏ các đoạn xếp sau thay vì cắt thành mẩu vài chục ký tự', () => {
    const out = capChunkTexts(['a'.repeat(1400), 'b'.repeat(1400), 'c'.repeat(1400), 'd'.repeat(1400), 'e'.repeat(1400)]);
    // 4 × 1.400 = 5.600; còn 400 → đoạn thứ 5 được cắt còn ≤ 400 (≥ 200 nên vẫn hữu ích) hoặc bỏ; tổng không vượt 6.000.
    expect(out.reduce((sum, t) => sum + t.length, 0)).toBeLessThanOrEqual(MAX_RAG_TOTAL_CHARS);
    const last = out[out.length - 1];
    expect(last.length === 1400 || last.length >= 200).toBe(true);
  });

  it('đầu vào rỗng / không phải mảng → []', () => {
    expect(capChunkTexts([])).toEqual([]);
    expect(capChunkTexts(undefined)).toEqual([]);
  });
});

describe('ragLimits.capChunkRows', () => {
  it('cắt chunk_text nhưng giữ nguyên các trường khác (similarity, metadata…)', () => {
    const rows = [
      { chunk_text: 'z'.repeat(50000), similarity: 0.9, metadata: { source: 'a.pdf' } },
      { chunk_text: 'ngắn', similarity: 0.8, metadata: { source: 'b.docx' } },
    ];
    const out = capChunkRows(rows);
    expect(out).toHaveLength(2);
    expect(out[0].chunk_text.length).toBeLessThanOrEqual(MAX_RAG_CHUNK_CHARS);
    expect(out[0]).toMatchObject({ similarity: 0.9, metadata: { source: 'a.pdf' } });
    expect(out[1]).toEqual(rows[1]);
    // Không đổi hàng gốc.
    expect(rows[0].chunk_text.length).toBe(50000);
  });
});
