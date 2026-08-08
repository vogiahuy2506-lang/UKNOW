/**
 * One-shot seed for help center Nhóm 1.
 * Usage: node src/scripts/seedHelpArticles.js
 * Optional: REINDEX_HELP=1 to embed after insert (requires GEMINI_API_KEY).
 */
import 'dotenv/config';
import { seedHelpArticles } from '../services/help/helpSeed.service.js';

const reindex = String(process.env.REINDEX_HELP || '') === '1';

try {
  const result = await seedHelpArticles({ reindex });
  console.log('[seedHelpArticles] done', { reindex, count: result.length, result });
  process.exit(0);
} catch (err) {
  console.error('[seedHelpArticles] failed', err);
  process.exit(1);
}
