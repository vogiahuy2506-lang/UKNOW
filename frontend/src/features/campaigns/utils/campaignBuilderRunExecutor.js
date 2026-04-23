import { campaignFlowHasZaloPoolMulti } from './campaignBuilderFlow';
import {
  cloneResultForBuilderLogDisplay,
  resolveEffectiveBuilderLogItemsMode,
} from './builderLogItems.util.js';

/**
 * Execute preview campaign run with realtime node-log upsert behavior.
 *
 * This function preserves builder execution-log conventions:
 * - stable log id per node-run (`node-{nodeId}-{runToken}`)
 * - upsert for progress and final status on the same log id
 * - run-level start/end (or cancel) logs
 *
 * @param {Object} params execution dependencies and mutable refs
 * @param {string} [params.logItemsMode] `'100'` (mặc định) cắt `output.items` trên log UI; `'all'` giữ nguyên
 * @returns {Promise<void>}
 */
export const executeCampaignRun = async (params) => {
  const {
    isRunning,
    nodes,
    edges,
    toastNotifier,
    setShowRunLogs,
    setRunLogs,
    setIsRunning,
    setSelectedRunLogId,
    runTokenRef,
    runAbortControllerRef,
    buildExecutionOrder,
    validateNodeForRun,
    buildRunResultForNode,
    isRunCancelledError,
    upsertRunLog,
    buildNodeRealtimeLog,
    addRunLog,
    sleep,
    interZaloNodeDelayMs = 0,
    isZaloNode,
    nodeFailureRetryCount = 1,
    nodeFailureRetryDelayMs = 800,
    logItemsMode = '100',
  } = params;

  if (isRunning) return;
  if (!nodes.length) {
    toastNotifier.error('Chưa có node để chạy');
    return;
  }

  const hasTrigger = nodes.some((n) => {
    const t = n.data?.nodeType || n.type;
    return t && (t.includes('trigger') || t === 'start');
  });

  if (!hasTrigger) {
    toastNotifier.error('Chiến dịch phải có node khởi chạy');
    return;
  }

  setShowRunLogs(true);
  setRunLogs([]);
  setIsRunning(true);
  setSelectedRunLogId(null);

  const runToken = Date.now();
  const runAbortController = new AbortController();
  runTokenRef.current = runToken;
  runAbortControllerRef.current = runAbortController;
  const buildAbortError = () => {
    const error = new Error('Run cancelled');
    error.name = 'AbortError';
    error.code = 'ERR_CANCELED';
    return error;
  };
  const sleepWithAbort = async (ms) => {
    const waitMs = Math.max(0, Number.parseInt(ms, 10) || 0);
    if (waitMs <= 0) return;
    if (runAbortController.signal.aborted) {
      throw buildAbortError();
    }
    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        runAbortController.signal.removeEventListener('abort', onAbort);
        resolve();
      }, waitMs);
      const onAbort = () => {
        clearTimeout(timeoutId);
        runAbortController.signal.removeEventListener('abort', onAbort);
        reject(buildAbortError());
      };
      runAbortController.signal.addEventListener('abort', onAbort, { once: true });
    });
  };

  addRunLog({
    id: `run-start-${runToken}`,
    status: 'info',
    message: 'Bắt đầu chạy chiến dịch',
    timestamp: new Date(),
  });
  setSelectedRunLogId(`run-start-${runToken}`);

  const nodeIdSet = new Set(nodes.map((n) => String(n.id ?? '')));
  const normalizedNodes = nodes.map((n) => ({ ...n, id: String(n.id ?? '') }));
  const normalizedEdges = (edges || [])
    .map((e) => ({ ...e, source: String(e.source ?? ''), target: String(e.target ?? '') }))
    .filter((e) => nodeIdSet.has(String(e.source)) && nodeIdSet.has(String(e.target)));
  const executionOrder = buildExecutionOrder(normalizedNodes, normalizedEdges);
  /** Pool đa TK: bỏ «Lấy danh sách bạn bè» khỏi preview — không gọi API và không hiện như bước chạy. */
  const skipGetAllFriendsInPreview = campaignFlowHasZaloPoolMulti(normalizedNodes);
  const previewExecutionOrder = skipGetAllFriendsInPreview
    ? executionOrder.filter((n) => String(n?.data?.nodeType || n?.type || '').trim() !== 'get_all_friends')
    : executionOrder;

  const ctx = {
    sheetRows: null,
    mapping: null,
    templateCache: new Map(),
    nodeResultsByName: {},
    nodeResultsById: {},
    recipientProgressByNode: new Map(),
  };

  const isZaloExecutionNode = typeof isZaloNode === 'function'
    ? isZaloNode
    : (node) => defaultIsZaloExecutionNode(node?.data?.nodeType || node?.type);
  const maxNodeRetryCount = Math.max(0, Number.parseInt(nodeFailureRetryCount, 10) || 0);
  const retryDelayMs = Math.max(0, Number.parseInt(nodeFailureRetryDelayMs, 10) || 0);
  let previousNode = null;
  let runStoppedByFailure = null;

  /**
   * Chạy một node với cơ chế retry khi lỗi runtime.
   *
   * Luồng hoạt động:
   * 1. Thử chạy node lần đầu và các lần retry theo `maxNodeRetryCount`.
   * 2. Nếu lỗi và còn lượt retry, cập nhật realtime log để báo đang thử lại.
   * 3. Nếu đã hết lượt retry vẫn lỗi, trả validation failed để dừng toàn bộ luồng.
   *
   * @param {Object} args dữ liệu cần để chạy node
   * @param {Object} args.node node đang chạy
   * @param {Object} args.ctx context tích lũy kết quả
   * @param {string} args.nodeType loại node
   * @param {string} args.nodeName tên hiển thị node
   * @param {string} args.nodeLogId id log realtime của node
   * @param {number} args.runToken token của lượt chạy
   * @returns {Promise<{validation: {status: string, message: string}, result: Object|null}>}
   */
  const runNodeWithRetry = async ({ node, ctx, nodeType, nodeName, nodeLogId, runToken }) => {
    const maxAttempts = maxNodeRetryCount + 1;
    let lastError = null;
    /** Cắt `items` trên log realtime giống bản ghi cuối — tránh treo UI khi node gửi nhiều dòng. */
    const effectiveProgressLogMode = resolveEffectiveBuilderLogItemsMode(
      nodeType,
      node.data?.config,
      logItemsMode
    );

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const result = await buildRunResultForNode(node, ctx, {
          onProgress: (progressData) => {
            if (runTokenRef.current !== runToken) return;
            const progressResult = progressData?.result
              ? cloneResultForBuilderLogDisplay(progressData.result, effectiveProgressLogMode)
              : null;
            upsertRunLog(
              buildNodeRealtimeLog({
                id: nodeLogId,
                status: progressData?.status || 'info',
                nodeId: node.id,
                nodeType,
                nodeName,
                message: progressData?.message || `Đang chạy node ${nodeName}`,
                result: progressResult,
              })
            );
            // Auto focus current node log so realtime item rows are visible while running.
            setSelectedRunLogId(nodeLogId);
          },
          signal: runAbortController.signal,
        });
        return {
          validation: buildNodeSuccessValidation(nodeType, result),
          result,
        };
      } catch (error) {
        if (runTokenRef.current !== runToken || isRunCancelledError(error)) {
          throw error;
        }
        lastError = error;
        const currentFailureMessage = getNodeFailureMessage(nodeType, error);
        if (attempt >= maxAttempts) {
          return {
            validation: { status: 'failed', message: currentFailureMessage },
            result: {
              input: node.data?.config || {},
              output: { ok: false, error: currentFailureMessage },
            },
          };
        }
        upsertRunLog(
          buildNodeRealtimeLog({
            id: nodeLogId,
            nodeId: node.id,
            nodeType,
            nodeName,
            status: 'warning',
            message: (
              `Node ${nodeName} lỗi ở lần ${attempt}/${maxAttempts}. ` +
              `Đang thử lại lần ${attempt + 1}/${maxAttempts}...`
            ),
            result: {
              input: node.data?.config || {},
              output: {
                ok: false,
                error: currentFailureMessage,
                meta: { attempt, maxAttempts, retrying: true },
              },
            },
          })
        );
        if (retryDelayMs > 0) {
          await sleepWithAbort(retryDelayMs);
        } else if (typeof sleep === 'function') {
          await sleep(0);
        }
      }
    }

    const fallbackMessage = getNodeFailureMessage(nodeType, lastError);
    return {
      validation: { status: 'failed', message: fallbackMessage },
      result: {
        input: node.data?.config || {},
        output: { ok: false, error: fallbackMessage },
      },
    };
  };

  for (const node of previewExecutionOrder) {
    if (runTokenRef.current !== runToken) break;

    const shouldDelayBetweenZaloNodes = (
      interZaloNodeDelayMs > 0
      && previousNode
      && isZaloExecutionNode(previousNode)
      && isZaloExecutionNode(node)
    );
    if (shouldDelayBetweenZaloNodes) {
      console.info(
        `[CampaignBuilder][PreviewDelay] Giua 2 node Zalo lien tiep: ${interZaloNodeDelayMs}ms ` +
        `(from=${String(previousNode?.id || '')} to=${String(node?.id || '')})`
      );
      try {
        await sleepWithAbort(interZaloNodeDelayMs);
      } catch (error) {
        if (isRunCancelledError(error)) break;
        throw error;
      }
      if (runTokenRef.current !== runToken) break;
    }

    const nodeName = node.data?.label || node.data?.nodeType || node.type || 'Node';

    try {
      await sleepWithAbort(400);
    } catch (error) {
      if (isRunCancelledError(error)) break;
      throw error;
    }
    if (runTokenRef.current !== runToken) break;
    let validation = validateNodeForRun(node);
    const nodeType = node.data?.nodeType || node.type;
    let result = null;
    const nodeLogId = `node-${node.id}-${runToken}`;

    if (validation.status === 'success') {
      upsertRunLog(
        buildNodeRealtimeLog({
          id: nodeLogId,
          nodeId: node.id,
          nodeType,
          nodeName,
          message: `Đang chạy node ${nodeName}`,
          status: 'info',
          result: null,
        })
      );
      try {
        const nodeRunResult = await runNodeWithRetry({
          node,
          ctx,
          nodeType,
          nodeName,
          nodeLogId,
          runToken,
        });
        validation = nodeRunResult.validation;
        result = nodeRunResult.result;
      } catch (error) {
        if (runTokenRef.current !== runToken || isRunCancelledError(error)) {
          break;
        }
        const msg = getNodeFailureMessage(nodeType, error);
        validation = { status: 'failed', message: msg };
        result = {
          input: node.data?.config || {},
          output: { ok: false, error: msg },
        };
      }
    }
    // Log UI: cắt `output.items` theo chế độ hiệu dụng (node Sheet có thể yêu cầu >100 dòng); `ctx` giữ `result` đầy đủ.
    const effectiveLogMode = resolveEffectiveBuilderLogItemsMode(
      nodeType,
      node.data?.config,
      logItemsMode
    );
    const resultForLog = cloneResultForBuilderLogDisplay(result, effectiveLogMode);
    const logEntry = {
      id: nodeLogId,
      status: validation.status,
      nodeId: node.id,
      nodeType,
      nodeName,
      message: validation.message,
      timestamp: new Date(),
      result: resultForLog,
    };
    upsertRunLog(buildNodeRealtimeLog(logEntry));
    setSelectedRunLogId(logEntry.id);

    if (validation.status === 'failed') {
      runStoppedByFailure = {
        nodeId: node.id,
        nodeName,
        message: validation.message,
      };
      break;
    }

    if (result) {
      ctx.nodeResultsByName[nodeName] = result;
      ctx.nodeResultsById[node.id] = result;
    }
    previousNode = node;
  }

  if (runTokenRef.current === runToken && runStoppedByFailure) {
    addRunLog({
      id: `run-failed-${runToken}`,
      status: 'failed',
      message: (
        `Dừng chạy chiến dịch tại node ${runStoppedByFailure.nodeName}: ` +
        `${runStoppedByFailure.message}`
      ),
      timestamp: new Date(),
    });
  } else if (runTokenRef.current === runToken) {
    addRunLog({
      id: `run-end-${runToken}`,
      status: 'info',
      message: 'Hoàn tất chạy chiến dịch',
      timestamp: new Date(),
    });
  } else {
    addRunLog({
      id: `run-cancel-${runToken}`,
      status: 'warning',
      message: 'Đã dừng chạy chiến dịch',
      timestamp: new Date(),
    });
  }

  setIsRunning(false);
  if (runAbortControllerRef.current === runAbortController) {
    runAbortControllerRef.current = null;
  }
};

const buildNodeSuccessValidation = (nodeType, result) => {
  if (nodeType === 'read_sheet') {
    return {
      status: 'success',
      message: `Đọc dữ liệu thành công (${result?.output?.meta?.fetched || 0} dòng)`,
    };
  }
  if (nodeType === 'read_interested_customers') {
    const fetched = result?.output?.meta?.fetched || 0;
    const total = result?.output?.meta?.totalItems || 0;
    const filtered = result?.output?.meta?.filtered || false;
    const msg = filtered
      ? `Lấy khách đã chọn thành công (${fetched} khách)`
      : `Lấy khách để lại thông tin thành công (${fetched}/${total})`;
    return {
      status: 'success',
      message: msg,
    };
  }
  if (nodeType === 'read_courses_db') {
    const fetched = result?.output?.meta?.fetched || 0;
    return {
      status: 'success',
      message: `Lấy khóa học đã chọn thành công (${fetched} khóa học)`,
    };
  }
  if (nodeType === 'read_landing_leads') {
    const fetched = result?.output?.meta?.fetched || 0;
    const total = result?.output?.meta?.totalItems ?? fetched;
    return {
      status: 'success',
      message: `Lấy dữ liệu landing page thành công (${fetched} lead, tổng khớp ${total})`,
    };
  }
  if (nodeType === 'send_email') {
    const attempted = result?.output?.meta?.attempted || 0;
    const totalAttempts = result?.output?.meta?.totalAttempts || attempted;
    return {
      status: 'success',
      message: `Gửi email xong (${attempted}/${totalAttempts})`,
    };
  }
  if (nodeType === 'mapping_data') {
    const varsCount = result?.output?.meta?.variablesCount || 0;
    const rowsCount = result?.output?.meta?.previewed || 0;
    return {
      status: 'success',
      message: `Mapping thành công (${varsCount} biến, ${rowsCount} dòng)`,
    };
  }
  if (nodeType === 'save_customer') {
    const inserted = result?.output?.meta?.inserted || 0;
    const updated = result?.output?.meta?.updated || 0;
    const unchanged = result?.output?.meta?.unchanged || 0;
    const skipped = result?.output?.meta?.skipped || 0;
    return {
      status: 'success',
      message: `Lưu khách hàng xong (${inserted} mới, ${updated} cập nhật, ${unchanged} giữ nguyên, ${skipped} bỏ qua)`,
    };
  }
  if (nodeType === 'select_zalo_account') {
    return {
      status: 'success',
      message: 'Chọn tài khoản Zalo thành công',
    };
  }
  if (nodeType === 'get_all_friends') {
    const total = result?.output?.meta?.totalItems || 0;
    return {
      status: 'success',
      message: `Lấy danh sách bạn bè Zalo thành công (${total})`,
    };
  }
  if (nodeType === 'get_all_groups') {
    const total = result?.output?.meta?.totalItems || 0;
    return {
      status: 'success',
      message: `Lấy thông tin nhóm Zalo thành công (${total})`,
    };
  }
  if (nodeType === 'send_zalo_personal') {
    const attempted = result?.output?.meta?.attempted || 0;
    const total = result?.output?.meta?.totalItems || attempted;
    return {
      status: 'success',
      message: `Gửi tin Zalo cá nhân xong (${attempted}/${total})`,
    };
  }
  if (nodeType === 'send_zalo_friend_request') {
    const attempted = result?.output?.meta?.attempted || 0;
    const total = result?.output?.meta?.totalItems || attempted;
    return {
      status: 'success',
      message: `Gửi lời mời kết bạn xong (${attempted}/${total})`,
    };
  }
  if (nodeType === 'send_zalo_group') {
    const attempted = result?.output?.meta?.attempted || 0;
    const total = result?.output?.meta?.totalItems || attempted;
    return {
      status: 'success',
      message: `Gửi tin nhắn nhóm Zalo xong (${attempted}/${total})`,
    };
  }
  return {
    status: 'success',
    message: 'Thực thi thành công',
  };
};

const getNodeFailureMessage = (nodeType, error) => (
  error?.response?.data?.message
  || error?.message
  || (nodeType === 'read_sheet'
    ? 'Không thể đọc dữ liệu sheet'
    : nodeType === 'read_interested_customers'
      ? 'Không thể lấy dữ liệu khách'
      : nodeType === 'read_courses_db'
        ? 'Không thể lấy dữ liệu khóa học'
        : nodeType === 'read_landing_leads'
          ? 'Không thể lấy dữ liệu landing page'
          : nodeType === 'get_all_friends'
            ? 'Không thể lấy danh sách bạn bè Zalo'
            : nodeType === 'get_all_groups'
              ? 'Không thể lấy thông tin nhóm Zalo'
              : nodeType === 'send_zalo_personal'
                ? 'Không thể gửi tin Zalo cá nhân'
                : nodeType === 'send_zalo_friend_request'
                  ? 'Không thể gửi lời mời kết bạn'
                  : nodeType === 'send_zalo_group'
                    ? 'Không thể gửi tin nhắn nhóm Zalo'
                    : 'Thực thi thất bại')
);

const ZALO_NODE_TYPES = new Set([
  'select_zalo_account',
  'get_all_friends',
  'get_all_groups',
  'send_zalo_personal',
  'send_zalo_friend_request',
  'send_zalo_group',
]);

/**
 * Detect whether execution node is part of Zalo flow.
 *
 * @param {string} nodeType
 * @returns {boolean}
 */
const defaultIsZaloExecutionNode = (nodeType) => {
  const normalized = String(nodeType || '').trim().toLowerCase();
  return normalized.includes('zalo') || ZALO_NODE_TYPES.has(normalized);
};
