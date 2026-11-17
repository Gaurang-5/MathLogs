/** Limits profile requests without making completed rows wait for the whole roster.
 * The deadline includes queue time, so offline/blocked requests cannot spin forever. */
export function createFeeLookupQueue(concurrency = 4, deadlineMs = 15_000) {
  const waiting: Array<() => void> = [];
  let active = 0;
  const pump = () => {
    while (active < concurrency && waiting.length) waiting.shift()!();
  };

  return {
    run<T>(task: (signal: AbortSignal) => Promise<T>, parentSignal: AbortSignal): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const controller = new AbortController();
        let settled = false;
        let started = false;
        let timer: ReturnType<typeof setTimeout>;
        const finish = (success: boolean, result: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          parentSignal.removeEventListener('abort', abort);
          const index = waiting.indexOf(start);
          if (index !== -1) waiting.splice(index, 1);
          if (started) active--;
          if (success) resolve(result as T);
          else reject(result);
          pump();
        };
        const abort = () => {
          controller.abort();
          finish(false, new Error('Fee lookup cancelled'));
        };
        const start = () => {
          if (settled) return;
          started = true;
          active++;
          Promise.resolve().then(() => {
            if (controller.signal.aborted) throw new Error('Fee lookup cancelled');
            return task(controller.signal);
          }).then(value => finish(true, value), error => finish(false, error));
        };
        timer = setTimeout(() => {
          controller.abort();
          finish(false, new Error('Fee lookup timed out. Try again.'));
        }, deadlineMs);
        parentSignal.addEventListener('abort', abort, { once: true });
        if (parentSignal.aborted) abort();
        else {
          waiting.push(start);
          pump();
        }
      });
    },
  };
}
