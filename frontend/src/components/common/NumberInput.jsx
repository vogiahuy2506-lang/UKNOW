import { useEffect, useLayoutEffect, useRef } from 'react';
import { formatIntVi } from '../../utils/formatNumber.util';

const MAX_DIGITS = 15; // dưới Number.MAX_SAFE_INTEGER (16 chữ số)

/** Chỉ giữ chữ số: dán "1.234.567" hay "1,234,567" đều ra "1234567". Bỏ số 0 đứng đầu. */
const toDigits = (raw) => {
  const digits = String(raw ?? '').replace(/\D/g, '').slice(0, MAX_DIGITS);
  return digits === '' ? '' : String(parseInt(digits, 10));
};

/**
 * Ô nhập số nguyên không âm, hiển thị dấu chấm hàng nghìn ngay khi gõ.
 * `value` là số hoặc chuỗi chữ số; `onChange` nhận SỐ NGUYÊN (hoặc '' khi rỗng) — không bao giờ nhận chuỗi có dấu chấm.
 * `min` / `max` (tuỳ chọn): ô kiểu text không có kiểm tra gốc của trình duyệt, nên ở đây đặt `setCustomValidity`
 * để biểu mẫu vẫn bị chặn khi gửi nếu giá trị đã nhập nằm ngoài khoảng (giống `type="number"` trước đây).
 * Ô rỗng không bị chặn bởi min/max (dùng `required` nếu bắt buộc).
 */
const NumberInput = ({ value, onChange, className = 'input w-full', min, max, ...rest }) => {
  const inputRef = useRef(null);
  const digitsBeforeCaret = useRef(null);
  const digits = toDigits(value);
  const display = formatIntVi(digits);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const n = digits === '' ? null : parseInt(digits, 10);
    let msg = '';
    if (n !== null && min !== undefined && min !== null && n < Number(min)) msg = `≥ ${formatIntVi(Number(min))}`;
    else if (n !== null && max !== undefined && max !== null && n > Number(max)) msg = `≤ ${formatIntVi(Number(max))}`;
    el.setCustomValidity(msg);
  }, [digits, min, max]);

  // Sau khi React vẽ lại chuỗi đã định dạng, đặt con trỏ sau đúng số chữ số người dùng vừa gõ tới.
  useLayoutEffect(() => {
    const el = inputRef.current;
    const keep = digitsBeforeCaret.current;
    digitsBeforeCaret.current = null;
    if (!el || keep === null || document.activeElement !== el) return;
    let seen = 0;
    let pos = 0;
    while (pos < display.length && seen < keep) {
      if (/\d/.test(display[pos])) seen += 1;
      pos += 1;
    }
    el.setSelectionRange(pos, pos);
  });

  const handleChange = (e) => {
    const raw = e.target.value;
    const caret = e.target.selectionStart ?? raw.length;
    digitsBeforeCaret.current = raw.slice(0, caret).replace(/\D/g, '').length;
    const digits = toDigits(raw);
    onChange(digits === '' ? '' : parseInt(digits, 10));
  };

  return (
    <input
      {...rest}
      ref={inputRef}
      type="text"
      inputMode="numeric"
      pattern="[0-9.]*"
      autoComplete="off"
      className={className}
      value={display}
      onChange={handleChange}
    />
  );
};

export default NumberInput;
