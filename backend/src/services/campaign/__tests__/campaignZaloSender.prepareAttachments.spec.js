import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockReadFileBufferByKey = jest.fn();

jest.unstable_mockModule('../../../controllers/upload.controller.js', () => ({
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

const { default: campaignZaloSenderService } = await import('../campaignZaloSender.service.js');

describe('campaignZaloSenderService.prepareZaloAttachmentSources — lọc key ngoài workspace (PLAN_GUI_NHANH_DINH_KEM_TU_TAI_LEN_2026-09-16, Việc 2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFileBufferByKey.mockResolvedValue(Buffer.from('anh'));
  });

  it('không truyền ownerUserId -> giữ hành vi cũ, không lọc key nào', async () => {
    const result = await campaignZaloSenderService.prepareZaloAttachmentSources([
      { key: 'uploads/999/quick-send/x.png' },
    ]);

    expect(result).toHaveLength(1);
    expect(mockReadFileBufferByKey).toHaveBeenCalledWith('uploads/999/quick-send/x.png');
  });

  it('key thuộc đúng workspace -> tải bình thường', async () => {
    const result = await campaignZaloSenderService.prepareZaloAttachmentSources(
      [{ key: 'uploads/5/quick-send/a.png' }],
      { ownerUserId: 5 }
    );

    expect(result).toHaveLength(1);
  });

  it('key KHÔNG thuộc workspace -> bị bỏ qua, tệp hợp lệ khác vẫn tải', async () => {
    const result = await campaignZaloSenderService.prepareZaloAttachmentSources(
      [
        { key: 'uploads/999/quick-send/hack.png' },
        { key: 'uploads/5/quick-send/ok.png' },
      ],
      { ownerUserId: 5 }
    );

    expect(result).toHaveLength(1);
    expect(mockReadFileBufferByKey).toHaveBeenCalledTimes(1);
    expect(mockReadFileBufferByKey).toHaveBeenCalledWith('uploads/5/quick-send/ok.png');
  });
});
