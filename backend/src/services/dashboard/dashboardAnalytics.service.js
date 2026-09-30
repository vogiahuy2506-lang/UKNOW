import dashboardRepository from '../../repositories/dashboard/dashboard.repository.js';
import landingPageEventRepository from '../../repositories/landingPageEvent.repository.js';
import landingPageRepository from '../../repositories/landingPage.repository.js';
import leadRepository from '../../repositories/lead.repository.js';
import formRepository from '../../repositories/form.repository.js';
import customerHelperService from '../customer/customerHelper.service.js';
import { getWorkspaceScope } from '../../utils/workspaceContext.util.js';
import sendStats from '../stats/sendStats.service.js';
import campaignChannelRegistry from '../campaign/campaignChannelRegistry.service.js';
import { isAdminRole } from '../../utils/roleScope.util.js';


/** Múi giờ Việt Nam cố định (+07:00), không phụ thuộc TZ của máy chủ. */
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Lời mời kết bạn Zalo là một dòng riêng của module đếm tin: không cộng vào "tin" đã gửi / chưa gửi được. */
const FRIEND_REQUEST_CHANNEL = 'zalo_friend_request';
const EMAIL_CHANNEL = 'email';
/** Đơn của chiến dịch loại lạ (đa kênh…) — vẫn cộng vào tổng đơn, không mất khỏi số thẻ. */
const OTHER_ORDER_CHANNEL = 'other';
/** Số chiến dịch đưa vào "Nhận xét AI". */
const INSIGHT_CAMPAIGN_LIMIT = 10;

/**
 * Bộ lọc "Loại kênh" của trang → kênh của TỪNG TIN (khoá của module đếm tin). Áp lên tin chứ không áp lên loại chiến
 * dịch: chiến dịch đa kênh (`mixed`) vẫn có tin email / Zalo và phải hiện đúng ở bộ lọc kênh tương ứng.
 */
const CHANNELS_BY_TYPE_FILTER = Object.freeze({
  email: ['email'],
  zalo: ['zalo_personal', 'zalo_friend_request'],
  zalo_group: ['zalo_group'],
  telegram: ['telegram'],
  whatsapp: ['whatsapp'],
});

/** Loại chiến dịch (`campaigns.campaign_type`) → khoá kênh, cho đơn hàng (customer_purchases chỉ biết chiến dịch). */
const ORDER_CHANNEL_BY_CAMPAIGN_TYPE = Object.freeze({
  email: 'email',
  zalo: 'zalo_personal',
  zalo_group: 'zalo_group',
  telegram: 'telegram',
  telegram_group: 'telegram',
  whatsapp: 'whatsapp',
});

/** Phần trăm làm tròn 1 chữ số; mẫu số 0 → 0 (thẻ tự ẩn khi kỳ không có thư). Không cắt trần: số > 100% là lỗi cần lộ ra. */
const toPercent = (part, whole) => (whole > 0 ? Number(((part / whole) * 100).toFixed(1)) : 0);

class DashboardAnalyticsService {
  /**
   * Parse and normalize dashboard filters from query params.
   *
   * @param {object} input
   * @returns {object}
   */
  parseFilters(input = {}) {
    const rawCampaignType = String(input.campaignType || 'all').trim().toLowerCase();
    const campaignTypeOptions = new Set(['all', 'email', 'zalo', 'zalo_group', 'telegram', 'whatsapp']);
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

    // Ngày trên biểu đồ = ngày VIỆT NAM (CSDL gộp DATE() theo múi phiên Asia/Ho_Chi_Minh, xem dashboard.repository).
    // Trước đây lấy ngày UTC: từ 00:00 đến 07:00 giờ VN, "hôm nay" của CSDL chưa có trong timelineMap → tin gửi
    // hôm nay bị rơi (0). CI 30/09/2026 00:13 VN làm lộ ở channelAdapterReportsW7b.test.js.
    const vnNow = new Date(Date.now() + VN_OFFSET_MS);
    const defaultEnd = new Date(Date.UTC(vnNow.getUTCFullYear(), vnNow.getUTCMonth(), vnNow.getUTCDate()));
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
      // Mốc lọc SQL = 00:00 giờ VN của ngày đầu / ngày sau ngày cuối (không phải 00:00 UTC = 07:00 VN).
      startAt: new Date(safeStart.getTime() - VN_OFFSET_MS).toISOString(),
      endExclusive: new Date(safeEndExclusive.getTime() - VN_OFFSET_MS).toISOString(),
    };
  }

  /**
   * Phạm vi đếm tin theo quyền: siêu quản trị xem toàn hệ thống (`ownerId: null` TƯỜNG MINH — sendStats từ chối
   * `undefined` để không bao giờ rơi âm thầm sang toàn hệ thống), còn lại chỉ dữ liệu của chủ workspace (nhân viên
   * đã được controller đổi thành id chủ). Khớp phạm vi của truy vấn đơn hàng (buildCampaignScopeClause).
   *
   * @param {number} userId
   * @param {string} roleCode
   * @returns {{ ownerId: number|null }}
   */
  resolveSendScope(userId, roleCode) {
    return isAdminRole(roleCode) ? { ownerId: null } : { ownerId: Number(userId) };
  }

  /**
   * Bộ lọc ngày VN của trang → `window` của sendStats. `startDate` / `endDate` đã là ngày VN 'YYYY-MM-DD'
   * (parseDateRange) và `endDate` được tính trọn ngày — mốc thời gian tính trong SQL, không đi qua `Date` của JS.
   *
   * @param {{ startDate: string, endDate: string }} filters
   * @returns {{ fromDate: string, toDate: string }}
   */
  resolveSendWindow(filters) {
    return { fromDate: filters.startDate, toDate: filters.endDate };
  }

  /**
   * Chiến dịch được chọn ở bộ lọc → tham số `campaignIds` của sendStats (null = không lọc; sendStats lọc TRONG CTE).
   *
   * @param {{ campaignIds: number[] }} filters
   * @returns {number[]|null}
   */
  resolveSendCampaignIds(filters) {
    return Array.isArray(filters.campaignIds) && filters.campaignIds.length > 0 ? filters.campaignIds : null;
  }

  /**
   * Giữ các dòng thuộc kênh mà bộ lọc "Loại kênh" cho phép. Bộ lọc áp lên KÊNH CỦA TỪNG TIN (không phải loại
   * chiến dịch): chiến dịch đa kênh (`mixed`) vẫn có tin email / Zalo. Dòng sendStats đã gom theo kênh nên lọc ở đây
   * chính xác như lọc trong SQL.
   *
   * @template {{ channel: string }} T
   * @param {T[]} rows
   * @param {string} campaignType
   * @returns {T[]}
   */
  filterRowsByChannelType(rows, campaignType) {
    const allowed = CHANNELS_BY_TYPE_FILTER[campaignType];
    return allowed ? rows.filter((row) => allowed.includes(row.channel)) : rows;
  }

  /**
   * Kênh "tin" hiển thị (thứ tự registry): mọi kênh trừ lời mời kết bạn Zalo (một dòng riêng, không cộng vào tin),
   * theo bộ lọc "Loại kênh".
   *
   * @param {string} campaignType
   * @returns {string[]}
   */
  listMessageChannels(campaignType) {
    const keys = campaignChannelRegistry.listChannelsForStats().map((channel) => channel.key);
    return this.filterRowsByChannelType(keys.map((channel) => ({ channel })), campaignType)
      .map((row) => row.channel)
      .filter((channel) => channel !== FRIEND_REQUEST_CHANNEL);
  }

  /**
   * Gom một loại chiến dịch của đơn hàng về khoá kênh của module đếm tin; loại lạ (đa kênh…) vào 'other'.
   *
   * @param {string} campaignType
   * @returns {string}
   */
  resolveOrderChannel(campaignType) {
    return ORDER_CHANNEL_BY_CAMPAIGN_TYPE[String(campaignType || '').trim()] || OTHER_ORDER_CHANNEL;
  }

  /**
   * Mọi ngày lịch từ `startDate` đến `endDate` (gồm cả hai đầu) dạng 'YYYY-MM-DD'. Tính thuần trên chuỗi ngày —
   * không phụ thuộc múi giờ tiến trình.
   *
   * @param {string} startDate
   * @param {string} endDate
   * @returns {string[]}
   */
  listDays(startDate, endDate) {
    const days = [];
    const end = new Date(`${endDate}T00:00:00.000Z`);
    for (let cursor = new Date(`${startDate}T00:00:00.000Z`); cursor.getTime() <= end.getTime(); cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)) {
      days.push(cursor.toISOString().slice(0, 10));
    }
    return days;
  }

  /**
   * Build dashboard overview payload — "Báo cáo" trang: 4 thẻ.
   *
   * Số đếm tin đọc từ MỘT nguồn: module sendStats (bảng tin email_messages / zalo_messages / campaign_channel_messages)
   * theo cửa sổ ngày VN, chiến dịch, kênh của bộ lọc. Đơn hàng đọc từ MỘT nguồn: customer_purchases, cho cả số tổng lẫn
   * số theo kênh (tổng = cộng các dòng theo kênh). KHÔNG đọc customer_journey, bộ đếm campaign_runs hay nhật ký node.
   *
   * @param {number} userId
   * @param {string} roleCode
   * @param {object} query
   * @returns {Promise<{
   *   filters: object,
   *   sent: { total: number, byChannel: Array<{ channel: string, sent: number }>, friendRequests: number },
   *   failed: { total: number },
   *   email: { sent: number, opened: number, clicked: number, openRate: number, clickRate: number },
   *   clicks: { total: number, byChannel: Array<{ channel: string, clicked: number }> },
   *   orders: { completed: number, pending: number, byChannel: Array<{ channel: string, completed: number, pending: number }> }
   * }>}
   */
  async getOverview(userId, roleCode, query) {
    const filters = this.parseFilters(query);
    const scopedFilters = { ...filters, userId, roleCode };
    const purchaseOrderStatusExpr = await customerHelperService.resolvePurchaseOrderStatusExpr('cp');
    const [channelRows, orderRows] = await Promise.all([
      sendStats.getChannelTotals(
        this.resolveSendScope(userId, roleCode),
        this.resolveSendWindow(filters),
        { campaignIds: this.resolveSendCampaignIds(filters) }
      ),
      dashboardRepository.getOrderMetricsByType(scopedFilters, purchaseOrderStatusExpr),
    ]);

    const visibleRows = this.filterRowsByChannelType(channelRows, filters.campaignType);
    const messageRows = visibleRows.filter((row) => row.channel !== FRIEND_REQUEST_CHANNEL);
    const friendRequestRow = visibleRows.find((row) => row.channel === FRIEND_REQUEST_CHANNEL);
    const emailRow = visibleRows.find((row) => row.channel === EMAIL_CHANNEL);
    const sumBy = (rows, key) => rows.reduce((sum, row) => sum + row[key], 0);

    // Tỉ lệ mở / nhấp tính trên CÙNG nhóm thư đã gửi trong kỳ: mỗi thư đếm một lần (mở / nhấp nhiều lần hay bấm
    // nhiều link vẫn là một thư), nên không bao giờ vượt 100%.
    const emailSent = emailRow?.sent ?? 0;
    const emailOpened = emailRow?.opened ?? 0;
    const emailClicked = emailRow?.clicked ?? 0;

    const orderBuckets = new Map();
    for (const row of orderRows) {
      const channel = this.resolveOrderChannel(row.campaign_type);
      const bucket = orderBuckets.get(channel) || { channel, completed: 0, pending: 0 };
      bucket.completed += Number(row.completed_orders || 0);
      bucket.pending += Number(row.pending_orders || 0);
      orderBuckets.set(channel, bucket);
    }
    // Tổng = cộng các dòng theo kênh — không có nguồn thứ hai để lệch.
    const orderChannelOrder = [...campaignChannelRegistry.listChannelsForStats().map((channel) => channel.key), OTHER_ORDER_CHANNEL];
    const orderByChannel = [...orderBuckets.values()]
      .filter((bucket) => bucket.completed + bucket.pending > 0)
      .sort((a, b) => orderChannelOrder.indexOf(a.channel) - orderChannelOrder.indexOf(b.channel));

    return {
      filters: {
        campaignType: filters.campaignType,
        campaignIds: filters.campaignIds,
        startDate: filters.startDate,
        endDate: filters.endDate,
      },
      sent: {
        total: sumBy(messageRows, 'sent'),
        byChannel: messageRows.map(({ channel, sent }) => ({ channel, sent })),
        friendRequests: friendRequestRow?.sent ?? 0,
      },
      failed: { total: sumBy(messageRows, 'failed') },
      email: {
        sent: emailSent,
        opened: emailOpened,
        clicked: emailClicked,
        openRate: toPercent(emailOpened, emailSent),
        clickRate: toPercent(emailClicked, emailSent),
      },
      clicks: {
        total: sumBy(messageRows, 'clicked'),
        byChannel: messageRows.map(({ channel, clicked }) => ({ channel, clicked })),
      },
      orders: {
        completed: sumBy(orderByChannel, 'completed'),
        pending: sumBy(orderByChannel, 'pending'),
        byChannel: orderByChannel,
      },
    };
  }

  /**
   * Bảng "Chiến dịch trong kỳ": các chiến dịch CÓ tin trong cửa sổ ngày, sắp theo số đã gửi (mặc định 10 dòng).
   * Đã gửi / chưa gửi được / mở / nhấp đọc từ sendStats.getCampaignTotals (cùng nguồn với các thẻ), đã mua từ
   * customer_purchases. Lời mời kết bạn Zalo không nằm trong dòng nào (dòng riêng, không phải "tin"). Chiến dịch đã
   * xoá gộp thành một dòng `campaignId: null` để bảng vẫn cộng khớp với thẻ.
   *
   * @param {number} userId
   * @param {string} roleCode
   * @param {object} query
   * @param {number} [query.limit=10]
   * @returns {Promise<{ filters: object, items: Array<{ campaignId: number|null, campaignName: string|null,
   *   campaignType: string|null, sent: number, failed: number, opened: number, clicked: number, purchased: number }> }>}
   */
  async getCampaignsTable(userId, roleCode, query) {
    const filters = this.parseFilters(query);
    const limit = Math.min(20, Math.max(1, Number.parseInt(query?.limit, 10) || 10));
    const scopedFilters = { ...filters, userId, roleCode };
    const purchaseOrderStatusExpr = await customerHelperService.resolvePurchaseOrderStatusExpr('cp');

    const rows = await sendStats.getCampaignTotals(
      this.resolveSendScope(userId, roleCode),
      this.resolveSendWindow(filters),
      this.resolveSendCampaignIds(filters)
    );

    const byCampaign = new Map();
    for (const row of this.filterRowsByChannelType(rows, filters.campaignType)) {
      if (row.channel === FRIEND_REQUEST_CHANNEL) continue;
      const acc = byCampaign.get(row.campaignId) || { campaignId: row.campaignId, sent: 0, failed: 0, opened: 0, clicked: 0 };
      acc.sent += row.sent;
      acc.failed += row.failed;
      acc.opened += row.opened;
      acc.clicked += row.clicked;
      byCampaign.set(row.campaignId, acc);
    }

    const ranked = [...byCampaign.values()]
      .filter((item) => item.sent + item.failed > 0)
      .sort((a, b) => b.sent - a.sent || b.failed - a.failed || (a.campaignId ?? Infinity) - (b.campaignId ?? Infinity))
      .slice(0, limit);

    const campaignIds = ranked.map((item) => item.campaignId).filter((id) => id != null);
    const [nameRows, orderRows] = await Promise.all([
      dashboardRepository.getCampaignNames(scopedFilters, campaignIds),
      dashboardRepository.getCompletedOrdersByCampaign(scopedFilters, purchaseOrderStatusExpr, campaignIds),
    ]);
    const nameById = new Map(nameRows.map((row) => [Number(row.id), row]));
    const purchasedById = new Map(orderRows.map((row) => [Number(row.campaign_id), Number(row.completed_orders || 0)]));

    return {
      filters: {
        campaignType: filters.campaignType,
        campaignIds: filters.campaignIds,
        startDate: filters.startDate,
        endDate: filters.endDate,
      },
      items: ranked.map((item) => {
        const campaign = item.campaignId == null ? null : nameById.get(item.campaignId);
        return {
          campaignId: item.campaignId,
          campaignName: campaign?.campaign_name ?? null,
          campaignType: campaign?.campaign_type ?? null,
          sent: item.sent,
          failed: item.failed,
          opened: item.opened,
          clicked: item.clicked,
          purchased: item.campaignId == null ? 0 : (purchasedById.get(item.campaignId) ?? 0),
        };
      }),
    };
  }

  /**
   * Build timeline analytics payload.
   *
   * - `dailySent`: MỘT chuỗi "đã gửi mỗi ngày" theo NGÀY VN (chuỗi 'YYYY-MM-DD'), mỗi ngày một dòng phẳng
   *   `{ date, total, <kênh>: n }` (đủ mọi ngày trong khoảng, ngày trống = 0), từ sendStats.getDailySeries — tổng các
   *   ngày bằng `sent.total` của getOverview cùng bộ lọc. Lời mời kết bạn Zalo không nằm trong chuỗi.
   * - `ordersTimeline`: đơn hàng theo ngày (customer_purchases), cho biểu đồ đơn hàng của chủ tài khoản.
   *
   * @param {number} userId
   * @param {string} roleCode
   * @param {object} query
   * @returns {Promise<{ filters: object, dailySent: Array<object>, ordersTimeline: Array<object> }>}
   */
  async getAnalytics(userId, roleCode, query) {
    const filters = this.parseFilters(query);
    const scopedFilters = { ...filters, userId, roleCode };
    const purchaseOrderStatusExpr = await customerHelperService.resolvePurchaseOrderStatusExpr('cp');
    const [sentRows, orderRows] = await Promise.all([
      sendStats.getDailySeries(
        this.resolveSendScope(userId, roleCode),
        this.resolveSendWindow(filters),
        { campaignIds: this.resolveSendCampaignIds(filters) }
      ),
      dashboardRepository.getOrdersDaily(scopedFilters, purchaseOrderStatusExpr),
    ]);

    const days = this.listDays(filters.startDate, filters.endDate);
    const messageChannels = this.listMessageChannels(filters.campaignType);

    const dailySentMap = new Map(days.map((date) => [
      date,
      { date, total: 0, ...Object.fromEntries(messageChannels.map((channel) => [channel, 0])) },
    ]));
    for (const row of sentRows) {
      const item = dailySentMap.get(row.day);
      if (!item || !messageChannels.includes(row.channel)) continue;
      item[row.channel] += row.sent;
      item.total += row.sent;
    }

    const ordersMap = new Map(days.map((date) => [
      date,
      {
        date,
        pendingOrders: 0,
        completedOrders: 0,
        emailPendingOrders: 0,
        emailCompletedOrders: 0,
        zaloPendingOrders: 0,
        zaloCompletedOrders: 0,
        zaloGroupPendingOrders: 0,
        zaloGroupCompletedOrders: 0,
      },
    ]));
    for (const row of orderRows) {
      const item = ordersMap.get(String(row.date).slice(0, 10));
      if (!item) continue;
      const pending = Number(row.pending_orders || 0);
      const completed = Number(row.completed_orders || 0);
      item.pendingOrders += pending;
      item.completedOrders += completed;
      const channel = this.resolveOrderChannel(row.campaign_type);
      if (channel === 'email') {
        item.emailPendingOrders += pending;
        item.emailCompletedOrders += completed;
      } else if (channel === 'zalo_personal') {
        item.zaloPendingOrders += pending;
        item.zaloCompletedOrders += completed;
      } else if (channel === 'zalo_group') {
        item.zaloGroupPendingOrders += pending;
        item.zaloGroupCompletedOrders += completed;
      }
    }

    return {
      filters: {
        campaignType: filters.campaignType,
        campaignIds: filters.campaignIds,
        startDate: filters.startDate,
        endDate: filters.endDate,
      },
      dailySent: Array.from(dailySentMap.values()),
      ordersTimeline: Array.from(ordersMap.values()),
    };
  }

  /**
   * Snapshot số liệu cho "Nhận xét AI": server TỰ tính bằng đúng các hàm của trang Báo cáo (getOverview / getAnalytics /
   * getCampaignsTable) theo bộ lọc — KHÔNG nhận số do trình duyệt gửi lên để viết lời, nên lời AI luôn khớp các thẻ.
   *
   * @param {number} userId chủ workspace
   * @param {string} roleCode
   * @param {{ startDate?: string, endDate?: string, period?: string, campaignType?: string, campaignIds?: unknown }} [input]
   * @returns {Promise<{ filters: object, overview: object, dailySent: Array<object>, ordersTimeline: Array<object>, campaigns: Array<object> }>}
   */
  async getInsightSnapshot(userId, roleCode, input) {
    const source = input && typeof input === 'object' ? input : {};
    const query = {
      startDate: source.startDate,
      endDate: source.endDate,
      period: source.period,
      campaignType: source.campaignType,
      campaignIds: source.campaignIds,
    };
    const [overview, analytics, campaigns] = await Promise.all([
      this.getOverview(userId, roleCode, query),
      this.getAnalytics(userId, roleCode, query),
      this.getCampaignsTable(userId, roleCode, { ...query, limit: INSIGHT_CAMPAIGN_LIMIT }),
    ]);
    return {
      filters: overview.filters,
      overview,
      dailySent: analytics.dailySent,
      ordersTimeline: analytics.ordersTimeline,
      campaigns: campaigns.items,
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
   * Thống kê landing page: view/click (bảng events) và submit (bảng leads) theo slug trong khoảng ngày.
   * Dữ liệu được lọc theo workspace owner; super admin vẫn có thể xem toàn hệ thống.
   *
   * Query:
   * - Mặc định: `startDate` / `endDate` hoặc `period` (7d|30d|90d) — giống các API dashboard khác.
   * - Toàn thời gian: `allTime=1` hoặc `period=all` — không truyền mốc ngày xuống aggregate (mọi bản ghi).
   *
   * @param {object} authUser
   * @param {object} query startDate, endDate, period, allTime
   * @returns {Promise<{ filters: object, rows: { slug: string, title: string, viewCount: number, clickCount: number, submitCount: number, clickThroughRatePct: number, submitRateVsViewsPct: number }[] }>}
   */
  async getLandingPageStats(authUser, query) {
    const workspaceScope = getWorkspaceScope(authUser);
    const q = query || {};
    const periodRaw = String(q.period ?? '').trim().toLowerCase();
    const allTimeFlag = String(q.allTime ?? '').trim();
    const allTime =
      periodRaw === 'all' ||
      allTimeFlag === '1' ||
      allTimeFlag.toLowerCase() === 'true';

    let startDate;
    let endDate;
    let filters;

    if (allTime) {
      startDate = null;
      endDate = null;
      filters = { allTime: true };
    } else {
      const parsed = this.parseDateRange({
        startDate: q.startDate,
        endDate: q.endDate,
        period: q.period,
      });
      startDate = parsed.startDate;
      endDate = parsed.endDate;
      filters = { startDate, endDate };
    }

    const [eventAgg, submitAgg, formSubmitAgg] = await Promise.all([
      landingPageEventRepository.aggregateEventsBySlug(startDate, endDate, workspaceScope),
      leadRepository.aggregateSubmitsBySlug(startDate, endDate, workspaceScope),
      formRepository.aggregateSubmitsBySlug(startDate, endDate, workspaceScope),
    ]);

    const bySlug = new Map();
    for (const r of eventAgg) {
      if (!r.slug) continue;
      bySlug.set(r.slug, {
        slug: r.slug,
        viewCount: Number(r.viewCount || 0),
        clickCount: Number(r.clickCount || 0),
        submitCount: 0,
      });
    }
    for (const r of submitAgg) {
      if (!r.slug) continue;
      const cur = bySlug.get(r.slug) || {
        slug: r.slug,
        viewCount: 0,
        clickCount: 0,
        submitCount: 0,
      };
      cur.submitCount += Number(r.submitCount || 0);
      bySlug.set(r.slug, cur);
    }
    // PR-7a (Bo sung 15/09 khi soan lenh PR-7 muc 2): bai nop Bieu mau la nguon THU HAI cua
    // luot gui, phai CONG vao cur.submitCount da co tu leads (khong GAN de mat lien ket cu).
    for (const r of formSubmitAgg) {
      if (!r.slug) continue;
      const cur = bySlug.get(r.slug) || {
        slug: r.slug,
        viewCount: 0,
        clickCount: 0,
        submitCount: 0,
      };
      cur.submitCount += Number(r.submitCount || 0);
      bySlug.set(r.slug, cur);
    }

    /** Gộp mọi slug đã publish trong CMS để bảng/biểu đồ có dòng dù chưa có view/click (render /lp). */
    const publishedList = await landingPageRepository.listPublishedSlugsWithTitles(workspaceScope);
    for (const p of publishedList) {
      const key = p.slug;
      if (!key || key === 'l') continue;
      if (!bySlug.has(key)) {
        bySlug.set(key, {
          slug: key,
          viewCount: 0,
          clickCount: 0,
          submitCount: 0,
        });
      }
    }

    const slugKeys = Array.from(bySlug.keys());
    const titleBySlug = await landingPageRepository.findTitlesBySlugs(slugKeys, workspaceScope);
    /** Slug landing React cố định `/l` — đồng bộ nhãn với bảng admin khi không có bản ghi CMS. */
    const fixedLandingSlug = 'l';
    const fixedLandingTitle = 'Landing cố định (/l)';

    const rows = Array.from(bySlug.values()).map((row) => {
      const views = row.viewCount;
      const clicks = row.clickCount;
      const submits = row.submitCount;
      const clickThroughRatePct = views > 0 ? Math.round((clicks / views) * 10000) / 100 : 0;
      const submitRateVsViewsPct = views > 0 ? Math.round((submits / views) * 10000) / 100 : 0;
      const slugStr = String(row.slug || '');
      const slugKey = slugStr.trim().toLowerCase();
      const fromDb = titleBySlug.get(slugKey);
      const title =
        fromDb != null && String(fromDb).trim() !== ''
          ? String(fromDb).trim()
          : slugKey === fixedLandingSlug
            ? fixedLandingTitle
            : slugStr;
      return {
        ...row,
        title,
        clickThroughRatePct,
        submitRateVsViewsPct,
      };
    });

    rows.sort((a, b) => String(a.slug).localeCompare(String(b.slug)));

    return {
      filters,
      rows,
    };
  }
}

export default new DashboardAnalyticsService();
