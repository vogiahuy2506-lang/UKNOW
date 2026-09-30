import { describe, expect, it } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EMAIL_SENT_STATUSES, EMAIL_SENT_STATUS_SQL_LIST } from '../emailMessageStatus.js';

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-1 — hằng "email đã gửi" dùng cho MỌI phép đếm hạn mức.
 *
 * Ghim TỪNG phần tử bằng danh sách viết tay ở đây (KHÔNG suy ra từ chính hằng): bỏ một giá trị bất kỳ,
 * hoặc thêm 'pending' / 'queued' / 'failed', đều phải đỏ. Bỏ 'opened' / 'clicked' / 'unsubscribed' là
 * đúng lỗi đã đếm thiếu ~22% hạn mức email tháng 9/2026 (thư khách đã mở đổi status nên rơi khỏi phép đếm).
 */
const CAC_TRANG_THAI_DA_GUI = ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'spam', 'unsubscribed'];
const CAC_TRANG_THAI_KHONG_PHAI_DA_GUI = ['pending', 'queued', 'failed'];

describe('EMAIL_SENT_STATUSES — thư máy chủ SMTP đã nhận', () => {
  it('đúng 7 trạng thái, đúng thứ tự khai báo', () => {
    expect(EMAIL_SENT_STATUSES).toEqual(CAC_TRANG_THAI_DA_GUI);
    expect(EMAIL_SENT_STATUSES).toHaveLength(7);
  });

  it.each(CAC_TRANG_THAI_DA_GUI)("có '%s' (thư đã gửi vẫn phải được đếm)", (status) => {
    expect(EMAIL_SENT_STATUSES).toContain(status);
  });

  it.each(CAC_TRANG_THAI_KHONG_PHAI_DA_GUI)(
    "KHÔNG có '%s' (chưa gửi / gửi lỗi — sent_at đã được ghi lúc thử gửi nên không được đếm)",
    (status) => {
      expect(EMAIL_SENT_STATUSES).not.toContain(status);
    }
  );

  it('không có phần tử trùng', () => {
    expect(new Set(EMAIL_SENT_STATUSES).size).toBe(EMAIL_SENT_STATUSES.length);
  });

  it('mảng bị đóng băng — không ai push/pop thêm trạng thái lúc chạy', () => {
    expect(Object.isFrozen(EMAIL_SENT_STATUSES)).toBe(true);
  });

  it('mọi phần tử chỉ gồm chữ thường/gạch dưới — an toàn để nhúng thẳng vào chuỗi SQL', () => {
    for (const status of EMAIL_SENT_STATUSES) {
      expect(status).toMatch(/^[a-z_]+$/);
    }
  });
});

describe('EMAIL_SENT_STATUS_SQL_LIST — chuỗi literal dựng sẵn cho SQL', () => {
  it("đúng chuỗi, đã kèm ngoặc: `('sent', 'delivered', …, 'unsubscribed')`", () => {
    expect(EMAIL_SENT_STATUS_SQL_LIST).toBe(
      "('sent', 'delivered', 'opened', 'clicked', 'bounced', 'spam', 'unsubscribed')"
    );
  });

  it('dựng ĐÚNG từ mảng (không có bản chép tay thứ hai có thể lệch)', () => {
    const tuSql = [...EMAIL_SENT_STATUS_SQL_LIST.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
    expect(tuSql).toEqual([...EMAIL_SENT_STATUSES]);
  });

  it.each(CAC_TRANG_THAI_KHONG_PHAI_DA_GUI)("chuỗi SQL không chứa '%s'", (status) => {
    expect(EMAIL_SENT_STATUS_SQL_LIST).not.toContain(`'${status}'`);
  });
});

/**
 * Rào tĩnh (khuôn `modelNameNotPinned.spec.js`): không một truy vấn nào trong `src` được viết lại bộ 3
 * `status IN ('sent', 'delivered', 'bounced')`. Ai chép mẫu cũ cho một chỗ đếm mới sẽ đỏ ở đây, thay
 * vì để hạn mức lại đếm thiếu thư đã mở.
 */
const THU_MUC_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const liet_ke_file = (thuMuc, ra = []) => {
  for (const muc of fs.readdirSync(thuMuc, { withFileTypes: true })) {
    const duong = path.join(thuMuc, muc.name);
    if (muc.isDirectory()) {
      if (muc.name !== '__tests__') liet_ke_file(duong, ra);
    } else if (muc.name.endsWith('.js')) {
      ra.push(duong);
    }
  }
  return ra;
};

const BO_BA_CU = /\bstatus\s+IN\s*\(\s*'sent'\s*,\s*'delivered'\s*,\s*'bounced'\s*\)/g;

describe('không còn bộ ba cũ sent/delivered/bounced trong mã nguồn', () => {
  it("không file nào viết `status IN ('sent', 'delivered', 'bounced')`", () => {
    const dinh = [];
    for (const duong of liet_ke_file(THU_MUC_SRC)) {
      const noiDung = fs.readFileSync(duong, 'utf8');
      for (const khop of noiDung.matchAll(BO_BA_CU)) {
        const dong = noiDung.slice(0, khop.index).split('\n').length;
        dinh.push(`${path.relative(THU_MUC_SRC, duong).split(path.sep).join('/')}:${dong}`);
      }
    }
    expect(dinh).toEqual([]);
  });

  it('phép quét thật sự bắt được cả hai dạng cũ (tự kiểm trên mẩu mã giả)', () => {
    expect("AND em.status IN ('sent', 'delivered', 'bounced')".match(BO_BA_CU)).toHaveLength(1);
    expect("AND status IN ('sent','delivered','bounced')".match(BO_BA_CU)).toHaveLength(1);
    expect(`AND em.status IN ${EMAIL_SENT_STATUS_SQL_LIST}`.match(BO_BA_CU)).toBeNull();
  });

  it('phép quét đọc được mã nguồn thật (quét ra hơn 200 file .js)', () => {
    expect(liet_ke_file(THU_MUC_SRC).length).toBeGreaterThan(200);
  });
});
