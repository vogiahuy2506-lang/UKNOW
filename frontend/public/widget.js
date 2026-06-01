/**
 * UKnow Custom AI Chat Widget
 *
 * Embed on website:
 * <script>
 *   window.customChatbotConfig = {
 *     token: 'WIDGET_KEY',
 *     baseUrl: 'https://your-domain.com',
 *     themeColor: '#6366f1',
 *     position: 'bottom-right'
 *   };
 * </script>
 * <script src="https://your-domain.com/widget.js" defer></script>
 */

(function () {
  'use strict';

  const config = window.customChatbotConfig || {};
  const API_BASE = config.baseUrl || '';
  const WIDGET_KEY = config.token || '';
  const THEME_COLOR = config.themeColor || '#6366f1';
  const POSITION = config.position || 'bottom-right';
  const WELCOME_MSG = config.welcomeMessage || 'Xin chào! Tôi có thể giúp gì cho bạn?';

  let isOpen = false;
  let messages = JSON.parse(localStorage.getItem('uknow_msgs_' + WIDGET_KEY) || '[]');
  let chatHistory = JSON.parse(localStorage.getItem('uknow_history_' + WIDGET_KEY) || '[]');

  // ── Build UI ──────────────────────────────────────────────────────

  function buildWidget() {
    // Container
    const container = document.createElement('div');
    container.id = 'uknow-widget';
    container.style.cssText = `
      position: fixed;
      ${POSITION.includes('left') ? 'left' : 'right'}: 20px;
      ${POSITION.includes('top') ? 'top' : 'bottom'}: 20px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    `;

    // Chat bubble
    const bubble = document.createElement('div');
    bubble.id = 'uknow-bubble';
    bubble.style.cssText = `
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: ${THEME_COLOR};
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: transform 0.2s;
    `;
    bubble.innerHTML = `<svg width="24" height="24" fill="white" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
    bubble.onclick = toggleChat;

    // Chat window
    const window = document.createElement('div');
    window.id = 'uknow-window';
    window.style.cssText = `
      position: absolute;
      ${POSITION.includes('bottom') ? 'bottom' : 'top'}: 70px;
      ${POSITION.includes('left') ? 'left' : 'right'}: 0;
      width: 360px;
      height: 500px;
      background: white;
      border-radius: 16px;
      box-shadow: 0 8px 32px rgba(0,0,0,0.12);
      display: none;
      flex-direction: column;
      overflow: hidden;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 16px;
      background: ${THEME_COLOR};
      color: white;
      display: flex;
      align-items: center;
      justify-content: space-between;
    `;
    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 36px; height: 36px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 18px;">🤖</div>
        <div>
          <div style="font-weight: 600; font-size: 14px;">AI Assistant</div>
          <div style="font-size: 11px; opacity: 0.8;">Online</div>
        </div>
      </div>
      <button id="uknow-close" style="background: none; border: none; color: white; cursor: pointer; font-size: 20px; padding: 4px;">×</button>
    `;
    header.querySelector('#uknow-close').onclick = toggleChat;

    // Messages area
    const msgArea = document.createElement('div');
    msgArea.id = 'uknow-messages';
    msgArea.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    `;

    // Input area
    const inputArea = document.createElement('div');
    inputArea.style.cssText = `
      padding: 12px;
      border-top: 1px solid #eee;
      display: flex;
      gap: 8px;
    `;
    inputArea.innerHTML = `
      <input id="uknow-input" type="text" placeholder="Nhập tin nhắn..." style="flex: 1; padding: 10px 14px; border: 1px solid #ddd; border-radius: 24px; outline: none; font-size: 14px;" />
      <button id="uknow-send" style="width: 40px; height: 40px; background: ${THEME_COLOR}; border: none; border-radius: 50%; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center;">
        <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    `;
    const input = inputArea.querySelector('#uknow-input');
    const sendBtn = inputArea.querySelector('#uknow-send');

    sendBtn.onclick = () => sendMessage(input.value);
    input.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(input.value); };

    window.appendChild(header);
    window.appendChild(msgArea);
    window.appendChild(inputArea);
    container.appendChild(bubble);
    container.appendChild(window);
    document.body.appendChild(container);

    // Load welcome message
    if (messages.length === 0) {
      addMessage('bot', WELCOME_MSG);
    } else {
      messages.forEach(m => addMessage(m.role, m.content, false));
    }
  }

  function toggleChat() {
    isOpen = !isOpen;
    const window = document.getElementById('uknow-window');
    const bubble = document.getElementById('uknow-bubble');

    if (isOpen) {
      window.style.display = 'flex';
      bubble.innerHTML = `<svg width="24" height="24" fill="white" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
    } else {
      window.style.display = 'none';
      bubble.innerHTML = `<svg width="24" height="24" fill="white" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
    }
  }

  function addMessage(role, content, save = true) {
    const msgArea = document.getElementById('uknow-messages');
    if (!msgArea) return;

    const msg = document.createElement('div');
    msg.style.cssText = `
      max-width: 80%;
      padding: 10px 14px;
      border-radius: 16px;
      font-size: 14px;
      line-height: 1.4;
      white-space: pre-wrap;
      ${role === 'user'
        ? 'background: ' + THEME_COLOR + '; color: white; align-self: flex-end; border-bottom-right-radius: 4px;'
        : 'background: #f1f1f1; color: #333; align-self: flex-start; border-bottom-left-radius: 4px;'}
    `;
    msg.textContent = content;
    msgArea.appendChild(msg);
    msgArea.scrollTop = msgArea.scrollHeight;

    if (save) {
      messages.push({ role, content });
      localStorage.setItem('uknow_msgs_' + WIDGET_KEY, JSON.stringify(messages.slice(-50)));
    }
  }

  async function sendMessage(text) {
    if (!text?.trim()) return;

    const input = document.getElementById('uknow-input');
    input.value = '';

    // Add user message
    addMessage('user', text);
    chatHistory.push({ role: 'user', content: text });

    // Show typing indicator
    const msgArea = document.getElementById('uknow-messages');
    const typing = document.createElement('div');
    typing.id = 'uknow-typing';
    typing.style.cssText = 'background: #f1f1f1; padding: 10px 14px; border-radius: 16px; align-self: flex-start; font-size: 14px;';
    typing.textContent = 'Đang trả lời...';
    msgArea.appendChild(typing);
    msgArea.scrollTop = msgArea.scrollHeight;

    try {
      const res = await fetch(`${API_BASE}/api/chatbot-public/custom-chatbot/${WIDGET_KEY}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: chatHistory.slice(-10), // Send last 10 messages for context
        }),
      });

      const data = await res.json();
      typing.remove();

      if (data.success && data.data) {
        addMessage('assistant', data.data.content);
        chatHistory.push({ role: 'assistant', content: data.data.content });
        localStorage.setItem('uknow_history_' + WIDGET_KEY, JSON.stringify(chatHistory.slice(-20)));
      } else {
        addMessage('bot', 'Xin lỗi, đã có lỗi xảy ra.');
      }
    } catch (err) {
      typing.remove();
      addMessage('bot', 'Không thể kết nối với server.');
    }
  }

  // ── Init ──────────────────────────────────────────────────────

  if (!WIDGET_KEY) {
    console.warn('[UKnowWidget] Missing token in config');
    return;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildWidget);
  } else {
    buildWidget();
  }
})();
