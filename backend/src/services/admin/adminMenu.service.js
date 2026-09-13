import {
  findLayout,
  saveLayout,
  findSuperAdminLayout,
  saveSuperAdminLayout,
} from '../../repositories/admin/adminMenu.repository.js';

const MAX_CATEGORIES = 30;
const MAX_ITEMS_PER_CATEGORY = 100;
const CATEGORY_ID_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const ITEM_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/i;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

/**
 * Validate and trim the complete layout before it is persisted. Item keys are
 * deliberately opaque here: the frontend owns the fixed route catalog and
 * ignores unknown keys, while the backend guarantees a bounded, duplicate-free
 * structure. This lets a future frontend add a tab without requiring a matching
 * backend deployment merely to extend an allow-list.
 */
export function normalizeAdminMenuCategories(input) {
  if (!Array.isArray(input) || input.length === 0) {
    throw badRequest('Phải có ít nhất một chuyên mục menu');
  }
  if (input.length > MAX_CATEGORIES) {
    throw badRequest(`Tối đa ${MAX_CATEGORIES} chuyên mục menu`);
  }

  const categoryIds = new Set();
  const categoryNames = new Set();
  const assignedItems = new Set();

  return input.map((rawCategory) => {
    const id = String(rawCategory?.id || '').trim();
    const nameVi = String(rawCategory?.nameVi || '').trim();
    const nameEn = String(rawCategory?.nameEn || '').trim();
    const rawItemKeys = rawCategory?.itemKeys;

    if (!CATEGORY_ID_RE.test(id)) throw badRequest('Mã chuyên mục không hợp lệ');
    if (categoryIds.has(id)) throw badRequest('Mã chuyên mục bị trùng');
    categoryIds.add(id);

    if (!nameVi || nameVi.length > 100) {
      throw badRequest('Tên chuyên mục tiếng Việt phải có từ 1 đến 100 ký tự');
    }
    if (nameEn.length > 100) {
      throw badRequest('Tên chuyên mục tiếng Anh không được quá 100 ký tự');
    }
    const normalizedName = nameVi.toLocaleLowerCase('vi-VN');
    if (categoryNames.has(normalizedName)) throw badRequest('Tên chuyên mục bị trùng');
    categoryNames.add(normalizedName);

    if (!Array.isArray(rawItemKeys) || rawItemKeys.length > MAX_ITEMS_PER_CATEGORY) {
      throw badRequest(`Mỗi chuyên mục chỉ được chứa tối đa ${MAX_ITEMS_PER_CATEGORY} tab`);
    }
    const itemKeys = rawItemKeys.map((rawKey) => {
      const itemKey = String(rawKey || '').trim();
      if (!ITEM_KEY_RE.test(itemKey)) throw badRequest('Mã tab menu không hợp lệ');
      if (assignedItems.has(itemKey)) throw badRequest(`Tab "${itemKey}" được gán nhiều lần`);
      assignedItems.add(itemKey);
      return itemKey;
    });

    return { id, nameVi, nameEn: nameEn || nameVi, itemKeys };
  });
}

export async function getSuperAdminMenuLayout() {
  const row = await findSuperAdminLayout();
  return {
    categories: Array.isArray(row?.categories) ? row.categories : [],
    updatedBy: row?.updated_by ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function updateSuperAdminMenuLayout(categories, actorUserId) {
  const normalized = normalizeAdminMenuCategories(categories);
  const row = await saveSuperAdminLayout(normalized, actorUserId);
  return {
    categories: row.categories,
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

export async function getAppMenuLayout() {
  const row = await findLayout({ scope: 'app_user' });
  return {
    categories: Array.isArray(row?.categories) ? row.categories : [],
    updatedBy: row?.updated_by ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

export async function updateAppMenuLayout(categories, actorUserId) {
  const normalized = normalizeAdminMenuCategories(categories);
  const row = await saveLayout({ categories: normalized, updatedBy: actorUserId, scope: 'app_user' });
  return {
    categories: row.categories,
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at ?? null,
  };
}
