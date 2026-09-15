import { HiOutlineExclamation, HiOutlineInformationCircle, HiOutlineExclamationCircle } from 'react-icons/hi';

/**
 * Khung thông báo dùng chung — ba mức: info / warning / danger. Chữ đậm màu trên nền nhạt
 * CÙNG TÔNG (không dùng amber-200/300 cho chữ — không đủ tương phản trên nền sáng).
 * Chỉ hiện khi có việc cần làm; hết việc thì component gọi nó tự không render (điều kiện
 * nằm ở nơi gọi, ví dụ AffiliatePage chỉ render khi `pendingBuyersCount > 0`).
 *
 * @param {object} props
 * @param {'info'|'warning'|'danger'} [props.variant]
 * @param {React.ReactNode} props.title
 * @param {React.ReactNode} [props.children] - mô tả/nội dung phụ
 * @param {React.ReactNode} [props.action] - nút hành động, đặt bên phải khối tiêu đề
 */
const VARIANT_STYLES = {
  info: {
    wrap: 'bg-blue-50 border-blue-200',
    iconWrap: 'bg-blue-100 text-blue-700',
    title: 'text-blue-900',
    body: 'text-blue-800',
    Icon: HiOutlineInformationCircle,
  },
  warning: {
    wrap: 'bg-amber-50 border-amber-200',
    iconWrap: 'bg-amber-100 text-amber-700',
    title: 'text-amber-900',
    body: 'text-amber-800',
    Icon: HiOutlineExclamation,
  },
  danger: {
    wrap: 'bg-red-50 border-red-200',
    iconWrap: 'bg-red-100 text-red-700',
    title: 'text-red-900',
    body: 'text-red-800',
    Icon: HiOutlineExclamationCircle,
  },
};

export default function Notice({ variant = 'info', title, children, action }) {
  const styles = VARIANT_STYLES[variant] || VARIANT_STYLES.info;
  const { Icon } = styles;

  return (
    <div className={`rounded-xl border p-4 ${styles.wrap}`}>
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${styles.iconWrap}`}>
          <Icon className="w-5 h-5" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <h3 className={`text-sm font-semibold ${styles.title}`}>{title}</h3>
            {action && <div className="shrink-0">{action}</div>}
          </div>
          {children && <div className={`text-xs mt-1 leading-relaxed ${styles.body}`}>{children}</div>}
        </div>
      </div>
    </div>
  );
}
