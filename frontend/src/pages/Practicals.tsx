import React, { useCallback, useState, useEffect, useRef } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Plus, Minus, Edit2, Target } from 'lucide-react';
import { useToast } from '@/components/ui/toast-context';
import { attendanceService } from '@/services/attendance.service';
import { useSemester } from '@/contexts/semester-context';
import type { Subject } from '@/types';
import EditSubjectModal from '@/components/modals/EditSubjectModal';

const NOTION_COLORS = [
    { bgLight: '#f1f1ef', textLight: '#37352f', borderLight: '#e9e9e6', bgDark: '#252525', textDark: '#9b9a97', borderDark: '#2a2a2a' }, // gray
    { bgLight: '#f8ecdf', textLight: '#c27c38', borderLight: '#f1dfcd', bgDark: '#3f2c1e', textDark: '#e79e50', borderDark: '#4d3826' }, // brown
    { bgLight: '#faebd9', textLight: '#d9730d', borderLight: '#f6d5b3', bgDark: '#432912', textDark: '#ffa344', borderDark: '#533418' }, // orange
    { bgLight: '#fbf3db', textLight: '#dfab01', borderLight: '#f7e3a6', bgDark: '#443d1a', textDark: '#ffdc4f', borderDark: '#564d23' }, // yellow
    { bgLight: '#eddffc', textLight: '#6940a5', borderLight: '#decbf7', bgDark: '#2d2238', textDark: '#b390e6', borderDark: '#3b2d49' }, // purple
    { bgLight: '#ebdff9', textLight: '#9065b0', borderLight: '#dfccf3', bgDark: '#301c3f', textDark: '#cfa6f3', borderDark: '#3d254f' }, // violet
    { bgLight: '#dff1eb', textLight: '#1d825c', borderLight: '#cbe7dc', bgDark: '#1a3229', textDark: '#52c49c', borderDark: '#234438' }, // green
    { bgLight: '#e0ecfc', textLight: '#0b6e99', borderLight: '#cbe0fa', bgDark: '#182f42', textDark: '#529cca', borderDark: '#223f59' }, // blue
    { bgLight: '#fbe4e4', textLight: '#c41d1d', borderLight: '#f6c7c7', bgDark: '#451a1a', textDark: '#ff7373', borderDark: '#572323' }, // red
    { bgLight: '#fdecf2', textLight: '#ad1a72', borderLight: '#fad0e2', bgDark: '#40182c', textDark: '#f26fb6', borderDark: '#512239' }, // pink
];

type TrackerKind = 'practicals' | 'assignments';
type TrackerUpdate = { total?: number; completed?: number; hardcopy?: boolean };

function getNotionTagStyles(text: string) {
    if (!text) return { className: '', style: {} };
    let hash = 0;
    const cleanText = text.trim();
    for (let i = 0; i < cleanText.length; i++) {
        hash = cleanText.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % NOTION_COLORS.length;
    const color = NOTION_COLORS[idx];
    return {
        style: {
            '--tag-bg-light': color.bgLight,
            '--tag-text-light': color.textLight,
            '--tag-border-light': color.borderLight,
            '--tag-bg-dark': color.bgDark,
            '--tag-text-dark': color.textDark,
            '--tag-border-dark': color.borderDark,
        } as React.CSSProperties,
        className: 'bg-[var(--tag-bg-light)] dark:bg-[var(--tag-bg-dark)] text-[var(--tag-text-light)] dark:text-[var(--tag-text-dark)] border border-[var(--tag-border-light)] dark:border-[var(--tag-border-dark)]'
    };
}

const Practicals: React.FC = () => {
    const { showToast } = useToast();
    const { currentSemester } = useSemester();
    const [loading, setLoading] = useState(true);
    const [subjects, setSubjects] = useState<Subject[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<string>('All');
    const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
    const [processingTrackers, setProcessingTrackers] = useState<Set<string>>(new Set());
    const subjectsRef = useRef<Subject[]>([]);
    const saveTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
    const saveChainsRef = useRef(new Map<string, Promise<void>>());
    const saveVersionsRef = useRef(new Map<string, number>());

    usePageMeta({
        title: 'Practicals & Assignments | Semester',
        description: 'Track practical records and assignment milestones across all your subjects.',
    });

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const data = await attendanceService.getFullSubjectsData(currentSemester);
            subjectsRef.current = data;
            setSubjects(data);
        } catch (error) {
            console.error(error);
            showToast('error', 'Sync Failed');
        } finally {
            setLoading(false);
        }
    }, [currentSemester, showToast]);

    useEffect(() => { void loadData(); }, [loadData]);

    const queueTrackerUpdate = (kind: TrackerKind, id: string | undefined, updates: TrackerUpdate) => {
        if (!id) {
            showToast('error', 'Subject identifier is missing');
            return;
        }
        const subjectId = String(id);
        const processingKey = `${subjectId}:${kind}`;
        let nextTracker: TrackerUpdate | null = null;
        const nextSubjects = subjectsRef.current.map(sub => {
            const subId = String(sub._id || sub.id || '');
            if (subId === subjectId) {
                const current = sub[kind] || (kind === 'practicals'
                    ? { total: 10, completed: 0, hardcopy: false }
                    : { total: 4, completed: 0, hardcopy: false });
                nextTracker = {
                    ...current,
                    ...updates,
                    total: updates.total ?? current.total,
                    completed: updates.completed ?? current.completed,
                    hardcopy: updates.hardcopy ?? current.hardcopy,
                };
                return {
                    ...sub,
                    [kind]: nextTracker,
                };
            }
            return sub;
        });

        if (!nextTracker) return;
        subjectsRef.current = nextSubjects;
        setSubjects(nextSubjects);

        const nextVersion = (saveVersionsRef.current.get(processingKey) || 0) + 1;
        saveVersionsRef.current.set(processingKey, nextVersion);
        const existingTimer = saveTimersRef.current.get(processingKey);
        if (existingTimer) clearTimeout(existingTimer);

        const timer = setTimeout(() => {
            saveTimersRef.current.delete(processingKey);
            const payload = nextTracker!;
            const previousSave = saveChainsRef.current.get(processingKey) || Promise.resolve();
            setProcessingTrackers(prev => {
                const next = new Set(prev);
                next.add(processingKey);
                return next;
            });

            const save = previousSave.catch(() => undefined).then(async () => {
                try {
                    if (kind === 'practicals') {
                        await attendanceService.updatePracticals(subjectId, payload);
                    } else {
                        await attendanceService.updateAssignments(subjectId, payload);
                    }
                } catch {
                    if (saveVersionsRef.current.get(processingKey) === nextVersion) {
                        showToast('error', 'Could not sync the latest counter. Reloading verified data.');
                        await loadData();
                    }
                } finally {
                    if (saveVersionsRef.current.get(processingKey) === nextVersion) {
                        setProcessingTrackers(prev => {
                            const next = new Set(prev);
                            next.delete(processingKey);
                            return next;
                        });
                    }
                }
            });
            saveChainsRef.current.set(processingKey, save);
        }, 220);
        saveTimersRef.current.set(processingKey, timer);
    };

    const handleUpdate = (id: string | undefined, updates: TrackerUpdate) => queueTrackerUpdate('practicals', id, updates);
    const handleAssignmentUpdate = (id: string | undefined, updates: TrackerUpdate) => queueTrackerUpdate('assignments', id, updates);

    const filteredSubjects = subjects.filter(sub => {
        const cats = sub.categories || (sub.category ? [sub.category] : ['Theory']);
        if (selectedCategory === 'All') {
            return cats.includes('Practical') || cats.includes('Assignment');
        }
        return cats.includes(selectedCategory);
    });

    const categories = ['All', 'Theory', 'Practical', 'Assignment'];

    return (
        <div className="max-w-6xl mx-auto pb-24 select-none">
            {/* Page Header */}
            <div className="mb-8">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 mb-2">
                    Tracking / Practicals
                </p>
                <div className="flex items-center justify-between">
                    <h1 className="text-2xl font-bold text-on-surface tracking-tight">Practicals &amp; Assignments</h1>
                </div>
                {/* Category tabs */}
                <div className="flex gap-0 border-b border-outline/30 mt-4 overflow-x-auto no-scrollbar">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-all whitespace-nowrap cursor-pointer ${
                                selectedCategory === cat
                                    ? 'border-on-surface text-on-surface font-bold'
                                    : 'border-transparent text-on-surface-variant/40 hover:text-on-surface-variant hover:border-outline/40'
                            }`}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                /* Non-blocking skeletons */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="animate-pulse h-48 bg-surface-container border border-outline/40 rounded-xl" />
                    ))}
                </div>
            ) : (
                /* Subject Grid */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    <AnimatePresence mode="popLayout">
                        {filteredSubjects.map((subject, index) => {
                            const cats = subject.categories || (subject.category ? [subject.category] : ['Theory']);
                            const hasPracticals = cats.includes('Practical');
                            const hasAssignments = cats.includes('Assignment');
                            const p = subject.practicals || { total: 10, completed: 0, hardcopy: false };
                            const a = subject.assignments || { total: 4, completed: 0, hardcopy: false };
                            const practicalsBusy = processingTrackers.has(`${String(subject._id)}:practicals`);
                            const assignmentsBusy = processingTrackers.has(`${String(subject._id)}:assignments`);

                            let total = 0; let done = 0;
                            if (hasPracticals) { total += p.total; done += p.completed; }
                            if (hasAssignments) { total += a.total; done += a.completed; }
                            const progress = total > 0 ? (done / total) * 100 : 0;

                            return (
                                <motion.div key={subject._id || subject.id || subject.name} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ delay: index * 0.04 }}>
                                    <div className="h-full rounded-xl border border-outline/50 bg-surface p-5 relative overflow-hidden hover:border-on-surface/20 transition-all flex flex-col justify-between min-h-[180px] shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
                                        <div>
                                            <div className="flex justify-between items-start mb-3 pt-1">
                                                <div className="min-w-0 flex-1">
                                                    <h3 className="text-xs font-bold text-on-surface truncate pr-2">{subject.name}</h3>
                                                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                        {cats.filter(c => c !== 'Theory' && c !== 'Project').map(c => {
                                                            const tag = getNotionTagStyles(c);
                                                            return (
                                                                <span key={c} className={`px-1.5 py-0.5 rounded-md text-[8px] font-bold uppercase tracking-wider ${tag.className}`} style={tag.style}>{c}</span>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                                <button onClick={() => setEditingSubject(subject)} className="w-7 h-7 rounded-md border border-outline/50 bg-surface flex items-center justify-center text-on-surface-variant/70 hover:text-on-surface hover:bg-surface-container transition-all cursor-pointer flex-shrink-0 ml-2 shadow-sm">
                                                    <Edit2 size={11} />
                                                </button>
                                            </div>

                                            <div className="space-y-4 my-4">
                                                {hasPracticals && (
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/40">
                                                                Practicals Progress{practicalsBusy ? ' · Syncing' : ''}
                                                            </span>
                                                            <span className="text-xs font-bold text-on-surface font-mono">{p.completed}/{p.total}</span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button disabled={p.completed <= 0} onClick={() => handleUpdate(subject._id || subject.id, { completed: p.completed - 1 })} className="flex-1 h-7 rounded-md bg-surface-container/50 border border-outline text-on-surface hover:bg-surface-container disabled:opacity-30 transition-all flex items-center justify-center cursor-pointer active:scale-95">
                                                                <Minus size={11} />
                                                            </button>
                                                            <button disabled={p.completed >= p.total} onClick={() => handleUpdate(subject._id || subject.id, { completed: p.completed + 1 })} className="flex-1 h-7 rounded-md bg-surface-container/50 border border-outline text-on-surface hover:bg-surface-container disabled:opacity-30 transition-all flex items-center justify-center cursor-pointer active:scale-95">
                                                                <Plus size={11} />
                                                            </button>
                                                        </div>
                                                        <button onClick={() => handleUpdate(subject._id || subject.id, { hardcopy: !p.hardcopy })} className={`w-full py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] ${p.hardcopy ? 'bg-emerald-100 border border-emerald-300 text-emerald-700 dark:bg-emerald-500/20 dark:border-emerald-500/30 dark:text-emerald-400 font-bold' : 'bg-surface-container/30 border border-outline text-on-surface-variant/60 hover:border-outline-variant hover:text-on-surface hover:bg-surface-container'}`}>
                                                            {p.hardcopy ? <><CheckCircle size={11} /> Submitted</> : <><Target size={11} /> Mark Submitted</>}
                                                        </button>
                                                    </div>
                                                )}

                                                {hasPracticals && hasAssignments && <div className="h-px bg-outline/30" />}

                                                {hasAssignments && (
                                                    <div className="space-y-2">
                                                        <div className="flex justify-between items-center">
                                                            <span className="text-[9px] font-bold uppercase tracking-widest text-on-surface-variant/40">
                                                                Assignments Progress{assignmentsBusy ? ' · Syncing' : ''}
                                                            </span>
                                                            <span className="text-xs font-bold text-on-surface font-mono">{a.completed}/{a.total}</span>
                                                        </div>
                                                        <div className="flex gap-2">
                                                            <button disabled={a.completed <= 0} onClick={() => handleAssignmentUpdate(subject._id || subject.id, { completed: a.completed - 1 })} className="flex-1 h-7 rounded-md bg-surface-container/50 border border-outline text-on-surface hover:bg-surface-container disabled:opacity-30 transition-all flex items-center justify-center cursor-pointer active:scale-95">
                                                                <Minus size={11} />
                                                            </button>
                                                            <button disabled={a.completed >= a.total} onClick={() => handleAssignmentUpdate(subject._id || subject.id, { completed: a.completed + 1 })} className="flex-1 h-7 rounded-md bg-surface-container/50 border border-outline text-on-surface hover:bg-surface-container disabled:opacity-30 transition-all flex items-center justify-center cursor-pointer active:scale-95">
                                                                <Plus size={11} />
                                                            </button>
                                                        </div>
                                                        <button onClick={() => handleAssignmentUpdate(subject._id || subject.id, { hardcopy: !a.hardcopy })} className={`w-full py-1.5 rounded-md text-[9px] font-bold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer active:scale-[0.98] ${a.hardcopy ? 'bg-emerald-100 border border-emerald-300 text-emerald-700 dark:bg-emerald-500/20 dark:border-emerald-500/30 dark:text-emerald-400 font-bold' : 'bg-surface-container/30 border border-outline text-on-surface-variant/60 hover:border-outline-variant hover:text-on-surface hover:bg-surface-container'}`}>
                                                            {a.hardcopy ? <><CheckCircle size={11} /> Submitted</> : <><Target size={11} /> Mark Submitted</>}
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* bottom progress line */}
                                        <div className="h-0.5 w-full bg-on-surface/5 rounded-full overflow-hidden mt-3">
                                            <div className="h-full bg-on-surface" style={{ width: `${progress}%` }} />
                                        </div>
                                    </div>
                                </motion.div>
                            );
                        })}
                    </AnimatePresence>
                </div>
            )}

            {editingSubject && <EditSubjectModal isOpen={!!editingSubject} onClose={() => setEditingSubject(null)} subject={editingSubject} onSuccess={loadData} />}
        </div>
    );
};

export default Practicals;

