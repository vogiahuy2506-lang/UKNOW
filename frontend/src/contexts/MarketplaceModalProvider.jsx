import { useState, useCallback } from 'react';
import { MarketplaceModalContext } from './MarketplaceModalContext.js';

export const MarketplaceModalProvider = ({ children }) => {
  const [open, setOpen] = useState(false);
  // Tab "Khám phá" - chi tiết public
  const [selectedListingId, setSelectedListingId] = useState(null);
  // Tab "Của tôi" - settings template
  const [selectedMyListingId, setSelectedMyListingId] = useState(null);
  const [activeTab, setActiveTab] = useState('browse');
  const [showCreateForm, setShowCreateForm] = useState(false);

  const showMarketplace = useCallback((listingId = null, tab = 'browse') => {
    setSelectedListingId(listingId);
    setSelectedMyListingId(null);
    setActiveTab(tab);
    setShowCreateForm(false);
    setOpen(true);
  }, []);

  const showListing = useCallback((listingId, tab = 'browse') => {
    setSelectedListingId(listingId);
    setSelectedMyListingId(null);
    setActiveTab(tab);
    setShowCreateForm(false);
    setOpen(true);
  }, []);

  const showCreateListingForm = useCallback(() => {
    setSelectedListingId(null);
    setSelectedMyListingId(null);
    setShowCreateForm(true);
    setOpen(true);
  }, []);

  const onCreateSuccess = useCallback(() => {
    setShowCreateForm(false);
    setActiveTab('my');
  }, []);

  const hideMarketplace = useCallback(() => {
    setOpen(false);
    setSelectedListingId(null);
    setSelectedMyListingId(null);
    setShowCreateForm(false);
  }, []);

  // Xử lý chọn listing trong tab "Khám phá" → mở detail modal
  const handleSelectListing = useCallback((id) => {
    setSelectedListingId(id);
    setSelectedMyListingId(null);
  }, []);

  // Xử lý chọn listing trong tab "Của tôi" → mở settings modal
  const handleSelectMyListing = useCallback((id) => {
    setSelectedMyListingId(id);
    setSelectedListingId(null);
  }, []);

  const value = {
    showMarketplace,
    showListing,
    showCreateListingForm,
    hideMarketplace,
    open,
    selectedListingId,
    selectedMyListingId,
    activeTab,
    showCreateForm,
    // Props cho MarketplaceModal
    onSelectListing: handleSelectListing,
    onSelectMyListing: handleSelectMyListing,
    onTabChange: setActiveTab,
    onCreateSuccess,
  };

  return (
    <MarketplaceModalContext.Provider value={value}>
      {children}
    </MarketplaceModalContext.Provider>
  );
};