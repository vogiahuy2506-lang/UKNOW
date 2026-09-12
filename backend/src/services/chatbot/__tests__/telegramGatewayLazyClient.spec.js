import { jest } from '@jest/globals';

/**
 * Ghim: import telegramGateway.client.js KHÔNG được gọi axios.create.
 *
 * Sự cố 12/09/2026 — file này dựng `axios.create({...})` ngay ở thân module. Nó nằm trong cây
 * import của createApp() (chatbot.controller.js → telegramPersonal.service.js → file này), nên
 * mọi suite integration mock axios một phần đều chết ở bước import:
 *
 *     TypeError: axios.create is not a function
 *       at src/services/chatbot/telegramGateway.client.js:27:22
 *
 * Ba suite dính: courses / founderai / googleSheets — cả ba mock `{ default: { get } }` vì
 * chúng chỉ cần axios.get. Hậu quả không nằm ở test: job `test` là cổng chặn của Deploy Backend,
 * nên backend production đứng lại ở bản cũ trong khi frontend vẫn deploy được.
 *
 * Ca đầu tiên dưới đây tái hiện đúng hình dạng mock đó. Nó đỏ với bản cũ, xanh với getClient().
 */

const axiosCreate = jest.fn(() => ({ get: jest.fn(), post: jest.fn(), delete: jest.fn() }));

// Mock giống hệt ba suite integration kia — CHỈ có `get`, không có `create`; `create` được
// gắn thêm ở đây chỉ để đếm số lần gọi, còn phép thử thật là bước import bên dưới.
jest.unstable_mockModule('axios', () => ({
  default: { get: jest.fn(), create: axiosCreate },
}));

describe('telegramGateway.client — client dựng lười (lazy)', () => {
  it('import module không gọi axios.create (chỗ từng làm đỏ 3 suite integration)', async () => {
    const { default: telegramGateway } = await import('../telegramGateway.client.js');

    expect(axiosCreate).not.toHaveBeenCalled();
    // Module vẫn dùng được ngay sau import — đây là thứ createApp() cần.
    expect(typeof telegramGateway.isConfigured).toBe('function');
  });

  it('chưa cấu hình gateway thì ném lỗi cấu hình, KHÔNG chạm tới axios.create', async () => {
    const { default: telegramGateway } = await import('../telegramGateway.client.js');

    // TELEGRAM_GATEWAY_URL/SECRET không đặt trong môi trường test → isConfigured() false, và
    // wrap() chặn trước khi tới getClient(). Nếu ai đó dựng client lại ở thân module thì ca
    // trên đã đỏ; ca này canh nốt nhánh còn lại.
    expect(telegramGateway.isConfigured()).toBe(false);
    await expect(telegramGateway.listAccounts()).rejects.toThrow(
      'Telegram gateway is not configured on the backend'
    );
    expect(axiosCreate).not.toHaveBeenCalled();
  });
});
