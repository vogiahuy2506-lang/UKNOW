import { useLandingHtmlMode } from '../hooks/useLandingHtmlMode.js';
import LandingFullHtmlRenderer from './LandingFullHtmlRenderer.jsx';

export default function LandingHtmlModeGate({ page, title = 'Founder AI', children }) {
  const { loading, isHtmlMode, htmlContent, cssContent } = useLandingHtmlMode(page);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-white/60 text-sm">
        Đang tải…
      </div>
    );
  }

  if (isHtmlMode) {
    return <LandingFullHtmlRenderer html={htmlContent} cssContent={cssContent} title={title} />;
  }

  return children;
}
