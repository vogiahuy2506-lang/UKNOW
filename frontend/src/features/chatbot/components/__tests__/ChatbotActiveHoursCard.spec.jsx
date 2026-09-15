import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ChatbotActiveHoursCard from '../ChatbotActiveHoursCard';

vi.mock('../../../../i18n', () => ({
  useI18n: () => ({
    t: (key) => key,
  }),
}));

describe('ChatbotActiveHoursCard', () => {
  it('renders default 24/7 mode when value is null', () => {
    render(<ChatbotActiveHoursCard value={null} onChange={vi.fn()} />);

    expect(screen.getByText('chatbot.studio.activeHoursTitle')).toBeDefined();
    expect(screen.getByText('24/7')).toBeDefined();
  });

  it('renders custom hours mode when initial value is provided', () => {
    const initial = {
      start: '18:00',
      end: '05:00',
      outsideAction: 'message',
      outsideMessage: 'Đang nghỉ ngơi',
    };
    render(<ChatbotActiveHoursCard value={initial} onChange={vi.fn()} />);

    expect(screen.getByText('18:00 – 05:00')).toBeDefined();
    expect(screen.getByDisplayValue('Đang nghỉ ngơi')).toBeDefined();
  });

  it('switches to custom hours and emits updated payload on valid change', () => {
    const onChange = vi.fn();
    render(<ChatbotActiveHoursCard value={null} onChange={onChange} />);

    // Click tab Chỉ trả lời trong khung giờ
    const customTabBtn = screen.getByText('chatbot.studio.activeHoursCustom');
    fireEvent.click(customTabBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        start: '08:00',
        end: '17:30',
        outsideAction: 'silent',
      })
    );
  });

  it('validates same start and end time and shows error', () => {
    const onChange = vi.fn();
    render(
      <ChatbotActiveHoursCard
        value={{ start: '08:00', end: '17:30', outsideAction: 'silent' }}
        onChange={onChange}
      />
    );

    const endInput = screen.getByLabelText('end-time');
    fireEvent.change(endInput, { target: { value: '08:00' } });

    expect(screen.getByText('chatbot.studio.activeHoursSameTime')).toBeDefined();
  });

  it('cấu hình sai → báo lỗi lên modal (chặn Lưu) và không gửi giá trị; sửa đúng → xoá lỗi', () => {
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    render(
      <ChatbotActiveHoursCard
        value={{ start: '08:00', end: '17:30', outsideAction: 'silent' }}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />
    );

    const endInput = screen.getByLabelText('end-time');
    fireEvent.change(endInput, { target: { value: '08:00' } });
    expect(onValidityChange).toHaveBeenLastCalledWith('chatbot.studio.activeHoursSameTime');
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.change(endInput, { target: { value: '18:00' } });
    expect(onValidityChange).toHaveBeenLastCalledWith('');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ start: '08:00', end: '18:00' }));
  });

  it('switches back to 24/7 and emits null', () => {
    const onChange = vi.fn();
    render(
      <ChatbotActiveHoursCard
        value={{ start: '08:00', end: '17:30', outsideAction: 'silent' }}
        onChange={onChange}
      />
    );

    const alwaysTabBtn = screen.getByText('chatbot.studio.activeHoursAlways');
    fireEvent.click(alwaysTabBtn);

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
