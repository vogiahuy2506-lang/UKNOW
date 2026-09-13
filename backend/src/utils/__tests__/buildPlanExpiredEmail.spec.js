import { describe, it, expect } from '@jest/globals';
import { buildPlanExpiredEmail } from '../systemEmail.util.js';

describe('buildPlanExpiredEmail (Unit) — Nội dung thư hết hạn gói T-0', () => {
  it('sinh đúng subject, nội dung quá khứ, cảnh báo chiến dịch dừng, nút CTA và BỎ countdown badge', () => {
    const email = buildPlanExpiredEmail({
      fullName: 'Nguyễn Văn A',
      planName: 'Gói Pro',
      expiresAt: '2026-09-10T10:00:00.000Z',
      renewalUrl: 'http://localhost:5174/app/billing',
    });

    expect(email.subject).toContain('Gói Pro của bạn đã hết hạn');
    // Chứa thông tin tên và ngày hết hạn
    expect(email.html).toContain('Nguyễn Văn A');
    expect(email.html).toContain('Gói <strong>Gói Pro</strong> của bạn đã hết hạn');
    // Chứa thông báo chiến dịch đang chạy đã dừng (theo yêu cầu mục 1.3 của plan)
    expect(email.html).toContain('Các chiến dịch marketing đang chạy đã dừng');
    // Chứa nút CTA gia hạn
    expect(email.html).toContain('href="http://localhost:5174/app/billing"');
    expect(email.html).toContain('Gia hạn / Nâng gói ngay');
    // TUYỆT ĐỐI BỎ huy hiệu đếm ngược ("Còn lại ... ngày")
    expect(email.html).not.toMatch(/Còn lại\s*<\/p>\s*<p[^>]*>\s*\d+\s*ngày/i);
    expect(email.html).not.toContain('Còn lại 0 ngày');
  });

  it('xử lý an toàn khi fullName, expiresAt, renewalUrl khuyết thiếu', () => {
    const email = buildPlanExpiredEmail({
      planName: 'Basic',
    });

    expect(email.subject).toContain('Gói Basic của bạn đã hết hạn');
    expect(email.html).toContain('bạn');
    expect(email.html).toContain('gần đây');
    expect(email.html).toContain('/app/billing');
  });
});
