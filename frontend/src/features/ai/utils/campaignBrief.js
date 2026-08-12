export const PRODUCT_NAME_MIN = 2;
export const PRODUCT_NAME_MAX = 160;
export const PRODUCT_DESC_MAX = 2000;
export const TOPIC_MIN = 2;
export const TOPIC_MAX = 500;

export function isProductNameValid(name) {
  const text = String(name || '').trim();
  return text.length >= PRODUCT_NAME_MIN && text.length <= PRODUCT_NAME_MAX;
}

export function isProductDescriptionValid(description) {
  const text = String(description || '').trim();
  return text.length <= PRODUCT_DESC_MAX;
}

export function isTopicTextValid(topic) {
  const text = String(topic || '').trim();
  return text.length >= TOPIC_MIN && text.length <= TOPIC_MAX;
}

/**
 * Build wizard marker for campaignBrief gate.
 * Catalog: ID only (no labels). multiple_products: contentMode only (BE snapshots).
 */
export function buildCampaignBriefMarker(answers = {}) {
  const contentMode = answers.campaignBrief || answers.contentMode;
  if (!contentMode) return null;

  if (contentMode === 'single_product') {
    const productValue = answers.campaignProduct;
    if (productValue === 'other') {
      return {
        gate: 'campaignBrief',
        contentMode: 'single_product',
        productMode: 'other',
        productName: String(answers.productName || '').trim() || undefined,
        productDescription: String(answers.productDescription || '').trim() || undefined,
      };
    }
    const id = Number(productValue);
    if (!Number.isInteger(id) || id <= 0) return null;
    return {
      gate: 'campaignBrief',
      contentMode: 'single_product',
      productMode: 'catalog',
      productId: id,
    };
  }

  if (contentMode === 'multiple_products') {
    return {
      gate: 'campaignBrief',
      contentMode: 'multiple_products',
      productMode: 'catalog_set',
    };
  }

  if (contentMode === 'custom_topic') {
    return {
      gate: 'campaignBrief',
      contentMode: 'custom_topic',
      productMode: 'context',
      topicText: String(answers.topicText || '').trim() || undefined,
    };
  }

  return null;
}

export function isCampaignBriefAnswersValid(answers = {}, question = null) {
  const contentMode = answers.campaignBrief || answers.contentMode;
  if (!contentMode) return false;

  if (contentMode === 'single_product') {
    const productValue = answers.campaignProduct;
    if (!productValue) return false;
    if (productValue === 'other') {
      return isProductNameValid(answers.productName)
        && isProductDescriptionValid(answers.productDescription);
    }
    const id = Number(productValue);
    return Number.isInteger(id) && id > 0;
  }

  if (contentMode === 'multiple_products') {
    const courseOptions = question?.courseOptions || [];
    const catalogCount = courseOptions.filter((o) => o.value !== 'other').length;
    return catalogCount >= 2;
  }

  if (contentMode === 'custom_topic') {
    return isTopicTextValid(answers.topicText);
  }

  return false;
}

export function buildCampaignBriefSummaryLine(answers = {}, question = null) {
  const contentMode = answers.campaignBrief || answers.contentMode;
  const opt = (question?.options || []).find((o) => o.value === contentMode);
  if (contentMode === 'single_product') {
    if (answers.campaignProduct === 'other') {
      const desc = String(answers.productDescription || '').trim();
      return `${question?.label || ''} ${String(answers.productName || '').trim()}${desc ? ` — ${desc}` : ''}`.trim();
    }
    const course = (question?.courseOptions || []).find((o) => String(o.value) === String(answers.campaignProduct));
    return `${question?.label || ''} ${course?.label || answers.campaignProduct}`.trim();
  }
  if (contentMode === 'custom_topic') {
    return `${question?.label || ''} ${String(answers.topicText || '').trim()}`.trim();
  }
  return `${question?.label || ''} ${opt?.label || contentMode}`.trim();
}
