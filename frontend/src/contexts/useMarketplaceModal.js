import { useContext } from 'react';
import { MarketplaceModalContext } from './MarketplaceModalContext.js';

export const useMarketplaceModal = () => {
  const ctx = useContext(MarketplaceModalContext);
  if (!ctx) {
    throw new Error('useMarketplaceModal must be used inside MarketplaceModalProvider');
  }
  return ctx;
};
