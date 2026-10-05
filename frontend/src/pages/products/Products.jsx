import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useI18n } from '../../i18n';
import { parseVndPrice } from '../../utils/parseVndPrice';
import { useAuthStore } from '../../stores/authStore';
import productApiService from '../../features/products/services/productApi.service';
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
  HiOutlineTag,
  HiOutlineCurrencyDollar,
  HiOutlineSparkles,
  HiOutlineLink,
  HiOutlinePhotograph,
} from 'react-icons/hi';

const MODAL_OVERLAY = 'fixed inset-0 z-[9999] flex items-center justify-center p-4';

const PRODUCT_STATUS_OPTIONS = ['active', 'inactive'];

const EMPTY_FORM = {
  productCode: '',
  productName: '',
  price: '',
  priceAmount: '',
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
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors shadow-2xs ${
        isActive
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80'
          : 'bg-slate-100 text-slate-600 border-slate-200'
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          isActive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'
        }`}
      />
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
  // Đã trả đếm NGƯỜI; số đơn thô chỉ hiện ở tooltip khi một người trả nhiều đơn.
  const paidPeople = funnel?.paid ?? 0;
  const paidOrders = funnel?.paidOrders ?? paidPeople;
  const formIds = funnel?.formIds || [];
  const target =
    formIds.length === 1 ? `/app/forms/${formIds[0]}/submissions` : formIds.length > 1 ? '/app/forms' : null;

  return (
    <>
      <td
        className="px-3 py-4 whitespace-nowrap text-sm text-right"
        data-testid="funnel-interested"
        title={
          funnel?.interested
            ? t('products.funnel.interestedBreakdown', {
                views: funnel?.landingViews ?? 0,
                clicks: funnel?.campaignClicks ?? 0,
                chats: funnel?.chatConversations ?? 0,
              })
            : undefined
        }
      >
        <span className={funnel?.interested ? 'font-semibold text-slate-800' : 'text-slate-400 font-normal'}>
          {funnel?.interested ?? 0}
        </span>
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-right" data-testid="funnel-left-contact">
        <span className={funnel?.leftContact ? 'font-semibold text-slate-800' : 'text-slate-400 font-normal'}>
          {funnel?.leftContact ?? 0}
        </span>
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-right" data-testid="funnel-registered">
        {target ? (
          <Link to={target} className="font-semibold text-primary-600 hover:text-primary-700 hover:underline">
            {registered}
          </Link>
        ) : (
          <span className={registered ? 'font-semibold text-slate-800' : 'text-slate-400 font-normal'}>
            {registered}
          </span>
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
          <Link to={target} className="hover:underline inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200/80 text-amber-700">
            {awaiting}
          </Link>
        ) : awaiting > 0 ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200/80 text-amber-700">
            {awaiting}
          </span>
        ) : (
          <span className="text-slate-400 font-normal">0</span>
        )}
      </td>
      <td
        className="px-3 py-4 whitespace-nowrap text-sm text-right"
        data-testid="funnel-paid"
        title={
          !noMoney && paidOrders > paidPeople
            ? t('products.funnel.paidPeopleOrdersTooltip', { people: paidPeople, orders: paidOrders })
            : undefined
        }
      >
        {noMoney ? (
          '—'
        ) : (
          <span className={paidPeople ? 'font-semibold text-slate-800' : 'text-slate-400 font-normal'}>
            {paidPeople}
          </span>
        )}
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-right" data-testid="funnel-revenue">
        {noMoney ? (
          '—'
        ) : funnel?.revenue ? (
          <span className="font-semibold text-emerald-600">
            {formatMoney(funnel?.revenue)}
          </span>
        ) : (
          <span className="text-slate-500 font-medium">0 đ</span>
        )}
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
      priceAmount: product.priceAmount === null || product.priceAmount === undefined ? '' : String(product.priceAmount),
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
      // priceAmount: ô trống -> null (server tự điền từ giá hiển thị nếu đọc được); có số -> số nguyên.
      const digits = String(formData.priceAmount ?? '').replace(/\D/g, '');
      const payload = { ...formData, priceAmount: digits === '' ? null : Number(digits) };
      if (formModal?.mode === 'edit') {
        await productApiService.updateProduct(formModal.id, payload);
        toast.success(t('products.updateSuccess'));
      } else {
        await productApiService.createProduct(payload);
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

  // Đổi giá chữ: nếu ô Giá bán (số) đang là số đọc từ giá chữ CŨ ("500k" → 500.000) thì đọc lại theo giá mới ("700k" →
  // 700.000; đọc không được → trống). Số người dùng tự nhập khác giá chữ thì giữ nguyên.
  const handlePriceTextChange = (value) =>
    setFormData((prev) => {
      const derivedFromOld = prev.priceAmount !== '' && Number(prev.priceAmount) === parseVndPrice(prev.price);
      if (!derivedFromOld) return { ...prev, price: value };
      const next = parseVndPrice(value);
      return { ...prev, price: value, priceAmount: next === null ? '' : String(next) };
    });

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
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-500/10 via-amber-500/10 to-orange-500/5 text-orange-600 border border-orange-200/70 shadow-xs">
            <HiOutlineCube className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {t('products.productManagement')}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-relaxed">
              {t('products.productDescription')}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-sm font-semibold shadow-sm hover:shadow transition-all duration-150 shrink-0"
        >
          <HiOutlinePlus className="w-4 h-4 stroke-[2.5]" />
          <span>{t('products.addProduct')}</span>
        </button>
      </div>

      {/* ── Filter & Search Toolbar ── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-xs">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <div className="flex items-center flex-1 min-w-0 rounded-xl border border-slate-200 bg-slate-50/50 transition-all focus-within:bg-white focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20">
            <span className="pl-3.5 pr-2 text-slate-400 pointer-events-none shrink-0">
              <HiOutlineSearch className="w-4 h-4" />
            </span>
            <input
              type="text"
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
              placeholder={t('products.searchPlaceholder')}
              className="w-full py-2 pr-3 text-sm bg-transparent border-0 focus:outline-none placeholder:text-slate-400 text-slate-800"
            />
            {pendingSearch && (
              <button
                type="button"
                onClick={() => {
                  setPendingSearch('');
                  setSearch('');
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
                className="pr-3 text-slate-400 hover:text-slate-600"
                title="Xóa tìm kiếm"
              >
                <HiOutlineX className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="submit"
              className="inline-flex items-center justify-center px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shadow-xs"
            >
              {t('common.search')}
            </button>

            {canViewFunnel && (
              <select
                data-testid="products-funnel-period"
                aria-label={t('products.funnel.periodLabel')}
                value={funnelPeriod}
                onChange={(e) => setFunnelPeriod(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 shadow-xs cursor-pointer"
              >
                {FUNNEL_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {t(`products.funnel.period${p}`)}
                  </option>
                ))}
              </select>
            )}

            {pagination.total > 0 && (
              <span className="hidden md:inline-flex items-center px-2.5 py-1.5 rounded-lg bg-slate-100 text-[11px] font-semibold text-slate-600 border border-slate-200/60">
                {t('products.totalProducts', { total: pagination.total })}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* ── Table Card ── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500 font-medium">Đang tải danh sách sản phẩm…</p>
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-200/60 flex items-center justify-center text-orange-400 mb-3 shadow-xs">
              <HiOutlineCube className="w-7 h-7" />
            </div>
            <p className="text-sm font-semibold text-slate-700">{t('products.noProducts')}</p>
            <p className="text-xs text-slate-400 mt-1 max-w-sm leading-relaxed">
              Bấm "+ Thêm sản phẩm" ở trên để đưa các sản phẩm hoặc dịch vụ vào hệ thống.
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50/80">
                  <tr>
                    {/* Có cột phễu: mã sản phẩm chuyển xuống dòng nhỏ dưới tên — bảng vừa màn hình laptop, cột Hành động không bị đẩy ra ngoài. */}
                    {!canViewFunnel && (
                      <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        {t('products.productCode')}
                      </th>
                    )}
                    <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      {t('products.productName')}
                    </th>
                    <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      {t('products.price')}
                    </th>
                    {canViewFunnel && (
                      <>
                        <th className="px-3 py-3.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider" title={t('products.funnel.interestedHint')}>
                          {t('products.funnel.interested')}
                        </th>
                        <th className="px-3 py-3.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider" title={t('products.funnel.leftContactHint')}>
                          {t('products.funnel.leftContact')}
                          <span className="block normal-case font-normal text-slate-400 text-[10px]">({t('products.funnel.peopleUnit')})</span>
                        </th>
                        <th className="px-3 py-3.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider" title={t('products.funnel.registeredHint')}>
                          {t('products.funnel.registered')}
                          <span className="block normal-case font-normal text-slate-400 text-[10px]">({t('products.funnel.peopleUnit')})</span>
                        </th>
                        <th className="px-3 py-3.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider" title={t('products.funnel.awaitingConfirmHint')}>
                          {t('products.funnel.awaitingConfirm')}
                        </th>
                        <th className="px-3 py-3.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider" title={t('products.funnel.paidHint')}>
                          {t('products.funnel.paid')}
                          <span className="block normal-case font-normal text-slate-400 text-[10px]">({t('products.funnel.peopleUnit')})</span>
                        </th>
                        <th className="px-3 py-3.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          {t('products.funnel.revenue')}
                        </th>
                      </>
                    )}
                    <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      {t('common.status')}
                    </th>
                    {/* Khi có các cột phễu, bỏ cột ngày cập nhật để cột Hành động (sửa/xoá) không bị đẩy ra ngoài màn hình laptop. */}
                    {!canViewFunnel && (
                      <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                        {t('products.lastUpdated')}
                      </th>
                    )}
                    <th className="px-6 py-3.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                      {t('common.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100">
                  {products.map((product) => (
                    <tr key={product.id} className="hover:bg-slate-50/70 transition-colors">
                      {!canViewFunnel && (
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 font-mono">
                          {product.productCode || '—'}
                        </td>
                      )}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3.5 min-w-0">
                          {product.thumbnailUrl ? (
                            <img
                              src={product.thumbnailUrl}
                              alt={product.productName}
                              className="w-10 h-10 rounded-xl object-cover border border-slate-200 shrink-0 shadow-2xs"
                            />
                          ) : (
                            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/10 via-amber-500/10 to-orange-500/5 border border-orange-200/60 text-orange-600 shrink-0 shadow-2xs">
                              <HiOutlineCube className="w-5 h-5" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-semibold text-slate-900 truncate">
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
                              <div className="text-xs text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap" data-testid="product-subline">
                                {(canViewFunnel ? [product.productCode, product.category] : [product.category]).filter(Boolean).map((tag, idx) => (
                                  <span key={idx} className="inline-flex items-center text-slate-500">
                                    {idx > 0 && <span className="mx-1 text-slate-300">·</span>}
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-semibold">
                        {product.price || (product.kind === 'event' ? t('products.priceFreePlaceholder') : '—')}
                      </td>
                      {canViewFunnel && (
                        <FunnelCells funnel={funnelByProduct[product.id]} />
                      )}
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={product.status} kind={product.kind} />
                      </td>
                      {!canViewFunnel && (
                        <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                          {formatDate(product.updatedAt)}
                        </td>
                      )}
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(product)}
                            className="p-1.5 text-slate-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors"
                            title={t('common.edit')}
                          >
                            <HiOutlinePencil className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(product)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
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
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50/50">
                <p className="text-xs text-slate-500 font-medium">{t('products.totalProducts', { total: pagination.total })}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                    disabled={pagination.page === 1}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 transition-colors shadow-2xs"
                  >
                    <HiOutlineChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold px-2 text-slate-700">
                    {pagination.page} / {pagination.totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                    disabled={pagination.page === pagination.totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 disabled:opacity-40 transition-colors shadow-2xs"
                  >
                    <HiOutlineChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modal Thêm / Sửa Sản Phẩm ── */}
      {formModal && createPortal(
        <div className={MODAL_OVERLAY}>
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity cursor-default"
            onClick={closeFormModal}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-200">
            {/* ── Sticky Header ── */}
            <div className="sticky top-0 z-20 flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-white/95 backdrop-blur-md">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-orange-50 border border-orange-200/70 text-orange-600 flex items-center justify-center shrink-0 shadow-2xs">
                  <HiOutlineCube className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                    {formModal.mode === 'edit' ? t('products.editProduct') : t('products.addProduct')}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {formModal.mode === 'edit' ? 'Chỉnh sửa thông tin chi tiết sản phẩm / dịch vụ' : 'Thêm mới sản phẩm vào kho dữ liệu AI & chiến dịch'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeFormModal}
                aria-label={t('common.close')}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
              >
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>

            {/* ── Scrollable Form Body ── */}
            <form id="product-form" onSubmit={handleFormSubmit} className="p-6 space-y-6 overflow-y-auto flex-1 text-xs sm:text-sm">
              {/* Section 1: Thông tin cơ bản */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <HiOutlineTag className="w-4 h-4 text-orange-500" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Thông tin cơ bản & Phân loại
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {t('products.productName')} <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={formData.productName}
                      onChange={(e) => setField('productName', e.target.value)}
                      placeholder="VD: Khoá học AI thực chiến"
                      className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 font-medium text-slate-800"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {t('products.productCode')}
                    </label>
                    <input
                      type="text"
                      value={formData.productCode}
                      onChange={(e) => setField('productCode', e.target.value)}
                      placeholder="VD: SP-AI-01"
                      className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 font-mono text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5" htmlFor="product-kind-select">
                      {t('products.kindLabel')}
                    </label>
                    <select
                      id="product-kind-select"
                      data-testid="product-kind-select"
                      value={formData.kind}
                      onChange={(e) => setField('kind', e.target.value)}
                      className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all cursor-pointer font-medium text-slate-800"
                    >
                      {PRODUCT_KIND_OPTIONS.map((kind) => (
                        <option key={kind} value={kind}>
                          {kind === 'event' ? t('products.kindEvent') : t('products.kindSale')}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {t('products.category')}
                    </label>
                    <input
                      type="text"
                      list="product-category-suggestions"
                      value={formData.category}
                      onChange={(e) => setField('category', e.target.value)}
                      placeholder={t('products.categoryPlaceholder')}
                      className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 text-slate-800"
                    />
                    <datalist id="product-category-suggestions">
                      {categorySuggestions.map((item) => (
                        <option key={item} value={item} />
                      ))}
                    </datalist>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {t('common.status')}
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setField('status', e.target.value)}
                      className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all cursor-pointer font-medium text-slate-800"
                    >
                      {PRODUCT_STATUS_OPTIONS.map((status) => (
                        <option key={status} value={status}>
                          {status === 'active' ? t('products.statusActive') : t('products.statusInactive')}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Section 2: Thiết lập giá & Doanh thu */}
              <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/50 via-orange-50/20 to-white p-4 sm:p-5 shadow-2xs space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-amber-100">
                  <HiOutlineCurrencyDollar className="w-4 h-4 text-amber-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-900">
                    Thiết lập giá & Doanh thu
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {t('products.price')}
                    </label>
                    <input
                      type="text"
                      value={formData.price}
                      onChange={(e) => handlePriceTextChange(e.target.value)}
                      placeholder={formData.kind === 'event' ? t('products.priceFreePlaceholder') : t('products.pricePlaceholder')}
                      className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 font-semibold text-slate-900"
                    />
                    <p className="mt-1 text-[11px] text-slate-500">
                      Hiển thị trực quan cho khách (VD: 500k, 2.9tr/tháng, Miễn phí)
                    </p>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {t('products.priceAmount')}
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      data-testid="product-price-amount"
                      value={formData.priceAmount === '' ? '' : Number(formData.priceAmount).toLocaleString('vi-VN')}
                      onChange={(e) => setField('priceAmount', e.target.value.replace(/\D/g, ''))}
                      placeholder={t('products.priceAmountPlaceholder')}
                      className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 font-mono font-medium text-slate-900"
                    />
                    {(() => {
                      const suggested = formData.priceAmount === '' ? parseVndPrice(formData.price) : null;
                      return suggested !== null ? (
                        <div
                          className="mt-1.5 flex items-center justify-between gap-2 px-2.5 py-1 rounded-lg bg-amber-100/70 border border-amber-200 text-xs text-amber-900 font-medium"
                          data-testid="product-price-amount-suggest"
                        >
                          <span>{t('products.priceAmountSuggest', { amount: formatMoney(suggested) })}</span>
                          <button
                            type="button"
                            className="font-bold text-orange-700 hover:text-orange-950 underline shrink-0 cursor-pointer"
                            onClick={() => setField('priceAmount', String(suggested))}
                          >
                            {t('products.priceAmountUse')}
                          </button>
                        </div>
                      ) : (
                        <p className="mt-1 text-[11px] text-slate-500 leading-relaxed">
                          {t('products.priceAmountHint')}
                        </p>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Section 3: Nội dung cho AI & Chiến dịch */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <HiOutlineSparkles className="w-4 h-4 text-purple-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Nội dung cho AI & Chiến dịch tiếp thị
                  </span>
                </div>

                <div className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {t('products.description')}
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => setField('description', e.target.value)}
                      rows={2}
                      placeholder="Mô tả tóm tắt giá trị hoặc nội dung của sản phẩm / dịch vụ..."
                      className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {t('products.usp')}
                    </label>
                    <textarea
                      value={formData.usp}
                      onChange={(e) => setField('usp', e.target.value)}
                      rows={2}
                      placeholder={t('products.uspPlaceholder')}
                      className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 text-slate-800"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {t('products.targetAudience')}
                    </label>
                    <textarea
                      value={formData.targetAudience}
                      onChange={(e) => setField('targetAudience', e.target.value)}
                      rows={2}
                      placeholder={t('products.targetAudiencePlaceholder')}
                      className="w-full px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 text-slate-800"
                    />
                  </div>
                </div>
              </div>

              {/* Section 4: Media & Đường dẫn */}
              <div className="rounded-2xl border border-slate-200/90 bg-white p-4 sm:p-5 shadow-2xs space-y-4">
                <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                  <HiOutlinePhotograph className="w-4 h-4 text-sky-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Hình ảnh & Đường dẫn liên kết
                  </span>
                </div>

                <div className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {t('products.productUrl')}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                        <HiOutlineLink className="w-4 h-4" />
                      </div>
                      <input
                        type="url"
                        value={formData.productUrl}
                        onChange={(e) => setField('productUrl', e.target.value)}
                        placeholder={t('products.productUrlPlaceholder')}
                        className="w-full pl-9 pr-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 text-slate-800"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {t('products.thumbnailUrl')}
                    </label>
                    <div className="flex gap-2.5">
                      <input
                        type="url"
                        value={formData.thumbnailUrl}
                        onChange={(e) => setField('thumbnailUrl', e.target.value)}
                        placeholder="https://..."
                        className="flex-1 min-w-0 px-3.5 py-2 text-sm bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 text-slate-800"
                      />
                      <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 cursor-pointer transition-colors shadow-2xs shrink-0">
                        <HiOutlinePhotograph className="w-4 h-4 text-slate-500" />
                        <span>{isUploadingThumbnail ? t('products.uploading') : t('products.uploadImage')}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleThumbnailUpload}
                          disabled={isUploadingThumbnail || isSaving}
                        />
                      </label>
                    </div>

                    {formData.thumbnailUrl && (
                      <div className="mt-2.5 flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 bg-slate-50/70">
                        <img
                          src={formData.thumbnailUrl}
                          alt={t('products.thumbnailPreview')}
                          className="h-16 w-16 rounded-lg border border-slate-200 object-cover shadow-2xs"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-slate-700 truncate">{formData.thumbnailUrl}</p>
                          <button
                            type="button"
                            onClick={() => setField('thumbnailUrl', '')}
                            className="text-xs text-rose-600 hover:text-rose-700 hover:underline mt-1 inline-flex items-center gap-1"
                          >
                            <HiOutlineTrash className="w-3.5 h-3.5" />
                            <span>Gỡ ảnh</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </form>

            {/* ── Sticky Modal Footer ── */}
            <div className="sticky bottom-0 z-20 flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 bg-slate-50/95 backdrop-blur-md">
              <button
                type="button"
                onClick={closeFormModal}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shadow-2xs"
                disabled={isSaving}
              >
                {t('common.cancel')}
              </button>
              <button
                type="submit"
                form="product-form"
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white text-xs font-bold shadow-sm hover:shadow transition-all duration-150 disabled:opacity-50 flex items-center gap-2"
                disabled={isSaving}
              >
                {isSaving && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                <span>{isSaving ? t('common.saving') : t('common.save')}</span>
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Modal Xóa Sản Phẩm ── */}
      {deleteTarget && createPortal(
        <div className={MODAL_OVERLAY}>
          <button
            type="button"
            className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
            onClick={() => !isDeleting && setDeleteTarget(null)}
            aria-label={t('common.close')}
          />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3.5 mb-4">
              <div className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200/60 text-rose-600 flex items-center justify-center shrink-0">
                <HiOutlineTrash className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">{t('products.confirmDeleteTitle')}</h3>
                <p className="text-xs text-slate-500 mt-0.5">Hành động này không thể hoàn tác</p>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed bg-slate-50 p-3.5 rounded-xl border border-slate-100">
              {t('products.confirmDeleteMessage', { name: deleteTarget.productName })}
            </p>

            <div className="flex items-center justify-end gap-2.5 mt-6">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shadow-2xs"
                disabled={isDeleting}
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-xs hover:shadow transition-all duration-150 disabled:opacity-50 flex items-center gap-1.5"
                disabled={isDeleting}
              >
                {isDeleting && <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />}
                <span>{isDeleting ? t('common.deleting') : t('common.delete')}</span>
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
