import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import PageHeader from '../../components/common/PageHeader';
import { useI18n } from '../../i18n';
import {
  HiOutlinePlus,
  HiOutlineRefresh,
  HiOutlineTrash,
  HiOutlinePencil,
  HiOutlineExternalLink,
  HiOutlineClipboard,
  HiOutlineGlobeAlt,
  HiOutlineShare,
  HiOutlineShoppingCart,
  HiOutlineUserGroup,
  HiOutlineSearch,
  HiOutlineX,
} from 'react-icons/hi';
import ConfirmModal from '../../components/common/ConfirmModal';
import {
  deleteLandingPageAdmin,
  fetchLandingPagesAdminList,
  fetchLandingPagesDashboardStats,
} from '../../features/landing-pages/services/landingPagesAdminApi.service.js';
import marketplaceService from '../../services/marketplace.service';
import LandingPageShareModal from '../../components/marketplace/LandingPageShareModal';
import LandingPageMarketplaceModal from '../../components/marketplace/LandingPageMarketplaceModal';
import { getCustomHostname } from '../../features/landing-canvas/utils/landingDomain.js';

const BASE_DOMAIN = 'founderai.biz';
const TABS = [
  { id: 'mine', icon: HiOutlineGlobeAlt },
  { id: 'purchased', icon: HiOutlineShoppingCart },
  { id: 'shared', icon: HiOutlineUserGroup },
];

/**
 * List page cho Landing Pages admin.
 *
 * Tabs:
 *   - mine:      Tự tạo (admin/landing-pages CRUD + share)
 *   - purchased: Đã mua từ marketplace (marketplace purchases)
 *   - shared:    Được người khác chia sẻ trong hệ thống
 */
export default function LandingPagesAdminPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTab, setActiveTab] = useState('mine');

  // Mine tab state
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statsPack, setStatsPack] = useState({ filters: {}, rows: [] });

  // Purchased tab state
  const [purchasedRows, setPurchasedRows] = useState([]);
  const [purchasedLoading, setPurchasedLoading] = useState(false);

  // Shared tab state
  const [sharedRows, setSharedRows] = useState([]);
  const [sharedLoading, setSharedLoading] = useState(false);

  // Share modal state
  const [sharingLandingPage, setSharingLandingPage] = useState(null);

  // Marketplace publish modal state
  const [publishingLandingPage, setPublishingLandingPage] = useState(null);

  // Delete modal state
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Search filter
  const [search, setSearch] = useState('');

  // Nếu AiChatbot điều hướng sang đây với aiDraft → chuyển tiếp sang canvas new route.
  useEffect(() => {
    const aiDraft = location.state?.aiDraft;
    if (!aiDraft) return;
    navigate('/app/settings/landing-pages/new', {
      state: { aiDraft },
      replace: true,
    });
    window.history.replaceState({}, '');
  }, [location.state, navigate]);

  const reloadMine = useCallback(async () => {
    setLoading(true);
    try {
      const [list, d] = await Promise.all([
        fetchLandingPagesAdminList(),
        fetchLandingPagesDashboardStats({ allTime: 1 }),
      ]);
      setRows(list);
      setStatsPack(d);
    } catch (e) {
      toast.error(e?.response?.data?.message || t('landingPagesAdmin.loadFailed'));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadPurchased = useCallback(async () => {
    setPurchasedLoading(true);
    try {
      const res = await marketplaceService.getMyPurchases({
        resourceType: 'landing_page',
        limit: 100,
      });
      // Backend returns { data: purchases[], pagination: {...} }
      const data = res.data?.data;
      setPurchasedRows(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error('Load purchased landing pages error:', e);
      toast.error(t('landingPagesAdmin.loadFailed'));
      setPurchasedRows([]);
    } finally {
      setPurchasedLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reloadShared = useCallback(async () => {
    setSharedLoading(true);
    try {
      const res = await marketplaceService.getLandingPagesSharedWithMe({ limit: 100 });
      const data = res.data?.data;
      setSharedRows(data?.items || []);
    } catch (e) {
      console.error('Load shared landing pages error:', e);
      toast.error(t('landingPagesAdmin.loadFailed'));
      setSharedRows([]);
    } finally {
      setSharedLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === 'mine') reloadMine();
    else if (activeTab === 'purchased') reloadPurchased();
    else if (activeTab === 'shared') reloadShared();
  }, [activeTab, reloadMine, reloadPurchased, reloadShared]);

  const statsBySlug = useMemo(() => {
    const m = new Map();
    for (const r of statsPack.rows || []) {
      if (r?.slug) m.set(String(r.slug), r);
    }
    return m;
  }, [statsPack.rows]);

  const tableRows = useMemo(() => {
    return rows.map((r) => {
      const st = statsBySlug.get(r.slug) || {};
      // `customDomainHostname` của API quản trị cũng chứa `<slug>.founderai.biz` của trang dùng tên miền MIỄN PHÍ (cùng bảng
      // landing_page_domains) — chỉ hostname KHÔNG thuộc hệ thống mới là tên miền riêng (nhãn "Sub"/"Apex").
      const customHostname = getCustomHostname(r);
      const isCustom = r.domainType === 'custom' || Boolean(customHostname);
      const domain = customHostname || `${r.slug}.${BASE_DOMAIN}`;
      return {
        ...r,
        viewCount: Number(st.viewCount || 0),
        clickCount: Number(st.clickCount || 0),
        submitCount: Number(st.submitCount || 0),
        displayDomain: domain,
        isCustomDomain: isCustom,
        isApexDomain: Boolean(r.customDomainIsApex),
      };
    });
  }, [rows, statsBySlug]);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredMineRows = useMemo(() => {
    if (!normalizedSearch) return tableRows;
    return tableRows.filter((r) =>
      (r.title || '').toLowerCase().includes(normalizedSearch) ||
      (r.slug || '').toLowerCase().includes(normalizedSearch) ||
      (r.displayDomain || '').toLowerCase().includes(normalizedSearch)
    );
  }, [tableRows, normalizedSearch]);

  const filteredPurchasedRows = useMemo(() => {
    if (!normalizedSearch) return purchasedRows;
    return purchasedRows.filter((p) => {
      const title = p.title || p.listingTitle || p.listing?.title || '';
      const seller = p.seller_name || p.seller?.fullName || p.seller?.name || p.sellerName || '';
      return title.toLowerCase().includes(normalizedSearch) || seller.toLowerCase().includes(normalizedSearch);
    });
  }, [purchasedRows, normalizedSearch]);

  const filteredSharedRows = useMemo(() => {
    if (!normalizedSearch) return sharedRows;
    return sharedRows.filter((s) => {
      const title = s.title || '';
      const email = s.sharedBy?.email || '';
      const name = s.sharedBy?.name || '';
      const domain = getCustomHostname(s) || `${s.slug}.${BASE_DOMAIN}`;
      return (
        title.toLowerCase().includes(normalizedSearch) ||
        email.toLowerCase().includes(normalizedSearch) ||
        name.toLowerCase().includes(normalizedSearch) ||
        domain.toLowerCase().includes(normalizedSearch)
      );
    });
  }, [sharedRows, normalizedSearch]);

  const openCreate = () => {
    navigate('/app/settings/landing-pages/new');
  };

  const openEdit = (row) => {
    if (!row?.id) {
      toast.error('ID landing page không hợp lệ');
      return;
    }
    navigate(`/app/settings/landing-pages/${row.id}/edit`);
  };

  const confirmDelete = async () => {
    if (!deleteTarget?.id) return;
    setIsDeleting(true);
    try {
      await deleteLandingPageAdmin(deleteTarget.id);
      toast.success(t('landingPagesAdmin.deleted'));
      setDeleteTarget(null);
      reloadMine();
    } catch (e) {
      toast.error(e?.response?.data?.message || t('landingPagesAdmin.deleteFailed'));
    } finally {
      setIsDeleting(false);
    }
  };

  const copyToClipboard = (text, msg) => {
    navigator.clipboard.writeText(text).then(() => toast.success(msg || 'Đã copy'));
  };

  const getPublicUrl = (r) => {
    const customHostname = getCustomHostname(r);
    if (customHostname) {
      return `https://${customHostname}`;
    }
    return `https://${r?.slug || ''}.${BASE_DOMAIN}`;
  };

  const renderMineTab = () => {
    if (loading) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Đang tải danh sách trang đích…</p>
        </div>
      );
    }
    if (filteredMineRows.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-200/60 flex items-center justify-center text-orange-400 mb-3 shadow-xs">
            <HiOutlineGlobeAlt className="w-7 h-7" />
          </div>
          <p className="text-sm font-semibold text-slate-700">
            {search ? 'Không tìm thấy trang đích nào khớp bộ lọc' : t('landingPagesAdmin.tabMineEmpty')}
          </p>
          <p className="text-xs text-slate-400 mt-1 max-w-sm leading-relaxed">
            {search ? 'Thử xóa từ khóa tìm kiếm hoặc kiểm tra lại tên miền.' : 'Bấm "+ Tạo trang đích" ở trên để thiết kế trang đích mới.'}
          </p>
          {!search && (
            <button
              type="button"
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold shadow-xs hover:shadow transition-all"
              onClick={openCreate}
            >
              <HiOutlinePlus className="w-4 h-4" />
              {t('landingPagesAdmin.createNew')}
            </button>
          )}
        </div>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50/80">
            <tr>
              <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('landingPagesAdmin.titleCol')}</th>
              <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('landingPagesAdmin.domainCol') || 'Domain'}</th>
              <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('landingPagesAdmin.published')}</th>
              <th className="px-4 py-3.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider tabular-nums">{t('landingPagesAdmin.views')}</th>
              <th className="px-4 py-3.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider tabular-nums">{t('landingPagesAdmin.clicks')}</th>
              <th className="px-4 py-3.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider tabular-nums">{t('landingPagesAdmin.forms')}</th>
              <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('landingPagesAdmin.updated')}</th>
              <th className="px-6 py-3.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {filteredMineRows.map((r) => (
              <tr
                key={r.id}
                className="hover:bg-slate-50/70 transition-colors"
              >
                <td className="px-6 py-4">
                  <div className="font-semibold text-sm text-slate-900 line-clamp-1">{r.title || '—'}</div>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">{r.slug}</div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <code
                      className={`font-mono text-xs px-2 py-0.5 rounded-md border ${
                        r.isCustomDomain
                          ? 'bg-purple-50 text-purple-700 border-purple-200'
                          : 'bg-slate-100 text-slate-700 border-slate-200'
                      }`}
                    >
                      {r.displayDomain}
                    </code>
                    {r.isCustomDomain && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-semibold bg-purple-50 text-purple-600 border border-purple-200/80">
                        {r.isApexDomain ? 'Apex' : 'Sub'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => copyToClipboard(getPublicUrl(r), 'Đã copy URL')}
                      className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                      title="Copy URL"
                    >
                      <HiOutlineClipboard className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={getPublicUrl(r)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                      title="Mở trong tab mới"
                    >
                      <HiOutlineExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {r.isPublished ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {t('common.yes')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 shadow-2xs">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                      {t('common.no')}
                    </span>
                  )}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-right text-xs font-semibold tabular-nums text-slate-700">
                  {Number(r.viewCount || 0).toLocaleString('vi-VN')}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-right text-xs font-semibold tabular-nums text-slate-700">
                  {Number(r.clickCount || 0).toLocaleString('vi-VN')}
                </td>
                <td className="px-4 py-4 whitespace-nowrap text-right text-xs font-semibold tabular-nums text-slate-700">
                  {Number(r.submitCount || 0).toLocaleString('vi-VN')}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-xs text-slate-500">
                  {r.updatedAt ? new Date(r.updatedAt).toLocaleDateString('vi-VN') + ' ' + new Date(r.updatedAt).toLocaleTimeString('vi-VN') : '—'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                      title="Chia sẻ"
                      onClick={() => setSharingLandingPage(r)}
                    >
                      <HiOutlineShare className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                      title={t('landingPagesAdmin.publishToMarketplace')}
                      onClick={() => setPublishingLandingPage(r)}
                    >
                      <HiOutlineShoppingCart className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                      title={t('common.edit')}
                      onClick={() => openEdit(r)}
                    >
                      <HiOutlinePencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      title={t('common.delete')}
                      onClick={() => setDeleteTarget(r)}
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
    );
  };

  const renderPurchasedTab = () => {
    if (purchasedLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Đang tải danh sách trang đích đã mua…</p>
        </div>
      );
    }
    if (filteredPurchasedRows.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-200/60 flex items-center justify-center text-orange-400 mb-3 shadow-xs">
            <HiOutlineShoppingCart className="w-7 h-7" />
          </div>
          <p className="text-sm font-semibold text-slate-700">
            {search ? 'Không tìm thấy trang đích đã mua nào khớp bộ lọc' : t('landingPagesAdmin.tabPurchasedEmpty')}
          </p>
        </div>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50/80">
            <tr>
              <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('landingPagesAdmin.titleCol')}</th>
              <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Người bán</th>
              <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Giá</th>
              <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Ngày mua</th>
              <th className="px-6 py-3.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {filteredPurchasedRows.map((p) => (
              <tr key={p.id || p.listingId || p.listing_id} className="hover:bg-slate-50/70 transition-colors">
                <td className="px-6 py-4 font-semibold text-sm text-slate-900">
                  {p.title || p.listingTitle || p.listing?.title || '—'}
                </td>
                <td className="px-6 py-4 text-xs text-slate-600">
                  {p.seller_name || p.seller?.fullName || p.seller?.name || p.sellerName || '—'}
                </td>
                <td className="px-6 py-4 text-xs font-semibold text-orange-600">
                  {t('landingPagesAdmin.purchasedPrice', { price: p.price_credits ?? p.priceCredits ?? p.price ?? 0 })}
                </td>
                <td className="px-6 py-4 text-xs text-slate-500">
                  {p.purchased_at || p.purchasedAt
                    ? new Date(p.purchased_at || p.purchasedAt).toLocaleDateString('vi-VN') + ' ' + new Date(p.purchased_at || p.purchasedAt).toLocaleTimeString('vi-VN')
                    : '—'}
                </td>
                <td className="px-6 py-4 text-right">
                  <a
                    href={p.publicUrl || getPublicUrl(p)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 inline-flex transition-colors"
                    title="Xem"
                  >
                    <HiOutlineExternalLink className="w-4 h-4" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderSharedTab = () => {
    if (sharedLoading) {
      return (
        <div className="flex flex-col items-center justify-center py-16 gap-3">
          <div className="w-7 h-7 border-2 border-orange-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-medium">Đang tải danh sách trang đích được chia sẻ…</p>
        </div>
      );
    }
    if (filteredSharedRows.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="w-14 h-14 rounded-2xl bg-orange-50 border border-orange-200/60 flex items-center justify-center text-orange-400 mb-3 shadow-xs">
            <HiOutlineUserGroup className="w-7 h-7" />
          </div>
          <p className="text-sm font-semibold text-slate-700">
            {search ? 'Không tìm thấy trang đích được chia sẻ nào khớp bộ lọc' : t('landingPagesAdmin.tabSharedEmpty')}
          </p>
        </div>
      );
    }
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-slate-50/80">
            <tr>
              <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('landingPagesAdmin.titleCol')}</th>
              <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('landingPagesAdmin.domainCol') || 'Domain'}</th>
              <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">Chia sẻ bởi</th>
              <th className="px-6 py-3.5 text-left text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('landingPagesAdmin.published')}</th>
              <th className="px-6 py-3.5 text-right text-[11px] font-bold text-slate-500 uppercase tracking-wider">{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {filteredSharedRows.map((s) => (
              <tr key={s.id} className="hover:bg-slate-50/70 transition-colors">
                <td className="px-6 py-4">
                  <div className="font-semibold text-sm text-slate-900">{s.title || '—'}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {t('landingPagesAdmin.sharedBy', { name: s.sharedBy?.name || s.sharedBy?.email || '—' })}
                  </div>
                </td>
                <td className="px-6 py-4">
                  <code className="font-mono text-xs px-2 py-0.5 rounded-md border bg-orange-50 text-orange-700 border-orange-200">
                    {getCustomHostname(s) || `${s.slug}.${BASE_DOMAIN}`}
                  </code>
                </td>
                <td className="px-6 py-4 text-xs text-slate-600">
                  {s.sharedBy?.email || '—'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {s.isPublished ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200/80 shadow-2xs">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      {t('common.yes')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200 shadow-2xs">
                      <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                      {t('common.no')}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <a
                    href={s.publicUrl || getPublicUrl(s)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-orange-600 hover:bg-orange-50 inline-flex transition-colors"
                    title="Xem"
                  >
                    <HiOutlineExternalLink className="w-4 h-4" />
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={HiOutlineGlobeAlt}
        title={t('landingPagesAdmin.title')}
        subtitle={t('landingPagesAdmin.description')}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center justify-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors shadow-2xs"
              onClick={() => {
                if (activeTab === 'mine') reloadMine();
                else if (activeTab === 'purchased') reloadPurchased();
                else reloadShared();
              }}
              disabled={loading || purchasedLoading || sharedLoading}
            >
              <HiOutlineRefresh className="w-4 h-4" />
              <span>{t('landingPagesAdmin.reload')}</span>
            </button>
            {activeTab === 'mine' && (
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white text-sm font-bold shadow-sm hover:shadow transition-all duration-150 shrink-0"
                onClick={openCreate}
              >
                <HiOutlinePlus className="w-4 h-4" />
                <span>{t('landingPagesAdmin.createNew')}</span>
              </button>
            )}
          </div>
        }
      />

      {/* ── Toolbar: Sub-tabs Pills & Search ── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Sub-tabs switcher */}
        <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200/80 shrink-0">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            const Icon = tab.icon;
            const label =
              tab.id === 'mine'
                ? t('landingPagesAdmin.tabMine')
                : tab.id === 'purchased'
                  ? t('landingPagesAdmin.tabPurchased')
                  : t('landingPagesAdmin.tabShared');
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  isActive
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Live Search Input */}
        <div className="relative flex-1 sm:max-w-xs">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
            <HiOutlineSearch className="w-4 h-4" />
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo tên, slug, domain…"
            className="w-full pl-9 pr-8 py-1.5 text-xs bg-slate-50 hover:bg-slate-100/70 focus:bg-white border border-slate-200 rounded-xl focus:outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 transition-all placeholder:text-slate-400 text-slate-800"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-600"
            >
              <HiOutlineX className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* ── Table Card ── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white shadow-2xs overflow-hidden">
        {activeTab === 'mine' && renderMineTab()}
        {activeTab === 'purchased' && renderPurchasedTab()}
        {activeTab === 'shared' && renderSharedTab()}
      </div>

      <LandingPageShareModal
        landingPage={sharingLandingPage}
        open={Boolean(sharingLandingPage)}
        onClose={() => setSharingLandingPage(null)}
        onChanged={reloadMine}
      />
      <LandingPageMarketplaceModal
        landingPage={publishingLandingPage}
        open={Boolean(publishingLandingPage)}
        onClose={() => setPublishingLandingPage(null)}
        onSuccess={() => {
          toast.success(t('landingPagesAdmin.publishSuccess'));
        }}
      />
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={t('landingPagesAdmin.confirmDelete') || 'Xóa trang đích'}
        message={
          deleteTarget
            ? `Bạn có chắc chắn muốn xóa trang đích "${deleteTarget.title || deleteTarget.slug}"? Thao tác này không thể hoàn tác.`
            : ''
        }
        confirmText={t('common.delete') || 'Xóa'}
        cancelText={t('common.cancel') || 'Hủy'}
        isLoading={isDeleting}
        isDanger
      />
    </div>
  );
}
