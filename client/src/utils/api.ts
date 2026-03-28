const isCapacitor = typeof window !== 'undefined' && (window as any).Capacitor?.isNative;
export const API_URL = isCapacitor
    ? 'https://mathlogs.app/api'
    : (import.meta.env.VITE_API_URL || '/api');



let isRefreshing = false;
let failedQueue: Array<{ resolve: (value?: any) => void, reject: (reason?: any) => void }> = [];

const processQueue = (error: Error | null, token: string | null = null) => {
    failedQueue.forEach(prom => {
        if (error) prom.reject(error);
        else prom.resolve(token);
    });
    failedQueue = [];
};

async function request(endpoint: string, method = 'GET', body?: any, timeoutMs?: number) {
    const headers: any = {};
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
        const res = await fetch(`${API_URL}${endpoint}`, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            // Handle authentication errors
            // Exception: DELETE /academic-years/:id returns 401 for wrong password, not invalid session
            // Exception: auth endpoints obviously shouldn't loop
            const isPasswordVerification = (method === 'DELETE' && endpoint.includes('/academic-years/')) || endpoint.includes('/auth/');

            if ((res.status === 401 || res.status === 403) && !isPasswordVerification) {
                const refreshToken = localStorage.getItem('refreshToken');
                
                if (!refreshToken) {
                    localStorage.removeItem('token');
                    localStorage.removeItem('refreshToken');
                    localStorage.removeItem('adminId');
                    window.location.href = '/login';
                    throw new Error('Session expired. Please login again.');
                }

                if (isRefreshing) {
                    // Wait for the ongoing refresh to complete
                    try {
                        const newToken = await new Promise<string>((resolve, reject) => {
                            failedQueue.push({ resolve, reject });
                        });
                        headers['Authorization'] = `Bearer ${newToken}`;
                        const retryRes = await fetch(`${API_URL}${endpoint}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
                        if (!retryRes.ok) throw new Error('Retry failed after token rotation');
                        return retryRes.json();
                    } catch (err) {
                        throw err;
                    }
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

                    const refreshData = await refreshRes.json();
                    localStorage.setItem('token', refreshData.token);
                    localStorage.setItem('refreshToken', refreshData.refreshToken);
                    
                    isRefreshing = false;
                    processQueue(null, refreshData.token);

                    // Re-fire original request
                    headers['Authorization'] = `Bearer ${refreshData.token}`;
                    const retryRes = await fetch(`${API_URL}${endpoint}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
                    if (!retryRes.ok) throw new Error('Retry failed after token rotation');
                    return retryRes.json();
                } catch (err) {
                    processQueue(err as Error, null);
                    isRefreshing = false;
                    localStorage.removeItem('token');
                    localStorage.removeItem('refreshToken');
                    localStorage.removeItem('adminId');
                    window.location.href = '/login';
                    throw new Error('Session expired securely. Please login again.');
                }
            }

            // Extract error message from response
            const errorData = await res.json().catch(() => ({}));
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
        return res.json();
    } catch (error: any) {
        clearTimeout(timeoutId);

        // --- MOBILE DIAGNOSTICS ---
        if (isCapacitor) {
            alert(`NATIVE FETCH ERROR:\nURL: ${API_URL}${endpoint}\nMSG: ${error.message}\nNAME: ${error.name}`);
        }
        // --------------------------

        // Handle timeout
        if (error.name === 'AbortError') {
            throw new Error('Request timeout. Please check your connection and try again.');
        }

        // Handle network errors
        if (error.message === 'Failed to fetch') {
            throw new Error('Network error. Please check your internet connection and try again.');
        }

        // Re-throw with original message
        throw error;
    }
}

export const api = {
    get: (endpoint: string) => request(endpoint, 'GET'),
    post: (endpoint: string, body: any) => request(endpoint, 'POST', body),
    put: (endpoint: string, body: any) => request(endpoint, 'PUT', body),
    delete: (endpoint: string, body?: any) => request(endpoint, 'DELETE', body),
};

export const apiRequest = request;
