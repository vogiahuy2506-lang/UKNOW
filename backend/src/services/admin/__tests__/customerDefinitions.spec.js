import { describe, expect, it, jest } from '@jest/globals';
import {
  CUSTOMER_SEGMENTS,
  customerSegmentSql,
  customerSql,
  expiredWithinSql,
  expiringSql,
  internalUserIdsSql,
  payingSql,
  planStateFilterSql,
  segmentFilterSql,
  trialSql,
} from '../customerDefinitions.js';
import {
  isValidYmd,
  orderKindSql,
  orderNeedsActionSql,
  orderPeriodAtSql,
  paidOrderSql,
  vnDayRangeSql,
} from '../revenueDefinitions.js';

// Phép đếm thật chạy SQL ở tests/integration (adminStats / adminMembersCustomers / adminOrders / adminFunnel). File này
// chỉ ghim những gì không cần DB: hình dạng mảnh SQL, danh sách nội bộ từ env, danh sách trắng đầu vào.
const flat = (sql) => sql.replace(/\s+/g, ' ');

describe('customerDefinitions — danh sách nội bộ', () => {
  it('mặc định 39, 116 (constants/internalAccounts.js, không khai lại ở đây)', () => {
    expect(internalUserIdsSql({})).toBe('ARRAY[39, 116]::bigint[]');
  });

  it('env INTERNAL_USER_IDS ghi đè; phần tử sai bị bỏ, không lọt vào SQL', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(internalUserIdsSql({ INTERNAL_USER_IDS: '5, 7' })).toBe('ARRAY[5, 7]::bigint[]');
    expect(internalUserIdsSql({ INTERNAL_USER_IDS: '5, 1; DROP TABLE users' })).toBe('ARRAY[5]::bigint[]');
    warn.mockRestore();
  });

  it('nhóm "internal" đọc danh sách LÚC GỌI', () => {
    expect(customerSegmentSql('u', { INTERNAL_USER_IDS: '9' })).toContain('ARRAY[9]::bigint[]');
    expect(customerSegmentSql('u', { INTERNAL_USER_IDS: '11' })).toContain('ARRAY[11]::bigint[]');
  });
});

describe('customerDefinitions — phân nhóm', () => {
  it('đúng 5 nhóm, mỗi nhóm một nhánh CASE theo thứ tự admin → deleted → internal → employee → customer', () => {
    expect(CUSTOMER_SEGMENTS).toEqual(['customer', 'employee', 'internal', 'deleted', 'admin']);
    const sql = flat(customerSegmentSql('u', {}));
    const order = ["THEN 'admin'", "THEN 'deleted'", "THEN 'internal'", "THEN 'employee'", "ELSE 'customer'"];
    const positions = order.map((needle) => sql.indexOf(needle));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('nhân viên thuần = có dòng user_members VÀ không có gói trả tiền riêng', () => {
    const sql = flat(customerSegmentSql('u', {}));
    expect(sql).toContain('FROM user_members um WHERE um.employee_id = u.id');
    expect(sql).toContain(`AND NOT ${flat(payingSql('u'))} THEN 'employee'`);
  });

  it('customerSql = nhóm customer', () => {
    expect(flat(customerSql('u', {}))).toMatch(/= 'customer'$/);
  });

  it('segmentFilterSql: mặc định khách; nhóm lạ / không phải chuỗi cũng về khách; all = mọi nhóm trừ admin', () => {
    for (const bad of [undefined, '', 'banana', ['customer'], { $ne: 1 }, "customer' OR '1'='1"]) {
      expect(flat(segmentFilterSql(bad, 'u', {}))).toMatch(/= 'customer'$/);
    }
    expect(flat(segmentFilterSql('internal', 'u', {}))).toMatch(/= 'internal'$/);
    expect(segmentFilterSql('all', 'u', {})).toBe("u.role <> 'admin'");
  });

  it('alias không hợp lệ bị từ chối (không nội suy chuỗi lạ vào SQL)', () => {
    expect(() => payingSql('u; DROP TABLE users')).toThrow(/alias/);
    expect(() => customerSegmentSql('1x')).toThrow(/alias/);
  });
});

describe('customerDefinitions — gói', () => {
  it('trả tiền = còn hạn + giá gói > 0 + đơn gói gần nhất (không phải mua thêm) có amount > 0', () => {
    const sql = flat(payingSql('u'));
    expect(sql).toContain('pp.price > 0');
    expect(sql).toContain('lo.amount > 0');
    expect(sql).toContain("lo.status = 'success'");
    expect(sql).toContain('lo.topup_config IS NULL');
    expect(sql).toContain('ORDER BY COALESCE(lo.paid_at, lo.created_at) DESC');
    expect(sql).toContain('subscription_expires_at > NOW()');
  });

  it('dùng thử = còn hạn và KHÔNG phải trả tiền', () => {
    expect(flat(trialSql('u'))).toContain(`NOT ${flat(payingSql('u'))}`);
  });

  it('planStateFilterSql chỉ nhận 4 giá trị; giá trị lạ = không lọc', () => {
    expect(planStateFilterSql('paying', 'u')).toBe(payingSql('u'));
    expect(planStateFilterSql('trial', 'u')).toBe(trialSql('u'));
    expect(planStateFilterSql('expiring', 'u')).toBe(expiringSql('u', 7));
    expect(planStateFilterSql('expired30', 'u')).toBe(expiredWithinSql('u', 30));
    for (const bad of [undefined, '', 'banana', "paying' OR 1=1"]) {
      expect(planStateFilterSql(bad, 'u')).toBeNull();
    }
  });

  it('số ngày của expiring / expired luôn là số nguyên dương', () => {
    expect(expiringSql('u', "7'; --")).toContain("INTERVAL '7 days'");
    expect(expiredWithinSql('u', -5)).toContain("INTERVAL '30 days'");
    expect(expiringSql('u', 14)).toContain("INTERVAL '14 days'");
  });
});

describe('revenueDefinitions', () => {
  it('đơn đã trả = success VÀ amount > 0 (loại đơn 0đ)', () => {
    expect(paidOrderSql('o')).toBe("(o.status = 'success' AND o.amount > 0)");
  });

  it('mốc kỳ = paid_at, rơi về created_at', () => {
    expect(orderPeriodAtSql('o')).toBe('COALESCE(o.paid_at, o.created_at)');
  });

  it('nguồn đơn: thu tay trước, rồi mua thêm, còn lại là gói', () => {
    const sql = flat(orderKindSql('o'));
    expect(sql.indexOf("'manual'")).toBeLessThan(sql.indexOf("'topup'"));
    expect(sql.indexOf("'topup'")).toBeLessThan(sql.indexOf("'plan'"));
  });

  it('"Cần xử lý" gồm failed, tiền vào chưa ghi doanh thu, pending quá hạn', () => {
    const sql = flat(orderNeedsActionSql('o'));
    expect(sql).toContain("o.status = 'failed'");
    expect(sql).toContain("PAID_AFTER_CANCELLED_HANDLED");
    expect(sql).toContain("o.status = 'pending'");
  });

  it('isValidYmd chặn ngày không tồn tại và chuỗi lạ', () => {
    expect(isValidYmd('2026-09-30')).toBe(true);
    expect(isValidYmd('2026-02-29')).toBe(false);
    expect(isValidYmd('2026-02-30')).toBe(false);
    expect(isValidYmd('2026-9-3')).toBe(false);
    expect(isValidYmd("2026-09-30'; --")).toBe(false);
    expect(isValidYmd(undefined)).toBe(false);
  });

  it('khoảng ngày VN: "đến ngày" gồm TRỌN ngày cuối (< đến_ngày + 1)', () => {
    const [from, to] = vnDayRangeSql('o.created_at', { fromRef: '$1', toRef: '$2' });
    expect(from).toBe("(o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') >= $1::date");
    expect(to).toBe("(o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh') < ($2::date + 1)");
    expect(vnDayRangeSql('o.created_at')).toEqual([]);
  });
});
