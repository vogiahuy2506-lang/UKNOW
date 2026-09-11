import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowDown,
  HiOutlineArrowUp,
  HiOutlineCollection,
  HiOutlinePlus,
  HiOutlineRefresh,
  HiOutlineSave,
  HiOutlineTrash,
} from 'react-icons/hi';
import { useI18n } from '../../i18n';
import {
  superAdminMenuItems,
} from '../../components/layout/admin/navConfig';
import { normalizeSuperAdminMenuCategories } from '../../components/layout/admin/adminMenuLayout';
import adminMenuApiService, {
  ADMIN_MENU_LAYOUT_UPDATED_EVENT,
} from '../../features/admin/services/adminMenuApi.service';

function moveEntry(list, index, delta) {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function createCategoryId() {
  const random = Math.random().toString(36).slice(2, 8);
  return 'custom-' + Date.now().toString(36) + '-' + random;
}

export default function AdminMenuCategoriesPage() {
  const { t } = useI18n();
  const catalog = useMemo(() => superAdminMenuItems(t), [t]);
  const itemByKey = useMemo(
    () => new Map(catalog.map((item) => [item.key, item])),
    [catalog]
  );
  const [categories, setCategories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [newNameVi, setNewNameVi] = useState('');
  const [newNameEn, setNewNameEn] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await adminMenuApiService.getLayout();
      setCategories(normalizeSuperAdminMenuCategories(response.data?.data?.categories, catalog));
      setIsDirty(false);
    } catch (error) {
      setCategories(normalizeSuperAdminMenuCategories(null, catalog));
      toast.error(error?.response?.data?.message || t('adminMenu.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [catalog, t]);

  useEffect(() => {
    load();
  }, [load]);

  const updateCategories = (updater) => {
    setCategories((current) => updater(current));
    setIsDirty(true);
  };

  const addCategory = () => {
    const nameVi = newNameVi.trim();
    const nameEn = newNameEn.trim();
    if (!nameVi) {
      toast.error(t('adminMenu.nameRequired'));
      return;
    }
    updateCategories((current) => [
      ...current,
      {
        id: createCategoryId(),
        nameVi,
        nameEn: nameEn || nameVi,
        itemKeys: [],
      },
    ]);
    setNewNameVi('');
    setNewNameEn('');
  };

  const updateCategoryName = (categoryId, field, value) => {
    updateCategories((current) => current.map((category) => (
      category.id === categoryId ? { ...category, [field]: value } : category
    )));
  };

  const moveCategory = (index, delta) => {
    updateCategories((current) => moveEntry(current, index, delta));
  };

  const removeCategory = (category) => {
    if (categories.length === 1) {
      toast.error(t('adminMenu.keepOneCategory'));
      return;
    }
    if (category.itemKeys.length > 0) {
      toast.error(t('adminMenu.moveItemsBeforeDelete'));
      return;
    }
    updateCategories((current) => current.filter((item) => item.id !== category.id));
  };

  const moveItem = (categoryId, itemIndex, delta) => {
    updateCategories((current) => current.map((category) => (
      category.id === categoryId
        ? { ...category, itemKeys: moveEntry(category.itemKeys, itemIndex, delta) }
        : category
    )));
  };

  const moveItemToCategory = (itemKey, targetCategoryId) => {
    updateCategories((current) => current.map((category) => {
      const withoutItem = category.itemKeys.filter((key) => key !== itemKey);
      return {
        ...category,
        itemKeys: category.id === targetCategoryId
          ? [...withoutItem, itemKey]
          : withoutItem,
      };
    }));
  };

  const restoreDefaults = () => {
    setCategories(normalizeSuperAdminMenuCategories(null, catalog));
    setIsDirty(true);
  };

  const save = async () => {
    if (categories.some((category) => !category.nameVi.trim())) {
      toast.error(t('adminMenu.nameRequired'));
      return;
    }
    setIsSaving(true);
    try {
      const response = await adminMenuApiService.updateLayout(categories);
      const saved = normalizeSuperAdminMenuCategories(response.data?.data?.categories, catalog);
      setCategories(saved);
      setIsDirty(false);
      window.dispatchEvent(new CustomEvent(ADMIN_MENU_LAYOUT_UPDATED_EVENT, {
        detail: { categories: saved },
      }));
      toast.success(t('adminMenu.saveSuccess'));
    } catch (error) {
      toast.error(error?.response?.data?.message || t('adminMenu.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="py-16 text-center text-sm text-gray-400">{t('common.loading')}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <HiOutlineCollection className="h-7 w-7 text-orange-500" />
            <h1 className="text-2xl font-bold text-gray-900">{t('adminMenu.title')}</h1>
          </div>
          <p className="mt-1 text-sm text-gray-500">{t('adminMenu.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-secondary inline-flex items-center gap-2" onClick={restoreDefaults}>
            <HiOutlineRefresh className="h-4 w-4" />
            {t('adminMenu.restoreDefaults')}
          </button>
          <button
            type="button"
            className="btn btn-primary inline-flex items-center gap-2"
            onClick={save}
            disabled={isSaving || !isDirty}
          >
            <HiOutlineSave className="h-4 w-4" />
            {isSaving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="font-semibold text-gray-900">{t('adminMenu.addCategory')}</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <input
            value={newNameVi}
            onChange={(event) => setNewNameVi(event.target.value)}
            placeholder={t('adminMenu.nameViPlaceholder')}
            maxLength={100}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          />
          <input
            value={newNameEn}
            onChange={(event) => setNewNameEn(event.target.value)}
            placeholder={t('adminMenu.nameEnPlaceholder')}
            maxLength={100}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
          />
          <button type="button" className="btn btn-secondary inline-flex items-center justify-center gap-2" onClick={addCategory}>
            <HiOutlinePlus className="h-4 w-4" />
            {t('common.create')}
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {categories.map((category, categoryIndex) => (
          <section key={category.id} className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-gray-100 bg-gray-50/80 p-4 lg:flex-row lg:items-center">
              <div className="grid min-w-0 flex-1 gap-3 sm:grid-cols-2">
                <input
                  value={category.nameVi}
                  onChange={(event) => updateCategoryName(category.id, 'nameVi', event.target.value)}
                  aria-label={t('adminMenu.nameVi')}
                  maxLength={100}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-semibold focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
                <input
                  value={category.nameEn}
                  onChange={(event) => updateCategoryName(category.id, 'nameEn', event.target.value)}
                  aria-label={t('adminMenu.nameEn')}
                  maxLength={100}
                  className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                />
              </div>
              <span className="text-xs text-gray-400">
                {t('adminMenu.itemCount', { count: category.itemKeys.length })}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => moveCategory(categoryIndex, -1)}
                  disabled={categoryIndex === 0}
                  title={t('adminMenu.moveCategoryUp')}
                  aria-label={t('adminMenu.moveCategoryUp')}
                  className="rounded-lg p-2 text-gray-500 hover:bg-white hover:text-gray-900 disabled:opacity-30"
                >
                  <HiOutlineArrowUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => moveCategory(categoryIndex, 1)}
                  disabled={categoryIndex === categories.length - 1}
                  title={t('adminMenu.moveCategoryDown')}
                  aria-label={t('adminMenu.moveCategoryDown')}
                  className="rounded-lg p-2 text-gray-500 hover:bg-white hover:text-gray-900 disabled:opacity-30"
                >
                  <HiOutlineArrowDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeCategory(category)}
                  title={t('common.delete')}
                  aria-label={t('common.delete')}
                  className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                >
                  <HiOutlineTrash className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="divide-y divide-gray-100">
              {category.itemKeys.length === 0 ? (
                <p className="p-5 text-center text-sm text-gray-400">{t('adminMenu.emptyCategory')}</p>
              ) : category.itemKeys.map((itemKey, itemIndex) => {
                const item = itemByKey.get(itemKey);
                if (!item) return null;
                const ItemIcon = item.icon;
                return (
                  <div key={itemKey} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <ItemIcon className="h-5 w-5 shrink-0 text-gray-400" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-gray-800">{item.name}</p>
                        <p className="truncate text-xs text-gray-400">{item.path}</p>
                      </div>
                    </div>
                    <select
                      value={category.id}
                      onChange={(event) => moveItemToCategory(itemKey, event.target.value)}
                      aria-label={t('adminMenu.categoryForItem', { item: item.name })}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600"
                    >
                      {categories.map((target) => (
                        <option key={target.id} value={target.id}>{target.nameVi}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveItem(category.id, itemIndex, -1)}
                        disabled={itemIndex === 0}
                        title={t('adminMenu.moveItemUp')}
                        aria-label={t('adminMenu.moveItemUp')}
                        className="rounded-lg p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-30"
                      >
                        <HiOutlineArrowUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveItem(category.id, itemIndex, 1)}
                        disabled={itemIndex === category.itemKeys.length - 1}
                        title={t('adminMenu.moveItemDown')}
                        aria-label={t('adminMenu.moveItemDown')}
                        className="rounded-lg p-2 text-gray-500 hover:bg-gray-50 hover:text-gray-900 disabled:opacity-30"
                      >
                        <HiOutlineArrowDown className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
