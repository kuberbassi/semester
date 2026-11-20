import React, { useState, useEffect, useRef, useCallback } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import {
    StickyNote, ListTodo, Plus, Trash2, Pin,
    CheckCircle2, Circle, X, GripVertical, Pencil,
    Check, Eye, Bold, Italic, Underline as UnderlineIcon,
    AlignLeft, AlignCenter, AlignRight, List, ListOrdered,
    Image as ImageIcon, MoreHorizontal, RotateCcw, Sparkles
} from 'lucide-react';
import { useToast } from '@/components/ui/toast-context';
import { HoldButton } from '@/components/react-bits';
import api from '@/services/api';
import { useQueryClient } from '@tanstack/react-query';
import { useConfirm } from '@/contexts/confirm-context';

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

    return (
        <div ref={setNodeRef} style={style} className="flex items-center gap-2 group/row py-1.5 px-1 rounded-lg hover:bg-surface-container/30 transition-colors">
            {/* Drag handle — only in edit mode */}
            {editMode && (
                <span
                    {...attributes}
                    {...listeners}
                    className="text-on-surface-variant/20 hover:text-on-surface-variant/60 cursor-grab active:cursor-grabbing shrink-0 touch-none"
                >
                    <GripVertical size={14} />
                </span>
            )}

            {/* Checkbox */}
            <button
                onClick={() => !editMode && onToggle(todo.id)}
                className={`shrink-0 transition-colors ${todo.completed ? 'text-primary' : 'text-on-surface-variant/30 hover:text-on-surface-variant/70'} ${editMode ? 'pointer-events-none' : 'cursor-pointer'}`}
            >
                {todo.completed
                    ? <CheckCircle2 size={17} className="fill-primary/10" />
                    : <Circle size={17} />
                }
            </button>

            {/* Text / inline edit */}
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
                <span
                    onDoubleClick={() => editMode && setEditing(true)}
                    className={`flex-1 text-sm leading-snug select-none transition-all ${todo.completed ? 'line-through text-on-surface-variant/30' : 'text-on-surface'}`}
                >
                    {todo.text}
                </span>
            )}

            {/* Edit-mode actions */}
            {editMode && !editing && (
                <div className="flex items-center gap-1 opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
                    <button onClick={() => setEditing(true)} className="p-1 text-on-surface-variant/40 hover:text-on-surface rounded transition-colors cursor-pointer">
                        <Pencil size={12} />
                    </button>
                    <button onClick={() => onDelete(todo.id)} className="p-1 text-on-surface-variant/40 hover:text-red-500 rounded transition-colors cursor-pointer">
                        <Trash2 size={12} />
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
        className={`p-1.5 rounded transition-colors cursor-pointer ${active ? 'bg-on-surface text-surface' : 'text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container'}`}
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
                        <div className="flex items-center gap-1.5 text-primary text-[10px] font-bold uppercase tracking-wider animate-pulse">
                            <Sparkles size={12} />
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
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                            loadingAi 
                                ? 'bg-surface-container border-outline text-on-surface-variant/40 cursor-not-allowed'
                                : showAiMenu
                                    ? 'bg-primary/10 border-primary/30 text-primary'
                                    : 'border-outline text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container'
                        }`}
                    >
                        {loadingAi ? (
                            <>
                                <div className="w-3 h-3 rounded-full border border-primary/20 border-t-primary animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                <Sparkles size={12} className={showAiMenu ? 'animate-pulse' : ''} />
                                AI Writer
                            </>
                        )}
                    </button>

                    {showAiMenu && !loadingAi && (
                        <div className="fixed bottom-16 left-4 right-4 md:absolute md:bottom-full md:right-0 md:left-auto md:w-64 md:mb-2 z-50 bg-surface border border-outline rounded-xl shadow-lg p-2.5 flex flex-col gap-2.5 animate-fadeIn">
                            <div className="flex flex-col gap-0.5">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowAiMenu(false);
                                        onAiAction('reformat');
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
                                >
                                    Re-format Spacing
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowAiMenu(false);
                                        onAiAction('improve');
                                    }}
                                    className="w-full text-left px-3 py-2 text-xs font-semibold text-on-surface hover:bg-surface-container rounded-lg transition-colors cursor-pointer"
                                >
                                    Improve Writing
                                </button>
                            </div>
                            <div className="border-t border-outline" />
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
                                className="flex flex-col gap-1.5"
                            >
                                <span className="text-[10px] font-bold text-on-surface-variant/60 uppercase tracking-wider px-1">Custom Prompt</span>
                                <div className="flex items-center gap-1.5 border border-outline bg-surface rounded-md px-2 py-1 focus-within:border-primary/50 transition-colors">
                                    <input
                                        type="text"
                                        value={menuPromptText}
                                        onChange={(e) => setMenuPromptText(e.target.value)}
                                        placeholder="e.g., summarize, translate to Spanish..."
                                        className="flex-1 text-[11px] bg-transparent outline-none border-none focus:ring-0 placeholder:text-on-surface-variant/30 py-0.5"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!menuPromptText.trim()}
                                        className="text-[10px] font-bold text-primary hover:text-primary/80 disabled:opacity-35 transition-colors cursor-pointer"
                                    >
                                        Run
                                    </button>
                                </div>
                            </form>
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

    // Scroll lock on mobile when NoteEditor is mounted
    useEffect(() => {
        const handleResize = () => {
            const isMob = window.innerWidth < 1024;
            setIsMobile(isMob);
            if (isMob) {
                document.body.style.overflow = 'hidden';
                document.documentElement.style.overflow = 'hidden';
            } else {
                document.body.style.overflow = '';
                document.documentElement.style.overflow = '';
            }
        };

        handleResize();
        window.addEventListener('resize', handleResize);
        return () => {
            window.removeEventListener('resize', handleResize);
            document.body.style.overflow = '';
            document.documentElement.style.overflow = '';
        };
    }, []);

    const modalContent = (
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm lg:relative lg:inset-auto lg:z-auto lg:p-0 lg:bg-transparent lg:backdrop-blur-none"
            onClick={onClose}
        >
            <motion.div
                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                onClick={e => e.stopPropagation()}
                className="w-full max-w-lg lg:w-[460px] border border-outline bg-surface rounded-xl p-5 flex flex-col max-h-[85vh] lg:max-h-none lg:h-[calc(100vh-160px)] shadow-2xl lg:shadow-sm lg:sticky lg:top-20 lg:self-start lg:shrink-0"
            >
                {/* Header */}
                <div className="flex items-center justify-between pb-3 border-b border-outline mb-3">
                    <div className="flex items-center gap-1">
                        <HoldButton
                            variant="danger"
                            holdDuration={750}
                            title="Hold to delete note"
                            onComplete={onDelete}
                            className="p-1.5 rounded-lg flex items-center justify-center"
                        >
                            <Trash2 size={14} />
                        </HoldButton>
                        <button onClick={onTogglePin} className={`p-1.5 rounded hover:bg-surface-container transition-colors cursor-pointer ${note.is_pinned ? 'text-primary' : 'text-on-surface-variant/30'}`} title="Pin">
                            <Pin size={14} className={note.is_pinned ? 'fill-current' : ''} />
                        </button>
                        <button onClick={() => setReadMode(m => !m)} className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${readMode ? 'bg-surface-container text-on-surface' : 'text-on-surface-variant/40 hover:text-on-surface'}`}>
                            {readMode ? <><Eye size={11} /> Reading</> : <><Pencil size={11} /> Editing</>}
                        </button>
                    </div>
                    <div className="flex items-center">
                        <button onClick={onClose} className="p-1.5 text-on-surface-variant/30 hover:text-on-surface rounded transition-colors cursor-pointer" title="Close"><X size={14} /></button>
                    </div>
                </div>

                {/* Title */}
                <input
                    type="text"
                    value={note.title}
                    onChange={e => onUpdate({ title: e.target.value })}
                    placeholder="Title"
                    readOnly={readMode}
                    className="w-full text-base font-bold tracking-tight bg-transparent outline-none mb-3 py-1 border-none focus:ring-0"
                />

                {/* Tiptap Editor area */}
                <div className="flex-1 overflow-y-auto min-h-0 prose-area">
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
    onUpdate: (fields: Partial<Note>) => void;
    onDelete: () => void;
    onClose: () => void;
    isInline?: boolean;
}

const TodoPanel: React.FC<TodoPanelProps> = ({ note, onUpdate, onDelete, onClose, isInline = false }) => {
    const confirm = useConfirm();
    const [editMode, setEditMode] = useState(false);
    const [newText, setNewText] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    );

    const activeTodos = (note.todos || []).filter(t => !t.completed);
    const doneTodos = (note.todos || []).filter(t => t.completed);

    const addTodo = () => {
        const text = newText.trim();
        if (!text) return;
        const item: TodoItem = { id: 'todo-' + Date.now(), text, completed: false };
        onUpdate({ todos: [item, ...(note.todos || [])] });
        setNewText('');
        inputRef.current?.focus();
    };

    const toggleTodo = (id: string) => {
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(8);
        onUpdate({ todos: (note.todos || []).map(t => t.id === id ? { ...t, completed: !t.completed } : t) });
    };

    const deleteTodo = async (id: string) => {
        const confirmed = await confirm({
            title: 'Delete Task',
            message: 'Are you sure you want to delete this task?',
        });
        if (!confirmed) return;
        onUpdate({ todos: (note.todos || []).filter(t => t.id !== id) });
    };

    const editTodo = (id: string, text: string) => {
        onUpdate({ todos: (note.todos || []).map(t => t.id === id ? { ...t, text } : t) });
    };

    const clearDone = async () => {
        const confirmed = await confirm({
            title: 'Clear Completed Tasks',
            message: 'Are you sure you want to delete all completed tasks?',
        });
        if (!confirmed) return;
        onUpdate({ todos: activeTodos });
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

    return (
        <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 15 }}
            className={`w-full border border-outline bg-surface rounded-xl p-6 shadow-sm flex flex-col min-h-[400px] h-[calc(100vh-220px)] ${isInline ? 'max-w-xl mx-auto' : 'lg:w-[420px] sticky top-20 self-start'}`}
        >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-outline mb-4">
                {!isInline && (
                    <HoldButton
                            variant="danger"
                            holdDuration={750}
                            title="Hold to delete checklist"
                            onComplete={onDelete}
                            className="p-1.5 rounded-lg flex items-center justify-center mr-1"
                        >
                            <Trash2 size={14} />
                        </HoldButton>
                )}
                {isInline ? (
                    <span className="text-xs font-bold text-on-surface-variant/40 uppercase tracking-widest ml-1">My Tasks Checklist</span>
                ) : (
                    <input
                        type="text"
                        value={note.title}
                        onChange={e => onUpdate({ title: e.target.value })}
                        placeholder="List title"
                        className="text-base font-bold tracking-tight bg-transparent outline-none border-none focus:ring-0 flex-1"
                    />
                )}
                <div className="flex items-center gap-1.5 ml-2">
                    <button
                        onClick={() => setEditMode(m => !m)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${editMode ? 'bg-on-surface text-surface' : 'border border-outline text-on-surface-variant/50 hover:text-on-surface'}`}
                    >
                        {editMode ? <><Check size={10} /> Done</> : <><Pencil size={10} /> Edit Mode</>}
                    </button>
                    {!isInline && (
                        <button onClick={onClose} className="p-1.5 text-on-surface-variant/30 hover:text-on-surface rounded transition-colors cursor-pointer" title="Close"><X size={14} /></button>
                    )}
                </div>
            </div>

            {/* Add task row */}
            {!editMode && (
                <div className="flex items-center gap-3 px-2 py-1.5 rounded-xl border border-outline bg-surface-container/20 mb-4 focus-within:border-primary/50 transition-colors">
                    <button onClick={addTodo} className="text-on-surface-variant/30 hover:text-primary transition-colors shrink-0 cursor-pointer">
                        <Plus size={18} />
                    </button>
                    <input
                        ref={inputRef}
                        value={newText}
                        onChange={e => setNewText(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && addTodo()}
                        placeholder="Add a task straight up…"
                        className="flex-1 text-sm bg-transparent outline-none border-none focus:ring-0 placeholder:text-on-surface-variant/25 py-0.5"
                    />
                </div>
            )}

            {/* Task list with DnD */}
            <div className="flex-1 overflow-y-auto min-h-0 space-y-0.5 pr-1 custom-scrollbar">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={(note.todos || []).map(t => t.id)} strategy={verticalListSortingStrategy}>
                        {/* Active tasks */}
                        {activeTodos.length === 0 && doneTodos.length === 0 && (
                            <p className="text-center text-xs text-on-surface-variant/25 py-16 italic">No tasks. Type above to add one quickly!</p>
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

                        {/* Done section */}
                        {doneTodos.length > 0 && (
                            <div className="pt-4 border-t border-outline/30 mt-4">
                                <div className="flex items-center justify-between mb-2 px-1">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/30">
                                        Done · {doneTodos.length}
                                    </span>
                                    {editMode && (
                                        <button onClick={clearDone} className="text-[10px] font-semibold text-red-400 hover:text-red-600 cursor-pointer transition-colors">
                                            Clear all done
                                        </button>
                                    )}
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

            {/* Footer */}
            <div className="pt-3 border-t border-outline mt-2 flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/25">
                <span>
                    {activeTodos.length} remaining · {doneTodos.length} done
                </span>
                {editMode && (
                    <span>Hold handle to reorder</span>
                )}
            </div>
        </motion.div>
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
    const completedTodos = (note.todos || []).filter(t => t.completed).length;
    const totalTodos = (note.todos || []).length;

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

    const previewHtml = (() => {
        if (!note.content) return '<p class="italic opacity-30">Empty note</p>';
        return note.content
            .replace(/<img[^>]*>/gi, '<span class="text-primary font-bold text-[9px] bg-primary/10 px-1 rounded uppercase tracking-wider">[Image]</span> ')
            .replace(/<iframe[^>]*>/gi, '<span class="text-primary font-bold text-[9px] bg-primary/10 px-1 rounded uppercase tracking-wider">[Video]</span> ');
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
            className={`group relative p-4 rounded-xl border transition-all cursor-pointer select-none ${isActive ? 'border-on-surface bg-surface-container/20' : 'border-outline hover:border-on-surface/50 bg-surface'}`}
        >
            <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-sm font-bold tracking-tight truncate flex-1 leading-snug">{note.title || 'Untitled'}</h3>
                <div className="flex items-center gap-1 shrink-0" ref={menuRef}>
                    {note.is_pinned && <Pin size={10} className="text-on-surface/50 fill-current" />}
                    <button
                        onMouseDown={e => e.stopPropagation()}
                        onClick={e => { e.stopPropagation(); setMenuOpen(m => !m); }}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-surface-container transition-all cursor-pointer text-on-surface-variant/40"
                    >
                        <MoreHorizontal size={13} />
                    </button>

                    {/* Context mini-menu */}
                    <AnimatePresence>
                        {menuOpen && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.92, y: -4 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.92, y: -4 }}
                                className="absolute right-0 top-8 z-30 bg-surface border border-outline rounded-lg shadow-lg p-1 min-w-[130px]"
                                onClick={e => e.stopPropagation()}
                            >
                                <button onClick={e => { e.stopPropagation(); onTogglePin(note); setMenuOpen(false); }} className="flex items-center gap-2 w-full text-left px-2.5 py-1.5 text-xs font-semibold hover:bg-surface-container rounded-md transition-colors cursor-pointer">
                                    <Pin size={11} />{note.is_pinned ? 'Unpin' : 'Pin to top'}
                                </button>
                                <div className="h-px bg-outline my-1" />
                                <HoldButton
                                    variant="danger"
                                    label="Hold to Delete"
                                    completedLabel="Deleted"
                                    holdDuration={750}
                                    onComplete={() => { onDelete(note.id); setMenuOpen(false); }}
                                    className="w-full text-left px-2 py-1 text-xs font-semibold rounded-md"
                                />
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {note.is_todo ? (
                <div className="space-y-1 mb-2">
                    {totalTodos === 0
                        ? <span className="text-[11px] text-on-surface-variant/30 italic">No tasks</span>
                        : (note.todos || []).slice(0, 4).map(t => (
                            <div key={t.id} className="flex items-center gap-1.5 text-xs">
                                {t.completed
                                    ? <CheckCircle2 size={11} className="text-on-surface-variant/30 shrink-0" />
                                    : <Circle size={11} className="text-on-surface-variant/40 shrink-0" />
                                }
                                <span className={`truncate ${t.completed ? 'line-through text-on-surface-variant/30' : 'text-on-surface/80'}`}>{t.text}</span>
                            </div>
                        ))}
                    {totalTodos > 4 && <span className="text-[10px] text-on-surface-variant/25 font-semibold">+{totalTodos - 4} more</span>}
                </div>
            ) : (
                <div 
                    className="text-xs text-on-surface-variant/60 line-clamp-3 leading-relaxed note-preview-html select-none pointer-events-none"
                    dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
            )}

            <div className="flex items-center justify-between pt-2 border-t border-outline/40 mt-2 text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/25">
                <span>{note.is_todo ? `${completedTodos}/${totalTodos} done` : `${plainText.length} chars`}</span>
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
    const [notes, setNotes] = useState<Note[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'notes' | 'todos'>(() => {
        const saved = localStorage.getItem('zenith_notes_view_mode');
        return (saved === 'notes' || saved === 'todos') ? saved : 'notes';
    });
    const [activeNote, setActiveNote] = useState<Note | null>(null);

    const handleViewModeChange = (mode: 'notes' | 'todos') => {
        setViewMode(mode);
        setActiveNote(null);
        localStorage.setItem('zenith_notes_view_mode', mode);
    };
    const [searchQuery, setSearchQuery] = useState('');
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    usePageMeta({
        title: 'Notes & Tasks | Zenith',
        description: 'Write notes with rich formatting and manage tasks with a clean todo list.',
    });

    useEffect(() => { fetchNotes(); }, []);

    const fetchNotes = async () => {
        try {
            setLoading(true);
            const res = await api.get('/api/notes');
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
        const tempId = 'temp-' + Date.now();
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
        setNotes(prev => [newNote, ...prev]);
        if (!isTodo) setActiveNote(newNote);
        try {
            const res = await api.post('/api/notes', { title: newNote.title, content: '', is_todo: isTodo, todos: [] });
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
        setNotes(prev => prev.map(n => n.id === activeNote.id ? updated : n));

        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(async () => {
            if (activeNote.id.startsWith('temp-')) return;
            try { 
                await api.put(`/api/notes/${activeNote.id}`, fields);
                queryClient.invalidateQueries({ queryKey: ['notes'] });
            } catch { /* silent */ }
        }, 700);
    }, [activeNote, queryClient]);

    const togglePin = async (note: Note) => {
        const pinned = !note.is_pinned;
        setNotes(prev => prev.map(n => n.id === note.id ? { ...n, is_pinned: pinned } : n).sort((a, b) => {
            if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
            return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        }));
        if (activeNote?.id === note.id) setActiveNote(a => a ? { ...a, is_pinned: pinned } : a);
        try { 
            await api.put(`/api/notes/${note.id}`, { is_pinned: pinned });
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
        setNotes(prev => prev.filter(n => n.id !== noteId));
        if (activeNote?.id === noteId) setActiveNote(null);
        try {
            await api.delete(`/api/notes/${noteId}`);
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

    return (
        <div className="pb-24 max-w-7xl mx-auto px-4">
            {viewMode === 'todos' ? (
                // Single unified checklist view
                <div className="w-full">
                    {/* Top bar with tabs only */}
                    <div className="flex justify-between items-center mb-6">
                        <div className="flex items-center gap-1 p-1 bg-surface-container border border-outline rounded-lg">
                            {(['notes', 'todos'] as const).map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => handleViewModeChange(mode)}
                                    className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all cursor-pointer ${viewMode === mode ? 'bg-surface text-on-surface shadow-sm border border-outline' : 'text-on-surface-variant/50 hover:text-on-surface'}`}
                                >
                                    {mode === 'notes' ? <><StickyNote size={12} />Notes</> : <><ListTodo size={12} />Tasks</>}
                                </button>
                            ))}
                        </div>
                    </div>

                    {loading ? (
                        <div className="py-24 text-center">
                            <span className="text-xs text-on-surface-variant/30 animate-pulse">Loading Tasks…</span>
                        </div>
                    ) : defaultTasksNote ? (
                        <TodoPanel
                            note={defaultTasksNote}
                            onUpdate={(fields) => {
                                const updated: Note = { ...defaultTasksNote, ...fields, updated_at: new Date().toISOString() };
                                setNotes(prev => prev.map(n => n.id === defaultTasksNote.id ? updated : n));
                                if (saveTimer.current) clearTimeout(saveTimer.current);
                                saveTimer.current = setTimeout(async () => {
                                    try { 
                                        await api.put(`/api/notes/${defaultTasksNote.id}`, fields);
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
                            <span className="text-xs text-on-surface-variant/30 animate-pulse">Setting up checklist…</span>
                        </div>
                    )}
                </div>
            ) : (
                // Traditional Notes view
                <div className="flex flex-col lg:flex-row gap-6 w-full">
                    {/* Left: Notes List */}
                    <div className="flex-1 min-w-0">
                        {/* Top bar */}
                        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3 mb-6">
                            <div className="flex items-center gap-1 p-1 bg-surface-container border border-outline rounded-lg self-start">
                                {(['notes', 'todos'] as const).map(mode => (
                                    <button
                                        key={mode}
                                        onClick={() => handleViewModeChange(mode)}
                                        className={`flex items-center gap-2 px-4 py-2 text-xs font-bold uppercase tracking-wider rounded-md transition-all cursor-pointer ${viewMode === mode ? 'bg-surface text-on-surface shadow-sm border border-outline' : 'text-on-surface-variant/50 hover:text-on-surface'}`}
                                    >
                                        {mode === 'notes' ? <><StickyNote size={12} />Notes</> : <><ListTodo size={12} />Tasks</>}
                                    </button>
                                ))}
                            </div>

                            <div className="flex items-center gap-2 flex-1 max-w-sm">
                                <input
                                    type="text"
                                    placeholder="Search notes…"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full text-xs px-4 py-2 bg-surface border border-outline rounded-lg outline-none focus:border-on-surface transition-all placeholder:text-on-surface-variant/25"
                                />
                                <button
                                    onClick={() => createNote(false)}
                                    className="h-9 w-9 flex items-center justify-center bg-on-surface text-surface hover:bg-on-surface/85 rounded-lg shrink-0 transition-all cursor-pointer"
                                    title="New Note"
                                >
                                    <Plus size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Card grid */}
                        {loading ? (
                            <div className="py-24 text-center">
                                <span className="text-xs text-on-surface-variant/30 animate-pulse">Loading…</span>
                            </div>
                        ) : filtered.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-24 rounded-xl border border-dashed border-outline">
                                <StickyNote size={22} className="text-on-surface-variant/15 mb-3" />
                                <p className="text-xs font-bold text-on-surface-variant/25 uppercase tracking-widest">
                                    {searchQuery ? 'No results' : 'No notes yet'}
                                </p>
                                {!searchQuery && (
                                    <button onClick={() => createNote(false)} className="mt-4 text-xs font-semibold text-on-surface-variant/40 hover:text-on-surface transition-colors cursor-pointer underline underline-offset-2">
                                        Create one
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="space-y-5">
                                {pinned.length > 0 && (
                                    <div>
                                        <p className="text-[10px] font-bold text-on-surface-variant/30 uppercase tracking-wider mb-2.5 px-0.5">Pinned</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {pinned.map(note => (
                                                <NoteCard key={note.id} note={note} isActive={activeNote?.id === note.id} onSelect={setActiveNote} onDelete={deleteNote} onTogglePin={togglePin} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {unpinned.length > 0 && (
                                    <div>
                                        {pinned.length > 0 && <p className="text-[10px] font-bold text-on-surface-variant/30 uppercase tracking-wider mb-2.5 px-0.5">Recent</p>}
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                            {unpinned.map(note => (
                                                <NoteCard key={note.id} note={note} isActive={activeNote?.id === note.id} onSelect={setActiveNote} onDelete={deleteNote} onTogglePin={togglePin} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Right: Editor panel */}
                    <AnimatePresence mode="wait">
                        {activeNote && (
                            <NoteEditor
                                key={activeNote.id}
                                note={activeNote}
                                onUpdate={updateNote}
                                onDelete={() => deleteNote(activeNote.id)}
                                onClose={() => setActiveNote(null)}
                                onTogglePin={() => togglePin(activeNote)}
                            />
                        )}
                    </AnimatePresence>
                </div>
            )}
        </div>
    );
};

export default Notes;
