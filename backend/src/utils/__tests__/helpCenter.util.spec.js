import { describe, it, expect } from '@jest/globals';
import {
  chunkHelpMarkdown,
  buildCapabilityMap,
  parseRouteLabel,
  HELP_CHUNK_SIZE,
} from '../helpCenter.util.js';

describe('helpCenter.util', () => {
  describe('chunkHelpMarkdown', () => {
    it('bài ngắn (< 500) → đúng 1 chunk', () => {
      const body = '# Tiêu đề\n\nVài câu ngắn về Zalo.';
      expect(body.length).toBeLessThan(HELP_CHUNK_SIZE);
      const chunks = chunkHelpMarkdown(body);
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toBe(body.trim());
    });

    it('bài dài → nhiều chunk, mỗi chunk ≤ 500', () => {
      const para = 'A'.repeat(200);
      const body = Array.from({ length: 6 }, () => para).join('\n\n');
      const chunks = chunkHelpMarkdown(body);
      expect(chunks.length).toBeGreaterThan(1);
      for (const c of chunks) {
        expect(c.length).toBeLessThanOrEqual(HELP_CHUNK_SIZE);
      }
    });
  });

  describe('buildCapabilityMap', () => {
    it('gom mọi bài published, bỏ nháp', () => {
      const text = buildCapabilityMap([
        { feature_key: 'channels', title: 'Kênh', summary: 'Kết nối email/zalo', is_published: true },
        { feature_key: 'channels', title: 'Draft', summary: 'Ẩn', is_published: false },
        { feature_key: 'campaigns', title: 'Chiến dịch', summary: 'Tạo chiến dịch', isPublished: true },
      ]);
      expect(text).toContain('Kênh');
      expect(text).toContain('Chiến dịch');
      expect(text).not.toContain('Draft');
      expect(text).toContain('## channels');
    });
  });

  describe('parseRouteLabel', () => {
    it('map các nhánh vàng', () => {
      expect(parseRouteLabel('hỏi_đáp')).toBe('hỏi_đáp');
      expect(parseRouteLabel('làm_giúp')).toBe('làm_giúp');
      expect(parseRouteLabel('không_rõ')).toBe('không_rõ');
      expect(parseRouteLabel('ngoài_phạm_vi')).toBe('ngoài_phạm_vi');
      expect(parseRouteLabel('xyz')).toBe('không_rõ');
    });

    it('chọn nhãn xuất hiện sớm nhất khi model giải thích kèm phủ định', () => {
      expect(parseRouteLabel('hỏi_đáp (không phải làm giúp)')).toBe('hỏi_đáp');
      expect(parseRouteLabel('')).toBe('không_rõ');
    });
  });
});
