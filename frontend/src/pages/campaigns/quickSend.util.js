import { miniMarkdownToHtml } from '../../utils/miniMarkdownToHtml.js';

/**
 * Picks the template body for the QuickSend wizard.
 *
 * Email templates come in two shapes from the backend:
 *   1. HTML form — `bodyHtml` holds the rich content, `bodyText` is a derived plain text.
 *   2. Plain text form — `bodyHtml` is null/empty, `body_text`/`bodyText` holds the content.
 *
 * The list endpoint returns the lightweight payload (id/name/subject only),
 * so callers must fetch the full template via getById before invoking this
 * helper — otherwise every field below resolves to '' and the user gets a
 * 422 EMPTY_EMAIL_BODY on send.
 */
export const CHANNEL_EMAIL = 'email';
export const CHANNEL_ZALO = 'zalo';

export function pickTemplateContent(template, channel) {
  if (!template) {
    return channel === CHANNEL_EMAIL ? { subject: '', body: '' } : { body: '' };
  }
  if (channel === CHANNEL_EMAIL) {
    return {
      subject: template.subject || '',
      body: template.bodyHtml || template.body_text || template.bodyText || '',
    };
  }
  return {
    body: template.bodyText || template.body_text || '',
  };
}

/**
 * Resolves the email body into an { html, text } pair the backend can send.
 * Mirrors `resolveEmailBody` inside QuickSend but is pure so it can be unit
 * tested without React state.
 *
 * If the resolved body looks like plain text (no HTML tags) — typically a
 * legacy template saved with an empty `bodyHtml` and a markdown-ish
 * `bodyText` — build a real HTML body via `miniMarkdownToHtml` so Gmail
 * renders paragraph structure instead of one run-on line.
 */
export function resolveEmailBody(templateContentBody, selectedTemplate) {
  const raw = templateContentBody || selectedTemplate?.bodyHtml || '';
  const isLikelyHtml = /<\s*(p|div|h[1-6]|br|hr|strong|em|ul|ol|li|table|span|a)\b/i.test(raw);
  const html = isLikelyHtml ? raw : miniMarkdownToHtml(raw);
  return { html, text: stripHtmlToPlainText(html) };
}

function stripHtmlToPlainText(html) {
  if (typeof document === 'undefined') {
    // Node-side fallback used by vitest. Replicates the DOM-based stripper
    // by converting block-level tags to newlines (so paragraphs preserve
    // their line breaks) and stripping the rest.
    return String(html || '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<\s*\/?\s*(p|div|h[1-6]|li|tr|table|br|hr)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]+/g, ' ')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .join('\n');
  }
  const container = document.createElement('div');
  container.innerHTML = html || '';
  // Preserve paragraph boundaries — DOM textContent collapses them.
  // Walk block-level children and join with newlines.
  const blockSelector = 'p,div,h1,h2,h3,h4,h5,h6,li,tr,br';
  const blocks = container.querySelectorAll(blockSelector);
  if (blocks.length > 0) {
    return Array.from(blocks)
      .map((el) => (el.textContent || '').trim())
      .filter((t) => t.length > 0)
      .join('\n\n');
  }
  return (container.textContent || container.innerText || '').trim();
}
