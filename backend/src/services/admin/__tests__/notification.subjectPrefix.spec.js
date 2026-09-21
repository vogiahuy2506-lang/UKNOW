import { beforeEach, describe, expect, it, jest } from '@jest/globals';

/**
 * Thư gửi cho Nhật Minh ngày 19/09/2026 có tiêu đề:
 *
 *   [Founder AI] [Founder AI] 🎁 Ưu đãi đặc biệt dành riêng cho bạn
 *
 * Không phải admin gõ sai. Cả 6 mẫu ở frontend/src/features/admin/utils/notificationTemplates.util.js
 * đặt `[Founder AI] ` ngay trong `subject`, mà `subject` đi thẳng vào `notification.title`
 * (NotificationCenter.jsx → buildPayloadFromHtml → `title: String(subject).trim()`), rồi
 * buildEmailHtml thêm tiền tố lần nữa.
 *
 * Chốt ở backend thay vì sửa 6 mẫu: nó bịt được cả những mẫu admin đã tự lưu vào
 * `notification_templates` (migration 228) với tiền tố dính sẵn — thứ không sửa được bằng cách
 * đổi hằng số ở frontend.
 */
jest.unstable_mockModule('../../../repositories/admin/notification.repository.js', () => ({
  default: {},
}));
jest.unstable_mockModule('../../../repositories/admin/notificationEmailLog.repository.js', () => ({
  default: {},
}));
// KHÔNG mock systemEmail.util.js: notificationEmailRender.util.js nhập `buildBaseTemplate` từ đó,
// mock thiếu export là cả suite không nạp được. Module thật chỉ đọc env và khai báo hàm — ca này
// không gửi thư nên nhập bản thật là an toàn, và còn kiểm luôn khuôn email thật.
const { default: notificationService } = await import('../notification.service.js');

const user = { full_name: 'Trương Minh', email: 'minh@example.com', plan: 'pro' };

describe('notification — tiền tố tiêu đề không được thêm hai lần', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('tiêu đề CHƯA có tiền tố → thêm vào', async () => {
    const out = await notificationService.buildEmailHtml(
      { type: 'promotion', title: '🎁 Ưu đãi đặc biệt', message: 'x' },
      user,
    );
    expect(out.subject).toBe('[Founder AI] 🎁 Ưu đãi đặc biệt');
  });

  it('tiêu đề ĐÃ có tiền tố (đúng ca 19/09) → KHÔNG thêm nữa', async () => {
    const out = await notificationService.buildEmailHtml(
      { type: 'promotion', title: '[Founder AI] 🎁 Ưu đãi đặc biệt dành riêng cho bạn', message: 'x' },
      user,
    );
    expect(out.subject).toBe('[Founder AI] 🎁 Ưu đãi đặc biệt dành riêng cho bạn');
    expect(out.subject.match(/\[Founder AI\]/g)).toHaveLength(1);
  });

  it('tiền tố nằm GIỮA tiêu đề thì vẫn thêm ở đầu (chỉ bỏ qua khi đứng đầu)', async () => {
    const out = await notificationService.buildEmailHtml(
      { type: 'announcement', title: 'Về [Founder AI] tháng này', message: 'x' },
      user,
    );
    expect(out.subject).toBe('[Founder AI] Về [Founder AI] tháng này');
  });

  it('tiêu đề rỗng → vẫn ra tiền tố, không vỡ', async () => {
    const out = await notificationService.buildEmailHtml({ type: 'announcement', message: 'x' }, user);
    expect(out.subject).toBe('[Founder AI] ');
  });
});
