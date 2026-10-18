import customerTagRepository from '../../repositories/customer/customerTag.repository.js';

export const CUSTOMER_TAG_NAME_MAX = 60;
/** Trần số tag mỗi workspace — chặn script tạo tag vô hạn. */
export const CUSTOMER_TAG_MAX_PER_WORKSPACE = 200;
/** Trần số khách mỗi lần gắn/bỏ tag hàng loạt. */
export const CUSTOMER_TAG_MAX_CUSTOMERS_PER_CALL = 5000;
/** Trần số tag mỗi lần gắn/bỏ (cũng là trần lọc `tagIds`). */
export const CUSTOMER_TAG_MAX_TAGS_PER_CALL = 50;

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function toPublicTag(row) {
  return {
    id: Number(row.id),
    name: row.name,
    color: row.color || null,
    ...(row.customer_count !== undefined ? { customerCount: Number(row.customer_count) } : {}),
  };
}

/** Danh sách id dương, bỏ trùng; sai kiểu → 400. Dùng cho body, query và config khối (T2/T3). */
export function normalizeIdList(value, { label, max }) {
  if (value === undefined || value === null || value === '') return [];
  const raw = Array.isArray(value) ? value : String(value).split(',');
  const ids = [];
  const seen = new Set();
  for (const item of raw) {
    const text = String(item).trim();
    if (!text) continue;
    if (!/^\d+$/.test(text) || Number(text) < 1 || !Number.isSafeInteger(Number(text))) {
      throw httpError(400, `${label} không hợp lệ`);
    }
    const id = Number(text);
    if (!seen.has(id)) {
      seen.add(id);
      ids.push(id);
    }
  }
  if (ids.length > max) throw httpError(400, `${label}: tối đa ${max} mục mỗi lần`);
  return ids;
}

class CustomerTagService {
  /** Gộp khoảng trắng, cắt hai đầu; rỗng hoặc quá dài → 400. */
  normalizeName(rawName) {
    const name = String(rawName ?? '').replace(/\s+/g, ' ').trim();
    if (!name) throw httpError(400, 'Tên tag không được để trống');
    if (name.length > CUSTOMER_TAG_NAME_MAX) {
      throw httpError(400, `Tên tag tối đa ${CUSTOMER_TAG_NAME_MAX} ký tự`);
    }
    return name;
  }

  /** `#rrggbb` hoặc rỗng (không màu). `undefined` = không đổi. */
  normalizeColor(rawColor) {
    if (rawColor === undefined) return undefined;
    if (rawColor === null || rawColor === '') return null;
    const color = String(rawColor).trim();
    if (!COLOR_PATTERN.test(color)) throw httpError(400, 'Màu tag phải có dạng #rrggbb');
    return color.toLowerCase();
  }

  async listTags(workspaceOwnerId) {
    const rows = await customerTagRepository.listWithCounts(workspaceOwnerId);
    return rows.map(toPublicTag);
  }

  async createTag(workspaceOwnerId, { name, color }) {
    const safeName = this.normalizeName(name);
    const safeColor = this.normalizeColor(color) ?? null;
    if (await customerTagRepository.findByName(workspaceOwnerId, safeName)) {
      throw httpError(409, 'Tag này đã tồn tại');
    }
    if ((await customerTagRepository.countTags(workspaceOwnerId)) >= CUSTOMER_TAG_MAX_PER_WORKSPACE) {
      throw httpError(400, `Tối đa ${CUSTOMER_TAG_MAX_PER_WORKSPACE} tag`);
    }
    try {
      return toPublicTag(await customerTagRepository.create(workspaceOwnerId, { name: safeName, color: safeColor }));
    } catch (error) {
      // Hai yêu cầu cùng tên chạy song song: bản sau thua ở unique index.
      if (error?.code === '23505') throw httpError(409, 'Tag này đã tồn tại');
      throw error;
    }
  }

  async updateTag(workspaceOwnerId, tagId, { name, color }) {
    const safeName = name === undefined ? undefined : this.normalizeName(name);
    const safeColor = this.normalizeColor(color);
    if (safeName !== undefined) {
      const clash = await customerTagRepository.findByName(workspaceOwnerId, safeName);
      if (clash && Number(clash.id) !== Number(tagId)) throw httpError(409, 'Tag này đã tồn tại');
    }
    let row;
    try {
      row = await customerTagRepository.update(workspaceOwnerId, tagId, { name: safeName, color: safeColor });
    } catch (error) {
      if (error?.code === '23505') throw httpError(409, 'Tag này đã tồn tại');
      throw error;
    }
    if (!row) throw httpError(404, 'Không tìm thấy tag');
    return toPublicTag(row);
  }

  async deleteTag(workspaceOwnerId, tagId) {
    const { deleted, customerCount } = await customerTagRepository.remove(workspaceOwnerId, tagId);
    if (!deleted) throw httpError(404, 'Không tìm thấy tag');
    return { customerCount };
  }

  /**
   * Tìm tag theo tên (không phân biệt hoa/thường) trong workspace, chưa có thì tạo. Dùng cho "gõ tên mới" ở giao diện
   * và cho khối Gắn tag của chiến dịch (PR-T2).
   */
  async findOrCreateTagByName(workspaceOwnerId, rawName, color) {
    const name = this.normalizeName(rawName);
    const existing = await customerTagRepository.findByName(workspaceOwnerId, name);
    if (existing) return toPublicTag(existing);
    try {
      return await this.createTag(workspaceOwnerId, { name, color });
    } catch (error) {
      if (error.statusCode === 409) {
        const winner = await customerTagRepository.findByName(workspaceOwnerId, name);
        if (winner) return toPublicTag(winner);
      }
      throw error;
    }
  }

  /** Gộp `tagIds` có sẵn với `tagNames` (tạo nếu chưa có) thành danh sách id tag HỢP LỆ của workspace. */
  async resolveTagIds(workspaceOwnerId, { tagIds, tagNames }) {
    const ids = normalizeIdList(tagIds, { label: 'tagIds', max: CUSTOMER_TAG_MAX_TAGS_PER_CALL });
    const names = Array.isArray(tagNames) ? tagNames : [];
    if (ids.length + names.length > CUSTOMER_TAG_MAX_TAGS_PER_CALL) {
      throw httpError(400, `Tối đa ${CUSTOMER_TAG_MAX_TAGS_PER_CALL} tag mỗi lần`);
    }
    const owned = await customerTagRepository.findByIds(workspaceOwnerId, ids);
    if (owned.length !== ids.length) throw httpError(404, 'Có tag không tồn tại');
    const resolved = new Set(owned.map((row) => Number(row.id)));
    for (const name of names) {
      resolved.add((await this.findOrCreateTagByName(workspaceOwnerId, name)).id);
    }
    return [...resolved];
  }

  /**
   * Gắn tag cho nhiều khách. Khách ngoài workspace bị bỏ qua (không lỗi, không ghi); `assigned` là số cặp mới.
   * `source`/`campaignId`/`runId` dành cho khối Gắn tag của chiến dịch (PR-T2).
   */
  async assignTags(workspaceOwnerId, { customerIds, tagIds, tagNames, actorUserId = null, source = 'manual', campaignId = null, runId = null }) {
    const customers = normalizeIdList(customerIds, { label: 'customerIds', max: CUSTOMER_TAG_MAX_CUSTOMERS_PER_CALL });
    if (!customers.length) throw httpError(400, 'Chưa chọn khách hàng');
    const tags = await this.resolveTagIds(workspaceOwnerId, { tagIds, tagNames });
    if (!tags.length) throw httpError(400, 'Chưa chọn tag');
    const assigned = await customerTagRepository.assign(workspaceOwnerId, {
      customerIds: customers,
      tagIds: tags,
      assignedBy: actorUserId,
      source,
      campaignId,
      runId,
    });
    return { assigned, tagIds: tags };
  }

  async unassignTags(workspaceOwnerId, { customerIds, tagIds }) {
    const customers = normalizeIdList(customerIds, { label: 'customerIds', max: CUSTOMER_TAG_MAX_CUSTOMERS_PER_CALL });
    const tags = normalizeIdList(tagIds, { label: 'tagIds', max: CUSTOMER_TAG_MAX_TAGS_PER_CALL });
    if (!customers.length) throw httpError(400, 'Chưa chọn khách hàng');
    if (!tags.length) throw httpError(400, 'Chưa chọn tag');
    const removed = await customerTagRepository.unassign(workspaceOwnerId, { customerIds: customers, tagIds: tags });
    return { removed };
  }

  /** Tag của một khách trong workspace; không thấy khách → 404. */
  async getCustomerTags(workspaceOwnerId, customerId) {
    const [id] = normalizeIdList([customerId], { label: 'ID khách hàng', max: 1 });
    if (!id || !(await customerTagRepository.customerExists(workspaceOwnerId, id))) {
      throw httpError(404, 'Không tìm thấy khách hàng');
    }
    const rows = await customerTagRepository.listForCustomers([id]);
    return rows.map(toPublicTag);
  }

  /** Map customerId → [{ id, name, color }] cho một trang khách (id đã thuộc workspace). */
  async getTagsByCustomerIds(customerIds) {
    const rows = await customerTagRepository.listForCustomers(customerIds);
    const map = new Map();
    for (const row of rows) {
      const key = Number(row.customer_id);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(toPublicTag(row));
    }
    return map;
  }
}

export default new CustomerTagService();
