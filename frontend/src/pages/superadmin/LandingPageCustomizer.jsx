import { useState } from 'react';
import LandingPageEditor from '../../features/landing-customizer/components/LandingPageEditor';
import CanvasEditor from '../../features/landing-customizer/components/CanvasEditor';

export default function LandingPageCustomizer() {
  const [editorMode, setEditorMode] = useState('canva'); // 'basic' | 'canva'

  return (
    <div className="h-full flex flex-col">
      {/* Mode Toggle */}
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-4">
        <span className="text-sm font-medium text-slate-600">Editor Mode:</span>
        <div className="flex bg-white border border-slate-200 rounded-lg p-0.5">
          <button
            onClick={() => setEditorMode('basic')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              editorMode === 'basic'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Basic Editor
          </button>
          <button
            onClick={() => setEditorMode('canva')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
              editorMode === 'canva'
                ? 'bg-orange-500 text-white shadow-sm'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            Canva Editor
          </button>
        </div>
        <div className="flex-1" />
        <div className="text-xs text-slate-500">
          {editorMode === 'basic' 
            ? 'Click on elements to edit in a popup panel'
            : 'Drag, resize and edit elements directly'
          }
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1">
        {editorMode === 'basic' ? (
          <LandingPageEditor />
        ) : (
          <CanvasEditor />
        )}
      </div>
    </div>
  );
}
