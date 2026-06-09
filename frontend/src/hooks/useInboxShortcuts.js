import { useEffect, useCallback } from 'react';

/**
 * Hook for handling keyboard shortcuts in the inbox
 * 
 * Shortcuts:
 * - Escape: Close conversation / Close panel
 * - Ctrl/Cmd + Enter: Send message
 * - Ctrl/Cmd + K: Focus search
 * - Ctrl/Cmd + Shift + R: Reply to last message
 * - Arrow Up: Edit last message (if no text in input)
 */
export const useInboxShortcuts = (options = {}) => {
  const {
    onEscape,
    onSend,
    onSearch,
    onReplyLast,
    hasInputFocused = false,
    messageInputRef,
  } = options;

  const handleKeyDown = useCallback((event) => {
    const { key, ctrlKey, metaKey, shiftKey } = event;
    const modKey = ctrlKey || metaKey;

    // Escape - Close conversation
    if (key === 'Escape' && onEscape) {
      event.preventDefault();
      onEscape();
      return;
    }

    // Don't process other shortcuts if typing in input
    if (hasInputFocused) {
      // Ctrl/Cmd + Enter - Send message
      if (modKey && key === 'Enter' && onSend) {
        event.preventDefault();
        onSend();
        return;
      }
      return;
    }

    // Ctrl/Cmd + K - Focus search
    if (modKey && key === 'k' && onSearch) {
      event.preventDefault();
      onSearch();
      return;
    }

    // Ctrl/Cmd + Shift + R - Reply to last message
    if (modKey && shiftKey && key === 'R' && onReplyLast) {
      event.preventDefault();
      onReplyLast();
      return;
    }
  }, [onEscape, onSend, onSearch, onReplyLast, hasInputFocused]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  return {
    shortcuts: {
      escape: 'Esc - Close/Back',
      send: 'Ctrl/Cmd + Enter - Send',
      search: 'Ctrl/Cmd + K - Search',
      replyLast: 'Ctrl/Cmd + Shift + R - Reply to last',
    },
  };
};

export default useInboxShortcuts;
