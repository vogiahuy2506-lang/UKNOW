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
      productMode = 'catalog';
      const id = Number(answers.product);
      productId = Number.isFinite(id) && id > 0 ? id : null;
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
