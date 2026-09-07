import { HiOutlineExternalLink } from 'react-icons/hi';
import { HiDesktopComputer } from 'react-icons/hi';
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

  return (
    <div className="flex flex-col items-center gap-2 w-full">
      {publicUrl ? (
        <a
          href={publicUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[12px] text-blue-600 hover:underline self-end mr-1"
        >
          <HiOutlineExternalLink className="w-3.5 h-3.5" />
          {tc('openNewTab')}
        </a>
      ) : null}

      <div
        className="bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden transition-all duration-200"
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

      <div className="text-[11px] text-gray-400 flex items-center gap-1 mt-1">
        <HiDesktopComputer className="w-3.5 h-3.5" />
        {device.width} × {device.height}
      </div>
    </div>
  );
}
