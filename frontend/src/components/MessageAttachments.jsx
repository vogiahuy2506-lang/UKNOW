import { HiDownload } from 'react-icons/hi';

export function formatFileSize(bytes) {
  if (!bytes) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  let unitIndex = 0;
  let size = bytes;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

export function getFileIcon(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  const iconMap = {
    pdf: '📄', doc: '📝', docx: '📝',
    xls: '📊', xlsx: '📊',
    ppt: '📽️', pptx: '📽️',
    zip: '📦', rar: '📦', '7z': '📦',
    txt: '📃', csv: '📊',
  };
  return iconMap[ext] || '📎';
}

/**
 * Shared attachment renderer for Inbox + Studio chat bubbles.
 * Reads { type, url, name, size, caption } — ignores ref/key.
 */
export default function MessageAttachments({ attachments, messageRole }) {
  if (!attachments || attachments.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      {attachments.map((attachment, index) => {
        let attachmentData = attachment;
        if (typeof attachment === 'string') {
          try {
            attachmentData = JSON.parse(attachment);
          } catch {
            attachmentData = { type: 'unknown', url: attachment };
          }
        }

        const isFromAgent = messageRole === 'agent' || messageRole === 'bot' || messageRole === 'assistant';

        if (attachmentData.type === 'image' || attachmentData.type === 'photo') {
          return (
            <div key={index} className="relative group">
              <a href={attachmentData.url} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={attachmentData.url}
                  alt={attachmentData.caption || 'Hình ảnh'}
                  className={`max-w-[280px] max-h-[200px] rounded-2xl object-cover cursor-pointer hover:opacity-90 transition-all shadow-md ${
                    isFromAgent ? 'rounded-br-sm' : 'rounded-bl-sm'
                  }`}
                  onError={(e) => {
                    e.target.style.display = 'none';
                  }}
                />
              </a>
              <a
                href={attachmentData.url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="absolute top-3 right-3 p-2.5 bg-black/60 hover:bg-black/80 rounded-full text-white opacity-0 group-hover:opacity-100 transition-all backdrop-blur-sm"
              >
                <HiDownload className="w-4 h-4" />
              </a>
            </div>
          );
        }

        if (attachmentData.type === 'sticker' || attachmentData.type === 'gif') {
          return (
            <img
              key={index}
              src={attachmentData.url || attachmentData.thumbUrl || attachmentData.src}
              alt="Sticker"
              className="h-20 w-20 object-contain"
            />
          );
        }

        if (attachmentData.type === 'video') {
          return (
            <div key={index} className="relative group">
              <video
                src={attachmentData.url}
                controls
                className={`max-w-[280px] max-h-[200px] rounded-2xl ${
                  isFromAgent ? 'rounded-br-sm' : 'rounded-bl-sm'
                } shadow-md`}
              />
            </div>
          );
        }

        if (attachmentData.type === 'file' || attachmentData.type === 'doc') {
          const fileName = attachmentData.displayName || attachmentData.name || 'Tệp đính kèm';
          const fileSize = attachmentData.size ? formatFileSize(attachmentData.size) : '';

          return (
            <a
              key={index}
              href={attachmentData.url}
              download={fileName}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-3 p-3 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-2xl max-w-[280px] hover:bg-white transition-all shadow-sm ${
                isFromAgent ? 'border-primary-200/50' : ''
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                isFromAgent ? 'bg-primary-100 text-primary-600' : 'bg-gray-100 text-gray-600'
              }`}
              >
                <span className="text-xl">{getFileIcon(fileName)}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{fileName}</p>
                {fileSize && <p className="text-xs text-gray-500">{fileSize}</p>}
              </div>
              <HiDownload className="w-5 h-5 text-gray-400" />
            </a>
          );
        }

        return null;
      })}
    </div>
  );
}
