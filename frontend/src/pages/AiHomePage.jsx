import AiChatbot from '../features/ai/AiChatbot';
import WorkspaceNoPermissionsCard from '../components/layout/WorkspaceNoPermissionsCard';
import { useAuthStore } from '../stores/authStore';
import { isEmployeeWithoutPermissions } from '../utils/workspacePermissions.util';

/**
 * Trang chủ dashboard — màn hình chat AI full-width kiểu ChatGPT.
 * Nhân viên vào không gian công ty mà chủ chưa cấp quyền nào thì thấy thẻ hướng dẫn thay cho khung chat
 * (khung chat sẽ trả 403 và không nói vì sao).
 */
const AiHomePage = () => {
  const activeContext = useAuthStore((state) => state.activeContext);

  if (isEmployeeWithoutPermissions(activeContext)) {
    return (
      <div className="h-full min-h-0 flex flex-col bg-gray-50">
        <WorkspaceNoPermissionsCard />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-gray-50">
      <AiChatbot variant="fullscreen" isOpen />
    </div>
  );
};

export default AiHomePage;
