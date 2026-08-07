import { useState, useEffect } from 'react';
import {
  HiOutlineTrendingUp,
  HiOutlineTrendingDown,
  HiOutlineCurrencyDollar,
  HiOutlineShoppingBag,
  HiOutlineStar,
  HiOutlineEye,
  HiOutlineUser,
} from 'react-icons/hi';
import api from '../../services/api';
import { useI18n } from '../../i18n';

const MarketplaceAnalytics = () => {
  const { t } = useI18n();
  const [stats, setStats] = useState(null);
  const [topSellers, setTopSellers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const response = await api.get('/admin/marketplace/stats');
      setStats(response.data.data);
      setTopSellers(response.data.data.topSellers || []);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatNumber = (num) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num?.toString() || '0';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="animate-pulse">
          <div className="h-8 w-64 bg-gray-200 rounded mb-6"></div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="card p-6 h-32"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const publishedPercent = stats?.totalListings
    ? Math.round((stats.byStatus?.published / stats.totalListings) * 100)
    : 0;

  const avgCreditsPerListing = stats?.totalListings && stats?.totalListings > 0
    ? Math.round(stats.totalRevenue / stats.totalListings)
    : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Phân tích Marketplace</h1>
        <p className="text-gray-500 mt-1">
          Thống kê và insights về hoạt động marketplace
        </p>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Listings */}
        <div className="card p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Tổng Listings</p>
              <p className="text-3xl font-bold text-gray-900 mt-1">{stats?.totalListings || 0}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <HiOutlineShoppingBag className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-gray-100">
            <span className="flex items-center gap-1 text-sm text-green-600">
              <HiOutlineTrendingUp className="w-4 h-4" />
              {stats?.byStatus?.published || 0} đã đăng
            </span>
            <span className="flex items-center gap-1 text-sm text-yellow-600">
              <HiOutlineTrendingDown className="w-4 h-4" />
              {stats?.byStatus?.draft || 0} nháp
            </span>
          </div>
        </div>

        {/* Total Revenue */}
        <div className="card p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Tổng Credits</p>
              <p className="text-3xl font-bold text-amber-600 mt-1">{formatNumber(stats?.totalRevenue || 0)}</p>
            </div>
            <div className="p-3 bg-amber-100 rounded-lg">
              <HiOutlineCurrencyDollar className="w-6 h-6 text-amber-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-4 pt-4 border-t border-gray-100">
            Tổng credits giao dịch
          </p>
        </div>

        {/* Published */}
        <div className="card p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Đã Đăng</p>
              <p className="text-3xl font-bold text-green-600 mt-1">{stats?.byStatus?.published || 0}</p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <HiOutlineStar className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="text-gray-500">Tỷ lệ đăng</span>
              <span className="font-medium">{publishedPercent}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-green-500 h-2 rounded-full transition-all"
                style={{ width: `${publishedPercent}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Paused */}
        <div className="card p-6">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Tạm Dừng</p>
              <p className="text-3xl font-bold text-yellow-600 mt-1">{stats?.byStatus?.paused || 0}</p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-lg">
              <HiOutlineEye className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-4 pt-4 border-t border-gray-100">
            Listing tạm thời không hiển thị
          </p>
        </div>
      </div>

      {/* Quick Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card p-6 bg-gradient-to-br from-blue-500 to-blue-600 text-white">
          <p className="text-blue-100 text-sm">Trung bình credits/listing</p>
          <p className="text-3xl font-bold mt-1">{avgCreditsPerListing}</p>
        </div>

        <div className="card p-6 bg-gradient-to-br from-green-500 to-green-600 text-white">
          <p className="text-green-100 text-sm">Tỷ lệ đăng thành công</p>
          <p className="text-3xl font-bold mt-1">{publishedPercent}%</p>
        </div>

        <div className="card p-6 bg-gradient-to-br from-amber-500 to-amber-600 text-white">
          <p className="text-amber-100 text-sm">Top seller</p>
          <p className="text-xl font-bold mt-1 truncate">
            {topSellers[0]?.full_name || topSellers[0]?.username || 'N/A'}
          </p>
        </div>
      </div>

      {/* Top Sellers Table */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Top người bán</h2>
          <p className="text-sm text-gray-500 mt-1">Những người bán có doanh thu cao nhất</p>
        </div>

        {topSellers.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Chưa có dữ liệu
          </div>
        ) : (
          <div className="table-container">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Người bán</th>
                  <th>Số listing</th>
                  <th>Doanh thu</th>
                </tr>
              </thead>
              <tbody>
                {topSellers.map((seller, index) => (
                  <tr key={seller.id_user}>
                    <td className="text-gray-400">{index + 1}</td>
                    <td>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 bg-gray-100 rounded-full flex items-center justify-center">
                          <HiOutlineUser className="w-4 h-4 text-gray-500" />
                        </div>
                        <span className="font-medium">{seller.full_name || seller.username}</span>
                      </div>
                    </td>
                    <td>{seller.listing_count}</td>
                    <td>
                      <span className="text-amber-600 font-semibold">{seller.total_revenue} credits</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default MarketplaceAnalytics;
