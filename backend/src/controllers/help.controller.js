import {
  listPublicArticles,
  getPublicArticleBySlug,
  adminListArticles,
  adminGetArticle,
  adminCreateArticle,
  adminUpdateArticle,
  adminDeleteArticle,
  reindexArticle,
} from '../services/help/helpCenter.service.js';
import * as helpRepo from '../repositories/help/helpArticle.repository.js';

export async function listPublic(req, res) {
  try {
    const result = await listPublicArticles();
    res.json({ success: true, result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
  }
}

export async function getPublicBySlug(req, res) {
  try {
    const result = await getPublicArticleBySlug(req.params.slug);
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

export async function adminGet(req, res) {
  try {
    const result = await adminGetArticle(Number(req.params.id));
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
    const result = await adminUpdateArticle(Number(req.params.id), req.body || {}, {
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
    await adminDeleteArticle(Number(req.params.id));
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
  }
}

export async function adminReindex(req, res) {
  try {
    const result = await reindexArticle(Number(req.params.id), { actorUserId: req.user.id });
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
      },
    });
  } catch (err) {
    console.error(err);
    res.status(err.status || 500).json({ success: false, message: err.message || 'Lỗi server' });
  }
}
