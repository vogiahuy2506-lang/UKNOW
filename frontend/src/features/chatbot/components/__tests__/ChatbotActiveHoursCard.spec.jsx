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

  it('renders multi-slot and custom days when provided', () => {
    const initial = {
      days: [1, 2, 3, 4, 5],
      slots: [
        { start: '08:00', end: '12:00' },
        { start: '13:30', end: '17:30' },
      ],
      outsideAction: 'silent',
    };
    render(<ChatbotActiveHoursCard value={initial} onChange={vi.fn()} />);

    expect(screen.getByText('chatbot.studio.activeHoursPresetWorkdays')).toBeDefined();
    expect(screen.getByLabelText('start-time')).toHaveValue('08:00');
    expect(screen.getByLabelText('end-time')).toHaveValue('12:00');
    expect(screen.getByLabelText('start-time-1')).toHaveValue('13:30');
    expect(screen.getByLabelText('end-time-1')).toHaveValue('17:30');
  });

  it('renders overnight badge for slot where start > end', () => {
    const initial = {
      days: [1, 2, 3, 4, 5],
      slots: [{ start: '18:00', end: '05:00' }],
      outsideAction: 'silent',
    };
    render(<ChatbotActiveHoursCard value={initial} onChange={vi.fn()} />);

    expect(screen.getByText('chatbot.studio.activeHoursOvernightBadge')).toBeDefined();
  });

  it('updates days when preset buttons are clicked', () => {
    const onChange = vi.fn();
    render(
      <ChatbotActiveHoursCard
        value={{ start: '08:00', end: '17:30', outsideAction: 'silent' }}
        onChange={onChange}
      />
    );

    const workdaysBtn = screen.getByText('chatbot.studio.activeHoursPresetWorkdays');
    fireEvent.click(workdaysBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        days: [1, 2, 3, 4, 5],
        slots: [{ start: '08:00', end: '17:30' }],
      })
    );
  });

  it('validates error when all days are unselected', () => {
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    render(
      <ChatbotActiveHoursCard
        value={{ days: [1], slots: [{ start: '08:00', end: '17:30' }], outsideAction: 'silent' }}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />
    );

    // Unselect Monday (T2)
    const monBtn = screen.getByText('chatbot.studio.dayMon');
    fireEvent.click(monBtn);

    expect(onValidityChange).toHaveBeenLastCalledWith('chatbot.studio.activeHoursNoDaysSelected');
    expect(screen.getByText('chatbot.studio.activeHoursNoDaysSelected')).toBeDefined();
  });

  it('adds and removes time slots up to limit', () => {
    const onChange = vi.fn();
    render(
      <ChatbotActiveHoursCard
        value={{
          days: [1, 2, 3, 4, 5],
          slots: [{ start: '08:00', end: '12:00' }],
          outsideAction: 'silent',
        }}
        onChange={onChange}
      />
    );

    // Click Add Slot
    const addBtn = screen.getByText('chatbot.studio.activeHoursAddSlot');
    fireEvent.click(addBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        slots: [
          { start: '08:00', end: '12:00' },
          { start: '18:00', end: '22:00' },
        ],
      })
    );

    // Now remove slot 2
    const removeBtns = screen.getAllByTitle('chatbot.studio.activeHoursRemoveSlot');
    expect(removeBtns.length).toBe(2);
    fireEvent.click(removeBtns[1]);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        slots: [{ start: '08:00', end: '12:00' }],
      })
    );
  });

  it('validates overlapping time slots and blocks submission', () => {
    const onChange = vi.fn();
    const onValidityChange = vi.fn();
    render(
      <ChatbotActiveHoursCard
        value={{
          days: [1, 2, 3, 4, 5],
          slots: [
            { start: '08:00', end: '12:00' },
            { start: '14:00', end: '18:00' },
          ],
          outsideAction: 'silent',
        }}
        onChange={onChange}
        onValidityChange={onValidityChange}
      />
    );

    // Change slot 2 start time to 11:00 (overlaps with 08:00-12:00)
    const start2 = screen.getByLabelText('start-time-1');
    fireEvent.change(start2, { target: { value: '11:00' } });

    expect(onValidityChange).toHaveBeenLastCalledWith('chatbot.studio.activeHoursSlotsOverlap');
    expect(screen.getByText('chatbot.studio.activeHoursSlotsOverlap')).toBeDefined();
  });
});

