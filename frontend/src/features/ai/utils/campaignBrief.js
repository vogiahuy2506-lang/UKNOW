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
 * Catalog: single_product (1 ID) or multiple_products (>= 2 IDs).
 */
export function buildCampaignBriefMarker(answers = {}) {
  const contentMode = answers.campaignBrief || answers.contentMode;
  if (!contentMode) return null;

  if (contentMode === 'single_product' || contentMode === 'products') {
    const productValue = answers.campaignProduct;
    const productIds = Array.isArray(answers.campaignProductIds)
      ? answers.campaignProductIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : [];

    if (productValue === 'other') {
      return {
        gate: 'campaignBrief',
        contentMode: 'single_product',
        productMode: 'other',
        productName: String(answers.productName || '').trim() || undefined,
        productDescription: String(answers.productDescription || '').trim() || undefined,
      };
    }

    if (productIds.length >= 2) {
      return {
        gate: 'campaignBrief',
        contentMode: 'multiple_products',
        productMode: 'catalog_set',
        productIds,
      };
    }

    const singleId = productIds.length === 1 ? productIds[0] : Number(productValue);
    if (!Number.isInteger(singleId) || singleId <= 0) return null;
    return {
      gate: 'campaignBrief',
      contentMode: 'single_product',
      productMode: 'catalog',
      productId: singleId,
    };
  }

  if (contentMode === 'multiple_products') {
    const productIds = Array.isArray(answers.campaignProductIds)
      ? answers.campaignProductIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : [];
    if (productIds.length === 1) {
      return {
        gate: 'campaignBrief',
        contentMode: 'single_product',
        productMode: 'catalog',
        productId: productIds[0],
      };
    }
    return {
      gate: 'campaignBrief',
      contentMode: 'multiple_products',
      productMode: 'catalog_set',
      ...(productIds.length > 0 ? { productIds } : {}),
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

  if (contentMode === 'attached_file') {
    return {
      gate: 'campaignBrief',
      contentMode: 'attached_file',
      productMode: 'attached_file',
    };
  }

  return null;
}

export function isCampaignBriefAnswersValid(answers = {}, _question = null) {
  const contentMode = answers.campaignBrief || answers.contentMode;
  if (!contentMode) return false;

  if (contentMode === 'single_product' || contentMode === 'products') {
    if (answers.campaignProduct === 'other') {
      return isProductNameValid(answers.productName)
        && isProductDescriptionValid(answers.productDescription);
    }
    const productIds = Array.isArray(answers.campaignProductIds)
      ? answers.campaignProductIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : [];
    if (productIds.length >= 1) return true;
    const id = Number(answers.campaignProduct);
    return Number.isInteger(id) && id > 0;
  }

  if (contentMode === 'multiple_products') {
    return true;
  }

  if (contentMode === 'custom_topic') {
    return isTopicTextValid(answers.topicText);
  }

  if (contentMode === 'attached_file') {
    return true;
  }

  return false;
}

export function buildCampaignBriefSummaryLine(answers = {}, question = null) {
  const contentMode = answers.campaignBrief || answers.contentMode;
  const opt = (question?.options || []).find((o) => o.value === contentMode);
  if (contentMode === 'single_product' || contentMode === 'products') {
    if (answers.campaignProduct === 'other') {
      const desc = String(answers.productDescription || '').trim();
      return `${question?.label || ''} ${String(answers.productName || '').trim()}${desc ? ` — ${desc}` : ''}`.trim();
    }
    const productIds = Array.isArray(answers.campaignProductIds)
      ? answers.campaignProductIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
      : (Number.isInteger(Number(answers.campaignProduct)) && Number(answers.campaignProduct) > 0 ? [Number(answers.campaignProduct)] : []);

    if (productIds.length === 1) {
      const course = (question?.courseOptions || []).find((o) => String(o.value) === String(productIds[0]));
      return `${question?.label || ''} ${course?.label || productIds[0]}`.trim();
    }
    if (productIds.length >= 2) {
      const names = productIds
        .map((id) => (question?.courseOptions || []).find((o) => String(o.value) === String(id))?.label || `#${id}`);
      const shown = names.slice(0, 3).join(', ');
      const extra = names.length > 3 ? ` và ${names.length - 3} sản phẩm khác` : '';
      return `${question?.label || ''} ${shown}${extra}`.trim();
    }
  }
  if (contentMode === 'custom_topic') {
    const topic = String(answers.topicText || '').trim();
    return `${question?.label || ''} ${opt?.label || contentMode}${topic ? ` — ${topic}` : ''}`.trim();
  }
  if (contentMode === 'attached_file') {
    return `${question?.label || ''} Dùng dữ liệu từ file đính kèm`.trim();
  }
  return `${question?.label || ''} ${opt?.label || contentMode}`.trim();
}
