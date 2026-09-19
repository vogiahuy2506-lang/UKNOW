import { useState, useEffect } from 'react';
import {
  HiOutlineChartBar,
  HiOutlineTrendingUp,
  HiOutlineEye,
  HiOutlineCurrencyDollar,
  HiOutlineRefresh,
  HiOutlineDownload,
  HiOutlineStar,
  HiOutlineClock,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import marketplaceService from '../../services/marketplace.service';

const formatNumber = (n) => {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n ?? 0);
};

const formatDate = (iso) => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '';
  }
};

const StatCard = ({ icon: Icon, label, value, color = 'orange', trend }) => (
  <div className="bg-white rounded-xl border border-gray-100 p-5">
    <div className="flex items-center justify-between mb-3">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
        color === 'orange' ? 'bg-orange-100 text-orange-600' :
        color === 'green' ? 'bg-emerald-100 text-emerald-600' :
        color === 'blue' ? 'bg-blue-100 text-blue-600' :
        color === 'purple' ? 'bg-purple-100 text-purple-600' :
        'bg-gray-100 text-gray-600'
      }`}>
        <Icon className="w-5 h-5" />
      </div>
      {trend !== undefined && (
        <span className={`text-xs font-medium ${trend >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {trend >= 0 ? '+' : ''}{trend}%
        </span>
      )}
    </div>
    <div className="text-2xl font-bold text-gray-900">{formatNumber(value)}</div>
    <div className="text-sm text-gray-500">{label}</div>
  </div>
);

const ResourceTypeBadge = ({ type }) => {
  const config = {
    campaign: { bg: 'bg-orange-100', text: 'text-orange-600', label: 'Chiến dịch' },
    chatbot: { bg: 'bg-purple-100', text: 'text-purple-600', label: 'Chatbot' },
    landing_page: { bg: 'bg-blue-100', text: 'text-blue-600', label: 'Landing Page' },
  };
  const c = config[type] || config.campaign;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.bg} ${c.text}`}>
      {c.label}
    </span>
  );
};

const EarningsRow = ({ earning }) => (
  <tr className="border-b border-gray-50 hover:bg-gray-50">
    <td className="py-3 px-4 text-sm">
      <span className="font-medium text-gray-900 line-clamp-1">{earning.listing_title || 'N/A'}</span>
    </td>
    <td className="py-3 px-4 text-sm">
      <ResourceTypeBadge type={earning.resource_type} />
    </td>
    <td className="py-3 px-4 text-sm text-gray-600">
      {earning.buyer_name || 'Khách hàng'}
    </td>
    <td className="py-3 px-4 text-sm text-gray-600">
      {formatDate(earning.purchased_at)}
    </td>
    <td className="py-3 px-4 text-sm text-gray-500 text-right">
      -{formatNumber(earning.credits_spent)}
    </td>
    <td className="py-3 px-4 text-sm font-semibold text-emerald-600 text-right">
      +{formatNumber(Math.floor(earning.credits_spent * 0.9))}
    </td>
  </tr>
);

const TopListingCard = ({ listing }) => (
  <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium text-gray-900 truncate">{listing.title}</p>
      <div className="flex items-center gap-2 mt-1">
        <ResourceTypeBadge type={listing.type} />
      </div>
    </div>
    <div className="text-right">
      <p className="text-sm font-bold text-emerald-600">{listing.purchases} lượt mua</p>
      <p className="text-xs text-gray-500">{formatNumber(listing.views)} lượt xem</p>
    </div>
  </div>
);

const SellerDashboard = () => {
  const [loading, setLoading] = useState(true);
  const [dashboard, setDashboard] = useState(null);
  const [earnings, setEarnings] = useState([]);
  const [earningsTotal, setEarningsTotal] = useState(0);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const [dashRes, earningsRes] = await Promise.all([
        marketplaceService.getSellerDashboard(),
        marketplaceService.getSellerEarnings({ limit: 10 }),
      ]);
      setDashboard(dashRes.data.data);
      setEarnings(earningsRes.data.data || []);
      setEarningsTotal(earningsRes.data.pagination?.total || 0);
    } catch (error) {
      toast.error('Không thể tải dashboard');
    } finally {
      setLoading(false);
    }
  };

  const handleRequestWithdrawal = async () => {
    const amount = prompt('Nhập số credits muốn rút:');
    if (!amount) return;
    
    const numAmount = parseInt(amount, 10);
    if (isNaN(numAmount) || numAmount <= 0) {
      toast.error('Số credits không hợp lệ');
      return;
    }

    try {
      await marketplaceService.requestSellerWithdrawal({ amount: numAmount });
      toast.success('Yêu cầu rút tiền đã được gửi!');
      fetchDashboard();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể gửi yêu cầu rút tiền');
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-48" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-28 bg-gray-200 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!dashboard) {
    return (
      <div className="p-6 text-center">
        <p className="text-gray-500">Không thể tải dashboard</p>
      </div>
    );
  }

  const { balance, listings: listingsStats, topListings } = dashboard;

  return (
    <div className="min-h-full bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="px-6 py-5">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-gray-900">Seller Dashboard</h1>
              <p className="text-sm text-gray-500 mt-1">Thống kê doanh thu từ marketplace</p>
            </div>
            <button
              onClick={fetchDashboard}
              className="p-2 hover:bg-gray-100 rounded-lg text-gray-500"
            >
              <HiOutlineRefresh className="w-5 h-5" />
            </button>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <StatCard
              icon={HiOutlineCurrencyDollar}
              label="Tổng thu nhập"
              value={balance?.totalEarnings || 0}
              color="green"
            />
            <StatCard
              icon={HiOutlineTrendingUp}
              label="Số dư khả dụng"
              value={balance?.availableBalance || 0}
              color="orange"
            />
            <StatCard
              icon={HiOutlineChartBar}
              label="Tổng lượt bán"
              value={balance?.totalSales || 0}
              color="blue"
            />
            <StatCard
              icon={HiOutlineEye}
              label="Tổng lượt xem"
              value={balance?.totalViews || 0}
              color="purple"
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 flex gap-4 border-t border-gray-100">
          {[
            { id: 'overview', label: 'Tổng quan' },
            { id: 'earnings', label: 'Lịch sử thu nhập' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-3 text-sm font-medium border-b-2 -mb-px transition-colors ${
                activeTab === tab.id
                  ? 'border-orange-500 text-orange-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left column */}
            <div className="lg:col-span-2 space-y-6">
              {/* Quick actions */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-4">Thao tác nhanh</h3>
                <div className="flex gap-3">
                  <button
                    onClick={handleRequestWithdrawal}
                    disabled={!balance?.availableBalance || balance.availableBalance < 50000}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium text-sm"
                  >
                    <HiOutlineDownload className="w-4 h-4" />
                    Rút credits
                  </button>
                  <div className="flex-1 px-4 py-2.5 bg-gray-50 rounded-lg text-center">
                    <p className="text-xs text-gray-500">Chờ thanh toán</p>
                    <p className="text-sm font-bold text-amber-600">{formatNumber(balance?.pendingPayout || 0)}</p>
                  </div>
                </div>
              </div>

              {/* Listings stats */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-bold text-gray-900">Thống kê Listings</h3>
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-500">
                      <span className="font-semibold text-gray-900">{listingsStats?.active || 0}</span> đang bán
                    </span>
                    <span className="text-gray-500">
                      <span className="font-semibold text-gray-900">{listingsStats?.totalPurchases || 0}</span> lượt mua
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-emerald-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-emerald-600">{listingsStats?.active || 0}</p>
                    <p className="text-xs text-emerald-700">Đang bán</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-amber-600">{listingsStats?.draft || 0}</p>
                    <p className="text-xs text-amber-700">Nháp</p>
                  </div>
                  <div className="bg-gray-100 rounded-lg p-3 text-center">
                    <p className="text-2xl font-bold text-gray-600">{listingsStats?.paused || 0}</p>
                    <p className="text-xs text-gray-600">Tạm dừng</p>
                  </div>
                </div>
                {listingsStats?.avgRating && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-gray-600">
                    <HiOutlineStar className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <span>Đánh giá trung bình: <strong>{Number(listingsStats.avgRating).toFixed(1)}</strong>/5</span>
                  </div>
                )}
              </div>
            </div>

            {/* Right column */}
            <div className="space-y-6">
              {/* Top performing listings */}
              <div className="bg-white rounded-xl border border-gray-100 p-5">
                <h3 className="text-sm font-bold text-gray-900 mb-4">Top Listings</h3>
                {topListings && topListings.length > 0 ? (
                  <div className="space-y-3">
                    {topListings.map((listing) => (
                      <TopListingCard key={listing.id} listing={listing} />
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-gray-500 text-center py-4">Chưa có listing nào</p>
                )}
              </div>

              {/* Pending payout */}
              {balance?.pendingPayout > 0 && (
                <div className="bg-amber-50 rounded-xl border border-amber-200 p-5">
                  <div className="flex items-center gap-2 text-amber-800 mb-2">
                    <HiOutlineClock className="w-5 h-5" />
                    <h3 className="text-sm font-bold">Chờ thanh toán</h3>
                  </div>
                  <p className="text-2xl font-bold text-amber-600">{formatNumber(balance.pendingPayout)}</p>
                  <p className="text-xs text-amber-700 mt-1">credits đang xử lý</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'earnings' && (
          <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-sm font-bold text-gray-900">
                Lịch sử thu nhập ({earningsTotal} giao dịch)
              </h3>
            </div>
            {earnings.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
                      <th className="py-3 px-4 font-medium">Template</th>
                      <th className="py-3 px-4 font-medium">Loại</th>
                      <th className="py-3 px-4 font-medium">Người mua</th>
                      <th className="py-3 px-4 font-medium">Ngày</th>
                      <th className="py-3 px-4 font-medium text-right">Credits bán</th>
                      <th className="py-3 px-4 font-medium text-right">Thu nhập (90%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {earnings.map((earning) => (
                      <EarningsRow key={earning.id} earning={earning} />
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <HiOutlineTrendingUp className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Chưa có thu nhập nào</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default SellerDashboard;
