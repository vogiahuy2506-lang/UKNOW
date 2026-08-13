import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import MarketplaceContent from '../../pages/marketplace/MarketplaceContent';
import ListingDetailModal from './ListingDetailModal';
import ListingSettingsModal from './ListingSettingsModal';
import CreateListing from '../../pages/marketplace/CreateListing';

const MarketplaceModal = ({
  open,
  onClose,
  selectedListingId,
  onSelectListing,
  selectedMyListingId,
  onSelectMyListing,
  activeTab,
  onTabChange,
  showCreateForm,
  onCreateSuccess,
  onShowCreateForm,
}) => {
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => setIsVisible(true));
    } else {
      setIsVisible(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.();
      if (e.key === 'Tab' && modalRef.current) {
        const focusables = modalRef.current.querySelectorAll(
          'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    previousFocusRef.current = document.activeElement;
    requestAnimationFrame(() => {
      const firstFocusable = modalRef.current?.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      firstFocusable?.focus();
    });

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus();
      }
    };
  }, [open, onClose]);

  if (!open) return null;

  const handleCreateSuccess = () => {
    onCreateSuccess?.();
    onClose?.();
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
      role="dialog"
      aria-modal="true"
      aria-label="Marketplace"
    >
      <div
        className={`absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity duration-200 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={modalRef}
        className={`relative w-full max-w-6xl h-full max-h-[90vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col transition-all duration-300 ${isVisible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
      >
        {showCreateForm && (
          <CreateListing onClose={onClose} onSuccess={handleCreateSuccess} />
        )}

        {!showCreateForm && selectedMyListingId && String(selectedMyListingId) !== 'undefined' && Number(selectedMyListingId) > 0 && (
          <ListingSettingsModal
            listingId={selectedMyListingId}
            onClose={onClose}
            onBack={() => onSelectMyListing?.(null)}
          />
        )}

        {!showCreateForm && selectedListingId && String(selectedListingId) !== 'undefined' && Number(selectedListingId) > 0 && (
          <ListingDetailModal
            listingId={selectedListingId}
            onClose={onClose}
            onBack={() => onSelectListing?.(null)}
          />
        )}

        {!showCreateForm && (!selectedListingId || Number(selectedListingId) <= 0) && (!selectedMyListingId || Number(selectedMyListingId) <= 0) && (
          <MarketplaceContent
            onClose={onClose}
            activeTab={activeTab}
            onTabChange={onTabChange}
            onSelectListing={onSelectListing}
            onSelectMyListing={onSelectMyListing}
            onShowCreateForm={onShowCreateForm}
          />
        )}
      </div>
    </div>,
    document.body
  );
};

export default MarketplaceModal;
