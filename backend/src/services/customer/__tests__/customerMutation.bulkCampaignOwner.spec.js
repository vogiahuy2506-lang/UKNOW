import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const { default: customerMutationService } = await import('../customerMutation.service.js');
const { default: customerMutationRepository } = await import('../../../repositories/customer/customerMutation.repository.js');
const { default: customerReadRepository } = await import('../../../repositories/customer/customerRead.repository.js');

/**
 * PR-C1 việc 1 — bulk upsert kèm campaignId phải kiểm chủ chiến dịch TRƯỚC khi mở transaction/ghi.
 */
describe('customerMutationService.bulkUpsert — kiểm chủ chiến dịch', () => {
  let withTransaction;

  beforeEach(() => {
    jest.restoreAllMocks();
    withTransaction = jest.spyOn(customerMutationRepository, 'withTransaction').mockImplementation(async (fn) => fn({}));
    jest.spyOn(customerMutationRepository, 'findExistingCustomerId').mockResolvedValue(null);
    jest.spyOn(customerMutationRepository, 'insertBulkCustomer').mockResolvedValue(10);
  });

  it('chiến dịch không thuộc workspace → 404, không mở transaction', async () => {
    const owned = jest.spyOn(customerReadRepository, 'getOwnedCampaign').mockResolvedValue(null);
    await expect(
      customerMutationService.bulkUpsert({
        workspaceOwnerId: 5,
        actorUserId: 5,
        payload: { items: [{ email: 'a@u.local' }], campaignId: 77 },
      })
    ).rejects.toMatchObject({ statusCode: 404 });
    expect(owned).toHaveBeenCalledWith(77, 5);
    expect(withTransaction).not.toHaveBeenCalled();
  });

  it('không có campaignId → không tra chiến dịch (nhập khách thuần)', async () => {
    const owned = jest.spyOn(customerReadRepository, 'getOwnedCampaign');
    const result = await customerMutationService.bulkUpsert({
      workspaceOwnerId: 5,
      actorUserId: 5,
      payload: { items: [{ email: 'a@u.local' }] },
    });
    expect(owned).not.toHaveBeenCalled();
    expect(result).toMatchObject({ inserted: 1, campaignLinked: 0 });
  });
});
