import { useCallback, useEffect, useState } from 'react';
import {
  HiOutlineLink,
  HiOutlineTrash,
  HiOutlineRefresh,
  HiOutlineExclamation,
  HiOutlineCheckCircle,
  HiOutlineGlobeAlt,
} from 'react-icons/hi';
import PageContainer from '../../components/common/PageContainer';
import toast from 'react-hot-toast';
import tiktokBusinessApiService from '../../features/settings/services/tiktokBusinessApi.service';
import { useI18n } from '../../i18n';

/**
 * Status pill cho 1 tài khoản TikTok Business.
 * - is_active=false → "Đã ngắt"
 * - access_token_expires_at < now → "Token hết hạn"
 * - sắp hết hạn ≤ 24h → "Hết hạn trong X giờ"
 * - còn lại → "Đã kết nối"
 */
function AccountStatus({ account }) {
  const { t } = useI18n();
  if (!account.is_active) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-700">
        <span className="h-1.5 w-1.5 rounded-full bg-gray-500" />
        {t('tiktokBusiness.status.disconnected', 'Đã ngắt')}
      </span>
    );
  }

  const expiresAt = account.access_token_expires_at
    ? new Date(account.access_token_expires_at)
    : null;
  const now = new Date();
  const hoursUntilExpiry = expiresAt
    ? Math.ceil((expiresAt - now) / (1000 * 60 * 60))
    : null;

  if (hoursUntilExpiry !== null && hoursUntilExpiry <= 0) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
        <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
        {t('tiktokBusiness.status.expired', 'Token hết hạn')}
      </span>
    );
  }
  if (hoursUntilExpiry !== null && hoursUntilExpiry <= 24) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        {t('tiktokBusiness.status.expiringSoon', `Hết hạn trong ${hoursUntilExpiry} giờ`)}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-[11px] font-medium text-green-700">
      <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
      {t('tiktokBusiness.status.connected', 'Đã kết nối')}
    </span>
  );
}

/**
 * Notice khi BE trả về lỗi OAuth (Bẫy 14/15/16).
 * - region_unsupported (Bẫy 14) → hướng dẫn region
 * - personal_account (Bẫy 16) → hướng dẫn switch
 * - check_dm_privacy (Bẫy 15) → hint DM = Everyone
 */
function OAuthErrorNotice({ errorCode, reason }) {
  const { t } = useI18n();
  if (!errorCode) return null;

  if (errorCode === 'region_unsupported') {
    return (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
        <p className="flex items-center gap-2 font-semibold">
          <HiOutlineExclamation className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t('tiktokBusiness.errors.regionUnsupported.title', 'Region chưa hỗ trợ')}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-red-800">
          {t('tiktokBusiness.errors.regionUnsupported.hint',
            'TikTok Business Messaging hiện chỉ hỗ trợ APAC, LATAM, METAP, NA. EEA/CH/UK chưa được TikTok mở.',
            { reason })}
        </p>
      </div>
    );
  }

  if (errorCode === 'personal_account') {
    return (
      <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <p className="flex items-center gap-2 font-semibold">
          <HiOutlineExclamation className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t('tiktokBusiness.errors.personalAccount.title', 'Cần tài khoản Business')}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-amber-800">
          {t('tiktokBusiness.errors.personalAccount.hint',
            'TikTok Business Messaging chỉ hoạt động với Business Account. Mở TikTok app > Settings > Account > Switch to Business Account.')}
        </p>
      </div>
    );
  }

  if (errorCode === 'check_dm_privacy') {
    return (
      <div role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <p className="flex items-center gap-2 font-semibold">
          <HiOutlineCheckCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t('tiktokBusiness.hints.dmPrivacy.title', 'Đã kết nối! Kiểm tra DM Privacy')}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-blue-800">
          {t('tiktokBusiness.hints.dmPrivacy.hint',
            'Để user có thể nhắn cho bạn: TikTok app > Settings > Privacy > Direct Messages > chọn "Everyone". Nếu để "Friends", API sẽ không nhận được tin.')}
        </p>
      </div>
    );
  }

  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
      <p className="flex items-center gap-2 font-semibold">
        <HiOutlineExclamation className="h-4 w-4 shrink-0" aria-hidden="true" />
        {t('tiktokBusiness.errors.generic', 'Có lỗi khi kết nối TikTok')}
      </p>
      {reason ? <p className="mt-1 text-xs text-red-800">{reason}</p> : null}
    </div>
  );
}

export default function TiktokBusinessSettings() {
  const { t } = useI18n();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  // Disable nút "Kết nối" trong khi chờ axios lấy `auth_url` rồi navigate —
  // tránh user bấm đúp khi request đang bay.
  const [connecting, setConnecting] = useState(false);
  // Đọc ?error / ?success / ?hint từ URL (set bởi BE OAuth callback redirect).
  const [oauthError, setOauthError] = useState(null);
  const [oauthHint, setOauthHint] = useState(null);
  // Set khi URL có ?success=connected nhưng hiện không render trực tiếp — để
  // tương lai có thể trigger toast hoặc analytics. Giữ lại để không vỡ test.
  const [_oauthSuccess, setOauthSuccess] = useState(false);

  const loadAccounts = useCallback(async () => {
    try {
      const res = await tiktokBusinessApiService.listAccounts();
      const list = res?.data?.data;
      setAccounts(Array.isArray(list) ? list : []);
    } catch (err) {
      console.warn('[TiktokBusinessSettings] listAccounts:', err.message);
      setAccounts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Read OAuth callback params from URL
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const error = params.get('error');
    const hint = params.get('hint');
    const success = params.get('success');
    const reason = params.get('reason');
    if (error) setOauthError({ code: error, reason });
    if (hint === 'check_dm_privacy') setOauthHint('check_dm_privacy');
    if (success === 'connected') setOauthSuccess(true);
    // Clear URL params sau khi đọc
    if (error || hint || success) {
      const url = new URL(window.location.href);
      url.searchParams.delete('error');
      url.searchParams.delete('reason');
      url.searchParams.delete('hint');
      url.searchParams.delete('success');
      url.searchParams.delete('account_id');
      window.history.replaceState({}, '', url.toString());
    }
    loadAccounts();
  }, [loadAccounts]);

  const handleConnect = async () => {
    // Phải gọi qua axios thay vì window.location.href thẳng tới endpoint:
    // FE lưu access token trong localStorage (xem `frontend/src/services/api.js`
    // `getStoredToken('accessToken')`), và axios interceptor tự gắn
    // `Authorization: Bearer ...`. Khi navigate bằng `window.location.href`,
    // browser KHÔNG gửi header đó (chỉ gửi khi qua fetch/axios) →
    // authMiddleware ở BE trả 401 "Không tìm thấy token xác thực".
    //
    // Sau khi axios lấy `{ auth_url }` từ BE controller, ta TỰ navigate
    // tới TikTok authorize URL (cross-origin) — bước này không cần Bearer.
    try {
      setConnecting(true);
      const { redirectUrl } = await tiktokBusinessApiService.startConnect();
      if (!redirectUrl) {
        toast.error(t('tiktokBusiness.toast.connectMissingUrl', 'BE không trả URL kết nối — liên hệ hỗ trợ.'));
        return;
      }
      window.location.href = redirectUrl;
    } catch (err) {
      // Lỗi 401 ở đây nghĩa là access token trong storage không hợp lệ (hết
      // hạn / bị xoá). api.js đã TỰ refresh token và retry — nếu vẫn fail là
      // refresh token cũng hỏng → buộc logout. Tránh hiển thị "Đã xảy ra lỗi"
      // chung chung vì sẽ khiến user bấm lại vô ích.
      const status = err?.response?.status;
      if (status === 401) {
        toast.error(t('tiktokBusiness.toast.sessionExpired', 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'));
      } else {
        toast.error(err?.response?.data?.message || err.message);
      }
    } finally {
      setConnecting(false);
    }
  };

  const handleRefresh = async (id) => {
    setRefreshingId(id);
    try {
      await tiktokBusinessApiService.refreshAccount(id);
      toast.success(t('tiktokBusiness.toast.refreshed', 'Đã làm mới token.'));
      await loadAccounts();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message);
    } finally {
      setRefreshingId(null);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm(t('tiktokBusiness.confirmDelete', 'Ngắt kết nối tài khoản TikTok này?'))) {
      return;
    }
    setDeletingId(id);
    try {
      await tiktokBusinessApiService.deleteAccount(id);
      toast.success(t('tiktokBusiness.toast.disconnected', 'Đã ngắt kết nối.'));
      await loadAccounts();
    } catch (err) {
      toast.error(err.response?.data?.message || err.message);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <PageContainer>
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {t('tiktokBusiness.title', 'TikTok Business')}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {t('tiktokBusiness.subtitle',
                'Kết nối tài khoản TikTok Business để chatbot tự động trả lời tin nhắn DM.')}
            </p>
          </div>
          <button
            type="button"
            onClick={handleConnect}
            disabled={connecting}
            className="inline-flex items-center gap-2 rounded-xl bg-pink-600 px-4 py-2 text-sm font-semibold text-white hover:bg-pink-700 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            <HiOutlineLink className="h-4 w-4" aria-hidden="true" />
            {connecting
              ? t('tiktokBusiness.connecting', 'Đang chuyển hướng...')
              : t('tiktokBusiness.connect', 'Kết nối TikTok Business')}
          </button>
        </div>

        {/* OAuth error notice (Bẫy 14, 15, 16) */}
        {oauthError && <OAuthErrorNotice errorCode={oauthError.code} reason={oauthError.reason} />}
        {!oauthError && oauthHint === 'check_dm_privacy' && (
          <OAuthErrorNotice errorCode="check_dm_privacy" />
        )}

        {/* Region notice (Bẫy 14) */}
        <div className="rounded-xl border border-pink-200 bg-pink-50 px-4 py-3 text-sm text-pink-900">
          <p className="flex items-center gap-2 font-semibold">
            <HiOutlineGlobeAlt className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('tiktokBusiness.regions.title', 'Region hỗ trợ')}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-pink-800">
            {t('tiktokBusiness.regions.hint',
              'TikTok Business Messaging hiện chỉ hỗ trợ APAC, LATAM, METAP, NA. EEA / CH / UK chưa được TikTok mở.')}
          </p>
        </div>

        {/* Rate limit notice (Bẫy 3 plan) */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="flex items-center gap-2 font-semibold">
            <HiOutlineExclamation className="h-4 w-4 shrink-0" aria-hidden="true" />
            {t('tiktokBusiness.rateLimit.title', 'Giới hạn gửi tự động')}
          </p>
          <p className="mt-1 text-xs leading-relaxed">
            {t('tiktokBusiness.rateLimit.hint',
              'TikTok giới hạn tối đa 10 tin tự động trong 48 giờ sau lần user cuối cùng reply. Sau đó chỉ gửi được 3 tin cuối. Sau 48h không reply, khung cửa sổ được reset.')}
          </p>
        </div>

        {/* Accounts list */}
        {loading ? (
          <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
            {t('common.loading', 'Đang tải...')}
          </div>
        ) : accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center">
            <p className="text-sm text-gray-600">
              {t('tiktokBusiness.empty',
                'Chưa có tài khoản TikTok Business nào. Bấm "Kết nối" để bắt đầu.')}
            </p>
          </div>
        ) : (
          <ul className="space-y-2.5">
            {accounts.map((acc) => (
              <li
                key={acc.id}
                className="rounded-xl border border-gray-200 bg-white p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">
                        {acc.display_name || acc.business_id}
                      </h3>
                      <AccountStatus account={acc} />
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 truncate">
                      Business ID: <code className="bg-gray-100 px-1.5 py-0.5 rounded">{acc.business_id}</code>
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Region: <span className="font-medium">{acc.region || '—'}</span>
                      {' · '}
                      Role: <span className="font-medium">{acc.role || '—'}</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRefresh(acc.id)}
                      disabled={refreshingId === acc.id || !acc.is_active}
                      className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                    >
                      <HiOutlineRefresh className="h-3.5 w-3.5" aria-hidden="true" />
                      {refreshingId === acc.id
                        ? t('common.processing', 'Đang xử lý...')
                        : t('tiktokBusiness.action.refresh', 'Làm mới')}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(acc.id)}
                      disabled={deletingId === acc.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <HiOutlineTrash className="h-3.5 w-3.5" aria-hidden="true" />
                      {deletingId === acc.id
                        ? t('common.deleting', 'Đang xóa...')
                        : t('tiktokBusiness.action.delete', 'Ngắt')}
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </PageContainer>
  );
}
