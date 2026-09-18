import {
  HiOutlineChat,
  HiOutlineCog,
  HiOutlineColorSwatch,
  HiOutlineSparkles,
  HiOutlineDocumentText,
} from 'react-icons/hi';

const ColorDot = ({ color }) => (
  <div 
    className="w-4 h-4 rounded-full border border-gray-200" 
    style={{ backgroundColor: color }}
  />
);

const ConfigItem = ({ icon: Icon, label, value, color }) => (
  <div className="flex items-center gap-3 py-2">
    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
      <Icon className="w-4 h-4 text-gray-600" />
    </div>
    <div className="flex-1">
      <p className="text-xs text-gray-500">{label}</p>
      <div className="flex items-center gap-2">
        {color && <ColorDot color={color} />}
        <p className="text-sm font-medium text-gray-900 truncate">{value || '-'}</p>
      </div>
    </div>
  </div>
);

const ChatbotPreview = ({ snapshot }) => {
  if (!snapshot) {
    return (
      <div className="text-center py-8 text-gray-500">
        Không có dữ liệu preview
      </div>
    );
  }

  const {
    chatbotName,
    chatbotDescription,
    systemInstruction,
    greetingMsg,
    aiModel,
    temperature,
    maxTokens,
    themeColor,
    primaryColor,
    backgroundColor,
    textColor,
    suggestedQuestions = [],
    includeKnowledgeBase,
    chunks = [],
  } = snapshot;

  return (
    <section className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
          <HiOutlineChat className="w-4 h-4" />
        </div>
        <div>
          <h2 className="text-base font-bold text-gray-900">Preview Chatbot</h2>
          <p className="text-xs text-gray-500">Cấu hình chatbot</p>
        </div>
      </div>

      {/* Chatbot Preview Widget */}
      <div className="mb-5">
        <div 
          className="rounded-xl overflow-hidden border border-gray-200 shadow-sm"
          style={{ 
            backgroundColor: backgroundColor || '#FFFFFF',
            borderColor: primaryColor || themeColor || '#6366F1',
          }}
        >
          {/* Header */}
          <div 
            className="px-4 py-3 flex items-center gap-3"
            style={{ backgroundColor: primaryColor || themeColor || '#6366F1' }}
          >
            <div className="w-8 h-8 rounded-full bg-white/20" />
            <div>
              <p 
                className="text-sm font-semibold"
                style={{ color: '#FFFFFF' }}
              >
                {chatbotName || 'Chatbot'}
              </p>
              <p 
                className="text-xs opacity-80"
                style={{ color: '#FFFFFF' }}
              >
                {aiModel || 'gemini-2.5-flash'}
              </p>
            </div>
          </div>
          
          {/* Messages */}
          <div className="p-4 space-y-3" style={{ minHeight: '120px' }}>
            <div className="flex gap-2">
              <div 
                className="w-6 h-6 rounded-full"
                style={{ backgroundColor: primaryColor || themeColor || '#6366F1' }}
              />
              <div 
                className="px-3 py-2 rounded-lg rounded-tl-none text-sm max-w-[80%]"
                style={{ 
                  backgroundColor: backgroundColor === '#FFFFFF' ? '#F3F4F6' : '#F3F4F6',
                  color: textColor || '#1F2937',
                }}
              >
                {greetingMsg || 'Xin chào! Tôi có thể giúp gì cho bạn?'}
              </div>
            </div>
          </div>
          
          {/* Input */}
          <div className="p-3 border-t border-gray-100">
            <div 
              className="px-3 py-2 rounded-lg text-sm"
              style={{ backgroundColor: '#F3F4F6', color: '#9CA3AF' }}
            >
              Nhập tin nhắn...
            </div>
          </div>
        </div>
      </div>

      {/* Configuration Details */}
      <div className="space-y-1 border-t border-gray-100 pt-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Cấu hình</h3>
        
        <ConfigItem 
          icon={HiOutlineSparkles} 
          label="AI Model" 
          value={aiModel || 'gemini-2.5-flash'} 
        />
        
        <ConfigItem 
          icon={HiOutlineCog} 
          label="Temperature" 
          value={temperature !== undefined ? temperature.toString() : '0.7'} 
        />
        
        <ConfigItem 
          icon={HiOutlineCog} 
          label="Max Tokens" 
          value={maxTokens || 2048} 
        />
        
        <div className="border-t border-gray-100 my-2" />
        
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Màu sắc</h3>
        
        <ConfigItem 
          icon={HiOutlineColorSwatch} 
          label="Primary Color" 
          value={primaryColor || themeColor || '#6366F1'} 
          color={primaryColor || themeColor} 
        />
        
        <ConfigItem 
          icon={HiOutlineColorSwatch} 
          label="Background Color" 
          value={backgroundColor || '#FFFFFF'} 
          color={backgroundColor} 
        />
        
        <ConfigItem 
          icon={HiOutlineColorSwatch} 
          label="Text Color" 
          value={textColor || '#1F2937'} 
          color={textColor} 
        />
      </div>

      {/* Description */}
      {chatbotDescription && (
        <div className="border-t border-gray-100 pt-4 mt-4">
          <div className="flex items-center gap-2 mb-2">
            <HiOutlineDocumentText className="w-4 h-4 text-gray-400" />
            <h3 className="text-sm font-semibold text-gray-700">Mô tả</h3>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            {chatbotDescription.length > 150 
              ? `${chatbotDescription.substring(0, 150)}...` 
              : chatbotDescription}
          </p>
        </div>
      )}

      {/* System Instruction Preview */}
      {systemInstruction && (
        <div className="border-t border-gray-100 pt-4 mt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">System Instruction</h3>
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-600">
            <p className="whitespace-pre-wrap">
              {systemInstruction.length > 200 
                ? `${systemInstruction.substring(0, 200)}...` 
                : systemInstruction}
            </p>
          </div>
        </div>
      )}

      {/* Knowledge Base */}
      {includeKnowledgeBase && chunks && chunks.length > 0 && (
        <div className="border-t border-gray-100 pt-4 mt-4">
          <div className="flex items-center gap-2 mb-2">
            <HiOutlineDocumentText className="w-4 h-4 text-purple-500" />
            <h3 className="text-sm font-semibold text-gray-700">Knowledge Base</h3>
          </div>
          <p className="text-sm text-gray-600">
            {chunks.length} chunks được bao gồm
          </p>
          {chunks.slice(0, 2).map((chunk, index) => (
            <div key={index} className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-500">
              {chunk.chunkText?.substring(0, 100)}...
            </div>
          ))}
        </div>
      )}

      {/* Suggested Questions */}
      {suggestedQuestions && suggestedQuestions.length > 0 && (
        <div className="border-t border-gray-100 pt-4 mt-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Câu hỏi gợi ý</h3>
          <div className="flex flex-wrap gap-2">
            {suggestedQuestions.slice(0, 4).map((q, index) => (
              <span 
                key={index}
                className="px-2 py-1 bg-purple-50 text-purple-600 text-xs rounded-full"
              >
                {q}
              </span>
            ))}
            {suggestedQuestions.length > 4 && (
              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                +{suggestedQuestions.length - 4} more
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
};

export default ChatbotPreview;
