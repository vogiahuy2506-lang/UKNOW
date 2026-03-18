import dashboardRepository from '../../repositories/dashboard/dashboard.repository.js';
import customerHelperService from '../customer/customerHelper.service.js';

class DashboardAnalyticsService {
  /**
   * Đồng bộ số liệu journey với số liệu email_messages để tránh hụt KPI email.
   *
   * Luồng hoạt động:
   * 1. Lấy số email gửi/mở/click từ journeyEvents (nếu có).
   * 2. Luôn ưu tiên bộ đếm từ emailMetrics vì đây là nguồn dữ liệu gửi email chuẩn.
   * 3. Trả về object mới để không làm mutate dữ liệu đầu vào.
   *
   * @param {object} journeyEvents số liệu từ customer_journey
   * @param {object} emailMetrics số liệu từ email_messages
   * @returns {object} số liệu journey đã được đồng bộ KPI email
   */
  mergeJourneyWithEmailMetrics(journeyEvents, emailMetrics) {
    return {
      ...journeyEvents,
      emailSent: Number(emailMetrics.sent_count || 0),
      emailOpened: Number(emailMetrics.opened_unique_count || 0),
      emailClicked: Number(emailMetrics.clicked_unique_count || 0),
    };
  }

  /**
   * Parse and normalize dashboard filters from query params.
   *
   * @param {object} input
   * @returns {object}
   */
  parseFilters(input = {}) {
    const rawCampaignType = String(input.campaignType || 'all').trim().toLowerCase();
    const campaignTypeOptions = new Set(['all', 'email', 'zalo', 'zalo_group']);
    const campaignType = campaignTypeOptions.has(rawCampaignType) ? rawCampaignType : 'all';

    const campaignIds = this.parseCampaignIds(input.campaignIds);

    const { startAt, endExclusive, startDate, endDate } = this.parseDateRange({
      startDate: input.startDate,
      endDate: input.endDate,
      period: input.period,
    });

    const page = Math.max(1, Number.parseInt(input.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number.parseInt(input.limit, 10) || 20));

    return {
      campaignType,
      campaignIds,
      startDate,
      endDate,
      startAt,
      endExclusive,
      page,
      limit,
    };
  }

  /**
   * Parse campaign id list from query input.
   *
   * @param {unknown} value
   * @returns {number[]}
   */
  parseCampaignIds(value) {
    const normalized = Array.isArray(value)
      ? value.join(',')
      : String(value || '').trim();
    if (!normalized) return [];

    const items = normalized
      .split(',')
      .map((item) => Number.parseInt(String(item).trim(), 10))
      .filter(Number.isFinite);

    return Array.from(new Set(items));
  }

  /**
   * Parse date range from explicit dates or legacy period.
   *
   * @param {{ startDate?: unknown, endDate?: unknown, period?: unknown }} input
   * @returns {{ startDate: string, endDate: string, startAt: string, endExclusive: string }}
   */
  parseDateRange({ startDate, endDate, period }) {
    const toIsoDate = (value) => {
      const text = String(value || '').trim();
      if (!text) return null;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
      return text;
    };

    const today = new Date();
    const defaultEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const periodMap = { '7d': 6, '30d': 29, '90d': 89 };
    const daysBack = periodMap[String(period || '').trim()] ?? 29;

    const explicitStart = toIsoDate(startDate);
    const explicitEnd = toIsoDate(endDate);

    const resolvedEnd = explicitEnd
      ? new Date(`${explicitEnd}T00:00:00.000Z`)
      : defaultEnd;
    const resolvedStart = explicitStart
      ? new Date(`${explicitStart}T00:00:00.000Z`)
      : new Date(resolvedEnd.getTime() - daysBack * 24 * 60 * 60 * 1000);

    if (resolvedStart.getTime() > resolvedEnd.getTime()) {
      const swap = resolvedStart.getTime();
      resolvedStart.setTime(resolvedEnd.getTime());
      resolvedEnd.setTime(swap);
    }

    const safeStart = new Date(Date.UTC(resolvedStart.getUTCFullYear(), resolvedStart.getUTCMonth(), resolvedStart.getUTCDate()));
    const safeEnd = new Date(Date.UTC(resolvedEnd.getUTCFullYear(), resolvedEnd.getUTCMonth(), resolvedEnd.getUTCDate()));
    const safeEndExclusive = new Date(safeEnd.getTime() + 24 * 60 * 60 * 1000);

    const formatDate = (date) => date.toISOString().slice(0, 10);
    return {
      startDate: formatDate(safeStart),
      endDate: formatDate(safeEnd),
      startAt: safeStart.toISOString(),
      endExclusive: safeEndExclusive.toISOString(),
    };
  }

  /**
   * Ensure timeline has rows for each day.
   *
   * @param {string} startDate
   * @param {string} endDate
   * @returns {Map<string, object>}
   */
  createTimelineMap(startDate, endDate) {
    const map = new Map();
    const start = new Date(`${startDate}T00:00:00.000Z`);
    const end = new Date(`${endDate}T00:00:00.000Z`);

    for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)) {
      const key = cursor.toISOString().slice(0, 10);
      map.set(key, {
        date: key,
        // Sent counts per channel
        emailSent: 0,
        zaloSent: 0,
        zaloGroupSent: 0,
        // Engagement metrics
        emailOpened: 0,
        emailClicked: 0,
        emailDownloads: 0,
        zaloClicks: 0,
        zaloGroupClicks: 0,
        // Combined orders (all channels)
        pendingOrders: 0,
        completedOrders: 0,
        // Per-channel orders for segmented chart
        emailPendingOrders: 0,
        emailCompletedOrders: 0,
        zaloPendingOrders: 0,
        zaloCompletedOrders: 0,
        zaloGroupPendingOrders: 0,
        zaloGroupCompletedOrders: 0,
      });
    }
    return map;
  }

  /**
   * Build dashboard overview payload.
   *
   * @param {number} userId
   * @param {string} roleCode
   * @param {object} query
   * @returns {Promise<object>}
   */
  async getOverview(userId, roleCode, query) {
    const filters = this.parseFilters(query);
    const scopedFilters = { ...filters, userId, roleCode };
    const purchaseOrderStatusExpr = await customerHelperService.resolvePurchaseOrderStatusExpr('cp');
    const hasZaloMessages = await dashboardRepository.hasZaloMessagesTable();

    const [campaignCount, runHeadline, emailMetrics, attachmentDownloads, zaloRows, orderRows, journeyEventRows] = await Promise.all([
      dashboardRepository.countCampaigns(scopedFilters),
      dashboardRepository.getRunHeadline(scopedFilters),
      dashboardRepository.getEmailMetrics(scopedFilters),
      dashboardRepository.getAttachmentDownloadCount(scopedFilters),
      dashboardRepository.getZaloClickMetrics(scopedFilters, hasZaloMessages),
      dashboardRepository.getOrderMetricsByType(scopedFilters, purchaseOrderStatusExpr),
      dashboardRepository.getJourneyEventStats(scopedFilters),
    ]);

    const clicksByType = { zalo: 0, zalo_group: 0 };
    for (const row of zaloRows) {
      const key = String(row.campaign_type || '').trim();
      if (key in clicksByType) {
        clicksByType[key] = Number(row.click_count || 0);
      }
    }

    const ordersByType = {
      email: { pending: 0, completed: 0 },
      zalo: { pending: 0, completed: 0 },
      zalo_group: { pending: 0, completed: 0 },
    };
    for (const row of orderRows) {
      const key = String(row.campaign_type || '').trim();
      if (!ordersByType[key]) continue;
      ordersByType[key] = {
        pending: Number(row.pending_orders || 0),
        completed: Number(row.completed_orders || 0),
      };
    }

    // Build journey event counts map (event_type → { event_channel → count })
    // Grouping by channel allows separating Zalo vs Zalo Group contributions.
    const journeyEventMap = {};
    for (const row of journeyEventRows) {
      const type = row.event_type;
      const channel = row.event_channel || '';
      if (!journeyEventMap[type]) journeyEventMap[type] = {};
      journeyEventMap[type][channel] = Number(row.count || 0);
    }

    const getJourneyCount = (type, channel = null) => {
      const channelMap = journeyEventMap[type];
      if (!channelMap) return 0;
      if (channel !== null) return channelMap[channel] || 0;
      return Object.values(channelMap).reduce((sum, v) => sum + v, 0);
    };

    const rawJourneyEvents = {
      emailSent: getJourneyCount('email_sent'),
      emailOpened: getJourneyCount('email_opened'),
      emailClicked: getJourneyCount('email_clicked'),
      zaloSent: getJourneyCount('zalo_sent', 'zalo'),
      zaloGroupSent: getJourneyCount('zalo_sent', 'zalo_group'),
      zaloClicked: getJourneyCount('zalo_clicked', 'zalo'),
      zaloGroupClicked: getJourneyCount('zalo_clicked', 'zalo_group'),
      orderPending: getJourneyCount('order_pending'),
    };
    const journeyEvents = this.mergeJourneyWithEmailMetrics(rawJourneyEvents, emailMetrics);

    const totalRecipients = Number(runHeadline.total_recipients || 0);
    const successfulSends = Number(runHeadline.successful_sends || 0);
    const failedSends = Number(runHeadline.failed_sends || 0);

    return {
      filters: {
        campaignType: filters.campaignType,
        campaignIds: filters.campaignIds,
        startDate: filters.startDate,
        endDate: filters.endDate,
      },
      headline: {
        totalCampaigns: campaignCount,
        totalRuns: Number(runHeadline.total_runs || 0),
        runningRuns: Number(runHeadline.running_runs || 0),
        completedRuns: Number(runHeadline.completed_runs || 0),
        totalRecipients,
        successfulSends,
        failedSends,
        successRate: totalRecipients > 0 ? Number(((successfulSends / totalRecipients) * 100).toFixed(2)) : 0,
      },
      channels: {
        email: {
          sentCount: Number(emailMetrics.sent_count || 0),
          openedUniqueCount: Number(emailMetrics.opened_unique_count || 0),
          clickedUniqueCount: Number(emailMetrics.clicked_unique_count || 0),
          openedTotalCount: Number(emailMetrics.opened_total_count || 0),
          clickedTotalCount: Number(emailMetrics.clicked_total_count || 0),
          attachmentDownloadCount: attachmentDownloads,
          pendingOrderCount: ordersByType.email.pending,
          completedOrderCount: ordersByType.email.completed,
        },
        zalo: {
          clickCount: clicksByType.zalo,
          pendingOrderCount: ordersByType.zalo.pending,
          completedOrderCount: ordersByType.zalo.completed,
        },
        zaloGroup: {
          clickCount: clicksByType.zalo_group,
          pendingOrderCount: ordersByType.zalo_group.pending,
          completedOrderCount: ordersByType.zalo_group.completed,
        },
      },
      // Journey-sourced event counts — used by KPI cards as single source of truth
      journeyEvents,
    };
  }

  /**
   * Get top lists for dashboard: top courses by orders, top campaigns by orders,
   * top campaigns by clicks. All respect the current filter scope.
   *
   * @param {number} userId
   * @param {string} roleCode
   * @param {object} query
   * @param {number} [query.limit=10] - number of items per list
   * @returns {Promise<object>}
   */
  async getTopLists(userId, roleCode, query) {
    const filters = this.parseFilters(query);
    const limit = Math.min(20, Math.max(1, Number.parseInt(query.limit, 10) || 10));
    const scopedFilters = { ...filters, userId, roleCode };
    const purchaseOrderStatusExpr = await customerHelperService.resolvePurchaseOrderStatusExpr('cp');

    const [topCourses, topCampaignsByOrders, topCampaignsByClicks] = await Promise.all([
      dashboardRepository.getTopCoursesByOrders(scopedFilters, purchaseOrderStatusExpr, limit),
      dashboardRepository.getTopCampaignsByOrders(scopedFilters, purchaseOrderStatusExpr, limit),
      dashboardRepository.getTopCampaignsByClicks(scopedFilters, limit),
    ]);

    return {
      filters: {
        campaignType: filters.campaignType,
        campaignIds: filters.campaignIds,
        startDate: filters.startDate,
        endDate: filters.endDate,
      },
      topCourses,
      topCampaignsByOrders,
      topCampaignsByClicks,
    };
  }

  /**
   * Build timeline analytics payload.
   *
   * @param {number} userId
   * @param {string} roleCode
   * @param {object} query
   * @returns {Promise<object>}
   */
  async getAnalytics(userId, roleCode, query) {
    const filters = this.parseFilters(query);
    const scopedFilters = { ...filters, userId, roleCode };
    const purchaseOrderStatusExpr = await customerHelperService.resolvePurchaseOrderStatusExpr('cp');
    const hasZaloMessages = await dashboardRepository.hasZaloMessagesTable();
    const rows = await dashboardRepository.getTimeline(scopedFilters, purchaseOrderStatusExpr, hasZaloMessages);
    const timelineMap = this.createTimelineMap(filters.startDate, filters.endDate);

    for (const row of rows.journeyEngagementRows || []) {
      const key = String(row.date).slice(0, 10);
      if (!timelineMap.has(key)) continue;
      const item = timelineMap.get(key);
      item.emailOpened = Number(row.email_opened || 0);
      item.emailClicked = Number(row.email_clicked || 0);
      item.emailDownloads = Number(row.email_downloaded || 0);
      item.zaloClicks = Number(row.zalo_clicks || 0);
      item.zaloGroupClicks = Number(row.zalo_group_clicks || 0);
    }

    for (const row of rows.purchaseRows) {
      const key = String(row.date).slice(0, 10);
      if (!timelineMap.has(key)) continue;
      const item = timelineMap.get(key);
      const type = String(row.campaign_type || '').trim();
      const pending = Number(row.pending_orders || 0);
      const completed = Number(row.completed_orders || 0);
      // Accumulate combined totals
      item.pendingOrders += pending;
      item.completedOrders += completed;
      // Store per-channel breakdown
      if (type === 'email') {
        item.emailPendingOrders = pending;
        item.emailCompletedOrders = completed;
      } else if (type === 'zalo') {
        item.zaloPendingOrders = pending;
        item.zaloCompletedOrders = completed;
      } else if (type === 'zalo_group') {
        item.zaloGroupPendingOrders = pending;
        item.zaloGroupCompletedOrders = completed;
      }
    }

    for (const row of rows.emailSentRows || []) {
      const key = String(row.date).slice(0, 10);
      if (!timelineMap.has(key)) continue;
      timelineMap.get(key).emailSent = Number(row.email_sent || 0);
    }

    for (const row of rows.zaloSentRows || []) {
      const key = String(row.date).slice(0, 10);
      if (!timelineMap.has(key)) continue;
      const item = timelineMap.get(key);
      const type = String(row.campaign_type || '').trim();
      const sent = Number(row.sent_count || 0);
      if (type === 'zalo') item.zaloSent = sent;
      else if (type === 'zalo_group') item.zaloGroupSent = sent;
    }

    return {
      filters: {
        campaignType: filters.campaignType,
        campaignIds: filters.campaignIds,
        startDate: filters.startDate,
        endDate: filters.endDate,
      },
      timeline: Array.from(timelineMap.values()),
    };
  }

  /**
   * Get paginated list of individual orders enriched with run/campaign/channel info.
   *
   * @param {number} userId
   * @param {string} roleCode
   * @param {object} query
   * @param {string} [query.orderStatus] - 'all'|'pending'|'completed'
   * @returns {Promise<object>}
   */
  async getOrdersList(userId, roleCode, query) {
    const filters = this.parseFilters(query);
    const rawOrderStatus = String(query.orderStatus || 'all').trim().toLowerCase();
    const orderStatus = ['all', 'pending', 'completed'].includes(rawOrderStatus) ? rawOrderStatus : 'all';
    const scopedFilters = { ...filters, userId, roleCode, orderStatus };
    const purchaseOrderStatusExpr = await customerHelperService.resolvePurchaseOrderStatusExpr('cp');

    const result = await dashboardRepository.getOrdersList(scopedFilters, purchaseOrderStatusExpr);

    return {
      filters: {
        campaignType: filters.campaignType,
        campaignIds: filters.campaignIds,
        startDate: filters.startDate,
        endDate: filters.endDate,
        orderStatus,
      },
      items: result.items,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / filters.limit)),
      },
    };
  }

  /**
   * Get paginated run-level metrics.
   *
   * @param {number} userId
   * @param {string} roleCode
   * @param {object} query
   * @returns {Promise<object>}
   */
  async getRuns(userId, roleCode, query) {
    const filters = this.parseFilters(query);
    const scopedFilters = { ...filters, userId, roleCode };
    const purchaseOrderStatusExpr = await customerHelperService.resolvePurchaseOrderStatusExpr('cp');
    const hasZaloMessages = await dashboardRepository.hasZaloMessagesTable();

    const result = await dashboardRepository.getRuns(
      scopedFilters,
      purchaseOrderStatusExpr,
      hasZaloMessages
    );

    return {
      filters: {
        campaignType: filters.campaignType,
        campaignIds: filters.campaignIds,
        startDate: filters.startDate,
        endDate: filters.endDate,
      },
      items: result.items,
      pagination: {
        page: filters.page,
        limit: filters.limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / filters.limit)),
      },
    };
  }
}

export default new DashboardAnalyticsService();
