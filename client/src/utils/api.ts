declare global {
    interface Window {
        Capacitor?: {
            isNative?: boolean;
        };
    }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';
type QueueEntry = { resolve: (value: string | null) => void; reject: (reason?: unknown) => void };

const isCapacitor = typeof window !== 'undefined' && window.Capacitor?.isNative;
export const API_URL = isCapacitor
    ? 'https://mathlogs.app/api'
    : (import.meta.env.VITE_API_URL || '/api');

let isRefreshing = false;
let failedQueue: QueueEntry[] = [];

const processQueue = (error: Error | null, token: string | null = null) => {
    failedQueue.forEach(prom => {
        if (error) prom.reject(error);
        else prom.resolve(token);
    });
    failedQueue = [];
};

function clearSessionAndRedirect() {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('adminId');
    window.location.href = '/login';
}

function createRequestInit(method: HttpMethod, headers: Record<string, string>, body?: unknown, signal?: AbortSignal): RequestInit {
    return {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal,
    };
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
    return res.json() as Promise<T>;
}

async function request<T = unknown>(endpoint: string, method: HttpMethod = 'GET', body?: unknown, timeoutMs?: number): Promise<T> {
    const headers: Record<string, string> = {};
    if (method !== 'GET' && method !== 'DELETE') {
        headers['Content-Type'] = 'application/json';
    }

    const token = localStorage.getItem('token');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // Determine timeout: registration needs extra time for SQLite sequential writes
    const timeout = timeoutMs || (endpoint.includes('/public/register') ? 40000 : 30000);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const res = await fetch(`${API_URL}${endpoint}`, createRequestInit(method, headers, body, controller.signal));

        clearTimeout(timeoutId);

        if (!res.ok) {
            // Handle authentication errors
            // Exception: DELETE /academic-years/:id returns 401 for wrong password, not invalid session
            // Exception: auth endpoints obviously shouldn't loop
            const isPasswordVerification = (method === 'DELETE' && endpoint.includes('/academic-years/')) || endpoint.includes('/auth/');

            if ((res.status === 401 || res.status === 403) && !isPasswordVerification) {
                const refreshToken = localStorage.getItem('refreshToken');
                
                if (!refreshToken) {
                    clearSessionAndRedirect();
                    throw new Error('Session expired. Please login again.');
                }

                if (isRefreshing) {
                    const newToken = await new Promise<string | null>((resolve, reject) => {
                        failedQueue.push({ resolve, reject });
                    });
                    if (!newToken) {
                        throw new Error('Session refresh failed.');
                    }

                    headers['Authorization'] = `Bearer ${newToken}`;
                    const retryRes = await fetch(`${API_URL}${endpoint}`, createRequestInit(method, headers, body));
                    if (!retryRes.ok) throw new Error('Retry failed after token rotation');
                    return parseJsonResponse<T>(retryRes);
                }

                // Initiate refresh
                isRefreshing = true;
                try {
                    const refreshRes = await fetch(`${API_URL}/auth/refresh`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ refreshToken })
                    });

                    if (!refreshRes.ok) throw new Error('Refresh token invalid');

                    const refreshData = await parseJsonResponse<{ token: string; refreshToken: string }>(refreshRes);
                    localStorage.setItem('token', refreshData.token);
                    localStorage.setItem('refreshToken', refreshData.refreshToken);
                    
                    isRefreshing = false;
                    processQueue(null, refreshData.token);

                    // Re-fire original request
                    headers['Authorization'] = `Bearer ${refreshData.token}`;
                    const retryRes = await fetch(`${API_URL}${endpoint}`, createRequestInit(method, headers, body));
                    if (!retryRes.ok) throw new Error('Retry failed after token rotation');
                    return parseJsonResponse<T>(retryRes);
                } catch (err) {
                    processQueue(err as Error, null);
                    isRefreshing = false;
                    clearSessionAndRedirect();
                    throw new Error('Session expired securely. Please login again.');
                }
            }

            // Extract error message from response
            const errorData = await res.json().catch(() => ({} as { error?: string; message?: string }));
            const serverMessage = errorData.error || errorData.message || 'Request failed';

            // Special case for expired free trial / subscription
            if (res.status === 402) {
                if (window.location.pathname !== '/billing') {
                    window.location.href = '/billing';
                }
                throw new Error(serverMessage || 'Subscription expired.');
            }

            // Categorize by status code and provide context
            switch (res.status) {
                case 400:
                    throw new Error(serverMessage); // Validation errors - use server message

                case 409:
                    // Conflict
                    throw new Error(serverMessage);

                case 429:
                    // Log rate limit for monitoring - should NOT occur in normal testing
                    console.error('[RATE_LIMIT_CLIENT]', {
                        endpoint,
                        timestamp: new Date().toISOString(),
                        message: 'Rate limit exceeded - investigate if occurs during testing'
                    });
                    throw new Error('Too many requests from this location. Please wait a few minutes and try again.');

                case 500:
                case 502:
                case 503:
                    throw new Error(serverMessage + ' Please try again or contact support if this persists.');

                default:
                    throw new Error(serverMessage);
            }
        }
        return parseJsonResponse<T>(res);
    } catch (error: unknown) {
        clearTimeout(timeoutId);

        const requestError = error instanceof Error ? error : new Error('Unknown request failure');

        // --- MOBILE DIAGNOSTICS ---
        if (isCapacitor) {
            alert(`NATIVE FETCH ERROR:\nURL: ${API_URL}${endpoint}\nMSG: ${requestError.message}\nNAME: ${requestError.name}`);
        }
        // --------------------------

        // Handle timeout
        if (requestError.name === 'AbortError') {
            throw new Error('Request timeout. Please check your connection and try again.');
        }

        // Handle network errors
        if (requestError.message === 'Failed to fetch') {
            throw new Error('Network error. Please check your internet connection and try again.');
        }

        // Re-throw with original message
        throw requestError;
    }
}

export const api = {
    get: <T = unknown>(endpoint: string) => request<T>(endpoint, 'GET'),
    post: <T = unknown>(endpoint: string, body: unknown) => request<T>(endpoint, 'POST', body),
    put: <T = unknown>(endpoint: string, body: unknown) => request<T>(endpoint, 'PUT', body),
    delete: <T = unknown>(endpoint: string, body?: unknown) => request<T>(endpoint, 'DELETE', body),
};

export const apiRequest = request;
