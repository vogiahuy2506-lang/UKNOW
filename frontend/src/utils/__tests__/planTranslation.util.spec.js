import { describe, expect, it } from 'vitest';
import vi from '../../i18n/vi.js';
import en from '../../i18n/en.js';
import {
  getTranslatedPlanDescription,
  getTranslatedFeature,
  getPlanTranslationKey,
} from '../planTranslation.util.js';

const makeT = (dict) => (key, params) => {
  const parts = key.split('.');
  let val = dict;
  for (const part of parts) {
    val = val?.[part];
  }
  if (typeof val === 'string' && params) {
    return val.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? `{${k}}`);
  }
  return typeof val === 'string' ? val : key;
};

const tEn = makeT(en);
const tVi = makeT(vi);

describe('planTranslation.util - plan descriptions', () => {
  it('translates known default plan descriptions to English', () => {
    // Starter
    const starterPlan = {
      code: 'starter',
      description: 'Gói cơ bản dành cho cá nhân và freelancer quản lý khách hàng',
    };
    expect(getTranslatedPlanDescription(starterPlan, tEn, 'en')).toBe(
      'Essential plan for individuals and freelancers managing customers'
    );
    expect(getTranslatedPlanDescription(starterPlan, tVi, 'vi')).toBe(
      'Gói cơ bản dành cho cá nhân và freelancer quản lý khách hàng'
    );

    // Trial
    const trialPlan = {
      code: 'trial',
      description: 'Trải nghiệm đầy đủ tính năng trong 14 ngày. Không cần thẻ tín dụng.',
    };
    expect(getTranslatedPlanDescription(trialPlan, tEn, 'en')).toBe(
      'Experience full features for 14 days. No credit card required.'
    );

    // Basic
    const basicPlan = {
      code: 'basic',
      description: 'Gói Basic dành cho shop nhỏ và doanh nghiệp vừa phải mở rộng quy mô tiếp cận khách hàng.',
    };
    expect(getTranslatedPlanDescription(basicPlan, tEn, 'en')).toBe(
      'Basic plan for small shops and medium businesses to expand customer outreach.'
    );

    // Pro
    const proPlan = {
      code: 'professional',
      description: 'Gói Professional dành cho doanh nghiệp vừa cần quản lý đa kênh chuyên nghiệp.',
    };
    expect(getTranslatedPlanDescription(proPlan, tEn, 'en')).toBe(
      'Professional plan for medium businesses needing professional omnichannel management.'
    );

    // Enterprise
    const enterprisePlan = {
      code: 'enterprise',
      description: 'Gói Enterprise không giới hạn dành cho tổ chức lớn với nhu cầu cao cấp.',
    };
    expect(getTranslatedPlanDescription(enterprisePlan, tEn, 'en')).toBe(
      'Unlimited Enterprise plan for large organizations with advanced needs.'
    );
  });

  it('preserves custom descriptions entered by admins', () => {
    const customAdminPlan = {
      code: 'starter',
      description: 'Mô tả riêng do admin viết cho chương trình khuyến mãi tháng 9',
    };
    expect(getTranslatedPlanDescription(customAdminPlan, tEn, 'en')).toBe(
      'Mô tả riêng do admin viết cho chương trình khuyến mãi tháng 9'
    );
  });

  it('supports bilingual object or JSON descriptions', () => {
    const bilingualPlan = {
      code: 'custom',
      description: {
        vi: 'Mô tả tiếng Việt tùy chỉnh',
        en: 'Custom English description',
      },
    };
    expect(getTranslatedPlanDescription(bilingualPlan, tEn, 'en')).toBe('Custom English description');
    expect(getTranslatedPlanDescription(bilingualPlan, tVi, 'vi')).toBe('Mô tả tiếng Việt tùy chỉnh');

    const jsonPlan = {
      code: 'custom',
      description: JSON.stringify({
        vi: 'Mô tả JSON tiếng Việt',
        en: 'JSON English description',
      }),
    };
    expect(getTranslatedPlanDescription(jsonPlan, tEn, 'en')).toBe('JSON English description');
    expect(getTranslatedPlanDescription(jsonPlan, tVi, 'vi')).toBe('Mô tả JSON tiếng Việt');
  });
});

describe('planTranslation.util - features translation', () => {
  it('translates Enterprise untranslated features to English', () => {
    expect(getTranslatedFeature('Không giới hạn tin nhắn Zalo/Tháng', tEn)).toBe(
      'Unlimited Zalo messages/month'
    );
    expect(getTranslatedFeature('Không giới hạn tin nhắn Email/Tháng', tEn)).toBe(
      'Unlimited emails/month'
    );
    expect(getTranslatedFeature('Không giới hạn tài khoản Email', tEn)).toBe(
      'Unlimited email accounts'
    );
    expect(getTranslatedFeature('Không giới hạn tài khoản Zalo', tEn)).toBe(
      'Unlimited Zalo accounts'
    );
    expect(getTranslatedFeature('Không giới hạn mẫu template Email', tEn)).toBe(
      'Unlimited Email templates'
    );
    expect(getTranslatedFeature('Không giới hạn mẫu template Tin nhắn', tEn)).toBe(
      'Unlimited message templates'
    );
    expect(getTranslatedFeature('Xuất hóa đơn VAT', tEn)).toBe('VAT invoice export');
  });

  it('translates features from English back to Vietnamese', () => {
    expect(getTranslatedFeature('Unlimited Zalo messages/month', tVi)).toBe(
      'Không giới hạn tin nhắn Zalo/Tháng'
    );
    expect(getTranslatedFeature('Unlimited emails/month', tVi)).toBe(
      'Không giới hạn tin nhắn Email/Tháng'
    );
    expect(getTranslatedFeature('VAT invoice export', tVi)).toBe('Xuất hóa đơn VAT');
  });

  it('translates regex template features correctly in both languages', () => {
    expect(getTranslatedFeature('25,000 tin Zalo/tháng', tEn)).toBe('25,000 Zalo messages/month');
    expect(getTranslatedFeature('60,000 email/tháng', tEn)).toBe('60,000 emails/month');
    expect(getTranslatedFeature('5 tài khoản Email', tEn)).toBe('5 email account(s)');
    expect(getTranslatedFeature('30 Landing pages', tEn)).toBe('30 landing pages');
  });

  it('resolves plan translation key properly', () => {
    expect(getPlanTranslationKey({ code: 'professional' })).toBe('pro');
    expect(getPlanTranslationKey({ code: 'starter' })).toBe('starter');
    expect(getPlanTranslationKey({ name: 'Gói Tùy chọn' })).toBe('custom');
  });
});
