import { useEffect, useRef, useState, useCallback } from 'react';
import ResizeHandle from './ResizeHandle';

export default function CanvasOverlay({
  iframeRef,
  elementDefs = [],
  elementPositions = {},
  selectedId,
  canvasScale = 1,
  onElementSelect,
  onPositionChange,
  onDragStart,
  onResizeStart,
  dragging,
  resizing,
}) {
  const overlayRef = useRef(null);
  const [elementRects, setElementRects] = useState({});
  const dragStartRef = useRef(null);
  const resizeStartRef = useRef(null);

  // Get element rects from iframe
  const updateElementRects = useCallback(() => {
    if (!iframeRef?.current?.contentDocument) return;
    
    const iframe = iframeRef.current;
    const iframeDoc = iframe.contentDocument;
    const iframeRect = iframe.getBoundingClientRect();
    const elements = iframeDoc.querySelectorAll('[data-edit]');
    
    const rects = {};
    elements.forEach(el => {
      const key = el.dataset.edit;
      const rect = el.getBoundingClientRect();
      rects[key] = {
        top: rect.top - iframeRect.top,
        left: rect.left - iframeRect.left,
        width: rect.width,
        height: rect.height,
      };
    });
    
    setElementRects(rects);
  }, [iframeRef]);

  // Update rects on iframe load and periodically
  useEffect(() => {
    const iframe = iframeRef?.current;
    if (!iframe) return;

    const handleLoad = () => {
      updateElementRects();
    };

    iframe.addEventListener('load', handleLoad);
    
    if (iframe.contentDocument?.readyState === 'complete') {
      updateElementRects();
    }

    const interval = setInterval(updateElementRects, 2000);
    
    const resizeObserver = new ResizeObserver(() => {
      updateElementRects();
    });
    resizeObserver.observe(iframe);

    return () => {
      iframe.removeEventListener('load', handleLoad);
      clearInterval(interval);
      resizeObserver.disconnect();
    };
  }, [iframeRef, updateElementRects]);

  // Update rects when scale changes
  useEffect(() => {
    updateElementRects();
  }, [canvasScale, updateElementRects]);

  // Update selected class in iframe
  useEffect(() => {
    if (!iframeRef?.current?.contentDocument) return;
    
    const iframe = iframeRef.current;
    const iframeDoc = iframe.contentDocument;
    
    // Remove selected class from all elements
    iframeDoc.querySelectorAll('[data-edit]').forEach(el => {
      el.classList.remove('canvas-selected');
    });
    
    // Add selected class to current element
    if (selectedId) {
      const el = iframeDoc.querySelector(`[data-edit="${selectedId}"]`);
      if (el) {
        el.classList.add('canvas-selected');
      }
    }
  }, [selectedId, iframeRef]);

  // Get selected element rect
  const getSelectedRect = () => {
    if (!selectedId) return null;
    return elementRects[selectedId] || null;
  };

  // Handle resize start
  const handleResizeStart = useCallback((e, handle) => {
    e.stopPropagation();
    if (!selectedId) return;
    
    const rect = elementRects[selectedId];
    if (!rect) return;

    resizeStartRef.current = {
      handle,
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialTop: elementPositions[selectedId]?.top ?? rect.top,
      initialLeft: elementPositions[selectedId]?.left ?? rect.left,
      initialWidth: elementPositions[selectedId]?.width ?? rect.width,
      initialHeight: elementPositions[selectedId]?.height ?? rect.height,
    };
    
    onResizeStart?.(selectedId, handle, { top: rect.top, left: rect.left, width: rect.width, height: rect.height });
  }, [selectedId, elementRects, elementPositions, onResizeStart]);

  // Handle drag start
  const handleDragStart = useCallback((e) => {
    e.stopPropagation();
    if (!selectedId) return;
    
    const rect = elementRects[selectedId];
    if (!rect) return;

    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      initialTop: elementPositions[selectedId]?.top ?? rect.top,
      initialLeft: elementPositions[selectedId]?.left ?? rect.left,
    };
    
    onDragStart?.(selectedId, { top: rect.top, left: rect.left });
  }, [selectedId, elementRects, elementPositions, onDragStart]);

  // Global mouse move handler
  useEffect(() => {
    const handleMouseMove = (e) => {
      // Handle dragging
      if (dragStartRef.current && dragging) {
        const deltaX = (e.clientX - dragStartRef.current.mouseX) / canvasScale;
        const deltaY = (e.clientY - dragStartRef.current.mouseY) / canvasScale;
        
        const newLeft = dragStartRef.current.initialLeft + deltaX;
        const newTop = dragStartRef.current.initialTop + deltaY;
        
        onPositionChange?.(selectedId, {
          top: Math.max(0, newTop),
          left: Math.max(0, newLeft),
        });
      }

      // Handle resizing
      if (resizeStartRef.current && resizing) {
        const { handle, initialTop, initialLeft, initialWidth, initialHeight } = resizeStartRef.current;
        const deltaX = (e.clientX - resizeStartRef.current.mouseX) / canvasScale;
        const deltaY = (e.clientY - resizeStartRef.current.mouseY) / canvasScale;

        let newTop = initialTop;
        let newLeft = initialLeft;
        let newWidth = initialWidth;
        let newHeight = initialHeight;

        switch (handle) {
          case 'nw':
            newTop = initialTop + deltaY;
            newLeft = initialLeft + deltaX;
            newWidth = Math.max(50, initialWidth - deltaX);
            newHeight = Math.max(30, initialHeight - deltaY);
            break;
          case 'n':
            newTop = initialTop + deltaY;
            newHeight = Math.max(30, initialHeight - deltaY);
            break;
          case 'ne':
            newTop = initialTop + deltaY;
            newWidth = Math.max(50, initialWidth + deltaX);
            newHeight = Math.max(30, initialHeight - deltaY);
            break;
          case 'e':
            newWidth = Math.max(50, initialWidth + deltaX);
            break;
          case 'se':
            newWidth = Math.max(50, initialWidth + deltaX);
            newHeight = Math.max(30, initialHeight + deltaY);
            break;
          case 's':
            newHeight = Math.max(30, initialHeight + deltaY);
            break;
          case 'sw':
            newLeft = initialLeft + deltaX;
            newWidth = Math.max(50, initialWidth - deltaX);
            newHeight = Math.max(30, initialHeight + deltaY);
            break;
          case 'w':
            newLeft = initialLeft + deltaX;
            newWidth = Math.max(50, initialWidth - deltaX);
            break;
        }

        onPositionChange?.(selectedId, {
          top: newTop,
          left: newLeft,
          width: newWidth,
          height: newHeight,
        });
      }
    };

    const handleMouseUp = () => {
      dragStartRef.current = null;
      resizeStartRef.current = null;
    };

    if (dragging || resizing) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragging, resizing, canvasScale, onPositionChange, selectedId]);

  const selectedRect = getSelectedRect();
  const selectedDef = elementDefs.find(el => el.id === selectedId);

  // If no element selected, show instruction
  if (!selectedId) {
    return null;
  }

  if (!selectedRect) {
    return null;
  }

  const customPos = elementPositions[selectedId] || {};
  const top = customPos?.top !== undefined ? customPos.top : selectedRect.top;
  const left = customPos?.left !== undefined ? customPos.left : selectedRect.left;
  const width = customPos?.width || selectedRect.width;
  const height = customPos?.height || selectedRect.height;

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 pointer-events-none"
      style={{ 
        transform: `scale(${canvasScale})`, 
        transformOrigin: 'top left',
        width: '100%',
        height: '100%',
      }}
    >
      {/* Selection overlay on the element */}
      <div
        className="absolute border-2 border-orange-500 bg-orange-500/10 pointer-events-auto cursor-move"
        style={{
          top: `${top}px`,
          left: `${left}px`,
          width: `${width}px`,
          height: `${height}px`,
        }}
        onMouseDown={handleDragStart}
      >
        {/* Element label */}
        <div className="absolute -top-7 left-0 px-2 py-0.5 text-xs font-medium rounded-t bg-orange-500 text-white whitespace-nowrap">
          {selectedDef?.label || selectedId}
        </div>

        {/* Resize handles */}
        <ResizeHandle position="nw" onMouseDown={(e) => handleResizeStart(e, 'nw')} />
        <ResizeHandle position="n" onMouseDown={(e) => handleResizeStart(e, 'n')} />
        <ResizeHandle position="ne" onMouseDown={(e) => handleResizeStart(e, 'ne')} />
        <ResizeHandle position="e" onMouseDown={(e) => handleResizeStart(e, 'e')} />
        <ResizeHandle position="se" onMouseDown={(e) => handleResizeStart(e, 'se')} />
        <ResizeHandle position="s" onMouseDown={(e) => handleResizeStart(e, 's')} />
        <ResizeHandle position="sw" onMouseDown={(e) => handleResizeStart(e, 'sw')} />
        <ResizeHandle position="w" onMouseDown={(e) => handleResizeStart(e, 'w')} />
      </div>
    </div>
  );
}
