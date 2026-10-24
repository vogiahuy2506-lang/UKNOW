import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalStorageState } from '../../../hooks/useLocalStorageState';

/**
 * Quản lý trạng thái layout cho CampaignBuilder (độ rộng thanh node bên trái).
 *
 * @returns {object} layout states + resize handlers
 */
const useCampaignBuilderLayoutState = () => {
  const [builderSidebarWidth, setBuilderSidebarWidth] = useLocalStorageState('founder_builder_sidebarWidth', 240);
  const [isResizingBuilderSidebar, setIsResizingBuilderSidebar] = useState(false);

  const builderSidebarStartXRef = useRef(0);
  const builderSidebarStartWidthRef = useRef(256);
  const suppressClickRef = useRef(false);

  const getBuilderSidebarBounds = useCallback(() => {
    if (typeof window === 'undefined') return { min: 188, max: 320 };
    const viewportWidth = window.innerWidth;
    const min = viewportWidth < 768 ? 160 : viewportWidth < 1024 ? 176 : 210;
    const maxByViewport = Math.round(viewportWidth * 0.33);
    const max = Math.max(min + 24, Math.min(340, maxByViewport));
    return { min, max };
  }, []);

  useEffect(() => {
    if (!isResizingBuilderSidebar) return;

    const handleMouseMove = (event) => {
      const delta = event.clientX - builderSidebarStartXRef.current;
      const { min, max } = getBuilderSidebarBounds();
      const nextWidth = Math.min(max, Math.max(min, builderSidebarStartWidthRef.current + delta));
      setBuilderSidebarWidth(nextWidth);
    };

    const handleMouseUp = () => {
      setIsResizingBuilderSidebar(false);
      window.requestAnimationFrame(() => {
        suppressClickRef.current = false;
      });
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [getBuilderSidebarBounds, isResizingBuilderSidebar, setBuilderSidebarWidth]);

  useEffect(() => {
    const syncSidebarWidth = () => {
      const { min, max } = getBuilderSidebarBounds();
      setBuilderSidebarWidth((prev) => Math.min(max, Math.max(min, prev)));
    };

    syncSidebarWidth();
    window.addEventListener('resize', syncSidebarWidth);
    return () => window.removeEventListener('resize', syncSidebarWidth);
  }, [getBuilderSidebarBounds, setBuilderSidebarWidth]);

  useEffect(() => {
    const handleClickCapture = (event) => {
      if (!suppressClickRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = false;
    };

    window.addEventListener('click', handleClickCapture, true);
    return () => window.removeEventListener('click', handleClickCapture, true);
  }, []);

  const handleBuilderSidebarResizeStart = (event) => {
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = true;
    setIsResizingBuilderSidebar(true);
    builderSidebarStartXRef.current = event.clientX;
    builderSidebarStartWidthRef.current = builderSidebarWidth;
  };

  return {
    builderSidebarWidth,
    isResizingBuilderSidebar,
    handleBuilderSidebarResizeStart,
  };
};

export default useCampaignBuilderLayoutState;
