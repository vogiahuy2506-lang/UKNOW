/**
 * Giới hạn trả lời chatbot: ô số dùng NumberInput (dấu chấm hàng nghìn) nhưng payload `limit` vẫn là SỐ;
 * xoá trắng khi đang bật -> báo lỗi như cũ, không đẩy payload.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChatbotReplyLimitsCard from '../ChatbotReplyLimitsCard';

vi.mock('../../../../i18n', () => {
  const t = (key) => key;
  return { useI18n: () => ({ t }) };
});

const value = { windows: { day: { limit: 500, action: 'silent', message: '' } } };

describe('ChatbotReplyLimitsCard — ô số', () => {
  it('sửa thành 12000 -> hiện 12.000, onChange nhận limit = 12000 (số)', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ChatbotReplyLimitsCard value={value} onChange={onChange} />);
    const box = screen.getByDisplayValue('500');
    await user.clear(box);
    await user.type(box, '12000');
    expect(box).toHaveValue('12.000');
    const payload = onChange.mock.calls.at(-1)[0];
    expect(payload.windows.day.limit).toBe(12000);
    expect(typeof payload.windows.day.limit).toBe('number');
  });

  it('xoá trắng khi đang bật -> hiện lỗi, không đẩy payload mới', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<ChatbotReplyLimitsCard value={value} onChange={onChange} />);
    await user.clear(screen.getByDisplayValue('500'));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('chatbot.studio.replyLimitPositiveInteger')).toBeInTheDocument();
  });
});
