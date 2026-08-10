/**
 * Read integer VND amount as Vietnamese words (for Mat Bao TgTTTBChu).
 * Handles 0 … ~10^15; enough for NUMERIC(12,2) order amounts.
 */
const ONES = [
  '', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín',
];

function readThreeDigits(n, full) {
  const hundreds = Math.floor(n / 100);
  const tens = Math.floor((n % 100) / 10);
  const ones = n % 10;
  const parts = [];

  if (hundreds > 0) {
    parts.push(`${ONES[hundreds]} trăm`);
  } else if (full && (tens > 0 || ones > 0)) {
    parts.push('không trăm');
  }

  if (tens > 1) {
    parts.push(`${ONES[tens]} mươi`);
    if (ones === 1) parts.push('mốt');
    else if (ones === 5) parts.push('lăm');
    else if (ones > 0) parts.push(ONES[ones]);
  } else if (tens === 1) {
    parts.push('mười');
    if (ones === 5) parts.push('lăm');
    else if (ones > 0) parts.push(ONES[ones]);
  } else if (ones > 0) {
    if (full || hundreds > 0) parts.push(`lẻ ${ONES[ones]}`);
    else parts.push(ONES[ones]);
  }

  return parts.join(' ').trim();
}

/**
 * @param {number|string} amount
 * @returns {string} e.g. "Một trăm mười nghìn đồng"
 */
export function vndAmountToVietnameseWords(amount) {
  let n = Math.round(Number(amount) || 0);
  if (n < 0) n = 0;
  if (n === 0) return 'Không đồng';

  const scales = [
    { value: 1_000_000_000_000, name: 'nghìn tỷ' },
    { value: 1_000_000_000, name: 'tỷ' },
    { value: 1_000_000, name: 'triệu' },
    { value: 1_000, name: 'nghìn' },
    { value: 1, name: '' },
  ];

  const parts = [];
  let remaining = n;
  let started = false;

  for (const scale of scales) {
    if (remaining < scale.value && scale.value > 1) continue;
    const chunk = Math.floor(remaining / scale.value);
    remaining %= scale.value;
    if (chunk === 0) {
      if (started && remaining > 0 && scale.value > 1) {
        // keep place for "không trăm…" inside next chunk via full flag
      }
      continue;
    }
    const text = readThreeDigits(chunk, started);
    parts.push(scale.name ? `${text} ${scale.name}` : text);
    started = true;
  }

  const body = parts.join(' ').replace(/\s+/g, ' ').trim();
  if (!body) return 'Không đồng';
  return `${body.charAt(0).toUpperCase()}${body.slice(1)} đồng`;
}
