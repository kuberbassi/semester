import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Send, X, ChevronDown, Trash2, MessageSquareText, ArrowUpRight, Maximize2, Minimize2,
    Copy, Check, RotateCcw, LayoutGrid, CalendarClock, GraduationCap, ListChecks, Database, Settings as SettingsIcon,
} from 'lucide-react';
import api from '@/services/api';
import { useSemester } from '@/contexts/semester-context';
import { getErrorMessage } from '@/utils/errors';
import { isTauriDesktop } from '@/utils/platform';
import { desktopDb, type AiConfig } from '@/services/desktopDb';

/** Intentional assistant emblem: rounded chat glyph with 3 signal bars. No stars/sparkles. */
export const SemesterAIIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v6A3.5 3.5 0 0 1 15.5 16H10l-4.2 3.2A.6.6 0 0 1 5 18.7V6.5Z" />
        <line x1="9" y1="9.5" x2="9" y2="9.5" strokeWidth="2.6" />
        <line x1="12" y1="8.2" x2="12" y2="10.8" strokeWidth="2.2" />
        <line x1="15" y1="9.5" x2="15" y2="9.5" strokeWidth="2.6" />
    </svg>
);

const PROMPT_GROUPS: Array<{ title: string; icon: React.ComponentType<{ size?: number; className?: string }>; prompts: string[] }> = [
    { title: 'Attendance', icon: LayoutGrid, prompts: ['How is my attendance margin?', 'Which subjects are below target?', 'How many classes must I attend to recover?'] },
    { title: 'Schedule', icon: CalendarClock, prompts: ['What classes do I have today?', 'Which is my busiest day?'] },
    { title: 'Results & CGPA', icon: GraduationCap, prompts: ['Show my CGPA breakdown', 'What are my strongest and weakest subjects?'] },
    { title: 'Tasks & Practicals', icon: ListChecks, prompts: ['Check pending tasks & practicals', 'Summarize my recent notes'] },
];

const inline = (text: string) =>
    text.replace(/\*\*\s*\*\*/g, '').split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g).map((part, j) => {
        if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
            return <strong key={j} className="font-bold text-on-surface">{part.slice(2, -2)}</strong>;
        }
        if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
            return <code key={j} className="px-1.5 py-0.5 rounded-md bg-on-surface/[0.08] text-[11px] font-mono break-all">{part.slice(1, -1)}</code>;
        }
        return <span key={j}>{part}</span>;
    });

const renderMarkdown = (text: string) =>
    text.split('\n').map((line, i) => {
        const t = line.trim();
        if (!t) return <div key={i} className="h-2" />;
        const h = t.match(/^#{1,4}\s+(.*)$/);
        if (h) return <div key={i} className="mt-2 mb-1 font-display font-extrabold text-[13px] text-on-surface break-words">{inline(h[1])}</div>;
        const nested = /^\s{2,}[-•]\s+/.test(line);
        if (/^[-•]\s+/.test(t)) {
            return (
                <div key={i} className={`flex items-start gap-2 my-1 min-w-0 ${nested ? 'ml-4' : 'ml-0.5'}`}>
                    <span className="text-primary shrink-0 mt-[1px]">•</span>
                    <span className="min-w-0 flex-1 break-words">{inline(t.replace(/^[-•]\s+/, ''))}</span>
                </div>
            );
        }
        const n = t.match(/^(\d+)\.\s+(.*)$/);
        if (n) {
            return (
                <div key={i} className="flex items-start gap-2 my-1 ml-0.5 min-w-0">
                    <span className="text-primary font-bold shrink-0">{n[1]}.</span>
                    <span className="min-w-0 flex-1 break-words">{inline(n[2])}</span>
                </div>
            );
        }
        return <div key={i} className="my-0.5 break-words">{inline(t)}</div>;
    });

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    error?: boolean;
    suggestions?: string[];
}

const AIChat: React.FC = () => {
    const navigate = useNavigate();
    const { currentSemester } = useSemester();
    const desktop = isTauriDesktop();
    const [isOpen, setIsOpen] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const [aiConfig, setAiConfig] = useState<AiConfig | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const refreshAiConfig = useCallback(() => {
        if (!desktop) return;
        void desktopDb.aiGetConfig().then(setAiConfig).catch(() => undefined);
    }, [desktop]);

    useEffect(() => {
        if (isOpen) refreshAiConfig();
    }, [isOpen, refreshAiConfig]);

    useEffect(() => {
        const handler = () => refreshAiConfig();
        window.addEventListener('semester:ai-config-changed', handler);
        return () => window.removeEventListener('semester:ai-config-changed', handler);
    }, [refreshAiConfig]);

    const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });

    useEffect(() => { if (isOpen) scrollToBottom(); }, [messages, isTyping, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const down = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) setIsOpen(false);
        };
        const key = (e: KeyboardEvent) => {
            if (e.key === 'Escape') { if (menuOpen) setMenuOpen(false); else setIsOpen(false); }
        };
        document.addEventListener('mousedown', down);
        document.addEventListener('keydown', key);
        return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
    }, [isOpen, menuOpen]);

    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }, [input]);

    const ask = useCallback(async (msg: string, history: ChatMessage[]): Promise<ChatMessage> => {
        const base = { id: `${Date.now() + 1}`, role: 'assistant' as const, timestamp: new Date() };
        try {
            const turns = history.slice(-10).map((m) => ({ role: m.role, content: m.content }));
            if (desktop) {
                const res = await desktopDb.aiChat(msg, turns, currentSemester);
                return { ...base, content: res.response, suggestions: res.suggestions };
            }
            const response = await api.post('/api/ai/chat_v2', {
                message: msg,
                history: turns,
                selectedSemester: currentSemester,
            });
            return { ...base, content: response.data?.data?.response || "Sorry, I couldn't process that. Try again!" };
        } catch (err) {
            return { ...base, content: getErrorMessage(err, 'Something went wrong. Please try again.'), error: true };
        }
    }, [desktop, currentSemester]);

    const handleSend = async (text?: string) => {
        const msg = (text ?? input).trim();
        if (!msg || isTyping) return;
        setMenuOpen(false);
        const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', content: msg, timestamp: new Date() };
        const history = [...messages, userMsg];
        setMessages(history);
        setInput('');
        setIsTyping(true);
        const reply = await ask(msg, history);
        setMessages((prev) => [...prev, reply]);
        setIsTyping(false);
    };

    const regenerate = async () => {
        if (isTyping) return;
        const lastUserIdx = [...messages].map((m) => m.role).lastIndexOf('user');
        if (lastUserIdx < 0) return;
        const kept = messages.slice(0, lastUserIdx + 1);
        setMessages(kept);
        setIsTyping(true);
        const reply = await ask(kept[lastUserIdx].content, kept);
        setMessages((prev) => [...prev, reply]);
        setIsTyping(false);
    };

    const copy = async (m: ChatMessage) => {
        try { await navigator.clipboard.writeText(m.content.replace(/\*\*/g, '')); setCopiedId(m.id); setTimeout(() => setCopiedId(null), 1500); } catch { /* ignore */ }
    };

    const lastAssistantId = [...messages].reverse().find((m) => m.role === 'assistant')?.id;
    const widthCls = expanded ? 'max-w-[560px]' : 'max-w-[420px]';

    return (
        <>
            <AnimatePresence>
                {!isOpen && (
                    <motion.button
                        initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.85, opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        onClick={() => setIsOpen(true)}
                        title="Open Semester AI Assistant"
                        data-tooltip-pos="left"
                        className="no-fluid fixed bottom-24 md:bottom-6 right-5 md:right-6 z-50 w-12 h-12 rounded-full flex items-center justify-center btn-gradient cursor-pointer"
                    >
                        <SemesterAIIcon className="w-5 h-5" />
                    </motion.button>
                )}
            </AnimatePresence>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 8, scale: 0.97 }}
                        transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                        ref={panelRef}
                        className={`fixed bottom-24 md:bottom-6 right-4 md:right-6 z-[9999] w-[calc(100vw-32px)] ${widthCls} ${expanded ? 'h-[680px]' : 'h-[580px]'} max-h-[calc(100vh-48px)] flex flex-col overflow-hidden rounded-[26px] liquid-glass-overlay text-on-surface transition-[max-width,height] duration-200`}
                    >
                        <div className="h-[2.5px] w-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 shrink-0" />

                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-on-surface/[0.08] bg-on-surface/[0.02]">
                            <div className="flex items-center gap-2.5">
                                <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br from-indigo-500 via-violet-500 to-cyan-500 text-white">
                                    <SemesterAIIcon className="w-4 h-4" />
                                </div>
                                <div>
                                    <h3 className="font-display font-bold text-sm leading-none">Semester AI</h3>
                                    <span className="text-[10px] text-on-surface-variant mt-1 flex items-center gap-1 font-medium">
                                        <Database size={10} className="text-emerald-500" />
                                        {desktop
                                            ? aiConfig?.provider === 'gemini' && aiConfig.has_gemini_key
                                                ? `Gemini · ${aiConfig.gemini_model}`
                                                : aiConfig?.provider === 'groq' && aiConfig.has_groq_key
                                                ? `Groq · ${aiConfig.groq_model}`
                                                : `Local SQLite · Sem ${currentSemester}`
                                            : 'Academic Assistant'}
                                    </span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {desktop && (
                                    <button
                                        onClick={() => {
                                            setIsOpen(false);
                                            navigate('/settings?tab=ai');
                                        }}
                                        title="Configure Gemini / Groq API Keys"
                                        className="no-fluid w-7 h-7 rounded-full text-on-surface-variant hover:text-primary hover:bg-primary/10 flex items-center justify-center cursor-pointer"
                                    >
                                        <SettingsIcon className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                {messages.length > 0 && (
                                    <button onClick={() => setMessages([])} title="New chat" className="no-fluid w-7 h-7 rounded-full text-on-surface-variant hover:text-rose-500 hover:bg-rose-500/10 flex items-center justify-center cursor-pointer">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                <button onClick={() => setExpanded((v) => !v)} title={expanded ? 'Compact' : 'Expand'} className="no-fluid hidden md:flex w-7 h-7 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.1] items-center justify-center cursor-pointer">
                                    {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => setIsOpen(false)} title="Close (Esc)" className="no-fluid w-7 h-7 rounded-full bg-on-surface/[0.07] text-on-surface-variant hover:text-on-surface hover:bg-on-surface/[0.14] flex items-center justify-center cursor-pointer">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        <div
                            ref={scrollRef}
                            onScroll={() => {
                                const el = scrollRef.current;
                                if (el) setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
                            }}
                            className="flex-1 px-4 sm:px-5 pt-4 pb-6 custom-scrollbar overflow-y-auto overflow-x-hidden space-y-4"
                        >
                            {messages.length === 0 && (
                                <div className="space-y-4">
                                    <div className="text-center pt-1">
                                        <div className="w-11 h-11 mx-auto rounded-2xl flex items-center justify-center bg-primary/12 border border-primary/25 text-primary mb-2">
                                            <MessageSquareText className="w-5 h-5" />
                                        </div>
                                        <p className="font-display text-base font-bold">How can I help today?</p>
                                        <p className="text-on-surface-variant text-xs mt-0.5">Pick a starter or type your own question.</p>
                                    </div>
                                    {PROMPT_GROUPS.map((g) => {
                                        const Icon = g.icon;
                                        return (
                                            <div key={g.title}>
                                                <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-on-surface-variant/70 mb-1.5 px-1">
                                                    <Icon size={11} className="text-primary" /> {g.title}
                                                </p>
                                                <div className="space-y-1.5">
                                                    {g.prompts.map((q) => (
                                                        <button key={q} type="button" onClick={() => void handleSend(q)}
                                                            className="no-fluid group w-full text-left px-3.5 py-2 rounded-2xl bg-on-surface/[0.04] hover:bg-primary/12 border border-on-surface/[0.09] hover:border-primary/30 text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer transition-colors">
                                                            <span>{q}</span>
                                                            <ArrowUpRight size={13} className="text-on-surface-variant group-hover:text-primary shrink-0" />
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {messages.map((msg) => (
                                <div key={msg.id} className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                    {msg.role === 'user' ? (
                                        <div className="max-w-[84%] px-3.5 py-2 rounded-2xl rounded-tr-sm bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-xs font-medium whitespace-pre-wrap">{msg.content}</div>
                                    ) : (
                                        <div className="group/msg flex gap-2.5 items-start w-full min-w-0">
                                            <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 text-white flex items-center justify-center shrink-0 mt-0.5">
                                                <SemesterAIIcon className="w-3.5 h-3.5" />
                                            </div>
                                            <div className="flex-1 min-w-0 overflow-hidden">
                                                <div className={`text-xs leading-relaxed break-words ${msg.error ? 'text-rose-500' : ''}`}>
                                                    {msg.error ? msg.content : renderMarkdown(msg.content)}
                                                </div>
                                                {!msg.error && (
                                                    <div className="mt-1.5 flex items-center gap-1 opacity-0 group-hover/msg:opacity-100 focus-within:opacity-100 transition-opacity">
                                                        <button onClick={() => void copy(msg)} title="Copy" className="no-fluid h-6 px-2 rounded-full text-[10px] font-bold text-on-surface-variant hover:text-primary hover:bg-primary/10 inline-flex items-center gap-1 cursor-pointer">
                                                            {copiedId === msg.id ? <Check size={11} className="text-emerald-500" /> : <Copy size={11} />} {copiedId === msg.id ? 'Copied' : 'Copy'}
                                                        </button>
                                                        {msg.id === lastAssistantId && (
                                                            <button onClick={() => void regenerate()} title="Regenerate" className="no-fluid h-6 px-2 rounded-full text-[10px] font-bold text-on-surface-variant hover:text-primary hover:bg-primary/10 inline-flex items-center gap-1 cursor-pointer">
                                                                <RotateCcw size={11} /> Regenerate
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                                {msg.id === lastAssistantId && !isTyping && msg.suggestions && msg.suggestions.length > 0 && (
                                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                                        {msg.suggestions.map((s) => (
                                                            <button key={s} onClick={() => void handleSend(s)}
                                                                className="no-fluid px-3 py-1.5 rounded-full border border-primary/25 bg-primary/[0.07] hover:bg-primary/15 text-[11px] font-semibold text-primary cursor-pointer transition-colors">
                                                                {s}
                                                            </button>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {isTyping && (
                                <div className="flex gap-2.5 items-center">
                                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-indigo-500 to-cyan-500 text-white flex items-center justify-center shrink-0"><SemesterAIIcon className="w-3.5 h-3.5" /></div>
                                    <div className="px-3.5 py-2 rounded-full bg-on-surface/[0.06] border border-on-surface/[0.10] flex items-center gap-1.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: '0ms' }} />
                                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '120ms' }} />
                                        <span className="w-1.5 h-1.5 rounded-full bg-violet-400 animate-bounce" style={{ animationDelay: '240ms' }} />
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} className="h-1" />
                        </div>

                        {showScrollBtn && (
                            <button onClick={scrollToBottom} data-tooltip="Scroll to latest message" className="no-fluid absolute bottom-[78px] right-4 w-8 h-8 rounded-full liquid-glass-pill flex items-center justify-center z-10 cursor-pointer shadow-md">
                                <ChevronDown className="w-4 h-4 text-primary" />
                            </button>
                        )}

                        <div className="relative px-4 py-3 border-t border-on-surface/[0.08]">
                            <AnimatePresence>
                                {menuOpen && (
                                    <motion.div
                                        initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                                        transition={{ duration: 0.12 }}
                                        className="absolute bottom-full left-3 right-3 mb-2 max-h-[300px] overflow-y-auto custom-scrollbar rounded-2xl liquid-glass-overlay p-2 space-y-2"
                                    >
                                        {PROMPT_GROUPS.map((g) => (
                                            <div key={g.title}>
                                                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/70">{g.title}</p>
                                                {g.prompts.map((q) => (
                                                    <button key={q} onClick={() => void handleSend(q)} className="no-fluid w-full text-left px-2.5 py-1.5 rounded-xl text-xs font-semibold hover:bg-primary/12 hover:text-primary cursor-pointer">{q}</button>
                                                ))}
                                            </div>
                                        ))}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                            <div className="flex items-end gap-2 rounded-[20px] border border-on-surface/[0.12] bg-on-surface/[0.05] focus-within:border-primary transition-colors px-2 py-1.5">
                                <button type="button" onClick={() => setMenuOpen((v) => !v)} title="Suggested questions"
                                    className={`no-fluid w-8 h-8 rounded-full flex items-center justify-center shrink-0 cursor-pointer transition-colors ${menuOpen ? 'bg-primary/15 text-primary' : 'text-on-surface-variant hover:text-primary hover:bg-primary/10'}`}>
                                    <LayoutGrid size={15} />
                                </button>
                                <textarea
                                    ref={textareaRef}
                                    rows={1}
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
                                    placeholder="Message Semester AI…"
                                    className="flex-1 resize-none !bg-transparent !border-none !shadow-none outline-none focus:!ring-0 py-1.5 text-xs text-on-surface placeholder:text-on-surface-variant/60 font-medium max-h-[120px]"
                                />
                                <button onClick={() => void handleSend()} disabled={!input.trim() || isTyping}
                                    data-tooltip="Send message (Enter)"
                                    className={`no-fluid w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-opacity cursor-pointer ${input.trim() && !isTyping ? 'btn-gradient' : 'text-on-surface-variant/40 opacity-40 cursor-not-allowed'}`}>
                                    <Send className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default AIChat;
