export const OTHER_PRODUCT_NAME_MIN = 2;
export const OTHER_PRODUCT_NAME_MAX = 160;
export const OTHER_PRODUCT_DESC_MAX = 2000;

export function isOtherProductNameValid(name) {
  const text = String(name || '').trim();
  return text.length >= OTHER_PRODUCT_NAME_MIN && text.length <= OTHER_PRODUCT_NAME_MAX;
}

export function isOtherProductDescriptionValid(description) {
  const text = String(description || '').trim();
  return text.length <= OTHER_PRODUCT_DESC_MAX;
}

export function buildLandingBriefFromAnswers({
  answers = {},
  questions = [],
  contentLocale = null,
  locale = 'vi',
} = {}) {
  const hasProductQuestion = questions.some((q) => q.id === 'product');
  let productMode = 'context';
  let productId = null;
  let productName = null;
  let productDescription = null;

  if (hasProductQuestion) {
    if (answers.product === 'other') {
      productMode = 'other';
      productName = String(answers.productName || '').trim() || null;
      productDescription = String(answers.productDescription || '').trim() || null;
    } else if (answers.product) {
      const id = Number(answers.product);
      if (Number.isInteger(id) && id > 0) {
        productMode = 'catalog';
        productId = id;
      } else {
        // Thẻ ask_landing_details do LLM sinh; prompt dặn value là <id> số nhưng model có thể
        // viết tên/slug. Trước đây nhánh này vẫn đặt productMode 'catalog' với productId null
        // → backend 400 "productId không hợp lệ" (sếp gặp 09/09 lúc nghiệm thu PR-2d-1).
        // Rơi về 'other' với tên lấy từ nhãn lựa chọn: backend đi đường tên sản phẩm, không
        // cần id. Bỏ emoji/ký hiệu đầu nhãn để tên sạch.
        const option = questions
          .find((q) => q.id === 'product')?.options
          ?.find((opt) => String(opt?.value) === String(answers.product));
        const label = String(option?.label || answers.product || '')
          .replace(/^[^\p{L}\p{N}]+/u, '')
          .trim();
        productMode = 'other';
        productName = label || null;
      }
    }
  }

  const formPreset = answers.formFields || 'basic';
  const semanticLocale = contentLocale === 'en' || contentLocale === 'vi'
    ? contentLocale
    : (locale === 'en' ? 'en' : 'vi');
  return {
    version: 1,
    source: 'assistant_wizard',
    productMode,
    productId,
    productName,
    productDescription,
    pageGoal: answers.pageGoal || null,
    targetAudience: answers.targetAudience || null,
    formFields: {
      preset: formPreset,
      customText: formPreset === 'custom'
        ? (String(answers.customFields || '').trim() || null)
        : null,
    },
    contentLocale: semanticLocale,
  };
}
