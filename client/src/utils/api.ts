/* eslint-disable */
declare global {
    interface Window {
        Capacitor?: {
            isNative?: boolean;
        };
    }
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
type QueueEntry = { resolve: (value: string | null) => void; reject: (reason?: unknown) => void };

export class ApiRequestError<TResponse = unknown> extends Error {
    readonly status: number;
    readonly response: TResponse;

    constructor(message: string, status: number, response: TResponse) {
        super(message);
        this.name = 'ApiRequestError';
        this.status = status;
        this.response = response;
    }
}

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
    const pathname = window.location.pathname;
    const isStudentPortal = pathname.includes('/student');
    const isLiveQuiz = pathname.includes('/student/quiz/');

    if (isLiveQuiz) {
        console.warn('[AUTH] Session validation failed during active quiz. Redirect bypassed to protect student progress.');
        return;
    }

    if (isStudentPortal) {
        // Extract institute slug from /:slug/student/...
        const match = pathname.match(/^\/([^\/]+)\/student/);
        const slug = match ? match[1] : null;
        
        if (slug) {
            localStorage.removeItem(`student_token_${slug}`);
            window.location.href = `/${slug}/student`;
            return;
        }
    }

    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('adminId');
    window.location.href = '/login';
}

function createRequestInit(method: HttpMethod, headers: Record<string, string>, body?: unknown, signal?: AbortSignal): RequestInit {
    const isFormData = typeof window !== 'undefined' && body instanceof FormData;
    return {
        method,
        headers,
        body: body ? (isFormData ? (body as any) : JSON.stringify(body)) : undefined,
        signal,
    };
}

async function parseJsonResponse<T>(res: Response): Promise<T> {
    const contentType = res.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
        return res.json() as Promise<T>;
    }
    throw new Error('Server returned an invalid response (expected JSON, got ' + (contentType || 'unknown') + '). Please ensure the backend is running.');
}

async function request<T = unknown>(
    endpoint: string, 
    method: HttpMethod = 'GET', 
    body?: unknown, 
    options?: { headers?: Record<string, string>; timeoutMs?: number }
): Promise<T> {
    const headers: Record<string, string> = { ...options?.headers };
    const isFormData = typeof window !== 'undefined' && body instanceof FormData;
    
    if (method !== 'GET' && !isFormData && !headers['Content-Type']) {
        if (method !== 'DELETE' || body !== undefined) {
            headers['Content-Type'] = 'application/json';
        }
    }
    
    if (isFormData) {
        delete headers['Content-Type'];
    }

    const supportSession = (() => { try { return JSON.parse(sessionStorage.getItem('superAdminSupportSession') || 'null') as { token?: string; expiresAt?: string } | null; } catch { return null; } })();
    const supportToken = supportSession?.token && supportSession.expiresAt && new Date(supportSession.expiresAt).getTime() > Date.now() && !endpoint.startsWith('/super-admin') ? supportSession.token : null;
    const token = supportToken || localStorage.getItem('token');
    if (token && !headers['Authorization']) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // Determine timeout: registration needs extra time for SQLite sequential writes
    const timeout = options?.timeoutMs || (endpoint.includes('/public/register') ? 40000 : 30000);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
        const res = await fetch(`${API_URL}${endpoint}`, createRequestInit(method, headers, body, controller.signal));

        clearTimeout(timeoutId);

        if (!res.ok) {
            if (supportToken && (res.status === 401 || res.status === 403)) {
                sessionStorage.removeItem('superAdminSupportSession');
                window.dispatchEvent(new Event('support-session-change'));
                throw new Error('Support session ended or no longer permits this action.');
            }
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
            let serverMessage = 'Request failed';
            let errorResponse: unknown;
            try {
                const errorData = await parseJsonResponse<{
                    error?: string;
                    message?: string;
                    details?: Array<{ path?: Array<string | number>; message?: string }>;
                }>(res);
                errorResponse = errorData;
                const validationMessage = errorData.details
                    ?.map(detail => detail.message?.trim())
                    .filter((message): message is string => Boolean(message))
                    .join(' ');
                serverMessage = validationMessage || errorData.error || errorData.message || serverMessage;
            } catch (e) {
                // Ignore JSON parse errors for error responses, just use default message
            }

            const requestError = (message = serverMessage) => new ApiRequestError(message, res.status, errorResponse);

            // Special case for expired free trial / subscription
            if (res.status === 402) {
                if (window.location.pathname !== '/billing') {
                    window.location.href = '/billing';
                }
                throw requestError(serverMessage || 'Subscription expired.');
            }

            // Categorize by status code and provide context
            switch (res.status) {
                case 400:
                    throw new Error(serverMessage); // Validation errors - use server message

                case 409:
                    // Conflict
                    throw requestError();

                case 429:
                    // Log rate limit for monitoring - should NOT occur in normal testing
                    console.error('[RATE_LIMIT_CLIENT]', {
                        endpoint,
                        timestamp: new Date().toISOString(),
                        message: 'Rate limit exceeded - investigate if occurs during testing'
                    });
                    throw requestError('Too many requests from this location. Please wait a few minutes and try again.');

                case 500:
                case 502:
                case 503:
                    throw requestError(serverMessage + ' Please try again or contact support if this persists.');

                default:
                    throw requestError();
            }
        }
        return parseJsonResponse<T>(res);
    } catch (error: unknown) {
        clearTimeout(timeoutId);

        const requestError = error instanceof Error ? error : new Error('Unknown request failure');

        // --- MOBILE DIAGNOSTICS ---
        if (isCapacitor) {
            console.error('Capacitor fetch error', { 
                extra: { 
                    url: `${API_URL}${endpoint}`, 
                    error: requestError.message,
                    name: requestError.name
                }
            });
            
            if (import.meta.env.DEV) {
                alert(`NATIVE FETCH ERROR:\nURL: ${API_URL}${endpoint}\nMSG: ${requestError.message}\nNAME: ${requestError.name}`);
            }
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
    get: <T = unknown>(endpoint: string, options?: { headers?: Record<string, string>; timeoutMs?: number }) => 
        request<T>(endpoint, 'GET', undefined, options),
    post: <T = unknown>(endpoint: string, body: unknown, options?: { headers?: Record<string, string>; timeoutMs?: number }) => 
        request<T>(endpoint, 'POST', body, options),
    put: <T = unknown>(endpoint: string, body: unknown, options?: { headers?: Record<string, string>; timeoutMs?: number }) => 
        request<T>(endpoint, 'PUT', body, options),
    delete: <T = unknown>(endpoint: string, body?: unknown, options?: { headers?: Record<string, string>; timeoutMs?: number }) => 
        request<T>(endpoint, 'DELETE', body, options),
};

export const apiRequest = request;
