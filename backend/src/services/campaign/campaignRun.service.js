import db from '../../config/database.js';
import campaignFlowService from './campaignFlow.service.js';
import campaignNodeDataService from './campaignNodeData.service.js';
import campaignEmailSenderService from './campaignEmailSender.service.js';
import campaignExecutionLogService from './campaignExecutionLog.service.js';
import campaignZaloSenderService from './campaignZaloSender.service.js';
import { executeWithTimeoutRetry, isNetworkTimeoutError } from '../../utils/zaloTimeoutRetry.util.js';
import { isAdminRole } from '../../utils/roleScope.util.js';

class CampaignRunService {
  constructor() {
    const parsePositiveInt = (value, defaultValue) => {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
      return parsed;
    };
    const parseEnvBoolean = (value, defaultValue) => {
      const normalized = String(value ?? '').trim().toLowerCase();
      if (!normalized) return defaultValue;
      if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
      if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
      return defaultValue;
    };

    // Giữ danh sách run đang thực thi trong RAM để tránh chạy trùng cùng một runId.
    this.activeRunIds = new Set();
    // Hàng đợi cho các run chờ slot trống (chỉ áp dụng cho one-shot và setup phase).
    this.pendingRunQueue = [];
    // Giới hạn số campaign one-shot chạy đồng thời (cấu hình qua env MAX_CONCURRENT_CAMPAIGNS).
    this.MAX_CONCURRENT_CAMPAIGNS = Number.parseInt(process.env.MAX_CONCURRENT_CAMPAIGNS, 10) || 3;

    // --- Pool riêng cho continuous campaigns ---
    // Tất cả continuous runs đang hoạt động (cả sleeping lẫn processing).
    this.continuousRunIds = new Set();
    // Số worker slot khả dụng cho continuous campaigns đang trong phase xử lý (không sleep).
    this.MAX_CONTINUOUS_WORKERS = Number.parseInt(process.env.MAX_CONTINUOUS_WORKERS, 10) || 10;
    this.continuousAvailableWorkers = this.MAX_CONTINUOUS_WORKERS;
    // Hàng đợi các resolve() đang chờ worker slot.
    this.continuousWorkerQueue = [];
    // Tập runKey đang giữ worker slot (để cleanup an toàn ở finally).
    this.continuousWorkerHolders = new Set();

    // Giới hạn batch gửi trong chế độ continuous để tăng throughput nhưng vẫn tránh quá tải Redis/API.
    this.CONTINUOUS_EMAIL_BATCH_SIZE = parsePositiveInt(
      process.env.CONTINUOUS_EMAIL_BATCH_SIZE,
      12
    );
    this.CONTINUOUS_ZALO_PERSONAL_BATCH_SIZE = parsePositiveInt(
      process.env.CONTINUOUS_ZALO_PERSONAL_BATCH_SIZE,
      8
    );
    this.CONTINUOUS_ZALO_FRIEND_BATCH_SIZE = parsePositiveInt(
      process.env.CONTINUOUS_ZALO_FRIEND_BATCH_SIZE,
      8
    );
    this.CONTINUOUS_ZALO_GROUP_BATCH_SIZE = parsePositiveInt(
      process.env.CONTINUOUS_ZALO_GROUP_BATCH_SIZE,
      6
    );
    // Với continuous + BullMQ, mặc định tắt random delay để worker queue chủ động điều tiết tốc độ.
    this.CONTINUOUS_RANDOM_DELAY_ENABLED = parseEnvBoolean(
      process.env.CONTINUOUS_RANDOM_DELAY_ENABLED,
      false
    );
  }

  /**
   * Sinh chu kỳ quét cho continuous mode theo khoảng ngẫu nhiên cố định.
   *
   * Luồng hoạt động:
   * 1. Chọn ngẫu nhiên số phút trong đoạn 120-300.
   * 2. Ràng buộc theo bước nhảy 5 phút.
   * 3. Quy đổi sang milliseconds để dùng cho sleep nội bộ.
   *
   * @returns {number} Thời gian chờ tính theo milliseconds.
   */
  getRandomContinuousPollIntervalMs() {
    const minMinutes = 120;
    const maxMinutes = 300;
    const stepMinutes = 5;
    const totalSteps = Math.floor((maxMinutes - minMinutes) / stepMinutes);
    const randomStep = Math.floor(Math.random() * (totalSteps + 1));
    const selectedMinutes = minMinutes + (randomStep * stepMinutes);
    return selectedMinutes * 60 * 1000;
  }

  /**
   * Create a campaign run row with lock and conflict checks.
   *
   * @param {object} input
   * @returns {Promise<object>}
   */
  async createCampaignRunRecord({
    campaignId,
    userId,
    roleCode,
    source,
    scheduleId = null,
    runName = '',
    runOptions = {},
  }) {
    const client = await db.getClient();
    let runRecord;
    let finalRunName = '';

    try {
      await client.query('BEGIN');
      const isAdmin = isAdminRole(roleCode);

      const campaignParams = [campaignId];
      let campaignQuery = `SELECT id, id_user, status, campaign_name
       FROM campaigns
       WHERE id = $1`;
      if (!isAdmin) {
        campaignParams.push(userId);
        campaignQuery += ` AND id_user = $${campaignParams.length}`;
      }
      campaignQuery += ' FOR UPDATE';
      const campaign = await client.query(campaignQuery, campaignParams);

      if (campaign.rows.length === 0) {
        const error = new Error('Không tìm thấy chiến dịch');
        error.statusCode = 404;
        throw error;
      }

      const campaignData = campaign.rows[0];
      if (campaignData.status !== 'active') {
        const error = new Error('Chỉ có thể chạy chiến dịch đang hoạt động');
        error.statusCode = 400;
        throw error;
      }

      const runningCheck = await client.query(
        `SELECT id
         FROM campaign_runs
         WHERE id_campaign = $1 AND status = 'running'
         LIMIT 1`,
        [campaignId]
      );
      if (runningCheck.rows.length > 0) {
        const error = new Error('Chiến dịch này đã có lượt chạy đang hoạt động');
        error.statusCode = 409;
        throw error;
      }

      const runType = source === 'schedule' ? 'scheduled' : 'manual';
      finalRunName = runName || campaignData.campaign_name;
      const rawAdjacentDelay = Number.parseInt(runOptions?.adjacentZaloNodeDelayMs, 10);
      const adjacentZaloNodeDelayMs = Number.isFinite(rawAdjacentDelay) && rawAdjacentDelay >= 0
        ? rawAdjacentDelay
        : null;
      const continuousMode = Boolean(runOptions?.continuousMode);
      const rawPollIntervalMs = Number.parseInt(runOptions?.pollIntervalMs, 10);
      const pollIntervalMs = Number.isFinite(rawPollIntervalMs)
        ? Math.max(1000, rawPollIntervalMs)
        : null;
      const rawResumeFromRunId = Number.parseInt(runOptions?.resumeFromRunId, 10);
      const resumeFromRunId = Number.isFinite(rawResumeFromRunId) && rawResumeFromRunId > 0
        ? rawResumeFromRunId
        : null;
      if (continuousMode && resumeFromRunId !== null) {
        const resumeRunCheck = await client.query(
          `SELECT cr.id
           FROM campaign_runs cr
           JOIN campaigns c ON c.id = cr.id_campaign
           WHERE cr.id = $1
             AND cr.id_campaign = $2
             AND ($3::boolean = TRUE OR c.id_user = $4)
             AND LOWER(COALESCE(cr.run_metadata->>'continuousMode', 'false')) = 'true'
           LIMIT 1`,
          [resumeFromRunId, campaignId, isAdmin, userId]
        );
        if (resumeRunCheck.rows.length === 0) {
          const error = new Error('Lượt continuous cũ để chạy tiếp không hợp lệ');
          error.statusCode = 400;
          throw error;
        }
      }
      const runMetadata = {
        triggeredBy: userId,
        source,
        runName: finalRunName,
        ...(adjacentZaloNodeDelayMs !== null ? { adjacentZaloNodeDelayMs } : {}),
        ...(continuousMode ? { continuousMode: true } : {}),
        ...(continuousMode && pollIntervalMs !== null ? { pollIntervalMs } : {}),
        ...(continuousMode && pollIntervalMs !== null
          ? { continuousCycleMinutes: Math.max(1, Math.round(pollIntervalMs / (60 * 1000))) }
          : {}),
        ...(continuousMode && resumeFromRunId !== null ? { resumeFromRunId } : {}),
      };

      const runResult = await client.query(
        `INSERT INTO campaign_runs
         (id_campaign, id_schedule, run_type, status, started_at, run_metadata)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
         RETURNING *`,
        [campaignId, scheduleId, runType, 'running', JSON.stringify(runMetadata)]
      );

      runRecord = {
        ...runResult.rows[0],
        campaign_owner_id: campaignData.id_user,
      };
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    if (runRecord?.id) {
      try {
        await db.query(
          `UPDATE campaign_runs
           SET run_name = $1
           WHERE id = $2`,
          [finalRunName, runRecord.id]
        );
      } catch {
        // Keep compatibility when run_name column does not exist.
      }
    }

    return runRecord;
  }

  /**
   * Stop a running campaign run that belongs to the authenticated user.
   *
   * @param {object} input
   * @param {number} input.runId campaign run identifier
   * @param {number} input.userId owner identifier
   * @returns {Promise<{found: boolean, stopped: boolean}>}
   */
  async stopCampaignRun({ runId, userId, roleCode }) {
    const isAdmin = isAdminRole(roleCode);
    const result = await db.query(
      `UPDATE campaign_runs cr
       SET status = 'stopped',
           completed_at = CURRENT_TIMESTAMP,
           error_message = 'Đã dừng bởi người dùng'
       FROM campaigns c
       WHERE cr.id = $1
         AND cr.id_campaign = c.id
         AND ($2::boolean = TRUE OR c.id_user = $3)
         AND cr.status = 'running'
       RETURNING cr.id, cr.status`,
      [runId, isAdmin, userId]
    );

    if (result.rows.length === 0) {
      const existsResult = await db.query(
        `SELECT 1
         FROM campaign_runs cr
         JOIN campaigns c ON c.id = cr.id_campaign
         WHERE cr.id = $1
           AND ($2::boolean = TRUE OR c.id_user = $3)
         LIMIT 1`,
        [runId, isAdmin, userId]
      );
      return {
        found: existsResult.rows.length > 0,
        stopped: false,
      };
    }

    return {
      found: true,
      stopped: true,
    };
  }

  /**
   * Tiếp tục một run continuous cũ bằng chính run_id hiện có.
   *
   * Luồng hoạt động:
   * 1. Khóa bản ghi run để kiểm tra quyền sở hữu và trạng thái continuous.
   * 2. Chặn nếu campaign đang có run khác ở trạng thái running.
   * 3. Set lại trạng thái run về running, cập nhật metadata cần thiết để tiếp tục xử lý.
   *
   * @param {object} input
   * @param {number} input.campaignId id campaign đang chạy
   * @param {number} input.userId chủ sở hữu campaign
   * @param {number} input.runId run continuous cần chạy tiếp
   * @param {object} [input.runOptions] tuỳ chọn runtime (poll interval, delay...)
   * @returns {Promise<object>} run record sau khi cập nhật
   */
  async resumeContinuousRunRecord({
    campaignId,
    userId,
    roleCode,
    runId,
    runOptions = {},
  }) {
    const client = await db.getClient();
    try {
      await client.query('BEGIN');
      const isAdmin = isAdminRole(roleCode);

      const runResult = await client.query(
        `SELECT cr.*, c.id_user
         FROM campaign_runs cr
         JOIN campaigns c ON c.id = cr.id_campaign
         WHERE cr.id = $1
           AND cr.id_campaign = $2
           AND ($3::boolean = TRUE OR c.id_user = $4)
         FOR UPDATE`,
        [runId, campaignId, isAdmin, userId]
      );
      if (runResult.rows.length === 0) {
        const error = new Error('Không tìm thấy lượt continuous cũ để chạy tiếp');
        error.statusCode = 404;
        throw error;
      }

      const currentRun = runResult.rows[0];
      const isContinuousRun = String(currentRun?.run_metadata?.continuousMode || '').trim().toLowerCase() === 'true'
        || currentRun?.run_metadata?.continuousMode === true;
      if (!isContinuousRun) {
        const error = new Error('Lượt chạy đã chọn không phải continuous mode');
        error.statusCode = 400;
        throw error;
      }
      if (String(currentRun?.status || '').trim().toLowerCase() === 'running') {
        const error = new Error('Lượt chạy continuous này đang hoạt động');
        error.statusCode = 409;
        throw error;
      }

      const runningOtherRun = await client.query(
        `SELECT id
         FROM campaign_runs
         WHERE id_campaign = $1
           AND status = 'running'
           AND id <> $2
         LIMIT 1`,
        [campaignId, runId]
      );
      if (runningOtherRun.rows.length > 0) {
        const error = new Error('Chiến dịch này đã có lượt chạy khác đang hoạt động');
        error.statusCode = 409;
        throw error;
      }

      const rawAdjacentDelay = Number.parseInt(runOptions?.adjacentZaloNodeDelayMs, 10);
      const adjacentZaloNodeDelayMs = Number.isFinite(rawAdjacentDelay) && rawAdjacentDelay >= 0
        ? rawAdjacentDelay
        : null;
      const rawPollIntervalMs = Number.parseInt(runOptions?.pollIntervalMs, 10);
      const pollIntervalMs = Number.isFinite(rawPollIntervalMs) && rawPollIntervalMs >= 1000
        ? rawPollIntervalMs
        : null;

      const mergedMetadata = {
        ...(currentRun.run_metadata || {}),
        triggeredBy: userId,
        source: 'campaign_run',
        continuousMode: true,
      };
      if (adjacentZaloNodeDelayMs !== null) {
        mergedMetadata.adjacentZaloNodeDelayMs = adjacentZaloNodeDelayMs;
      }
      if (pollIntervalMs !== null) {
        mergedMetadata.pollIntervalMs = pollIntervalMs;
        mergedMetadata.continuousCycleMinutes = Math.max(1, Math.round(pollIntervalMs / (60 * 1000)));
      }
      // Resume chính run cũ nên không cần fallback sang run khác.
      delete mergedMetadata.resumeFromRunId;

      const updatedRunResult = await client.query(
        `UPDATE campaign_runs
         SET status = 'running',
             started_at = CURRENT_TIMESTAMP,
             completed_at = NULL,
             error_message = NULL,
             run_metadata = $1::jsonb
         WHERE id = $2
         RETURNING *`,
        [JSON.stringify(mergedMetadata), runId]
      );

      await client.query('COMMIT');
      return {
        ...updatedRunResult.rows[0],
        campaign_owner_id: currentRun.id_user || null,
      };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Throw a controlled error when a run is no longer in running status.
   *
   * @param {number} runId campaign run identifier
   * @returns {Promise<void>}
   */
  async ensureRunStillRunning(runId) {
    const result = await db.query(
      `SELECT status
       FROM campaign_runs
       WHERE id = $1
       LIMIT 1`,
      [runId]
    );
    const status = String(result.rows[0]?.status || '').trim().toLowerCase();
    if (status === 'running') return;
    const stopError = new Error('Lượt chạy đã được dừng');
    stopError.code = 'RUN_STOPPED';
    throw stopError;
  }

  /**
   * Queue dispatcher cho thực thi chiến dịch.
   *
   * Luồng hoạt động:
   * 1. Tính runKey từ runId, từ chối nếu runId đã đang chạy.
   * 2. Nếu số run đang hoạt động < MAX_CONCURRENT_CAMPAIGNS → chạy ngay.
   * 3. Nếu đạt ngưỡng → đẩy vào pendingRunQueue, trả Promise đợi slot trống.
   * 4. Khi một run kết thúc (_doExecuteCampaign finally), gọi _startNextFromQueue.
   *
   * @param {number} campaignId
   * @param {number} runId
   * @param {number} userId
   * @param {string|null} roleCode
   * @returns {Promise<void>}
   */
  async executeCampaign(campaignId, runId, userId, roleCode = null) {
    const normalizedRunId = Number.parseInt(runId, 10);
    const runKey = Number.isFinite(normalizedRunId) ? String(normalizedRunId) : String(runId || '').trim();
    if (!runKey) {
      throw new Error('Thiếu runId để thực thi chiến dịch');
    }
    const isQueuedRun = this.pendingRunQueue.some((queueItem) => queueItem?.runKey === runKey);
    if (this.activeRunIds.has(runKey) || this.continuousRunIds.has(runKey) || isQueuedRun) {
      // Chặn tuyệt đối việc cùng 1 runId bị start song song (manual + recover/scheduler),
      // nếu không cùng recipient/template có thể bị gửi trùng trong chế độ continuous.
      console.log(`[CampaignRun] Bỏ qua executeCampaign trùng runId=${runKey}`);
      return;
    }
    // Nếu đạt ngưỡng chạy đồng thời → đưa vào hàng đợi, đợi slot trống.
    if (this.activeRunIds.size >= this.MAX_CONCURRENT_CAMPAIGNS) {
      return new Promise((resolve, reject) => {
        this.pendingRunQueue.push({
          campaignId,
          runId,
          userId,
          roleCode,
          runKey,
          resolve,
          reject,
        });
        console.log(
          `[CampaignRun] Queued run=${runKey} (queue_size=${this.pendingRunQueue.length}, active=${this.activeRunIds.size}/${this.MAX_CONCURRENT_CAMPAIGNS})`
        );
      });
    }
    await this._doExecuteCampaign(campaignId, runId, userId, runKey, roleCode);
  }

  /**
   * Lấy run tiếp theo từ hàng đợi và khởi động nếu còn slot trống.
   * Được gọi trong finally block của _doExecuteCampaign khi 1 run hoàn tất.
   */
  _startNextFromQueue() {
    if (!this.pendingRunQueue.length) return;
    if (this.activeRunIds.size >= this.MAX_CONCURRENT_CAMPAIGNS) return;
    const next = this.pendingRunQueue.shift();
    if (!next) return;
    console.log(
      `[CampaignRun] Dequeued run=${next.runKey} (remaining=${this.pendingRunQueue.length}, active=${this.activeRunIds.size}/${this.MAX_CONCURRENT_CAMPAIGNS})`
    );
    this._doExecuteCampaign(next.campaignId, next.runId, next.userId, next.runKey, next.roleCode)
      .then(next.resolve)
      .catch(next.reject);
  }

  /**
   * Chờ lấy worker slot cho continuous campaign.
   *
   * Luồng hoạt động:
   * 1. Nếu còn slot khả dụng → chiếm ngay, đăng ký vào continuousWorkerHolders.
   * 2. Nếu hết slot → đẩy resolve() vào hàng đợi, await cho đến khi được đánh thức.
   * 3. Khi được đánh thức → đăng ký vào continuousWorkerHolders (slot đã chuyển giao).
   *
   * @param {string} runKey ID của run đang chờ slot.
   * @returns {Promise<void>}
   */
  async _acquireContinuousWorker(runKey) {
    if (this.continuousAvailableWorkers > 0) {
      this.continuousAvailableWorkers -= 1;
      this.continuousWorkerHolders.add(runKey);
      return;
    }
    // Chờ cho đến khi có slot được giải phóng.
    await new Promise((resolve) => {
      this.continuousWorkerQueue.push({ runKey, resolve });
    });
    // Slot đã được chuyển giao trực tiếp bởi _releaseContinuousWorker.
    this.continuousWorkerHolders.add(runKey);
  }

  /**
   * Giải phóng worker slot, đánh thức waiter tiếp theo nếu có.
   * Idempotent: an toàn khi gọi nhiều lần hoặc khi runKey chưa giữ slot.
   *
   * Luồng hoạt động:
   * 1. Bỏ qua nếu runKey không nằm trong continuousWorkerHolders.
   * 2. Xóa khỏi continuousWorkerHolders.
   * 3. Nếu có waiter → chuyển giao slot trực tiếp (không tăng availableWorkers).
   * 4. Nếu không có waiter → tăng continuousAvailableWorkers lại 1.
   *
   * @param {string} runKey ID của run đang giải phóng slot.
   */
  _releaseContinuousWorker(runKey) {
    if (!this.continuousWorkerHolders.has(runKey)) return;
    this.continuousWorkerHolders.delete(runKey);
    const next = this.continuousWorkerQueue.shift();
    if (next) {
      // Chuyển giao slot trực tiếp cho waiter kế tiếp (không đi qua availableWorkers).
      next.resolve();
    } else {
      this.continuousAvailableWorkers += 1;
    }
  }

  /**
   * Thực thi campaign nodes theo thứ tự flow.
   * Được tách từ executeCampaign để hỗ trợ hàng đợi campaign.
   *
   * Luồng hoạt động:
   * 1. Đánh dấu runKey vào activeRunIds.
   * 2. Chạy toàn bộ node theo thứ tự topological.
   * 3. finally: xóa khỏi activeRunIds, gọi _startNextFromQueue mở slot.
   *
   * @param {number} campaignId
   * @param {number} runId
   * @param {number} userId
   * @param {string} runKey
   * @param {string|null} roleCode
   * @returns {Promise<void>}
   */
  async _doExecuteCampaign(campaignId, runId, userId, runKey, roleCode = null) {
    this.activeRunIds.add(runKey);
    try {
      console.log(`[Campaign ${campaignId}] Bắt đầu thực thi...`);
      const pickNodeItems = (nodeId) => {
        const key = String(nodeId || '').trim();
        if (!key) return [];
        return Array.isArray(nodeOutputs[key]) ? nodeOutputs[key] : [];
      };
      const collectListFromSource = ({
        sourceMode = 'manual',
        manualValue = '',
        sourceNodeId = '',
        sourceField = '',
      }) => {
        const mode = String(sourceMode || 'manual').trim();
        if (mode === 'manual') {
          return campaignZaloSenderService.parseListText(manualValue);
        }
        const key = String(sourceNodeId || '').trim();
        const field = String(sourceField || '').trim();
        if (!key || !field) return [];
        const sourceItems = pickNodeItems(key);
        const values = [];
        sourceItems.forEach((item) => {
          const raw = item?.[field];
          if (Array.isArray(raw)) {
            raw.forEach((value) => values.push(...campaignZaloSenderService.parseListText(value)));
          } else {
            values.push(...campaignZaloSenderService.parseListText(raw));
          }
        });
        return Array.from(new Set(values));
      };
      const collectEntriesFromSource = ({
        sourceMode = 'manual',
        manualValue = '',
        sourceNodeId = '',
        sourceField = '',
      }) => {
        const mode = String(sourceMode || 'manual').trim();
        if (mode === 'manual') {
          return campaignZaloSenderService.parseListText(manualValue).map((value) => ({
            value,
            row: null,
          }));
        }
        const key = String(sourceNodeId || '').trim();
        const field = String(sourceField || '').trim();
        if (!key || !field) return [];
        const sourceItems = pickNodeItems(key);
        const entries = [];
        sourceItems.forEach((item) => {
          const raw = item?.[field];
          const values = Array.isArray(raw)
            ? raw.flatMap((inner) => campaignZaloSenderService.parseListText(inner))
            : campaignZaloSenderService.parseListText(raw);
          values.forEach((value) => entries.push({
            value,
            row: item || null,
          }));
        });
        const dedupMap = new Map();
        entries.forEach((entry) => {
          const keyValue = String(entry.value || '').trim();
          if (!keyValue) return;
          if (!dedupMap.has(keyValue)) dedupMap.set(keyValue, { ...entry, value: keyValue });
        });
        return Array.from(dedupMap.values());
      };
      const continuousNodeDataState = new Map();
      const canonicalizeComparableValue = (value) => {
        if (Array.isArray(value)) {
          return value.map((item) => canonicalizeComparableValue(item));
        }
        if (value && typeof value === 'object') {
          return Object.keys(value)
            .sort()
            .reduce((acc, key) => {
              acc[key] = canonicalizeComparableValue(value[key]);
              return acc;
            }, {});
        }
        return value;
      };
      const stringifyComparableItem = (item) => {
        if (item == null) return '';
        if (typeof item !== 'object') return String(item);
        try {
          return JSON.stringify(canonicalizeComparableValue(item));
        } catch {
          return String(item);
        }
      };
      /**
       * Tạo khóa dedupe cho các node dữ liệu trong continuous mode.
       *
       * Luồng hoạt động:
       * 1. Ưu tiên khóa nghiệp vụ ổn định theo từng node (customerId/uid/courseId...).
       * 2. Fallback về fingerprint object để tránh mất bản ghi khi thiếu khóa chính.
       *
       * @param {string} nodeSubtype subtype node hiện tại
       * @param {Record<string, any>} item bản ghi dữ liệu
       * @returns {string}
       */
      const buildContinuousDataNodeItemKey = (nodeSubtype, item = {}) => {
        const subtype = String(nodeSubtype || '').trim().toLowerCase();
        const row = item && typeof item === 'object' ? item : {};
        if (subtype === 'read_courses_db') {
          const courseId = row.id ?? row.courseId ?? row.course_code ?? row.courseCode;
          if (courseId != null && String(courseId).trim()) return `course:${String(courseId).trim()}`;
        }
        if (subtype === 'get_all_friends') {
          const uid = row.uid ?? row.zalo_id ?? row.zaloId ?? row.id;
          if (uid != null && String(uid).trim()) return `friend_uid:${String(uid).trim()}`;
          const phone = row.phone ?? row.phoneNumber ?? row.zaloPhone;
          if (phone != null && String(phone).trim()) return `friend_phone:${String(phone).trim()}`;
        }
        if (subtype === 'read_interested_customers' || subtype === 'interested_customers') {
          const customerId = row.id_customer ?? row.customer_id ?? row.customerId ?? row.id;
          if (customerId != null && String(customerId).trim()) return `customer:${String(customerId).trim()}`;
          const email = String(row.email || '').trim().toLowerCase();
          const phone = String(row.phone || '').trim();
          if (email || phone) return `customer_contact:${email}|${phone}`;
        }
        if (subtype === 'read_sheet' || subtype === 'google_sheet') {
          const email = String(row.email || '').trim().toLowerCase();
          const phone = String(row.phone || row.dien_thoai || '').trim();
          if (email || phone) return `sheet_contact:${email}|${phone}`;
        }
        return `raw:${stringifyComparableItem(row)}`;
      };
      /**
       * Merge output node dữ liệu theo chế độ continuous, chỉ giữ item mới.
       *
       * @param {object} input
       * @param {number|string} input.nodeId id node
       * @param {string} input.nodeSubtype subtype node
       * @param {Array<Record<string, any>>} input.fetchedItems danh sách vừa đọc được
       * @returns {{allItems: Array<Record<string, any>>, newItems: Array<Record<string, any>>}}
       */
      const mergeContinuousNodeItems = ({ nodeId, nodeSubtype, fetchedItems }) => {
        const safeNodeId = String(nodeId || '').trim();
        const incomingItems = Array.isArray(fetchedItems) ? fetchedItems : [];
        if (!safeNodeId) {
          return {
            allItems: incomingItems,
            newItems: incomingItems,
          };
        }

        const previousState = continuousNodeDataState.get(safeNodeId) || {
          allItems: [],
          seenKeys: new Set(),
        };
        const seenKeys = new Set(previousState.seenKeys);
        const allItems = [...previousState.allItems];
        const newItems = [];

        incomingItems.forEach((item) => {
          const itemKey = buildContinuousDataNodeItemKey(nodeSubtype, item);
          if (seenKeys.has(itemKey)) return;
          seenKeys.add(itemKey);
          allItems.push(item);
          newItems.push(item);
        });

        continuousNodeDataState.set(safeNodeId, {
          allItems,
          seenKeys,
        });

        return {
          allItems,
          newItems,
        };
      };
      const renderTemplateText = (templateText, variables = {}) =>
        String(templateText || '').replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_match, varName) => {
          const value = variables?.[varName];
          return value === undefined || value === null ? '' : String(value);
        });
      const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
      const sleepWithRunCheck = async (ms) => {
        const waitMs = Math.max(0, Number.parseInt(ms, 10) || 0);
        if (waitMs <= 0) return;
        // Thích nghi CHECK_INTERVAL theo tổng thời gian sleep để giảm DB queries.
        // Sleep > 60s (thường là poll interval 5-30p): check mỗi 30s → ~10 queries/5p/campaign.
        // Sleep 10-60s (giữa các bước gửi): check mỗi 5s.
        // Sleep < 10s (delay ngắn): check mỗi 1s như cũ.
        // So sánh: trước đây với 100 campaigns ngủ 5p = 30.000 queries/5p;
        // sau khi sửa = 1.000 queries/5p (giảm 97%).
        const CHECK_INTERVAL_MS = waitMs > 60_000 ? 30_000 : waitMs > 10_000 ? 5_000 : 1_000;
        let elapsedMs = 0;
        while (elapsedMs < waitMs) {
          await this.ensureRunStillRunning(runId);
          const chunkMs = Math.min(CHECK_INTERVAL_MS, waitMs - elapsedMs);
          await sleep(chunkMs);
          elapsedMs += chunkMs;
        }
        await this.ensureRunStillRunning(runId);
      };
      const EMAIL_API_DELAY_MIN_MS = 50;
      const EMAIL_API_DELAY_MAX_MS = 250;
      const ZALO_API_DELAY_MIN_MS = 25;
      const ZALO_API_DELAY_MAX_MS = 125;
      const ZALO_GROUP_TEMPLATE_DELAY_MIN_MS = 250;
      const ZALO_GROUP_TEMPLATE_DELAY_MAX_MS = 1250;
      /**
       * Add random delay for outbound email/Zalo API calls.
       *
       * @param {string} reason
       * @returns {Promise<void>}
       */
      const waitRandomApiDelay = async (reason = 'api_call') => {
        await this.ensureRunStillRunning(runId);
        // Tách riêng delay theo kênh để có thể giảm tốc độ chờ cho Zalo
        // mà không làm thay đổi nhịp gửi email đã cấu hình.
        const isZaloDelay = String(reason || '').toLowerCase().includes('zalo');
        const minDelayMs = isZaloDelay ? ZALO_API_DELAY_MIN_MS : EMAIL_API_DELAY_MIN_MS;
        const maxDelayMs = isZaloDelay ? ZALO_API_DELAY_MAX_MS : EMAIL_API_DELAY_MAX_MS;
        const delayMs = Math.floor(
          Math.random() * (maxDelayMs - minDelayMs + 1)
        ) + minDelayMs;
        console.log(
          `[CampaignRun][Delay] run=${runId} reason=${reason} random_delay_ms=${delayMs}`
        );
        await sleepWithRunCheck(delayMs);
      };
      /**
       * Chờ ngẫu nhiên 0.25-1.25 giây giữa 2 lần gửi nhóm trong cùng một template step.
       *
       * @param {string} reason ngữ cảnh để log debug
       * @returns {Promise<void>}
       */
      const waitRandomZaloGroupTemplateDelay = async (reason = 'zalo_group_template_step') => {
        await this.ensureRunStillRunning(runId);
        const delayMs = Math.floor(
          Math.random() * (ZALO_GROUP_TEMPLATE_DELAY_MAX_MS - ZALO_GROUP_TEMPLATE_DELAY_MIN_MS + 1)
        ) + ZALO_GROUP_TEMPLATE_DELAY_MIN_MS;
        console.log(
          `[CampaignRun][Delay] run=${runId} reason=${reason} random_delay_ms=${delayMs}`
        );
        await sleepWithRunCheck(delayMs);
      };
      const shouldApplyRandomDelayInContinuous = () => this.CONTINUOUS_RANDOM_DELAY_ENABLED;
      /**
       * Chạy danh sách task theo batch song song có giới hạn.
       * Dùng cho continuous mode để tăng tốc gửi nhiều recipient nhưng vẫn kiểm soát tải.
       *
       * Luồng hoạt động:
       * 1. Chia toàn bộ input thành từng batch theo `concurrency`.
       * 2. Trong mỗi batch chạy song song bằng Promise.all.
       * 3. Chờ batch hiện tại xong mới chuyển batch tiếp theo để tránh bùng nổ tài nguyên.
       *
       * @param {object} input
       * @param {Array<any>} input.items danh sách phần tử cần xử lý
       * @param {number} input.concurrency số lượng xử lý song song tối đa mỗi batch
       * @param {(item: any) => Promise<void>} input.handler hàm xử lý từng phần tử
       * @returns {Promise<void>}
       */
      const runTasksWithConcurrency = async ({ items = [], concurrency = 1, handler }) => {
        const sourceItems = Array.isArray(items) ? items : [];
        const safeConcurrency = Math.max(1, Number.parseInt(concurrency, 10) || 1);
        for (let index = 0; index < sourceItems.length; index += safeConcurrency) {
          const batch = sourceItems.slice(index, index + safeConcurrency);
          await Promise.all(
            batch.map(async (item) => {
              await handler(item);
            })
          );
        }
      };
      const unitToMs = (unit) => {
        if (unit === 'hours') return 60 * 60 * 1000;
        if (unit === 'days') return 24 * 60 * 60 * 1000;
        return 60 * 1000;
      };
      /**
       * Wait until configured schedule point and return computed target time.
       * Use scheduled time anchors instead of completion time to avoid cumulative drift.
       *
       * @param {object} input
       * @param {number} input.scheduleStartAt
       * @param {number} input.previousStepTargetAt
       * @param {object} input.step
       * @param {string} input.channel
       * @param {string} input.recipientKey
       * @param {number} input.stepIndex
       * @returns {Promise<number>}
       */
      const waitForScheduledStep = async ({
        scheduleStartAt,
        previousStepTargetAt,
        step,
        channel,
        recipientKey,
        stepIndex,
      }) => {
        const delayMs = Math.max(0, parseInt(step?.delayValue || 0, 10)) * unitToMs(step?.delayUnit || 'minutes');
        const delayFrom = String(step?.delayFrom || 'start').trim() === 'prev' ? 'prev' : 'start';
        const baseTime = delayFrom === 'prev' ? previousStepTargetAt : scheduleStartAt;
        const targetTime = baseTime + delayMs;
        const waitMs = Math.max(0, targetTime - Date.now());
        if (waitMs > 0) {
          console.log(
            `[CampaignRun][Schedule] run=${runId} channel=${channel} recipient=${recipientKey} ` +
            `step=${stepIndex} wait_ms=${waitMs} delay_from=${delayFrom} delay_ms=${delayMs}`
          );
          await sleepWithRunCheck(waitMs);
        }
        return targetTime;
      };
      let isContinuousMode = false;
      let resumeFromRunId = null;
      let configuredContinuousPollIntervalMs = null;
      const localRecipientProgress = new Map();
      const resumedRecipientProgress = new Map();
      let isRecipientLedgerTableAvailable = true;
      const buildRecipientLedgerKey = ({ nodeId, channel, recipientKey }) =>
        `${String(nodeId)}::${String(channel)}::${String(recipientKey || '').trim().toLowerCase()}`;
      const createEmptyRecipientProgress = () => ({
        lastCompletedStep: 0,
        isFullyCompleted: false,
        firstSentAt: null,
        lastCompletedAt: null,
        nextDueAt: null,
        retryCount: 0,
      });
      /**
       * Read recipient step progress from DB ledger; fallback to in-memory map when table not present.
       *
       * @param {object} input
       * @param {number|string} input.nodeId
       * @param {string} input.channel
       * @param {string} input.recipientKey
       * @returns {Promise<{lastCompletedStep:number,isFullyCompleted:boolean}>}
       */
      const getRecipientProgress = async ({ nodeId, channel, recipientKey }) => {
        const safeRecipientKey = String(recipientKey || '').trim().toLowerCase();
        if (!safeRecipientKey) return createEmptyRecipientProgress();
        const localKey = buildRecipientLedgerKey({ nodeId, channel, recipientKey: safeRecipientKey });
        if (localRecipientProgress.has(localKey)) {
          return localRecipientProgress.get(localKey) || createEmptyRecipientProgress();
        }
        if (resumedRecipientProgress.has(localKey)) {
          return resumedRecipientProgress.get(localKey) || createEmptyRecipientProgress();
        }
        if (!isRecipientLedgerTableAvailable) return createEmptyRecipientProgress();
        try {
          const progressResult = await db.query(
            `SELECT last_completed_step, is_fully_completed, meta
             FROM campaign_run_recipient_steps
             WHERE id_run = $1
               AND id_node = $2
               AND channel = $3
               AND recipient_key = $4
             LIMIT 1`,
            [runId, nodeId, channel, safeRecipientKey]
          );
          if (progressResult.rows.length === 0) {
            if (Number.isFinite(resumeFromRunId) && resumeFromRunId > 0) {
              const resumeResult = await db.query(
                `SELECT last_completed_step, is_fully_completed, meta
                 FROM campaign_run_recipient_steps
                 WHERE id_run = $1
                   AND id_node = $2
                   AND channel = $3
                   AND recipient_key = $4
                 LIMIT 1`,
                [resumeFromRunId, nodeId, channel, safeRecipientKey]
              );
              if (resumeResult.rows.length > 0) {
                const resumeMeta = resumeResult.rows[0].meta || {};
                const resumedProgress = {
                  lastCompletedStep: Number.parseInt(resumeResult.rows[0].last_completed_step, 10) || 0,
                  isFullyCompleted: Boolean(resumeResult.rows[0].is_fully_completed),
                  firstSentAt: resumeMeta?.firstSentAt || null,
                  lastCompletedAt: resumeMeta?.lastCompletedAt || null,
                  nextDueAt: resumeMeta?.nextDueAt || null,
                  retryCount: Math.max(0, Number.parseInt(resumeMeta?.retryCount, 10) || 0),
                };
                resumedRecipientProgress.set(localKey, resumedProgress);
                return resumedProgress;
              }
            }
            return createEmptyRecipientProgress();
          }
          const meta = progressResult.rows[0].meta || {};
          const currentProgress = {
            lastCompletedStep: Number.parseInt(progressResult.rows[0].last_completed_step, 10) || 0,
            isFullyCompleted: Boolean(progressResult.rows[0].is_fully_completed),
            firstSentAt: meta?.firstSentAt || null,
            lastCompletedAt: meta?.lastCompletedAt || null,
            nextDueAt: meta?.nextDueAt || null,
            retryCount: Math.max(0, Number.parseInt(meta?.retryCount, 10) || 0),
          };
          localRecipientProgress.set(localKey, currentProgress);
          return currentProgress;
        } catch (error) {
          if (String(error?.code || '') === '42P01' || String(error?.code || '') === '42703') {
            isRecipientLedgerTableAvailable = false;
            return createEmptyRecipientProgress();
          }
          throw error;
        }
      };
      /**
       * Upsert recipient step progress into DB ledger; fallback to in-memory map when table not present.
       *
       * @param {object} input
       * @param {number|string} input.nodeId
       * @param {string} input.channel
       * @param {string} input.recipientKey
       * @param {number} input.completedStep
       * @param {number} input.totalSteps
       * @param {number|null} [input.retryCount] số lần retry SMTP đang theo dõi cho recipient (dùng cho email)
       * @returns {Promise<void>}
       */
      const upsertRecipientProgress = async ({
        nodeId,
        channel,
        recipientKey,
        completedStep,
        totalSteps,
        firstSentAt = null,
        lastCompletedAt = null,
        nextDueAt = null,
        retryCount = null,
      }) => {
        const safeRecipientKey = String(recipientKey || '').trim().toLowerCase();
        if (!safeRecipientKey) return;
        const safeCompletedStep = Math.max(0, Number.parseInt(completedStep, 10) || 0);
        const safeTotalSteps = Math.max(1, Number.parseInt(totalSteps, 10) || 1);
        const isFullyCompleted = safeCompletedStep >= safeTotalSteps;
        const localKey = buildRecipientLedgerKey({ nodeId, channel, recipientKey: safeRecipientKey });
        localRecipientProgress.set(localKey, {
          lastCompletedStep: safeCompletedStep,
          isFullyCompleted,
          firstSentAt,
          lastCompletedAt,
          nextDueAt,
          retryCount: Math.max(0, Number.parseInt(retryCount, 10) || 0),
        });
        resumedRecipientProgress.set(localKey, {
          lastCompletedStep: safeCompletedStep,
          isFullyCompleted,
          firstSentAt,
          lastCompletedAt,
          nextDueAt,
          retryCount: Math.max(0, Number.parseInt(retryCount, 10) || 0),
        });
        if (!isRecipientLedgerTableAvailable) return;
        try {
          await db.query(
            `INSERT INTO campaign_run_recipient_steps
             (id_run, id_campaign, id_node, channel, recipient_key, last_completed_step, is_fully_completed, last_sent_at, meta, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, $8::jsonb, CURRENT_TIMESTAMP)
             ON CONFLICT (id_run, id_node, channel, recipient_key)
             DO UPDATE SET
               last_completed_step = GREATEST(campaign_run_recipient_steps.last_completed_step, EXCLUDED.last_completed_step),
               is_fully_completed = campaign_run_recipient_steps.is_fully_completed OR EXCLUDED.is_fully_completed,
               last_sent_at = CURRENT_TIMESTAMP,
               meta = COALESCE(campaign_run_recipient_steps.meta, '{}'::jsonb) || EXCLUDED.meta,
               updated_at = CURRENT_TIMESTAMP`,
            [
              runId,
              campaignId,
              nodeId,
              channel,
              safeRecipientKey,
              safeCompletedStep,
              isFullyCompleted,
              JSON.stringify({
                ...(firstSentAt ? { firstSentAt } : {}),
                ...(lastCompletedAt ? { lastCompletedAt } : {}),
                ...(nextDueAt ? { nextDueAt } : {}),
                ...(Number.isFinite(Number.parseInt(retryCount, 10))
                  ? { retryCount: Math.max(0, Number.parseInt(retryCount, 10) || 0) }
                  : {}),
              }),
            ]
          );
        } catch (error) {
          if (String(error?.code || '') === '42P01' || String(error?.code || '') === '42703') {
            isRecipientLedgerTableAvailable = false;
            return;
          }
          throw error;
        }
      };
      /**
       * Chuẩn hóa thời gian về ISO múi giờ Hà Nội (+07:00) để lưu metadata nhất quán.
       *
       * Luồng hoạt động:
       * 1. Parse đầu vào về mốc thời gian hợp lệ (ms).
       * 2. Dịch mốc UTC sang múi giờ cố định +07:00.
       * 3. Trả về chuỗi ISO có hậu tố `+07:00`.
       *
       * @param {string|number|Date} [input]
       * @returns {string|null}
       */
      const toHoChiMinhIso = (input = Date.now()) => {
        const baseDate = input instanceof Date ? input : new Date(input);
        if (Number.isNaN(baseDate.getTime())) return null;
        const utcPlusSevenOffsetMs = 7 * 60 * 60 * 1000;
        const shiftedDate = new Date(baseDate.getTime() + utcPlusSevenOffsetMs);
        const year = shiftedDate.getUTCFullYear();
        const month = String(shiftedDate.getUTCMonth() + 1).padStart(2, '0');
        const day = String(shiftedDate.getUTCDate()).padStart(2, '0');
        const hour = String(shiftedDate.getUTCHours()).padStart(2, '0');
        const minute = String(shiftedDate.getUTCMinutes()).padStart(2, '0');
        const second = String(shiftedDate.getUTCSeconds()).padStart(2, '0');
        const millisecond = String(shiftedDate.getUTCMilliseconds()).padStart(3, '0');
        return `${year}-${month}-${day}T${hour}:${minute}:${second}.${millisecond}+07:00`;
      };
      const computeStepDueAt = ({
        steps = [],
        completedStep = 0,
        firstSentAt = null,
        lastCompletedAt = null,
        sendMode = 'all',
      }) => {
        const safeCompletedStep = Math.max(0, Number.parseInt(completedStep, 10) || 0);
        if (safeCompletedStep >= steps.length) return null;
        if (sendMode !== 'schedule') return toHoChiMinhIso();
        const nextStep = steps[safeCompletedStep];
        const delayMs = Math.max(0, parseInt(nextStep?.delayValue || 0, 10)) * unitToMs(nextStep?.delayUnit || 'minutes');
        const delayFrom = String(nextStep?.delayFrom || 'start').trim() === 'prev' ? 'prev' : 'start';
        const baseTimestamp = delayFrom === 'prev'
          ? (lastCompletedAt ? Date.parse(lastCompletedAt) : Date.now())
          : (firstSentAt ? Date.parse(firstSentAt) : Date.now());
        return toHoChiMinhIso(baseTimestamp + delayMs);
      };
      /**
       * Đánh giá trạng thái đến hạn của `nextDueAt` để dùng chung cho mọi channel.
       *
       * Luồng hoạt động:
       * 1. Nếu chưa có `nextDueAt` thì cho phép chạy ngay (step đầu hoặc không có delay).
       * 2. Nếu parse được timestamp thì chỉ cho chạy khi `Date.now() >= nextDueAt`.
       * 3. Nếu `nextDueAt` sai định dạng, chặn xử lý để tránh gửi sớm ngoài lịch.
       *
       * @param {string|null|undefined} nextDueAt mốc chạy tiếp theo lưu trong recipient ledger
       * @returns {{hasDueAt: boolean, nextDueAtMs: number|null, isDueNow: boolean}}
       */
      const resolveNextDueAtStatus = (nextDueAt) => {
        const normalizedNextDueAt = String(nextDueAt || '').trim();
        if (!normalizedNextDueAt) {
          return {
            hasDueAt: false,
            nextDueAtMs: null,
            isDueNow: true,
          };
        }
        const nextDueAtMs = Date.parse(normalizedNextDueAt);
        if (!Number.isFinite(nextDueAtMs)) {
          console.warn(
            `[CampaignRun][Schedule] run=${runId} invalid_next_due_at=${normalizedNextDueAt}`
          );
          return {
            hasDueAt: true,
            nextDueAtMs: null,
            isDueNow: false,
          };
        }
        return {
          hasDueAt: true,
          nextDueAtMs,
          isDueNow: nextDueAtMs <= Date.now(),
        };
      };
      const shouldProcessRecipientStep = ({
        progress = null,
        stepIndex = 0,
        totalSteps = 1,
      }) => {
        const safeTotalSteps = Math.max(1, Number.parseInt(totalSteps, 10) || 1);
        const safeProgress = progress && typeof progress === 'object'
          ? progress
          : createEmptyRecipientProgress();
        const nextStepIndex = Math.max(0, Number.parseInt(safeProgress.lastCompletedStep, 10) || 0);
        if (safeProgress.isFullyCompleted || nextStepIndex >= safeTotalSteps) return false;
        // Chặn xử lý sớm khi recipient đang có mốc nextDueAt trong tương lai.
        // Đây là guard dùng chung cho cả luồng resume one-shot để không gửi retry trước hạn.
        const dueStatus = resolveNextDueAtStatus(safeProgress?.nextDueAt);
        if (!dueStatus.isDueNow) {
          return false;
        }
        return nextStepIndex === Math.max(0, Number.parseInt(stepIndex, 10) || 0);
      };
      /**
       * Ghi nhận một recipient đã hoàn tất step thành công để lần chạy sau chỉ gửi step tiếp theo.
       *
       * Luồng hoạt động:
       * 1. Chuẩn hóa thời điểm hoàn tất hiện tại theo ISO +07.
       * 2. Tính `nextDueAt` dựa theo `sendMode` và delay cấu hình.
       * 3. Upsert vào `campaign_run_recipient_steps` cùng `id_run` hiện tại.
       *
       * @param {object} input
       * @param {number|string} input.nodeId
       * @param {string} input.channel
       * @param {string} input.recipientKey
       * @param {number} input.completedStep
       * @param {number} input.totalSteps
       * @param {{firstSentAt?: string|null}} [input.progress]
       * @param {Array<object>} [input.steps]
       * @param {string} [input.sendMode]
       * @returns {Promise<void>}
       */
      const markRecipientStepCompleted = async ({
        nodeId,
        channel,
        recipientKey,
        completedStep,
        totalSteps,
        progress = null,
        steps = [],
        sendMode = 'all',
      }) => {
        const completedAtIso = toHoChiMinhIso();
        const firstSentAt = progress?.firstSentAt || completedAtIso;
        const nextDueAt = computeStepDueAt({
          steps,
          completedStep,
          firstSentAt,
          lastCompletedAt: completedAtIso,
          sendMode,
        });
        await upsertRecipientProgress({
          nodeId,
          channel,
          recipientKey,
          completedStep,
          totalSteps,
          firstSentAt,
          lastCompletedAt: completedAtIso,
          nextDueAt,
          retryCount: 0,
        });
      };
      const resolveTemplateVariablesFromMappings = ({
        mappings = [],
        entry = null,
        fallbackNodeId = '',
      }) => {
        const variables = {};
        (Array.isArray(mappings) ? mappings : []).forEach((mapping) => {
          const key = String(mapping?.key || '').trim();
          if (!key) return;
          const sourceType = String(mapping?.sourceType || 'manual').trim() === 'node' ? 'node' : 'manual';
          if (sourceType !== 'node') {
            variables[key] = mapping?.value ?? '';
            return;
          }
          const field = String(mapping?.field || '').trim();
          if (!field) {
            variables[key] = '';
            return;
          }
          const mappingNodeId = String(mapping?.nodeId || fallbackNodeId || '').trim();
          if (!mappingNodeId) {
            variables[key] = entry?.row?.[field] ?? '';
            return;
          }
          const mappingItems = pickNodeItems(mappingNodeId);
          const firstRow = mappingItems[0] || null;
          const useEntryRow = mappingNodeId === String(fallbackNodeId || '').trim();
          const selectedRow = useEntryRow ? (entry?.row || firstRow) : firstRow;
          variables[key] = selectedRow?.[field] ?? '';
        });
        return variables;
      };

      const campaignResult = await db.query('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
      const campaign = campaignResult.rows[0];
      const runResult = await db.query(
        `SELECT run_metadata
         FROM campaign_runs
         WHERE id = $1
         LIMIT 1`,
        [runId]
      );
      const runSource = String(runResult.rows[0]?.run_metadata?.source || 'campaign_run').trim() || 'campaign_run';
      const rawAdjacentDelay = Number.parseInt(runResult.rows[0]?.run_metadata?.adjacentZaloNodeDelayMs, 10);
      const adjacentZaloNodeDelayMs = Number.isFinite(rawAdjacentDelay) && rawAdjacentDelay > 0
        ? rawAdjacentDelay
        : 0;
      const rawContinuousMode = runResult.rows[0]?.run_metadata?.continuousMode;
      isContinuousMode = runSource === 'campaign_run'
        && (rawContinuousMode === true || String(rawContinuousMode).trim().toLowerCase() === 'true');
      const rawResumeFromRunId = Number.parseInt(runResult.rows[0]?.run_metadata?.resumeFromRunId, 10);
      if (isContinuousMode && Number.isFinite(rawResumeFromRunId) && rawResumeFromRunId > 0) {
        const normalizedRunId = Number.parseInt(runId, 10);
        resumeFromRunId = rawResumeFromRunId !== normalizedRunId ? rawResumeFromRunId : null;
      }
      const rawPollIntervalMs = Number.parseInt(runResult.rows[0]?.run_metadata?.pollIntervalMs, 10);
      const rawPollIntervalMinutes = Number.parseInt(
        runResult.rows[0]?.run_metadata?.continuousCycleMinutes
          ?? runResult.rows[0]?.run_metadata?.pollIntervalMinutes,
        10
      );
      if (isContinuousMode && Number.isFinite(rawPollIntervalMs)) {
        configuredContinuousPollIntervalMs = Math.max(60 * 1000, rawPollIntervalMs);
      } else if (isContinuousMode && Number.isFinite(rawPollIntervalMinutes) && rawPollIntervalMinutes > 0) {
        configuredContinuousPollIntervalMs = rawPollIntervalMinutes * 60 * 1000;
      }
      if (isContinuousMode && Number.isFinite(resumeFromRunId)) {
        console.log(`[CampaignRun][Continuous] run=${runId} resume_from_run=${resumeFromRunId}`);
      }
      if (isContinuousMode && Number.isFinite(configuredContinuousPollIntervalMs)) {
        console.log(
          `[CampaignRun][Continuous] run=${runId} configured_poll_ms=${configuredContinuousPollIntervalMs}`
        );
      }
      const trackingBaseUrl = String(process.env.TRACKING_BASE_URL || '').trim() || 'http://localhost:5000';
      const UTM_SOURCE_BY_ZALO_CHANNEL = {
        personal: 'zalo_person_campaign',
        group: 'zalo_group_campaign',
      };

      /**
       * Chuẩn hóa customer id từ nhiều kiểu output node khác nhau.
       *
       * Luồng hoạt động:
       * 1. Ưu tiên các field thể hiện rõ id khách hàng (`id_customer`, `customer_id`, ...).
       * 2. Chỉ fallback về `row.id` khi row có dấu hiệu là bản ghi của bảng customers.
       * 3. Trả về `null` nếu không parse được số hợp lệ để tránh ghi FK sai vào campaign_executions.
       *
       * @param {Record<string, any>|null} row Dòng dữ liệu đầu ra từ node nguồn.
       * @returns {number|null} ID khách hàng hợp lệ theo bảng customers.
       */
      const extractCustomerIdFromRow = (row) => {
        if (!row || typeof row !== 'object') return null;

        const explicitCandidate = row.id_customer
          ?? row.customer_id
          ?? row.customerId
          ?? row.idCustomer
          ?? row.customer?.id
          ?? null;
        const explicitParsed = Number.parseInt(explicitCandidate, 10);
        if (Number.isFinite(explicitParsed)) return explicitParsed;

        // Chỉ dùng row.id khi row có cấu trúc giống bảng customers để tránh nhầm với id bảng trung gian.
        const isLikelyCustomerRow = row.id_user != null
          || row.email_subscribed != null
          || row.email_hard_bounced != null
          || row.zalo_id != null
          || row.full_name != null
          || row.customer_source != null;
        if (!isLikelyCustomerRow) return null;

        const fallbackParsed = Number.parseInt(row.id, 10);
        return Number.isFinite(fallbackParsed) ? fallbackParsed : null;
      };
      const resolveGroupDisplayName = (groupId, entry = null) => {
        const raw = entry?.row || entry || {};
        const candidate = raw?.groupName
          || raw?.name
          || raw?.group_name
          || raw?.title
          || null;
        const normalized = String(candidate || '').trim();
        if (normalized) return normalized;
        return String(groupId || '').trim() || null;
      };
      const normalizeAttachmentMetadata = (attachments = []) => {
        if (!Array.isArray(attachments) || attachments.length === 0) return [];
        return attachments.map((item) => {
          const source = item && typeof item === 'object' ? item : {};
          const displayName = String(
            source.displayName
            || source.fileName
            || source.name
            || source.originalName
            || source.title
            || source.url
            || 'Tệp đính kèm'
          ).trim();
          return {
            displayName,
            type: String(source.type || source.mediaType || source.mime || source.contentType || '').trim() || null,
            url: String(source.url || source.downloadUrl || source.publicUrl || '').trim() || null,
            storageKey: String(source.key || source.storageKey || source.s3Key || '').trim() || null,
          };
        });
      };
      /**
       * Extract one best-effort email value from source row.
       *
       * @param {Record<string, any>|null} row
       * @returns {string}
       */
      const extractEmailFromEntryRow = (row = null) => {
        if (!row || typeof row !== 'object') return '';
        const candidates = [row.email, row.Email, row.mail, row.contact_email];
        for (const candidate of candidates) {
          const value = String(candidate || '').trim();
          if (!value) continue;
          if (value.includes('@')) return value;
        }
        return '';
      };
      /**
       * Extract one best-effort customer name from source row.
       *
       * @param {Record<string, any>|null} row
       * @returns {string}
       */
      const extractFullNameFromEntryRow = (row = null) => {
        if (!row || typeof row !== 'object') return '';
        const candidates = [row.full_name, row.fullName, row.name, row.customer_name, row.display_name];
        for (const candidate of candidates) {
          const value = String(candidate || '').trim();
          if (value) return value;
        }
        return '';
      };
      /**
       * Chuẩn hóa tên người gửi/tài khoản Zalo để đưa vào payload log.
       *
       * @param {Record<string, any>|null} account tài khoản Zalo đang gửi
       * @returns {string|null}
       */
      const resolveZaloSenderName = (account = null) => {
        if (!account || typeof account !== 'object') return null;
        const candidates = [
          account.displayName,
          account.fullName,
          account.name,
          account.username,
          account.phone,
        ];
        for (const candidate of candidates) {
          const value = String(candidate || '').trim();
          if (value) return value;
        }
        return null;
      };
      /**
       * Best-effort lấy tên Zalo người nhận từ nhiều nguồn dữ liệu khác nhau.
       *
       * @param {object} input dữ liệu ngữ cảnh khi gửi tin
       * @param {Record<string, any>|null} input.entryRow dòng dữ liệu nguồn
       * @param {Record<string, any>|null} input.sendResult phản hồi từ API Zalo
       * @param {string} [input.fallbackRecipient] fallback theo người nhận
       * @returns {string|null}
       */
      const resolveZaloRecipientName = ({
        entryRow = null,
        sendResult = null,
        fallbackRecipient = '',
      } = {}) => {
        const rowCandidates = entryRow && typeof entryRow === 'object'
          ? [
            entryRow.full_name,
            entryRow.fullName,
            entryRow.display_name,
            entryRow.displayName,
            entryRow.name,
            entryRow.customer_name,
            entryRow.zalo_name,
            entryRow.zaloName,
            entryRow.friend_name,
            entryRow.friendName,
          ]
          : [];
        const responseCandidates = sendResult && typeof sendResult === 'object'
          ? [
            sendResult.fullName,
            sendResult.displayName,
            sendResult.name,
            sendResult.friendName,
            sendResult.recipientName,
            sendResult.toName,
          ]
          : [];
        const candidates = [...rowCandidates, ...responseCandidates, fallbackRecipient];
        for (const candidate of candidates) {
          const value = String(candidate || '').trim();
          if (value) return value;
        }
        return null;
      };
      /**
       * Extract Zalo UID from source row (from node output).
       * Supports multiple field name conventions used by different node types.
       *
       * @param {Record<string, any>|null} row
       * @returns {string}
       */
      const extractZaloUidFromRow = (row = null) => {
        if (!row || typeof row !== 'object') return '';
        const candidates = [row.uid, row.zalo_id, row.zaloId, row.zalo_uid, row.zaloUid];
        for (const candidate of candidates) {
          const value = String(candidate || '').trim();
          if (value) return value;
        }
        return '';
      };
      /**
       * Determine whether send friend request failed because target is already a friend.
       *
       * @param {unknown} error
       * @returns {boolean}
       */
      const isAlreadyZaloFriendError = (error) => {
        const message = String(error?.message || error || '').trim().toLowerCase();
        if (!message) return false;
        return [
          'đã là bạn bè',
          'da la ban be',
          'already friend',
          'already friends',
          'is friend',
        ].some((keyword) => message.includes(keyword));
      };
      /**
       * Upsert customer by phone and mark Zalo friendship status.
       *
       * @param {object} input
       * @param {string} input.phone
       * @param {string} [input.uid]
       * @param {Record<string, any>|null} [input.entryRow]
       * @returns {Promise<{customerId: number|null, action: 'updated'|'created'|'skipped'}>}
       */
      const upsertZaloFriendCustomerByPhone = async ({
        phone,
        uid = '',
        entryRow = null,
      }) => {
        const normalizedPhone = String(phone || '').trim();
        if (!normalizedPhone) return { customerId: null, action: 'skipped' };

        const normalizedUid = String(uid || '').trim();
        const rowEmail = extractEmailFromEntryRow(entryRow);
        const rowFullName = extractFullNameFromEntryRow(entryRow);
        const existingCustomerResult = await db.query(
          `SELECT id
           FROM customers
           WHERE id_user = $1
             AND (phone = $2 OR zalo_phone = $2)
           ORDER BY id ASC
           LIMIT 1`,
          [userId, normalizedPhone]
        );
        const existingCustomerId = Number.parseInt(existingCustomerResult.rows[0]?.id, 10);

        if (Number.isFinite(existingCustomerId)) {
          await db.query(
            `UPDATE customers
             SET
               phone = COALESCE(NULLIF($1, ''), phone),
               zalo_phone = COALESCE(NULLIF($2, ''), zalo_phone),
               zalo_id = COALESCE(NULLIF($3, ''), zalo_id),
               full_name = COALESCE(NULLIF($4, ''), full_name),
               email = COALESCE(NULLIF($5, ''), email),
               customer_source = COALESCE(customer_source, 'uknow_campaign'),
               zalo_is_friend = TRUE,
               zalo_friend_added_at = COALESCE(zalo_friend_added_at, CURRENT_TIMESTAMP),
               updated_at = CURRENT_TIMESTAMP
             WHERE id = $6
               AND id_user = $7`,
            [
              normalizedPhone,
              normalizedPhone,
              normalizedUid,
              rowFullName,
              rowEmail,
              existingCustomerId,
              userId,
            ]
          );
          return {
            customerId: existingCustomerId,
            action: 'updated',
          };
        }

        const insertedCustomerResult = await db.query(
          `INSERT INTO customers
             (id_user, email, phone, zalo_id, zalo_phone, full_name, customer_source,
              zalo_is_friend, zalo_friend_added_at, created_at, updated_at)
           VALUES
             ($1, NULLIF($2, ''), $3, NULLIF($4, ''), $5, NULLIF($6, ''), $7,
              TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           RETURNING id`,
          [
            userId,
            rowEmail,
            normalizedPhone,
            normalizedUid,
            normalizedPhone,
            rowFullName,
            'uknow_campaign',
          ]
        );
        return {
          customerId: Number.parseInt(insertedCustomerResult.rows[0]?.id, 10) || null,
          action: 'created',
        };
      };

      /**
       * Upsert customer's zalo_id by resolved UID after a successful personal message send.
       *
       * Logic:
       * - If customerId is known → update that customer's zalo_id if not already set.
       * - If no customerId → find customer by phone or existing zalo_id and update.
       * - If no customer found and phone available → create a minimal customer record.
       *
       * @param {object} input
       * @param {number} input.userId
       * @param {string} input.uid     Zalo UID resolved from send response
       * @param {string} [input.phone] Phone number of recipient (when recipientType=phone)
       * @param {number|null} [input.customerId] Customer DB id if already resolved
       * @returns {Promise<void>}
       */
      const upsertCustomerZaloUid = async ({ userId: targetUserId, uid, phone = '', customerId: targetCustomerId = null }) => {
        const normalizedUid = String(uid || '').trim();
        if (!normalizedUid) return;

        const normalizedPhone = String(phone || '').trim();
        const parsedCustomerId = Number.parseInt(targetCustomerId, 10);

        // Fast path: customer is known – update zalo_id if missing
        if (Number.isFinite(parsedCustomerId)) {
          await db.query(
            `UPDATE customers
             SET zalo_id = COALESCE(NULLIF(zalo_id, ''), $1),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2
               AND id_user = $3
               AND (zalo_id IS NULL OR zalo_id = '')`,
            [normalizedUid, parsedCustomerId, targetUserId]
          );
          return;
        }

        // Slow path: look up customer by UID or phone
        const findResult = await db.query(
          `SELECT id FROM customers
           WHERE id_user = $1
             AND (zalo_id = $2 OR (phone = $3 AND $3 <> '') OR (zalo_phone = $3 AND $3 <> ''))
           ORDER BY id ASC
           LIMIT 1`,
          [targetUserId, normalizedUid, normalizedPhone || '__no_phone__']
        );

        if (findResult.rows.length > 0) {
          const foundId = findResult.rows[0].id;
          await db.query(
            `UPDATE customers
             SET zalo_id = COALESCE(NULLIF(zalo_id, ''), $1),
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $2`,
            [normalizedUid, foundId]
          );
          return;
        }

        // No customer found – create minimal record using phone + uid
        if (normalizedPhone) {
          await db.query(
            `INSERT INTO customers
               (id_user, phone, zalo_id, zalo_phone, customer_source, created_at, updated_at)
             VALUES ($1, $2, $3, $2, 'uknow_campaign', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             ON CONFLICT DO NOTHING`,
            [targetUserId, normalizedPhone, normalizedUid]
          );
        }
      };

      /**
       * Ensure one customer id is available for personal Zalo send tracking.
       * This is required so `utm_customer` can be embedded even when recipient is a raw UID.
       *
       * @param {object} input
       * @param {number} input.userId
       * @param {'phone'|'uid'} [input.recipientType]
       * @param {string} [input.recipient]
       * @param {Record<string, any>|null} [input.entryRow]
       * @param {number|null} [input.customerId]
       * @param {string} [input.entryUid]
       * @returns {Promise<number|null>}
       */
      const ensureCustomerForZaloPersonalRecipient = async ({
        userId: targetUserId,
        recipientType = 'phone',
        recipient = '',
        entryRow = null,
        customerId: targetCustomerId = null,
        entryUid = '',
      }) => {
        const parsedCustomerId = Number.parseInt(targetCustomerId, 10);
        const normalizedRecipientType = String(recipientType || 'phone').trim().toLowerCase() === 'uid'
          ? 'uid'
          : 'phone';
        const normalizedRecipient = String(recipient || '').trim();
        const normalizedUid = String(
          normalizedRecipientType === 'uid' ? normalizedRecipient : (entryUid || '')
        ).trim();
        const normalizedPhone = String(normalizedRecipientType === 'phone' ? normalizedRecipient : '').trim();
        const rowEmail = extractEmailFromEntryRow(entryRow);
        const rowFullName = extractFullNameFromEntryRow(entryRow);

        // Không chặn nhánh phone-only: vẫn cần tạo/find customer để ghi hành trình Zalo như email.
        if (!Number.isFinite(parsedCustomerId) && !normalizedUid && !normalizedPhone) {
          return null;
        }

        if (Number.isFinite(parsedCustomerId)) {
          /**
           * Chỉ chấp nhận customerId đầu vào khi thực sự thuộc về đúng user.
           * Điều này chặn trường hợp upstream truyền nhầm id của bảng trung gian
           * (vd: customer_purchases.id) khiến journey/execution bị gắn sai khách.
           */
          const verifiedCustomerResult = await db.query(
            `SELECT id
             FROM customers
             WHERE id = $1
               AND id_user = $2
             LIMIT 1`,
            [parsedCustomerId, targetUserId]
          );
          const verifiedCustomerId = Number.parseInt(verifiedCustomerResult.rows[0]?.id, 10);
          if (!Number.isFinite(verifiedCustomerId)) {
            // Không return sớm: tiếp tục fallback theo UID/phone/email để tìm đúng customer.
          } else {
            await db.query(
            `UPDATE customers
             SET
               full_name = COALESCE(NULLIF($1, ''), full_name),
               email = COALESCE(NULLIF($2, ''), email),
               phone = COALESCE(NULLIF($3, ''), phone),
               zalo_phone = COALESCE(NULLIF($4, ''), zalo_phone),
               zalo_id = COALESCE(NULLIF($5, ''), zalo_id),
               customer_source = COALESCE(customer_source, 'uknow_campaign'),
               utm_source = COALESCE(utm_source, $6),
               updated_at = CURRENT_TIMESTAMP
             WHERE id = $7
               AND id_user = $8`,
              [
                rowFullName,
                rowEmail,
                normalizedPhone,
                normalizedPhone,
                normalizedUid,
                UTM_SOURCE_BY_ZALO_CHANNEL.personal,
                verifiedCustomerId,
                targetUserId,
              ]
            );
            return verifiedCustomerId;
          }
        }

        const existingCustomerResult = await db.query(
          `SELECT id
           FROM customers
           WHERE id_user = $1
             AND (
               ($2 <> '' AND zalo_id = $2)
               OR ($3 <> '' AND (phone = $3 OR zalo_phone = $3))
               OR ($4 <> '' AND LOWER(email) = LOWER($4))
             )
           ORDER BY id ASC
           LIMIT 1`,
          [
            targetUserId,
            normalizedUid,
            normalizedPhone,
            rowEmail,
          ]
        );
        const existingCustomerId = Number.parseInt(existingCustomerResult.rows[0]?.id, 10);
        if (Number.isFinite(existingCustomerId)) {
          await db.query(
            `UPDATE customers
             SET
               full_name = COALESCE(NULLIF($1, ''), full_name),
               email = COALESCE(NULLIF($2, ''), email),
               phone = COALESCE(NULLIF($3, ''), phone),
               zalo_phone = COALESCE(NULLIF($4, ''), zalo_phone),
               zalo_id = COALESCE(NULLIF($5, ''), zalo_id),
               customer_source = COALESCE(customer_source, 'uknow_campaign'),
               utm_source = COALESCE(utm_source, $6),
               updated_at = CURRENT_TIMESTAMP
             WHERE id = $7
               AND id_user = $8`,
            [
              rowFullName,
              rowEmail,
              normalizedPhone,
              normalizedPhone,
              normalizedUid,
              UTM_SOURCE_BY_ZALO_CHANNEL.personal,
              existingCustomerId,
              targetUserId,
            ]
          );
          return existingCustomerId;
        }

        const insertedCustomerResult = await db.query(
          `INSERT INTO customers
             (id_user, email, phone, zalo_id, zalo_phone, full_name, customer_source, utm_source, created_at, updated_at)
           VALUES
             ($1, NULLIF($2, ''), NULLIF($3, ''), $4, NULLIF($5, ''), NULLIF($6, ''), $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           RETURNING id`,
          [
            targetUserId,
            rowEmail,
            normalizedPhone,
            normalizedUid,
            normalizedPhone,
            rowFullName,
            'uknow_campaign',
            UTM_SOURCE_BY_ZALO_CHANNEL.personal,
          ]
        );
        return Number.parseInt(insertedCustomerResult.rows[0]?.id, 10) || null;
      };

      const createZaloMessageTrackingRecord = async ({
        nodeId = null,
        channel = 'zalo_personal',
        recipientType = null,
        recipientValue = null,
        uid = null,
        groupId = null,
        accountId = null,
        accountName = null,
        messageText = '',
        customerId = null,
        trackingToken = '',
        trackingMetadata = {},
      }) => {
        const insertResult = await db.query(
          `INSERT INTO zalo_messages
             (id_campaign, id_run, id_customer, id_node, channel, recipient_type, recipient_value, uid, group_id,
              account_id, account_name, message_text, tracking_token, tracking_base_url, tracking_metadata, sent_at, created_at, updated_at)
           VALUES
             ($1, $2, $3, $4, $5, $6, $7, $8, $9,
              $10, $11, $12, $13, $14, $15::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
           RETURNING id`,
          [
            campaignId,
            runId,
            customerId,
            nodeId,
            channel,
            recipientType,
            recipientValue,
            uid,
            groupId,
            accountId,
            accountName,
            messageText,
            trackingToken,
            trackingBaseUrl,
            JSON.stringify({
              source: runSource,
              status: 'queued',
              ...(trackingMetadata && typeof trackingMetadata === 'object' ? trackingMetadata : {}),
            }),
          ]
        );
        return insertResult.rows[0]?.id || null;
      };

      const updateZaloMessageTrackingMeta = async (zaloMessageId, metadata = {}) => {
        if (!Number.isFinite(Number.parseInt(zaloMessageId, 10))) return;
        await db.query(
          `UPDATE zalo_messages
           SET tracking_metadata = COALESCE(tracking_metadata, '{}'::jsonb) || $2::jsonb,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $1`,
          [zaloMessageId, JSON.stringify(metadata || {})]
        );
      };

      const logZaloSentJourneyEvent = async ({
        customerId = null,
        nodeId = null,
        zaloMessageId = null,
        messageText = '',
        channel = 'zalo',
        trackingToken = null,
      }) => {
        const parsedCustomerId = Number.parseInt(customerId, 10);
        const parsedZaloMessageId = Number.parseInt(zaloMessageId, 10);
        const eventChannel = String(channel || '').trim().toLowerCase() === 'zalo_group'
          ? 'zalo_group'
          : 'zalo';
        const isZaloGroupChannel = eventChannel === 'zalo_group';
        const canTrackPersonalJourney = Number.isFinite(parsedCustomerId);
        if (!Number.isFinite(parsedZaloMessageId)) return;
        // Zalo cá nhân cần id_customer; Zalo group được phép lưu journey không gắn khách.
        if (!isZaloGroupChannel && !canTrackPersonalJourney) return;
        await db.query(
          `INSERT INTO customer_journey
             (id_customer, id_campaign, id_run, id_node, event_type, event_channel, id_zalo_message, event_data, event_at)
           VALUES
             ($1, $2, $3, $4, 'zalo_sent', $5, $6, $7::jsonb, CURRENT_TIMESTAMP)`,
          [
            canTrackPersonalJourney ? parsedCustomerId : null,
            campaignId,
            runId,
            nodeId,
            eventChannel,
            parsedZaloMessageId,
            JSON.stringify({
              description: isZaloGroupChannel
                ? 'Đã gửi tin nhắn Zalo nhóm'
                : 'Đã gửi tin nhắn Zalo',
              channel: eventChannel,
              message: String(messageText || '').slice(0, 500),
              trackingToken: String(trackingToken || '').trim() || null,
            }),
          ]
        );
      };

      const nodesResult = await db.query(
        `SELECT * FROM campaign_nodes
         WHERE id_campaign = $1
         ORDER BY execution_order ASC`,
        [campaignId]
      );
      const nodes = nodesResult.rows;
      const connectionsResult = await db.query(
        `SELECT * FROM campaign_connections
         WHERE id_campaign = $1`,
        [campaignId]
      );
      const connections = connectionsResult.rows;

      if (nodes.length === 0) throw new Error('Chiến dịch không có node nào');

      const orderMap = campaignFlowService.buildExecutionOrderMap(nodes, connections, {
        nodeIdKey: 'id',
        sourceKey: 'source_node_id',
        targetKey: 'target_node_id',
      });
      const orderedNodes = [...nodes]
        .filter((node) => orderMap.has(String(node.id)))
        .sort((a, b) => {
          const orderA = orderMap.get(String(a.id)) || Number.MAX_SAFE_INTEGER;
          const orderB = orderMap.get(String(b.id)) || Number.MAX_SAFE_INTEGER;
          if (orderA !== orderB) return orderA - orderB;
          return Number(a.execution_order || 0) - Number(b.execution_order || 0);
        });
      const flowNodeIdMap = campaignFlowService.buildFlowNodeIdMap(campaign?.flow_json, orderedNodes);
      const resolveNodeId = (id) => {
        const key = String(id ?? '').trim();
        if (!key) return '';
        return flowNodeIdMap.get(key) || key;
      };

      for (let idx = 0; idx < orderedNodes.length; idx += 1) {
        const node = orderedNodes[idx];
        const nextOrder = idx + 1;
        node.execution_order = nextOrder;
        node.config = campaignFlowService.normalizeNodeReferenceConfig(node.config || {}, resolveNodeId);
        await db.query(
          `UPDATE campaign_nodes
           SET execution_order = $1, updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [nextOrder, node.id]
        );
      }

      const nodeOutputs = {};
      let lastOutputItems = [];
      let totalRecipients = 0;
      let successfulSends = 0;
      let failedSends = 0;
      let hasPendingEmailRetry = false;
      let pendingEmailRetryCount = 0;
      let selectedZaloAccount = null;
      const zaloTemplateContentCache = new Map();
      const zaloTemplateAttachmentSourceCache = new Map();
      /**
       * Đồng bộ trạng thái pending retry email từ recipient ledger trước khi finalize run.
       *
       * Luồng hoạt động:
       * 1. Chỉ kiểm tra cho run one-shot khi chưa có cờ pending trong cycle hiện tại.
       * 2. Query ledger để tìm recipient email chưa hoàn tất và có `nextDueAt` còn ở tương lai.
       * 3. Nếu có ít nhất 1 bản ghi, giữ run ở trạng thái `running` để chờ tới hạn retry.
       *
       * @returns {Promise<void>}
       */
      const syncPendingEmailRetryFromLedger = async () => {
        if (isContinuousMode || hasPendingEmailRetry || !isRecipientLedgerTableAvailable) return;
        try {
          const pendingRetryResult = await db.query(
            `SELECT COUNT(*)::int AS pending_count
             FROM campaign_run_recipient_steps
             WHERE id_run = $1
               AND channel = 'email'
               AND COALESCE(is_fully_completed, FALSE) = FALSE
               AND NULLIF(TRIM(COALESCE(meta->>'nextDueAt', '')), '') IS NOT NULL
               AND (meta->>'nextDueAt')::timestamptz > NOW()`,
            [runId]
          );
          const pendingCount = Number.parseInt(pendingRetryResult.rows[0]?.pending_count, 10) || 0;
          if (pendingCount > 0) {
            hasPendingEmailRetry = true;
            pendingEmailRetryCount = Math.max(pendingEmailRetryCount, pendingCount);
          }
        } catch (pendingCheckError) {
          if (String(pendingCheckError?.code || '') === '42P01' || String(pendingCheckError?.code || '') === '42703') {
            isRecipientLedgerTableAvailable = false;
            return;
          }
          throw pendingCheckError;
        }
      };
      /**
       * Kiểm tra lỗi thiếu key file trên storage (S3/compatible).
       *
       * Luồng hoạt động:
       * 1. Gom các trường mã lỗi phổ biến từ SDK (`name/code/Code`).
       * 2. Chuẩn hóa message lỗi về lowercase để dò cụm từ đặc trưng.
       * 3. Trả `true` khi xác định là lỗi "không tồn tại object key".
       *
       * @param {any} error Đối tượng lỗi phát sinh khi tải file đính kèm.
       * @returns {boolean} `true` nếu là lỗi thiếu key storage.
       */
      const isMissingStorageKeyError = (error) => {
        const codeCandidates = [
          error?.name,
          error?.code,
          error?.Code,
          error?.$metadata?.code,
        ].map((value) => String(value || '').trim().toLowerCase());
        if (codeCandidates.some((value) => value === 'nosuchkey')) {
          return true;
        }
        const message = String(error?.message || '').trim().toLowerCase();
        return message.includes('the specified key does not exist')
          || message.includes('specified key does not exist')
          || message.includes('nosuchkey');
      };
      /**
       * Tải danh sách file đính kèm template theo hướng an toàn cho run liên tục.
       *
       * Luồng hoạt động:
       * 1. Thử tải toàn bộ attachment từ storage như luồng chuẩn.
       * 2. Nếu lỗi thiếu key storage -> ghi cảnh báo và fallback gửi tin không kèm file.
       * 3. Với lỗi khác -> ném lại để giữ hành vi fail-fast cho lỗi nghiêm trọng.
       *
       * @param {object} input
       * @param {Array<any>} input.templateAttachments Danh sách attachment metadata của template.
       * @param {string|number|null} input.templateId ID template để log chẩn đoán.
       * @returns {Promise<Array<any>>} Danh sách attachment source hợp lệ để gửi.
       */
      const prepareZaloTemplateAttachmentsSafely = async ({ templateAttachments = [], templateId = null }) => {
        try {
          return await campaignZaloSenderService.prepareZaloAttachmentSources(
            templateAttachments,
            { cache: zaloTemplateAttachmentSourceCache }
          );
        } catch (error) {
          if (!isMissingStorageKeyError(error)) {
            throw error;
          }
          console.warn(
            `[CampaignRun][Zalo] run=${runId} template=${templateId || 'unknown'} skip_missing_attachment_key: ${error.message}`
          );
          return [];
        }
      };
      const getZaloTemplateContent = async (templateId) => {
        const templateIdNum = parseInt(templateId, 10);
        if (!Number.isFinite(templateIdNum)) {
          throw new Error('Template Zalo không hợp lệ');
        }
        if (!zaloTemplateContentCache.has(templateIdNum)) {
          const templateResult = await db.query(
            `SELECT body_text, body_html, attachments
             FROM zalo_templates
             WHERE id = $1 AND id_user = $2
             LIMIT 1`,
            [templateIdNum, userId]
          );
          if (templateResult.rows.length === 0) {
            throw new Error('Không tìm thấy template Zalo đã chọn');
          }
          const content = String(
            templateResult.rows[0]?.body_text || templateResult.rows[0]?.body_html || ''
          ).trim();
          if (!content) {
            throw new Error('Template Zalo không có nội dung để gửi');
          }
          const attachments = Array.isArray(templateResult.rows[0]?.attachments)
            ? templateResult.rows[0].attachments
            : [];
          zaloTemplateContentCache.set(templateIdNum, {
            message: content,
            attachments,
          });
        }
        return (
          zaloTemplateContentCache.get(templateIdNum)
          || { message: '', attachments: [] }
        );
      };
      const isZaloNodeSubtype = (nodeSubtype = '') => {
        const normalized = String(nodeSubtype || '').trim().toLowerCase();
        if (!normalized) return false;
        return normalized.includes('zalo') || normalized === 'get_all_friends' || normalized === 'get_all_groups';
      };
      const resolveSelectionMode = (mode, selectedIds = []) => {
        const normalized = String(mode || '').trim().toLowerCase();
        if (normalized === 'fixed' || normalized === 'all_exclude') {
          return normalized;
        }
        return Array.isArray(selectedIds) && selectedIds.length > 0 ? 'fixed' : 'all';
      };
      const refreshSourceNodeOutput = async (sourceNodeId) => {
        const safeSourceNodeId = String(sourceNodeId || '').trim();
        if (!safeSourceNodeId) return;
        const sourceNode = orderedNodes.find((item) => String(item?.id || '').trim() === safeSourceNodeId);
        if (!sourceNode) return;
        const sourceSubtype = String(sourceNode.node_subtype || '').trim().toLowerCase();
        const supportedRefreshSubtypes = new Set([
          'read_sheet',
          'google_sheet',
          'read_interested_customers',
          'interested_customers',
          'read_courses_db',
          'save_customer',
          'customer_segment',
        ]);
        if (!supportedRefreshSubtypes.has(sourceSubtype)) return;
        const refreshedItems = await executeWithTimeoutRetry({
          operationName: `refresh_source_node_${sourceSubtype || 'data'}`,
          operation: () => campaignNodeDataService.getCustomersFromDataNode(
            { ...sourceNode, config: campaignFlowService.normalizeNodeReferenceConfig(sourceNode.config || {}, resolveNodeId) },
            userId,
            orderedNodes
          ),
          onRetry: ({ attempt, maxAttempts, delayMs }) => {
            console.warn(
              `[CampaignRun][Retry] run=${runId} op=refresh_source_node attempt=${attempt}/${maxAttempts} `
              + `next_delay_ms=${delayMs} source_node=${safeSourceNodeId}`
            );
          },
        });
        nodeOutputs[safeSourceNodeId] = Array.isArray(refreshedItems) ? refreshedItems : [];
      };
      const refreshUpstreamDataNodesBefore = async (targetNodeId) => {
        const safeTargetNodeId = String(targetNodeId || '').trim();
        if (!safeTargetNodeId) return;
        const targetIndex = orderedNodes.findIndex((item) => String(item?.id || '').trim() === safeTargetNodeId);
        if (targetIndex <= 0) return;
        for (let i = 0; i < targetIndex; i += 1) {
          const upstreamNode = orderedNodes[i];
          const upstreamSubtype = String(upstreamNode?.node_subtype || '').trim().toLowerCase();
          const skipSubtypes = new Set([
            'manual_trigger',
            'schedule_trigger',
            'start',
            'send_email',
            'send_zalo_personal',
            'send_zalo_friend_request',
            'send_zalo_group',
          ]);
          if (skipSubtypes.has(upstreamSubtype)) continue;
          // eslint-disable-next-line no-await-in-loop
          await refreshSourceNodeOutput(upstreamNode.id);
        }
      };

      const CONTINUOUS_SUPPORTED_ACTION_SUBTYPES = new Set([
        'send_email',
        'send_zalo_personal',
        'send_zalo_friend_request',
        'send_zalo_group',
        'save_customer',
      ]);
      const hasContinuousSupportedActionNode = orderedNodes.some((item) => {
        const subtype = String(item?.node_subtype || '').trim().toLowerCase();
        return CONTINUOUS_SUPPORTED_ACTION_SUBTYPES.has(subtype);
      });
      if (isContinuousMode && !hasContinuousSupportedActionNode) {
        console.log(
          `[CampaignRun][Continuous] run=${runId} disable_continuous_mode reason=no_supported_action_nodes`
        );
        isContinuousMode = false;
      }

      // Sau khi xác nhận isContinuousMode, giải phóng slot one-shot để không block
      // campaign khác. Continuous campaign sẽ được theo dõi qua continuousRunIds riêng.
      if (isContinuousMode) {
        this.activeRunIds.delete(runKey);
        this._startNextFromQueue();
        this.continuousRunIds.add(runKey);
        console.log(
          `[CampaignRun][Continuous] run=${runKey} registered in continuous pool `
          + `(continuous=${this.continuousRunIds.size}, workers=${this.MAX_CONTINUOUS_WORKERS - this.continuousAvailableWorkers}/${this.MAX_CONTINUOUS_WORKERS})`
        );
      }

      let previousNodeSubtype = '';
      let continuousCycleIndex = 0;
      let nextContinuousWakeAtMs = null;
      /**
       * Ghi nhận thời điểm gần nhất cần đánh thức vòng chạy liên tục.
       *
       * Luồng hoạt động:
       * 1. Bỏ qua mốc thời gian không hợp lệ hoặc đã quá hạn.
       * 2. Luôn giữ mốc nhỏ nhất (sớm nhất) để vòng lặp thức dậy đúng lúc.
       *
       * @param {number|null|undefined} dueAtMs Mốc thời gian (timestamp ms) của lần gửi tiếp theo.
       * @returns {void}
       */
      const registerNextContinuousWakeAt = (dueAtMs) => {
        if (!Number.isFinite(dueAtMs)) return;
        if (dueAtMs <= Date.now()) return;
        if (!Number.isFinite(nextContinuousWakeAtMs) || dueAtMs < nextContinuousWakeAtMs) {
          nextContinuousWakeAtMs = dueAtMs;
        }
      };
      while (true) {
        nextContinuousWakeAtMs = null;
        let shouldPauseUntilNextContinuousCycle = false;
        // Chiếm worker slot trước khi xử lý nodes trong chu kỳ này.
        // Sleeping campaigns không giữ slot → cho phép 50-100 campaigns đăng ký
        // nhưng chỉ MAX_CONTINUOUS_WORKERS campaigns xử lý đồng thời.
        if (isContinuousMode) await this._acquireContinuousWorker(runKey);
        for (const node of orderedNodes) {
          await this.ensureRunStillRunning(runId);
          const nodeSubtype = String(node.node_subtype || '').toLowerCase();
          const nodeType = String(node.node_type || '').toLowerCase();
          const isReplayCycle = isContinuousMode && continuousCycleIndex > 0;
          if (
            isReplayCycle
            && nodeType === 'action'
            && !['send_email', 'send_zalo_personal', 'send_zalo_friend_request', 'save_customer'].includes(nodeSubtype)
          ) {
            previousNodeSubtype = nodeSubtype;
            continue;
          }
          const isTriggerNode = nodeSubtype.includes('trigger') || nodeSubtype === 'start' || nodeType === 'trigger';
          const shouldDelayBetweenAdjacentZaloNodes = (
            adjacentZaloNodeDelayMs > 0
            && isZaloNodeSubtype(previousNodeSubtype)
            && isZaloNodeSubtype(nodeSubtype)
          );
          if (shouldDelayBetweenAdjacentZaloNodes) {
            console.log(
              `[CampaignRun][Delay] run=${runId} adjacent_zalo_node_delay_ms=${adjacentZaloNodeDelayMs} ` +
              `from=${previousNodeSubtype || 'unknown'} to=${nodeSubtype || 'unknown'}`
            );
            await sleepWithRunCheck(adjacentZaloNodeDelayMs);
          }
          previousNodeSubtype = nodeSubtype;

          try {
            if (isTriggerNode) {
              await campaignExecutionLogService.logExecutionNode({
                campaignId,
                runId,
                node,
                status: 'success',
                executionData: {
                  message: 'Khởi chạy thủ công',
                  items: [],
                  schema: [],
                  meta: { triggered: true },
                },
              });
              continue;
            }

        if (['read_sheet', 'google_sheet', 'read_interested_customers', 'interested_customers', 'read_courses_db'].includes(nodeSubtype)) {
          const nodeCustomers = await executeWithTimeoutRetry({
            operationName: `data_node_${nodeSubtype || 'read_data'}`,
            operation: () => campaignNodeDataService.getCustomersFromDataNode(node, userId, nodes),
            onRetry: ({ attempt, maxAttempts, delayMs }) => {
              console.warn(
                `[CampaignRun][Retry] run=${runId} op=data_node_read attempt=${attempt}/${maxAttempts} `
                + `next_delay_ms=${delayMs} node=${nodeSubtype || node.id}`
              );
            },
          });
          const fetchedItems = Array.isArray(nodeCustomers) ? nodeCustomers : [];
          const mergedNodeData = isContinuousMode
            ? mergeContinuousNodeItems({
                nodeId: node.id,
                nodeSubtype,
                fetchedItems,
              })
            : {
                allItems: fetchedItems,
                newItems: fetchedItems,
              };
          const outputItems = isContinuousMode ? mergedNodeData.newItems : mergedNodeData.allItems;
          const previewItems = outputItems.slice(0, 100);
          const fetched = outputItems.length;
          const totalItems = mergedNodeData.allItems.length;
          const message = isContinuousMode
            ? campaignFlowService.buildNodeSuccessMessage(nodeSubtype, { fetched, total: totalItems })
            : campaignFlowService.buildNodeSuccessMessage(nodeSubtype, { fetched, total: fetched });
          nodeOutputs[String(node.id)] = mergedNodeData.allItems;
          lastOutputItems = mergedNodeData.allItems;

          await campaignExecutionLogService.logExecutionNode({
            campaignId,
            runId,
            node,
            status: 'success',
            executionData: {
              message,
              fetchedCustomers: fetched,
              sourceNodeType: node.node_subtype,
              items: previewItems,
              schema: campaignFlowService.buildSchemaFromRows(previewItems),
              meta: {
                fetched,
                totalItems,
                previewed: previewItems.length,
                ...(isContinuousMode
                  ? { newItems: fetched, accumulatedItems: totalItems, continuousMode: true }
                  : {}),
              },
            },
          });
          continue;
        }

        if (nodeSubtype === 'save_customer') {
          const config = campaignFlowService.normalizeNodeReferenceConfig(node.config || {}, resolveNodeId);
          const fieldMap = config.saveCustomerFieldMap || {};
          const customFields = Array.isArray(config.saveCustomerCustomFields) ? config.saveCustomerCustomFields : [];
          const mappedSourceNodeIds = [
            config.saveCustomerNodeId,
            ...Object.values(fieldMap).map((m) => m?.nodeId),
            ...customFields.map((m) => m?.nodeId),
          ]
            .map((id) => String(id || '').trim())
            .filter((id, idx, arr) => id && arr.indexOf(id) === idx);
          const preferredSourceNodeId = mappedSourceNodeIds[0] || '';
          if (!preferredSourceNodeId) throw new Error('Chưa chọn node dữ liệu để lưu khách hàng');

          const baseItems = Array.isArray(nodeOutputs[preferredSourceNodeId]) ? nodeOutputs[preferredSourceNodeId] : [];
          const sourceItems = baseItems.map((row, index) => {
            const nodeData = {};
            mappedSourceNodeIds.forEach((nodeId) => {
              const items = Array.isArray(nodeOutputs[nodeId]) ? nodeOutputs[nodeId] : [];
              nodeData[nodeId] = items[index] ?? null;
            });
            return {
              ...(row || {}),
              __rowIndex: index,
              __nodeData: nodeData,
            };
          });
          const mappedLogItems = campaignFlowService.buildSaveCustomerLogItems(sourceItems, fieldMap, customFields);

          const saveSummary = sourceItems.length > 0
            ? await campaignNodeDataService.saveCustomersFromCampaign(sourceItems, campaignId, userId, { ...node, config }, runId)
            : { saved: 0, updated: 0, skipped: 0 };

          nodeOutputs[String(node.id)] = sourceItems;
          lastOutputItems = sourceItems;

          await campaignExecutionLogService.logExecutionNode({
            campaignId,
            runId,
            node,
            status: 'success',
            executionData: {
              message: campaignFlowService.buildNodeSuccessMessage('save_customer', {
                inserted: saveSummary.saved,
                updated: saveSummary.updated,
                skipped: saveSummary.skipped,
              }),
              savedCustomers: saveSummary.saved,
              updatedCustomers: saveSummary.updated,
              skippedCustomers: saveSummary.skipped,
              items: mappedLogItems.slice(0, 100),
              schema: campaignFlowService.buildSchemaFromRows(mappedLogItems.slice(0, 1)),
              meta: {
                inserted: saveSummary.saved,
                updated: saveSummary.updated,
                skipped: saveSummary.skipped,
                totalItems: mappedLogItems.length,
                previewed: Math.min(mappedLogItems.length, 100),
              },
            },
          });
          continue;
        }

        if (nodeSubtype === 'select_zalo_account') {
          const config = campaignFlowService.normalizeNodeReferenceConfig(node.config || {}, resolveNodeId);
          const selectedAccountId = String(config.zaloAccountId || '').trim();
          if (!selectedAccountId) {
            throw new Error('Node chọn tài khoản Zalo chưa có dữ liệu tài khoản');
          }
          const account = await campaignZaloSenderService.getCampaignZaloAccount({
            userId,
            accountId: selectedAccountId,
            roleCode,
          });
          selectedZaloAccount = account;
          const outputItems = [{
            ...account,
            __zaloAccountSelected: true,
          }];
          nodeOutputs[String(node.id)] = outputItems;
          lastOutputItems = outputItems;

          await campaignExecutionLogService.logExecutionNode({
            campaignId,
            runId,
            node,
            status: 'success',
            executionData: {
              message: `Đã chọn tài khoản Zalo: ${account.displayName}`,
              items: outputItems,
              schema: campaignFlowService.buildSchemaFromRows(outputItems),
              meta: {
                selected: true,
                accountId: account.id,
              },
            },
          });
          continue;
        }

        if (nodeSubtype === 'send_email') {
          const config = campaignFlowService.normalizeNodeReferenceConfig(node.config || {}, resolveNodeId);
          const emailSteps = Array.isArray(config.emailSteps)
            ? config.emailSteps.filter((step) => Number.isFinite(parseInt(step?.templateId, 10)))
            : [];
          const resolveEmailRecipients = () => {
            let recipientRows = [];
            if (config.recipientSource === 'manual') {
              recipientRows = campaignFlowService.parseEmailList(config.recipientEmails).map((email) => ({ email }));
            } else if (config.recipientSource === 'node' && String(config.recipientNodeId || '').trim()) {
              const sourceNodeId = String(config.recipientNodeId).trim();
              const sourceItems = Array.isArray(nodeOutputs[sourceNodeId]) ? nodeOutputs[sourceNodeId] : [];
              const field = String(config.recipientField || '').trim() || 'email';
              const mappedSourceNodeIds = [
                sourceNodeId,
                ...emailSteps.flatMap((step) => (Array.isArray(step?.templateMappings) ? step.templateMappings : []).map((mapping) => mapping?.nodeId)),
              ]
                .map((id) => String(id || '').trim())
                .filter((id, idx, arr) => id && arr.indexOf(id) === idx);
              sourceItems.forEach((row, rowIndex) => {
                const raw = row?.[field];
                const emails = Array.isArray(raw) ? raw : campaignFlowService.parseEmailList(raw);
                const nodeData = {};
                mappedSourceNodeIds.forEach((nodeId) => {
                  const items = Array.isArray(nodeOutputs[nodeId]) ? nodeOutputs[nodeId] : [];
                  nodeData[nodeId] = items[rowIndex] ?? items[0] ?? null;
                });
                emails.forEach((email) => {
                  const value = String(email || '').trim();
                  if (!value) return;
                  recipientRows.push({
                    ...row,
                    email: value,
                    __rowIndex: rowIndex,
                    __nodeData: nodeData,
                  });
                });
              });
            } else {
              recipientRows = (Array.isArray(lastOutputItems) ? lastOutputItems : [])
                .map((row) => {
                  const email = String(row?.email || '').trim();
                  return email ? { ...row, email } : null;
                })
                .filter(Boolean);
            }
            return Array.from(
              new Map(
                recipientRows.map((row) => {
                  const normalizedEmail = String(row.email || '').trim().toLowerCase();
                  const customerId = extractCustomerIdFromRow(row);
                  return [
                    normalizedEmail,
                    {
                      ...row,
                      // Chuẩn hóa id để các bước log execution luôn dùng đúng customers.id.
                      id: customerId,
                      id_customer: customerId,
                    },
                  ];
                })
              ).values()
            ).filter((row) => String(row.email || '').trim());
          };
          let dedupedRecipients = resolveEmailRecipients();

          const emailSendMode = String(config.sendMode || 'all').trim();
          const sendResults = [];
          /**
           * Chuẩn hóa payload log cho node gửi email để UI luôn đọc được bảng dữ liệu.
           *
           * Luồng hoạt động:
           * 1. Gói kết quả hiện tại vào mảng `items` (kể cả khi chỉ có 1 bản ghi).
           * 2. Đính kèm `schema` + `meta` để frontend aggregate đúng theo node.
           * 3. Giữ trường `message` ở cấp root để panel log hiển thị nhanh.
           *
           * @param {object} payload kết quả gửi hiện tại
           * @returns {{message: string, items: Array<object>, schema: Array<object>, meta: object}}
           */
          const buildSendEmailExecutionData = (payload = {}) => {
            const item = { ...payload };
            const attempted = successfulSends + failedSends;
            const sent = successfulSends;
            const failed = failedSends;
            return {
              message: String(payload?.message || ''),
              items: [item],
              schema: campaignFlowService.buildSchemaFromRows([item]),
              meta: {
                attempted,
                sent,
                failed,
                totalItems: sendResults.length,
              },
            };
          };
          /**
           * Chuẩn hóa thời điểm retry từ worker về định dạng ISO +07 để lưu vào recipient ledger.
           *
           * Luồng hoạt động:
           * 1. Nhận `scheduledAt` từ kết quả gửi (có thể null/rỗng).
           * 2. Parse thành timestamp hợp lệ, nếu lỗi thì bỏ qua để không ghi sai lịch.
           * 3. Convert về ISO +07 dùng chung với `nextDueAt`.
           *
           * @param {string|null|undefined} scheduledAt
           * @returns {string|null}
           */
          const normalizeRetryScheduledAt = (scheduledAt) => {
            if (!scheduledAt) return null;
            const timestamp = Date.parse(scheduledAt);
            if (!Number.isFinite(timestamp)) return null;
            return toHoChiMinhIso(timestamp);
          };
          /**
           * Ghi nhận run hiện còn recipient đang chờ retry do provider rate-limit.
           *
           * Luồng hoạt động:
           * 1. Đặt cờ để chặn bước finalize `completed` ở cuối run one-shot.
           * 2. Đếm số lượt retry đã được lên lịch để phục vụ quan sát log.
           *
           * @returns {void}
           */
          const markRunHasPendingEmailRetry = () => {
            hasPendingEmailRetry = true;
            pendingEmailRetryCount += 1;
          };
          const sendEmailWithLogging = async ({
            customer,
            runtimeNode,
            stepMeta = null,
            progress = null,
            applyRandomDelay = true,
          }) => {
            if (applyRandomDelay) {
              // eslint-disable-next-line no-await-in-loop
              await waitRandomApiDelay(`email_send_step_${stepMeta?.stepIndex || 1}`);
            }
            try {
              const retryCountFromProgress = Math.max(
                0,
                Number.parseInt(progress?.retryCount, 10) || 0
              );
              const scheduledRetryAtFromProgress = String(progress?.nextDueAt || '').trim();
              // Đồng bộ retry metadata từ ledger để:
              // 1) không reset bộ đếm retry về lần 1 ở mỗi vòng xử lý;
              // 2) có guard chặn gửi sớm hơn mốc nextDueAt nếu worker lệch nhịp.
              const retryMeta = {
                ...(retryCountFromProgress > 0 ? { sendgridLimitRetryCount: retryCountFromProgress } : {}),
                ...(scheduledRetryAtFromProgress ? { scheduledRetryAt: scheduledRetryAtFromProgress } : {}),
              };
              const sendResult = await executeWithTimeoutRetry({
                operationName: 'send_email_node',
                operation: () => campaignEmailSenderService.sendEmailToCustomer(
                  runtimeNode,
                  customer,
                  campaign,
                  runId,
                  Object.keys(retryMeta).length > 0 ? retryMeta : null
                ),
                onRetry: ({ attempt, maxAttempts, delayMs }) => {
                  console.warn(
                    `[CampaignRun][Retry] run=${runId} op=send_email_node attempt=${attempt}/${maxAttempts} `
                    + `next_delay_ms=${delayMs} email=${String(customer?.email || '').trim()}`
                  );
                },
              });

              // Xử lý các trường hợp bỏ qua (unsubscribed / hard bounced)
              if (sendResult.status === 'skipped') {
                const skipLabels = {
                  unsubscribed: 'Đã hủy đăng ký nhận email',
                  hard_bounced: 'Địa chỉ email bị hard bounce',
                };
                const skipMessage = skipLabels[sendResult.reason] || 'Bỏ qua';
                const skippedPayload = {
                  ...sendResult,
                  message: skipMessage,
                  templateId: stepMeta?.templateId || null,
                  stepIndex: stepMeta?.stepIndex || null,
                  sendMode: stepMeta?.sendMode || null,
                };
                sendResults.push(skippedPayload);
                await campaignExecutionLogService.logExecutionNode({
                  campaignId,
                  runId,
                  node,
                  customerId: customer.id || null,
                  status: 'warning',
                  progressCurrent: successfulSends + failedSends,
                  progressTotal: totalRecipients,
                  executionData: buildSendEmailExecutionData(skippedPayload),
                });
                // Với chạy liên tục, email đã bị skip thì không được gọi lại ở các vòng sau.
                // Đồng thời dừng luôn các step còn lại của cùng recipient trong lần chạy hiện tại.
                const shouldStopRemainingSteps = true;
                return {
                  success: false,
                  stopRemainingStepsForRecipient: shouldStopRemainingSteps,
                };
              }

              // Xử lý bounce từ SMTP (hard hoặc soft)
              if (sendResult.status === 'bounced') {
                failedSends += 1;
                const bounceLabel = sendResult.bounceType === 'hard' ? 'Hard bounce' : 'Soft bounce';
                const bouncePayload = {
                  ...sendResult,
                  message: `${bounceLabel}: ${sendResult.bounceReason || 'Email không thể gửi được'}`,
                  templateId: stepMeta?.templateId || null,
                  stepIndex: stepMeta?.stepIndex || null,
                  sendMode: stepMeta?.sendMode || null,
                };
                sendResults.push(bouncePayload);
                await campaignExecutionLogService.logExecutionNode({
                  campaignId,
                  runId,
                  node,
                  customerId: customer.id || null,
                  status: 'failed',
                  progressCurrent: successfulSends + failedSends,
                  progressTotal: totalRecipients,
                  errorMessage: bouncePayload.message,
                  executionData: buildSendEmailExecutionData(bouncePayload),
                });
                return {
                  success: false,
                  // Bounce là trạng thái kết thúc recipient: không retry lại trong chạy liên tục.
                  stopRemainingStepsForRecipient: true,
                };
              }

              // Lỗi cấu hình SMTP (ví dụ 535) không phải bounce của người nhận.
              if (sendResult.status === 'failed') {
                const isRateLimitedRetryScheduled = sendResult.errorType === 'smtp_rate_limited_retry_scheduled';
                if (!isRateLimitedRetryScheduled) {
                  failedSends += 1;
                }
                const failedMessage = sendResult.errorType === 'smtp_config'
                  ? `Lỗi cấu hình SMTP: ${sendResult.error || 'Xác thực email gửi không hợp lệ'}`
                  : (sendResult.errorType === 'smtp_rate_limited_retry_scheduled'
                    ? (sendResult.error || 'SendGrid đang giới hạn gửi, đã lên lịch gửi lại')
                    : (sendResult.error || 'Gửi email thất bại'));
                const failedPayload = {
                  ...sendResult,
                  message: failedMessage,
                  retryAttemptCount: Math.max(0, Number.parseInt(sendResult?.retryAttemptCount, 10) || 0),
                  templateId: stepMeta?.templateId || null,
                  stepIndex: stepMeta?.stepIndex || null,
                  sendMode: stepMeta?.sendMode || null,
                };
                sendResults.push(failedPayload);
                await campaignExecutionLogService.logExecutionNode({
                  campaignId,
                  runId,
                  node,
                  customerId: customer.id || null,
                  status: isRateLimitedRetryScheduled ? 'warning' : 'failed',
                  progressCurrent: successfulSends + failedSends,
                  progressTotal: totalRecipients,
                  errorMessage: failedMessage,
                  executionData: buildSendEmailExecutionData(failedPayload),
                });
                if (isRateLimitedRetryScheduled) {
                  markRunHasPendingEmailRetry();
                  return {
                    success: false,
                    stopRemainingStepsForRecipient: true,
                    preservePendingStep: true,
                    retryScheduledAt: sendResult.retryScheduledAt || null,
                    retryAttemptCount: Math.max(
                      0,
                      Number.parseInt(sendResult?.retryAttemptCount, 10) || 0
                    ),
                  };
                }
                return {
                  success: false,
                  stopRemainingStepsForRecipient: true,
                };
              }

              successfulSends += 1;
              const progressMessage = `Đã gửi ${successfulSends + failedSends}/${totalRecipients}`;
              const resultPayload = {
                ...sendResult,
                message: progressMessage,
                templateId: stepMeta?.templateId || null,
                stepIndex: stepMeta?.stepIndex || null,
                sendMode: stepMeta?.sendMode || null,
              };
              sendResults.push(resultPayload);

              await campaignExecutionLogService.logExecutionNode({
                campaignId,
                runId,
                node,
                customerId: customer.id || null,
                status: 'success',
                progressCurrent: successfulSends + failedSends,
                progressTotal: totalRecipients,
                executionData: buildSendEmailExecutionData(resultPayload),
              });
              return { success: true };
            } catch (error) {
              failedSends += 1;
              const progressMessage = `Đã gửi ${successfulSends + failedSends}/${totalRecipients}`;
              const failedPayload = {
                to: customer.email,
                status: 'failed',
                error: error.message,
                message: progressMessage,
                templateId: stepMeta?.templateId || null,
                stepIndex: stepMeta?.stepIndex || null,
                sendMode: stepMeta?.sendMode || null,
              };
              sendResults.push(failedPayload);

              await campaignExecutionLogService.logExecutionNode({
                campaignId,
                runId,
                node,
                customerId: customer.id || null,
                status: 'failed',
                progressCurrent: successfulSends + failedSends,
                progressTotal: totalRecipients,
                errorMessage: error.message,
                executionData: buildSendEmailExecutionData(failedPayload),
              });
              return { success: false };
            }
          };

          if (isContinuousMode) {
            const loopEmailSteps = emailSteps.length > 0 ? emailSteps : [{ templateId: config.emailTemplateId || null }];
            const loopEmailSendMode = String(config.sendMode || 'all').trim();
            await refreshUpstreamDataNodesBefore(node.id);
            if (config.recipientSource === 'node' && String(config.recipientNodeId || '').trim()) {
              await refreshSourceNodeOutput(String(config.recipientNodeId || '').trim());
            }
            dedupedRecipients = resolveEmailRecipients();
            if (dedupedRecipients.length === 0) {
              await campaignExecutionLogService.logExecutionNode({
                campaignId,
                runId,
                node,
                status: 'warning',
                executionData: {
                  message: 'Chưa có khách mới hợp lệ để gửi email trong chế độ chạy liên tục',
                  items: [],
                  schema: [],
                  meta: { totalItems: 0, continuousMode: true },
                },
              });
            }
            await runTasksWithConcurrency({
              items: dedupedRecipients,
              concurrency: this.CONTINUOUS_EMAIL_BATCH_SIZE,
              handler: async (customer) => {
                const customerKey = String(customer?.email || '').trim().toLowerCase();
                if (!customerKey) return;
                try {
                  const progress = await getRecipientProgress({
                    nodeId: node.id,
                    channel: 'email',
                    recipientKey: customerKey,
                  });
                  const nextStepIndex = Math.max(0, progress.lastCompletedStep || 0);
                  if (progress.isFullyCompleted || nextStepIndex >= loopEmailSteps.length) return;
                  const dueStatus = resolveNextDueAtStatus(progress.nextDueAt);
                  if (!dueStatus.isDueNow) {
                    registerNextContinuousWakeAt(dueStatus.nextDueAtMs);
                    return;
                  }
                  const step = loopEmailSteps[nextStepIndex];
                  const runtimeNode = {
                    ...node,
                    config: {
                      ...config,
                      emailTemplateId: step.templateId || config.emailTemplateId,
                      emailSteps: [step],
                    },
                  };
                  totalRecipients += 1;
                  const sendOutcome = await sendEmailWithLogging({
                    customer,
                    runtimeNode,
                    stepMeta: {
                      templateId: step.templateId || null,
                      stepIndex: nextStepIndex + 1,
                      sendMode: loopEmailSendMode,
                    },
                    progress,
                    // Continuous mode ưu tiên throughput, delay ngẫu nhiên được điều khiển bằng env.
                    applyRandomDelay: shouldApplyRandomDelayInContinuous(),
                  });
                  if (sendOutcome?.success) {
                    const completedAtIso = toHoChiMinhIso();
                    const firstSentAt = progress.firstSentAt || completedAtIso;
                    const nextDueAt = computeStepDueAt({
                      steps: loopEmailSteps,
                      completedStep: nextStepIndex + 1,
                      firstSentAt,
                      lastCompletedAt: completedAtIso,
                      sendMode: loopEmailSendMode,
                    });
                    await upsertRecipientProgress({
                      nodeId: node.id,
                      channel: 'email',
                      recipientKey: customerKey,
                      completedStep: nextStepIndex + 1,
                      totalSteps: loopEmailSteps.length,
                      firstSentAt,
                      lastCompletedAt: completedAtIso,
                      nextDueAt,
                    });
                    registerNextContinuousWakeAt(nextDueAt ? Date.parse(nextDueAt) : null);
                  } else if (sendOutcome?.preservePendingStep) {
                    const retryScheduledAt = normalizeRetryScheduledAt(sendOutcome.retryScheduledAt);
                    if (retryScheduledAt) {
                      await upsertRecipientProgress({
                        nodeId: node.id,
                        channel: 'email',
                        recipientKey: customerKey,
                        completedStep: nextStepIndex,
                        totalSteps: loopEmailSteps.length,
                        firstSentAt: progress.firstSentAt || null,
                        lastCompletedAt: progress.lastCompletedAt || null,
                        nextDueAt: retryScheduledAt,
                        retryCount: Math.max(1, Number.parseInt(sendOutcome?.retryAttemptCount, 10) || 1),
                      });
                      registerNextContinuousWakeAt(Date.parse(retryScheduledAt));
                    }
                  } else if (sendOutcome?.stopRemainingStepsForRecipient) {
                    const completedAtIso = toHoChiMinhIso();
                    await upsertRecipientProgress({
                      nodeId: node.id,
                      channel: 'email',
                      recipientKey: customerKey,
                      completedStep: loopEmailSteps.length,
                      totalSteps: loopEmailSteps.length,
                      firstSentAt: progress.firstSentAt || completedAtIso,
                      lastCompletedAt: completedAtIso,
                      nextDueAt: null,
                      retryCount: 0,
                    });
                  }
                } catch (recipientError) {
                  // Lỗi của 1 khách không được dừng toàn bộ run; chỉ propagate lệnh dừng do user.
                  if (recipientError?.code === 'RUN_STOPPED') throw recipientError;
                  console.error(
                    `[CampaignRun][Email] run=${runId} email=${customerKey} step_error:`,
                    recipientError.message
                  );
                }
              },
            });
            nodeOutputs[String(node.id)] = sendResults;
            lastOutputItems = sendResults;
            await db.query(
              `UPDATE campaign_runs
               SET total_recipients = $1,
                   successful_sends = $2,
                   failed_sends = $3
               WHERE id = $4`,
              [totalRecipients, successfulSends, failedSends, runId]
            );
            continue;
          }

          if (emailSteps.length > 0) {
            totalRecipients += dedupedRecipients.length * emailSteps.length;
            const stoppedRecipientKeys = new Set();
            /**
             * Gửi 1 step email cho toàn bộ người nhận, bảo đảm đúng thứ tự theo step.
             *
             * Luồng hoạt động:
             * 1. Duyệt toàn bộ danh sách khách ở step hiện tại.
             * 2. Bỏ qua khách đã bị chặn các step tiếp theo (unsubscribed/bounce/failed cứng).
             * 3. Gửi lần lượt từng khách, cập nhật cờ dừng nếu cần để không chạy step sau cho khách đó.
             *
             * @param {object} step dữ liệu step email hiện tại
             * @param {number} stepIndex chỉ số step (0-based)
             * @returns {Promise<void>}
             */
            const runEmailTemplateStep = async (step, stepIndex) => {
              for (const customer of dedupedRecipients) {
                const customerKey = String(customer.email || '').trim().toLowerCase() || 'unknown';
                if (stoppedRecipientKeys.has(customerKey)) continue;
                // eslint-disable-next-line no-await-in-loop
                const progress = await getRecipientProgress({
                  nodeId: node.id,
                  channel: 'email',
                  recipientKey: customerKey,
                });
                if (!shouldProcessRecipientStep({
                  progress,
                  stepIndex,
                  totalSteps: emailSteps.length,
                })) {
                  continue;
                }
                const runtimeNode = {
                  ...node,
                  config: {
                    ...config,
                    emailTemplateId: step.templateId || config.emailTemplateId,
                    emailSteps: [step],
                  },
                };
                // eslint-disable-next-line no-await-in-loop
                const sendOutcome = await sendEmailWithLogging({
                  customer,
                  runtimeNode,
                  stepMeta: {
                    templateId: step.templateId || null,
                    stepIndex: stepIndex + 1,
                    sendMode: emailSendMode,
                  },
                  progress,
                  applyRandomDelay: true,
                });
                if (sendOutcome?.stopRemainingStepsForRecipient) {
                  stoppedRecipientKeys.add(customerKey);
                  if (sendOutcome?.preservePendingStep) {
                    const retryScheduledAt = normalizeRetryScheduledAt(sendOutcome.retryScheduledAt);
                    if (retryScheduledAt) {
                      // eslint-disable-next-line no-await-in-loop
                      await upsertRecipientProgress({
                        nodeId: node.id,
                        channel: 'email',
                        recipientKey: customerKey,
                        completedStep: progress?.lastCompletedStep || 0,
                        totalSteps: emailSteps.length,
                        firstSentAt: progress?.firstSentAt || null,
                        lastCompletedAt: progress?.lastCompletedAt || null,
                        nextDueAt: retryScheduledAt,
                        retryCount: Math.max(1, Number.parseInt(sendOutcome?.retryAttemptCount, 10) || 1),
                      });
                    }
                  } else {
                    // eslint-disable-next-line no-await-in-loop
                    await markRecipientStepCompleted({
                      nodeId: node.id,
                      channel: 'email',
                      recipientKey: customerKey,
                      completedStep: emailSteps.length,
                      totalSteps: emailSteps.length,
                      progress,
                      steps: emailSteps,
                      sendMode: emailSendMode,
                    });
                  }
                } else if (sendOutcome?.success) {
                  // eslint-disable-next-line no-await-in-loop
                  await markRecipientStepCompleted({
                    nodeId: node.id,
                    channel: 'email',
                    recipientKey: customerKey,
                    completedStep: stepIndex + 1,
                    totalSteps: emailSteps.length,
                    progress,
                    steps: emailSteps,
                    sendMode: emailSendMode,
                  });
                }
              }
            };

            /**
             * Không sleep theo run-level cho non-continuous schedule.
             * Lý do: mốc chờ đã được quản lý bằng `nextDueAt` theo từng recipient trong ledger,
             * nếu sleep toàn run sẽ làm lệch lịch khi recover/retry và gây "quá hạn nhưng chưa gửi".
             */
            for (let stepIndex = 0; stepIndex < emailSteps.length; stepIndex += 1) {
              // eslint-disable-next-line no-await-in-loop
              await runEmailTemplateStep(emailSteps[stepIndex], stepIndex);
            }
          } else {
            totalRecipients += dedupedRecipients.length;
            for (const customer of dedupedRecipients) {
              const customerKey = String(customer?.email || '').trim().toLowerCase();
              if (!customerKey) continue;
              // eslint-disable-next-line no-await-in-loop
              const progress = await getRecipientProgress({
                nodeId: node.id,
                channel: 'email',
                recipientKey: customerKey,
              });
              if (!shouldProcessRecipientStep({
                progress,
                stepIndex: 0,
                totalSteps: 1,
              })) {
                continue;
              }
              // eslint-disable-next-line no-await-in-loop
              const sendOutcome = await sendEmailWithLogging({
                customer,
                runtimeNode: node,
                stepMeta: null,
                progress,
                applyRandomDelay: true,
              });
              if (sendOutcome?.success) {
                // eslint-disable-next-line no-await-in-loop
                await markRecipientStepCompleted({
                  nodeId: node.id,
                  channel: 'email',
                  recipientKey: customerKey,
                  completedStep: 1,
                  totalSteps: 1,
                  progress,
                  steps: [{ templateId: config.emailTemplateId || null }],
                  sendMode: 'all',
                });
              } else if (sendOutcome?.stopRemainingStepsForRecipient) {
                if (sendOutcome?.preservePendingStep) {
                  const retryScheduledAt = normalizeRetryScheduledAt(sendOutcome.retryScheduledAt);
                  if (retryScheduledAt) {
                    // eslint-disable-next-line no-await-in-loop
                    await upsertRecipientProgress({
                      nodeId: node.id,
                      channel: 'email',
                      recipientKey: customerKey,
                      completedStep: progress?.lastCompletedStep || 0,
                      totalSteps: 1,
                      firstSentAt: progress?.firstSentAt || null,
                      lastCompletedAt: progress?.lastCompletedAt || null,
                      nextDueAt: retryScheduledAt,
                      retryCount: Math.max(1, Number.parseInt(sendOutcome?.retryAttemptCount, 10) || 1),
                    });
                  }
                } else {
                  // eslint-disable-next-line no-await-in-loop
                  await markRecipientStepCompleted({
                    nodeId: node.id,
                    channel: 'email',
                    recipientKey: customerKey,
                    completedStep: 1,
                    totalSteps: 1,
                    progress,
                    steps: [{ templateId: config.emailTemplateId || null }],
                    sendMode: 'all',
                  });
                }
              }
            }
          }

          nodeOutputs[String(node.id)] = sendResults;
          lastOutputItems = sendResults;

          if (dedupedRecipients.length === 0) {
            await campaignExecutionLogService.logExecutionNode({
              campaignId,
              runId,
              node,
              status: 'warning',
              executionData: {
                message: 'Không có người nhận hợp lệ để gửi email',
                items: [],
                schema: [],
                meta: { totalItems: 0 },
              },
            });
          }

          await db.query(
            `UPDATE campaign_runs
             SET total_recipients = $1,
                 successful_sends = $2,
                 failed_sends = $3
             WHERE id = $4`,
            [totalRecipients, successfulSends, failedSends, runId]
          );
          continue;
        }

        if (nodeSubtype === 'get_all_friends') {
          const config = campaignFlowService.normalizeNodeReferenceConfig(node.config || {}, resolveNodeId);
          const accountSourceNodeId = String(config.zaloFriendAccountNodeId || '').trim();
          const sourceNodeItems = accountSourceNodeId ? pickNodeItems(accountSourceNodeId) : [];
          const sourceNodeAccount = sourceNodeItems[0] || null;
          const accountFromSourceNode = sourceNodeAccount?.id
            ? await campaignZaloSenderService.getCampaignZaloAccount({
              userId,
              accountId: sourceNodeAccount.id,
              roleCode,
            })
            : null;
          const account = accountFromSourceNode
            || selectedZaloAccount
            || await campaignZaloSenderService.getCampaignZaloAccount({
              userId,
              accountId: config.zaloAccountId,
              roleCode,
            });
          selectedZaloAccount = account;
          const api = await campaignZaloSenderService.getConnectedApiOrSyncStatus({
            accountId: account.id,
            userId: account.userId || userId,
          });
          const count = Number.isFinite(parseInt(config.zaloFriendsCount, 10))
            ? parseInt(config.zaloFriendsCount, 10)
            : undefined;
          const page = Number.isFinite(parseInt(config.zaloFriendsPage, 10))
            ? parseInt(config.zaloFriendsPage, 10)
            : undefined;
          await waitRandomApiDelay('zalo_get_all_friends');
          const friendItems = await campaignZaloSenderService.getAllFriendsWithRetry(api, count, page);
          const allItems = await campaignZaloSenderService.normalizeFriendsWithProfileLookup(api, friendItems);
          const selectedFriendIds = (Array.isArray(config.zaloSelectedFriendIds) ? config.zaloSelectedFriendIds : [])
            .map((value) => String(value || '').trim())
            .filter((value, idx, arr) => value && arr.indexOf(value) === idx);
          const excludedFriendIds = (Array.isArray(config.zaloExcludedFriendIds) ? config.zaloExcludedFriendIds : [])
            .map((value) => String(value || '').trim())
            .filter((value, idx, arr) => value && arr.indexOf(value) === idx);
          const selectionMode = resolveSelectionMode(config.zaloFriendSelectionMode, selectedFriendIds);
          const selectedSet = new Set(selectedFriendIds);
          const excludedSet = new Set(excludedFriendIds);
          const extractFriendId = (item) => String(
            item?.uid
            || item?.id
            || item?.userId
            || ''
          ).trim();
          let items = allItems;
          if (selectionMode === 'fixed' && selectedSet.size > 0) {
            items = allItems.filter((item) => selectedSet.has(extractFriendId(item)));
          } else if (selectionMode === 'all_exclude' && excludedSet.size > 0) {
            items = allItems.filter((item) => !excludedSet.has(extractFriendId(item)));
          }
          const mergedFriendData = isContinuousMode
            ? mergeContinuousNodeItems({
                nodeId: node.id,
                nodeSubtype,
                fetchedItems: items,
              })
            : {
                allItems: items,
                newItems: items,
              };
          const outputFriendItems = isContinuousMode ? mergedFriendData.newItems : mergedFriendData.allItems;
          nodeOutputs[String(node.id)] = mergedFriendData.allItems;
          lastOutputItems = mergedFriendData.allItems;

          await campaignExecutionLogService.logExecutionNode({
            campaignId,
            runId,
            node,
            status: 'success',
            executionData: {
              message: isContinuousMode
                ? `Lấy danh sách bạn bè Zalo thành công (${outputFriendItems.length}/${mergedFriendData.allItems.length})`
                : `Lấy danh sách bạn bè Zalo thành công (${outputFriendItems.length})`,
              items: outputFriendItems.slice(0, 100),
              schema: campaignFlowService.buildSchemaFromRows(outputFriendItems),
              meta: {
                totalItems: mergedFriendData.allItems.length,
                filtered: (selectionMode === 'fixed' && selectedSet.size > 0)
                  || (selectionMode === 'all_exclude' && excludedSet.size > 0),
                selectionMode,
                accountSourceNodeId: accountSourceNodeId || null,
                ...(isContinuousMode
                  ? {
                      newItems: outputFriendItems.length,
                      accumulatedItems: mergedFriendData.allItems.length,
                      continuousMode: true,
                    }
                  : {}),
              },
            },
          });
          continue;
        }

        if (nodeSubtype === 'get_all_groups') {
          const config = campaignFlowService.normalizeNodeReferenceConfig(node.config || {}, resolveNodeId);
          const accountSourceNodeId = String(config.zaloGroupAccountNodeId || '').trim();
          const sourceNodeItems = accountSourceNodeId ? pickNodeItems(accountSourceNodeId) : [];
          const sourceNodeAccount = sourceNodeItems[0] || null;
          const accountFromSourceNode = sourceNodeAccount?.id
            ? await campaignZaloSenderService.getCampaignZaloAccount({
              userId,
              accountId: sourceNodeAccount.id,
              roleCode,
            })
            : null;
          const account = accountFromSourceNode
            || selectedZaloAccount
            || await campaignZaloSenderService.getCampaignZaloAccount({
              userId,
              accountId: config.zaloAccountId,
              roleCode,
            });
          selectedZaloAccount = account;
          const api = await campaignZaloSenderService.getConnectedApiOrSyncStatus({
            accountId: account.id,
            userId: account.userId || userId,
          });
          await waitRandomApiDelay('zalo_get_all_groups');
          const groupResp = await campaignZaloSenderService.getAllGroupsWithRetry(api);
          const baseItems = campaignZaloSenderService.extractGroupsFromResponse(groupResp);
          const allItems = await campaignZaloSenderService.enrichGroupNames(api, baseItems);
          const selectedGroupIds = (Array.isArray(config.zaloSelectedGroupIds) ? config.zaloSelectedGroupIds : [])
            .map((value) => String(value || '').trim())
            .filter((value, idx, arr) => value && arr.indexOf(value) === idx);
          const selectedSet = new Set(selectedGroupIds);
          const items = selectedSet.size > 0
            ? allItems.filter((item) => selectedSet.has(String(item.groupId || '').trim()))
            : allItems;
          nodeOutputs[String(node.id)] = items;
          lastOutputItems = items;

          await campaignExecutionLogService.logExecutionNode({
            campaignId,
            runId,
            node,
            status: 'success',
            executionData: {
              message: `Lấy thông tin nhóm Zalo thành công (${items.length})`,
              items: items.slice(0, 100),
              schema: campaignFlowService.buildSchemaFromRows(items),
              meta: {
                totalItems: items.length,
                filtered: selectedSet.size > 0,
                accountSourceNodeId: accountSourceNodeId || null,
                version: String(groupResp?.version || ''),
              },
            },
          });
          continue;
        }

        if (nodeSubtype === 'send_zalo_personal') {
          const config = campaignFlowService.normalizeNodeReferenceConfig(node.config || {}, resolveNodeId);
          const account = selectedZaloAccount
            || await campaignZaloSenderService.getCampaignZaloAccount({
              userId,
              accountId: config.zaloAccountId,
              roleCode,
            });
          selectedZaloAccount = account;
          const api = await campaignZaloSenderService.getConnectedApiOrSyncStatus({
            accountId: account.id,
            userId: account.userId || userId,
          });

          const recipientType = String(config.zaloRecipientType || 'phone').trim().toLowerCase() === 'uid'
            ? 'uid'
            : 'phone';
          const recipientSource = config.zaloRecipientSource || config.recipientSource || 'manual';
          const manualPhones = config.zaloRecipientPhones || config.recipientPhones || '';
          const sourceNodeId = config.zaloRecipientNodeId || config.recipientNodeId || '';
          const sourceField = config.zaloRecipientField
            || config.recipientField
            || (recipientType === 'uid' ? 'uid' : 'phone');
          const resolveZaloRecipients = () => {
            const recipientEntries = collectEntriesFromSource({
              sourceMode: recipientSource,
              manualValue: manualPhones,
              sourceNodeId,
              sourceField,
            });
            const rawRecipients = recipientEntries.map((entry) => entry.value);
            const dedupedRecipients = Array.from(
              new Set(rawRecipients.map((item) => String(item || '').trim()).filter(Boolean))
            );
            const recipientEntryMap = new Map(
              recipientEntries.map((entry) => [String(entry?.value || '').trim(), entry])
            );
            return { dedupedRecipients, recipientEntryMap };
          };
          let { dedupedRecipients, recipientEntryMap } = resolveZaloRecipients();
          const templateSteps = Array.isArray(config.zaloPersonalTemplateSteps)
            ? config.zaloPersonalTemplateSteps
            : [];
          const sendResults = [];
          /**
           * Chuẩn hóa payload execution cho node gửi Zalo cá nhân để UI log luôn tích lũy đúng.
           *
           * @param {object} payload kết quả gửi hiện tại
           * @returns {{message: string, items: Array<object>, schema: Array<object>, meta: object}}
           */
          const buildSendZaloPersonalExecutionData = (payload = {}) => {
            const item = { ...payload };
            const attempted = successfulSends + failedSends;
            return {
              message: String(payload?.messageText || payload?.message || ''),
              items: [item],
              schema: campaignFlowService.buildSchemaFromRows([item]),
              meta: {
                attempted,
                sent: successfulSends,
                failed: failedSends,
                totalItems: sendResults.length,
              },
            };
          };

          const sendSingleRecipient = async ({
            recipient,
            message,
            attachments = [],
            stepMeta = null,
            variables = {},
            entryRow = null,
            applyRandomDelay = true,
          }) => {
            let zaloMessageId = null;
            let customerId = extractCustomerIdFromRow(entryRow);
            // Extract Zalo UID from entry row (available when source is a Zalo friends node)
            const entryZaloUid = extractZaloUidFromRow(entryRow);
            const trackingToken = campaignZaloSenderService.createTrackingToken();
            try {
              customerId = await ensureCustomerForZaloPersonalRecipient({
                userId,
                recipientType,
                recipient,
                entryRow,
                customerId,
                entryUid: entryZaloUid,
              });
              zaloMessageId = await createZaloMessageTrackingRecord({
                nodeId: node.id,
                channel: 'zalo_personal',
                recipientType,
                recipientValue: recipient,
                accountId: account.id,
                accountName: account.displayName,
                messageText: message,
                customerId,
                trackingToken,
              });
              const trackedMessage = campaignZaloSenderService.buildTrackedMessageText({
                message,
                trackingBaseUrl,
                trackingToken,
                utmSource: UTM_SOURCE_BY_ZALO_CHANNEL.personal,
                campaignId,
                runId,
                customerId,
                zaloMessageId,
                zaloUid: entryZaloUid || null,
              });
              if (applyRandomDelay) {
                await waitRandomApiDelay('zalo_send_personal');
              }
              const sendResult = await campaignZaloSenderService.sendPersonalMessageQueued({
                userId,
                accountId: account.id,
                recipient,
                recipientType,
                message: trackedMessage,
                attachments,
              });
              successfulSends += 1;
              const progressMessage = `Đã gửi ${successfulSends + failedSends}/${totalRecipients}`;
              // UID resolved by Zalo API (always available after successful send)
              const resolvedUid = String(sendResult.uid || entryZaloUid || '').trim();
              const sentAt = toHoChiMinhIso();
              const senderName = resolveZaloSenderName(account);
              const zaloName = resolveZaloRecipientName({
                entryRow,
                sendResult,
                fallbackRecipient: recipient,
              });
              const resultPayload = {
                channel: 'zalo_personal',
                accountId: account.id,
                accountName: account.displayName,
                senderName,
                zaloName,
                groupName: null,
                recipientType,
                recipient,
                customerId,
                zaloMessageId,
                phone: sendResult.phone || null,
                message: trackedMessage,
                status: 'success',
                uid: resolvedUid || null,
                response: sendResult.response || null,
                messageText: progressMessage,
                sentAt,
                templateId: stepMeta?.templateId || null,
                stepIndex: stepMeta?.stepIndex || null,
                attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
                trackingToken,
                variables,
              };
              await updateZaloMessageTrackingMeta(zaloMessageId, {
                status: 'sent',
                uid: resolvedUid || null,
                response: sendResult.response || null,
              });
              // Upsert customer zalo_id using resolved UID
              if (resolvedUid) {
                const phone = String(sendResult.phone || (recipientType === 'phone' ? recipient : '') || '').trim();
                await upsertCustomerZaloUid({ userId, uid: resolvedUid, phone, customerId });
              }
              await logZaloSentJourneyEvent({
                customerId,
                nodeId: node.id,
                zaloMessageId,
                messageText: trackedMessage,
                channel: 'zalo',
                trackingToken,
              });
              sendResults.push(resultPayload);
              await campaignExecutionLogService.logExecutionNode({
                campaignId,
                runId,
                node,
                status: 'success',
                progressCurrent: successfulSends + failedSends,
                progressTotal: totalRecipients,
                executionData: buildSendZaloPersonalExecutionData(resultPayload),
              });
              return { success: true };
            } catch (error) {
              failedSends += 1;
              const progressMessage = `Đã gửi ${successfulSends + failedSends}/${totalRecipients}`;
              const sentAt = toHoChiMinhIso();
              const senderName = resolveZaloSenderName(account);
              const zaloName = resolveZaloRecipientName({
                entryRow,
                sendResult: null,
                fallbackRecipient: recipient,
              });
              const failedPayload = {
                channel: 'zalo_personal',
                accountId: account.id,
                accountName: account.displayName,
                senderName,
                zaloName,
                groupName: null,
                recipientType,
                recipient,
                customerId,
                zaloMessageId,
                message,
                status: 'failed',
                error: error.message,
                messageText: progressMessage,
                sentAt,
                templateId: stepMeta?.templateId || null,
                stepIndex: stepMeta?.stepIndex || null,
                attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
                trackingToken,
                variables,
              };
              await updateZaloMessageTrackingMeta(zaloMessageId, {
                status: 'failed',
                error: error.message,
              });
              sendResults.push(failedPayload);
              await campaignExecutionLogService.logExecutionNode({
                campaignId,
                runId,
                node,
                status: 'failed',
                progressCurrent: successfulSends + failedSends,
                progressTotal: totalRecipients,
                errorMessage: error.message,
                executionData: buildSendZaloPersonalExecutionData(failedPayload),
              });
              return { success: false };
            }
          };

          if (isContinuousMode) {
            const sendMode = String(config.zaloPersonalSendMode || 'all').trim();
            const stepsWithMessage = [];
            if (templateSteps.length > 0) {
              for (const step of templateSteps) {
                // eslint-disable-next-line no-await-in-loop
                const stepTemplate = await getZaloTemplateContent(step.templateId);
                // eslint-disable-next-line no-await-in-loop
                const stepAttachments = await prepareZaloTemplateAttachmentsSafely({
                  templateAttachments: stepTemplate.attachments,
                  templateId: step.templateId,
                });
                stepsWithMessage.push({
                  ...step,
                  message: stepTemplate.message,
                  attachments: stepAttachments,
                });
              }
            }
            await refreshUpstreamDataNodesBefore(node.id);
            if (recipientSource === 'node' && String(sourceNodeId || '').trim()) {
              await refreshSourceNodeOutput(String(sourceNodeId || '').trim());
            }
            const resolvedRecipients = resolveZaloRecipients();
            dedupedRecipients = resolvedRecipients.dedupedRecipients;
            recipientEntryMap = resolvedRecipients.recipientEntryMap;
            if (dedupedRecipients.length === 0) {
              await campaignExecutionLogService.logExecutionNode({
                campaignId,
                runId,
                node,
                status: 'warning',
                executionData: {
                  message: recipientType === 'uid'
                    ? 'Chưa có UID mới hợp lệ trong chế độ chạy liên tục'
                    : 'Chưa có số điện thoại mới hợp lệ trong chế độ chạy liên tục',
                  items: [],
                  schema: [],
                  meta: { totalItems: 0, continuousMode: true },
                },
              });
            }
            await runTasksWithConcurrency({
              items: dedupedRecipients,
              concurrency: this.CONTINUOUS_ZALO_PERSONAL_BATCH_SIZE,
              handler: async (recipient) => {
                const normalizedRecipient = String(recipient || '').trim();
                if (!normalizedRecipient) return;
                try {
                  const progress = await getRecipientProgress({
                    nodeId: node.id,
                    channel: 'zalo_personal',
                    recipientKey: normalizedRecipient,
                  });
                  const nextStepIndex = Math.max(0, progress.lastCompletedStep || 0);
                  const entry = recipientEntryMap.get(normalizedRecipient) || null;
                  if (templateSteps.length > 0) {
                    if (progress.isFullyCompleted || nextStepIndex >= stepsWithMessage.length) return;
                    const dueStatus = resolveNextDueAtStatus(progress.nextDueAt);
                    if (!dueStatus.isDueNow) {
                      registerNextContinuousWakeAt(dueStatus.nextDueAtMs);
                      return;
                    }
                    const step = stepsWithMessage[nextStepIndex];
                    const mappings = Array.isArray(step?.templateMappings) ? step.templateMappings : [];
                    const variables = resolveTemplateVariablesFromMappings({
                      mappings,
                      entry,
                      fallbackNodeId: sourceNodeId,
                    });
                    const renderedMessage = mappings.length
                      ? renderTemplateText(step.message, variables).trim()
                      : String(step.message || '').trim();
                    if (!renderedMessage) return;
                    totalRecipients += 1;
                    const sendOutcome = await sendSingleRecipient({
                      recipient: normalizedRecipient,
                      message: renderedMessage,
                      attachments: step.attachments,
                      stepMeta: {
                        templateId: step.templateId,
                        stepIndex: nextStepIndex + 1,
                      },
                      variables,
                      entryRow: entry?.row || null,
                      applyRandomDelay: shouldApplyRandomDelayInContinuous(),
                    });
                    if (sendOutcome?.success) {
                      const completedAtIso = toHoChiMinhIso();
                      const firstSentAt = progress.firstSentAt || completedAtIso;
                      const nextDueAt = computeStepDueAt({
                        steps: stepsWithMessage,
                        completedStep: nextStepIndex + 1,
                        firstSentAt,
                        lastCompletedAt: completedAtIso,
                        sendMode,
                      });
                      await upsertRecipientProgress({
                        nodeId: node.id,
                        channel: 'zalo_personal',
                        recipientKey: normalizedRecipient,
                        completedStep: nextStepIndex + 1,
                        totalSteps: stepsWithMessage.length,
                        firstSentAt,
                        lastCompletedAt: completedAtIso,
                        nextDueAt,
                      });
                      registerNextContinuousWakeAt(nextDueAt ? Date.parse(nextDueAt) : null);
                    }
                    return;
                  }
                  if (progress.isFullyCompleted || nextStepIndex >= 1) return;
                  const dueStatus = resolveNextDueAtStatus(progress.nextDueAt);
                  if (!dueStatus.isDueNow) {
                    registerNextContinuousWakeAt(dueStatus.nextDueAtMs);
                    return;
                  }
                  const message = String(config.zaloMessage || config.message || '').trim();
                  if (!message) return;
                  totalRecipients += 1;
                  const sendOutcome = await sendSingleRecipient({
                    recipient: normalizedRecipient,
                    message,
                    entryRow: entry?.row || null,
                    applyRandomDelay: shouldApplyRandomDelayInContinuous(),
                  });
                  if (sendOutcome?.success) {
                    const completedAtIso = toHoChiMinhIso();
                    await upsertRecipientProgress({
                      nodeId: node.id,
                      channel: 'zalo_personal',
                      recipientKey: normalizedRecipient,
                      completedStep: 1,
                      totalSteps: 1,
                      firstSentAt: progress.firstSentAt || completedAtIso,
                      lastCompletedAt: completedAtIso,
                      nextDueAt: null,
                    });
                  }
                } catch (recipientError) {
                  // Lỗi của 1 khách không được dừng toàn bộ run; chỉ propagate lệnh dừng do user.
                  if (recipientError?.code === 'RUN_STOPPED') throw recipientError;
                  console.error(
                    `[CampaignRun][Zalo] run=${runId} recipient=${normalizedRecipient} step_error:`,
                    recipientError.message
                  );
                }
              },
            });
            nodeOutputs[String(node.id)] = sendResults;
            lastOutputItems = sendResults;
            await db.query(
              `UPDATE campaign_runs
               SET total_recipients = $1,
                   successful_sends = $2,
                   failed_sends = $3
               WHERE id = $4`,
              [totalRecipients, successfulSends, failedSends, runId]
            );
            continue;
          }

          if (templateSteps.length > 0) {
            const sendMode = String(config.zaloPersonalSendMode || 'all').trim();
            const stepsWithMessage = [];
            for (const step of templateSteps) {
              // eslint-disable-next-line no-await-in-loop
              const stepTemplate = await getZaloTemplateContent(step.templateId);
              // eslint-disable-next-line no-await-in-loop
              const stepAttachments = await prepareZaloTemplateAttachmentsSafely({
                templateAttachments: stepTemplate.attachments,
                templateId: step.templateId,
              });
              stepsWithMessage.push({
                ...step,
                message: stepTemplate.message,
                attachments: stepAttachments,
              });
            }
            totalRecipients += dedupedRecipients.length * stepsWithMessage.length;

            // Tắt nhánh sleep theo run-level cho schedule mode ở non-continuous để tránh dời lịch nextDueAt.
            if (false && sendMode === 'schedule') {
              // Chạy theo từng step cho toàn bộ người nhận để giữ đúng thứ tự:
              // step 1 gửi cho tất cả -> đợi lịch -> step 2 gửi cho tất cả.
              const scheduleStartAt = Date.now();
              let previousStepTargetAt = scheduleStartAt;
              for (let stepIndex = 0; stepIndex < stepsWithMessage.length; stepIndex += 1) {
                const step = stepsWithMessage[stepIndex];
                // eslint-disable-next-line no-await-in-loop
                previousStepTargetAt = await waitForScheduledStep({
                  scheduleStartAt,
                  previousStepTargetAt,
                  step,
                  channel: 'zalo_personal',
                  recipientKey: 'all_recipients',
                  stepIndex: stepIndex + 1,
                });
                // eslint-disable-next-line no-restricted-syntax
                for (const recipient of dedupedRecipients) {
                  const normalizedRecipient = String(recipient || '').trim();
                  if (!normalizedRecipient) continue;
                  // eslint-disable-next-line no-await-in-loop
                  const progress = await getRecipientProgress({
                    nodeId: node.id,
                    channel: 'zalo_personal',
                    recipientKey: normalizedRecipient,
                  });
                  if (!shouldProcessRecipientStep({
                    progress,
                    stepIndex,
                    totalSteps: stepsWithMessage.length,
                  })) {
                    continue;
                  }
                  const entry = recipientEntryMap.get(normalizedRecipient) || null;
                  const mappings = Array.isArray(step?.templateMappings) ? step.templateMappings : [];
                  const variables = resolveTemplateVariablesFromMappings({
                    mappings,
                    entry,
                    fallbackNodeId: sourceNodeId,
                  });
                  const renderedMessage = mappings.length
                    ? renderTemplateText(step.message, variables).trim()
                    : String(step.message || '').trim();
                  if (!renderedMessage) {
                    throw new Error(`Thiếu nội dung tin nhắn cho người nhận ${recipient}`);
                  }
                  // eslint-disable-next-line no-await-in-loop
                  const sendOutcome = await sendSingleRecipient({
                    recipient: normalizedRecipient,
                    message: renderedMessage,
                    attachments: step.attachments,
                    stepMeta: {
                      templateId: step.templateId,
                      stepIndex: stepIndex + 1,
                    },
                    variables,
                    entryRow: entry?.row || null,
                    applyRandomDelay: true,
                  });
                  if (sendOutcome?.success) {
                    // eslint-disable-next-line no-await-in-loop
                    await markRecipientStepCompleted({
                      nodeId: node.id,
                      channel: 'zalo_personal',
                      recipientKey: normalizedRecipient,
                      completedStep: stepIndex + 1,
                      totalSteps: stepsWithMessage.length,
                      progress,
                      steps: stepsWithMessage,
                      sendMode,
                    });
                  }
                }
              }
            } else {
              for (let stepIndex = 0; stepIndex < stepsWithMessage.length; stepIndex += 1) {
                const step = stepsWithMessage[stepIndex];
                // eslint-disable-next-line no-restricted-syntax
                for (const recipient of dedupedRecipients) {
                  const normalizedRecipient = String(recipient || '').trim();
                  if (!normalizedRecipient) continue;
                  // eslint-disable-next-line no-await-in-loop
                  const progress = await getRecipientProgress({
                    nodeId: node.id,
                    channel: 'zalo_personal',
                    recipientKey: normalizedRecipient,
                  });
                  if (!shouldProcessRecipientStep({
                    progress,
                    stepIndex,
                    totalSteps: stepsWithMessage.length,
                  })) {
                    continue;
                  }
                  const entry = recipientEntryMap.get(normalizedRecipient) || null;
                  const mappings = Array.isArray(step?.templateMappings) ? step.templateMappings : [];
                  const variables = resolveTemplateVariablesFromMappings({
                    mappings,
                    entry,
                    fallbackNodeId: sourceNodeId,
                  });
                  const renderedMessage = mappings.length
                    ? renderTemplateText(step.message, variables).trim()
                    : String(step.message || '').trim();
                  if (!renderedMessage) {
                    throw new Error(`Thiếu nội dung tin nhắn cho người nhận ${recipient}`);
                  }
                  // eslint-disable-next-line no-await-in-loop
                  const sendOutcome = await sendSingleRecipient({
                    recipient: normalizedRecipient,
                    message: renderedMessage,
                    attachments: step.attachments,
                    stepMeta: {
                      templateId: step.templateId,
                      stepIndex: stepIndex + 1,
                    },
                    variables,
                    entryRow: entry?.row || null,
                    applyRandomDelay: true,
                  });
                  if (sendOutcome?.success) {
                    // eslint-disable-next-line no-await-in-loop
                    await markRecipientStepCompleted({
                      nodeId: node.id,
                      channel: 'zalo_personal',
                      recipientKey: normalizedRecipient,
                      completedStep: stepIndex + 1,
                      totalSteps: stepsWithMessage.length,
                      progress,
                      steps: stepsWithMessage,
                      sendMode,
                    });
                  }
                }
              }
            }
          } else {
            const message = String(config.zaloMessage || config.message || '').trim();
            if (!message) {
              throw new Error('Thiếu nội dung tin nhắn Zalo');
            }
            totalRecipients += dedupedRecipients.length;
            for (const recipient of dedupedRecipients) {
              const normalizedRecipient = String(recipient || '').trim();
              if (!normalizedRecipient) continue;
              // eslint-disable-next-line no-await-in-loop
              const progress = await getRecipientProgress({
                nodeId: node.id,
                channel: 'zalo_personal',
                recipientKey: normalizedRecipient,
              });
              if (!shouldProcessRecipientStep({
                progress,
                stepIndex: 0,
                totalSteps: 1,
              })) {
                continue;
              }
              const entry = recipientEntryMap.get(normalizedRecipient) || null;
              // eslint-disable-next-line no-await-in-loop
              const sendOutcome = await sendSingleRecipient({
                recipient: normalizedRecipient,
                message,
                entryRow: entry?.row || null,
                applyRandomDelay: true,
              });
              if (sendOutcome?.success) {
                // eslint-disable-next-line no-await-in-loop
                await markRecipientStepCompleted({
                  nodeId: node.id,
                  channel: 'zalo_personal',
                  recipientKey: normalizedRecipient,
                  completedStep: 1,
                  totalSteps: 1,
                  progress,
                  steps: [{ message }],
                  sendMode: 'all',
                });
              }
            }
          }

          nodeOutputs[String(node.id)] = sendResults;
          lastOutputItems = sendResults;

          if (dedupedRecipients.length === 0) {
            await campaignExecutionLogService.logExecutionNode({
              campaignId,
              runId,
              node,
              status: 'warning',
              executionData: {
                message: recipientType === 'uid'
                  ? 'Không có UID hợp lệ để gửi tin Zalo'
                  : 'Không có số điện thoại hợp lệ để gửi tin Zalo',
                items: [],
                schema: [],
                meta: { totalItems: 0 },
              },
            });
          }

          await db.query(
            `UPDATE campaign_runs
             SET total_recipients = $1,
                 successful_sends = $2,
                 failed_sends = $3
             WHERE id = $4`,
            [totalRecipients, successfulSends, failedSends, runId]
          );
          continue;
        }

        if (nodeSubtype === 'send_zalo_friend_request') {
          const config = campaignFlowService.normalizeNodeReferenceConfig(node.config || {}, resolveNodeId);
          const account = selectedZaloAccount
            || await campaignZaloSenderService.getCampaignZaloAccount({
              userId,
              accountId: config.zaloAccountId,
              roleCode,
            });
          selectedZaloAccount = account;
          const api = await campaignZaloSenderService.getConnectedApiOrSyncStatus({
            accountId: account.id,
            userId: account.userId || userId,
          });
          const recipientSource = config.zaloFriendSource || 'manual';
          const manualPhones = config.zaloFriendPhones || '';
          const sourceNodeId = config.zaloFriendNodeId || '';
          const sourceField = config.zaloFriendField || 'phone';
          const phoneEntries = collectEntriesFromSource({
            sourceMode: recipientSource,
            manualValue: manualPhones,
            sourceNodeId,
            sourceField,
          });
          const dedupePhoneEntries = (entries = []) => {
            const dedupedPhones = Array.from(
              new Set(
                (Array.isArray(entries) ? entries : [])
                  .map((item) => String(item?.value || '').trim())
                  .filter(Boolean)
              )
            );
            const entryMap = new Map(
              (Array.isArray(entries) ? entries : [])
                .map((item) => [String(item?.value || '').trim(), item])
                .filter((item) => item[0])
            );
            return dedupedPhones.map((phone) => entryMap.get(phone) || { value: phone, row: null });
          };
          let effectivePhoneEntries = Array.isArray(phoneEntries) ? phoneEntries : [];
          if (isContinuousMode) {
            await refreshUpstreamDataNodesBefore(node.id);
            if (recipientSource === 'node' && String(sourceNodeId || '').trim()) {
              await refreshSourceNodeOutput(String(sourceNodeId || '').trim());
            }
            const refreshedPhoneEntries = collectEntriesFromSource({
              sourceMode: recipientSource,
              manualValue: manualPhones,
              sourceNodeId,
              sourceField,
            });
            effectivePhoneEntries = dedupePhoneEntries(refreshedPhoneEntries);
          }
          const contentMode = String(config.zaloFriendContentMode || 'manual').trim();
          let templateBody = String(config.zaloFriendTemplateBody || '').trim();
          if (contentMode === 'template' && !templateBody) {
            const templateId = parseInt(config.zaloFriendTemplateId, 10);
            if (!Number.isFinite(templateId)) {
              throw new Error('Chưa chọn template lời mời kết bạn');
            }
            const templateContent = await getZaloTemplateContent(templateId);
            templateBody = String(templateContent.message || '').trim();
            if (!templateBody) {
              throw new Error('Template Zalo không có nội dung để gửi lời mời kết bạn');
            }
          }

          const sendResults = [];
          /**
           * Chuẩn hóa payload execution cho node gửi lời mời kết bạn để UI log tích lũy đúng theo từng item.
           *
           * @param {object} payload kết quả xử lý hiện tại
           * @returns {{message: string, items: Array<object>, schema: Array<object>, meta: object}}
           */
          const buildSendZaloFriendExecutionData = (payload = {}) => {
            const item = { ...payload };
            const attempted = successfulSends + failedSends;
            return {
              message: String(payload?.messageText || payload?.message || ''),
              items: [item],
              schema: campaignFlowService.buildSchemaFromRows([item]),
              meta: {
                attempted,
                sent: successfulSends,
                failed: failedSends,
                totalItems: sendResults.length,
              },
            };
          };

          for (const entry of effectivePhoneEntries) {
            const phone = String(entry.value || '').trim();
            if (!phone) continue;
            let progress = null;
            if (isContinuousMode) {
              // Chế độ continuous: mỗi số chỉ được gửi lời mời thành công đúng 1 lần trong cùng run.
              // eslint-disable-next-line no-await-in-loop
              progress = await getRecipientProgress({
                nodeId: node.id,
                channel: 'zalo_friend_request',
                recipientKey: phone,
              });
              const nextStepIndex = Math.max(0, progress.lastCompletedStep || 0);
              if (progress.isFullyCompleted || nextStepIndex >= 1) continue;
              const dueStatus = resolveNextDueAtStatus(progress.nextDueAt);
              if (!dueStatus.isDueNow) {
                registerNextContinuousWakeAt(dueStatus.nextDueAtMs);
                continue;
              }
              totalRecipients += 1;
            }
            let message = String(config.zaloFriendRequestMessage || '').trim();
            if (contentMode === 'template') {
              const mappings = Array.isArray(config.zaloFriendTemplateMappings)
                ? config.zaloFriendTemplateMappings
                : [];
              const variables = {};
              mappings.forEach((mapping) => {
                const key = String(mapping?.key || '').trim();
                if (!key) return;
                const sourceType = mapping?.sourceType === 'recipient_field'
                  ? 'node'
                  : String(mapping?.sourceType || 'manual').trim();
                if (sourceType === 'node') {
                  const field = String(mapping?.field || '').trim();
                  if (!field) {
                    variables[key] = '';
                    return;
                  }
                  const mappingNodeId = String(mapping?.nodeId || sourceNodeId || '').trim();
                  if (!mappingNodeId) {
                    variables[key] = entry?.row?.[field] ?? '';
                    return;
                  }
                  const mappingItems = pickNodeItems(mappingNodeId);
                  const firstRow = mappingItems[0] || null;
                  const useRecipientRow = mappingNodeId === String(sourceNodeId || '').trim();
                  const selectedRow = useRecipientRow ? (entry?.row || firstRow) : firstRow;
                  variables[key] = selectedRow?.[field] ?? '';
                  return;
                }
                variables[key] = mapping?.value ?? '';
              });
              message = renderTemplateText(templateBody, variables).trim();
            }
            if (!message) {
              throw new Error(`Thiếu lời nhắn mời kết bạn cho số ${phone}`);
            }
            if (!isContinuousMode) {
              totalRecipients += 1;
            }
            let customerId = extractCustomerIdFromRow(entry?.row || null);
            if (!Number.isFinite(Number.parseInt(customerId, 10))) {
              // Tạo/đồng bộ customer theo phone để có dữ liệu hành trình giống luồng email.
              // eslint-disable-next-line no-await-in-loop
              const customerSync = await upsertZaloFriendCustomerByPhone({
                phone,
                uid: '',
                entryRow: entry?.row || null,
              });
              customerId = customerSync.customerId;
            }
            let zaloMessageId = null;
            const trackingToken = campaignZaloSenderService.createTrackingToken();
            // eslint-disable-next-line no-await-in-loop
            zaloMessageId = await createZaloMessageTrackingRecord({
              nodeId: node.id,
              channel: 'zalo_friend_request',
              recipientType: 'phone',
              recipientValue: phone,
              uid: null,
              groupId: null,
              accountId: account.id,
              accountName: account.displayName,
              messageText: message,
              customerId: Number.parseInt(customerId, 10) || null,
              trackingToken,
              trackingMetadata: {
                contentMode,
                status: 'queued',
              },
            });
            try {
              if (!isContinuousMode || shouldApplyRandomDelayInContinuous()) {
                await waitRandomApiDelay('zalo_send_friend_request');
              }
              const sendResult = await campaignZaloSenderService.sendFriendRequestQueued({
                userId,
                accountId: account.id,
                phone,
                message,
              });
              successfulSends += 1;
              const progressMessage = `Đã xử lý ${successfulSends + failedSends}/${totalRecipients}`;
              const resultPayload = {
                channel: 'zalo_friend_request',
                accountId: account.id,
                accountName: account.displayName,
                phone,
                requestMessage: message,
                status: 'success',
                contentMode,
                customerId: Number.parseInt(customerId, 10) || null,
                zaloMessageId,
                trackingToken,
                uid: sendResult.uid || null,
                response: sendResult.response || null,
                messageText: progressMessage,
              };
              await updateZaloMessageTrackingMeta(zaloMessageId, {
                status: 'sent',
                uid: sendResult.uid || null,
                response: sendResult.response || null,
              });
              await logZaloSentJourneyEvent({
                customerId: Number.parseInt(customerId, 10) || null,
                nodeId: node.id,
                zaloMessageId,
                messageText: message,
                channel: 'zalo',
                trackingToken,
              });
              sendResults.push(resultPayload);
              await campaignExecutionLogService.logExecutionNode({
                campaignId,
                runId,
                node,
                status: 'success',
                progressCurrent: successfulSends + failedSends,
                progressTotal: totalRecipients,
                executionData: buildSendZaloFriendExecutionData(resultPayload),
              });
              if (isContinuousMode) {
                const completedAtIso = toHoChiMinhIso();
                // eslint-disable-next-line no-await-in-loop
                await upsertRecipientProgress({
                  nodeId: node.id,
                  channel: 'zalo_friend_request',
                  recipientKey: phone,
                  completedStep: 1,
                  totalSteps: 1,
                  firstSentAt: progress?.firstSentAt || completedAtIso,
                  lastCompletedAt: completedAtIso,
                  nextDueAt: null,
                });
              }
            } catch (error) {
              if (isAlreadyZaloFriendError(error)) {
                try {
                  const customerSync = await upsertZaloFriendCustomerByPhone({
                    phone,
                    uid: '',
                    entryRow: entry?.row || null,
                  });
                  successfulSends += 1;
                  const progressMessage = `Đã xử lý ${successfulSends + failedSends}/${totalRecipients}`;
                  const alreadyFriendPayload = {
                    channel: 'zalo_friend_request',
                    accountId: account.id,
                    accountName: account.displayName,
                    phone,
                    requestMessage: message,
                    status: 'success',
                    contentMode,
                    friendRequestStatus: 'already_friend',
                    responseMessage: String(error?.message || '').trim() || 'Người nhận đã là bạn bè Zalo',
                    customerId: customerSync.customerId || Number.parseInt(customerId, 10) || null,
                    zaloMessageId,
                    trackingToken,
                    customerSyncAction: customerSync.action,
                    messageText: progressMessage,
                  };
                  await updateZaloMessageTrackingMeta(zaloMessageId, {
                    status: 'sent',
                    friendRequestStatus: 'already_friend',
                    responseMessage: alreadyFriendPayload.responseMessage,
                    customerId: alreadyFriendPayload.customerId,
                  });
                  await logZaloSentJourneyEvent({
                    customerId: alreadyFriendPayload.customerId,
                    nodeId: node.id,
                    zaloMessageId,
                    messageText: message,
                    channel: 'zalo',
                    trackingToken,
                  });
                  sendResults.push(alreadyFriendPayload);
                  await campaignExecutionLogService.logExecutionNode({
                    campaignId,
                    runId,
                    node,
                    status: 'success',
                    progressCurrent: successfulSends + failedSends,
                    progressTotal: totalRecipients,
                    executionData: buildSendZaloFriendExecutionData(alreadyFriendPayload),
                  });
                  if (isContinuousMode) {
                    const completedAtIso = toHoChiMinhIso();
                    // eslint-disable-next-line no-await-in-loop
                    await upsertRecipientProgress({
                      nodeId: node.id,
                      channel: 'zalo_friend_request',
                      recipientKey: phone,
                      completedStep: 1,
                      totalSteps: 1,
                      firstSentAt: progress?.firstSentAt || completedAtIso,
                      lastCompletedAt: completedAtIso,
                      nextDueAt: null,
                    });
                  }
                } catch (customerSyncError) {
                  failedSends += 1;
                  const progressMessage = `Đã xử lý ${successfulSends + failedSends}/${totalRecipients}`;
                  const failedPayload = {
                    channel: 'zalo_friend_request',
                    accountId: account.id,
                    accountName: account.displayName,
                    phone,
                    requestMessage: message,
                    status: 'failed',
                    contentMode,
                    customerId: Number.parseInt(customerId, 10) || null,
                    zaloMessageId,
                    trackingToken,
                    error: `Đã là bạn bè nhưng đồng bộ khách hàng thất bại: ${customerSyncError.message}`,
                    messageText: progressMessage,
                  };
                  await updateZaloMessageTrackingMeta(zaloMessageId, {
                    status: 'failed',
                    error: failedPayload.error,
                    customerId: failedPayload.customerId,
                  });
                  sendResults.push(failedPayload);
                  await campaignExecutionLogService.logExecutionNode({
                    campaignId,
                    runId,
                    node,
                    status: 'failed',
                    progressCurrent: successfulSends + failedSends,
                    progressTotal: totalRecipients,
                    errorMessage: failedPayload.error,
                    executionData: buildSendZaloFriendExecutionData(failedPayload),
                  });
                }
              } else {
                failedSends += 1;
                const progressMessage = `Đã xử lý ${successfulSends + failedSends}/${totalRecipients}`;
                const failedPayload = {
                  channel: 'zalo_friend_request',
                  accountId: account.id,
                  accountName: account.displayName,
                  phone,
                  requestMessage: message,
                  status: 'failed',
                  contentMode,
                  customerId: Number.parseInt(customerId, 10) || null,
                  zaloMessageId,
                  trackingToken,
                  error: error.message,
                  messageText: progressMessage,
                };
                await updateZaloMessageTrackingMeta(zaloMessageId, {
                  status: 'failed',
                  error: error.message,
                  customerId: failedPayload.customerId,
                });
                sendResults.push(failedPayload);
                await campaignExecutionLogService.logExecutionNode({
                  campaignId,
                  runId,
                  node,
                  status: 'failed',
                  progressCurrent: successfulSends + failedSends,
                  progressTotal: totalRecipients,
                  errorMessage: error.message,
                  executionData: buildSendZaloFriendExecutionData(failedPayload),
                });
              }
            }
          }

          nodeOutputs[String(node.id)] = sendResults;
          lastOutputItems = sendResults;

          if (effectivePhoneEntries.length === 0) {
            await campaignExecutionLogService.logExecutionNode({
              campaignId,
              runId,
              node,
              status: 'warning',
              executionData: {
                message: isContinuousMode
                  ? 'Chưa có số điện thoại mới hợp lệ để gửi lời mời kết bạn'
                  : 'Không có số điện thoại hợp lệ để gửi lời mời kết bạn',
                items: [],
                schema: [],
                meta: isContinuousMode ? { totalItems: 0, continuousMode: true } : { totalItems: 0 },
              },
            });
          }

          await db.query(
            `UPDATE campaign_runs
             SET total_recipients = $1,
                 successful_sends = $2,
                 failed_sends = $3
             WHERE id = $4`,
            [totalRecipients, successfulSends, failedSends, runId]
          );
          continue;
        }

        if (nodeSubtype === 'send_zalo_group') {
          const config = campaignFlowService.normalizeNodeReferenceConfig(node.config || {}, resolveNodeId);
          const account = selectedZaloAccount
            || await campaignZaloSenderService.getCampaignZaloAccount({
              userId,
              accountId: config.zaloAccountId,
              roleCode,
            });
          selectedZaloAccount = account;
          const api = await campaignZaloSenderService.getConnectedApiOrSyncStatus({
            accountId: account.id,
            userId: account.userId || userId,
          });
          const groupSource = config.zaloGroupSource || 'manual';
          const manualGroupIds = config.zaloGroupIds || '';
          const sourceNodeId = config.zaloGroupNodeId || '';
          const sourceField = config.zaloGroupField || 'groupId';
          const groupEntries = collectEntriesFromSource({
            sourceMode: groupSource,
            manualValue: manualGroupIds,
            sourceNodeId,
            sourceField,
          });
          const rawGroupIds = groupEntries.map((entry) => entry.value);
          const dedupedGroupIds = Array.from(new Set(rawGroupIds.map((item) => String(item || '').trim()).filter(Boolean)));
          const groupEntryMap = new Map(
            groupEntries.map((entry) => [String(entry?.value || '').trim(), entry])
          );
          if (!isContinuousMode || shouldApplyRandomDelayInContinuous()) {
            await waitRandomApiDelay('zalo_send_group');
          }
          const groupIdSet = await campaignZaloSenderService.getAllGroupIdSet(api);
          const sendResults = [];
          /**
           * Chuẩn hóa payload execution cho node gửi Zalo nhóm để UI log luôn đọc được bảng dữ liệu.
           *
           * Luồng hoạt động:
           * 1. Bọc kết quả hiện tại vào `items` để mỗi lần gửi đều có 1 bản ghi chuẩn.
           * 2. Cập nhật `schema` tương ứng với item mới nhất.
           * 3. Ghi `meta.totalItems` theo số bản ghi đã tích lũy ở runtime.
           *
           * @param {object} payload kết quả gửi hiện tại
           * @returns {{message: string, items: Array<object>, schema: Array<object>, meta: object}}
           */
          const buildSendZaloGroupExecutionData = (payload = {}) => {
            const item = { ...payload };
            const attempted = successfulSends + failedSends;
            return {
              message: String(payload?.messageText || payload?.message || ''),
              items: [item],
              schema: campaignFlowService.buildSchemaFromRows([item]),
              meta: {
                attempted,
                sent: successfulSends,
                failed: failedSends,
                totalItems: sendResults.length,
              },
            };
          };
          const sendSingleGroup = async ({
            groupId,
            message,
            attachments = [],
            stepMeta = null,
            variables = {},
            groupEntry = null,
            applyRandomDelay = true,
          }) => {
            let zaloMessageId = null;
            const trackingToken = campaignZaloSenderService.createTrackingToken();
            const groupName = resolveGroupDisplayName(groupId, groupEntry);
            const attachmentList = normalizeAttachmentMetadata(attachments);
            try {
              if (groupIdSet.size > 0 && !groupIdSet.has(groupId)) {
                throw new Error(`Không tìm thấy nhóm ${groupId} trong tài khoản Zalo hiện tại`);
              }
              zaloMessageId = await createZaloMessageTrackingRecord({
                nodeId: node.id,
                channel: 'zalo_group',
                recipientType: 'group',
                recipientValue: groupId,
                groupId,
                accountId: account.id,
                accountName: account.displayName,
                messageText: message,
                customerId: null,
                trackingToken,
                trackingMetadata: {
                  groupName,
                  attachments: attachmentList,
                  attachmentsCount: attachmentList.length,
                },
              });
              const trackedMessage = campaignZaloSenderService.buildTrackedMessageText({
                message,
                trackingBaseUrl,
                trackingToken,
                utmSource: UTM_SOURCE_BY_ZALO_CHANNEL.group,
                campaignId,
                runId,
                customerId: null,
                zaloMessageId,
              });
              if (applyRandomDelay) {
                await waitRandomApiDelay('zalo_send_group');
              }
              const sendResult = await campaignZaloSenderService.sendGroupMessageQueued({
                userId,
                accountId: account.id,
                groupId,
                message: trackedMessage,
                attachments,
              });
              successfulSends += 1;
              const progressMessage = `Đã gửi ${successfulSends + failedSends}/${totalRecipients}`;
              const sentAt = toHoChiMinhIso();
              const senderName = resolveZaloSenderName(account);
              const zaloName = senderName;
              const resultPayload = {
                channel: 'zalo_group',
                accountId: account.id,
                accountName: account.displayName,
                senderName,
                zaloName,
                groupId,
                groupName,
                zaloMessageId,
                message: trackedMessage,
                status: 'success',
                response: sendResult.response || null,
                messageText: progressMessage,
                sentAt,
                templateId: stepMeta?.templateId || null,
                stepIndex: stepMeta?.stepIndex || null,
                attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
                trackingToken,
                variables,
              };
              await updateZaloMessageTrackingMeta(zaloMessageId, {
                status: 'sent',
                response: sendResult.response || null,
                groupName,
                attachments: attachmentList,
                attachmentsCount: attachmentList.length,
              });
              await logZaloSentJourneyEvent({
                customerId: null,
                nodeId: node.id,
                zaloMessageId,
                messageText: trackedMessage,
                channel: 'zalo_group',
                trackingToken,
              });
              sendResults.push(resultPayload);
              await campaignExecutionLogService.logExecutionNode({
                campaignId,
                runId,
                node,
                status: 'success',
                progressCurrent: successfulSends + failedSends,
                progressTotal: totalRecipients,
                executionData: buildSendZaloGroupExecutionData(resultPayload),
              });
              return { success: true, status: 'success' };
            } catch (error) {
              failedSends += 1;
              const progressMessage = `Đã gửi ${successfulSends + failedSends}/${totalRecipients}`;
              const sentAt = toHoChiMinhIso();
              const senderName = resolveZaloSenderName(account);
              const zaloName = senderName;
              const failedPayload = {
                channel: 'zalo_group',
                accountId: account.id,
                accountName: account.displayName,
                senderName,
                zaloName,
                groupId,
                groupName,
                zaloMessageId,
                message,
                status: 'failed',
                error: error.message,
                messageText: progressMessage,
                sentAt,
                templateId: stepMeta?.templateId || null,
                stepIndex: stepMeta?.stepIndex || null,
                attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
                trackingToken,
                variables,
                attachments: attachmentList,
              };
              await updateZaloMessageTrackingMeta(zaloMessageId, {
                status: 'failed',
                error: error.message,
                groupName,
                attachments: attachmentList,
                attachmentsCount: attachmentList.length,
              });
              sendResults.push(failedPayload);
              await campaignExecutionLogService.logExecutionNode({
                campaignId,
                runId,
                node,
                status: 'failed',
                progressCurrent: successfulSends + failedSends,
                progressTotal: totalRecipients,
                errorMessage: error.message,
                executionData: buildSendZaloGroupExecutionData(failedPayload),
              });
              return { success: false, status: 'failed', error: error.message };
            }
          };

          const templateSteps = Array.isArray(config.zaloGroupTemplateSteps)
            ? config.zaloGroupTemplateSteps
            : [];
          const manualGroupAttachmentsRaw = Array.isArray(config.zaloGroupAttachments)
            ? config.zaloGroupAttachments
            : [];
          const manualGroupAttachments = await prepareZaloTemplateAttachmentsSafely({
            templateAttachments: manualGroupAttachmentsRaw,
            templateId: null,
          });

          // --- Continuous mode: theo dõi tiến trình gửi theo nhóm, tránh gửi lại nhóm đã xong ---
          if (isContinuousMode) {
            const sendMode = String(config.zaloGroupSendMode || 'all').trim();
            const stepsWithMessage = [];
            if (templateSteps.length > 0) {
              for (const step of templateSteps) {
                // eslint-disable-next-line no-await-in-loop
                const stepTemplate = await getZaloTemplateContent(step.templateId);
                // eslint-disable-next-line no-await-in-loop
                const stepAttachments = await prepareZaloTemplateAttachmentsSafely({
                  templateAttachments: stepTemplate.attachments,
                  templateId: step.templateId,
                });
                stepsWithMessage.push({
                  ...step,
                  message: stepTemplate.message,
                  attachments: stepAttachments,
                });
              }
            }
            await refreshUpstreamDataNodesBefore(node.id);
            if (groupSource === 'node' && String(sourceNodeId || '').trim()) {
              await refreshSourceNodeOutput(String(sourceNodeId || '').trim());
            }
            const refreshedGroupEntries = collectEntriesFromSource({
              sourceMode: groupSource,
              manualValue: manualGroupIds,
              sourceNodeId,
              sourceField,
            });
            const refreshedGroupIds = Array.from(
              new Set(refreshedGroupEntries.map((entry) => String(entry.value || '').trim()).filter(Boolean))
            );
            const refreshedGroupEntryMap = new Map(
              refreshedGroupEntries.map((entry) => [String(entry?.value || '').trim(), entry])
            );
            if (refreshedGroupIds.length === 0) {
              await campaignExecutionLogService.logExecutionNode({
                campaignId,
                runId,
                node,
                status: 'warning',
                executionData: {
                  message: 'Chưa có nhóm mới hợp lệ để gửi tin trong chế độ chạy liên tục',
                  items: [],
                  schema: [],
                  meta: { totalItems: 0, continuousMode: true },
                },
              });
            }
            await runTasksWithConcurrency({
              items: refreshedGroupIds,
              concurrency: this.CONTINUOUS_ZALO_GROUP_BATCH_SIZE,
              handler: async (groupId) => {
                const normalizedGroupId = String(groupId || '').trim();
                if (!normalizedGroupId) return;
                try {
                  const progress = await getRecipientProgress({
                    nodeId: node.id,
                    channel: 'zalo_group',
                    recipientKey: normalizedGroupId,
                  });
                  const nextStepIndex = Math.max(0, progress.lastCompletedStep || 0);
                  const entry = refreshedGroupEntryMap.get(normalizedGroupId) || null;
                  if (stepsWithMessage.length > 0) {
                    if (progress.isFullyCompleted || nextStepIndex >= stepsWithMessage.length) return;
                    const dueStatus = resolveNextDueAtStatus(progress.nextDueAt);
                    if (!dueStatus.isDueNow) {
                      registerNextContinuousWakeAt(dueStatus.nextDueAtMs);
                      return;
                    }
                    const step = stepsWithMessage[nextStepIndex];
                    const mappings = Array.isArray(step?.templateMappings) ? step.templateMappings : [];
                    const variables = resolveTemplateVariablesFromMappings({
                      mappings,
                      entry,
                      fallbackNodeId: sourceNodeId,
                    });
                    const renderedMessage = mappings.length
                      ? renderTemplateText(step.message, variables).trim()
                      : String(step.message || '').trim();
                    if (!renderedMessage) return;
                    totalRecipients += 1;
                    const sendOutcome = await sendSingleGroup({
                      groupId: normalizedGroupId,
                      message: renderedMessage,
                      attachments: step.attachments,
                      stepMeta: { templateId: step.templateId, stepIndex: nextStepIndex + 1 },
                      variables,
                      groupEntry: entry,
                      applyRandomDelay: shouldApplyRandomDelayInContinuous(),
                    });
                    if (sendOutcome?.success) {
                      const completedAtIso = toHoChiMinhIso();
                      const firstSentAt = progress.firstSentAt || completedAtIso;
                      const nextDueAt = computeStepDueAt({
                        steps: stepsWithMessage,
                        completedStep: nextStepIndex + 1,
                        firstSentAt,
                        lastCompletedAt: completedAtIso,
                        sendMode,
                      });
                      await upsertRecipientProgress({
                        nodeId: node.id,
                        channel: 'zalo_group',
                        recipientKey: normalizedGroupId,
                        completedStep: nextStepIndex + 1,
                        totalSteps: stepsWithMessage.length,
                        firstSentAt,
                        lastCompletedAt: completedAtIso,
                        nextDueAt,
                      });
                      registerNextContinuousWakeAt(nextDueAt ? Date.parse(nextDueAt) : null);
                    }
                    return;
                  }
                  // Không có templateSteps: mỗi nhóm chỉ gửi 1 lần (step duy nhất)
                  if (progress.isFullyCompleted || nextStepIndex >= 1) return;
                  const dueStatus = resolveNextDueAtStatus(progress.nextDueAt);
                  if (!dueStatus.isDueNow) {
                    registerNextContinuousWakeAt(dueStatus.nextDueAtMs);
                    return;
                  }
                  const message = String(config.zaloGroupMessage || '').trim();
                  if (!message) return;
                  totalRecipients += 1;
                  const sendOutcome = await sendSingleGroup({
                    groupId: normalizedGroupId,
                    message,
                    attachments: manualGroupAttachments,
                    groupEntry: entry,
                    applyRandomDelay: shouldApplyRandomDelayInContinuous(),
                  });
                  if (sendOutcome?.success) {
                    const completedAtIso = toHoChiMinhIso();
                    await upsertRecipientProgress({
                      nodeId: node.id,
                      channel: 'zalo_group',
                      recipientKey: normalizedGroupId,
                      completedStep: 1,
                      totalSteps: 1,
                      firstSentAt: progress.firstSentAt || completedAtIso,
                      lastCompletedAt: completedAtIso,
                      nextDueAt: null,
                    });
                  }
                } catch (groupError) {
                  // Lỗi của 1 nhóm không dừng toàn bộ run; chỉ propagate lệnh dừng do user.
                  if (groupError?.code === 'RUN_STOPPED') throw groupError;
                  console.error(
                    `[CampaignRun][ZaloGroup] run=${runId} groupId=${normalizedGroupId} step_error:`,
                    groupError.message
                  );
                }
              },
            });
            nodeOutputs[String(node.id)] = sendResults;
            lastOutputItems = sendResults;
            await db.query(
              `UPDATE campaign_runs
               SET total_recipients = $1,
                   successful_sends = $2,
                   failed_sends = $3
               WHERE id = $4`,
              [totalRecipients, successfulSends, failedSends, runId]
            );
            continue;
          }

          if (templateSteps.length > 0) {
            const sendMode = String(config.zaloGroupSendMode || 'all').trim();
            const stepsWithMessage = [];
            for (const step of templateSteps) {
              // eslint-disable-next-line no-await-in-loop
              const stepTemplate = await getZaloTemplateContent(step.templateId);
              // eslint-disable-next-line no-await-in-loop
              const stepAttachments = await prepareZaloTemplateAttachmentsSafely({
                templateAttachments: stepTemplate.attachments,
                templateId: step.templateId,
              });
              stepsWithMessage.push({
                ...step,
                message: stepTemplate.message,
                attachments: stepAttachments,
              });
            }
            totalRecipients += dedupedGroupIds.length * stepsWithMessage.length;

            /**
             * Gửi 1 template step cho toàn bộ nhóm, mỗi nhóm cách nhau 5-10 giây.
             *
             * Luồng hoạt động:
             * 1. Render nội dung theo mapping riêng từng nhóm.
             * 2. Gửi tuần tự từng nhóm để kiểm soát nhịp gửi trong cùng template.
             * 3. Chèn delay 5-10 giây giữa 2 lần gửi liên tiếp.
             *
             * @param {object} step dữ liệu template step đã resolve nội dung template
             * @param {number} stepIndex chỉ số step
             * @returns {Promise<void>}
             */
            const runZaloGroupTemplateStep = async (step, stepIndex) => {
              for (let groupIndex = 0; groupIndex < dedupedGroupIds.length; groupIndex += 1) {
                const groupId = dedupedGroupIds[groupIndex];
                const normalizedGroupId = String(groupId || '').trim();
                if (!normalizedGroupId) continue;
                // eslint-disable-next-line no-await-in-loop
                const progress = await getRecipientProgress({
                  nodeId: node.id,
                  channel: 'zalo_group',
                  recipientKey: normalizedGroupId,
                });
                if (!shouldProcessRecipientStep({
                  progress,
                  stepIndex,
                  totalSteps: stepsWithMessage.length,
                })) {
                  continue;
                }
                if (groupIndex > 0) {
                  // eslint-disable-next-line no-await-in-loop
                  await waitRandomZaloGroupTemplateDelay(`zalo_group_step_${stepIndex + 1}`);
                }
                const entry = groupEntryMap.get(normalizedGroupId) || null;
                const mappings = Array.isArray(step?.templateMappings) ? step.templateMappings : [];
                const variables = resolveTemplateVariablesFromMappings({
                  mappings,
                  entry,
                  fallbackNodeId: sourceNodeId,
                });
                const renderedMessage = mappings.length
                  ? renderTemplateText(step.message, variables).trim()
                  : String(step.message || '').trim();
                if (!renderedMessage) {
                  throw new Error(`Thiếu nội dung tin nhắn cho nhóm ${normalizedGroupId}`);
                }
                // eslint-disable-next-line no-await-in-loop
                const sendOutcome = await sendSingleGroup({
                  groupId: normalizedGroupId,
                  message: renderedMessage,
                  attachments: step.attachments,
                  stepMeta: {
                    templateId: step.templateId,
                    stepIndex: stepIndex + 1,
                  },
                  variables,
                  groupEntry: entry,
                  applyRandomDelay: false,
                });
                if (sendOutcome?.success) {
                  // eslint-disable-next-line no-await-in-loop
                  await markRecipientStepCompleted({
                    nodeId: node.id,
                    channel: 'zalo_group',
                    recipientKey: normalizedGroupId,
                    completedStep: stepIndex + 1,
                    totalSteps: stepsWithMessage.length,
                    progress,
                    steps: stepsWithMessage,
                    sendMode,
                  });
                }
              }
            };

            // Tắt nhánh sleep theo run-level cho schedule mode ở non-continuous để tránh dời lịch nextDueAt.
            if (false && sendMode === 'schedule') {
              const scheduleStartAt = Date.now();
              let previousStepTargetAt = scheduleStartAt;
              for (let stepIndex = 0; stepIndex < stepsWithMessage.length; stepIndex += 1) {
                const step = stepsWithMessage[stepIndex];
                // eslint-disable-next-line no-await-in-loop
                previousStepTargetAt = await waitForScheduledStep({
                  scheduleStartAt,
                  previousStepTargetAt,
                  step,
                  channel: 'zalo_group',
                  recipientKey: 'all_groups',
                  stepIndex: stepIndex + 1,
                });
                // eslint-disable-next-line no-await-in-loop
                await runZaloGroupTemplateStep(step, stepIndex);
              }
            } else {
              for (let stepIndex = 0; stepIndex < stepsWithMessage.length; stepIndex += 1) {
                // eslint-disable-next-line no-await-in-loop
                await runZaloGroupTemplateStep(stepsWithMessage[stepIndex], stepIndex);
              }
            }
          } else {
            const message = String(config.zaloGroupMessage || '').trim();
            if (!message) {
              throw new Error('Thiếu nội dung tin nhắn nhóm');
            }
            totalRecipients += dedupedGroupIds.length;
            for (const groupId of dedupedGroupIds) {
              const normalizedGroupId = String(groupId || '').trim();
              if (!normalizedGroupId) continue;
              // eslint-disable-next-line no-await-in-loop
              const progress = await getRecipientProgress({
                nodeId: node.id,
                channel: 'zalo_group',
                recipientKey: normalizedGroupId,
              });
              if (!shouldProcessRecipientStep({
                progress,
                stepIndex: 0,
                totalSteps: 1,
              })) {
                continue;
              }
              const entry = groupEntryMap.get(normalizedGroupId) || null;
              // eslint-disable-next-line no-await-in-loop
              const sendOutcome = await sendSingleGroup({
                groupId: normalizedGroupId,
                message,
                attachments: manualGroupAttachments,
                groupEntry: entry,
              });
              if (sendOutcome?.success) {
                // eslint-disable-next-line no-await-in-loop
                await markRecipientStepCompleted({
                  nodeId: node.id,
                  channel: 'zalo_group',
                  recipientKey: normalizedGroupId,
                  completedStep: 1,
                  totalSteps: 1,
                  progress,
                  steps: [{ message }],
                  sendMode: 'all',
                });
              }
            }
          }

          nodeOutputs[String(node.id)] = sendResults;
          lastOutputItems = sendResults;

          if (dedupedGroupIds.length === 0) {
            await campaignExecutionLogService.logExecutionNode({
              campaignId,
              runId,
              node,
              status: 'warning',
              executionData: {
                message: 'Không có group id hợp lệ để gửi tin nhắn nhóm',
                items: [],
                schema: [],
                meta: { totalItems: 0 },
              },
            });
          }

          await db.query(
            `UPDATE campaign_runs
             SET total_recipients = $1,
                 successful_sends = $2,
                 failed_sends = $3
             WHERE id = $4`,
            [totalRecipients, successfulSends, failedSends, runId]
          );
          continue;
        }

            await campaignExecutionLogService.logExecutionNode({
              campaignId,
              runId,
              node,
              status: 'success',
              executionData: {
                message: 'Node chưa có logic chạy riêng, bỏ qua',
                items: [],
                schema: [],
                meta: { skipped: true },
              },
            });
          } catch (nodeError) {
            const isTimeout = isNetworkTimeoutError(nodeError);
            if (!(isContinuousMode && isTimeout)) {
              throw nodeError;
            }

            const retryMeta = nodeError?.zaloRetry || {};
            const maxAttempts = Number.isFinite(retryMeta?.maxAttempts)
              ? retryMeta.maxAttempts
              : 4;
            const operationName = String(retryMeta?.operationName || 'zalo_operation').trim();
            const pauseMessage = `Node ${nodeSubtype || node.id} timeout sau ${maxAttempts} lần thử, `
              + 'hệ thống tạm dừng và chờ đến chu kỳ quét mới để chạy lại';
            await campaignExecutionLogService.logExecutionNode({
              campaignId,
              runId,
              node,
              status: 'warning',
              errorMessage: nodeError?.message || 'Lỗi timeout khi gọi Zalo API',
              executionData: {
                message: pauseMessage,
                error: nodeError?.message || 'Lỗi timeout khi gọi Zalo API',
                items: [],
                schema: [],
                meta: {
                  totalItems: 0,
                  timeoutRetryFailed: true,
                  maxAttempts,
                  operationName,
                  continuousMode: true,
                },
              },
            });
            console.warn(
              `[CampaignRun][Continuous][Timeout] run=${runId} node=${nodeSubtype || node.id} `
              + `op=${operationName} retry=${maxAttempts} -> pause_until_next_cycle`
            );
            shouldPauseUntilNextContinuousCycle = true;
            break;
          }
        }
        // Giải phóng worker slot trước khi sleep để campaign khác có thể xử lý.
        // Sleeping campaigns không chiếm slot → hỗ trợ 50-100 campaigns chạy đồng thời.
        if (isContinuousMode) this._releaseContinuousWorker(runKey);

        if (!isContinuousMode) break;
        if (shouldPauseUntilNextContinuousCycle) {
          console.log(
            `[CampaignRun][Continuous] run=${runId} pause_until_next_cycle reason=timeout_retry_exhausted`
          );
        }
        continuousCycleIndex += 1;
        const randomContinuousPollIntervalMs = this.getRandomContinuousPollIntervalMs();
        const effectiveContinuousPollIntervalMs = Number.isFinite(configuredContinuousPollIntervalMs)
          ? configuredContinuousPollIntervalMs
          : randomContinuousPollIntervalMs;
        const pollStrategy = Number.isFinite(configuredContinuousPollIntervalMs)
          ? 'fixed_user_config'
          : 'random_120_300_step_5';
        const wakeByDueMs = Number.isFinite(nextContinuousWakeAtMs)
          ? Math.max(0, nextContinuousWakeAtMs - Date.now())
          : effectiveContinuousPollIntervalMs;
        const baseSleepMs = Math.max(1000, Math.min(effectiveContinuousPollIntervalMs, wakeByDueMs));
        // Jitter ±30% để phân tán wake-up time, tránh thundering herd khi nhiều
        // campaigns có cùng poll interval thức dậy đồng thời.
        const jitterMs = Math.floor((Math.random() * 2 - 1) * 0.3 * baseSleepMs);
        const nextSleepMs = Math.max(1000, baseSleepMs + jitterMs);
        console.log(
          `[CampaignRun][Continuous] run=${runId} cycle=${continuousCycleIndex} sleep_ms=${nextSleepMs} `
          + `(base=${baseSleepMs} jitter=${jitterMs > 0 ? '+' : ''}${jitterMs}) `
          + `poll_ms=${effectiveContinuousPollIntervalMs} poll_strategy=${pollStrategy} `
          + `wake_at=${nextContinuousWakeAtMs || 'poll_interval'} `
          + `workers=${this.MAX_CONTINUOUS_WORKERS - this.continuousAvailableWorkers}/${this.MAX_CONTINUOUS_WORKERS}`
        );
        await sleepWithRunCheck(nextSleepMs);
      }

      await syncPendingEmailRetryFromLedger();

      await db.query(
        hasPendingEmailRetry && !isContinuousMode
          ? `UPDATE campaign_runs SET
             status = 'running',
             completed_at = NULL,
             total_recipients = $1,
             successful_sends = $2,
             failed_sends = $3
             WHERE id = $4
               AND status = 'running'`
          : `UPDATE campaign_runs SET
             status = 'completed',
             completed_at = CURRENT_TIMESTAMP,
             total_recipients = $1,
             successful_sends = $2,
             failed_sends = $3
             WHERE id = $4
               AND status = 'running'`,
        [totalRecipients, successfulSends, failedSends, runId]
      );

      await db.query(
        `UPDATE campaigns SET
         last_run_at = CURRENT_TIMESTAMP,
         total_sent = total_sent + $1
         WHERE id = $2`,
        [successfulSends, campaignId]
      );

      if (hasPendingEmailRetry && !isContinuousMode) {
        console.log(
          `[Campaign ${campaignId}] Run ${runId} đang chờ retry email: `
          + `${pendingEmailRetryCount} lượt đã lên lịch, giữ trạng thái running`
        );
      } else {
        console.log(`[Campaign ${campaignId}] Hoàn thành: ${successfulSends} thành công, ${failedSends} thất bại`);
      }
    } catch (error) {
      if (error?.code === 'RUN_STOPPED') {
        console.log(`[Campaign ${campaignId}] Lượt chạy ${runId} đã được dừng bởi người dùng`);
        return;
      }
      console.error(`[Campaign ${campaignId}] Lỗi thực thi:`, error);
      await db.query(
        `UPDATE campaign_runs SET
         status = 'failed',
         completed_at = CURRENT_TIMESTAMP,
         error_message = $1
         WHERE id = $2`,
        [error.message, runId]
      );
    } finally {
      // Giải phóng worker slot nếu run kết thúc đột ngột trong lúc đang xử lý.
      // _releaseContinuousWorker là idempotent – an toàn khi chưa giữ slot.
      this._releaseContinuousWorker(runKey);
      // Xóa khỏi cả hai tracking set.
      this.continuousRunIds.delete(runKey);
      this.activeRunIds.delete(runKey);
      // Mở slot one-shot → khởi động run tiếp theo trong hàng đợi (nếu có).
      this._startNextFromQueue();
    }
  }
}

export default new CampaignRunService();
