/**
 * Sinh chuỗi VietQR/EMVCo Merchant-Presented Mode (PR-3a, PLAN_FORM_DAT_LICH_THANH_TOAN_2026-09-13.md
 * mục 3) + mã nội dung chuyển khoản. Hàm thuần — không đụng DB/HTTP.
 *
 * Cấu trúc TLV xác nhận bằng cách giải mã ngược đúng mẫu trong plan (§2):
 *   00 02 01                              Payload Format Indicator
 *   01 02 12                              Point of Initiation Method (12 = dynamic, có amount)
 *   38 LL                                 VietQR template (Napas)
 *     00 10 A000000727                    GUID Napas
 *     01 LL                                Beneficiary — CHỈ chứa BIN + số tài khoản
 *       00 06 <BIN>
 *       01 LL <ACCOUNT_NUMBER>
 *     02 08 QRIBFTTA                       Service code — SIBLING của 01, KHÔNG lồng bên trong
 *   53 03 704                             Currency = VND
 *   54 LL <AMOUNT>
 *   58 02 VN                              Country
 *   62 LL                                 Additional Data
 *     08 LL <MEMO>                         Nội dung chuyển khoản (payment_code)
 *   63 04 <CRC>                           CRC-16/CCITT-FALSE của toàn bộ chuỗi TRƯỚC nó (kể cả "6304")
 *
 * Khứ hồi bằng `frontend/src/utils/vietqrParser.js` (không kiểm CRC) — test unit của module này
 * tự giải mã lại + đối chiếu đúng mẫu chuỗi cho trong plan, và kiểm CRC bằng vector chuẩn
 * "123456789" → "29B1" (giá trị kiểm chuẩn CRC-16/CCITT-FALSE, không phụ thuộc parser).
 */

import crypto from 'crypto';

const NAPAS_GUID = 'A000000727';
const SERVICE_CODE = 'QRIBFTTA';
const CURRENCY_VND = '704';
const COUNTRY_VN = 'VN';

/**
 * CRC-16/CCITT-FALSE: poly 0x1021, init 0xFFFF, không reflect input/output, không XOR cuối.
 * Vector kiểm chuẩn: "123456789" → 0x29B1.
 *
 * @param {string} str
 * @returns {string} 4 ký tự hex viết HOA
 */
export function crc16CcittFalse(str) {
  const buf = Buffer.from(String(str), 'utf8');
  let crc = 0xffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i] << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Gói một TLV: tag (2 ký tự) + length (2 ký tự thập phân) + value. */
function tlv(tag, value) {
  const v = String(value);
  const len = String(v.length).padStart(2, '0');
  return `${tag}${len}${v}`;
}

/**
 * Sinh chuỗi VietQR EMVCo đầy đủ (kèm CRC) từ BIN/STK/số tiền/nội dung.
 *
 * @param {{ bin: string, accountNumber: string, amount: number, memo: string }} params
 * @returns {string}
 */
export function buildVietQrString({ bin, accountNumber, amount, memo }) {
  const beneficiary = tlv('01', tlv('00', String(bin)) + tlv('01', String(accountNumber)));
  const vietQrTemplate = tlv('38', tlv('00', NAPAS_GUID) + beneficiary + tlv('02', SERVICE_CODE));

  const body = [
    tlv('00', '01'),
    tlv('01', '12'),
    vietQrTemplate,
    tlv('53', CURRENCY_VND),
    tlv('54', String(Math.round(Number(amount)))),
    tlv('58', COUNTRY_VN),
    tlv('62', tlv('08', String(memo))),
  ].join('') + '6304';

  return body + crc16CcittFalse(body);
}

// Bỏ 0/O (dễ nhầm với nhau) và 1/I (dễ nhầm với nhau) — mã này người dùng phải ĐỌC và GÕ TAY
// vào nội dung chuyển khoản trên app ngân hàng.
const PAYMENT_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const PAYMENT_CODE_LENGTH = 8;

/**
 * Sinh mã nội dung chuyển khoản ngẫu nhiên (PR-3a mục 3): 8 ký tự HOA+số, chỉ ASCII, bỏ ký tự
 * dễ nhầm. Không đảm bảo duy nhất — tầng gọi (form.service.js) tự thử lại khi đụng unique index
 * `uq_form_submissions_payment_code`.
 *
 * @param {number} [length]
 * @returns {string}
 */
export function generatePaymentCode(length = PAYMENT_CODE_LENGTH) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += PAYMENT_CODE_ALPHABET[bytes[i] % PAYMENT_CODE_ALPHABET.length];
  }
  return out;
}
