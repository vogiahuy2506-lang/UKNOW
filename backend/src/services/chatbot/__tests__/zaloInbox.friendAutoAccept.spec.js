/**
 * PLAN_ZALO_TU_DONG_DONG_Y_KET_BAN_2026-10-17 Việc 4 — `_registerSingleListener` phải gắn `friend_event` vào listener
 * HIỆN TẠI của nick, kể cả nick ĐÃ đăng ký nhận tin từ trước (nhánh "already registered (skipping)" `return true` sớm).
 * Gắn sau nhánh đó thì nick đã đăng ký không bao giờ nghe lời mời kết bạn — và production chỉ có nick như vậy sau
 * mỗi lượt cron 5 phút.
 */
import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import zaloPersonalInboxService from '../zaloInbox.service.js';
import zaloPersonalAdapter from '../channelAdapters/zaloPersonal.adapter.js';
import zaloFriendAutoAcceptService from '../../zalo/zaloFriendAutoAccept.service.js';
import { markAccountRegistered, unmarkAccountRegistered } from '../../zalo/zaloAccountRegistry.service.js';

const ACCOUNT_ID = 5;
const accountRow = { id_user: 10, account_id: ACCOUNT_ID };

const makeListener = () => ({ on: jest.fn() });

describe('zaloInbox._registerSingleListener — gắn friend_event cho tự động đồng ý kết bạn', () => {
  let attachSpy;
  let registerHandlerSpy;

  beforeEach(() => {
    zaloFriendAutoAcceptService._resetForTests();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(zaloPersonalInboxService, 'getZaloSettingId').mockResolvedValue(ACCOUNT_ID);
    jest.spyOn(zaloPersonalInboxService, 'createMessageHandler').mockReturnValue(async () => {});
    registerHandlerSpy = jest.spyOn(zaloPersonalAdapter, 'registerMessageHandler').mockResolvedValue(true);
    attachSpy = jest.spyOn(zaloFriendAutoAcceptService, 'attachToListener');
    unmarkAccountRegistered(ACCOUNT_ID);
  });

  afterEach(() => {
    unmarkAccountRegistered(ACCOUNT_ID);
    zaloFriendAutoAcceptService._resetForTests();
    jest.restoreAllMocks();
  });

  it('nick ĐÃ đăng ký nhận tin (nhánh skip) vẫn được gắn friend_event vào listener hiện tại', async () => {
    const listener = makeListener();
    jest.spyOn(zaloPersonalAdapter, 'getSessionByAccountId').mockResolvedValue({ api: { listener } });
    jest.spyOn(zaloPersonalAdapter, 'isHandlerAttachedTo').mockReturnValue(true);
    markAccountRegistered(ACCOUNT_ID);

    const ok = await zaloPersonalInboxService.registerAccountListener(ACCOUNT_ID, accountRow);

    expect(ok).toBe(true);
    // Đã đi qua nhánh skip: không đăng ký lại handler tin nhắn...
    expect(registerHandlerSpy).not.toHaveBeenCalled();
    // ...nhưng friend_event vẫn được gắn.
    expect(attachSpy).toHaveBeenCalledWith(ACCOUNT_ID, listener);
    expect(listener.on).toHaveBeenCalledWith('friend_event', expect.any(Function));
  });

  it('nick chưa đăng ký: gắn friend_event VÀ đăng ký handler tin nhắn', async () => {
    const listener = makeListener();
    jest.spyOn(zaloPersonalAdapter, 'getSessionByAccountId').mockResolvedValue({ api: { listener } });
    jest.spyOn(zaloPersonalAdapter, 'isHandlerAttachedTo').mockReturnValue(false);

    const ok = await zaloPersonalInboxService.registerAccountListener(ACCOUNT_ID, accountRow);

    expect(ok).toBe(true);
    expect(attachSpy).toHaveBeenCalledWith(ACCOUNT_ID, listener);
    expect(listener.on).toHaveBeenCalledWith('friend_event', expect.any(Function));
    expect(registerHandlerSpy).toHaveBeenCalledTimes(1);
  });

  it('cron 5 phút gọi lại nhiều lần với CÙNG listener -> friend_event chỉ gắn 1 lần (không chồng handler)', async () => {
    const listener = makeListener();
    jest.spyOn(zaloPersonalAdapter, 'getSessionByAccountId').mockResolvedValue({ api: { listener } });
    jest.spyOn(zaloPersonalAdapter, 'isHandlerAttachedTo').mockReturnValue(true);
    markAccountRegistered(ACCOUNT_ID);

    await zaloPersonalInboxService.registerAccountListener(ACCOUNT_ID, accountRow);
    await zaloPersonalInboxService.registerAccountListener(ACCOUNT_ID, accountRow);
    await zaloPersonalInboxService.registerAccountListener(ACCOUNT_ID, accountRow);

    expect(listener.on).toHaveBeenCalledTimes(1);
  });

  it('khôi phục phiên tạo listener MỚI -> gắn friend_event vào listener mới', async () => {
    const oldListener = makeListener();
    const newListener = makeListener();
    const session = jest.spyOn(zaloPersonalAdapter, 'getSessionByAccountId');
    jest.spyOn(zaloPersonalAdapter, 'isHandlerAttachedTo').mockReturnValue(true);
    markAccountRegistered(ACCOUNT_ID);

    session.mockResolvedValue({ api: { listener: oldListener } });
    await zaloPersonalInboxService.registerAccountListener(ACCOUNT_ID, accountRow);
    session.mockResolvedValue({ api: { listener: newListener } });
    await zaloPersonalInboxService.registerAccountListener(ACCOUNT_ID, accountRow);

    expect(oldListener.on).toHaveBeenCalledTimes(1);
    expect(newListener.on).toHaveBeenCalledTimes(1);
  });

  it('không có phiên (không có listener) -> không gắn gì, không ném', async () => {
    jest.spyOn(zaloPersonalAdapter, 'getSessionByAccountId').mockResolvedValue(null);
    registerHandlerSpy.mockResolvedValue(false);

    await expect(zaloPersonalInboxService.registerAccountListener(ACCOUNT_ID, accountRow)).resolves.toBe(false);

    expect(attachSpy).not.toHaveBeenCalled();
  });

  it('gắn friend_event ném lỗi -> KHÔNG làm hỏng việc đăng ký nhận tin nhắn', async () => {
    const listener = makeListener();
    jest.spyOn(zaloPersonalAdapter, 'getSessionByAccountId').mockResolvedValue({ api: { listener } });
    jest.spyOn(zaloPersonalAdapter, 'isHandlerAttachedTo').mockReturnValue(false);
    attachSpy.mockImplementation(() => { throw new Error('boom'); });

    const ok = await zaloPersonalInboxService.registerAccountListener(ACCOUNT_ID, accountRow);

    expect(ok).toBe(true);
    expect(registerHandlerSpy).toHaveBeenCalledTimes(1);
  });
});
