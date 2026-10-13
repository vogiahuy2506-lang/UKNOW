import aiUsageMeter from '../ai/aiUsageMeter.service.js';
import { isThinkingBudgetRejection } from '../../utils/geminiClient.util.js';
import { sanitizeHelpHtml } from '../../utils/helpHtmlSanitize.util.js';
import { generateGeminiText } from './geminiText.util.js';
import { glossaryPromptBlock } from './helpGlossary.js';
import { reindexArticle, _clearCapabilityMapCache } from './helpCenter.service.js';
import * as helpRepo from '../../repositories/help/helpArticle.repository.js';

// Bản dịch là TOÀN BỘ thân bài. Trần đầu ra rộng cho bài dài (bài ~25.000 ký tự HTML dùng ~5.400–6.000 token).
//
// 13/10/2026 — ĐẦU RA THEO MỐC, KHÔNG JSON, VÀ CHE URL ẢNH. Bản trước (ec643744) bật JSON mode và cho rằng thế là đủ — SAI:
//  - JSON bọc cả thân bài HTML vẫn vỡ khi BẬT JSON mode (đo trên prod, bài `bieu-mau` 9 ảnh: lỗi ở vị trí 10715) — HTML đầy dấu " phải
//    thoát, model sót; trước đó không bật JSON mode thì vỡ ở vị trí 9997;
//  - model chép sai URL ảnh dài (~270 ký tự base64): lượt parse được vẫn có 1/9 `src` lệch → ảnh bản EN hỏng (bài `khach-hang` EN đang
//    có 3 ảnh hỏng vì thế).
// Nay: thay mọi `src`/`poster` bằng mã `__MEDIA_n__` trước khi gửi, model trả về theo mốc @@TITLE@@ … @@END@@ (không phải thoát gì), rồi
// trả URL thật vào và đòi ĐỦ mỗi mã đúng một lần. Đo trên prod bài `bieu-mau`: 3/3 lượt đủ 9/9 mã, 48/48 <p>, finish=STOP.
export const HELP_TRANSLATE_MAX_OUTPUT_TOKENS = 32768;
/** Model sai định dạng / làm lệch mã ảnh thì dịch lại đúng một lần nữa rồi mới báo lỗi. */
export const HELP_TRANSLATE_MAX_ATTEMPTS = 2;

const MEDIA_URL_ATTR = /\b(src|poster)="([^"]*)"/g;
const MEDIA_TOKEN = /__MEDIA_(\d+)__/g;
const MARKED_OUTPUT = /@@TITLE@@\s*([\s\S]*?)\s*@@SUMMARY@@\s*([\s\S]*?)\s*@@BODY@@\s*([\s\S]*?)\s*@@END@@/;

/**
 * Che URL ảnh/video của thân bài HTML bằng mã ngắn để model không phải chép chuỗi dài (và không chép sai).
 *
 * @param {string} html
 * @returns {{ masked: string, urls: string[] }} `urls[n]` là URL thật của mã `__MEDIA_n__`
 */
export function maskMediaUrls(html) {
  const urls = [];
  const masked = String(html || '').replace(MEDIA_URL_ATTR, (_whole, attr, url) => {
    urls.push(url);
    return `${attr}="__MEDIA_${urls.length - 1}__"`;
  });
  return { masked, urls };
}

/**
 * Trả URL thật vào chỗ các mã. Mỗi mã phải xuất hiện ĐÚNG một lần và không có mã lạ — thiếu là mất ảnh, lặp là ảnh nhân đôi.
 *
 * @param {string} html thân bài model trả về
 * @param {string[]} urls kết quả `maskMediaUrls`
 * @returns {string|null} null nếu mã thiếu / lặp / lạ
 */
export function restoreMediaUrls(html, urls) {
  const seen = urls.map(() => 0);
  let unknown = 0;
  const restored = String(html || '').replace(MEDIA_TOKEN, (token, index) => {
    const n = Number(index);
    if (!(n < urls.length)) {
      unknown += 1;
      return token;
    }
    seen[n] += 1;
    return urls[n];
  });
  return unknown === 0 && seen.every((count) => count === 1) ? restored : null;
}

/**
 * Đọc đầu ra theo mốc. Model lỡ trả JSON kiểu cũ thì vẫn nhận (cùng khoá title/summary/<bodyField>).
 *
 * @param {string} text
 * @param {'body_html'|'body_md'} bodyField
 * @returns {{ title: string, summary: string, body: string }|null}
 */
export function parseTranslationOutput(text, bodyField) {
  const marked = String(text || '').match(MARKED_OUTPUT);
  if (marked && marked[1].trim()) {
    return { title: marked[1].trim(), summary: marked[2].trim(), body: marked[3] };
  }
  const parsed = extractJsonObject(text);
  if (!parsed?.title) return null;
  const camel = bodyField === 'body_html' ? 'bodyHtml' : 'bodyMd';
  return {
    title: String(parsed.title).trim(),
    summary: String(parsed.summary || '').trim(),
    body: String(parsed[bodyField] || parsed[camel] || ''),
  };
}

function normalizeLocale(locale) {
  return String(locale || 'en').trim().toLowerCase() === 'en' ? 'en' : 'vi';
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(raw.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

/** Token từ thân phản hồi Google (`raw.usageMetadata`) → dạng `aiUsageMeter.record` nhận. */
function usageFromRaw(raw) {
  return {
    promptTokens: Number(raw?.usageMetadata?.promptTokenCount) || 0,
    outputTokens: Number(raw?.usageMetadata?.candidatesTokenCount) || 0,
    totalTokens: Number(raw?.usageMetadata?.totalTokenCount) || 0,
  };
}

async function translateFields(source, targetLocale, userId) {
  const useHtml = Boolean(String(source.body_html || '').trim());
  const bodyField = useHtml ? 'body_html' : 'body_md';
  const bodyValue = useHtml ? source.body_html : (source.body_md || '');
  // Chỉ che URL trong HTML: thân markdown không có thuộc tính src/poster.
  const { masked, urls } = useHtml ? maskMediaUrls(bodyValue) : { masked: bodyValue, urls: [] };

  const systemPrompt = `You translate Founder AI help-center articles from Vietnamese to English.
The input is JSON with keys title, summary, ${bodyField}. Reply in EXACTLY this plain-text format and nothing else:
@@TITLE@@
<English title>
@@SUMMARY@@
<English summary>
@@BODY@@
<English ${bodyField}>
@@END@@
Rules:
- Translate meaning; keep markdown/HTML structure and tags exactly when translating HTML (translate text nodes and alt text only).
- Keep every placeholder like __MEDIA_0__ exactly as is, once each.
- Keep relative links like /huong-dan/<slug> and /app/... unchanged. NEVER add domains, https://, or founder.ai.
- Use EXACT English UI labels from this glossary (do not invent synonyms):
${glossaryPromptBlock()}
- Keep slug-like identifiers, feature keys, and code unchanged.
- Do not use markdown fences.`;

  const userPrompt = JSON.stringify({
    title: source.title,
    summary: source.summary || '',
    [bodyField]: masked,
  });

  const baseArgs = {
    userId,
    systemPrompt,
    userPrompt,
    temperature: 0.2,
    feature: 'help_translate',
    maxOutputTokens: HELP_TRANSLATE_MAX_OUTPUT_TOKENS,
  };

  let failure = 'format';
  for (let attempt = 1; attempt <= HELP_TRANSLATE_MAX_ATTEMPTS; attempt += 1) {
    let text;
    let modelName;
    let raw;
    try {
      ({ text, modelName, raw } = await generateGeminiText({ ...baseArgs, thinkingBudget: 0 }));
    } catch (err) {
      if (!isThinkingBudgetRejection(err)) throw err;
      ({ text, modelName, raw } = await generateGeminiText(baseArgs));
    }

    try {
      await aiUsageMeter.record(userId, usageFromRaw(raw), { feature: 'help_translate', model: modelName, kind: 'generate' });
    } catch {
      // best-effort
    }

    const parsed = parseTranslationOutput(text, bodyField);
    if (!parsed) {
      failure = 'format';
      continue;
    }
    const body = useHtml ? restoreMediaUrls(parsed.body, urls) : parsed.body;
    if (body === null) {
      failure = 'media';
      continue;
    }
    return {
      title: parsed.title,
      summary: parsed.summary,
      body_html: useHtml ? sanitizeHelpHtml(body) : null,
      body_md: useHtml ? '' : body,
    };
  }

  throw Object.assign(new Error(failure === 'media'
    ? 'AI dịch làm thiếu hoặc lặp ảnh/video trong bài — bản dịch không được lưu, thử lại'
    : 'AI dịch trả về sai định dạng — bản dịch không được lưu, thử lại'), { status: 422 });
}

async function translateCaption(caption, userId) {
  if (!caption || !String(caption).trim()) return caption || null;
  try {
    const { text, modelName, raw } = await generateGeminiText({
      userId,
      systemPrompt: 'Translate this short image/video caption to English. Return only the translated caption.',
      userPrompt: String(caption),
      temperature: 0.2,
      maxOutputTokens: 256,
      thinkingBudget: 0,
      feature: 'help_translate_caption',
    });
    // D-22: lượt dịch chú thích Google đã tính tiền nhưng bản cũ không ghi token (trang Chi phí AI thấp hơn hoá đơn). Chỉ ghi token cho admin,
    // KHÔNG trừ credit; ghi hỏng không được làm mất bản dịch (`record` tự nuốt lỗi, bọc thêm cho chắc).
    try {
      await aiUsageMeter.record(userId, usageFromRaw(raw), { feature: 'help_translate_caption', model: modelName, kind: 'generate' });
    } catch {
      // best-effort
    }
    return String(text || caption).trim() || caption;
  } catch {
    return caption;
  }
}

/**
 * Translate a help article into targetLocale, upsert sibling row, copy media, reindex.
 */
export async function translateHelpArticle(articleId, {
  locale = 'en',
  actorUserId = null,
} = {}) {
  const targetLocale = normalizeLocale(locale);
  if (targetLocale !== 'en') {
    throw Object.assign(new Error('Hiện chỉ hỗ trợ dịch sang tiếng Anh (en)'), { status: 400 });
  }

  const source = await helpRepo.findArticleById(articleId);
  if (!source) {
    throw Object.assign(new Error('Không tìm thấy bài viết'), { status: 404 });
  }
  if ((source.locale || 'vi') !== 'vi') {
    throw Object.assign(new Error('Chỉ dịch từ bản tiếng Việt'), { status: 400 });
  }

  const translated = await translateFields(source, targetLocale, actorUserId);

  const existing = await helpRepo.findArticleBySlug(source.slug, {
    locale: targetLocale,
    publishedOnly: false,
    fallbackVi: false,
  });

  const payload = {
    slug: source.slug,
    title: translated.title,
    summary: translated.summary,
    body_md: translated.body_md,
    body_html: translated.body_html,
    feature_key: source.feature_key,
    primary_route: source.primary_route,
    sort_order: source.sort_order,
    is_published: source.is_published,
    locale: targetLocale,
    is_stale: false,
    source_locale: 'vi',
    translated_at: new Date().toISOString(),
  };

  let saved;
  if (existing) {
    saved = await helpRepo.updateArticle(existing.id, payload);
  } else {
    saved = await helpRepo.createArticle(payload);
  }

  // Replace media on EN row (copy from VN, translate captions).
  await helpRepo.deleteMediaByArticleId(saved.id);
  const media = await helpRepo.listMedia(source.id);
  for (const item of media) {
    const caption = await translateCaption(item.caption, actorUserId);
    await helpRepo.addMedia(saved.id, {
      type: item.type,
      url: item.url,
      caption,
      sortOrder: item.sort_order ?? 0,
    });
  }

  if (saved.is_published) {
    await reindexArticle(saved.id, { actorUserId });
  } else {
    _clearCapabilityMapCache();
  }

  return helpRepo.findArticleById(saved.id);
}
