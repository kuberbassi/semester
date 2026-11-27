import api from './api';
import { isTauriDesktop } from '@/utils/platform';
import { desktopDb } from './desktopDb';
import type { Note } from '@/hooks/useNotes';

/**
 * Notes/tasks transport. Desktop → local SQLite (instant, crash-safe, auto-synced to Drive).
 * Web → REST. Mimics the axios `{ data: { data } }` shape so existing call sites stay unchanged.
 */
const wrap = <T,>(data: T) => ({ data: { data } });
const idFrom = (url: string) => url.split('/api/notes/')[1]?.split('?')[0] || '';

export const notesHttp = {
    get: async (url: string) => {
        if (!isTauriDesktop()) return api.get(url);
        return wrap(await desktopDb.getNotes());
    },
    post: async (url: string, body: Partial<Note>) => {
        if (!isTauriDesktop()) return api.post(url, body);
        return wrap(await desktopDb.saveNote(body));
    },
    put: async (url: string, fields: Partial<Note>) => {
        if (!isTauriDesktop()) return api.put(url, fields);
        const id = idFrom(url);
        const existing = (await desktopDb.getNotes()).find((n) => String(n.id) === id);
        return wrap(await desktopDb.saveNote({ ...(existing || {}), ...fields, id }));
    },
    delete: async (url: string) => {
        if (!isTauriDesktop()) return api.delete(url);
        return wrap(await desktopDb.deleteNote(idFrom(url)));
    },
};
