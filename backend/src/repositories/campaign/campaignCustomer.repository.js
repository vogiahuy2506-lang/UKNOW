class CampaignCustomerRepository {
  /**
   * Ensure customer has campaign participation records.
   *
   * @param {import('pg').PoolClient} client
   * @param {number|string} campaignId
   * @param {number|string} customerId
   * @param {number|string|null} runId
   * @returns {Promise<void>}
   */
  async ensureCampaignParticipation(client, campaignId, customerId, runId = null) {
    const campaignIdNum = parseInt(campaignId, 10);
    const customerIdNum = parseInt(customerId, 10);
    if (!Number.isFinite(campaignIdNum) || !Number.isFinite(customerIdNum)) return;

    await client.query(
      `INSERT INTO campaign_customers
        (id_campaign, id_customer, joined_at, last_activity_at, created_at, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
       ON CONFLICT (id_campaign, id_customer)
       DO UPDATE SET
         last_activity_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP`,
      [campaignIdNum, customerIdNum]
    );

    await client.query(
      `INSERT INTO campaign_participations (id_customer, id_campaign, id_run, joined_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
       ON CONFLICT (id_customer, id_campaign)
       DO UPDATE SET id_run = COALESCE(EXCLUDED.id_run, campaign_participations.id_run)`,
      [customerIdNum, campaignIdNum, runId]
    );
  }
}

export default new CampaignCustomerRepository();
