import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

const { default: repository } = await import('../chatbotStudioConversation.repository.js');

const ID_2 = '00000000-0000-4000-8000-000000000002';
const ID_3 = '00000000-0000-4000-8000-000000000003';
const ID_4 = '00000000-0000-4000-8000-000000000004';
const ID_5 = '00000000-0000-4000-8000-000000000005';

describe('chatbotStudioConversation.repository message pagination', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('loads the latest page and presents messages oldest to newest', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: ID_5 }, { id: ID_4 }, { id: ID_3 }],
    });

    const page = await repository.getMessagesByConversation(9, { limit: 2 });

    expect(page).toEqual({
      items: [{ id: ID_4 }, { id: ID_5 }],
      hasMore: true,
      nextBeforeId: ID_4,
    });
    expect(String(query.mock.calls[0][0])).toMatch(/ORDER BY m\.created_at DESC, m\.id DESC[\s\S]*LIMIT \$2/i);
    expect(query.mock.calls[0][1]).toEqual([9, 3]);
  });

  it('uses an exclusive before-id cursor for older pages', async () => {
    query.mockResolvedValueOnce({
      rows: [{ id: ID_3 }, { id: ID_2 }],
    });

    const page = await repository.getMessagesByConversation(9, {
      limit: 2,
      beforeId: ID_4,
    });

    expect(page).toEqual({
      items: [{ id: ID_2 }, { id: ID_3 }],
      hasMore: false,
      nextBeforeId: ID_2,
    });
    expect(String(query.mock.calls[0][0])).toMatch(/id = \$2::uuid[\s\S]*m\.created_at, m\.id[\s\S]*LIMIT \$3/i);
    expect(query.mock.calls[0][1]).toEqual([9, ID_4, 3]);
  });
});
