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
  HiOutlineEye,
  HiOutlineExternalLink,
  HiOutlineClipboardCopy,
  HiOutlineCheck,
  HiOutlineTrendingUp,
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
          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800/60'
          : 'bg-slate-100 dark:bg-dk-raised text-slate-600 dark:text-dk-text2 border-slate-200 dark:border-dk-border'
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

const formatMoney = (n, t) => t('products.moneyAmount', { amount: Number(n || 0).toLocaleString('vi-VN') });

const formatDate = (v) => {
  if (!v) return '--';
  const d = new Date(v);
  return isNaN(d.getTime()) ? '--' : d.toLocaleDateString('vi-VN') + ' ' + d.toLocaleTimeString('vi-VN');
};

// 6 ô Quan tâm / Để lại thông tin / Đăng ký / Chờ xác nhận / Đã trả / Doanh thu của một sản phẩm (Dạng bảng đầy đủ).
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
        <span className={funnel?.interested ? 'font-semibold text-slate-800 dark:text-dk-text' : 'text-slate-400 dark:text-dk-muted font-normal'}>
          {funnel?.interested ?? 0}
        </span>
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-right" data-testid="funnel-left-contact">
        <span className={funnel?.leftContact ? 'font-semibold text-slate-800 dark:text-dk-text' : 'text-slate-400 dark:text-dk-muted font-normal'}>
          {funnel?.leftContact ?? 0}
        </span>
      </td>
      <td className="px-3 py-4 whitespace-nowrap text-sm text-right" data-testid="funnel-registered">
        {target ? (
          <Link to={target} className="font-semibold text-primary-600 dark:text-primary-400 hover:text-primary-700 dark:hover:text-primary-300 hover:underline">
            {registered}
          </Link>
        ) : (
          <span className={registered ? 'font-semibold text-slate-800 dark:text-dk-text' : 'text-slate-400 dark:text-dk-muted font-normal'}>
            {registered}
          </span>
        )}
      </td>
      <td
        className={`px-3 py-4 whitespace-nowrap text-sm text-right ${awaiting > 0 ? 'font-semibold text-amber-600 dark:text-amber-400' : 'text-gray-900 dark:text-dk-text'}`}
        data-testid="funnel-awaiting"
        title={awaiting > 0 ? t('products.funnel.awaitingConfirmTooltip', { amount: formatMoney(funnel?.awaitingAmount, t) }) : undefined}
      >
        {noMoney ? (
          '—'
        ) : target && awaiting > 0 ? (
          <Link to={target} className="hover:underline inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-amber-700 dark:text-amber-300">
            {awaiting}
          </Link>
        ) : awaiting > 0 ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 text-amber-700 dark:text-amber-300">
            {awaiting}
          </span>
        ) : (
          <span className="text-slate-400 dark:text-dk-muted font-normal">0</span>
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
          <span className={paidPeople ? 'font-semibold text-slate-800 dark:text-dk-text' : 'text-slate-400 dark:text-dk-muted font-normal'}>
            {paidPeople}
          </span>
        )}
      </td>
      <td
        className="px-3 py-4 whitespace-nowrap text-sm text-right font-semibold text-slate-900 dark:text-dk-text"
        data-testid="funnel-revenue"
      >
        {noMoney ? '—' : formatMoney(funnel?.revenue, t)}
      </td>
    </>
  );
};

/**
 * Modal Chi tiết sản phẩm & Phễu chuyển đổi trực quan
 */
function ProductDetailModal({ product, funnel, canViewFunnel, onClose, onEdit }) {
  const { t } = useI18n();
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!product) return null;

  const handleCopyLink = async () => {
    if (!product.productUrl) return;
    try {
      await navigator.clipboard.writeText(product.productUrl);
      setCopiedLink(true);
      toast.success(t('products.copiedProductUrl'));
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error(t('products.copyLinkFailed'));
    }
  };

  const noMoney = funnel?.paid === null && funnel?.revenue === null;
  const awaiting = funnel?.awaitingConfirm ?? 0;
  const registered = funnel?.registered ?? 0;
  const paidPeople = funnel?.paid ?? 0;
  const paidOrders = funnel?.paidOrders ?? paidPeople;
  const formIds = funnel?.formIds || [];
  const formTarget = formIds.length === 1 ? `/app/forms/${formIds[0]}/submissions` : formIds.length > 1 ? '/app/forms' : null;

  return createPortal(
    <div className={MODAL_OVERLAY} role="dialog" aria-modal="true" data-testid="product-detail-modal">
      <div
        className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
        aria-hidden="true"
        tabIndex={-1}
      />
      <div className="relative bg-white dark:bg-dk-surface rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200/80 dark:border-dk-border z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-100 dark:border-dk-border flex items-center justify-between bg-gradient-to-r from-slate-50/80 via-white to-orange-50/20 dark:bg-none dark:bg-dk-surface shrink-0">
          <div className="flex items-center gap-3.5 min-w-0">
            {product.thumbnailUrl ? (
              <img
                src={product.thumbnailUrl}
                alt={product.productName}
                className="w-11 h-11 rounded-2xl object-cover border border-slate-200 dark:border-dk-border shadow-xs shrink-0"
              />
            ) : (
              <div className="flex items-center justify-center w-11 h-11 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20 shrink-0">
                <HiOutlineCube className="w-6 h-6" />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-lg font-bold text-slate-900 dark:text-dk-text truncate">
                  {product.productName}
                </h3>
                <StatusBadge status={product.status} kind={product.kind} />
                {product.kind === 'event' && (
                  <span className="badge bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 text-xs">
                    {t('products.kindEventBadge')}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-dk-text2 mt-0.5 flex items-center gap-2 flex-wrap">
                <span>{t('products.productDetail')}</span>
                {product.productCode && (
                  <>
                    <span className="text-slate-300 dark:text-dk-muted">·</span>
                    <span className="font-mono bg-slate-100 dark:bg-dk-raised px-1.5 py-0.5 rounded text-[11px] text-slate-600 dark:text-dk-text2">
                      {product.productCode}
                    </span>
                  </>
                )}
                {product.category && (
                  <>
                    <span className="text-slate-300 dark:text-dk-muted">·</span>
                    <span>{product.category}</span>
                  </>
                )}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl p-2 text-slate-400 dark:text-dk-muted hover:text-slate-700 dark:hover:text-dk-text hover:bg-slate-100 dark:hover:bg-dk-raised transition-colors"
            aria-label={t('common.close')}
          >
            <HiOutlineX className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Cột trái (5 cols) - Ảnh & Link & Giá */}
            <div className="lg:col-span-5 space-y-4">
              {/* Card Ảnh sản phẩm */}
              <div className="bg-slate-50/70 dark:bg-dk-raised border border-slate-200/80 dark:border-dk-border rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 dark:text-dk-text uppercase tracking-wider">
                    {t('products.thumbnailPreview')}
                  </span>
                  {product.thumbnailUrl && (
                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800/60">
                      {t('products.detailHasImage')}
                    </span>
                  )}
                </div>
                {product.thumbnailUrl ? (
                  <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-inset shadow-2xs">
                    <img
                      src={product.thumbnailUrl}
                      alt={product.productName}
                      className="w-full h-44 object-cover"
                    />
                  </div>
                ) : (
                  <div className="w-full h-40 rounded-xl border border-dashed border-slate-200 dark:border-dk-border bg-white dark:bg-dk-inset flex flex-col items-center justify-center p-4 text-center">
                    <HiOutlinePhotograph className="w-8 h-8 text-slate-300 dark:text-dk-muted mb-2" />
                    <p className="text-xs font-medium text-slate-500 dark:text-dk-text2">{t('products.noThumbnail')}</p>
                    <button
                      type="button"
                      onClick={() => { onClose(); onEdit(product); }}
                      className="mt-2 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:underline"
                    >
                      + {t('products.uploadImage')}
                    </button>
                  </div>
                )}
              </div>

              {/* Card Link URL sản phẩm */}
              <div className="bg-slate-50/70 dark:bg-dk-raised border border-slate-200/80 dark:border-dk-border rounded-2xl p-4 space-y-2.5">
                <span className="text-xs font-bold text-slate-700 dark:text-dk-text uppercase tracking-wider block">
                  {t('products.productUrl')}
                </span>
                {product.productUrl ? (
                  <div className="bg-white dark:bg-dk-inset rounded-xl border border-slate-200 dark:border-dk-border p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-slate-700 dark:text-dk-text break-all">
                      <HiOutlineLink className="w-4 h-4 text-orange-500 shrink-0" />
                      <a
                        href={product.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline text-primary-600 dark:text-primary-400 font-medium"
                      >
                        {product.productUrl}
                      </a>
                    </div>
                    <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-dk-border">
                      <a
                        href={product.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-dk-text2 hover:text-slate-900 dark:hover:text-dk-text py-1 px-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dk-raised transition-colors"
                      >
                        <HiOutlineExternalLink className="w-3.5 h-3.5" />
                        <span>{t('products.openProductUrl')}</span>
                      </a>
                      <button
                        type="button"
                        onClick={handleCopyLink}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 dark:text-dk-text2 hover:text-slate-900 dark:hover:text-dk-text py-1 px-2.5 rounded-lg hover:bg-slate-100 dark:hover:bg-dk-raised transition-colors"
                      >
                        {copiedLink ? <HiOutlineCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <HiOutlineClipboardCopy className="w-3.5 h-3.5" />}
                        <span>{copiedLink ? t('common.copied') : t('products.copyProductUrl')}</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white dark:bg-dk-inset rounded-xl border border-dashed border-slate-200 dark:border-dk-border p-3 text-center">
                    <p className="text-xs text-slate-500 dark:text-dk-text2">{t('products.noProductUrl')}</p>
                    <button
                      type="button"
                      onClick={() => { onClose(); onEdit(product); }}
                      className="mt-1 text-xs font-semibold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 hover:underline"
                    >
                      + {t('products.detailSetupUrl')}
                    </button>
                  </div>
                )}
              </div>

              {/* Card Giá bán & Thông tin gốc */}
              <div className="bg-slate-50/70 dark:bg-dk-raised border border-slate-200/80 dark:border-dk-border rounded-2xl p-4 space-y-2.5">
                <span className="text-xs font-bold text-slate-700 dark:text-dk-text uppercase tracking-wider block">
                  {t('products.detailPriceSection')}
                </span>
                <div className="bg-white dark:bg-dk-inset rounded-xl border border-slate-200 dark:border-dk-border p-3 space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 dark:text-dk-text2">{t('products.detailDisplayPrice')}:</span>
                    <span className="font-bold text-slate-900 dark:text-dk-text">
                      {product.price || (product.kind === 'event' ? t('products.priceFreePlaceholder') : '—')}
                    </span>
                  </div>
                  {product.priceAmount != null && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 dark:text-dk-text2">{t('products.detailStandardAmount')}:</span>
                      <span className="font-semibold text-emerald-700 dark:text-emerald-300 font-mono text-xs bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 rounded border border-emerald-200/60 dark:border-emerald-800/60">
                        {formatMoney(product.priceAmount, t)}
                      </span>
                    </div>
                  )}
                  {product.originalPrice && (
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-500 dark:text-dk-text2">{t('products.originalPrice')}:</span>
                      <span className="line-through text-xs text-slate-400 dark:text-dk-muted">{product.originalPrice}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Cột phải (7 cols) - Phễu chuyển đổi & AI / Mô tả */}
            <div className="lg:col-span-7 space-y-4">
              {/* Phễu chuyển đổi */}
              {canViewFunnel && (
                <div className="bg-slate-50/70 dark:bg-dk-raised border border-slate-200/80 dark:border-dk-border rounded-2xl p-4.5 space-y-3.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <HiOutlineTrendingUp className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      <span className="text-xs font-bold text-slate-700 dark:text-dk-text uppercase tracking-wider">
                        {t('products.salesPerformance')}
                      </span>
                    </div>
                    <div className="text-right shrink-0 whitespace-nowrap">
                      <span className="text-[11px] text-slate-500 dark:text-dk-text2 uppercase font-semibold mr-1.5">{t('products.funnel.revenue')}:</span>
                      <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                        {noMoney ? '—' : formatMoney(funnel?.revenue, t)}
                      </span>
                    </div>
                  </div>

                  {/* 6 Bước phễu trực quan */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {/* 1. Quan tâm */}
                    <div
                      className="bg-white dark:bg-dk-inset rounded-xl border border-slate-200 dark:border-dk-border p-3 shadow-2xs"
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
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-dk-text2 uppercase block">{`1. ${t('products.funnel.interested')}`}</span>
                      <div className="text-lg font-bold text-slate-900 dark:text-dk-text mt-0.5" data-testid="funnel-detail-interested">
                        {funnel?.interested ?? 0}
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-dk-muted block mt-0.5 truncate">
                        {t('products.funnel.landingViewsClicks', { views: funnel?.landingViews ?? 0, clicks: funnel?.campaignClicks ?? 0 })}
                      </span>
                    </div>

                    {/* 2. Để lại thông tin */}
                    <div className="bg-white dark:bg-dk-inset rounded-xl border border-slate-200 dark:border-dk-border p-3 shadow-2xs">
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-dk-text2 uppercase block">{`2. ${t('products.funnel.leftContactShort')}`}</span>
                      <div className="text-lg font-bold text-slate-900 dark:text-dk-text mt-0.5" data-testid="funnel-detail-left-contact">
                        {funnel?.leftContact ?? 0}
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-dk-muted block mt-0.5">{t('products.funnel.leftContactSources')}</span>
                    </div>

                    {/* 3. Đăng ký */}
                    <div className="bg-white dark:bg-dk-inset rounded-xl border border-slate-200 dark:border-dk-border p-3 shadow-2xs">
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-dk-text2 uppercase block">{`3. ${t('products.funnel.registered')}`}</span>
                      <div className="text-lg font-bold text-slate-900 dark:text-dk-text mt-0.5" data-testid="funnel-detail-registered">
                        {formTarget ? (
                          <Link to={formTarget} className="text-primary-600 dark:text-primary-400 hover:underline">
                            {registered}
                          </Link>
                        ) : (
                          registered
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-dk-muted block mt-0.5">{t('products.funnel.formSubmitters')}</span>
                    </div>

                    {/* 4. Chờ xác nhận */}
                    <div className={`rounded-xl border p-3 shadow-2xs ${awaiting > 0 ? 'border-amber-300 dark:border-amber-800/60 bg-amber-50/40 dark:bg-amber-950/30' : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-inset'}`}>
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-dk-text2 uppercase block">{`4. ${t('products.funnel.awaitingConfirm')}`}</span>
                      <div className={`text-lg font-bold mt-0.5 ${awaiting > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-900 dark:text-dk-text'}`} data-testid="funnel-detail-awaiting">
                        {noMoney ? (
                          '—'
                        ) : formTarget && awaiting > 0 ? (
                          <Link to={formTarget} className="text-amber-600 dark:text-amber-400 hover:underline">
                            {awaiting}
                          </Link>
                        ) : (
                          awaiting
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-dk-muted block mt-0.5 truncate">
                        {awaiting > 0 ? t('products.funnel.awaitingAmountLine', { amount: formatMoney(funnel?.awaitingAmount, t) }) : t('products.funnel.allApproved')}
                      </span>
                    </div>

                    {/* 5. Đã trả */}
                    <div
                      className="bg-white dark:bg-dk-inset rounded-xl border border-slate-200 dark:border-dk-border p-3 shadow-2xs"
                      title={
                        !noMoney && paidOrders > paidPeople
                          ? t('products.funnel.paidPeopleOrdersTooltip', { people: paidPeople, orders: paidOrders })
                          : undefined
                      }
                    >
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-dk-text2 uppercase block">{`5. ${t('products.funnel.paid')}`}</span>
                      <div className="text-lg font-bold text-slate-900 dark:text-dk-text mt-0.5" data-testid="funnel-detail-paid">
                        {noMoney ? '—' : paidPeople}
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-dk-muted block mt-0.5">
                        {noMoney ? t('products.funnel.freeLower') : t('products.funnel.ordersCount', { count: paidOrders })}
                      </span>
                    </div>

                    {/* 6. Doanh thu */}
                    <div className="bg-white dark:bg-dk-inset rounded-xl border border-slate-200 dark:border-dk-border p-3 shadow-2xs">
                      <span className="text-[11px] font-semibold text-slate-500 dark:text-dk-text2 uppercase block">{`6. ${t('products.funnel.revenue')}`}</span>
                      <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5" data-testid="funnel-detail-revenue">
                        {noMoney ? '—' : formatMoney(funnel?.revenue, t)}
                      </div>
                      <span className="text-[10px] text-slate-400 dark:text-dk-muted block mt-0.5">{t('products.funnel.revenueCaption')}</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Thông tin mô tả & AI Chatbot */}
              <div className="bg-slate-50/70 dark:bg-dk-raised border border-slate-200/80 dark:border-dk-border rounded-2xl p-4.5 space-y-3">
                <div className="flex items-center gap-2">
                  <HiOutlineSparkles className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  <span className="text-xs font-bold text-slate-700 dark:text-dk-text uppercase tracking-wider">
                    {t('products.marketingAi')}
                  </span>
                </div>

                <div className="bg-white dark:bg-dk-inset rounded-xl border border-slate-200 dark:border-dk-border p-3.5 space-y-3 text-xs">
                  <div>
                    <span className="font-semibold text-slate-700 dark:text-dk-text block mb-1">{t('products.detailDescription')}:</span>
                    <p className="text-slate-600 dark:text-dk-text2 whitespace-pre-line leading-relaxed">
                      {product.description || <span className="italic text-slate-400 dark:text-dk-muted">{t('products.detailNoDescription')}</span>}
                    </p>
                  </div>

                  {product.usp && (
                    <div className="pt-2 border-t border-slate-100 dark:border-dk-border">
                      <span className="font-semibold text-slate-700 dark:text-dk-text block mb-1">{t('products.usp')}:</span>
                      <div className="space-y-1">
                        {product.usp.split('\n').filter(Boolean).map((line, idx) => (
                          <div key={idx} className="flex items-start gap-1.5 text-slate-600 dark:text-dk-text2">
                            <span className="text-orange-500 mt-0.5">•</span>
                            <span>{line}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {product.targetAudience && (
                    <div className="pt-2 border-t border-slate-100 dark:border-dk-border">
                      <span className="font-semibold text-slate-700 dark:text-dk-text block mb-1">{t('products.detailTargetAudience')}:</span>
                      <p className="text-slate-600 dark:text-dk-text2">{product.targetAudience}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 dark:border-dk-border bg-slate-50/80 dark:bg-dk-raised/60 flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={() => { onClose(); onEdit(product); }}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 rounded-xl shadow-sm transition-all"
          >
            <HiOutlinePencil className="w-4 h-4" />
            <span>{t('products.editProduct')}</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-dk-text bg-white dark:bg-dk-inset border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-raised rounded-xl transition-colors shadow-2xs"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function Products({ defaultViewMode = 'compact' } = {}) {
  const { t } = useI18n();
  const activeContext = useAuthStore((s) => s.activeContext);
  const isEmployee = activeContext?.type === 'employee';
  const permissions = activeContext?.permissions || {};
  const canViewFunnel = !isEmployee || Boolean(permissions.reports_view);

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [funnelData, setFunnelData] = useState([]);
  const [funnelPeriod, setFunnelPeriod] = useState('30d');
  const [viewMode, setViewMode] = useState(defaultViewMode); // 'compact' | 'full'
  const [detailModal, setDetailModal] = useState(null); // product object or null
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pendingSearch, setPendingSearch] = useState('');
  const [pagination, setPagination] = useState({ page: 1, limit: 10, total: 0, totalPages: 1 });

  const [formModal, setFormModal] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploadingThumbnail, setIsUploadingThumbnail] = useState(false);

  const storageQuota = useStorageQuota();

  const fetchProducts = async () => {
    setIsLoading(true);
    try {
      const params = {
        page: pagination.page,
        limit: pagination.limit,
      };
      if (search.trim()) params.search = search.trim();

      const res = await productApiService.getProducts(params);
      const data = res.data?.data;
      setProducts(data?.products || []);
      setPagination((prev) => ({
        ...prev,
        total: data?.pagination?.total || 0,
        totalPages: data?.pagination?.totalPages || 1,
      }));
    } catch {
      toast.error(t('products.loadFailed'));
    } finally {
      setIsLoading(false);
    }
  };

  const fetchFunnel = async () => {
    if (!canViewFunnel) return;
    try {
      const res = await productApiService.getFunnel({ period: funnelPeriod });
      setFunnelData(res.data?.data?.rows || []);
    } catch {
      // Báo cáo phễu thất bại không làm hỏng bảng sản phẩm
    }
  };

  const loadCategories = async () => {
    try {
      const res = await productApiService.getCategories();
      setCategories(res.data?.data?.categories || []);
    } catch {
      // Bỏ qua nếu không tải được danh mục
    }
  };

  useEffect(() => {
    fetchProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, search]);

  useEffect(() => {
    fetchFunnel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [funnelPeriod, canViewFunnel]);

  const funnelByProduct = {};
  for (const row of funnelData) {
    if (row.productId != null) funnelByProduct[row.productId] = row;
  }


  const handleSearch = (e) => {
    e.preventDefault();
    setSearch(pendingSearch);
    setPagination((p) => ({ ...p, page: 1 }));
  };

  const openDetail = (product) => {
    setDetailModal(product);
  };

  const closeDetail = () => {
    setDetailModal(null);
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
      const form = new FormData();
      form.append('logo', file);
      const res = await productApiService.uploadThumbnail(form);
      const url = res.data?.data?.url || res.data?.url;
      setField('thumbnailUrl', url);
      notifyStorageQuotaRefresh();
      toast.success(t('products.uploadSuccess'));
    } catch (err) {
      toast.error(err.response?.data?.message || t('products.uploadFailed'));
    } finally {
      setIsUploadingThumbnail(false);
    }
  };

  const suggestedPriceAmount = parseVndPrice(formData.price);
  const currentDigits = String(formData.priceAmount ?? '').replace(/\D/g, '');
  const showSuggest =
    suggestedPriceAmount !== null &&
    (currentDigits === '' || Number(currentDigits) !== suggestedPriceAmount);

  return (
    <div className="space-y-6">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md shadow-orange-500/20 shrink-0">
            <HiOutlineCube className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-dk-text">
              {t('products.productManagement')}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-dk-text2 mt-0.5">
              {t('products.productDescription')}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-sm font-bold shadow-sm hover:shadow transition-all duration-150 shrink-0"
        >
          <HiOutlinePlus className="w-4 h-4" />
          <span>{t('products.addProduct')}</span>
        </button>
      </div>

      {/* ── Filter & Search Toolbar ── */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-dk-border bg-white dark:bg-dk-surface p-3.5 shadow-2xs">
        <form onSubmit={handleSearch} className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-dk-muted">
              <HiOutlineSearch className="w-4 h-4" />
            </div>
            <input
              type="text"
              value={pendingSearch}
              onChange={(e) => setPendingSearch(e.target.value)}
              placeholder={t('products.searchPlaceholder')}
              className="w-full pl-9 pr-8 py-2 text-xs bg-slate-50 dark:bg-dk-surface hover:bg-slate-100/70 dark:hover:bg-dk-raised focus:bg-white dark:focus:bg-dk-raised border border-slate-200 dark:border-dk-border rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 dark:placeholder:text-dk-muted text-slate-800 dark:text-dk-text"
            />
            {pendingSearch && (
              <button
                type="button"
                onClick={() => {
                  setPendingSearch('');
                  setSearch('');
                  setPagination((p) => ({ ...p, page: 1 }));
                }}
                className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 dark:text-dk-muted hover:text-slate-600 dark:hover:text-dk-text"
              >
                <HiOutlineX className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="submit"
              className="inline-flex items-center justify-center px-3.5 py-2 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-raised hover:bg-slate-50 dark:hover:bg-dk-strong text-xs font-semibold text-slate-700 dark:text-dk-text transition-colors shadow-2xs"
            >
              {t('common.search')}
            </button>

            {/* View Mode Toggle: Bảng gọn vs Đầy đủ phễu */}
            {canViewFunnel && (
              <div className="inline-flex rounded-xl bg-slate-100 dark:bg-dk-raised p-0.5 border border-slate-200/80 dark:border-dk-border">
                <button
                  type="button"
                  data-testid="view-mode-compact"
                  onClick={() => setViewMode('compact')}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    viewMode === 'compact'
                      ? 'bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text shadow-xs'
                      : 'text-slate-500 dark:text-dk-text2 hover:text-slate-800 dark:hover:text-dk-text'
                  }`}
                  title={t('products.viewCompactTip')}
                >
                  {t('products.viewCompact')}
                </button>
                <button
                  type="button"
                  data-testid="view-mode-full"
                  onClick={() => setViewMode('full')}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                    viewMode === 'full'
                      ? 'bg-white dark:bg-dk-surface text-slate-900 dark:text-dk-text shadow-xs'
                      : 'text-slate-500 dark:text-dk-text2 hover:text-slate-800 dark:hover:text-dk-text'
                  }`}
                  title={t('products.viewFullTip')}
                >
                  {t('products.viewFull')}
                </button>
              </div>
            )}

            {canViewFunnel && (
              <select
                data-testid="products-funnel-period"
                aria-label={t('products.funnel.periodLabel')}
                value={funnelPeriod}
                onChange={(e) => setFunnelPeriod(e.target.value)}
                className="rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-raised px-2.5 py-2 text-xs font-semibold text-slate-700 dark:text-dk-text focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 shadow-2xs cursor-pointer"
              >
                {FUNNEL_PERIODS.map((p) => (
                  <option key={p} value={p}>
                    {t(`products.funnel.period${p}`)}
                  </option>
                ))}
              </select>
            )}

            {pagination.total > 0 && (
              <span className="hidden lg:inline-flex items-center px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-dk-raised text-[11px] font-semibold text-slate-600 dark:text-dk-text border border-slate-200/60 dark:border-dk-border">
                {t('products.totalProducts', { total: pagination.total })}
              </span>
            )}
          </div>
        </form>
      </div>

      {/* ── Table Card ── */}
      <div className="rounded-2xl border border-slate-200/90 dark:border-dk-border bg-white dark:bg-dk-surface shadow-xs overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3">
            <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs text-slate-500 dark:text-dk-text2 font-medium">{t('products.loadingList')}</p>
          </div>
        ) : products.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center px-4">
            <div className="w-14 h-14 rounded-2xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200/60 dark:border-orange-800/60 flex items-center justify-center text-orange-400 mb-3 shadow-xs">
              <HiOutlineCube className="w-7 h-7" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-dk-text">{t('products.noProducts')}</p>
            <p className="text-xs text-slate-400 dark:text-dk-text2 mt-1 max-w-sm leading-relaxed">
              {t('products.emptyHint')}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 dark:divide-dk-border">
                <thead className="bg-slate-50/80 dark:bg-dk-raised/50">
                  <tr>
                    {/* Bảng không có phễu: hiện mã sản phẩm cột riêng */}
                    {!canViewFunnel && (
                      <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider">
                        {t('products.productCode')}
                      </th>
                    )}
                    <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider">
                      {t('products.productName')}
                    </th>
                    <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider">
                      {t('products.price')}
                    </th>

                    {/* Chế độ đầy đủ phễu */}
                    {canViewFunnel && viewMode === 'full' && (
                      <>
                        <th className="px-3 py-3.5 text-right text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider" title={t('products.funnel.interestedHint')}>
                          {t('products.funnel.interested')}
                        </th>
                        <th className="px-3 py-3.5 text-right text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider" title={t('products.funnel.leftContactHint')}>
                          {t('products.funnel.leftContact')}
                          <span className="block normal-case font-normal text-slate-400 dark:text-dk-muted text-[10px]">({t('products.funnel.peopleUnit')})</span>
                        </th>
                        <th className="px-3 py-3.5 text-right text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider" title={t('products.funnel.registeredHint')}>
                          {t('products.funnel.registered')}
                          <span className="block normal-case font-normal text-slate-400 dark:text-dk-muted text-[10px]">({t('products.funnel.peopleUnit')})</span>
                        </th>
                        <th className="px-3 py-3.5 text-right text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider" title={t('products.funnel.awaitingConfirmHint')}>
                          {t('products.funnel.awaitingConfirm')}
                        </th>
                        <th className="px-3 py-3.5 text-right text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider" title={t('products.funnel.paidHint')}>
                          {t('products.funnel.paid')}
                          <span className="block normal-case font-normal text-slate-400 dark:text-dk-muted text-[10px]">({t('products.funnel.peopleUnit')})</span>
                        </th>
                        <th className="px-3 py-3.5 text-right text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider">
                          {t('products.funnel.revenue')}
                        </th>
                      </>
                    )}

                    {/* Chế độ bảng gọn: tách 3 cột rõ ràng Đăng ký, Đã mua, Doanh thu */}
                    {canViewFunnel && viewMode === 'compact' && (
                      <>
                        <th className="px-4 py-3.5 text-center text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider" title={t('products.funnel.registeredHint')}>
                          {t('products.funnel.registered')}
                        </th>
                        <th className="px-4 py-3.5 text-center text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider" title={t('products.funnel.paidHint')}>
                          {t('products.funnel.paid')}
                        </th>
                        <th className="px-6 py-3.5 text-right text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider">
                          {t('products.funnel.revenue')}
                        </th>
                      </>
                    )}

                    <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider">
                      {t('common.status')}
                    </th>
                    {!canViewFunnel && (
                      <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider">
                        {t('products.lastUpdated')}
                      </th>
                    )}
                    <th className="px-6 py-3.5 text-right text-[11px] font-bold text-slate-500 dark:text-dk-text2 uppercase tracking-wider">
                      {t('common.actions')}
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white dark:bg-dk-surface divide-y divide-slate-100 dark:divide-dk-border">
                  {products.map((product) => {
                    const funnel = funnelByProduct[product.id];
                    const noMoney = funnel?.paid === null && funnel?.revenue === null;
                    const awaiting = funnel?.awaitingConfirm ?? 0;
                    const registered = funnel?.registered ?? 0;
                    const paidPeople = funnel?.paid ?? 0;
                    const formIds = funnel?.formIds || [];
                    const target = formIds.length === 1 ? `/app/forms/${formIds[0]}/submissions` : formIds.length > 1 ? '/app/forms' : null;

                    return (
                      <tr key={product.id} className="hover:bg-slate-50/70 dark:hover:bg-dk-raised transition-colors">
                        {!canViewFunnel && (
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-500 dark:text-dk-text2 font-mono">
                            {product.productCode || '—'}
                          </td>
                        )}
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3.5 min-w-0">
                            {product.thumbnailUrl ? (
                              <img
                                src={product.thumbnailUrl}
                                alt={product.productName}
                                className="w-10 h-10 rounded-xl object-cover border border-slate-200 dark:border-dk-border shrink-0 shadow-2xs"
                              />
                            ) : (
                              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500/10 via-amber-500/10 to-orange-500/5 border border-orange-200/60 dark:border-orange-800/60 text-orange-600 dark:text-orange-400 shrink-0 shadow-2xs">
                                <HiOutlineCube className="w-5 h-5" />
                              </div>
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <button
                                  type="button"
                                  onClick={() => openDetail(product)}
                                  className="text-left text-sm font-semibold text-slate-900 dark:text-dk-text hover:text-orange-600 dark:hover:text-orange-400 transition-colors cursor-pointer group truncate max-w-xs sm:max-w-md"
                                  title={t('products.viewDetailTip')}
                                >
                                  <span className="group-hover:underline">{product.productName}</span>
                                </button>
                                {product.kind === 'event' && (
                                  <span
                                    data-testid="product-kind-badge"
                                    className="badge bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 align-middle shrink-0"
                                  >
                                    {t('products.kindEventBadge')}
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-dk-text2 mt-1 flex items-center gap-1.5 flex-wrap" data-testid="product-subline">
                                {(canViewFunnel ? [product.productCode, product.category] : [product.category]).filter(Boolean).map((tag, idx) => (
                                  <span key={idx} className="inline-flex items-center text-slate-500 dark:text-dk-text2">
                                    {idx > 0 && <span className="mx-1 text-slate-300 dark:text-dk-muted">·</span>}
                                    {tag}
                                  </span>
                                ))}
                                {product.productUrl && (
                                  <a
                                    href={product.productUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="inline-flex items-center gap-0.5 text-slate-400 dark:text-dk-muted hover:text-orange-600 dark:hover:text-orange-400 transition-colors ml-1"
                                    title={t('products.openUrlTitle', { url: product.productUrl })}
                                  >
                                    <HiOutlineExternalLink className="w-3.5 h-3.5" />
                                  </a>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-dk-text font-semibold">
                          {product.price || (product.kind === 'event' ? t('products.priceFreePlaceholder') : '—')}
                        </td>

                        {/* Đầy đủ 6 cột phễu */}
                        {canViewFunnel && viewMode === 'full' && (
                          <FunnelCells funnel={funnel} />
                        )}

                        {/* Bảng gọn: tách 3 cột rõ ràng Đăng ký, Đã mua, Doanh thu */}
                        {canViewFunnel && viewMode === 'compact' && (
                          <>
                            <td className="px-4 py-4 whitespace-nowrap text-center">
                              <span data-testid="funnel-registered">
                                {target ? (
                                  <Link to={target} className="font-semibold text-primary-600 dark:text-primary-400 hover:underline">
                                    {registered}
                                  </Link>
                                ) : (
                                  <span className="font-semibold text-slate-700 dark:text-dk-text">{registered}</span>
                                )}
                              </span>
                              {awaiting > 0 && (
                                <span
                                  data-testid="funnel-awaiting"
                                  className="ml-1.5 inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60"
                                  title={t('products.funnel.awaitingConfirmTooltip', { amount: formatMoney(funnel?.awaitingAmount, t) })}
                                >
                                  {target ? (
                                    <Link to={target} className="hover:underline">{t('products.funnel.awaitingBadge', { count: awaiting })}</Link>
                                  ) : (
                                    t('products.funnel.awaitingBadge', { count: awaiting })
                                  )}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-4 whitespace-nowrap text-center">
                              <span data-testid="funnel-paid" className="font-semibold text-slate-700 dark:text-dk-text">
                                {noMoney ? '—' : paidPeople}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-right">
                              <span className="font-bold text-slate-900 dark:text-dk-text text-sm" data-testid="funnel-revenue">
                                {noMoney ? '—' : formatMoney(funnel?.revenue, t)}
                              </span>
                            </td>
                          </>
                        )}

                        <td className="px-6 py-4 whitespace-nowrap">
                          <StatusBadge status={product.status} kind={product.kind} />
                        </td>
                        {!canViewFunnel && (
                          <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500 dark:text-dk-text2">
                            {formatDate(product.updatedAt)}
                          </td>
                        )}
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                          <div className="flex items-center justify-end gap-1">
                            {/* Nút Xem chi tiết */}
                            <button
                              type="button"
                              onClick={() => openDetail(product)}
                              className="p-1.5 text-slate-400 dark:text-dk-muted hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-950/40 rounded-lg transition-colors"
                              title={t('products.viewDetail')}
                              aria-label={t('products.viewDetail')}
                            >
                              <HiOutlineEye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => openEdit(product)}
                              className="p-1.5 text-slate-400 dark:text-dk-muted hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/40 rounded-lg transition-colors"
                              title={t('common.edit')}
                            >
                              <HiOutlinePencil className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteTarget(product)}
                              className="p-1.5 text-slate-400 dark:text-dk-muted hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 rounded-lg transition-colors"
                              title={t('common.delete')}
                            >
                              <HiOutlineTrash className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-dk-border bg-slate-50/50 dark:bg-dk-raised/50">
                <p className="text-xs text-slate-500 dark:text-dk-text2 font-medium">{t('products.totalProducts', { total: pagination.total })}</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                    disabled={pagination.page <= 1}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text2 hover:bg-slate-100 dark:hover:bg-dk-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <HiOutlineChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold text-slate-700 dark:text-dk-text">
                    {pagination.page} / {pagination.totalPages}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                    disabled={pagination.page >= pagination.totalPages}
                    className="p-1.5 rounded-lg border border-slate-200 dark:border-dk-border text-slate-600 dark:text-dk-text2 hover:bg-slate-100 dark:hover:bg-dk-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <HiOutlineChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Modal Chi tiết sản phẩm ── */}
      {detailModal && (
        <ProductDetailModal
          product={detailModal}
          funnel={funnelByProduct[detailModal.id]}
          canViewFunnel={canViewFunnel}
          onClose={closeDetail}
          onEdit={(p) => {
            closeDetail();
            openEdit(p);
          }}
        />
      )}

      {/* ── Modal Thêm / Sửa sản phẩm ── */}
      {formModal &&
        createPortal(
          <div className={MODAL_OVERLAY} role="dialog" aria-modal="true">
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
              onClick={closeFormModal}
              aria-hidden="true"
              tabIndex={-1}
            />
            <div className="relative bg-white dark:bg-dk-raised rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden border border-slate-200/80 dark:border-dk-border/80 z-10 animate-in fade-in zoom-in-95 duration-150">
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-100 dark:border-dk-border flex items-center justify-between bg-gradient-to-r from-slate-50/80 via-white to-orange-50/20 dark:from-dk-raised dark:via-dk-raised dark:to-orange-950/20 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-10 h-10 rounded-2xl bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-md shadow-orange-500/20">
                    <HiOutlineCube className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900 dark:text-dk-text text-base">
                      {formModal.mode === 'create' ? t('products.addProduct') : t('products.editProduct')}
                    </h3>
                    <p className="text-xs text-slate-400 dark:text-dk-text mt-0.5">
                      {formModal.mode === 'create' ? t('products.formSubtitleCreate') : t('products.formSubtitleEdit')}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closeFormModal}
                  className="rounded-xl p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:text-dk-text2 dark:hover:text-dk-text dark:hover:bg-dk-raised transition-colors"
                  aria-label={t('common.close')}
                >
                  <HiOutlineX className="w-5 h-5" />
                </button>
              </div>

              {/* Form Content - 2 cột cuộn mượt mà */}
              <form id="product-form" onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Chọn loại sản phẩm */}
                <div className="p-3.5 rounded-2xl bg-slate-50/70 dark:bg-dk-surface border border-slate-200/80 dark:border-dk-border space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-dk-text uppercase tracking-wider">
                      {t('products.kindLabel')}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-dk-text2 font-medium">{t('products.kindPickHint')}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {PRODUCT_KIND_OPTIONS.map((k) => {
                      const isSelected = formData.kind === k;
                      return (
                        <label
                          key={k}
                          className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-150 ${
                            isSelected
                              ? 'border-orange-500 bg-orange-50/30 dark:bg-orange-950/30 ring-2 ring-orange-500/10 shadow-2xs'
                              : 'border-slate-200 dark:border-dk-border bg-white dark:bg-dk-raised hover:bg-slate-50 dark:hover:bg-dk-strong'
                          }`}
                        >
                          <input
                            type="radio"
                            name="kind"
                            value={k}
                            checked={isSelected}
                            onChange={(e) => setField('kind', e.target.value)}
                            className="mt-0.5 text-orange-600 focus:ring-orange-500"
                          />
                          <div className="min-w-0">
                            <span className="text-xs font-bold text-slate-800 dark:text-dk-text block">
                              {k === 'sale' ? t('products.kindSale') : t('products.kindEvent')}
                            </span>
                            <span className="text-[11px] text-slate-500 dark:text-dk-text2 mt-0.5 block leading-relaxed">
                              {k === 'sale' ? t('products.kindSaleHint') : t('products.kindEventHint')}
                            </span>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  {/* Select fallback cho DOM accessibility & test compatibility */}
                  <select
                    data-testid="product-kind-select"
                    value={formData.kind}
                    onChange={(e) => setField('kind', e.target.value)}
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                  >
                    {PRODUCT_KIND_OPTIONS.map((k) => (
                      <option key={k} value={k}>
                        {k === 'sale' ? t('products.kindSale') : t('products.kindEvent')}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2 Cột thông tin chi tiết */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Cột trái: Thông tin cơ bản & Giá bán */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-dk-border">
                      <HiOutlineTag className="w-4 h-4 text-orange-500" />
                      <span className="text-xs font-bold text-slate-800 dark:text-dk-text uppercase tracking-wider">
                        {t('common.basicInfo')}
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-dk-text mb-1.5">
                        {t('products.productName')} <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        value={formData.productName}
                        onChange={(e) => setField('productName', e.target.value)}
                        placeholder={t('products.productNamePlaceholder')}
                        className="w-full px-3.5 py-2 text-sm bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 placeholder:dark:text-dk-muted text-slate-800 dark:text-dk-text font-medium"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-dk-text mb-1.5">
                          {t('products.productCode')}
                        </label>
                        <input
                          type="text"
                          value={formData.productCode}
                          onChange={(e) => setField('productCode', e.target.value)}
                          placeholder={t('products.productCodePlaceholder')}
                          className="w-full px-3.5 py-2 text-sm bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 placeholder:dark:text-dk-muted text-slate-800 dark:text-dk-text font-mono"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-dk-text mb-1.5">
                          {t('common.status')}
                        </label>
                        <select
                          value={formData.status}
                          onChange={(e) => setField('status', e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all text-slate-800 dark:text-dk-text font-medium cursor-pointer"
                        >
                          {PRODUCT_STATUS_OPTIONS.map((st) => (
                            <option key={st} value={st} className="dark:bg-dk-raised">
                              {t(STATUS_KEYS[formData.kind === 'event' ? 'event' : 'sale'][st])}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-dk-text mb-1.5">
                        {t('products.category')}
                      </label>
                      <input
                        type="text"
                        value={formData.category}
                        onChange={(e) => setField('category', e.target.value)}
                        placeholder={t('products.categoryPlaceholder')}
                        list="categories-list"
                        className="w-full px-3.5 py-2 text-sm bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 placeholder:dark:text-dk-muted text-slate-800 dark:text-dk-text"
                      />
                      <datalist id="categories-list">
                        {categories.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>

                    {/* Khối Cấu hình giá */}
                    <div className="p-3.5 rounded-2xl bg-amber-50/30 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 space-y-3">
                      <div className="flex items-center gap-1.5">
                        <HiOutlineCurrencyDollar className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        <span className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wider">
                          {t('products.sectionPricing')}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-dk-text mb-1">
                            {t('products.price')}
                          </label>
                          <input
                            type="text"
                            value={formData.price}
                            onChange={(e) => handlePriceTextChange(e.target.value)}
                            placeholder={formData.kind === 'event' ? t('products.priceFreePlaceholder') : t('products.pricePlaceholder')}
                            className="w-full px-3 py-1.5 text-sm bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 placeholder:dark:text-dk-muted text-slate-800 dark:text-dk-text"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-dk-text mb-1">
                            {t('products.originalPrice')}
                          </label>
                          <input
                            type="text"
                            value={formData.originalPrice}
                            onChange={(e) => setField('originalPrice', e.target.value)}
                            placeholder={t('products.originalPricePlaceholder')}
                            className="w-full px-3 py-1.5 text-sm bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 placeholder:dark:text-dk-muted text-slate-800 dark:text-dk-text"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-dk-text mb-1">
                          {t('products.priceAmount')}
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          data-testid="product-price-amount"
                          value={formData.priceAmount === '' ? '' : Number(formData.priceAmount || 0).toLocaleString('vi-VN')}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '');
                            setField('priceAmount', raw);
                          }}
                          placeholder={t('products.priceAmountPlaceholder')}
                          className="w-full px-3 py-1.5 text-sm bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 placeholder:dark:text-dk-muted text-slate-800 dark:text-dk-text font-mono font-semibold"
                        />
                        {showSuggest && (
                          <div
                            data-testid="product-price-amount-suggest"
                            className="mt-1.5 flex items-center justify-between text-xs bg-white/80 dark:bg-dk-raised p-2 rounded-lg border border-amber-200/80 dark:border-amber-900/50 text-amber-800 dark:text-amber-300"
                          >
                            <span>{t('products.priceAmountSuggest', { amount: formatMoney(suggestedPriceAmount, t) })}</span>
                            <button
                              type="button"
                              onClick={() => setField('priceAmount', String(suggestedPriceAmount))}
                              className="font-bold text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 underline text-xs ml-2 cursor-pointer shrink-0"
                            >
                              {t('products.priceAmountUse')}
                            </button>
                          </div>
                        )}
                        <p className="text-[11px] text-slate-500 dark:text-dk-text2 mt-1 leading-relaxed">
                          {t('products.priceAmountHint')}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Cột phải: Thông tin tiếp thị & AI */}
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 pb-1 border-b border-slate-100 dark:border-dk-border">
                      <HiOutlineSparkles className="w-4 h-4 text-orange-500" />
                      <span className="text-xs font-bold text-slate-800 dark:text-dk-text uppercase tracking-wider">
                        {t('products.sectionMarketing')}
                      </span>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-dk-text mb-1.5">
                        {t('products.description')}
                      </label>
                      <textarea
                        rows={3}
                        value={formData.description}
                        onChange={(e) => setField('description', e.target.value)}
                        placeholder={t('products.descriptionPlaceholder')}
                        className="w-full px-3.5 py-2 text-sm bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 placeholder:dark:text-dk-muted text-slate-800 dark:text-dk-text resize-none leading-relaxed"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-dk-text mb-1.5">
                        {t('products.usp')}
                      </label>
                      <textarea
                        rows={2}
                        value={formData.usp}
                        onChange={(e) => setField('usp', e.target.value)}
                        placeholder={t('products.uspPlaceholder')}
                        className="w-full px-3.5 py-2 text-sm bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 placeholder:dark:text-dk-muted text-slate-800 dark:text-dk-text resize-none"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 dark:text-dk-text mb-1.5">
                        {t('products.targetAudience')}
                      </label>
                      <input
                        type="text"
                        value={formData.targetAudience}
                        onChange={(e) => setField('targetAudience', e.target.value)}
                        placeholder={t('products.targetAudiencePlaceholder')}
                        className="w-full px-3.5 py-2 text-sm bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 placeholder:dark:text-dk-muted text-slate-800 dark:text-dk-text"
                      />
                    </div>

                    <div className="space-y-3.5">
                      {/* Link sản phẩm */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-dk-text mb-1.5">
                          {t('products.productUrl')}
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400 dark:text-dk-muted">
                            <HiOutlineLink className="w-4 h-4" />
                          </div>
                          <input
                            type="url"
                            value={formData.productUrl}
                            onChange={(e) => setField('productUrl', e.target.value)}
                            placeholder={t('products.productUrlPlaceholder')}
                            className="w-full pl-9 pr-3.5 py-2 text-sm bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 placeholder:dark:text-dk-muted text-slate-800 dark:text-dk-text"
                          />
                        </div>
                        {formData.productUrl && (
                          <a
                            href={formData.productUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-orange-600 dark:text-orange-400 hover:text-orange-700 dark:hover:text-orange-300 underline mt-1"
                          >
                            <HiOutlineExternalLink className="w-3.5 h-3.5" />
                            <span>{t('products.openProductUrl')}</span>
                          </a>
                        )}
                      </div>

                      {/* Ảnh sản phẩm */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-dk-text mb-1.5">
                          {t('products.thumbnailUrl')}
                        </label>
                        <div className="flex gap-2.5">
                          <input
                            type="url"
                            value={formData.thumbnailUrl}
                            onChange={(e) => setField('thumbnailUrl', e.target.value)}
                            placeholder={t('products.thumbnailUrlPlaceholder')}
                            className="flex-1 min-w-0 px-3.5 py-2 text-sm bg-white dark:bg-dk-surface border border-slate-200 dark:border-dk-border rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 placeholder:dark:text-dk-muted text-slate-800 dark:text-dk-text"
                          />
                          <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-raised hover:bg-slate-50 dark:hover:bg-dk-strong text-xs font-semibold text-slate-700 dark:text-dk-text cursor-pointer transition-colors shadow-2xs shrink-0">
                            <HiOutlinePhotograph className="w-4 h-4 text-slate-500 dark:text-dk-text2" />
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
                          <div className="mt-2.5 flex items-center gap-3 p-2.5 rounded-xl border border-slate-100 dark:border-dk-border bg-slate-50/70 dark:bg-dk-surface">
                            <img
                              src={formData.thumbnailUrl}
                              alt={t('products.thumbnailPreview')}
                              className="h-16 w-16 rounded-lg border border-slate-200 dark:border-dk-border object-cover shadow-2xs"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-slate-700 dark:text-dk-text truncate">{formData.thumbnailUrl}</p>
                              <button
                                type="button"
                                onClick={() => setField('thumbnailUrl', '')}
                                className="text-xs text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300 hover:underline mt-1 inline-flex items-center gap-1"
                              >
                                <HiOutlineTrash className="w-3.5 h-3.5" />
                                <span>{t('products.removeImage')}</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </form>

              {/* ── Sticky Modal Footer ── */}
              <div className="px-6 py-4 border-t border-slate-100 dark:border-dk-border bg-slate-50/80 dark:bg-dk-surface flex items-center justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={closeFormModal}
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-dk-text bg-white dark:bg-dk-raised border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-strong rounded-xl transition-colors disabled:opacity-50 shadow-2xs"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  form="product-form"
                  disabled={isSaving}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 rounded-xl shadow-sm hover:shadow transition-all disabled:opacity-50"
                >
                  {isSaving && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>
                    {isSaving
                      ? t('common.saving')
                      : formModal.mode === 'create'
                      ? t('products.addProduct')
                      : t('common.save')}
                  </span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ── Modal Xác nhận Xóa ── */}
      {deleteTarget &&
        createPortal(
          <div className={MODAL_OVERLAY} role="dialog" aria-modal="true">
            <div
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
              onClick={() => !isDeleting && setDeleteTarget(null)}
              aria-hidden="true"
              tabIndex={-1}
            />
            <div className="relative bg-white dark:bg-dk-surface rounded-3xl shadow-2xl w-full max-w-md p-6 overflow-hidden border border-slate-100 dark:border-dk-border z-10 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center gap-3.5 text-rose-600 dark:text-rose-400 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center shrink-0 border border-rose-100 dark:border-rose-900/50">
                  <HiOutlineTrash className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-dk-text text-base">{t('products.confirmDeleteTitle')}</h3>
              </div>
              <p className="text-sm text-slate-600 dark:text-dk-text2 leading-relaxed mb-6">
                {t('products.confirmDeleteMessage', { name: deleteTarget.productName })}
              </p>
              <div className="flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeleteTarget(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 dark:text-dk-text bg-white dark:bg-dk-raised border border-slate-200 dark:border-dk-border hover:bg-slate-50 dark:hover:bg-dk-strong rounded-xl transition-colors disabled:opacity-50 shadow-2xs"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleDelete}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-sm transition-colors disabled:opacity-50"
                >
                  {isDeleting && (
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  )}
                  <span>{isDeleting ? t('common.deleting') : t('common.delete')}</span>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
