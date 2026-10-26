/**
 * Zalo cá nhân — TỰ ĐỘNG ĐỒNG Ý lời mời kết bạn (PLAN_ZALO_TU_DONG_DONG_Y_KET_BAN_2026-10-17).
 *
 * MỘT đường xử lý duy nhất: sự kiện `friend_event`, cron quét bù 10 phút và lúc bật công tắc đều chỉ gọi
 * `sweepAccount(accountId)`. `sweepAccount` đọc danh sách lời mời ĐANG CHỜ qua `api.getFriendRecommendations()` rồi
 * đồng ý từng cái. Sự kiện chỉ là "đánh thức sớm" — lý do: (1) một đường code thì chỉ một chỗ giới hạn tốc độ;
 * (2) `dataInfo` của danh sách có sẵn tên/ảnh/SĐT để lưu danh bạ, còn sự kiện chỉ mang `fromUid`.
 *
 * Giới hạn tốc độ (đọc env lúc gọi, đổi không cần khởi động lại):
 *   ZALO_AUTO_ACCEPT_PER_HOUR       mặc định 20     trần số LẦN THỬ đồng ý / giờ / nick (cửa sổ trượt 60 phút)
 *   ZALO_AUTO_ACCEPT_DELAY_MIN_MS   mặc định 15000  chờ tối thiểu giữa hai lần đồng ý
 *   ZALO_AUTO_ACCEPT_DELAY_MAX_MS   mặc định 45000  chờ tối đa
 * và KHÔNG chạy trong giờ yên lặng của Zalo (ZALO_OUTBOUND_QUIET_HOURS_START/END, mặc định 23 -> 6 giờ VN).
 * Lần thử thất bại cũng tính vào trần: lỗi kéo dài (phiên chết, Zalo từ chối) không được thành bão gọi API.
 *
 * Hạn chế đã chấp nhận: bộ đếm giờ và tập "đang chạy" nằm trong RAM (đúng mô hình một tiến trình — CLAUDE.md
 * "Campaign runtime — single process only"). Mất khi khởi động lại: tệ nhất đồng ý thêm một lượt tối đa trần/giờ sau
 * một lần deploy. Sự kiện tới lúc nick đang có sweep chạy thì bị bỏ — lời mời đó được cron kế tiếp (<= 10 phút) nhặt.
 *
 * Bẫy đã gỡ (xem mục 5 của plan):
 *  - CHỈ đồng ý `dataInfo.recommType === 2` (ReceivedFriendRequest). `=== 1` là "gợi ý kết bạn" Zalo đẩy cho người
 *    lạ — đồng ý nó là tự kết bạn hàng loạt, nguy cơ khoá nick.
 *  - Sự kiện của CHÍNH nick (`isSelf`, chiến dịch kết bạn; app bật selfListen) bị bỏ qua.
 *  - Người gửi lời mời là `ev.data.fromUid`, KHÔNG phải `ev.threadId` (= toUid = chính mình).
 */
import zaloSettingRepository from '../../repositories/zalo/zaloSetting.repository.js';
import zaloAccountSessionService from './zaloAccountSession.service.js';
import zaloPersonalSyncService from '../chatbot/zaloPersonalSync.service.js';
import { isWithinQuietHours } from '../campaign/campaignChannelRunner.service.js';

/** zca-js `FriendEventType.REQUEST` (dist/models/FriendEvent.js). */
const FRIEND_EVENT_TYPE_REQUEST = 2;
/** zca-js `FriendRecommendationsType.ReceivedFriendRequest` (dist/apis/getFriendRecommendations.js). */
const RECOMM_TYPE_RECEIVED_FRIEND_REQUEST = 2;

const HOUR_WINDOW_MS = 60 * 60 * 1000;
/** Gộp các sự kiện REQUEST liền nhau của một nick thành một sweep. */
const EVENT_DEBOUNCE_MS = 10_000;

const DEFAULT_PER_HOUR = 20;
const DEFAULT_DELAY_MIN_MS = 15_000;
const DEFAULT_DELAY_MAX_MS = 45_000;
const DEFAULT_QUIET_START = 23;
const DEFAULT_QUIET_END = 6;

function parsePositiveInt(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return parsed;
}

function parseHour(value, defaultValue) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : defaultValue;
}

/** Đọc env LÚC GỌI (không cache ở mức module) để chỉnh trần/độ trễ không cần khởi động lại. */
function readConfig() {
  const delayMin = parsePositiveInt(process.env.ZALO_AUTO_ACCEPT_DELAY_MIN_MS, DEFAULT_DELAY_MIN_MS);
  const delayMax = parsePositiveInt(process.env.ZALO_AUTO_ACCEPT_DELAY_MAX_MS, DEFAULT_DELAY_MAX_MS);
  return {
    perHour: parsePositiveInt(process.env.ZALO_AUTO_ACCEPT_PER_HOUR, DEFAULT_PER_HOUR),
    // MAX nhỏ hơn MIN (cấu hình ngược) -> lấy MAX = MIN thay vì ném.
    delayMinMs: delayMin,
    delayMaxMs: Math.max(delayMin, delayMax),
    quietHours: {
      startHour: parseHour(process.env.ZALO_OUTBOUND_QUIET_HOURS_START, DEFAULT_QUIET_START),
      endHour: parseHour(process.env.ZALO_OUTBOUND_QUIET_HOURS_END, DEFAULT_QUIET_END),
    },
  };
}

const defaultSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function randomDelayMs(config) {
  const span = config.delayMaxMs - config.delayMinMs;
  return config.delayMinMs + Math.floor(Math.random() * (span + 1));
}

const SHAPE_LOG_INTERVAL_MS = 60 * 60 * 1000;

/** Đếm theo giá trị, dạng `{1:52,2:1}`; giá trị dạng CHUỖI in kèm ngoặc kép (`"2":1`) để tách khỏi số 2. */
function countBy(values) {
  const counts = new Map();
  for (const value of values) {
    const k = typeof value === 'string' ? `"${value}"` : String(value);
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  return `{${[...counts.entries()].map(([k, n]) => `${k}:${n}`).join(',')}}`;
}

/**
 * Thống kê HÌNH DẠNG danh sách `getFriendRecommendations` để chẩn đoán (26/10/2026: lời mời cũ không được đồng ý —
 * nghi Zalo trả lời mời cũ dưới recommType khác 2). CHỈ số đếm: không tên, không SĐT, không userId.
 *
 * @param {Array<{recommItemType?: number, dataInfo?: object}>} items
 * @param {number} nowMs
 * @returns {string} vd `types={1:52,2:1} itemTypes={1:52,2:1} src={...} way={...} seen=3 msg=40 msgTypes={...} msgAgeDays=0-6`
 */
export function summarizeRecommItems(items, nowMs) {
  const infos = items.map((item) => item?.dataInfo || {});
  const withMsg = infos.filter((info) => String(info?.recommInfo?.message ?? '').trim() !== '');
  const ages = withMsg
    .map((info) => Number(info?.recommTime))
    .filter((t) => Number.isFinite(t) && t > 0)
    .map((t) => Math.floor((nowMs - t) / 86_400_000));
  const age = ages.length ? `${Math.min(...ages)}-${Math.max(...ages)}` : '-';
  return `types=${countBy(infos.map((info) => info?.recommType))}`
    + ` itemTypes=${countBy(items.map((item) => item?.recommItemType))}`
    + ` src=${countBy(infos.map((info) => info?.recommSrc))}`
    + ` way=${countBy(infos.map((info) => info?.recommInfo?.suggestWay))}`
    + ` seen=${infos.filter((info) => info?.isSeenFriendReq === true).length}`
    + ` msg=${withMsg.length} msgTypes=${countBy(withMsg.map((info) => info?.recommType))} msgAgeDays=${age}`;
}

class ZaloFriendAutoAcceptService {
  constructor() {
    /** @type {Set<string>} nick đang có sweep chạy. */
    this.running = new Set();
    /** @type {Map<string, number[]>} mốc thời gian (ms) các lần thử đồng ý, theo nick, trong cửa sổ 60 phút. */
    this.attemptsByAccount = new Map();
    /** @type {Map<string, any>} timer debounce sự kiện, theo nick. */
    this.debounceTimers = new Map();
    /** @type {WeakSet<object>} listener đã gắn `friend_event` — theo ĐỐI TƯỢNG listener, listener chết thì GC dọn. */
    this.attachedListeners = new WeakSet();
    /** @type {Map<string, number>} lần cuối in thống kê hình dạng danh sách ở lượt cron, theo nick (tối đa 1 lần/giờ). */
    this.lastShapeLogAt = new Map();
  }

  /** Số lần thử còn nằm trong cửa sổ trượt 60 phút (đồng thời dọn mốc cũ). */
  _countRecentAttempts(key, nowMs) {
    const recent = (this.attemptsByAccount.get(key) || []).filter((ts) => nowMs - ts < HOUR_WINDOW_MS);
    this.attemptsByAccount.set(key, recent);
    return recent.length;
  }

  _recordAttempt(key, nowMs) {
    const recent = this.attemptsByAccount.get(key) || [];
    recent.push(nowMs);
    this.attemptsByAccount.set(key, recent);
  }

  /**
   * Đồng ý các lời mời kết bạn đang chờ của một nick. Không ném lỗi nghiệp vụ — mọi kết cục là giá trị trả về:
   *  - `{ skipped: 'running' | 'disabled' | 'quiet_hours' | 'no_session' | 'list_failed' }`
   *  - `{ accepted, failed, pending, remaining, stoppedBy }` với `stoppedBy` là `null | 'hourly_cap' | 'quiet_hours' | 'disabled'`
   *
   * @param {number|string} accountId zalo_settings.id
   * @param {{ reason?: string, sleep?: (ms: number) => Promise<void>, now?: () => number }} [options]
   *   `sleep`/`now` tiêm được để test không chờ thật và ghim được giờ VN.
   */
  async sweepAccount(accountId, { reason = 'manual', sleep = defaultSleep, now = Date.now } = {}) {
    const key = String(accountId);
    if (this.running.has(key)) return { skipped: 'running' };
    this.running.add(key);
    try {
      return await this._sweep(key, accountId, reason, sleep, now);
    } finally {
      this.running.delete(key);
    }
  }

  async _sweep(key, accountId, reason, sleep, now) {
    if (!(await zaloSettingRepository.isAutoAcceptEnabled(accountId))) return { skipped: 'disabled' };

    const config = readConfig();
    if (isWithinQuietHours(now(), config.quietHours)) return { skipped: 'quiet_hours' };

    const api = zaloAccountSessionService.getAccountApi(accountId);
    if (!api || typeof api.getFriendRecommendations !== 'function' || typeof api.acceptFriendRequest !== 'function') {
      return { skipped: 'no_session' };
    }

    let response;
    try {
      response = await api.getFriendRecommendations();
    } catch (err) {
      console.error(`[ZaloAutoAccept] account=${accountId} reason=${reason} getFriendRecommendations lỗi: ${err?.message || err}`);
      return { skipped: 'list_failed', error: err?.message || String(err) };
    }

    // Hình dạng THẬT: { recommItems: [{ recommItemType, dataInfo }] }. recommType 2 = lời mời ĐẾN; 1 = gợi ý — KHÔNG đụng.
    const items = Array.isArray(response?.recommItems) ? response.recommItems : [];
    const pending = items
      .map((item) => item?.dataInfo)
      .filter((info) => info?.recommType === RECOMM_TYPE_RECEIVED_FRIEND_REQUEST && String(info?.userId ?? '').trim() !== '');

    let accepted = 0;
    let failed = 0;
    let attempts = 0;
    let stoppedBy = null;

    for (const info of pending) {
      if (this._countRecentAttempts(key, now()) >= config.perHour) {
        stoppedBy = 'hourly_cap';
        break;
      }
      if (attempts > 0) {
        await sleep(randomDelayMs(config));
        // Lượt dài (tới ~15 phút): chờ xong phải xét lại — trôi qua 23:00 hoặc chủ vừa tắt công tắc thì dừng ngay.
        if (isWithinQuietHours(now(), config.quietHours)) {
          stoppedBy = 'quiet_hours';
          break;
        }
        if (!(await zaloSettingRepository.isAutoAcceptEnabled(accountId))) {
          stoppedBy = 'disabled';
          break;
        }
      }

      this._recordAttempt(key, now());
      attempts += 1;
      const friendId = String(info.userId).trim();
      try {
        await api.acceptFriendRequest(friendId);
        accepted += 1;
      } catch (err) {
        failed += 1;
        console.error(`[ZaloAutoAccept] account=${accountId} đồng ý ${friendId} lỗi: ${err?.message || err}`);
        continue;
      }

      // Lưu danh bạ chỉ là phần thêm: lỗi ở đây KHÔNG được làm hỏng lượt đồng ý đã thành công.
      try {
        await zaloPersonalSyncService.persistFriends(accountId, [info]);
      } catch (err) {
        console.error(`[ZaloAutoAccept] account=${accountId} lưu danh bạ ${friendId} lỗi: ${err?.message || err}`);
      }
    }

    const remaining = pending.length - attempts;
    const shapeDue = now() - (this.lastShapeLogAt.get(key) || 0) >= SHAPE_LOG_INTERVAL_MS;
    if (pending.length > 0 || reason !== 'cron' || shapeDue) {
      this.lastShapeLogAt.set(key, now());
      console.log(
        `[ZaloAutoAccept] account=${accountId} reason=${reason} accepted=${accepted} failed=${failed}`
        + ` pending=${pending.length} listed=${items.length}${stoppedBy ? ` stoppedBy=${stoppedBy}` : ''}`
        + ` | ${summarizeRecommItems(items, now())}`
      );
    }
    return { accepted, failed, pending: pending.length, remaining, stoppedBy };
  }

  /**
   * Cron quét bù: chạy `sweepAccount` TUẦN TỰ cho mọi nick đang bật công tắc và đang kết nối.
   *
   * @returns {Promise<{ accounts: number, accepted: number, skipped: number, errors: number, status: string }>}
   */
  async sweepAllEnabledAccounts({ sleep, now } = {}) {
    const rows = await zaloSettingRepository.findAutoAcceptEnabledAccountIds();
    const totals = { accounts: rows.length, accepted: 0, skipped: 0, errors: 0 };
    for (const row of rows) {
      try {
        const result = await this.sweepAccount(row.id, { reason: 'cron', sleep, now });
        if (result.skipped === 'list_failed') totals.errors += 1;
        else if (result.skipped) totals.skipped += 1;
        else totals.accepted += Number(result.accepted || 0);
      } catch (err) {
        totals.errors += 1;
        console.error(`[ZaloAutoAccept] cron account=${row.id} lỗi: ${err?.message || err}`);
      }
    }
    let status = 'success';
    if (rows.length === 0) status = 'noop';
    else if (totals.errors > 0) status = 'failure';
    return { ...totals, status };
  }

  /**
   * Xử lý một `friend_event` của listener. Chỉ REQUEST (type 2) và KHÔNG phải của chính mình mới đánh thức sweep, gộp
   * trong 10 giây theo nick. Nuốt mọi lỗi — không để promise bị từ chối trôi nổi trong handler của listener.
   *
   * @param {number|string} accountId
   * @param {{ type?: number, isSelf?: boolean }} ev
   * @returns {boolean} true nếu sự kiện được xếp lịch (hoặc đã có lịch) cho một sweep
   */
  handleFriendEvent(accountId, ev) {
    try {
      if (!ev || ev.type !== FRIEND_EVENT_TYPE_REQUEST || ev.isSelf === true) return false;
      const key = String(accountId);
      if (this.debounceTimers.has(key)) return true;
      const timer = setTimeout(() => {
        this.debounceTimers.delete(key);
        this.sweepAccount(accountId, { reason: 'event' }).catch((err) => {
          console.error(`[ZaloAutoAccept] account=${accountId} sweep sau sự kiện lỗi: ${err?.message || err}`);
        });
      }, EVENT_DEBOUNCE_MS);
      timer.unref?.();
      this.debounceTimers.set(key, timer);
      return true;
    } catch (err) {
      console.error(`[ZaloAutoAccept] account=${accountId} handleFriendEvent lỗi: ${err?.message || err}`);
      return false;
    }
  }

  /**
   * Gắn `friend_event` vào listener của nick — idempotent theo ĐỐI TƯỢNG listener. Listener mới (sau khi khôi phục
   * phiên) là đối tượng mới nên tự được gắn lại; listener cũ chết thì GC dọn WeakSet, không cần gỡ.
   *
   * @param {number|string} accountId
   * @param {{ on?: Function }|null} listener
   * @returns {boolean} true nếu vừa gắn mới
   */
  attachToListener(accountId, listener) {
    if (!listener || typeof listener.on !== 'function') return false;
    if (this.attachedListeners.has(listener)) return false;
    this.attachedListeners.add(listener);
    listener.on('friend_event', (ev) => this.handleFriendEvent(accountId, ev));
    return true;
  }

  /** @internal test helper — Set/Map/WeakSet sống theo tiến trình nên phải dọn giữa các bài test. */
  _resetForTests() {
    for (const timer of this.debounceTimers.values()) clearTimeout(timer);
    this.debounceTimers.clear();
    this.running.clear();
    this.attemptsByAccount.clear();
    this.attachedListeners = new WeakSet();
    this.lastShapeLogAt.clear();
  }
}

export default new ZaloFriendAutoAcceptService();
