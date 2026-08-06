/**
 * Chunk helpers for help articles.
 * Short bodies (< chunkSize) stay as ONE chunk — do not shred FAQ sections.
 */

export const HELP_CHUNK_SIZE = 500;

/**
 * @param {string} text
 * @param {number} [chunkSize=500]
 * @returns {string[]}
 */
export function chunkHelpMarkdown(text, chunkSize = HELP_CHUNK_SIZE) {
  const normalized = String(text || '').trim();
  if (!normalized) return [];
  if (normalized.length <= chunkSize) return [normalized];

  const paragraphs = normalized.split(/\n{2,}|\n/).map((s) => s.trim()).filter(Boolean);
  const chunks = [];
  let buffer = '';

  for (const para of paragraphs) {
    if (buffer.length + para.length + 1 <= chunkSize) {
      buffer += (buffer ? '\n\n' : '') + para;
    } else {
      if (buffer) chunks.push(buffer);
      if (para.length <= chunkSize) {
        buffer = para;
      } else {
        // Long paragraph: split by sentences
        const sentences = para.split(/(?<=[.!?])\s+/);
        buffer = '';
        for (const sentence of sentences) {
          if (buffer.length + sentence.length + 1 <= chunkSize) {
            buffer += (buffer ? ' ' : '') + sentence;
          } else {
            if (buffer) chunks.push(buffer);
            buffer = sentence.length <= chunkSize ? sentence : sentence.slice(0, chunkSize);
          }
        }
      }
    }
  }
  if (buffer) chunks.push(buffer);
  return chunks.length ? chunks : [normalized.slice(0, chunkSize)];
}

/**
 * Build capability map text from published articles.
 * @param {Array<{ feature_key?: string, featureKey?: string, title: string, summary: string }>} articles
 * @returns {string}
 */
export function buildCapabilityMap(articles = []) {
  const published = (articles || []).filter((a) => a.is_published !== false && a.isPublished !== false);
  const groups = new Map();
  for (const a of published) {
    const key = a.feature_key || a.featureKey || 'other';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(`- ${a.title}: ${a.summary || ''}`.trim());
  }
  const lines = ['BẢN ĐỒ NĂNG LỰC HỆ THỐNG:'];
  for (const [key, items] of groups) {
    lines.push(`## ${key}`);
    lines.push(...items);
  }
  return lines.join('\n');
}

export const HELP_ROUTE_LABELS = Object.freeze({
  hỏi_đáp: 'hỏi_đáp',
  làm_giúp: 'làm_giúp',
  không_rõ: 'không_rõ',
  ngoài_phạm_vi: 'ngoài_phạm_vi',
});

/**
 * Parse model routing output into one of the closed labels.
 * When multiple labels appear (e.g. "hỏi_đáp (không phải làm giúp)"), pick the
 * earliest occurrence so negation/clarification does not flip the route.
 * @param {string} raw
 * @returns {keyof typeof HELP_ROUTE_LABELS}
 */
export function parseRouteLabel(raw) {
  const text = String(raw || '').toLowerCase().normalize('NFC');
  const candidates = [
    {
      label: HELP_ROUTE_LABELS.làm_giúp,
      patterns: ['làm_giúp', 'lam_giup', 'làm giúp'],
    },
    {
      label: HELP_ROUTE_LABELS.ngoài_phạm_vi,
      patterns: ['ngoài_phạm_vi', 'ngoai_pham_vi', 'ngoài phạm vi'],
    },
    {
      label: HELP_ROUTE_LABELS.không_rõ,
      patterns: ['không_rõ', 'khong_ro', 'không rõ'],
    },
    {
      label: HELP_ROUTE_LABELS.hỏi_đáp,
      patterns: ['hỏi_đáp', 'hoi_dap', 'hỏi đáp'],
    },
  ];

  let bestLabel = null;
  let bestIndex = Infinity;
  for (const { label, patterns } of candidates) {
    for (const pattern of patterns) {
      const idx = text.indexOf(pattern);
      if (idx >= 0 && idx < bestIndex) {
        bestIndex = idx;
        bestLabel = label;
      }
    }
  }

  // Default conservative: clarify rather than wrong action
  return bestLabel || HELP_ROUTE_LABELS.không_rõ;
}
