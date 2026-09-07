import { useEffect, useCallback, useState } from 'react';

/**
 * Hook cho phép chọn trực tiếp các phần tử HTML bên trong iframe preview.
 *
 * Flow:
 *  1. Bật "Selection mode" → inject CSS highlight vào iframe
 *  2. User click element trong iframe
 *  3. Element được highlight + thông tin hiển thị
 *  4. Click element để chọn → callback `onSelect(elementInfo)`
 *  5. Hoặc click ra ngoài iframe để tắt selection mode
 *
 * @param {React.RefObject<HTMLIFrameElement>} iframeRef - ref tới preview iframe
 * @param {function} onSelect - callback(elementInfo) khi user chọn 1 element
 * @returns {{ selectionMode, setSelectionMode, selectedElement }}
 */
export default function useElementSelection(iframeRef, onSelect) {
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState(null);

  // Inject selection CSS vào iframe head
  const injectSelectionCss = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow?.document) return;
    const doc = iframe.contentWindow.document;

    // Remove existing
    const existing = doc.getElementById('__canvas-selection-css__');
    if (existing) existing.remove();

    const style = doc.createElement('style');
    style.id = '__canvas-selection-css__';
    style.textContent = `
      [data-canvas-selectable]:hover {
        outline: 2px dashed rgba(249, 115, 22, 0.7) !important;
        outline-offset: 2px !important;
        cursor: pointer !important;
      }
      [data-canvas-selected] {
        outline: 2px solid #f97316 !important;
        outline-offset: 2px !important;
        background-color: rgba(249, 115, 22, 0.08) !important;
      }
    `;
    (doc.head || doc.documentElement).appendChild(style);
  }, [iframeRef]);

  // Make all elements selectable
  const makeSelectable = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow?.document) return;
    const doc = iframe.contentWindow.document;

    // Remove previous listeners
    doc.querySelectorAll('[data-canvas-selectable]').forEach((el) => {
      el.removeAttribute('data-canvas-selectable');
    });

    // Add to body + all children
    const allEls = doc.body.querySelectorAll('*');
    allEls.forEach((el) => {
      el.setAttribute('data-canvas-selectable', 'true');
    });
  }, [iframeRef]);

  const removeSelectionCss = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow?.document) return;
    const doc = iframe.contentWindow.document;
    const existing = doc.getElementById('__canvas-selection-css__');
    if (existing) existing.remove();
    doc.querySelectorAll('[data-canvas-selectable]').forEach((el) => {
      el.removeAttribute('data-canvas-selectable');
    });
    doc.querySelectorAll('[data-canvas-selected]').forEach((el) => {
      el.removeAttribute('data-canvas-selected');
    });
  }, [iframeRef]);

  const handleElementClick = useCallback(
    (e) => {
      if (!selectionMode) return;
      e.preventDefault();
      e.stopPropagation();

      const el = e.target;
      if (!el || el === e.currentTarget) return;

      const info = getElementInfo(el);
      setSelectedElement(info);
      onSelect?.(info);
    },
    [selectionMode, onSelect]
  );

  useEffect(() => {
    if (!selectionMode) {
      removeSelectionCss();
      return;
    }

    // Inject khi iframe loaded
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) {
      const onLoad = () => {
        injectSelectionCss();
        makeSelectable();
      };
      iframe.addEventListener('load', onLoad);
      return () => iframe.removeEventListener('load', onLoad);
    } else {
      injectSelectionCss();
      makeSelectable();
    }
  }, [selectionMode, iframeRef, injectSelectionCss, makeSelectable, removeSelectionCss]);

  // Listen for clicks inside iframe
  useEffect(() => {
    if (!selectionMode) return;
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;

    const handler = (e) => {
      // Bubbles up through iframe → event contains origin info
      handleElementClick(e);
    };

    // Use postMessage to communicate from iframe to parent
    const onMessage = (event) => {
      if (event.data?.type === 'CANVAS_ELEMENT_CLICK') {
        const el = event.data.element;
        if (el) {
          const info = getElementInfo(el);
          setSelectedElement(info);
          onSelect?.(info);
        }
      }
    };

    iframe.contentWindow.addEventListener('click', handler);
    window.addEventListener('message', onMessage);

    // Inject click handler script
    const script = iframe.contentWindow.document.createElement('script');
    script.textContent = `
      document.querySelectorAll('[data-canvas-selectable]').forEach(el => {
        el.addEventListener('click', function(e) {
          e.preventDefault();
          e.stopPropagation();
          window.parent.postMessage({
            type: 'CANVAS_ELEMENT_CLICK',
            element: {
              tagName: el.tagName,
              id: el.id,
              className: el.className,
              textContent: el.textContent?.slice(0, 100),
              outerHTML: el.outerHTML?.slice(0, 200),
              rect: el.getBoundingClientRect ? JSON.stringify(el.getBoundingClientRect()) : null,
            }
          }, '*');
        }, true);
      });
    `;
    (iframe.contentWindow.document.head || iframe.contentWindow.document.documentElement).appendChild(script);

    return () => {
      iframe.contentWindow.removeEventListener('click', handler);
      window.removeEventListener('message', onMessage);
    };
  }, [selectionMode, iframeRef, handleElementClick, onSelect]);

  const clearSelection = useCallback(() => {
    setSelectedElement(null);
    removeSelectionCss();
  }, [removeSelectionCss]);

  return {
    selectionMode,
    setSelectionMode,
    selectedElement,
    clearSelection,
  };
}

function getElementInfo(el) {
  return {
    tagName: el?.tagName || '',
    id: el?.id || '',
    className: el?.className || '',
    textContent: (el?.textContent || '').slice(0, 100).trim(),
    outerHTML: (el?.outerHTML || '').slice(0, 300).trim(),
    // CSS selector path
    selector: getCssSelector(el),
  };
}

function getCssSelector(el) {
  if (!el) return '';
  const parts = [];
  let current = el;
  while (current && current !== (current.ownerDocument?.body || document.body) && parts.length < 5) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      selector = `#${CSS.escape(current.id)}`;
      parts.unshift(selector);
      break;
    }
    if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (classes.length) {
        selector += '.' + classes.map((c) => CSS.escape(c)).join('.');
      }
    }
    parts.unshift(selector);
    current = current.parentElement;
  }
  return parts.join(' > ');
}
