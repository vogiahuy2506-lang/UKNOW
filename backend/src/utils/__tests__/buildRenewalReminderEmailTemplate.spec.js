import { jest } from '@jest/globals';

/**
 * Ghim nhánh `if (template)` của buildRenewalReminderEmail — thư nhắc 7 ngày và 3 ngày.
 *
 * PR-2b cho super admin sửa nội dung mẫu `plan_expiring`. Nhưng đường từ "mẫu trong DB" ra
 * "thư khách nhận" có ba mắt xích, và lúc review 13/09/2026 chỉ hai mắt đầu có test:
 *
 *   1. lưu/đọc mẫu trong DB        — có (systemEmailTemplate.repository.spec.js)
 *   2. API + xem trước             — có (adminSystemEmailTemplates.test.js), nhưng builder bị MOCK
 *   3. builder thật sự dùng mẫu    — KHÔNG có ca nào
 *
 * Nghĩa là sếp sửa mẫu xong, thư vẫn có thể ra chữ cứng cũ mà toàn bộ test vẫn xanh. File này
 * bịt mắt xích 3.
 *
 * Còn mắt xích 4 (lời gọi trong scheduler.js truyền `template:` xuống) VẪN chưa bịt được —
 * xem ghi chú cuối file.
 */

const { buildRenewalReminderEmail } = await import('../systemEmail.util.js');

const MAU = {
  subject: 'Gói {{plan_name}} còn {{days_left}} ngày',
  bodyHtml: '<p>Chào {{user_name}}, hết hạn {{expires_at}}. <a href="{{upgrade_url}}">Gia hạn</a></p>',
};

const DU_LIEU = {
  fullName: 'Khách Thử',
  planName: 'Gói Pro',
  expiresAt: '2026-09-20T00:00:00.000Z',
  daysLeft: 3,
  renewalUrl: 'https://founderai.biz/app/billing',
};

describe('buildRenewalReminderEmail — mẫu do super admin sửa', () => {
  it('có mẫu: dùng chữ của mẫu và thay đủ biến, KHÔNG rơi về bản cứng', () => {
    const { subject, html } = buildRenewalReminderEmail({ ...DU_LIEU, template: MAU });

    expect(subject).toBe('Gói Gói Pro còn 3 ngày');
    expect(html).toContain('Chào Khách Thử');
    expect(html).toContain('href="https://founderai.biz/app/billing"');
    // Dấu nhận biết của bản CỨNG: huy hiệu đếm ngược. Có mẫu thì không được xuất hiện.
    expect(html).not.toContain('Còn lại');
    // Không được rò biến chưa thay ra thư khách.
    expect(html).not.toMatch(/\{\{\s*\w+\s*\}\}/);
    expect(subject).not.toMatch(/\{\{\s*\w+\s*\}\}/);
  });

  it('KHÔNG có mẫu: giữ nguyên bản cứng như trước PR-2b (không đổi hành vi)', () => {
    const { html } = buildRenewalReminderEmail({ ...DU_LIEU, template: null });

    expect(html).toContain('Còn lại');
    expect(html).toContain('sẽ hết hạn vào ngày');
  });

  it('mẫu có biến lạ: không nổ, và không rò chuỗi thô ra thư', () => {
    const { subject, html } = buildRenewalReminderEmail({
      ...DU_LIEU,
      template: {
        subject: 'Xin chào {{khong_ton_tai}}',
        bodyHtml: '<p>{{cung_khong_ton_tai}} và {{user_name}}</p>',
      },
    });

    expect(html).toContain('Khách Thử');
    expect(subject).not.toMatch(/\{\{\s*\w+\s*\}\}/);
    expect(html).not.toMatch(/\{\{\s*\w+\s*\}\}/);
  });
});

/**
 * MẮT XÍCH 4 CHƯA BỊT — đọc trước khi sửa scheduler.js.
 *
 * Hai lời gọi buildRenewalReminderEmail thật nằm trong thân cron ở scheduler.js (nhắc 7 ngày và
 * nhắc 3 ngày). Đột biến 13/09/2026: xoá `template: planExpiringTemplate` khỏi lời gọi nhắc
 * 7 ngày → **2710/2710 test VẪN XANH**. Không có gì canh phần nối đó.
 *
 * Nguyên nhân là hình dạng code, không phải người viết test lười: thân cron không import được
 * trong test (import scheduler.js là khởi động cron thật). PR-2a đã giải đúng bài này cho thư
 * T-0 — tách ra services/payment/subscriptionExpiry.service.js rồi cron chỉ gọi một hàm, nhờ vậy
 * đột biến `template: planExpiredTemplate` bị bắt ngay.
 *
 * Muốn bịt nốt: tách vòng lặp nhắc hạn khỏi cron theo đúng khuôn PR-2a. Đó là refactor chạm
 * đường thư đang gửi cho khách thật, nên để thành việc riêng có plan, đừng nhét vào lượt review.
 */
