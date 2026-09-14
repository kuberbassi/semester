import axios from 'axios';

type ErrorPayload = {
    error?: string;
    message?: string;
};

export const getErrorMessage = (error: unknown, fallback: string): string => {
    if (axios.isAxiosError<ErrorPayload>(error)) {
        return error.response?.data?.error || error.response?.data?.message || error.message || fallback;
    }
    return error instanceof Error && error.message ? error.message : fallback;
};
