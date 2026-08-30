import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const query = jest.fn();

jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query },
}));

const { default: repository } = await import('../aiCampaignDraft.repository.js');

describe('aiCampaignDraftRepository temporary template cleanup', () => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue({ rows: [] });
  });

  it.each([
    ['email', 'deleteEmailTemplatesByIds', 'email_templates'],
    ['zalo', 'deleteZaloTemplatesByIds', 'zalo_templates'],
  ])('deletes tracked %s templates only when they belong to the user', async (_kind, method, table) => {
    await repository[method]({ userId: 42, ids: [11, '12', null, -1, 'invalid'] });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain(`DELETE FROM ${table}`);
    expect(sql).toContain('WHERE id_user = $1 AND id = ANY($2::bigint[])');
    expect(params).toEqual([42, [11, 12]]);
  });

  it('does not issue a broad delete when no valid tracked IDs remain', async () => {
    await expect(repository.deleteEmailTemplatesByIds({
      userId: 42,
      ids: [null, -1, 'invalid'],
    })).resolves.toEqual([]);

    expect(query).not.toHaveBeenCalled();
  });
});
