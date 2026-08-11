import { useCallback, useEffect, useState } from "react";

/**
 * A view preference remembered per bundle.
 *
 * Behaves like `useState`, and writes through to `localStorage` under a key
 * scoped by the bundle's id. Scoping is the point: one person serving five
 * knowledge bases from the same browser would otherwise carry a collapsed lane
 * or an expanded folder from one into another, where the path it names may not
 * exist.
 *
 * One key per concern, never a packed list. These values hold paths, and a path
 * can contain anything a filename can — so a comma-separated string would need
 * an escaping rule, which would live here, be forgotten once, and corrupt
 * quietly. A value that is genuinely a list is stored as JSON, which already
 * has one.
 *
 * Everything stored here is disposable. A key that is missing, unparseable, or
 * of the wrong shape falls back to the default rather than being repaired:
 * there is no state here worth writing recovery code for.
 */
export function useBundleState<T>(
  bundleId: string,
  key: string,
  fallback: T,
): [T, (update: T | ((prev: T) => T)) => void] {
  const storageKey = `wiki:${bundleId}:${key}`;
  const [value, setValue] = useState<T>(() => read(storageKey, fallback));

  // Written from an effect rather than from the setter: a setter that wrote
  // would do it inside a state updater, which React is free to call more than
  // once for one update.
  useEffect(() => write(storageKey, value), [storageKey, value]);

  const set = useCallback((update: T | ((prev: T) => T)) => {
    setValue((prev) => (typeof update === "function" ? (update as (p: T) => T)(prev) : update));
  }, []);

  return [value, set];
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    // Unparseable, or storage unavailable at all — a browser with it disabled,
    // or a quota that is already full. Neither is worth a message: the reader
    // works without remembering anything.
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Full or unavailable. The preference is simply not remembered.
  }
}
