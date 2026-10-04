import aiController from '../ai.controller.js';

describe('aiController.applyDirectRecipients', () => {
  it('throws MANUAL_RECIPIENTS_REQUIRED when directRecipients is completely empty', () => {
    const script = {
      nodes: [
        { nodeSubtype: 'send_zalo_personal', config: {} },
      ],
    };

    expect(() => aiController.applyDirectRecipients(script, { phones: [] })).toThrow(
      expect.objectContaining({
        code: 'MANUAL_RECIPIENTS_REQUIRED',
        statusCode: 400,
      })
    );
  });

  it('throws ZALO_RECIPIENTS_EMPTY when Zalo campaign only receives emails', () => {
    const script = {
      nodes: [
        { nodeSubtype: 'send_zalo_personal', config: {} },
      ],
    };

    expect(() => aiController.applyDirectRecipients(script, { emails: ['test@example.com'] })).toThrow(
      expect.objectContaining({
        code: 'ZALO_RECIPIENTS_EMPTY',
        statusCode: 400,
        message: 'Danh sách người nhận cho chiến dịch Zalo không có số điện thoại hoặc UID nào hợp lệ.',
      })
    );
  });

  it('throws EMAIL_RECIPIENTS_EMPTY when Email campaign only receives phones', () => {
    const script = {
      nodes: [
        { nodeSubtype: 'send_email', config: {} },
      ],
    };

    expect(() => aiController.applyDirectRecipients(script, { phones: ['0912345678'] })).toThrow(
      expect.objectContaining({
        code: 'EMAIL_RECIPIENTS_EMPTY',
        statusCode: 400,
        message: 'Danh sách người nhận cho chiến dịch Email không có địa chỉ email nào hợp lệ.',
      })
    );
  });

  it('successfully applies phone numbers for Zalo campaign', () => {
    const script = {
      nodes: [
        { nodeSubtype: 'send_zalo_personal', config: {} },
      ],
    };

    aiController.applyDirectRecipients(script, { phones: ['0912345678', '0987654321'] });
    expect(script.nodes[0].config.zaloRecipientSource).toBe('manual');
    expect(script.nodes[0].config.zaloRecipientPhones).toEqual(['0912345678', '0987654321']);
    expect(script.nodes[0].config.zaloRecipientType).toBe('phone');
  });

  it('successfully applies phone numbers when node uses subtype or node_subtype variation', () => {
    const script = {
      nodes: [
        { subtype: 'send_zalo_personal', config: {} },
      ],
    };

    aiController.applyDirectRecipients(script, { phones: ['0844790999'] });
    expect(script.nodes[0].config.zaloRecipientSource).toBe('manual');
    expect(script.nodes[0].config.zaloRecipientPhones).toEqual(['0844790999']);
    expect(script.nodes[0].config.zaloRecipientType).toBe('phone');
  });

  it('markManualRecipientsRequired does not wipe out non-empty recipient arrays', () => {
    const script = {
      nodes: [
        { subtype: 'send_zalo_personal', config: { zaloRecipientPhones: ['0844790999'] } },
      ],
    };

    aiController.markManualRecipientsRequired(script);
    expect(script.nodes[0].config.zaloRecipientSource).toBe('manual');
    expect(script.nodes[0].config.zaloRecipientPhones).toEqual(['0844790999']);
  });
});

/**
 * Rà soát C P2-9 — kênh Telegram/WhatsApp. Danh sách người nhận nhập tay trước đây chỉ phủ Email/Zalo; với Telegram/WhatsApp chat id / SĐT do MODEL
 * chép vào node (trái nguyên tắc M2 — danh sách người nhận đi qua lớp phủ riêng tư, không qua model).
 */
describe('aiController.applyDirectRecipients — kênh adapter (Telegram / WhatsApp) — C P2-9', () => {
  const tgScript = () => ({ nodes: [{ nodeSubtype: 'send_telegram', config: { telegramAccountId: 5, recipientSource: 'telegram_conversations', steps: [{ message: 'Chào' }] } }] });
  const waScript = () => ({ nodes: [{ nodeSubtype: 'send_whatsapp', config: { whatsappSessionKey: '7-shop', recipientSource: 'whatsapp_conversations', recipientNodeId: 'x', steps: [{ message: 'Chào' }] } }] });

  it('Telegram: chat id đi qua lớp phủ → nguồn manual + recipientKeys (chat id nhóm âm vẫn hợp lệ), trùng được gộp', () => {
    const script = tgScript();
    aiController.applyDirectRecipients(script, { chatIds: ['123456789', '-1001234567890', '123456789'] });

    expect(script.nodes[0].config.recipientSource).toBe('manual');
    expect(script.nodes[0].config.recipientKeys).toEqual(['123456789', '-1001234567890']);
  });

  it('WhatsApp: SĐT đi qua lớp phủ → nguồn manual + recipientKeys, bỏ cấu hình nguồn node cũ', () => {
    const script = waScript();
    aiController.applyDirectRecipients(script, { phones: ['0912345678', '0987654321'] });

    expect(script.nodes[0].config.recipientSource).toBe('manual');
    expect(script.nodes[0].config.recipientKeys).toEqual(['0912345678', '0987654321']);
    expect(script.nodes[0].config).not.toHaveProperty('recipientNodeId');
  });

  it('Telegram thiếu chat id (chỉ có email) → TELEGRAM_RECIPIENTS_EMPTY; WhatsApp thiếu SĐT → WHATSAPP_RECIPIENTS_EMPTY', () => {
    expect(() => aiController.applyDirectRecipients(tgScript(), { emails: ['a@example.com'] })).toThrow(
      expect.objectContaining({ code: 'TELEGRAM_RECIPIENTS_EMPTY', statusCode: 400 })
    );
    expect(() => aiController.applyDirectRecipients(waScript(), { emails: ['a@example.com'] })).toThrow(
      expect.objectContaining({ code: 'WHATSAPP_RECIPIENTS_EMPTY', statusCode: 400 })
    );
  });

  it('chat id không hợp lệ → INVALID_MANUAL_RECIPIENTS (không nhận chữ/username)', () => {
    expect(() => aiController.applyDirectRecipients(tgScript(), { chatIds: ['@ten_nguoi_dung'] })).toThrow(
      expect.objectContaining({ code: 'INVALID_MANUAL_RECIPIENTS', statusCode: 400 })
    );
  });

  it('chat id gửi cho kịch bản Email/WhatsApp → MANUAL_RECIPIENT_CHANNEL_MISMATCH (chat id chỉ dùng cho Telegram)', () => {
    expect(() => aiController.applyDirectRecipients({ nodes: [{ nodeSubtype: 'send_email', config: {} }] }, { emails: ['a@example.com'], chatIds: ['123456'] })).toThrow(
      expect.objectContaining({ code: 'MANUAL_RECIPIENT_CHANNEL_MISMATCH' })
    );
    expect(() => aiController.applyDirectRecipients(waScript(), { phones: ['0912345678'], chatIds: ['123456'] })).toThrow(
      expect.objectContaining({ code: 'MANUAL_RECIPIENT_CHANNEL_MISMATCH' })
    );
  });

  it('SĐT gửi cho kịch bản Telegram → MANUAL_RECIPIENT_CHANNEL_MISMATCH; Email vẫn KHÔNG nhận SĐT như cũ', () => {
    expect(() => aiController.applyDirectRecipients(tgScript(), { phones: ['0912345678'], chatIds: ['123456'] })).toThrow(
      expect.objectContaining({ code: 'MANUAL_RECIPIENT_CHANNEL_MISMATCH' })
    );
    expect(() => aiController.applyDirectRecipients({ nodes: [{ nodeSubtype: 'send_email', config: {} }] }, { phones: ['0912345678'] })).toThrow(
      expect.objectContaining({ code: 'EMAIL_RECIPIENTS_EMPTY' })
    );
  });

  it('lớp phủ rỗng hoàn toàn vẫn là MANUAL_RECIPIENTS_REQUIRED (hành vi cũ giữ nguyên)', () => {
    expect(() => aiController.applyDirectRecipients(tgScript(), { chatIds: [] })).toThrow(
      expect.objectContaining({ code: 'MANUAL_RECIPIENTS_REQUIRED' })
    );
  });

  it('hasAdapterManualRecipientSource / clearModelCopiedAdapterRecipients: xoá danh sách do MODEL chép, giữ nguyên các nguồn khác', () => {
    const manual = { nodes: [{ nodeSubtype: 'send_telegram', config: { recipientSource: 'manual', recipientKeys: ['999999999', '888888888'] } }] };
    const conversations = tgScript();

    expect(aiController.hasAdapterManualRecipientSource(manual)).toBe(true);
    expect(aiController.hasAdapterManualRecipientSource(conversations)).toBe(false);
    expect(aiController.hasAdapterManualRecipientSource({ nodes: [{ nodeSubtype: 'send_email', config: { recipientSource: 'manual' } }] })).toBe(false);

    aiController.clearModelCopiedAdapterRecipients(manual);
    aiController.clearModelCopiedAdapterRecipients(conversations);
    expect(manual.nodes[0].config.recipientKeys).toEqual([]);
    expect(conversations.nodes[0].config).not.toHaveProperty('recipientKeys');
    expect(conversations.nodes[0].config.recipientSource).toBe('telegram_conversations');
  });
});
