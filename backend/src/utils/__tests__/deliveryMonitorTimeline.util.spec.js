import { describe, it, expect } from '@jest/globals';
import { buildDeliveryTimeline } from '../deliveryMonitorTimeline.util.js';

describe('buildDeliveryTimeline (W7b)', () => {
  it('rỗng cả hai nguồn -> mảng rỗng', () => {
    expect(buildDeliveryTimeline([], [])).toEqual([]);
  });

  it('giữ cột journey và gộp Telegram/WhatsApp vào đúng bucket, total cộng cả 5 kênh', () => {
    const out = buildDeliveryTimeline(
      [{ bucket: '2026-09-29 10:00', email: 2, zalo: 1, zalo_group: 1 }],
      [
        { bucket: '2026-09-29 10:00', channel: 'telegram', count: 3 },
        { bucket: '2026-09-29 10:00', channel: 'whatsapp', count: 2 },
      ]
    );
    expect(out).toEqual([
      { bucket: '2026-09-29 10:00', email: 2, zalo: 1, zaloGroup: 1, telegram: 3, whatsapp: 2, total: 9 },
    ]);
  });

  it('bucket chỉ có tin adapter vẫn xuất hiện, sắp theo thời gian; kênh lạ bị bỏ qua', () => {
    const out = buildDeliveryTimeline(
      [{ bucket: '2026-09-29 11:00', email: 1, zalo: 0, zalo_group: 0 }],
      [
        { bucket: '2026-09-29 09:00', channel: 'telegram', count: 4 },
        { bucket: '2026-09-29 09:00', channel: 'email', count: 99 },
      ]
    );
    expect(out.map((r) => r.bucket)).toEqual(['2026-09-29 09:00', '2026-09-29 11:00']);
    expect(out[0]).toMatchObject({ telegram: 4, email: 0, total: 4 });
  });
});
