import { useContext } from 'react';
import { ComingSoonContext } from './ComingSoonContext.js';

export const useComingSoon = () => {
  const ctx = useContext(ComingSoonContext);
  // Graceful fallback — chỉ là UX nicety, không nên throw
  return ctx || { showComingSoon: () => {}, hideComingSoon: () => {}, open: false };
};