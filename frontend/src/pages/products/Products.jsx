import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import productApiService from '../../features/products/services/productApi.service';
import PageHeader from '../../components/common/PageHeader';
import useStorageQuota from '../../features/storage/useStorageQuota';
import { validateFilesBeforeUpload, getUploadValidationErrorMessage } from '../../features/storage/validateUpload';
import { notifyStorageQuotaRefresh } from '../../features/storage/storageEvents';
import {
  HiOutlineCube,
  HiOutlineSearch,
  HiOutlineChevronRight,
  HiOutlineChevronLeft,
  HiOutlinePlus,
  HiOutlinePencil,
  HiOutlineTrash,
  HiOutlineX,
} from 'react-icons/hi';

const MODAL_OVERLAY = 'fixed inset-0 z-[9999] flex items-center justify-center p-4';
const MODAL_PANEL = 'relative bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto';

const PRODUCT_STATUS_OPTIONS = ['active', 'inactive'];

const EMPTY_FORM = {
  productCode: '',
  productName: '',
  price: '',
  originalPrice: '',
  description: '',
  usp: '',
  category: '',
  thumbnailUrl: '',
  productUrl: '',
  targetAudience: '',
  status: 'active',
  kind: 'sale',
};

const PRODUCT_KIND_OPTIONS = ['sale', 'event'];

// Sự kiện không "bán": chữ trạng thái nói về đăng ký (Đang mở / Đã đóng đăng ký) thay vì Đang bán / Ngừng bán.
const STATUS_KEYS = {
  sale: { active: 'products.statusActive', inactive: 'products.statusInactive' },
  event: { active: 'products.statusEventActive', inactive: 'products.statusEventInactive' },
};

const StatusBadge = ({ status, kind }) => {
  const { t } = useI18n();
  const normalized = String(status || 'active').toLowerCase();
  const isActive = normalized === 'active';
  const keys = STATUS_KEYS[kind === 'event' ? 'event' : 'sale'];
  return (
    <span className={`badge ${isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
      {isActive ? t(keys.active) : t(keys.inactive)}
    </span>
  );
};

const FUNNEL_PERIODS = ['7d', '30d', '90d'];

const formatMoney = (n) => `${Number(n || 0).toLocaleString('vi-VN')} đ`;

const formatDate = (v) => {
  if (!v) return '--';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '--' : d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN');
};

// 6 ô Quan tâm / Để lại thông tin / Đăng ký / Chờ xác nhận / Đã trả / Doanh thu của một sản phẩm. Số Đăng ký là liên kết sang bài nộp: 1 biểu mẫu → trang bài nộp
// của biểu mẫu đó; nhiều biểu mẫu → danh sách biểu mẫu (PR-1).
const FunnelCells = ({ funnel }) => {
  const { t } = useI18n();
  // Sự kiện miễn phí không thu tiền: API trả null cho các cột tiền → hiện "—" (khác 0 đồng).
  const noMoney = funnel?.paid === null && funnel?.revenue === null;
  const awaiting = funnel?.awaitingConfirm ?? 0;
  const registered = funnel?.registered ?? 0;
  const formIds = funnel?.formIds || [];
  const target =
    formIds.length === 1 ? `/app/forms/${formIds[0]}/submissions` : formIds.length > 1 ? '/app/forms' : null;
  return (
    <>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-right text-gray-900" data-testid="funnel-interested">
        {funnel?.interested ?? 0}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-right text-gray-900" data-testid="funnel-left-contact">
        {funnel?.leftContact ?? 0}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-right text-gray-900" data-testid="funnel-registered">
        {target ? (
          <Link to={target} className="text-primary-600 hover:underline">
            {registered}
          </Link>
        ) : (
          registered
        )}
      </td>
      <td
        className={`px-3 py-4 whitespace-nowrap text-sm text-right ${awaiting > 0 ? 'font-semibold text-amber-600' : 'text-gray-900'}`}
        data-testid="funnel-awaiting"
        title={awaiting > 0 ? t('products.funnel.awaitingConfirmTooltip', { amount: formatMoney(funnel?.awaitingAmount) }) : undefined}
      >
        {noMoney ? (
          '—'
        ) : target && awaiting > 0 ? (
          <Link to={target} className="hover:underline">
            {awaiting}
          </Link>
        ) : (
          awaiting
        )}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-right text-gray-900" data-testid="funnel-paid">
        {noMoney ? '—' : funnel?.paid ?? 0}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900" data-testid="funnel-revenue">
        {noMoney ? '—' : formatMoney(funnel?.revenue)}
      </td>
    </>
  );
};

const Products = () => {
  const { t } = useI18n();
  const { usage: storageQuota } = useStorageQuota();
  const activeContext = useAuthStore((state) => state.activeContext);
  // Số tiền là dữ liệu báo cáo: nhân viên chỉ thấy khi có `reports_view` (không có thì cũng không gọi API phễu).
  const canViewFunnel = activeContext?.type !== 'employee' || activeContext?.permissions?.reports_view === true;
  const [funnelPeriod, setFunnelPeriod] = useState('30d');
  const [funnelByProduct, setFunnelByProduct] = useState({});
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [formModal, setFormModal] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [categorySuggestions, setCategorySuggestions] = useState([]);
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);

  const loadCategories = async () => {
    try {
      const res = await productApiService.getCategories();
      setCategorySuggestions(res.data?.data?.categories || []);
    } catch {
      setCategorySuggestions([]);
    }
  };

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, search]);

  useEffect(() => {
    if (!canViewFunnel) return undefined;
    let active = true;
    productApiService
      .getFunnel({ period: funnelPeriod })
      .then((res) => {
        if (!active) return;
        const map = {};
        for (const row of res?.data?.data?.rows || []) map[row.productId] = row;
        setFunnelByProduct(map);
      })
      .catch(() => {
        if (active) {
          setFunnelByProduct({});
          toast.error(t('products.funnel.loadFailed'));
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canViewFunnel, funnelPeriod]);

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: 20,
        ...(search && { search }),
      };
      const res = await productApiService.getProducts(params);
      const data = res.data?.data || {};
      setProducts(data.products || []);
      setPagination((p) => ({
        ...p,
        total: data.pagination?.total ?? 0,
        totalPages: data.pagination?.totalPages ?? 1,
      }));
    } catch (error) {
      toast.error(t('products.loadFailed'));
      console.error('Error fetching products:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(pendingSearch);
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const openCreate = () => {
    setFormData(EMPTY_FORM);
    setFormModal({ mode: 'create' });
    loadCategories();
  };

  const openEdit = (product) => {
    setFormData({
      productCode: product.productCode || '',
      productName: product.productName || '',
      price: product.price || '',
      originalPrice: product.originalPrice || '',
      description: product.description || '',
      usp: product.usp || '',
      category: product.category || '',
      thumbnailUrl: product.thumbnailUrl || '',
      productUrl: product.productUrl || '',
      targetAudience: product.targetAudience || '',
      status: product.status || 'active',
      kind: product.kind === 'event' ? 'event' : 'sale',
    });
    setFormModal({ mode: 'edit', id: product.id });
    loadCategories();
  };

  const closeFormModal = () => {
    if (isSaving) return;
    setFormModal(null);
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    if (!formData.productName.trim()) {
      toast.error(t('products.nameRequired'));
      return;
    }
    setIsSaving(true);
    try {
      if (formModal?.mode === 'edit') {
        await productApiService.updateProduct(formModal.id, formData);
        toast.success(t('products.updateSuccess'));
      } else {
        await productApiService.createProduct(formData);
        toast.success(t('products.createSuccess'));
      }
      setFormModal(null);
      await fetchProducts();
    } catch (error) {
      toast.error(error.response?.data?.message || t('products.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await productApiService.deleteProduct(deleteTarget.id);
      toast.success(t('products.deleteSuccess'));
      setDeleteTarget(null);
      await fetchProducts();
    } catch (error) {
      toast.error(error.response?.data?.message || t('products.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  const setField = (field, value) => setFormData((prev) => ({ ...prev, [field]: value }));

  const handleThumbnailUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || isUploadingThumbnail) return;
    if (!file.type.startsWith('image/')) {
      toast.error(t('products.imageRequired'));
      return;
    }
    const validation = validateFilesBeforeUpload([file], storageQuota);
    if (!validation.ok) {
      toast.error(getUploadValidationErrorMessage(validation, t));
      return;
    }
    setIsUploadingThumbnail(true);
    try {
      const payload = new FormData();
      payload.append('file', file);
      const res = await productApiService.uploadThumbnail(payload);
      const url = res.data?.data?.url;
      if (!url) throw new Error('missing-url');
      setField('thumbnailUrl', url);
      toast.success(t('products.uploadSuccess'));
      notifyStorageQuotaRefresh();
    } catch {
      toast.error(t('products.uploadFailed'));
    } finally {
      setIsUploadingThumbnail(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={HiOutlineCube}
        title={t('products.productManagement')}
        subtitle={t('products.productDescription')}
        actions={
          <button type="button" onClick={openCreate} className="btn btn-primary flex items-center gap-2">
            <HiOutlinePlus className="w-5 h-5" />
            {t('products.addProduct')}
          </button>
        }
      />

      <div className="card p-4">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="flex items-center flex-1 min-w-0 rounded-lg border border-gray-300 bg-white transition-base focus-within:border-primary-500 focus-within:ring-1 focus-within:ring-primary-500">
            <span className="pl-3 pr-2 text-gray-400 pointer-events-none shrink-0">
              <HiOutlineSearch className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
              placeholder={t('products.searchPlaceholder')}
              className="w-full py-2 pr-3 text-sm bg-transparent border-0 rounded-lg focus:outline-none"
            />
          </div>
          <button type="submit" className="btn btn-secondary shrink-0">
            {t('common.search')}
          </button>
          {canViewFunnel && (
            <select
              data-testid="products-funnel-period"
              aria-label={t('products.funnel.periodLabel')}
              value={funnelPeriod}
              onChange={(e) => setFunnelPeriod(e.target.value)}
              className="shrink-0 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500"
            >
              {FUNNEL_PERIODS.map((p) => (
                <option key={p} value={p}>
                  {t(`products.funnel.period${p}`)}
                </option>
              ))}
            </select>
          )}
        </form>
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="spinner w-8 h-8" />
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400 gap-3">
            <HiOutlineCube className="w-10 h-10" />
            <p>{t('products.noProducts')}</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {/* Có cột phễu: mã sản phẩm chuyển xuống dòng nhỏ dưới tên — bảng vừa màn hình laptop, cột Hành động không bị đẩy ra ngoài. */}
                    {!canViewFunnel && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('products.productCode')}
                      </th>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('products.productName')}
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('products.price')}
                    </th>
                    {canViewFunnel && (
                      <>
                        <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" title={t('products.funnel.interestedHint')}>
                          {t('products.funnel.interested')}
                        </th>
                        <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" title={t('products.funnel.leftContactHint')}>
                          {t('products.funnel.leftContact')}
                        </th>
                        <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" title={t('products.funnel.registeredHint')}>
                          {t('products.funnel.registered')}
                        </th>
                        <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider" title={t('products.funnel.awaitingConfirmHint')}>
                          {t('products.funnel.awaitingConfirm')}
                        </th>
                        <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('products.funnel.paid')}
                        </th>
                        <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          {t('products.funnel.revenue')}
                        </th>
                      </>
                    )}
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('common.status')}
                    </th>
                    {/* Khi có các cột phễu, bỏ cột ngày cập nhật để cột Hành động (sửa/xoá) không bị đẩy ra ngoài màn hình laptop. */}
                    {!canViewFunnel && (
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        {t('products.lastUpdated')}
                      </th>
                    )}
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {t('common.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {products.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      {!canViewFunnel && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {product.productCode || '—'}
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary-50 shrink-0 mr-3">
                            <HiOutlineCube className="w-5 h-5 text-primary-600" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {product.productName}
                              {product.kind === 'event' && (
                                <span
                                  data-testid="product-kind-badge"
                                  className="badge ml-2 bg-purple-100 text-purple-700 align-middle"
                                >
                                  {t('products.kindEventBadge')}
                                </span>
                              )}
                            </div>
                            {(canViewFunnel ? [product.productCode, product.category] : [product.category]).some(Boolean) && (
                              <div className="text-xs text-gray-500 mt-1" data-testid="product-subline">
                                {(canViewFunnel ? [product.productCode, product.category] : [product.category]).filter(Boolean).join(' · ')}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                        {product.price || (product.kind === 'event' ? t('products.priceFreePlaceholder') : '—')}
                      </td>
                      {canViewFunnel && (
                        <FunnelCells funnel={funnelByProduct[product.id]} />
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={product.status} kind={product.kind} />
                      </td>
                      {!canViewFunnel && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDate(product.updatedAt)}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(product)}
                            className="p-2 text-gray-500 hover:text-primary-600 hover:bg-primary-50 rounded-lg transition-colors"
                            title={t('common.edit')}
                          >
                            <HiOutlinePencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(product)}
                            className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title={t('common.delete')}
                          >
                            <HiOutlineTrash className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100">
                <p className="text-sm text-gray-500">{t('products.totalProducts', { total: pagination.total })}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                    disabled={pagination.page === 1}
                    className="btn btn-secondary btn-sm disabled:opacity-50"
                  >
                    <HiOutlineChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-sm px-1 text-gray-600">
                    {pagination.page} / {pagination.totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                    disabled={pagination.page === pagination.totalPages}
                    className="btn btn-secondary btn-sm disabled:opacity-50"
                  >
                    <HiOutlineChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {formModal && createPortal(
        <div className={MODAL_OVERLAY}>
          <button type="button" className="absolute inset-0 bg-black/50" onClick={closeFormModal} aria-label={t('common.close')} />
          <div className={MODAL_PANEL}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">
                {formModal.mode === 'edit' ? t('products.editProduct') : t('products.addProduct')}
              </h3>
              <button type="button" onClick={closeFormModal} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg">
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleFormSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('products.productName')} *</label>
                  <input
                    type="text"
                    value={formData.productName}
                    onChange={(e) => setField('productName', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{t('products.productCode')}</label>
                  <input
                    type="text"
                    value={formData.productCode}
                    onChange={(e) => setField('productCode', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="product-kind-select">{t('products.kindLabel')}</label>
                <select
                  id="product-kind-select"
                  data-testid="product-kind-select"
                  value={formData.kind}
                  onChange={(e) => setField('kind', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  {PRODUCT_KIND_OPTIONS.map((kind) => (
                    <option key={kind} value={kind}>
                      {kind === 'event' ? t('products.kindEvent') : t('products.kindSale')}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('products.price')}</label>
                <input
                  type="text"
                  value={formData.price}
                  onChange={(e) => setField('price', e.target.value)}
                  placeholder={formData.kind === 'event' ? t('products.priceFreePlaceholder') : t('products.pricePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('products.category')}</label>
                <input
                  type="text"
                  list="product-category-suggestions"
                  value={formData.category}
                  onChange={(e) => setField('category', e.target.value)}
                  placeholder={t('products.categoryPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
                <datalist id="product-category-suggestions">
                  {categorySuggestions.map((item) => (
                    <option key={item} value={item} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('products.description')}</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setField('description', e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('products.usp')}</label>
                <textarea
                  value={formData.usp}
                  onChange={(e) => setField('usp', e.target.value)}
                  rows={3}
                  placeholder={t('products.uspPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('products.productUrl')}</label>
                <input
                  type="url"
                  value={formData.productUrl}
                  onChange={(e) => setField('productUrl', e.target.value)}
                  placeholder={t('products.productUrlPlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('products.targetAudience')}</label>
                <textarea
                  value={formData.targetAudience}
                  onChange={(e) => setField('targetAudience', e.target.value)}
                  rows={2}
                  placeholder={t('products.targetAudiencePlaceholder')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('products.thumbnailUrl')}</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={formData.thumbnailUrl}
                    onChange={(e) => setField('thumbnailUrl', e.target.value)}
                    placeholder="https://..."
                    className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                  <label className="btn btn-secondary shrink-0 cursor-pointer">
                    {isUploadingThumbnail ? t('products.uploading') : t('products.uploadImage')}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleThumbnailUpload}
                      disabled={isUploadingThumbnail || isSaving}
                    />
                  </label>
                </div>
                {formData.thumbnailUrl ? (
                  <img
                    src={formData.thumbnailUrl}
                    alt={t('products.thumbnailPreview')}
                    className="mt-2 h-24 w-24 rounded-lg border border-gray-200 object-cover"
                  />
                ) : null}
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{t('common.status')}</label>
                <select
                  value={formData.status}
                  onChange={(e) => setField('status', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  {PRODUCT_STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status === 'active' ? t('products.statusActive') : t('products.statusInactive')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={closeFormModal} className="btn btn-secondary" disabled={isSaving}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  {isSaving ? t('common.saving') : t('common.save')}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {deleteTarget && createPortal(
        <div className={MODAL_OVERLAY}>
          <button type="button" className="absolute inset-0 bg-black/50" onClick={() => !isDeleting && setDeleteTarget(null)} aria-label={t('common.close')} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-gray-900">{t('products.confirmDeleteTitle')}</h3>
            <p className="mt-2 text-sm text-gray-600">
              {t('products.confirmDeleteMessage', { name: deleteTarget.productName })}
            </p>
            <div className="flex justify-end gap-3 mt-6">
              <button type="button" onClick={() => setDeleteTarget(null)} className="btn btn-secondary" disabled={isDeleting}>
                {t('common.cancel')}
              </button>
              <button type="button" onClick={handleDelete} className="btn bg-red-600 text-white hover:bg-red-700" disabled={isDeleting}>
                {isDeleting ? t('common.deleting') : t('common.delete')}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default Products;
