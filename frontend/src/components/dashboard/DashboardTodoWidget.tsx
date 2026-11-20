import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Plus, Trash2, ListTodo, ChevronRight, CheckCircle2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useNotes } from '@/hooks/useNotes';
import type { TodoItem } from '@/hooks/useNotes';
import { isDevTestMode } from '@/utils/devTestData';
import api from '@/services/api';
import { haptics } from '@/utils/haptics';

export const DashboardTodoWidget: React.FC = () => {
    const { data: notes = [], refetch } = useNotes();
    const [newTodoText, setNewTodoText] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Find the primary task note (or fallback to empty list)
    const taskNote = notes.find(n => n.is_todo) || notes[0];
    const todos: TodoItem[] = taskNote?.todos || [];

    const completedCount = todos.filter(t => t.completed).length;
    const totalCount = todos.length;
    const pendingCount = totalCount - completedCount;

    // Toggle todo status
    const handleToggle = async (todoId: string) => {
        haptics.selection();
        const updatedTodos = todos.map(t =>
            t.id === todoId ? { ...t, completed: !t.completed } : t
        );

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
                } catch {}
            }
            return;
        }

        if (taskNote?.id) {
            try {
                await api.put(`/api/notes/${taskNote.id}`, { todos: updatedTodos });
                refetch();
            } catch (err) {
                console.error('Failed to update todo', err);
            }
        }
    };

    // Add new todo inline
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

        if (isDevTestMode()) {
            const stored = localStorage.getItem('semester_dev_test_notes');
            if (stored) {
                try {
                    const parsed = JSON.parse(stored);
                    const noteIdx = parsed.findIndex((n: any) => n.is_todo || n.id === taskNote?.id);
                    if (noteIdx !== -1) {
                        parsed[noteIdx].todos = updatedTodos;
                        localStorage.setItem('semester_dev_test_notes', JSON.stringify(parsed));
                    }
                } catch {}
            }
            setNewTodoText('');
            setIsSubmitting(false);
            refetch();
            return;
        }

        if (taskNote?.id) {
            try {
                await api.put(`/api/notes/${taskNote.id}`, { todos: updatedTodos });
                setNewTodoText('');
                refetch();
            } catch (err) {
                console.error('Failed to create todo', err);
            } finally {
                setIsSubmitting(false);
            }
        } else {
            // Create initial task note if none exists
            try {
                await api.post('/api/notes', {
                    title: 'My Tasks',
                    content: '',
                    is_todo: true,
                    todos: [newTodo],
                });
                setNewTodoText('');
                refetch();
            } catch (err) {
                console.error('Failed to init task note', err);
            } finally {
                setIsSubmitting(false);
            }
        }
    };

    // Delete single todo
    const handleDeleteTodo = async (todoId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        haptics.light();
        const updatedTodos = todos.filter(t => t.id !== todoId);

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
                } catch {}
            }
            return;
        }

        if (taskNote?.id) {
            try {
                await api.put(`/api/notes/${taskNote.id}`, { todos: updatedTodos });
                refetch();
            } catch (err) {
                console.error('Failed to delete todo', err);
            }
        }
    };

    return (
        <div className="flex flex-col justify-between md:h-full">
            <div className="flex min-h-0 flex-1 flex-col">
                {/* Header Strip */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                        <span className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
                            <ListTodo size={14} />
                        </span>
                        <span className="text-[10px] font-extrabold uppercase tracking-widest text-on-surface-variant/60">
                            Tasks & Assignments
                        </span>
                    </div>

                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-surface-container/60 border border-white/[0.08] text-[10px] font-mono font-bold">
                        <span className={pendingCount === 0 ? 'text-emerald-400' : 'text-cyan-400'}>
                            {pendingCount === 0 ? 'All Done' : `${pendingCount} Left`}
                        </span>
                        <span className="text-on-surface-variant/30">/</span>
                        <span className="text-on-surface-variant/50">{totalCount}</span>
                    </div>
                </div>

                {/* Inline Quick Add Input */}
                <form onSubmit={handleAddTodo} className="relative mb-3">
                    <input
                        type="text"
                        value={newTodoText}
                        onChange={(e) => setNewTodoText(e.target.value)}
                        placeholder="Add task or deadline... (Enter)"
                        className="w-full h-9 pl-3 pr-8 rounded-xl bg-surface-container/30 border border-white/[0.08] hover:border-white/[0.15] focus:border-indigo-500/50 focus:outline-none text-xs text-on-surface placeholder:text-on-surface-variant/30 transition-all font-medium"
                    />
                    <button
                        type="submit"
                        disabled={!newTodoText.trim() || isSubmitting}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-400 flex items-center justify-center transition-all disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                    >
                        <Plus size={14} />
                    </button>
                </form>

                {/* Scrollable Todo List */}
                <div className="my-1 min-h-0 flex-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-1 space-y-2">
                    {todos.length > 0 ? (
                        <AnimatePresence initial={false}>
                            {todos.map((todo) => (
                                <motion.div
                                    key={todo.id}
                                    layout
                                    initial={{ opacity: 0, y: -6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, height: 0 }}
                                    transition={{ duration: 0.18 }}
                                    onClick={() => handleToggle(todo.id)}
                                    className={`group flex items-center gap-3 p-2.5 rounded-xl border transition-all cursor-pointer ${
                                        todo.completed
                                            ? 'bg-surface-container/10 border-white/[0.04] opacity-50'
                                            : 'bg-surface-container/30 border-white/[0.08] hover:border-white/[0.16] hover:bg-surface-container/50'
                                    }`}
                                >
                                    {/* Tactile Checkbox */}
                                    <div
                                        className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                                            todo.completed
                                                ? 'bg-emerald-500 border-emerald-500 text-black shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                                                : 'border-white/20 group-hover:border-white/40'
                                        }`}
                                    >
                                        {todo.completed && <Check size={11} strokeWidth={3} />}
                                    </div>

                                    {/* Text */}
                                    <span
                                        className={`text-xs font-semibold flex-1 leading-snug transition-all select-none truncate ${
                                            todo.completed
                                                ? 'line-through text-on-surface-variant/40'
                                                : 'text-on-surface'
                                        }`}
                                    >
                                        {todo.text}
                                    </span>

                                    {/* Delete Button on Hover */}
                                    <button
                                        type="button"
                                        onClick={(e) => handleDeleteTodo(todo.id, e)}
                                        className="opacity-0 group-hover:opacity-100 p-1 rounded-md text-on-surface-variant/40 hover:text-rose-400 hover:bg-rose-500/10 transition-all shrink-0 cursor-pointer"
                                    >
                                        <Trash2 size={12} />
                                    </button>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    ) : (
                        <div className="py-8 text-center flex flex-col items-center justify-center gap-2">
                            <CheckCircle2 size={24} className="text-emerald-400/40" />
                            <p className="text-xs font-semibold text-on-surface-variant/40">
                                All tasks completed! You're ahead of schedule.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Bottom Navigation Button */}
            <div className="border-t border-outline/30 pt-3 mt-3 shrink-0">
                <Link
                    to="/notes"
                    className="w-full h-9 flex items-center justify-center gap-1.5 border border-white/[0.08] hover:border-white/[0.18] hover:bg-surface-container/50 rounded-xl text-xs font-bold text-on-surface transition-all cursor-pointer shadow-sm"
                >
                    Open Full Notes & Tasks
                    <ChevronRight size={13} />
                </Link>
            </div>
        </div>
    );
};
