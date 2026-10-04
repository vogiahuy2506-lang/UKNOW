/**
 * widget.js — nhận tin NHÂN VIÊN TRẢ LỜI TAY (H-02, PLAN_WEBCHAT_NHAN_TIN_TRA_LOI_TAY_2026-10-04).
 *
 * Hộp thư của chủ shop chỉ lưu tin vào hội thoại web, không có kênh ngoài để đẩy tới khách → widget tự hỏi
 * GET /api/chatbot-public/custom-chatbot/:key/messages?sessionId&afterId khi khung chat đang mở. Chạy THẬT widget.js trong jsdom
 * (cùng cách widgetAutoOpen.spec.js): chu kỳ 8 giây; dừng khi khung đóng / thu nhỏ / tab ẩn / khách chưa nhắn; lỗi → giãn
 * 16/32/60 giây; không hiện trùng theo id; sessionId phiên mới sinh bằng crypto; landing sandbox (localStorage ném lỗi) vẫn chạy.
 *
 * Mỗi ca dùng token riêng: widget.js đã eval ở ca trước còn nghe `visibilitychange` trên document, nên mọi phép đếm lọc theo token.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WIDGET_SOURCE = fs.readFileSync(path.resolve(__dirname, '../../../public/widget.js'), 'utf8');

let tokenSeq = 0;
const nextToken = () => `wk_poll_${Date.now()}_${tokenSeq += 1}`;

const agentMsg = (id, content = `tin ${id}`, attachments = []) => ({
  id: String(id), role: 'agent', content, attachments, createdAt: '2026-10-04T03:00:00.000Z',
});
const okPoll = (messages = [], hasMore = false) => ({
  ok: true, status: 200, json: async () => ({ success: true, data: { messages, hasMore } }),
});

/**
 * Dựng widget.js thật. `pollHandler(url)` trả phản hồi cho GET .../messages; `/config` trả cấu hình tối thiểu;
 * `/chat` trả một câu AI. `stored` nạp sẵn vào localStorage (giả khách quay lại).
 */
async function mountWidget({ token = nextToken(), stored = {}, pollHandler = () => okPoll() } = {}) {
  localStorage.clear();
  Object.entries(stored).forEach(([k, v]) => localStorage.setItem(`${k}${token}`, typeof v === 'string' ? v : JSON.stringify(v)));
  window.customChatbotConfig = { token, baseUrl: '' };

  const pollUrls = [];
  const fetchMock = vi.fn(async (url) => {
    const u = String(url);
    if (u.includes(`/${token}/messages`)) {
      pollUrls.push(u);
      return pollHandler(u, pollUrls.length);
    }
    if (u.includes(`/${token}/chat`)) {
      return { ok: true, status: 200, json: async () => ({ success: true, data: { role: 'assistant', content: 'Dạ em chào anh' } }) };
    }
    if (u.includes(`/${token}/config`)) {
      return { ok: true, status: 200, json: async () => ({ success: true, data: { name: 'Bot' } }) };
    }
    return okPoll(); // widget của ca trước (token khác) còn nghe visibilitychange: cho phản hồi rỗng, không ảnh hưởng ca này
  });
  vi.stubGlobal('fetch', fetchMock);

  eval(WIDGET_SOURCE);
  for (let i = 0; i < 50 && !document.getElementById('uknow-window'); i += 1) {
    await Promise.resolve();
  }
  expect(document.getElementById('uknow-window')).toBeTruthy();
  return { token, pollUrls, fetchMock };
}

const openChat = () => document.getElementById('uknow-bubble').click();
const settle = (ms = 1) => vi.advanceTimersByTimeAsync(ms);
const agentBubbles = () => Array.from(document.querySelectorAll('#uknow-messages [data-uknow-agent-label]')).map((l) => l.parentElement);
const KHACH_DA_NHAN = [{ role: 'user', content: 'Cho mình hỏi giá' }];

async function sendFromUi(text) {
  document.getElementById('uknow-input').value = text;
  document.getElementById('uknow-send').click();
  await settle(1);
}

let hidden = false;
function setHidden(value) {
  hidden = value;
  document.dispatchEvent(new Event('visibilitychange'));
}

describe('widget.js — poll tin nhân viên trả lời tay', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    document.getElementById('uknow-style')?.remove();
    hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    sessionStorage.clear();
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete document.hidden;
  });

  it('khách chưa nhắn tin nào: mở khung 60 giây vẫn KHÔNG hỏi (chưa có hội thoại để nhận)', async () => {
    const { pollUrls } = await mountWidget();
    openChat();
    await settle(60000);
    expect(pollUrls).toHaveLength(0);
  });

  it('khách quay lại (đã có tin) mở khung → hỏi NGAY, URL mang sessionId + afterId=0, rồi cứ 8 giây một lần', async () => {
    const token = nextToken();
    const { pollUrls } = await mountWidget({
      token,
      stored: { uknow_msgs_: KHACH_DA_NHAN, uknow_session_: 'sess_0123456789abcdef0123456789abcdef' },
    });
    openChat();
    await settle(1);
    expect(pollUrls).toHaveLength(1);
    const first = new URL(pollUrls[0], 'http://x');
    expect(first.pathname).toBe(`/api/chatbot-public/custom-chatbot/${token}/messages`);
    expect(first.searchParams.get('sessionId')).toBe('sess_0123456789abcdef0123456789abcdef');
    expect(first.searchParams.get('afterId')).toBe('0');

    await settle(7900);
    expect(pollUrls).toHaveLength(1);
    await settle(200);
    expect(pollUrls).toHaveLength(2);
    await settle(8000);
    expect(pollUrls).toHaveLength(3);
  });

  it('tin nhân viên hiện như bong bóng bot kèm nhãn "Nhân viên"; hiện đúng một lần dù server trả lại cùng id; afterId = id cuối', async () => {
    let call = 0;
    const { pollUrls } = await mountWidget({
      stored: { uknow_msgs_: KHACH_DA_NHAN },
      pollHandler: () => {
        call += 1;
        if (call === 1) return okPoll([agentMsg(41, 'Em là nhân viên, em báo giá ưu đãi ạ')]);
        if (call === 2) return okPoll([agentMsg(41, 'Em là nhân viên, em báo giá ưu đãi ạ'), agentMsg(42, 'Anh để lại số em gọi nhé')]);
        return okPoll([]);
      },
    });
    openChat();
    await settle(1);

    expect(agentBubbles()).toHaveLength(1);
    expect(agentBubbles()[0].textContent).toContain('Nhân viên');
    expect(agentBubbles()[0].textContent).toContain('Em là nhân viên, em báo giá ưu đãi ạ');

    await settle(8000);
    // Lượt 2 hỏi tiếp từ id 41; server (giả) trả lại cả 41 → vẫn không hiện đúp, chỉ thêm 42.
    expect(new URL(pollUrls[1], 'http://x').searchParams.get('afterId')).toBe('41');
    expect(agentBubbles()).toHaveLength(2);
    expect(agentBubbles()[1].textContent).toContain('Anh để lại số em gọi nhé');

    await settle(8000);
    expect(new URL(pollUrls[2], 'http://x').searchParams.get('afterId')).toBe('42');
    expect(agentBubbles()).toHaveLength(2);
  });

  it('tin nhân viên được lưu (id + nhãn còn sau khi tải lại trang) và afterId nhớ qua lần tải lại', async () => {
    const token = nextToken();
    await mountWidget({
      token,
      stored: { uknow_msgs_: KHACH_DA_NHAN },
      pollHandler: () => okPoll([agentMsg(77, 'Dạ em xin chào')]),
    });
    openChat();
    await settle(1);
    expect(localStorage.getItem(`uknow_agentafter_${token}`)).toBe('77');

    // Tải lại trang: dựng lại widget với đúng storage đang có.
    const savedMsgs = localStorage.getItem(`uknow_msgs_${token}`);
    const savedAfter = localStorage.getItem(`uknow_agentafter_${token}`);
    const savedSession = localStorage.getItem(`uknow_session_${token}`);
    document.body.innerHTML = '';
    const second = await mountWidget({
      token,
      stored: { uknow_msgs_: savedMsgs, uknow_agentafter_: savedAfter, uknow_session_: savedSession },
    });
    expect(agentBubbles()).toHaveLength(1); // dựng lại từ storage, có nhãn
    openChat();
    await settle(1);
    expect(new URL(second.pollUrls[0], 'http://x').searchParams.get('afterId')).toBe('77');
  });

  it('đóng khung → dừng hỏi; mở lại → hỏi ngay', async () => {
    const { pollUrls } = await mountWidget({ stored: { uknow_msgs_: KHACH_DA_NHAN } });
    openChat();
    await settle(1);
    await settle(8000);
    expect(pollUrls).toHaveLength(2);

    openChat(); // đóng
    await settle(60000);
    expect(pollUrls).toHaveLength(2);

    openChat(); // mở lại
    await settle(1);
    expect(pollUrls).toHaveLength(3);
  });

  it('nút thu nhỏ "─" (ẩn khung nhưng isOpen vẫn true) → dừng hỏi', async () => {
    const { pollUrls } = await mountWidget({ stored: { uknow_msgs_: KHACH_DA_NHAN } });
    openChat();
    await settle(1);
    expect(pollUrls).toHaveLength(1);

    document.getElementById('uknow-minimize').click();
    await settle(60000);
    expect(pollUrls).toHaveLength(1);
  });

  it('tab ẩn → dừng; tab hiện lại → hỏi ngay', async () => {
    const { pollUrls } = await mountWidget({ stored: { uknow_msgs_: KHACH_DA_NHAN } });
    openChat();
    await settle(1);
    expect(pollUrls).toHaveLength(1);

    setHidden(true);
    await settle(60000);
    expect(pollUrls).toHaveLength(1);

    setHidden(false);
    await settle(1);
    expect(pollUrls).toHaveLength(2);
  });

  it('khách chưa từng nhắn: gửi tin đầu tiên từ khung đang mở → bắt đầu hỏi sau một chu kỳ 8 giây', async () => {
    const { pollUrls } = await mountWidget();
    openChat();
    await sendFromUi('Cho mình hỏi giá');
    expect(pollUrls).toHaveLength(0);
    await settle(7900);
    expect(pollUrls).toHaveLength(0);
    await settle(200);
    expect(pollUrls).toHaveLength(1);
  });

  it('lỗi liên tiếp → giãn 16 → 32 → 60 → 60 giây; thành công → về lại 8 giây', async () => {
    let call = 0;
    const { pollUrls } = await mountWidget({
      stored: { uknow_msgs_: KHACH_DA_NHAN },
      pollHandler: () => {
        call += 1;
        if (call <= 4) return { ok: false, status: 500, json: async () => ({}) };
        return okPoll([]);
      },
    });
    openChat();
    await settle(1);
    expect(pollUrls).toHaveLength(1); // lỗi 1 → chờ 16 giây

    await settle(15900);
    expect(pollUrls).toHaveLength(1);
    await settle(200);
    expect(pollUrls).toHaveLength(2); // lỗi 2 → chờ 32 giây

    await settle(31800);
    expect(pollUrls).toHaveLength(2);
    await settle(200);
    expect(pollUrls).toHaveLength(3); // lỗi 3 → chờ 60 giây

    await settle(59800);
    expect(pollUrls).toHaveLength(3);
    await settle(200);
    expect(pollUrls).toHaveLength(4); // lỗi 4 → vẫn 60 giây (không giãn quá)

    await settle(59800);
    expect(pollUrls).toHaveLength(4);
    await settle(200);
    expect(pollUrls).toHaveLength(5); // lượt 5 thành công → chu kỳ về 8 giây

    await settle(8100);
    expect(pollUrls).toHaveLength(6);
  });

  it('mất mạng (fetch ném lỗi) cũng giãn như lỗi HTTP, không văng ra ngoài', async () => {
    const { pollUrls } = await mountWidget({
      stored: { uknow_msgs_: KHACH_DA_NHAN },
      pollHandler: () => { throw new TypeError('Failed to fetch'); },
    });
    openChat();
    await settle(1);
    expect(pollUrls).toHaveLength(1);
    await settle(15900);
    expect(pollUrls).toHaveLength(1);
    await settle(200);
    expect(pollUrls).toHaveLength(2);
  });

  it('server báo hasMore → hỏi lại sau 1 giây thay vì 8 giây', async () => {
    let call = 0;
    const { pollUrls } = await mountWidget({
      stored: { uknow_msgs_: KHACH_DA_NHAN },
      pollHandler: () => {
        call += 1;
        return call === 1 ? okPoll([agentMsg(1), agentMsg(2)], true) : okPoll([]);
      },
    });
    openChat();
    await settle(1);
    expect(pollUrls).toHaveLength(1);
    await settle(1100);
    expect(pollUrls).toHaveLength(2);
    expect(new URL(pollUrls[1], 'http://x').searchParams.get('afterId')).toBe('2');
  });

  it('nội dung nhân viên KHÔNG bao giờ thành HTML; tệp đính kèm chỉ nhận link http(s) (javascript: bị bỏ)', async () => {
    await mountWidget({
      stored: { uknow_msgs_: KHACH_DA_NHAN },
      pollHandler: () => okPoll([
        agentMsg(5, '<img src=x onerror="window.__pwned=1"> <b>đậm</b>', [
          { url: 'https://example.com/bao-gia.pdf', displayName: 'bao-gia.pdf' },
          { url: 'javascript:window.__pwned=2', displayName: 'độc' },
          { url: 'data:text/html;base64,AAAA', displayName: 'độc 2' },
        ]),
      ]),
    });
    openChat();
    await settle(1);

    const bubble = agentBubbles()[0];
    expect(bubble.querySelector('img')).toBeNull();
    expect(bubble.querySelector('b')).toBeNull();
    expect(bubble.textContent).toContain('<img src=x onerror=');
    const links = Array.from(bubble.querySelectorAll('a'));
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['https://example.com/bao-gia.pdf']);
    expect(links[0].rel).toContain('noopener');
    expect(window.__pwned).toBeUndefined();
  });

  it('nhân viên chỉ gửi tệp (không chữ) vẫn hiện bong bóng; tin rỗng hoàn toàn thì bỏ qua nhưng afterId vẫn tiến', async () => {
    const token = nextToken();
    await mountWidget({
      token,
      stored: { uknow_msgs_: KHACH_DA_NHAN },
      pollHandler: () => okPoll([
        agentMsg(8, '', [{ url: 'https://example.com/a.pdf', displayName: 'a.pdf' }]),
        agentMsg(9, '', []),
      ]),
    });
    openChat();
    await settle(1);
    expect(agentBubbles()).toHaveLength(1);
    expect(agentBubbles()[0].querySelector('a').getAttribute('href')).toBe('https://example.com/a.pdf');
    expect(localStorage.getItem(`uknow_agentafter_${token}`)).toBe('9');
  });

  it('thân phản hồi sai hình dạng → coi là lỗi (giãn 16 giây), không hiện gì', async () => {
    const { pollUrls } = await mountWidget({
      stored: { uknow_msgs_: KHACH_DA_NHAN },
      pollHandler: () => ({ ok: true, status: 200, json: async () => ({ success: true, data: { messages: 'x' } }) }),
    });
    openChat();
    await settle(1);
    expect(agentBubbles()).toHaveLength(0);
    await settle(8100);
    expect(pollUrls).toHaveLength(1);
    await settle(8000);
    expect(pollUrls).toHaveLength(2);
  });

  it('câu của nhân viên vào chatHistory (AI bật lại còn thấy nhân viên đã nói gì)', async () => {
    const token = nextToken();
    await mountWidget({
      token,
      stored: { uknow_msgs_: KHACH_DA_NHAN },
      pollHandler: () => okPoll([agentMsg(3, 'Em giữ hàng cho anh nhé')]),
    });
    openChat();
    await settle(1);
    const history = JSON.parse(localStorage.getItem(`uknow_history_${token}`));
    expect(history).toEqual([{ role: 'assistant', content: 'Em giữ hàng cho anh nhé' }]);
  });
});

describe('widget.js — sessionId', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    document.getElementById('uknow-style')?.remove();
    sessionStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('phiên MỚI: sess_ + 32 ký tự hex (128 bit từ crypto), mỗi lần một giá trị khác; Math.random không được dùng', async () => {
    const randomSpy = vi.spyOn(Math, 'random');
    const a = await mountWidget();
    const idA = localStorage.getItem(`uknow_session_${a.token}`);
    document.body.innerHTML = '';
    const b = await mountWidget();
    const idB = localStorage.getItem(`uknow_session_${b.token}`);

    expect(idA).toMatch(/^sess_[0-9a-f]{32}$/);
    expect(idB).toMatch(/^sess_[0-9a-f]{32}$/);
    expect(idA).not.toBe(idB);
    expect(randomSpy).not.toHaveBeenCalled();
  });

  it('phiên CŨ trong storage được giữ nguyên (không mất hội thoại đang dở)', async () => {
    const { token } = await mountWidget({ stored: { uknow_session_: 'sess_1790000000000_k3j9x0q2a' } });
    expect(localStorage.getItem(`uknow_session_${token}`)).toBe('sess_1790000000000_k3j9x0q2a');
  });

  it('không có crypto.getRandomValues → vẫn sinh được sessionId đủ dài (dự phòng), không chết widget', async () => {
    vi.stubGlobal('crypto', undefined);
    const { token } = await mountWidget();
    const id = localStorage.getItem(`uknow_session_${token}`);
    expect(id.length).toBeGreaterThanOrEqual(16);
    expect(document.getElementById('uknow-widget')).toBeTruthy();
  });
});

describe('widget.js — landing sandbox (localStorage ném SecurityError)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = '';
    document.getElementById('uknow-style')?.remove();
    sessionStorage.clear();
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete document.hidden;
  });

  it('vẫn nhận tin nhân viên: phiên + afterId giữ trong bộ nhớ trang, không ném lỗi', async () => {
    const denied = () => { throw new DOMException('denied', 'SecurityError'); };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(denied);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(denied);

    let call = 0;
    const { pollUrls } = await mountWidget({
      pollHandler: () => {
        call += 1;
        return call === 1 ? okPoll([agentMsg(12, 'Chào bạn, mình là nhân viên')]) : okPoll([]);
      },
    });
    openChat();
    await sendFromUi('Cho mình hỏi giá');
    await settle(8100);

    expect(pollUrls).toHaveLength(1);
    const sessionId = new URL(pollUrls[0], 'http://x').searchParams.get('sessionId');
    expect(sessionId).toMatch(/^sess_[0-9a-f]{32}$/);
    expect(agentBubbles()).toHaveLength(1);

    await settle(8000);
    expect(new URL(pollUrls[1], 'http://x').searchParams.get('afterId')).toBe('12');
    expect(new URL(pollUrls[1], 'http://x').searchParams.get('sessionId')).toBe(sessionId);
  });
});
