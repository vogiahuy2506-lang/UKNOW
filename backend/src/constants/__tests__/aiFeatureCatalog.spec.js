import { describe, expect, it } from '@jest/globals';
import {
  AI_FEATURE_GROUPS,
  AI_FEATURE_GROUP_BY_CODE,
  resolveAiFeatureGroup,
  groupCountsAsCall,
  groupCountsAsCustomerUse,
} from '../aiFeatureCatalog.js';

describe('aiFeatureCatalog - ma tinh nang -> nhom (PR-8)', () => {
  // Ghim TUNG ma: bot mot dong khoi bang phai do (bai hoc bang hang so, 30/09).
  const EXPECTED = {
    chatbot_reply: 'chatbot',
    kb_chat: 'chatbot',
    smart_chat: 'assistant',
    landing_page: 'landing',
    landing_template: 'landing',
    campaign_script: 'campaign',
    campaign_registry: 'campaign',
    dashboard_insights: 'insights',
    inbox_ai_summary: 'insights',
    // PR-12: ba duong tung "vo hinh" (Google tinh tien nhung khong ghi usage)
    campaign_slots: 'campaign', // dien noi dung chien dich bang LLM (slot filler)
    kb_ocr: 'embedding', // doc chu trong anh / PDF quet khi nap tai lieu: "Nap tai lieu (khong tinh luot)"
    hero_consultation: 'hero', // chat tu van trang chu cho khach vang lai (id_user NULL)
  };

  it.each(Object.entries(EXPECTED))('%s -> %s', (code, group) => {
    expect(resolveAiFeatureGroup(code)).toBe(group);
  });

  it('bang chi co dung 12 ma da biet (them ma moi phai cap nhat ca test nay)', () => {
    expect(AI_FEATURE_GROUP_BY_CODE).toEqual(EXPECTED);
  });

  it('nhom tro giup: moi ma help_* (route/answer/answer_soft/plan_advice/translate)', () => {
    for (const code of ['help_route', 'help_answer', 'help_answer_soft', 'help_plan_advice', 'help_translate']) {
      expect(resolveAiFeatureGroup(code)).toBe('help');
    }
  });

  it('embedding: theo tien to "embedding" cua ma HOAC kind = embedding', () => {
    for (const code of [
      'embedding', 'embedding_rag_query', 'embedding_kb_ingest', 'embedding_custom_chat_doc',
      'embedding_business_profile', 'embedding_help',
    ]) {
      expect(resolveAiFeatureGroup(code)).toBe('embedding');
    }
    // dong khong co ma nhung kind = embedding
    expect(resolveAiFeatureGroup('_unknown', 'embedding')).toBe('embedding');
    expect(resolveAiFeatureGroup('', 'embedding')).toBe('embedding');
  });

  it('ma la / rong / null roi ve "other" - khong ném, khong mat chi phi', () => {
    for (const code of ['tinh_nang_moi', '_unknown', '', null, undefined]) {
      expect(resolveAiFeatureGroup(code)).toBe('other');
    }
    expect(resolveAiFeatureGroup('smart_chat', 'generate')).toBe('assistant');
  });

  it('chi nap tai lieu (embedding, OCR) khong phai "luot goi"; nap tai lieu, tro giup, chat trang chu khong tinh la "khach dang dung AI"', () => {
    for (const group of Object.values(AI_FEATURE_GROUPS)) {
      expect(groupCountsAsCall(group)).toBe(group !== 'embedding');
      expect(groupCountsAsCustomerUse(group)).toBe(group !== 'embedding' && group !== 'help' && group !== 'hero');
    }
  });

  it('OCR (kb_ocr) roi vao nhom nap tai lieu: khong phai luot goi, khong tinh la khach dang dung AI', () => {
    const group = resolveAiFeatureGroup('kb_ocr');
    expect(group).toBe('embedding');
    expect(groupCountsAsCall(group)).toBe(false);
    expect(groupCountsAsCustomerUse(group)).toBe(false);
  });

  it('chat trang chu (hero) LA luot goi nhung khach vang lai khong phai "khach dang dung AI"', () => {
    const group = resolveAiFeatureGroup('hero_consultation');
    expect(groupCountsAsCall(group)).toBe(true);
    expect(groupCountsAsCustomerUse(group)).toBe(false);
  });
});
