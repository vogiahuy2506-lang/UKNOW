import { HiOutlineArrowLeft } from 'react-icons/hi';

/**
 * Tiêu đề trang dùng chung — thay cho 37 trang tự viết `text-2xl font-bold text-gray-900`.
 * Biểu tượng cam + tiêu đề + một dòng mô tả; nút hành động chính nằm bên phải, xuống dòng
 * khi màn hình hẹp. Xem `_internal/PLAN_THIET_KE_LAI_TRANG_DOI_TAC_VA_KHUON_CHUNG_2026-09-15.md`.
 *
 * @param {object} props
 * @param {React.ComponentType} [props.icon] - component icon (ví dụ từ react-icons), tự thêm class màu/kích thước
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.subtitle]
 * @param {React.ReactNode} [props.actions] - nút/khối hành động, đặt bên phải
 * @param {() => void} [props.onBack] - callback khi bấm nút quay lại
 * @param {string} [props.backLabel] - nhãn (aria-label) nút quay lại; trang truyền `t(...)` để theo ngôn ngữ,
 *   mặc định tiếng Việt. Không gọi `useI18n` ở đây để component dùng được ngoài I18nProvider.
 */
export default function PageHeader({ icon: Icon, title, subtitle, actions, onBack, backLabel = 'Quay lại' }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="min-w-0 flex items-center gap-3.5">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors shrink-0"
            aria-label={backLabel}
          >
            <HiOutlineArrowLeft className="w-5 h-5" />
          </button>
        )}
        {Icon && (
          <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-md shadow-orange-500/20 shrink-0">
            <Icon className="w-6 h-6 text-white text-orange-500" aria-hidden="true" />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900">
            {title}
          </h1>
          {subtitle && (
            typeof subtitle === 'string' ? (
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">{subtitle}</p>
            ) : (
              <div className="text-xs sm:text-sm text-slate-500 mt-0.5">{subtitle}</div>
            )
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
    </div>
  );
}
