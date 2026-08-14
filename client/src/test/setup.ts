function createStorage(): Storage {
    const store = new Map<string, string>();

    return {
        get length() {
            return store.size;
        },
        clear() {
            store.clear();
        },
        getItem(key: string) {
            return store.has(key) ? store.get(key)! : null;
        },
        key(index: number) {
            return Array.from(store.keys())[index] ?? null;
        },
        removeItem(key: string) {
            store.delete(key);
        },
        setItem(key: string, value: string) {
            store.set(key, value);
        },
    };
}

Object.defineProperty(globalThis, 'localStorage', {
    value: createStorage(),
    configurable: true,
});

Object.defineProperty(globalThis, 'sessionStorage', {
    value: createStorage(),
    configurable: true,
});

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
