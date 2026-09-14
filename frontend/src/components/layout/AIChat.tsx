import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, X, ChevronDown, Trash2 } from 'lucide-react';
import api from '@/services/api';
import { useSemester } from '@/contexts/semester-context';
import { getErrorMessage } from '@/utils/errors';

// Custom Stark Minimalist Sparkle Star Prism Icon
export const SemesterAIIcon: React.FC<{ className?: string }> = ({ className = "w-6 h-6" }) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
        <path d="M12 2L15 9L22 12L15 15L12 22L9 15L2 12L9 9Z" className="fill-none stroke-current" />
        <circle cx="12" cy="12" r="1.5" className="fill-current animate-pulse" />
    </svg>
);

// Lightweight markdown → JSX for AI messages (Theme aware)
const renderMarkdown = (text: string) => {
    return text.split('\n').map((line, i) => {
        // Bold **text**
        const parts = line.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
            if (part.startsWith('**') && part.endsWith('**')) {
                return <strong key={j} className="font-black text-on-surface">{part.slice(2, -2)}</strong>;
            }
            return <span key={j}>{part}</span>;
        });

        // Bullet points
        const trimmed = line.trim();
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
            const contentOnly = line.replace(/^[\s-•]+/, '');
            const subparts = contentOnly.split(/(\*\*[^*]+\*\*)/g).map((part, j) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                    return <strong key={j} className="font-black text-on-surface">{part.slice(2, -2)}</strong>;
                }
                return <span key={j}>{part}</span>;
            });
            return (
                <div key={i} className="flex gap-2 ml-1 my-1">
                    <span className="text-on-surface-variant/40 shrink-0">•</span>
                    <span>{subparts}</span>
                </div>
            );
        }

        // Empty lines become spacing
        if (!trimmed) return <div key={i} className="h-2" />;

        return <div key={i} className="my-0.5">{parts}</div>;
    });
};

interface ChatMessage {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    error?: boolean;
}



const AIChat: React.FC = () => {
    const { currentSemester } = useSemester();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isTyping, isOpen]);

    const handleScroll = () => {
        if (!scrollContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
        setShowScrollBtn(scrollHeight - scrollTop - clientHeight > 100);
    };

    // Close panel on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [isOpen]);

    const handleSend = async (text?: string) => {
        const msg = (text || input).trim();
        if (!msg || isTyping) return;

        const userMsg: ChatMessage = {
            id: Date.now().toString(),
            role: 'user',
            content: msg,
            timestamp: new Date()
        };

        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setIsTyping(true);

        try {
            const history = messages
                .slice(-10)
                .map(m => ({ role: m.role, content: m.content }));

            const response = await api.post('/api/ai/chat_v2', {
                message: msg,
                history,
                selectedSemester: currentSemester,
            });

            const aiContent = response.data?.data?.response || 'Sorry, I couldn\'t process that. Try again!';

            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: aiContent,
                timestamp: new Date()
            }]);
        } catch (err: unknown) {
            const errorMsg = getErrorMessage(err, 'Something went wrong. Please try again.');
            setMessages(prev => [...prev, {
                id: (Date.now() + 1).toString(),
                role: 'assistant',
                content: errorMsg,
                timestamp: new Date(),
                error: true,
            }]);
        } finally {
            setIsTyping(false);
        }
    };

    const clearChat = () => {
        setMessages([]);
    };

    return (
        <>
            {/* ── Floating Button ─────────────────────────────────── */}
            <AnimatePresence>
                {!isOpen && (
                    <motion.button
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        whileHover={{ scale: 1.05, y: -2 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => setIsOpen(true)}
                        className="fixed bottom-6 right-6 lg:right-8 z-40 w-14 h-14 rounded-full flex items-center justify-center bg-on-surface text-surface border-2 border-on-surface shadow-[0_8px_30px_rgba(0,0,0,0.15)] dark:shadow-[0_8px_30px_rgba(255,255,255,0.05)] hover:opacity-90 transition-all cursor-pointer"
                    >
                        <SemesterAIIcon className="w-6 h-6" />
                    </motion.button>
                )}
            </AnimatePresence>

            {/* ── Chat Panel ──────────────────────────────────────── */}
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 24, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 24, scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 380, damping: 28 }}
                        ref={panelRef}
                        className="fixed bottom-[84px] right-6 lg:right-8 z-[9999] w-[calc(100vw-32px)] max-w-[380px] h-[550px] max-h-[calc(100vh-120px)] flex flex-col overflow-hidden rounded-xl bg-surface border border-outline shadow-2xl text-on-surface"
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-5 py-3.5 border-b border-outline bg-surface">
                            <div className="flex items-center gap-2.5">
                                <div className="w-7.5 h-7.5 rounded-lg flex items-center justify-center bg-on-surface text-surface border border-on-surface">
                                    <SemesterAIIcon className="w-4 h-4" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-1.5 leading-none">
                                        <h3 className="font-bold text-xs text-on-surface">Semester AI</h3>
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                    </div>
                                    <span className="text-[8px] text-on-surface-variant/40 mt-1 block uppercase tracking-wider font-semibold">Assistant</span>
                                </div>
                            </div>
                            <div className="flex items-center gap-1">
                                {messages.length > 0 && (
                                    <button onClick={clearChat} className="p-1.5 text-on-surface-variant/40 hover:text-on-surface hover:bg-surface-container rounded-lg transition-all cursor-pointer" title="Wipe session">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                                <button onClick={() => setIsOpen(false)} className="p-1.5 text-on-surface-variant/40 hover:text-on-surface hover:bg-surface-container rounded-lg transition-all cursor-pointer">
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        </div>

                        {/* Messages */}
                        <div
                            ref={scrollContainerRef}
                            onScroll={handleScroll}
                            className={`flex-1 px-5 py-4 custom-scrollbar bg-surface ${
                                messages.length === 0
                                    ? 'overflow-hidden flex flex-col justify-center'
                                    : 'overflow-y-auto space-y-5'
                            }`}
                        >
                            {/* Empty State */}
                            {messages.length === 0 && (
                                <div className="flex flex-col items-center justify-center gap-5">
                                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-surface border border-outline shadow-sm">
                                        <SemesterAIIcon className="w-5 h-5 text-on-surface" />
                                    </div>
                                    <div className="text-center space-y-1">
                                        <p className="text-on-surface text-sm font-bold tracking-tight">How can I help you today?</p>
                                        <p className="text-on-surface-variant/40 text-[10px] max-w-[240px] leading-normal font-medium">Ask about attendance, pending class blocks, tracker submissions, schedules, or recent activity.</p>
                                    </div>
                                </div>
                            )}

                            {/* Message Bubbles */}
                            {messages.map((msg) => (
                                <div
                                    key={msg.id}
                                    className={`flex w-full ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                >
                                    {msg.role === 'user' ? (
                                        <div className="max-w-[80%] px-4 py-2.5 rounded-xl rounded-tr-sm bg-surface-container border border-outline text-on-surface text-xs font-semibold shadow-xs">
                                            {msg.content}
                                        </div>
                                    ) : (
                                        <div className="flex gap-3 items-start w-full">
                                            <div className="w-6 h-6 rounded-full bg-on-surface text-surface flex items-center justify-center shrink-0 mt-0.5 border border-on-surface shadow-sm">
                                                <SemesterAIIcon className="w-3.5 h-3.5" />
                                            </div>
                                            <div className={`flex-1 text-xs leading-relaxed text-on-surface pr-4 ${msg.error ? 'text-red-500 font-mono' : ''}`}>
                                                {msg.error ? msg.content : renderMarkdown(msg.content)}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {/* Typing Indicator */}
                            {isTyping && (
                                <div className="flex gap-3 items-start w-full">
                                    <div className="w-6 h-6 rounded-full bg-on-surface text-surface flex items-center justify-center shrink-0 mt-0.5 border border-on-surface shadow-sm">
                                        <SemesterAIIcon className="w-3.5 h-3.5 animate-spin" />
                                    </div>
                                    <div className="px-3.5 py-2 rounded-xl bg-surface border border-outline flex items-center gap-2 shadow-sm font-mono text-[9px] uppercase text-on-surface-variant/40">
                                        <span className="relative flex h-1.5 w-1.5 shrink-0">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-on-surface/40 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-on-surface"></span>
                                        </span>
                                        <span>Analyzing Database...</span>
                                    </div>
                                </div>
                            )}

                            {/* Scroll anchor */}
                            {messages.length > 0 && <div ref={messagesEndRef} className="h-2" />}
                        </div>

                        {showScrollBtn && (
                            <button onClick={scrollToBottom} className="absolute bottom-[84px] left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-surface border border-outline flex items-center justify-center shadow-lg hover:bg-surface-container transition-all z-10 cursor-pointer">
                                <ChevronDown className="w-5 h-5 text-on-surface-variant" />
                            </button>
                        )}

                        {/* Input Area */}
                        <div className="px-4 py-4 border-t border-outline bg-surface">
                            <div className="relative flex items-center">
                                <input
                                    type="text"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
                                    placeholder="Message Semester AI..."
                                    className="flex-1 bg-surface border border-outline rounded-lg py-2.5 pl-4 pr-12 text-xs text-on-surface placeholder:text-on-surface-variant/30 focus:outline-none focus:border-on-surface/50 transition-all font-medium"
                                />
                                <button
                                    onClick={() => handleSend()}
                                    disabled={!input.trim() || isTyping}
                                    className={`absolute right-1.5 w-8 h-8 rounded-full flex items-center justify-center transition-all cursor-pointer ${input.trim() && !isTyping ? 'bg-on-surface text-surface hover:opacity-90' : 'text-on-surface-variant/20 opacity-40 cursor-not-allowed'}`}
                                >
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


