import db from '../../config/database.js';
import { EMAIL_SENT_STATUS_SQL_LIST } from '../../constants/emailMessageStatus.js';

/**
 * PLAN_SO_LIEU_DUNG_GON_KHOP_2026-09-30, PR-4a — SQL đếm gửi tin DÙNG CHUNG, đọc thẳng từ BẢNG TIN
 * (email_messages, zalo_messages, campaign_channel_messages), không đọc customer_journey hay bộ đếm
 * campaign_runs / campaigns.total_sent (hai nguồn đó lệch: thiếu thư không gắn khách, phình với lượt cũ).
 *
 * MỘT bộ dựng CTE cho cả 7 truy vấn; các hàm public chỉ khác câu SELECT cuối:
 *
 *   msgs  = UNION ALL 3 bảng, mỗi nhánh TỰ lọc phạm vi + cửa sổ trên cột gốc của bảng đó (để dùng index
 *           (workspace_owner_id, sent_at)), chỉ giữ dòng "đã gửi" hoặc "lỗi"; mỗi dòng mang cờ is_sent / is_failed …
 *   dest  = gom `msgs` theo ĐÍCH (kênh, lượt chạy, node, người nhận, bước). Số "lỗi" đếm theo ĐÍCH: đích có dòng
 *           lỗi mà KHÔNG có dòng đã-gửi cùng đích. Đếm theo dòng thì mỗi lần thử lại cộng thêm một lần lỗi (đo
 *           production 90 ngày: Zalo cá nhân 4.736 dòng lỗi = 1.778 người, 2.659 dòng sau đó GỬI ĐƯỢC).
 *
 * Mọi phép gom (kênh / lượt / chiến dịch / người thực hiện) là GROUP BY trên cùng `dest` nên các tổng luôn
 * cộng khớp nhau — đó là điều các màn Tổng quan / Giám sát / Hoạt động nhóm cần.
 *
 * Định nghĩa từng cột: xem sendStats.service.js (từ điển số liệu, plan mục 2). File này chỉ chứa SQL.
 *
 * Cột thời gian: email_messages / zalo_messages là `timestamp` KHÔNG múi giờ chứa GIỜ VN, còn
 * campaign_channel_messages là `timestamptz`. Vì vậy MỌI mốc cửa sổ tính TRONG SQL (LOCALTIMESTAMP / ::date),
 * KHÔNG bind `Date` của JS (tiến trình Node chạy UTC → lệch 7 giờ ở biên ngày). Ngày trả ra là chuỗi
 * 'YYYY-MM-DD' (to_char ở SQL — trả cột DATE thì node-pg dựng Date theo giờ máy và ra JSON lùi một ngày),
 * mốc thời gian trả ra là timestamptz.
 */

const VN_TZ = 'Asia/Ho_Chi_Minh';

// Nhãn error_category của dòng adapter ĐÃ được thử lại — khớp TRANSIENT_RETRY_CATEGORY ở
// campaignChannelRunner.service.js (không import: runner kéo cả engine gửi). Dòng mang nhãn này là lần thử,
// KHÔNG phải lỗi cuối. Test integration có ca canh nhãn này khớp hằng của runner.
const TRANSIENT_RETRY_CATEGORY = 'transient_retry';

// Cắt lý do lỗi: bounce_reason của SMTP có thể dài cả trang.
const REASON_MAX_LENGTH = 500;

// Trạng thái hiệu lực của một dòng zalo_messages. Cột `status` chỉ nói thật từ 11/09/2026 (commit 936c42b8):
// trước đó MỌI dòng (kể cả tin đã gửi) đứng ở 'pending' vĩnh viễn, trạng thái thật chỉ nằm ở
// tracking_metadata->>'status' — và chưa có bản backfill. Nên đọc cột, nếu còn 'pending' thì rơi về JSON.
// Cửa sổ 30/90 ngày còn chứa nhiều dòng cũ; chỉ đọc cột thì tin Zalo cũ biến mất khỏi số "đã gửi".
const ZALO_STATUS_SQL = `COALESCE(NULLIF(m.status::text, 'pending'), m.tracking_metadata->>'status')`;

// Bước gửi của dòng Zalo: nằm ở JSON (không có cột), mặc định 1 — cùng cách chống gửi trùng
// (zaloMessage.repository.js findExistingSentCampaignZaloMessage). Regex chặn giá trị lạ làm hỏng cả truy vấn.
const ZALO_STEP_SQL = `(CASE WHEN m.tracking_metadata->>'stepIndex' ~ '^[0-9]{1,9}$'
                             THEN (m.tracking_metadata->>'stepIndex')::int ELSE 1 END)`;

// Người nhận của dòng Zalo: recipient_value trước (định danh gốc từ dữ liệu chiến dịch, ổn định qua các lần
// thử lại — cùng quotaRecipientKey của engine), rồi uid, rồi group_id. Chiến dịch ghi recipient_value cho cả
// cá nhân / nhóm / kết bạn (campaignRun.service.js createZaloMessageTrackingRecord), còn `uid` luôn NULL.
const ZALO_RECIPIENT_RAW_SQL = `COALESCE(NULLIF(btrim(m.recipient_value), ''), NULLIF(btrim(m.uid), ''), NULLIF(btrim(m.group_id), ''))`;

const ADAPTER_FINAL_FAILED_SQL = `(m.status = 'failed' AND m.error_category IS DISTINCT FROM '${TRANSIENT_RETRY_CATEGORY}')`;

/** Gom tham số truy vấn, trả về placeholder $n; dùng lại được nhiều lần trong cùng câu SQL. */
class ParamBag {
  constructor() {
    this.values = [];
  }

  add(value) {
    this.values.push(value);
    return `$${this.values.length}`;
  }
}

/**
 * Điều kiện phạm vi theo `workspace_owner_id` — cột nằm ở CẢ 3 bảng và là cột đầu của index
 * (workspace_owner_id, sent_at).
 * - `ownerId` có giá trị: đúng chủ đó.
 * - `ownerId` null (toàn hệ thống): mọi dòng — KỂ CẢ dòng thiếu chủ (thư không thuộc chiến dịch nào) — trừ chủ
 *   trong `excludeOwnerIds`. `= ANY` trả NULL với dòng thiếu chủ nên phải bọc COALESCE, nếu không dòng thiếu
 *   chủ bị loại nhầm khỏi phạm vi toàn hệ thống.
 */
function makeScopePredicate(scope, bag) {
  if (scope.ownerId != null) {
    const owner = bag.add(scope.ownerId);
    return (alias) => `${alias}.workspace_owner_id = ${owner}`;
  }
  if (scope.excludeOwnerIds.length > 0) {
    const excluded = bag.add(scope.excludeOwnerIds);
    return (alias) => `NOT COALESCE(${alias}.workspace_owner_id = ANY(${excluded}::bigint[]), FALSE)`;
  }
  return () => 'TRUE';
}

/**
 * Điều kiện cửa sổ thời gian — ba dạng, đều tính trong SQL:
 * - `{ kind: 'days', days }`: N×24 giờ gần nhất tính đến lúc chạy.
 * - `{ kind: 'range', fromDate, toDate }`: 'YYYY-MM-DD' theo NGÀY VN, gồm trọn ngày `toDate`.
 * - `{ kind: 'hours', hours }`: `hours` giờ TRÒN gần nhất (gồm giờ hiện tại) — chỉ cho chuỗi theo giờ.
 * `naive(cột)` cho cột `timestamp` (giờ VN); `tz(biểu thức)` cho `timestamptz` — mốc ngày VN đổi sang
 * timestamptz bằng AT TIME ZONE. `null` = không giới hạn thời gian (số theo lượt chạy / chiến dịch).
 */
function makeWindowPredicates(window, bag) {
  if (!window) {
    return { naive: () => 'TRUE', tz: () => 'TRUE' };
  }
  if (window.kind === 'hours') {
    // `hours` giờ TRÒN gần nhất, gồm giờ hiện tại đang chạy dở: mốc đầu = đầu giờ VN của (hours - 1) giờ trước.
    // Chuỗi theo giờ cần ranh giới giờ chẵn — cửa sổ cuộn "24×60 phút" sẽ cắt cụt cột giờ đầu tiên.
    // Chỉ dùng nội bộ cho hourlySeries (normalizeWindow không nhận dạng này).
    const hours = bag.add(window.hours);
    const start = `(date_trunc('hour', LOCALTIMESTAMP) - make_interval(hours => (${hours}::int - 1)))`;
    return {
      naive: (column) => `${column} >= ${start}`,
      tz: (expression) => `${expression} >= (${start} AT TIME ZONE '${VN_TZ}')`,
    };
  }
  if (window.kind === 'days') {
    const days = bag.add(window.days);
    return {
      naive: (column) => `${column} >= LOCALTIMESTAMP - make_interval(days => ${days}::int)`,
      tz: (expression) => `${expression} >= now() - make_interval(days => ${days}::int)`,
    };
  }
  const from = bag.add(window.fromDate);
  const to = bag.add(window.toDate);
  return {
    naive: (column) => `${column} >= ${from}::date AND ${column} < (${to}::date + 1)`,
    tz: (expression) => `${expression} >= (${from}::date)::timestamp AT TIME ZONE '${VN_TZ}'`
      + ` AND ${expression} < ((${to}::date + 1)::timestamp AT TIME ZONE '${VN_TZ}')`,
  };
}

/** Bộ lọc thêm theo lượt chạy / chiến dịch — đặt ngay trong từng nhánh để dùng index, không lọc sau khi gom. */
function makeFilterPredicate(filters, bag) {
  const parts = [];
  if (filters.runIds) {
    const runIds = bag.add(filters.runIds);
    parts.push((alias) => `${alias}.id_run = ANY(${runIds}::bigint[])`);
  }
  if (filters.runId != null) {
    const runId = bag.add(filters.runId);
    parts.push((alias) => `${alias}.id_run = ${runId}`);
  }
  if (filters.campaignIds) {
    const campaignIds = bag.add(filters.campaignIds);
    parts.push((alias) => `${alias}.id_campaign = ANY(${campaignIds}::bigint[])`);
  }
  return (alias) => (parts.length === 0 ? 'TRUE' : parts.map((part) => part(alias)).join(' AND '));
}

/**
 * Cột chi tiết (lý do, người nhận hiển thị) — chỉ dựng khi cần liệt kê lỗi. Mọi nhánh phải có CÙNG bộ cột
 * để UNION ALL khớp; khi không cần chi tiết thì bỏ hẳn (khỏi đọc JSONB và dựng chuỗi cho từng dòng).
 */
const DETAIL_COLUMNS = {
  email: `,
           LEFT(COALESCE(NULLIF(btrim(m.bounce_reason), ''), NULLIF(btrim(m.error_message), '')), ${REASON_MAX_LENGTH}) AS reason,
           NULLIF(btrim(m.recipient_email), '') AS recipient_raw,
           NULL::text AS recipient_display`,
  zalo: `,
           LEFT(COALESCE(NULLIF(btrim(m.tracking_metadata->>'error'), ''), NULLIF(btrim(m.tracking_metadata->>'errorLabel'), '')), ${REASON_MAX_LENGTH}) AS reason,
           ${ZALO_RECIPIENT_RAW_SQL} AS recipient_raw,
           NULLIF(btrim(m.tracking_metadata->>'groupName'), '') AS recipient_display`,
  adapter: `,
           LEFT(NULLIF(concat_ws(': ', NULLIF(btrim(m.error_category), ''), NULLIF(btrim(m.error_message), '')), ''), ${REASON_MAX_LENGTH}) AS reason,
           NULLIF(btrim(m.recipient_key), '') AS recipient_raw,
           NULLIF(btrim(m.recipient_display), '') AS recipient_display`,
};

function emailBranch({ channelRef, scope, window, filter, detail }) {
  return `
    SELECT ${channelRef}::text AS channel,
           m.id AS row_id, m.id_run, m.id_campaign, m.id_node,
           NULLIF(lower(btrim(m.recipient_email)), '') AS recipient_key,
           m.email_step AS step,
           m.actor_user_id,
           (m.status IN ${EMAIL_SENT_STATUS_SQL_LIST}) AS is_sent,
           (m.status = 'failed') AS is_failed,
           (m.status = 'bounced') AS is_bounced,
           (m.status IN ${EMAIL_SENT_STATUS_SQL_LIST} AND m.first_opened_at IS NOT NULL) AS is_opened,
           (m.status IN ${EMAIL_SENT_STATUS_SQL_LIST}
              AND (m.first_clicked_at IS NOT NULL OR COALESCE(m.click_count, 0) > 0)) AS is_clicked,
           m.sent_at AS at_vn${detail ? DETAIL_COLUMNS.email : ''}
    FROM email_messages m
    WHERE ${scope('m')}
      AND ${window.naive('m.sent_at')}
      AND ${filter('m')}
      AND NOT COALESCE(m.is_preview, FALSE)
      AND (m.status IN ${EMAIL_SENT_STATUS_SQL_LIST} OR m.status = 'failed')`;
}

function zaloBranch({ channelsRef, scope, window, filter, detail }) {
  return `
    SELECT m.channel::text AS channel,
           m.id AS row_id, m.id_run, m.id_campaign, m.id_node,
           NULLIF(lower(btrim(${ZALO_RECIPIENT_RAW_SQL})), '') AS recipient_key,
           ${ZALO_STEP_SQL} AS step,
           m.actor_user_id,
           (${ZALO_STATUS_SQL} = 'sent') AS is_sent,
           (${ZALO_STATUS_SQL} = 'failed') AS is_failed,
           FALSE AS is_bounced,
           FALSE AS is_opened,
           (${ZALO_STATUS_SQL} = 'sent' AND COALESCE(m.click_count, 0) > 0) AS is_clicked,
           m.sent_at AS at_vn${detail ? DETAIL_COLUMNS.zalo : ''}
    FROM zalo_messages m
    WHERE ${scope('m')}
      AND ${window.naive('m.sent_at')}
      AND ${filter('m')}
      AND NOT COALESCE(m.is_preview, FALSE)
      AND m.channel = ANY(${channelsRef}::text[])
      AND ${ZALO_STATUS_SQL} IN ('sent', 'failed')`;
}

// Dòng lỗi của kênh adapter KHÔNG có sent_at (markFailed chỉ đặt status / error_*), nên thời điểm của tin là
// COALESCE(sent_at, created_at). Bảng này nhỏ (chỉ Telegram/WhatsApp) và index chủ có workspace_owner_id
// đứng đầu — vẫn đủ để lọc theo chủ trước khi lọc thời gian.
function adapterBranch({ channelsRef, scope, window, filter, detail }) {
  const at = 'COALESCE(m.sent_at, m.created_at)';
  return `
    SELECT m.channel::text AS channel,
           m.id AS row_id, m.id_run, m.id_campaign, m.id_node,
           NULLIF(lower(btrim(m.recipient_key)), '') AS recipient_key,
           m.step_index AS step,
           m.actor_user_id,
           (m.status = 'sent') AS is_sent,
           ${ADAPTER_FINAL_FAILED_SQL} AS is_failed,
           FALSE AS is_bounced,
           FALSE AS is_opened,
           FALSE AS is_clicked,
           (${at} AT TIME ZONE '${VN_TZ}') AS at_vn${detail ? DETAIL_COLUMNS.adapter : ''}
    FROM campaign_channel_messages m
    WHERE ${scope('m')}
      AND ${window.tz(at)}
      AND ${filter('m')}
      AND NOT COALESCE(m.is_preview, FALSE)
      AND m.channel = ANY(${channelsRef}::text[])
      AND (m.status = 'sent' OR ${ADAPTER_FINAL_FAILED_SQL})`;
}

/**
 * Dựng phần `WITH msgs AS (...), dest AS (...)` dùng chung. Trả `{ sql, bag }`; hàm gọi nối thêm câu SELECT cuối
 * (và có thể `bag.add` tham số của riêng nó).
 *
 * @param {object} input
 * @param {{ ownerId: number|null, excludeOwnerIds: number[] }} input.scope
 * @param {null|{kind: 'days', days: number}|{kind: 'range', fromDate: string, toDate: string}|{kind: 'hours', hours: number}} input.window
 * @param {{ email: string|null, zalo: string[], adapter: string[] }} input.channels khoá kênh theo bảng chứa
 * @param {{ runIds?: number[], runId?: number, campaignIds?: number[] }} [input.filters]
 * @param {boolean} [input.detail] thêm lý do / người nhận cho `dest` (liệt kê lỗi)
 */
function buildSourceCtes({ scope, window, channels, filters = {}, detail = false }) {
  const bag = new ParamBag();
  const scopePredicate = makeScopePredicate(scope, bag);
  const windowPredicates = makeWindowPredicates(window, bag);
  const filterPredicate = makeFilterPredicate(filters, bag);
  const common = { scope: scopePredicate, window: windowPredicates, filter: filterPredicate, detail };

  const branches = [];
  if (channels.email) {
    branches.push(emailBranch({ ...common, channelRef: bag.add(channels.email) }));
  }
  if (channels.zalo.length > 0) {
    branches.push(zaloBranch({ ...common, channelsRef: bag.add(channels.zalo) }));
  }
  if (channels.adapter.length > 0) {
    branches.push(adapterBranch({ ...common, channelsRef: bag.add(channels.adapter) }));
  }
  if (branches.length === 0) {
    throw new Error('sendStats: registry không có kênh nào để đếm');
  }

  // Lý do / người nhận của đích lấy từ lần thử lỗi CUỐI (mới nhất có lý do) — chỉ dựng khi cần liệt kê lỗi.
  const detailAggregates = detail
    ? `,
        (array_agg(reason ORDER BY at_vn DESC, row_id DESC) FILTER (WHERE is_failed AND reason IS NOT NULL))[1] AS reason,
        (array_agg(recipient_raw ORDER BY at_vn DESC, row_id DESC) FILTER (WHERE is_failed))[1] AS recipient_raw,
        (array_agg(recipient_display ORDER BY at_vn DESC, row_id DESC) FILTER (WHERE is_failed))[1] AS recipient_display`
    : '';

  // solo_id: dòng KHÔNG định danh được đích (lượt chạy đã xoá → id_run NULL, hoặc người nhận trống) thì mỗi dòng
  // là MỘT đích riêng — không được gom chung, nếu không dòng đã-gửi của người này xoá lỗi của người khác.
  // Đích ghép theo (kênh, id_run, id_node, người nhận, bước): NULL gom với NULL (id_node NULL = node đã bị xoá khi
  // lưu lại luồng), nên các lần thử của cùng đích vẫn về một nhóm.
  // NOT MATERIALIZED: getDailySeries đọc `msgs` hai lần (tin đã gửi theo ngày + qua `dest` cho lỗi). Mặc định
  // Postgres ghi cả `msgs` ra file tạm (đo 350k email + 120k Zalo: 18MB, dest tràn 5 batch với work_mem 4MB);
  // cho phép nhúng vào cả hai chỗ thì quét index hai lần nhưng không ghi tạm — nhanh gấp ~3 lần (1,4s → 0,46s,
  // chủ lớn nhất, cửa sổ 90 ngày). Các hàm còn lại chỉ đọc `msgs` một lần nên không đổi. Cú pháp cần PG 12+.
  const sql = `
    WITH msgs AS NOT MATERIALIZED (
      SELECT u.*,
             CASE WHEN u.id_run IS NULL OR u.recipient_key IS NULL THEN u.row_id END AS solo_id
      FROM (${branches.join('\n      UNION ALL\n')}
      ) u
    ),
    dest AS (
      SELECT channel, id_run, id_node, recipient_key, step, solo_id,
             MAX(id_campaign)   AS id_campaign,
             MAX(actor_user_id) AS actor_user_id,
             COUNT(*) FILTER (WHERE is_sent)    AS n_sent,
             COUNT(*) FILTER (WHERE is_bounced) AS n_bounced,
             COUNT(*) FILTER (WHERE is_opened)  AS n_opened,
             COUNT(*) FILTER (WHERE is_clicked) AS n_clicked,
             COUNT(*) FILTER (WHERE is_failed)  AS n_failed,
             MAX(at_vn) FILTER (WHERE is_failed) AS last_failed_at${detailAggregates}
      FROM msgs
      GROUP BY channel, id_run, id_node, recipient_key, step, solo_id
    )`;
  return { sql, bag };
}

// Đích "chưa gửi được": có ít nhất một dòng lỗi và KHÔNG có dòng đã-gửi nào cùng đích.
const FINAL_FAILED_DEST_SQL = '(n_failed > 0 AND n_sent = 0)';

class SendStatsRepository {
  /**
   * @returns {Promise<Array<{channel: string, sent: string, failed: string, bounced: string, opened: string, clicked: string}>>}
   *   theo từng kênh CÓ dữ liệu (số ở dạng chuỗi của pg — service đổi sang số và bù kênh trống)
   */
  async channelTotals({ scope, window, channels, campaignIds = null }) {
    const { sql, bag } = buildSourceCtes({ scope, window, channels, filters: { campaignIds } });
    const { rows } = await db.query(
      `${sql}
       SELECT channel,
              COALESCE(SUM(n_sent), 0)    AS sent,
              COUNT(*) FILTER (WHERE ${FINAL_FAILED_DEST_SQL}) AS failed,
              COALESCE(SUM(n_bounced), 0) AS bounced,
              COALESCE(SUM(n_opened), 0)  AS opened,
              COALESCE(SUM(n_clicked), 0) AS clicked
       FROM dest
       GROUP BY channel`,
      bag.values
    );
    return rows;
  }

  /**
   * Tin đã gửi theo NGÀY CỦA TIN; lỗi theo ngày của lần thử lỗi CUỐI trong cửa sổ (mỗi đích lỗi một lần) — nên
   * tổng theo ngày cộng ra đúng tổng của channelTotals cùng cửa sổ.
   *
   * @returns {Promise<Array<{day: string, channel: string, sent: string, failed: string}>>}
   */
  async dailySeries({ scope, window, channels, campaignIds = null }) {
    const { sql, bag } = buildSourceCtes({ scope, window, channels, filters: { campaignIds } });
    const { rows } = await db.query(
      `${sql}
       SELECT day, channel, SUM(sent) AS sent, SUM(failed) AS failed
       FROM (
         SELECT to_char(at_vn, 'YYYY-MM-DD') AS day, channel, COUNT(*) AS sent, 0::bigint AS failed
         FROM msgs
         WHERE is_sent
         GROUP BY 1, 2
         UNION ALL
         SELECT to_char(last_failed_at, 'YYYY-MM-DD') AS day, channel, 0::bigint AS sent, COUNT(*) AS failed
         FROM dest
         WHERE ${FINAL_FAILED_DEST_SQL}
         GROUP BY 1, 2
       ) per_day
       GROUP BY day, channel
       ORDER BY day, channel`,
      bag.values
    );
    return rows;
  }

  /**
   * Như dailySeries nhưng nhóm theo GIỜ VN. Cùng một bộ CTE (không chép SQL): tin đã gửi theo giờ của tin, đích lỗi
   * tính vào giờ của lần thử lỗi cuối trong cửa sổ. `hour` là timestamptz đầu giờ (Date).
   *
   * @returns {Promise<Array<{hour: Date, channel: string, sent: string, failed: string}>>}
   */
  async hourlySeries({ scope, window, channels }) {
    const { sql, bag } = buildSourceCtes({ scope, window, channels });
    const { rows } = await db.query(
      `${sql}
       SELECT (hour_vn AT TIME ZONE '${VN_TZ}') AS hour, channel, SUM(sent) AS sent, SUM(failed) AS failed
       FROM (
         SELECT date_trunc('hour', at_vn) AS hour_vn, channel, COUNT(*) AS sent, 0::bigint AS failed
         FROM msgs
         WHERE is_sent
         GROUP BY 1, 2
         UNION ALL
         SELECT date_trunc('hour', last_failed_at) AS hour_vn, channel, 0::bigint AS sent, COUNT(*) AS failed
         FROM dest
         WHERE ${FINAL_FAILED_DEST_SQL}
         GROUP BY 1, 2
       ) per_hour
       GROUP BY hour_vn, channel
       ORDER BY hour_vn, channel`,
      bag.values
    );
    return rows;
  }

  /**
   * Toàn bộ dòng của các lượt chạy — KHÔNG theo cửa sổ thời gian (lượt sống lâu vẫn đủ số).
   *
   * @returns {Promise<Array<{id_run: string, channel: string, sent: string, failed: string}>>}
   */
  async runTotals({ scope, runIds, channels }) {
    const { sql, bag } = buildSourceCtes({ scope, window: null, channels, filters: { runIds } });
    const { rows } = await db.query(
      `${sql}
       SELECT id_run, channel,
              COALESCE(SUM(n_sent), 0) AS sent,
              COUNT(*) FILTER (WHERE ${FINAL_FAILED_DEST_SQL}) AS failed
       FROM dest
       GROUP BY id_run, channel
       ORDER BY id_run, channel`,
      bag.values
    );
    return rows;
  }

  /**
   * @returns {Promise<Array<{id_campaign: string|null, channel: string, sent: string, failed: string, opened: string, clicked: string}>>}
   *   `id_campaign` NULL = tin của chiến dịch đã xoá
   */
  async campaignTotals({ scope, window, campaignIds, channels }) {
    const { sql, bag } = buildSourceCtes({ scope, window, channels, filters: { campaignIds } });
    const { rows } = await db.query(
      `${sql}
       SELECT id_campaign, channel,
              COALESCE(SUM(n_sent), 0)    AS sent,
              COUNT(*) FILTER (WHERE ${FINAL_FAILED_DEST_SQL}) AS failed,
              COALESCE(SUM(n_opened), 0)  AS opened,
              COALESCE(SUM(n_clicked), 0) AS clicked
       FROM dest
       GROUP BY id_campaign, channel
       ORDER BY id_campaign, channel`,
      bag.values
    );
    return rows;
  }

  /**
   * Cộng mọi kênh theo người thực hiện (actor_user_id = người tạo chiến dịch).
   *
   * @returns {Promise<Array<{actor_user_id: string|null, sent: string, failed: string}>>}
   */
  async actorTotals({ scope, window, channels }) {
    const { sql, bag } = buildSourceCtes({ scope, window, channels });
    const { rows } = await db.query(
      `${sql}
       SELECT actor_user_id,
              COALESCE(SUM(n_sent), 0) AS sent,
              COUNT(*) FILTER (WHERE ${FINAL_FAILED_DEST_SQL}) AS failed
       FROM dest
       GROUP BY actor_user_id
       ORDER BY actor_user_id`,
      bag.values
    );
    return rows;
  }

  /**
   * Đích chưa gửi được (lỗi cuối), mới nhất trước. `reason` / `recipient` lấy từ lần thử lỗi CUỐI của đích.
   *
   * @returns {Promise<Array<{id_run: string|null, id_campaign: string|null, channel: string, recipient: string|null,
   *   recipient_display: string|null, reason: string|null, attempts: string, at: Date}>>}
   */
  async finalFailures({ scope, runId, window, limit, channels }) {
    const filters = runId != null ? { runId } : {};
    const { sql, bag } = buildSourceCtes({ scope, window, channels, filters, detail: true });
    const limitRef = bag.add(limit);
    const { rows } = await db.query(
      `${sql}
       SELECT id_run, id_campaign, channel,
              COALESCE(recipient_raw, recipient_key) AS recipient,
              recipient_display, reason,
              n_failed AS attempts,
              (last_failed_at AT TIME ZONE '${VN_TZ}') AS at
       FROM dest
       WHERE ${FINAL_FAILED_DEST_SQL}
       ORDER BY last_failed_at DESC, channel, recipient_key, id_run, solo_id
       LIMIT ${limitRef}::int`,
      bag.values
    );
    return rows;
  }
}

export default new SendStatsRepository();
