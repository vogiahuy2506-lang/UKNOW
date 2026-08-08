import sanitizeHtml from 'sanitize-html';

const HELP_HTML_ALLOWED_TAGS = [
  'p', 'br', 'strong', 'em', 'u', 's', 'h1', 'h2', 'h3', 'h4',
  'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
  'a', 'img', 'figure', 'figcaption', 'hr',
  'table', 'thead', 'tbody', 'tr', 'th', 'td',
];

/**
 * Sanitize help article HTML on save (never trust display-time filtering alone — RAG indexes this).
 * @param {string} dirty
 * @returns {string}
 */
export function sanitizeHelpHtml(dirty) {
  return sanitizeHtml(String(dirty || ''), {
    allowedTags: HELP_HTML_ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      '*': ['class'],
    },
    // http required for local BACKEND_PUBLIC_URL (localhost)
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {
      img: ['http', 'https'],
      a: ['http', 'https', 'mailto'],
    },
    transformTags: {
      a: (tagName, attribs) => {
        const next = { ...attribs };
        if (next.target === '_blank' || next.href) {
          next.rel = 'noopener noreferrer';
        }
        return { tagName, attribs: next };
      },
    },
  });
}

/**
 * Strip HTML to plain text for RAG chunking. Node has no DOM — use sanitize-html + regex.
 * @param {string} html
 * @returns {string}
 */
export function htmlToPlainText(html) {
  let s = String(html || '');
  // Drop images entirely (no URL leakage into embeddings)
  s = s.replace(/<img\b[^>]*>/gi, '');
  // Preserve paragraph / heading / list boundaries for chunkHelpMarkdown
  s = s.replace(/<\/(p|h[1-6]|li|blockquote|pre|tr)>/gi, '\n\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = sanitizeHtml(s, {
    allowedTags: [],
    allowedAttributes: {},
  });
  // sanitize-html leaves named entities escaped in text; decode common ones for clean RAG
  s = s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
  return s
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}
