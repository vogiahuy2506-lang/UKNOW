import aiUsageMeter from '../ai/aiUsageMeter.service.js';
import { isThinkingBudgetRejection } from '../../utils/geminiClient.util.js';
import { sanitizeHelpHtml } from '../../utils/helpHtmlSanitize.util.js';
import { generateGeminiText } from './geminiText.util.js';
import { glossaryPromptBlock } from './helpGlossary.js';
import { reindexArticle, _clearCapabilityMapCache } from './helpCenter.service.js';
import * as helpRepo from '../../repositories/help/helpArticle.repository.js';

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

async function translateFields(source, targetLocale, userId) {
  const useHtml = Boolean(String(source.body_html || '').trim());
  const bodyField = useHtml ? 'body_html' : 'body_md';
  const bodyValue = useHtml ? source.body_html : (source.body_md || '');

  const systemPrompt = `You translate Founder AI help-center articles from Vietnamese to English.
Return ONLY a JSON object with keys: title, summary, ${bodyField}.
Rules:
- Translate meaning; keep markdown/HTML structure and tags exactly when translating HTML (translate text nodes only).
- Keep relative links like /huong-dan/<slug> and /app/... unchanged. NEVER add domains, https://, or founder.ai.
- Use EXACT English UI labels from this glossary (do not invent synonyms):
${glossaryPromptBlock()}
- Keep slug-like identifiers, feature keys, and code unchanged.
- Do not wrap JSON in markdown fences.`;

  const userPrompt = JSON.stringify({
    title: source.title,
    summary: source.summary || '',
    [bodyField]: bodyValue,
  });

  const baseArgs = {
    userId,
    systemPrompt,
    userPrompt,
    temperature: 0.2,
  };

  let text;
  let modelName;
  let raw;
  try {
    ({ text, modelName, raw } = await generateGeminiText({
      ...baseArgs,
      maxOutputTokens: 8192,
      thinkingBudget: 0,
    }));
  } catch (err) {
    if (!isThinkingBudgetRejection(err)) throw err;
    ({ text, modelName, raw } = await generateGeminiText({
      ...baseArgs,
      maxOutputTokens: 8192,
    }));
  }

  try {
    await aiUsageMeter.record(userId, {
      promptTokens: Number(raw?.usageMetadata?.promptTokenCount) || 0,
      outputTokens: Number(raw?.usageMetadata?.candidatesTokenCount) || 0,
      totalTokens: Number(raw?.usageMetadata?.totalTokenCount) || 0,
    }, { feature: 'help_translate', model: modelName, kind: 'generate' });
  } catch {
    // best-effort
  }

  const parsed = extractJsonObject(text);
  if (!parsed?.title) {
    throw Object.assign(new Error('AI dịch trả về JSON không hợp lệ'), { status: 502 });
  }

  const result = {
    title: String(parsed.title).trim(),
    summary: String(parsed.summary || '').trim(),
    body_html: null,
    body_md: '',
  };

  if (useHtml) {
    result.body_html = sanitizeHelpHtml(String(parsed.body_html || parsed.bodyHtml || ''));
    result.body_md = '';
  } else {
    result.body_md = String(parsed.body_md || parsed.bodyMd || '');
    result.body_html = null;
  }

  return result;
}

async function translateCaption(caption, userId) {
  if (!caption || !String(caption).trim()) return caption || null;
  try {
    const { text } = await generateGeminiText({
      userId,
      systemPrompt: 'Translate this short image/video caption to English. Return only the translated caption.',
      userPrompt: String(caption),
      temperature: 0.2,
      maxOutputTokens: 256,
      thinkingBudget: 0,
    });
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
