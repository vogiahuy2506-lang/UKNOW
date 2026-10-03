/**
 * TOTP RFC 6238 (HMAC-SHA1) + base32 RFC 4648 bằng node:crypto — không thêm dependency bảo mật.
 * Mọi hàm nhận `timestampMs` để test không cần fake timer.
 */
import crypto from 'node:crypto';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;

/**
 * @param {Buffer} buf
 * @returns {string} base32 không đệm `=`
 */
export function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/**
 * @param {string} str base32 (không phân biệt hoa thường, bỏ qua `=` và khoảng trắng)
 * @returns {Buffer}
 */
export function base32Decode(str) {
  const clean = String(str || '').toUpperCase().replace(/[\s=]/g, '');
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of clean) {
    const idx = BASE32_ALPHABET.indexOf(ch);
    if (idx === -1) throw new Error('Chuỗi base32 không hợp lệ');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** @returns {string} secret base32 32 ký tự (20 byte ngẫu nhiên) */
export function generateSecret() {
  return base32Encode(crypto.randomBytes(20));
}

function counterBuffer(counter) {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  return buf;
}

function hotp(secretBuf, counter, digits) {
  const hmac = crypto.createHmac('sha1', secretBuf).update(counterBuffer(counter)).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const bin = hmac.readUInt32BE(offset) & 0x7fffffff;
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/**
 * @param {string} secretBase32
 * @param {{ timestampMs: number, step?: number, digits?: number }} opts
 * @returns {string} mã zero-pad
 */
export function totpAt(secretBase32, { timestampMs, step = TOTP_STEP_SECONDS, digits = TOTP_DIGITS } = {}) {
  const counter = Math.floor(timestampMs / 1000 / step);
  return hotp(base32Decode(secretBase32), counter, digits);
}

/** Bước (counter) của một mốc thời gian. */
export function stepAt(timestampMs, step = TOTP_STEP_SECONDS) {
  return Math.floor(timestampMs / 1000 / step);
}

/**
 * Kiểm mã TOTP; bỏ qua mọi bước ≤ lastUsedStep (chống dùng lại).
 * @returns {{ ok: boolean, step: number|null }}
 */
export function verifyTotp(
  secretBase32,
  code,
  { timestampMs = Date.now(), window = 1, lastUsedStep = null, step = TOTP_STEP_SECONDS, digits = TOTP_DIGITS } = {}
) {
  const input = typeof code === 'string' ? code.trim() : '';
  if (!new RegExp(`^\\d{${digits}}$`).test(input)) return { ok: false, step: null };

  const secretBuf = base32Decode(secretBase32);
  const current = stepAt(timestampMs, step);
  const inputBuf = Buffer.from(input);
  let matched = null;
  // Duyệt hết các bước (không thoát sớm) để thời gian trả lời không lộ bước nào khớp.
  for (let c = current - window; c <= current + window; c += 1) {
    if (lastUsedStep != null && c <= lastUsedStep) continue;
    const expected = Buffer.from(hotp(secretBuf, c, digits));
    if (crypto.timingSafeEqual(expected, inputBuf) && matched === null) matched = c;
  }
  return matched === null ? { ok: false, step: null } : { ok: true, step: matched };
}

/**
 * @param {{ issuer?: string, account: string, secret: string }} p
 * @returns {string} otpauth://totp/Founder%20AI:<account>?secret=…&issuer=Founder%20AI&algorithm=SHA1&digits=6&period=30
 */
export function buildOtpauthUrl({ issuer = 'Founder AI', account, secret }) {
  const enc = encodeURIComponent;
  return `otpauth://totp/${enc(issuer)}:${enc(account)}?secret=${secret}&issuer=${enc(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
}
