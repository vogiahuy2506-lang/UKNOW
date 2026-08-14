import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { generateFileToken } from '../../../utils/fileDownloadToken.js';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

const {
  buildStorageReferenceIndex,
  getIndexedStorageReferences,
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
});
