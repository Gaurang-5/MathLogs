/** A deduplication cache must not hold up a teacher's capture. */
export async function readOcrCacheFast<T>(read: () => Promise<T>): Promise<T | null> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        return await Promise.race([
            read().catch(() => null),
            new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), 750); }),
        ]);
    } finally { clearTimeout(timer); }
}
