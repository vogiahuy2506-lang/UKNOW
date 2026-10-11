import { HiOutlineSun, HiOutlineMoon } from 'react-icons/hi';
import { useThemeStore } from '../../stores/themeStore';
import { useI18n } from '../../i18n';

/**
 * Nút đổi giao diện sáng / tối — dùng chung cho thanh trên của app (`layout/admin/Header`) và các
 * thanh điều hướng công khai (HeroNavbar, AuthLayout, DocsLayout, PolicyLayout...).
 *
 * `variant`:
 *  - `default`: nền theo giao diện hiện tại (thanh trắng khi sáng, thanh dk-* khi tối).
 *  - `onDark`: đặt trên nền LUÔN tối (panel trái AuthLayout phủ trên video) — chữ/hover sáng cố định.
 *
 * Trong `themeStore`, `applyThemeToDocument` chỉ gắn `html.dark` ở đường dẫn thuộc phạm vi tối; nút này chỉ
 * xuất hiện ở những trang như vậy.
 */
const VARIANT_CLASS = {
  default:
    'text-gray-500 hover:text-gray-900 hover:bg-gray-100 dark:text-dk-text dark:hover:text-amber-400 dark:hover:bg-dk-raised',
  onDark: 'text-slate-300 hover:text-white hover:bg-white/15',
};

export default function ThemeToggleButton({ className = '', variant = 'default' }) {
  const { t } = useI18n();
  const { isDark, toggleTheme } = useThemeStore();
  const label = isDark ? t('header.switchToLight') : t('header.switchToDark');
  const variantClass = VARIANT_CLASS[variant] || VARIANT_CLASS.default;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={label}
      aria-label={label}
      className={`inline-flex items-center justify-center w-8 h-8 rounded-lg transition-colors shrink-0 ${variantClass} ${className}`.trim()}
    >
      {isDark ? (
        <HiOutlineSun className="w-4 h-4 text-amber-400 transition-transform hover:rotate-45" />
      ) : (
        <HiOutlineMoon className={`w-4 h-4 transition-transform hover:-rotate-12 ${variant === 'onDark' ? 'text-slate-300' : 'text-slate-600'}`} />
      )}
    </button>
  );
}
