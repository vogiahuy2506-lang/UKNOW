import {
  listPublicArticles,
  getPublicArticleBySlug,
  adminListArticles,
  adminGetArticle,
  adminCreateArticle,
  adminUpdateArticle,
  adminDeleteArticle,
  reindexArticle,
  reindexPendingArticles,
} from '../services/help/helpCenter.service.js';
import { translateHelpArticle } from '../services/help/helpTranslate.service.js';
import * as helpRepo from '../repositories/help/helpArticle.repository.js';

function readLocale(req) {
  return String(req.query?.locale || req.body?.locale || 'vi').trim().toLowerCase() === 'en'
    ? 'en'
    : 'vi';
}

export async function listPublic(req, res) {
  try {
    const result = await listPublicArticles(readLocale(req));
    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
  }
}

export async function getPublicBySlug(req, res) {
  try {
    const result = await getPublicArticleBySlug(req.params.slug, readLocale(req));
    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
  }
}

export async function adminList(req, res) {
  try {
    const result = await adminListArticles();
    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
  }
}

/**
 * Ép :id về số nguyên dương. Ném 404 có thông điệp đọc được thay vì để `NaN`
 * chạy tới Postgres — ở đó nó bung ra `invalid input syntax for type bigint:
 * "NaN"`, vừa lộ chi tiết DB vừa không cho admin biết thật ra họ đã mở nhầm
 * đường dẫn (vd dán slug vào chỗ chờ id).
 *
 * @param {string} raw req.params.id
 * @returns {number}
 */
function parseArticleId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw { status: 404, message: `Không tìm thấy bài viết với id "${raw}". Đường dẫn sửa bài dùng id dạng số, không phải slug.` };
  }
  return id;
}

export async function adminGet(req, res) {
  try {
    const result = await adminGetArticle(parseArticleId(req.params.id));
    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
  }
}

export async function adminCreate(req, res) {
  try {
    const result = await adminCreateArticle(req.body || {}, { actorUserId: req.user.id });
    res.status(201).json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
  }
}

export async function adminUpdate(req, res) {
  try {
    const result = await adminUpdateArticle(parseArticleId(req.params.id), req.body || {}, {
      actorUserId: req.user.id,
    });
    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
  }
}

export async function adminRemove(req, res) {
  try {
    await adminDeleteArticle(parseArticleId(req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
  }
}

export async function adminReindex(req, res) {
  try {
    const result = await reindexArticle(parseArticleId(req.params.id), { actorUserId: req.user.id });
    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
  }
}

export async function adminReindexPending(req, res) {
  try {
    const limit = Number.parseInt(req.body?.limit ?? req.query?.limit, 10);
    const result = await reindexPendingArticles({
      limit: Number.isFinite(limit) ? limit : 20,
      actorUserId: req.user.id,
    });
    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
  }
}

export async function adminTranslate(req, res) {
  try {
    const locale = String(req.body?.locale || 'en').trim().toLowerCase() || 'en';
    const result = await translateHelpArticle(parseArticleId(req.params.id), {
      locale,
      actorUserId: req.user.id,
    });
    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
  }
}

export async function adminUnanswered(req, res) {
  try {
    const result = await helpRepo.listUnansweredGrouped({ limit: Number(req.query.limit) || 50 });
    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
  }
}

export async function adminSeed(req, res) {
  try {
    const { seedHelpArticles } = await import('../services/help/helpSeed.service.js');
    const reindex = Boolean(req.body?.reindex);
    const result = await seedHelpArticles({ reindex, actorUserId: req.user.id });
    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
  }
}

export async function resolveFeature(req, res) {
  try {
    const article = await helpRepo.findArticleByFeatureKey(req.params.featureKey, {
      publishedOnly: true,
      locale: readLocale(req),
    });
    if (!article) {
      return res.status(404).json({ success: false, message: 'Chưa có bài hướng dẫn cho màn hình này' });
    }
    res.json({
      success: true,
      result: {
        slug: article.slug,
        title: article.title,
        url: `/huong-dan/${article.slug}`,
        locale: article.locale || 'vi',
      },
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
  }
}
