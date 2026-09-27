import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { HiOutlineClock, HiOutlineX } from 'react-icons/hi';
import { useI18n } from '../../i18n';
import { useAuthStore } from '../../stores/authStore';
import { getExpiringTopupItems } from '../../services/topup.service';

const todayKey = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const dismissKey = () => `founder_ai_topup_expiring_dismissed:${todayKey()}`;

// Đọc/ghi localStorage đều bọc try/catch — lỗi (storage bị chặn/đầy) thì coi như CHƯA tắt, dải vẫn hiện.
const isDismissedToday = () => {
  try {
    return window.localStorage.getItem(dismissKey()) === '1';
  } catch {
    return false;
  }
};
const rememberDismissedToday = () => {
  try {
    window.localStorage.setItem(dismissKey(), '1');
  } catch {
    /* bỏ qua — không nhớ được thì lần sau lại hiện, không sao */
  }
};

const formatDayMonth = (date) => new Date(date).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });

/**
 * Dải mảnh nhắc TRONG APP khi có món mua thêm (slot cấu trúc, gồm cả dung lượng) sắp hết hạn trong
 * 7 ngày — trước đây chỉ có email, khách không mở email hoặc thư vào spam thì không biết. Cùng vị
 * trí/điều kiện hiển thị với CreditWarningBanner ở MainLayout. Chỉ chủ tài khoản thấy (nhân viên
 * không gọi API — backend cũng chặn OWNER_ONLY nhưng chặn sớm ở FE cho gọn).
 */
const TopupExpiringBanner = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const activeContext = useAuthStore((state) => state.activeContext);
  const isEmployeeCtx = activeContext?.type === 'employee';
  const [items, setItems] = useState([]);
  const [dismissed, setDismissed] = useState(() => isDismissedToday());

  useEffect(() => {
    if (isEmployeeCtx) return;
    let cancelled = false;
    getExpiringTopupItems()
      .then((res) => {
        if (cancelled) return;
        setItems(Array.isArray(res.data?.result?.items) ? res.data.result.items : []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [isEmployeeCtx]);

  if (isEmployeeCtx || dismissed || items.length === 0) return null;

  const list = items
    .map((item) => t(`topupExpiringBanner.item.${item.itemKey}`, { qty: item.qty }))
    .join(', ');
  const earliestDate = formatDayMonth(items[0].cycleEnd);

  const handleDismiss = () => {
    rememberDismissedToday();
    setDismissed(true);
  };

  return (
    <div
      role="status"
      data-testid="topup-expiring-banner"
      className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900"
    >
      <div className="flex min-w-0 items-center gap-2">
        <HiOutlineClock className="h-5 w-5 shrink-0 text-amber-500" />
        <span className="min-w-0">
          {t('topupExpiringBanner.message', { list, date: earliestDate })}
          {' — '}
          <button
            type="button"
            onClick={() => navigate('/app/topup')}
            className="font-semibold text-amber-800 underline hover:text-amber-900"
          >
            {t('topupExpiringBanner.renewCta')}
          </button>
        </span>
      </div>
      <button
        type="button"
        onClick={handleDismiss}
        className="shrink-0 rounded p-1 text-amber-700 transition-colors hover:bg-amber-100 hover:text-amber-900"
        aria-label={t('topupExpiringBanner.dismiss')}
      >
        <HiOutlineX className="h-4 w-4" />
      </button>
    </div>
  );
};

export default TopupExpiringBanner;
