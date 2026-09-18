import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
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
} from 'react-icons/hi';
import {
  deleteLandingPageAdmin,
  fetchLandingPagesAdminList,
  fetchLandingPagesDashboardStats,
} from '../../features/landing-pages/services/landingPagesAdminApi.service.js';
import marketplaceService from '../../services/marketplace.service';
import LandingPageShareModal from '../../components/marketplace/LandingPageShareModal';

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
      const isCustom = r.domainType === 'custom' || Boolean(r.customDomainHostname);
      const domain = r.customDomainHostname || `${r.slug}.${BASE_DOMAIN}`;
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

  const remove = async (row) => {
    if (!window.confirm(t('landingPagesAdmin.confirmDelete'))) return;
    try {
      await deleteLandingPageAdmin(row.id);
      toast.success(t('landingPagesAdmin.deleted'));
      reloadMine();
    } catch (e) {
      toast.error(e?.response?.data?.message || t('landingPagesAdmin.deleteFailed'));
    }
  };

  const copyToClipboard = (text, msg) => {
    navigator.clipboard.writeText(text).then(() => toast.success(msg || 'Đã copy'));
  };

  const getPublicUrl = (r) => {
    if (r?.customDomainHostname) {
      return `https://${r.customDomainHostname}`;
    }
    return `https://${r?.slug || ''}.${BASE_DOMAIN}`;
  };

  const renderMineTab = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
        </div>
      );
    }
    if (tableRows.length === 0) {
      return (
        <div className="text-center py-12 card">
          <HiOutlineGlobeAlt className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500 mb-4">{t('landingPagesAdmin.tabMineEmpty')}</p>
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            <HiOutlinePlus className="w-4 h-4 mr-2 inline" />
            {t('landingPagesAdmin.createNew')}
          </button>
        </div>
      );
    }
    return (
      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50/50">
              <th className="p-3 font-medium">{t('landingPagesAdmin.titleCol')}</th>
              <th className="p-3 font-medium">{t('landingPagesAdmin.domainCol') || 'Domain'}</th>
              <th className="p-3 font-medium">{t('landingPagesAdmin.published')}</th>
              <th className="p-3 font-medium tabular-nums">{t('landingPagesAdmin.views')}</th>
              <th className="p-3 font-medium tabular-nums">{t('landingPagesAdmin.clicks')}</th>
              <th className="p-3 font-medium tabular-nums">{t('landingPagesAdmin.forms')}</th>
              <th className="p-3 font-medium">{t('landingPagesAdmin.updated')}</th>
              <th className="p-3 w-44" />
            </tr>
          </thead>
          <tbody>
            {tableRows.map((r) => (
              <tr
                key={r.id}
                className="border-b border-gray-50 hover:bg-gray-50/80 transition-colors"
              >
                <td className="p-3 font-medium text-gray-900">{r.title || '—'}</td>
                <td className="p-3">
                  <div className="flex items-center gap-2">
                    <code
                      className={`font-mono text-xs px-2 py-1 rounded ${
                        r.isCustomDomain
                          ? 'bg-purple-100 text-purple-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {r.displayDomain}
                    </code>
                    {r.isCustomDomain && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-600">
                        {r.isApexDomain ? 'Apex' : 'Sub'}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => copyToClipboard(getPublicUrl(r), 'Đã copy URL')}
                      className="p-1.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                      title="Copy URL"
                    >
                      <HiOutlineClipboard className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={getPublicUrl(r)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded text-gray-400 hover:text-orange-600 hover:bg-orange-50 transition-colors"
                      title="Mở trong tab mới"
                    >
                      <HiOutlineExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </td>
                <td className="p-3">
                  {r.isPublished ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      {t('common.yes')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                      {t('common.no')}
                    </span>
                  )}
                </td>
                <td className="p-3 tabular-nums text-gray-700">
                  {Number(r.viewCount || 0).toLocaleString('vi-VN')}
                </td>
                <td className="p-3 tabular-nums text-gray-700">
                  {Number(r.clickCount || 0).toLocaleString('vi-VN')}
                </td>
                <td className="p-3 tabular-nums text-gray-700">
                  {Number(r.submitCount || 0).toLocaleString('vi-VN')}
                </td>
                <td className="p-3 text-xs text-gray-500">
                  {r.updatedAt ? new Date(r.updatedAt).toLocaleString('vi-VN') : '—'}
                </td>
                <td className="p-3">
                  <div className="flex gap-1 justify-end">
                    <button
                      type="button"
                      className="p-2 rounded-lg text-orange-600 hover:bg-orange-50 transition-colors"
                      title="Chia sẻ"
                      onClick={() => setSharingLandingPage(r)}
                    >
                      <HiOutlineShare className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
                      title={t('common.edit')}
                      onClick={() => openEdit(r)}
                    >
                      <HiOutlinePencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="p-2 rounded-lg text-red-600 hover:bg-red-50 transition-colors"
                      title={t('common.delete')}
                      onClick={() => remove(r)}
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
        <div className="flex items-center justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
        </div>
      );
    }
    if (purchasedRows.length === 0) {
      return (
        <div className="text-center py-12 card">
          <HiOutlineShoppingCart className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{t('landingPagesAdmin.tabPurchasedEmpty')}</p>
        </div>
      );
    }
    return (
      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50/50">
              <th className="p-3 font-medium">{t('landingPagesAdmin.titleCol')}</th>
              <th className="p-3 font-medium">Seller</th>
              <th className="p-3 font-medium">Giá</th>
              <th className="p-3 font-medium">Ngày mua</th>
              <th className="p-3 w-24" />
            </tr>
          </thead>
          <tbody>
            {purchasedRows.map((p) => (
              <tr key={p.id || p.listingId || p.listing_id} className="border-b border-gray-50 hover:bg-gray-50/80">
                <td className="p-3 font-medium text-gray-900">
                  {p.title || p.listingTitle || p.listing?.title || '—'}
                </td>
                <td className="p-3 text-gray-700">
                  {p.seller_name || p.seller?.fullName || p.seller?.name || p.sellerName || '—'}
                </td>
                <td className="p-3 text-gray-700">
                  {t('landingPagesAdmin.purchasedPrice', { price: p.price_credits ?? p.priceCredits ?? p.price ?? 0 })}
                </td>
                <td className="p-3 text-xs text-gray-500">
                  {p.purchased_at || p.purchasedAt
                    ? new Date(p.purchased_at || p.purchasedAt).toLocaleString('vi-VN')
                    : '—'}
                </td>
                <td className="p-3 text-right">
                  <a
                    href={p.publicUrl || getPublicUrl(p)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 inline-flex"
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
        <div className="flex items-center justify-center p-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
        </div>
      );
    }
    if (sharedRows.length === 0) {
      return (
        <div className="text-center py-12 card">
          <HiOutlineUserGroup className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">{t('landingPagesAdmin.tabSharedEmpty')}</p>
        </div>
      );
    }
    return (
      <div className="card overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b border-gray-100 bg-gray-50/50">
              <th className="p-3 font-medium">{t('landingPagesAdmin.titleCol')}</th>
              <th className="p-3 font-medium">{t('landingPagesAdmin.domainCol') || 'Domain'}</th>
              <th className="p-3 font-medium">Chia sẻ bởi</th>
              <th className="p-3 font-medium">{t('landingPagesAdmin.published')}</th>
              <th className="p-3 w-24" />
            </tr>
          </thead>
          <tbody>
            {sharedRows.map((s) => (
              <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50/80">
                <td className="p-3 font-medium text-gray-900">
                  {s.title || '—'}
                  <span className="block text-xs text-gray-500 mt-0.5">
                    {t('landingPagesAdmin.sharedBy', { name: s.sharedBy?.name || s.sharedBy?.email || '—' })}
                  </span>
                </td>
                <td className="p-3">
                  <code className="font-mono text-xs px-2 py-1 rounded bg-orange-50 text-orange-700">
                    {s.customDomainHostname || `${s.slug}.${BASE_DOMAIN}`}
                  </code>
                </td>
                <td className="p-3 text-gray-700 text-xs">
                  {s.sharedBy?.email || '—'}
                </td>
                <td className="p-3">
                  {s.isPublished ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      {t('common.yes')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                      {t('common.no')}
                    </span>
                  )}
                </td>
                <td className="p-3 text-right">
                  <a
                    href={s.publicUrl || getPublicUrl(s)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2 rounded-lg text-gray-600 hover:bg-gray-100 inline-flex"
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
    <div className="relative flex h-full min-h-0 flex-col">
      <div className="space-y-6 flex-1 min-h-0 overflow-auto pr-1">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">{t('landingPagesAdmin.title')}</h1>
            <p className="text-sm text-gray-500 mt-1">
              {t('landingPagesAdmin.description')}
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              type="button"
              className="btn btn-secondary flex items-center gap-2"
              onClick={() => {
                if (activeTab === 'mine') reloadMine();
                else if (activeTab === 'purchased') reloadPurchased();
                else reloadShared();
              }}
              disabled={loading || purchasedLoading || sharedLoading}
            >
              <HiOutlineRefresh className="w-4 h-4" />
              {t('landingPagesAdmin.reload')}
            </button>
            {activeTab === 'mine' && (
              <button
                type="button"
                className="btn btn-primary flex items-center gap-2"
                onClick={openCreate}
              >
                <HiOutlinePlus className="w-4 h-4" />
                {t('landingPagesAdmin.createNew')}
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-1 -mb-px">
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
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                    isActive
                      ? 'border-orange-500 text-orange-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              );
            })}
          </nav>
        </div>

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
    </div>
  );
}
