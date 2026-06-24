import { paginate } from '../../helpers.js';
import productRepository from '../../repositories/products/product.repository.js';
import businessProfileService from '../ai/businessProfile.service.js';

class ProductService {
  normalizeStatus(rawStatus) {
    const status = typeof rawStatus === 'string' ? rawStatus.trim().toLowerCase() : '';
    return status || 'active';
  }

  mapProduct(row) {
    return {
      id: row.id,
      productCode: row.product_code,
      productName: row.product_name,
      price: row.price || '',
      originalPrice: row.original_price || '',
      status: this.normalizeStatus(row.status),
      description: row.description,
      usp: row.usp,
      category: row.category,
      thumbnailUrl: row.thumbnail_url,
      productUrl: row.product_url,
      targetAudience: row.target_audience,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  parseStatuses(rawStatus) {
    return String(rawStatus || '')
      .split(',')
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean)
      .map((item) => this.normalizeStatus(item))
      .filter((item, idx, arr) => item && arr.indexOf(item) === idx);
  }

  resolveOwnerId(user) {
    if (user.activeContext?.type === 'employee') {
      return Number(user.activeContext.ownerId);
    }
    return Number(user.id);
  }

  assertOwnership(row, user) {
    if (!row) {
      const error = new Error('Không tìm thấy sản phẩm');
      error.status = 404;
      throw error;
    }

    const isOwner = Number(row.id_user) === Number(user.id);
    const isContextOwner =
      user.activeContext?.type === 'employee' && Number(row.id_user) === Number(user.activeContext.ownerId);
    const isAdmin = user.role === 'admin';

    if (!isAdmin && !isOwner && !isContextOwner) {
      const error = new Error('Bạn không có quyền truy cập sản phẩm này');
      error.status = 403;
      throw error;
    }
  }

  async getAll({ query, user }) {
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 20));
    const offset = (page - 1) * limit;
    const search = (query.search || '').trim();
    const category = (query.category || '').trim();
    const statuses = this.parseStatuses(query.status);

    const { rows, total } = await productRepository.list({
      userId: user.id,
      role: user.role,
      activeContext: user.activeContext,
      search,
      category,
      statuses,
      limit,
      offset,
    });

    return {
      products: rows.map((row) => this.mapProduct(row)),
      pagination: paginate(page, limit, total),
    };
  }

  async getById({ productId, user }) {
    const row = await productRepository.findById(productId);
    this.assertOwnership(row, user);
    return this.mapProduct(row);
  }

  async getCategories({ user }) {
    const ownerId = this.resolveOwnerId(user);
    return productRepository.listCategories(ownerId);
  }

  async create({ payload, user }) {
    const productName = String(payload.productName || '').trim();
    if (!productName) {
      const error = new Error('Tên sản phẩm không được để trống');
      error.status = 400;
      throw error;
    }

    const ownerId = this.resolveOwnerId(user);
    const id = await productRepository.insert({
      userId: ownerId,
      productCode: payload.productCode?.trim() || null,
      productName,
      description: payload.description?.trim() || null,
      usp: payload.usp?.trim() || null,
      price: payload.price?.trim() || null,
      originalPrice: payload.originalPrice?.trim() || null,
      category: payload.category?.trim() || null,
      thumbnailUrl: payload.thumbnailUrl?.trim() || null,
      productUrl: payload.productUrl?.trim() || null,
      targetAudience: payload.targetAudience?.trim() || null,
      status: this.normalizeStatus(payload.status),
    });

    await businessProfileService.reembedChunks(ownerId).catch((e) => {
      console.warn('[Products] re-embed sau create thất bại:', e?.message || e);
    });

    return this.getById({ productId: id, user });
  }

  async update({ productId, payload, user }) {
    const row = await productRepository.findById(productId);
    this.assertOwnership(row, user);

    const productName = String(payload.productName ?? row.product_name ?? '').trim();
    if (!productName) {
      const error = new Error('Tên sản phẩm không được để trống');
      error.status = 400;
      throw error;
    }

    await productRepository.update(productId, {
      productCode: payload.productCode !== undefined ? (payload.productCode?.trim() || null) : row.product_code,
      productName,
      price: payload.price !== undefined ? (payload.price?.trim() || null) : row.price,
      originalPrice: payload.originalPrice !== undefined ? (payload.originalPrice?.trim() || null) : row.original_price,
      description: payload.description !== undefined ? (payload.description?.trim() || null) : row.description,
      usp: payload.usp !== undefined ? (payload.usp?.trim() || null) : row.usp,
      category: payload.category !== undefined ? (payload.category?.trim() || null) : row.category,
      thumbnailUrl: payload.thumbnailUrl !== undefined ? (payload.thumbnailUrl?.trim() || null) : row.thumbnail_url,
      productUrl: payload.productUrl !== undefined ? (payload.productUrl?.trim() || null) : row.product_url,
      targetAudience: payload.targetAudience !== undefined ? (payload.targetAudience?.trim() || null) : row.target_audience,
      status: payload.status !== undefined ? this.normalizeStatus(payload.status) : this.normalizeStatus(row.status),
    });

    await businessProfileService.reembedChunks(row.id_user).catch((e) => {
      console.warn('[Products] re-embed sau update thất bại:', e?.message || e);
    });

    return this.getById({ productId, user });
  }

  async remove({ productId, user }) {
    const row = await productRepository.findById(productId);
    this.assertOwnership(row, user);
    const deleted = await productRepository.deleteById(productId);
    if (!deleted) {
      const error = new Error('Không thể xóa sản phẩm');
      error.status = 500;
      throw error;
    }

    await businessProfileService.reembedChunks(row.id_user).catch((e) => {
      console.warn('[Products] re-embed sau delete thất bại:', e?.message || e);
    });

    return { id: productId };
  }
}

export default new ProductService();
