import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { generateFileToken } from '../../../utils/fileDownloadToken.js';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

const {
  buildStorageReferenceIndex,
  getIndexedStorageReferences,
  isReferenceAlive,
  resolveWorkspaceOwner,
} = await import('../storageReference.service.js');

describe('storageReference.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    query.mockImplementation(async (sql) => {
      if (/FROM chat_attachments/.test(sql)) {
        return { rows: [{ id: 11, id_user: 88, storage_key: 'uploads/55/chat/inbox.pdf' }] };
      }
      if (/FROM help_articles/.test(sql)) {
        const token = generateFileToken('uploads/1/help/guide.png', null, null, null);
        return {
          rows: [{
            id: 9,
            body_md: '',
            body_html: `<img src="/file/${token}">`,
            media_urls: [],
          }],
        };
      }
      if (/FROM business_profiles/.test(sql)) {
        return {
          rows: [{ id: 5, user_id: 77, logo_url: '/uploads/77/legacy-logo.png' }],
        };
      }
      return { rows: [] };
    });
  });

  it('keeps chat catalog owner canonical and maps help to the system pool', async () => {
    const index = await buildStorageReferenceIndex();

    expect(getIndexedStorageReferences(index, 'uploads/55/chat/inbox.pdf')).toEqual([
      expect.objectContaining({
        ownerUserId: 88,
        ownerIsCanonical: true,
        referenceType: 'chat_attachment',
      }),
    ]);
    expect(getIndexedStorageReferences(index, 'uploads/1/help/guide.png')).toEqual([
      expect.objectContaining({
        poolType: 'system',
        ownerUserId: null,
        referenceType: 'help_article',
      }),
    ]);
    expect(getIndexedStorageReferences(index, 'uploads/77/legacy-logo.png')).toEqual([
      expect.objectContaining({
        ownerUserId: 77,
        referenceType: 'business_profile',
      }),
    ]);
  });

  it('resolves an employee parent id to its active workspace owner', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 55, owner_ids: ['12'] }] });

    await expect(resolveWorkspaceOwner(55)).resolves.toEqual({
      ownerUserId: 12,
      source: 'membership',
      ambiguous: false,
    });
  });

  it('checks isReferenceAlive accurately', async () => {
    // 1. empty input
    await expect(isReferenceAlive(null, null)).resolves.toEqual({ alive: false });

    // 2. alive reference
    query.mockResolvedValueOnce({ rows: [{ id: 10, name: 'Khuyến mãi T8' }] });
    await expect(isReferenceAlive('zalo_template', 10)).resolves.toEqual({
      alive: true,
      label: 'Mẫu Zalo',
      name: 'Khuyến mãi T8',
      url: '/templates',
    });

    // 3. dead reference
    query.mockResolvedValueOnce({ rows: [] });
    await expect(isReferenceAlive('email_template', 99)).resolves.toEqual({ alive: false });

    // 4. unknown reference (fail-safe alive)
    await expect(isReferenceAlive('unknown_parent_type', 123)).resolves.toEqual({
      alive: true,
      label: 'unknown_parent_type',
      name: 'unknown_parent_type #123',
      url: null,
    });

    // 5. query error (fail-safe alive on 42703, 22P02, etc.)
    query.mockRejectedValueOnce(new Error('column does not exist (42703)'));
    await expect(isReferenceAlive('campaign_node', 5)).resolves.toEqual({
      alive: true,
      label: 'Chiến dịch',
      name: 'Chiến dịch #5',
      url: '/campaigns',
    });
  });
});
