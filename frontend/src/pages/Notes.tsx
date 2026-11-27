import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
    StickyNote, ListTodo, Plus, Trash2, Pin,
    CheckCircle2, Circle, X, GripVertical, Pencil,
    Check, Eye, Bold, Italic, Underline as UnderlineIcon,
    AlignLeft, AlignCenter, AlignRight, List, ListOrdered,
    Image as ImageIcon, MoreHorizontal, RotateCcw, PenTool, Bot,
    GraduationCap, CalendarClock, BellRing
} from 'lucide-react';
import { useToast } from '@/components/ui/toast-context';
import { HoldButton, RubberSegment, CometDial } from '@/components/react-bits';
import PageHeader from '@/components/ui/PageHeader';
import api from '@/services/api';
import { notesHttp } from '@/services/notesHttp';
import { attendanceService } from '@/services/attendance.service';
import { useSemester } from '@/contexts/semester-context';
import type { Subject } from '@/types';
import { useQueryClient } from '@tanstack/react-query';
import { useConfirm } from '@/contexts/confirm-context';
import { isDevTestMode, loadDevNotes, saveDevNotes } from '@/utils/devTestData';
import { isTauriDesktop } from '@/utils/platform';
import { desktopDb } from '@/services/desktopDb';

// ── dnd-kit ──────────────────────────────────────────────────────────────────
import {
    DndContext, closestCenter, PointerSensor, TouchSensor,
    useSensor, useSensors, type DragEndEvent
} from '@dnd-kit/core';
import {
    arrayMove, SortableContext, verticalListSortingStrategy, useSortable
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// ── Tiptap ───────────────────────────────────────────────────────────────────
import { useEditor, EditorContent, Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ImageExtension from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import UnderlineExtension from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Youtube from '@tiptap/extension-youtube';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface TodoItem {
    id: string;
    text: string;
    completed: boolean;
    subject?: string;
    exam_date?: string;
}

interface ExamCountdown {
    daysLeft: number;
    label: string;
    formatted: string;
    pillClass: string;
}

function getExamCountdown(isoDate?: string): ExamCountdown | null {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate.trim())) return null;
    const [y, m, d] = isoDate.trim().split('-').map(Number);
    const examDay = new Date(y, m - 1, d);
    if (Number.isNaN(examDay.getTime())) return null;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const daysLeft = Math.round((examDay.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    const formatted = examDay.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    if (daysLeft < 0) {
        return { daysLeft, label: 'Passed', formatted, pillClass: 'bg-on-surface/10 text-on-surface-variant' };
    }
    if (daysLeft === 0) {
        return { daysLeft, label: 'Today!', formatted, pillClass: 'bg-rose-500/20 text-rose-500 border border-rose-500/35' };
    }
    if (daysLeft === 1) {
        return { daysLeft, label: 'Tomorrow', formatted, pillClass: 'bg-amber-500/20 text-amber-500 border border-amber-500/35' };
    }
    if (daysLeft <= 3) {
        return { daysLeft, label: `In ${daysLeft}d`, formatted, pillClass: 'bg-amber-500/15 text-amber-500 border border-amber-500/25' };
    }
    return { daysLeft, label: `In ${daysLeft}d`, formatted, pillClass: 'bg-primary/15 text-primary border border-primary/25' };
}

interface Note {
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

// ─────────────────────────────────────────────────────────────────────────────
// Sortable Todo Row
// ─────────────────────────────────────────────────────────────────────────────

interface SortableTodoProps {
    todo: TodoItem;
    editMode: boolean;
    onToggle: (id: string) => void;
    onDelete: (id: string) => void;
    onEdit: (id: string, text: string) => void;
}

const SortableTodoRow: React.FC<SortableTodoProps> = ({ todo, editMode, onToggle, onDelete, onEdit }) => {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: todo.id });
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(todo.text);
    const inputRef = useRef<HTMLInputElement>(null);

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
    };

    const commitEdit = () => {
        if (draft.trim() && draft.trim() !== todo.text) {
            onEdit(todo.id, draft.trim());
        } else {
            setDraft(todo.text);
        }
        setEditing(false);
    };

    useEffect(() => {
        if (editing) inputRef.current?.focus();
    }, [editing]);

    const examInfo = getExamCountdown(todo.exam_date);

    return (
        <div ref={setNodeRef} style={style} className="flex items-center gap-2.5 group/row py-2 px-2.5 rounded-xl hover:bg-surface-container/35 transition-colors">
            {/* Drag handle — only in edit mode */}
            {editMode && (
                <span
                    {...attributes}
                    {...listeners}
                    className="text-on-surface-variant/25 hover:text-on-surface-variant/70 cursor-grab active:cursor-grabbing shrink-0 touch-none"
                >
                    <GripVertical size={14} />
                </span>
            )}

            {/* Checkbox */}
            <button
                onClick={() => !editMode && onToggle(todo.id)}
                className={`shrink-0 transition-colors ${todo.completed ? 'text-primary' : 'text-on-surface-variant/35 hover:text-primary'} ${editMode ? 'pointer-events-none' : 'cursor-pointer'}`}
            >
                {todo.completed
                    ? <CheckCircle2 size={17} className="fill-primary/10" />
                    : <Circle size={17} />
                }
            </button>

            {/* Text / Exam details / inline edit */}
            {editing ? (
                <input
                    ref={inputRef}
                    value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={commitEdit}
                    onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') { setDraft(todo.text); setEditing(false); } }}
                    className="flex-1 text-sm bg-transparent outline-none border-b border-on-surface focus:border-primary transition-colors py-0.5"
                />
            ) : (
                <div
                    onDoubleClick={() => editMode && setEditing(true)}
                    className="flex-1 min-w-0 select-none"
                >
                    <div className="flex items-center gap-2 flex-wrap">
                        {todo.subject && (
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full bg-primary/14 text-primary shrink-0 ${todo.completed ? 'opacity-45 line-through' : ''}`}>
                                {todo.subject}
                            </span>
                        )}
                        <span className={`text-sm leading-snug transition-all ${todo.completed ? 'line-through text-on-surface-variant/35' : 'text-on-surface font-medium'}`}>
                            {todo.text}
                        </span>
                    </div>
                    {examInfo && (
                        <div className="flex items-center gap-2 mt-1 text-[11px] text-on-surface-variant">
                            <CalendarClock size={11} className="text-primary/80 shrink-0" />
                            <span>{examInfo.formatted}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Exam countdown badge */}
            {!editing && examInfo && !todo.completed && (
                <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shrink-0 tabular-nums ${examInfo.pillClass}`}>
                    {examInfo.label}
                </span>
            )}

            {/* Actions */}
            {!editing && (
                <div className={`flex items-center gap-1 shrink-0 transition-opacity ${editMode ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'}`}>
                    {editMode && (
                        <button onClick={() => setEditing(true)} className="p-1 text-on-surface-variant/50 hover:text-on-surface rounded transition-colors cursor-pointer" title="Rename">
                            <Pencil size={12} />
                        </button>
                    )}
                    <button onClick={() => onDelete(todo.id)} className="p-1 text-on-surface-variant/45 hover:text-rose-500 rounded transition-colors cursor-pointer" title="Remove">
                        <X size={13} />
                    </button>
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Tiptap Toolbar
// ─────────────────────────────────────────────────────────────────────────────

const ToolbarBtn: React.FC<{ active?: boolean; onClick: () => void; title?: string; children: React.ReactNode }> = ({ active, onClick, title, children }) => (
    <button
        type="button"
        title={title}
        onClick={onClick}
        className={`no-fluid w-8 h-8 rounded-xl inline-flex items-center justify-center transition-colors cursor-pointer ${
            active
                ? 'bg-primary/18 text-primary border border-primary/30'
                : 'text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.07] border border-transparent'
        }`}
    >
        {children}
    </button>
);

interface NoteToolbarProps {
    editor: Editor;
    loadingAi: boolean;
    hasAiDraft: boolean;
    onAiAction: (action: 'reformat' | 'improve' | 'custom', customPrompt?: string) => void;
    onAiUndo: () => void;
    onAiKeep: () => void;
}

const NoteToolbar: React.FC<NoteToolbarProps> = ({
    editor,
    loadingAi,
    hasAiDraft,
    onAiAction,
    onAiUndo,
    onAiKeep
}) => {
    const imgInputRef = useRef<HTMLInputElement>(null);
    const [showAiMenu, setShowAiMenu] = useState(false);
    const [menuPromptText, setMenuPromptText] = useState('');
    const [bannerPromptText, setBannerPromptText] = useState('');

    const insertImage = (file: File) => {
        const reader = new FileReader();
        reader.onload = e => {
            const src = e.target?.result as string;
            if (src) editor.chain().focus().setImage({ src }).run();
        };
        reader.readAsDataURL(file);
    };

    return (
        <div className="flex flex-col border-t border-outline pt-2 mt-2 gap-2">
            {/* AI Banner / Status bar */}
            {hasAiDraft && (
                <div className="flex flex-col bg-primary/5 border border-primary/20 rounded-lg p-2.5 gap-2 animate-fadeIn">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-primary text-[10px] font-bold uppercase tracking-wider">
                            <Bot size={13} />
                            AI Draft Generated
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={onAiUndo}
                                className="flex items-center gap-1 px-2 py-1 rounded bg-surface hover:bg-surface-container border border-outline text-[10px] font-bold text-on-surface transition-all cursor-pointer"
                            >
                                <RotateCcw size={10} />
                                Undo
                            </button>
                            <button
                                type="button"
                                onClick={onAiKeep}
                                className="flex items-center gap-1 px-2 py-1 rounded bg-primary text-surface hover:bg-primary/90 text-[10px] font-bold transition-all cursor-pointer"
                            >
                                <Check size={10} />
                                Keep
                            </button>
                        </div>
                    </div>

                    {/* Custom Refinement Input */}
                    <form
                        onSubmit={(e) => {
                            e.preventDefault();
                            const val = bannerPromptText.trim();
                            if (val) {
                                onAiAction('custom', val);
                                setBannerPromptText('');
                            }
                        }}
                        className="flex flex-col gap-1 w-full mt-0.5"
                    >
                        <span className="text-[9px] font-bold text-on-surface-variant/50 uppercase tracking-wider px-0.5">
                            Give Prompt for Improvements
                        </span>
                        <div className="flex items-center gap-2 border border-outline bg-surface rounded-md px-2.5 py-1 focus-within:border-primary/50 transition-colors">
                            <input
                                type="text"
                                value={bannerPromptText}
                                onChange={(e) => setBannerPromptText(e.target.value)}
                                placeholder="e.g., make it more concise, bold key dates, format as list..."
                                disabled={loadingAi}
                                className="flex-1 text-[11px] bg-transparent outline-none border-none focus:ring-0 placeholder:text-on-surface-variant/30 py-0.5"
                            />
                            <button
                                type="submit"
                                disabled={loadingAi || !bannerPromptText.trim()}
                                className="text-[10px] font-bold text-primary hover:text-primary/80 disabled:opacity-35 transition-colors cursor-pointer"
                            >
                                Apply
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="flex items-center justify-between flex-wrap gap-1">
                <div className="flex items-center gap-0.5 flex-wrap">
                    <ToolbarBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold"><Bold size={13} /></ToolbarBtn>
                    <ToolbarBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic"><Italic size={13} /></ToolbarBtn>
                    <ToolbarBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline"><UnderlineIcon size={13} /></ToolbarBtn>
                    <div className="w-px h-4 bg-outline mx-1" />
                    <ToolbarBtn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Left"><AlignLeft size={13} /></ToolbarBtn>
                    <ToolbarBtn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Center"><AlignCenter size={13} /></ToolbarBtn>
                    <ToolbarBtn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Right"><AlignRight size={13} /></ToolbarBtn>
                    <div className="w-px h-4 bg-outline mx-1" />
                    <ToolbarBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet list"><List size={13} /></ToolbarBtn>
                    <ToolbarBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Numbered list"><ListOrdered size={13} /></ToolbarBtn>
                    <div className="w-px h-4 bg-outline mx-1" />
                    <ToolbarBtn onClick={() => imgInputRef.current?.click()} title="Insert image"><ImageIcon size={13} /></ToolbarBtn>
                    <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) insertImage(f); e.target.value = ''; }} />
                    <div className="w-px h-4 bg-outline mx-1" />
                    <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} title="Undo"><RotateCcw size={13} /></ToolbarBtn>
                </div>

                <div className="relative shrink-0">
                    <button
                        type="button"
                        onClick={() => !loadingAi && setShowAiMenu(m => !m)}
                        disabled={loadingAi}
                        className={`no-fluid h-8 px-3.5 rounded-full border text-xs font-bold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                            loadingAi
                                ? 'bg-on-surface/[0.05] border-on-surface/[0.09] text-on-surface-variant/45 cursor-not-allowed'
                                : showAiMenu
                                    ? 'btn-gradient border-transparent'
                                    : 'bg-on-surface/[0.04] border-on-surface/[0.11] text-on-surface-variant hover:text-primary hover:border-primary/35 hover:bg-primary/10'
                        }`}
                    >
                        {loadingAi ? (
                            <>
                                <div className="w-3 h-3 rounded-full border-2 border-primary/25 border-t-primary animate-spin" />
                                Processing…
                            </>
                        ) : (
                            <>
                                <PenTool size={12} />
                                AI Writer
                            </>
                        )}
                    </button>

                    {showAiMenu && !loadingAi && (
                        <div className="fixed bottom-16 left-4 right-4 md:absolute md:bottom-full md:right-0 md:left-auto md:w-72 md:mb-2.5 z-50 liquid-glass-overlay rounded-2xl overflow-hidden">
                            <div className="h-[2px] w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400" />
                            <div className="p-2.5 flex flex-col gap-2">
                                <div className="flex flex-col gap-0.5">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowAiMenu(false);
                                            onAiAction('reformat');
                                        }}
                                        className="no-fluid w-full text-left px-3 py-2 text-xs font-semibold text-on-surface hover:bg-primary/12 hover:text-primary rounded-xl transition-colors cursor-pointer"
                                    >
                                        Re-format Spacing
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowAiMenu(false);
                                            onAiAction('improve');
                                        }}
                                        className="no-fluid w-full text-left px-3 py-2 text-xs font-semibold text-on-surface hover:bg-primary/12 hover:text-primary rounded-xl transition-colors cursor-pointer"
                                    >
                                        Improve Writing
                                    </button>
                                </div>
                                <div className="h-px bg-on-surface/[0.08]" />
                                <form
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        const val = menuPromptText.trim();
                                        if (val) {
                                            setShowAiMenu(false);
                                            onAiAction('custom', val);
                                            setMenuPromptText('');
                                        }
                                    }}
                                    className="flex flex-col gap-2 px-0.5 pb-0.5"
                                >
                                    <span className="text-[10px] font-bold text-on-surface-variant/70 uppercase tracking-wider px-1">Custom Prompt</span>
                                    <div className="flex items-center gap-1.5">
                                        <input
                                            type="text"
                                            value={menuPromptText}
                                            onChange={(e) => setMenuPromptText(e.target.value)}
                                            placeholder="Summarize, make bullets…"
                                            className="flex-1 min-w-0 h-8 px-3 rounded-xl bg-on-surface/[0.05] border border-on-surface/[0.11] text-xs text-on-surface placeholder:text-on-surface-variant/50 focus:outline-none focus:border-primary"
                                        />
                                        <button
                                            type="submit"
                                            disabled={!menuPromptText.trim()}
                                            className="no-fluid h-8 px-3 rounded-xl btn-gradient text-[11px] font-bold disabled:opacity-35 shrink-0 cursor-pointer"
                                        >
                                            Run
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Rich Note Editor panel
// ─────────────────────────────────────────────────────────────────────────────

const isMarkdown = (t: string): boolean => {
    return /^\s*(#|\*|-|\d+\.)/m.test(t) || t.includes('**') || t.includes('__') || t.includes('`') || t.includes('[ ]') || t.includes('[x]');
};

const parseInlineMarkdown = (text: string): string => {
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    // Bold
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

    // Italic
    html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
    html = html.replace(/_(.*?)_/g, '<em>$1</em>');

    // Code
    html = html.replace(/`(.*?)`/g, '<code>$1</code>');

    // Links [text](url)
    html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2">$1</a>');

    return html;
};

const convertMarkdownToHtml = (markdown: string): string => {
    const lines = markdown.split(/\r?\n/);
    let html = '';
    let inList = false;
    let listType = ''; // 'ul' or 'ol' or 'taskList'

    const closeList = () => {
        if (inList) {
            html += `</${listType}>`;
            inList = false;
            listType = '';
        }
    };

    for (let line of lines) {
        // Headers
        const headerMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (headerMatch) {
            closeList();
            const level = headerMatch[1].length;
            html += `<h${level}>${parseInlineMarkdown(headerMatch[2])}</h${level}>`;
            continue;
        }

        // Checkbox bullet lists (Task List)
        const taskMatch = line.match(/^(\*|-)\s+\[([ xX])\]\s+(.*)$/);
        if (taskMatch) {
            if (!inList || listType !== 'taskList') {
                closeList();
                html += '<ul data-type="taskList">';
                inList = true;
                listType = 'taskList';
            }
            const isChecked = taskMatch[2].toLowerCase() === 'x';
            html += `<li data-type="taskItem" data-checked="${isChecked}">${isChecked ? '<label><input type="checkbox" checked="checked"></label>' : '<label><input type="checkbox"></label>'}<div>${parseInlineMarkdown(taskMatch[3])}</div></li>`;
            continue;
        }

        // Bullet lists
        const bulletMatch = line.match(/^(\*|-)\s+(.*)$/);
        if (bulletMatch) {
            if (!inList || listType !== 'ul') {
                closeList();
                html += '<ul>';
                inList = true;
                listType = 'ul';
            }
            html += `<li>${parseInlineMarkdown(bulletMatch[2])}</li>`;
            continue;
        }

        // Ordered lists
        const orderedMatch = line.match(/^(\d+)\.\s+(.*)$/);
        if (orderedMatch) {
            if (!inList || listType !== 'ol') {
                closeList();
                html += '<ol>';
                inList = true;
                listType = 'ol';
            }
            html += `<li>${parseInlineMarkdown(orderedMatch[2])}</li>`;
            continue;
        }

        // Empty line
        if (!line.trim()) {
            closeList();
            html += '<p></p>';
            continue;
        }

        // Paragraph line
        closeList();
        html += `<p>${parseInlineMarkdown(line)}</p>`;
    }

    closeList();
    return html;
};

interface NoteEditorProps {
    note: Note;
    onUpdate: (fields: Partial<Note>) => void;
    onDelete: () => void;
    onClose: () => void;
    onTogglePin: () => void;
}

const NoteEditor: React.FC<NoteEditorProps> = ({ note, onUpdate, onDelete, onClose, onTogglePin }) => {
    const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' ? window.innerWidth < 1024 : false);
    const [readMode, setReadMode] = useState(!note.id.startsWith('temp-'));
    const [loadingAi, setLoadingAi] = useState(false);
    const [hasAiDraft, setHasAiDraft] = useState(false);
    const [prevContent, setPrevContent] = useState<string | null>(null);
    const { showToast } = useToast();

    const handleAiAction = async (action: 'reformat' | 'improve' | 'custom', customPrompt?: string) => {
        if (!editor) return;
        const currentHtml = editor.getHTML();
        if (!currentHtml || currentHtml === '<p></p>') {
            showToast('error', 'Note is empty. Add some text first.');
            return;
        }

        setLoadingAi(true);
        try {
            if (isTauriDesktop()) {
                const res = await desktopDb.aiProcessNote(currentHtml, action, customPrompt);
                const processed = res?.processedContent;
                if (processed) {
                    if (!hasAiDraft) setPrevContent(currentHtml);
                    editor.commands.setContent(processed);
                    setHasAiDraft(true);
                    showToast('success', 'AI draft ready — Keep or Undo below');
                } else {
                    showToast('error', 'AI returned empty content');
                }
                return;
            }
            if (isDevTestMode()) {
                if (!hasAiDraft) setPrevContent(currentHtml);
                const plain = editor.getText().trim();
                const lines = plain.split(/\n+/).map(l => l.trim()).filter(Boolean);
                let processed = currentHtml;
                if (action === 'reformat') {
                    processed = lines.map(l => `<p>${l}</p>`).join('');
                } else if (action === 'improve') {
                    processed = `<h3>Refined Notes</h3><ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>`;
                } else {
                    processed = `<p><strong>AI Focus (${customPrompt || 'Summary'}):</strong></p><ul>${lines.map(l => `<li>${l}</li>`).join('')}</ul>`;
                }
                await new Promise(r => setTimeout(r, 260));
                editor.commands.setContent(processed);
                setHasAiDraft(true);
                showToast('success', 'AI draft ready — Keep or Undo below');
                return;
            }
            const res = await api.post('/api/ai/process_note', { content: currentHtml, action, customPrompt });
            const processed = res.data?.data?.processedContent;
            if (processed) {
                if (!hasAiDraft) {
                    setPrevContent(currentHtml);
                }
                editor.commands.setContent(processed);
                setHasAiDraft(true);
                showToast('success', 'AI draft updated. Review the changes!');
            } else {
                showToast('error', 'AI returned empty content');
            }
        } catch (err: any) {
            console.error('[ai process error]', err);
            showToast('error', err.response?.data?.error || 'Failed to process note');
        } finally {
            setLoadingAi(false);
        }
    };

    const handleAiUndo = () => {
        if (prevContent && editor) {
            editor.commands.setContent(prevContent);
            showToast('success', 'AI draft reverted');
        }
        setHasAiDraft(false);
        setPrevContent(null);
    };

    const handleAiKeep = () => {
        setHasAiDraft(false);
        setPrevContent(null);
        showToast('success', 'AI suggestion accepted');
    };

    const editor = useEditor({
        extensions: [
            StarterKit,
            UnderlineExtension,
            TextAlign.configure({ types: ['heading', 'paragraph'] }),
            ImageExtension.configure({ inline: false, allowBase64: true }),
            Placeholder.configure({ placeholder: 'Start writing…' }),
            Link.configure({
                openOnClick: 'whenNotEditable',
                autolink: true,
                defaultProtocol: 'https',
                HTMLAttributes: {
                    class: 'text-primary underline cursor-pointer hover:text-primary/80',
                    target: '_blank',
                    rel: 'noopener noreferrer',
                },
            }),
            Youtube.configure({
                controls: true,
                nocookie: true,
                allowFullscreen: true,
                HTMLAttributes: {
                    class: 'w-full aspect-video rounded-lg my-3 border border-outline shadow-sm',
                },
            }),
            TaskList.configure({
                HTMLAttributes: {
                    class: 'not-prose list-none pl-0 my-3 space-y-1',
                },
            }),
            TaskItem.configure({
                HTMLAttributes: {
                    class: 'flex items-start gap-2 checkbox-item',
                },
                nested: true,
            }),
        ],
        content: note.content || '',
        editable: !readMode,
        onUpdate: ({ editor }) => {
            onUpdate({ content: editor.getHTML() });
        },
        editorProps: {
            handlePaste(view, event) {
                const text = event.clipboardData?.getData('text/plain');
                if (text && isMarkdown(text)) {
                    event.preventDefault();
                    const html = convertMarkdownToHtml(text);
                    const dom = new DOMParser().parseFromString(html, 'text/html');
                    const parser = view.state.schema.cached.domParser;
                    const slice = parser.parseSlice(dom.body);
                    const transaction = view.state.tr.replaceSelection(slice);
                    view.dispatch(transaction);
                    return true;
                }
                return false;
            }
        }
    });

    // Sync read mode with editor editability
    useEffect(() => {
        editor?.setEditable(!readMode);
    }, [readMode, editor]);

    // Sync content when switching notes
    useEffect(() => {
        if (editor && editor.getHTML() !== note.content) {
            editor.commands.setContent(note.content || '', { emitUpdate: false });
        }
        setHasAiDraft(false);
        setPrevContent(null);
        setReadMode(!note.id.startsWith('temp-'));
    }, [note.id]);

    // Keep track of latest AI draft state in refs for the unmount/switching cleanup function
    const hasAiDraftRef = useRef(hasAiDraft);
    const prevContentRef = useRef(prevContent);

    useEffect(() => {
        hasAiDraftRef.current = hasAiDraft;
    }, [hasAiDraft]);

    useEffect(() => {
        prevContentRef.current = prevContent;
    }, [prevContent]);

    // Auto-revert AI draft if editor is closed or note is switched without explicitly accepting it
    useEffect(() => {
        return () => {
            if (hasAiDraftRef.current && prevContentRef.current) {
                onUpdate({ content: prevContentRef.current });
            }
        };
    }, [note.id, onUpdate]);

    // Paste / drop images
    useEffect(() => {
        if (!editor) return;
        const el = editor.view.dom as HTMLElement;

        const handlePaste = (e: ClipboardEvent) => {
            const files = Array.from(e.clipboardData?.files || []).filter(f => f.type.startsWith('image/'));
            if (!files.length) return;
            e.preventDefault();
            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = ev => {
                    const src = ev.target?.result as string;
                    if (src) editor.chain().focus().setImage({ src }).run();
                };
                reader.readAsDataURL(file);
            });
        };

        const handleDrop = (e: DragEvent) => {
            const files = Array.from(e.dataTransfer?.files || []).filter(f => f.type.startsWith('image/'));
            if (!files.length) return;
            e.preventDefault();
            files.forEach(file => {
                const reader = new FileReader();
                reader.onload = ev => {
                    const src = ev.target?.result as string;
                    if (src) editor.chain().focus().setImage({ src }).run();
                };
                reader.readAsDataURL(file);
            });
        };

        el.addEventListener('paste', handlePaste as EventListener);
        el.addEventListener('drop', handleDrop as EventListener);
        return () => {
            el.removeEventListener('paste', handlePaste as EventListener);
            el.removeEventListener('drop', handleDrop as EventListener);
        };
    }, [editor]);

    // Track mobile breakpoint (avoid touching documentElement overflow which causes scrollbar shift)
    useEffect(() => {
        const handleResize = () => {
            setIsMobile(window.innerWidth < 1024);
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
        };
    }, []);

    const modalContent = (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 lg:static lg:inset-auto lg:z-auto lg:p-0 lg:bg-transparent lg:flex-1 lg:min-w-0 lg:flex"
            onClick={() => isMobile && onClose()}
        >
            <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                transition={{ duration: 0.14, ease: [0.22, 1, 0.36, 1] }}
                onClick={e => e.stopPropagation()}
                className="w-full max-w-lg lg:max-w-none lg:flex-1 liquid-glass-overlay lg:liquid-glass rounded-[26px] p-5 sm:p-7 flex flex-col max-h-[85vh] lg:max-h-none lg:h-[calc(100vh-185px)] lg:min-h-[540px]"
            >
                {/* Editor Top Toolbar */}
                <div className="flex items-center justify-between pb-4 border-b border-primary/12 mb-5">
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setReadMode(m => !m)}
                            className={`no-fluid flex items-center gap-1.5 px-3.5 h-8 rounded-full text-xs font-bold transition-all cursor-pointer ${
                                !readMode
                                    ? 'btn-gradient'
                                    : 'bg-primary/12 text-primary border border-primary/25 hover:bg-primary/20'
                            }`}
                        >
                            {readMode ? <><Eye size={12} /> Reading · Click to Edit</> : <><Pencil size={12} /> Editing</>}
                        </button>
                        <button
                            onClick={onTogglePin}
                            className={`no-fluid w-8 h-8 rounded-full flex items-center justify-center transition-colors cursor-pointer ${
                                note.is_pinned
                                    ? 'bg-primary/15 border border-primary/25 text-primary'
                                    : 'bg-on-surface/[0.05] text-on-surface-variant hover:text-primary'
                            }`}
                            title={note.is_pinned ? 'Unpin note' : 'Pin note'}
                        >
                            <Pin size={13} className={note.is_pinned ? 'fill-current' : ''} />
                        </button>
                        <HoldButton
                            variant="danger"
                            holdDuration={750}
                            title="Hold to delete note"
                            onComplete={onDelete}
                            className="no-fluid w-8 h-8 p-0 rounded-full flex items-center justify-center"
                        >
                            <Trash2 size={13} />
                        </HoldButton>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="hidden sm:inline text-[11px] font-medium text-on-surface-variant/60">
                            Updated {new Date(note.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                        </span>
                        {isMobile && (
                            <button
                                onClick={onClose}
                                className="no-fluid w-8 h-8 rounded-full bg-on-surface/[0.06] hover:bg-on-surface/[0.12] text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer"
                                title="Close"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Borderless Editorial Title */}
                <input
                    type="text"
                    value={note.title}
                    onChange={e => onUpdate({ title: e.target.value })}
                    placeholder="Untitled Note"
                    readOnly={readMode}
                    className="w-full font-display text-2xl sm:text-[26px] font-extrabold tracking-tight text-on-surface !bg-transparent !border-none !shadow-none !rounded-none !px-0 outline-none mb-4 py-0.5 focus:!ring-0 placeholder:text-on-surface-variant/35"
                />

                {/* Tiptap Editor area */}
                <div className="flex-1 overflow-y-auto min-h-0 prose-area custom-scrollbar pr-2">
                    <EditorContent
                        editor={editor}
                        className={`h-full tiptap-editor text-sm leading-relaxed ${readMode ? 'read-mode' : ''}`}
                    />
                </div>

                {/* Toolbar — only in edit mode */}
                {!readMode && editor && (
                    <NoteToolbar
                        editor={editor}
                        loadingAi={loadingAi}
                        hasAiDraft={hasAiDraft}
                        onAiAction={handleAiAction}
                        onAiUndo={handleAiUndo}
                        onAiKeep={handleAiKeep}
                    />
                )}
            </motion.div>
        </div>
    );

    return isMobile ? createPortal(modalContent, document.body) : modalContent;
};

// ─────────────────────────────────────────────────────────────────────────────
// Todo panel — full dedicated list (not inside a note editor)
// ─────────────────────────────────────────────────────────────────────────────

interface TodoPanelProps {
    note: Note;
    subjects?: Subject[];
    onUpdate: (fields: Partial<Note>) => void;
    onDelete: () => void;
    onClose: () => void;
    isInline?: boolean;
}

const EXAM_PRESETS = ['End-Sem', 'Mid-Sem', 'Practical Viva', 'Lab File'] as const;

const TodoPanel: React.FC<TodoPanelProps> = ({ note, subjects = [], onUpdate }) => {
    const confirm = useConfirm();
    const [editMode, setEditMode] = useState(false);
    const [newText, setNewText] = useState('');
    const [examSubject, setExamSubject] = useState('');
    const [examDate, setExamDate] = useState(() => {
        const d = new Date();
        d.setDate(d.getDate() + 3);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    });
    const [examLabel, setExamLabel] = useState<string>('End-Sem');
    const inputRef = useRef<HTMLInputElement>(null);
    const examSubjectRef = useRef<HTMLInputElement>(null);

    const isExamMode = (note.category || '').toLowerCase() === 'exam';

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    );

    const rawActiveTodos = (note.todos || []).filter(t => !t.completed);
    const activeTodos = isExamMode
        ? [...rawActiveTodos].sort((a, b) => {
            if (a.exam_date && b.exam_date) return a.exam_date.localeCompare(b.exam_date);
            if (a.exam_date) return -1;
            if (b.exam_date) return 1;
            return 0;
        })
        : rawActiveTodos;
    const doneTodos = (note.todos || []).filter(t => t.completed);

    const nextUpcomingExam = activeTodos
        .map(t => ({ item: t, info: getExamCountdown(t.exam_date) }))
        .filter((e): e is { item: TodoItem; info: ExamCountdown } => Boolean(e.info && e.info.daysLeft >= 0))
        .sort((a, b) => a.info.daysLeft - b.info.daysLeft)[0] || null;

    const toggleExamMode = () => {
        onUpdate({ category: isExamMode ? '' : 'exam' });
    };

    const addTodo = () => {
        const text = newText.trim();
        if (!text) return;
        const item: TodoItem = { id: 'todo-' + Date.now(), text, completed: false };
        onUpdate({ todos: [item, ...(note.todos || [])] });
        setNewText('');
        inputRef.current?.focus();
    };

    const addExamItem = () => {
        const sub = examSubject.trim();
        const lbl = examLabel.trim() || 'Exam';
        if (!sub && !examDate) return;
        const item: TodoItem = {
            id: 'exam-' + Date.now(),
            text: lbl,
            subject: sub || lbl,
            exam_date: examDate || undefined,
            completed: false,
        };
        onUpdate({ category: 'exam', todos: [item, ...(note.todos || [])] });
        setExamSubject('');
        examSubjectRef.current?.focus();
    };

    const toggleTodo = (id: string) => {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8);
        onUpdate({ todos: (note.todos || []).map(t => t.id === id ? { ...t, completed: !t.completed } : t) });
    };

    const deleteTodo = (id: string) => {
        onUpdate({ todos: (note.todos || []).filter(t => t.id !== id) });
    };

    const editTodo = (id: string, text: string) => {
        onUpdate({ todos: (note.todos || []).map(t => t.id === id ? { ...t, text } : t) });
    };

    const clearDone = async () => {
        const confirmed = await confirm({
            title: 'Clear Completed Items',
            message: 'Are you sure you want to delete all completed items?',
        });
        if (!confirmed) return;
        onUpdate({ todos: rawActiveTodos });
    };

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;
        const allTodos = note.todos || [];
        const oldIndex = allTodos.findIndex(t => t.id === active.id);
        const newIndex = allTodos.findIndex(t => t.id === over.id);
        if (oldIndex !== -1 && newIndex !== -1) {
            onUpdate({ todos: arrayMove(allTodos, oldIndex, newIndex) });
        }
    };

    const totalTodosCount = (note.todos || []).length;
    const pctDone = totalTodosCount > 0 ? Math.round((doneTodos.length / totalTodosCount) * 100) : 0;

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <div className="lg:col-span-8 liquid-glass rounded-[26px] p-6 flex flex-col min-h-[500px] h-[calc(100vh-205px)]">
                {/* Header */}
                <div className="flex items-center justify-between gap-2 pb-4 border-b border-primary/12 mb-4 flex-wrap">
                    <div className="flex items-center gap-2.5">
                        <span className="font-display text-base font-extrabold text-on-surface tracking-tight">
                            {isExamMode ? 'Exam & Practical Datesheet' : 'Action Checklist'}
                        </span>
                        {isExamMode && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/18 text-amber-500 border border-amber-500/30">
                                <BellRing size={10} /> Alerts Active
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={toggleExamMode}
                            className={`no-fluid flex items-center gap-1.5 px-3.5 h-8 rounded-full text-xs font-bold transition-all cursor-pointer border ${
                                isExamMode
                                    ? 'bg-gradient-to-r from-amber-500 to-rose-500 text-white border-transparent shadow-sm'
                                    : 'bg-on-surface/[0.06] border-primary/18 text-on-surface-variant hover:text-primary hover:border-primary/40'
                            }`}
                        >
                            <GraduationCap size={13} />
                            Exam Mode {isExamMode ? 'ON' : 'OFF'}
                        </button>
                        <button
                            onClick={() => setEditMode(m => !m)}
                            className={`no-fluid flex items-center gap-1.5 px-3.5 h-8 rounded-full text-xs font-bold transition-all cursor-pointer ${
                                editMode
                                    ? 'btn-gradient'
                                    : 'bg-on-surface/[0.06] border border-primary/18 text-on-surface-variant hover:text-primary'
                            }`}
                        >
                            {editMode ? <><Check size={12} /> Done</> : <><Pencil size={12} /> Reorder</>}
                        </button>
                    </div>
                </div>

                {/* Add row — Exam Mode vs Standard Task */}
                {!editMode && (
                    isExamMode ? (
                        <div className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-3.5 mb-4 space-y-2.5">
                            {subjects.length > 0 && (
                                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant shrink-0 mr-1">
                                        Courses:
                                    </span>
                                    {subjects.map(sub => {
                                        const active = examSubject.trim().toLowerCase() === sub.name.trim().toLowerCase();
                                        return (
                                            <button
                                                key={sub._id || sub.id || sub.name}
                                                type="button"
                                                onClick={() => setExamSubject(sub.name)}
                                                className={`no-fluid px-2.5 py-1 rounded-full text-[11px] font-bold shrink-0 transition-all cursor-pointer border ${
                                                    active
                                                        ? 'btn-gradient border-transparent'
                                                        : 'bg-surface/75 dark:bg-white/[0.06] border-primary/18 text-on-surface-variant hover:text-primary'
                                                }`}
                                            >
                                                {sub.code || sub.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                                <input
                                    ref={examSubjectRef}
                                    value={examSubject}
                                    onChange={e => setExamSubject(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addExamItem()}
                                    placeholder="Subject name (e.g. Operating Systems)…"
                                    className="sm:col-span-5 text-xs px-3.5 py-2 rounded-xl bg-surface/80 dark:bg-black/25 border border-primary/20 outline-none focus:border-primary text-on-surface placeholder:text-on-surface-variant/45"
                                />
                                <input
                                    type="date"
                                    value={examDate}
                                    onChange={e => setExamDate(e.target.value)}
                                    className="sm:col-span-4 text-xs px-3 py-2 rounded-xl bg-surface/80 dark:bg-black/25 border border-primary/20 outline-none focus:border-primary text-on-surface"
                                />
                                <button
                                    type="button"
                                    onClick={addExamItem}
                                    disabled={!examSubject.trim() && !examDate}
                                    className="no-fluid sm:col-span-3 h-9 px-3.5 rounded-xl btn-gradient text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer disabled:opacity-45"
                                >
                                    <Plus size={13} /> Add Exam
                                </button>
                            </div>

                            <div className="flex items-center gap-1.5 flex-wrap">
                                {EXAM_PRESETS.map(preset => (
                                    <button
                                        key={preset}
                                        type="button"
                                        onClick={() => setExamLabel(preset)}
                                        className={`no-fluid px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer border ${
                                            examLabel === preset
                                                ? 'bg-amber-500/20 text-amber-500 border-amber-500/45'
                                                : 'bg-on-surface/[0.04] text-on-surface-variant border-transparent hover:border-primary/25'
                                        }`}
                                    >
                                        {preset}
                                    </button>
                                ))}
                                <input
                                    value={examLabel}
                                    onChange={e => setExamLabel(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addExamItem()}
                                    placeholder="Type / note"
                                    className="flex-1 min-w-[110px] text-[11px] px-2.5 py-0.5 rounded-full bg-surface/60 dark:bg-black/20 border border-primary/15 outline-none focus:border-primary text-on-surface"
                                />
                            </div>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2.5 pl-4 pr-1.5 py-1.5 rounded-full border border-primary/20 bg-on-surface/[0.04] mb-4 focus-within:border-primary transition-colors">
                            <input
                                ref={inputRef}
                                value={newText}
                                onChange={e => setNewText(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && addTodo()}
                                placeholder="Add a new task and press Enter…"
                                className="flex-1 text-xs !bg-transparent !border-none !shadow-none outline-none focus:!ring-0 placeholder:text-on-surface-variant/45 py-1"
                            />
                            <button
                                onClick={addTodo}
                                className="no-fluid h-7 px-3.5 rounded-full btn-gradient text-xs font-bold inline-flex items-center gap-1 cursor-pointer shrink-0"
                            >
                                <Plus size={13} /> Add
                            </button>
                        </div>
                    )
                )}

                {/* Task / Exam list with DnD */}
                <div className="flex-1 overflow-y-auto min-h-0 space-y-1 pr-1 custom-scrollbar">
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                        <SortableContext items={(note.todos || []).map(t => t.id)} strategy={verticalListSortingStrategy}>
                            {activeTodos.length === 0 && doneTodos.length === 0 && (
                                <p className="text-center text-xs text-on-surface-variant/55 py-16">
                                    {isExamMode
                                        ? 'No exam dates added yet. Pick a subject and date above to track your datesheet.'
                                        : 'No tasks yet. Type above to add one.'}
                                </p>
                            )}
                            {activeTodos.map(todo => (
                                <SortableTodoRow
                                    key={todo.id}
                                    todo={todo}
                                    editMode={editMode}
                                    onToggle={toggleTodo}
                                    onDelete={deleteTodo}
                                    onEdit={editTodo}
                                />
                            ))}

                            {doneTodos.length > 0 && (
                                <div className="pt-4 border-t border-primary/10 mt-4">
                                    <div className="flex items-center justify-between mb-2 px-1">
                                        <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/55">
                                            Completed · {doneTodos.length}
                                        </span>
                                        <button onClick={clearDone} className="text-[11px] font-bold text-rose-500 hover:text-rose-400 cursor-pointer transition-colors">
                                            Clear completed
                                        </button>
                                    </div>
                                    {doneTodos.map(todo => (
                                        <SortableTodoRow
                                            key={todo.id}
                                            todo={todo}
                                            editMode={editMode}
                                            onToggle={toggleTodo}
                                            onDelete={deleteTodo}
                                            onEdit={editTodo}
                                        />
                                    ))}
                                </div>
                            )}
                        </SortableContext>
                    </DndContext>
                </div>
            </div>

            {/* Right 4 cols: Focus Progress Ring + Next Exam Spotlight */}
            <div className="lg:col-span-4 space-y-4">
                {nextUpcomingExam && (
                    <div className="liquid-glass rounded-[24px] p-5 border border-amber-500/28 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                            <span className="inline-flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-amber-500">
                                <GraduationCap size={13} /> Next Exam
                            </span>
                            <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${nextUpcomingExam.info.pillClass}`}>
                                {nextUpcomingExam.info.label}
                            </span>
                        </div>
                        <p className="font-display text-base font-extrabold text-on-surface leading-snug">
                            {nextUpcomingExam.item.subject || nextUpcomingExam.item.text}
                        </p>
                        <p className="text-xs text-on-surface-variant">
                            {nextUpcomingExam.item.text} · {nextUpcomingExam.info.formatted}
                        </p>
                        <p className="text-[10px] text-on-surface-variant/75 pt-1 border-t border-primary/10">
                            Syncs to Android for Google Calendar-style reminders (1 day before & exam morning).
                        </p>
                    </div>
                )}

                <div className="liquid-hero-banner rounded-[26px] p-6 flex flex-col items-center text-center gap-4">
                    <CometDial
                        value={pctDone}
                        size={126}
                        strokeWidth={9}
                        color="#6366f1"
                        secondaryColor="#06b6d4"
                        label="Complete"
                    />
                    <div>
                        <h3 className="font-display text-lg font-extrabold text-on-surface">
                            {isExamMode ? 'Exam Readiness' : 'Task Momentum'}
                        </h3>
                        <p className="text-xs text-on-surface-variant mt-0.5">
                            {activeTodos.length === 0 ? 'Everything checked off!' : `${activeTodos.length} remaining to wrap up`}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 w-full pt-2">
                        <div className="rounded-2xl bg-surface/75 dark:bg-black/25 border border-primary/15 p-3">
                            <p className="text-[10px] font-bold uppercase text-on-surface-variant">Pending</p>
                            <p className="font-display text-2xl font-extrabold text-primary tabular-nums">{activeTodos.length}</p>
                        </div>
                        <div className="rounded-2xl bg-surface/75 dark:bg-black/25 border border-primary/15 p-3">
                            <p className="text-[10px] font-bold uppercase text-on-surface-variant">Done</p>
                            <p className="font-display text-2xl font-extrabold text-on-surface tabular-nums">{doneTodos.length}</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Note Card
// ─────────────────────────────────────────────────────────────────────────────

interface NoteCardProps {
    note: Note;
    isActive: boolean;
    onSelect: (note: Note) => void;
    onDelete: (id: string) => void;
    onTogglePin: (note: Note) => void;
}

const NoteCard: React.FC<NoteCardProps> = ({ note, isActive, onSelect, onDelete, onTogglePin }) => {
    const [menuOpen, setMenuOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Plain text preview from HTML, safely stripping tags and decoding HTML entities (like &nbsp;, &amp;)
    const plainText = (() => {
        if (!note.content) return '';
        // Insert newlines before closing block tags to preserve text line breaks, and insert placeholders for media
        const withPlaceholders = note.content
            .replace(/<img[^>]*>/gi, '[image] ')
            .replace(/<iframe[^>]*>/gi, '[video] ')
            .replace(/<\/p>/gi, '\n</p>')
            .replace(/<\/div>/gi, '\n</div>')
            .replace(/<\/li>/gi, '\n</li>')
            .replace(/<br\s*\/?>/gi, '\n<br>\n')
            .replace(/<\/h[1-6]>/gi, '\n');

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(withPlaceholders, 'text/html');
            const text = doc.body.textContent || doc.body.innerText || '';
            return text.replace(/[^\S\r\n]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
        } catch {
            return withPlaceholders
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/g, ' ')
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/[^\S\r\n]+/g, ' ')
                .replace(/\n\s*\n+/g, '\n')
                .trim();
        }
    })();

    const previewTokens = (() => {
        if (!note.content) return [] as Array<{ type: 'text' | 'badge'; value: string }>;
        try {
            const doc = new DOMParser().parseFromString(note.content, 'text/html');
            const out: Array<{ type: 'text' | 'badge'; value: string }> = [];
            const walk = (node: Node) => {
                if (out.length > 40) return;
                if (node.nodeType === Node.TEXT_NODE) {
                    const txt = (node.textContent || '').replace(/\s+/g, ' ');
                    if (txt.trim()) out.push({ type: 'text', value: txt });
                    return;
                }
                if (node.nodeType !== Node.ELEMENT_NODE) return;
                const tag = (node as HTMLElement).tagName.toLowerCase();
                if (tag === 'script' || tag === 'style' || tag === 'svg' || tag === 'object' || tag === 'embed') return;
                if (tag === 'img') {
                    out.push({ type: 'badge', value: 'Image' });
                    return;
                }
                if (tag === 'iframe') {
                    out.push({ type: 'badge', value: 'Video' });
                    return;
                }
                node.childNodes.forEach(walk);
                if (['p', 'div', 'br', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote'].includes(tag)) {
                    out.push({ type: 'text', value: ' ' });
                }
            };
            doc.body.childNodes.forEach(walk);
            return out;
        } catch {
            return plainText ? [{ type: 'text' as const, value: plainText }] : [];
        }
    })();

    useEffect(() => {
        if (!menuOpen) return;
        const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, [menuOpen]);

    return (
        <div
            onClick={() => onSelect(note)}
            className={`group relative overflow-hidden p-3.5 pl-4 rounded-2xl border transition-all cursor-pointer select-none ${
                isActive
                    ? 'bg-gradient-to-r from-indigo-500/14 via-violet-500/10 to-cyan-500/10 border-primary/35 shadow-sm'
                    : 'bg-surface/65 dark:bg-white/[0.03] border-primary/10 hover:border-primary/28 hover:bg-primary/[0.05]'
            }`}
        >
            {isActive && (
                <span className="absolute left-0 top-2.5 bottom-2.5 w-[3.5px] rounded-r-full bg-gradient-to-b from-indigo-500 to-cyan-400" />
            )}
            <div className="flex items-start justify-between gap-2 mb-1.5">
                <h3 className={`text-xs font-bold tracking-tight truncate flex-1 leading-snug ${isActive ? 'text-primary' : 'text-on-surface'}`}>
                    {note.title || 'Untitled'}
                </h3>
                <div className="flex items-center gap-1 shrink-0" ref={menuRef}>
                    {note.is_pinned && <Pin size={10} className="text-primary fill-current" />}
                    <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); setMenuOpen(m => !m); }}
                        className="no-fluid opacity-70 sm:opacity-0 sm:group-hover:opacity-100 w-6 h-6 rounded-full hover:bg-primary/15 flex items-center justify-center transition-all cursor-pointer text-on-surface-variant hover:text-primary"
                    >
                        <MoreHorizontal size={12} />
                    </button>

                    <AnimatePresence>
                        {menuOpen && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: -4 }}
                                transition={{ duration: 0.12 }}
                                className="absolute right-0 top-8 z-30 liquid-glass-overlay rounded-2xl p-1.5 min-w-[144px]"
                                onClick={e => e.stopPropagation()}
                            >
                                <button onClick={e => { e.stopPropagation(); onTogglePin(note); setMenuOpen(false); }} className="no-fluid flex items-center gap-2 w-full text-left px-2.5 py-1.5 text-xs font-semibold hover:bg-primary/10 rounded-xl transition-colors cursor-pointer">
                                    <Pin size={11} />{note.is_pinned ? 'Unpin' : 'Pin to top'}
                                </button>
                                <div className="h-px bg-primary/12 my-1" />
                                <HoldButton
                                    variant="danger"
                                    label="Hold to Delete"
                                    completedLabel="Deleted"
                                    holdDuration={750}
                                    onComplete={() => { onDelete(note.id); setMenuOpen(false); }}
                                    className="w-full text-left px-2 py-1 text-xs font-semibold rounded-xl"
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            <div className="text-[11px] text-on-surface-variant/75 line-clamp-2 leading-relaxed select-none pointer-events-none">
                {previewTokens.length === 0 ? (
                    <span className="italic opacity-40">Empty note</span>
                ) : (
                    previewTokens.map((tok, i) =>
                        tok.type === 'badge' ? (
                            <span
                                key={i}
                                className="text-primary font-bold text-[9px] bg-primary/10 px-1 py-0.5 rounded uppercase tracking-wider mr-1 inline-block"
                            >
                                [{tok.value}]
                            </span>
                        ) : (
                            <React.Fragment key={i}>{tok.value}</React.Fragment>
                        )
                    )
                )}
            </div>

            <div className="flex items-center justify-between pt-2 mt-2 text-[10px] font-semibold text-on-surface-variant/50">
                <span>{plainText.length} chars</span>
                <span>{new Date(note.updated_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Notes Page
// ─────────────────────────────────────────────────────────────────────────────

const Notes: React.FC = () => {
    const confirm = useConfirm();
    const { showToast } = useToast();
    const queryClient = useQueryClient();
    const { currentSemester } = useSemester();
    const [notes, setNotes] = useState<Note[]>([]);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'notes' | 'todos'>(() => {
        const saved = localStorage.getItem('semester_notes_view_mode') || localStorage.getItem('zenith_notes_view_mode');
        return (saved === 'notes' || saved === 'todos') ? saved : 'notes';
    });
    const [activeNote, setActiveNote] = useState<Note | null>(null);

    const handleViewModeChange = (mode: 'notes' | 'todos') => {
        setViewMode(mode);
        setActiveNote(null);
        localStorage.setItem('semester_notes_view_mode', mode);
    };
    const [searchQuery, setSearchQuery] = useState('');
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const examAlertShownRef = useRef(false);

    usePageMeta({
        title: 'Notes & Tasks | Semester',
        description: 'Write notes with rich formatting, manage checklists, and track upcoming exam dates.',
    });

    useEffect(() => { fetchNotes(); }, []);

    useEffect(() => {
        attendanceService.getSubjects(currentSemester)
            .then(data => setSubjects(data || []))
            .catch(() => setSubjects([]));
    }, [currentSemester]);

    // Calendar-style desktop reminder if an exam is Today or Tomorrow
    useEffect(() => {
        if (examAlertShownRef.current || notes.length === 0) return;
        const dueSoon = notes
            .filter(n => n.is_todo)
            .flatMap(n => n.todos || [])
            .filter(t => !t.completed && t.exam_date)
            .map(t => ({ item: t, info: getExamCountdown(t.exam_date) }))
            .filter((e): e is { item: TodoItem; info: ExamCountdown } => Boolean(e.info && e.info.daysLeft >= 0 && e.info.daysLeft <= 1));
        if (dueSoon.length > 0) {
            examAlertShownRef.current = true;
            const first = dueSoon[0];
            const whenText = first.info.daysLeft === 0 ? 'TODAY' : 'TOMORROW';
            const titleText = `${first.item.subject || first.item.text} (${first.item.text}) is ${whenText}`;
            showToast('info', `Upcoming Exam: ${titleText}`);
            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
                new Notification('Upcoming Exam Reminder', { body: titleText });
            }
        }
    }, [notes, showToast]);

    const fetchNotes = async () => {
        try {
            setLoading(true);
            if (isDevTestMode()) {
                setNotes(loadDevNotes() as Note[]);
                return;
            }
            const res = await notesHttp.get('/api/notes');
            setNotes(res.data?.data || []);
        } catch {
            showToast('error', 'Failed to load');
        } finally {
            setLoading(false);
        }
    };

    const defaultTasksNote = notes.find(n => n.is_todo);

    // If viewMode === 'todos' and we have loaded notes but no defaultTasksNote exists, we create one automatically
    useEffect(() => {
        if (!loading && viewMode === 'todos' && !defaultTasksNote) {
            createNote(true);
        }
    }, [viewMode, loading, defaultTasksNote]);

    // Create note
    const createNote = async (isTodo: boolean) => {
        const tempId = isDevTestMode() ? `dev-note-${Date.now()}` : 'temp-' + Date.now();
        const newNote: Note = {
            id: tempId,
            title: isTodo ? 'My Tasks' : 'Untitled Note',
            content: '',
            is_todo: isTodo,
            todos: [],
            is_pinned: false,
            is_archived: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
        setNotes(prev => {
            const next = [newNote, ...prev];
            if (isDevTestMode()) saveDevNotes(next as any);
            return next;
        });
        if (!isTodo) setActiveNote(newNote);
        if (isDevTestMode()) {
            queryClient.invalidateQueries({ queryKey: ['notes'] });
            return;
        }
        try {
            const res = await notesHttp.post('/api/notes', { title: newNote.title, content: '', is_todo: isTodo, todos: [] });
            const saved = res.data?.data;
            if (saved) {
                setNotes(prev => prev.map(n => n.id === tempId ? saved : n));
                if (!isTodo) setActiveNote(saved);
                queryClient.invalidateQueries({ queryKey: ['notes'] });
            }
        } catch {
            showToast('error', 'Failed to create');
            setNotes(prev => prev.filter(n => n.id !== tempId));
            if (!isTodo) setActiveNote(null);
        }
    };

    // Debounced update
    const updateNote = useCallback((fields: Partial<Note>) => {
        if (!activeNote) return;
        const updated: Note = { ...activeNote, ...fields, updated_at: new Date().toISOString() };
        setActiveNote(updated);
        setNotes(prev => {
            const next = prev.map(n => n.id === activeNote.id ? updated : n);
            if (isDevTestMode()) saveDevNotes(next as any);
            return next;
        });

        if (isDevTestMode()) {
            queryClient.invalidateQueries({ queryKey: ['notes'] });
            return;
        }

        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
            if (activeNote.id.startsWith('temp-')) return;
            try {
                await notesHttp.put(`/api/notes/${activeNote.id}`, fields);
                queryClient.invalidateQueries({ queryKey: ['notes'] });
            } catch { /* silent */ }
        }, 700);
    }, [activeNote, queryClient]);

    const togglePin = async (note: Note) => {
        const pinned = !note.is_pinned;
        setNotes(prev => {
            const next = prev.map(n => n.id === note.id ? { ...n, is_pinned: pinned } : n).sort((a, b) => {
                if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
                return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
            });
            if (isDevTestMode()) saveDevNotes(next as any);
            return next;
        });
        if (activeNote?.id === note.id) setActiveNote(a => a ? { ...a, is_pinned: pinned } : a);
        if (isDevTestMode()) {
            queryClient.invalidateQueries({ queryKey: ['notes'] });
            return;
        }
        try {
            await notesHttp.put(`/api/notes/${note.id}`, { is_pinned: pinned });
            queryClient.invalidateQueries({ queryKey: ['notes'] });
        } catch { fetchNotes(); }
    };

    const deleteNote = async (noteId: string) => {
        const isTemp = noteId.startsWith('temp-');
        if (!isTemp) {
            const confirmed = await confirm({
                title: 'Delete Note',
                message: 'Are you sure you want to delete this note?',
            });
            if (!confirmed) return;
        }
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate([15, 5, 15]);
        setNotes(prev => {
            const next = prev.filter(n => n.id !== noteId);
            if (isDevTestMode()) saveDevNotes(next as any);
            return next;
        });
        if (activeNote?.id === noteId) setActiveNote(null);
        if (isDevTestMode()) {
            showToast('success', 'Deleted');
            queryClient.invalidateQueries({ queryKey: ['notes'] });
            return;
        }
        try {
            await notesHttp.delete(`/api/notes/${noteId}`);
            showToast('success', 'Deleted');
            queryClient.invalidateQueries({ queryKey: ['notes'] });
        } catch { fetchNotes(); }
    };

    const filtered = notes.filter(n => {
        const q = searchQuery.toLowerCase();
        const matchSearch = !q || n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q);
        const matchMode = viewMode === 'todos' ? n.is_todo : !n.is_todo;
        return matchSearch && matchMode;
    });
    const pinned = filtered.filter(n => n.is_pinned);
    const unpinned = filtered.filter(n => !n.is_pinned);

    // Auto-select the first note on desktop so the split-pane canvas is always populated
    useEffect(() => {
        if (viewMode === 'notes' && !loading && !activeNote && filtered.length > 0 && typeof window !== 'undefined' && window.innerWidth >= 1024) {
            setActiveNote(pinned[0] || unpinned[0] || filtered[0]);
        }
    }, [viewMode, loading, activeNote, filtered.length]);

    return (
        <div className="w-full pb-12">
            <PageHeader
                title={viewMode === 'todos' ? 'Tasks' : 'Notes'}
                icon={viewMode === 'todos' ? ListTodo : StickyNote}
                badge={viewMode === 'notes' ? `${filtered.length} notes` : `${(defaultTasksNote?.todos || []).filter(t => !t.completed).length} left`}
                actions={
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <RubberSegment<'notes' | 'todos'>
                            options={[
                                { id: 'notes', label: 'Notes', icon: <StickyNote size={12} /> },
                                { id: 'todos', label: 'Tasks', icon: <ListTodo size={12} /> },
                            ]}
                            value={viewMode}
                            size="sm"
                            layoutId="notes-view-mode-header"
                            onChange={handleViewModeChange}
                        />
                        {viewMode === 'notes' && (
                            <button
                                onClick={() => createNote(false)}
                                className="no-fluid h-8 px-4 rounded-full btn-gradient text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
                            >
                                <Plus size={13} />
                                New Note
                            </button>
                        )}
                    </div>
                }
            />

            {viewMode === 'todos' ? (
                <div className="w-full">
                    {loading ? (
                        <div className="py-24 text-center">
                            <span className="text-xs text-on-surface-variant/55 animate-pulse">Loading Tasks…</span>
                        </div>
                    ) : defaultTasksNote ? (
                        <TodoPanel
                            note={defaultTasksNote}
                            subjects={subjects}
                            onUpdate={(fields) => {
                                const updated: Note = { ...defaultTasksNote, ...fields, updated_at: new Date().toISOString() };
                                setNotes(prev => {
                                    const next = prev.map(n => n.id === defaultTasksNote.id ? updated : n);
                                    if (isDevTestMode()) saveDevNotes(next as any);
                                    return next;
                                });
                                if (isDevTestMode()) {
                                    queryClient.invalidateQueries({ queryKey: ['notes'] });
                                    return;
                                }
                                if (saveTimer.current) clearTimeout(saveTimer.current);
                                saveTimer.current = setTimeout(async () => {
                                    try {
                                        await notesHttp.put(`/api/notes/${defaultTasksNote.id}`, fields);
                                        queryClient.invalidateQueries({ queryKey: ['notes'] });
                                    } catch {}
                                }, 700);
                            }}
                            onDelete={() => deleteNote(defaultTasksNote.id)}
                            onClose={() => {}}
                            isInline={true}
                        />
                    ) : (
                        <div className="py-24 text-center">
                            <span className="text-xs text-on-surface-variant/55 animate-pulse">Setting up checklist…</span>
                        </div>
                    )}
                </div>
            ) : (
                /* True macOS Apple Notes / Craft Split-Pane Studio */
                <div className="flex flex-col lg:flex-row gap-5 w-full items-stretch">
                    {/* Left Master Sidebar Rail */}
                    <div className="w-full lg:w-[320px] shrink-0 liquid-glass rounded-[26px] p-4 flex flex-col lg:h-[calc(100vh-185px)] lg:min-h-[540px]">
                        <div className="mb-3.5">
                            <input
                                type="text"
                                placeholder="Search notes…"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full text-xs px-4 py-2 bg-on-surface/[0.04] border border-primary/18 rounded-full outline-none focus:border-primary transition-colors placeholder:text-on-surface-variant/45 text-on-surface"
                            />
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar pr-0.5 space-y-4">
                            {loading ? (
                                <div className="py-16 text-center">
                                    <span className="text-xs text-on-surface-variant/50 animate-pulse">Loading…</span>
                                </div>
                            ) : filtered.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-16 text-center px-3">
                                    <StickyNote size={22} className="text-primary/45 mb-2.5" />
                                    <p className="text-xs font-bold text-on-surface mb-1">
                                        {searchQuery ? 'No matching notes' : 'No notes yet'}
                                    </p>
                                    {!searchQuery && (
                                        <button onClick={() => createNote(false)} className="no-fluid mt-3 h-8 px-4 rounded-full btn-gradient text-xs font-bold cursor-pointer">
                                            Create Note
                                        </button>
                                    )}
                                </div>
                            ) : (
                                <>
                                    {pinned.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-bold text-on-surface-variant/55 uppercase tracking-[0.14em] px-1">Pinned</p>
                                            {pinned.map(note => (
                                                <NoteCard key={note.id} note={note} isActive={activeNote?.id === note.id} onSelect={setActiveNote} onDelete={deleteNote} onTogglePin={togglePin} />
                                            ))}
                                        </div>
                                    )}
                                    {unpinned.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[10px] font-bold text-on-surface-variant/55 uppercase tracking-[0.14em] px-1">Recent</p>
                                            {unpinned.map(note => (
                                                <NoteCard key={note.id} note={note} isActive={activeNote?.id === note.id} onSelect={setActiveNote} onDelete={deleteNote} onTogglePin={togglePin} />
                                            ))}
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>

                    {/* Right Full-Width Editorial Document Canvas */}
                    <AnimatePresence mode="wait">
                        {activeNote ? (
                            <NoteEditor
                                key={activeNote.id}
                                note={activeNote}
                                onUpdate={updateNote}
                                onDelete={() => deleteNote(activeNote.id)}
                                onClose={() => setActiveNote(null)}
                                onTogglePin={() => togglePin(activeNote)}
                            />
                        ) : (
                            <div className="hidden lg:flex flex-1 liquid-glass rounded-[26px] flex-col items-center justify-center text-center p-12 min-h-[540px]">
                                <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white flex items-center justify-center mb-4 shadow-sm">
                                    <StickyNote size={22} />
                                </div>
                                <h3 className="font-display text-lg font-extrabold text-on-surface">Select or Create a Note</h3>
                                <p className="text-xs text-on-surface-variant/70 mt-1 max-w-xs">
                                    Pick a note from the sidebar or start a fresh document with rich formatting and AI cleanup.
                                </p>
                                <button onClick={() => createNote(false)} className="no-fluid mt-5 h-9 px-5 rounded-full btn-gradient text-xs font-bold cursor-pointer">
                                    New Note
                                </button>
                            </div>
                        )}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
};

export default Notes;
