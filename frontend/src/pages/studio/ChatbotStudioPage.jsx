import { useState, useEffect } from 'react';
import ChatListSidebar from './ChatListSidebar';
import ChatMessageArea from './ChatMessageArea';
import ChatbotSettings from './ChatbotSettings';

function ChatbotStudioPage() {
  const [selectedBot, setSelectedBot] = useState(null);
  const [bots, setBots] = useState([]);

  const handleSelectBot = (bot) => {
    setSelectedBot(bot);
  };

  const handleUpdateBot = (updatedBot) => {
    setSelectedBot(updatedBot);
    setBots(prev => prev.map(b => b.id === updatedBot.id ? updatedBot : b));
  };

  const handleCreateNew = () => {
    // This is triggered from sidebar, handled there
  };

  return (
    <div className="h-full flex bg-slate-50">
      {/* Left Sidebar - Bot List */}
      <ChatListSidebar
        selectedBot={selectedBot}
        onSelectBot={handleSelectBot}
        onCreateNew={handleCreateNew}
      />

      {/* Center - Chat Area */}
      <ChatMessageArea
        key={`chat-${selectedBot?.id}`}
        chatbot={selectedBot}
        onUpdate={handleUpdateBot}
      />

      {/* Right Panel - Settings */}
      <ChatbotSettings
        key={`settings-${selectedBot?.id}`}
        chatbot={selectedBot}
        onUpdate={handleUpdateBot}
      />
    </div>
  );
}

export default ChatbotStudioPage;
