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
