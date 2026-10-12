import { formatVnd } from '../../../utils/vietqrParser';
import { parseVndPrice } from '../../../utils/parseVndPrice';

/**
 * Giá hiển thị trên thẻ sản phẩm của biểu mẫu (plan 12/10/2026).
 *
 * - Giá chính: biểu mẫu thu tiền với mục đích `order` thì LÀ số tiền khách sẽ trả (`payment.amount`); ngược lại là giá
 *   sản phẩm (`priceText` chủ shop gõ, rồi `priceAmount` định dạng VND). Với `hold` / `deposit` giá chính vẫn là giá
 *   sản phẩm — khoản giữ chỗ / đặt cọc đã có dòng thông báo riêng ở trang biểu mẫu.
 * - Giá gốc gạch ngang: `originalPrice` có chữ và khác giá chính.
 * - Nhãn `-X%`: CHỈ khi đọc được cả giá gốc lẫn giá chính thành số (`parseVndPrice`, không đoán) và giá gốc lớn hơn;
 *   làm tròn xuống.
 *
 * @param {{ product?: object|null, payment?: object|null }} input
 * @returns {{ priceLabel: string|null, originalPriceLabel: string|null, discountPercent: number|null }}
 */
export function buildProductPriceDisplay({ product, payment } = {}) {
  const empty = { priceLabel: null, originalPriceLabel: null, discountPercent: null };
  if (!product || typeof product !== 'object') return empty;

  const priceText = trimmedText(product.priceText);
  const productAmount = toFiniteNumber(product.priceAmount);
  const paymentAmount = toFiniteNumber(payment?.amount);
  const isOrderPayment = Boolean(payment?.enabled) && payment.purpose === 'order' && paymentAmount !== null && paymentAmount > 0;

  let priceLabel = null;
  let priceNumber = null;
  if (isOrderPayment) {
    priceLabel = formatVnd(paymentAmount);
    priceNumber = paymentAmount;
  } else if (priceText) {
    priceLabel = priceText;
    priceNumber = parseVndPrice(priceText);
  } else if (productAmount !== null) {
    priceLabel = formatVnd(productAmount);
    priceNumber = productAmount;
  }
  if (!priceLabel) return empty;

  const originalText = trimmedText(product.originalPrice);
  if (!originalText || sameText(originalText, priceLabel)) {
    return { priceLabel, originalPriceLabel: null, discountPercent: null };
  }

  const originalNumber = parseVndPrice(originalText);
  const bothKnown = originalNumber !== null && priceNumber !== null;
  // Đọc được cả hai số mà giá gốc không cao hơn thì gạch ngang chỉ gây hiểu nhầm → không hiện.
  if (bothKnown && originalNumber <= priceNumber) {
    return { priceLabel, originalPriceLabel: null, discountPercent: null };
  }

  let discountPercent = null;
  if (bothKnown && priceNumber > 0) {
    const percent = Math.floor(((originalNumber - priceNumber) / originalNumber) * 100);
    discountPercent = percent >= 1 ? percent : null;
  }
  return { priceLabel, originalPriceLabel: originalText, discountPercent };
}

/**
 * Tách "điểm nổi bật" (nhiều dòng) thành các gạch đầu dòng: bỏ dòng trống và ký hiệu đầu dòng người dùng tự gõ.
 *
 * @param {unknown} usp
 * @returns {string[]}
 */
export function splitProductUsp(usp) {
  if (typeof usp !== 'string') return [];
  return usp
    .split(/\r?\n/)
    // "- Tặng sách" / "• Hỗ trợ 1-1" bỏ ký hiệu; "-20% hôm nay" (gạch dính liền chữ) giữ nguyên.
    .map((line) => line.replace(/^\s*(?:[•✓✔]+\s*|[-–—*+]+\s+)/, '').trim())
    .filter(Boolean);
}

function trimmedText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function sameText(a, b) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
