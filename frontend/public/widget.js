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
 *     welcomeMessage: 'Xin chào!',
 *     launcherLabel: 'Chat với chúng tôi'
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
  let ALLOW_ATTACHMENTS = false;
  // Nhãn kêu gọi mở chat cạnh bong bóng — rỗng = tắt (chỉ hiện nút tròn như hôm nay).
  let LAUNCHER_LABEL = config.launcherLabel || '';
  // Bo góc khung chat (px, 0–32). Mặc định 20 = giá trị cũ; chỉ đổi khi server trả borderRadius.
  let BORDER_RADIUS = 20;
  function clampRadius(v) {
    const n = Number(v);
    if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return null;
    return Math.min(32, Math.max(0, Math.round(n)));
  }
  // Tự mở khung chat sau vài giây (chủ shop bật ở Giao diện Widget). Chỉ đọc từ API config.
  let AUTO_OPEN = false;
  const AUTO_OPEN_DELAY_MS = 2000;
  const AUTO_OPEN_MIN_WIDTH = 640; // màn hẹp (điện thoại): không tự mở, tránh che nội dung

  // Bộ nhớ an toàn. Landing page của Founder AI hiển thị trong iframe sandbox KHÔNG có
  // allow-same-origin (LpRendererPage.jsx, LpRendererByHost.jsx — cố ý, để HTML khách tự viết
  // không đọc được phiên đăng nhập của founderai.biz). Ở đó chỉ cần ĐỌC window.localStorage là
  // trình duyệt ném SecurityError — trước đây widget chết ngay tại dòng này: không nút, không nhãn.
  // Dùng localStorage khi được; không thì giữ tạm trong bộ nhớ trang (tải lại trang thì mất lịch sử).
  const memoryStore = {};
  const storage = {
    get: function (key) {
      try {
        return window.localStorage.getItem(key);
      } catch (err) {
        return Object.prototype.hasOwnProperty.call(memoryStore, key) ? memoryStore[key] : null;
      }
    },
    set: function (key, value) {
      try {
        window.localStorage.setItem(key, value);
      } catch (err) {
        memoryStore[key] = String(value);
      }
    },
  };
  // Dữ liệu cũ hỏng (JSON sai) cũng không được làm chết widget.
  function readStoredList(key) {
    try {
      const parsed = JSON.parse(storage.get(key) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      return [];
    }
  }

  // sessionId là thứ DUY NHẤT chứng minh "hội thoại này của tôi" khi widget hỏi tin nhân viên trả lời tay
  // (GET .../messages) — nên phiên MỚI sinh bằng crypto, không dùng Date.now() + Math.random() đoán được.
  // Phiên cũ đã lưu trong storage (dạng sess_<ms>_<ký tự>) giữ nguyên để không mất hội thoại đang dở.
  function generateSessionId() {
    try {
      const cryptoObj = window.crypto || window.msCrypto;
      if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        cryptoObj.getRandomValues(bytes);
        let hex = '';
        for (let i = 0; i < bytes.length; i += 1) hex += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
        return 'sess_' + hex;
      }
    } catch (err) {
      // rơi xuống nhánh dự phòng
    }
    return 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 11) + Math.random().toString(36).slice(2, 11);
  }

  let isOpen = false;
  let messages = readStoredList('uknow_msgs_' + WIDGET_KEY);
  let chatHistory = readStoredList('uknow_history_' + WIDGET_KEY);
  let pendingAttachments = [];
  let sessionId = storage.get('uknow_session_' + WIDGET_KEY);
  if (!sessionId) {
    sessionId = generateSessionId();
    storage.set('uknow_session_' + WIDGET_KEY, sessionId);
  }
  let configLoaded = false;

  // ── Tin nhân viên trả lời tay (poll) ──────────────────────────────
  // Hộp thư của chủ shop chỉ lưu tin vào hội thoại web — không có kênh ngoài để đẩy — nên widget tự hỏi tin mới khi khung chat
  // đang mở. Dừng khi khung đóng / tab ẩn / khách chưa nhắn tin nào (chưa có hội thoại thì không có gì để nhận).
  const POLL_INTERVAL_MS = 8000;
  const POLL_BACKOFF_MS = [16000, 32000, 60000]; // lỗi liên tiếp: giãn dần
  const POLL_MORE_MS = 1000; // server báo còn tin chưa lấy hết
  const AGENT_LABEL = 'Nhân viên';
  const AFTER_KEY = 'uknow_agentafter_' + WIDGET_KEY;
  let pollTimer = null;
  let pollInFlight = false;
  let pollErrorCount = 0;
  const seenAgentIds = {};
  function readStoredAfterId() {
    const raw = String(storage.get(AFTER_KEY) || '');
    return /^\d{1,18}$/.test(raw) ? raw : '0';
  }
  let lastAgentId = readStoredAfterId();
  messages.forEach(function (m) {
    if (m && m.role === 'agent' && m.id) seenAgentIds[String(m.id)] = true;
  });
  // id là BIGINT dạng chuỗi số: so sánh theo độ dài rồi theo chữ để không mất chính xác ở số lớn.
  function idGreater(a, b) {
    const x = String(a);
    const y = String(b);
    return x.length !== y.length ? x.length > y.length : x > y;
  }

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
        // Resolve header avatar once: prefer logoUrl, fall back to avatarUrl.
        // Previously widget.js only checked LOGO_URL so avatars set via the
        // Studio "Ảnh đại diện" field (which writes custom_chatbots.avatar_url)
        // were silently dropped from the embeddable header.
        LOGO_URL = c.logoUrl || c.avatarUrl || LOGO_URL;
        SHOW_AVATAR = c.showAvatar !== false ? SHOW_AVATAR : false;
        SUGGESTED_QUESTIONS = c.suggestedQuestions || SUGGESTED_QUESTIONS;
        POSITION = c.position || POSITION;
        WELCOME_MSG = c.welcomeMessage || WELCOME_MSG;
        CHATBOT_NAME = c.name || CHATBOT_NAME;
        CHATBOT_AVATAR = c.avatarUrl || c.logoUrl || '';
        ALLOW_ATTACHMENTS = c.allowAttachments === true;
        // '' hợp lệ (tắt nhãn) nên không dùng `||` — chỉ giữ giá trị cũ khi server
        // không trả field này (ví dụ config cũ chưa có cột).
        LAUNCHER_LABEL = typeof c.launcherLabel === 'string' ? c.launcherLabel : LAUNCHER_LABEL;
        AUTO_OPEN = c.autoOpen === true;
        const radius = clampRadius(c.borderRadius);
        if (radius !== null) BORDER_RADIUS = radius;
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

    // Launcher label — viên nhãn cạnh bong bóng, chỉ dựng khi chủ chatbot có nhập nội
    // dung. Nhãn do chủ shop nhập và hiển thị trên website bên thứ ba -> LUÔN dùng
    // textContent, KHÔNG BAO GIỜ innerHTML (tránh XSS qua nhãn tuỳ ý).
    let launcherLabelEl = null;
    if (LAUNCHER_LABEL && LAUNCHER_LABEL.trim()) {
      launcherLabelEl = document.createElement('div');
      launcherLabelEl.id = 'uknow-launcher-label';
      launcherLabelEl.style.cssText = `
        position: absolute;
        top: 0;
        height: 60px;
        display: flex;
        align-items: center;
        ${POSITION.includes('right') ? 'right: 100%; margin-right: 12px;' : 'left: 100%; margin-left: 12px;'}
        padding: 8px 14px;
        background: #ffffff;
        color: ${TEXT_COLOR};
        border-radius: 20px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.15);
        white-space: nowrap;
        max-width: min(220px, 60vw);
        box-sizing: border-box;
        cursor: pointer;
        font-size: 14px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      `;
      // Chữ nằm trong span riêng: text-overflow: ellipsis không có tác dụng trên chính
      // phần tử display:flex, nhãn 40 ký tự sẽ bị cắt ngang giữa chữ thay vì hiện "…".
      const launcherLabelText = document.createElement('span');
      launcherLabelText.style.cssText = 'min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
      launcherLabelText.textContent = LAUNCHER_LABEL;
      launcherLabelEl.appendChild(launcherLabelText);
      launcherLabelEl.onclick = toggleChat;
    }

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
      border-radius: ${BORDER_RADIUS}px;
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
      stopPolling(); // thu nhỏ = khung không còn hiển thị (isOpen vẫn true) → không hỏi tin mới nữa
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
      <div id="uknow-attach-chips" style="display:none; flex-wrap:wrap; gap:6px; margin-bottom:8px;"></div>
      <div style="display: flex; gap: 10px; align-items: flex-end;">
        ${ALLOW_ATTACHMENTS ? `<button id="uknow-attach" type="button" title="Đính kèm" style="width:44px;height:44px;border:2px solid #f0f0f0;border-radius:50%;background:#fff;cursor:pointer;font-size:18px;">📎</button>
        <input id="uknow-file" type="file" accept=".pdf,.docx,.xlsx,.txt,.csv,.png,.jpg,.jpeg,.webp" multiple style="display:none;" />` : ''}
        <input id="uknow-input" type="text" placeholder="Nhập tin nhắn..." style="flex: 1; padding: 12px 16px; border: 2px solid #f0f0f0; border-radius: 24px; outline: none; font-size: 14px; color: ${TEXT_COLOR}; transition: border-color 0.2s;" />
        <button id="uknow-send" style="width: 44px; height: 44px; background: linear-gradient(135deg, ${PRIMARY_COLOR}, ${ACCENT_COLOR}); border: none; border-radius: 50%; color: white; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px ${PRIMARY_COLOR}40;">
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    `;
    const input = inputArea.querySelector('#uknow-input');
    const sendBtn = inputArea.querySelector('#uknow-send');
    const fileInput = inputArea.querySelector('#uknow-file');
    const attachBtn = inputArea.querySelector('#uknow-attach');

    // Style input focus
    input.addEventListener('focus', () => { input.style.borderColor = PRIMARY_COLOR; });
    input.addEventListener('blur', () => { input.style.borderColor = '#f0f0f0'; });

    sendBtn.onclick = () => sendMessage(input.value);
    input.onkeypress = (e) => { if (e.key === 'Enter') sendMessage(input.value); };

    if (attachBtn && fileInput) {
      attachBtn.onclick = () => fileInput.click();
      fileInput.onchange = async () => {
        const files = Array.from(fileInput.files || []);
        fileInput.value = '';
        if (!files.length) return;
        const room = 3 - pendingAttachments.length;
        for (const file of files.slice(0, Math.max(0, room))) {
          try {
            const fd = new FormData();
            fd.append('file', file);
            fd.append('sessionId', sessionId);
            const res = await fetch(`${API_BASE}/api/chatbot-public/custom-chatbot/${WIDGET_KEY}/attachment`, {
              method: 'POST',
              body: fd,
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.message || 'Upload failed');
            pendingAttachments.push(data.data);
            renderAttachChips();
          } catch (err) {
            alert(err.message || 'Tải file thất bại');
          }
        }
      };
    }

    function renderAttachChips() {
      const box = document.getElementById('uknow-attach-chips');
      if (!box) return;
      box.replaceChildren();
      if (!pendingAttachments.length) {
        box.style.display = 'none';
        return;
      }
      box.style.display = 'flex';
      pendingAttachments.forEach((a, i) => {
        const span = document.createElement('span');
        span.style.cssText = 'font-size:11px;padding:4px 8px;background:#f3f4f6;border-radius:8px;';
        span.appendChild(document.createTextNode(`${a.displayName || a.name || 'file'} `));
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = '×';
        btn.style.cssText = 'border:none;background:transparent;cursor:pointer;';
        btn.onclick = () => {
          pendingAttachments.splice(i, 1);
          renderAttachChips();
        };
        span.appendChild(btn);
        box.appendChild(span);
      });
    }

    chatWindow.appendChild(header);
    chatWindow.appendChild(msgArea);
    chatWindow.appendChild(inputArea);
    container.appendChild(bubble);
    if (launcherLabelEl) container.appendChild(launcherLabelEl);
    container.appendChild(chatWindow);
    document.body.appendChild(container);

    // Load welcome message
    if (messages.length === 0) {
      addMessage('bot', WELCOME_MSG);
    } else {
      messages.forEach(m => addMessage(m.role, m.content, false, { attachments: m.attachments }));
    }

    // Tab ẩn → dừng hỏi tin mới; tab hiện lại (khung đang mở) → hỏi ngay một lượt rồi tiếp tục chu kỳ.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stopPolling();
      else startPolling({ immediate: true });
    });
  }

  function toggleChat() {
    isOpen = !isOpen;
    const chatWindow = document.getElementById('uknow-window');
    const bubble = document.getElementById('uknow-bubble');
    const launcherLabelEl = document.getElementById('uknow-launcher-label');

    if (isOpen) {
      chatWindow.style.display = 'flex';
      bubble.innerHTML = `<svg width="24" height="24" fill="white" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`;
      bubble.style.transform = 'rotate(90deg)';
      if (launcherLabelEl) launcherLabelEl.style.display = 'none';
      startPolling({ immediate: true });
    } else {
      stopPolling();
      chatWindow.style.display = 'none';
      bubble.innerHTML = `<svg width="28" height="28" fill="white" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>`;
      bubble.style.transform = 'rotate(0deg)';
      if (launcherLabelEl) launcherLabelEl.style.display = 'flex';
    }
  }

  // Tự mở khung chat: mỗi PHIÊN trình duyệt đúng 1 lần (cờ trong sessionStorage).
  // Landing sandbox (iframe không allow-same-origin) ném SecurityError khi chạm sessionStorage —
  // ở đó KHÔNG tự mở, vì không nhớ được đã mở thì sẽ mở lại mỗi lần tải trang. Không dùng
  // memoryStore như localStorage: bộ nhớ trang mất khi tải lại nên không chứng minh được "1 lần/phiên".
  function maybeAutoOpen() {
    if (!AUTO_OPEN) return;
    if (window.innerWidth < AUTO_OPEN_MIN_WIDTH) return;
    const flagKey = 'uknow_autoopen_' + WIDGET_KEY;
    try {
      if (window.sessionStorage.getItem(flagKey)) return;
    } catch (err) {
      return;
    }
    setTimeout(function () {
      if (isOpen) return; // khách đã tự mở trong 2 giây đầu
      try {
        window.sessionStorage.setItem(flagKey, '1');
      } catch (err) {
        return;
      }
      toggleChat();
    }, AUTO_OPEN_DELAY_MS);
  }

  /**
   * Render text with clickable links safely using DOM APIs (no innerHTML).
   * Logic synchronized with frontend/src/utils/renderTextWithLinks.jsx.
   */
  function appendTextWithLinks(container, text) {
    if (!text) return;
    const regex = /(https?:\/\/[^\s"<>]+)/g;
    const rawParts = String(text).split(regex);

    for (let i = 0; i < rawParts.length; i++) {
      const part = rawParts[i];
      if (!part) continue;

      if (part.startsWith('http://') || part.startsWith('https://')) {
        let url = part;
        let trailing = '';

        while (url.length > 0) {
          const lastChar = url[url.length - 1];
          if (/[.,!?:;"'>»]/.test(lastChar)) {
            trailing = lastChar + trailing;
            url = url.slice(0, -1);
          } else if (lastChar === ')' && (url.split(')').length - 1) > (url.split('(').length - 1)) {
            trailing = lastChar + trailing;
            url = url.slice(0, -1);
          } else if (lastChar === ']' && (url.split(']').length - 1) > (url.split('[').length - 1)) {
            trailing = lastChar + trailing;
            url = url.slice(0, -1);
          } else if (lastChar === '}' && (url.split('}').length - 1) > (url.split('{').length - 1)) {
            trailing = lastChar + trailing;
            url = url.slice(0, -1);
          } else {
            break;
          }
        }

        if (url) {
          const a = document.createElement('a');
          a.href = url;
          a.textContent = url;
          a.target = '_blank';
          a.rel = 'noopener noreferrer';
          a.style.textDecoration = 'underline';
          a.style.wordBreak = 'break-all';
          a.style.color = 'inherit';
          container.appendChild(a);
        }
        if (trailing) {
          container.appendChild(document.createTextNode(trailing));
        }
      } else {
        container.appendChild(document.createTextNode(part));
      }
    }
  }

  // Tệp nhân viên đính kèm: chỉ giữ link http(s) (URL do server dựng; vẫn lọc để không bao giờ gắn javascript:/data: vào href).
  function safeAttachmentList(raw) {
    const out = [];
    (Array.isArray(raw) ? raw : []).forEach(function (a) {
      if (!a || typeof a.url !== 'string' || !/^https?:\/\//i.test(a.url)) return;
      out.push({ url: a.url, displayName: String(a.displayName || a.name || 'Tệp đính kèm').slice(0, 120) });
    });
    return out.slice(0, 5);
  }

  // role: 'user' | 'assistant' | 'bot' | 'agent' (nhân viên trả lời tay — hiện như bong bóng của bot, kèm nhãn "Nhân viên").
  // extra (chỉ cho 'agent'): { id, attachments }.
  function addMessage(role, content, save = true, extra) {
    const msgArea = document.getElementById('uknow-messages');
    if (!msgArea) return;
    const attachments = role === 'agent' ? safeAttachmentList(extra && extra.attachments) : [];

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
    if (role === 'agent') {
      const label = document.createElement('div');
      label.setAttribute('data-uknow-agent-label', '1');
      label.style.cssText = 'font-size: 11px; font-weight: 600; opacity: 0.65; margin-bottom: 4px; white-space: normal;';
      label.textContent = AGENT_LABEL;
      msg.appendChild(label);
    }
    appendTextWithLinks(msg, content);
    attachments.forEach(function (a) {
      const line = document.createElement('div');
      line.style.cssText = 'margin-top: 6px; white-space: normal;';
      const link = document.createElement('a');
      link.href = a.url;
      link.textContent = '📎 ' + a.displayName;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.style.cssText = 'text-decoration: underline; word-break: break-all; color: inherit;';
      line.appendChild(link);
      msg.appendChild(line);
    });
    msgArea.appendChild(msg);
    msgArea.scrollTop = msgArea.scrollHeight;

    if (save) {
      const entry = { role, content };
      if (role === 'agent') {
        if (extra && extra.id) entry.id = String(extra.id);
        if (attachments.length) entry.attachments = attachments;
      }
      messages.push(entry);
      storage.set('uknow_msgs_' + WIDGET_KEY, JSON.stringify(messages.slice(-50)));
    }
  }

  // ── Hỏi tin nhân viên trả lời tay ─────────────────────────────────

  function hasSentMessage() {
    return messages.some(function (m) { return m && m.role === 'user'; });
  }

  // Khung chat đang HIỂN THỊ (không chỉ cờ isOpen: nút "─" thu nhỏ ẩn khung mà không đảo isOpen), tab đang xem, và khách đã nhắn
  // ít nhất một tin (chưa nhắn thì chưa có hội thoại nào để nhận).
  function shouldPoll() {
    const w = document.getElementById('uknow-window');
    return isOpen && !!w && w.style.display !== 'none' && !document.hidden && hasSentMessage();
  }

  function stopPolling() {
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function schedulePoll(delayMs) {
    stopPolling();
    if (!shouldPoll()) return;
    pollTimer = setTimeout(pollOnce, delayMs);
  }

  // immediate: true → hỏi ngay (vừa mở khung / tab hiện lại); mặc định chờ một chu kỳ (vừa gửi tin đầu tiên, hội thoại đang được tạo).
  function startPolling(opts) {
    if (pollInFlight || !shouldPoll()) return;
    schedulePoll(opts && opts.immediate ? 0 : POLL_INTERVAL_MS);
  }

  function showAgentMessage(m) {
    if (!m || m.id === undefined || m.id === null) return;
    const id = String(m.id);
    if (!/^\d{1,18}$/.test(id)) return;
    if (idGreater(id, lastAgentId)) {
      lastAgentId = id;
      storage.set(AFTER_KEY, id);
    }
    if (seenAgentIds[id]) return; // đã hiện (theo id) — không hiện lại
    seenAgentIds[id] = true;
    const content = typeof m.content === 'string' ? m.content : '';
    const hasFiles = safeAttachmentList(m.attachments).length > 0;
    if (!content && !hasFiles) return;
    addMessage('agent', content, true, { id: id, attachments: m.attachments });
    if (content) {
      // Câu của nhân viên là một phần hội thoại: nếu AI được bật lại, nó phải thấy nhân viên đã nói gì.
      chatHistory.push({ role: 'assistant', content: content });
      storage.set('uknow_history_' + WIDGET_KEY, JSON.stringify(chatHistory.slice(-20)));
    }
  }

  async function pollOnce() {
    pollTimer = null;
    if (pollInFlight || !shouldPoll()) return;
    pollInFlight = true;
    let nextDelay = POLL_INTERVAL_MS;
    try {
      const url = API_BASE + '/api/chatbot-public/custom-chatbot/' + encodeURIComponent(WIDGET_KEY)
        + '/messages?sessionId=' + encodeURIComponent(sessionId) + '&afterId=' + encodeURIComponent(lastAgentId);
      const res = await fetch(url, { method: 'GET', cache: 'no-store' });
      if (!res.ok) throw new Error('poll http ' + res.status);
      const body = await res.json();
      if (!body || body.success !== true || !body.data || !Array.isArray(body.data.messages)) {
        throw new Error('poll bad body');
      }
      pollErrorCount = 0;
      body.data.messages.forEach(showAgentMessage);
      if (body.data.hasMore) nextDelay = POLL_MORE_MS;
    } catch (err) {
      pollErrorCount += 1;
      nextDelay = POLL_BACKOFF_MS[Math.min(pollErrorCount, POLL_BACKOFF_MS.length) - 1];
    } finally {
      pollInFlight = false;
    }
    schedulePoll(nextDelay);
  }

  async function sendMessage(text) {
    if (!text?.trim() && pendingAttachments.length === 0) return;

    const input = document.getElementById('uknow-input');
    input.value = '';
    const attachmentsToSend = pendingAttachments.slice();
    pendingAttachments = [];
    const chips = document.getElementById('uknow-attach-chips');
    if (chips) { chips.style.display = 'none'; chips.innerHTML = ''; }

    const userText = text?.trim() || '';
    addMessage('user', userText || '[Đính kèm]');
    chatHistory.push({ role: 'user', content: userText || '[Đính kèm]', attachments: attachmentsToSend });
    startPolling(); // tin đầu tiên → hội thoại được tạo; từ đây có thể có nhân viên trả lời tay

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
          message: userText,
          history: chatHistory.slice(-10),
          sessionId: sessionId,
          attachments: attachmentsToSend,
        }),
      });

      const data = await res.json();
      typing.remove();

      if (data.success && data.data) {
        // Rate-limited silent (minute/hour): no bubble, no localStorage ghost
        if (data.data.rateLimited && !data.data.content) {
          return;
        }
        if (data.data.content) {
          addMessage('assistant', data.data.content);
          chatHistory.push({ role: 'assistant', content: data.data.content });
          storage.set('uknow_history_' + WIDGET_KEY, JSON.stringify(chatHistory.slice(-20)));
        }
      } else {
        // Show error from server or default message
        const errorMsg = data.message || data.error?.message || 'Xin lỗi, tôi đang bận. Vui lòng thử lại sau.';
        addMessage('bot', errorMsg);
      }
    } catch (err) {
      typing.remove();
      // Check for timeout/network errors
      const isNetworkError = err.name === 'TypeError' || err.message.includes('Failed to fetch') || err.message.includes('NetworkError');
      const errorMsg = isNetworkError
        ? 'Mất kết nối mạng. Vui lòng kiểm tra internet và thử lại.'
        : 'Không thể kết nối với server. Vui lòng thử lại sau.';
      addMessage('bot', errorMsg);
      pendingAttachments = attachmentsToSend;
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
    maybeAutoOpen();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
