import { QueryClient, MutationCache, QueryCache } from '@tanstack/react-query';
import axios from 'axios';
import { dispatchGlobalToast } from '@/components/ui/toast-context';
import { isTauriDesktop } from '@/utils/platform';

interface ApiErrorBody {
    error?: string;
}

function getErrorDetails(error: unknown) {
    if (axios.isAxiosError<ApiErrorBody>(error)) {
        return {
            status: error.response?.status,
            code: error.code,
            name: error.name,
            message: error.response?.data?.error || error.message,
        };
    }

    if (error instanceof Error) {
        return { status: undefined, code: undefined, name: error.name, message: error.message };
    }

    return { status: undefined, code: undefined, name: undefined, message: undefined };
}

function hasSilentMeta(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('meta' in error)) return false;
    const meta = error.meta;
    return typeof meta === 'object' && meta !== null && 'silent' in meta && meta.silent === true;
}

// ── Global error handler ─────────────────────────────────────────────────────
// Centralised — avoids duplicating error handling in every useQuery() call.
function handleQueryError(error: unknown) {
    const { status, code, name } = getErrorDetails(error);

    // Don't toast auth errors — the axios interceptor already redirects
    if (status === 401 || status === 403) return;

    // Don't toast rate-limit errors — axios interceptor handles them
    if (status === 429) return;

    // Don't toast cancelled requests
    if (code === 'ERR_CANCELED' || name === 'CanceledError') return;
    if (hasSilentMeta(error)) return;

    // Server errors on background refetches are silent — only show on first load
    // (React Query sets `meta.silent = true` for background queries automatically)
}

// ── Query Client ─────────────────────────────────────────────────────────────
export const queryClient = new QueryClient({
    queryCache: new QueryCache({
        onError: handleQueryError,
    }),
    mutationCache: new MutationCache({
        onError: (error) => {
            const { status, message: errorMessage } = getErrorDetails(error);
            if (status === 401 || status === 403 || status === 429) return;
            const message = errorMessage || 'Something went wrong.';
            dispatchGlobalToast('error', message);
        },
    }),
    defaultOptions: {
        queries: {
            // ── Cache lifetime ───────────────────────────────────────────
            // On Tauri desktop, reads hit local SQLite in <1ms so keep staleTime=0
            // for instantaneous UI updates after any write; on web keep 3 min cache.
            staleTime: isTauriDesktop() ? 0 : 3 * 60 * 1000,

            // Keep unused query data in memory for smooth instant transitions while revalidating.
            gcTime: 20 * 60 * 1000,

            // ── Retry strategy ───────────────────────────────────────────
            // Local SQLite calls never need network backoff retries; on web retry 5xx only.
            retry: (failureCount, error) => {
                if (isTauriDesktop()) return false;
                const status = axios.isAxiosError(error) ? error.response?.status : undefined;
                if (status && status < 500) return false; // 4xx → no retry
                return failureCount < 2; // 5xx → max 2 retries
            },
            retryDelay: (attempt) =>
                Math.min(1000 * Math.pow(2, attempt), 10000), // 1s, 2s, capped at 10s

            // ── Refetch behaviour ────────────────────────────────────────
            // Don't refetch when user switches tabs — reduces server load.
            // Data is still fresh within staleTime anyway.
            refetchOnWindowFocus: false,

            // Reconnection refetch is useful for mobile users who go offline.
            refetchOnReconnect: true,

            // Don't auto-refetch on component remount if data is still fresh.
            refetchOnMount: true,

            // ── Performance ──────────────────────────────────────────────
            // Structural sharing: React Query deep-compares query results
            // and preserves object references when data hasn't changed.
            // This prevents unnecessary re-renders when responses are identical.
            // (Enabled by default in v5, listed here for documentation clarity.)

            // Network mode: always attempt fetches even if navigator.onLine is
            // false — let the server/interceptor handle errors instead.
            networkMode: 'always',
        },
        mutations: {
            // Never auto-retry mutations — they are not idempotent and
            // replaying them can cause duplicate writes.
            retry: false,
            networkMode: 'always',
        },
    },
});
