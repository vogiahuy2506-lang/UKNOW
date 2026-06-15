import { useState, useEffect, useRef } from 'react';
import { HiPaperAirplane, HiPaperClip, HiX, HiOutlineEmojiHappy, HiOutlinePhotograph, HiDocument } from 'react-icons/hi';
import { useI18n } from '../../i18n';

const EMOJI_GROUPS = [
  { name: '😊', emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😋', '😛', '😜', '🤪', '😝'] },
  { name: '👋', emojis: ['👋', '🤚', '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '👍', '👎'] },
  { name: '❤️', emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟'] },
  { name: '🎉', emojis: ['🎉', '🎊', '🎈', '🎁', '🎀', '🏆', '🥇', '🥈', '🥉', '🏅', '🎖️', '🎗️', '🎟️', '🎫'] },
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

  const placeholderText = placeholder || 'Nhập tin nhắn...';

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

  const addEmoji = (emoji) => {
    setMessage(prev => prev + emoji);
    textareaRef.current?.focus();
  };

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

  const removeFile = (fileId) => {
    setUploadedFiles(prev => {
      const file = prev.find(f => f.id === fileId);
      if (file?.preview) {
        URL.revokeObjectURL(file.preview);
      }
      return prev.filter(f => f.id !== fileId);
    });
  };

  const getReplyPreview = () => {
    if (!replyingTo) return null;
    const content = replyingTo.content || '';
    const maxLength = 60;
    const preview = content.length > maxLength ? content.substring(0, maxLength) + '...' : content;
    return preview;
  };

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

  const canSend = (message.trim() || uploadedFiles.length > 0) && !isSending && !disabled;

  return (
    <form onSubmit={handleSubmit} className="border-t border-gray-200 p-4 bg-white shadow-lg">
      {/* Reply preview */}
      {replyingTo && (
        <div className="mb-3 p-3 bg-primary-50/50 border border-primary-100 rounded-2xl flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-1 h-10 bg-primary-500 rounded-full" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-primary-600">
                {replyingTo.role === 'agent' ? 'Bạn' : 'Khách hàng'}
              </p>
              <p className="text-sm text-gray-600 truncate">
                {getReplyPreview()}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-primary-100 rounded-xl transition-all"
            title="Hủy"
          >
            <HiX className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Uploaded files preview */}
      {uploadedFiles.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {uploadedFiles.map((file) => (
            <div 
              key={file.id}
              className="relative group flex items-center gap-2 p-2 bg-gray-100 rounded-xl"
            >
              {file.type.startsWith('image/') ? (
                <img 
                  src={file.preview} 
                  alt={file.name}
                  className="w-12 h-12 rounded-lg object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-lg bg-gray-200 flex items-center justify-center text-xl">
                  📎
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-gray-700 truncate max-w-[100px]">
                  {file.name}
                </p>
                <p className="text-xs text-gray-500">
                  {formatSize(file.size)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => removeFile(file.id)}
                className="p-1.5 text-gray-400 hover:text-red-500 rounded-lg transition-colors"
              >
                <HiX className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-3">
        {/* File attachment menu */}
        <div className="relative" ref={pickerRef}>
          <button
            type="button"
            onClick={() => setShowFileMenu(!showFileMenu)}
            className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
            title="Đính kèm"
          >
            <HiPaperClip className="w-5 h-5" />
          </button>

          {showFileMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowFileMenu(false)} />
              <div className="absolute bottom-full left-0 mb-2 w-56 bg-white rounded-2xl shadow-xl border border-gray-100 z-20 overflow-hidden">
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center">
                    <HiOutlinePhotograph className="w-5 h-5 text-purple-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-700">Gửi hình ảnh</span>
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 transition-colors"
                >
                  <div className="w-10 h-10 rounded-xl bg-blue-100 flex items-center justify-center">
                    <HiDocument className="w-5 h-5 text-blue-600" />
                  </div>
                  <span className="text-sm font-medium text-gray-700">Gửi tệp đính kèm</span>
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
            className="p-3 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-all"
            title="Emoji"
          >
            <HiOutlineEmojiHappy className="w-5 h-5" />
          </button>

          {showEmojiPicker && (
            <div className="absolute bottom-full left-0 mb-2 w-80 bg-white rounded-2xl shadow-xl border border-gray-100 z-20 overflow-hidden">
              <div className="p-3 border-b border-gray-100 flex gap-2 overflow-x-auto">
                {EMOJI_GROUPS.map((group, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => addEmoji(group.emojis[0])}
                    className="p-2 hover:bg-gray-100 rounded-xl transition-colors text-xl"
                    title={group.name}
                  >
                    {group.name}
                  </button>
                ))}
              </div>
              <div className="p-3 max-h-48 overflow-y-auto">
                {EMOJI_GROUPS.map((group, idx) => (
                  <div key={idx} className="mb-3">
                    <p className="text-xs font-semibold text-gray-400 mb-2">{group.name}</p>
                    <div className="flex flex-wrap gap-1">
                      {group.emojis.map((emoji, eIdx) => (
                        <button
                          key={eIdx}
                          type="button"
                          onClick={() => addEmoji(emoji)}
                          className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-lg"
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
            className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl resize-none focus:outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 disabled:bg-gray-100 disabled:cursor-not-allowed text-sm"
            style={{ minHeight: '48px', maxHeight: '120px' }}
          />
        </div>

        {/* Send button */}
        <button
          type="submit"
          disabled={!canSend}
          className={`p-3 rounded-2xl transition-all duration-200 ${
            canSend
              ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white hover:shadow-lg hover:shadow-primary-500/30 hover:scale-105'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
          title="Gửi tin nhắn"
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
    </form>
  );
};

export default ReplyInput;
