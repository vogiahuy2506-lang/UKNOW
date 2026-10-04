import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChatbotActiveHoursCard from '../ChatbotActiveHoursCard';
import vi_ from '../../../../i18n/vi.js';

/**
 * S-30 (04/10/2026): huy hiệu số khung giờ ghép chữ cứng `'khung giờ' : 'slots'` (đổi sang tiếng Anh vẫn hiện
 * "khung giờ") và câu lỗi "chưa có khung giờ" dùng nhầm khoá NHÃN `activeHoursSlotsLabel`.
 * Nay đi qua khoá riêng, có tham số {count}.
 */
vi.mock('../../../../i18n', () => ({
  useI18n: () => ({
    t: (key, params) => (params ? `${key}${JSON.stringify(params)}` : key),
  }),
}));

describe('ChatbotActiveHoursCard — huy hiệu số khung giờ (S-30)', () => {
  it('nhiều khung giờ → huy hiệu dùng khoá activeHoursSlotCount kèm count (không còn chữ cứng)', () => {
    const initial = {
      days: [1, 2, 3, 4, 5],
      slots: [
        { start: '08:00', end: '12:00' },
        { start: '13:30', end: '17:30' },
      ],
      outsideAction: 'silent',
    };
    render(<ChatbotActiveHoursCard value={initial} onChange={vi.fn()} />);

    expect(screen.getByText('chatbot.studio.activeHoursSlotCount{"count":2}')).toBeDefined();
    expect(screen.queryByText(/khung giờ$/)).toBeNull();
  });

  it('khoá mới có đủ bản dịch vi (tránh t() trả khoá thô)', () => {
    expect(vi_.chatbot.studio.activeHoursSlotCount).toBe('{count} khung giờ');
    expect(vi_.chatbot.studio.activeHoursNoSlots).toBeTruthy();
  });
});
