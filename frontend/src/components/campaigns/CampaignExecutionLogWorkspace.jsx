import { useEffect, useMemo, useState } from 'react';
import {
  formatCampaignDateTime,
  formatCampaignTime,
} from '../../features/campaigns/utils/campaignDateTime.helpers';
import { formatDataPayloadBytes } from '../../features/campaigns/utils/dataColumnSelection';

const statusStyles = {
  success: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  warning: 'bg-yellow-100 text-yellow-700',
  info: 'bg-blue-100 text-blue-700',
};

const dotStatusStyles = {
  success: 'bg-green-500',
  failed: 'bg-red-500',
  warning: 'bg-yellow-500',
  info: 'bg-blue-500',
};

const DATE_TIME_COLUMN_PATTERN = /(?:^|_|-)(at|time|date|timestamp)$/i;
const CAMEL_DATE_TIME_COLUMN_PATTERN = /(At|Time|Date|Timestamp)$/;

/**
 * Chuẩn hóa hiển thị cell theo UTC+7 cho các cột thời gian trong bảng log.
 *
 * Luồng hoạt động:
 * 1. Chỉ format khi tên cột mang ý nghĩa thời gian (`sentAt`, `created_at`, ...).
 * 2. Nếu parse được date hợp lệ thì trả về chuỗi thời gian theo `Asia/Ho_Chi_Minh`.
 * 3. Nếu không parse được thì giữ nguyên để tránh làm sai dữ liệu text.
 *
 * @param {string} columnKey tên cột dữ liệu đang render
 * @param {unknown} value giá trị gốc của cell
 * @returns {string} giá trị hiển thị cuối cùng trên bảng
 */
const formatLogCellValue = (columnKey, value) => {
  if (value == null) return '';

  const normalizedKey = String(columnKey || '').trim();
  const shouldFormatDateTime = DATE_TIME_COLUMN_PATTERN.test(normalizedKey)
    || CAMEL_DATE_TIME_COLUMN_PATTERN.test(normalizedKey);
  // Object/array: hiển thị JSON để tránh "[object Object]" trên bảng log.
  if (!shouldFormatDateTime && typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[Không hiển thị]';
    }
  }
  if (!shouldFormatDateTime) return String(value);

  const formatted = formatCampaignDateTime(value, '');
  return formatted || String(value);
};

/**
 * Build schema rows from tabular items.
 *
 * @param {Array<object>} rows input rows
 * @returns {Array<{key: string, type: string}>}
 */
function buildSchemaFromRows(rows) {
  const first = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!first || typeof first !== 'object') return [];
  return Object.keys(first).map((k) => ({
    key: k,
    type: Array.isArray(first[k]) ? 'array' : typeof first[k],
  }));
}

/**
 * Convert logs from builder/run page into a shared view model.
 *
 * @param {Array<object>} logs raw logs
 * @returns {Array<object>}
 */
function normalizeLogs(logs) {
  if (!Array.isArray(logs)) return [];
  return logs.map((log) => {
    const outputFallback = log?.nodeResultJson ?? log?.executionData ?? null;
    const result = log?.result
      ? log.result
      : {
          input: null,
          output: outputFallback,
        };
    const timestampRaw = log?.timestamp ?? log?.createdAt ?? null;
    const timestamp = timestampRaw ? new Date(timestampRaw) : null;
    return {
      id: log?.id,
      status: log?.status || 'info',
      nodeName: log?.nodeName || log?.nodeSubtype || log?.actionType || null,
      message: log?.message || log?.executionData?.message || log?.errorMessage || '-',
      timestamp,
      result,
    };
  });
}

const CampaignExecutionLogWorkspace = ({
  logs = [],
  selectedLogId = null,
  onSelectLogId,
  emptyListText = 'Chưa có log',
  emptyDetailText = 'Chọn 1 log để xem chi tiết kết quả.',
  listWidth = 240,
  minListWidth = 200,
  minDetailWidth = 220,
  showSplitter = false,
  isResizingSplit = false,
  onSplitResizeStart,
}) => {
  const normalizedLogs = useMemo(() => normalizeLogs(logs), [logs]);
  const selectedLog = useMemo(
    () => normalizedLogs.find((log) => log.id === selectedLogId) || null,
    [normalizedLogs, selectedLogId]
  );

  const [activeSide, setActiveSide] = useState('output'); // input | output
  const [activeTab, setActiveTab] = useState('table'); // schema | table | json
  const [pageSize, setPageSize] = useState(25);
  const [page, setPage] = useState(1);
  const [expandedCell, setExpandedCell] = useState(null);

  useEffect(() => {
    if (!normalizedLogs.length) return;
    const hasSelection = normalizedLogs.some((log) => log.id === selectedLogId);
    if (!hasSelection && typeof onSelectLogId === 'function') {
      onSelectLogId(normalizedLogs[0].id);
    }
  }, [normalizedLogs, onSelectLogId, selectedLogId]);

  useEffect(() => {
    setPage(1);
    setExpandedCell(null);
  }, [selectedLogId, activeTab]);

  const outputData = selectedLog?.result?.output ?? null;
  const inputData = selectedLog?.result?.input ?? null;
  const hasResult = !!selectedLog?.result;

  const items = useMemo(() => {
    if (Array.isArray(outputData?.items)) return outputData.items;
    if (Array.isArray(outputData)) return outputData;
    if (outputData && typeof outputData === 'object') return [outputData];
    return [];
  }, [outputData]);

  const sendSummary = useMemo(() => {
    const meta = outputData?.meta;
    const sentCount = Number(meta?.sentCount);
    const failedCount = Number(meta?.failedCount);
    if (!Number.isFinite(sentCount) && !Number.isFinite(failedCount)) {
      return null;
    }
    return {
      sentCount: Number.isFinite(sentCount) ? sentCount : 0,
      failedCount: Number.isFinite(failedCount) ? failedCount : 0,
    };
  }, [outputData]);

  /** Meta dung lượng JSON (UTF-8) cho node dữ liệu có `dataSelectedColumns` */
  const dataPayloadMeta = useMemo(() => {
    const meta = outputData?.meta;
    if (!meta || typeof meta !== 'object') return null;
    const acc = Number(meta.accumulatedPayloadBytesUtf8);
    const dlm = meta.dataLoadMeta;
    const savings = dlm && Number(dlm.batchEstimatedSavingsBytes);
    const hasAcc = Number.isFinite(acc) && acc >= 0;
    const hasSavings = Number.isFinite(savings) && savings > 0 && dlm?.columnSelectionActive;
    if (!hasAcc && !hasSavings) return null;
    return { acc, hasAcc, savings, hasSavings };
  }, [outputData]);

  const schema = useMemo(
    () => (Array.isArray(outputData?.schema) ? outputData.schema : buildSchemaFromRows(items)),
    [items, outputData]
  );

  const columns = useMemo(() => {
    if (!items.length) return [];
    const keys = new Set();
    items.forEach((row) => {
      if (!row || typeof row !== 'object') return;
      Object.keys(row).forEach((key) => keys.add(key));
    });
    return Array.from(keys);
  }, [items]);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const pageItems = items.slice(startIdx, startIdx + pageSize);

  const TabButton = ({ id, label }) => (
    <button
      onClick={() => setActiveTab(id)}
      className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
        activeTab === id ? 'bg-gray-900 text-white' : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 min-w-full w-max">
      <div
        className="border border-gray-200 rounded-lg overflow-hidden bg-white flex flex-col min-h-0 shrink-0"
        style={{
          width: `${listWidth}px`,
          minWidth: `${minListWidth}px`,
        }}
      >
        <div className="px-2 py-1.5 bg-gray-50 border-b flex items-center justify-between">
          <div className="text-sm font-medium text-gray-700">Danh sách</div>
          <div className="text-xs text-gray-500">{normalizedLogs.length} log</div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
          {normalizedLogs.length === 0 ? (
            <div className="p-2 text-sm text-gray-500">{emptyListText}</div>
          ) : (
            <div className="divide-y w-full">
              {normalizedLogs.map((log) => {
                const statusKey = log.status || 'info';
                return (
                  <button
                    key={log.id}
                    onClick={() => onSelectLogId?.(log.id)}
                    className={`w-full text-left px-2 py-1.5 flex items-start gap-2 hover:bg-gray-50 min-w-0 ${
                      selectedLogId === log.id ? 'bg-primary-50' : ''
                    }`}
                  >
                    <span
                      className={`mt-1 inline-flex h-2.5 w-2.5 rounded-full flex-shrink-0 ${
                        dotStatusStyles[statusKey] || dotStatusStyles.info
                      }`}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 truncate">
                        {log.nodeName ? <span className="font-medium">{log.nodeName}</span> : <span className="font-medium">Hệ thống</span>}
                        <span className="text-gray-500"> — {log.message}</span>
                      </div>
                      <div className="text-xs text-gray-400 flex items-center justify-between gap-1">
                        <span className="truncate">{formatCampaignTime(log.timestamp, '')}</span>
                        {log.result && <span className="text-primary-600 flex-shrink-0">Có kết quả</span>}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {showSplitter && (
        <div
          className={`mx-2 h-full w-2 cursor-col-resize transition-colors shrink-0 ${
            isResizingSplit ? 'bg-primary-100' : 'hover:bg-primary-50'
          }`}
          onMouseDown={onSplitResizeStart}
          role="separator"
          aria-orientation="vertical"
          title="Kéo để thay đổi kích thước"
        >
          <div className="mx-auto h-full w-px bg-gray-200" />
        </div>
      )}

      <div
        className={`flex-1 min-w-0 border border-gray-200 rounded-lg bg-white min-h-0 overflow-hidden ${
          showSplitter ? 'p-2' : 'ml-3 p-2'
        }`}
        style={{ minWidth: `${minDetailWidth}px` }}
      >
        {!selectedLog ? (
          <div className="h-full flex items-center justify-center text-sm text-gray-500">
            {emptyDetailText}
          </div>
        ) : (
          <div className="h-full flex flex-col min-h-0 min-w-0 overflow-hidden w-full">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold text-gray-900">{selectedLog.nodeName || 'Hệ thống'}</span>
                  <span className="text-xs text-gray-500">{formatCampaignTime(selectedLog.timestamp, '')}</span>
                  <span className={`inline-flex items-center justify-center text-[11px] px-2 py-0.5 rounded-full ${statusStyles[selectedLog.status] || statusStyles.info}`}>
                    {selectedLog.status || 'info'}
                  </span>
                </div>
                <div className="text-xs text-gray-500 line-clamp-1">{selectedLog.message}</div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setActiveSide('input')}
                  className={`px-3 py-1.5 text-sm rounded-lg ${
                    activeSide === 'input' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  INPUT
                </button>
                <button
                  onClick={() => setActiveSide('output')}
                  className={`px-3 py-1.5 text-sm rounded-lg ${
                    activeSide === 'output' ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                  disabled={!hasResult}
                >
                  OUTPUT
                </button>
              </div>
            </div>

            <div className="mt-2 flex-1 min-h-0 min-w-0 bg-white border border-gray-200 rounded-lg overflow-hidden">
              {activeSide === 'input' && (
                <div className="h-full min-h-0 min-w-0 flex flex-col">
                  <div className="px-2 py-1.5 border-b bg-gray-50 text-sm font-medium text-gray-700">
                    Input
                  </div>
                  <pre className="flex-1 min-h-0 min-w-0 w-full overflow-auto p-2 text-xs bg-white">
                    {JSON.stringify(inputData ?? {}, null, 2)}
                  </pre>
                </div>
              )}

              {activeSide === 'output' && (
                <div className="h-full min-h-0 min-w-0 flex flex-col overflow-hidden">
                  <div className="px-2 py-1.5 border-b bg-gray-50 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <TabButton id="schema" label="Schema" />
                      <TabButton id="table" label="Table" />
                      <TabButton id="json" label="JSON" />
                    </div>
                    <div className="flex items-center gap-2">
                      {sendSummary && (
                        <>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">
                            Tổng đã gửi: {sendSummary.sentCount}
                          </span>
                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                            Gửi lỗi: {sendSummary.failedCount}
                          </span>
                        </>
                      )}
                      <div className="flex flex-wrap items-center justify-end gap-1.5 text-xs text-gray-500">
                        <span>
                          {outputData?.meta?.totalItems ? `${outputData.meta.totalItems} items` : `${items.length} items`}
                        </span>
                        {dataPayloadMeta?.hasAcc ? (
                          <span
                            className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-700"
                            title="Ước lượng kích thước JSON.stringify(items) theo UTF-8 (tích lũy trong log run)"
                          >
                            Payload ~{formatDataPayloadBytes(dataPayloadMeta.acc)}
                          </span>
                        ) : null}
                        {dataPayloadMeta?.hasSavings ? (
                          <span
                            className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800"
                            title="So sánh batch: kích thước nếu giữ đủ cột vs sau khi lọc cột"
                          >
                            Tiết kiệm batch ~{formatDataPayloadBytes(dataPayloadMeta.savings)}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {activeTab === 'schema' && (
                    <div className="flex-1 min-h-0 overflow-auto p-2">
                      {schema.length === 0 ? (
                        <div className="text-sm text-gray-500">Không có schema.</div>
                      ) : (
                        <div className="space-y-2">
                          {schema.map((f) => (
                            <div key={f.key} className="flex items-center justify-between text-sm">
                              <span className="font-mono text-gray-800">{f.key}</span>
                              <span className="text-gray-500">{f.type}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {activeTab === 'json' && (
                    <pre className="flex-1 min-h-0 min-w-0 w-full overflow-auto p-2 text-xs bg-white">
                      {JSON.stringify(outputData ?? {}, null, 2)}
                    </pre>
                  )}

                  {activeTab === 'table' && (
                    <div className="flex-1 min-h-0 flex flex-col min-w-0">
                      <div className="flex-1 min-h-0 min-w-0 w-full max-w-full overflow-auto">
                        <div className="w-full max-w-full overflow-x-auto">
                          {items.length === 0 ? (
                            <div className="p-2 text-sm text-gray-500">Không có dữ liệu.</div>
                          ) : (
                            <table className="w-max min-w-full text-xs border-collapse">
                              <thead className="sticky top-0 bg-gray-50 border-b">
                                <tr>
                                  {columns.map((c) => (
                                    <th key={c} className="text-left px-3 py-1.5 font-semibold text-gray-700 whitespace-nowrap">
                                      {c}
                                    </th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {pageItems.map((row, idx) => (
                                  <tr key={idx} className="border-b last:border-b-0 hover:bg-gray-50">
                                    {columns.map((c) => {
                                      const rawValue = formatLogCellValue(c, row?.[c]);
                                      const cellKey = `${idx}-${c}`;
                                      const isExpanded = expandedCell === cellKey;
                                      return (
                                        <td key={c} className="px-3 py-1.5 text-gray-800 whitespace-nowrap">
                                          <button
                                            type="button"
                                            onClick={() => setExpandedCell(isExpanded ? null : cellKey)}
                                            title={rawValue}
                                            className={`block text-left ${
                                              isExpanded
                                                ? 'max-w-[400px] whitespace-normal break-words'
                                                : 'max-w-[200px] truncate'
                                            }`}
                                          >
                                            {rawValue}
                                          </button>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </div>

                      <div className="flex-none border-t bg-white px-3 py-2 flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setPage(1)}
                            className="px-2 py-1 rounded hover:bg-gray-100"
                            disabled={safePage === 1}
                          >
                            «
                          </button>
                          <button
                            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                            className="px-2 py-1 rounded hover:bg-gray-100"
                            disabled={safePage === 1}
                          >
                            ‹
                          </button>
                          <span>
                            {safePage} / {totalPages}
                          </span>
                          <button
                            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
                            className="px-2 py-1 rounded hover:bg-gray-100"
                            disabled={safePage === totalPages}
                          >
                            ›
                          </button>
                          <button
                            onClick={() => setPage(totalPages)}
                            className="px-2 py-1 rounded hover:bg-gray-100"
                            disabled={safePage === totalPages}
                          >
                            »
                          </button>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-gray-500">Page Size</span>
                          <select
                            className="border border-gray-200 rounded px-2 py-1 text-xs"
                            value={pageSize}
                            onChange={(event) => {
                              setPageSize(parseInt(event.target.value, 10));
                              setPage(1);
                            }}
                          >
                            <option value={10}>10</option>
                            <option value={25}>25</option>
                            <option value={50}>50</option>
                            <option value={100}>100</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CampaignExecutionLogWorkspace;
