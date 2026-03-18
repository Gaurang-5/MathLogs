/**
 * Offline Sync Engine
 * Caches API responses for instant offline access, queues mutations
 * for background sync when connectivity is restored.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Network from 'expo-network';
import api from '../services/api';

const OFFLINE_QUEUE_KEY = '@mathlogs_offline_queue';
const CACHE_PREFIX = '@mathlogs_cache_';

interface QueuedAction {
  id: string;
  method: 'POST' | 'PUT' | 'DELETE';
  url: string;
  data?: any;
  timestamp: number;
  retryCount: number;
}

// ─── Cache Layer ───────────────────────────────────────────

export async function getCachedData<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);

    // Cache TTL: 24 hours
    const ONE_DAY = 24 * 60 * 60 * 1000;
    if (Date.now() - parsed.timestamp > ONE_DAY) {
      await AsyncStorage.removeItem(`${CACHE_PREFIX}${key}`);
      return null;
    }
    return parsed.data as T;
  } catch {
    return null;
  }
}

export async function setCachedData(key: string, data: any): Promise<void> {
  try {
    await AsyncStorage.setItem(
      `${CACHE_PREFIX}${key}`,
      JSON.stringify({ data, timestamp: Date.now() }),
    );
  } catch (error) {
    console.warn('Cache write failed:', error);
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

async function getQueue(): Promise<QueuedAction[]> {
  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

async function saveQueue(queue: QueuedAction[]): Promise<void> {
  await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

export async function enqueueAction(
  method: QueuedAction['method'],
  url: string,
  data?: any,
): Promise<void> {
  const queue = await getQueue();
  const action: QueuedAction = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    method,
    url,
    data,
    timestamp: Date.now(),
    retryCount: 0,
  };
  queue.push(action);
  await saveQueue(queue);
}

export async function processQueue(): Promise<{ processed: number; failed: number }> {
  const networkState = await Network.getNetworkStateAsync();
  if (!networkState.isConnected) {
    return { processed: 0, failed: 0 };
  }

  const queue = await getQueue();
  if (queue.length === 0) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;
  const remaining: QueuedAction[] = [];

  for (const action of queue) {
    try {
      await api({
        method: action.method,
        url: action.url,
        data: action.data,
      });
      processed++;
    } catch (error) {
      action.retryCount++;
      if (action.retryCount < 5) {
        remaining.push(action);
      }
      failed++;
    }
  }

  await saveQueue(remaining);
  return { processed, failed };
}

export async function getQueueSize(): Promise<number> {
  const queue = await getQueue();
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

  if (networkState.isConnected) {
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
