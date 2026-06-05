import customerReadRepository from '../../repositories/customer/customerRead.repository.js';

class CustomerQueryService {
  /**
   * Build key for run/group mapping.
   *
   * @param {number|string|null} runId
   * @param {string|null} groupId
   * @returns {string}
   */
  buildRunGroupKey(runId, groupId) {
    return `${String(runId ?? '').trim()}::${String(groupId ?? '').trim()}`;
  }

  /**
   * Extract candidate group id from execution payload.
   *
   * @param {object} payload
   * @returns {string|null}
   */
  extractExecutionGroupId(payload = {}) {
    const candidate = payload.groupId ?? payload.group_id ?? payload.group ?? null;
    const normalized = String(candidate || '').trim();
    return normalized || null;
  }

  /**
   * Extract candidate group name from execution payload.
   *
   * @param {object} payload
   * @returns {string|null}
   */
  extractExecutionGroupName(payload = {}) {
    const candidate = payload.groupName ?? payload.group_name ?? payload.groupTitle ?? payload.group_title ?? null;
    const normalized = String(candidate || '').trim();
    return normalized || null;
  }

  /**
   * Load fallback map groupId -> groupName by run from campaign_executions.
   *
   * @param {number[]} runIds
   * @returns {Promise<Map<string, string>>}
   */
  async loadZaloGroupNameMapByRuns(runIds = []) {
    const normalizedRunIds = (Array.isArray(runIds) ? runIds : [])
      .map((id) => Number.parseInt(id, 10))
      .filter((id) => Number.isFinite(id));
    if (normalizedRunIds.length === 0) return new Map();

    const executionRows = await customerReadRepository.getZaloGroupExecutionsByRuns(normalizedRunIds);

    const map = new Map();
    for (const row of executionRows) {
      const runId = Number.parseInt(row.id_run, 10);
      if (!Number.isFinite(runId)) continue;
      const data = row.execution_data && typeof row.execution_data === 'object'
        ? row.execution_data
        : {};

      const payloadEntries = [];
      payloadEntries.push(data);
      if (Array.isArray(data.items)) {
        data.items.forEach((item) => {
          if (item && typeof item === 'object') payloadEntries.push(item);
        });
      }

      payloadEntries.forEach((payload) => {
        const groupId = this.extractExecutionGroupId(payload);
        const groupName = this.extractExecutionGroupName(payload);
        if (!groupId || !groupName) return;
        const key = this.buildRunGroupKey(runId, groupId);
        if (!map.has(key)) map.set(key, groupName);
      });
    }
    return map;
  }

  /**
   * Query paginated customer list with campaign/status/source filters.
   *
   * @param {object} input
   * @returns {Promise<object>}
   */
  async getAllCustomers({
    userId,
    page = 1,
    limit = 10,
    status,
    search,
    source,
    campaignId,
    purchaseOrderStatusExpr,
  }) {
    const { rows, total } = await customerReadRepository.getAllCustomerRows({
      userId,
      page,
      limit,
      status,
      search,
      source,
      campaignId,
      purchaseOrderStatusExpr,
    });

    return {
      items: rows.map((item) => ({
        id: item.id,
        email: item.email,
        phone: item.phone,
        fullName: item.full_name,
        orderStatus: item.order_status,
        uknowStatus: item.uknow_status || null,
        campaignHasClicked: item.campaign_has_clicked ?? null,
        campaignHasOpened: item.campaign_has_opened ?? null,
        campaignEmailReceivedCount: item.campaign_email_received_count ?? null,
        customerSource: item.customer_source,
        hasPurchased: item.has_purchased,
        totalOrders: item.total_orders,
        totalSpent: item.total_spent,
        emailSubscribed: item.email_subscribed,
        campaignCount: item.campaign_count,
        lastCampaignActivityAt: item.last_campaign_activity_at,
        tags: [],
        createdAt: item.created_at,
        updatedAt: item.updated_at,
      })),
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Get paginated Zalo group message tracking list of one campaign.
   *
   * @param {object} input
   * @param {number} input.userId
   * @param {number} input.campaignId
   * @param {number} [input.page]
   * @param {number} [input.limit]
   * @param {string} [input.search]
   * @param {string} input.purchaseOrderStatusExpr
   * @returns {Promise<object>}
   */
  async getCampaignZaloGroupMessages({
    userId,
    campaignId,
    page = 1,
    limit = 20,
    search = '',
    purchaseOrderStatusExpr,
  }) {
    const parsedCampaignId = Number.parseInt(campaignId, 10);
    const parsedPage = Number.parseInt(page, 10);
    const parsedLimit = Number.parseInt(limit, 10);
    const safePage = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    const safeLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
    const offset = (safePage - 1) * safeLimit;
    const trimmedSearch = String(search || '').trim();

    if (!Number.isFinite(parsedCampaignId)) {
      const error = new Error('ID chiến dịch không hợp lệ');
      error.statusCode = 400;
      throw error;
    }

    const campaign = await customerReadRepository.getOwnedCampaign(parsedCampaignId, userId);
    if (!campaign) {
      const error = new Error('Không tìm thấy chiến dịch');
      error.statusCode = 404;
      throw error;
    }

    const { rows, total } = await customerReadRepository.getCampaignZaloGroupMessagesRows({
      campaignId: parsedCampaignId,
      search: trimmedSearch,
      limit: safeLimit,
      offset,
      purchaseOrderStatusExpr,
    });
    const runIds = Array.from(
      new Set(
        rows
          .map((row) => Number.parseInt(row.id_run, 10))
          .filter((id) => Number.isFinite(id))
      )
    );
    let runGroupNameMap = new Map();
    try {
      runGroupNameMap = await this.loadZaloGroupNameMapByRuns(runIds);
    } catch {
      runGroupNameMap = new Map();
    }

    return {
      items: rows.map((row) => {
        const parsedRunId = Number.parseInt(row.id_run, 10);
        const groupId = row.group_id || row.recipient_value || null;
        return {
        id: row.id,
        campaignId: row.id_campaign,
        runId: row.id_run || null,
        runName: row.run_name || null,
        runDisplayName: row.id_run
          ? `Run #${row.id_run}${row.run_name ? ` · ${row.run_name}` : ''}`
          : null,
        groupId,
        groupName:
          (() => {
            const metaGroupName = String(row.tracking_metadata?.groupName || '').trim();
            const normalizedGroupId = String(groupId || '').trim();
            const fallbackName = runGroupNameMap.get(this.buildRunGroupKey(parsedRunId, groupId)) || null;
            if (metaGroupName && metaGroupName !== normalizedGroupId) return metaGroupName;
            if (fallbackName) return fallbackName;
            if (metaGroupName) return metaGroupName;
            return groupId || null;
          })(),
        recipientValue: row.recipient_value || null,
        accountId: row.account_id || null,
        accountName: row.account_name || null,
        messageText: row.message_text || '',
        attachments: Array.isArray(row.tracking_metadata?.attachments)
          ? row.tracking_metadata.attachments
          : [],
        clickCount: Number(row.click_count || 0),
        firstClickedAt: row.first_clicked_at || null,
        lastClickedAt: row.last_clicked_at || null,
        sentAt: row.sent_at || null,
        createdAt: row.created_at || null,
        pendingOrderCount: Number(row.pending_order_count || 0),
        completedOrderCount: Number(row.completed_order_count || 0),
        orderedCustomerCount: Number(row.ordered_customer_count || 0),
      };
      }),
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.max(1, Math.ceil(total / safeLimit)),
      },
    };
  }
}

export default new CustomerQueryService();
