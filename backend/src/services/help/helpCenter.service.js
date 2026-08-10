import { embedText, embedTexts } from '../../utils/embeddingClient.util.js';
import { chunkHelpMarkdown, buildCapabilityMap } from '../../utils/helpCenter.util.js';
import { sanitizeHelpHtml, htmlToPlainText } from '../../utils/helpHtmlSanitize.util.js';
import * as helpRepo from '../../repositories/help/helpArticle.repository.js';
import db from '../../config/database.js';

let capabilityMapCache = { text: '', builtAt: 0, fingerprint: '', locale: '' };

function articlesFingerprint(articles) {
  return articles
    .map((a) => `${a.id}:${a.updated_at || a.updatedAt || ''}:${a.is_published}:${a.locale || 'vi'}`)
    .join('|');
}

function normalizeLocale(locale) {
  return String(locale || 'vi').trim().toLowerCase() === 'en' ? 'en' : 'vi';
}

export function _clearCapabilityMapCache() {
  capabilityMapCache = { text: '', builtAt: 0, fingerprint: '', locale: '' };
}

export async function getCapabilityMapText(locale = 'vi') {
  const lang = normalizeLocale(locale);
  // Prefer target locale per slug, fallback vi — avoids empty EN map and VN+EN duplicates.
  const articles = await helpRepo.listArticlesPreferLocale({ locale: lang, publishedOnly: true });
  const fingerprint = `${lang}|${articlesFingerprint(articles)}`;
  if (
    capabilityMapCache.text
    && capabilityMapCache.fingerprint === fingerprint
    && capabilityMapCache.locale === lang
  ) {
    return capabilityMapCache.text;
  }
  const text = buildCapabilityMap(articles);
  capabilityMapCache = { text, builtAt: Date.now(), fingerprint, locale: lang };
  return text;
}

/**
 * Re-embed a single article: embed best-effort first, then swap chunks in one txn.
 * Embed API failure → insert chunks with NULL embedding (keyword searchable); do not throw.
 */
export async function reindexArticle(articleId, { actorUserId = null } = {}) {
  const article = await helpRepo.findArticleById(articleId);
  if (!article) {
    throw Object.assign(new Error('Không tìm thấy bài viết'), { status: 404 });
  }

  const pieces = chunkHelpMarkdown(
    article.body_html
      ? htmlToPlainText(article.body_html)
      : article.body_md
  );

  let embeddings = null;
  let embedError = null;
  if (pieces.length) {
    try {
      embeddings = await embedTexts(pieces, {
        userId: actorUserId || null,
        feature: 'embedding_help',
      });
    } catch (err) {
      embedError = err;
      console.warn(
        `[help] embed failed article=${articleId}:`,
        err?.message || err
      );
    }
  }

  const rows = pieces.map((contentText, index) => ({
    chunkIndex: index,
    contentText,
    embedding: embeddings ? embeddings[index] : null,
  }));

  const client = await db.getClient();
  try {
    await client.query('BEGIN');
    await helpRepo.deleteChunksByArticleId(articleId, client);
    if (rows.length) {
      await helpRepo.insertChunks(articleId, rows, client);
    }
    await client.query('COMMIT');
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    client.release();
  }

  _clearCapabilityMapCache();
  return {
    articleId,
    chunkCount: pieces.length,
    embedded: Boolean(embeddings),
    pendingEmbed: !embeddings && pieces.length > 0,
    embedError: embedError?.message || null,
  };
}

/**
 * Backfill embeddings for published articles with NULL/missing chunks.
 *
 * @param {{ limit?: number, actorUserId?: number|null }} [opts]
 * @returns {Promise<{ scanned: number, reembedded: number, stillPending: number }>}
 */
export async function reindexPendingArticles({ limit = 20, actorUserId = null } = {}) {
  const pending = await helpRepo.listArticlesWithPendingEmbedding({ limit });
  let reembedded = 0;
  let stillPending = 0;
  for (const row of pending) {
    try {
      const result = await reindexArticle(row.id, { actorUserId });
      if (result.embedded) {
        reembedded += 1;
      } else if (result.pendingEmbed) {
        // chunkCount === 0 (body rỗng sau plain-text) → bỏ qua, không đếm stillPending.
        stillPending += 1;
      }
    } catch (err) {
      stillPending += 1;
      console.warn(
        `[help] reindexPendingArticles failed article=${row.id}:`,
        err?.message || err
      );
    }
  }
  return {
    scanned: pending.length,
    reembedded,
    stillPending,
  };
}

export async function listPublicArticles(locale = 'vi') {
  const articles = await helpRepo.listArticlesPreferLocale({
    locale: normalizeLocale(locale),
    publishedOnly: true,
  });
  return articles.map((a) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    featureKey: a.feature_key,
    primaryRoute: a.primary_route,
    sortOrder: a.sort_order,
    locale: a.locale || 'vi',
  }));
}

export async function getPublicArticleBySlug(slug, locale = 'vi') {
  const article = await helpRepo.findArticleBySlug(slug, {
    locale: normalizeLocale(locale),
    publishedOnly: true,
  });
  if (!article) {
    throw Object.assign(new Error('Không tìm thấy bài hướng dẫn'), { status: 404 });
  }
  const media = await helpRepo.listMedia(article.id);
  return {
    id: article.id,
    slug: article.slug,
    title: article.title,
    summary: article.summary,
    bodyMd: article.body_md,
    bodyHtml: article.body_html || null,
    featureKey: article.feature_key,
    primaryRoute: article.primary_route,
    locale: article.locale || 'vi',
    media: media.map((m) => ({
      id: m.id,
      type: m.type,
      url: m.url,
      caption: m.caption,
      sortOrder: m.sort_order,
    })),
  };
}

export async function adminListArticles() {
  return helpRepo.listArticles({ publishedOnly: false });
}

export async function adminGetArticle(id) {
  const article = await helpRepo.findArticleById(id);
  if (!article) throw Object.assign(new Error('Không tìm thấy bài viết'), { status: 404 });
  const media = await helpRepo.listMedia(id);
  const chunkCount = await helpRepo.countChunksByArticleId(id);
  const pendingEmbedCount = await helpRepo.countPendingEmbedChunks(id);
  let siblingEnId = null;
  let siblingViId = null;
  if (article.slug) {
    const en = await helpRepo.findArticleBySlug(article.slug, {
      locale: 'en',
      publishedOnly: false,
      fallbackVi: false,
    });
    const vi = await helpRepo.findArticleBySlug(article.slug, {
      locale: 'vi',
      publishedOnly: false,
      fallbackVi: false,
    });
    siblingEnId = en?.id || null;
    siblingViId = vi?.id || null;
  }
  return {
    ...article,
    media,
    chunkCount,
    pendingEmbedCount,
    siblingEnId,
    siblingViId,
  };
}

export async function adminCreateArticle(payload, { actorUserId } = {}) {
  const cleaned = { ...payload };
  if (cleaned.body_html !== undefined || cleaned.bodyHtml !== undefined) {
    const raw = cleaned.body_html ?? cleaned.bodyHtml;
    cleaned.body_html = raw == null || raw === '' ? null : sanitizeHelpHtml(raw);
    delete cleaned.bodyHtml;
  }
  if (!cleaned.locale) cleaned.locale = 'vi';
  const created = await helpRepo.createArticle(cleaned);
  if (created.is_published) {
    try {
      await reindexArticle(created.id, { actorUserId });
    } catch (err) {
      // Bài đã lưu — không fail cả request nếu embed lỗi; admin bấm Reindex lại.
      console.warn(
        `[help] reindex after create failed article=${created.id}:`,
        err?.message || err
      );
    }
  }
  _clearCapabilityMapCache();
  return created;
}

export async function adminUpdateArticle(id, patch, { actorUserId } = {}) {
  const before = await helpRepo.findArticleById(id);
  if (!before) throw Object.assign(new Error('Không tìm thấy bài viết'), { status: 404 });

  const cleaned = { ...patch };
  if (cleaned.body_html !== undefined || cleaned.bodyHtml !== undefined) {
    const raw = cleaned.body_html ?? cleaned.bodyHtml;
    cleaned.body_html = raw == null || raw === '' ? null : sanitizeHelpHtml(raw);
    delete cleaned.bodyHtml;
  }

  // Keep translation pairing when VN slug changes.
  if (
    cleaned.slug
    && cleaned.slug !== before.slug
    && (before.locale || 'vi') === 'vi'
  ) {
    await helpRepo.cascadeSlugChange(before.slug, cleaned.slug);
  }

  const updated = await helpRepo.updateArticle(id, cleaned);

  const contentTouched =
    cleaned.title !== undefined
    || cleaned.summary !== undefined
    || cleaned.body_md !== undefined
    || cleaned.bodyMd !== undefined
    || cleaned.body_html !== undefined
    || cleaned.bodyHtml !== undefined
    || cleaned.feature_key !== undefined
    || cleaned.featureKey !== undefined
    || cleaned.primary_route !== undefined
    || cleaned.primaryRoute !== undefined;

  if ((before.locale || 'vi') === 'vi' && contentTouched) {
    await helpRepo.markTranslationsStale(updated.slug || before.slug);
  }

  const bodyChanged =
    cleaned.body_md !== undefined ||
    cleaned.bodyMd !== undefined ||
    cleaned.body_html !== undefined ||
    cleaned.bodyHtml !== undefined;
  const publishChanged = cleaned.is_published !== undefined || cleaned.isPublished !== undefined;
  const nowPublished = updated.is_published;

  if (nowPublished && (bodyChanged || publishChanged || !(await helpRepo.countChunksByArticleId(id)))) {
    await reindexArticle(id, { actorUserId });
  } else if (!nowPublished) {
    _clearCapabilityMapCache();
  } else if (bodyChanged) {
    await reindexArticle(id, { actorUserId });
  } else {
    _clearCapabilityMapCache();
  }
  return updated;
}

export async function adminDeleteArticle(id) {
  await helpRepo.deleteArticle(id);
  _clearCapabilityMapCache();
}

export async function searchHelpChunks(question, {
  userId = null,
  limit = 5,
  minSimilarity = 0.35,
  locale = 'vi',
} = {}) {
  let embedding = null;
  try {
    embedding = await embedText(question, {
      userId,
      feature: 'embedding_help',
    });
  } catch (err) {
    console.warn('[help] query embed failed — falling back to keyword:', err?.message || err);
  }

  let chunks = [];
  if (embedding) {
    chunks = await helpRepo.searchPublishedChunks(embedding, {
      limit,
      minSimilarity,
      locale: normalizeLocale(locale),
    });
  }
  if (!chunks.length) {
    const keywordHits = await helpRepo.searchPublishedChunksByKeyword(question, {
      limit,
      locale: normalizeLocale(locale),
    });
    // Dedupe by article_id, keep first keyword hits.
    const seen = new Set();
    chunks = [];
    for (const row of keywordHits) {
      const key = row.article_id;
      if (seen.has(key)) continue;
      seen.add(key);
      chunks.push(row);
      if (chunks.length >= limit) break;
    }
  }
  const topSimilarity = chunks.length ? Number(chunks[0].similarity) : 0;
  return { chunks, topSimilarity };
}

export { helpRepo };
