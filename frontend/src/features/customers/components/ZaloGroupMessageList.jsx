import { useState } from 'react';
import {
  HiOutlineChevronLeft,
  HiOutlineChevronRight,
  HiOutlineEye,
  HiOutlineExternalLink,
} from 'react-icons/hi';
import { formatDateTime } from '../utils/customerDisplay.helpers';
import { customerApiService } from '../services/customerApi.service';

const buildRunDisplay = (runId, runName, runDisplayName) => {
  const normalized = String(runDisplayName || '').trim();
  if (normalized) return normalized;
  if (runId != null && runName) return `Run #${runId} · ${runName}`;
  if (runId != null) return `Run #${runId}`;
  if (runName) return runName;
  return null;
};

/**
 * Nút xem/tải tệp đính kèm Zalo.
 * Ưu tiên dùng storageKey để lấy presigned URL mới; fallback sang url sẵn có.
 *
 * @param {{ file: { displayName?: string, storageKey?: string, url?: string } }} props
 */
const AttachmentLink = ({ file }) => {
  const [loading, setLoading] = useState(false);

  const handleView = async (e) => {
    e.preventDefault();
    if (file.storageKey) {
      setLoading(true);
      try {
        const res = await customerApiService.getAttachmentPresignedByKey(file.storageKey, { preview: true });
        const url = res?.data?.data?.url;
        if (url) window.open(url, '_blank', 'noopener,noreferrer');
      } catch {
        // Fallback sang url sẵn có nếu API lỗi
        if (file.url) window.open(file.url, '_blank', 'noopener,noreferrer');
      } finally {
        setLoading(false);
      }
    } else if (file.url) {
      window.open(file.url, '_blank', 'noopener,noreferrer');
    }
  };

  const hasLink = !!(file.storageKey || file.url);

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-sm text-gray-700 truncate">
        {file?.displayName || 'Tệp đính kèm'}
      </span>
      {hasLink && (
        <button
          type="button"
          onClick={handleView}
          disabled={loading}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 hover:underline disabled:opacity-50 shrink-0"
        >
          {loading ? (
            <span className="inline-block w-3 h-3 border border-blue-600 border-t-transparent rounded-full animate-spin" />
          ) : (
            <HiOutlineExternalLink className="w-3.5 h-3.5" />
          )}
          Xem tệp
        </button>
      )}
    </div>
  );
};

const ZaloGroupMessageItem = ({ message }) => {
  const [showContent, setShowContent] = useState(false);
  const hasClicked = Number(message?.clickCount || 0) > 0;
  const hasCompletedOrder = Number(message?.completedOrderCount || 0) > 0;
  const hasPendingOrder = Number(message?.pendingOrderCount || 0) > 0;
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  const groupTitle = message?.groupName || message?.groupId || '--';
  const runLabel = buildRunDisplay(message?.runId, message?.runName, message?.runDisplayName);

  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
        <p className="font-semibold text-gray-900 text-sm leading-snug">
          {groupTitle}
        </p>
        <p className="text-xs text-gray-400 mt-0.5">
          {formatDateTime(message?.sentAt || message?.createdAt)}
          {message?.id != null ? ` · ID: ${message.id}` : ''}
          {runLabel ? ` · ${runLabel}` : ''}
          {message?.accountName ? ` · TK: ${message.accountName}` : ''}
        </p>
        {message?.groupId && message?.groupName && (
          <p className="text-xs text-gray-400 mt-0.5">Nhóm ID: {message.groupId}</p>
        )}
        <div className="mt-2 flex items-center gap-1 flex-wrap">
          <span className="badge badge-info">Đã gửi</span>
          {hasClicked && (
            <span className="badge" style={{ background: '#fff3e0', color: '#e65100' }}>
              Đã nhấp link
            </span>
          )}
          {hasPendingOrder && !hasCompletedOrder && (
            <span className="badge" style={{ background: '#fff8e1', color: '#b45309' }}>
              Đơn chờ xử lý
            </span>
          )}
          {hasCompletedOrder && (
            <span className="badge" style={{ background: '#f0fdf4', color: '#15803d' }}>
              Đơn đã mua
            </span>
          )}
        </div>
      </div>

      <div className="px-5 py-4 space-y-3">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-sm text-gray-700">
          <div>
            <span className="text-xs text-gray-400">Lượt click</span>
            <p>{Number(message?.clickCount || 0)}</p>
          </div>
          <div>
            <span className="text-xs text-gray-400">Khách phát sinh đơn</span>
            <p>{Number(message?.orderedCustomerCount || 0)}</p>
          </div>
          <div>
            <span className="text-xs text-gray-400">Đơn chờ xử lý</span>
            <p>{Number(message?.pendingOrderCount || 0)}</p>
          </div>
          <div>
            <span className="text-xs text-gray-400">Đơn đã mua</span>
            <p>{Number(message?.completedOrderCount || 0)}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setShowContent((prev) => !prev)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-200 text-gray-600 bg-white hover:bg-gray-50 hover:border-gray-300 transition-colors"
        >
          <HiOutlineEye className="w-3.5 h-3.5" />
          {showContent ? 'Ẩn nội dung tin nhắn' : 'Xem nội dung tin nhắn'}
        </button>

        {showContent && (
          <div className="space-y-2">
            <p className="text-sm text-gray-700 whitespace-pre-wrap rounded-lg bg-white border border-gray-200 p-3">
              {message?.messageText || 'Không có nội dung tin nhắn'}
            </p>
            {attachments.length > 0 && (
              <div className="rounded-lg bg-white border border-gray-200 p-3">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
                  Tệp đính kèm ({attachments.length})
                </p>
                <div className="space-y-1.5">
                  {attachments.map((file, index) => (
                    <AttachmentLink key={`${file?.displayName || 'file'}-${index}`} file={file} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * List tab for Zalo group sent messages.
 *
 * @param {object} props
 * @returns {JSX.Element}
 */
const ZaloGroupMessageList = ({
  loading = false,
  messages = [],
  pagination = { page: 1, totalPages: 1, total: 0 },
  onChangePage = () => {},
}) => {
  return (
    <div className="space-y-4">
      {loading ? (
        <div className="card py-12">
          <div className="spinner w-8 h-8 mx-auto" />
        </div>
      ) : messages.length === 0 ? (
        <div className="card py-12 text-center text-gray-400">
          Chưa có tin nhắn Zalo nhóm nào được ghi nhận
        </div>
      ) : (
        <div className="space-y-3">
          {messages.map((message) => (
            <ZaloGroupMessageItem key={message.id} message={message} />
          ))}
        </div>
      )}

      {Number(pagination?.totalPages || 1) > 1 && (
        <div className="card px-6 py-4 flex items-center justify-between">
          <p className="text-sm text-gray-500">
            Trang {pagination.page} / {pagination.totalPages}
            {Number.isFinite(Number(pagination?.total))
              ? ` · Tổng ${pagination.total} tin`
              : ''}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onChangePage(Math.max(1, Number(pagination.page || 1) - 1))}
              disabled={Number(pagination.page || 1) <= 1}
              className="btn btn-secondary btn-sm disabled:opacity-50"
            >
              <HiOutlineChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => onChangePage(Math.min(Number(pagination.totalPages || 1), Number(pagination.page || 1) + 1))}
              disabled={Number(pagination.page || 1) >= Number(pagination.totalPages || 1)}
              className="btn btn-secondary btn-sm disabled:opacity-50"
            >
              <HiOutlineChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ZaloGroupMessageList;
