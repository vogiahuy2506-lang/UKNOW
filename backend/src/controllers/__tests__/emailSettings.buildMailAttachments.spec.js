import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockReadFileBufferByKey = jest.fn();

jest.unstable_mockModule('../upload.controller.js', () => ({
  default: {
    readFileBufferByKey: mockReadFileBufferByKey,
    normalizeStorageKey: (input) => {
      if (!input) return '';
      const raw = typeof input === 'object' ? (input.key || '') : input;
      const text = String(raw || '').trim();
      return text.startsWith('uploads/') ? text : '';
    },
  },
}));

const { default: emailSettingsController } = await import('../emailSettings.controller.js');

describe('emailSettingsController.buildMailAttachments — lọc key ngoài workspace (PLAN_GUI_NHANH_DINH_KEM_TU_TAI_LEN_2026-09-16, Việc 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFileBufferByKey.mockResolvedValue(Buffer.from('noi dung tep'));
  });

  it('không truyền ownerUserId -> giữ hành vi cũ, không lọc key nào', async () => {
    const items = [{ key: 'uploads/999/quick-send/a.pdf', originalName: 'a.pdf', contentType: 'application/pdf' }];

    const result = await emailSettingsController.buildMailAttachments(items);

    expect(result).toHaveLength(1);
    expect(mockReadFileBufferByKey).toHaveBeenCalledWith('uploads/999/quick-send/a.pdf');
  });

  it('key thuộc đúng workspace -> đọc và trả về bình thường', async () => {
    const items = [{ key: 'uploads/5/quick-send/a.pdf', originalName: 'a.pdf', contentType: 'application/pdf' }];

    const result = await emailSettingsController.buildMailAttachments(items, 5);

    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('a.pdf');
  });

  it('key KHÔNG thuộc workspace -> bị bỏ qua, tệp hợp lệ khác vẫn gửi', async () => {
    const items = [
      { key: 'uploads/999/quick-send/hack.pdf', originalName: 'hack.pdf', contentType: 'application/pdf' },
      { key: 'uploads/5/quick-send/ok.pdf', originalName: 'ok.pdf', contentType: 'application/pdf' },
    ];

    const result = await emailSettingsController.buildMailAttachments(items, 5);

    expect(result).toHaveLength(1);
    expect(result[0].filename).toBe('ok.pdf');
    expect(mockReadFileBufferByKey).toHaveBeenCalledTimes(1);
    expect(mockReadFileBufferByKey).toHaveBeenCalledWith('uploads/5/quick-send/ok.pdf');
  });
});
