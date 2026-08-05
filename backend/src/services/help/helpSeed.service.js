import HELP_SEED_ARTICLES from './helpSeed.data.js';
import * as helpRepo from '../../repositories/help/helpArticle.repository.js';
import { reindexArticle } from './helpCenter.service.js';

/**
 * Upsert Nhóm-1 articles. Optionally reindex embeddings (needs GEMINI_API_KEY).
 */
export async function seedHelpArticles({ reindex = false, actorUserId = null } = {}) {
  const results = [];
  for (const article of HELP_SEED_ARTICLES) {
    const existing = await helpRepo.findArticleBySlug(article.slug);
    let row;
    if (existing) {
      row = await helpRepo.updateArticle(existing.id, {
        ...article,
        is_published: true,
      });
    } else {
      row = await helpRepo.createArticle({
        ...article,
        is_published: true,
      });
    }
    if (reindex) {
      const idx = await reindexArticle(row.id, { actorUserId });
      results.push({ slug: row.slug, id: row.id, ...idx });
    } else {
      results.push({ slug: row.slug, id: row.id, chunkCount: null });
    }
  }
  return results;
}
