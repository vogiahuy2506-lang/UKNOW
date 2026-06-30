import { useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';

const EDITOR_OPTIONS = {
  minimap: { enabled: false },
  fontSize: 13,
  lineNumbers: 'on',
  scrollBeyondLastLine: false,
  automaticLayout: true,
  tabSize: 2,
  wordWrap: 'on',
  padding: { top: 16, bottom: 16 },
  renderLineHighlight: 'line',
  scrollbar: {
    vertical: 'auto',
    horizontal: 'auto',
    verticalScrollbarSize: 10,
    horizontalScrollbarSize: 10,
  },
};

export default function CodeEditorPanel({ html, css, onHtmlChange, onCssChange, activeTab, onTabChange }) {
  const editorRef = useRef(null);

  const handleHtmlEditorDidMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    setupTailwindAutocomplete(monaco);
  }, []);

  const handleCssEditorDidMount = useCallback((editor) => {
    editorRef.current = editor;
  }, []);

  const setupTailwindAutocomplete = (monaco) => {
    monaco.languages.registerCompletionItemProvider('html', {
      provideCompletionItems: (model, position) => {
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        };

        const tailwindSuggestions = [
          'bg-', 'text-', 'p-', 'm-', 'flex', 'grid', 'block', 'inline', 'hidden',
          'w-', 'h-', 'min-', 'max-', 'top-', 'left-', 'right-', 'bottom-',
          'border-', 'rounded-', 'shadow-', 'opacity-', 'z-',
          'font-', 'text-', 'leading-', 'tracking-',
          'hover:', 'focus:', 'active:', 'group-hover:',
          'sm:', 'md:', 'lg:', 'xl:', '2xl:',
          'from-', 'to-', 'via-', 'gradient-',
        ].map((prefix) => ({
          label: prefix,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: prefix,
          range,
        }));

        return { suggestions: tailwindSuggestions };
      },
    });
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700">
        <div className="flex bg-slate-700 rounded-lg p-1">
          <button
            onClick={() => onTabChange('html')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'html'
                ? 'bg-slate-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            HTML
          </button>
          <button
            onClick={() => onTabChange('css')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'css'
                ? 'bg-slate-600 text-white'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            CSS
          </button>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          {activeTab === 'html' && (
            <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded">
              Tailwind + Custom CSS
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {activeTab === 'html' ? (
          <Editor
            height="100%"
            language="html"
            value={html}
            onChange={(value) => onHtmlChange(value || '')}
            theme="vs-dark"
            onMount={handleHtmlEditorDidMount}
            options={EDITOR_OPTIONS}
          />
        ) : (
          <Editor
            height="100%"
            language="css"
            value={css}
            onChange={(value) => onCssChange(value || '')}
            theme="vs-dark"
            onMount={handleCssEditorDidMount}
            options={EDITOR_OPTIONS}
          />
        )}
      </div>
    </div>
  );
}
