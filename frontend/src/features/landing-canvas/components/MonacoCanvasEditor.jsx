import { useCallback, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { useI18n } from '../../../i18n';

const MONACO_OPTIONS = {
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
  language: 'html',
  theme: 'vs-dark',
};

/**
 * Monaco-powered HTML editor thay thế CanvasPreviewCode textarea.
 * Lazy-loads Monaco để tránh bundle bloat.
 *
 * Dùng `height` cố định (650px) thay cho 100% để tránh parent flex chain
 * không xác định chiều cao khiến editor collapse về 0px.
 */
export default function MonacoCanvasEditor({ value, onChange }) {
  const tc = useI18n('landingCanvas.canvasPreview');
  const editorRef = useRef(null);

  const handleMount = useCallback((editor) => {
    editorRef.current = editor;
  }, []);

  const handleChange = useCallback(
    (next) => {
      onChange?.(next ?? '');
    },
    [onChange]
  );

  return (
    <div className="w-full bg-[#1e1e1e] rounded-lg overflow-hidden border border-[#333]" style={{ height: 650 }}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#333] bg-[#252526]">
        <div className="w-3 h-3 rounded-full bg-red-500 opacity-80" />
        <div className="w-3 h-3 rounded-full bg-yellow-500 opacity-80" />
        <div className="w-3 h-3 rounded-full bg-green-500 opacity-80" />
        <span className="ml-2 text-[11px] text-gray-400 font-mono">index.html</span>
        <span className="ml-auto text-[11px] text-gray-500">
          {(value ?? '').length.toLocaleString('vi-VN')} ký tự
        </span>
      </div>
      <div style={{ height: 610 }}>
        <Editor
          height="100%"
          defaultLanguage="html"
          value={value || ''}
          onChange={handleChange}
          onMount={handleMount}
          options={MONACO_OPTIONS}
          loading={
            <div className="flex items-center justify-center h-full text-gray-500 text-[13px] bg-[#1e1e1e]">
              {tc('monacoLoading')}
            </div>
          }
        />
      </div>
    </div>
  );
}
