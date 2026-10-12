import { useState } from 'react';
import { HiOutlineCheck } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import { buildProductPriceDisplay, splitProductUsp } from '../utils/productPriceDisplay.util';

// Mô tả dài hơn ngưỡng này (hoặc quá 4 dòng) thì thu gọn 4 dòng kèm nút "Xem thêm".
const DESCRIPTION_COLLAPSE_CHARS = 220;
const DESCRIPTION_COLLAPSE_LINES = 4;

/**
 * Thẻ sản phẩm trên biểu mẫu công khai (plan 12/10/2026): ảnh, tên, giá, giá gốc gạch ngang, nhãn giảm %, điểm nổi bật,
 * mô tả — lấy thẳng từ trang Sản phẩm qua `form.product` (API công khai đã whitelist; bản xem trước trong trình soạn dựng
 * cùng hình dạng).
 *
 * Biểu mẫu LUÔN sáng → không dùng lớp `dark:`; màu chủ đạo theo `--form-primary` mà FormRenderer đặt trên gốc.
 *
 * @param {object} props
 * @param {object|null} props.product `{ name, imageUrl, priceText, priceAmount, originalPrice, description, usp }`
 * @param {string} [props.formTitle] Tiêu đề biểu mẫu — tên sản phẩm trùng tiêu đề (không phân biệt hoa thường) thì ẩn để khỏi lặp
 * @param {object|null} [props.payment] `form.payment` — mục đích `order` thì giá chính là số tiền khách sẽ trả
 * @param {string} [props.className]
 */
export default function ProductShowcase({ product, formTitle = '', payment = null, className = '' }) {
  const { t } = useI18n();
  // Nhớ URL ảnh đã lỗi (không phải cờ boolean): đổi sang sản phẩm khác trong xem trước thì ảnh mới được thử lại.
  const [failedImageUrl, setFailedImageUrl] = useState(null);
  const [expanded, setExpanded] = useState(false);

  if (!product || typeof product !== 'object') return null;

  const name = typeof product.name === 'string' ? product.name.trim() : '';
  const showName = Boolean(name) && name.toLowerCase() !== String(formTitle || '').trim().toLowerCase();
  const imageUrl = typeof product.imageUrl === 'string' ? product.imageUrl.trim() : '';
  const showImage = Boolean(imageUrl) && failedImageUrl !== imageUrl;
  const { priceLabel, originalPriceLabel, discountPercent } = buildProductPriceDisplay({ product, payment });
  const usp = splitProductUsp(product.usp);
  const description = typeof product.description === 'string' ? product.description.trim() : '';
  const isLongDescription =
    description.length > DESCRIPTION_COLLAPSE_CHARS || description.split(/\r?\n/).length > DESCRIPTION_COLLAPSE_LINES;

  // Không còn gì để hiện (vd. chỉ có tên mà tên trùng tiêu đề) → không dựng khung rỗng.
  if (!showImage && !showName && !priceLabel && usp.length === 0 && !description) return null;

  return (
    <section data-testid="product-showcase" className={`min-w-0 ${className}`}>
      {showImage && (
        <img
          data-testid="product-showcase-image"
          src={imageUrl}
          alt={name}
          className="w-full aspect-[4/3] object-cover rounded-xl bg-gray-100"
          onError={() => setFailedImageUrl(imageUrl)}
        />
      )}

      <div className={showImage ? 'mt-4 space-y-3' : 'space-y-3'}>
        {showName && (
          <h2 data-testid="product-showcase-name" className="text-lg sm:text-xl font-bold text-gray-900 break-words">
            {name}
          </h2>
        )}

        {priceLabel && (
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span
              data-testid="product-showcase-price"
              className="text-2xl sm:text-3xl font-bold text-[color:var(--form-primary,#df5c0e)] break-words"
            >
              {priceLabel}
            </span>
            {originalPriceLabel && (
              <span data-testid="product-showcase-original-price" className="text-sm text-gray-400 line-through break-words">
                {originalPriceLabel}
              </span>
            )}
            {discountPercent !== null && (
              <span
                data-testid="product-showcase-discount"
                className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold bg-[color:var(--form-primary,#df5c0e)] text-[color:var(--form-primary-text,#ffffff)]"
              >
                -{discountPercent}%
              </span>
            )}
          </div>
        )}

        {usp.length > 0 && (
          <ul data-testid="product-showcase-usp" className="space-y-1.5">
            {usp.map((line, index) => (
              <li key={`${index}-${line}`} className="flex items-start gap-2 text-sm text-gray-700">
                <HiOutlineCheck
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-[color:var(--form-primary,#df5c0e)]"
                />
                <span className="min-w-0 break-words">{line}</span>
              </li>
            ))}
          </ul>
        )}

        {description && (
          <div>
            <p
              data-testid="product-showcase-description"
              className={`text-sm text-gray-600 whitespace-pre-line break-words leading-relaxed ${
                isLongDescription && !expanded ? 'line-clamp-4' : ''
              }`}
            >
              {description}
            </p>
            {isLongDescription && (
              <button
                type="button"
                data-testid="product-showcase-more"
                aria-expanded={expanded}
                onClick={() => setExpanded((prev) => !prev)}
                className="mt-1 text-sm font-medium text-[color:var(--form-primary,#df5c0e)] hover:underline"
              >
                {expanded ? t('publicForm.product.showLess') : t('publicForm.product.showMore')}
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
