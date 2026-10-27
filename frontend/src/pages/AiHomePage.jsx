import AiChatbot from '../features/ai/AiChatbot';
import WorkspaceNoPermissionsCard from '../components/layout/WorkspaceNoPermissionsCard';
import WorkspaceNoAiAssistantCard from '../components/layout/WorkspaceNoAiAssistantCard';
import GettingStartedCard from '../features/dashboard/components/GettingStartedCard';
import { useAuthStore } from '../stores/authStore';
import {
  isEmployeeWithoutAiAssistant,
  isEmployeeWithoutPermissions,
  isEmployeeWorkspace,
} from '../utils/workspacePermissions.util';

/**
 * Trang chủ dashboard — màn hình chat AI full-width kiểu ChatGPT.
 * Nhân viên vào không gian công ty mà chủ chưa cấp quyền nào thì thấy thẻ hướng dẫn thay cho khung chat
 * (khung chat sẽ trả 403 và không nói vì sao). Có quyền khác nhưng thiếu quyền "Sử dụng Trợ lý AI" cũng
 * vậy: thấy thẻ chỉ sang menu bên trái, vì đổi không gian xong là được đưa về đúng trang này.
 * Chủ tài khoản (KHÔNG phải ngữ cảnh nhân viên) thấy thêm thẻ "3 bước bắt đầu" phía trên khung chat, cho tới khi xong cả
 * ba bước hoặc bấm Ẩn — API của thẻ chỉ dành cho chủ nên nhân viên không bao giờ gọi tới.
 */
const AiHomePage = () => {
  const activeContext = useAuthStore((state) => state.activeContext);

  if (isEmployeeWithoutPermissions(activeContext)) {
    return (
      <div className="h-full min-h-0 flex flex-col bg-gray-50 dark:bg-dk-surface">
        <WorkspaceNoPermissionsCard />
      </div>
    );
  }

  if (isEmployeeWithoutAiAssistant(activeContext)) {
    return (
      <div className="h-full min-h-0 flex flex-col bg-gray-50 dark:bg-dk-surface">
        <WorkspaceNoAiAssistantCard />
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-gray-50 dark:bg-dk-surface">
      {!isEmployeeWorkspace(activeContext) && <GettingStartedCard />}
      <AiChatbot variant="fullscreen" isOpen />
    </div>
  );
};

export default AiHomePage;
