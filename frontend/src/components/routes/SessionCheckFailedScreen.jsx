import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineRefresh } from 'react-icons/hi';
import { useAuthStore } from '../../stores/authStore';
import { useI18n } from '../../i18n';

/**
 * Màn "Không kiểm tra được phiên đăng nhập" — cổng route (ProtectedRoute, AdminRoute) hiện nó thay vì đá ra
 * /login khi `initialize()` hết lượt thử lại mà /auth/me vẫn lỗi TẠM THỜI (429/5xx/mất mạng) và máy còn token.
 * Người dùng chưa bị đăng xuất: bấm "Thử lại" để kiểm tra phiên lần nữa, hoặc chủ động "Đăng nhập lại".
 *
 * Hiện trong /app và /admin nên CÓ lớp tối (token dk-*); không đặt ở pages/auth vì thư mục đó là bề mặt
 * công khai luôn sáng (chốt noDarkVariants luật 3).
 */
const SessionCheckFailedScreen = () => {
  const { t } = useI18n();
  const retrySessionCheck = useAuthStore((state) => state.retrySessionCheck);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();
  // 'retry' | 'logout' | null — một thao tác tại một thời điểm; cả hai nút khoá khi một thao tác đang chạy.
  const [pending, setPending] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleRetry = async () => {
    if (pending) return;
    setPending('retry');
    try {
      await retrySessionCheck();
    } finally {
      // Thành công → cổng đã gỡ màn này khỏi cây, không còn gì để cập nhật.
      if (mountedRef.current) setPending(null);
    }
  };

  const handleRelogin = async () => {
    if (pending) return;
    setPending('logout');
    try {
      await logout();
    } finally {
      if (mountedRef.current) setPending(null);
    }
    navigate('/login');
  };

  const isRetrying = pending === 'retry';

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-dk-bg px-4">
      <div
        role="alert"
        className="w-full max-w-md rounded-2xl border border-gray-200 dark:border-dk-border bg-white dark:bg-dk-surface p-8 text-center shadow-sm"
      >
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-amber-50 dark:bg-dk-raised">
          <HiOutlineRefresh className={`h-7 w-7 text-amber-500 ${isRetrying ? 'animate-spin' : ''}`} />
        </div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-dk-text">{t('sessionCheck.title')}</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-600 dark:text-dk-text2">{t('sessionCheck.description')}</p>

        <button
          type="button"
          onClick={handleRetry}
          disabled={Boolean(pending)}
          aria-busy={isRetrying}
          className="btn btn-primary mt-6 w-full disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isRetrying ? t('sessionCheck.retrying') : t('sessionCheck.retry')}
        </button>
        <button
          type="button"
          onClick={handleRelogin}
          disabled={Boolean(pending)}
          className="mt-4 text-sm font-medium text-gray-500 dark:text-dk-text2 hover:text-gray-700 dark:hover:text-dk-text hover:underline disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {t('sessionCheck.relogin')}
        </button>
      </div>
    </div>
  );
};

export default SessionCheckFailedScreen;
