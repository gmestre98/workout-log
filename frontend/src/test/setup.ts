import "@testing-library/jest-dom/vitest";

// On newer local Node (24+), jsdom's window.localStorage is unavailable, so the
// localStorage-based tests (timer, dayStore) throw locally even though they pass
// on CI's Node 22. When no working localStorage is present, install a minimal
// in-memory Storage so those tests run on any Node version. This is a no-op on
// CI, where jsdom already provides a real localStorage.
function hasWorkingLocalStorage(): boolean {
  try {
    const s = (globalThis as { localStorage?: Storage }).localStorage;
    if (!s) return false;
    s.setItem("__probe__", "1");
    s.removeItem("__probe__");
    return true;
  } catch {
    return false;
  }
}

if (!hasWorkingLocalStorage()) {
  const mem = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return mem.size;
    },
    clear: () => mem.clear(),
    getItem: (k) => (mem.has(k) ? mem.get(k)! : null),
    key: (i) => Array.from(mem.keys())[i] ?? null,
    removeItem: (k) => void mem.delete(k),
    setItem: (k, v) => void mem.set(String(k), String(v)),
  };
  for (const target of [globalThis, typeof window !== "undefined" ? window : undefined]) {
    if (target) Object.defineProperty(target, "localStorage", { value: storage, configurable: true, writable: true });
  }
}

// jsdom doesn't implement matchMedia; InstallPrompt uses it.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
