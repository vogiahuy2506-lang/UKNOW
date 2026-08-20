import { paginate } from '../../helpers.js';
import productRepository from '../../repositories/products/product.repository.js';
import businessProfileService from '../ai/businessProfile.service.js';
import { getWorkspaceContext } from '../../utils/workspaceContext.util.js';

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

  assertExists(row) {
    if (!row) {
      const error = new Error('Không tìm thấy sản phẩm');
      error.status = 404;
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

    const context = getWorkspaceContext(user);
    const { rows, total } = await productRepository.list({
      workspaceOwnerId: context.workspaceOwnerId,
      isAdmin: context.isSuperAdmin,
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
    const context = getWorkspaceContext(user);
    const row = await productRepository.findById(productId, {
      workspaceOwnerId: context.workspaceOwnerId,
      isAdmin: context.isSuperAdmin,
    });
    this.assertExists(row);
    return this.mapProduct(row);
  }

  async getCategories({ user }) {
    const { workspaceOwnerId } = getWorkspaceContext(user);
    return productRepository.listCategories(workspaceOwnerId);
  }

  async create({ payload, user }) {
    const productName = String(payload.productName || '').trim();
    if (!productName) {
      const error = new Error('Tên sản phẩm không được để trống');
      error.status = 400;
      throw error;
    }

    const { actorUserId, workspaceOwnerId } = getWorkspaceContext(user);
    const id = await productRepository.insert({
      workspaceOwnerId,
      createdBy: actorUserId,
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

    await businessProfileService.reembedChunks(workspaceOwnerId).catch((e) => {
      console.warn('[Products] re-embed sau create thất bại:', e?.message || e);
    });

    return this.getById({ productId: id, user });
  }

  async update({ productId, payload, user }) {
    const context = getWorkspaceContext(user);
    const row = await productRepository.findById(productId, {
      workspaceOwnerId: context.workspaceOwnerId,
      isAdmin: context.isSuperAdmin,
    });
    this.assertExists(row);
    const resourceOwnerId = Number(row.workspace_owner_id || row.id_user);

    const productName = String(payload.productName ?? row.product_name ?? '').trim();
    if (!productName) {
      const error = new Error('Tên sản phẩm không được để trống');
      error.status = 400;
      throw error;
    }

    await productRepository.update(productId, resourceOwnerId, {
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

    await businessProfileService.reembedChunks(resourceOwnerId).catch((e) => {
      console.warn('[Products] re-embed sau update thất bại:', e?.message || e);
    });

    return this.getById({ productId, user });
  }

  async remove({ productId, user }) {
    const context = getWorkspaceContext(user);
    const row = await productRepository.findById(productId, {
      workspaceOwnerId: context.workspaceOwnerId,
      isAdmin: context.isSuperAdmin,
    });
    this.assertExists(row);
    const resourceOwnerId = Number(row.workspace_owner_id || row.id_user);
    const deleted = await productRepository.deleteById(productId, resourceOwnerId);
    if (!deleted) {
      const error = new Error('Không thể xóa sản phẩm');
      error.status = 500;
      throw error;
    }

    await businessProfileService.reembedChunks(resourceOwnerId).catch((e) => {
      console.warn('[Products] re-embed sau delete thất bại:', e?.message || e);
    });

    return { id: productId };
  }
}

export default new ProductService();
