import { buildLandingHtmlSrcDoc } from '../utils/buildLandingHtmlSrcDoc.js';

export default function LandingFullHtmlRenderer({ html, cssContent = '', title = 'Founder AI' }) {
  const srcDoc = buildLandingHtmlSrcDoc(html, cssContent);

  if (!srcDoc) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-gray-500 text-sm">
        Không có nội dung HTML
      </div>
    );
  }

  return (
    <iframe
      title={title}
      className="w-full min-h-screen border-0 block"
      sandbox="allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
      srcDoc={srcDoc}
    />
  );
}
