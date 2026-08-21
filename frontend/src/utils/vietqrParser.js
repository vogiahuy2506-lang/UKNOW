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
  const result = { bin: null, accountNumber: null, serviceCode: null };

  while (offset < raw.length) {
    const sub = readTLV(raw, offset);
    if (!sub) break;
    if (sub.tag === '00') {
      // GUID Napas — chỉ kiểm, không lưu
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
  // raw = "01LL<BILL>08LL<PURPOSE>"
  let offset = 0;
  const result = { description: null };

  while (offset < raw.length) {
    const sub = readTLV(raw, offset);
    if (!sub) break;
    if (sub.tag === '08') {
      result.description = sub.value;
    }
    offset = sub.next;
  }

  return result;
}

export function parseVietQR(raw) {
  if (typeof raw !== 'string' || raw.length < 20) {
    return {
      bin: null,
      accountNumber: null,
      serviceCode: null,
      amount: null,
      currency: null,
      merchantName: null,
      description: null,
      valid: false,
      error: 'EMPTY_OR_INVALID',
    };
  }

  try {
    let offset = 0;
    const out = {
      bin: null,
      accountNumber: null,
      serviceCode: null,
      amount: null,
      currency: null,
      merchantName: null,
      description: null,
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
      bin: null,
      accountNumber: null,
      serviceCode: null,
      amount: null,
      currency: null,
      merchantName: null,
      description: null,
      valid: false,
      error: e?.message || 'PARSE_ERROR',
    };
  }
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
