/**
 * Đọc giá hiển thị của sản phẩm ("500k", "1,5tr", "1.200.000đ", "Miễn phí"...) thành SỐ đồng (VND).
 * KHÔNG ĐOÁN: chuỗi mơ hồ ("liên hệ", "từ 500k", "500k-1tr", "1.5", "500") trả `null` — số sai tệ hơn không có số
 * (nó được tự điền vào ô số tiền thanh toán của biểu mẫu và in cho chatbot).
 *
 * Nhận:
 *   - Miễn phí: "miễn phí" / "mien phi" / "free" / "0" / "0đ" → 0
 *   - Hậu tố nghìn: k, nghìn, ngàn ("500k", "1,5k")          → × 1.000
 *   - Hậu tố triệu: tr, triệu, m ("1tr", "1,5tr", "1.5 triệu") → × 1.000.000
 *   - Số đủ ngàn: "1.200.000", "1,200,000", "990000", "990.000 VNĐ", "990.000đ"
 * Đơn vị tiền ở cuối (đ, ₫, vnd, vnđ, đồng, dong) được bỏ trước khi đọc.
 *
 * FE có bản sao cùng thuật toán tại `frontend/src/utils/parseVndPrice.js` — sửa cả hai.
 *
 * @param {unknown} text
 * @returns {number|null} số nguyên >= 0, hoặc null nếu không chắc
 */
export function parseVndPrice(text) {
  if (text === undefined || text === null) return null;
  let s = String(text).trim().toLowerCase();
  if (!s) return null;

  // Bỏ dấu tiếng Việt để so khớp từ khoá (đ → d trước khi bỏ dấu tổ hợp).
  const plain = s.replace(/đ/g, 'd').normalize('NFD').replace(/\p{M}/gu, '');
  // Mơ hồ: khoảng giá, "từ/khoảng/chỉ từ...", liên hệ — không đoán.
  if (/[-–—~/]|\bden\b|\btu\b|\bkhoang\b|\blien he\b|\bthoa thuan\b|\bsau\b|\bva\b|\bhoac\b|\bor\b|\bto\b|\bfrom\b/.test(plain)) {
    return null;
  }

  s = plain
    .replace(/₫/g, '')
    .replace(/\s*(vnd|dong|d)\s*$/, '')
    .replace(/\s+/g, '')
    .trim();
  if (!s) return null;
  if (/^(mienphi|free|0)$/.test(s)) return 0;

  const unit = /^(\d+(?:[.,]\d+)?)(k|nghin|ngan|tr|trieu|m)$/.exec(s);
  if (unit) {
    // "1.500k" / "2,500k": người Việt dùng dấu chấm ngăn hàng nghìn (= 1.500.000đ) nhưng cũng có người viết 1.5k = 1.500đ
    // — đúng 3 chữ số sau dấu thì không biết là phần nghìn hay phần lẻ → không đoán.
    if (/[.,]\d{3}$/.test(unit[1])) return null;
    const factor = unit[2] === 'k' || unit[2] === 'nghin' || unit[2] === 'ngan' ? 1000 : 1000000;
    const n = Number(unit[1].replace(',', '.'));
    if (!Number.isFinite(n)) return null;
    const value = Math.round(n * factor);
    return value >= 0 && value <= 1e12 ? value : null;
  }

  // Số đủ chữ số: nhóm 3 chữ số ngăn bằng . hoặc , ("1.200.000", "1,200,000") hoặc liền một mạch ("990000").
  if (/^\d{1,3}([.,]\d{3})+$/.test(s)) {
    const value = Number(s.replace(/[.,]/g, ''));
    return value >= 1000 && value <= 1e12 ? value : null;
  }
  if (/^\d+$/.test(s)) {
    const value = Number(s);
    // 1–999 không rõ là đồng hay nghìn ("500" = 500đ hay 500k?) → không đoán.
    return value >= 1000 && value <= 1e12 ? value : null;
  }
  return null;
}
