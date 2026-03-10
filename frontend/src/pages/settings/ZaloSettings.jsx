import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiOutlineChatAlt2,
  HiOutlineCheckCircle,
  HiOutlineClipboardCopy,
  HiOutlineExclamationCircle,
  HiOutlineQrcode,
  HiOutlineRefresh,
  HiOutlineTrash,
  HiOutlineXCircle,
} from 'react-icons/hi';
import api from '../../services/api';

/**
 * Chuẩn hóa dữ liệu tài khoản Zalo trả về từ API
 * để UI luôn dùng cùng một shape.
 *
 * @param {Record<string, any>} account dữ liệu account thô
 * @returns {{
 *  id: string;
 *  displayName: string;
 *  zaloUserId: string;
 *  zaloName: string;
 *  zaloPhone: string;
 *  status: string;
 *  isActive: boolean;
 *  isDefault: boolean;
 *  loginMethod: string;
 *  notes: string;
 *  updatedAt: string | null;
 * }}
 */
function normalizeAccount(account = {}) {
  return {
    id: String(account.id || crypto.randomUUID()),
    displayName: account.displayName || account.name || 'Tài khoản Zalo',
    zaloUserId: String(account.zaloUserId || account.oaId || account.accountId || ''),
    zaloName: String(account.zaloName || account.fullName || ''),
    zaloPhone: String(account.zaloPhone || account.phoneNumber || ''),
    status: account.status || 'disconnected',
    isActive: account.isActive ?? true,
    isDefault: account.isDefault ?? false,
    loginMethod: account.loginMethod || 'qr',
    notes: account.notes || '',
    updatedAt: account.updatedAt || account.lastSyncAt || null,
  };
}

const ZaloSettings = () => {
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isCreatingQr, setIsCreatingQr] = useState(false);
  const [restoringAccountIds, setRestoringAccountIds] = useState([]);
  const [isBackendReady, setIsBackendReady] = useState(true);
  const [backendModeMessage, setBackendModeMessage] = useState('');
  const [qrPreview, setQrPreview] = useState({
    isOpen: false,
    image: '',
    path: '',
    sessionKey: '',
  });

  const sortedAccounts = useMemo(() => {
    return [...accounts].sort((a, b) => {
      if (a.isDefault && !b.isDefault) return -1;
      if (!a.isDefault && b.isDefault) return 1;
      return a.displayName.localeCompare(b.displayName, 'vi');
    });
  }, [accounts]);

  /**
   * Tải danh sách account từ backend.
   */
  const fetchAccounts = async () => {
    try {
      const response = await api.get('/zalo/accounts');
      const apiItems = response.data?.data?.items;
      const normalized = Array.isArray(apiItems) ? apiItems.map(normalizeAccount) : [];
      setAccounts(normalized);
      setIsBackendReady(true);
      setBackendModeMessage('');
    } catch (error) {
      setAccounts([]);
      setIsBackendReady(false);
      const status = error?.response?.status;
      const code = error?.response?.data?.code;
      if (status === 404) {
        setBackendModeMessage('Backend chưa triển khai route `/api/zalo/accounts`.');
      } else if (code === 'ZALO_SETTINGS_TABLE_MISSING') {
        setBackendModeMessage(
          'Backend đã có route Zalo nhưng thiếu bảng dữ liệu. Vui lòng chạy SQL `backend/sql/20260228_create_zalo_settings.sql`.'
        );
      } else {
        setBackendModeMessage('Không thể kết nối API Zalo. Vui lòng kiểm tra backend.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAccounts();
  }, []);

  const copyText = async (value, successMsg) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(successMsg);
    } catch (_error) {
      toast.error('Không thể sao chép');
    }
  };

  const handleRefreshStatus = async () => {
    setIsRefreshing(true);
    await fetchAccounts();
    setIsRefreshing(false);
    toast.success('Đã làm mới danh sách tài khoản');
  };

  const handleDeleteAccount = async (accountId) => {
    if (!window.confirm('Bạn có chắc muốn xóa tài khoản Zalo này?')) return;

    if (!isBackendReady) {
      toast.error('Backend Zalo chưa sẵn sàng.');
      return;
    }

    try {
      await api.delete(`/zalo/accounts/${accountId}`);
      await fetchAccounts();
      toast.success('Đã xóa tài khoản');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể xóa tài khoản');
    }
  };

  const handleSetDefault = async (accountId) => {
    if (!isBackendReady) {
      toast.error('Backend Zalo chưa sẵn sàng.');
      return;
    }

    try {
      await api.patch(`/zalo/accounts/${accountId}/default`);
      await fetchAccounts();
      toast.success('Đã chọn tài khoản gửi mặc định');
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể đổi tài khoản mặc định');
    }
  };

  const handleConnectByQr = async () => {
    if (!isBackendReady) {
      toast.error(backendModeMessage || 'Backend Zalo chưa sẵn sàng.');
      return;
    }

    try {
      setIsCreatingQr(true);
      const response = await api.post('/zalo/accounts/login-qr');
      const qrPath = response.data?.data?.qrPath;
      const qrImage = response.data?.data?.qrImage;
      const sessionKey = response.data?.data?.sessionKey;
      if (qrPath) {
        await copyText(qrPath, 'Đã sao chép đường dẫn QR');
      }
      if (qrImage && sessionKey) {
        setQrPreview({
          isOpen: true,
          image: qrImage,
          path: qrPath || '',
          sessionKey,
        });
        toast.success('Đã tạo QR đăng nhập, vui lòng quét bằng app Zalo');
      } else {
        toast.error('Backend chưa trả đủ dữ liệu QR/session để theo dõi đăng nhập.');
      }
    } catch (error) {
      toast.error(error.response?.data?.message || 'Không thể tạo QR đăng nhập');
    } finally {
      setIsCreatingQr(false);
    }
  };

  /**
   * Trigger QR login flow again for disconnected account.
   *
   * @param {{displayName?: string}} account
   * @returns {Promise<void>}
   */
  const handleReconnectByQr = async (account) => {
    const displayName = String(account?.displayName || '').trim();
    if (displayName) {
      toast('Quét QR bằng đúng tài khoản để cập nhật lại phiên đăng nhập.', {
        icon: 'ℹ️',
      });
    }
    await handleConnectByQr();
  };

  /**
   * Khôi phục session Zalo từ cookie đã lưu cho một account.
   *
   * @param {{ id: string; displayName?: string }} account
   * @returns {Promise<void>}
   */
  const handleRestoreSession = async (account) => {
    const accountId = String(account?.id || '').trim();
    if (!accountId) {
      toast.error('Thiếu ID tài khoản để khôi phục session');
      return;
    }
    if (!isBackendReady) {
      toast.error(backendModeMessage || 'Backend Zalo chưa sẵn sàng.');
      return;
    }

    setRestoringAccountIds((prev) => (prev.includes(accountId) ? prev : [...prev, accountId]));
    try {
      await api.post(`/zalo/accounts/${accountId}/restore-session`);
      await fetchAccounts();
      toast.success(`Đã khôi phục session cho ${account?.displayName || 'tài khoản Zalo'}`);
    } catch (error) {
      const status = error?.response?.status;
      if (status === 404) {
        toast.error('Backend chưa hỗ trợ API khôi phục session. Vui lòng cập nhật backend mới nhất.');
      } else {
        toast.error(error?.response?.data?.message || 'Không thể khôi phục session từ cookie đã lưu');
      }
    } finally {
      setRestoringAccountIds((prev) => prev.filter((id) => id !== accountId));
    }
  };

  const closeQrPreview = () => {
    setQrPreview({
      isOpen: false,
      image: '',
      path: '',
      sessionKey: '',
    });
  };

  useEffect(() => {
    if (!qrPreview.isOpen || !qrPreview.sessionKey) return undefined;

    let disposed = false;
    let timerId = null;

    const pollStatus = async () => {
      if (disposed) return;
      try {
        const response = await api.get(`/zalo/accounts/login-qr/${qrPreview.sessionKey}/status`);
        const status = response.data?.data?.status;
        const message = response.data?.data?.message;
        const account = response.data?.data?.account;

        if (status === 'connected') {
          toast.success(message || 'Đăng nhập Zalo thành công');
          if (account?.displayName) {
            toast.success(`Đã lưu tài khoản: ${account.displayName}`);
          }
          await fetchAccounts();
          closeQrPreview();
          return;
        }

        if (status === 'failed') {
          toast.error(message || 'Đăng nhập Zalo thất bại');
          closeQrPreview();
        }
      } catch (error) {
        if (error?.response?.status === 404) {
          toast.error('Phiên QR đã hết hạn, vui lòng tạo QR mới.');
          closeQrPreview();
        }
      }
    };

    pollStatus();
    timerId = window.setInterval(pollStatus, 3000);

    return () => {
      disposed = true;
      if (timerId) {
        window.clearInterval(timerId);
      }
    };
  }, [qrPreview.isOpen, qrPreview.sessionKey]);

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quản lý Workspace Zalo</h1>
          <p className="text-gray-500 mt-1">Đăng nhập nhiều tài khoản và chọn tài khoản gửi tin nhắn mặc định</p>
        </div>
        <button
          type="button"
          onClick={handleRefreshStatus}
          className="btn btn-secondary"
          disabled={isRefreshing}
        >
          <HiOutlineRefresh className="w-4 h-4 mr-2" />
          {isRefreshing ? 'Đang tải...' : 'Làm mới'}
        </button>
      </div>

      {!isBackendReady && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
          <div className="flex items-start gap-2">
            <HiOutlineExclamationCircle className="w-5 h-5 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Backend Zalo chưa sẵn sàng</p>
              <p className="mt-1">
                {backendModeMessage || 'Vui lòng kiểm tra lại cấu hình backend trước khi đăng nhập tài khoản.'}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="card p-6 space-y-4">
        <div className="flex items-center gap-2 text-gray-900">
          <HiOutlineQrcode className="w-5 h-5 text-primary-600" />
          <h2 className="text-lg font-semibold">Đăng nhập tài khoản Zalo bằng QR</h2>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleConnectByQr}
            className="btn btn-primary"
            disabled={isCreatingQr}
          >
            <HiOutlineQrcode className="w-4 h-4 mr-2" />
            {isCreatingQr ? 'Đang tạo QR...' : 'Tạo QR đăng nhập'}
          </button>
        </div>
      </div>

      <div className="card p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Danh sách tài khoản gửi tin</h2>
            <span className="text-sm text-gray-500">Tổng: {sortedAccounts.length}</span>
          </div>

          {isLoading ? (
            <div className="py-12 flex items-center justify-center">
              <div className="spinner w-8 h-8" />
            </div>
          ) : sortedAccounts.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <HiOutlineChatAlt2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Chưa có tài khoản Zalo nào</p>
              <p className="text-xs mt-1">Bấm “Tạo QR đăng nhập” và quét để lưu tài khoản vào hệ thống</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sortedAccounts.map((account) => (
                <div key={account.id} className="rounded-lg border border-gray-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center flex-wrap gap-2">
                        <h3 className="font-semibold text-gray-900">{account.displayName}</h3>
                        {account.isDefault && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-primary-100 text-primary-700">
                            Mặc định
                          </span>
                        )}
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            account.status === 'connected' && account.isActive
                              ? 'bg-green-100 text-green-700'
                              : 'bg-red-100 text-red-700'
                          }`}
                        >
                          {account.status === 'connected' && account.isActive
                            ? 'Đang đăng nhập'
                            : 'Không còn đăng nhập'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-600 mt-1">
                        Zalo ID: {account.zaloUserId || 'Chưa cấu hình'}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        Tên Zalo: {account.zaloName || account.displayName || 'Chưa có dữ liệu'}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        SĐT: {account.zaloPhone || 'Chưa có dữ liệu'}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Cập nhật: {account.updatedAt ? new Date(account.updatedAt).toLocaleString('vi-VN') : 'N/A'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {!(account.status === 'connected' && account.isActive) && (
                        <>
                          <button
                            type="button"
                            className="btn btn-secondary text-xs"
                            onClick={() => handleRestoreSession(account)}
                            disabled={restoringAccountIds.includes(account.id)}
                          >
                            <HiOutlineRefresh className="w-4 h-4 mr-1" />
                            {restoringAccountIds.includes(account.id)
                              ? 'Đang khôi phục...'
                              : 'Khôi phục session'}
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary text-xs"
                            onClick={() => handleReconnectByQr(account)}
                            disabled={isCreatingQr}
                          >
                            <HiOutlineQrcode className="w-4 h-4 mr-1" />
                            Đăng nhập lại (QR)
                          </button>
                        </>
                      )}
                      {!account.isDefault && (
                        <button
                          type="button"
                          className="btn btn-secondary text-xs"
                          onClick={() => handleSetDefault(account.id)}
                        >
                          <HiOutlineCheckCircle className="w-4 h-4 mr-1" />
                          Chọn mặc định
                        </button>
                      )}
                      <button
                        type="button"
                        className="p-2 rounded-md hover:bg-red-50 text-gray-500 hover:text-red-600"
                        onClick={() => handleDeleteAccount(account.id)}
                        title="Xóa tài khoản"
                      >
                        <HiOutlineTrash className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                  {account.notes && <p className="text-sm text-gray-700 mt-3">{account.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>

      {qrPreview.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
            <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Quét QR để đăng nhập Zalo</h3>
              <button
                type="button"
                className="p-2 rounded-md hover:bg-gray-100 text-gray-500"
                onClick={closeQrPreview}
                aria-label="Đóng popup QR"
              >
                <HiOutlineXCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="rounded-lg border border-gray-200 p-3 flex items-center justify-center">
                <img src={qrPreview.image} alt="Mã QR đăng nhập Zalo" className="w-64 h-64 object-contain" />
              </div>
              <p className="text-sm text-gray-600 text-center">
                Mở ứng dụng Zalo trên điện thoại, vào mục quét mã và quét QR này.
              </p>
              {qrPreview.path && (
                <button
                  type="button"
                  onClick={() => copyText(qrPreview.path, 'Đã sao chép đường dẫn file QR')}
                  className="btn btn-secondary w-full"
                >
                  <HiOutlineClipboardCopy className="w-4 h-4 mr-2" />
                  Sao chép đường dẫn QR
                </button>
              )}
              <button
                type="button"
                onClick={closeQrPreview}
                className="btn btn-primary w-full"
              >
                Đóng cửa sổ QR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ZaloSettings;
