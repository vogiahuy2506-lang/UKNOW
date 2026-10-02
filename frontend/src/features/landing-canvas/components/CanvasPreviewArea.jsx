import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { HiOutlineEye, HiOutlineCode, HiOutlineSparkles, HiOutlineTemplate } from 'react-icons/hi';
import DeviceFrameToggle from './DeviceFrameToggle.jsx';
import ZoomControl from './ZoomControl.jsx';
import CanvasPreviewView from './CanvasPreviewView.jsx';
import CanvasPreviewCode from './CanvasPreviewCode.jsx';
import { DEFAULT_VIEWPORT, DEFAULT_ZOOM, DEVICES } from '../utils/deviceFrameConfig.js';
import { useCanvasSrcDoc, getPublicUrlFromSlug } from '../utils/buildCanvasSrcDoc.js';
import { useI18n } from '../../../i18n';

/**
 * Preview area: iframe / code editor.
 *
 * Khi được LandingCanvasLayout truyền controls (mode, viewport, zoom...), thanh toolbar h-14
 * bên trong sẽ được ẩn đi (vì đã gộp lên LandingCanvasTopbar) để giải phóng tối đa chiều cao hiển thị.
 */
export default function CanvasPreviewArea({
  form,
  setForm,
  onOpenImportHtml,
  onOpenTemplateGallery,
  onFocusChat,
  isChatCollapsed = false,
  onToggleChat,
  // Props điều khiển từ ngoài (Topbar)
  mode: propMode,
  onModeChange: propOnModeChange,
  viewport: propViewport,
  onViewportChange: propOnViewportChange,
  zoom: propZoom,
  onZoomChange: propOnZoomChange,
  isFitToScreen: propIsFitToScreen = false,
  onToggleFitToScreen: _propOnToggleFitToScreen,
  onFitPercentChange,
}) {
  const tc = useI18n('landingCanvas.canvasPreview');

  // Fallback state nội bộ khi không truyền từ ngoài (đảm bảo 100% backwards-compatibility cho unit tests)
  const [internalMode, setInternalMode] = useState('view');
  const [internalViewport, setInternalViewport] = useState(DEFAULT_VIEWPORT);
  const [internalZoom, setInternalZoom] = useState(DEFAULT_ZOOM);

  const hasExternalControls = propMode !== undefined;
  const mode = hasExternalControls ? propMode : internalMode;
  const setMode = hasExternalControls ? propOnModeChange : setInternalMode;
  const viewport = hasExternalControls ? (propViewport || DEFAULT_VIEWPORT) : internalViewport;
  const setViewport = hasExternalControls ? propOnViewportChange : setInternalViewport;
  const zoom = hasExternalControls ? (propZoom || DEFAULT_ZOOM) : internalZoom;
  const setZoom = hasExternalControls ? propOnZoomChange : setInternalZoom;

  const html = form?.htmlContent || '';
  const title = form?.title || '';
  const slug = form?.slug || '';

  const srcDoc = useCanvasSrcDoc({ html, title, slug, emptyHint: tc('empty'), formSlotHint: tc('formSlotHint') });
  const publicUrl = useMemo(() => getPublicUrlFromSlug(slug), [slug]);

  const handleCodeChange = useCallback(
    (next) => {
      setForm((prev) => ({ ...prev, htmlContent: next }));
    },
    [setForm]
  );

  // Đo kích thước vùng chứa preview để tính toán "Vừa màn hình" (Fit to Screen)
  const containerRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    updateSize();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => updateSize());
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const currentDevice = DEVICES[viewport] || DEVICES.desktop;

  // Tính toán zoom hiệu dụng khi ở chế độ "Vừa màn hình" (Fit to Screen)
  const effectiveZoom = useMemo(() => {
    if (!propIsFitToScreen) return zoom;
    if (!containerSize.width || !containerSize.height) return zoom;
    const paddingX = 24;
    const paddingY = 28;
    const availableW = Math.max(150, containerSize.width - paddingX);
    const availableH = Math.max(150, containerSize.height - paddingY);
    const scaleX = availableW / currentDevice.width;
    const scaleY = availableH / currentDevice.height;
    const fitScale = Math.min(scaleX, scaleY);
    const clampedScale = Math.round(Math.min(1.2, Math.max(0.25, fitScale)) * 100) / 100;
    onFitPercentChange?.(Math.round(clampedScale * 100));
    return clampedScale;
  }, [propIsFitToScreen, zoom, containerSize.width, containerSize.height, currentDevice.width, currentDevice.height, onFitPercentChange]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Chỉ render toolbar nội bộ khi KHÔNG có điều khiển từ Topbar (backward-compat) */}
      {!hasExternalControls && (
        <div className="h-14 px-4 flex items-center justify-between border-b border-gray-200 bg-white shrink-0">
          <div className="flex items-center gap-2">
            {isChatCollapsed && onToggleChat && (
              <button
                type="button"
                onClick={onToggleChat}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 hover:bg-orange-100 hover:text-orange-800 border border-orange-200 text-xs sm:text-sm font-semibold transition-all shadow-2xs mr-1"
                title="Mở lại khung chat Trợ lý AI"
              >
                <HiOutlineSparkles className="w-4 h-4 text-orange-500 animate-pulse" />
                <span>Mở Trợ lý AI</span>
              </button>
            )}

            <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg">
              <button
                type="button"
                onClick={() => setMode('view')}
                className={`px-3 py-1.5 text-[14px] font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                  mode === 'view'
                    ? 'bg-white text-orange-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <HiOutlineEye className="w-4 h-4" />
                {tc('view')}
              </button>
              <button
                type="button"
                onClick={() => setMode('code')}
                className={`px-3 py-1.5 text-[14px] font-semibold rounded-md transition-colors flex items-center gap-1.5 ${
                  mode === 'code'
                    ? 'bg-white text-orange-600 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <HiOutlineCode className="w-3.5 h-3.5" />
                {tc('code')}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <DeviceFrameToggle value={viewport} onChange={setViewport} />
            <ZoomControl value={zoom} onChange={setZoom} />
          </div>
        </div>
      )}

      {/* Vùng xem trước: Padding tinh gọn p-2 sm:p-3, chiếm trọn vẹn không gian */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto bg-[#f8fafc] p-2 sm:p-3 flex justify-center items-start"
      >
        {mode === 'view' ? (
          html ? (
            <CanvasPreviewView
              srcDoc={srcDoc}
              viewport={
                {
                  key: viewport,
                  width: currentDevice.width,
                  height: currentDevice.height,
                  label: viewport,
                }
              }
              zoom={effectiveZoom}
              publicUrl={publicUrl}
            />
          ) : (
            <EmptyPreviewCard
              heading={tc('empty')}
              onPasteHtml={onOpenImportHtml}
              onAskAi={onFocusChat}
              onPickTemplate={onOpenTemplateGallery}
            />
          )
        ) : (
          <CanvasPreviewCode value={html} onChange={handleCodeChange} />
        )}
      </div>
    </div>
  );
}

/**
 * Trang mới (html rỗng): thay khung "Xem trước" bằng 3 lựa chọn trực quan
 */
function EmptyPreviewCard({ heading, onPasteHtml, onAskAi, onPickTemplate }) {
  const te = useI18n('landingCanvas.emptyState');

  return (
    <div className="flex flex-col items-center justify-center max-w-3xl w-full my-auto py-10 px-4">
      {/* Welcome Header */}
      <div className="text-center mb-8 space-y-2">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-400 text-white shadow-lg shadow-orange-500/20 mb-2">
          <HiOutlineSparkles className="w-7 h-7" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900 tracking-tight">
          Bắt đầu tạo Landing Page của bạn
        </h2>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          {heading || 'Chọn một phương thức bên dưới hoặc nhập yêu cầu trực tiếp với AI bên trái để lên ý tưởng'}
        </p>
      </div>

      {/* 3 Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
        {/* Card 1: Ask AI */}
        <div className="relative group flex flex-col justify-between p-5 rounded-2xl border-2 border-orange-400/80 bg-gradient-to-b from-orange-50/70 via-white to-white shadow-xs hover:shadow-xl hover:border-orange-500 hover:-translate-y-1 transition-all duration-200">
          <span className="absolute -top-3 right-4 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-xs">
            {te('cardAiBadge')}
          </span>
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-orange-100/80 text-orange-600 flex items-center justify-center">
              <HiOutlineSparkles className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">{te('cardAiTitle')}</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{te('cardAiDesc')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onAskAi}
            className="mt-5 w-full py-2.5 px-3 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 active:scale-[0.98] text-white text-xs font-bold shadow-xs hover:shadow transition-all text-center cursor-pointer"
          >
            {te('cardAiAction')}
          </button>
        </div>

        {/* Card 2: Pick Template */}
        <div className="group flex flex-col justify-between p-5 rounded-2xl border border-gray-200/90 bg-white shadow-xs hover:shadow-lg hover:border-gray-300 hover:-translate-y-0.5 transition-all duration-200">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <HiOutlineTemplate className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">{te('cardTemplateTitle')}</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{te('cardTemplateDesc')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onPickTemplate}
            className="mt-5 w-full py-2.5 px-3 rounded-xl border border-gray-300/90 hover:bg-gray-50 active:bg-gray-100 text-gray-700 text-xs font-semibold shadow-2xs transition-all text-center cursor-pointer"
          >
            {te('cardTemplateAction')}
          </button>
        </div>

        {/* Card 3: Paste HTML */}
        <div className="group flex flex-col justify-between p-5 rounded-2xl border border-gray-200/90 bg-white shadow-xs hover:shadow-lg hover:border-gray-300 hover:-translate-y-0.5 transition-all duration-200">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center">
              <HiOutlineCode className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-base">{te('cardPasteTitle')}</h3>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">{te('cardPasteDesc')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onPasteHtml}
            className="mt-5 w-full py-2.5 px-3 rounded-xl border border-gray-300/90 hover:bg-gray-50 active:bg-gray-100 text-gray-700 text-xs font-semibold shadow-2xs transition-all text-center cursor-pointer"
          >
            {te('cardPasteAction')}
          </button>
        </div>
      </div>
    </div>
  );
}
