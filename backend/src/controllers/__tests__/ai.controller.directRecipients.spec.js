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
