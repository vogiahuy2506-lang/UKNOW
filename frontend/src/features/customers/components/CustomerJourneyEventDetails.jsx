import { useState } from 'react';
import toast from 'react-hot-toast';
import { HiCheck, HiOutlineClipboard, HiOutlineExternalLink } from 'react-icons/hi';
import customerApiService from '../services/customerApi.service';

const extractOriginalUrl = (url) => {
  if (!url) return null;
  const matched = url.match(/[?&]url=([^&]+)/);
  if (matched) {
    try {
      return decodeURIComponent(matched[1]);
    } catch {
      return url;
    }
  }
  return url;
};

const truncateUrl = (url, max = 60) =>
  url && url.length > max ? `${url.slice(0, max)}…` : url;

export const ClickEventDetail = ({ label, url, at, formatDateTime }) => {
  const [copied, setCopied] = useState(false);
  const originalUrl = extractOriginalUrl(url);
  const displayLabel = label || (originalUrl ? truncateUrl(originalUrl, 50) : 'Link trong email');

  const handleCopy = () => {
    if (!originalUrl) return;
    navigator.clipboard?.writeText(originalUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  };

  return (
    <div>
      <p className="text-sm font-medium text-gray-800 leading-snug">
        Đã nhấp: <span className="text-orange-600">{displayLabel}</span>
      </p>
      {originalUrl && (
        <div className="mt-1 flex items-center gap-1 max-w-full">
          <span className="text-xs text-gray-400 truncate max-w-[260px]" title={originalUrl}>
            {originalUrl}
          </span>
          <button
            type="button"
            onClick={handleCopy}
            title={copied ? 'Đã sao chép!' : 'Sao chép link'}
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
          >
            {copied
              ? <HiCheck className="w-3.5 h-3.5 text-green-500" />
              : <HiOutlineClipboard className="w-3.5 h-3.5" />}
          </button>
          <a
            href={originalUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Mở link trong tab mới"
            className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-orange-500 transition-colors shrink-0"
          >
            <HiOutlineExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      )}
      {at && <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(at)}</p>}
    </div>
  );
};

export const AttachmentEventDetail = ({
  name,
  originalName,
  at,
  fileId,
  directUrl,
  formatDateTime,
}) => {
  const [viewing, setViewing] = useState(false);
  const [copied, setCopied] = useState(false);
  const displayLabel = name || originalName || 'tệp đính kèm';

  const getFreshUrl = async ({ preview = false } = {}) => {
    if (fileId) {
      const response = await customerApiService.getAttachmentPresignedDownload(fileId, { preview });
      return response.data?.data?.url || null;
    }
    return directUrl || null;
  };

  const canOpen = !!(fileId || directUrl);

  const handleViewFile = async () => {
    setViewing(true);
    try {
      const url = await getFreshUrl({ preview: true });
      if (!url) throw new Error('Không nhận được URL xem tệp');
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error('Không thể mở tệp. Vui lòng thử lại.');
    } finally {
      setViewing(false);
    }
  };

  const handleCopyFileLink = async () => {
    if (!canOpen) return;
    try {
      const url = await getFreshUrl();
      if (!url) throw new Error('Không nhận được URL tải tệp');
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Không thể sao chép link tệp.');
    }
  };

  return (
    <div>
      <p className="text-sm font-medium text-gray-800 leading-snug">
        Đã tải: <span className="text-indigo-600">{displayLabel}</span>
      </p>
      <div className="mt-1 flex items-center gap-1">
        <button
          type="button"
          onClick={handleViewFile}
          disabled={!canOpen || viewing}
          className={`text-xs font-medium px-2 py-1 rounded border transition-colors ${
            canOpen
              ? 'border-indigo-200 text-indigo-600 hover:bg-indigo-50'
              : 'border-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >
          {viewing ? 'Đang mở…' : 'Xem tệp'}
        </button>
        <button
          type="button"
          onClick={handleCopyFileLink}
          disabled={!canOpen}
          title={copied ? 'Đã sao chép!' : 'Sao chép link tải'}
          className={`p-1 rounded transition-colors ${
            canOpen
              ? 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
              : 'text-gray-300 cursor-not-allowed'
          }`}
        >
          {copied
            ? <HiCheck className="w-3.5 h-3.5 text-green-500" />
            : <HiOutlineClipboard className="w-3.5 h-3.5" />}
        </button>
      </div>
      {at && <p className="text-xs text-gray-400 mt-0.5">{formatDateTime(at)}</p>}
    </div>
  );
};
