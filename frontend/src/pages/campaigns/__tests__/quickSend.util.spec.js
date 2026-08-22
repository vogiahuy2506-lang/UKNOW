import { describe, it, expect } from 'vitest';
import {
  pickTemplateContent,
  resolveEmailBody,
  CHANNEL_EMAIL,
  CHANNEL_ZALO,
} from '../quickSend.util';

describe('pickTemplateContent', () => {
  it('returns empty strings when template is missing', () => {
    expect(pickTemplateContent(null, CHANNEL_EMAIL)).toEqual({ subject: '', body: '' });
    expect(pickTemplateContent(undefined, CHANNEL_ZALO)).toEqual({ body: '' });
  });

  it('prefers bodyHtml for the email HTML form', () => {
    const tpl = {
      subject: 'Hello',
      bodyHtml: '<p>HTML body</p>',
      bodyText: 'Plain fallback',
      body_text: 'snake fallback',
    };
    expect(pickTemplateContent(tpl, CHANNEL_EMAIL)).toEqual({
      subject: 'Hello',
      body: '<p>HTML body</p>',
    });
  });

  it('falls back to body_text / bodyText when bodyHtml is empty (plain text form)', () => {
    expect(pickTemplateContent({ body_text: 'snake text' }, CHANNEL_EMAIL)).toEqual({
      subject: '',
      body: 'snake text',
    });
    expect(pickTemplateContent({ bodyText: 'camel text' }, CHANNEL_EMAIL)).toEqual({
      subject: '',
      body: 'camel text',
    });
  });

  it('returns bodyText for the Zalo channel', () => {
    expect(pickTemplateContent({ bodyText: 'Zalo payload', bodyHtml: '<p>x</p>' }, CHANNEL_ZALO))
      .toEqual({ body: 'Zalo payload' });
    expect(pickTemplateContent({ body_text: 'Zalo snake' }, CHANNEL_ZALO))
      .toEqual({ body: 'Zalo snake' });
  });
});

describe('resolveEmailBody', () => {
  it('uses templateContent.body first and strips it to plain text', () => {
    const { html, text } = resolveEmailBody(
      '<p>Xin chào</p>',
      { bodyHtml: '<p>ignored</p>' }
    );
    expect(html).toBe('<p>Xin chào</p>');
    expect(text).toBe('Xin chào');
  });

  it('falls back to selectedTemplate.bodyHtml when body is empty', () => {
    const { html, text } = resolveEmailBody('', { bodyHtml: '<p>Founder AI</p>' });
    expect(html).toBe('<p>Founder AI</p>');
    expect(text).toBe('Founder AI');
  });

  it('strips HTML chrome (mirrors the EMPTY_EMAIL_BODY bug)', () => {
    const { html, text } = resolveEmailBody('<div><br/></div>', { bodyHtml: '' });
    expect(html).toBe('<div><br/></div>');
    expect(text).toBe('');
  });
});
