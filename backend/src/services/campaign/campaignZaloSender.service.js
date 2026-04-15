import db from '../../config/database.js';
import crypto from 'node:crypto';
import path from 'node:path';
import uploadController from '../../controllers/upload.controller.js';
import { ThreadType, Zalo } from 'zca-js';
import zaloAccountSessionService from '../zalo/zaloAccountSession.service.js';
import { executeWithZaloTimeoutRetry } from '../../utils/zaloTimeoutRetry.util.js';
import { isAdminRole } from '../../utils/roleScope.util.js';
import outboundMessageQueueService, {
  OUTBOUND_MESSAGE_JOB_TYPES,
} from '../queue/outboundMessageQueue.service.js';
import trackingShortLinkService from '../tracking/trackingShortLink.service.js';
import { getZaloHttpPolyfillOption } from '../../utils/zaloUndiciFetch.util.js';

/**
 * Ánh xạ mảng với giới hạn đồng thời — tránh bắn hàng trăm request Zalo cùng lúc khi enrich tên nhóm.
 *
 * @template T, R
 * @param {T[]} items
 * @param {number} limit
 * @param {(item: T, index: number) => Promise<R>} mapper
 * @returns {Promise<R[]>}
 */
async function mapWithConcurrency(items, limit, mapper) {
  const safeLimit = Math.max(1, Math.floor(limit));
  const results = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const i = cursor++;
      if (i >= items.length) return;
      results[i] = await mapper(items[i], i);
    }
  };
  const poolSize = Math.min(safeLimit, Math.max(0, items.length));
  if (poolSize === 0) return results;
  await Promise.all(Array.from({ length: poolSize }, () => worker()));
  return results;
}

class CampaignZaloSenderService {
  constructor() {
    this.defaultZaloUserAgent =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0';
    this.defaultZaloLanguage = 'vi';
  }

  /**
   * Build a safe filename for zca-js attachment source.
   *
   * @param {object} attachment
   * @returns {string}
   */
  buildAttachmentFileName(attachment = {}) {
    const originalName = String(
      attachment?.displayName
      || attachment?.originalName
      || attachment?.name
      || attachment?.fileName
      || ''
    ).trim();
    const keyName = String(attachment?.key || '').trim()
      ? path.basename(String(attachment.key || '').trim())
      : '';
    const candidate = originalName || keyName || 'zalo_attachment.bin';
    const ext = path.extname(candidate) || path.extname(keyName) || '.bin';
    const base = path.basename(candidate, path.extname(candidate)) || 'zalo_attachment';
    return `${base}${ext}`;
  }

  /**
   * Lấy phần mở rộng của file theo chuẩn chữ thường, không kèm dấu chấm.
   *
   * @param {string} fileName tên file đầy đủ
   * @returns {string} phần mở rộng (vd: png, jpg) hoặc chuỗi rỗng
   */
  resolveFileExtension(fileName = '') {
    return String(path.extname(String(fileName || '') || ''))
      .replace('.', '')
      .trim()
      .toLowerCase();
  }

  /**
   * Đọc kích thước ảnh PNG từ header nhị phân.
   *
   * @param {Buffer} data dữ liệu file
   * @returns {{width: number, height: number}|null}
   */
  parsePngDimensions(data) {
    if (!Buffer.isBuffer(data) || data.length < 24) return null;
    const isPngSignature =
      data[0] === 0x89
      && data[1] === 0x50
      && data[2] === 0x4e
      && data[3] === 0x47;
    if (!isPngSignature) return null;
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    if (!width || !height) return null;
    return { width, height };
  }

  /**
   * Đọc kích thước ảnh GIF từ header nhị phân.
   *
   * @param {Buffer} data dữ liệu file
   * @returns {{width: number, height: number}|null}
   */
  parseGifDimensions(data) {
    if (!Buffer.isBuffer(data) || data.length < 10) return null;
    const signature = data.subarray(0, 6).toString('ascii');
    if (signature !== 'GIF87a' && signature !== 'GIF89a') return null;
    const width = data.readUInt16LE(6);
    const height = data.readUInt16LE(8);
    if (!width || !height) return null;
    return { width, height };
  }

  /**
   * Đọc kích thước ảnh JPEG bằng cách quét marker SOF.
   *
   * @param {Buffer} data dữ liệu file
   * @returns {{width: number, height: number}|null}
   */
  parseJpegDimensions(data) {
    if (!Buffer.isBuffer(data) || data.length < 4) return null;
    if (data[0] !== 0xff || data[1] !== 0xd8) return null;
    let offset = 2;
    while (offset + 8 < data.length) {
      if (data[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = data[offset + 1];
      offset += 2;
      // Bỏ qua các marker không có chiều dài section.
      if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
      if (offset + 2 > data.length) break;
      const segmentLength = data.readUInt16BE(offset);
      if (segmentLength < 2 || offset + segmentLength > data.length) break;
      const isSofMarker =
        (marker >= 0xc0 && marker <= 0xc3)
        || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb)
        || (marker >= 0xcd && marker <= 0xcf);
      if (isSofMarker && offset + 7 < data.length) {
        const height = data.readUInt16BE(offset + 3);
        const width = data.readUInt16BE(offset + 5);
        if (width && height) return { width, height };
      }
      offset += segmentLength;
    }
    return null;
  }

  /**
   * Đọc kích thước ảnh WebP từ chunk VP8/VP8L/VP8X.
   *
   * @param {Buffer} data dữ liệu file
   * @returns {{width: number, height: number}|null}
   */
  parseWebpDimensions(data) {
    if (!Buffer.isBuffer(data) || data.length < 30) return null;
    const riff = data.subarray(0, 4).toString('ascii');
    const webp = data.subarray(8, 12).toString('ascii');
    if (riff !== 'RIFF' || webp !== 'WEBP') return null;
    const chunkType = data.subarray(12, 16).toString('ascii');

    if (chunkType === 'VP8X' && data.length >= 30) {
      const widthMinusOne = data.readUIntLE(24, 3);
      const heightMinusOne = data.readUIntLE(27, 3);
      return { width: widthMinusOne + 1, height: heightMinusOne + 1 };
    }

    if (chunkType === 'VP8 ' && data.length >= 30) {
      // Khung key-frame chứa cặp width/height ở bytes 26-29.
      const width = data.readUInt16LE(26) & 0x3fff;
      const height = data.readUInt16LE(28) & 0x3fff;
      if (width && height) return { width, height };
    }

    if (chunkType === 'VP8L' && data.length >= 25) {
      const bits = data.readUInt32LE(21);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      if (width && height) return { width, height };
    }

    return null;
  }

  /**
   * Suy luận metadata ảnh từ buffer để zca-js upload đúng định dạng ảnh.
   *
   * Luồng hoạt động:
   * 1. Xác định extension từ tên file.
   * 2. Parse width/height theo từng định dạng ảnh phổ biến.
   * 3. Trả metadata tối thiểu `totalSize`, kèm width/height nếu đọc được.
   *
   * @param {Buffer} data dữ liệu file
   * @param {string} fileName tên file có phần mở rộng
   * @returns {{totalSize: number, width?: number, height?: number}}
   */
  buildAttachmentMetadata(data, fileName) {
    const totalSize = data.length;
    const ext = this.resolveFileExtension(fileName);
    let dimensions = null;

    if (ext === 'png') {
      dimensions = this.parsePngDimensions(data);
    } else if (ext === 'jpg' || ext === 'jpeg') {
      dimensions = this.parseJpegDimensions(data);
    } else if (ext === 'gif') {
      dimensions = this.parseGifDimensions(data);
    } else if (ext === 'webp') {
      dimensions = this.parseWebpDimensions(data);
    }

    return {
      totalSize,
      ...(dimensions?.width && dimensions?.height ? dimensions : {}),
    };
  }

  /**
   * Đọc một file template từ local storage và map về format attachment của zca-js.
   *
   * @param {object} attachment
   * @returns {Promise<{data: Buffer, filename: string, metadata: {totalSize: number, width?: number, height?: number}}>}
   */
  async downloadTemplateAttachmentAsSource(attachment = {}) {
    const key = uploadController.normalizeStorageKey(attachment);
    if (!key) {
      throw new Error('File template Zalo thiếu key lưu trữ');
    }
    const data = await uploadController.readFileBufferByKey(key);
    if (!data || data.length === 0) {
      throw new Error(`Không thể tải file đính kèm Zalo: ${key}`);
    }
    const fileName = this.buildAttachmentFileName(attachment);
    return {
      data,
      filename: fileName,
      metadata: this.buildAttachmentMetadata(data, fileName),
    };
  }

  /**
   * Resolve template attachment metadata into zca-js attachment sources.
   * Uses in-memory cache per run to avoid reading the same file repeatedly.
   *
   * @param {Array<any>} attachments
   * @param {{ cache?: Map<string, any> }} [options]
   * @returns {Promise<Array<{data: Buffer, filename: string, metadata: {totalSize: number}}>>}
   */
  async prepareZaloAttachmentSources(attachments = [], options = {}) {
    const source = Array.isArray(attachments) ? attachments : [];
    if (!source.length) return [];
    const cache = options?.cache instanceof Map ? options.cache : null;

    const outputs = [];
    for (const attachment of source) {
      const key = uploadController.normalizeStorageKey(attachment);
      const cacheKey = key ? `local:${key}` : `inline:${JSON.stringify(attachment || {})}`;
      if (cache?.has(cacheKey)) {
        outputs.push(cache.get(cacheKey));
        continue;
      }
      try {
        // eslint-disable-next-line no-await-in-loop
        const prepared = await this.downloadTemplateAttachmentAsSource(attachment);
        outputs.push(prepared);
        if (cache) {
          cache.set(cacheKey, prepared);
        }
      } catch (error) {
        /**
         * Bỏ qua từng file lỗi để không làm rớt toàn bộ danh sách attachment.
         * Nhờ vậy nếu template có 2 file mà 1 file lỗi key/mất file,
         * file còn lại vẫn được gửi bình thường.
         */
        const errCode = String(error?.code || '').trim().toLowerCase();
        const errMsg = String(error?.message || '').trim();
        const normalizedErrMsg = errMsg.toLowerCase();
        const isRecoverable =
          errCode === 'enoent'
          || normalizedErrMsg.includes('thiếu key')
          || normalizedErrMsg.includes('không thể tải file')
          || normalizedErrMsg.includes('không tồn tại');
        if (!isRecoverable) {
          throw error;
        }
        console.warn(`[CampaignZaloSender] Bỏ qua attachment lỗi: ${errMsg || 'unknown error'}`);
      }
    }
    return outputs;
  }

  /**
   * Build message payload compatible with zca-js sendMessage API.
   *
   * @param {object} input
   * @returns {string|{msg: string, attachments: Array<any>}}
   */
  buildMessagePayload({ message, attachments = [] }) {
    const normalizedMessage = String(message || '');
    const normalizedAttachments = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
    if (normalizedAttachments.length === 0) {
      return normalizedMessage;
    }
    // Gửi toàn bộ attachments trong cùng 1 payload để zca-js tự xử lý group layout cho nhiều ảnh.
    return {
      msg: normalizedMessage,
      attachments: normalizedAttachments,
    };
  }

  /**
   * Kiểm tra attachment có phải ảnh hay không dựa theo phần mở rộng file.
   *
   * @param {object} attachment nguồn attachment đã chuẩn hóa
   * @returns {boolean}
   */
  isImageAttachmentSource(attachment = {}) {
    const fileName = String(attachment?.filename || '').trim().toLowerCase();
    if (!fileName) return false;
    const ext = this.resolveFileExtension(fileName);
    const imageExtSet = new Set(['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'heic', 'heif']);
    return imageExtSet.has(ext);
  }

  /**
   * Tách danh sách attachment thành 2 nhóm: ảnh và tệp thường.
   *
   * @param {Array<any>} attachments
   * @returns {{imageAttachments: Array<any>, fileAttachments: Array<any>}}
   */
  splitZaloAttachmentsByKind(attachments = []) {
    const normalized = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
    if (!normalized.length) {
      return { imageAttachments: [], fileAttachments: [] };
    }
    const imageAttachments = [];
    const fileAttachments = [];
    normalized.forEach((attachment) => {
      if (this.isImageAttachmentSource(attachment)) {
        imageAttachments.push(attachment);
      } else {
        fileAttachments.push(attachment);
      }
    });
    return { imageAttachments, fileAttachments };
  }

  /**
   * Xây dựng các lượt gửi attachment theo quy tắc:
   * - Nhiều ảnh: gom 1 lượt (album/group ảnh).
   * - File thường (pdf/doc/...): gửi từng file bình thường.
   * - Text chỉ đính kèm ở lượt gửi đầu tiên để tránh lặp nội dung.
   *
   * @param {object} input
   * @param {string} input.message nội dung tin nhắn
   * @param {Array<any>} input.attachments danh sách attachment nguồn
   * @returns {Array<{type: 'text'|'image_group'|'image_single'|'file_single', msg: string, attachments: Array<any>}>}
   */
  buildAttachmentDispatches({ message, attachments = [] }) {
    const normalizedMessage = String(message || '');
    const normalizedAttachments = Array.isArray(attachments) ? attachments.filter(Boolean) : [];
    if (!normalizedAttachments.length) {
      return [{ type: 'text', msg: normalizedMessage, attachments: [] }];
    }

    const { imageAttachments, fileAttachments } = this.splitZaloAttachmentsByKind(normalizedAttachments);
    const dispatches = [];
    let shouldUseMessage = true;

    if (imageAttachments.length > 1) {
      dispatches.push({
        type: 'image_group',
        msg: shouldUseMessage ? normalizedMessage : '',
        attachments: imageAttachments,
      });
      shouldUseMessage = false;
    } else if (imageAttachments.length === 1) {
      dispatches.push({
        type: 'image_single',
        msg: shouldUseMessage ? normalizedMessage : '',
        attachments: imageAttachments,
      });
      shouldUseMessage = false;
    }

    fileAttachments.forEach((attachment) => {
      dispatches.push({
        type: 'file_single',
        msg: shouldUseMessage ? normalizedMessage : '',
        attachments: [attachment],
      });
      shouldUseMessage = false;
    });

    if (!dispatches.length) {
      dispatches.push({ type: 'text', msg: normalizedMessage, attachments: [] });
    }

    return dispatches;
  }

  /**
   * Gửi message theo từng lượt đã tách từ attachment để tương thích:
   * - album ảnh khi có nhiều ảnh
   * - file thường từng file
   *
   * @param {object} input
   * @param {string} input.operationName tên operation gốc phục vụ retry log
   * @param {string} input.message nội dung text
   * @param {Array<any>} [input.attachments] danh sách attachment nguồn
   * @param {(payload: string|{msg: string, attachments: Array<any>}) => Promise<any>} input.sendOperation hàm gửi thực tế tới zca-js
   * @param {string} [input.logIdentity] thông tin nhận diện người nhận/nhóm để log retry
   * @returns {Promise<{response: any, dispatchCount: number}>}
   */
  async sendMessageWithAttachmentDispatch({
    operationName,
    message,
    attachments = [],
    sendOperation,
    logIdentity = '',
  }) {
    const dispatches = this.buildAttachmentDispatches({ message, attachments });
    let lastResponse = null;

    for (let index = 0; index < dispatches.length; index += 1) {
      const dispatch = dispatches[index];
      const payload = this.buildMessagePayload({
        message: dispatch.msg,
        attachments: dispatch.attachments,
      });
      // eslint-disable-next-line no-await-in-loop
      lastResponse = await executeWithZaloTimeoutRetry({
        operationName: `${operationName}_${dispatch.type}_${index + 1}`,
        operation: () => sendOperation(payload),
        onRetry: ({ attempt, maxAttempts, delayMs }) => {
          console.warn(
            `[ZaloRetry] op=${operationName} dispatch=${dispatch.type} attempt=${attempt}/${maxAttempts} `
            + `next_delay_ms=${delayMs} ${logIdentity ? `target=${logIdentity}` : ''}`.trim()
          );
        },
      });
    }

    return {
      response: lastResponse,
      dispatchCount: dispatches.length,
    };
  }

  /**
   * Generate token used by Zalo click tracking endpoint.
   *
   * @returns {string}
   */
  createTrackingToken() {
    return crypto.randomBytes(24).toString('hex');
  }

  /**
   * Append UTM metadata into destination URL for campaign attribution.
   *
   * @param {string} rawUrl
   * @param {object} utm
   * @returns {string}
   */
  appendUtmToUrl(rawUrl, utm = {}) {
    try {
      const parsed = new URL(String(rawUrl || '').trim());
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return rawUrl;
      }
      if (utm.utmSource && !parsed.searchParams.has('utm_source')) {
        parsed.searchParams.set('utm_source', String(utm.utmSource));
      }
      if (utm.utmCampaign && !parsed.searchParams.has('utm_campaign')) {
        parsed.searchParams.set('utm_campaign', String(utm.utmCampaign));
      }
      if (utm.utmRunId && !parsed.searchParams.has('utm_id_run')) {
        parsed.searchParams.set('utm_id_run', String(utm.utmRunId));
      }
      if (utm.utmCustomer && !parsed.searchParams.has('utm_customer')) {
        parsed.searchParams.set('utm_customer', String(utm.utmCustomer));
      }
      if (utm.utmZaloMessageId && !parsed.searchParams.has('utm_id_zalo_message')) {
        parsed.searchParams.set('utm_id_zalo_message', String(utm.utmZaloMessageId));
      }
      if (utm.utmZaloUid && !parsed.searchParams.has('utm_zalo_uid')) {
        parsed.searchParams.set('utm_zalo_uid', String(utm.utmZaloUid));
      }
      return parsed.toString();
    } catch {
      return rawUrl;
    }
  }

  /**
   * Replace raw URLs in Zalo message with click-tracking links.
   *
   * @param {object} input
   * @returns {string}
   */
  async buildTrackedMessageText({
    message = '',
    trackingBaseUrl = '',
    trackingToken = '',
    utmSource = 'campaign_run',
    campaignId = null,
    runId = null,
    customerId = null,
    zaloMessageId = null,
    zaloUid = null,
    useShortLink = true,
    includeLinkTargets = false,
  }) {
    const baseUrl = String(trackingBaseUrl || '').trim();
    const token = String(trackingToken || '').trim();
    const sourceText = String(message || '');
    if (!baseUrl || !token || !sourceText) return sourceText;

    const trackingRoot = baseUrl.replace(/\/+$/, '');
    const urlRegex = /(https?:\/\/[^\s<>"')\]]+)/gi;

    const matches = Array.from(sourceText.matchAll(urlRegex));
    if (!matches.length) return sourceText;

    const linkTargets = {};
    const replacements = await Promise.all(
      matches.map(async (matched, index) => {
        const matchedUrl = String(matched[0] || '').trim();
        const linkKey = `zalo-link-${index + 1}`;
        const targetWithUtm = this.appendUtmToUrl(matchedUrl, {
          utmSource,
          utmCampaign: campaignId,
          utmRunId: runId,
          utmCustomer: customerId,
          utmZaloMessageId: zaloMessageId,
          utmZaloUid: zaloUid || null,
        });
        const encodedTarget = encodeURIComponent(targetWithUtm);
        const trackingLongUrl = `${trackingRoot}/api/customers/zalo-tracking/click/${token}?url=${encodedTarget}&lk=${encodeURIComponent(linkKey)}`;
        linkTargets[linkKey] = targetWithUtm;
        if (!useShortLink) return trackingLongUrl;
        return trackingShortLinkService.createShortTrackingUrl({
          trackingBaseUrl: trackingRoot,
          destinationUrl: trackingLongUrl,
          channel: 'zalo',
          trackingToken: token,
          linkKey,
        });
      })
    );

    let output = sourceText;
    matches.forEach((matched, index) => {
      const rawUrl = String(matched[0] || '').trim();
      if (!rawUrl) return;
      output = output.replace(rawUrl, replacements[index]);
    });
    if (!includeLinkTargets) return output;
    return {
      message: output,
      linkTargets,
    };
  }

  /**
   * Build normalized group list from zca-js getAllGroups response.
   *
   * @param {any} groupResp
   * @returns {Array<{groupId: string, groupName: string, version: string}>}
   */
  extractGroupsFromResponse(groupResp) {
    const gridVerMap = groupResp?.gridVerMap && typeof groupResp.gridVerMap === 'object'
      ? groupResp.gridVerMap
      : {};
    const gridInfoMap = groupResp?.gridInfoMap && typeof groupResp.gridInfoMap === 'object'
      ? groupResp.gridInfoMap
      : {};
    const groupInfoMap = groupResp?.groupInfoMap && typeof groupResp.groupInfoMap === 'object'
      ? groupResp.groupInfoMap
      : {};
    const groupArray = Array.isArray(groupResp?.groups)
      ? groupResp.groups
      : (Array.isArray(groupResp?.groupInfos) ? groupResp.groupInfos : []);

    const infoByGroupId = new Map();
    const registerInfo = (groupId, info) => {
      const id = String(groupId || '').trim();
      if (!id || !info || typeof info !== 'object') return;
      infoByGroupId.set(id, info);
    };

    Object.entries(gridInfoMap).forEach(([groupId, info]) => registerInfo(groupId, info));
    Object.entries(groupInfoMap).forEach(([groupId, info]) => registerInfo(groupId, info));
    groupArray.forEach((item) => {
      const groupId = String(item?.groupId || item?.gid || item?.id || '').trim();
      registerInfo(groupId, item);
    });

    const allGroupIds = new Set([
      ...Object.keys(gridVerMap || {}),
      ...Array.from(infoByGroupId.keys()),
    ]);

    return Array.from(allGroupIds).map((groupId) => {
      const info = infoByGroupId.get(groupId) || {};
      const groupName = String(
        info?.groupName
        || info?.name
        || info?.displayName
        || info?.subject
        || info?.title
        || ''
      ).trim();
      const version = String(gridVerMap?.[groupId] ?? info?.version ?? '').trim();
      return {
        groupId,
        groupName,
        version,
      };
    });
  }

  /**
   * Extract group name from unknown API payload shape.
   *
   * @param {unknown} payload
   * @returns {string}
   */
  extractGroupNameFromPayload(payload) {
    if (!payload) return '';

    const directCandidates = [
      payload?.groupName,
      payload?.name,
      payload?.displayName,
      payload?.subject,
      payload?.title,
      payload?.group_title,
      payload?.gridName,
    ];
    for (const candidate of directCandidates) {
      const value = String(candidate || '').trim();
      if (value) return value;
    }

    if (Array.isArray(payload)) {
      for (const item of payload) {
        const found = this.extractGroupNameFromPayload(item);
        if (found) return found;
      }
      return '';
    }

    if (typeof payload !== 'object') return '';

    const queue = [payload];
    const visited = new Set();
    const preferredKeys = ['groupName', 'name', 'displayName', 'subject', 'title', 'group_title', 'gridName'];

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') continue;
      if (visited.has(current)) continue;
      visited.add(current);

      for (const key of preferredKeys) {
        const value = String(current?.[key] || '').trim();
        if (value) return value;
      }

      Object.values(current).forEach((value) => {
        if (value && typeof value === 'object') queue.push(value);
      });
    }

    return '';
  }

  /**
   * Best-effort resolve group name by probing available zca-js API methods.
   *
   * @param {any} api
   * @param {string} groupId
   * @returns {Promise<string>}
   */
  async resolveGroupNameByApi(api, groupId) {
    const normalizedGroupId = String(groupId || '').trim();
    if (!normalizedGroupId || !api || typeof api !== 'object') return '';

    const methodCalls = [
      () => (typeof api.getGroupInfo === 'function' ? api.getGroupInfo(normalizedGroupId) : null),
      () => (typeof api.fetchGroupInfo === 'function' ? api.fetchGroupInfo(normalizedGroupId) : null),
      () => (typeof api.getGroupInfoById === 'function' ? api.getGroupInfoById(normalizedGroupId) : null),
      () => (typeof api.getGroupDetail === 'function' ? api.getGroupDetail(normalizedGroupId) : null),
      () => (typeof api.getThreadInfo === 'function' ? api.getThreadInfo(normalizedGroupId, ThreadType.Group) : null),
      () => (typeof api.getConversationInfo === 'function' ? api.getConversationInfo(normalizedGroupId, ThreadType.Group) : null),
    ];

    for (const call of methodCalls) {
      try {
        const result = await executeWithZaloTimeoutRetry({
          operationName: 'resolve_group_name',
          operation: () => call(),
          onRetry: ({ attempt, maxAttempts, delayMs }) => {
            console.warn(
              `[ZaloRetry] op=resolve_group_name attempt=${attempt}/${maxAttempts} `
              + `next_delay_ms=${delayMs} groupId=${normalizedGroupId}`
            );
          },
        });
        const groupName = this.extractGroupNameFromPayload(result);
        if (groupName) return groupName;
      } catch {
        // Keep trying next available method.
      }
    }

    return '';
  }

  /**
   * Bổ sung tên nhóm còn thiếu bằng gọi API (có giới hạn đồng thời qua `ZALO_GROUP_ENRICH_CONCURRENCY`).
   *
   * @param {any} api
   * @param {Array<{groupId: string, groupName: string, version: string}>} groups
   * @returns {Promise<Array<{groupId: string, groupName: string, version: string}>>}
   */
  async enrichGroupNames(api, groups = []) {
    const normalizedGroups = Array.isArray(groups) ? groups : [];
    const missingIds = normalizedGroups
      .filter((item) => !String(item?.groupName || '').trim())
      .map((item) => String(item?.groupId || '').trim())
      .filter((value, idx, arr) => value && arr.indexOf(value) === idx);

    if (missingIds.length === 0) return normalizedGroups;

    const rawConc = Number.parseInt(process.env.ZALO_GROUP_ENRICH_CONCURRENCY || '4', 10);
    const enrichConcurrency = Number.isFinite(rawConc) && rawConc > 0
      ? Math.min(50, Math.floor(rawConc))
      : 4;

    const nameEntries = await mapWithConcurrency(
      missingIds,
      enrichConcurrency,
      async (groupId) => [groupId, await this.resolveGroupNameByApi(api, groupId)]
    );
    const nameMap = new Map(nameEntries.filter((entry) => String(entry[1] || '').trim()));

    return normalizedGroups.map((item) => {
      const groupId = String(item?.groupId || '').trim();
      if (!groupId) return item;
      const existingName = String(item?.groupName || '').trim();
      if (existingName) return item;
      return {
        ...item,
        groupName: String(nameMap.get(groupId) || '').trim(),
      };
    });
  }

  /**
   * Extract friend uid from unknown payload shape.
   *
   * @param {any} friend
   * @returns {string}
   */
  extractFriendUid(friend) {
    const directCandidates = [
      friend?.uid,
      friend?.id,
      friend?.userId,
      friend?.zaloUserId,
      friend?.zuid,
      friend?.user_id,
      friend?.profile?.uid,
      friend?.profile?.id,
      friend?.profile?.userId,
      friend?.data?.uid,
      friend?.data?.id,
      friend?.data?.userId,
    ];
    for (const candidate of directCandidates) {
      const value = String(candidate || '').trim();
      if (value) return value;
    }
    return '';
  }

  /**
   * Extract friend display name from unknown payload shape.
   *
   * @param {any} friend
   * @returns {string}
   */
  extractFriendDisplayName(friend) {
    const directCandidates = [
      friend?.display_name,
      friend?.displayName,
      friend?.zalo_name,
      friend?.zaloName,
      friend?.name,
      friend?.fullName,
      friend?.username,
      friend?.profile?.display_name,
      friend?.profile?.displayName,
      friend?.profile?.zalo_name,
      friend?.profile?.zaloName,
      friend?.profile?.name,
      friend?.data?.display_name,
      friend?.data?.displayName,
      friend?.data?.zalo_name,
      friend?.data?.zaloName,
      friend?.data?.name,
    ];
    for (const candidate of directCandidates) {
      const value = String(candidate || '').trim();
      if (value) return value;
    }
    return '';
  }

  /**
   * Extract friend phone number from unknown payload shape.
   *
   * @param {any} friend
   * @returns {string}
   */
  extractFriendPhone(friend) {
    const resolveStringPhone = (value) => {
      if (value === null || value === undefined) return '';
      if (typeof value === 'string' || typeof value === 'number') {
        return String(value).trim();
      }
      if (typeof value === 'object') {
        const objectCandidates = [
          value?.phoneNumber,
          value?.phone_number,
          value?.phone,
          value?.mobile,
          value?.mobilePhone,
          value?.value,
          value?.number,
          value?.content,
        ];
        for (const candidate of objectCandidates) {
          const normalized = resolveStringPhone(candidate);
          if (normalized) return normalized;
        }
      }
      return '';
    };
    const directCandidates = [
      friend?.phoneNumber,
      friend?.phone_number,
      friend?.phone,
      friend?.mobile,
      friend?.mobilePhone,
      friend?.mobile_phone,
      friend?.zaloPhone,
      friend?.zalo_phone,
      friend?.profile?.phoneNumber,
      friend?.profile?.phone_number,
      friend?.profile?.phone,
      friend?.profile?.mobile,
      friend?.profile?.mobilePhone,
      friend?.profile?.mobile_phone,
      friend?.profile?.zaloPhone,
      friend?.profile?.zalo_phone,
      friend?.data?.phoneNumber,
      friend?.data?.phone_number,
      friend?.data?.phone,
      friend?.data?.mobile,
      friend?.data?.mobilePhone,
      friend?.data?.mobile_phone,
      friend?.data?.zaloPhone,
      friend?.data?.zalo_phone,
    ];
    for (const candidate of directCandidates) {
      const value = resolveStringPhone(candidate);
      if (value) return value;
    }

    // Fallback: recursively scan nested payload for known phone-like keys.
    const queue = [friend];
    const visited = new Set();
    const preferredPhoneKeys = new Set([
      'phone',
      'phonenumber',
      'phone_number',
      'zalo_phone',
      'zalophone',
      'mobile',
      'mobilephone',
      'mobile_phone',
      'phoneno',
      'phone_no',
      'contactphone',
      'contact_phone',
      'sdt',
      'so_dien_thoai',
    ]);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') continue;
      if (visited.has(current)) continue;
      visited.add(current);

      for (const [key, value] of Object.entries(current)) {
        const normalizedKey = String(key || '').toLowerCase().replace(/\s+/g, '');
        if (preferredPhoneKeys.has(normalizedKey)) {
          const normalizedValue = resolveStringPhone(value);
          if (normalizedValue) return normalizedValue;
        }
        if (value && typeof value === 'object') {
          queue.push(value);
        }
      }
    }

    return '';
  }

  /**
   * Find one profile object by uid from unknown getUserInfo payload shape.
   *
   * @param {any} payload
   * @param {string} uid
   * @returns {any}
   */
  findFriendProfileByUidDeep(payload, uid) {
    const normalizedUid = String(uid || '').trim();
    if (!payload || typeof payload !== 'object' || !normalizedUid) return null;

    const queue = [payload];
    const visited = new Set();
    while (queue.length > 0) {
      const current = queue.shift();
      if (!current || typeof current !== 'object') continue;
      if (visited.has(current)) continue;
      visited.add(current);

      const currentUid = this.extractFriendUid(current);
      if (currentUid && currentUid === normalizedUid) return current;

      Object.values(current).forEach((value) => {
        if (value && typeof value === 'object') queue.push(value);
      });
    }

    return null;
  }

  /**
   * Normalize getAllFriends payload for stable frontend/backend usage.
   *
   * @param {Array<any>} friends
   * @returns {Array<{uid: string, display_name: string, zalo_name: string, phoneNumber: string, raw: any}>}
   */
  normalizeFriends(friends = []) {
    const source = Array.isArray(friends) ? friends : [];
    return source.map((item) => {
      const uid = this.extractFriendUid(item);
      const displayName = this.extractFriendDisplayName(item);
      const phoneNumber = this.extractFriendPhone(item);
      return {
        uid,
        display_name: displayName,
        zalo_name: displayName,
        phoneNumber,
        raw: item,
      };
    });
  }

  /**
   * Extract profile object for one uid from getUserInfo response.
   *
   * @param {any} response
   * @param {string} uid
   * @returns {any}
   */
  extractFriendProfileFromUserInfoResponse(response, uid) {
    const normalizedUid = String(uid || '').trim();
    if (!response || typeof response !== 'object' || !normalizedUid) return null;

    const changedProfiles = response?.changed_profiles && typeof response.changed_profiles === 'object'
      ? response.changed_profiles
      : {};
    const directCandidates = [
      changedProfiles?.[`${normalizedUid}_0`],
      changedProfiles?.[normalizedUid],
      response?.data?.changed_profiles?.[`${normalizedUid}_0`],
      response?.data?.changed_profiles?.[normalizedUid],
      response?.profiles?.[normalizedUid],
      response?.data?.profiles?.[normalizedUid],
      response?.data?.[normalizedUid],
      response?.profile,
      response?.data?.profile,
    ];
    for (const candidate of directCandidates) {
      if (candidate && typeof candidate === 'object') return candidate;
    }
    return this.findFriendProfileByUidDeep(response, normalizedUid);
  }

  /**
   * Enrich normalized friends by probing getUserInfo(uid) for missing phone numbers.
   *
   * @param {any} api
   * @param {Array<any>} friends
   * @returns {Promise<Array<{uid: string, display_name: string, zalo_name: string, phoneNumber: string, raw: any}>>}
   */
  async normalizeFriendsWithProfileLookup(api, friends = []) {
    const normalized = this.normalizeFriends(friends);
    if (!api || typeof api.getUserInfo !== 'function') return normalized;

    const missingPhoneUids = normalized
      .filter((item) => !String(item?.phoneNumber || '').trim())
      .map((item) => String(item?.uid || '').trim())
      .filter((uid, idx, arr) => uid && arr.indexOf(uid) === idx);
    if (missingPhoneUids.length === 0) return normalized;

    // Keep it bounded to avoid excessive API calls on large friend lists.
    const lookupUids = missingPhoneUids.slice(0, 200);
    const profileMap = new Map();

    await Promise.all(
      lookupUids.map(async (uid) => {
        try {
          const response = await executeWithZaloTimeoutRetry({
            operationName: 'get_user_info',
            operation: () => api.getUserInfo(uid),
            onRetry: ({ attempt, maxAttempts, delayMs }) => {
              console.warn(
                `[ZaloRetry] op=get_user_info attempt=${attempt}/${maxAttempts} `
                + `next_delay_ms=${delayMs} uid=${uid}`
              );
            },
          });
          const profile = this.extractFriendProfileFromUserInfoResponse(response, uid);
          const phoneNumber = this.extractFriendPhone(profile) || this.extractFriendPhone(response);
          const displayName = this.extractFriendDisplayName(profile) || this.extractFriendDisplayName(response);
          if (!phoneNumber && !displayName) return;
          profileMap.set(uid, {
            phoneNumber: String(phoneNumber || '').trim(),
            displayName: String(displayName || '').trim(),
          });
        } catch {
          // Best-effort only: keep existing normalized data.
        }
      })
    );

    if (profileMap.size === 0) return normalized;

    return normalized.map((item) => {
      const uid = String(item?.uid || '').trim();
      if (!uid || !profileMap.has(uid)) return item;
      const profile = profileMap.get(uid);
      const nextDisplayName = String(item?.display_name || '').trim() || profile.displayName;
      const nextPhoneNumber = String(item?.phoneNumber || '').trim() || profile.phoneNumber;
      return {
        ...item,
        display_name: nextDisplayName,
        zalo_name: nextDisplayName,
        phoneNumber: nextPhoneNumber,
      };
    });
  }

  /**
   * Parse list text by newline/comma/semicolon with dedupe.
   *
   * @param {unknown} text
   * @returns {string[]}
   */
  parseListText(text) {
    return Array.from(
      new Set(
        String(text || '')
          .split(/[\n,;]/g)
          .map((item) => item.trim())
          .filter(Boolean)
      )
    );
  }

  /**
   * Parse cookie text from DB into usable source.
   *
   * @param {string} cookieText
   * @returns {unknown}
   */
  deserializeCookieSource(cookieText) {
    const normalized = String(cookieText || '').trim();
    if (!normalized) return null;
    try {
      return JSON.parse(normalized);
    } catch {
      return normalized;
    }
  }

  /**
   * Serialize cookie source for dedupe/diagnostic usage.
   *
   * @param {unknown} cookieSource
   * @returns {string}
   */
  serializeCookieSource(cookieSource) {
    if (!cookieSource) return '';
    try {
      if (typeof cookieSource === 'string') return cookieSource.trim();
      if (Array.isArray(cookieSource) || typeof cookieSource === 'object') {
        return JSON.stringify(cookieSource);
      }
    } catch {
      // Return empty string for unsupported payload shape.
    }
    return '';
  }

  /**
   * Build imei format accepted by zca-js login.
   *
   * @param {string} userAgent
   * @returns {string}
   */
  buildImeiFromUserAgent(userAgent) {
    const normalizedUserAgent = String(userAgent || '').trim() || this.defaultZaloUserAgent;
    return `${crypto.randomUUID()}-${crypto.createHash('md5').update(normalizedUserAgent).digest('hex')}`;
  }

  /**
   * Normalize unknown cookie payload to zca-js credentials.
   *
   * @param {unknown} source
   * @returns {{ imei: string, userAgent: string, language: string, cookie: unknown } | null}
   */
  normalizeLoginCredentials(source) {
    if (!source) return null;

    const safeObject = source && typeof source === 'object' ? source : null;
    const userAgent = String(
      safeObject?.userAgent || safeObject?.user_agent || safeObject?.ua || ''
    ).trim() || this.defaultZaloUserAgent;
    const language = String(safeObject?.language || '').trim() || this.defaultZaloLanguage;
    const cookie = safeObject
      ? (safeObject.cookie || safeObject.cookies || null)
      : source;
    if (!cookie) return null;

    const imei = String(safeObject?.imei || '').trim() || this.buildImeiFromUserAgent(userAgent);
    return {
      imei,
      userAgent,
      language,
      cookie,
    };
  }

  /**
   * Build cookie candidates from raw cookie_text.
   *
   * @param {string} cookieText
   * @returns {unknown[]}
   */
  buildCookieLoginCandidates(cookieText) {
    const normalized = String(cookieText || '').trim();
    const parsedCookie = this.deserializeCookieSource(normalized);
    const candidates = [];
    const seen = new Set();

    const registerCandidate = (value) => {
      if (!value) return;
      const key =
        typeof value === 'string'
          ? `str:${value}`
          : `obj:${this.serializeCookieSource(value)}`;
      if (!key || seen.has(key)) return;
      seen.add(key);
      candidates.push(value);
    };

    registerCandidate(parsedCookie);
    registerCandidate(normalized);

    if (parsedCookie && typeof parsedCookie === 'object' && !Array.isArray(parsedCookie)) {
      registerCandidate(parsedCookie.cookie);
      registerCandidate(parsedCookie.cookies);
      if (Array.isArray(parsedCookie.cookies)) {
        registerCandidate(this.serializeCookieSource(parsedCookie.cookies));
      }
    }

    if (Array.isArray(parsedCookie)) {
      registerCandidate(this.serializeCookieSource(parsedCookie));
    }

    return candidates;
  }

  /**
   * Build login credentials candidates for restore.
   *
   * @param {string} cookieText
   * @returns {Array<{ imei: string, userAgent: string, language: string, cookie: unknown }>}
   */
  buildLoginCredentialCandidates(cookieText) {
    const cookieCandidates = this.buildCookieLoginCandidates(cookieText);
    const parsedCookie = this.deserializeCookieSource(cookieText);
    const candidates = [];
    const seen = new Set();

    const registerCandidate = (value) => {
      const normalized = this.normalizeLoginCredentials(value);
      if (!normalized) return;
      const dedupeKey = JSON.stringify({
        imei: normalized.imei,
        userAgent: normalized.userAgent,
        language: normalized.language,
        cookie: this.serializeCookieSource(normalized.cookie),
      });
      if (!dedupeKey || seen.has(dedupeKey)) return;
      seen.add(dedupeKey);
      candidates.push(normalized);
    };

    cookieCandidates.forEach((candidate) => registerCandidate(candidate));
    registerCandidate(parsedCookie);
    registerCandidate({
      ...((parsedCookie && typeof parsedCookie === 'object' && !Array.isArray(parsedCookie)) ? parsedCookie : {}),
      cookie: parsedCookie?.cookie || parsedCookie?.cookies,
    });

    return candidates;
  }

  /**
   * Try restore zca-js API from saved cookie_text.
   *
   * @param {string} cookieText
   * @returns {Promise<any>}
   */
  async restoreApiFromCookieText(cookieText) {
    const credentialCandidates = this.buildLoginCredentialCandidates(cookieText);
    if (!credentialCandidates.length) {
      throw new Error('COOKIE_TEXT_EMPTY');
    }

    let lastError = null;
    for (const credentials of credentialCandidates) {
      const zalo = new Zalo({
        selfListen: false,
        checkUpdate: true,
        logging: false,
        ...getZaloHttpPolyfillOption(),
      });

      try {
        if (!zalo?.login || typeof zalo.login !== 'function') {
          throw new Error('UNSUPPORTED_ZALO_LOGIN_METHOD');
        }
        const api = await zalo.login(credentials);
        if (api) return api;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error('RESTORE_SESSION_FAILED');
  }

  /**
   * Load account cookie source for auto-restore.
   *
   * @param {object} input
   * @returns {Promise<object|null>}
   */
  async getAccountRestoreSource({ accountId, userId }) {
    const normalizedAccountId = Number.isFinite(parseInt(accountId, 10))
      ? parseInt(accountId, 10)
      : null;
    const normalizedUserId = Number.isFinite(parseInt(userId, 10))
      ? parseInt(userId, 10)
      : null;
    if (!normalizedAccountId || !normalizedUserId) return null;

    const accountResult = await db.query(
      `SELECT id, display_name, status, is_active, cookie_text
       FROM zalo_settings
       WHERE id = $1 AND id_user = $2
       LIMIT 1`,
      [normalizedAccountId, normalizedUserId]
    );
    return accountResult.rows[0] || null;
  }

  /**
   * Best-effort auto-restore account session from cookie_text.
   *
   * @param {object} input
   * @returns {Promise<any|null>}
   */
  async tryAutoRestoreSession({
    accountId,
    userId,
    cookieText,
    fallbackDisplayName = 'Tài khoản Zalo',
  }) {
    const normalizedAccountId = Number.isFinite(parseInt(accountId, 10))
      ? parseInt(accountId, 10)
      : null;
    const normalizedUserId = Number.isFinite(parseInt(userId, 10))
      ? parseInt(userId, 10)
      : null;
    const safeCookieText = String(cookieText || '').trim();
    if (!normalizedAccountId || !normalizedUserId || !safeCookieText) return null;

    try {
      const api = await this.restoreApiFromCookieText(safeCookieText);
      const now = new Date();
      await db.query(
        `UPDATE zalo_settings
         SET status = 'connected',
             is_active = TRUE,
             display_name = COALESCE(NULLIF($1, ''), display_name),
             cookie_text = COALESCE(NULLIF($2, ''), cookie_text),
             last_connected_at = $3,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND id_user = $5`,
        [String(fallbackDisplayName || '').trim(), safeCookieText, now, normalizedAccountId, normalizedUserId]
      );
      zaloAccountSessionService.setAccountApi(normalizedAccountId, api);
      zaloAccountSessionService.startAccountListenerSafely({
        accountId: normalizedAccountId,
        api,
        context: 'tryAutoRestoreSession',
      });
      return api;
    } catch {
      await this.markAccountDisconnected({ accountId: normalizedAccountId, userId: normalizedUserId });
      return null;
    }
  }

  /**
   * Map DB account row to campaign account model.
   *
   * @param {object} account
   * @returns {object}
   */
  mapCampaignZaloAccount(account) {
    const perHourRaw = account.zalo_personal_outbound_per_hour_limit;
    const delayMinRaw = account.zalo_personal_outbound_delay_min_ms;
    const delayMaxRaw = account.zalo_personal_outbound_delay_max_ms;
    const perHour = Number.parseInt(perHourRaw, 10);
    const delayMin = Number.parseInt(delayMinRaw, 10);
    const delayMax = Number.parseInt(delayMaxRaw, 10);
    return {
      id: String(account.id),
      userId: Number.isFinite(Number(account.id_user)) ? Number(account.id_user) : null,
      displayName: account.display_name || 'Tài khoản Zalo',
      status: account.status,
      isActive: account.is_active === true,
      isDefault: account.is_default === true,
      /** Số tin Zalo cá nhân / cửa sổ (1h) riêng cho TK; undefined nếu NULL trong DB → dùng env chung. */
      ...(Number.isFinite(perHour) && perHour > 0
        ? { zaloPersonalOutboundPerHourLimit: perHour }
        : {}),
      /** Delay tối thiểu (ms) giữa 2 tin cá nhân trên TK; undefined nếu không cấu hình. */
      ...(Number.isFinite(delayMin) && delayMin >= 0
        ? { zaloPersonalOutboundDelayMinMs: delayMin }
        : {}),
      /** Delay tối đa (ms) giữa 2 tin cá nhân trên TK; undefined nếu không cấu hình. */
      ...(Number.isFinite(delayMax) && delayMax >= 0
        ? { zaloPersonalOutboundDelayMaxMs: delayMax }
        : {}),
    };
  }

  /**
   * Validate and load one Zalo account row for campaign owner.
   *
   * @param {object} input
   * @returns {Promise<object>}
   */
  async getCampaignZaloAccount({ userId, accountId, roleCode }) {
    const normalizedId = Number.isFinite(parseInt(accountId, 10))
      ? parseInt(accountId, 10)
      : null;
    const isAdmin = isAdminRole(roleCode);
    if (!normalizedId) {
      throw new Error('Chưa chọn tài khoản Zalo gửi');
    }

    const accountResult = await db.query(
      `SELECT id, id_user, display_name, status, is_active, is_default, cookie_text,
              zalo_personal_outbound_per_hour_limit,
              zalo_personal_outbound_delay_min_ms,
              zalo_personal_outbound_delay_max_ms
       FROM zalo_settings
       WHERE id = $1
         ${isAdmin ? '' : 'AND id_user = $2'}
       LIMIT 1`,
      isAdmin ? [normalizedId] : [normalizedId, userId]
    );
    const account = accountResult.rows[0] || null;
    if (!account) {
      throw new Error('Không tìm thấy tài khoản Zalo đã chọn');
    }
    const isConnected = String(account.status || '').trim() === 'connected';
    const isActive = account.is_active === true;
    if (isConnected && isActive) {
      return this.mapCampaignZaloAccount(account);
    }

    // Account can be disconnected after server restart; try auto-restore from saved cookie.
    if (isActive) {
      const restoredApi = await this.tryAutoRestoreSession({
        accountId: normalizedId,
        userId: account.id_user,
        cookieText: account.cookie_text,
        fallbackDisplayName: account.display_name || 'Tài khoản Zalo',
      });
      if (restoredApi) {
        return this.mapCampaignZaloAccount({
          ...account,
          status: 'connected',
          is_active: true,
        });
      }
    }

    if (!isConnected || !isActive) {
      throw new Error('Tài khoản Zalo đã chọn chưa ở trạng thái sẵn sàng');
    }
    return this.mapCampaignZaloAccount(account);
  }

  /**
   * Get in-memory zca-js api instance for an account.
   *
   * @param {string|number} accountId
   * @returns {any}
   */
  getConnectedApiOrThrow(accountId) {
    const api = zaloAccountSessionService.getAccountApi(accountId);
    if (!api) {
      throw new Error(
        'Phiên đăng nhập Zalo của tài khoản đã chọn không còn hiệu lực. Vui lòng đăng nhập lại trong Cài đặt Zalo.'
      );
    }
    return api;
  }

  /**
   * Mark one account as disconnected when session is missing/invalid.
   *
   * @param {object} input
   * @param {string|number} input.accountId
   * @param {string|number} input.userId
   * @returns {Promise<void>}
   */
  async markAccountDisconnected({ accountId, userId }) {
    const normalizedAccountId = Number.isFinite(parseInt(accountId, 10))
      ? parseInt(accountId, 10)
      : null;
    const normalizedUserId = Number.isFinite(parseInt(userId, 10))
      ? parseInt(userId, 10)
      : null;
    if (!normalizedAccountId || !normalizedUserId) return;

    await db.query(
      `UPDATE zalo_settings
       SET status = 'disconnected',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND id_user = $2`,
      [normalizedAccountId, normalizedUserId]
    );
    zaloAccountSessionService.clearAccountApi(normalizedAccountId);
  }

  /**
   * Resolve connected API and keep account status in sync.
   * If session is missing in RAM, mark DB status to disconnected and throw.
   *
   * @param {object} input
   * @param {string|number} input.accountId
   * @param {string|number} input.userId
   * @returns {Promise<any>}
   */
  async getConnectedApiOrSyncStatus({ accountId, userId }) {
    const api = zaloAccountSessionService.getAccountApi(accountId);
    if (api) return api;

    const restoreSource = await this.getAccountRestoreSource({ accountId, userId });
    if (restoreSource?.is_active === true) {
      const restoredApi = await this.tryAutoRestoreSession({
        accountId,
        userId,
        cookieText: restoreSource.cookie_text,
        fallbackDisplayName: restoreSource.display_name || 'Tài khoản Zalo',
      });
      if (restoredApi) return restoredApi;
    }

    await this.markAccountDisconnected({ accountId, userId });
    throw new Error(
      'Phiên đăng nhập Zalo của tài khoản đã chọn không còn hiệu lực. Vui lòng đăng nhập lại trong Cài đặt Zalo.'
    );
  }

  /**
   * Sync account statuses with in-memory API sessions.
   * Connected accounts without RAM session will be auto-restored first,
   * and only accounts that still fail restore will be marked disconnected.
   *
   * @param {object} input
   * @param {string|number} input.userId
   * @param {Array<Record<string, any>>} input.accounts
   * @returns {Promise<Set<string>>}
   */
  async syncDisconnectedAccountsFromMemory({ userId, accounts = [] }) {
    const normalizedUserId = Number.isFinite(parseInt(userId, 10))
      ? parseInt(userId, 10)
      : null;
    if (!normalizedUserId || !Array.isArray(accounts) || accounts.length === 0) {
      return new Set();
    }

    const missingSessionAccounts = accounts
      .filter((account) => {
        const accountId = String(account?.id || '').trim();
        if (!accountId) return false;
        if (String(account?.status || '').trim() !== 'connected') return false;
        if (account?.is_active !== true) return false;
        return !zaloAccountSessionService.getAccountApi(accountId);
      });

    if (!missingSessionAccounts.length) return new Set();

    const disconnectedIds = [];
    for (const account of missingSessionAccounts) {
      const accountId = Number.parseInt(account.id, 10);
      if (!Number.isFinite(accountId)) {
        continue;
      }

      const restoreSource = await this.getAccountRestoreSource({
        accountId,
        userId: normalizedUserId,
      });
      if (restoreSource?.is_active === true) {
        const restoredApi = await this.tryAutoRestoreSession({
          accountId,
          userId: normalizedUserId,
          cookieText: restoreSource.cookie_text,
          fallbackDisplayName:
            String(restoreSource.display_name || '').trim()
            || String(account?.display_name || '').trim()
            || 'Tài khoản Zalo',
        });
        if (restoredApi) {
          continue;
        }
      }

      disconnectedIds.push(accountId);
    }

    if (!disconnectedIds.length) return new Set();

    await db.query(
      `UPDATE zalo_settings
       SET status = 'disconnected',
           updated_at = CURRENT_TIMESTAMP
       WHERE id_user = $1
         AND id = ANY($2::bigint[])`,
      [normalizedUserId, disconnectedIds]
    );
    disconnectedIds.forEach((id) => zaloAccountSessionService.clearAccountApi(id));

    return new Set(disconnectedIds.map((id) => String(id)));
  }

  /**
   * Find user uid from phone number.
   *
   * @param {any} api
   * @param {string} phone
   * @returns {Promise<string>}
   */
  async resolveUidFromPhone(api, phone) {
    const safePhone = String(phone || '').trim();
    if (!safePhone) throw new Error('Thiếu số điện thoại');
    const userInfo = await executeWithZaloTimeoutRetry({
      operationName: 'resolve_uid_from_phone',
      operation: () => api.findUser(safePhone),
      onRetry: ({ attempt, maxAttempts, delayMs }) => {
        console.warn(
          `[ZaloRetry] op=resolve_uid_from_phone attempt=${attempt}/${maxAttempts} `
          + `next_delay_ms=${delayMs} phone=${safePhone}`
        );
      },
    });
    const uid = String(userInfo?.uid || '').trim();
    if (!uid) {
      throw new Error(`Không tìm thấy user Zalo theo số ${safePhone}`);
    }
    return uid;
  }

  /**
   * Resolve uid from recipient value by selected type.
   *
   * @param {object} input
   * @param {any} input.api
   * @param {string} input.recipient
   * @param {'phone'|'uid'} [input.recipientType]
   * @returns {Promise<string>}
   */
  async resolveUidFromRecipient({ api, recipient, recipientType = 'phone' }) {
    const normalizedRecipientType = String(recipientType || 'phone').trim().toLowerCase();
    const safeRecipient = String(recipient || '').trim();
    if (!safeRecipient) {
      throw new Error(normalizedRecipientType === 'uid' ? 'Thiếu UID người nhận' : 'Thiếu số điện thoại');
    }
    if (normalizedRecipientType === 'uid') {
      return safeRecipient;
    }
    return this.resolveUidFromPhone(api, safeRecipient);
  }

  /**
   * Đẩy job gửi tin Zalo cá nhân vào BullMQ.
   * Payload chỉ chứa dữ liệu serialize được; API session sẽ được worker tự resolve.
   *
   * @param {object} input
   * @param {string|number} input.userId
   * @param {string|number} input.accountId
   * @param {string} input.recipient
   * @param {'phone'|'uid'} [input.recipientType]
   * @param {string} input.message
   * @param {Array<any>} [input.attachments]
   * @returns {Promise<object>}
   */
  async sendPersonalMessageQueued({
    userId,
    accountId,
    recipient,
    recipientType = 'phone',
    message,
    attachments = [],
  }) {
    return outboundMessageQueueService.enqueueAndWait({
      type: OUTBOUND_MESSAGE_JOB_TYPES.ZALO_PERSONAL_SEND,
      payload: {
        userId,
        accountId,
        recipient,
        recipientType,
        message,
        attachments,
      },
    });
  }

  /**
   * Thực thi job gửi Zalo cá nhân từ worker BullMQ.
   *
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async sendPersonalMessageByQueue(payload = {}) {
    const api = await this.getConnectedApiOrSyncStatus({
      accountId: payload?.accountId,
      userId: payload?.userId,
    });
    const revivedAttachments = this.reviveZaloAttachmentSourcesFromQueue(payload?.attachments);
    return this.sendPersonalMessage({
      api,
      recipient: payload?.recipient,
      recipientType: payload?.recipientType,
      message: payload?.message,
      attachments: revivedAttachments,
    });
  }

  /**
   * Send personal message to one recipient (phone or uid).
   *
   * @param {object} input
   * @param {any} input.api
   * @param {string} input.recipient
   * @param {'phone'|'uid'} [input.recipientType]
   * @param {string} input.message
   * @returns {Promise<object>}
   */
  async sendPersonalMessage({
    api,
    recipient,
    recipientType = 'phone',
    message,
    attachments = [],
  }) {
    const normalizedRecipientType = String(recipientType || 'phone').trim().toLowerCase() === 'uid'
      ? 'uid'
      : 'phone';
    const normalizedRecipient = String(recipient || '').trim();
    const uid = await this.resolveUidFromRecipient({
      api,
      recipient: normalizedRecipient,
      recipientType: normalizedRecipientType,
    });
    const sendResult = await this.sendMessageWithAttachmentDispatch({
      operationName: 'send_personal_message',
      message,
      attachments,
      sendOperation: (payload) => api.sendMessage(payload, uid),
      logIdentity: normalizedRecipient,
    });
    return {
      recipient: normalizedRecipient,
      recipientType: normalizedRecipientType,
      phone: normalizedRecipientType === 'phone' ? normalizedRecipient : '',
      uid,
      attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
      status: 'success',
      response: sendResult.response || null,
      dispatchCount: sendResult.dispatchCount || 0,
    };
  }

  /**
   * Đẩy job gửi lời mời kết bạn vào BullMQ.
   *
   * @param {object} input
   * @param {string|number} input.userId
   * @param {string|number} input.accountId
   * @param {string} input.phone
   * @param {string} input.message
   * @returns {Promise<object>}
   */
  async sendFriendRequestQueued({ userId, accountId, phone, message }) {
    return outboundMessageQueueService.enqueueAndWait({
      type: OUTBOUND_MESSAGE_JOB_TYPES.ZALO_FRIEND_REQUEST_SEND,
      payload: {
        userId,
        accountId,
        phone,
        message,
      },
    });
  }

  /**
   * Thực thi job gửi lời mời kết bạn từ worker BullMQ.
   *
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async sendFriendRequestByQueue(payload = {}) {
    const api = await this.getConnectedApiOrSyncStatus({
      accountId: payload?.accountId,
      userId: payload?.userId,
    });
    return this.sendFriendRequest({
      api,
      phone: payload?.phone,
      message: payload?.message,
    });
  }

  /**
   * Send friend request to one phone number.
   *
   * @param {object} input
   * @returns {Promise<object>}
   */
  async sendFriendRequest({ api, phone, message }) {
    const uid = await this.resolveUidFromPhone(api, phone);
    const sendResponse = await executeWithZaloTimeoutRetry({
      operationName: 'send_friend_request',
      operation: () => api.sendFriendRequest(String(message || ''), uid),
      onRetry: ({ attempt, maxAttempts, delayMs }) => {
        console.warn(
          `[ZaloRetry] op=send_friend_request attempt=${attempt}/${maxAttempts} `
          + `next_delay_ms=${delayMs} phone=${String(phone || '').trim()}`
        );
      },
    });
    return {
      phone: String(phone || '').trim(),
      uid,
      status: 'success',
      response: sendResponse || null,
    };
  }

  /**
   * Load all group ids from current account for validation.
   *
   * @param {any} api
   * @returns {Promise<Set<string>>}
   */
  async getAllGroupIdSet(api) {
    const groupResp = await executeWithZaloTimeoutRetry({
      operationName: 'get_all_groups',
      operation: () => api.getAllGroups(),
      onRetry: ({ attempt, maxAttempts, delayMs }) => {
        console.warn(
          `[ZaloRetry] op=get_all_groups attempt=${attempt}/${maxAttempts} `
          + `next_delay_ms=${delayMs}`
        );
      },
    });
    const groups = this.extractGroupsFromResponse(groupResp);
    return new Set(groups.map((item) => String(item.groupId || '').trim()).filter(Boolean));
  }

  /**
   * Lấy danh sách bạn bè với cơ chế retry timeout cho API Zalo.
   *
   * @param {any} api
   * @param {number|undefined} count
   * @param {number|undefined} page
   * @returns {Promise<any>}
   */
  async getAllFriendsWithRetry(api, count, page) {
    return executeWithZaloTimeoutRetry({
      operationName: 'get_all_friends',
      operation: () => api.getAllFriends(count, page),
      onRetry: ({ attempt, maxAttempts, delayMs }) => {
        console.warn(
          `[ZaloRetry] op=get_all_friends attempt=${attempt}/${maxAttempts} `
          + `next_delay_ms=${delayMs} count=${count ?? ''} page=${page ?? ''}`
        );
      },
    });
  }

  /**
   * Lấy danh sách nhóm với cơ chế retry timeout cho API Zalo.
   *
   * @param {any} api
   * @returns {Promise<any>}
   */
  async getAllGroupsWithRetry(api) {
    return executeWithZaloTimeoutRetry({
      operationName: 'get_all_groups',
      operation: () => api.getAllGroups(),
      onRetry: ({ attempt, maxAttempts, delayMs }) => {
        console.warn(
          `[ZaloRetry] op=get_all_groups attempt=${attempt}/${maxAttempts} next_delay_ms=${delayMs}`
        );
      },
    });
  }

  /**
   * Đẩy job gửi tin nhắn nhóm vào BullMQ.
   *
   * @param {object} input
   * @param {string|number} input.userId
   * @param {string|number} input.accountId
   * @param {string} input.groupId
   * @param {string} input.message
   * @param {Array<any>} [input.attachments]
   * @returns {Promise<object>}
   */
  async sendGroupMessageQueued({
    userId,
    accountId,
    groupId,
    message,
    attachments = [],
  }) {
    return outboundMessageQueueService.enqueueAndWait({
      type: OUTBOUND_MESSAGE_JOB_TYPES.ZALO_GROUP_SEND,
      payload: {
        userId,
        accountId,
        groupId,
        message,
        attachments,
      },
    });
  }

  /**
   * Thực thi job gửi Zalo nhóm từ worker BullMQ.
   *
   * @param {object} payload
   * @returns {Promise<object>}
   */
  async sendGroupMessageByQueue(payload = {}) {
    const api = await this.getConnectedApiOrSyncStatus({
      accountId: payload?.accountId,
      userId: payload?.userId,
    });
    const revivedAttachments = this.reviveZaloAttachmentSourcesFromQueue(payload?.attachments);
    return this.sendGroupMessage({
      api,
      groupId: payload?.groupId,
      message: payload?.message,
      attachments: revivedAttachments,
    });
  }

  /**
   * Phục hồi attachment source sau khi payload đi qua BullMQ/Redis.
   *
   * Luồng hoạt động:
   * 1. Chuẩn hóa danh sách attachment từ payload job.
   * 2. Khôi phục `data` về đúng kiểu `Buffer` (Redis serialize sẽ thành object JSON).
   * 3. Bổ sung metadata tối thiểu để zca-js xử lý file ổn định.
   *
   * @param {Array<any>} attachments
   * @returns {Array<{data: Buffer, filename: string, metadata: {totalSize: number, width?: number, height?: number}}>}
   */
  reviveZaloAttachmentSourcesFromQueue(attachments = []) {
    const source = Array.isArray(attachments) ? attachments : [];
    if (!source.length) return [];

    return source.map((item) => {
      if (!item || typeof item !== 'object') return null;

      const rawData = item.data;
      let bufferData = null;
      if (Buffer.isBuffer(rawData)) {
        bufferData = rawData;
      } else if (
        rawData
        && typeof rawData === 'object'
        && String(rawData.type || '').trim().toLowerCase() === 'buffer'
        && Array.isArray(rawData.data)
      ) {
        bufferData = Buffer.from(rawData.data);
      }
      if (!bufferData) return null;

      const normalizedFilename = String(item.filename || '').trim() || 'zalo_attachment.bin';
      const metadata = item.metadata && typeof item.metadata === 'object'
        ? { ...item.metadata }
        : {};
      const normalizedTotalSize = Number.parseInt(metadata.totalSize, 10);
      if (!Number.isFinite(normalizedTotalSize) || normalizedTotalSize <= 0) {
        metadata.totalSize = bufferData.length;
      }

      return {
        ...item,
        data: bufferData,
        filename: normalizedFilename,
        metadata,
      };
    }).filter(Boolean);
  }

  /**
   * Send message to one group id.
   *
   * @param {object} input
   * @returns {Promise<object>}
   */
  async sendGroupMessage({ api, groupId, message, attachments = [] }) {
    const normalizedGroupId = String(groupId || '').trim();
    if (!normalizedGroupId) throw new Error('Thiếu group id');
    const sendResult = await this.sendMessageWithAttachmentDispatch({
      operationName: 'send_group_message',
      message,
      attachments,
      sendOperation: (payload) => api.sendMessage(payload, normalizedGroupId, ThreadType.Group),
      logIdentity: normalizedGroupId,
    });
    return {
      groupId: normalizedGroupId,
      attachmentsCount: Array.isArray(attachments) ? attachments.length : 0,
      status: 'success',
      response: sendResult.response || null,
      dispatchCount: sendResult.dispatchCount || 0,
    };
  }
}

export default new CampaignZaloSenderService();
