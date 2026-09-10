import { jest, describe, it, expect, beforeEach } from '@jest/globals';

/**
 * Ghim THỨ TỰ phân loại lỗi SMTP, không phải bản thân từng hàm phân loại.
 *
 * Bối cảnh: appliance chống spam MagicSpam trước hộp thư trả **550** — mã vĩnh viễn — cho
 * một lần chặn **tạm thời**, kèm câu "try again later". Hai hàm phân loại nhìn cùng lỗi đó
 * ra hai kết luận trái ngược:
 *
 *   isSmtpProviderRateLimitError  → true   (khớp 'try again later', xét THÔNG ĐIỆP trước)
 *   classifyBounceType            → 'hard' (khớp mã 550, xét MÃ trước)
 *
 * Thứ hạng giữa hai kết luận đó là thứ duy nhất ngăn khách thật bị đánh dấu
 * `email_hard_bounced = true` và **không bao giờ được gửi lại**. Hiện luồng gửi tính
 * rate-limit trước rồi `return` ở nhánh đó (campaignEmailSender.service.js), nên hàng chờ
 * được lên lịch thử lại thay vì khai tử địa chỉ.
 *
 * Rủi ro cần chặn: ai đó tối ưu thành "550 là mã vĩnh viễn, xét mã trước cho nhanh". Khi đó
 * mọi lần MagicSpam chặn tạm đều thành hard bounce vĩnh viễn — hỏng IM LẶNG, không log lỗi,
 * không test nào đỏ, và chỉ lộ ra khi khách hỏi vì sao ngừng nhận thư.
 *
 * Trước test này, `emailBounce.utils.js` KHÔNG có file test nào, và hai ca trong
 * campaignEmailSenderRateLimit.spec.js đều dùng mã 4xx (450, 421) — tức đều là ca mà hai
 * hàm phân loại vốn đã đồng ý với nhau, nên không ca nào chạm tới thứ tự.
 */

jest.unstable_mockModule('../../../utils/userSendLimit.util.js', () => ({
  checkSendQuota: jest.fn().mockResolvedValue({ allowed: true }),
  recordDirectSendUsage: jest.fn().mockResolvedValue(),
  _clearQuotaCache: jest.fn(),
  getVnDayBoundaries: jest.fn(() => ({
    vnDayStart: new Date(),
    vnDayEnd: new Date(Date.now() + 86400000),
    vnNow: new Date(),
  })),
  nextVnMidnight: jest.fn(() => new Date(Date.now() + 86400000)),
  nextVnMonthStart: jest.fn(() => new Date(Date.now() + 30 * 86400000)),
}));

const { default: campaignEmailSenderService } = await import('../campaignEmailSender.service.js');
const { default: emailSettingsController } = await import('../../../controllers/emailSettings.controller.js');
const { default: campaignEmailSenderRepository } = await import('../../../repositories/campaign/campaignEmailSender.repository.js');
const {
  classifyBounceType,
  isRecipientAddressNotFoundError,
  isSmtpProviderRateLimitError,
} = await import('../../../utils/emailBounce.utils.js');

/** Nguyên văn hình dạng MagicSpam trả về: mã vĩnh viễn, ngữ nghĩa tạm thời. */
const makeMagicSpamError = () => {
  const err = new Error(
    '550 5.7.1 Service unavailable; too many messages from this sender, please try again later'
  );
  err.responseCode = 550;
  return err;
};

/** Hard bounce thật: địa chỉ không tồn tại. Dùng làm đối chứng dương. */
const makeRealHardBounceError = () => {
  const err = new Error('550 5.1.1 <nguoinhan@example.com> User unknown; no such user here');
  err.responseCode = 550;
  return err;
};

describe('emailBounce.utils — hai hàm phân loại BẤT ĐỒNG trên cùng một lỗi', () => {
  it('lỗi MagicSpam: rate-limit nói "tạm thời", classify nói "vĩnh viễn" — đây là lý do thứ tự quan trọng', () => {
    const err = makeMagicSpamError();

    // Nếu ca này đổi kết quả, nghĩa là tiền đề của cả file test đã thay đổi và
    // phần dưới không còn kiểm đúng thứ mình tưởng nữa.
    expect(isSmtpProviderRateLimitError(err)).toBe(true);
    expect(classifyBounceType(err)).toBe('hard');
  });

  it('hard bounce thật: cả hai hàm cùng nói "vĩnh viễn", không có xung đột để xử', () => {
    const err = makeRealHardBounceError();

    expect(isSmtpProviderRateLimitError(err)).toBe(false);
    expect(classifyBounceType(err)).toBe('hard');
    expect(isRecipientAddressNotFoundError(err)).toBe(true);
  });
});

describe('sendEmailToCustomerDirect — rate-limit phải được xét TRƯỚC hard bounce', () => {
  const actionNode = {
    id: 'node_send_email_ordering',
    config: {
      fromEmailId: 10,
      emailSubject: 'Thông báo',
      emailBody: '<p>Nội dung kiểm tra</p>',
    },
  };
  const customer = { email: 'khach_that@example.com', full_name: 'Nguyen Test' };
  const campaign = { id: 338, id_user: 39 };
  const runId = 366;
  const CUSTOMER_ID = 88;

  let markHardBouncedSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(campaignEmailSenderRepository, 'incrementEmailSettingsSentCount').mockResolvedValue();
    jest.spyOn(campaignEmailSenderRepository, 'markEmailMessageFailed').mockResolvedValue();
    jest.spyOn(campaignEmailSenderRepository, 'markEmailMessageBounced').mockResolvedValue();
    jest.spyOn(emailSettingsController, 'logEmailSent').mockResolvedValue();
    jest.spyOn(campaignEmailSenderService, 'resolveRetryScheduleGuard').mockReturnValue({ remainingDelayMs: 0 });
    jest.spyOn(campaignEmailSenderService, 'getTemplateByRunNodeCache').mockResolvedValue(null);
    jest.spyOn(campaignEmailSenderService, 'getEmailSettingsByRunNodeCache').mockResolvedValue({
      id: 10,
      email: 'sender@example.com',
      smtp_host: 'smtp.example.com',
    });
    jest.spyOn(campaignEmailSenderRepository, 'findCustomerByEmail').mockResolvedValue({
      id: CUSTOMER_ID,
      email: customer.email,
      email_subscribed: true,
      email_hard_bounced: false,
    });
    markHardBouncedSpy = jest
      .spyOn(campaignEmailSenderRepository, 'markCustomerHardBounced')
      .mockResolvedValue();
  });

  const send = (retryMeta = { smtpLimitRetryCount: 0 }) =>
    campaignEmailSenderService.sendEmailToCustomerDirect(
      actionNode,
      customer,
      campaign,
      runId,
      retryMeta,
      { emailStep: 1 }
    );

  it('550 kèm "try again later" → lên lịch thử lại, TUYỆT ĐỐI không đánh dấu hard bounce', async () => {
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockRejectedValue(makeMagicSpamError());

    const result = await send();

    expect(result.status).toBe('failed');
    expect(result.errorType).toMatch(/^smtp_rate_limited/);
    expect(result.providerResponseCode).toBe(550);

    // Vế quan trọng nhất của cả file: khách KHÔNG bị khai tử vĩnh viễn.
    expect(markHardBouncedSpy).not.toHaveBeenCalled();
  });

  it('550 kèm "try again later" đã hết lượt retry → vẫn là rate-limit, vẫn không hard bounce', async () => {
    jest.spyOn(campaignEmailSenderService, 'resolveProviderRateLimitRetryConfig').mockReturnValue({
      delayMs: 60000,
      maxRetries: 3,
    });
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockRejectedValue(makeMagicSpamError());

    const result = await send({ smtpLimitRetryCount: 3 });

    expect(result.errorType).toBe('smtp_rate_limited');
    expect(markHardBouncedSpy).not.toHaveBeenCalled();
  });

  it('ĐỐI CHỨNG DƯƠNG: hard bounce thật VẪN được đánh dấu — nếu ca này hỏng thì hai ca trên vô nghĩa', async () => {
    jest.spyOn(campaignEmailSenderService, 'sendRawEmail').mockRejectedValue(makeRealHardBounceError());

    await send();

    expect(markHardBouncedSpy).toHaveBeenCalledWith(CUSTOMER_ID);
  });
});
