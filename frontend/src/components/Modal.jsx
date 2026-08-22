import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineX } from 'react-icons/hi';
import PropTypes from 'prop-types';

const FOCUSABLE_SELECTORS = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Reusable Modal with:
 *  - Portal rendering to <body>
 *  - ESC + overlay click close
 *  - Scroll lock
 *  - ARIA dialog semantics
 *  - Focus trap (Tab cycles within the modal)
 *  - Restore focus on close to the element that opened the modal
 */
const Modal = ({ isOpen, onClose, title, children, size = 'md' }) => {
  const titleId = useId();
  const contentRef = useRef(null);
  const previouslyFocusedRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;

    previouslyFocusedRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const focusFirst = () => {
      const root = contentRef.current;
      if (!root) return;
      const focusables = root.querySelectorAll(FOCUSABLE_SELECTORS);
      const first = focusables[0];
      if (first instanceof HTMLElement) {
        first.focus();
      } else {
        root.focus();
      }
    };

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !contentRef.current) return;
      const focusables = Array.from(
        contentRef.current.querySelectorAll(FOCUSABLE_SELECTORS),
      ).filter((el) => el instanceof HTMLElement && !el.hasAttribute('disabled'));
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    const raf = requestAnimationFrame(focusFirst);

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = prevOverflow;
      const prev = previouslyFocusedRef.current;
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) {
        prev.focus();
      }
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const maxWidthClass = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    full: 'max-w-full mx-4',
  }[size] || 'max-w-md';

  const modalContent = (
    <div className="modal-overlay" onClick={onClose}>
      <div
        ref={contentRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        tabIndex={-1}
        className={`modal-content w-full ${maxWidthClass} p-6 m-4 relative animate-fade-in-up outline-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          {title ? (
            <h3 id={titleId} className="text-xl font-bold text-gray-900">
              {title}
            </h3>
          ) : (
            <span />
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-500 transition-colors"
          >
            <HiOutlineX className="w-6 h-6" />
          </button>
        </div>
        <div className="max-h-[calc(90vh-8rem)] overflow-y-auto custom-scrollbar">
          {children}
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

Modal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  title: PropTypes.string,
  children: PropTypes.node.isRequired,
  size: PropTypes.oneOf(['sm', 'md', 'lg', 'xl', '2xl', 'full']),
};

export default Modal;
