import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const findLiveConnectionInOtherWorkspace = jest.fn();

jest.unstable_mockModule('../../../repositories/zalo/zaloSetting.repository.js', () => ({
  default: { findLiveConnectionInOtherWorkspace },
}));

const { default: zaloOneWorkspaceService } = await import('../zaloOneWorkspace.service.js');
const {
  ZALO_LIVE_ELSEWHERE_CODE,
  ZALO_LIVE_ELSEWHERE_MESSAGE,
} = await import('../../../utils/zaloOneWorkspace.util.js');

describe('zaloOneWorkspace.service assertZaloNotLiveElsewhere', () => {
  beforeEach(() => {
    findLiveConnectionInOtherWorkspace.mockReset();
  });

  it('zalo_user_id rỗng → không chặn, không query', async () => {
    await expect(
      zaloOneWorkspaceService.assertZaloNotLiveElsewhere(1, '')
    ).resolves.toBeUndefined();
    await expect(
      zaloOneWorkspaceService.assertZaloNotLiveElsewhere(1, null)
    ).resolves.toBeUndefined();
    expect(findLiveConnectionInOtherWorkspace).not.toHaveBeenCalled();
  });

  it('không có kết nối sống ở workspace khác → cho phép', async () => {
    findLiveConnectionInOtherWorkspace.mockResolvedValueOnce(null);
    await expect(
      zaloOneWorkspaceService.assertZaloNotLiveElsewhere(10, 'zalo-abc')
    ).resolves.toBeUndefined();
    expect(findLiveConnectionInOtherWorkspace).toHaveBeenCalledWith(10, 'zalo-abc');
  });

  it('đang sống ở workspace khác → 409, không lộ email mặc định', async () => {
    findLiveConnectionInOtherWorkspace.mockResolvedValueOnce({
      id: 99,
      id_user: 2,
      owner_email: 'secret@client.com',
    });
    await expect(
      zaloOneWorkspaceService.assertZaloNotLiveElsewhere(10, 'zalo-abc')
    ).rejects.toMatchObject({
      statusCode: 409,
      code: ZALO_LIVE_ELSEWHERE_CODE,
      message: ZALO_LIVE_ELSEWHERE_MESSAGE,
    });
  });

  it('revealOwner=true → kèm email chủ sở hữu', async () => {
    findLiveConnectionInOtherWorkspace.mockResolvedValueOnce({
      id: 99,
      id_user: 2,
      owner_email: 'secret@client.com',
    });
    await expect(
      zaloOneWorkspaceService.assertZaloNotLiveElsewhere(10, 'zalo-abc', { revealOwner: true })
    ).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining('secret@client.com'),
    });
  });

  it('withUniqueMapped — đổi 23505 thành 409', async () => {
    await expect(
      zaloOneWorkspaceService.withUniqueMapped(async () => {
        const err = new Error('duplicate');
        err.code = '23505';
        err.constraint = 'uniq_zalo_settings_live_zalo_user';
        throw err;
      })
    ).rejects.toMatchObject({
      statusCode: 409,
      code: ZALO_LIVE_ELSEWHERE_CODE,
    });
  });

  it('withUniqueMapped — lỗi khác 23505 vẫn ném nguyên', async () => {
    await expect(
      zaloOneWorkspaceService.withUniqueMapped(async () => {
        throw new Error('network');
      })
    ).rejects.toThrow('network');
  });
});
