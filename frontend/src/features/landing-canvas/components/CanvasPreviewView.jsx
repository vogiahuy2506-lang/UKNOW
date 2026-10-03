import { HiOutlineExternalLink } from 'react-icons/hi';
import { DEVICES } from '../utils/deviceFrameConfig.js';
import { useI18n } from '../../../i18n';

/**
 * View mode: render iframe trong device frame.
 * Width/height áp dụng theo DEVICES, scale theo zoom slider.
 */
export default function CanvasPreviewView({ srcDoc, viewport, zoom, publicUrl }) {
  const tc = useI18n('landingCanvas.canvasPreview');
  const device = viewport;
  const scaledWidth = device.width * zoom;
  const scaledHeight = device.height * zoom;
  const deviceConfig = DEVICES[device?.key] || DEVICES.desktop;
  const DeviceIcon = deviceConfig.icon;

  return (
    <div className="flex flex-col items-center gap-1.5 w-full">
      {/* Header ngang hàng: Kích thước độ phân giải (trái) + Mở trong tab mới (phải) */}
      <div
        className="flex items-center justify-between text-gray-400 px-1 py-0.5 text-xs transition-all duration-200 select-none"
        style={{
          width: `${Math.max(280, scaledWidth)}px`,
          maxWidth: '100%',
        }}
      >
        <div
          className="inline-flex items-center gap-1.5 text-[11px] font-medium text-gray-500 bg-white/80 px-2 py-0.5 rounded-md border border-gray-200/70 shadow-2xs"
          title={`Độ phân giải mô phỏng: ${device.width} × ${device.height} px`}
        >
          <DeviceIcon className="w-3.5 h-3.5 text-gray-400" />
          <span>{device.width} × {device.height}</span>
        </div>

        {publicUrl ? (
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-[12px] font-medium text-blue-600 hover:text-blue-700 hover:underline transition-colors ml-auto"
          >
            <HiOutlineExternalLink className="w-3.5 h-3.5" />
            <span>{tc('openNewTab')}</span>
          </a>
        ) : null}
      </div>

      {/* Frame Iframe */}
      <div
        className="bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden transition-all duration-200"
        style={{
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
          maxWidth: '100%',
        }}
      >
        <iframe
          title="Landing preview"
          sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-same-origin"
          srcDoc={srcDoc}
          className="w-full h-full border-0 block bg-white"
        />
      </div>
    </div>
  );
}
