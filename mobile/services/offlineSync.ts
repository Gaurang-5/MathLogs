/**
 * Offline Sync Engine
 * Caches API responses for instant offline access, queues mutations
 * for background sync when connectivity is restored.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import { isAxiosError } from 'axios';
import api from '../services/api';
import { getItemAsync } from './storage';

const OFFLINE_QUEUE_PREFIX = '@mathlogs_offline_queue_';
const CACHE_PREFIX = '@mathlogs_cache_';
const CACHE_VERSION = 2;
const CACHE_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const queueListeners = new Set<() => void>();

function notifyQueueListeners(): void {
  queueListeners.forEach((listener) => {
    try { listener(); } catch { /* A UI listener must not interrupt persistence. */ }
  });
}

export function subscribeToOfflineQueue(listener: () => void): () => void {
  queueListeners.add(listener);
  return () => queueListeners.delete(listener);
}

interface CacheEnvelope<T> {
  version: number;
  accountScope: string;
  timestamp: number;
  data: T;
}

async function getAccountScope(): Promise<string | null> {
  try {
    const raw = await getItemAsync('user_data');
    if (!raw) return null;
    const user = JSON.parse(raw) as { id?: unknown; instituteId?: unknown };
    const userId = typeof user.id === 'string' ? user.id.trim() : '';
    const instituteId = typeof user.instituteId === 'string' ? user.instituteId.trim() : '';
    if (!userId) return null;
    return `${instituteId || 'personal'}:${userId}`;
  } catch {
    return null;
  }
}

function scopedCacheKey(accountScope: string, key: string): string {
  return `${CACHE_PREFIX}${encodeURIComponent(accountScope)}:${encodeURIComponent(key)}`;
}

interface QueuedAction {
  id: string;
  accountScope: string;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  data?: any;
  headers?: Record<string, string>;
  timestamp: number;
  retryCount: number;
}

// ─── Cache Layer ───────────────────────────────────────────

export async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const accountScope = await getAccountScope();
    if (!accountScope) return null;
    const raw = await AsyncStorage.getItem(scopedCacheKey(accountScope, key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEnvelope<T>;

    if (
      parsed.version !== CACHE_VERSION
      || parsed.accountScope !== accountScope
      || Date.now() - parsed.timestamp > CACHE_RETENTION_MS
    ) {
      await AsyncStorage.removeItem(scopedCacheKey(accountScope, key));
      return null;
    }
    return parsed.data as T;
  } catch {
    return null;
  }
}

export async function setCachedData(key: string, data: any): Promise<void> {
  try {
    const accountScope = await getAccountScope();
    if (!accountScope) return;
    await AsyncStorage.setItem(
      scopedCacheKey(accountScope, key),
      JSON.stringify({
        version: CACHE_VERSION,
        accountScope,
        data,
        timestamp: Date.now(),
      } satisfies CacheEnvelope<unknown>),
    );
  } catch (error) {
    console.warn('Cache write failed:', error);
  }
}

export async function updateCachedData<T>(
  key: string,
  updater: (current: T | null) => T,
): Promise<T | null> {
  try {
    const accountScope = await getAccountScope();
    if (!accountScope) return null;
    const storageKey = scopedCacheKey(accountScope, key);
    const raw = await AsyncStorage.getItem(storageKey);
    let current: T | null = null;
    if (raw) {
      const parsed = JSON.parse(raw) as CacheEnvelope<T>;
      if (parsed.version === CACHE_VERSION && parsed.accountScope === accountScope) current = parsed.data;
    }
    const next = updater(current);
    await AsyncStorage.setItem(storageKey, JSON.stringify({
      version: CACHE_VERSION,
      accountScope,
      data: next,
      timestamp: Date.now(),
    } satisfies CacheEnvelope<T>));
    return next;
  } catch (error) {
    console.warn('Cache update failed:', error);
    return null;
  }
}

export async function clearCache(): Promise<void> {
  const allKeys = await AsyncStorage.getAllKeys();
  const cacheKeys = allKeys.filter((k) => k.startsWith(CACHE_PREFIX));
  if (cacheKeys.length > 0) {
    await AsyncStorage.multiRemove(cacheKeys);
  }
}

// ─── Offline Queue ─────────────────────────────────────────

async function getQueueForScope(accountScope: string): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(`${OFFLINE_QUEUE_PREFIX}${encodeURIComponent(accountScope)}`);
    const parsed = raw ? JSON.parse(raw) as QueuedAction[] : [];
    return parsed.filter((action) => action.accountScope === accountScope);
  } catch {
    return [];
  }
}

async function saveQueueForScope(accountScope: string, queue: QueuedAction[]): Promise<void> {
  await AsyncStorage.setItem(
    `${OFFLINE_QUEUE_PREFIX}${encodeURIComponent(accountScope)}`,
    JSON.stringify(queue),
  );
  notifyQueueListeners();
}

export async function enqueueAction(
  method: QueuedAction['method'],
  url: string,
  data?: any,
  headers?: Record<string, string>,
): Promise<void> {
  const accountScope = await getAccountScope();
  if (!accountScope) throw new Error('An authenticated account is required for offline changes.');
  const queue = await getQueueForScope(accountScope);
  const action: QueuedAction = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    accountScope,
    method,
    url,
    data,
    headers,
    timestamp: Date.now(),
    retryCount: 0,
  };
  queue.push(action);
  await saveQueueForScope(accountScope, queue);
}

export async function processQueue(): Promise<{ processed: number; failed: number }> {
  const networkState = await Network.getNetworkStateAsync();
  if (!networkState.isConnected) {
    return { processed: 0, failed: 0 };
  }

  const accountScope = await getAccountScope();
  if (!accountScope) return { processed: 0, failed: 0 };
  const queue = await getQueueForScope(accountScope);
  if (queue.length === 0) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;
  const remaining: QueuedAction[] = [];

  for (const action of queue) {
    if (await getAccountScope() !== accountScope) {
      remaining.push(action, ...queue.slice(queue.indexOf(action) + 1));
      break;
    }
    try {
      await api({
        method: action.method,
        url: action.url,
        data: action.data,
        headers: action.headers,
      });
      processed++;
    } catch (error) {
      action.retryCount++;
      // Never discard a teacher's work automatically. A later reconnect or
      // explicit retry may resolve server validation or session issues.
      remaining.push(action);
      failed++;
    }
  }

  await saveQueueForScope(accountScope, remaining);
  return { processed, failed };
}

export async function getQueueSize(): Promise<number> {
  const accountScope = await getAccountScope();
  if (!accountScope) return 0;
  const queue = await getQueueForScope(accountScope);
  return queue.length;
}

// ─── Network-Aware Fetch ───────────────────────────────────

/**
 * Fetches data with cache fallback.
 * Online: Fetches from API → caches → returns.
 * Offline: Returns cached data.
 */
export async function fetchWithCache<T>(
  cacheKey: string,
  apiCall: () => Promise<T>,
): Promise<{ data: T; isOffline: boolean }> {
  const networkState = await Network.getNetworkStateAsync();

  const canReachNetwork = networkState.isConnected && networkState.isInternetReachable !== false;

  if (canReachNetwork) {
    try {
      const data = await apiCall();
      await setCachedData(cacheKey, data);
      return { data, isOffline: false };
    } catch (error) {
      // Network error during connected state — fall back to cache
      const cached = await getCachedData<T>(cacheKey);
      if (cached) return { data: cached, isOffline: true };
      throw error;
    }
  }

  // Offline: return cache
  const cached = await getCachedData<T>(cacheKey);
  if (cached) return { data: cached, isOffline: true };
  throw new Error('No internet and no cached data available.');
}

/** React Query queryFn helper for account-scoped, cache-first offline reads. */
export async function offlineQuery<T>(
  cacheKey: string,
  apiCall: () => Promise<T>,
): Promise<T> {
  const result = await fetchWithCache(cacheKey, apiCall);
  return result.data;
}

export type OfflineMutationResult<T = unknown> =
  | { status: 'synced'; data: T; idempotencyKey: string }
  | { status: 'queued'; data: null; idempotencyKey: string };

function newIdempotencyKey(prefix: string): string {
  return `${prefix}:${Date.now()}:${Math.random().toString(36).slice(2, 12)}`;
}

function isTransientNetworkFailure(error: unknown): boolean {
  return isAxiosError(error) && !error.response && error.code !== 'ERR_CANCELED';
}

/**
 * Executes a JSON mutation now, or durably queues it when the network cannot be
 * reached. Every request keeps one idempotency key across all retries.
 */
export async function executeOrQueueMutation<T = unknown>({
  method,
  url,
  data,
  idempotencyKey = newIdempotencyKey('mobile'),
  headers = {},
}: {
  method: QueuedAction['method'];
  url: string;
  data?: unknown;
  idempotencyKey?: string;
  headers?: Record<string, string>;
}): Promise<OfflineMutationResult<T>> {
  const requestHeaders = { ...headers, 'Idempotency-Key': idempotencyKey };
  const networkState = await Network.getNetworkStateAsync();
  const canReachNetwork = networkState.isConnected && networkState.isInternetReachable !== false;

  if (!canReachNetwork) {
    await enqueueAction(method, url, data, requestHeaders);
    return { status: 'queued', data: null, idempotencyKey };
  }

  try {
    const response = await api<T>({ method, url, data, headers: requestHeaders });
    return { status: 'synced', data: response.data, idempotencyKey };
  } catch (error) {
    if (!isTransientNetworkFailure(error)) throw error;
    await enqueueAction(method, url, data, requestHeaders);
    return { status: 'queued', data: null, idempotencyKey };
  }
}
