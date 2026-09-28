import {
  findLayout,
  saveLayout,
  findSuperAdminLayout,
  saveSuperAdminLayout,
} from '../../repositories/admin/adminMenu.repository.js';

const MAX_CATEGORIES = 30;
const MAX_ITEMS_PER_CATEGORY = 100;
const MAX_LINKS = 50;
const CATEGORY_ID_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const ITEM_KEY_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/i;
const LINK_KEY_RE = /^link-[a-z0-9-]{1,60}$/;
const LINK_URL_INVALID_MESSAGE = 'Link phải bắt đầu bằng http:// hoặc https://';

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

/**
 * Validate danh sách link ngoài (YouTube/link bất kỳ) trước khi lưu — chỉ scope app_user dùng.
 * `categories` truyền vào là danh sách ĐÃ normalize (từ normalizeAdminMenuCategories trong CÙNG
 * request) để kiểm categoryId của link có tồn tại hay không.
 *
 * Kiểm protocol bằng `new URL(url).protocol`, KHÔNG bằng so chuỗi (`startsWith('http')`) —
 * so chuỗi bị lách bởi khoảng trắng đầu, viết hoa (`JAVASCRIPT:`), hay scheme lồng
 * (`http:javascript:...`). `new URL` tự chuẩn hoá protocol về chữ thường.
 */
export function normalizeAppMenuLinks(input, categories) {
  if (!Array.isArray(input)) {
    throw badRequest('Danh sách link không hợp lệ');
  }
  if (input.length > MAX_LINKS) {
    throw badRequest(`Tối đa ${MAX_LINKS} link`);
  }

  const categoryIds = new Set((categories || []).map((category) => category.id));
  const seenKeys = new Set();

  return input.map((rawLink) => {
    const key = String(rawLink?.key || '').trim();
    if (!LINK_KEY_RE.test(key)) throw badRequest('Mã link không hợp lệ');
    if (seenKeys.has(key)) throw badRequest(`Link "${key}" bị trùng`);
    seenKeys.add(key);

    const nameVi = String(rawLink?.nameVi || '').trim();
    if (!nameVi || nameVi.length > 100) {
      throw badRequest('Tên link tiếng Việt phải có từ 1 đến 100 ký tự');
    }
    const nameEn = String(rawLink?.nameEn || '').trim();
    if (nameEn.length > 100) {
      throw badRequest('Tên link tiếng Anh không được quá 100 ký tự');
    }

    const url = String(rawLink?.url || '').trim();
    if (!url || url.length > 2000) {
      throw badRequest(LINK_URL_INVALID_MESSAGE);
    }
    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      throw badRequest(LINK_URL_INVALID_MESSAGE);
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw badRequest(LINK_URL_INVALID_MESSAGE);
    }

    const categoryId = String(rawLink?.categoryId || '').trim();
    if (!categoryIds.has(categoryId)) {
      throw badRequest('Chuyên mục của link không hợp lệ');
    }

    return { key, nameVi, nameEn: nameEn || nameVi, url, categoryId };
  });
}

/**
 * Mọi itemKey dạng `link-*` được gán vào một chuyên mục phải có link tương ứng trong `links` —
 * tránh tab "mồ côi" trỏ tới link đã bị xoá (hoặc chưa từng tồn tại) khi client gửi `categories`
 * và `links` không khớp nhau trong cùng một request.
 */
function assertLinkItemKeysCovered(categories, links) {
  const linkKeys = new Set((links || []).map((link) => link.key));
  for (const category of categories) {
    for (const itemKey of category.itemKeys) {
      if (itemKey.startsWith('link-') && !linkKeys.has(itemKey)) {
        throw badRequest(`Tab "${itemKey}" không có link tương ứng`);
      }
    }
  }
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
    links: Array.isArray(row?.links) ? row.links : [],
    updatedBy: row?.updated_by ?? null,
    updatedAt: row?.updated_at ?? null,
  };
}

/**
 * `links === undefined` nghĩa là client cũ (chưa có UI link, còn tab trình duyệt cũ) — GIỮ
 * NGUYÊN links đang có trong DB thay vì coi là "muốn xoá sạch". Vẫn kiểm ràng buộc chéo với
 * links ĐANG CÓ: nếu client đó gửi `categories` bỏ mất itemKey link, item đó chỉ đơn giản không
 * còn được gán vào chuyên mục nào (không phải lỗi) — chỉ ném lỗi khi có itemKey link KHÔNG rõ
 * nguồn gốc (không nằm trong links đang lưu).
 */
export async function updateAppMenuLayout(categories, links, actorUserId) {
  const normalized = normalizeAdminMenuCategories(categories);

  let linksForValidation;
  let linksForSave;
  if (links === undefined) {
    const existingRow = await findLayout({ scope: 'app_user' });
    linksForValidation = Array.isArray(existingRow?.links) ? existingRow.links : [];
    linksForSave = null; // sentinel cho repository: COALESCE giữ nguyên cột links trong DB
  } else {
    linksForValidation = normalizeAppMenuLinks(links, normalized);
    linksForSave = linksForValidation;
  }
  assertLinkItemKeysCovered(normalized, linksForValidation);

  const row = await saveLayout({
    categories: normalized,
    links: linksForSave,
    updatedBy: actorUserId,
    scope: 'app_user',
  });
  return {
    categories: row.categories,
    links: Array.isArray(row.links) ? row.links : [],
    updatedBy: row.updated_by ?? null,
    updatedAt: row.updated_at ?? null,
  };
}
