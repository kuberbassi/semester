import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { dispatchGlobalToast } from '@/components/ui/toast-context';

declare module 'axios' {
    interface AxiosRequestConfig {
        _skipRetry?: boolean;
        _retry?: number;
        _authRefreshed?: boolean;
    }
}

interface ApiErrorBody {
    code?: string;
    error?: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
let refreshPromise: Promise<unknown> | null = null;

const shouldHandleAsAuthExpiry = (requestUrl: string, error: AxiosError<ApiErrorBody>): boolean => {
    const responseCode = String(error.response?.data?.code || '');

    if (requestUrl.includes('/api/ipu/')) return false;
    if (['SESSION_EXPIRED', 'CAPTCHA_FAILED', 'LOGIN_FAILED', 'LOGIN_BLOCKED', 'ACCOUNT_LOCKED'].includes(responseCode)) {
        return false;
    }

    return true;
};

const readCookie = (name: string): string | null => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = document.cookie.match(new RegExp(`(?:^|; )${escaped}=([^;]*)`));
    return match ? decodeURIComponent(match[1]) : null;
};

// Create axios instance
const api: AxiosInstance = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    withCredentials: true, // Important for session cookies
});

// ─── Stable device fingerprint ───────────────────────────────────────────────
// Generates once per browser profile and persists across sessions, so the
// backend can collapse duplicate logins from the same physical device.
function getOrCreateDeviceId(): string {
    const DEVICE_KEY = 'zenith_device_id';
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
        // crypto.randomUUID() is available in all modern browsers
        id = typeof crypto !== 'undefined' && crypto.randomUUID
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        try { localStorage.setItem(DEVICE_KEY, id); } catch { /* quota */ }
    }
    return id;
}

// Request interceptor
api.interceptors.request.use(
    (config: InternalAxiosRequestConfig) => {
        if (config.headers) {
            const csrfToken = readCookie('zenith_csrf_token');
            if (csrfToken && config.method && !['get', 'head', 'options'].includes(config.method.toLowerCase())) {
                config.headers['X-CSRF-Token'] = csrfToken;
            }
            const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (timezone) config.headers['X-Timezone'] = timezone;
            // Send stable device ID for session deduplication
            config.headers['X-Device-Id'] = getOrCreateDeviceId();
        }
        return config;
    },
    (error: AxiosError) => {
        return Promise.reject(error);
    }
);

// Response interceptor with retry logic
api.interceptors.response.use(
    (response) => response,
    async (error: AxiosError<ApiErrorBody>) => {
        const config = error.config as InternalAxiosRequestConfig;
        const requestUrl = String(config?.url ?? '');

        if (error.response?.status === 401) {
            const isRefreshRequest = requestUrl.includes('/api/auth/refresh');
            const isLoginRequest = requestUrl.includes('/api/auth/google');
            const isSessionProbe = requestUrl.includes('/api/auth/me');
            const hasRetriedAuth = Boolean(config?._authRefreshed);
            const shouldRefreshAuth = shouldHandleAsAuthExpiry(requestUrl, error);

            if (shouldRefreshAuth && !isRefreshRequest && !isLoginRequest && !hasRetriedAuth) {
                try {
                    if (!refreshPromise) {
                        refreshPromise = api.post('/api/auth/refresh');
                    }
                    await refreshPromise;
                    config._authRefreshed = true;
                    return api.request(config);
                } catch (refreshError: unknown) {
                    const status = axios.isAxiosError<ApiErrorBody>(refreshError) ? refreshError.response?.status : undefined;
                    const code = axios.isAxiosError<ApiErrorBody>(refreshError) ? refreshError.response?.data?.code : undefined;
                    const isSessionInvalid = status === 401 || status === 403 || code === 'REFRESH_INVALID' || code === 'REFRESH_EXPIRED';
                    
                    if (isSessionInvalid) {
                        localStorage.removeItem('user');
                        if (!isSessionProbe) window.location.href = '/login';
                    }
                    return Promise.reject(error);
                } finally {
                    refreshPromise = null;
                }
            }

            if (shouldRefreshAuth) {
                const status = error.response?.status;
                const code = error.response?.data?.code;
                const isSessionInvalid = status === 401 || status === 403 || code === 'TOKEN_EXPIRED' || code === 'TOKEN_INVALID' || code === 'REFRESH_INVALID' || code === 'REFRESH_EXPIRED';
                
                if (isSessionInvalid) {
                    localStorage.removeItem('user');
                    window.location.href = '/login';
                }
            }
        }

        // Handle 429 — show toast immediately, never retry
        if (error.response?.status === 429) {
            const msg = error.response.data?.error
                || 'You are making requests too quickly. Please wait a minute and try again.';
            dispatchGlobalToast('warning', msg);
            return Promise.reject(error);
        }

        if (!config?._skipRetry && shouldRetry(error)) {
            config._retry = (config._retry || 0) + 1;
            const maxRetries = 3;
            if (config._retry <= maxRetries) {
                // Exponential backoff: 1s, 2s, 4s...
                const delay = Math.pow(2, config._retry - 1) * 1000 + Math.random() * 500;
                console.warn(`Request failed (${error.response?.status}). Retrying in ${Math.round(delay)}ms... (Attempt ${config._retry}/${maxRetries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
                return api.request(config);
            }
        }
        return Promise.reject(error);
    }
);

function shouldRetry(error: AxiosError): boolean {
    // Never retry mutation requests — they are not safe to replay on failure
    const method = error.config?.method?.toUpperCase();
    if (method && ['PUT', 'POST', 'DELETE', 'PATCH'].includes(method)) return false;
    if (!error.response) return true; // Network errors (GET/HEAD only)
    const status = error.response.status;
    return status >= 500 && status < 600;
}

export default api;
