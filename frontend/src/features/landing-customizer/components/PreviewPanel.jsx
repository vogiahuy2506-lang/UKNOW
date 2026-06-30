import { useState } from 'react';

export default function PreviewPanel({ page }) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const pageUrls = {
    hero: '/',
    contact: '/contact',
    pricing: '/pricing',
  };

  const previewUrl = pageUrls[page] || '/';
  const fullscreenUrl = `${window.location.origin}${previewUrl}`;

  const handleOpenNewTab = () => {
    window.open(previewUrl, '_blank');
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
      <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
        <h3 className="font-bold text-slate-800">Preview</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            {isFullscreen ? 'Thu nhỏ' : 'Phóng to'}
          </button>
          <button
            onClick={handleOpenNewTab}
            className="px-3 py-1.5 text-sm text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Mở tab mới
          </button>
        </div>
      </div>

      <div className={`bg-slate-200 ${isFullscreen ? 'h-[calc(100vh-200px)]' : 'h-[500px]'}`}>
        <iframe
          src={previewUrl}
          title={`${page} preview`}
          className="w-full h-full border-0"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>

      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-white p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-lg">{page} Preview</h3>
            <button
              onClick={() => setIsFullscreen(false)}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
            >
              Đóng
            </button>
          </div>
          <iframe
            src={fullscreenUrl}
            title={`${page} fullscreen preview`}
            className="w-full h-[calc(100%-60px)] border rounded-lg"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      )}
    </div>
  );
}
