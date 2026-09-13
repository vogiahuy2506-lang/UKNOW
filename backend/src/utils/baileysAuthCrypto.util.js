/**
 * baileysAuthCrypto.util.js
 *
 * Mã hóa auth state at-rest — cùng cơ chế AES-256-GCM +
 * SMTP_SECRET_KEY với Zalo cookies và SMTP passwords
 * (`smtpSecretCrypto.js`), nhưng wrap theo shape JSONB-friendly để
 * repo không phải đổi column type.
 *
 * Wire format khi lưu vào cột `whatsapp_baileys_session_creds.creds`
 * (JSONB), `whatsapp_baileys_session_keys.value` (JSONB), HOẶC
 * `telegram_session_state.state` (JSONB — mtcute Postgres-backed
 * storage kể từ migration 217):
 *
 *   { enc: "enc:v1:<ivHex>:<authTagHex>:<cipherTextHex>" }
 *
 * - Object bọc ngoài vì Postgres JSONB auto-parse MỌI string thành
 *   text. Nếu lưu thẳng chuỗi "enc:v1:..." vào JSONB thì lúc đọc
 *   `pg` sẽ trả về string đó (OK) NHƯNG khi save vẫn ổn. Để giữ
 *   symmetric và có chỗ thêm version key, mình wrap object.
 * - Khi đọc: phát hiện `row.enc` thì `decryptSmtpSecret(row.enc)`
 *   rồi `JSON.parse` để trả về object Baileys/mtcute cần.
 * - Khi ghi: encrypt rồi wrap object.
 *
 * Tương thích ngược: nếu row là object "thật" (không có field
 * `.enc`) → trả nguyên, không lỗi. Lần ghi kế tiếp sẽ nâng cấp
 * dần.
 *
 * ── Rename history ────────────────────────────────────────────────────
 * Originally this module was Baileys-only. After migration 217
 * Telegram's Postgres-backed storage joined the same wire format
 * (so we can rotate the encryption key once for the whole channel
 * surface instead of per-channel), the function names were
 * generalised:
 *
 *   encryptBaileysBlob   → encryptChannelSessionBlob
 *   decryptBaileysBlob   → decryptChannelSessionBlob
 *   isEncryptedBaileysBlob → isEncryptedChannelSessionBlob
 *
 * The old names are re-exported as deprecated aliases so existing
 * call sites (notably `useDatabaseAuthState.js` for WhatsApp) keep
 * working without a rename churn. New code should prefer the
 * `*ChannelSessionBlob` names — see callers in
 * `chatbotTelegram.repository.js` and `telegramMtProtoStorage.js`.
 */

import {
  decryptSmtpSecret,
  encryptSmtpSecret,
  isEncryptedSmtpSecret,
} from './smtpSecretCrypto.js';

const ENC_FIELD = 'enc';

/**
 * Re-constitute Node Buffers that JSONB turn into plain objects.
 *
 * Khi `AuthenticationCreds` / Signal key value đi qua JSONB, các
 * field `Uint8Array | Buffer` (e.g. `noiseKey.private`,
 * `signedIdentityKey.private`, `signedPreKey.private`,
 * `app-state-sync-version`) bị `JSON.stringify` thành object
 * `{ type: 'Buffer', data: number[] }`. `pg` không tự revive lại
 * khi đọc JSONB column — trả nguyên object đó. Hậu quả: Baileys
 * gọi `aesEncryptGCM(thisObject)` → `ERR_INVALID_ARG_TYPE` vì
 * `Cipheriv.update` chỉ chấp nhận `string | Buffer | TypedArray |
 * DataView`. Noise handshake vỡ → session close ngay, QR không
 * bao giờ hiện.
 *
 * Hàm này đi qua toàn bộ cây object, convert mọi
 * `{ type: 'Buffer', data: [...] }` thành `Buffer.from(data)` —
 * bao gồm cả legacy plaintext rows (đã lưu sai vì thiếu
 * `SMTP_SECRET_KEY`) lẫn encrypted rows sau khi `JSON.parse`.
 */
function reviveBufferInPlace(value) {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      value[i] = reviveBufferInPlace(value[i]);
    }
    return value;
  }
  if (typeof value !== 'object') return value;
  // Nhận diện Buffer-revival marker từ JSON.stringify(buf).
  // Chỉ áp dụng khi `data` là Array<number> — tránh nhầm với
  // object bất kỳ có field `type === 'Buffer'`.
  if (
    value.type === 'Buffer' &&
    Array.isArray(value.data) &&
    value.data.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)
  ) {
    return Buffer.from(value.data);
  }
  for (const key of Object.keys(value)) {
    value[key] = reviveBufferInPlace(value[key]);
  }
  return value;
}

function isEncryptedBlob(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    typeof value[ENC_FIELD] === 'string' &&
    isEncryptedSmtpSecret(value[ENC_FIELD])
  );
}

/**
 * Encrypt một auth-state object (Baileys `AuthenticationCreds` /
 * Signal key value, OR mtcute storage blob).
 *
 * @param {any} plainObject
 * @returns {object} wrapper `{ enc: "enc:v1:..." }` để lưu vào JSONB
 */
export function encryptChannelSessionBlob(plainObject) {
  if (plainObject === null || plainObject === undefined) return plainObject;
  // Đã được wrap trước đó thì giữ nguyên (tránh double-encrypt)
  if (isEncryptedBlob(plainObject)) return plainObject;
  let serialized;
  try {
    serialized = JSON.stringify(plainObject);
  } catch (err) {
    console.error('[BaileysAuthCrypto] JSON.stringify failed:', err.message);
    return plainObject;
  }
  try {
    const enc = encryptSmtpSecret(serialized);
    return { [ENC_FIELD]: enc };
  } catch (err) {
    // Thiếu SMTP_SECRET_KEY thì KHÔNG block — fallback plaintext.
    // Lý do: mất key là lỗi vận hành nhưng user đã có session hoạt
    // động thì không nên đá login. Sẽ log để admin thấy.
    console.error(
      '[BaileysAuthCrypto] Không mã hóa được blob (thiếu SMTP_SECRET_KEY?) — lưu plaintext:',
      err.message
    );
    return plainObject;
  }
}

/**
 * Decrypt một blob từ DB về auth-state object.
 *
 * @param {any} storedValue giá trị từ JSONB column
 * @returns {any} object (parsed) hoặc `storedValue` nguyên nếu legacy plaintext
 */
export function decryptChannelSessionBlob(storedValue) {
  if (storedValue === null || storedValue === undefined) return storedValue;
  if (!isEncryptedBlob(storedValue)) {
    // Legacy plaintext row — trả nguyên để Baileys/mtcute dùng tiếp.
    // Lần write kế tiếp sẽ nâng cấp lên encrypted.
    // Vẫn phải revive Buffer vì plaintext cũ cũng đã trải qua
    // JSONB serialize/parse (mất type).
    return reviveBufferInPlace(storedValue);
  }
  try {
    const plain = decryptSmtpSecret(storedValue[ENC_FIELD]);
    return reviveBufferInPlace(JSON.parse(plain));
  } catch (err) {
    // Sai key → trả null để caller khởi tạo lại từ QR.
    // Tốt hơn là ném lỗi vì nếu trả object rỗng thì zalo-js tương
    // đương sẽ lỗi khó hiểu (Baileys cũng vậy — null thì khởi tạo mới).
    console.error(
      '[BaileysAuthCrypto] Giải mã blob thất bại (sai SMTP_SECRET_KEY?) — coi như không có session:',
      err.message
    );
    return null;
  }
}

/**
 * Detect whether a row was written by the new encrypted path.
 * Exported so call sites can branch on legacy-plaintext rows
 * without trying to decrypt them (the legacy path is also a
 * valid input — see `decryptChannelSessionBlob`).
 */
export function isEncryptedChannelSessionBlob(value) {
  return isEncryptedBlob(value);
}

// ── Deprecated aliases ────────────────────────────────────────────────
//
// Kept so existing call sites (notably `useDatabaseAuthState.js`)
// keep working without a rename churn. New code should prefer the
// `*ChannelSessionBlob` names above. The aliases log a one-shot
// warning on first use so we can find stragglers during the next
// refactor pass.

const _deprecatedAliasNotices = new Set();
function _deprecatedAliasNotice(oldName, newName) {
  if (_deprecatedAliasNotices.has(oldName)) return;
  _deprecatedAliasNotices.add(oldName);
  // eslint-disable-next-line no-console
  console.warn(
    `[BaileysAuthCrypto] ${oldName} is deprecated; use ${newName} instead.`
  );
}

/** @deprecated Use {@link encryptChannelSessionBlob}. */
export function encryptBaileysBlob(plainObject) {
  _deprecatedAliasNotice('encryptBaileysBlob', 'encryptChannelSessionBlob');
  return encryptChannelSessionBlob(plainObject);
}

/** @deprecated Use {@link decryptChannelSessionBlob}. */
export function decryptBaileysBlob(storedValue) {
  _deprecatedAliasNotice('decryptBaileysBlob', 'decryptChannelSessionBlob');
  return decryptChannelSessionBlob(storedValue);
}

/** @deprecated Use {@link isEncryptedChannelSessionBlob}. */
export function isEncryptedBaileysBlob(value) {
  _deprecatedAliasNotice('isEncryptedBaileysBlob', 'isEncryptedChannelSessionBlob');
  return isEncryptedChannelSessionBlob(value);
}
