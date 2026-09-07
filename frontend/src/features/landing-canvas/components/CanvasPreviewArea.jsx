import { useState, useMemo, useCallback } from 'react';
import { HiOutlineEye, HiOutlineCode } from 'react-icons/hi';
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
 */
export default function CanvasPreviewArea({ form, setForm }) {
  const tc = useI18n('landingCanvas.canvasPreview');
  const [mode, setMode] = useState('view');
  const [viewport, setViewport] = useState(DEFAULT_VIEWPORT);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);

  const html = form?.htmlContent || '';
  const title = form?.title || '';
  const slug = form?.slug || '';

  const srcDoc = useCanvasSrcDoc({ html, title, slug, emptyHint: tc('empty') });
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
          <CanvasPreviewCode value={html} onChange={handleCodeChange} />
        )}
      </div>
    </div>
  );
}
