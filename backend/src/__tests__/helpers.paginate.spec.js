import { describe, it, expect } from '@jest/globals';
import { paginate } from '../helpers.js';

/**
 * `paginate` nhận cả hai dạng gọi:
 *  - vị trí  `paginate(page, limit, total)`  — products / courses
 *  - object  `paginate({ page, limit, total })` + `.offset` — marketplace
 * Spec này khoá cả hai để lần sau đổi không âm thầm phá một bên.
 */
describe('helpers.paginate', () => {
  describe('dạng gọi theo vị trí', () => {
    it('tính đúng totalPages', () => {
      expect(paginate(2, 20, 45)).toEqual({
        page: 2,
        limit: 20,
        total: 45,
        totalPages: 3,
        offset: 20,
      });
    });

    it('nhận chuỗi số như query string', () => {
      const r = paginate('3', '10', '100');
      expect(r.page).toBe(3);
      expect(r.limit).toBe(10);
      expect(r.offset).toBe(20);
    });
  });

  describe('dạng gọi object', () => {
    it('trả offset để đưa thẳng vào truy vấn', () => {
      expect(paginate({ page: 3, limit: 10, total: 95 })).toEqual({
        page: 3,
        limit: 10,
        total: 95,
        totalPages: 10,
        offset: 20,
      });
    });

    it('thiếu total vẫn tính được offset — marketplace gọi kiểu này để lấy offset', () => {
      const r = paginate({ page: 2, limit: 25 });
      expect(r.offset).toBe(25);
      expect(r.total).toBe(0);
    });
  });

  describe('đầu vào hỏng', () => {
    it('page/limit không hợp lệ rơi về mặc định, không ra NaN', () => {
      const r = paginate({ page: 'abc', limit: null, total: 'xyz' });
      expect(r.page).toBe(1);
      expect(r.limit).toBe(20);
      expect(r.total).toBe(0);
      expect(r.totalPages).toBe(0);
      expect(r.offset).toBe(0);
    });

    it('page âm hoặc 0 bị kẹp về 1 — offset không được âm', () => {
      expect(paginate({ page: 0, limit: 10, total: 5 }).offset).toBe(0);
      expect(paginate({ page: -5, limit: 10, total: 5 }).offset).toBe(0);
    });

    it('total = 0 thì totalPages = 0, không phải 1', () => {
      expect(paginate({ page: 1, limit: 20, total: 0 }).totalPages).toBe(0);
    });
  });
});
