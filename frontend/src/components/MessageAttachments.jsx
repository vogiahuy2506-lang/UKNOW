import { useState } from 'react';
import { HiDownload, HiExternalLink } from 'react-icons/hi';
import {
  FaFileWord, FaFileExcel, FaFilePdf, FaFilePowerpoint,
  FaFileImage, FaFileArchive, FaFileCsv, FaFileAlt, FaFile,
} from 'react-icons/fa';

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

// Icon file THẬT (Word/Excel/PDF...) theo đuôi, có màu thương hiệu — thay cho emoji.
const FILE_TYPE_ICON = {
  pdf: { Icon: FaFilePdf, color: '#E03E2D' },
  doc: { Icon: FaFileWord, color: '#2B579A' },
  docx: { Icon: FaFileWord, color: '#2B579A' },
  xls: { Icon: FaFileExcel, color: '#217346' },
  xlsx: { Icon: FaFileExcel, color: '#217346' },
  csv: { Icon: FaFileCsv, color: '#217346' },
  ppt: { Icon: FaFilePowerpoint, color: '#C43E1C' },
  pptx: { Icon: FaFilePowerpoint, color: '#C43E1C' },
  zip: { Icon: FaFileArchive, color: '#B08900' },
  rar: { Icon: FaFileArchive, color: '#B08900' },
  '7z': { Icon: FaFileArchive, color: '#B08900' },
  png: { Icon: FaFileImage, color: '#7C3AED' },
  jpg: { Icon: FaFileImage, color: '#7C3AED' },
  jpeg: { Icon: FaFileImage, color: '#7C3AED' },
  gif: { Icon: FaFileImage, color: '#7C3AED' },
  webp: { Icon: FaFileImage, color: '#7C3AED' },
  txt: { Icon: FaFileAlt, color: '#64748B' },
};

export function FileTypeIcon({ fileName = '', className = 'w-6 h-6' }) {
  const ext = String(fileName).split('.').pop()?.toLowerCase();
  const { Icon, color } = FILE_TYPE_ICON[ext] || { Icon: FaFile, color: '#64748B' };
  return <Icon className={className} style={{ color }} />;
}

/**
 * Ảnh đính kèm. Ảnh của ta (đã lưu, `/file/...`) nhúng bình thường; ảnh ĐỒNG BỘ từ
 * Zalo/FB dùng URL CDN nền tảng — trình duyệt hay chặn hiển thị chéo origin (referer/
 * hết hạn) → thay vì biến mất, hiện thẻ "mở ảnh" để bấm xem trên nền tảng.
 */
function AttachmentImage({ data, isFromAgent }) {
  const [broken, setBroken] = useState(false);
  const name = data.displayName || data.name || data.caption || 'Hình ảnh';

  if (broken || !data.url) {
    return (
      <a
        href={data.url || undefined}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-3 p-3 bg-white/80 border border-gray-200 rounded-2xl max-w-[280px] hover:bg-white transition-all shadow-sm"
      >
        <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-50 border border-slate-100 shrink-0">
          <FaFileImage className="w-7 h-7" style={{ color: '#7C3AED' }} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
          <p className="text-xs text-gray-500">Không xem trước được — mở ảnh</p>
        </div>
        <HiExternalLink className="w-5 h-5 text-gray-400 shrink-0" />
      </a>
    );
  }

  return (
    <div className="relative group">
      <a href={data.url} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={data.url}
          alt={data.caption || name}
          className={`max-w-[280px] max-h-[200px] rounded-2xl object-cover cursor-pointer hover:opacity-90 transition-all shadow-md ${
            isFromAgent ? 'rounded-br-sm' : 'rounded-bl-sm'
          }`}
          onError={() => setBroken(true)}
        />
      </a>
      <a
        href={data.url}
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
          return <AttachmentImage key={index} data={attachmentData} isFromAgent={isFromAgent} />;
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
              <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-slate-50 border border-slate-100 shrink-0">
                <FileTypeIcon fileName={fileName} className="w-7 h-7" />
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
