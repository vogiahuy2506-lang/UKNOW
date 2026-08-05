import db from '../../config/database.js';

/** @type {'vector'|'jsonb'|null} */
let embeddingStorage = null;

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

export async function listArticles({ publishedOnly = false, queryable = db } = {}) {
  const { rows } = await queryable.query(
    `SELECT id, slug, title, summary, body_md, body_html, feature_key, primary_route,
            sort_order, is_published, created_at, updated_at
     FROM help_articles
     ${publishedOnly ? 'WHERE is_published = TRUE' : ''}
     ORDER BY sort_order ASC, id ASC`
  );
  return rows;
}

export async function findArticleBySlug(slug, { publishedOnly = false, queryable = db } = {}) {
  const { rows } = await queryable.query(
    `SELECT id, slug, title, summary, body_md, body_html, feature_key, primary_route,
            sort_order, is_published, created_at, updated_at
     FROM help_articles
     WHERE slug = $1
       ${publishedOnly ? 'AND is_published = TRUE' : ''}
     LIMIT 1`,
    [slug]
  );
  return rows[0] || null;
}

export async function findArticleById(id, queryable = db) {
  const { rows } = await queryable.query(
    `SELECT id, slug, title, summary, body_md, body_html, feature_key, primary_route,
            sort_order, is_published, created_at, updated_at
     FROM help_articles WHERE id = $1 LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

export async function findArticleByFeatureKey(featureKey, { publishedOnly = true, queryable = db } = {}) {
  const { rows } = await queryable.query(
    `SELECT id, slug, title, summary, body_md, body_html, feature_key, primary_route, is_published
     FROM help_articles
     WHERE feature_key = $1
       ${publishedOnly ? 'AND is_published = TRUE' : ''}
     ORDER BY sort_order ASC, id ASC
     LIMIT 1`,
    [featureKey]
  );
  return rows[0] || null;
}

export async function createArticle(payload, queryable = db) {
  const { rows } = await queryable.query(
    `INSERT INTO help_articles
       (slug, title, summary, body_md, body_html, feature_key, primary_route, sort_order, is_published)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
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
  };
  for (const [key, col] of Object.entries(map)) {
    if (patch[key] !== undefined) {
      fields.push(`${col} = $${i++}`);
      values.push(patch[key]);
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

export async function deleteArticle(id, queryable = db) {
  await queryable.query(`DELETE FROM help_articles WHERE id = $1`, [id]);
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

export async function deleteChunksByArticleId(articleId, queryable = db) {
  await queryable.query(`DELETE FROM help_article_chunks WHERE article_id = $1`, [articleId]);
}

export async function insertChunks(articleId, chunks, queryable = db) {
  const mode = await detectEmbeddingStorage(queryable);
  const inserted = [];
  for (const chunk of chunks) {
    const embeddingLiteral = JSON.stringify(chunk.embedding);
    const sql = mode === 'vector'
      ? `INSERT INTO help_article_chunks (article_id, chunk_index, content_text, embedding)
         VALUES ($1, $2, $3, $4::vector)
         RETURNING id, article_id, chunk_index, content_text`
      : `INSERT INTO help_article_chunks (article_id, chunk_index, content_text, embedding)
         VALUES ($1, $2, $3, $4::jsonb)
         RETURNING id, article_id, chunk_index, content_text`;
    const { rows } = await queryable.query(sql, [
      articleId,
      chunk.chunkIndex,
      chunk.contentText,
      embeddingLiteral,
    ]);
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

/**
 * Semantic search — only published articles.
 * Production (vector): pgvector cosine. Test bootstrap (jsonb): JS cosine.
 */
export async function searchPublishedChunks(queryEmbedding, {
  limit = 5,
  minSimilarity = 0.45,
  queryable = db,
} = {}) {
  const mode = await detectEmbeddingStorage(queryable);

  if (mode === 'vector') {
    const { rows } = await queryable.query(
      `SELECT c.content_text, c.chunk_index, c.article_id,
              a.slug, a.title, a.feature_key,
              1 - (c.embedding <=> $1::vector) AS similarity
       FROM help_article_chunks c
       JOIN help_articles a ON a.id = c.article_id
       WHERE a.is_published = TRUE
         AND c.embedding IS NOT NULL
         AND 1 - (c.embedding <=> $1::vector) >= $2
       ORDER BY c.embedding <=> $1::vector
       LIMIT $3`,
      [JSON.stringify(queryEmbedding), minSimilarity, limit]
    );
    return rows;
  }

  const { rows } = await queryable.query(
    `SELECT c.content_text, c.chunk_index, c.article_id, c.embedding,
            a.slug, a.title, a.feature_key
     FROM help_article_chunks c
     JOIN help_articles a ON a.id = c.article_id
     WHERE a.is_published = TRUE
       AND c.embedding IS NOT NULL`
  );

  return rows
    .map((row) => ({
      content_text: row.content_text,
      chunk_index: row.chunk_index,
      article_id: row.article_id,
      slug: row.slug,
      title: row.title,
      feature_key: row.feature_key,
      similarity: cosineSimilarity(queryEmbedding, parseEmbedding(row.embedding)),
    }))
    .filter((row) => row.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
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
