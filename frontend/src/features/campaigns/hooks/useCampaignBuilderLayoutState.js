import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocalStorageState } from '../../../hooks/useLocalStorageState';

const LOG_SPLITTER_TOTAL_WIDTH = 28;

/**
 * Quản lý trạng thái layout cho CampaignBuilder (sidebar, run logs, splitter).
 *
 * @param {object} params Input config
 * @param {boolean} params.showRunLogs Trạng thái hiển thị panel log
 * @param {number} params.logListMinWidth Chiều rộng tối thiểu cột list log
 * @param {number} params.logDetailMinWidth Chiều rộng tối thiểu cột chi tiết log
 * @returns {object} layout states + resize handlers
 */
const useCampaignBuilderLayoutState = ({
  showRunLogs,
  logListMinWidth,
  logDetailMinWidth,
}) => {
  const [runLogHeight, setRunLogHeight] = useLocalStorageState('uknow_builder_runLogHeight', 256);
  const [isResizingLog, setIsResizingLog] = useState(false);
  const [logListWidth, setLogListWidth] = useLocalStorageState('uknow_builder_logListWidth', 240);
  const [isResizingLogSplit, setIsResizingLogSplit] = useState(false);
  const [builderSidebarWidth, setBuilderSidebarWidth] = useLocalStorageState('uknow_builder_sidebarWidth', 240);
  const [isResizingBuilderSidebar, setIsResizingBuilderSidebar] = useState(false);

  const logResizeStartYRef = useRef(0);
  const logResizeStartHeightRef = useRef(256);
  const logSplitStartXRef = useRef(0);
  const logSplitStartWidthRef = useRef(420);
  const builderSidebarStartXRef = useRef(0);
  const builderSidebarStartWidthRef = useRef(256);
  const suppressClickRef = useRef(false);

  const logPanelRef = useRef(null);

  const getBuilderSidebarBounds = useCallback(() => {
    if (typeof window === 'undefined') return { min: 188, max: 320 };
    const viewportWidth = window.innerWidth;
    const min = viewportWidth < 768 ? 160 : viewportWidth < 1024 ? 176 : 210;
    const maxByViewport = Math.round(viewportWidth * 0.33);
    const max = Math.max(min + 24, Math.min(340, maxByViewport));
    return { min, max };
  }, []);

  const clampLogListWidth = useCallback((rawWidth) => {
    const containerWidth = logPanelRef.current?.clientWidth || window.innerWidth;
    const maxWidth = Math.max(
      logListMinWidth,
      containerWidth - logDetailMinWidth - LOG_SPLITTER_TOTAL_WIDTH
    );
    return Math.min(maxWidth, Math.max(logListMinWidth, rawWidth));
  }, [logDetailMinWidth, logListMinWidth]);

  useEffect(() => {
    if (!isResizingLog) return;

    const handleMouseMove = (event) => {
      const delta = logResizeStartYRef.current - event.clientY;
      const maxHeight = Math.round(window.innerHeight * 0.6);
      const nextHeight = Math.min(maxHeight, Math.max(180, logResizeStartHeightRef.current + delta));
      setRunLogHeight(nextHeight);
    };

    const handleMouseUp = () => {
      setIsResizingLog(false);
      window.requestAnimationFrame(() => {
        suppressClickRef.current = false;
      });
    };

    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingLog, setRunLogHeight]);

  useEffect(() => {
    if (!isResizingLogSplit) return;

    const handleMouseMove = (event) => {
      const delta = event.clientX - logSplitStartXRef.current;
      setLogListWidth(clampLogListWidth(logSplitStartWidthRef.current + delta));
    };

    const handleMouseUp = () => {
      setIsResizingLogSplit(false);
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
  }, [clampLogListWidth, isResizingLogSplit, setLogListWidth]);

  useEffect(() => {
    if (!showRunLogs) return;

    const syncLogSplitWidth = () => {
      setLogListWidth((prev) => clampLogListWidth(prev));
    };

    syncLogSplitWidth();
    window.addEventListener('resize', syncLogSplitWidth);

    return () => {
      window.removeEventListener('resize', syncLogSplitWidth);
    };
  }, [clampLogListWidth, setLogListWidth, showRunLogs]);

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

  const handleLogResizeStart = (event) => {
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = true;
    setIsResizingLog(true);
    logResizeStartYRef.current = event.clientY;
    logResizeStartHeightRef.current = runLogHeight;
  };

  const handleLogSplitResizeStart = (event) => {
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = true;
    setIsResizingLogSplit(true);
    logSplitStartXRef.current = event.clientX;
    logSplitStartWidthRef.current = logListWidth;
  };

  const handleBuilderSidebarResizeStart = (event) => {
    event.preventDefault();
    event.stopPropagation();
    suppressClickRef.current = true;
    setIsResizingBuilderSidebar(true);
    builderSidebarStartXRef.current = event.clientX;
    builderSidebarStartWidthRef.current = builderSidebarWidth;
  };

  return {
    runLogHeight,
    isResizingLog,
    logListWidth,
    isResizingLogSplit,
    builderSidebarWidth,
    isResizingBuilderSidebar,
    logPanelRef,
    handleLogResizeStart,
    handleLogSplitResizeStart,
    handleBuilderSidebarResizeStart,
  };
};

export default useCampaignBuilderLayoutState;
