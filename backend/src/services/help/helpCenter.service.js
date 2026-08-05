import { embedText, embedTexts } from '../../utils/embeddingClient.util.js';
import { chunkHelpMarkdown, buildCapabilityMap } from '../../utils/helpCenter.util.js';
import * as helpRepo from '../../repositories/help/helpArticle.repository.js';

let capabilityMapCache = { text: '', builtAt: 0, fingerprint: '' };

function articlesFingerprint(articles) {
  return articles
    .map((a) => `${a.id}:${a.updated_at || a.updatedAt || ''}:${a.is_published}`)
    .join('|');
}

export function _clearCapabilityMapCache() {
  capabilityMapCache = { text: '', builtAt: 0, fingerprint: '' };
}

export async function getCapabilityMapText() {
  const articles = await helpRepo.listArticles({ publishedOnly: true });
  const fingerprint = articlesFingerprint(articles);
  if (capabilityMapCache.text && capabilityMapCache.fingerprint === fingerprint) {
    return capabilityMapCache.text;
  }
  const text = buildCapabilityMap(articles);
  capabilityMapCache = { text, builtAt: Date.now(), fingerprint };
  return text;
}

/**
 * Re-embed a single article (delete old chunks → chunk → embed → insert).
 */
export async function reindexArticle(articleId, { actorUserId = null } = {}) {
  const article = await helpRepo.findArticleById(articleId);
  if (!article) {
    throw Object.assign(new Error('Không tìm thấy bài viết'), { status: 404 });
  }

  const pieces = chunkHelpMarkdown(article.body_md);
  await helpRepo.deleteChunksByArticleId(articleId);

  if (!pieces.length) {
    _clearCapabilityMapCache();
    return { articleId, chunkCount: 0 };
  }

  const embeddings = await embedTexts(pieces, {
    userId: actorUserId || null,
    feature: 'embedding_help',
  });

  const rows = pieces.map((contentText, index) => ({
    chunkIndex: index,
    contentText,
    embedding: embeddings[index],
  }));
  await helpRepo.insertChunks(articleId, rows);
  _clearCapabilityMapCache();
  return { articleId, chunkCount: rows.length };
}

export async function listPublicArticles() {
  const articles = await helpRepo.listArticles({ publishedOnly: true });
  return articles.map((a) => ({
    id: a.id,
    slug: a.slug,
    title: a.title,
    summary: a.summary,
    featureKey: a.feature_key,
    primaryRoute: a.primary_route,
    sortOrder: a.sort_order,
  }));
}

export async function getPublicArticleBySlug(slug) {
  const article = await helpRepo.findArticleBySlug(slug, { publishedOnly: true });
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
    featureKey: article.feature_key,
    primaryRoute: article.primary_route,
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
  return { ...article, media, chunkCount };
}

export async function adminCreateArticle(payload, { actorUserId } = {}) {
  const created = await helpRepo.createArticle(payload);
  if (created.is_published) {
    await reindexArticle(created.id, { actorUserId });
  }
  _clearCapabilityMapCache();
  return created;
}

export async function adminUpdateArticle(id, patch, { actorUserId } = {}) {
  const before = await helpRepo.findArticleById(id);
  if (!before) throw Object.assign(new Error('Không tìm thấy bài viết'), { status: 404 });

  const updated = await helpRepo.updateArticle(id, patch);
  const bodyChanged = patch.body_md !== undefined || patch.bodyMd !== undefined;
  const publishChanged = patch.is_published !== undefined || patch.isPublished !== undefined;
  const nowPublished = updated.is_published;

  if (nowPublished && (bodyChanged || publishChanged || !(await helpRepo.countChunksByArticleId(id)))) {
    await reindexArticle(id, { actorUserId });
  } else if (!nowPublished) {
    // Unpublish: keep chunks but RAG filters is_published — clear map cache
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

export async function searchHelpChunks(question, { userId = null, limit = 5, minSimilarity = 0.45 } = {}) {
  const embedding = await embedText(question, {
    userId,
    feature: 'embedding_help',
  });
  const chunks = await helpRepo.searchPublishedChunks(embedding, { limit, minSimilarity });
  const topSimilarity = chunks.length ? Number(chunks[0].similarity) : 0;
  return { chunks, topSimilarity };
}

export { helpRepo };
