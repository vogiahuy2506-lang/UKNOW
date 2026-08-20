import { HiOutlineCheck, HiOutlineChat } from 'react-icons/hi';

const ChatbotSelectCard = ({
  chatbot,
  isSelected = false,
  onClick,
  labels = {},
}) => {
  const defaultLabels = {
    hasKnowledgeBase: 'Có KB',
    noKnowledgeBase: 'Không KB',
    listed: 'Đã đăng',
    selectChatbot: 'Chọn chatbot này',
  };

  const l = { ...defaultLabels, ...labels };

  const handleClick = (e) => {
    e?.preventDefault();
    e?.stopPropagation();
    onClick?.(chatbot.id, e);
  };

  return (
    <div
      onClick={handleClick}
      className={`
        relative p-4 rounded-xl border-2 cursor-pointer transition-all duration-200
        ${isSelected
          ? 'border-orange-400 bg-orange-50 shadow-md'
          : 'border-gray-200 bg-white hover:border-orange-200 hover:shadow-md'
        }
        ${chatbot.isListed ? 'opacity-70' : ''}
      `}
    >
      {/* Selected indicator */}
      {isSelected && (
        <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center">
          <HiOutlineCheck className="w-4 h-4 text-white" />
        </div>
      )}

      {/* Listed badge */}
      {chatbot.isListed && (
        <div className="absolute top-3 left-3">
          <span className="px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-500">
            {l.listed}
          </span>
        </div>
      )}

      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="flex-shrink-0">
          {chatbot.avatar_url ? (
            <img
              src={chatbot.avatar_url}
              alt={chatbot.name}
              className="w-14 h-14 rounded-xl object-cover"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-100 to-purple-200 flex items-center justify-center">
              <HiOutlineChat className="w-7 h-7 text-purple-500" />
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          {/* Name */}
          <h3 className="font-semibold text-gray-900 line-clamp-1 mb-1">
            {chatbot.name || 'Untitled Chatbot'}
          </h3>

          {/* Description */}
          <p className="text-sm text-gray-500 line-clamp-2 mb-3">
            {chatbot.description || 'Không có mô tả'}
          </p>

          {/* Badges */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Knowledge base badge */}
            {chatbot.hasKnowledgeBase ? (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-700">
                {l.hasKnowledgeBase} ({chatbot.chunkCount})
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-500">
                {l.noKnowledgeBase}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Select button */}
      <button
        type="button"
        onClick={handleClick}
        disabled={chatbot.isListed}
        className={`
          w-full mt-3 py-2 px-4 rounded-lg text-sm font-medium transition-colors
          ${isSelected
            ? 'bg-orange-500 text-white hover:bg-orange-600'
            : chatbot.isListed
              ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
              : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
          }
        `}
      >
        {isSelected ? l.selectChatbot : chatbot.isListed ? l.listed : l.selectChatbot}
      </button>
    </div>
  );
};

export default ChatbotSelectCard;
