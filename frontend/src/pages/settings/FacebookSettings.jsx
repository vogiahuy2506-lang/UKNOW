import { useCallback, useEffect, useState } from 'react';
import {
  HiOutlineLink,
  HiOutlineTrash,
  HiOutlineRefresh,
  HiOutlineExclamation,
  HiOutlineExternalLink,
} from 'react-icons/hi';
import toast from 'react-hot-toast';
import facebookSettingsApiService from '../../features/settings/services/facebookSettingsApi.service';

/**
 * Status pill for a Facebook connection.
 * has_credentials=false → token is missing (refresh needed).
 */
function ConnectionStatus({ conn }) {
  if (!conn.has_credentials) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Token thiếu
      </span>
    );
  }
  
  // Show expiry warning if token is expiring soon (within 7 days)
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null;
  const now = new Date();
  const daysUntilExpiry = expiresAt ? Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)) : null;
  
  if (daysUntilExpiry !== null && daysUntilExpiry <= 7) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
        Hết hạn {daysUntilExpiry <= 0 ? 'rồi!' : `trong ${daysUntilExpiry} ngày`}
      </span>
    );
  }
  
  if (daysUntilExpiry !== null && daysUntilExpiry <= 14) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        Hết hạn trong {daysUntilExpiry} ngày
      </span>
    );
  }
  
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      Đã kết nối
    </span>
  );
}

export default function FacebookSettings() {
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [refreshingId, setRefreshingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);

  const loadConnections = useCallback(async () => {
    try {
      const res = await facebookSettingsApiService.listConnections();
      const list = res?.data?.data;
      setConnections(Array.isArray(list) ? list : []);
    } catch (err) {
      console.warn('[FacebookSettings] listConnections:', err.message);
      setConnections([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Read ?oauth=success from URL (set by OAuth callback redirect).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('oauth') === 'success') {
      toast.success(`Đã kết nối ${params.get('page_count') || ''} Fanpage thành công!`);
      // Remove the query param so reload doesn't re-toast.
      const url = new URL(window.location.href);
      url.searchParams.delete('oauth');
      url.searchParams.delete('page_count');
      window.history.replaceState({}, '', url.toString());
    } else if (params.get('oauth') === 'error') {
      toast.error('Kết nối Facebook thất bại: ' + params.get('reason'));
      const url = new URL(window.location.href);
      url.searchParams.delete('oauth');
      url.searchParams.delete('error');
      url.searchParams.delete('reason');
      window.history.replaceState({}, '', url.toString());
    }
    loadConnections();
  }, [loadConnections]);

  const handleConnect = async () => {
    setConnecting(true);
    try {
      const res = await facebookSettingsApiService.initOAuth();
      const authUrl = res?.data?.auth_url;
      if (authUrl) {
        // Open in a popup to avoid losing the current page context.
        const popup = window.open(authUrl, 'facebook_oauth', 'width=600,height=700,scrollbars=yes');
        if (!popup) {
          toast.error('Trình duyệt chặn popup. Vui lòng cho phép popup cho trang này.');
          return;
        }
        // Poll popup until it closes (OAuth redirects back to ChannelSettings).
        const poll = setInterval(() => {
          if (popup.closed) {
            clearInterval(poll);
            loadConnections();
          }
        }, 1000);
      }
    } catch (err) {
      const msg = err?.response?.data?.message || err.message || 'Không thể khởi tạo OAuth.';
      toast.error(msg);
    } finally {
      setConnecting(false);
    }
  };

  const handleRefresh = async (id) => {
    setRefreshingId(id);
    try {
      await facebookSettingsApiService.refreshToken(id);
      toast.success('Đã làm mới token thành công.');
      loadConnections();
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Làm mới token thất bại.');
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDelete = async (id, pageName) => {
    if (!window.confirm(`Ngắt kết nối Fanpage "${pageName}"? Các chatbot đang dùng Fanpage này sẽ ngừng nhận tin.`)) {
      return;
    }
    setDeletingId(id);
    try {
      await facebookSettingsApiService.disconnect(id);
      toast.success('Đã ngắt kết nối.');
      setConnections((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      toast.error(err?.response?.data?.message || err.message || 'Ngắt kết nối thất bại.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Facebook Pages</h2>
          <p className="mt-1 text-sm text-gray-500">
            Kết nối Fanpage để chatbot tự động trả lời tin nhắn Messenger.
          </p>
        </div>
        <button
          type="button"
          onClick={handleConnect}
          disabled={connecting}
          className="inline-flex items-center gap-2 shrink-0 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
        >
          <HiOutlineLink className="w-4 h-4" />
          {connecting ? 'Đang mở...' : 'Kết nối tài khoản Facebook'}
        </button>
      </div>

      {/* Help card */}
      <div className="flex items-start gap-3 rounded-xl border border-indigo-100 bg-indigo-50/50 p-4">
        <HiOutlineExclamation className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
        <div className="text-sm text-slate-700">
          <p className="font-medium text-indigo-800">Cách hoạt động</p>
          <ol className="mt-1 space-y-0.5 text-slate-600 list-decimal list-inside">
            <li>Bấm <strong>"Kết nối tài khoản Facebook"</strong> để ủy quyền với Meta.</li>
            <li>Chọn các Fanpage bạn muốn kết nối.</li>
            <li>Quay lại <strong>Chatbot Studio → tab Triển khai</strong> để bật AI cho từng Fanpage.</li>
          </ol>
        </div>
      </div>

      {/* Connection list */}
      {loading ? (
        <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
          <HiOutlineRefresh className="w-4 h-4 animate-spin mr-2" />
          Đang tải...
        </div>
      ) : connections.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-dashed border-slate-200">
          <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto mb-3">
            <span className="text-xl font-bold text-slate-400">f</span>
          </div>
          <p className="text-sm font-medium text-slate-600">Chưa có Fanpage nào được kết nối</p>
          <p className="text-xs text-slate-400 mt-1">
            Bấm nút "Kết nối tài khoản Facebook" ở trên để bắt đầu.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="flex items-center gap-3 px-4 py-3 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-colors"
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-base shrink-0">
                f
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">
                  {conn.fb_page_name || conn.display_name || 'Facebook Page'}
                </p>
                <p className="text-[11px] text-slate-400 font-mono">
                  ID: {conn.fb_page_id || conn.external_channel_id}
                </p>
              </div>

              {/* Status */}
              <div className="shrink-0">
                <ConnectionStatus conn={conn} />
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 shrink-0">
                {/* Refresh */}
                <button
                  type="button"
                  onClick={() => handleRefresh(conn.id)}
                  disabled={refreshingId === conn.id}
                  title="Làm mới token"
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  <HiOutlineRefresh className={`w-4 h-4 ${refreshingId === conn.id ? 'animate-spin' : ''}`} />
                </button>

                {/* Open Meta */}
                {conn.fb_page_id && (
                  <a
                    href={`https://www.facebook.com/${conn.fb_page_id}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Mở Fanpage"
                    className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    <HiOutlineExternalLink className="w-4 h-4" />
                  </a>
                )}

                {/* Disconnect */}
                <button
                  type="button"
                  onClick={() => handleDelete(conn.id, conn.fb_page_name || conn.display_name)}
                  disabled={deletingId === conn.id}
                  title="Ngắt kết nối"
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  <HiOutlineTrash className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer tip */}
      {connections.length > 0 && (
        <p className="text-xs text-slate-400">
          Token Facebook có hiệu lực ~60 ngày. Bấm nút{' '}
          <HiOutlineRefresh className="inline w-3 h-3" />{' '}
          để làm mới trước khi hết hạn.
        </p>
      )}
    </div>
  );
}
