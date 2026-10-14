/** Bound every scan stage, including browser APIs that can stop responding. */
export function scanDeadline<T>(work: Promise<T>, milliseconds: number, message: string, signal?: AbortSignal): Promise<T> {
    return new Promise((resolve, reject) => {
        const finish = (action: () => void) => {
            clearTimeout(timer);
            signal?.removeEventListener('abort', abort);
            action();
        };
        const abort = () => finish(() => reject(new DOMException('Capture cancelled', 'AbortError')));
        const timer = setTimeout(() => finish(() => reject(new Error(message))), milliseconds);
        work.then(value => finish(() => resolve(value)), error => finish(() => reject(error)));
        if (signal?.aborted) abort();
        else signal?.addEventListener('abort', abort, { once: true });
    });
}
