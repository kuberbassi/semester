import React, { useCallback, useState, useEffect, useRef } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { CheckCircle, Plus, Minus, Edit2, Target, Beaker, Activity } from 'lucide-react';
import { useToast } from '@/components/ui/toast-context';
import { attendanceService } from '@/services/attendance.service';
import PageHeader from '@/components/ui/PageHeader';
import { RubberSegment, CometDial } from '@/components/react-bits';
import { useSemester } from '@/contexts/semester-context';
import type { Subject } from '@/types';
import EditSubjectModal from '@/components/modals/EditSubjectModal';

type TrackerKind = 'practicals' | 'assignments';
type TrackerUpdate = { total?: number; completed?: number; hardcopy?: boolean };

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
                return { ...sub, [kind]: nextTracker };
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
                        showToast('error', 'Could not sync the latest counter.');
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
        }, 200);
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

    const overallStats = filteredSubjects.reduce(
        (acc, sub) => {
            const cats = sub.categories || (sub.category ? [sub.category] : ['Theory']);
            if (cats.includes('Practical')) {
                const p = sub.practicals || { total: 10, completed: 0, hardcopy: false };
                acc.total += p.total;
                acc.done += p.completed;
                if (p.hardcopy) acc.submitted += 1;
            }
            if (cats.includes('Assignment')) {
                const a = sub.assignments || { total: 4, completed: 0, hardcopy: false };
                acc.total += a.total;
                acc.done += a.completed;
                if (a.hardcopy) acc.submitted += 1;
            }
            return acc;
        },
        { total: 0, done: 0, submitted: 0 }
    );
    const overallPct = overallStats.total > 0 ? Math.round((overallStats.done / overallStats.total) * 100) : 0;

    const categories = ['All', 'Theory', 'Practical', 'Assignment'];

    return (
        <div className="w-full pb-12 select-none">
            <PageHeader
                title="Practicals"
                icon={Beaker}
                badge={`${overallPct}% done`}
                actions={
                    <RubberSegment
                        options={categories.map(cat => ({ id: cat, label: cat }))}
                        value={selectedCategory}
                        onChange={setSelectedCategory}
                        size="sm"
                        layoutId="practicals-cat-rubber"
                    />
                }
            />

            {/* Overall Lab & Submission Pulse Banner */}
            {!loading && filteredSubjects.length > 0 && (
                <div className="liquid-hero-banner rounded-[24px] p-5 sm:p-6 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-primary mb-1">
                            <Activity size={13} />
                            Lab &amp; Submission Momentum
                        </div>
                        <p className="font-display text-2xl font-extrabold text-on-surface tabular-nums">
                            {overallStats.done} <span className="text-on-surface-variant font-semibold text-base">/ {overallStats.total} items completed</span>
                        </p>
                        <div className="mt-3 h-2 max-w-md rounded-full bg-on-surface/[0.09] overflow-hidden">
                            <div
                                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-cyan-400 transition-all duration-300"
                                style={{ width: `${overallPct}%` }}
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3 shrink-0">
                        <div className="min-w-[104px] px-4 py-3 rounded-2xl bg-surface/75 dark:bg-white/[0.04] border border-on-surface/[0.09] text-center">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Files</span>
                            <span className="font-display text-xl font-extrabold text-primary tabular-nums mt-0.5 block">{overallStats.submitted}</span>
                        </div>
                        <div className="min-w-[104px] px-4 py-3 rounded-2xl bg-surface/75 dark:bg-white/[0.04] border border-on-surface/[0.09] text-center">
                            <span className="block text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">Subjects</span>
                            <span className="font-display text-xl font-extrabold text-on-surface tabular-nums mt-0.5 block">{filteredSubjects.length}</span>
                        </div>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="animate-pulse h-52 liquid-glass rounded-[24px]" />
                    ))}
                </div>
            ) : filteredSubjects.length === 0 ? (
                <div className="liquid-glass rounded-[26px] py-20 text-center">
                    <Beaker size={26} className="mx-auto mb-3 text-primary/50" />
                    <p className="font-display text-base font-bold text-on-surface">No practicals or assignments here</p>
                    <p className="text-xs text-on-surface-variant/65 mt-1">Switch category filter or add Practical/Assignment tags to a subject.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {filteredSubjects.map((subject) => {
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
                        const progress = total > 0 ? Math.round((done / total) * 100) : 0;

                        return (
                            <div
                                key={subject._id || subject.id || subject.name}
                                className="liquid-glass rounded-[24px] p-5 sm:p-6 flex flex-col justify-between gap-5"
                            >
                                <div className="flex items-start justify-between gap-4">
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap mb-2">
                                            {subject.code && (
                                                <span className="font-mono text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-primary/12 border border-primary/20 text-primary">
                                                    {subject.code}
                                                </span>
                                            )}
                                            {cats.filter(c => c !== 'Theory' && c !== 'Project').map(c => (
                                                <span
                                                    key={c}
                                                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                                        c === 'Practical'
                                                            ? 'bg-cyan-500/14 text-cyan-700 dark:text-cyan-300 border border-cyan-500/25'
                                                            : 'bg-amber-500/14 text-amber-700 dark:text-amber-300 border border-amber-500/25'
                                                    }`}
                                                >
                                                    {c}
                                                </span>
                                            ))}
                                        </div>
                                        <h3 className="font-display text-lg font-extrabold text-on-surface leading-snug">
                                            {subject.name}
                                        </h3>
                                    </div>

                                    <div className="flex items-center gap-2 shrink-0">
                                        <CometDial
                                            value={progress}
                                            size={66}
                                            strokeWidth={6}
                                            color="#6366f1"
                                            secondaryColor="#06b6d4"
                                            tooltip={`${done} of ${total} lab & assignment items completed (${progress}%)`}
                                        />
                                        <button
                                            onClick={() => setEditingSubject(subject)}
                                            className="no-fluid w-8 h-8 rounded-full bg-on-surface/[0.06] hover:bg-primary/15 border border-primary/15 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors cursor-pointer"
                                            title="Configure practical & assignment totals"
                                        >
                                            <Edit2 size={12} />
                                        </button>
                                    </div>
                                </div>

                                <div className="space-y-4">
                                    {hasPracticals && (
                                        <div className="p-3.5 rounded-2xl bg-on-surface/[0.03] border border-primary/12 space-y-2.5">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-bold text-on-surface">
                                                    Lab Experiments{practicalsBusy ? ' · Syncing' : ''}
                                                </span>
                                                <span className="font-mono text-xs font-extrabold text-primary tabular-nums">{p.completed} / {p.total}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    disabled={p.completed <= 0}
                                                    onClick={() => handleUpdate(subject._id || subject.id, { completed: p.completed - 1 })}
                                                    data-tooltip="Decrease completed lab experiments"
                                                    className="no-fluid w-9 h-8 rounded-full bg-surface/80 dark:bg-white/[0.06] border border-primary/18 text-on-surface hover:bg-primary/14 hover:text-primary disabled:opacity-30 flex items-center justify-center cursor-pointer"
                                                >
                                                    <Minus size={12} />
                                                </button>
                                                <button
                                                    disabled={p.completed >= p.total}
                                                    onClick={() => handleUpdate(subject._id || subject.id, { completed: p.completed + 1 })}
                                                    data-tooltip="Increase completed lab experiments"
                                                    className="no-fluid w-9 h-8 rounded-full bg-surface/80 dark:bg-white/[0.06] border border-primary/18 text-on-surface hover:bg-primary/14 hover:text-primary disabled:opacity-30 flex items-center justify-center cursor-pointer"
                                                >
                                                    <Plus size={12} />
                                                </button>
                                                <button
                                                    onClick={() => handleUpdate(subject._id || subject.id, { hardcopy: !p.hardcopy })}
                                                    data-tooltip={p.hardcopy ? 'Click to mark lab file as not yet submitted' : 'Mark physical lab file as submitted'}
                                                    className={`no-fluid flex-1 h-8 rounded-full text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                                        p.hardcopy
                                                            ? 'btn-gradient'
                                                            : 'bg-surface/80 dark:bg-white/[0.05] border border-primary/18 text-on-surface-variant hover:text-primary hover:border-primary/40'
                                                    }`}
                                                >
                                                    {p.hardcopy ? <><CheckCircle size={12} /> File Submitted</> : <><Target size={12} /> Mark Submitted</>}
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {hasAssignments && (
                                        <div className="p-3.5 rounded-2xl bg-on-surface/[0.03] border border-primary/12 space-y-2.5">
                                            <div className="flex justify-between items-center">
                                                <span className="text-xs font-bold text-on-surface">
                                                    Assignments{assignmentsBusy ? ' · Syncing' : ''}
                                                </span>
                                                <span className="font-mono text-xs font-extrabold text-primary tabular-nums">{a.completed} / {a.total}</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    disabled={a.completed <= 0}
                                                    onClick={() => handleAssignmentUpdate(subject._id || subject.id, { completed: a.completed - 1 })}
                                                    data-tooltip="Decrease completed assignments"
                                                    className="no-fluid w-9 h-8 rounded-full bg-surface/80 dark:bg-white/[0.06] border border-primary/18 text-on-surface hover:bg-primary/14 hover:text-primary disabled:opacity-30 flex items-center justify-center cursor-pointer"
                                                >
                                                    <Minus size={12} />
                                                </button>
                                                <button
                                                    disabled={a.completed >= a.total}
                                                    onClick={() => handleAssignmentUpdate(subject._id || subject.id, { completed: a.completed + 1 })}
                                                    data-tooltip="Increase completed assignments"
                                                    className="no-fluid w-9 h-8 rounded-full bg-surface/80 dark:bg-white/[0.06] border border-primary/18 text-on-surface hover:bg-primary/14 hover:text-primary disabled:opacity-30 flex items-center justify-center cursor-pointer"
                                                >
                                                    <Plus size={12} />
                                                </button>
                                                <button
                                                    onClick={() => handleAssignmentUpdate(subject._id || subject.id, { hardcopy: !a.hardcopy })}
                                                    data-tooltip={a.hardcopy ? 'Click to mark assignments as pending' : 'Mark hardcopy assignments as submitted'}
                                                    className={`no-fluid flex-1 h-8 rounded-full text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                                                        a.hardcopy
                                                            ? 'btn-gradient'
                                                            : 'bg-surface/80 dark:bg-white/[0.05] border border-primary/18 text-on-surface-variant hover:text-primary hover:border-primary/40'
                                                    }`}
                                                >
                                                    {a.hardcopy ? <><CheckCircle size={12} /> Submitted</> : <><Target size={12} /> Mark Submitted</>}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {editingSubject && (
                <EditSubjectModal
                    isOpen={!!editingSubject}
                    onClose={() => setEditingSubject(null)}
                    subject={editingSubject}
                    onSuccess={loadData}
                />
            )}
        </div>
    );
};

export default Practicals;
