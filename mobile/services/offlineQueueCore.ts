export type OfflineQueueMethod = 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface QueuedAction {
  id: string;
  accountScope: string;
  method: OfflineQueueMethod;
  url: string;
  data?: unknown;
  headers?: Record<string, string>;
  timestamp: number;
  retryCount: number;
}

export type QueueOutcome =
  | { id: string; status: 'processed' }
  | { id: string; status: 'failed' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isQueueMethod(value: unknown): value is OfflineQueueMethod {
  return value === 'POST' || value === 'PUT' || value === 'PATCH' || value === 'DELETE';
}

function isQueuedAction(value: unknown): value is QueuedAction {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.accountScope === 'string'
    && isQueueMethod(value.method)
    && typeof value.url === 'string'
    && typeof value.timestamp === 'number'
    && Number.isFinite(value.timestamp)
    && typeof value.retryCount === 'number'
    && Number.isInteger(value.retryCount)
    && value.retryCount >= 0
    && (value.headers === undefined || isRecord(value.headers));
}

/**
 * Parses only complete actions belonging to the active account. Invalid or
 * cross-account entries are ignored instead of being replayed.
 */
export function parseStoredQueue(raw: string | null, accountScope: string): QueuedAction[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((action): action is QueuedAction => (
      isQueuedAction(action) && action.accountScope === accountScope
    ));
  } catch {
    return [];
  }
}

/**
 * Applies sync outcomes to the latest stored queue. Actions added after a sync
 * snapshot was taken are preserved because they have no matching outcome.
 */
export function reconcileQueuedActions(
  latest: readonly QueuedAction[],
  outcomes: readonly QueueOutcome[],
): QueuedAction[] {
  const outcomeById = new Map(outcomes.map((outcome) => [outcome.id, outcome]));
  const next: QueuedAction[] = [];

  for (const action of latest) {
    const outcome = outcomeById.get(action.id);
    if (outcome?.status === 'processed') continue;
    next.push(outcome?.status === 'failed'
      ? { ...action, retryCount: action.retryCount + 1 }
      : action);
  }

  return next;
}
