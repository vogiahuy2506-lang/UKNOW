/**
 * UKnow Web Chat Widget SDK
 *
 * Embed on website:
 * <script>
 *   (function(w,d,s,o,f,js,fjs){
 *     w['UKnowWidget']=o;w[o]=w[o]||function(){(w[o].q=w[o].q||[]).push(arguments)};
 *     js=d.createElement(s);fjs=d.getElementsByTagName(s)[0];
 *     js.id='uknow-widget-sdk';js.src=f;js.async=1;fjs.parentNode.insertBefore(js,fjs);
 *   }(window,document,'script','uw','https://YOUR_BACKEND_URL/widget.js'));
 *   uw('init', { key: 'WIDGET_KEY', position: 'bottom-right' });
 * </script>
 */

(function () {
  'use strict';

  const API_BASE = (function () {
    const scripts = document.querySelectorAll('script[src*="widget.js"]');
    if (scripts.length > 0) {
      const src = scripts[scripts.length - 1].src;
      const idx = src.indexOf('/widget.js');
      return src.slice(0, idx);
    }
    return window.__UKNOW_WIDGET_API_BASE__ || 'https://app.uknow.io/api/chatbot-public';
  })();

  let config = null;
  let conversationId = null;
  let sessionId = null;
  let messages = [];
  let isOpen = false;
  let unreadCount = 0;
  let initialized = false;

  const STORAGE_KEY = 'uknow_widget_session';

  function generateSessionId() {
    return 'sess_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
  }

  function loadSession() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.key === config.widgetKey) {
          return data.sessionId;
        }
      }
    } catch {}
    return null;
  }

  function saveSession() {
    if (!config) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        key: config.widgetKey,
        sessionId: sessionId,
      }));
    } catch {}
  }

  function loadMessages() {
    try {
      const stored = localStorage.getItem('uknow_widget_msgs_' + conversationId);
      if (stored) messages = JSON.parse(stored);
    } catch {}
  }

  function saveMessages() {
    try {
      localStorage.setItem('uknow_widget_msgs_' + conversationId, JSON.stringify(messages.slice(-100)));
    } catch {}
  }

  function addMessage(role, content) {
    messages.push({ role, content, ts: Date.now() });
    saveMessages();
  }

  // ── API helpers ─────────────────────────────────────────────────

  async function fetchConfig() {
    const res = await fetch(`${API_BASE}/widget/${config.widgetKey}/config`);
    if (!res.ok) throw new Error('Widget not found');
    return res.json();
  }

  async function startConversation() {
    sessionId = loadSession() || generateSessionId();
    saveSession();
    const res = await fetch(`${API_BASE}/widget/conversations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ widgetKey: config.widgetKey, sessionId }),
    });
    const data = await res.json();
    if (data.success) {
      conversationId = data.data.conversationId;
      messages = data.data.messages || [];
      if (data.data.welcomeMessage && messages.length === 0) {
        messages.push({ role: 'bot', content: data.data.welcomeMessage, ts: Date.now() });
        saveMessages();
      }
    }
    return data;
  }

  async function sendMessage(content) {
    addMessage('visitor', content);
    renderMessages();
    showTyping();

    try {
      const res = await fetch(`${API_BASE}/widget/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, content }),
      });
      const data = await res.json();
      hideTyping();
      if (data.success && data.data && data.data.messages) {
        // Append new bot messages
        const newMsgs = data.data.messages.filter(
          m => !messages.some(existing => existing.ts === m.created_at)
        );
        messages.push(...newMsgs.map(m => ({
          role: m.role,
          content: m.content,
          ts: new Date(m.created_at).getTime(),
        })));
        saveMessages();
      }
    } catch (err) {
      hideTyping();
      messages.push({ role: 'bot', content: 'Xin lỗi, đã có lỗi xảy ra. Vui lòng thử lại.', ts: Date.now() });
    }
    renderMessages();
    saveMessages();
  }

  // ── DOM helpers ────────────────────────────────────────────────

  function getContainer() {
    return document.getElementById('uknow-widget-container');
  }

  function getButton() {
    return document.getElementById('uknow-widget-btn');
  }

  function getPanel() {
    return document.getElementById('uknow-widget-panel');
  }

  function getMessagesEl() {
    return document.getElementById('uknow-widget-messages');
  }

  function getInput() {
    return document.getElementById('uknow-widget-input');
  }

  // ── Render ────────────────────────────────────────────────────

  function renderMessages() {
    const el = getMessagesEl();
    if (!el) return;
    el.innerHTML = messages.map(m => {
      const isBot = m.role === 'bot';
      return `
        <div style="display:flex;justify-content:${isBot ? 'flex-start' : 'flex-end'};margin-bottom:10px">
          <div style="max-width:80%;padding:10px 14px;border-radius:${isBot ? '4px 16px 16px 16px' : '16px 4px 16px 16px'};background:${isBot ? '#f1f5f9' : (config?.themeColor || '#6366F1')};color:${isBot ? '#334155' : '#fff'};font-size:14px;line-height:1.5;word-break:break-word">
            ${escapeHtml(m.content)}
          </div>
        </div>
      `;
    }).join('');
    el.scrollTop = el.scrollHeight;
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');
  }

  function showTyping() {
    const el = getMessagesEl();
    if (!el) return;
    el.insertAdjacentHTML('beforeend', `
      <div id="uknow-widget-typing" style="display:flex;justify-content:flex-start;margin-bottom:10px">
        <div style="padding:10px 14px;border-radius:4px 16px 16px 16px;background:#f1f5f9;color:#64748b;font-size:13px">
          Đang trả lời<span style="animation:uknow-dots 1.4s infinite">...</span>
        </div>
      </div>
    `);
    el.scrollTop = el.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById('uknow-widget-typing');
    if (el) el.remove();
  }

  function buildWidget() {
    const position = config?.position === 'bottom-left' ? 'left:20px' : 'right:20px';
    const themeColor = config?.themeColor || '#6366F1';

    const html = `
      <style>
        #uknow-widget-btn {
          position:fixed;bottom:24px;${position};z-index:999998;width:56px;height:56px;
          border-radius:50%;background:${themeColor};border:none;cursor:pointer;
          box-shadow:0 4px 20px rgba(0,0,0,0.2);display:flex;align-items:center;
          justify-content:center;transition:transform 0.2s,box-shadow 0.2s;
          animation:uknow-fadeIn 0.3s ease;
        }
        #uknow-widget-btn:hover {transform:scale(1.08);box-shadow:0 6px 24px rgba(0,0,0,0.25);}
        #uknow-widget-btn svg {width:26px;height:26px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
        #uknow-widget-badge {
          position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;border-radius:10px;
          background:#ef4444;color:#fff;font-size:11px;font-weight:700;
          display:flex;align-items:center;justify-content:center;padding:0 5px;
          animation:uknow-bounce 0.3s ease;
        }
        #uknow-widget-panel {
          position:fixed;bottom:90px;${position};z-index:999999;width:380px;height:540px;
          background:#fff;border-radius:16px;box-shadow:0 8px 40px rgba(0,0,0,0.18);
          display:none;flex-direction:column;overflow:hidden;
          animation:uknow-slideUp 0.3s ease;
        }
        #uknow-widget-panel.open {display:flex;}
        #uknow-widget-header {
          padding:14px 16px;background:${themeColor};color:#fff;
          display:flex;align-items:center;justify-content:space-between;
        }
        #uknow-widget-header-title {font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px}
        #uknow-widget-close {
          background:none;border:none;cursor:pointer;padding:4px;border-radius:6px;
          display:flex;align-items:center;justify-content:center;opacity:0.8;transition:opacity 0.2s;
        }
        #uknow-widget-close:hover {opacity:1}
        #uknow-widget-close svg {width:20px;height:20px;stroke:#fff;fill:none;stroke-width:2}
        #uknow-widget-messages {
          flex:1;overflow-y:auto;padding:16px;background:#fafafa;
          scroll-behavior:smooth;
        }
        #uknow-widget-input-area {
          padding:12px 16px;border-top:1px solid #e2e8f0;display:flex;gap:8px;align-items:center;
        }
        #uknow-widget-input {
          flex:1;border:1px solid #e2e8f0;border-radius:20px;padding:10px 16px;font-size:14px;
          outline:none;resize:none;max-height:100px;line-height:1.4;
          transition:border-color 0.2s;
        }
        #uknow-widget-input:focus {border-color:${themeColor};box-shadow:0 0 0 3px ${themeColor}22}
        #uknow-widget-send {
          width:40px;height:40px;border-radius:50%;background:${themeColor};border:none;
          cursor:pointer;display:flex;align-items:center;justify-content:center;
          flex-shrink:0;transition:background 0.2s,transform 0.1s;
        }
        #uknow-widget-send:hover {background:${themeColor};filter:brightness(1.1)}
        #uknow-widget-send:active {transform:scale(0.95)}
        #uknow-widget-send svg {width:18px;height:18px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
        @keyframes uknow-fadeIn {from{opacity:0;transform:scale(0.8)}to{opacity:1;transform:scale(1)}}
        @keyframes uknow-slideUp {from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes uknow-bounce {0%{transform:scale(0)}50%{transform:scale(1.2)}100%{transform:scale(1)}}
        @keyframes uknow-dots {0%,20%{content:'.'}40%{content:'..'}60%,100%{content:'...'}}
        @media(max-width:480px){
          #uknow-widget-panel{width:calc(100vw - 20px);${position === 'left:20px' ? 'left:10px' : 'right:10px'};bottom:80px;height:calc(100vh - 120px)}
        }
      </style>

      <button id="uknow-widget-btn" onclick="window.__uknowToggle&&window.__uknowToggle()">
        <svg viewBox="0 0 24 24" id="uknow-icon-chat">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
        </svg>
        <svg viewBox="0 0 24 24" id="uknow-icon-close" style="display:none">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
        <div id="uknow-widget-badge" style="display:none">0</div>
      </button>

      <div id="uknow-widget-panel">
        <div id="uknow-widget-header">
          <div id="uknow-widget-header-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            <span>${escapeHtml(config?.subAssistantName || config?.displayName || 'Trợ lý AI')}</span>
          </div>
          <button id="uknow-widget-close" onclick="window.__uknowToggle&&window.__uknowToggle()">
            <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div id="uknow-widget-messages"></div>
        <div id="uknow-widget-input-area">
          <textarea id="uknow-widget-input" placeholder="Nhập tin nhắn..." rows="1"
            onkeydown="var e=event;if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();window.__uknowSend&&window.__uknowSend()}"></textarea>
          <button id="uknow-widget-send" onclick="window.__uknowSend&&window.__uknowSend()">
            <svg viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
          </button>
        </div>
      </div>
    `;

    const container = document.createElement('div');
    container.id = 'uknow-widget-container';
    container.innerHTML = html;
    document.body.appendChild(container);

    // Toggle
    window.__uknowToggle = function () {
      const panel = getPanel();
      const btnChat = document.getElementById('uknow-icon-chat');
      const btnClose = document.getElementById('uknow-icon-close');
      isOpen = !isOpen;
      if (isOpen) {
        panel.classList.add('open');
        btnChat.style.display = 'none';
        btnClose.style.display = 'block';
        unreadCount = 0;
        updateBadge();
      } else {
        panel.classList.remove('open');
        btnChat.style.display = 'block';
        btnClose.style.display = 'none';
      }
    };

    // Send
    window.__uknowSend = function () {
      const input = getInput();
      const content = input?.value?.trim();
      if (!content || !conversationId) return;
      input.value = '';
      input.style.height = 'auto';
      sendMessage(content);
    };

    // Auto-resize textarea
    const input = getInput();
    if (input) {
      input.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = Math.min(this.scrollHeight, 100) + 'px';
      });
    }
  }

  function updateBadge() {
    const badge = document.getElementById('uknow-widget-badge');
    if (!badge) return;
    if (unreadCount > 0 && !isOpen) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  // ── Init ──────────────────────────────────────────────────────

  async function init(opts) {
    if (initialized) return;
    initialized = true;
    config = opts;

    try {
      await fetchConfig();
    } catch (err) {
      console.warn('[UKnowWidget] Config fetch failed, using defaults:', err);
    }

    buildWidget();
    await startConversation();
    loadMessages();
    renderMessages();
  }

  // ── Public API ────────────────────────────────────────────────

  window.UKnowWidget = function () {
    const args = Array.prototype.slice.call(arguments);
    const cmd = args[0];
    if (cmd === 'init' && args[1]) {
      init(args[1]);
    }
  };

  // Alias
  window.uw = window.UKnowWidget;

  // Auto-init from script tag data attributes
  const scripts = document.querySelectorAll('script[src*="widget.js"]');
  if (scripts.length > 0) {
    const lastScript = scripts[scripts.length - 1];
    const key = lastScript.dataset.key || lastScript.getAttribute('data-key');
    if (key) {
      init({ widgetKey: key, position: lastScript.dataset.position || 'bottom-right' });
    }
  }
})();
