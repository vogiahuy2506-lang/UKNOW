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
 */
export default function PageHeader({ icon: Icon, title, subtitle, actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2.5">
          {Icon && <Icon className="w-7 h-7 text-orange-500 shrink-0" aria-hidden="true" />}
          <span>{title}</span>
        </h1>
        {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
