export const API_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://localhost:3001/api');

async function request(endpoint: string, method = 'GET', body?: any, timeoutMs?: number) {
    const headers: any = { 'Content-Type': 'application/json' };
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
            const isPasswordVerification = (method === 'DELETE' && endpoint.includes('/academic-years/')) || endpoint.includes('/auth/login');

            if ((res.status === 401 || res.status === 403) && !isPasswordVerification) {
                localStorage.removeItem('token');
                localStorage.removeItem('adminId');
                window.location.href = '/login';
                throw new Error('Session expired. Please login again.');
            }

            // Extract error message from response
            const errorData = await res.json().catch(() => ({}));
            const serverMessage = errorData.error || errorData.message || 'Request failed';

            // Categorize by status code and provide context
            switch (res.status) {
                case 400:
                    throw new Error(serverMessage); // Validation errors - use server message

                case 409:
                    // Conflict - likely concurrent modification, safe to retry
                    throw new Error(serverMessage.includes('Concurrent')
                        ? serverMessage
                        : 'Concurrent modification detected. ' + serverMessage);

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
