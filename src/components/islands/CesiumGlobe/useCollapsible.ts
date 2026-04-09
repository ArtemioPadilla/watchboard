import { useState, useCallback } from 'react';

const STORAGE_KEY = 'watchboard-globe-panels';

/**
 * Read the panel-state map from localStorage.
 * Returns an empty object if storage is unavailable or corrupt.
 */
function readStore(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, boolean>;
  } catch {
    return {};
  }
}

/**
 * Write a single panel's state into the persisted map.
 */
function writeStore(panelId: string, expanded: boolean): void {
  try {
    const store = readStore();
    store[panelId] = expanded;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // localStorage may be unavailable (private browsing, quota, etc.)
  }
}

/**
 * Hook for collapsible globe panels with localStorage persistence.
 *
 * @param panelId       Unique key for this panel (e.g. "intel", "telemetry")
 * @param defaultExpanded  Whether the panel should start expanded when no stored value exists
 * @returns [isExpanded, toggle]
 */
export function useCollapsible(
  panelId: string,
  defaultExpanded: boolean,
): [boolean, () => void] {
  const [expanded, setExpanded] = useState<boolean>(() => {
    const store = readStore();
    if (panelId in store) return store[panelId];
    return defaultExpanded;
  });

  const toggle = useCallback(() => {
    setExpanded(prev => {
      const next = !prev;
      writeStore(panelId, next);
      return next;
    });
  }, [panelId]);

  return [expanded, toggle];
}
