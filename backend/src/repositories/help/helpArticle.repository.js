import db from '../../config/database.js';

/** @type {'vector'|'jsonb'|null} */
let embeddingStorage = null;

const ARTICLE_COLS = `id, slug, title, summary, body_md, body_html, feature_key, primary_route,
            sort_order, is_published, locale, is_stale, source_locale, translated_at,
            created_at, updated_at`;

function normalizeLocale(locale) {
  return String(locale || 'vi').trim().toLowerCase() === 'en' ? 'en' : 'vi';
}

async function detectEmbeddingStorage(queryable = db) {
  if (embeddingStorage) return embeddingStorage;
  const { rows } = await queryable.query(
    `SELECT udt_name
     FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'help_article_chunks'
       AND column_name = 'embedding'
     LIMIT 1`
  );
  const udt = rows[0]?.udt_name;
  embeddingStorage = udt === 'vector' ? 'vector' : 'jsonb';
  return embeddingStorage;
}

/** @internal test helper */
export function _resetEmbeddingStorageCache() {
  embeddingStorage = null;
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || !a.length || a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    const x = Number(a[i]) || 0;
    const y = Number(b[i]) || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}

function parseEmbedding(value) {
  if (Array.isArray(value)) return value.map(Number);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map(Number) : [];
    } catch {
      return [];
    }
  }
  return [];
}

export async function listArticles({ publishedOnly = false, locale = null, queryable = db } = {}) {
  const params = [];
  const where = [];
  if (publishedOnly) where.push('is_published = TRUE');
  if (locale) {
    params.push(normalizeLocale(locale));
    where.push(`locale = $${params.length}`);
  }
  const { rows } = await queryable.query(
    `SELECT ${ARTICLE_COLS}
     FROM help_articles
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY sort_order ASC, id ASC`,
    params
  );
  return rows;
}

/**
 * One row per slug: prefer target locale, else vi (then any).
 */
export async function listArticlesPreferLocale({
  locale = 'vi',
  publishedOnly = true,
  queryable = db,
} = {}) {
  const target = normalizeLocale(locale);
  // DISTINCT ON requires ORDER BY slug first (locale pick), then re-sort by sort_order.
  const { rows } = await queryable.query(
    `SELECT * FROM (
       SELECT DISTINCT ON (slug) ${ARTICLE_COLS}
       FROM help_articles
       ${publishedOnly ? 'WHERE is_published = TRUE' : ''}
       ORDER BY slug,
                (locale = $1) DESC,
                (locale = 'vi') DESC,
                sort_order ASC,
                id ASC
     ) t
     ORDER BY sort_order ASC, id ASC`,
    [target]
  );
  return rows;
}

export async function findArticleBySlug(slug, {
  locale = 'vi',
  publishedOnly = false,
  queryable = db,
  fallbackVi = true,
} = {}) {
  const target = normalizeLocale(locale);
  const publishedClause = publishedOnly ? 'AND is_published = TRUE' : '';

  const { rows } = await queryable.query(
    `SELECT ${ARTICLE_COLS}
     FROM help_articles
     WHERE slug = $1 AND locale = $2
       ${publishedClause}
     LIMIT 1`,
    [slug, target]
  );
  if (rows[0]) return rows[0];
  if (!fallbackVi || target === 'vi') return null;

  const fallback = await queryable.query(
    `SELECT ${ARTICLE_COLS}
     FROM help_articles
     WHERE slug = $1 AND locale = 'vi'
       ${publishedClause}
     LIMIT 1`,
    [slug]
  );
  return fallback.rows[0] || null;
}

export async function findArticleById(id, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT ${ARTICLE_COLS}
     FROM help_articles WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function findArticleByFeatureKey(featureKey, {
  locale = 'vi',
  publishedOnly = true,
  queryable = db,
  fallbackVi = true,
} = {}) {
  const target = normalizeLocale(locale);
  const publishedClause = publishedOnly ? 'AND is_published = TRUE' : '';

  const { rows } = await queryable.query(
    `SELECT ${ARTICLE_COLS}
     FROM help_articles
     WHERE feature_key = $1 AND locale = $2
       ${publishedClause}
     ORDER BY sort_order ASC, id ASC
     LIMIT 1`,
    [featureKey, target]
  );
  if (rows[0]) return rows[0];
  if (!fallbackVi || target === 'vi') return null;

  const fallback = await queryable.query(
    `SELECT ${ARTICLE_COLS}
     FROM help_articles
     WHERE feature_key = $1 AND locale = 'vi'
       ${publishedClause}
     ORDER BY sort_order ASC, id ASC
     LIMIT 1`,
    [featureKey]
  );
  return fallback.rows[0] || null;
}

export async function createArticle(payload, queryable = db) {
  const { rows } = await queryable.query(
    `INSERT INTO help_articles
       (slug, title, summary, body_md, body_html, feature_key, primary_route, sort_order,
        is_published, locale, is_stale, source_locale, translated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING *`,
    [
      payload.slug,
      payload.title,
      payload.summary || '',
      payload.body_md || payload.bodyMd || '',
      payload.body_html || payload.bodyHtml || null,
      payload.feature_key || payload.featureKey,
      payload.primary_route || payload.primaryRoute || null,
      payload.sort_order ?? payload.sortOrder ?? 0,
      payload.is_published ?? payload.isPublished ?? false,
      normalizeLocale(payload.locale || 'vi'),
      Boolean(payload.is_stale ?? payload.isStale ?? false),
      payload.source_locale || payload.sourceLocale || null,
      payload.translated_at || payload.translatedAt || null,
    ]
  );
  return rows[0];
}

export async function updateArticle(id, patch, queryable = db) {
  const fields = [];
  const values = [];
  let i = 1;
  const map = {
    slug: 'slug',
    title: 'title',
    summary: 'summary',
    body_md: 'body_md',
    bodyMd: 'body_md',
    body_html: 'body_html',
    bodyHtml: 'body_html',
    feature_key: 'feature_key',
    featureKey: 'feature_key',
    primary_route: 'primary_route',
    primaryRoute: 'primary_route',
    sort_order: 'sort_order',
    sortOrder: 'sort_order',
    is_published: 'is_published',
    isPublished: 'is_published',
    locale: 'locale',
    is_stale: 'is_stale',
    isStale: 'is_stale',
    source_locale: 'source_locale',
    sourceLocale: 'source_locale',
    translated_at: 'translated_at',
    translatedAt: 'translated_at',
  };
  for (const [key, col] of Object.entries(map)) {
    if (patch[key] !== undefined) {
      let value = patch[key];
      if (col === 'locale') value = normalizeLocale(value);
      if (col === 'is_stale') value = Boolean(value);
      fields.push(`${col} = $${i++}`);
      values.push(value);
    }
  }
  if (!fields.length) return findArticleById(id, queryable);
  fields.push('updated_at = NOW()');
  values.push(id);
  const { rows } = await queryable.query(
    `UPDATE help_articles SET ${fields.join(', ')} WHERE id = $${i} RETURNING *`,
    values
  );
  return rows[0] || null;
}

export async function markTranslationsStale(slug, queryable = db) {
  await queryable.query(
    `UPDATE help_articles
     SET is_stale = TRUE, updated_at = NOW()
     WHERE slug = $1 AND locale <> 'vi'`,
    [slug]
  );
}

export async function cascadeSlugChange(oldSlug, newSlug, queryable = db) {
  if (!oldSlug || !newSlug || oldSlug === newSlug) return;
  await queryable.query(
    `UPDATE help_articles SET slug = $2, updated_at = NOW() WHERE slug = $1`,
    [oldSlug, newSlug]
  );
}

export async function deleteArticle(id, queryable = db) {
  // Find the article to get its slug
  const { rows } = await queryable.query(`SELECT slug FROM help_articles WHERE id = $1`, [id]);
  if (!rows[0]) return;
  const { slug } = rows[0];

  // Delete all articles with the same slug (both VI and EN)
  await queryable.query(`DELETE FROM help_articles WHERE slug = $1`, [slug]);
}

export async function listMedia(articleId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT id, article_id, type, url, caption, sort_order
     FROM help_article_media WHERE article_id = $1 ORDER BY sort_order, id`,
    [articleId]
  );
  return rows;
}

export async function addMedia(articleId, { type, url, caption, sortOrder = 0 }, queryable = db) {
  const { rows } = await queryable.query(
    `INSERT INTO help_article_media (article_id, type, url, caption, sort_order)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [articleId, type, url, caption || null, sortOrder]
  );
  return rows[0];
}

export async function deleteMedia(id, queryable = db) {
  await queryable.query(`DELETE FROM help_article_media WHERE id = $1`, [id]);
}

export async function deleteMediaByArticleId(articleId, queryable = db) {
  await queryable.query(`DELETE FROM help_article_media WHERE article_id = $1`, [articleId]);
}

export async function deleteChunksByArticleId(articleId, queryable = db) {
  await queryable.query(`DELETE FROM help_article_chunks WHERE article_id = $1`, [articleId]);
}

export async function insertChunks(articleId, chunks, queryable = db) {
  const mode = await detectEmbeddingStorage(queryable);
  const inserted = [];
  for (const chunk of chunks) {
    const hasEmbedding = chunk.embedding != null;
    const embeddingParam = hasEmbedding ? JSON.stringify(chunk.embedding) : null;
    let sql;
    if (!hasEmbedding) {
      sql = `INSERT INTO help_article_chunks (article_id, chunk_index, content_text, embedding)
             VALUES ($1, $2, $3, NULL)
             RETURNING id, article_id, chunk_index, content_text`;
    } else if (mode === 'vector') {
      sql = `INSERT INTO help_article_chunks (article_id, chunk_index, content_text, embedding)
             VALUES ($1, $2, $3, $4::vector)
             RETURNING id, article_id, chunk_index, content_text`;
    } else {
      sql = `INSERT INTO help_article_chunks (article_id, chunk_index, content_text, embedding)
             VALUES ($1, $2, $3, $4::jsonb)
             RETURNING id, article_id, chunk_index, content_text`;
    }
    const params = hasEmbedding
      ? [articleId, chunk.chunkIndex, chunk.contentText, embeddingParam]
      : [articleId, chunk.chunkIndex, chunk.contentText];
    const { rows } = await queryable.query(sql, params);
    inserted.push(rows[0]);
  }
  return inserted;
}

export async function countChunksByArticleId(articleId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT COUNT(*)::int AS total FROM help_article_chunks WHERE article_id = $1`,
    [articleId]
  );
  return Number(rows[0]?.total) || 0;
}

export async function countPendingEmbedChunks(articleId, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT COUNT(*)::int AS total
     FROM help_article_chunks
     WHERE article_id = $1 AND embedding IS NULL`,
    [articleId]
  );
  return Number(rows[0]?.total) || 0;
}

/**
 * Published articles that still need embedding backfill:
 * - has at least one chunk with NULL embedding, or
 * - published with zero chunks AND non-empty body (empty body never produces chunks).
 *
 * @param {{ limit?: number }} [opts]
 * @returns {Promise<Array<{ id: number }>>}
 */
export async function listArticlesWithPendingEmbedding({ limit = 20 } = {}, queryable = db) {
  const safeLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 20, 1), 100);
  const { rows } = await queryable.query(
    `SELECT a.id
     FROM help_articles a
     LEFT JOIN help_article_chunks c ON c.article_id = a.id
     WHERE a.is_published = TRUE
     GROUP BY a.id, a.body_md, a.body_html
     HAVING
       COUNT(c.id) FILTER (WHERE c.embedding IS NULL) > 0
       OR (
         COUNT(c.id) = 0
         AND (
           LENGTH(TRIM(COALESCE(a.body_md, ''))) > 0
           OR LENGTH(TRIM(COALESCE(a.body_html, ''))) > 0
         )
       )
     ORDER BY a.id ASC
     LIMIT $1`,
    [safeLimit]
  );
  return rows;
}

async function searchPublishedChunksForLocale(queryEmbedding, {
  locale,
  limit = 5,
  minSimilarity = 0.45,
  queryable = db,
}) {
  const mode = await detectEmbeddingStorage(queryable);
  const target = normalizeLocale(locale);

  if (mode === 'vector') {
    const { rows } = await queryable.query(
      `SELECT c.content_text, c.chunk_index, c.article_id,
              a.slug, a.title, a.feature_key, a.locale,
              1 - (c.embedding <=> $1::vector) AS similarity
       FROM help_article_chunks c
       JOIN help_articles a ON a.id = c.article_id
       WHERE a.is_published = TRUE
         AND a.locale = $4
         AND c.embedding IS NOT NULL
         AND 1 - (c.embedding <=> $1::vector) >= $2
       ORDER BY c.embedding <=> $1::vector
       LIMIT $3`,
      [JSON.stringify(queryEmbedding), minSimilarity, limit, target]
    );
    return rows;
  }

  const { rows } = await queryable.query(
    `SELECT c.content_text, c.chunk_index, c.article_id, c.embedding,
            a.slug, a.title, a.feature_key, a.locale
     FROM help_article_chunks c
     JOIN help_articles a ON a.id = c.article_id
     WHERE a.is_published = TRUE
       AND a.locale = $1
       AND c.embedding IS NOT NULL`,
    [target]
  );

  return rows
    .map((row) => ({
      content_text: row.content_text,
      chunk_index: row.chunk_index,
      article_id: row.article_id,
      slug: row.slug,
      title: row.title,
      feature_key: row.feature_key,
      locale: row.locale,
      similarity: cosineSimilarity(queryEmbedding, parseEmbedding(row.embedding)),
    }))
    .filter((row) => row.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/**
 * Semantic search — prefer locale chunks; if zero hits and locale≠vi, retry vi.
 */
export async function searchPublishedChunks(queryEmbedding, {
  limit = 5,
  minSimilarity = 0.45,
  locale = 'vi',
  queryable = db,
} = {}) {
  const target = normalizeLocale(locale);
  const primary = await searchPublishedChunksForLocale(queryEmbedding, {
    locale: target,
    limit,
    minSimilarity,
    queryable,
  });
  if (primary.length || target === 'vi') return primary;
  return searchPublishedChunksForLocale(queryEmbedding, {
    locale: 'vi',
    limit,
    minSimilarity,
    queryable,
  });
}

function keywordTokens(question = '') {
  return String(question || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/i)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 8);
}

/**
 * Keyword fallback when vector search returns empty.
 * ILIKE on content_text + title; locale filter with vi fallback.
 */
export async function searchPublishedChunksByKeyword(question, {
  limit = 5,
  locale = 'vi',
  queryable = db,
} = {}) {
  const tokens = keywordTokens(question);
  if (!tokens.length) return [];

  const target = normalizeLocale(locale);
  const run = async (loc) => {
    const params = [loc];
    const likes = tokens.map((token) => {
      params.push(`%${token}%`);
      const i = params.length;
      return `(c.content_text ILIKE $${i} OR a.title ILIKE $${i})`;
    });
    params.push(limit);
    const { rows } = await queryable.query(
      `SELECT c.content_text, c.chunk_index, c.article_id,
              a.slug, a.title, a.feature_key, a.locale,
              0.4::float AS similarity
       FROM help_article_chunks c
       JOIN help_articles a ON a.id = c.article_id
       WHERE a.is_published = TRUE
         AND a.locale = $1
         AND (${likes.join(' OR ')})
       ORDER BY c.article_id, c.chunk_index
       LIMIT $${params.length}`,
      params
    );
    return rows;
  };

  const primary = await run(target);
  if (primary.length || target === 'vi') return primary;
  return run('vi');
}

export async function insertUnanswered({ question, userId = null, topSimilarity = null }, queryable = db) {
  const { rows } = await queryable.query(
    `INSERT INTO help_unanswered (question, user_id, top_similarity)
     VALUES ($1, $2, $3) RETURNING *`,
    [question, userId, topSimilarity]
  );
  return rows[0];
}

export async function listUnansweredGrouped({ limit = 50, queryable = db } = {}) {
  const { rows } = await queryable.query(
    `SELECT question,
            COUNT(*)::int AS ask_count,
            MAX(asked_at) AS last_asked_at,
            AVG(top_similarity) AS avg_similarity
     FROM help_unanswered
     GROUP BY question
     ORDER BY ask_count DESC, last_asked_at DESC
     LIMIT $1`,
    [limit]
  );
  return rows;
}

export { normalizeLocale };
