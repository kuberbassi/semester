import React, { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Check, Plus, Trash2, ArrowUpRight,
    CheckSquare, FileText, CheckCircle2, Eraser
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNotes } from '@/hooks/useNotes';
import type { TodoItem } from '@/hooks/useNotes';
import { isDevTestMode } from '@/utils/devTestData';
import { notesHttp } from '@/services/notesHttp';
import { haptics } from '@/utils/haptics';

type WidgetTab = 'tasks' | 'notes';

/** Strip HTML tags for clean 1-line note previews. */
function plainPreview(html?: string): string {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Redesigned Apple / OpenTune Liquid Glass Notes & Tasks Widget:
 * - Visual circular progress ring (communicates completion without noisy badges)
 * - Clean icon-based Tasks ↔ Notes switcher
 * - Practical pending-first sorting, inline quick-add, and 1-click Clear Done
 */
export const DashboardTodoWidget: React.FC = () => {
    const { data: notes = [], refetch } = useNotes();
    const [tab, setTab] = useState<WidgetTab>('tasks');
    const [newTodoText, setNewTodoText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const taskNote = notes.find(n => n.is_todo) || notes[0];
    const todos: TodoItem[] = taskNote?.todos || [];
    const regularNotes = useMemo(() => notes.filter(n => !n.is_todo).slice(0, 5), [notes]);

    // Pending tasks first, completed tucked cleanly below
    const sortedTodos = useMemo(() => {
        const pending = todos.filter(t => !t.completed);
        const done = todos.filter(t => t.completed);
        return [...pending, ...done];
    }, [todos]);

    const completedCount = todos.filter(t => t.completed).length;
    const totalCount = todos.length;
    const progressRatio = totalCount > 0 ? completedCount / totalCount : 0;

    const persistTodos = async (updatedTodos: TodoItem[]) => {
        if (isDevTestMode()) {
            const stored = localStorage.getItem('semester_dev_test_notes');
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    const noteIdx = parsed.findIndex((n: any) => n.is_todo || n.id === taskNote?.id);
                    if (noteIdx !== -1) {
                        parsed[noteIdx].todos = updatedTodos;
                        localStorage.setItem('semester_dev_test_notes', JSON.stringify(parsed));
                        refetch();
                    }
                } catch {
                    // ignore
                }
            }
            return;
        }

        if (taskNote?.id) {
            try {
                await notesHttp.put(`/api/notes/${taskNote.id}`, { todos: updatedTodos });
                refetch();
            } catch (err) {
                console.error('Failed to update todos', err);
            }
        }
    };

    const handleToggle = async (todoId: string) => {
        haptics.crownTick();
        const updatedTodos = todos.map(t =>
            t.id === todoId ? { ...t, completed: !t.completed } : t
        );
        await persistTodos(updatedTodos);
    };

    const handleAddTodo = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        const text = newTodoText.trim();
        if (!text || isSubmitting) return;

        setIsSubmitting(true);
        haptics.medium();

        const newTodo: TodoItem = {
            id: `todo-${Date.now()}`,
            text,
            completed: false,
        };
        const updatedTodos = [newTodo, ...todos];

        if (isDevTestMode() || taskNote?.id) {
            await persistTodos(updatedTodos);
            setNewTodoText('');
            setIsSubmitting(false);
            return;
        }

        try {
            await notesHttp.post('/api/notes', {
                title: 'Tasks',
                content: '',
                is_todo: true,
                todos: [newTodo],
            });
            setNewTodoText('');
            refetch();
        } catch (err) {
            console.error('Failed to create task note', err);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleDeleteTodo = async (todoId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        haptics.light();
        await persistTodos(todos.filter(t => t.id !== todoId));
    };

    const handleClearCompleted = async () => {
        if (completedCount === 0) return;
        haptics.medium();
        await persistTodos(todos.filter(t => !t.completed));
    };

    // SVG circular progress ring geometry
    const radius = 9;
    const circumference = 2 * Math.PI * radius;
    const strokeOffset = circumference * (1 - progressRatio);

    return (
        <div className="flex flex-col justify-between h-full">
            <div className="flex min-h-0 flex-1 flex-col">
                {/* Clean Visual Header */}
                <div className="flex items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2.5">
                        {/* Visual Completion Ring */}
                        <div
                            className="relative w-6 h-6 flex items-center justify-center shrink-0"
                            title={`${completedCount} of ${totalCount} completed`}
                        >
                            <svg className="w-6 h-6 -rotate-90" viewBox="0 0 24 24">
                                <circle
                                    cx="12"
                                    cy="12"
                                    r={radius}
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    className="text-on-surface/[0.10]"
                                />
                                <circle
                                    cx="12"
                                    cy="12"
                                    r={radius}
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2.2"
                                    strokeLinecap="round"
                                    strokeDasharray={circumference}
                                    strokeDashoffset={strokeOffset}
                                    className="text-primary transition-all duration-300"
                                />
                            </svg>
                        </div>

                        <h3 className="font-display text-base font-extrabold tracking-tight text-on-surface">
                            {tab === 'tasks' ? 'Quick Tasks' : 'Recent Notes'}
                        </h3>
                        <span className="text-[11px] font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded-full tabular-nums">
                            {tab === 'tasks' ? `${completedCount}/${totalCount}` : regularNotes.length}
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                        {/* Minimal Icon Switcher: Tasks vs Notes */}
                        <div className="inline-flex items-center p-0.5 rounded-full bg-on-surface/[0.06] border border-primary/15">
                            <button
                                type="button"
                                onClick={() => { haptics.crownTick(); setTab('tasks'); }}
                                className={`no-fluid w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                    tab === 'tasks'
                                        ? 'btn-gradient'
                                        : 'text-on-surface-variant hover:text-on-surface'
                                }`}
                                title="Tasks"
                            >
                                <CheckSquare size={13} />
                            </button>
                            <button
                                type="button"
                                onClick={() => { haptics.crownTick(); setTab('notes'); }}
                                className={`no-fluid w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer ${
                                    tab === 'notes'
                                        ? 'btn-gradient'
                                        : 'text-on-surface-variant hover:text-on-surface'
                                }`}
                                title="Recent Notes"
                            >
                                <FileText size={13} />
                            </button>
                        </div>

                        {tab === 'tasks' && completedCount > 0 && (
                            <button
                                type="button"
                                onClick={handleClearCompleted}
                                className="w-7 h-7 rounded-full bg-on-surface/[0.05] hover:bg-on-surface/[0.12] border border-on-surface/[0.08] text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer"
                                title="Clear completed tasks"
                            >
                                <Eraser size={13} />
                            </button>
                        )}

                        <Link
                            to="/notes"
                            className="w-7 h-7 rounded-full bg-on-surface/[0.05] hover:bg-on-surface/[0.12] border border-on-surface/[0.08] text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors"
                            title="Open Notes workspace"
                        >
                            <ArrowUpRight size={14} />
                        </Link>
                    </div>
                </div>

                {tab === 'tasks' ? (
                    <>
                        {/* Sleek Inline Quick-Add Bar */}
                        <form onSubmit={handleAddTodo} className="relative mb-3">
                            <input
                                type="text"
                                value={newTodoText}
                                onChange={(e) => setNewTodoText(e.target.value)}
                                placeholder="Add a quick task…"
                                className="w-full h-9 pl-3.5 pr-9 !rounded-full !bg-on-surface/[0.04] !border-primary/18 focus:!border-primary text-xs text-on-surface placeholder:text-on-surface-variant/50 font-medium"
                            />
                            <button
                                type="submit"
                                disabled={!newTodoText.trim() || isSubmitting}
                                className="no-fluid absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full btn-gradient flex items-center justify-center transition-opacity disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                                title="Add task"
                            >
                                <Plus size={14} strokeWidth={2.5} />
                            </button>
                        </form>

                        {/* Clean Apple Reminders-style Task List */}
                        <div className="min-h-0 flex-1 max-h-[270px] overflow-y-auto custom-scrollbar pr-0.5 space-y-1">
                            {sortedTodos.length > 0 ? (
                                <AnimatePresence initial={false}>
                                    {sortedTodos.map((todo) => (
                                        <motion.div
                                            key={todo.id}
                                            initial={{ opacity: 0, y: -3 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, height: 0 }}
                                            transition={{ duration: 0.14 }}
                                            onClick={() => handleToggle(todo.id)}
                                            className={`group flex items-center gap-3 px-3 py-2 rounded-2xl transition-colors cursor-pointer ${
                                                todo.completed
                                                    ? 'opacity-45 hover:opacity-70'
                                                    : 'bg-on-surface/[0.03] hover:bg-on-surface/[0.07]'
                                            }`}
                                        >
                                            {/* Circular Apple-style Checkbox */}
                                            <div
                                                className={`w-[18px] h-[18px] rounded-full border flex items-center justify-center transition-all shrink-0 ${
                                                    todo.completed
                                                        ? 'bg-primary border-primary text-on-primary'
                                                        : 'border-on-surface/25 group-hover:border-primary/60'
                                                }`}
                                            >
                                                {todo.completed && <Check size={11} strokeWidth={3} />}
                                            </div>

                                            <span
                                                className={`text-xs font-medium flex-1 leading-snug select-none truncate ${
                                                    todo.completed
                                                        ? 'line-through text-on-surface-variant'
                                                        : 'text-on-surface'
                                                }`}
                                            >
                                                {todo.text}
                                            </span>

                                            <button
                                                type="button"
                                                onClick={(e) => handleDeleteTodo(todo.id, e)}
                                                className="opacity-0 group-hover:opacity-100 p-1 rounded-full text-on-surface-variant/50 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0 cursor-pointer"
                                                title="Delete task"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </motion.div>
                                    ))}
                                </AnimatePresence>
                            ) : (
                                <div className="py-12 flex flex-col items-center justify-center gap-2 text-center">
                                    <CheckCircle2 size={22} className="text-primary/50" />
                                    <p className="text-xs font-medium text-on-surface-variant/50">
                                        All clear
                                    </p>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    /* Recent Notes Quick Preview */
                    <div className="min-h-0 flex-1 max-h-[310px] overflow-y-auto custom-scrollbar pr-0.5 space-y-1.5">
                        {regularNotes.length > 0 ? (
                            regularNotes.map((note) => {
                                const snippet = plainPreview(note.content);
                                return (
                                    <Link
                                        key={note.id}
                                        to="/notes"
                                        className="block px-3.5 py-2.5 rounded-2xl bg-on-surface/[0.03] hover:bg-on-surface/[0.07] border border-on-surface/[0.05] transition-colors"
                                    >
                                        <p className="text-xs font-semibold text-on-surface truncate">
                                            {note.title || 'Untitled Note'}
                                        </p>
                                        {snippet && (
                                            <p className="text-[11px] text-on-surface-variant/65 truncate mt-0.5">
                                                {snippet}
                                            </p>
                                        )}
                                    </Link>
                                );
                            })
                        ) : (
                            <div className="py-12 flex flex-col items-center justify-center gap-2 text-center">
                                <FileText size={22} className="text-on-surface-variant/30" />
                                <p className="text-xs font-medium text-on-surface-variant/50">
                                    No notes yet
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
