import { useState, useEffect, useCallback } from 'react';
import landingCustomizerApiService from '../services/landingCustomizerApi.service';

export default function useCanvasEditor({ page, locale = 'vi' }) {
  const [selectedElementId, setSelectedElementId] = useState(null);
  const [elementPositions, setElementPositions] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [dragging, setDragging] = useState(null);
  const [resizing, setResizing] = useState(null);
  const [canvasScale, setCanvasScale] = useState(1);

  // Load element positions from backend
  const loadPositions = useCallback(async () => {
    if (!page) return;
    setIsLoading(true);
    try {
      const res = await landingCustomizerApiService.getElementPositions(page);
      if (res.data?.positions) {
        const positionsMap = {};
        res.data.positions.forEach(pos => {
          positionsMap[pos.element_key] = pos;
        });
        setElementPositions(positionsMap);
      }
    } catch (err) {
      console.warn('Failed to load positions:', err);
    } finally {
      setIsLoading(false);
    }
  }, [page]);

  // Save element positions to backend
  const savePositions = useCallback(async (positions) => {
    if (!page) return;
    setIsSaving(true);
    try {
      await landingCustomizerApiService.saveElementPositions(page, positions);
    } catch (err) {
      console.warn('Failed to save positions:', err);
    } finally {
      setIsSaving(false);
    }
  }, [page]);

  // Update a single element position
  const updateElementPosition = useCallback((elementKey, position) => {
    setElementPositions(prev => {
      const updated = {
        ...prev,
        [elementKey]: {
          ...(prev[elementKey] || {}),
          ...position,
        }
      };
      return updated;
    });
  }, []);

  // Save all positions
  const saveAllPositions = useCallback(() => {
    const positionsArray = Object.entries(elementPositions).map(([key, pos]) => ({
      element_key: key,
      page,
      top: pos.top ?? 0,
      left: pos.left ?? 0,
      width: pos.width ?? 'auto',
      height: pos.height ?? 'auto',
      z_index: pos.z_index ?? 0,
      visible: pos.visible ?? true,
    }));
    savePositions(positionsArray);
  }, [elementPositions, page, savePositions]);

  // Reset element position to default
  const resetElementPosition = useCallback((elementKey) => {
    setElementPositions(prev => {
      const updated = { ...prev };
      delete updated[elementKey];
      return updated;
    });
  }, []);

  // Reset all positions
  const resetAllPositions = useCallback(() => {
    setElementPositions({});
    savePositions([]);
  }, [savePositions]);

  // Select element
  const selectElement = useCallback((elementId) => {
    setSelectedElementId(elementId);
  }, []);

  // Deselect all
  const deselectAll = useCallback(() => {
    setSelectedElementId(null);
  }, []);

  // Start dragging
  const startDrag = useCallback((elementId, initialPos) => {
    setDragging({ elementId, startPos: initialPos });
  }, []);

  // Start resizing
  const startResize = useCallback((elementId, handle, initialPos) => {
    setResizing({ elementId, handle, startPos: initialPos });
  }, []);

  // End drag/resize
  const endInteraction = useCallback(() => {
    setDragging(null);
    setResizing(null);
  }, []);

  // Load positions on page change
  useEffect(() => {
    loadPositions();
  }, [loadPositions]);

  // Auto-save positions when they change (debounced)
  useEffect(() => {
    if (Object.keys(elementPositions).length === 0) return;
    const timeout = setTimeout(() => {
      saveAllPositions();
    }, 1000);
    return () => clearTimeout(timeout);
  }, [elementPositions, saveAllPositions]);

  return {
    // State
    selectedElementId,
    elementPositions,
    isLoading,
    isSaving,
    dragging,
    resizing,
    canvasScale,
    
    // Setters
    setSelectedElementId: selectElement,
    setElementPositions,
    setCanvasScale,
    
    // Actions
    updateElementPosition,
    saveAllPositions,
    resetElementPosition,
    resetAllPositions,
    deselectAll,
    startDrag,
    startResize,
    endInteraction,
    loadPositions,
  };
}
