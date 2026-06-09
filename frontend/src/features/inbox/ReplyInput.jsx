import { useState, useEffect, useRef } from 'react';
import { HiPaperAirplane, HiPaperClip, HiX, HiEmojiHappy, HiPhotograph, HiDocument } from 'react-icons/hi';
import { useI18n } from '../../i18n';

// Common emoji groups
const EMOJI_GROUPS = [
  { name: '😊', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🤐', '🤨', '😐', '😑', '😶', '😏', '😒', '🙄', '😬', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷'] },
  { name: '👋', emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎', '✊', '👊', '🤛', '🤜', '👏', '🙌', '👐', '🤲', '🤝', '🙏'] },
  { name: '❤️', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'] },
  { name: '🎉', emojis: ['🎉', '🎊', '🎈', '🎁', '🎀', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🎗️', '🎟️', '🎫'] },
  { name: '📱', emojis: ['📱', '💻', '⌨️', '🖥️', '🖨️', '🖱️', '🖲️', '💽', '💾', '💿', '📀', '📼', '📷', '📸', '📹', '🎥', '📞', '☎️', '📟', '📠'] },
  { name: '🍕', emojis: ['🍕', '🍔', '🍟', '🌭', '🍿', '🍩', '🍪', '🍰', '🍫', '🍬', '🍭', '🍮', '🍵', '☕', '🧃', '🥤', '🍺', '🍻', '🥂', '🍷'] },
];

const ReplyInput = ({ onSend, disabled, placeholder, replyingTo, onCancelReply }) => {
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFileMenu, setShowFileMenu] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const pickerRef = useRef(null);

  const placeholderText = placeholder || t('inbox.typeMessage');

  // Close emoji picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false);
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showEmojiPicker]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [message]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if ((!message.trim() && uploadedFiles.length === 0) || isSending || disabled) return;

    setIsSending(true);
    try {
      await onSend(message.trim(), replyingTo, uploadedFiles);
      setMessage('');
      setUploadedFiles([]);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      if (onCancelReply) {
        onCancelReply();
      }
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Add emoji to message
  const addEmoji = (emoji) => {
    setMessage(prev => prev + emoji);
    textareaRef.current?.focus();
  };

  // Handle file upload
  const handleFileSelect = (e, type) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const newFiles = files.map(file => ({
      id: Date.now() + Math.random(),
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      preview: type === 'image' ? URL.createObjectURL(file) : null,
    }));

    setUploadedFiles(prev => [...prev, ...newFiles]);
    setShowFileMenu(false);
  };

  // Remove uploaded file
  const removeFile = (fileId) => {
    setUploadedFiles(prev => {
      const file = prev.find(f => f.id === fileId);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter(f => f.id !== fileId);
    });
  };

  // Format replying to message preview
  const getReplyPreview = () => {
    if (!replyingTo) return null;
    const content = replyingTo.content || '';
    const maxLength = 50;
    const preview = content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
    return preview || t('inbox.mediaMessage');
  };

  // Format file size
  const formatSize = (bytes) => {
    if (!bytes) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let size = bytes;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  };

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-200 p-3 bg-white">
      {/* Reply preview */}
      {replyingTo && (
        <div className="mb-2 p-2 bg-primary-50 border border-primary-200 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-1 h-8 bg-primary-500 rounded-full" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-primary-700">
                {replyingTo.role === 'agent' ? t('inbox.you') : t('inbox.customer')}
              </p>
              <p className="text-sm text-gray-600 truncate">
                {getReplyPreview()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="p-1 text-gray-400 hover:text-gray-600 hover:bg-primary-100 rounded transition-colors"
            title={t('common.cancel')}
          >
            <HiX className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Uploaded files preview */}
      {uploadedFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {uploadedFiles.map((file) => (
            <div 
              key={file.id}
              className="relative group flex items-center gap-2 p-2 bg-gray-100 rounded-lg"
            >
              {file.type.startsWith('image/') ? (
                <img 
                  src={file.preview} 
                  alt={file.name}
                  className="w-10 h-10 rounded object-cover"
                />
              ) : (
                <div className="w-10 h-10 rounded bg-gray-200 flex items-center justify-center text-lg">
                  📎
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-700 truncate max-w-[120px]">
                  {file.name}
                </p>
                <p className="text-xs text-gray-500">
                  {formatSize(file.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeFile(file.id)}
                className="p-1 text-gray-400 hover:text-red-500 rounded transition-colors"
              >
                <HiX className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* File attachment menu */}
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setShowFileMenu(!showFileMenu)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title={t('common.attachment')}
          >
            <HiPaperClip className="w-5 h-5" />
          </button>

          {showFileMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowFileMenu(false)} />
              <div className="absolute bottom-full left-0 mb-2 w-48 bg-white rounded-lg shadow-lg border border-gray-200 z-20 overflow-hidden">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <HiPhotograph className="w-5 h-5 text-blue-500" />
                  <span className="text-sm text-gray-700">{t('inbox.uploadImage')}</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
                >
                  <HiDocument className="w-5 h-5 text-gray-500" />
                  <span className="text-sm text-gray-700">{t('inbox.uploadFile')}</span>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Hidden file inputs */}
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e, 'image')}
        />
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => handleFileSelect(e, 'file')}
        />

        {/* Emoji picker */}
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title={t('inbox.emoji')}
          >
            <HiEmojiHappy className="w-5 h-5" />
          </button>

          {showEmojiPicker && (
            <div className="absolute bottom-full left-0 mb-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-20 overflow-hidden">
              <div className="p-2 border-b border-gray-100 flex gap-1 overflow-x-auto">
                {EMOJI_GROUPS.map((group, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => addEmoji(group.emojis[0])}
                    className="p-2 hover:bg-gray-100 rounded transition-colors"
                    title={group.name}
                  >
                    {group.name}
                  </button>
                ))}
              </div>
              <div className="p-3 max-h-48 overflow-y-auto">
                {EMOJI_GROUPS.map((group, idx) => (
                  <div key={idx} className="mb-2">
                    <p className="text-xs text-gray-500 mb-1">{group.name}</p>
                    <div className="flex flex-wrap gap-1">
                      {group.emojis.map((emoji, eIdx) => (
                        <button
                          key={eIdx}
                          type="button"
                          onClick={() => addEmoji(emoji)}
                          className="p-1 hover:bg-gray-100 rounded transition-colors text-lg"
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Text input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholderText}
            disabled={disabled || isSending}
            rows={1}
            className="w-full px-4 py-2.5 pr-10 border border-gray-300 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
            style={{ minHeight: '42px', maxHeight: '120px' }}
          />
        </div>

        {/* Send button */}
        <button
          type="submit"
          disabled={(!message.trim() && uploadedFiles.length === 0) || isSending || disabled}
          className={`p-2.5 rounded-xl transition-all duration-200 ${
            (message.trim() || uploadedFiles.length > 0) && !isSending && !disabled
              ? 'bg-primary-500 text-white hover:bg-primary-600'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
          title={t('inbox.send')}
        >
          {isSending ? (
            <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <HiPaperAirplane className="w-5 h-5" />
          )}
        </button>
      </div>

      {/* Helper text */}
      <p className="text-xs text-gray-400 mt-2 px-1">
        {t('inbox.enterTip')}
      </p>
    </form>
  );
};

export default ReplyInput;
