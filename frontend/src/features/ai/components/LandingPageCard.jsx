import { useState, useRef } from 'react';
import {
  HiOutlineSparkles, HiOutlineExternalLink, HiOutlinePencilAlt,
  HiOutlineDeviceMobile, HiOutlineDesktopComputer, HiOutlineCode,
  HiOutlineEye, HiOutlineDownload, HiOutlineClipboard, HiOutlineX,
  HiOutlineCheck
} from 'react-icons/hi';
import { useI18n } from '../../../i18n';

/**
 * Enhanced Landing Page Card with preview, code view, and export options.
 */
const LandingPageCard = ({
  page,
  onSaveToLibrary,
  onGenerateNew,
  onEditWithAi,
  isEditing = false,
  messageIndex,
}) => {
  const t = useI18n('landingPageCard');
  const [viewMode, setViewMode] = useState('preview'); // 'preview' | 'code'
  const [device, setDevice] = useState('desktop');
  const [showFullscreen, setShowFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showEditBox, setShowEditBox] = useState(false);
  const [editInstruction, setEditInstruction] = useState('');
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false);
  const iframeRef = useRef(null);

  const rawHtml = page.html || '';
  const isFullDocument = /<!doctype\s+html/i.test(rawHtml) || /<html[\s>]/i.test(rawHtml);
  const fullHtml = isFullDocument
    ? rawHtml.replace(/<head([^>]*)>/i, (m, attrs) => {
        const hasTailwind = rawHtml.includes('cdn.tailwindcss.com');
        const tailwindTag = hasTailwind ? '' : '\n  <script src="https://cdn.tailwindcss.com"></script>';
        const cssTag = page.css ? `\n  <style>${page.css}</style>` : '';
        return `<head${attrs}>${tailwindTag}${cssTag}`;
      })
    : `<!DOCTYPE html>
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
  ${rawHtml}
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

  const handleSubmitEdit = async (e) => {
    e?.preventDefault?.();
    const text = editInstruction.trim();
    if (!text || isEditing || isSubmittingLocal) return;

    setIsSubmittingLocal(true);
    try {
      if (onEditWithAi) {
        await onEditWithAi(page, text, messageIndex);
        setShowEditBox(false);
        setEditInstruction('');
      }
    } finally {
      setIsSubmittingLocal(false);
    }
  };

  const isBusy = isEditing || isSubmittingLocal;
  const deviceWidth = device === 'mobile' ? 'w-[375px]' : 'w-full';
  const deviceHeight = device === 'mobile' ? 'h-[667px]' : 'h-full';

  return (
    <>
      <div className="mt-4 bg-slate-50 rounded-2xl p-4 border border-slate-200 overflow-hidden relative">
        {/* Busy Overlay */}
        {isBusy && (
          <div className="absolute inset-0 bg-white/80 backdrop-blur-[1px] z-20 flex flex-col items-center justify-center gap-2">
            <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-xs font-bold text-slate-700">{t('editing')}</p>
          </div>
        )}

        {/* Header */}
        <div className="flex items-center gap-2 mb-3 text-slate-600">
          <HiOutlineSparkles className="w-4 h-4 text-orange-500" />
          <span className="font-black text-[10px] uppercase tracking-widest">{t('label')}</span>
          {page.templateName && (
            <span className="ml-auto text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">
              {page.templateName}
            </span>
          )}
        </div>

        {/* Title */}
        <p className="text-sm font-bold text-slate-800 mb-3">{page.title || t('untitled')}</p>

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
            {t('preview')}
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
            {t('sourceCode')}
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
                title={t('desktop')}
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
                title={t('mobile')}
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
                  sandbox="allow-scripts"
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
                {copied ? t('copied') : t('copyCode')}
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

        {/* AI Inline Edit Box */}
        {showEditBox && (
          <div className="mt-3 bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-3 border border-orange-200 space-y-2">
            <div className="flex items-center gap-1.5 text-orange-800 font-bold text-xs">
              <HiOutlineSparkles className="w-3.5 h-3.5 text-orange-500" />
              <span>{t('editBoxTitle')}</span>
            </div>
            <textarea
              value={editInstruction}
              onChange={(e) => setEditInstruction(e.target.value)}
              placeholder={t('editBoxPlaceholder')}
              rows={2}
              className="w-full text-xs rounded-lg border border-orange-200 bg-white p-2 text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300 resize-none"
              disabled={isBusy}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleSubmitEdit(e);
                }
              }}
            />
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowEditBox(false);
                  setEditInstruction('');
                }}
                disabled={isBusy}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg transition"
              >
                {t('cancelEdit')}
              </button>
              <button
                type="button"
                onClick={handleSubmitEdit}
                disabled={!editInstruction.trim() || isBusy}
                className="px-4 py-1.5 text-xs font-bold bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white rounded-lg transition flex items-center gap-1.5 shadow-sm"
              >
                <HiOutlineSparkles className="w-3.5 h-3.5" />
                {isBusy ? t('editing') : t('applyEdit')}
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
            {t('viewFullscreen')}
          </button>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => setShowEditBox((prev) => !prev)}
              className={`py-2.5 border font-black text-[10px] uppercase tracking-widest rounded-xl flex items-center justify-center gap-1 transition-all ${
                showEditBox
                  ? 'bg-orange-500 border-orange-500 text-white shadow-sm'
                  : 'bg-white border-orange-200 text-orange-700 hover:bg-orange-50'
              }`}
            >
              <HiOutlineSparkles className="w-3.5 h-3.5" />
              {t('editWithAi')}
            </button>
            <button
              onClick={() => onSaveToLibrary?.(page)}
              className="py-2.5 bg-white border border-slate-200 text-slate-700 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-50 flex items-center justify-center gap-1"
            >
              <HiOutlinePencilAlt className="w-3.5 h-3.5 text-slate-500" />
              {t('editAndSave')}
            </button>
            <button
              onClick={() => onGenerateNew?.()}
              className="py-2.5 bg-slate-50 border border-slate-200 text-slate-600 font-black text-[10px] uppercase tracking-widest rounded-xl hover:bg-slate-100 flex items-center justify-center gap-1"
            >
              <HiOutlineSparkles className="w-3.5 h-3.5" />
              {t('createNew')}
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
          <div className="flex-1 min-h-0 bg-slate-800 overflow-auto">
            {device === 'mobile' ? (
              <div className="flex items-center justify-center p-4 min-h-full">
                <div className="w-[375px] h-[667px] flex-shrink-0 bg-white rounded-xl overflow-hidden shadow-2xl">
                  <iframe
                    srcDoc={fullHtml}
                    className="w-full h-full border-0"
                    title="Landing Page Fullscreen Preview"
                    sandbox="allow-scripts"
                  />
                </div>
              </div>
            ) : (
              <div className="h-full p-4 flex flex-col">
                <div className="flex-1 min-h-0 w-full max-w-6xl mx-auto bg-white rounded-xl overflow-hidden shadow-2xl">
                  <iframe
                    srcDoc={fullHtml}
                    className="w-full h-full border-0"
                    title="Landing Page Fullscreen Preview"
                    sandbox="allow-scripts"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};

export default LandingPageCard;
