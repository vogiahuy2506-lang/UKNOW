import { HiOutlineRefresh } from 'react-icons/hi';
import { useI18n } from '../../i18n';

/**
 * Nút đầu trang dùng chung cho 5 tab Cài đặt kênh (Email, Facebook, Zalo, WhatsApp, Telegram).
 *
 * Trước đây mỗi tab tự viết một kiểu: "Làm mới" lúc `rounded-xl text-xs`, lúc `rounded-lg text-sm`,
 * nút chính lúc cam lúc tím, lúc `font-bold` lúc `font-semibold`. Một nơi định nghĩa kích thước,
 * độ đậm, bo góc và màu để các tab không trôi lệch nhau nữa. Chuẩn theo trang Email.
 *
 * Dùng bên trong `actions` của PageHeader / PageContainer:
 *
 *   <HeaderActions>
 *     <RefreshButton onClick={refresh} loading={isRefreshing} />
 *     <PrimaryActionButton icon={HiOutlineQrcode} onClick={scan}>Quét QR</PrimaryActionButton>
 *   </HeaderActions>
 */

/** Khối bọc hai nút; xuống dòng gọn khi màn hình hẹp. */
export function HeaderActions({ children }) {
  return <div className="flex flex-wrap items-center gap-2 sm:gap-3">{children}</div>;
}

/**
 * Nút "Làm mới" (viền, nền trắng). Khi `loading` chỉ icon quay, nhãn giữ nguyên để nút không đổi
 * bề rộng. Mọi prop còn lại (title, aria-*, ...) chuyển thẳng xuống thẻ `<button>`.
 *
 * @param {object} props
 * @param {() => void} [props.onClick]
 * @param {boolean} [props.loading] - đang tải: icon quay và khoá nút
 * @param {boolean} [props.disabled]
 * @param {React.ReactNode} [props.label] - mặc định `t('common.refresh')`
 */
export function RefreshButton({ onClick, loading = false, disabled = false, label, ...rest }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-dk-border bg-white dark:bg-dk-surface px-3 py-2 text-sm font-medium text-slate-700 dark:text-dk-text transition hover:border-primary-200 dark:hover:border-primary-700 hover:text-primary-700 dark:hover:text-primary-300 disabled:cursor-not-allowed disabled:opacity-60"
      {...rest}
    >
      <HiOutlineRefresh className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
      {label ?? t('common.refresh')}
    </button>
  );
}

/**
 * Nút hành động chính (nền cam). `icon` là component icon (react-icons), vẽ cỡ 4x4 bên trái nhãn.
 * Có viền 1px trong suốt để CAO BẰNG nút Làm mới (nút Làm mới có viền thật; thiếu viền này nút chính thấp hơn 2px).
 * Mọi prop còn lại (onClick, disabled, title, ...) chuyển thẳng xuống thẻ `<button>`.
 *
 * @param {object} props
 * @param {React.ComponentType<{className?: string}>} [props.icon]
 * @param {React.ReactNode} props.children - nhãn
 */
export function PrimaryActionButton({ icon: Icon, children, ...rest }) {
  return (
    <button
      type="button"
      className="inline-flex items-center gap-2 rounded-lg border border-transparent bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
      {...rest}
    >
      {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
      {children}
    </button>
  );
}
