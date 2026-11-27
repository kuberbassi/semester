import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import { motion } from 'framer-motion';
import { Award, RefreshCw, X, Download, Landmark } from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Loader from '@/components/ui/Loader';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/components/ui/toast-context';
import { useTheme } from '@/contexts/theme-context';
import { attendanceService, notifyDesktopMutation } from '@/services/attendance.service';
import { desktopDb } from '@/services/desktopDb';
import ResultsDashboard from '@/components/results/ResultsDashboard';
import IpuSyncPanel from '@/components/results/IpuSyncPanel';
import { isTauriDesktop } from '@/utils/platform';

/* Official GGSIPU Ordinance 11 (CBCS 10-Point Grading Scale) */
export const IPU_GRADE_POINTS: Record<string, number> = {
    'O': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'C+': 5, 'P': 4, 'F': 0, 'Ab': 0, 'I': 0,
};

function calcSGPA(subjects: any[]): number {
    const valid = subjects.filter((s) => !s.is_pending && s.grade !== '-' && Number(s.credits || 0) > 0);
    if (!valid.length) return 0;
    const totalCr = valid.reduce((a: number, s: any) => a + Number(s.credits || 0), 0);
    const totalPt = valid.reduce((a: number, s: any) => {
        const gp = s.grade_point !== null && s.grade_point !== undefined
            ? Number(s.grade_point)
            : (IPU_GRADE_POINTS[String(s.grade || '').toUpperCase()] ?? 0);
        return a + Number(s.credits || 0) * gp;
    }, 0);
    return totalCr > 0 ? parseFloat((totalPt / totalCr).toFixed(2)) : 0;
}

/** Official GGSIPU Ordinance 11 credit-weighted CGPA across ALL semesters */
function calcCreditWeightedCGPA(semesters: any[]): number {
    let totalCr = 0;
    let totalWeightedPts = 0;
    for (const sem of semesters) {
        for (const s of sem.subjects || []) {
            if (s.is_pending || s.grade === '-') continue;
            const cr = Number(s.credits || 0);
            if (cr <= 0) continue;
            const gp = s.grade_point !== null && s.grade_point !== undefined
                ? Number(s.grade_point)
                : (IPU_GRADE_POINTS[String(s.grade || '').toUpperCase()] ?? 0);
            totalCr += cr;
            totalWeightedPts += cr * gp;
        }
    }
    return totalCr > 0 ? parseFloat((totalWeightedPts / totalCr).toFixed(2)) : 0;
}

function gradeBgClass(grade: string): string {
    const pt = IPU_GRADE_POINTS[grade];
    if (pt === undefined || pt === 0) return 'bg-rose-500/12 text-rose-500 dark:text-rose-400 border border-rose-500/25';
    if (pt >= 9) return 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 border border-emerald-500/25';
    if (pt >= 7) return 'bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 border border-indigo-500/25';
    if (pt >= 5) return 'bg-amber-500/12 text-amber-600 dark:text-amber-300 border border-amber-500/25';
    return 'bg-rose-500/10 text-rose-500 dark:text-rose-300 border border-rose-500/20';
}

function formatDate(iso: string | null): string {
    if (!iso) return 'Never synced';
    const d = new Date(iso);
    const now = new Date();
    const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function parseNumeric(value: unknown): number | null {
    if (value === null || value === undefined || value === '' || value === '-') return null;
    const num = typeof value === 'number' ? value : parseFloat(String(value));
    return Number.isNaN(num) ? null : num;
}

function isLabSubject(name: string, credits: number) {
    const upper = String(name || '').toUpperCase();
    return credits <= 1 || upper.includes('LAB') || upper.includes('PRACTICAL') || upper.includes('WORKSHOP') || upper.includes('SEMINAR') || upper.includes('VIVA');
}

function getSubjectMarks(subject: any) {
    const name = subject.name || subject.subject_name || '';
    const credits = parseNumeric(subject.credits) ?? 3;
    const isLab = isLabSubject(name, credits);

    const internalVal = subject.internal ?? (isLab ? (subject.internal_practical ?? subject.internal_theory) : (subject.internal_theory ?? subject.internal_practical));
    const externalVal = subject.external ?? (isLab ? (subject.external_practical ?? subject.external_theory) : (subject.external_theory ?? subject.external_practical));

    const internal = parseNumeric(internalVal) ?? 0;
    const external = parseNumeric(externalVal) ?? 0;
    const total = parseNumeric(subject.total_marks ?? subject.marks);
    const maxMarks = parseNumeric(subject.max_marks) ?? 100;
    return {
        internal,
        external,
        total: total ?? (internal + external),
        hasExplicitTotal: total !== null,
        maxMarks,
    };
}

function getSubjectDisplayMark(value: unknown): string {
    if (value === null || value === undefined || value === '') return '—';
    const text = String(value).trim();
    return text || '—';
}

function formatDeclaredDate(value: unknown): string | null {
    if (!value) return null;
    const str = String(value).trim();
    const match = str.match(/^(\d{2}),(\d{4})$/);
    if (match) {
        const monthNum = parseInt(match[1], 10);
        const year = match[2];
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        if (monthNum >= 1 && monthNum <= 12) {
            return `${months[monthNum - 1]} ${year}`;
        }
    }
    const parsed = new Date(str);
    if (Number.isNaN(parsed.getTime())) return str;
    return parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function buildBatchLabel(info: any): string {
    const raw = String(info?.batch || '').trim();
    if (!raw) return '—';
    if (/^\d{4}-\d{2}$/.test(raw)) return raw;
    if (/^\d{4}$/.test(raw)) {
        const start = Number(raw);
        return `${start}-${String((start + 4) % 100).padStart(2, '0')}`;
    }
    return raw;
}

function normalizeProfileInfo(info: any) {
    return {
        name: info?.name || info?.stname || '',
        roll_no: info?.roll_no || info?.nrollno || info?.enrollment_number || '',
        father: info?.father || '',
        mother: info?.mother || '',
        gender: info?.gender || '',
        email: info?.email || '',
        phone: info?.phone || info?.mobno || '',
        batch: info?.batch || info?.byoa || '',
        admission_year: info?.admission_year || info?.yoa || '',
        institution: info?.institution || info?.iname || '',
        programme: info?.programme || info?.prgname || '',
    };
}

function getSubjectPercentage(subject: any) {
    const { total, maxMarks } = getSubjectMarks(subject);
    if (!maxMarks) return 0;
    return Math.round((total / maxMarks) * 100);
}

type Step = 'loading' | 'form' | 'results';

const Results: React.FC = () => {
    const { user } = useAuth();
    const { showToast } = useToast();
    const { theme } = useTheme();

    usePageMeta({
        title: 'Results | Semester',
        description: 'Official GGSIPU credit-weighted SGPA/CGPA analytics, subject impact insights, and PDF transcript export.',
    });

    const [step, setStep] = useState<Step>('loading');
    const [results, setResults] = useState<any | null>(null);
    const [selectedSem, setSelectedSem] = useState<string>('overall');
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);

    const [showPdfModal, setShowPdfModal] = useState(false);
    const [pdfSem, setPdfSem] = useState<string>('overall');
    const [pdfLoading, setPdfLoading] = useState(false);

    const loadSavedResults = useCallback(async () => {
        try {
            const saved = await attendanceService.getSavedIPUResults();
            if (saved?.semesters?.length) {
                setResults(saved);
                setLastUpdated(saved.last_updated || null);
                setStep('results');
            } else {
                setStep('form');
            }
        } catch {
            setStep('form');
        }
    }, []);

    useEffect(() => {
        void loadSavedResults();
        // Automatically recalculate live when Dashboard subject credits change!
        const onLocalChange = () => {
            void loadSavedResults();
        };
        window.addEventListener('semester:local-db-changed', onLocalChange);
        return () => window.removeEventListener('semester:local-db-changed', onLocalChange);
    }, [loadSavedResults]);

    function handleSyncClick() {
        setStep('form');
    }

    const handleUpdateCredit = useCallback(
        async (semester: number, code: string, name: string, credits: number) => {
            if (!isTauriDesktop()) return;
            try {
                const updated = await desktopDb.updateResultSubjectCredit(semester, code, name, credits);
                if (updated && typeof updated === 'object') {
                    setResults(updated);
                    setLastUpdated((updated as any).last_updated || null);
                }
                notifyDesktopMutation();
                showToast('success', `Updated ${code || name} to ${credits} credit${credits === 1 ? '' : 's'}`);
            } catch (e: any) {
                showToast('error', e?.message || 'Failed to update subject credits');
            }
        },
        [showToast]
    );

    async function handleDownloadPdf() {
        if (!results) return;
        setPdfLoading(true);
        try {
            const { downloadResultsPdf } = await import('@/utils/downloadResultsPdf');
            const out = await downloadResultsPdf(results, pdfSem);
            showToast(
                'success',
                out.savedToDownloads ? `Saved ${out.filename} to Downloads` : `Downloaded ${out.filename}`
            );
        } catch (e: any) {
            showToast('error', 'PDF export failed: ' + (e?.message || 'Unknown error'));
        } finally {
            setPdfLoading(false);
            setShowPdfModal(false);
        }
    }

    const metrics = useMemo(() => {
        if (!results?.semesters?.length) return null;
        const sems = results.semesters;
        const cgpa = results.cgpa ? parseFloat(results.cgpa) : calcCreditWeightedCGPA(sems);
        const allSubjects = sems.flatMap((s: any) => (s.subjects || []).map((sub: any) => ({ ...sub, _semester: s.semester_num ?? s.semester })));
        const completedSubjects = allSubjects.filter((s: any) => !s.is_pending && s.grade !== '-');
        const totalCredits = completedSubjects.reduce((a: number, sub: any) => a + (Number(sub.credits || 0) || 0), 0);
        const totalGradePoints = completedSubjects.reduce((a: number, sub: any) => {
            const cr = Number(sub.credits || 0) || 0;
            const gp = sub.grade_point !== null && sub.grade_point !== undefined
                ? Number(sub.grade_point)
                : (IPU_GRADE_POINTS[String(sub.grade || '').toUpperCase()] ?? 0);
            return a + cr * gp;
        }, 0);
        const totalMarks = completedSubjects.reduce((a: number, s: any) => a + getSubjectMarks(s).total, 0);
        const totalMaxMarks = completedSubjects.reduce((a: number, s: any) => a + getSubjectMarks(s).maxMarks, 0);
        const passRate = completedSubjects.length
            ? Math.round((completedSubjects.filter((s: any) => (IPU_GRADE_POINTS[s.grade] ?? 0) >= 4).length / completedSubjects.length) * 100)
            : 0;
        const academicScore = totalMaxMarks > 0 ? Math.round((totalMarks / totalMaxMarks) * 1000) / 10 : 0;
        return {
            cgpa,
            passRate,
            totalSubjects: allSubjects.length,
            totalMarks,
            totalMaxMarks,
            totalCredits,
            totalGradePoints,
            completedSubjects: completedSubjects.length,
            academicScore,
            creditsSyncedCount: Number(results.creditsSyncedCount ?? 0),
        };
    }, [results]);

    const semMetrics = useMemo(() => {
        if (!results?.semesters?.length || selectedSem === 'overall') return null;
        const sem = results.semesters.find((s: any) => String(s.semester_num ?? s.semester) === String(selectedSem));
        if (!sem) return null;
        const subjects = sem.subjects || [];
        const completedSubjects = subjects.filter((s: any) => !s.is_pending && s.grade !== '-');
        const sgpa = sem.sgpa ? parseFloat(sem.sgpa) : calcSGPA(subjects);
        const totalCredits = completedSubjects.reduce((a: number, s: any) => a + (Number(s.credits || 0) || 0), 0);
        const totalGradePoints = completedSubjects.reduce((a: number, s: any) => {
            const cr = Number(s.credits || 0) || 0;
            const gp = s.grade_point !== null && s.grade_point !== undefined
                ? Number(s.grade_point)
                : (IPU_GRADE_POINTS[String(s.grade || '').toUpperCase()] ?? 0);
            return a + cr * gp;
        }, 0);
        const totalMarks = completedSubjects.reduce((a: number, s: any) => a + getSubjectMarks(s).total, 0);
        const totalMaxMarks = completedSubjects.reduce((a: number, s: any) => a + getSubjectMarks(s).maxMarks, 0);
        const passRate = completedSubjects.length
            ? Math.round((completedSubjects.filter((s: any) => (IPU_GRADE_POINTS[s.grade] ?? 0) >= 4).length / completedSubjects.length) * 100)
            : 0;
        const pendingSubjects = subjects.filter((s: any) => s.is_pending || s.grade === '-').length;
        return {
            sgpa,
            passRate,
            totalSubjects: subjects.length,
            totalMarks,
            totalMaxMarks,
            totalCredits,
            totalGradePoints,
            pendingSubjects,
        };
    }, [results, selectedSem]);

    const currentMetrics = selectedSem === 'overall' ? metrics : semMetrics;
    const profileInfo = normalizeProfileInfo(results?.student_info || {});
    const displayBatch = buildBatchLabel(profileInfo);
    const academicStrength = currentMetrics && currentMetrics.totalMaxMarks > 0
        ? Math.round((currentMetrics.totalMarks / currentMetrics.totalMaxMarks) * 1000) / 10
        : 0;

    // ALL subjects for current selection — never artificially capped at 20
    const currentSubjects = useMemo(() => {
        if (!results?.semesters) return [];
        if (selectedSem === 'overall') {
            return results.semesters.flatMap((s: any) =>
                (s.subjects || []).map((sub: any) => ({ ...sub, _semester: s.semester_num ?? s.semester }))
            );
        }
        const sem = results.semesters.find((s: any) => String(s.semester_num ?? s.semester) === String(selectedSem));
        return (sem?.subjects || []).map((sub: any) => ({ ...sub, _semester: sem.semester_num ?? sem.semester }));
    }, [results, selectedSem]);

    const currentSemesterMeta = useMemo(() => {
        if (!results?.semesters?.length || selectedSem === 'overall') return null;
        const semester = results.semesters.find((s: any) => String(s.semester_num ?? s.semester) === String(selectedSem));
        const subjects = semester?.subjects || [];
        const declaredDate = subjects.find((subject: any) => subject?.declared_date)?.declared_date || null;
        const examSession = subjects.find((subject: any) => subject?.exam_session)?.exam_session || null;
        if (!declaredDate && !examSession) return null;
        return {
            declaredDate: formatDeclaredDate(declaredDate),
            examSession: examSession ? (formatDeclaredDate(examSession) || String(examSession)) : null,
        };
    }, [results, selectedSem]);

    if (step === 'loading') {
        return (
            <div className="w-full pb-12 space-y-5">
                <div className="animate-pulse h-14 liquid-glass rounded-[20px]" />
                <div className="animate-pulse h-44 liquid-glass rounded-[24px]" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="animate-pulse h-28 liquid-glass rounded-[22px]" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="w-full pb-12">
            <PageHeader
                title="Results"
                icon={Award}
                badge={results?.cgpa ? `CGPA ${parseFloat(results.cgpa).toFixed(2)}` : undefined}
                actions={
                    step === 'results' && results ? (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleSyncClick}
                                data-tooltip="Fetch latest published semesters from examweb.ggsipu.ac.in"
                                className="no-fluid h-8 px-3.5 rounded-full bg-on-surface/[0.06] border border-on-surface/[0.09] text-xs font-semibold text-on-surface hover:bg-primary/14 hover:border-primary/35 hover:text-primary transition-colors cursor-pointer inline-flex items-center gap-1.5"
                            >
                                <RefreshCw size={12} />
                                Sync IPU Portal
                            </button>
                            <button
                                onClick={() => {
                                    setPdfSem(selectedSem);
                                    setShowPdfModal(true);
                                }}
                                data-tooltip="Export clean executive academic transcript PDF"
                                className="no-fluid h-8 px-3.5 rounded-full btn-gradient text-xs font-bold cursor-pointer inline-flex items-center gap-1.5"
                            >
                                <Download size={12} />
                                Export PDF
                            </button>
                        </div>
                    ) : results ? (
                        <button
                            onClick={() => setStep('results')}
                            className="no-fluid h-8 px-3.5 rounded-full bg-on-surface/[0.06] border border-on-surface/[0.09] text-xs font-semibold text-on-surface hover:bg-on-surface/[0.12] transition-colors cursor-pointer"
                        >
                            Back to Overview
                        </button>
                    ) : undefined
                }
            />

            {step === 'form' && (
                <div className="max-w-xl mx-auto mt-6">
                    {isTauriDesktop() ? (
                        <IpuSyncPanel onDone={loadSavedResults} />
                    ) : (
                        <div className="liquid-glass rounded-[28px] p-8 text-center space-y-3">
                            <div className="w-12 h-12 rounded-2xl bg-primary/12 border border-primary/25 text-primary flex items-center justify-center mx-auto">
                                <Landmark size={22} />
                            </div>
                            <h2 className="font-display text-lg font-extrabold text-on-surface">
                                Direct IPU Portal Sync
                            </h2>
                            <p className="text-xs text-on-surface-variant max-w-sm mx-auto leading-relaxed">
                                Open the Semester Desktop app to sign into examweb.ggsipu.ac.in directly and sync all published semesters into your workspace.
                            </p>
                        </div>
                    )}
                </div>
            )}

            {step === 'results' && results && (
                <ResultsDashboard
                    user={user}
                    theme={theme}
                    results={results}
                    profileInfo={profileInfo}
                    displayBatch={displayBatch}
                    lastUpdated={lastUpdated}
                    formatDate={formatDate}
                    selectedSem={selectedSem}
                    setSelectedSem={(value) => setSelectedSem(String(value))}
                    currentMetrics={currentMetrics}
                    metrics={metrics}
                    semMetrics={semMetrics}
                    academicStrength={academicStrength}
                    currentSubjects={currentSubjects}
                    currentSemesterMeta={currentSemesterMeta}
                    getSubjectMarks={getSubjectMarks}
                    getSubjectDisplayMark={getSubjectDisplayMark}
                    gradeBgClass={gradeBgClass}
                    getSubjectPercentage={getSubjectPercentage}
                    onUpdateCredit={isTauriDesktop() ? handleUpdateCredit : undefined}
                />
            )}

            {/* Transcript PDF Export Modal */}
            {showPdfModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4" onClick={() => setShowPdfModal(false)}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: 6 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-sm liquid-glass-overlay rounded-[24px] p-6 flex flex-col max-h-[90vh]"
                    >
                        <div className="flex items-center justify-between mb-5 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-primary/14 border border-primary/25 flex items-center justify-center text-primary">
                                    <Download size={15} />
                                </div>
                                <div>
                                    <h3 className="text-[15px] font-bold text-on-surface">Export Transcript PDF</h3>
                                    <p className="text-[10.5px] text-on-surface-variant/70">Clean print-ready GGSIPU format</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setShowPdfModal(false)}
                                data-tooltip="Close modal"
                                className="no-fluid w-7 h-7 rounded-full bg-on-surface/[0.06] hover:bg-on-surface/[0.12] text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer"
                            >
                                <X size={14} />
                            </button>
                        </div>

                        <div className="overflow-y-auto pr-1 flex-1 min-h-0 mb-5 flex flex-col">
                            <p className="text-xs text-on-surface-variant/70 mb-3">Choose scope to include:</p>
                            <div className="flex flex-col gap-1.5">
                                {[
                                    { label: 'All Semesters (Complete Transcript)', val: 'overall' },
                                    ...(results?.semesters || []).map((s: any) => {
                                        const num = s.semester_num ?? s.semester;
                                        return {
                                            label: `${s.semester_label || `Semester ${num}`} (SGPA ${parseFloat(s.sgpa || '0').toFixed(2)})`,
                                            val: String(num),
                                        };
                                    }),
                                ].map((opt) => (
                                    <button
                                        key={opt.val}
                                        onClick={() => setPdfSem(opt.val)}
                                        className={`no-fluid flex items-center gap-3 px-3.5 py-2.5 rounded-xl border text-xs font-semibold text-left transition-colors cursor-pointer ${
                                            pdfSem === opt.val
                                                ? 'border-primary/35 bg-primary/14 text-primary'
                                                : 'border-on-surface/[0.08] bg-on-surface/[0.03] text-on-surface-variant hover:bg-on-surface/[0.07] hover:text-on-surface'
                                        }`}
                                    >
                                        <span className={`w-3 h-3 rounded-full border-2 shrink-0 ${pdfSem === opt.val ? 'border-primary bg-primary' : 'border-on-surface/25'}`} />
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-2.5 shrink-0 pt-2 border-t border-on-surface/[0.07]">
                            <button
                                onClick={() => setShowPdfModal(false)}
                                className="no-fluid flex-1 h-9 rounded-full bg-on-surface/[0.06] border border-on-surface/[0.08] text-xs font-semibold text-on-surface hover:bg-on-surface/[0.12] transition-colors cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => void handleDownloadPdf()}
                                disabled={pdfLoading}
                                className="no-fluid flex-1 h-9 rounded-full btn-gradient text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 cursor-pointer"
                            >
                                {pdfLoading ? (
                                    <>
                                        <Loader size={16} /> Generating…
                                    </>
                                ) : (
                                    <>
                                        <Download size={13} /> Save PDF
                                    </>
                                )}
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
};

export default Results;
