export async function register() {
  // Polyfill localStorage for Node.js v25+ where Next.js passes --localstorage-file
  // but the implementation is broken in this version combination
  if (typeof globalThis.localStorage === "undefined" || typeof globalThis.localStorage?.getItem !== "function") {
    const store = new Map<string, string>();
    // @ts-expect-error — polyfill for server environment
    globalThis.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
      removeItem: (k: string) => { store.delete(k); },
      clear: () => { store.clear(); },
      key: (i: number) => [...store.keys()][i] ?? null,
      get length() { return store.size; },
    };
  }
}
