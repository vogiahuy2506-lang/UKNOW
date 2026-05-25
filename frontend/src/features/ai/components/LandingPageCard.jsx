import { useState, useRef } from 'react';
import {
  HiOutlineSparkles, HiOutlineExternalLink, HiOutlinePencilAlt,
  HiOutlineDeviceMobile, HiOutlineDesktopComputer, HiOutlineCode,
  HiOutlineEye, HiOutlineDownload, HiOutlineClipboard, HiOutlineX,
  HiOutlineCheck
} from 'react-icons/hi';

/**
 * Enhanced Landing Page Card with preview, code view, and export options.
 */
const LandingPageCard = ({ page, onSaveToLibrary, onGenerateNew }) => {
  const [viewMode, setViewMode] = useState('preview'); // 'preview' | 'code'
  const [device, setDevice] = useState('desktop');
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const iframeRef = useRef(null);

  const fullHtml = `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.title || 'Landing Page'}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { margin: 0; padding: 0; }
    ${page.css || ''}
  </style>
</head>
<body>
  ${page.html || ''}
</body>
</html>`;

  const handlePreview = () => {
    setShowFullscreen(true);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fullHtml);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = fullHtml;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([fullHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${page.title || 'landing-page'}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const deviceWidth = device === 'mobile' ? 'w-[375px]' : 'w-full';
  const deviceHeight = device === 'mobile' ? 'h-[667px]' : 'h-[400px]';

  return (
    <>
      <div className="mt-4 bg-slate-50 rounded-2xl p-4 border border-slate-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-2 mb-3 text-slate-600">
          <HiOutlineSparkles className="w-4 h-4 text-orange-500" />
          <span className="font-black text-[10px] uppercase tracking-widest">Landing Page</span>
          {page.templateName && (
            <span className="ml-auto text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
              {page.templateName}
            </span>
          )}
        </div>

        {/* Title */}
        <p className="text-sm font-bold text-slate-800 mb-3">{page.title || 'Untitled Landing Page'}</p>

        {/* View Mode Toggle */}
        <div className="flex items-center gap-1 mb-3 bg-white rounded-lg p-1 border border-slate-200">
          <button
            onClick={() => setViewMode('preview')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-all ${
              viewMode === 'preview'
                ? 'bg-slate-800 text-white'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <HiOutlineEye className="w-3.5 h-3.5" />
            Xem trước
          </button>
          <button
            onClick={() => setViewMode('code')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-semibold rounded-md transition-all ${
              viewMode === 'code'
                ? 'bg-slate-800 text-white'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <HiOutlineCode className="w-3.5 h-3.5" />
            Mã nguồn
          </button>
        </div>

        {/* Preview / Code View */}
        {viewMode === 'preview' ? (
          <div className="space-y-3">
            {/* Device Toggle */}
            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setDevice('desktop')}
                className={`p-1.5 rounded-md transition-all ${
                  device === 'desktop'
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
                title="Desktop"
              >
                <HiOutlineDesktopComputer className="w-4 h-4" />
              </button>
              <button
                onClick={() => setDevice('mobile')}
                className={`p-1.5 rounded-md transition-all ${
                  device === 'mobile'
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
                title="Mobile"
              >
                <HiOutlineDeviceMobile className="w-4 h-4" />
              </button>
            </div>

            {/* Preview Frame */}
            <div className={`mx-auto transition-all ${deviceWidth}`}>
              <div className={`bg-white rounded-xl border border-slate-200 overflow-hidden ${device === 'mobile' ? 'shadow-lg' : ''}`}>
                <div className="h-6 bg-slate-100 border-b border-slate-200 flex items-center px-3 gap-1.5">
                  <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-yellow-400" />
                  <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                </div>
                <iframe
                  ref={iframeRef}
                  srcDoc={fullHtml}
                  className={`w-full ${deviceHeight} border-0`}
                  title="Landing Page Preview"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="bg-slate-900 rounded-xl p-4 overflow-auto max-h-64">
              <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono">
                {fullHtml.length > 2000
                  ? fullHtml.substring(0, 2000) + '\n\n... (còn tiếp)'
                  : fullHtml}
              </pre>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleCopy}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-800 text-white text-xs font-semibold rounded-lg hover:bg-slate-700 transition"
              >
                {copied ? <HiOutlineCheck className="w-3.5 h-3.5" /> : <HiOutlineClipboard className="w-3.5 h-3.5" />}
                {copied ? 'Đã copy!' : 'Copy code'}
              </button>
              <button
                onClick={handleDownload}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-200 transition"
              >
                <HiOutlineDownload className="w-3.5 h-3.5" />
                Download
              </button>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 space-y-2">
          <button
            onClick={handlePreview}
            className="w-full py-2.5 bg-slate-800 text-white font-black text-[11px] uppercase tracking-widest rounded-xl hover:bg-slate-900 flex items-center justify-center gap-2"
          >
            <HiOutlineExternalLink className="w-4 h-4 text-orange-400" />
            Xem toàn màn hình
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onSaveToLibrary?.(page)}
              className="py-2.5 bg-white border border-slate-200 text-slate-700 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-50 flex items-center justify-center gap-1.5"
            >
              <HiOutlinePencilAlt className="w-3.5 h-3.5 text-orange-500" />
              Chỉnh sửa & Lưu
            </button>
            <button
              onClick={() => onGenerateNew?.()}
              className="py-2.5 bg-orange-50 border border-orange-200 text-orange-700 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-orange-100 flex items-center justify-center gap-1.5"
            >
              <HiOutlineSparkles className="w-3.5 h-3.5" />
              Tạo mới
            </button>
          </div>
        </div>
      </div>

      {/* Fullscreen Modal */}
      {showFullscreen && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col">
          <div className="flex-shrink-0 flex items-center justify-between px-4 py-3 bg-slate-900">
            <span className="text-white font-bold text-sm">{page.title || 'Landing Page Preview'}</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setDevice('desktop')}
                className={`p-2 rounded-md transition-all ${
                  device === 'desktop' ? 'bg-white text-slate-900' : 'bg-slate-700 text-white'
                }`}
              >
                <HiOutlineDesktopComputer className="w-5 h-5" />
              </button>
              <button
                onClick={() => setDevice('mobile')}
                className={`p-2 rounded-md transition-all ${
                  device === 'mobile' ? 'bg-white text-slate-900' : 'bg-slate-700 text-white'
                }`}
              >
                <HiOutlineDeviceMobile className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowFullscreen(false)}
                className="p-2 bg-slate-700 text-white rounded-md hover:bg-slate-600 transition"
              >
                <HiOutlineX className="w-5 h-5" />
              </button>
            </div>
          </div>
          <div className="flex-1 flex items-start justify-center bg-slate-800 p-4 overflow-auto">
            <div className={`transition-all ${device === 'mobile' ? 'w-[375px]' : 'w-full max-w-6xl'}`}>
              <div className={`bg-white rounded-xl overflow-hidden shadow-2xl ${device === 'mobile' ? 'h-[667px]' : ''}`}>
                <iframe
                  srcDoc={fullHtml}
                  className={`w-full border-0 ${device === 'mobile' ? 'h-full' : 'h-[2000px]'}`}
                  title="Landing Page Fullscreen Preview"
                  sandbox="allow-scripts allow-same-origin"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LandingPageCard;
