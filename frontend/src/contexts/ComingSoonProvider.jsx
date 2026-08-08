import { useState, useCallback } from 'react';
import { ComingSoonContext } from './ComingSoonContext.js';
import ComingSoonModal from '../components/common/ComingSoonModal';

export const ComingSoonProvider = ({ children }) => {
  const [open, setOpen] = useState(false);

  const showComingSoon = useCallback(() => setOpen(true), []);
  const hideComingSoon = useCallback(() => setOpen(false), []);

  return (
    <ComingSoonContext.Provider value={{ showComingSoon, hideComingSoon, open }}>
      {children}
      <ComingSoonModal open={open} onClose={hideComingSoon} />
    </ComingSoonContext.Provider>
  );
};