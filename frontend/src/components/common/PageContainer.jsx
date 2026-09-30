import PageHeader from './PageHeader';

/**
 * Khung trang dùng chung cho các màn hình trong /app.
 * Đồng bộ khoảng cách lề (spacing/padding) và tiêu đề trang (PageHeader),
 * giúp giao diện nhất quán, không bị sát viền hay co rút lề cục bộ.
 *
 * @param {object} props
 * @param {React.ComponentType} [props.icon] - Icon tiêu đề (react-icons/hi)
 * @param {React.ReactNode} [props.title] - Tiêu đề trang
 * @param {React.ReactNode} [props.subtitle] - Dòng mô tả trang
 * @param {React.ReactNode} [props.actions] - Khối nút hành động bên phải tiêu đề
 * @param {() => void} [props.onBack] - Hành động quay lại nếu có
 * @param {string} [props.backLabel] - Nhãn nút quay lại (truyền t(...) để theo ngôn ngữ)
 * @param {string} [props.className] - Class tùy biến thêm cho container ngoài
 * @param {React.ReactNode} props.children - Nội dung trang
 */
export default function PageContainer({
  icon,
  title,
  subtitle,
  actions,
  onBack,
  backLabel,
  className = '',
  children,
}) {
  const hasHeader = Boolean(title || icon || onBack);

  return (
    <div className={`space-y-6 ${className}`.trim()}>
      {hasHeader && (
        <PageHeader
          icon={icon}
          title={title}
          subtitle={subtitle}
          actions={actions}
          onBack={onBack}
          backLabel={backLabel}
        />
      )}
      {children}
    </div>
  );
}
