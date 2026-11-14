import { useSyncExternalStore } from "react";

/**
 * A tiny reactive wrapper around localStorage. Values are validated on read, cached so
 * useSyncExternalStore gets a stable snapshot, and kept in sync across tabs.
 * Storage failures (private mode, quota) degrade to in-memory state.
 */
export function createLocalStore<T>(key: string, fallback: T, validate: (raw: unknown) => T) {
  const listeners = new Set<() => void>();
  let cache: { value: T } | null = null;

  function get(): T {
    if (cache) return cache.value;
    let value = fallback;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) value = validate(JSON.parse(raw));
    } catch {
      value = fallback;
    }
    cache = { value };
    return value;
  }

  function set(next: T | ((prev: T) => T)) {
    const value = typeof next === "function" ? (next as (prev: T) => T)(get()) : next;
    cache = { value };
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* keep the in-memory value */
    }
    listeners.forEach((l) => l());
  }

  function subscribe(listener: () => void) {
    listeners.add(listener);
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) {
        cache = null;
        listener();
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      listeners.delete(listener);
      window.removeEventListener("storage", onStorage);
    };
  }

  function useValue(): T {
    return useSyncExternalStore(subscribe, get, () => fallback);
  }

  return { get, set, subscribe, useValue };
}

/** True after hydration; lets client-only UI avoid flashing server defaults. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

function noopSubscribe() {
  return () => {};
}
