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

  it('value sản phẩm do LLM viết không phải id số → rơi về other với tên lấy từ nhãn, không gửi catalog rỗng', () => {
    // Lỗi thật 09/09: model trả value là slug/tên thay vì <id> số → productMode 'catalog' +
    // productId null → backend 400 "productId không hợp lệ". Nay phải là 'other' + productName.
    const questions = [{
      id: 'product',
      options: [
        { value: 'khoa-hoc-lap-trinh-frontend', label: '🎓 Khoá học lập trình frontend (Lập trình cho người mất gốc)' },
        { value: 'other', label: '🔧 Sản phẩm khác' },
      ],
    }];
    expect(buildLandingBriefFromAnswers({
      answers: { product: 'khoa-hoc-lap-trinh-frontend', pageGoal: 'lead' },
      questions,
    })).toMatchObject({
      productMode: 'other',
      productId: null,
      productName: 'Khoá học lập trình frontend (Lập trình cho người mất gốc)',
    });
    // Không tìm thấy nhãn → dùng chính value làm tên, vẫn không phải catalog.
    expect(buildLandingBriefFromAnswers({
      answers: { product: 'Tên do model tự đặt' },
      questions: [{ id: 'product', options: [] }],
    })).toMatchObject({ productMode: 'other', productId: null, productName: 'Tên do model tự đặt' });
    // id số vẫn đi catalog như cũ (hồi quy).
    expect(buildLandingBriefFromAnswers({
      answers: { product: '7' },
      questions: [{ id: 'product', options: [{ value: '7', label: 'X' }] }],
    })).toMatchObject({ productMode: 'catalog', productId: 7, productName: null });
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
