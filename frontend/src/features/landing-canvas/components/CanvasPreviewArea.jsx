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
export default function CanvasPreviewArea({ form, setForm, onOpenImportHtml, onOpenTemplateGallery, onFocusChat }) {
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

        <div className="flex items-center gap-2">
          <DeviceFrameToggle value={viewport} onChange={setViewport} />
          <ZoomControl value={zoom} onChange={setZoom} />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto bg-[#f8fafc] p-6 flex justify-center">
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
 * Trang mới (html rỗng): thay khung "Xem trước" bằng 3 lựa chọn thay vì khung trắng câm
 * (PLAN_LANDING_DAN_HTML_CO_SAN_2026-09-13.md, Việc 2). Chỉ hiện ở mode 'view' — mode 'code'
 * người dùng đã chủ động mở Monaco, không cần gợi ý lại.
 */
function EmptyPreviewCard({ heading, onPasteHtml, onAskAi, onPickTemplate }) {
  const te = useI18n('landingCanvas.emptyState');

  return (
    <div className="flex flex-col items-center justify-center gap-5 max-w-sm w-full py-20 text-center">
      <p className="text-[14px] text-gray-500">{heading}</p>
      <div className="flex flex-col gap-2.5 w-full">
        <button
          type="button"
          onClick={onPasteHtml}
          className="w-full inline-flex items-center justify-center gap-2 h-11 px-4 rounded-lg bg-orange-500 text-white text-[14px] font-semibold hover:bg-orange-600 transition-colors"
        >
          <HiOutlineCode className="w-4.5 h-4.5" />
          {te('pasteHtml')}
        </button>
        <button
          type="button"
          onClick={onAskAi}
          className="w-full inline-flex items-center justify-center gap-2 h-11 px-4 rounded-lg bg-white border border-gray-300 text-gray-700 text-[14px] font-semibold hover:bg-gray-50 transition-colors"
        >
          <HiOutlineSparkles className="w-4.5 h-4.5 text-orange-500" />
          {te('askAi')}
        </button>
        <button
          type="button"
          onClick={onPickTemplate}
          className="w-full inline-flex items-center justify-center gap-2 h-11 px-4 rounded-lg bg-white border border-gray-300 text-gray-700 text-[14px] font-semibold hover:bg-gray-50 transition-colors"
        >
          <HiOutlineTemplate className="w-4.5 h-4.5 text-orange-500" />
          {te('pickTemplate')}
        </button>
      </div>
    </div>
  );
}
