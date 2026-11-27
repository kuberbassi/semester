import axios from 'axios';

type ErrorPayload = {
    error?: string;
    message?: string;
};

export const getErrorMessage = (error: unknown, fallback: string): string => {
    if (typeof error === 'string' && error.trim()) {
        return error.trim();
    }
    if (axios.isAxiosError<ErrorPayload>(error)) {
        return error.response?.data?.error || error.response?.data?.message || error.message || fallback;
    }
    if (error instanceof Error && error.message) {
        return error.message;
    }
    if (error && typeof error === 'object') {
        const payload = error as ErrorPayload;
        if (typeof payload.error === 'string' && payload.error.trim()) return payload.error.trim();
        if (typeof payload.message === 'string' && payload.message.trim()) return payload.message.trim();
    }
    return fallback;
};
