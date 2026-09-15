import { describe, it, expect } from 'vitest';
import api from '../api';

/**
 * Sếp 14/09: đính kèm vài ảnh + PDF + DOCX trong chat trang soạn landing → "Tải tệp lên thất bại".
 *
 * ChatComposer/AiChatbot/SettingsModal tải NHIỀU tệp bằng Promise.all → nhiều POST song song cùng
 * URL /uploads/temp. Interceptor khử trùng dùng khoá method+url+params (không có body) nên lượt
 * sau abort lượt trước: chỉ tệp cuối lên server, Promise.all reject → UI báo hỏng toàn bộ.
 * Production khớp: 18:54 đúng 1 tệp .jpg tới server (bị dọn vì không ai dùng), 18:58 gửi 1 logo
 * lẻ thì chạy. Upload còn bị cắt ở timeout mặc định 10 giây dù backend nhận tới 100 MB/tệp.
 */

/** Adapter giả: trả 200 sau `delayMs`, ghi lại config mà axios thật sự dùng. */
function makeAdapter(seen, delayMs = 5) {
  return (config) =>
    new Promise((resolve) => {
      seen.push(config);
      setTimeout(() => {
        resolve({ data: { success: true, data: { url: config.url } }, status: 200, statusText: 'OK', headers: {}, config });
      }, delayMs);
    });
}

function makeFormData(name) {
  const fd = new FormData();
  fd.append('file', new File(['x'], name));
  return fd;
}

describe('api.js — upload FormData không bị khử trùng / cắt 10 giây', () => {
  it('3 tệp tải song song cùng /uploads/temp → cả 3 đều thành công, không lượt nào bị huỷ', async () => {
    const seen = [];
    const adapter = makeAdapter(seen);

    const results = await Promise.allSettled(
      ['a.png', 'b.pdf', 'c.docx'].map((name) =>
        api.post('/uploads/temp', makeFormData(name), { adapter })
      )
    );

    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'fulfilled']);
  });

  it('upload không truyền timeout → được nới thành 5 phút; truyền timeout riêng thì giữ nguyên', async () => {
    const seen = [];
    const adapter = makeAdapter(seen, 0);

    await api.post('/uploads/temp', makeFormData('big.pdf'), { adapter });
    await api.post('/uploads/temp', makeFormData('small.png'), { adapter, timeout: 5000 });

    expect(seen[0].timeout).toBe(5 * 60 * 1000);
    expect(seen[1].timeout).toBe(5000);
  });

  it('request JSON thường vẫn giữ timeout 10 giây và vẫn khử trùng lượt GET trùng đang bay', async () => {
    const seen = [];
    const adapter = makeAdapter(seen, 10);

    const results = await Promise.allSettled([
      api.get('/plans', { adapter }),
      api.get('/plans', { adapter }),
    ]);

    expect(results[0].status).toBe('rejected');
    expect(results[0].reason?.name).toBe('CanceledError');
    expect(results[1].status).toBe('fulfilled');
    expect(seen[seen.length - 1].timeout).toBe(10000);
  });
});
