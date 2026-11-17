/**
 * API Client for MathLogs Server
 * Handles authentication headers, base URL, and session recovery.
 */
import axios, { AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import { withSessionStorage } from './sessionStorage';
import { deleteItemAsync, getItemAsync, setItemAsync } from './storage';
import {
  MissingRefreshTokenError,
  SessionRecoveryCoordinator,
  StaleSessionRecoveryError,
  getErrorStatus,
  isSessionRejection,
  type SessionTokenPair,
} from './sessionRecovery';

const DEFAULT_DEV_URL = Platform.select({
  android: 'http://10.0.2.2:3001',
  default: 'http://localhost:3001',
});
const PROD_URL = 'https://mathlogs.app';
const BASE_URL = process.env.EXPO_PUBLIC_API_URL || (__DEV__ ? DEFAULT_DEV_URL : PROD_URL);

const api = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

const refreshClient = axios.create({
  baseURL: `${BASE_URL}/api`,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

type SessionListener = (token: string | null) => void;
type ReplayableRequestConfig = InternalAxiosRequestConfig & {
  _sessionGeneration?: number;
  _sessionReplay?: boolean;
};

const sessionListeners = new Set<SessionListener>();

const SESSION_RECOVERY_EXCLUDED_ROUTES = new Set([
  '/plans',
  '/auth/login',
  '/auth/setup',
  '/auth/change-password',
  '/auth/send-otp',
  '/auth/send-mobile-otp',
  '/auth/verify-otp',
  '/auth/verify-mobile-otp',
  '/auth/select-account',
  '/auth/refresh',
  '/auth/logout',
  '/auth/send-signup-otp',
  '/auth/verify-signup-otp',
  '/auth/setup-account',
  '/super-admin/security/reauth/send',
  '/super-admin/security/reauth/verify',
]);

const SESSION_RECOVERY_EXCLUDED_PREFIXES = [
  '/public/',
  '/invites/',
  '/onboarding/',
  '/admin-onboarding/',
];

const DIAGNOSTIC_ROUTES = new Set([
  '/auth/me',
  '/dashboard/summary',
  '/institute/me',
]);

function normalizeApiRoute(url?: string): string | null {
  if (!url) return null;

  try {
    const path = new URL(url, `${BASE_URL}/api/`).pathname;
    return path.replace(/^\/api(?=\/|$)/, '') || '/';
  } catch {
    const path = url.split('?')[0];
    return path.replace(/^\/api(?=\/|$)/, '') || '/';
  }
}

function shouldSkipSessionRecovery(url?: string, method?: string): boolean {
  const route = normalizeApiRoute(url);
  if (!route) return true;
  if (SESSION_RECOVERY_EXCLUDED_ROUTES.has(route)) return true;
  if (method?.toUpperCase() === 'DELETE' && /^\/academic-years\/[^/]+$/.test(route)) return true;

  return SESSION_RECOVERY_EXCLUDED_PREFIXES.some((prefix) => (
    route === prefix.slice(0, -1) || route.startsWith(prefix)
  ));
}

function diagnosticRoute(url?: string): string | null {
  const route = normalizeApiRoute(url);
  return route && DIAGNOSTIC_ROUTES.has(route) ? route : null;
}

function logDiagnostic(
  level: 'info' | 'warn',
  route: string | null,
  category: string,
  status: number | null,
): void {
  if (!__DEV__ || !route) return;
  console[level]('[API]', { route, category, status });
}

function failureCategory(error: unknown): string {
  const status = getErrorStatus(error);
  if (isSessionRejection(error)) return 'session_rejected';
  if (status === null) return 'network_failure';
  if (status >= 500) return 'server_failure';
  if (status === 401 || status === 403) return 'access_rejected';
  return status >= 400 ? 'request_rejected' : 'unknown_failure';
}

function authorizationValue(config: InternalAxiosRequestConfig): string | null {
  const value = config.headers?.Authorization;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function bearerToken(config: InternalAxiosRequestConfig): string | null {
  const authorization = authorizationValue(config);
  if (!authorization) return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1]?.trim() || null;
}

function setRequestToken(config: InternalAxiosRequestConfig, token: string): void {
  config.headers.Authorization = `Bearer ${token}`;
}

function applySessionHeader(token: string | null): void {
  if (token) api.defaults.headers.common.Authorization = `Bearer ${token}`;
  else delete api.defaults.headers.common.Authorization;
}

function notifySessionListeners(token: string | null): void {
  sessionListeners.forEach((listener) => {
    try {
      listener(token);
    } catch {
      // A UI subscriber must not break request recovery for the rest of the app.
    }
  });
}

async function clearPersistedSession(
  expectedAccessToken: string | null,
  isStillInvalidated: () => boolean,
): Promise<void> {
  await withSessionStorage(async () => {
    if (!isStillInvalidated()) return;

    const keys = ['auth_token', 'refresh_token', 'user_data'] as const;
    const snapshots = await Promise.all(keys.map((key) => getItemAsync(key)));
    if (!isStillInvalidated()) return;
    if (expectedAccessToken && snapshots[0] && snapshots[0] !== expectedAccessToken) return;

    for (let index = 0; index < keys.length; index += 1) {
      if (!isStillInvalidated()) return;
      const currentValue = await getItemAsync(keys[index]);
      if (!isStillInvalidated()) return;
      if (currentValue === snapshots[index]) await deleteItemAsync(keys[index]);
    }
  });
}

async function discardStaleTokens(tokens: SessionTokenPair): Promise<void> {
  await withSessionStorage(async () => {
    const [storedAccessToken, storedRefreshToken] = await Promise.all([
      getItemAsync('auth_token'),
      getItemAsync('refresh_token'),
    ]);

    await Promise.all([
      storedAccessToken === tokens.token ? deleteItemAsync('auth_token') : Promise.resolve(),
      storedRefreshToken === tokens.refreshToken
        ? deleteItemAsync('refresh_token')
        : Promise.resolve(),
    ]);
  });
}

async function requestTokenRefresh(refreshToken: string): Promise<SessionTokenPair> {
  const response = await refreshClient.post<{
    success?: boolean;
    token?: unknown;
    refreshToken?: unknown;
  }>('/auth/refresh', { refreshToken });

  const token = typeof response.data?.token === 'string' ? response.data.token.trim() : '';
  const rotatedRefreshToken = typeof response.data?.refreshToken === 'string'
    ? response.data.refreshToken.trim()
    : '';

  if (!token || !rotatedRefreshToken) {
    throw new Error('Refresh response did not contain a complete token pair');
  }

  logDiagnostic('info', '/auth/refresh', 'session_refresh_succeeded', response.status);
  return { token, refreshToken: rotatedRefreshToken };
}

const sessionRecovery = new SessionRecoveryCoordinator({
  readRefreshToken: () => getItemAsync('refresh_token'),
  requestRefresh: requestTokenRefresh,
  persistTokens: async ({ token, refreshToken }, expectedAccessToken, isStillCurrent) => {
    await withSessionStorage(async () => {
      if (!isStillCurrent()) throw new StaleSessionRecoveryError();
      const storedAccessToken = await getItemAsync('auth_token');
      if (!isStillCurrent() || (storedAccessToken && storedAccessToken !== expectedAccessToken)) {
        throw new StaleSessionRecoveryError();
      }
      await Promise.all([
        setItemAsync('auth_token', token),
        setItemAsync('refresh_token', refreshToken),
      ]);
    });
  },
  discardTokens: discardStaleTokens,
  clearPersistedSession,
  isDefiniteRefreshFailure: (error) => (
    isSessionRejection(error) || getErrorStatus(error) === 400
  ),
  applySession: applySessionHeader,
  notifySession: notifySessionListeners,
});

export function subscribeToSessionChanges(listener: SessionListener): () => void {
  sessionListeners.add(listener);
  return () => sessionListeners.delete(listener);
}

export function setApiSession(token: string | null): void {
  sessionRecovery.setSession(token?.trim() || null);
}

// Preserve a request's explicit/default Authorization header. This is required
// while finalizeLogin verifies a newly-issued token before it reaches storage.
api.interceptors.request.use(
  async (config: ReplayableRequestConfig) => {
    const existingToken = bearerToken(config);
    if (existingToken) {
      sessionRecovery.hydrateIfUnset(existingToken);
      config._sessionGeneration ??= sessionRecovery.sessionGeneration;
      return config;
    }

    const token = sessionRecovery.token || await getItemAsync('auth_token');
    if (token) {
      sessionRecovery.hydrateIfUnset(token);
      setRequestToken(config, token);
    }
    config._sessionGeneration ??= sessionRecovery.sessionGeneration;
    return config;
  },
  (error: AxiosError) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => {
    const route = diagnosticRoute(response.config.url);
    if (route === '/dashboard/summary') {
      logDiagnostic('info', route, 'request_succeeded', response.status);
    }
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as ReplayableRequestConfig | undefined;
    const route = diagnosticRoute(config?.url);
    logDiagnostic('warn', route, failureCategory(error), getErrorStatus(error));

    if (
      !config
      || !isSessionRejection(error)
      || shouldSkipSessionRecovery(config.url, config.method)
    ) {
      return Promise.reject(error);
    }

    const rejectedToken = bearerToken(config);
    if (config._sessionReplay) {
      await sessionRecovery.rejectCurrentSession(rejectedToken, config._sessionGeneration);
      return Promise.reject(error);
    }

    try {
      const token = await sessionRecovery.recover(rejectedToken, config._sessionGeneration);
      config._sessionReplay = true;
      setRequestToken(config, token);
      return api.request(config);
    } catch (refreshError) {
      const category = refreshError instanceof StaleSessionRecoveryError
        ? 'session_changed'
        : refreshError instanceof MissingRefreshTokenError
          || isSessionRejection(refreshError)
          || getErrorStatus(refreshError) === 400
          ? 'refresh_rejected'
          : 'refresh_unavailable';
      logDiagnostic('warn', route, category, getErrorStatus(refreshError));
      return Promise.reject(
        category === 'refresh_unavailable' ? refreshError : error,
      );
    }
  },
);

export { BASE_URL, isSessionRejection };
export default api;
