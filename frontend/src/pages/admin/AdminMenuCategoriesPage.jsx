import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineArrowDown,
  HiOutlineArrowUp,
  HiOutlineCollection,
  HiOutlineExclamation,
  HiOutlineExternalLink,
  HiOutlineInformationCircle,
  HiOutlinePlay,
  HiOutlinePlus,
  HiOutlineRefresh,
  HiOutlineSave,
  HiOutlineTrash,
} from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import { useI18n } from '../../i18n';
import {
  superAdminMenuItems,
  userMenuItems,
} from '../../components/layout/admin/navConfig';
import {
  normalizeSuperAdminMenuCategories,
  normalizeAppMenuCategories,
  isSafeExternalUrl,
} from '../../components/layout/admin/adminMenuLayout';
import adminMenuApiService, {
  ADMIN_MENU_LAYOUT_UPDATED_EVENT,
} from '../../features/admin/services/adminMenuApi.service';

const SCOPE_SUPER_ADMIN = 'super_admin';
const SCOPE_APP_USER = 'app_user';
// Chuyên mục `main` của menu khách là khối CẤP 1: groupAppMenuItems (adminMenuLayout.js) trải thẳng các
// mục của nó ra menu, không có tiêu đề nhóm — tên của khối này không bao giờ hiện cho khách. Trang này
// vẽ nó khác các nhóm thường để khỏi bị hiểu nhầm là một nhóm có tên.
const APP_MAIN_CATEGORY_ID = 'main';

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

function createLinkKey() {
  return 'link-' + Math.random().toString(36).slice(2, 10);
}

function isYoutubeLinkUrl(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'youtube.com' || host.endsWith('.youtube.com') || host === 'youtu.be';
  } catch {
    return false;
  }
}

/**
 * PLAN_CHUYEN_MUC_LINK_NGOAI_2026-09-28 — chuyển `links` (state, chỉ scope app_user) thành các
 * mục "giả" tương thích với `itemByKey` để dòng `category.itemKeys.map(...)` sẵn có render được
 * link NGAY TẠI VỊ TRÍ của nó trong itemKeys (chia sẻ lên/xuống + chuyển chuyên mục với tab
 * thường), thay vì phải render một danh sách riêng.
 */
function buildLinkCatalogItems(links) {
  return links.map((link) => ({
    key: link.key,
    name: link.nameVi,
    path: link.url,
    icon: isYoutubeLinkUrl(link.url) ? HiOutlinePlay : HiOutlineExternalLink,
    isLink: true,
    nameVi: link.nameVi,
    nameEn: link.nameEn,
    url: link.url,
    categoryId: link.categoryId,
  }));
}

function AddLinkForm({ categoryId, onAdd, t }) {
  const [nameVi, setNameVi] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [url, setUrl] = useState('');

  const handleAdd = () => {
    const added = onAdd({ nameVi, nameEn, url, categoryId });
    if (added) {
      setNameVi('');
      setNameEn('');
      setUrl('');
    }
  };

  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1.4fr_auto]">
      <input
        value={nameVi}
        onChange={(event) => setNameVi(event.target.value)}
        placeholder={t('adminMenu.linkNameViPlaceholder')}
        maxLength={100}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
      />
      <input
        value={nameEn}
        onChange={(event) => setNameEn(event.target.value)}
        placeholder={t('adminMenu.linkNameEnPlaceholder')}
        maxLength={100}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
      />
      <input
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        placeholder={t('adminMenu.linkUrlPlaceholder')}
        maxLength={2000}
        className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
      />
      <button type="button" className="btn btn-secondary inline-flex items-center justify-center gap-1 text-sm" onClick={handleAdd}>
        <HiOutlinePlus className="h-4 w-4" />
        {t('adminMenu.addLink')}
      </button>
    </div>
  );
}

export default function AdminMenuCategoriesPage() {
  const { t } = useI18n();
  const [activeScope, setActiveScope] = useState(SCOPE_SUPER_ADMIN);
  const isAppScope = activeScope === SCOPE_APP_USER;
  const isMainCategory = (category) => isAppScope && category?.id === APP_MAIN_CATEGORY_ID;

  const catalog = useMemo(
    () => (isAppScope ? userMenuItems(t) : superAdminMenuItems(t)),
    [isAppScope, t]
  );
  const normalizer = isAppScope ? normalizeAppMenuCategories : normalizeSuperAdminMenuCategories;

  const [categories, setCategories] = useState([]);
  const [links, setLinks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [newNameVi, setNewNameVi] = useState('');
  const [newNameEn, setNewNameEn] = useState('');

  // links chỉ tồn tại ở scope app_user — bản đồ này gộp catalog cố định (navConfig.jsx) với các
  // "mục giả" dựng từ link hiện có, để `category.itemKeys.map((key) => itemByKey.get(key))` sẵn
  // có render được cả link lẫn tab thường không cần tách danh sách riêng.
  const itemByKey = useMemo(() => {
    const linkItems = isAppScope ? buildLinkCatalogItems(links) : [];
    return new Map([...catalog, ...linkItems].map((item) => [item.key, item]));
  }, [catalog, isAppScope, links]);

  // QUAN TRỌNG: `load` KHÔNG được phụ thuộc state `links` — nếu phụ thuộc, mỗi lần load() gọi
  // setLinks sẽ đổi tham chiếu `load` (qua itemByKey/catalog gián tiếp), kéo useEffect(load) chạy
  // lại vô hạn. Normalize bằng danh mục dựng từ links VỪA NẠP trong chính lần gọi này.
  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = isAppScope
        ? await adminMenuApiService.getAppLayout()
        : await adminMenuApiService.getLayout();
      const loadedLinks = isAppScope && Array.isArray(response.data?.data?.links)
        ? response.data.data.links
        : [];
      const mergedItems = isAppScope ? [...catalog, ...buildLinkCatalogItems(loadedLinks)] : catalog;
      setLinks(loadedLinks);
      setCategories(normalizer(response.data?.data?.categories, mergedItems));
      setIsDirty(false);
    } catch (error) {
      setLinks([]);
      setCategories(normalizer(null, catalog));
      toast.error(error?.response?.data?.message || t('adminMenu.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  }, [isAppScope, normalizer, catalog, t]);

  useEffect(() => {
    load();
  }, [load]);

  const handleTabChange = (nextScope) => {
    if (nextScope === activeScope) return;
    // Đổi tab là load() lại từ API → mọi thứ đang sắp dở bị mất. Hỏi trước khi vứt.
    if (isDirty && !window.confirm(t('adminMenu.discardChangesConfirm'))) return;
    setActiveScope(nextScope);
    setNewNameVi('');
    setNewNameEn('');
  };

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
    // Link mang categoryId RIÊNG (không suy ra được từ itemKeys) — đổi chuyên mục qua dropdown
    // phải cập nhật luôn field này, nếu không link sẽ hiện đúng vị trí (nhờ itemKeys) nhưng lưu
    // xong rồi tải lại thì lệch (categoryId cũ không khớp itemKeys mới).
    if (itemKey.startsWith('link-')) {
      setLinks((current) => current.map((link) => (
        link.key === itemKey ? { ...link, categoryId: targetCategoryId } : link
      )));
      setIsDirty(true);
    }
  };

  const addLink = ({ nameVi, nameEn, url, categoryId }) => {
    const trimmedNameVi = nameVi.trim();
    if (!trimmedNameVi) {
      toast.error(t('adminMenu.nameRequired'));
      return false;
    }
    let normalizedUrl = url.trim();
    if (normalizedUrl && !/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(normalizedUrl)) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    if (!isSafeExternalUrl(normalizedUrl)) {
      toast.error(t('adminMenu.linkUrlInvalid'));
      return false;
    }
    const key = createLinkKey();
    setLinks((current) => [...current, {
      key,
      nameVi: trimmedNameVi,
      nameEn: nameEn.trim(),
      url: normalizedUrl,
      categoryId,
    }]);
    updateCategories((current) => current.map((category) => (
      category.id === categoryId ? { ...category, itemKeys: [...category.itemKeys, key] } : category
    )));
    return true;
  };

  const removeLink = (linkKey) => {
    setLinks((current) => current.filter((link) => link.key !== linkKey));
    updateCategories((current) => current.map((category) => ({
      ...category,
      itemKeys: category.itemKeys.filter((key) => key !== linkKey),
    })));
  };

  const updateLinkField = (linkKey, field, value) => {
    setLinks((current) => current.map((link) => (
      link.key === linkKey ? { ...link, [field]: value } : link
    )));
    setIsDirty(true);
  };

  const restoreDefaults = () => {
    setCategories(normalizer(null, catalog));
    if (isAppScope) setLinks([]);
    setIsDirty(true);
  };

  const save = async () => {
    if (categories.some((category) => !category.nameVi.trim())) {
      toast.error(t('adminMenu.nameRequired'));
      return;
    }
    // Chặn mềm — chuyên mục rỗng vẫn là trạng thái tạm hợp lệ (adminMenuLayout.js tự ẩn nó khỏi
    // menu thật, không phải lỗi dữ liệu), nhưng người tạo chuyên mục mới hay quên gán tab ngay nên
    // dễ tưởng "đã lưu là xong" rồi không hiểu sao không thấy đâu. Hỏi lại, không chặn cứng.
    const emptyCategories = categories.filter((category) => category.itemKeys.length === 0);
    if (emptyCategories.length > 0) {
      const names = emptyCategories.map((category) => category.nameVi.trim() || category.nameEn.trim()).join(', ');
      if (!window.confirm(t('adminMenu.emptyCategoriesConfirm', { names }))) return;
    }
    setIsSaving(true);
    try {
      const response = isAppScope
        ? await adminMenuApiService.updateAppLayout(categories, links)
        : await adminMenuApiService.updateLayout(categories);
      const savedLinks = isAppScope && Array.isArray(response.data?.data?.links)
        ? response.data.data.links
        : [];
      const mergedItems = isAppScope ? [...catalog, ...buildLinkCatalogItems(savedLinks)] : catalog;
      const saved = normalizer(response.data?.data?.categories, mergedItems);
      setCategories(saved);
      if (isAppScope) setLinks(savedLinks);
      setIsDirty(false);
      // Chỉ phát sự kiện cập nhật trực tiếp cho menu Super Admin.
      // Menu khách không cần cập nhật sống, đọc 1 lần lúc mount là đủ.
      if (!isAppScope) {
        window.dispatchEvent(new CustomEvent(ADMIN_MENU_LAYOUT_UPDATED_EVENT, {
          detail: { categories: saved },
        }));
      }
      toast.success(isAppScope ? (t('adminMenu.saveSuccessApp') || 'Đã lưu bố cục menu ứng dụng') : t('adminMenu.saveSuccess'));
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
    <PageContainer
      title={t('adminMenu.title')}
      subtitle={t('adminMenu.subtitle')}
      icon={HiOutlineCollection}
      actions={
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
      }
    >

      <div className="flex border-b border-gray-200 gap-2">
        <button
          type="button"
          onClick={() => handleTabChange(SCOPE_SUPER_ADMIN)}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            activeScope === SCOPE_SUPER_ADMIN
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          {t('adminMenu.scopeSuperAdmin')}
        </button>
        <button
          type="button"
          onClick={() => handleTabChange(SCOPE_APP_USER)}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
            activeScope === SCOPE_APP_USER
              ? 'border-orange-500 text-orange-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          {t('adminMenu.scopeAppUser')}
        </button>
      </div>

      {isAppScope && (
        <div className="flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">
          <HiOutlineInformationCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t('adminMenu.appScopeHint')}</span>
        </div>
      )}

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
              {isMainCategory(category) ? (
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900">{t('adminMenu.mainCategoryTitle')}</p>
                  <p className="mt-0.5 text-xs text-gray-500">{t('adminMenu.mainCategoryHint')}</p>
                </div>
              ) : (
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
              )}
              <span className="text-xs text-gray-400">
                {t('adminMenu.itemCount', { count: category.itemKeys.length })}
              </span>
              {category.itemKeys.length === 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700">
                  <HiOutlineExclamation className="h-3.5 w-3.5" />
                  {t('adminMenu.emptyCategoryBadge')}
                </span>
              )}
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
                {!isMainCategory(category) && (
                  <button
                    type="button"
                    onClick={() => removeCategory(category)}
                    title={t('common.delete')}
                    aria-label={t('common.delete')}
                    className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                  >
                    <HiOutlineTrash className="h-4 w-4" />
                  </button>
                )}
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
                  <div key={itemKey} className={`flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center ${item.isLink ? 'bg-blue-50/40' : ''}`}>
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <ItemIcon className={`h-5 w-5 shrink-0 ${item.isLink ? 'text-blue-500' : 'text-gray-400'}`} />
                      {item.isLink ? (
                        <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-3">
                          <input
                            value={item.nameVi}
                            onChange={(event) => updateLinkField(itemKey, 'nameVi', event.target.value)}
                            aria-label={t('adminMenu.nameVi')}
                            maxLength={100}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                          />
                          <input
                            value={item.nameEn}
                            onChange={(event) => updateLinkField(itemKey, 'nameEn', event.target.value)}
                            aria-label={t('adminMenu.nameEn')}
                            maxLength={100}
                            className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                          />
                          <input
                            value={item.url}
                            onChange={(event) => updateLinkField(itemKey, 'url', event.target.value)}
                            aria-label="URL"
                            maxLength={2000}
                            className="truncate rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm text-gray-600 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
                          />
                        </div>
                      ) : (
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-800">{item.name}</p>
                          <p className="truncate text-xs text-gray-400">{item.path}</p>
                        </div>
                      )}
                    </div>
                    <select
                      value={category.id}
                      onChange={(event) => moveItemToCategory(itemKey, event.target.value)}
                      aria-label={t('adminMenu.categoryForItem', { item: item.name })}
                      className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600"
                    >
                      {categories.map((target) => (
                        <option key={target.id} value={target.id}>{isMainCategory(target) ? t('adminMenu.mainCategoryTitle') : target.nameVi}</option>
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
                      {item.isLink && (
                        <button
                          type="button"
                          onClick={() => removeLink(itemKey)}
                          title={t('adminMenu.removeLink')}
                          aria-label={t('adminMenu.removeLink')}
                          className="rounded-lg p-2 text-gray-500 hover:bg-red-50 hover:text-red-600"
                        >
                          <HiOutlineTrash className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {isAppScope && (
              <div className="border-t border-gray-100 bg-gray-50/60 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">
                  {t('adminMenu.linkSectionTitle')}
                </p>
                <AddLinkForm categoryId={category.id} onAdd={addLink} t={t} />
              </div>
            )}
          </section>
        ))}
      </div>
    </PageContainer>
  );
}
