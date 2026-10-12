import { useI18n } from '../../../../../i18n';

/**
 * Tab "Sản phẩm" của modal Cài đặt: gắn biểu mẫu với một sản phẩm. Gắn xong biểu mẫu tự hiện thẻ sản phẩm cho khách
 * (công tắc bên dưới ô chọn tắt được) và trang Sản phẩm đếm Đăng ký / Đã trả / Doanh thu.
 *
 * `showProductCard` / `onShowProductCardChange`: công tắc "Hiện thẻ sản phẩm" (settings.showProductCard, mặc định bật).
 */
export default function ProductTab({
  productId,
  productOptions,
  selectedProduct,
  selectedProductAmount,
  onProductChange,
  payment,
  setPayment,
  isEmployee,
  showProductCard = true,
  onShowProductCardChange,
}) {
  const { t } = useI18n();

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-dk-text2">{t('forms.editorPage.product.help')}</p>
      <select
        data-testid="form-product-select"
        aria-label={t('forms.editorPage.product.title')}
        value={productId}
        onChange={onProductChange}
        className="w-full rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-bg px-4 py-2.5 text-sm font-medium text-slate-900 dark:text-dk-text focus:outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 shadow-2xs transition"
      >
        <option value="">{t('forms.editorPage.product.none')}</option>
        {productId !== '' && !productOptions.some((p) => String(p.id) === productId) && (
          <option value={productId}>{t('forms.editorPage.product.currentOption', { id: productId })}</option>
        )}
        {productOptions.map((p) => (
          <option key={p.id} value={String(p.id)}>
            {p.productName}
          </option>
        ))}
      </select>
      {productId !== '' && (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 dark:border-dk-border px-3.5 py-3">
          <div>
            <div className="text-sm font-semibold text-slate-800 dark:text-dk-text">{t('forms.editorPage.product.showCardLabel')}</div>
            <p className="text-xs text-slate-500 dark:text-dk-text2 mt-0.5">{t('forms.editorPage.product.showCardHint')}</p>
          </div>
          <input
            type="checkbox"
            data-testid="form-product-show-card"
            aria-label={t('forms.editorPage.product.showCardLabel')}
            checked={showProductCard}
            onChange={(e) => onShowProductCardChange?.(e.target.checked)}
            className="mt-1 h-4 w-4 rounded text-teal-600 dark:text-teal-400 focus:ring-teal-500 border-slate-300 dark:border-dk-border-strong"
          />
        </div>
      )}
      {payment.enabled && selectedProductAmount !== null ? (
        <p data-testid="form-product-price-hint" className="text-xs text-slate-600 dark:text-dk-text bg-violet-50/60 dark:bg-violet-950/30 p-2.5 rounded-xl border border-violet-100 dark:border-violet-900/50">
          {t('forms.editorPage.product.priceHintAmount', { price: `${selectedProductAmount.toLocaleString('vi-VN')} đ` })}{' '}
          {!isEmployee && payment.amount && Number(payment.amount) !== selectedProductAmount ? (
            <button
              type="button"
              data-testid="form-product-use-price"
              className="text-violet-600 dark:text-violet-400 font-semibold hover:underline ml-1"
              onClick={() => setPayment((prev) => ({ ...prev, amount: String(selectedProductAmount) }))}
            >
              {t('forms.editorPage.product.usePrice', { price: `${selectedProductAmount.toLocaleString('vi-VN')} đ` })}
            </button>
          ) : null}
        </p>
      ) : payment.enabled && selectedProduct?.price ? (
        <p data-testid="form-product-price-hint" className="text-xs text-slate-600 dark:text-dk-text bg-violet-50/60 dark:bg-violet-950/30 p-2.5 rounded-xl border border-violet-100 dark:border-violet-900/50">
          {t('forms.editorPage.product.priceHint', { price: selectedProduct.price })}
        </p>
      ) : null}
    </div>
  );
}
