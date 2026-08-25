import { describe, expect, it } from 'vitest';
import {
  buildCampaignBriefMarker,
  isCampaignBriefAnswersValid,
  isProductNameValid,
  isTopicTextValid,
} from '../campaignBrief.js';

describe('campaignBrief helpers', () => {
  it('validates name and topic like BE', () => {
    expect(isProductNameValid('a')).toBe(false);
    expect(isProductNameValid('AI')).toBe(true);
    expect(isTopicTextValid('x')).toBe(false);
    expect(isTopicTextValid('Cảm ơn đơn hàng')).toBe(true);
  });

  it('builds catalog marker with id only', () => {
    expect(buildCampaignBriefMarker({
      campaignBrief: 'single_product',
      campaignProduct: '12',
    })).toEqual({
      gate: 'campaignBrief',
      contentMode: 'single_product',
      productMode: 'catalog',
      productId: 12,
    });
  });

  it('builds other / multiple / custom markers', () => {
    expect(buildCampaignBriefMarker({
      campaignBrief: 'single_product',
      campaignProduct: 'other',
      productName: ' Shop ',
      productDescription: ' desc ',
    })).toMatchObject({
      productMode: 'other',
      productName: 'Shop',
      productDescription: 'desc',
    });
    expect(buildCampaignBriefMarker({ campaignBrief: 'multiple_products' })).toEqual({
      gate: 'campaignBrief',
      contentMode: 'multiple_products',
      productMode: 'catalog_set',
    });
    expect(buildCampaignBriefMarker({
      campaignBrief: 'custom_topic',
      topicText: ' Email cảm ơn ',
    })).toMatchObject({
      contentMode: 'custom_topic',
      topicText: 'Email cảm ơn',
    });
    expect(buildCampaignBriefMarker({
      campaignBrief: 'attached_file',
    })).toEqual({
      gate: 'campaignBrief',
      contentMode: 'attached_file',
      productMode: 'attached_file',
    });
  });

  it('validates answers for submit', () => {
    expect(isCampaignBriefAnswersValid({ campaignBrief: 'single_product' })).toBe(false);
    expect(isCampaignBriefAnswersValid({
      campaignBrief: 'single_product',
      campaignProduct: 'other',
      productName: 'A',
    })).toBe(false);
    expect(isCampaignBriefAnswersValid({
      campaignBrief: 'single_product',
      campaignProduct: 'other',
      productName: 'AI Course',
    })).toBe(true);
    expect(isCampaignBriefAnswersValid({
      campaignBrief: 'single_product',
      campaignProductIds: [1, 2],
    })).toBe(true);
    expect(isCampaignBriefAnswersValid({ campaignBrief: 'attached_file' })).toBe(true);
  });

  it('builds multi-product markers and summaries correctly', () => {
    expect(buildCampaignBriefMarker({
      campaignBrief: 'single_product',
      campaignProductIds: [10],
    })).toEqual({
      gate: 'campaignBrief',
      contentMode: 'single_product',
      productMode: 'catalog',
      productId: 10,
    });

    expect(buildCampaignBriefMarker({
      campaignBrief: 'multiple_products',
      campaignProductIds: [10],
    })).toEqual({
      gate: 'campaignBrief',
      contentMode: 'single_product',
      productMode: 'catalog',
      productId: 10,
    });

    expect(buildCampaignBriefMarker({
      campaignBrief: 'single_product',
      campaignProductIds: [10, 20, 30],
    })).toEqual({
      gate: 'campaignBrief',
      contentMode: 'multiple_products',
      productMode: 'catalog_set',
      productIds: [10, 20, 30],
    });
  });
});
