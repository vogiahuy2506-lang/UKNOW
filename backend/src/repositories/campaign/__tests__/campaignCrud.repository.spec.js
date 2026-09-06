import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockQuery = jest.fn();
jest.unstable_mockModule('../../../config/database.js', () => ({
  default: { query: mockQuery },
}));

const campaignCrudRepository = (await import('../campaignCrud.repository.js')).default;

describe('campaignCrudRepository.updateNodeExecutionOrder regression test', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('supports 2 arguments: (nodeId, executionOrder) using default db', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    await campaignCrudRepository.updateNodeExecutionOrder('node_123', 5);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('UPDATE campaign_nodes');
    expect(sql).toContain('SET execution_order = $1');
    expect(sql).toContain('WHERE id = $2');
    expect(params).toEqual([5, 'node_123']);
  });

  it('supports 3 arguments: (client, nodeId, executionOrder) using provided client', async () => {
    const mockClient = { query: jest.fn().mockResolvedValue({ rows: [] }) };

    await campaignCrudRepository.updateNodeExecutionOrder(mockClient, 'node_456', 9);

    expect(mockClient.query).toHaveBeenCalledTimes(1);
    expect(mockQuery).not.toHaveBeenCalled();
    const [sql, params] = mockClient.query.mock.calls[0];
    expect(sql).toContain('UPDATE campaign_nodes');
    expect(sql).toContain('SET execution_order = $1');
    expect(sql).toContain('WHERE id = $2');
    expect(params).toEqual([9, 'node_456']);
  });
});
