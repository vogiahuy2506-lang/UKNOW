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
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
      <div className="min-w-0 flex items-start gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="p-1.5 -ml-1 mt-0.5 rounded-xl text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors shrink-0"
            aria-label={backLabel}
          >
            <HiOutlineArrowLeft className="w-5 h-5" />
          </button>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5 flex-wrap">
            {Icon && <Icon className="w-7 h-7 text-orange-500 shrink-0" aria-hidden="true" />}
            {title}
          </h1>
          {subtitle && (
            typeof subtitle === 'string' ? (
              <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
            ) : (
              <div className="text-sm text-gray-500 mt-1">{subtitle}</div>
            )
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap shrink-0">{actions}</div>}
    </div>
  );
}
