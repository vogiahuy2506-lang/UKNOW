/**
 * VietQR / EMVCo QR Parser.
 *
 * PayOS trả về `qrCode` là raw EMVCo Merchant-Presented Mode string (VietQR),
 * KHÔNG phải URL ảnh. Frontend dùng `qrcode` lib để render ra ảnh, nhưng
 * muốn hiển thị text "Số tài khoản / Ngân hàng / Số tiền / Nội dung" để khách
 * không quét được QR vẫn nhập tay được — phải parse chuỗi này.
 *
 * Spec tham chiếu: EMVCo MPM + Napas VietQR QuickPay (`A000000727`).
 * Format: TLV (Tag-Length-Value) lồng nhau, length là 2 ký tự số.
 *
 *   00 02 01                              → Payload Format Indicator (01)
 *   01 02 12                              → Point of Initiation Method (12 = dynamic)
 *   38 LL                                 → VietQR template
 *     00 10 A000000727                    → GUID Napas
 *     01 LL
 *       00 06 <BIN>                        → Bank BIN (6 số)
 *       01 LL <ACCOUNT_NUMBER>             → Số tài khoản / số thẻ
 *       02 08                              → Service code (QRIBFTTA / QRIBFTTC)
 *   53 03 704                             → Currency (VND)
 *   54 LL <AMOUNT>                        → Số tiền
 *   58 02 VN                              → Country
 *   59 LL <MERCHANT_NAME>                  → Tên merchant (không phải lúc nào cũng tên chủ TK)
 *   60 LL <CITY>                          (optional)
 *   62 LL                                 → Additional Data
 *     01 LL <BILL_NUMBER>                 (optional)
 *     08 LL <PURPOSE>                     → Nội dung CK
 *   63 04 <CRC>                           → CRC16 (bỏ qua)
 *
 * Trả về object:
 *   {
 *     bin: string | null,            // 6 số
 *     accountNumber: string | null,
 *     serviceCode: string | null,    // QRIBFTTA / QRIBFTTC
 *     amount: number | null,         // VND
 *     currency: 'VND' | null,
 *     merchantName: string | null,
 *     description: string | null,    // PayOS put "TT {planCode}" ở đây
 *     valid: boolean,
 *     error: string | null,
 *   }
 *
 * Không throw — luôn trả object, `valid: false` + `error` khi parse lỗi để
 * UI render được fallback "Không quét được? Nhập tay theo thông tin bên dưới".
 */

/** Đọc 2 ký tự length (decimal) tại offset, return value span từ offset+2. */
function readTLV(str, offset) {
  if (offset + 4 > str.length) return null;
  const tag = str.slice(offset, offset + 2);
  const len = parseInt(str.slice(offset + 2, offset + 4), 10);
  if (!Number.isFinite(len) || offset + 4 + len > str.length) return null;
  const value = str.slice(offset + 4, offset + 4 + len);
  return { tag, value, next: offset + 4 + len };
}

/** Parse phần VietQR template nằm trong tag 38. */
function parseVietQRTemplate(raw) {
  // raw = "0010A00000072701LL<...>0208QRIBFTTA"
  let offset = 0;
  const result = { guid: null, bin: null, accountNumber: null, serviceCode: null };

  while (offset < raw.length) {
    const sub = readTLV(raw, offset);
    if (!sub) break;
    if (sub.tag === '00') {
      result.guid = sub.value;
    } else if (sub.tag === '01') {
      // Bank info container: chứa 00 (BIN) + 01 (account) + 02 (service)
      let subOffset = 0;
      while (subOffset < sub.value.length) {
        const inner = readTLV(sub.value, subOffset);
        if (!inner) break;
        if (inner.tag === '00' && inner.value.length === 6) {
          result.bin = inner.value;
        } else if (inner.tag === '01') {
          result.accountNumber = inner.value;
        } else if (inner.tag === '02') {
          result.serviceCode = inner.value;
        }
        subOffset = inner.next;
      }
    } else if (sub.tag === '02') {
      // Service code ngoài container (một số issuer)
      result.serviceCode = sub.value;
    }
    offset = sub.next;
  }

  return result;
}

/** Parse additional data template nằm trong tag 62. */
function parseAdditionalData(raw) {
  // raw = "01LL<BILL>05LL<REF_LABEL>08LL<PURPOSE>"
  let offset = 0;
  const result = { description: null, refLabel: null };

  while (offset < raw.length) {
    const sub = readTLV(raw, offset);
    if (!sub) break;
    if (sub.tag === '08') {
      result.description = sub.value;
    } else if (sub.tag === '05') {
      result.refLabel = sub.value;
    }
    offset = sub.next;
  }

  return result;
}

export function parseVietQR(raw) {
  if (typeof raw !== 'string' || raw.length < 20) {
    return {
      guid: null,
      bin: null,
      accountNumber: null,
      serviceCode: null,
      amount: null,
      currency: null,
      merchantName: null,
      description: null,
      refLabel: null,
      valid: false,
      error: 'EMPTY_OR_INVALID',
    };
  }

  try {
    let offset = 0;
    const out = {
      guid: null,
      bin: null,
      accountNumber: null,
      serviceCode: null,
      amount: null,
      currency: null,
      merchantName: null,
      description: null,
      refLabel: null,
      valid: true,
      error: null,
    };

    while (offset < raw.length) {
      const tlv = readTLV(raw, offset);
      if (!tlv) break;

      if (tlv.tag === '38') {
        Object.assign(out, parseVietQRTemplate(tlv.value));
      } else if (tlv.tag === '53') {
        if (tlv.value === '704') out.currency = 'VND';
      } else if (tlv.tag === '54') {
        const amount = parseInt(tlv.value, 10);
        if (Number.isFinite(amount)) out.amount = amount;
      } else if (tlv.tag === '59') {
        out.merchantName = tlv.value;
      } else if (tlv.tag === '62') {
        const extra = parseAdditionalData(tlv.value);
        if (extra.description) out.description = extra.description;
        if (extra.refLabel) out.refLabel = extra.refLabel;
      } else if (tlv.tag === '26') {
        // Một số QR có thêm Merchant Account Information template.
        // PayOS không dùng, bỏ qua nhưng vẫn đọc sub để tránh lệch offset.
      }
      offset = tlv.next;
    }

    // Validate tối thiểu: phải có BIN hoặc accountNumber mới coi là QR hợp lệ.
    if (!out.bin && !out.accountNumber) {
      out.valid = false;
      out.error = 'NO_BANK_INFO';
    }

    return out;
  } catch (e) {
    return {
      guid: null,
      bin: null,
      accountNumber: null,
      serviceCode: null,
      amount: null,
      currency: null,
      merchantName: null,
      description: null,
      refLabel: null,
      valid: false,
      error: e?.message || 'PARSE_ERROR',
    };
  }
}

/**
 * CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, không reflect input/output).
 * Vector kiểm chuẩn: "123456789" -> "29B1".
 *
 * @param {string} str
 * @returns {string} 4 ký tự hex viết HOA
 */
export function crc16CcittFalse(str) {
  const encoder = new TextEncoder();
  const buf = encoder.encode(String(str));
  let crc = 0xffff;
  for (let i = 0; i < buf.length; i += 1) {
    crc ^= buf[i] << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Kiểm tra checksum CRC-16 của chuỗi VietQR chuẩn (kết thúc bằng tag 6304 + 4 ký tự CRC).
 *
 * @param {string} raw
 * @returns {boolean}
 */
export function verifyVietQrChecksum(raw) {
  if (typeof raw !== 'string' || raw.length < 8) return false;
  const idx = raw.lastIndexOf('6304');
  if (idx === -1 || idx !== raw.length - 8) return false;
  const payloadToHash = raw.slice(0, idx + 4);
  const expectedCrc = raw.slice(idx + 4).toUpperCase();
  const actualCrc = crc16CcittFalse(payloadToHash);
  return actualCrc === expectedCrc;
}

const NAPAS_GUID = 'A000000727';
const SERVICE_CODE = 'QRIBFTTA';
const CURRENCY_VND = '704';
const COUNTRY_VN = 'VN';

/** Gói một TLV: tag (2 ký tự) + length (2 ký tự thập phân) + value. */
function tlv(tag, value) {
  const v = String(value);
  const len = String(v.length).padStart(2, '0');
  return `${tag}${len}${v}`;
}

/**
 * Sinh chuỗi VietQR EMVCo đầy đủ (kèm CRC) từ BIN/STK/số tiền/nội dung.
 * Thuần túy logic chuẩn VietQR QuickPay Napas — trùng khớp từng ký tự với backend vietQr.util.js.
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

const MOMO_QR_ACCOUNT_RE = /^[A-Z0-9]{6,19}$/;
const MOMO_QR_REF_LABEL_RE = /^[A-Z0-9]{1,25}$/;

/**
 * Phân tích và xác thực chuỗi QR MoMo (theo chuẩn VietQR QuickPay Napas tag 38).
 * BẮT BUỘC:
 * 1. Khớp CRC-16/CCITT-FALSE của phần trước 6304 với 4 ký tự cuối.
 * 2. GUID tag 38 là Napas ('A000000727').
 * 3. BIN 6 số và số tài khoản ví (^[A-Z0-9]{6,19}$).
 *
 * @param {string} raw
 * @returns {{ valid: boolean, momoQrBin?: string, momoQrAccount?: string, momoQrRefLabel?: string|null, error?: string }}
 */
export function parseAndValidateMoMoQr(raw) {
  if (typeof raw !== 'string' || raw.length < 20) {
    return { valid: false, error: 'INVALID_QR_LENGTH' };
  }

  // 1. Kiểm tra checksum CRC-16
  if (!verifyVietQrChecksum(raw)) {
    return { valid: false, error: 'INVALID_CHECKSUM' };
  }

  // 2. Parse TLV
  const parsed = parseVietQR(raw);
  if (!parsed.valid) {
    return { valid: false, error: parsed.error || 'INVALID_VIETQR' };
  }

  // 3. Kiểm tra GUID Napas
  if (parsed.guid !== 'A000000727') {
    return { valid: false, error: 'INVALID_GUID' };
  }

  // 4. Kiểm tra BIN (6 số)
  if (!parsed.bin || !/^\d{6}$/.test(parsed.bin)) {
    return { valid: false, error: 'INVALID_BIN' };
  }

  // 5. Kiểm tra Số tài khoản (chữ in hoa và số, 6-19 ký tự)
  if (!parsed.accountNumber || !MOMO_QR_ACCOUNT_RE.test(parsed.accountNumber)) {
    return { valid: false, error: 'INVALID_ACCOUNT' };
  }

  let momoQrRefLabel = null;
  if (parsed.refLabel && MOMO_QR_REF_LABEL_RE.test(parsed.refLabel)) {
    momoQrRefLabel = parsed.refLabel;
  }

  return {
    valid: true,
    momoQrBin: parsed.bin,
    momoQrAccount: parsed.accountNumber,
    momoQrRefLabel,
    error: null,
  };
}

/**
 * Nạp lười thư viện jsQR và giải mã ảnh QR từ một File/Blob ảnh.
 *
 * @param {File|Blob} file
 * @returns {Promise<{ success: boolean, raw?: string, error?: string }>}
 */
export async function decodeQrFromImageFile(file) {
  if (!file) return { success: false, error: 'NO_FILE' };

  let jsQR;
  try {
    const mod = await import('jsqr');
    jsQR = mod.default || mod;
  } catch (err) {
    return { success: false, error: 'JSQR_LOAD_FAILED' };
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve({ success: false, error: 'CANVAS_CONTEXT_FAILED' });
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          const imageData = ctx.getImageData(0, 0, width, height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (!code || !code.data) {
            resolve({ success: false, error: 'NO_QR_IN_IMAGE' });
            return;
          }
          resolve({ success: true, raw: code.data });
        } catch (canvasErr) {
          resolve({ success: false, error: canvasErr.message || 'DECODE_ERROR' });
        }
      };
      img.onerror = () => resolve({ success: false, error: 'IMAGE_LOAD_FAILED' });
      img.src = e.target.result;
    };
    reader.onerror = () => resolve({ success: false, error: 'FILE_READ_FAILED' });
    reader.readAsDataURL(file);
  });
}

/** Format VND locale: 1.234.567 đ */
export function formatVnd(n) {
  return Number(n || 0).toLocaleString('vi-VN') + ' đ';
}

/** Format MM:SS cho countdown (vd: 14:32) */
export function formatCountdown(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const mm = Math.floor(s / 60).toString().padStart(2, '0');
  const ss = (s % 60).toString().padStart(2, '0');
  return `${mm}:${ss}`;
}
