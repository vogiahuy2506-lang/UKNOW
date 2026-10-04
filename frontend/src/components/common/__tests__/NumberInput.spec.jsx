import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import NumberInput from '../NumberInput';
import { formatIntVi } from '../../../utils/formatNumber.util';

const Harness = ({ initial = '', onValue, ...rest }) => {
  const [v, setV] = useState(initial);
  return (
    <NumberInput
      aria-label="so"
      value={v}
      onChange={(n) => { setV(n); onValue?.(n); }}
      {...rest}
    />
  );
};

describe('formatIntVi', () => {
  it('nhóm nghìn bằng dấu chấm; rỗng/null → chuỗi rỗng', () => {
    expect(formatIntVi(10000000)).toBe('10.000.000');
    expect(formatIntVi(0)).toBe('0');
    expect(formatIntVi('')).toBe('');
    expect(formatIntVi(null)).toBe('');
  });
});

describe('NumberInput', () => {
  it('gõ 10000000 → hiện 10.000.000 và onChange nhận số nguyên 10000000', async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness onValue={onValue} />);
    await user.type(screen.getByLabelText('so'), '10000000');
    expect(screen.getByLabelText('so')).toHaveValue('10.000.000');
    expect(onValue).toHaveBeenLastCalledWith(10000000);
    expect(typeof onValue.mock.calls.at(-1)[0]).toBe('number');
  });

  it('xoá hết → onChange rỗng và ô rỗng', async () => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness initial={1234} onValue={onValue} />);
    const input = screen.getByLabelText('so');
    expect(input).toHaveValue('1.234');
    await user.clear(input);
    expect(input).toHaveValue('');
    expect(onValue).toHaveBeenLastCalledWith('');
  });

  it.each([['1.234.567'], ['1,234,567']])('dán %s → 1234567', async (pasted) => {
    const onValue = vi.fn();
    const user = userEvent.setup();
    render(<Harness onValue={onValue} />);
    await user.click(screen.getByLabelText('so'));
    await user.paste(pasted);
    expect(onValue).toHaveBeenLastCalledWith(1234567);
    expect(screen.getByLabelText('so')).toHaveValue('1.234.567');
  });

  it('chữ cái bị bỏ', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(screen.getByLabelText('so'), 'a1b2c3');
    expect(screen.getByLabelText('so')).toHaveValue('123');
  });

  it('chèn chữ số giữa chuỗi: con trỏ ở sau chữ số vừa gõ, không nhảy về cuối', async () => {
    const user = userEvent.setup();
    render(<Harness initial={1000} />);
    const input = screen.getByLabelText('so');
    input.focus();
    input.setSelectionRange(2, 2); // "1.|000"
    await user.keyboard('5'); // → 15.000
    expect(input).toHaveValue('15.000');
    expect(input.selectionStart).toBe(2); // "15|.000"
  });

  it('disabled, inputMode numeric và placeholder được giữ', () => {
    render(<Harness initial={5} disabled placeholder="Nhập" />);
    const input = screen.getByLabelText('so');
    expect(input).toBeDisabled();
    expect(input).toHaveAttribute('inputmode', 'numeric');
    expect(input).toHaveAttribute('placeholder', 'Nhập');
  });
  it('min / max: ngoài khoảng thì ô không hợp lệ (chặn gửi biểu mẫu), rỗng thì không chặn', async () => {
    const user = userEvent.setup();
    render(<Harness min={1} max={36} />);
    const input = screen.getByLabelText('so');
    expect(input.checkValidity()).toBe(true); // rỗng
    await user.type(input, '0');
    expect(input.checkValidity()).toBe(false);
    await user.clear(input);
    await user.type(input, '40');
    expect(input.checkValidity()).toBe(false);
    await user.clear(input);
    await user.type(input, '36');
    expect(input.checkValidity()).toBe(true);
  });
});
