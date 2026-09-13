import {
  HiOutlineInbox,
  HiOutlineLightningBolt,
  HiOutlineGlobeAlt,
  HiOutlineCube,
  HiOutlineCurrencyDollar,
  HiOutlineCog,
} from 'react-icons/hi';

export const DEFAULT_SUPER_ADMIN_CATEGORIES = Object.freeze([
  { id: 'overview', nameVi: 'Tổng quan', nameEn: 'Overview' },
  { id: 'business', nameVi: 'Thành viên & doanh thu', nameEn: 'Members & Revenue' },
  { id: 'messaging', nameVi: 'AI & thông báo', nameEn: 'AI & Notifications' },
  { id: 'monitoring', nameVi: 'Giám sát & nhật ký', nameEn: 'Monitoring & Logs' },
  { id: 'marketplace', nameVi: 'Marketplace', nameEn: 'Marketplace' },
]);

export function normalizeSuperAdminMenuCategories(categories, items) {
  const itemByKey = new Map(items.map((item) => [item.key, item]));
  const source = Array.isArray(categories) && categories.length > 0
    ? categories
    : DEFAULT_SUPER_ADMIN_CATEGORIES.map((category) => ({
      ...category,
      itemKeys: items
        .filter((item) => item.defaultCategory === category.id)
        .map((item) => item.key),
    }));

  const seenCategoryIds = new Set();
  const assignedItemKeys = new Set();
  const normalized = source
    .map((category) => {
      const id = String(category?.id || '').trim();
      if (!id || seenCategoryIds.has(id)) return null;
      seenCategoryIds.add(id);
      const itemKeys = (Array.isArray(category.itemKeys) ? category.itemKeys : [])
        .filter((key) => itemByKey.has(key) && !assignedItemKeys.has(key))
        .map((key) => {
          assignedItemKeys.add(key);
          return key;
        });
      return {
        id,
        nameVi: String(category.nameVi || id).trim(),
        nameEn: String(category.nameEn || category.nameVi || id).trim(),
        itemKeys,
      };
    })
    .filter(Boolean);

  if (normalized.length === 0) {
    return normalizeSuperAdminMenuCategories(null, items);
  }

  // A newly deployed tab must never disappear just because the persisted
  // layout predates it. Append it to its default category on read.
  for (const item of items) {
    if (assignedItemKeys.has(item.key)) continue;
    const target = normalized.find((category) => category.id === item.defaultCategory) || normalized[0];
    target.itemKeys.push(item.key);
    assignedItemKeys.add(item.key);
  }
  return normalized;
}

export function groupSuperAdminMenuItems(items, locale, categories, CategoryIcon) {
  const itemByKey = new Map(items.map((item) => [item.key, item]));
  return normalizeSuperAdminMenuCategories(categories, items)
    .map((category) => ({
      key: 'admin-category-' + category.id,
      name: locale === 'en' ? (category.nameEn || category.nameVi) : category.nameVi,
      icon: CategoryIcon,
      children: category.itemKeys.map((key) => itemByKey.get(key)).filter(Boolean),
    }))
    .filter((category) => category.children.length > 0);
}

/**
 * PR-1 (PLAN_MENU_CHUYEN_MUC_APP_2026-09-12) — 7 chuyên mục mặc định cho menu khách /app,
 * tái tạo ĐÚNG 6 nhóm + 3 mục lá cấp 1 đang có trong navConfig.jsx:userMenuItems hôm nay.
 *
 * `main` là ca đặc biệt: KHÔNG có tiêu đề nhóm (groupAppMenuItems trả mục lá trực tiếp, xem
 * dưới) — 3 mục của nó (ai_assistant, dashboard, affiliate_program) hôm nay hiển thị không có
 * tiêu đề. `affiliate_program` hôm nay nằm giữa nhóm Billing và Settings (không cạnh 2 mục main
 * kia) — làm phẳng thành một chuyên mục `main` duy nhất RENDER GỘP nghĩa là nó dồn lên đầu cùng
 * 2 mục main còn lại. Đã xác nhận với sếp (12/09/2026): chấp nhận dời vị trí — mục ownerOnly,
 * không đổi ai thấy được nó, chỉ đổi thứ tự trong nhóm đã thấy được.
 *
 * `icon` trên mỗi chuyên mục (trừ `main`, không cần vì không hiện tiêu đề) — nhóm hôm nay mỗi
 * cái có icon riêng (Inbox/Lightning/Globe/Cube/CurrencyDollar/Cog), KHÁC với admin category
 * (icon đồng nhất qua tham số `CategoryIcon`). Giữ riêng ở đây để không đổi icon hiển thị —
 * groupAppMenuItems dùng `category.icon` trước, chỉ rơi về `CategoryIcon` cho chuyên mục do
 * super admin tự tạo sau này (PR-2, không có icon riêng).
 */
export const DEFAULT_APP_MENU_CATEGORIES = Object.freeze([
  { id: 'main', nameVi: 'Mục chính (không tiêu đề)', nameEn: 'Main (untitled)' },
  { id: 'ai_chatbot', nameVi: 'AI Chatbot', nameEn: 'AI Chatbot', icon: HiOutlineInbox },
  { id: 'campaigns', nameVi: 'Chiến dịch', nameEn: 'Campaigns', icon: HiOutlineLightningBolt },
  { id: 'landing_page', nameVi: 'Landing page', nameEn: 'Landing page', icon: HiOutlineGlobeAlt },
  { id: 'admin_cluster', nameVi: 'Quản trị', nameEn: 'Admin', icon: HiOutlineCube },
  { id: 'billing', nameVi: 'Gói & Thanh toán', nameEn: 'Plan & Billing', icon: HiOutlineCurrencyDollar },
  { id: 'settings', nameVi: 'Cài đặt', nameEn: 'Settings', icon: HiOutlineCog },
]);

/**
 * Bản song sinh của `normalizeSuperAdminMenuCategories` cho scope menu khách — logic giống
 * TUYỆT ĐỐI (kể cả nhánh tự-thêm-mục-mới cho tab ship sau, dòng dưới), chỉ khác nguồn mặc định
 * (`DEFAULT_APP_MENU_CATEGORIES`) và giữ lại field `icon` khi có trên chuyên mục nguồn.
 */
export function normalizeAppMenuCategories(categories, items) {
  const itemByKey = new Map(items.map((item) => [item.key, item]));
  const source = Array.isArray(categories) && categories.length > 0
    ? categories
    : DEFAULT_APP_MENU_CATEGORIES.map((category) => ({
      ...category,
      itemKeys: items
        .filter((item) => item.defaultCategory === category.id)
        .map((item) => item.key),
    }));

  const seenCategoryIds = new Set();
  const assignedItemKeys = new Set();
  const normalized = source
    .map((category) => {
      const id = String(category?.id || '').trim();
      if (!id || seenCategoryIds.has(id)) return null;
      seenCategoryIds.add(id);
      const itemKeys = (Array.isArray(category.itemKeys) ? category.itemKeys : [])
        .filter((key) => itemByKey.has(key) && !assignedItemKeys.has(key))
        .map((key) => {
          assignedItemKeys.add(key);
          return key;
        });
      return {
        id,
        nameVi: String(category.nameVi || id).trim(),
        nameEn: String(category.nameEn || category.nameVi || id).trim(),
        icon: category.icon || null,
        itemKeys,
      };
    })
    .filter(Boolean);

  if (normalized.length === 0) {
    return normalizeAppMenuCategories(null, items);
  }

  // Cùng lý do như normalizeSuperAdminMenuCategories: một tab /app ship sau khi bố cục đã lưu
  // (categories != null) sẽ không có trong itemKeys nào — thêm vào chuyên mục mặc định của
  // nó, không để vô hình.
  for (const item of items) {
    if (assignedItemKeys.has(item.key)) continue;
    const target = normalized.find((category) => category.id === item.defaultCategory) || normalized[0];
    target.itemKeys.push(item.key);
    assignedItemKeys.add(item.key);
  }
  return normalized;
}

/**
 * Bản song sinh của `groupSuperAdminMenuItems`, khác đúng hai chỗ: dùng
 * `DEFAULT_APP_MENU_CATEGORIES`/`normalizeAppMenuCategories`, và chuyên mục `main` trả về MỤC
 * LÁ TRỰC TIẾP (spread vào kết quả) thay vì bọc thành một nhóm có tiêu đề — đúng hành vi hôm
 * nay của 3 mục cấp 1 không tiêu đề.
 */
export function groupAppMenuItems(items, locale, categories, CategoryIcon) {
  const itemByKey = new Map(items.map((item) => [item.key, item]));
  const result = [];
  for (const category of normalizeAppMenuCategories(categories, items)) {
    const children = category.itemKeys.map((key) => itemByKey.get(key)).filter(Boolean);
    if (children.length === 0) continue;
    if (category.id === 'main') {
      result.push(...children);
      continue;
    }
    result.push({
      key: 'app-category-' + category.id,
      name: locale === 'en' ? (category.nameEn || category.nameVi) : category.nameVi,
      icon: category.icon || CategoryIcon,
      children,
    });
  }
  return result;
}
