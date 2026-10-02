import { useState, useMemo, useCallback } from 'react';
import { HiOutlineEye, HiOutlineCode, HiOutlineSparkles, HiOutlineTemplate } from 'react-icons/hi';
import DeviceFrameToggle from './DeviceFrameToggle.jsx';
import ZoomControl from './ZoomControl.jsx';
import CanvasPreviewView from './CanvasPreviewView.jsx';
import CanvasPreviewCode from './CanvasPreviewCode.jsx';
import { DEFAULT_VIEWPORT, DEFAULT_ZOOM } from '../utils/deviceFrameConfig.js';
import { useCanvasSrcDoc, getPublicUrlFromSlug } from '../utils/buildCanvasSrcDoc.js';
import { useI18n } from '../../../i18n';

/**
 * Preview area: toolbar + iframe/code editor.
 *
 * Props:
 *  - form: { htmlContent, title, slug, ... }
 *  - setForm: cập nhật htmlContent khi user edit code mode
 *  - onOpenImportHtml: mở modal "Nhập HTML" (nút "Dán HTML có sẵn" ở thẻ trang mới)
 *  - onOpenTemplateGallery: mở thư viện template (nút "Chọn mẫu")
 *  - onFocusChat: focus ô nhập chat (nút "Nhờ AI tạo")
 *    (PLAN_LANDING_DAN_HTML_CO_SAN_2026-09-13.md, Việc 2)
 */
export default function CanvasPreviewArea({
  form,
  setForm,
  onOpenImportHtml,
  onOpenTemplateGallery,
  onFocusChat,
  isChatCollapsed = false,
  onToggleChat,
}) {
  const tc = useI18n('landingCanvas.canvasPreview');
  const [mode, setMode] = useState('view');
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

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

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="h-14 px-4 flex items-center justify-between border-b border-gray-200 bg-white shrink-0">
        <div className="flex items-center gap-2">
          {isChatCollapsed && (
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

      <div className="flex-1 min-h-0 overflow-auto bg-[#f8fafc] p-3 sm:p-4 flex justify-center">
        {mode === 'view' ? (
          html ? (
            <CanvasPreviewView
              srcDoc={srcDoc}
              viewport={
                {
                  key: viewport,
                  width:
                    viewport === 'desktop' ? 1280 : viewport === 'tablet' ? 768 : 375,
                  height:
                    viewport === 'desktop' ? 800 : viewport === 'tablet' ? 1024 : 667,
                  label: viewport,
                }
              }
              zoom={zoom}
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
 * (PLAN_LANDING_DAN_HTML_CO_SAN_2026-09-13.md, Việc 2). Chỉ hiện ở mode 'view' — mode 'code'
 * người dùng đã chủ động mở Monaco, không cần gợi ý lại.
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
        {/* Card 1: Ask AI (Recommended) */}
        <div className="relative group flex flex-col justify-between p-5 rounded-2xl border-2 border-orange-400/80 bg-gradient-to-b from-orange-50/70 via-white to-white shadow-xs hover:shadow-xl hover:border-orange-500 hover:-translate-y-1 transition-all duration-200">
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-orange-500 text-white shadow-xs">
              Khuyên dùng
            </span>
          </div>

          <div>
            <div className="w-11 h-11 rounded-xl bg-orange-100/80 text-orange-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <HiOutlineSparkles className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1.5">{te('askAi')}</h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-4">
              Mô tả ý tưởng trang, AI sẽ tự động viết nội dung và tạo giao diện trong vài giây.
            </p>
          </div>

          <button
            type="button"
            onClick={onAskAi}
            className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-bold shadow-xs hover:shadow-md hover:from-orange-600 hover:to-amber-600 transition-all active:scale-[0.98]"
          >
            <HiOutlineSparkles className="w-4 h-4" />
            <span>{te('askAi')}</span>
          </button>
        </div>

        {/* Card 2: Pick Template */}
        <div className="group flex flex-col justify-between p-5 rounded-2xl border border-gray-200/90 bg-white shadow-xs hover:shadow-xl hover:border-blue-400 hover:-translate-y-1 transition-all duration-200">
          <div>
            <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <HiOutlineTemplate className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1.5">{te('pickTemplate')}</h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-4">
              Kho mẫu đa dạng tối ưu cho chuyển đổi: khóa học, SaaS, bán hàng, dịch vụ...
            </p>
          </div>

          <button
            type="button"
            onClick={onPickTemplate}
            className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-gray-50 hover:bg-blue-50 text-gray-700 hover:text-blue-700 border border-gray-200 hover:border-blue-300 text-xs font-bold transition-all active:scale-[0.98]"
          >
            <HiOutlineTemplate className="w-4 h-4" />
            <span>{te('pickTemplate')}</span>
          </button>
        </div>

        {/* Card 3: Paste HTML */}
        <div className="group flex flex-col justify-between p-5 rounded-2xl border border-gray-200/90 bg-white shadow-xs hover:shadow-xl hover:border-gray-400 hover:-translate-y-1 transition-all duration-200">
          <div>
            <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
              <HiOutlineCode className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1.5">{te('pasteHtml')}</h3>
            <p className="text-xs text-gray-500 leading-relaxed mb-4">
              Đã có sẵn mã HTML từ trước? Dán mã nguồn để nhập và chỉnh sửa tức thì.
            </p>
          </div>

          <button
            type="button"
            onClick={onPasteHtml}
            className="w-full inline-flex items-center justify-center gap-2 h-10 px-4 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 text-xs font-bold transition-all active:scale-[0.98]"
          >
            <HiOutlineCode className="w-4 h-4" />
            <span>{te('pasteHtml')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
