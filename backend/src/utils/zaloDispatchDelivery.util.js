export const ZALO_SEND_NOT_DELIVERED_MARKER = '[ZALO_SEND_NOT_DELIVERED]';
export const ZALO_SEND_NOT_DELIVERED_CODE = 'ZALO_SEND_NOT_DELIVERED';
export const ZALO_SEND_PARTIAL_DELIVERY_CODE = 'ZALO_SEND_PARTIAL_DELIVERY';
export const ZALO_SILENT_DROP_CATEGORY = 'ZALO_SILENT_DROP';
export const ZALO_PARTIAL_DELIVERY_CATEGORY = 'ZALO_PARTIAL_DELIVERY';

export const ZALO_SILENT_DROP_LABEL = 'Zalo không xác nhận phát tin';
export const ZALO_PARTIAL_DELIVERY_LABEL = 'Zalo chỉ xác nhận một phần tin';

const POSITIVE_MSG_ID_RE = /^[1-9][0-9]*$/;

/**
 * msgId hợp lệ: nguyên dương dạng number/bigint hoặc chuỗi chỉ gồm chữ số, bắt đầu 1-9.
 * Không ép toàn bộ sang Number — id thật có thể lớn hơn MAX_SAFE_INTEGER.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isPositiveZaloMsgId(value) {
  if (value == null || value === '') return false;
  if (typeof value === 'bigint') return value > 0n;
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value <= 0) return false;
    return POSITIVE_MSG_ID_RE.test(String(value));
  }
  return POSITIVE_MSG_ID_RE.test(String(value).trim());
}

function toMsgIdString(value) {
  if (!isPositiveZaloMsgId(value)) return null;
  if (typeof value === 'bigint') return value.toString(10);
  return String(value).trim();
}

/**
 * @param {object|null|undefined} response
 * @returns {string[]}
 */
export function extractValidZaloMsgIds(response) {
  const ids = [];
  const messageId = toMsgIdString(response?.message?.msgId);
  if (messageId) ids.push(messageId);
  const attachments = Array.isArray(response?.attachment) ? response.attachment : [];
  attachments.forEach((item) => {
    const id = toMsgIdString(item?.msgId);
    if (id) ids.push(id);
  });
  return ids;
}

function dispatchHasText(dispatch) {
  return String(dispatch?.msg || '').trim() !== '';
}

/**
 * @param {object} input
 * @param {{ type?: string, msg?: string, attachments?: Array<any> }} [input.dispatch]
 * @param {object|null|undefined} [input.response]
 * @returns {{ status: 'delivered'|'not_delivered'|'partial', msgIds: string[], failedComponents: Array<object> }}
 */
export function classifyZaloDispatchDelivery({ dispatch = {}, response = null } = {}) {
  const type = String(dispatch?.type || 'text');
  const failedComponents = [];
  const msgIds = [];
  const textRequired = type === 'text' || (type === 'file_single' && dispatchHasText(dispatch));
  const expectAttachments = type !== 'text';

  if (textRequired) {
    const textId = toMsgIdString(response?.message?.msgId);
    if (textId) msgIds.push(textId);
    else failedComponents.push({ kind: 'text' });
  }

  if (expectAttachments) {
    const expected = Array.isArray(dispatch?.attachments) ? dispatch.attachments.length : 0;
    const returned = Array.isArray(response?.attachment) ? response.attachment : [];
    if (expected <= 0) {
      failedComponents.push({ kind: 'attachment', index: 0 });
    } else {
      for (let index = 0; index < expected; index += 1) {
        const attachmentId = toMsgIdString(returned[index]?.msgId);
        if (attachmentId) msgIds.push(attachmentId);
        else failedComponents.push({ kind: 'attachment', index });
      }
    }
  }

  const expectedCount = (textRequired ? 1 : 0)
    + (expectAttachments ? Math.max(Array.isArray(dispatch?.attachments) ? dispatch.attachments.length : 0, 1) : 0);
  const failedCount = failedComponents.length;
  const successCount = Math.max(0, expectedCount - failedCount);

  let status = 'delivered';
  if (failedCount <= 0) status = 'delivered';
  else if (successCount <= 0) status = 'not_delivered';
  else status = 'partial';

  return { status, msgIds, failedComponents };
}

function probeErrorText(error) {
  if (error == null) return '';
  if (typeof error === 'string') return error;
  if (typeof error !== 'object') return String(error);
  return [error.code, error.message, error.failedReason]
    .filter((part) => part != null && String(part).trim() !== '')
    .join(' ');
}

/**
 * @param {{ operationName?: string, dispatchIndex?: number, dispatchCount?: number }} [meta]
 * @returns {Error}
 */
export function createZaloSendNotDeliveredError(meta = {}) {
  const operationName = String(meta.operationName || '').trim();
  const dispatchIndex = Number.parseInt(meta.dispatchIndex, 10);
  const dispatchCount = Number.parseInt(meta.dispatchCount, 10);
  const parts = [];
  if (operationName) parts.push(`op=${operationName}`);
  if (Number.isFinite(dispatchIndex) && dispatchIndex >= 0) {
    const current = dispatchIndex + 1;
    const total = Number.isFinite(dispatchCount) && dispatchCount > 0 ? dispatchCount : '?';
    parts.push(`dispatch=${current}/${total}`);
  }
  const suffix = parts.length ? ` ${parts.join(' ')}` : '';
  const error = new Error(`${ZALO_SEND_NOT_DELIVERED_MARKER} Zalo did not confirm delivery${suffix}`);
  error.code = ZALO_SEND_NOT_DELIVERED_CODE;
  return error;
}

/**
 * @param {unknown} error
 * @returns {boolean}
 */
export function isZaloSendNotDeliveredError(error) {
  const probe = probeErrorText(error);
  return probe.includes(ZALO_SEND_NOT_DELIVERED_MARKER)
    || probe.includes(ZALO_SEND_NOT_DELIVERED_CODE);
}

/**
 * @param {unknown} result
 * @returns {boolean}
 */
export function isZaloPartialDeliveryResult(result) {
  if (!result || typeof result !== 'object') return false;
  return result.status === 'partial'
    || result.code === ZALO_SEND_PARTIAL_DELIVERY_CODE
    || result.errorCategory === ZALO_PARTIAL_DELIVERY_CATEGORY;
}

/**
 * Map completed partial result → tracking/execution fields. Không tạo Error.
 *
 * @param {object} [result]
 * @returns {{
 *   code: string,
 *   errorCategory: string,
 *   errorLabel: string,
 *   errorStage: string,
 *   hint: string,
 *   dispatchCount: number|null,
 *   failedDispatchIndex: number|null,
 * }}
 */
export function mapZaloPartialDelivery(result = {}) {
  const failedIndex = Number.parseInt(result?.failedDispatch?.index, 10);
  const dispatchCount = Number.parseInt(result?.dispatchCount, 10);
  return {
    code: ZALO_SEND_PARTIAL_DELIVERY_CODE,
    errorCategory: ZALO_PARTIAL_DELIVERY_CATEGORY,
    errorLabel: ZALO_PARTIAL_DELIVERY_LABEL,
    errorStage: 'send',
    hint: 'Một phần tin đã tới; không tự gửi lại toàn bộ để tránh trùng.',
    dispatchCount: Number.isFinite(dispatchCount) ? dispatchCount : null,
    failedDispatchIndex: Number.isFinite(failedIndex) ? failedIndex : null,
  };
}

/**
 * @param {Array<{ delivery?: { status?: string, msgIds?: string[] }, msgIds?: string[] }>} [dispatchResults]
 * @returns {string[]}
 */
export function collectDeliveredZaloMsgIds(dispatchResults = []) {
  const ids = [];
  (Array.isArray(dispatchResults) ? dispatchResults : []).forEach((row) => {
    const deliveryStatus = row?.delivery?.status;
    if (deliveryStatus !== 'delivered' && deliveryStatus !== 'partial') return;
    const rowIds = Array.isArray(row?.msgIds) && row.msgIds.length
      ? row.msgIds
      : (Array.isArray(row?.delivery?.msgIds) ? row.delivery.msgIds : []);
    rowIds.forEach((id) => {
      const normalized = toMsgIdString(id);
      if (normalized) ids.push(normalized);
    });
  });
  return [...new Set(ids)];
}

/**
 * @param {object} sendResult
 * @returns {object}
 */
export function withZaloPartialDeliveryFields(sendResult = {}) {
  if (!isZaloPartialDeliveryResult(sendResult)) return sendResult;
  return {
    ...sendResult,
    ...mapZaloPartialDelivery(sendResult),
    status: 'partial',
  };
}

/**
 * Continuous drip: success và partial (advanceLedger) đều tiến step hiện tại.
 * Silent drop / lỗi gửi generic: success=false, không advanceLedger → giữ pending.
 *
 * @param {{ success?: boolean, advanceLedger?: boolean }|null|undefined} sendOutcome
 * @returns {boolean}
 */
export function shouldAdvanceZaloContinuousLedger(sendOutcome) {
  return sendOutcome?.success === true || sendOutcome?.advanceLedger === true;
}

/**
 * One-shot: chỉ tiến khi gửi đủ success. Partial không sang template sau trong cùng lượt.
 *
 * @param {{ success?: boolean, advanceLedger?: boolean }|null|undefined} sendOutcome
 * @returns {boolean}
 */
export function shouldAdvanceZaloOneShotLedger(sendOutcome) {
  return sendOutcome?.success === true;
}

/**
 * @param {object} [sendResult]
 * @returns {{ success: false, advanceLedger: true, status: 'partial', delivery: object|null }}
 */
export function buildZaloPartialCampaignOutcome(sendResult) {
  return {
    success: false,
    advanceLedger: true,
    status: 'partial',
    delivery: sendResult || null,
  };
}

/**
 * Completed outbound (không throw) chỉ là success nghiệp vụ khi status==='success'.
 * Diagnostic dryRun không gửi nên được phép coi là thành công giả lập.
 *
 * @param {object|null|undefined} result
 * @param {{ allowDryRun?: boolean }} [options]
 * @returns {boolean}
 */
export function isZaloOutboundResultSuccessful(result, { allowDryRun = false } = {}) {
  if (!result || typeof result !== 'object') return false;
  if (allowDryRun && result.dryRun === true) return true;
  return result.status === 'success' || (result.success === true && result.status !== 'failed' && result.status !== 'partial' && !result.error);
}

/**
 * Map completed non-success result cho preview/diagnostic. Không tạo Error.
 *
 * @param {object} [result]
 * @returns {ReturnType<typeof mapZaloPartialDelivery>|{
 *   code: string,
 *   errorCategory: string,
 *   errorLabel: string,
 *   errorStage: string,
 *   hint: string|null,
 *   dispatchCount: number|null,
 *   failedDispatchIndex: number|null,
 * }}
 */
export function describeZaloOutboundFailure(result = {}) {
  if (isZaloPartialDeliveryResult(result)) return mapZaloPartialDelivery(result);
  const failedIndex = Number.parseInt(result?.failedDispatch?.index, 10);
  const dispatchCount = Number.parseInt(result?.dispatchCount, 10);
  return {
    code: result.code || 'SEND_ERROR',
    errorCategory: result.errorCategory || 'UNKNOWN',
    errorLabel: result.errorLabel || result.error || ZALO_SILENT_DROP_LABEL,
    errorStage: result.errorStage || 'send',
    hint: null,
    dispatchCount: Number.isFinite(dispatchCount) ? dispatchCount : null,
    failedDispatchIndex: Number.isFinite(failedIndex) ? failedIndex : null,
  };
}

/**
 * Đếm lỗi gửi liên tiếp cho continuous Zalo. Partial không đi hàm này.
 *
 * @param {{ prevFailureCount?: number, maxFailures?: number }} [input]
 * @returns {{ nextFailureCount: number, abandon: boolean, keepStepPending: boolean }}
 */
export function resolveZaloContinuousSendFailureProgress({
  prevFailureCount = 0,
  maxFailures = 5,
} = {}) {
  const prev = Math.max(0, Number.parseInt(prevFailureCount, 10) || 0);
  const parsedMax = Number.parseInt(maxFailures, 10);
  const max = Number.isFinite(parsedMax) && parsedMax >= 0 ? parsedMax : 5;
  const nextFailureCount = prev + 1;
  const abandon = max > 0 && nextFailureCount >= max;
  return {
    nextFailureCount,
    abandon,
    keepStepPending: !abandon,
  };
}
