/**
 * UKnow Custom AI Chat Widget
 *
 * Embed on website:
 * <script>
 *   window.customChatbotConfig = {
 *     token: 'WIDGET_KEY',
 *     baseUrl: 'https://your-domain.com',
 *     primaryColor: '#6366f1',
 *     backgroundColor: '#ffffff',
 *     textColor: '#1f2937',
 *     accentColor: '#60A5FA',
 *     logoUrl: 'https://example.com/logo.png',
 *     showAvatar: true,
 *     suggestedQuestions: ['Câu hỏi 1', 'Câu hỏi 2'],
 *     position: 'bottom-right',
 *     welcomeMessage: 'Xin chào!'
 *   };
 * </script>
 * <script src="https://your-domain.com/widget.js" defer></script>
 */

(function () {
  'use strict';

  const config = window.customChatbotConfig || {};
  const API_BASE = config.baseUrl || '';
  const WIDGET_KEY = config.token || '';

  // Configurable theme (falls back to API config if not set in window)
  let PRIMARY_COLOR = config.primaryColor || '#6366f1';
  let BACKGROUND_COLOR = config.backgroundColor || '#ffffff';
  let TEXT_COLOR = config.textColor || '#1f2937';
  let ACCENT_COLOR = config.accentColor || '#60A5FA';
  let LOGO_URL = config.logoUrl || '';
  let SHOW_AVATAR = config.showAvatar !== false;
  let SUGGESTED_QUESTIONS = config.suggestedQuestions || [];
  let POSITION = config.position || 'bottom-right';
  let WELCOME_MSG = config.welcomeMessage || 'Xin chào! Tôi có thể giúp gì cho bạn?';
  let CHATBOT_NAME = 'AI Assistant';
  let CHATBOT_AVATAR = '';

  let isOpen = false;
  let messages = JSON.parse(localStorage.getItem('uknow_msgs_' + WIDGET_KEY) || '[]');
  let chatHistory = JSON.parse(localStorage.getItem('uknow_history_' + WIDGET_KEY) || '[]');
  let configLoaded = false;

  // ── Load Config from API ─────────────────────────────────────────

  async function loadConfig() {
    if (!WIDGET_KEY || configLoaded) return;

    try {
      const res = await fetch(`${API_BASE}/api/chatbot-public/custom-chatbot/${WIDGET_KEY}/config`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();

      if (data.success && data.data) {
        const c = data.data;
        PRIMARY_COLOR = c.primaryColor || PRIMARY_COLOR;
        BACKGROUND_COLOR = c.backgroundColor || BACKGROUND_COLOR;
        TEXT_COLOR = c.textColor || TEXT_COLOR;
        ACCENT_COLOR = c.accentColor || ACCENT_COLOR;
        LOGO_URL = c.logoUrl || LOGO_URL;
        SHOW_AVATAR = c.showAvatar !== false ? SHOW_AVATAR : false;
        SUGGESTED_QUESTIONS = c.suggestedQuestions || SUGGESTED_QUESTIONS;
        POSITION = c.position || POSITION;
        WELCOME_MSG = c.welcomeMessage || WELCOME_MSG;
        CHATBOT_NAME = c.name || CHATBOT_NAME;
        CHATBOT_AVATAR = c.avatarUrl || c.logoUrl || '';
        configLoaded = true;
      }
    } catch (err) {
      console.warn('[UKnowWidget] Failed to load config:', err);
    }
  }

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
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, ${PRIMARY_COLOR}, ${ACCENT_COLOR});
      box-shadow: 0 4px 16px ${PRIMARY_COLOR}40;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.3s ease;
    `;
    bubble.innerHTML = `<svg width="28" height="28" fill="white" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
    bubble.onclick = toggleChat;
    bubble.onmouseenter = () => { bubble.style.transform = 'scale(1.08)'; };
    bubble.onmouseleave = () => { bubble.style.transform = 'scale(1)'; };

    // Chat window
    const chatWindow = document.createElement('div');
    chatWindow.id = 'uknow-window';
    chatWindow.style.cssText = `
      position: absolute;
      ${POSITION.includes('bottom') ? 'bottom' : 'top'}: 76px;
      ${POSITION.includes('left') ? 'left' : 'right'}: 0;
      width: 380px;
      height: 560px;
      background: ${BACKGROUND_COLOR};
      border-radius: 20px;
      box-shadow: 0 12px 48px rgba(0,0,0,0.15);
      display: none;
      flex-direction: column;
      overflow: hidden;
    `;

    // Header
    const header = document.createElement('div');
    header.style.cssText = `
      padding: 16px 20px;
      background: linear-gradient(135deg, ${PRIMARY_COLOR}, ${ACCENT_COLOR});
      color: white;
      display: flex;
      align-items: center;
      justify-content: space-between;
    `;
    
    const avatarContent = SHOW_AVATAR 
      ? (LOGO_URL 
          ? `<img src="${LOGO_URL}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 2px solid rgba(255,255,255,0.3);" />`
          : `<div style="width: 40px; height: 40px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 20px; border: 2px solid rgba(255,255,255,0.3);">🤖</div>`)
      : '';
    
    header.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        ${avatarContent}
        <div>
          <div style="font-weight: 600; font-size: 15px;">${CHATBOT_NAME}</div>
          <div style="font-size: 12px; opacity: 0.85; display: flex; align-items: center; gap: 4px;">
            <span style="width: 6px; height: 6px; background: #4ade80; border-radius: 50%;"></span>
            Online
          </div>
        </div>
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="uknow-minimize" style="background: rgba(255,255,255,0.2); border: none; color: white; cursor: pointer; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center;">─</button>
        <button id="uknow-close" style="background: rgba(255,255,255,0.2); border: none; color: white; cursor: pointer; width: 28px; height: 28px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 18px;">×</button>
      </div>
    `;
    header.querySelector('#uknow-close').onclick = toggleChat;
    header.querySelector('#uknow-minimize').onclick = () => {
      const w = document.getElementById('uknow-window');
      w.style.height = '0';
      w.style.opacity = '0';
      w.style.padding = '0';
      setTimeout(() => { w.style.display = 'none'; w.style.height = '560px'; w.style.opacity = '1'; w.style.padding = ''; }, 200);
    };

    // Messages area
    const msgArea = document.createElement('div');
    msgArea.id = 'uknow-messages';
    msgArea.style.cssText = `
      flex: 1;
      overflow-y: auto;
      padding: 16px 20px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      background: ${BACKGROUND_COLOR};
    `;

    // Suggested questions (if any)
    if (SUGGESTED_QUESTIONS.length > 0) {
      const suggestionsDiv = document.createElement('div');
      suggestionsDiv.style.cssText = 'padding: 12px 20px; border-bottom: 1px solid #f0f0f0; background: #fafafa;';
      suggestionsDiv.innerHTML = `
        <div style="font-size: 11px; color: ${TEXT_COLOR}; opacity: 0.6; margin-bottom: 8px; font-weight: 500;">Câu hỏi gợi ý:</div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
          ${SUGGESTED_QUESTIONS.map((q, i) => `
            <button onclick="document.getElementById('uknow-input').value='${q.replace(/'/g, "\\'")}';document.getElementById('uknow-input').focus();" 
              style="padding: 8px 14px; background: ${PRIMARY_COLOR}15; border: 1px solid ${PRIMARY_COLOR}30; border-radius: 20px; color: ${PRIMARY_COLOR}; font-size: 12px; cursor: pointer; transition: all 0.2s;">
              ${q}
            </button>
          `).join('')}
        </div>
      `;
      msgArea.appendChild(suggestionsDiv);
    }

    // Input area
    const inputArea = document.createElement('div');
    inputArea.style.cssText = `
      padding: 16px 20px;
      border-top: 1px solid #f0f0f0;
      background: ${BACKGROUND_COLOR};
    `;
    inputArea.innerHTML = `
      <div style="display: flex; gap: 10px; align-items: flex-end;">
        <input id="uknow-input" type="text" placeholder="Nhập tin nhắn..." style="flex: 1; padding: 12px 16px; border: 2px solid #f0f0f0; border-radius: 24px; outline: none; font-size: 14px; color: ${TEXT_COLOR}; transition: border-color 0.2s;" />
        <button id="uknow-send" style="width: 44px; height: 44px; background: linear-gradient(135deg, ${PRIMARY_COLOR}, ${ACCENT_COLOR}); border: none; border-radius: 50%; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px ${PRIMARY_COLOR}40;">
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    `;
    const input = inputArea.querySelector('#uknow-input');
    const sendBtn = inputArea.querySelector('#uknow-send');

    // Style input focus
    input.addEventListener('focus', () => { input.style.borderColor = PRIMARY_COLOR; });
    input.addEventListener('blur', () => { input.style.borderColor = '#f0f0f0'; });

    sendBtn.onclick = () => sendMessage(input.value);
    input.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(input.value); };

    chatWindow.appendChild(header);
    chatWindow.appendChild(msgArea);
    chatWindow.appendChild(inputArea);
    container.appendChild(bubble);
    container.appendChild(chatWindow);
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
    const chatWindow = document.getElementById('uknow-window');
    const bubble = document.getElementById('uknow-bubble');

    if (isOpen) {
      chatWindow.style.display = 'flex';
      bubble.innerHTML = `<svg width="24" height="24" fill="white" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
      bubble.style.transform = 'rotate(90deg)';
    } else {
      chatWindow.style.display = 'none';
      bubble.innerHTML = `<svg width="28" height="28" fill="white" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
      bubble.style.transform = 'rotate(0deg)';
    }
  }

  function addMessage(role, content, save = true) {
    const msgArea = document.getElementById('uknow-messages');
    if (!msgArea) return;

    const msg = document.createElement('div');
    msg.style.cssText = `
      max-width: 85%;
      padding: 12px 16px;
      border-radius: 18px;
      font-size: 14px;
      line-height: 1.5;
      white-space: pre-wrap;
      word-wrap: break-word;
      ${role === 'user'
        ? `background: linear-gradient(135deg, ${PRIMARY_COLOR}, ${ACCENT_COLOR}); color: white; align-self: flex-end; border-bottom-right-radius: 6px;`
        : `background: #f5f5f5; color: ${TEXT_COLOR}; align-self: flex-start; border-bottom-left-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);`}
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
    typing.style.cssText = `background: #f5f5f5; padding: 12px 16px; border-radius: 18px; align-self: flex-start; font-size: 14px; color: ${TEXT_COLOR}; border-bottom-left-radius: 6px;`;
    typing.innerHTML = `<span style="display: flex; gap: 4px;"><span style="width: 8px; height: 8px; background: ${PRIMARY_COLOR}; border-radius: 50%; animation: uknow-bounce 1.4s infinite ease-in-out both;">&nbsp;</span><span style="width: 8px; height: 8px; background: ${PRIMARY_COLOR}; border-radius: 50%; animation: uknow-bounce 1.4s infinite ease-in-out 0.16s both;">&nbsp;</span><span style="width: 8px; height: 8px; background: ${PRIMARY_COLOR}; border-radius: 50%; animation: uknow-bounce 1.4s infinite ease-in-out 0.32s both;">&nbsp;</span></span>`;
    msgArea.appendChild(typing);
    msgArea.scrollTop = msgArea.scrollHeight;

    // Add animation style
    if (!document.getElementById('uknow-style')) {
      const style = document.createElement('style');
      style.id = 'uknow-style';
      style.textContent = `@keyframes uknow-bounce { 0%, 80%, 100% { transform: scale(0); } 40% { transform: scale(1); } }`;
      document.head.appendChild(style);
    }

    try {
      const res = await fetch(`${API_BASE}/api/chatbot-public/custom-chatbot/${WIDGET_KEY}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: chatHistory.slice(-10),
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

  // Load config then build widget
  async function init() {
    await loadConfig();
    buildWidget();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
