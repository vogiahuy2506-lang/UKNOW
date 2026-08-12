import { describe, expect, it } from 'vitest';
import {
  buildLandingBriefFromAnswers,
  isOtherProductDescriptionValid,
  isOtherProductNameValid,
} from '../landingBrief.js';

describe('landingBrief helpers', () => {
  it('validates other product name/description like BE', () => {
    expect(isOtherProductNameValid('')).toBe(false);
    expect(isOtherProductNameValid('a')).toBe(false);
    expect(isOtherProductNameValid('AI')).toBe(true);
    expect(isOtherProductNameValid('x'.repeat(161))).toBe(false);
    expect(isOtherProductDescriptionValid('x'.repeat(2000))).toBe(true);
    expect(isOtherProductDescriptionValid('x'.repeat(2001))).toBe(false);
  });

  it('builds catalog brief without option labels', () => {
    expect(buildLandingBriefFromAnswers({
      answers: { product: '12', pageGoal: 'lead', formFields: 'basic' },
      questions: [{ id: 'product' }],
      locale: 'vi',
    })).toMatchObject({
      productMode: 'catalog',
      productId: 12,
      productName: null,
      pageGoal: 'lead',
    });
  });

  it('builds other/context modes', () => {
    expect(buildLandingBriefFromAnswers({
      answers: { product: 'other', productName: ' Shop AI ', productDescription: ' desc ' },
      questions: [{ id: 'product' }],
    })).toMatchObject({
      productMode: 'other',
      productName: 'Shop AI',
      productDescription: 'desc',
    });
    expect(buildLandingBriefFromAnswers({
      answers: { pageGoal: 'trial' },
      questions: [{ id: 'pageGoal' }],
      locale: 'en',
    })).toMatchObject({
      productMode: 'context',
      contentLocale: 'en',
      pageGoal: 'trial',
    });
  });

  it('prefers semantic contentLocale over UI locale', () => {
    expect(buildLandingBriefFromAnswers({
      answers: { pageGoal: 'lead' },
      questions: [],
      contentLocale: 'vi',
      locale: 'en',
    }).contentLocale).toBe('vi');
  });
});
