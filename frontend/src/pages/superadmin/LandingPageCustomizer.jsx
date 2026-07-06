import { useState } from 'react';
import CanvasEditor from '../../features/landing-customizer/components/CanvasEditor';
import HtmlFullPageEditor from '../../features/landing-customizer/components/HtmlFullPageEditor';

export default function LandingPageCustomizer() {
  const [editorMode, setEditorMode] = useState('canva');

  const modeHint = {
    canva: 'Drag, resize and edit elements directly',
    html: 'Paste full HTML — toggle back to default display anytime',
  }[editorMode] || '';

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-4 flex-wrap">
        <span className="text-sm font-medium text-slate-600">Editor Mode:</span>
        <div className="flex bg-white border border-slate-200 rounded-lg p-0.5 flex-wrap">
          <button
            type="button"
            onClick={() => setEditorMode('canva')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              editorMode === 'canva'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Canva Editor
          </button>
          <button
            type="button"
            onClick={() => setEditorMode('html')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              editorMode === 'html'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            HTML Full
          </button>
        </div>
        <div className="flex-1" />
        <div className="text-xs text-slate-500">{modeHint}</div>
      </div>

      <div className="flex-1 min-h-0">
        {editorMode === 'canva' && <CanvasEditor />}
        {editorMode === 'html' && <HtmlFullPageEditor />}
      </div>
    </div>
  );
}
