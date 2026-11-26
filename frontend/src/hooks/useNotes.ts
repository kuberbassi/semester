import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';
import { isDevTestMode, getDevInitialNotes } from '@/utils/devTestData';

export interface TodoItem {
    id: string;
    text: string;
    completed: boolean;
}

export interface Note {
    id: string;
    title: string;
    content: string;
    is_todo: boolean;
    todos: TodoItem[];
    is_pinned: boolean;
    is_archived: boolean;
    created_at: string;
    updated_at: string;
    color?: string;
    category?: string;
}

export const useNotes = () => {
    return useQuery<Note[]>({
        queryKey: ['notes'],
        queryFn: async () => {
            if (isDevTestMode()) {
                const stored = localStorage.getItem('semester_dev_test_notes');
                if (stored) {
                    try { return JSON.parse(stored); } catch {}
                }
                const initial = getDevInitialNotes();
                localStorage.setItem('semester_dev_test_notes', JSON.stringify(initial));
                return initial;
            }
            const res = await api.get('/api/notes');
            return res.data?.data || [];
        },
        staleTime: 0,
        refetchOnMount: true,
    });
};
