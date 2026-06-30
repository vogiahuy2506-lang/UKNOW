import { useEffect, useRef, useState, useCallback } from 'react';

const TAILWIND_CDN = 'https://cdn.tailwindcss.com';

const DEFAULT_HTML = `
<div class="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800">
  <div class="text-center text-white max-w-2xl px-6">
    <div class="mb-6">
      <div class="w-20 h-20 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
        <span class="text-4xl">📄</span>
      </div>
      <h1 class="text-4xl font-bold mb-4">Landing Page Preview</h1>
      <p class="text-xl text-white/70 mb-8">Đây là trang xem trước. Vui lòng nhập HTML và CSS để xem kết quả.</p>
    </div>
    
    <div class="bg-white/10 backdrop-blur-sm rounded-2xl p-6 border border-white/20">
      <h3 class="font-semibold mb-3">Hướng dẫn:</h3>
      <ul class="text-left text-white/80 space-y-2 text-sm">
        <li>1. Chuyển sang tab <strong class="text-orange-400">HTML Override</strong> để nhập HTML</li>
        <li>2. Chuyển sang tab <strong class="text-purple-400">CSS Override</strong> để nhập CSS</li>
        <li>3. Preview sẽ tự động cập nhật khi bạn nhập</li>
        <li>4. Nhấn <strong class="text-orange-400">Lưu</strong> để lưu thay đổi</li>
      </ul>
    </div>
    
    <div class="mt-6 flex justify-center gap-4">
      <div class="px-4 py-2 bg-white/10 rounded-lg text-sm">
        <span class="text-white/60">Trang:</span>
        <span class="text-white font-medium ml-2" id="page-name">Hero</span>
      </div>
      <div class="px-4 py-2 bg-white/10 rounded-lg text-sm">
        <span class="text-white/60">Device:</span>
        <span class="text-white font-medium ml-2" id="device-name">Desktop</span>
      </div>
    </div>
  </div>
</div>
`;

export default function LivePreviewFrame({ html, css, device = 'desktop', pageName = 'Hero' }) {
  const iframeRef = useRef(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dimensions, setDimensions] = useState({ width: '100%', height: '600px' });

  const updateDimensions = useCallback(() => {
    switch (device) {
      case 'mobile':
        setDimensions({ width: '375px', height: '667px' });
        break;
      case 'tablet':
        setDimensions({ width: '768px', height: '1024px' });
        break;
      default:
        setDimensions({ width: '100%', height: '100%' });
    }
  }, [device]);

  const updatePreview = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const doc = iframe.contentDocument;
    if (!doc) return;

    const displayHtml = html && html.trim() ? html : DEFAULT_HTML;
    const displayDevice = device.charAt(0).toUpperCase() + device.slice(1);
    const displayPage = pageName.charAt(0).toUpperCase() + pageName.slice(1);

    const previewHtml = `
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
  <script src="${TAILWIND_CDN}"></script>
  <style>
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Inter', system-ui, sans-serif;
      -webkit-font-smoothing: antialiased;
      -moz-osx-font-smoothing: grayscale;
    }
    ${css}
  </style>
</head>
<body>
${displayHtml}
<script>
  // Update device name
  const deviceEl = document.getElementById('device-name');
  if (deviceEl) deviceEl.textContent = '${displayDevice}';
  
  // Update page name
  const pageEl = document.getElementById('page-name');
  if (pageEl) pageEl.textContent = '${displayPage}';
  
  // Handle links to prevent navigation
  document.addEventListener('click', function(e) {
    const link = e.target.closest('a');
    if (link) {
      e.preventDefault();
    }
  });
</script>
</body>
</html>`;

    doc.open();
    doc.write(previewHtml);
    doc.close();

    iframe.addEventListener('load', () => {
      setIsLoading(false);
    }, { once: true });
  }, [html, css, device, pageName]);

  useEffect(() => {
    updateDimensions();
  }, [updateDimensions]);

  useEffect(() => {
    setIsLoading(true);
    updatePreview();
  }, [updatePreview]);

  const hasContent = html && html.trim();

  return (
    <div className="relative w-full h-full bg-slate-100">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-10">
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-slate-500">Đang cập nhật preview...</span>
          </div>
        </div>
      )}

      {!hasContent && !isLoading && (
        <div className="absolute top-4 left-4 z-10 px-3 py-1.5 bg-yellow-100 text-yellow-700 text-xs font-medium rounded-full border border-yellow-200">
          Chưa có HTML override - Hiển thị placeholder
        </div>
      )}

      <div
        className="flex justify-center overflow-auto p-4"
        style={{ minHeight: '100%' }}
      >
        <div
          className="bg-white shadow-xl rounded-lg overflow-hidden transition-all duration-300"
          style={{
            width: dimensions.width,
            minHeight: dimensions.height,
          }}
        >
          <iframe
            ref={iframeRef}
            title="Preview"
            className="w-full h-full border-0"
            sandbox="allow-scripts allow-same-origin"
          />
        </div>
      </div>
    </div>
  );
}
