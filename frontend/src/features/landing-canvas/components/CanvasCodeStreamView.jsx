import { useEffect, useMemo, useRef, useState } from 'react';

/**
 * CanvasCodeStreamView — hiển thị animation "Gemini Canvas style":
 *  - Gõ từng ký tự một (typewriter)
 *  - Highlight dòng cuối vừa gõ
 *  - Caret nhấp nháy
 *  - Tự cuộn xuống khi vượt viewport
 *
 * Props:
 *  - text: chuỗi HTML đầy đủ (render đích)
 *  - streaming: bool — true thì chạy animation, false thì hiện nguyên text
 *  - speed: ký tự / frame (mặc định 8)
 *  - onDone?: callback khi gõ xong
 */
export default function CanvasCodeStreamView({ text = '', streaming = false, speed: _speed = 8, onDone }) {
  const [shown, setShown] = useState('');
  const rafRef = useRef(null);
  const idxRef = useRef(0);
  const containerRef = useRef(null);
  const lineCounterRef = useRef(0);
  const [currentLine, setCurrentLine] = useState(0);

  // Reset khi text đầu vào thay đổi
  useEffect(() => {
    if (!streaming) {
      setShown(text || '');
      idxRef.current = (text || '').length;
      const lines = (text || '').split('\n').length;
      setCurrentLine(lines);
      return undefined;
    }

    // streaming: gõ lại từ đầu
    setShown('');
    idxRef.current = 0;
    lineCounterRef.current = 0;
    setCurrentLine(0);

    const target = text || '';
    const startTs = performance.now();
    const totalChars = target.length || 1;
    // Tốc độ tổng thể: ~1.2s cho 1KB, tối đa 2.5s cho mọi kích thước
    const fullDurationMs = Math.min(2500, Math.max(700, totalChars * 1.2));

    const tick = (now) => {
      const elapsed = now - startTs;
      const targetIdx = Math.min(target.length, Math.floor((elapsed / fullDurationMs) * totalChars));
      if (targetIdx !== idxRef.current) {
        idxRef.current = targetIdx;
        // Đếm số dòng hiện tại
        const sub = target.slice(0, targetIdx);
        const newLines = sub.split('\n').length;
        if (newLines !== lineCounterRef.current) {
          lineCounterRef.current = newLines;
          setCurrentLine(newLines);
        }
        setShown(sub);
      }
      if (idxRef.current < target.length) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        onDone?.();
      }
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [text, streaming, onDone]);

  // Auto scroll xuống dòng cuối
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    // Scroll về dòng vừa gõ
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [shown, currentLine]);

  const lines = useMemo(() => shown.split('\n'), [shown]);

  return (
    <div
      ref={containerRef}
      className="relative font-mono text-[12px] leading-[18px] bg-[#1e1e1e] text-gray-200 rounded-md overflow-auto max-h-[320px] border border-[#2d2d30]"
      style={{ scrollBehavior: 'auto' }}
    >
      <pre className="m-0 p-3 whitespace-pre">
        {lines.map((line, i) => {
          const isCurrent = streaming && i === currentLine - 1;
          return (
            <div
              key={i}
              className={`flex px-1 -mx-1 rounded-sm transition-colors duration-300 ${
                isCurrent ? 'bg-orange-500/15 text-orange-100' : ''
              }`}
            >
              <span className="select-none text-gray-600 w-7 inline-block shrink-0 text-right pr-2">
                {i + 1}
              </span>
              <span className="flex-1 whitespace-pre-wrap break-all">
                {line}
                {isCurrent ? <Caret /> : null}
              </span>
            </div>
          );
        })}
        {/* Dòng cuối nếu chưa kết thúc bằng \n */}
        {streaming && shown && !shown.endsWith('\n') && lines.length === currentLine ? (
          <div className="flex px-1 -mx-1 rounded-sm bg-orange-500/15">
            <span className="select-none text-gray-600 w-7 inline-block shrink-0 text-right pr-2">
              {currentLine}
            </span>
            <span className="flex-1 whitespace-pre-wrap break-all">
              <Caret />
            </span>
          </div>
        ) : null}
      </pre>

      <style>{`
        @keyframes streamCaretBlink { 0%,50% { opacity: 1 } 51%,100% { opacity: 0 } }
        .stream-caret {
          display: inline-block;
          width: 7px;
          height: 14px;
          background: #fb923c;
          vertical-align: text-bottom;
          margin-left: 1px;
          border-radius: 1px;
          animation: streamCaretBlink 900ms steps(1) infinite;
        }
      `}</style>
    </div>
  );
}

function Caret() {
  return <span className="stream-caret" aria-hidden="true" />;
}
