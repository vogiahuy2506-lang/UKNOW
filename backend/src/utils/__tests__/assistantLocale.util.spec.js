import { describe, expect, it } from '@jest/globals';
import {
  buildAssistantLanguageInstructions,
  detectExplicitContentLocale,
  detectExplicitConversationLocale,
  detectTextLocale,
  isLandingOrientedTurn,
  normalizeAssistantLocale,
  resolveAssistantLocaleContext,
} from '../assistantLocale.util.js';

describe('assistantLocale.util', () => {
  it('normalizeAssistantLocale only accepts vi|en', () => {
    expect(normalizeAssistantLocale('en')).toBe('en');
    expect(normalizeAssistantLocale('VI')).toBe('vi');
    expect(normalizeAssistantLocale('fr', 'en')).toBe('en');
    expect(normalizeAssistantLocale(null)).toBe('vi');
  });

  it('UI EN + session conversation VI → reply VI, UI still EN', () => {
    const ctx = resolveAssistantLocaleContext({
      uiLocale: 'en',
      persistedConversationLocale: 'vi',
      history: [{ role: 'user', content: 'tiep tuc giup minh nhe' }],
      briefContentLocale: 'vi',
    });
    expect(ctx.uiLocale).toBe('en');
    expect(ctx.conversationLocale).toBe('vi');
    expect(ctx.conversationLocaleSource).toBe('session');
    expect(ctx.contentLocale).toBe('vi');
  });

  it('Please reply in English changes conversation but keeps brief content VI', () => {
    const ctx = resolveAssistantLocaleContext({
      uiLocale: 'vi',
      persistedConversationLocale: 'vi',
      briefContentLocale: 'vi',
      history: [{ role: 'user', content: 'Please reply in English' }],
    });
    expect(ctx.conversationLocale).toBe('en');
    expect(ctx.conversationLocaleSource).toBe('explicit');
    expect(ctx.contentLocale).toBe('vi');
    expect(ctx.contentLocaleSource).toBe('brief');
  });

  it('Viết email này bằng tiếng Anh sets content EN without changing conversation', () => {
    const ctx = resolveAssistantLocaleContext({
      uiLocale: 'vi',
      persistedConversationLocale: 'vi',
      briefContentLocale: 'vi',
      history: [{ role: 'user', content: 'Viết email này bằng tiếng Anh' }],
    });
    expect(ctx.conversationLocale).toBe('vi');
    expect(ctx.conversationLocaleSource).toBe('session');
    expect(ctx.contentLocale).toBe('en');
    expect(ctx.contentLocaleSource).toBe('explicit');
  });

  it('Soạn tin Zalo bằng tiếng Anh sets content EN without changing conversation', () => {
    const ctx = resolveAssistantLocaleContext({
      uiLocale: 'vi',
      persistedConversationLocale: 'vi',
      briefContentLocale: 'vi',
      history: [{ role: 'user', content: 'Soạn tin Zalo bằng tiếng Anh' }],
    });
    expect(detectExplicitContentLocale('Soạn tin Zalo bằng tiếng Anh')).toBe('en');
    expect(detectExplicitConversationLocale('Soạn tin Zalo bằng tiếng Anh')).toBeNull();
    expect(ctx.conversationLocale).toBe('vi');
    expect(ctx.contentLocale).toBe('en');
    expect(ctx.contentLocaleSource).toBe('explicit');
  });

  it('landing turn does not inherit CampaignBrief contentLocale when brief omitted', () => {
    const ctx = resolveAssistantLocaleContext({
      uiLocale: 'en',
      persistedConversationLocale: 'en',
      briefContentLocale: null,
      history: [{ role: 'user', content: 'Create a landing page for Billing Academy' }],
    });
    expect(ctx.contentLocale).toBe('en');
    expect(ctx.contentLocaleSource).toBe('conversation_default');
  });

  it('isLandingOrientedTurn detects landing creation and ask_landing_details', () => {
    expect(isLandingOrientedTurn([
      { role: 'user', content: 'Create a landing page for Billing Academy' },
    ])).toBe(true);
    expect(isLandingOrientedTurn([
      { role: 'assistant', type: 'ask_landing_details', content: '...' },
      { role: 'user', content: 'Lead gen for students' },
    ])).toBe(true);
    expect(isLandingOrientedTurn([
      { role: 'user', content: 'Create a Zalo campaign for Payment Pro' },
    ])).toBe(false);
  });

  it('newer campaign intent wins over stale ask_landing_details', () => {
    expect(isLandingOrientedTurn([
      { role: 'user', content: 'Create a landing page for Billing Academy' },
      { role: 'assistant', type: 'ask_landing_details', content: '...' },
      { role: 'user', content: 'Lead gen for students' },
      { role: 'assistant', type: 'landing_page', content: 'done' },
      { role: 'user', content: 'Now create an email campaign for Payment Pro' },
    ])).toBe(false);
    expect(isLandingOrientedTurn([
      { role: 'assistant', type: 'ask_landing_details', content: '...' },
      { role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' },
    ])).toBe(false);
  });

  it('content locale ignores topic “in English” and honors correction clauses', () => {
    expect(detectExplicitContentLocale('Write an email about studying in English')).toBeNull();
    expect(detectExplicitContentLocale("Don't write in English; write it in Vietnamese")).toBe('vi');
    expect(detectExplicitContentLocale('Đừng viết bằng tiếng Anh, hãy viết bằng tiếng Việt')).toBe('vi');
    expect(detectExplicitContentLocale("Don't write in English")).toBeNull();
  });

  it('marker / null / short text do not flip locale', () => {
    expect(detectTextLocale('[wizard]{"gate":"channel","channel":"email"}\nEmail')).toBeNull();
    expect(detectTextLocale('ok')).toBeNull();
    expect(detectExplicitConversationLocale('[wizard]{"gate":"schedule","mode":"once"}\nx')).toBeNull();

    const ctx = resolveAssistantLocaleContext({
      uiLocale: 'vi',
      persistedConversationLocale: 'en',
      history: [{ role: 'user', content: '[wizard]{"gate":"channel","channel":"email"}\nEmail' }],
    });
    expect(ctx.conversationLocale).toBe('en');
    expect(ctx.conversationLocaleSource).toBe('session');
  });

  it('new session detects clear English; ambiguous falls back to UI', () => {
    const detected = resolveAssistantLocaleContext({
      uiLocale: 'vi',
      persistedConversationLocale: null,
      history: [{
        role: 'user',
        content: 'Please help me create an email campaign for customers and write the message',
      }],
    });
    expect(detected.conversationLocale).toBe('en');
    expect(detected.conversationLocaleSource).toBe('detected');

    const ambiguous = resolveAssistantLocaleContext({
      uiLocale: 'vi',
      persistedConversationLocale: null,
      history: [{ role: 'user', content: 'hello AI' }],
    });
    expect(ambiguous.conversationLocale).toBe('vi');
    expect(ambiguous.conversationLocaleSource).toBe('ui_default');
  });

  it('persisted EN + normal VI message stays EN; explicit VI directive switches', () => {
    const sticky = resolveAssistantLocaleContext({
      uiLocale: 'vi',
      persistedConversationLocale: 'en',
      history: [{
        role: 'user',
        content: 'Tiếp theo hãy giúp mình tạo chiến dịch chăm sóc khách hàng với nội dung cảm ơn',
      }],
    });
    expect(sticky.conversationLocale).toBe('en');
    expect(sticky.conversationLocaleSource).toBe('session');

    const explicit = resolveAssistantLocaleContext({
      uiLocale: 'en',
      persistedConversationLocale: 'en',
      history: [{ role: 'user', content: 'Trả lời bằng tiếng Việt giúp mình' }],
    });
    expect(explicit.conversationLocale).toBe('vi');
    expect(explicit.conversationLocaleSource).toBe('explicit');
  });

  it('detectExplicit helpers are phrase-bounded', () => {
    expect(detectExplicitConversationLocale('reply in English please')).toBe('en');
    expect(detectExplicitContentLocale('write the message in English')).toBe('en');
    expect(detectExplicitContentLocale('create a campaign about English courses')).toBeNull();
  });

  it('buildAssistantLanguageInstructions separates prose and artifact', () => {
    const text = buildAssistantLanguageInstructions({
      conversationLocale: 'en',
      contentLocale: 'vi',
    });
    expect(text).toMatch(/ASSISTANT_REPLY_LANGUAGE:.*English/i);
    expect(text).toMatch(/CUSTOMER_CONTENT_LANGUAGE:.*tiếng Việt/i);
    expect(text).not.toMatch(/All "content" fields in JSON must be written in English/);
  });
});
