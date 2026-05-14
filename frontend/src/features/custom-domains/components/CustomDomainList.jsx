import { useState, useEffect } from 'react';
import {
  HiOutlineGlobeAlt, HiOutlinePlus, HiOutlineTrash,
  HiOutlineRefresh, HiOutlineExternalLink, HiOutlineCheck,
  HiOutlineX, HiOutlineShieldCheck, HiOutlineShieldExclamation,
  HiOutlineLockClosed, HiOutlineChevronRight, HiOutlineInformationCircle
} from 'react-icons/hi';
import { toast } from 'react-hot-toast';
import customDomainApi from '../../../services/customDomainApi';
import AddDomainModal from './AddDomainModal';

const STATUS_CONFIG = {
  pending: { label: 'Chờ xác minh', color: 'bg-yellow-100 text-yellow-700', icon: HiOutlineInformationCircle },
  verifying: { label: 'Đang xác minh', color: 'bg-blue-100 text-blue-700', icon: HiOutlineRefresh },
  active: { label: 'Hoạt động', color: 'bg-green-100 text-green-700', icon: HiOutlineShieldCheck },
  failed: { label: 'Thất bại', color: 'bg-red-100 text-red-700', icon: HiOutlineShieldExclamation },
  suspended: { label: 'Tạm ngưng', color: 'bg-gray-100 text-gray-700', icon: HiOutlineLockClosed },
};

const VERIFICATION_STATUS_CONFIG = {
  pending: { label: 'Chưa xác minh', color: 'bg-yellow-100 text-yellow-700' },
  in_progress: { label: 'Đang xác minh', color: 'bg-blue-100 text-blue-700' },
  verified: { label: 'Đã xác minh', color: 'bg-green-100 text-green-700' },
  failed: { label: 'Xác minh thất bại', color: 'bg-red-100 text-red-700' },
};

/**
 * Custom Domain List Component.
 */
const CustomDomainList = () => {
  const [domains, setDomains] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [verifyingId, setVerifyingId] = useState(null);

  useEffect(() => {
    fetchDomains();
  }, []);

  const fetchDomains = async () => {
    setLoading(true);
    try {
      const res = await customDomainApi.list();
      setDomains(res.data || []);
    } catch (error) {
      console.error('Failed to fetch domains:', error);
      toast.error('Không thể tải danh sách domain');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (domain) => {
    setVerifyingId(domain.id);
    try {
      const res = await customDomainApi.verify(domain.id);
      if (res.success && res.data?.success) {
        toast.success('Xác minh domain thành công!');
      } else {
        toast.error(res.data?.message || 'Xác minh thất bại');
      }
      await fetchDomains();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Lỗi khi xác minh domain');
    } finally {
      setVerifyingId(null);
    }
  };

  const handleDelete = async (domain) => {
    if (!confirm(`Xóa domain "${domain.domain}"?`)) return;

    try {
      await customDomainApi.delete(domain.id);
      toast.success('Đã xóa domain');
      await fetchDomains();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Lỗi khi xóa domain');
    }
  };

  const handleDomainAdded = () => {
    setShowAddModal(false);
    fetchDomains();
  };

  const StatusBadge = ({ status }) => {
    const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
    const Icon = config.icon;
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold ${config.color}`}>
        <Icon className="w-3 h-3" />
        {config.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-3 border-orange-500/30 border-t-orange-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-800">Tên miền riêng</h2>
          <p className="text-sm text-slate-500 mt-1">
            Kết nối landing page với tên miền của bạn
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition-colors"
        >
          <HiOutlinePlus className="w-4 h-4" />
          Thêm tên miền
        </button>
      </div>

      {/* Domain List */}
      {domains.length === 0 ? (
        <div className="bg-slate-50 rounded-2xl p-12 text-center border border-slate-200">
          <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <HiOutlineGlobeAlt className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="font-bold text-slate-700 mb-2">Chưa có tên miền riêng</h3>
          <p className="text-sm text-slate-500 mb-6 max-w-md mx-auto">
            Thêm tên miền riêng để hiển thị landing page của bạn với domain của riêng bạn thay vì dùng subdomain của UKNOW.
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-orange-500 text-white font-semibold rounded-xl hover:bg-orange-600 transition-colors"
          >
            <HiOutlinePlus className="w-4 h-4" />
            Thêm tên miền đầu tiên
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {domains.map((domain) => (
            <div
              key={domain.id}
              className="bg-white rounded-2xl p-5 border border-slate-200 hover:border-slate-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Domain Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <HiOutlineGlobeAlt className="w-5 h-5 text-slate-400 shrink-0" />
                    <span className="font-bold text-slate-800 text-lg">{domain.domain}</span>
                    <StatusBadge status={domain.status} />
                  </div>

                  {/* Landing Page */}
                  {domain.landing_page_slug && (
                    <div className="flex items-center gap-2 ml-8 mb-3">
                      <span className="text-xs text-slate-500">Landing page:</span>
                      <a
                        href={`/app/settings/landing-pages/${domain.landing_page_id}`}
                        className="text-xs font-medium text-orange-600 hover:text-orange-700 flex items-center gap-1"
                      >
                        {domain.landing_page_title || domain.landing_page_slug}
                        <HiOutlineExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}

                  {/* Status Details */}
                  <div className="flex flex-wrap gap-4 ml-8 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <span>Xác minh:</span>
                      <span className={`font-medium ${
                        domain.verification_status === 'verified' ? 'text-green-600' :
                        domain.verification_status === 'failed' ? 'text-red-600' : 'text-yellow-600'
                      }`}>
                        {VERIFICATION_STATUS_CONFIG[domain.verification_status]?.label || domain.verification_status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span>SSL:</span>
                      <span className={`font-medium ${
                        domain.ssl_status === 'active' ? 'text-green-600' :
                        domain.ssl_status === 'failed' ? 'text-red-600' : 'text-yellow-600'
                      }`}>
                        {domain.ssl_status === 'active' ? 'Đã bật' :
                         domain.ssl_status === 'failed' ? 'Lỗi' : 'Đang xử lý'}
                      </span>
                    </div>
                  </div>

                  {/* Error Message */}
                  {domain.error_message && (
                    <div className="ml-8 mt-2 p-2 bg-red-50 rounded-lg">
                      <p className="text-xs text-red-600">{domain.error_message}</p>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {domain.status !== 'active' && (
                    <button
                      onClick={() => handleVerify(domain)}
                      disabled={verifyingId === domain.id || domain.status === 'verifying'}
                      className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-600 font-medium text-xs rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                    >
                      {verifyingId === domain.id ? (
                        <>
                          <div className="w-3 h-3 border-2 border-blue-500/30 border-t-blue-500 rounded-full animate-spin" />
                          Đang xác minh...
                        </>
                      ) : (
                        <>
                          <HiOutlineRefresh className="w-3.5 h-3.5" />
                          Xác minh
                        </>
                      )}
                    </button>
                  )}

                  {domain.status === 'active' && (
                    <span className="flex items-center gap-1.5 px-3 py-2 bg-green-50 text-green-600 font-medium text-xs rounded-lg">
                      <HiOutlineCheck className="w-3.5 h-3.5" />
                      Đã kích hoạt
                    </span>
                  )}

                  <button
                    onClick={() => handleDelete(domain)}
                    className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Xóa"
                  >
                    <HiOutlineTrash className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Domain Modal */}
      <AddDomainModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleDomainAdded}
      />
    </div>
  );
};

export default CustomDomainList;
