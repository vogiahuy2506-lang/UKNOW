import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { HiCheck, HiChevronRight } from 'react-icons/hi';
import { useI18n } from '../../../i18n';
import { useAuthStore } from '../../../stores/authStore';
import dashboardApiService from '../services/dashboardApi.service';
import {
  gettingStartedDismissedKey,
  gettingStartedDoneKey,
  readFlag,
  writeFlag,
} from '../utils/gettingStartedStorage.util';

/**
 * Ba bước, theo thứ tự khách nên làm. `key` = cờ do `GET /dashboard/getting-started` trả về.
 * Bước 1 mở thẳng thẻ Zalo của Quản lý kênh (ChannelSettings đọc `#zalo`; mặc định là thẻ email).
 */
const STEPS = [
  { key: 'channelConnected', to: '/app/settings/channels#zalo' },
  { key: 'hasCustomers', to: '/app/customers' },
  { key: 'hasSentMessage', to: '/app/campaigns/simple' },
];

const isValidStatus = (data) => Boolean(data) && STEPS.every(({ key }) => typeof data[key] === 'boolean');

/**
 * Thẻ "3 bước bắt đầu" ở trang chủ (PLAN_ONBOARDING_ZALO_VA_THE_3_BUOC_2026-10-27): 41 người đăng ký trong 30 ngày, 39 đăng
 * nhập, chỉ 7 thêm được nick Zalo, 2 chạy chiến dịch — người mới không biết còn thiếu gì. Thẻ chỉ ra bước kế tiếp.
 *
 * - CHỈ cho chủ tài khoản: nơi gắn (AiHomePage) không vẽ thẻ trong ngữ cảnh nhân viên — API cũng trả 403 cho họ.
 * - Đang tải / lỗi / dữ liệu lạ → KHÔNG vẽ gì (không bao giờ chặn khung chat bên dưới).
 * - Đủ 3/3 → không vẽ và ghi cờ `done` theo user; lần sau thấy cờ thì không gọi API. Bấm "Ẩn" ghi cờ `dismissed`, cũng vậy.
 */
const GettingStartedCard = () => {
  const { t } = useI18n();
  const userId = useAuthStore((state) => state.user?.id);
  const [status, setStatus] = useState(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!userId) return undefined;
    if (readFlag(gettingStartedDoneKey(userId)) || readFlag(gettingStartedDismissedKey(userId))) return undefined;

    let cancelled = false;
    (async () => {
      try {
        const response = await dashboardApiService.getGettingStarted();
        const data = response?.data?.data;
        if (cancelled || !isValidStatus(data)) return;
        if (STEPS.every(({ key }) => data[key])) {
          writeFlag(gettingStartedDoneKey(userId));
          return;
        }
        setStatus(data);
      } catch {
        // Lỗi mạng / 403 / 404 (backend chưa có route) → không vẽ thẻ, khung chat vẫn dùng bình thường.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (!status || dismissed) return null;

  const doneCount = STEPS.filter(({ key }) => status[key]).length;
  const labels = [t('gettingStarted.step1'), t('gettingStarted.step2'), t('gettingStarted.step3')];

  const handleDismiss = () => {
    writeFlag(gettingStartedDismissedKey(userId));
    setDismissed(true);
  };

  return (
    <section
      data-testid="getting-started-card"
      aria-label={t('gettingStarted.title')}
      className="flex-shrink-0 px-3 sm:px-4 pt-3 bg-gray-50 dark:bg-dk-surface"
    >
      <div className="max-w-3xl mx-auto w-full rounded-xl border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-raised px-3 py-2 sm:px-4 sm:py-2.5 shadow-2xs">
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 truncate text-sm font-bold text-slate-900 dark:text-dk-text">{t('gettingStarted.title')}</h2>
          <span
            data-testid="getting-started-progress"
            className="flex-shrink-0 rounded-full border border-orange-200/80 dark:border-orange-800 bg-orange-50 dark:bg-orange-950/40 px-2 py-0.5 text-xs font-semibold text-orange-700 dark:text-orange-300"
          >
            {t('gettingStarted.progress', { done: doneCount, total: STEPS.length })}
          </span>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label={t('gettingStarted.dismissLabel')}
            className="ml-auto flex-shrink-0 rounded-md px-2 py-1 text-xs font-medium text-slate-500 dark:text-dk-text2 hover:bg-slate-100 dark:hover:bg-dk-strong hover:text-slate-700 dark:hover:text-dk-text transition-colors"
          >
            {t('gettingStarted.dismiss')}
          </button>
        </div>
        <ol className="mt-1.5 flex flex-col sm:flex-row sm:gap-2">
          {STEPS.map(({ key, to }, index) => {
            const isDone = status[key] === true;
            return (
              <li key={key} data-testid={`getting-started-step-${index + 1}`} data-done={isDone ? 'true' : 'false'} className="min-w-0 sm:flex-1">
                {isDone ? (
                  <div className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm text-slate-500 dark:text-dk-muted">
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                      <HiCheck className="w-3.5 h-3.5" aria-hidden="true" />
                    </span>
                    <span className="truncate">{labels[index]}</span>
                    <span className="sr-only">{t('gettingStarted.done')}</span>
                  </div>
                ) : (
                  <Link
                    to={to}
                    className="flex items-center gap-2 rounded-lg px-2 py-1 text-sm font-medium text-slate-700 dark:text-dk-text hover:bg-orange-50 dark:hover:bg-orange-950/30 transition-colors"
                  >
                    <span className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border border-slate-300 dark:border-dk-border text-xs font-bold text-slate-500 dark:text-dk-text2">
                      {index + 1}
                    </span>
                    <span className="truncate">{labels[index]}</span>
                    <HiChevronRight className="ml-auto w-4 h-4 flex-shrink-0 text-slate-400 dark:text-dk-muted" aria-hidden="true" />
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
};

export default GettingStartedCard;
