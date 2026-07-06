import AiChatbot from '../features/ai/AiChatbot';

/**
 * Trang chủ dashboard — màn hình chat AI full-width kiểu ChatGPT.
 */
const AiHomePage = () => (
  <div className="h-full min-h-0 flex flex-col bg-gray-50">
    <AiChatbot variant="fullscreen" isOpen />
  </div>
);

export default AiHomePage;
