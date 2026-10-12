// Cắt mô tả / điểm nổi bật như API công khai (backend `form.service.js` MAX_PUBLIC_PRODUCT_TEXT_LENGTH).
const MAX_PUBLIC_PRODUCT_TEXT_LENGTH = 1000;

function trimToNull(value) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text || null;
}

function truncateText(value) {
  const text = trimToNull(value);
  if (!text) return null;
  return text.length <= MAX_PUBLIC_PRODUCT_TEXT_LENGTH ? text : text.slice(0, MAX_PUBLIC_PRODUCT_TEXT_LENGTH);
}

function toHttpImageUrl(value) {
  const text = trimToNull(value);
  if (!text) return null;
  try {
    const { protocol } = new URL(text);
    return protocol === 'http:' || protocol === 'https:' ? text : null;
  } catch {
    return null;
  }
}

/**
 * Dựng `form.product` cho XEM TRƯỚC trong trình soạn từ một dòng danh sách sản phẩm (API trang Sản phẩm, dạng camelCase)
 * theo đúng quy tắc API công khai (backend `buildPublicFormProduct`): chỉ sản phẩm đang bán (status NULL/rỗng coi là
 * `active`, không phân biệt hoa thường), ảnh chỉ nhận http(s), chỉ 7 khoá, không lộ `productUrl` / `productCode` / id.
 * Lệch quy tắc này thì backend đúng — xem trước chỉ là bản nháp của thứ khách sẽ thấy.
 *
 * @param {object|null|undefined} option Phần tử của `productOptions` (`productName`, `price`, `priceAmount`, `originalPrice`...)
 * @returns {{ name: string, imageUrl: string|null, priceText: string|null, priceAmount: number|null,
 *   originalPrice: string|null, description: string|null, usp: string|null } | null}
 */
export function buildPreviewFormProduct(option) {
  if (!option || typeof option !== 'object') return null;
  const status = typeof option.status === 'string' ? option.status.trim().toLowerCase() : '';
  if ((status || 'active') !== 'active') return null;

  const rawAmount = option.priceAmount;
  const amount = rawAmount === null || rawAmount === undefined || rawAmount === '' ? null : Number(rawAmount);

  return {
    name: String(option.productName || '').trim(),
    imageUrl: toHttpImageUrl(option.thumbnailUrl),
    priceText: trimToNull(option.price),
    priceAmount: Number.isFinite(amount) ? amount : null,
    originalPrice: trimToNull(option.originalPrice),
    description: truncateText(option.description),
    usp: truncateText(option.usp),
  };
}
