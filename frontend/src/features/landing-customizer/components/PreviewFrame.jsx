import { useEffect, useRef, useState } from 'react';

const PAGE_URLS = {
  hero: '/',
  contact: '/contact',
  pricing: '/pricing',
};

const INJECT_SCRIPT = `
(function() {
  const style = document.createElement('style');
  style.textContent = \`
    [data-edit] { cursor: pointer; }
    [data-edit]:hover { outline: 2px dashed #f97316; outline-offset: 2px; }
  \`;
  document.head.appendChild(style);

  document.addEventListener('click', function(e) {
    const target = e.target.closest('[data-edit]');
    if (target) {
      e.preventDefault();
      window.parent.postMessage({
        type: 'ELEMENT_CLICK',
        editId: target.dataset.edit
      }, '*');
    }
  });
})();
`;

export default function PreviewFrame({ 
  page, 
  device = 'desktop', 
  locale = 'vi', 
  overrides = {},
  onElementSelected 
}) {
  const iframeRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setIsLoading(true);
    setError(null);
  }, [page, locale]);

  useEffect(() => {
    if (overrides && Object.keys(overrides).length > 0) {
      // Save without locale for preview
      localStorage.setItem(`landing_overrides_${page}`, JSON.stringify(overrides));
    }
  }, [overrides, page]);

  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data?.type === 'ELEMENT_CLICK' && onElementSelected) {
        onElementSelected(e.data.editId);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onElementSelected]);

  const handleIframeLoad = () => {
    setIsLoading(false);
    try {
      const script = iframeRef.current?.contentDocument?.createElement('script');
      if (script) {
        script.textContent = INJECT_SCRIPT;
        iframeRef.current.contentDocument.head.appendChild(script);
      }
    } catch (err) {
      console.warn('Cannot inject script:', err);
    }
  };

  const pageUrl = PAGE_URLS[page] || '/';
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  const previewUrl = `${origin}${pageUrl}?lang=${locale}&preview=edit`;

  const getDeviceWidth = () => {
    switch (device) {
      case 'mobile': return '375px';
      case 'tablet': return '768px';
      default: return '100%';
    }
  };

  return (
    <div className="relative w-full h-full" style={{ minHeight: '600px' }}>
      {/* Browser Chrome */}
      <div className="bg-slate-800 px-4 py-2 flex items-center gap-3 sticky top-0 z-10">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-red-500" />
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <div className="w-3 h-3 rounded-full bg-green-500" />
        </div>
        <div className="flex-1 bg-slate-700 rounded-md px-3 py-1 text-xs text-slate-300 truncate">
          {previewUrl}
        </div>
        <div className="text-xs text-slate-400 font-mono">
          {getDeviceWidth()}
        </div>
      </div>

      {/* iframe container */}
      <div 
        className="relative bg-white overflow-auto" 
        style={{ height: 'calc(100vh - 180px)', minHeight: '500px' }}
      >
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-slate-500 font-medium">Loading preview...</span>
            </div>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-red-50 z-20">
            <div className="flex flex-col items-center gap-3 text-center p-6">
              <div className="text-4xl">⚠️</div>
              <span className="text-sm text-red-600 font-medium">{error}</span>
            </div>
          </div>
        )}

        <iframe
          key={`${page}-${locale}`}
          ref={iframeRef}
          src={previewUrl}
          title={`Preview: ${page}`}
          className="border-0"
          style={{ width: getDeviceWidth(), height: '100%', minHeight: '600px', display: 'block' }}
          onLoad={handleIframeLoad}
          onError={() => setError('Failed to load preview')}
          sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-popups"
        />
      </div>
    </div>
  );
}
