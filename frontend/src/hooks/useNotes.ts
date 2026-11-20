import { useQuery } from '@tanstack/react-query';
import api from '@/services/api';

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
            const res = await api.get('/api/notes');
            return res.data?.data || [];
        },
        staleTime: 0,
        refetchOnMount: true,
    });
};
