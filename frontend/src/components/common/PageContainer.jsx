import { createContext, useContext, useState } from 'react';
import { createPortal } from 'react-dom';
import PageHeader from './PageHeader';

export const PageHeaderActionsContext = createContext(undefined);

/**
 * Đưa các nút hành động của trang con / tab lên ngang hàng với tiêu đề PageHeader.
 * - Khi nằm trong PageContainer: teleport vào container actions của PageHeader.
 * - Khi nằm ngoài PageContainer (ví dụ test tab độc lập): render inline bình thường.
 */
export function PageHeaderActions({ children }) {
  const targetNode = useContext(PageHeaderActionsContext);
  if (targetNode === undefined) {
    return children;
  }
  if (targetNode) {
    return createPortal(children, targetNode);
  }
  return null;
}

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
  const [actionsNode, setActionsNode] = useState(null);
  const hasHeader = Boolean(title || icon || onBack);

  return (
    <PageHeaderActionsContext.Provider value={actionsNode}>
      <div className={`space-y-6 ${className}`.trim()}>
        {hasHeader && (
          <PageHeader
            icon={icon}
            title={title}
            subtitle={subtitle}
            actions={actions}
            actionsRef={setActionsNode}
            onBack={onBack}
            backLabel={backLabel}
          />
        )}
        {children}
      </div>
    </PageHeaderActionsContext.Provider>
  );
}
