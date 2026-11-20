import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { usePageMeta } from '@/hooks/usePageMeta';
import { motion } from 'framer-motion';
import type { ChartOptions } from 'chart.js';
import {
    GraduationCap,
    RefreshCw,
    X, Download, UploadCloud, Plus, Trash2, Edit
} from 'lucide-react';
import Loader from '@/components/ui/Loader';
import { useAuth } from '@/contexts/auth-context';
import { useToast } from '@/components/ui/toast-context';
import { useTheme } from '@/contexts/theme-context';
import { attendanceService } from '@/services/attendance.service';
import ResultsDashboard from '@/components/results/ResultsDashboard';
import { useConfirm } from '@/contexts/confirm-context';

/*  Grade utilities  */
const GRADE_POINTS: Record<string, number> = {
    'O': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C+': 5, 'C': 4, 'P': 4, 'F': 0, 'Ab': 0, 'I': 0,
};

function calcSGPA(subjects: any[]): number {
    const valid = subjects.filter(s => s.credits && parseFloat(s.credits) > 0);
    if (!valid.length) return 0;
    const totalCr = valid.reduce((a: number, s: any) => a + parseFloat(s.credits), 0);
    const totalPt = valid.reduce((a: number, s: any) => a + (parseFloat(s.credits) * (GRADE_POINTS[s.grade] ?? 0)), 0);
    return parseFloat((totalPt / totalCr).toFixed(2));
}

function calcCGPA(semesters: any[]): number {
    const valid = semesters.filter(s => {
        const sgpa = s.sgpa ? parseFloat(s.sgpa) : calcSGPA(s.subjects || []);
        return sgpa > 0;
    });
    if (!valid.length) return 0;
    const total = valid.reduce((a: number, s: any) => {
        const sgpa = s.sgpa ? parseFloat(s.sgpa) : calcSGPA(s.subjects || []);
        return a + sgpa;
    }, 0);
    return parseFloat((total / valid.length).toFixed(2));
}

function gradeBgClass(grade: string): string {
    const pt = GRADE_POINTS[grade];
    if (pt === undefined || pt === 0) return 'bg-red-500/10 text-red-500 dark:text-red-400 border border-red-500/20';
    if (pt >= 9) return 'bg-primary/10 text-primary border border-primary/25';
    if (pt >= 7) return 'bg-green-500/10 text-green-700 dark:text-green-400 border border-green-500/20';
    if (pt >= 5) return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20';
    return 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border border-orange-500/20';
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
    if (value === null || value === undefined || value === '') return '-';
    const text = String(value).trim();
    return text || '-';
}

function formatDeclaredDate(value: unknown): string | null {
    if (!value) return null;
    const str = String(value).trim();
    
    // Check if it matches MM,YYYY format
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
    if (!raw) return '---';
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

/*  Types  */
type Step = 'loading' | 'form' | 'results';

/*  Component  */
const Results: React.FC = () => {
    const confirm = useConfirm();
    const { user } = useAuth();
    const { showToast } = useToast();

    usePageMeta({
        title: 'Results | Zenith',
        description: 'View your semester-wise IPU results, CGPA, and grade breakdowns. Track academic performance over time.',
    });

    const [step, setStep] = useState<Step>('loading');
    const [results, setResults] = useState<any | null>(null);
    const [selectedSem, setSelectedSem] = useState<string>('overall');
    const [lastUpdated, setLastUpdated] = useState<string | null>(null);

    // PDF download
    const [showPdfModal, setShowPdfModal] = useState(false);
    const [pdfSem, setPdfSem] = useState<string>('overall');
    const [pdfLoading, setPdfLoading] = useState(false);

    // PDF parsing/upload states
    const [uploadLoading, setUploadLoading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);
    
    // Result editor modal states
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [editorSem, setEditorSem] = useState<number>(1);
    const [isSemAutoDetected, setIsSemAutoDetected] = useState(false);
    const [editorStudentInfo, setEditorStudentInfo] = useState<any>({
        name: '', enrollment_number: '', institute: '', program: '', batch: ''
    });
    const [editorSubjects, setEditorSubjects] = useState<any[]>([]);
    const [isSaving, setIsSaving] = useState(false);

    const { theme } = useTheme();
    const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.05)';
    const labelColor = theme === 'dark' ? 'rgba(255,255,255,0.45)' : 'rgba(29,28,26,0.55)';

    useEffect(() => { loadSavedResults(); }, []);

    async function loadSavedResults() {
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
    }

    function handleSyncClick() {
        setUploadError(null);
        setStep('form');
    }

    async function handleDownloadPdf() {
        if (!results) return;
        setPdfLoading(true);
        try {
            // Dynamic import so the PDF library only loads when needed
            const { downloadResultsPdf } = await import('@/utils/downloadResultsPdf');
            downloadResultsPdf(results, pdfSem);
        } catch (e: any) {
            showToast('error', 'PDF generation failed: ' + (e?.message || 'Unknown error'));
        } finally {
            setPdfLoading(false);
            setShowPdfModal(false);
        }
    }

    // PDF File upload handler
    async function handlePdfUpload(file: File) {
        if (!file) return;
        if (file.type !== 'application/pdf') {
            setUploadError('Only PDF files are supported.');
            return;
        }
        setUploadLoading(true);
        setUploadError(null);
        try {
            const data = await attendanceService.parseResultPdf(file);
            setEditorStudentInfo({
                name: data.studentInfo?.student_name || user?.name || '',
                enrollment_number: data.studentInfo?.enrollment_number || user?.enrollment_number || '',
                institute: data.studentInfo?.institute || '',
                program: data.studentInfo?.program || '',
                batch: data.studentInfo?.batch || '',
            });
            const subList = (data.subjects || []).map((s: any, idx: number) => {
                const isLab = isLabSubject(s.subject_name || '', s.credits ?? 3);
                return {
                    id: s.paper_code || `sub_${idx}`,
                    paper_code: s.paper_code || '',
                    subject_name: s.subject_name || '',
                    credits: s.credits ?? 3,
                    internal_theory: isLab ? (s.internal_practical ?? 0) : (s.internal_theory ?? 0),
                    external_theory: isLab ? (s.external_practical ?? 0) : (s.external_theory ?? 0),
                    declared_date: s.declared_date || '',
                    exam_session: s.exam_date || s.exam_session || '',
                };
            });
            setEditorSubjects(subList);
            setEditorSem(data.subjects?.[0]?.semester || 1);
            setIsSemAutoDetected(true);
            setIsEditorOpen(true);
        } catch (err: any) {
            console.error('[pdf upload error]', err);
            setUploadError(err.response?.data?.error || 'Failed to parse results sheet. Make sure it matches the standard format.');
        } finally {
            setUploadLoading(false);
        }
    }

    // Modal helpers

    function handleSubjectChange(id: string, field: string, value: any) {
        setEditorSubjects(prev => prev.map(s => {
            if (s.id === id) {
                return { ...s, [field]: value };
            }
            return s;
        }));
    }

    function handleAddSubject() {
        const newSub = {
            id: `new_sub_${Date.now()}`,
            paper_code: '',
            subject_name: '',
            credits: 3,
            internal_theory: 0,
            external_theory: 0,
        };
        setEditorSubjects(prev => [...prev, newSub]);
    }

    async function handleDeleteSubject(id: string) {
        const isConfirmed = await confirm({
            title: 'Delete Subject',
            message: 'Are you sure you want to delete this subject?',
        });
        if (isConfirmed) {
            setEditorSubjects(prev => prev.filter(s => s.id !== id));
        }
    }

    function calculateDynamicGrade(total: number) {
        if (total >= 90) return 'O';
        if (total >= 75) return 'A+';
        if (total >= 65) return 'A';
        if (total >= 55) return 'B+';
        if (total >= 50) return 'B';
        if (total >= 45) return 'C+';
        if (total >= 40) return 'C';
        return 'F';
    }

    function calculateDynamicSGPA(subjects: any[]) {
        let weightedSum = 0;
        let totalCredits = 0;

        for (const sub of subjects) {
            const credits = parseInt(sub.credits) || 0;
            const internal = parseFloat(sub.internal_theory) || 0;
            const external = parseFloat(sub.external_theory) || 0;
            const total = internal + external;
            const grade = calculateDynamicGrade(total);
            const gp = GRADE_POINTS[grade] ?? 0;

            totalCredits += credits;
            weightedSum += credits * gp;
        }

        return totalCredits > 0 ? parseFloat((weightedSum / totalCredits).toFixed(2)) : 0;
    }

    async function handleSaveEditor() {
        if (editorSubjects.length === 0) {
            showToast('error', 'Add at least one subject');
            return;
        }
        if (editorSubjects.some(s => !s.subject_name.trim())) {
            showToast('error', 'Please enter names for all subjects');
            return;
        }

        setIsSaving(true);
        try {
            const processedSubjects = editorSubjects.map(sub => {
                const internal = parseFloat(sub.internal_theory) || 0;
                const external = parseFloat(sub.external_theory) || 0;
                const isLab = isLabSubject(sub.subject_name, parseInt(sub.credits) ?? 3);

                return {
                    name: sub.subject_name,
                    code: sub.paper_code,
                    credits: parseInt(sub.credits) || 0,
                    internal_theory: isLab ? 0 : internal,
                    external_theory: isLab ? 0 : external,
                    internal_practical: isLab ? internal : 0,
                    external_practical: isLab ? external : 0,
                    declared_date: sub.declared_date || undefined,
                    exam_session: sub.exam_session || undefined,
                };
            });

            await attendanceService.saveResults({
                semester: editorSem,
                subjects: processedSubjects,
                student_info: {
                    name: editorStudentInfo.name,
                    enrollment_number: editorStudentInfo.enrollment_number,
                    institute: editorStudentInfo.institute,
                    program: editorStudentInfo.program,
                    batch: editorStudentInfo.batch,
                }
            });

            if (editorStudentInfo.enrollment_number && editorStudentInfo.enrollment_number !== user?.enrollment_number) {
                await attendanceService.updateProfile({
                    enrollment_number: editorStudentInfo.enrollment_number,
                    college: editorStudentInfo.institute || user?.college || '',
                    course: editorStudentInfo.program || user?.course || '',
                    batch: editorStudentInfo.batch || user?.batch || '',
                }).catch(() => {});
            }

            showToast('success', `Semester ${editorSem} results saved successfully!`);
            setIsEditorOpen(false);
            await loadSavedResults();
        } catch (err: any) {
            console.error('[editor save error]', err);
            showToast('error', err.response?.data?.error || 'Failed to save results');
        } finally {
            setIsSaving(false);
        }
    }



    /*  Computed metrics  */
    const metrics = useMemo(() => {
        if (!results?.semesters?.length) return null;
        const sems = results.semesters;
        const cgpa = results.cgpa ? parseFloat(results.cgpa) : calcCGPA(sems);
        const allSubjects = sems.flatMap((s: any) => s.subjects || []);
        const totalCredits = sems.reduce((a: number, s: any) =>
            a + (s.subjects || []).reduce((b: number, sub: any) => b + (parseFloat(sub.credits || '0') || 0), 0), 0);
        const completedSubjects = allSubjects.filter((s: any) => !s.is_pending && s.grade !== '-');
        const totalMarks = completedSubjects.reduce((a: number, s: any) => a + getSubjectMarks(s).total, 0);
        const totalMaxMarks = completedSubjects.reduce((a: number, s: any) => a + getSubjectMarks(s).maxMarks, 0);
        const passRate = allSubjects.length
            ? Math.round((allSubjects.filter((s: any) => (GRADE_POINTS[s.grade] ?? 0) >= 4).length / allSubjects.length) * 100)
            : 0;
        const academicScore = totalMaxMarks > 0
            ? Math.round((totalMarks / totalMaxMarks) * 100)
            : (allSubjects.length
                ? Math.round((allSubjects.reduce((acc: number, s: any) => acc + (GRADE_POINTS[s.grade] ?? 0), 0) / (allSubjects.length * 10)) * 100)
                : 0);
        return { cgpa, passRate, totalSubjects: allSubjects.length, totalMarks, totalMaxMarks, totalCredits, completedSubjects: completedSubjects.length, academicScore };
    }, [results]);

    const semMetrics = useMemo(() => {
        if (!results?.semesters?.length || selectedSem === 'overall') return null;
        const sem = results.semesters.find((s: any) => String(s.semester_num ?? s.semester) === String(selectedSem));
        if (!sem) return null;
        const subjects = sem.subjects || [];
        const sgpa = sem.sgpa ? parseFloat(sem.sgpa) : calcSGPA(subjects);
        const totalCredits = subjects.reduce((a: number, s: any) => a + (parseFloat(s.credits || '0') || 0), 0);
        const completedSubjects = subjects.filter((s: any) => !s.is_pending && s.grade !== '-');
        const totalMarks = completedSubjects.reduce((a: number, s: any) => a + getSubjectMarks(s).total, 0);
        const totalMaxMarks = completedSubjects.reduce((a: number, s: any) => a + getSubjectMarks(s).maxMarks, 0);
        const passRate = subjects.length
            ? Math.round((subjects.filter((s: any) => (GRADE_POINTS[s.grade] ?? 0) >= 4).length / subjects.length) * 100)
            : 0;
        const pendingSubjects = subjects.filter((s: any) => s.is_pending || s.grade === '-').length;
        return { sgpa, passRate, totalSubjects: subjects.length, totalMarks, totalMaxMarks, totalCredits, pendingSubjects };
    }, [results, selectedSem]);

    const currentMetrics = selectedSem === 'overall' ? metrics : semMetrics;
    const profileInfo = normalizeProfileInfo(results?.student_info || {});
    const displayBatch = buildBatchLabel(profileInfo);
    const academicStrength = selectedSem === 'overall'
        ? (results?.academicStrength ?? metrics?.academicScore ?? 0)
        : Math.round((currentMetrics?.totalMarks ?? 0) / Math.max(currentMetrics?.totalMaxMarks ?? 1, 1) * 100);

    const currentSubjects = useMemo(() => {
        if (!results?.semesters) return [];
        if (selectedSem === 'overall') return results.semesters.flatMap((s: any) => s.subjects || []).slice(0, 20);
        return results.semesters.find((s: any) => String(s.semester_num ?? s.semester) === String(selectedSem))?.subjects || [];
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

    const chartSubjects = useMemo(() =>
        currentSubjects
            .filter((s: any) => !s.is_pending)
            .slice(0, selectedSem === 'overall' ? 10 : 12),
    [currentSubjects, selectedSem]);

    const performanceSummary = useMemo(() => {
        if (!chartSubjects.length) return null;
        const ranked = [...chartSubjects].sort((a: any, b: any) => getSubjectPercentage(b) - getSubjectPercentage(a));
        return {
            strongest: ranked[0],
            weakest: ranked[ranked.length - 1],
            distinctionCount: chartSubjects.filter((subject: any) => getSubjectPercentage(subject) >= 75).length,
            pendingCount: currentSubjects.filter((subject: any) => subject.is_pending || subject.grade === '-').length,
        };
    }, [chartSubjects, currentSubjects]);

    /*  Chart data  */
    const barChartData = useMemo(() => ({
        labels: chartSubjects.map((s: any) => s.code || s.name?.substring(0, 10) || '?'),
        datasets: [
            {
                label: 'Score %',
                data: chartSubjects.map((s: any) => getSubjectPercentage(s)),
                backgroundColor: chartSubjects.map((s: any) => {
                    const pct = getSubjectPercentage(s);
                    if (pct >= 75) return theme === 'dark' ? '#ffffff' : '#1d1c1a';
                    if (pct >= 60) return '#22c55e';
                    if (pct >= 50) return '#f59e0b';
                    return '#ef4444';
                }),
                borderRadius: 8,
            },
        ],
    }), [chartSubjects, theme]);

    const barChartOptions: ChartOptions<'bar'> = {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            x: { grid: { display: false }, ticks: { color: labelColor, font: { size: 9 } } },
            y: { min: 0, max: 100, grid: { color: gridColor }, ticks: { color: labelColor, font: { size: 9 }, maxTicksLimit: 5 } },
        },
    };

    const marksBreakdownData = useMemo(() => ({
        labels: chartSubjects.map((s: any) => s.code || s.name?.substring(0, 10) || '?'),
        datasets: [
            {
                label: 'Internal',
                data: chartSubjects.map((s: any) => getSubjectMarks(s).internal),
                backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(29, 28, 26, 0.4)',
                borderRadius: 6,
            },
            {
                label: 'External',
                data: chartSubjects.map((s: any) => getSubjectMarks(s).external),
                backgroundColor: theme === 'dark' ? 'rgba(255, 255, 255, 0.15)' : 'rgba(29, 28, 26, 0.15)',
                borderRadius: 6,
            },
        ],
    }), [chartSubjects, theme]);

    const marksBreakdownOptions: ChartOptions<'bar'> = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: {
                    color: labelColor,
                    font: { size: 10 },
                },
            },
        },
        scales: {
            x: { stacked: true, grid: { display: false }, ticks: { color: labelColor, font: { size: 9 } } },
            y: { stacked: true, grid: { color: gridColor }, ticks: { color: labelColor, font: { size: 9 }, maxTicksLimit: 5 } },
        },
    };

    /* Grade Distribution Chart (Doughnut) */
    const gradeDistributionData = useMemo(() => {
        const dist = results?.gradeDistribution || {};
        const labels = Object.keys(dist).filter(k => dist[k] > 0);
        const data = labels.map(k => dist[k]);
        const colors = labels.map(g => {
            if (g === 'O') return theme === 'dark' ? '#ffffff' : '#1d1c1a';
            if (g === 'A+') return '#8b5cf6';
            if (g === 'A') return theme === 'dark' ? '#ecece9' : '#4e4d4a';
            if (g === 'B+') return '#f59e0b';
            if (g === 'B') return '#f97316';
            if (g === 'C+' || g === 'C') return '#ef4444';
            return '#64748b';
        });
        return { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }] };
    }, [results, theme]);

    const doughnutOptions: ChartOptions<'doughnut'> = {
        responsive: true, maintainAspectRatio: false,
        cutout: '75%',
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#0a0a0a', titleColor: '#fff', bodyColor: '#ffffff80',
                borderColor: 'rgba(255,255,255,0.1)', borderWidth: 1, padding: 10,
            }
        }
    };

    if (step === 'loading') {
        return (
            <div className="pb-24 max-w-7xl mx-auto px-4 space-y-6 pt-2">
                <div className="animate-pulse h-16 bg-surface-container border border-outline rounded-lg" />
                <div className="animate-pulse h-40 bg-surface-container border border-outline rounded-lg" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="animate-pulse h-24 bg-surface-container border border-outline rounded-lg" />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <motion.div
            initial="hidden"
            animate="visible"
            variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.08 } } }}
            className="pb-28 max-w-[1320px] mx-auto pt-2 px-3 md:px-5"
        >
            {/*  PDF Uploader Dropzone  */}
            {step === 'form' && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
                    className="max-w-xl mx-auto mt-10"
                >
                    <div className="rounded-xl border border-outline bg-surface border border-outline p-8 relative overflow-hidden">
                        
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-12 h-12 rounded-xl bg-surface-container flex items-center justify-center text-on-surface border border-outline shrink-0">
                                <GraduationCap size={24} />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold text-on-surface tracking-tight">Upload Result PDF</h2>
                                <p className="text-xs text-on-surface-variant/40 font-medium">Parse and save results sheets</p>
                            </div>
                        </div>

                        {results && (
                            <button
                                onClick={() => setStep('results')}
                                className="w-full mb-6 py-2.5 rounded-xl bg-surface hover:bg-surface-container border border-outline text-xs text-on-surface font-bold transition-colors"
                            >
                                Back to Dashboard
                            </button>
                        )}

                        {uploadError && (
                            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-xs font-bold text-red-500">
                                {uploadError}
                            </div>
                        )}

                        <div
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => {
                                e.preventDefault();
                                const file = e.dataTransfer.files?.[0];
                                if (file) void handlePdfUpload(file);
                            }}
                            className="border-2 border-dashed border-outline hover:border-primary rounded-xl p-12 flex flex-col items-center justify-center gap-4 cursor-pointer hover:bg-surface-container transition-all group"
                            onClick={() => {
                                const input = document.createElement('input');
                                input.type = 'file';
                                input.accept = '.pdf';
                                input.onchange = (e) => {
                                    const file = (e.target as HTMLInputElement).files?.[0];
                                    if (file) void handlePdfUpload(file);
                                };
                                input.click();
                            }}
                        >
                            {uploadLoading ? (
                                <Loader size={32} />
                            ) : (
                                <UploadCloud size={40} className="text-on-surface-variant/20 group-hover:text-primary transition-colors" />
                            )}
                            <div className="text-center">
                                <p className="text-sm font-bold text-on-surface-variant/80 group-hover:text-primary transition-colors">
                                    {uploadLoading ? 'Reading document structure...' : 'Drop your result PDF here'}
                                </p>
                                <p className="text-xs text-on-surface-variant/40 font-medium mt-1">
                                    {uploadLoading ? 'Extracting academic marks map' : 'or click to browse from device'}
                                </p>
                            </div>
                        </div>

                        <div className="mt-8 rounded-xl bg-surface-container border border-outline p-4 text-[11px] leading-relaxed text-on-surface-variant/70">
                            <span className="font-bold text-on-surface block mb-1">Instruction:</span>
                            Upload the PDF results sheet downloaded directly from the IPU portal. The system will extract your program, subjects, grades, and default credits automatically, allowing you to review them before saving.
                        </div>
                    </div>
                </motion.div>
            )}

            {/*  Results Dashboard  */}
            {step === 'results' && results && (
                <ResultsDashboard
                    user={user}
                    results={results}
                    profileInfo={profileInfo}
                    displayBatch={displayBatch}
                    lastUpdated={lastUpdated}
                    formatDate={formatDate}
                    handleSyncClick={handleSyncClick}
                    onOpenPdf={() => setShowPdfModal(true)}
                    selectedSem={selectedSem}
                    setSelectedSem={(value) => setSelectedSem(String(value))}
                    currentMetrics={currentMetrics}
                    metrics={metrics}
                    semMetrics={semMetrics}
                    academicStrength={academicStrength}
                    performanceSummary={performanceSummary}
                    chartSubjects={chartSubjects}
                    barChartData={barChartData}
                    barChartOptions={barChartOptions}
                    marksBreakdownData={marksBreakdownData}
                    marksBreakdownOptions={marksBreakdownOptions}
                    currentSubjects={currentSubjects}
                    currentSemesterMeta={currentSemesterMeta}
                    gradeDistributionData={gradeDistributionData}
                    doughnutOptions={doughnutOptions}
                    getSubjectMarks={getSubjectMarks}
                    getSubjectDisplayMark={getSubjectDisplayMark}
                    gradeBgClass={gradeBgClass}
                    getSubjectPercentage={getSubjectPercentage}
                />
            )}
            {/* ── PDF Download Modal ───────────────────────────────────────── */}
            {showPdfModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full max-w-sm rounded-xl border border-outline bg-surface p-6 md:p-8 flex flex-col max-h-[90vh]"
                    >
                        <div className="flex items-center justify-between mb-6 shrink-0">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                                    <Download size={14} className="text-emerald-600 dark:text-emerald-400" />
                                </div>
                                <h3 className="text-base font-bold text-on-surface">Download Results PDF</h3>
                            </div>
                            <button onClick={() => setShowPdfModal(false)} className="text-on-surface-variant/30 hover:text-on-surface-variant/70 transition-colors">
                                <X size={18} />
                            </button>
                        </div>

                        <div className="overflow-y-auto pr-1 flex-1 min-h-0 mb-6 flex flex-col">
                            <p className="text-xs text-on-surface-variant/60 mb-4">Select which results to include in the PDF:</p>

                            <div className="flex flex-col gap-2">
                                {[{ label: 'All Semesters (Full Transcript)', val: 'overall' },
                                  ...(results?.semesters || []).map((s: any) => {
                                      const num = s.semester_num ?? s.semester;
                                      return {
                                          label: s.semester_label || (num ? `Semester ${num}` : 'Semester'),
                                          val: String(num),
                                      };
                                  })
                                ].map(opt => (
                                    <button
                                        key={opt.val}
                                        onClick={() => setPdfSem(opt.val)}
                                        className={`flex items-center gap-3 px-4 py-3 rounded-lg border text-xs font-bold text-left transition-all ${
                                            pdfSem === opt.val
                                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                                : 'border-outline bg-surface text-on-surface-variant hover:bg-surface-container'
                                        }`}
                                    >
                                        <span className={`w-3 h-3 rounded-full border-2 flex-shrink-0 ${pdfSem === opt.val ? 'border-emerald-400 bg-emerald-400' : 'border-outline'}`} />
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="flex gap-3 shrink-0">
                            <button
                                onClick={() => setShowPdfModal(false)}
                                className="flex-1 py-3 rounded-lg border border-outline bg-surface text-xs font-bold text-on-surface-variant hover:bg-surface-container transition-all"
                            >Cancel</button>
                            <button
                                onClick={handleDownloadPdf}
                                disabled={pdfLoading}
                                className="flex-1 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
                            >
                                {pdfLoading
                                    ? <><Loader size={20} /> Generating…</>
                                    : <><Download size={12} /> Download PDF</>
                                }
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
            {/* ── Interactive Results Editor Modal ──────────────────────── */}
            {isEditorOpen && createPortal(
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full max-w-4xl rounded-xl border border-outline bg-surface overflow-hidden flex flex-col max-h-[90vh] shadow-2xl"
                    >
                        {/* Header */}
                        <div className="p-6 md:p-8 border-b border-outline flex flex-col md:flex-row md:items-center justify-between gap-6 shrink-0 bg-surface-container">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-surface-container-high flex items-center justify-center text-on-surface border border-outline shrink-0">
                                    <Edit size={22} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-on-surface tracking-tight">Confirm Academic Records</h3>
                                    <p className="text-xs text-on-surface-variant/40 mt-1">Verify extracted grades, marks, and credits</p>
                                </div>
                            </div>

                            {/* SGPA Banner */}
                            <div className="flex gap-4 items-center self-start md:self-auto">
                                <div className="px-5 py-3 rounded-xl bg-surface border border-outline text-center min-w-[100px]">
                                    <span className="block text-xs font-medium text-on-surface-variant/60">Calculated SGPA</span>
                                    <span className="text-2xl font-bold text-on-surface">{calculateDynamicSGPA(editorSubjects).toFixed(2)}</span>
                                </div>
                                <div className="px-5 py-3 rounded-xl bg-surface border border-outline text-center min-w-[100px]">
                                    <span className="block text-xs font-medium text-on-surface-variant/60">Total Credits</span>
                                    <span className="text-2xl font-bold text-on-surface">
                                        {editorSubjects.reduce((acc, s) => acc + (parseInt(s.credits) || 0), 0)}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {/* Modal Body (Scrollable) */}
                        <div className="p-6 md:p-8 overflow-y-auto space-y-8 flex-1">
                            {/* Student Metadata Form */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 rounded-xl bg-surface-container border border-outline p-6">
                                <div className="md:col-span-3">
                                    <h4 className="text-xs font-semibold text-on-surface-variant/80">Extracted Student Information</h4>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-on-surface-variant/70 mb-1.5 ml-1">Student Name</label>
                                    <input
                                        type="text"
                                        value={editorStudentInfo.name}
                                        onChange={(e) => setEditorStudentInfo({ ...editorStudentInfo, name: e.target.value })}
                                        className="w-full px-4 py-2.5 rounded-lg border border-outline bg-surface text-xs text-on-surface"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-on-surface-variant/70 mb-1.5 ml-1">Enrollment Number</label>
                                    <input
                                        type="text"
                                        value={editorStudentInfo.enrollment_number}
                                        onChange={(e) => setEditorStudentInfo({ ...editorStudentInfo, enrollment_number: e.target.value })}
                                        className="w-full px-4 py-2.5 rounded-lg border border-outline bg-surface text-xs text-on-surface"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-on-surface-variant/70 mb-1.5 ml-1 flex items-center justify-between">
                                        <span>Target Semester</span>
                                        {isSemAutoDetected && (
                                            <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                                                Auto-detected
                                            </span>
                                        )}
                                    </label>
                                    <select
                                        value={editorSem}
                                        onChange={(e) => {
                                            setEditorSem(parseInt(e.target.value) || 1);
                                            setIsSemAutoDetected(false);
                                        }}
                                        className="w-full px-4 py-2.5 rounded-lg border border-outline bg-surface text-xs text-on-surface"
                                    >
                                        {[1, 2, 3, 4, 5, 6, 7, 8].map(s => (
                                            <option key={s} value={s}>Semester {s}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-on-surface-variant/70 mb-1.5 ml-1">Institute / College</label>
                                    <input
                                        type="text"
                                        value={editorStudentInfo.institute}
                                        onChange={(e) => setEditorStudentInfo({ ...editorStudentInfo, institute: e.target.value })}
                                        className="w-full px-4 py-2.5 rounded-lg border border-outline bg-surface text-xs text-on-surface"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-medium text-on-surface-variant/70 mb-1.5 ml-1">Program / Course</label>
                                    <input
                                        type="text"
                                        value={editorStudentInfo.program}
                                        onChange={(e) => setEditorStudentInfo({ ...editorStudentInfo, program: e.target.value })}
                                        className="w-full px-4 py-2.5 rounded-lg border border-outline bg-surface text-xs text-on-surface"
                                    />
                                </div>
                            </div>

                            {/* Subjects Table */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-semibold text-on-surface-variant/80 ml-1">Extracted Subjects & Grades</h4>
                                    <button
                                        onClick={handleAddSubject}
                                        className="px-4 py-2 rounded-lg bg-surface border border-outline text-xs font-semibold text-on-surface hover:bg-surface-container transition-all flex items-center gap-1.5"
                                    >
                                        <Plus size={14} /> Add Subject
                                    </button>
                                </div>

                                <div className="border border-outline rounded-xl overflow-hidden bg-surface overflow-x-auto">
                                    <table className="w-full text-left border-collapse text-xs min-w-[800px]">
                                        <thead>
                                            <tr className="border-b border-outline bg-surface-container text-on-surface-variant/60 text-xs font-medium">
                                                <th className="p-4 w-[15%]">Paper Code</th>
                                                <th className="p-4 w-[40%]">Subject Name</th>
                                                <th className="p-4 w-[10%] text-center">Credits</th>
                                                <th className="p-4 w-[10%] text-center">Internal</th>
                                                <th className="p-4 w-[10%] text-center">External</th>
                                                <th className="p-4 w-[10%] text-center">Total</th>
                                                <th className="p-4 w-[10%] text-center">Grade</th>
                                                <th className="p-4 w-[5%]"></th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-outline-variant">
                                            {editorSubjects.map((sub) => {
                                                const internal = parseFloat(sub.internal_theory) || 0;
                                                const external = parseFloat(sub.external_theory) || 0;
                                                const total = internal + external;
                                                const grade = calculateDynamicGrade(total);

                                                return (
                                                    <tr key={sub.id} className="hover:bg-surface-container/50">
                                                        <td className="p-3">
                                                            <input
                                                                type="text"
                                                                value={sub.paper_code}
                                                                onChange={(e) => handleSubjectChange(sub.id, 'paper_code', e.target.value)}
                                                                placeholder="e.g. BS103"
                                                                className="w-full px-2 py-1.5 rounded-lg border border-outline bg-surface text-on-surface font-mono"
                                                            />
                                                        </td>
                                                        <td className="p-3">
                                                            <input
                                                                type="text"
                                                                value={sub.subject_name}
                                                                onChange={(e) => handleSubjectChange(sub.id, 'subject_name', e.target.value)}
                                                                placeholder="Subject Title"
                                                                className="w-full px-2 py-1.5 rounded-lg border border-outline bg-surface text-on-surface"
                                                            />
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <input
                                                                type="number"
                                                                value={sub.credits}
                                                                onChange={(e) => handleSubjectChange(sub.id, 'credits', parseInt(e.target.value) || 0)}
                                                                className="w-16 px-2 py-1.5 rounded-lg border border-outline bg-surface text-center text-on-surface"
                                                                min="0"
                                                                max="8"
                                                            />
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <input
                                                                type="number"
                                                                value={sub.internal_theory}
                                                                onChange={(e) => handleSubjectChange(sub.id, 'internal_theory', parseFloat(e.target.value) || 0)}
                                                                className="w-16 px-2 py-1.5 rounded-lg border border-outline bg-surface text-center text-on-surface"
                                                                min="0"
                                                                max="100"
                                                            />
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <input
                                                                type="number"
                                                                value={sub.external_theory}
                                                                onChange={(e) => handleSubjectChange(sub.id, 'external_theory', parseFloat(e.target.value) || 0)}
                                                                className="w-16 px-2 py-1.5 rounded-lg border border-outline bg-surface text-center text-on-surface"
                                                                min="0"
                                                                max="100"
                                                            />
                                                        </td>
                                                        <td className="p-3 text-center font-bold text-on-surface/80">
                                                            {total}
                                                        </td>
                                                        <td className="p-3 text-center font-bold">
                                                            <span className={`px-2.5 py-1 rounded text-[10px] ${gradeBgClass(grade)}`}>
                                                                {grade}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-center">
                                                            <button
                                                                onClick={() => handleDeleteSubject(sub.id)}
                                                                className="p-1.5 rounded-lg bg-surface border border-outline text-on-surface-variant/40 hover:text-red-500 hover:border-red-500/20 transition-colors"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="p-6 md:p-8 border-t border-outline flex items-center justify-end gap-3 shrink-0 bg-surface-container">
                            <button
                                onClick={() => setIsEditorOpen(false)}
                                disabled={isSaving}
                                className="px-5 py-3 rounded-lg border border-outline bg-surface text-xs font-bold text-on-surface-variant hover:bg-surface-container transition-all disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEditor}
                                disabled={isSaving}
                                className="px-6 py-3 rounded-lg bg-primary hover:opacity-90 border border-primary text-xs font-bold text-on-primary transition-all shadow-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSaving ? (
                                    <><RefreshCw size={12} className="animate-spin" /> Saving...</>
                                ) : (
                                    'Save & Commit Results'
                                )}
                            </button>
                        </div>
                    </motion.div>
                </div>,
                document.body
            )}

        </motion.div>
    );
};

export default Results;
