import React, { useMemo, useState } from 'react';
import { Bar, Doughnut, Line } from 'react-chartjs-2';
import {
    ArcElement,
    BarElement,
    CategoryScale,
    Chart as ChartJS,
    Filler,
    Legend,
    LinearScale,
    LineElement,
    PointElement,
    Tooltip as ChartTooltip,
    type ChartOptions,
} from 'chart.js';
import {
    Activity,
    ArrowDownRight,
    ArrowUpRight,
    BarChart3,
    BookOpen,
    Layers,
    PieChart,
    ShieldCheck,
    Target,
    TrendingUp,
    CheckCircle2,
    SlidersHorizontal,
} from 'lucide-react';
import { IPU_GRADE_POINTS } from '@/pages/Results';

ChartJS.register(
    CategoryScale,
    LinearScale,
    BarElement,
    PointElement,
    LineElement,
    ArcElement,
    Filler,
    ChartTooltip,
    Legend
);

const GRADE_ORDER = ['O', 'A+', 'A', 'B+', 'B', 'C', 'P', 'F'] as const;
const GRADE_COLORS: Record<string, string> = {
    'O': '#10b981',
    'A+': '#6366f1',
    'A': '#818cf8',
    'B+': '#38bdf8',
    'B': '#f59e0b',
    'C': '#fb923c',
    'P': '#f97316',
    'F': '#f43f5e',
};

function isLabSubject(name: string, credits: number) {
    const upper = String(name || '').toUpperCase();
    return credits <= 1 || upper.includes('LAB') || upper.includes('PRACTICAL') || upper.includes('WORKSHOP') || upper.includes('SEMINAR') || upper.includes('VIVA');
}

type ResultsDashboardProps = {
    user: any;
    theme: string;
    results: any;
    profileInfo: any;
    displayBatch: string;
    lastUpdated: string | null;
    formatDate: (value: string | null) => string;
    selectedSem: string;
    setSelectedSem: (value: string) => void;
    currentMetrics: any;
    metrics: any;
    semMetrics: any;
    academicStrength: number;
    currentSubjects: any[];
    currentSemesterMeta: any;
    getSubjectMarks: (subject: any) => { internal: number; external: number; total: number; maxMarks: number; hasExplicitTotal: boolean };
    getSubjectDisplayMark: (value: unknown) => string;
    gradeBgClass: (grade: string) => string;
    getSubjectPercentage: (subject: any) => number;
    onUpdateCredit?: (semester: number, code: string, name: string, credits: number) => Promise<void>;
};

const ResultsDashboard: React.FC<ResultsDashboardProps> = ({
    user,
    theme,
    results,
    profileInfo,
    displayBatch,
    lastUpdated,
    formatDate,
    selectedSem,
    setSelectedSem,
    currentMetrics,
    metrics,
    semMetrics,
    academicStrength,
    currentSubjects,
    currentSemesterMeta,
    getSubjectMarks,
    getSubjectDisplayMark,
    gradeBgClass,
    getSubjectPercentage,
    onUpdateCredit,
}) => {
    const [chartSort, setChartSort] = useState<'ranked' | 'order'>('ranked');
    const [tableFilter, setTableFilter] = useState<'all' | 'distinction' | 'focus'>('all');
    const [editingCreditKey, setEditingCreditKey] = useState<string | null>(null);

    const currentGpa = selectedSem === 'overall' ? (metrics?.cgpa ?? 0) : (semMetrics?.sgpa ?? 0);
    const defaultTarget = useMemo(() => {
        const base = metrics?.cgpa ?? 8.0;
        return Math.min(9.8, Math.max(6.0, Math.round((base + 0.25) * 10) / 10));
    }, [metrics?.cgpa]);

    const [targetCgpa, setTargetCgpa] = useState<number>(defaultTarget);
    const avgSemCredits = useMemo(() => {
        const n = results?.semesters?.length || 1;
        const avg = Math.round((metrics?.totalCredits || 24) / n);
        return Math.min(32, Math.max(16, avg || 24));
    }, [results?.semesters?.length, metrics?.totalCredits]);
    const [nextSemCredits, setNextSemCredits] = useState<number>(avgSemCredits);

    const gridColor = theme === 'dark' ? 'rgba(255,255,255,0.06)' : 'rgba(15,23,42,0.07)';
    const labelColor = theme === 'dark' ? 'rgba(226,232,240,0.68)' : 'rgba(30,41,59,0.72)';
    const tooltipBg = theme === 'dark' ? '#0e111b' : '#0f172a';

    // Completed subjects in active view
    const completedSubjects = useMemo(
        () => currentSubjects.filter((s: any) => !s.is_pending && s.grade !== '-'),
        [currentSubjects]
    );

    // Rich practical insights
    const insights = useMemo(() => {
        if (!completedSubjects.length) return null;
        const totalCr = completedSubjects.reduce((a: number, s: any) => a + (Number(s.credits || 0) || 0), 0);

        const rankedByScore = [...completedSubjects].sort((a, b) => getSubjectPercentage(b) - getSubjectPercentage(a));
        const strongest = rankedByScore[0];
        const distinctions = completedSubjects.filter((s) => getSubjectPercentage(s) >= 75).length;

        // Credit-weighted GPA drag: how much SGPA/CGPA points each subject left on the table vs O (10)
        const withDrag = completedSubjects.map((s) => {
            const cr = Number(s.credits || 0) || 0;
            const gp = s.grade_point !== null && s.grade_point !== undefined
                ? Number(s.grade_point)
                : (IPU_GRADE_POINTS[String(s.grade || '').toUpperCase()] ?? 0);
            const drag = totalCr > 0 ? ((10 - gp) * cr) / totalCr : 0;
            return { sub: s, cr, gp, drag };
        });
        withDrag.sort((a, b) => b.drag - a.drag || getSubjectPercentage(a.sub) - getSubjectPercentage(b.sub));
        const biggestDrag = withDrag[0];

        // Internal vs External contribution
        let sumInt = 0;
        let sumExt = 0;
        let theorySum = 0;
        let theoryCnt = 0;
        let labSum = 0;
        let labCnt = 0;
        for (const s of completedSubjects) {
            const m = getSubjectMarks(s);
            sumInt += m.internal;
            sumExt += m.external;
            const pct = getSubjectPercentage(s);
            if (isLabSubject(s.name || '', Number(s.credits || 3))) {
                labSum += pct;
                labCnt += 1;
            } else {
                theorySum += pct;
                theoryCnt += 1;
            }
        }
        const totalScored = Math.max(1, sumInt + sumExt);
        const intSharePct = Math.round((sumInt / totalScored) * 100);
        const extSharePct = 100 - intSharePct;
        const avgInt = (sumInt / completedSubjects.length).toFixed(1);
        const avgExt = (sumExt / completedSubjects.length).toFixed(1);

        // Semester delta on Overview
        const sems = results?.semesters || [];
        let semDelta: number | null = null;
        if (sems.length >= 2) {
            const last = parseFloat(sems[sems.length - 1]?.sgpa || '0');
            const prev = parseFloat(sems[sems.length - 2]?.sgpa || '0');
            if (last > 0 && prev > 0) semDelta = Math.round((last - prev) * 100) / 100;
        }

        return {
            strongest,
            biggestDrag,
            distinctions,
            intSharePct,
            extSharePct,
            avgInt,
            avgExt,
            theoryAvg: theoryCnt ? Math.round(theorySum / theoryCnt) : null,
            labAvg: labCnt ? Math.round(labSum / labCnt) : null,
            semDelta,
        };
    }, [completedSubjects, getSubjectMarks, getSubjectPercentage, results?.semesters]);

    // Target CGPA What-If calculation (exact GGSIPU Ordinance 11 credit-weighted math)
    const planner = useMemo(() => {
        const earnedCr = metrics?.totalCredits || 0;
        const earnedPts = metrics?.totalGradePoints || 0;
        if (earnedCr <= 0 || nextSemCredits <= 0) return null;
        const reqSgpa = (targetCgpa * (earnedCr + nextSemCredits) - earnedPts) / nextSemCredits;
        return {
            reqSgpa,
            achievable: reqSgpa <= 10.0,
            comfortable: reqSgpa <= 8.8,
            alreadyMet: reqSgpa <= 4.0,
        };
    }, [metrics?.totalCredits, metrics?.totalGradePoints, targetCgpa, nextSemCredits]);

    // Ordered chart subjects (supports 20+ subjects cleanly via horizontal bars)
    const chartSubjects = useMemo(() => {
        const arr = [...completedSubjects];
        if (chartSort === 'ranked') {
            arr.sort((a, b) => getSubjectPercentage(b) - getSubjectPercentage(a));
        }
        return arr;
    }, [completedSubjects, chartSort, getSubjectPercentage]);

    // 1. Horizontal Subject Performance Chart
    const scoreChartData = useMemo(() => ({
        labels: chartSubjects.map((s: any) => {
            const code = s.code || s.name?.slice(0, 10) || '?';
            return selectedSem === 'overall' && s._semester ? `${code} (S${s._semester})` : code;
        }),
        datasets: [
            {
                label: 'Score %',
                data: chartSubjects.map((s: any) => getSubjectPercentage(s)),
                backgroundColor: chartSubjects.map((s: any) => {
                    const pct = getSubjectPercentage(s);
                    if (pct >= 90) return '#10b981';
                    if (pct >= 75) return '#6366f1';
                    if (pct >= 65) return '#38bdf8';
                    if (pct >= 55) return '#f59e0b';
                    return '#f43f5e';
                }),
                borderRadius: 6,
                barThickness: 14,
            },
        ],
    }), [chartSubjects, selectedSem, getSubjectPercentage]);

    const scoreChartOptions: ChartOptions<'bar'> = useMemo(() => ({
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: tooltipBg,
                titleColor: '#f8fafc',
                bodyColor: 'rgba(226,232,240,0.88)',
                borderColor: 'rgba(129,140,248,0.35)',
                borderWidth: 1,
                padding: 11,
                callbacks: {
                    title: (items) => {
                        const sub = chartSubjects[items[0]?.dataIndex ?? 0];
                        return sub ? `${sub.code || ''} · ${sub.name}` : '';
                    },
                    label: (item) => {
                        const sub = chartSubjects[item.dataIndex];
                        if (!sub) return '';
                        const m = getSubjectMarks(sub);
                        return [
                            `Total: ${m.total}/${m.maxMarks} (${getSubjectPercentage(sub)}%)`,
                            `Internal: ${m.internal}  ·  External: ${m.external}`,
                            `Grade: ${sub.grade || '—'} (${sub.grade_point ?? '—'} pt)  ·  ${sub.credits ?? 0} Credits`,
                        ];
                    },
                },
            },
        },
        scales: {
            x: {
                min: 0,
                max: 100,
                grid: { color: gridColor },
                ticks: { color: labelColor, font: { size: 10 }, stepSize: 25, callback: (v) => `${v}%` },
            },
            y: {
                grid: { display: false },
                ticks: { color: labelColor, font: { size: 10, weight: 600 } },
            },
        },
    }), [chartSubjects, getSubjectMarks, getSubjectPercentage, gridColor, labelColor, tooltipBg]);

    // 2. Internal vs External Stacked Horizontal Chart
    const componentChartData = useMemo(() => ({
        labels: chartSubjects.map((s: any) => {
            const code = s.code || s.name?.slice(0, 10) || '?';
            return selectedSem === 'overall' && s._semester ? `${code} (S${s._semester})` : code;
        }),
        datasets: [
            {
                label: 'Internal',
                data: chartSubjects.map((s: any) => getSubjectMarks(s).internal),
                backgroundColor: '#38bdf8',
                borderRadius: 4,
                barThickness: 14,
            },
            {
                label: 'External',
                data: chartSubjects.map((s: any) => getSubjectMarks(s).external),
                backgroundColor: theme === 'dark' ? '#818cf8' : '#4f46e5',
                borderRadius: 4,
                barThickness: 14,
            },
        ],
    }), [chartSubjects, selectedSem, getSubjectMarks, theme]);

    const componentChartOptions: ChartOptions<'bar'> = useMemo(() => ({
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                align: 'end',
                labels: { color: labelColor, boxWidth: 10, boxHeight: 10, usePointStyle: true, font: { size: 10.5 } },
            },
            tooltip: {
                backgroundColor: tooltipBg,
                titleColor: '#f8fafc',
                bodyColor: 'rgba(226,232,240,0.88)',
                borderColor: 'rgba(129,140,248,0.35)',
                borderWidth: 1,
                padding: 10,
                callbacks: {
                    title: (items) => {
                        const sub = chartSubjects[items[0]?.dataIndex ?? 0];
                        return sub ? `${sub.code || ''} · ${sub.name}` : '';
                    },
                },
            },
        },
        scales: {
            x: {
                stacked: true,
                max: 100,
                grid: { color: gridColor },
                ticks: { color: labelColor, font: { size: 10 }, stepSize: 25 },
            },
            y: {
                stacked: true,
                grid: { display: false },
                ticks: { color: labelColor, font: { size: 10, weight: 600 } },
            },
        },
    }), [chartSubjects, gridColor, labelColor, tooltipBg]);

    // 3. SGPA & Running CGPA Trajectory Line Chart (Overview)
    const trajectoryData = useMemo(() => {
        const sems = results?.semesters || [];
        return {
            labels: sems.map((s: any) => `Sem ${s.semester_num ?? s.semester}`),
            datasets: [
                {
                    label: 'Semester SGPA',
                    data: sems.map((s: any) => parseFloat(s.sgpa || '0')),
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.16)',
                    borderWidth: 2.5,
                    pointRadius: 5,
                    pointHoverRadius: 7,
                    pointBackgroundColor: '#6366f1',
                    fill: true,
                    tension: 0.35,
                },
                {
                    label: 'Cumulative CGPA',
                    data: sems.map((s: any) => parseFloat(s.cumulative_cgpa || s.sgpa || '0')),
                    borderColor: '#06b6d4',
                    backgroundColor: 'transparent',
                    borderWidth: 2,
                    borderDash: [5, 4],
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    pointBackgroundColor: '#06b6d4',
                    fill: false,
                    tension: 0.35,
                },
            ],
        };
    }, [results?.semesters]);

    const trajectoryOptions: ChartOptions<'line'> = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'top',
                align: 'end',
                labels: { color: labelColor, boxWidth: 10, usePointStyle: true, font: { size: 10.5 } },
            },
            tooltip: {
                backgroundColor: tooltipBg,
                titleColor: '#f8fafc',
                bodyColor: 'rgba(226,232,240,0.88)',
                borderColor: 'rgba(129,140,248,0.35)',
                borderWidth: 1,
                padding: 10,
                callbacks: {
                    afterBody: (items) => {
                        const sem = (results?.semesters || [])[items[0]?.dataIndex ?? 0];
                        if (!sem) return '';
                        return `Credits: ${sem.total_credits || 0} Cr  ·  Marks: ${sem.total_marks || 0}/${sem.max_marks || 0}`;
                    },
                },
            },
        },
        scales: {
            x: { grid: { display: false }, ticks: { color: labelColor, font: { size: 11, weight: 600 } } },
            y: {
                min: 4,
                max: 10,
                grid: { color: gridColor },
                ticks: { color: labelColor, font: { size: 10 }, stepSize: 1 },
            },
        },
    }), [gridColor, labelColor, results?.semesters, tooltipBg]);

    // 4. Ordered Grade Distribution Doughnut (computed dynamically for active view!)
    const activeGradeDist = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const s of completedSubjects) {
            const g = String(s.grade || '').toUpperCase();
            if (g && g !== '-') counts[g] = (counts[g] || 0) + 1;
        }
        const labels = GRADE_ORDER.filter((g) => (counts[g] || 0) > 0);
        return {
            counts,
            labels,
            chartData: {
                labels,
                datasets: [
                    {
                        data: labels.map((g) => counts[g]),
                        backgroundColor: labels.map((g) => GRADE_COLORS[g] || '#64748b'),
                        borderWidth: 0,
                        hoverOffset: 5,
                    },
                ],
            },
        };
    }, [completedSubjects]);

    const doughnutOptions: ChartOptions<'doughnut'> = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        cutout: '74%',
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: tooltipBg,
                titleColor: '#f8fafc',
                bodyColor: 'rgba(226,232,240,0.85)',
                borderColor: 'rgba(255,255,255,0.14)',
                borderWidth: 1,
                padding: 10,
            },
        },
    }), [tooltipBg]);

    // Filterable subject table rows
    const filteredTableSubjects = useMemo(() => {
        return currentSubjects.filter((sub: any) => {
            if (tableFilter === 'distinction') return !sub.is_pending && getSubjectPercentage(sub) >= 75;
            if (tableFilter === 'focus') return !sub.is_pending && getSubjectPercentage(sub) < 70;
            return true;
        });
    }, [currentSubjects, tableFilter, getSubjectPercentage]);

    const dynamicChartHeight = Math.max(230, chartSubjects.length * 28);
    const creditsSynced = metrics?.creditsSyncedCount ?? 0;
    const totalSubsCount = metrics?.totalSubjects ?? currentSubjects.length;

    return (
        <div className="space-y-6 text-on-background select-none">
            {/* Hero Profile Overview */}
            <div className="liquid-hero-banner rounded-[26px] p-6 sm:p-7 relative overflow-hidden">
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-6">
                    <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-primary">
                                <ShieldCheck size={14} className="text-primary" />
                                Academic Transcript · Synced {formatDate(lastUpdated)}
                            </span>
                            <span
                                data-tooltip="SGPA & CGPA follow official GGSIPU Ordinance 11 credit-weighted formula Σ(Ci × Gi) / ΣCi using your Attendance Dashboard subject credits. Edit any subject's credits on Dashboard to recalculate live."
                                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-500/12 border border-emerald-500/25 text-emerald-600 dark:text-emerald-300 text-[10px] font-bold cursor-help"
                            >
                                <CheckCircle2 size={11} />
                                {creditsSynced > 0
                                    ? `${creditsSynced}/${totalSubsCount} Credits Synced from Dashboard`
                                    : 'Official IPU Ordinance 11 Scale'}
                            </span>
                        </div>

                        <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-on-surface tracking-tight mb-0.5 truncate">
                            {profileInfo?.name || user?.name}
                        </h2>
                        <p className="text-xs font-semibold text-on-surface-variant mb-5">
                            {profileInfo?.programme || 'Programme unavailable'} · Batch {displayBatch}
                        </p>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {[
                                { label: 'Enrollment', value: results.enrollment_number || '—' },
                                { label: 'Batch', value: displayBatch },
                                { label: 'Admission', value: profileInfo?.admission_year || '—' },
                                { label: 'Institution', value: profileInfo?.institution || '—' },
                            ].map((item) => (
                                <div
                                    key={item.label}
                                    data-tooltip={`${item.label}: ${item.value}`}
                                    className="rounded-2xl bg-surface/75 dark:bg-black/25 border border-primary/14 px-3.5 py-2.5 min-w-0"
                                >
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/65 mb-0.5">{item.label}</p>
                                    <p className="text-xs font-bold text-on-surface truncate">{item.value}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div
                        data-tooltip="Official GGSIPU Ordinance 11 credit-weighted GPA: Σ(Credits × Grade Point) ÷ Σ(Credits)"
                        className="flex flex-col items-center justify-center rounded-[22px] bg-surface/80 dark:bg-black/30 border border-primary/25 p-6 min-w-[196px] text-center shrink-0"
                    >
                        <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary mb-1.5">
                            {selectedSem === 'overall' ? 'Overall CGPA' : `Semester ${selectedSem} SGPA`}
                        </p>
                        <p className="font-display text-5xl font-extrabold gradient-text tracking-tight leading-none tabular-nums">
                            {currentGpa > 0 ? currentGpa.toFixed(2) : '—'}
                        </p>
                        <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
                            <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-indigo-500/15 to-cyan-500/15 border border-primary/20 text-primary text-[10.5px] font-bold tabular-nums">
                                {academicStrength.toFixed(1)}% Marks
                            </span>
                            <span
                                data-tooltip="Official GGSIPU degree percentage rule: CGPA × 10"
                                className="px-2.5 py-0.5 rounded-full bg-on-surface/[0.06] border border-on-surface/[0.10] text-on-surface-variant text-[10.5px] font-bold tabular-nums"
                            >
                                {(currentGpa * 10).toFixed(1)}% IPU Eq.
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Semester Filter Pills */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setSelectedSem('overall')}
                        data-tooltip="View cumulative analytics across all published semesters"
                        className={`no-fluid h-8 px-4 rounded-full text-xs font-bold transition-all border cursor-pointer ${
                            selectedSem === 'overall'
                                ? 'btn-gradient border-transparent'
                                : 'bg-surface/75 dark:bg-white/[0.05] border-primary/18 text-on-surface-variant hover:text-primary hover:border-primary/40'
                        }`}
                    >
                        Overview
                    </button>
                    {results.semesters.map((s: any) => {
                        const active = String(selectedSem) === String(s.semester);
                        return (
                            <button
                                key={s.semester}
                                onClick={() => setSelectedSem(String(s.semester))}
                                data-tooltip={`Semester ${s.semester} · SGPA ${parseFloat(s.sgpa || '0').toFixed(2)} · ${s.total_credits || 0} Cr`}
                                className={`no-fluid h-8 px-4 rounded-full text-xs font-bold transition-all border cursor-pointer tabular-nums ${
                                    active
                                        ? 'btn-gradient border-transparent'
                                        : 'bg-surface/75 dark:bg-white/[0.05] border-primary/18 text-on-surface-variant hover:text-primary hover:border-primary/40'
                                }`}
                            >
                                Sem {s.semester}
                                <span className={`ml-1.5 text-[10px] ${active ? 'opacity-90' : 'text-on-surface-variant/65'}`}>
                                    {parseFloat(s.sgpa || '0').toFixed(2)}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Primary KPI Row (Zero Duplicate Stats) */}
            {currentMetrics && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="liquid-glass rounded-[22px] p-5 flex flex-col justify-between min-h-[116px]">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
                                {selectedSem === 'overall' ? 'Credit-Weighted CGPA' : 'Semester SGPA'}
                            </span>
                            <Activity size={15} className="text-primary/75" />
                        </div>
                        <div>
                            <p className="text-2xl font-extrabold tracking-tight text-on-surface leading-none tabular-nums">
                                {currentGpa > 0 ? currentGpa.toFixed(2) : '—'}
                            </p>
                            <p className="text-[11px] text-on-surface-variant/65 mt-1.5 tabular-nums">
                                {Math.round(currentMetrics.totalGradePoints || 0)} pts ÷ {Math.round(currentMetrics.totalCredits || 0)} cr
                            </p>
                        </div>
                    </div>

                    <div className="liquid-glass rounded-[22px] p-5 flex flex-col justify-between min-h-[116px]">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
                                Scored Marks
                            </span>
                            <BarChart3 size={15} className="text-primary/75" />
                        </div>
                        <div>
                            <p className="text-2xl font-extrabold tracking-tight text-on-surface leading-none tabular-nums">
                                {Math.round(currentMetrics.totalMarks)}/{Math.round(currentMetrics.totalMaxMarks)}
                            </p>
                            <p className="text-[11px] text-on-surface-variant/65 mt-1.5 tabular-nums">
                                {academicStrength.toFixed(1)}% raw marks aggregate
                            </p>
                        </div>
                    </div>

                    <div className="liquid-glass rounded-[22px] p-5 flex flex-col justify-between min-h-[116px]">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
                                Earned Credits
                            </span>
                            <BookOpen size={15} className="text-primary/75" />
                        </div>
                        <div>
                            <p className="text-2xl font-extrabold tracking-tight text-on-surface leading-none tabular-nums">
                                {Math.round(currentMetrics.totalCredits || 0)}
                            </p>
                            <p className="text-[11px] text-on-surface-variant/65 mt-1.5">
                                Across {currentSubjects.length} published papers
                            </p>
                        </div>
                    </div>

                    <div className="liquid-glass rounded-[22px] p-5 flex flex-col justify-between min-h-[116px]">
                        <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant/60">
                                Standing &amp; Distinctions
                            </span>
                            <TrendingUp size={15} className="text-emerald-500" />
                        </div>
                        <div>
                            <p className="text-2xl font-extrabold tracking-tight text-on-surface leading-none tabular-nums">
                                {currentMetrics.passRate}% Pass
                            </p>
                            <p className="text-[11px] text-on-surface-variant/65 mt-1.5 tabular-nums">
                                {insights?.distinctions ?? 0} of {completedSubjects.length} papers ≥ 75%
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Actionable Academic Insights Strip */}
            {insights && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div
                        data-tooltip={insights.strongest ? `${insights.strongest.name} (${insights.strongest.code}) · ${getSubjectPercentage(insights.strongest)}% · Grade ${insights.strongest.grade}` : undefined}
                        className="liquid-glass rounded-[20px] p-5"
                    >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/55 mb-1">Top Performer</p>
                        <p className="text-sm font-extrabold tracking-tight text-emerald-600 dark:text-emerald-400 truncate">
                            {insights.strongest?.code || '—'} · {getSubjectPercentage(insights.strongest)}% ({insights.strongest?.grade})
                        </p>
                        <p className="text-[11px] text-on-surface-variant/70 mt-1 truncate">
                            {insights.strongest?.name || 'No subjects'}
                        </p>
                    </div>

                    <div
                        data-tooltip={
                            insights.biggestDrag
                                ? `${insights.biggestDrag.sub.name} (${insights.biggestDrag.cr} Cr, Grade ${insights.biggestDrag.sub.grade}) cost ${insights.biggestDrag.drag.toFixed(2)} GPA points relative to an O grade`
                                : undefined
                        }
                        className="liquid-glass rounded-[20px] p-5"
                    >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/55 mb-1">Highest GPA Impact Area</p>
                        <p className="text-sm font-extrabold tracking-tight text-rose-500 dark:text-rose-400 truncate tabular-nums">
                            {insights.biggestDrag?.sub?.code || '—'} · −{insights.biggestDrag?.drag.toFixed(2)} GPA
                        </p>
                        <p className="text-[11px] text-on-surface-variant/70 mt-1 truncate">
                            {insights.biggestDrag?.sub?.name} ({insights.biggestDrag?.cr} Cr · {getSubjectPercentage(insights.biggestDrag?.sub)}%)
                        </p>
                    </div>

                    <div
                        data-tooltip={`Average Internal: ${insights.avgInt} · Average External: ${insights.avgExt}`}
                        className="liquid-glass rounded-[20px] p-5"
                    >
                        <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/55 mb-1">Internal vs External</p>
                        <p className="text-sm font-extrabold tracking-tight text-on-surface tabular-nums">
                            {insights.avgInt} Int · {insights.avgExt} Ext
                        </p>
                        <div className="mt-2 h-1.5 rounded-full bg-on-surface/[0.08] overflow-hidden flex">
                            <div className="h-full bg-sky-400" style={{ width: `${insights.intSharePct}%` }} />
                            <div className="h-full bg-indigo-500" style={{ width: `${insights.extSharePct}%` }} />
                        </div>
                    </div>

                    <div className="liquid-glass rounded-[20px] p-5">
                        {selectedSem === 'overall' && insights.semDelta !== null ? (
                            <>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/55 mb-1">Latest Term Trend</p>
                                <p className={`text-sm font-extrabold tracking-tight inline-flex items-center gap-1 tabular-nums ${insights.semDelta >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500 dark:text-rose-400'}`}>
                                    {insights.semDelta >= 0 ? <ArrowUpRight size={15} /> : <ArrowDownRight size={15} />}
                                    {insights.semDelta >= 0 ? '+' : ''}{insights.semDelta.toFixed(2)} SGPA
                                </p>
                                <p className="text-[11px] text-on-surface-variant/70 mt-1">
                                    Compared to previous semester
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/55 mb-1">Theory vs Practicals</p>
                                <p className="text-sm font-extrabold tracking-tight text-on-surface tabular-nums">
                                    {insights.theoryAvg !== null ? `${insights.theoryAvg}% Theory` : '—'}
                                    {insights.labAvg !== null ? ` · ${insights.labAvg}% Lab` : ''}
                                </p>
                                <p className="text-[11px] text-on-surface-variant/70 mt-1">
                                    Mean percentage by course type
                                </p>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Overview-Only: Interactive Target CGPA Planner + Semester Cards + SGPA Trajectory */}
            {selectedSem === 'overall' && (
                <>
                    {/* Interactive Target CGPA Planner */}
                    {planner && (
                        <div className="liquid-glass rounded-[24px] p-5 sm:p-6">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
                                <div className="space-y-1 max-w-md">
                                    <div className="flex items-center gap-2">
                                        <Target size={15} className="text-primary" />
                                        <h3 className="text-sm font-extrabold text-on-surface tracking-tight">Target CGPA Planner</h3>
                                    </div>
                                    <p className="text-[11.5px] text-on-surface-variant/75 leading-relaxed">
                                        Simulate the exact SGPA you need next semester to hit your target cumulative GPA under official IPU credit weights.
                                    </p>
                                </div>

                                <div className="flex flex-wrap items-center gap-4">
                                    <div className="min-w-[170px]">
                                        <div className="flex justify-between text-[11px] font-bold mb-1">
                                            <span className="text-on-surface-variant">Target CGPA</span>
                                            <span className="text-primary font-mono tabular-nums">{targetCgpa.toFixed(2)}</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={6.0}
                                            max={9.8}
                                            step={0.05}
                                            value={targetCgpa}
                                            onChange={(e) => setTargetCgpa(parseFloat(e.target.value))}
                                            className="w-full accent-indigo-500 cursor-pointer"
                                        />
                                    </div>

                                    <div className="min-w-[130px]">
                                        <div className="flex justify-between text-[11px] font-bold mb-1">
                                            <span className="text-on-surface-variant">Next Sem Cr</span>
                                            <span className="text-on-surface font-mono tabular-nums">{nextSemCredits} Cr</span>
                                        </div>
                                        <input
                                            type="range"
                                            min={14}
                                            max={32}
                                            step={1}
                                            value={nextSemCredits}
                                            onChange={(e) => setNextSemCredits(parseInt(e.target.value, 10))}
                                            className="w-full accent-cyan-500 cursor-pointer"
                                        />
                                    </div>

                                    <div className="rounded-2xl bg-surface/85 dark:bg-black/25 border border-primary/20 px-4 py-2.5 min-w-[172px] text-center">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/65">Required Next SGPA</p>
                                        <p className={`font-display text-2xl font-extrabold tabular-nums mt-0.5 ${
                                            !planner.achievable
                                                ? 'text-rose-500'
                                                : planner.comfortable
                                                ? 'text-emerald-600 dark:text-emerald-400'
                                                : 'text-amber-600 dark:text-amber-400'
                                        }`}>
                                            {planner.alreadyMet ? 'Met!' : planner.reqSgpa.toFixed(2)}
                                        </p>
                                        <p className="text-[10px] font-semibold text-on-surface-variant/70">
                                            {!planner.achievable
                                                ? 'Needs 2+ semesters (>10.0)'
                                                : planner.alreadyMet
                                                ? 'Already at or above target'
                                                : planner.comfortable
                                                ? 'Realistic next term'
                                                : 'High-effort stretch target'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Semester Cards Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {results.semesters.map((sem: any) => {
                            const sgpa = sem.sgpa ? parseFloat(sem.sgpa) : 0;
                            const semCredits = Number(sem.total_credits || 0);
                            const semMarks = Number(sem.total_marks || 0);
                            const semMax = Number(sem.max_marks || 0);
                            const semPct = semMax > 0 ? Math.round((semMarks / semMax) * 100) : 0;
                            return (
                                <div
                                    key={sem.semester}
                                    onClick={() => setSelectedSem(String(sem.semester))}
                                    data-tooltip={`Click to inspect ${sem.semester_label || `Semester ${sem.semester}`} subject breakdown`}
                                    className="cursor-pointer group liquid-glass rounded-[22px] p-5 hover:border-primary/40 transition-all"
                                >
                                    <div className="flex justify-between items-start mb-3">
                                        <div>
                                            <p className="text-sm font-extrabold text-on-surface group-hover:text-primary transition-colors">
                                                {sem.semester_label || `Semester ${sem.semester}`}
                                            </p>
                                            <p className="text-[11px] text-on-surface-variant/65 mt-0.5">
                                                {sem.subjects?.length || 0} Papers · {semCredits} Credits
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-2xl font-extrabold text-on-surface tabular-nums leading-none">{sgpa.toFixed(2)}</p>
                                            <p className="text-[10px] font-bold text-primary/80 uppercase mt-1">SGPA</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between text-[11px] font-semibold text-on-surface-variant/70 mb-2 tabular-nums">
                                        <span>{semMarks}/{semMax} ({semPct}%)</span>
                                        <span>Cum. CGPA {parseFloat(sem.cumulative_cgpa || sem.sgpa || '0').toFixed(2)}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-on-surface/[0.08] overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-indigo-500 to-cyan-400 rounded-full"
                                            style={{ width: `${Math.min(100, (sgpa / 10) * 100)}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* SGPA Trajectory Line Chart + Grade Distribution Doughnut */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                        <div className="liquid-glass rounded-[24px] p-5 sm:p-6 flex flex-col min-h-[300px]">
                            <div className="flex items-center justify-between gap-2 mb-1">
                                <div className="flex items-center gap-2">
                                    <TrendingUp size={15} className="text-primary" />
                                    <h3 className="text-sm font-bold text-on-surface tracking-tight">SGPA &amp; Cumulative CGPA Trend</h3>
                                </div>
                                <span className="text-[10.5px] font-mono font-bold text-on-surface-variant/65">Scale 4.0–10.0</span>
                            </div>
                            <p className="text-xs text-on-surface-variant/65 mb-4">Official credit-weighted progression across semesters</p>
                            <div className="flex-1 min-h-[205px]">
                                <Line data={trajectoryData} options={trajectoryOptions} />
                            </div>
                        </div>

                        <div className="liquid-glass rounded-[24px] overflow-hidden flex flex-col">
                            <div className="px-6 py-4 border-b border-on-surface/[0.07] flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                    <PieChart size={15} className="text-primary" />
                                    <h3 className="text-sm font-bold text-on-surface tracking-tight">Grade Distribution</h3>
                                </div>
                                <span className="text-[10.5px] font-semibold text-on-surface-variant/65">GGSIPU Ordinance 11</span>
                            </div>
                            <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6 items-center flex-1">
                                <div className="h-44 relative flex items-center justify-center">
                                    <Doughnut data={activeGradeDist.chartData} options={doughnutOptions} />
                                    <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                                        <span className="text-3xl font-extrabold text-on-surface tabular-nums">
                                            {completedSubjects.length}
                                        </span>
                                        <span className="text-[10px] font-semibold text-on-surface-variant/60 uppercase tracking-wider mt-0.5">
                                            Papers
                                        </span>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    {activeGradeDist.labels.map((lbl) => {
                                        const cnt = activeGradeDist.counts[lbl] || 0;
                                        const pct = completedSubjects.length ? Math.round((cnt / completedSubjects.length) * 100) : 0;
                                        return (
                                            <div
                                                key={lbl}
                                                className="flex justify-between items-center text-xs px-3 py-1.5 rounded-xl bg-on-surface/[0.03] border border-on-surface/[0.06]"
                                            >
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: GRADE_COLORS[lbl] }} />
                                                    <span className="font-bold text-on-surface">{lbl}</span>
                                                    <span className="text-[10px] text-on-surface-variant/60">{IPU_GRADE_POINTS[lbl]} pt</span>
                                                </div>
                                                <span className="font-mono font-bold text-on-surface-variant tabular-nums">
                                                    {cnt} <span className="text-[10px] opacity-60">({pct}%)</span>
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Subject Performance Ranking + Internal/External Breakdown (Horizontal & Scales Cleanly to 25+ Subjects!) */}
            {chartSubjects.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                    <div className="liquid-glass rounded-[24px] p-5 sm:p-6 flex flex-col">
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2">
                                <BarChart3 size={15} className="text-primary" />
                                <h3 className="text-sm font-bold text-on-surface tracking-tight">Subject Performance Ranking</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setChartSort((v) => (v === 'ranked' ? 'order' : 'ranked'))}
                                data-tooltip="Toggle between highest-to-lowest score ranking and curriculum order"
                                className="no-fluid h-7 px-2.5 rounded-full border border-on-surface/[0.11] bg-on-surface/[0.04] hover:border-primary/35 hover:text-primary text-[10.5px] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                            >
                                <SlidersHorizontal size={11} />
                                {chartSort === 'ranked' ? 'Ranked ↓' : 'Default Order'}
                            </button>
                        </div>
                        <p className="text-xs text-on-surface-variant/65 mb-3">Hover any bar for full subject name, credits, marks split &amp; grade</p>
                        <div className="max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
                            <div style={{ height: `${dynamicChartHeight}px` }}>
                                <Bar data={scoreChartData} options={scoreChartOptions} />
                            </div>
                        </div>
                    </div>

                    <div className="liquid-glass rounded-[24px] p-5 sm:p-6 flex flex-col">
                        <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2">
                                <Layers size={15} className="text-primary" />
                                <h3 className="text-sm font-bold text-on-surface tracking-tight">Internal vs External Breakdown</h3>
                            </div>
                            {insights && (
                                <span className="text-[10.5px] font-mono font-bold text-on-surface-variant/70 tabular-nums">
                                    {insights.intSharePct}% Int / {insights.extSharePct}% Ext
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-on-surface-variant/65 mb-3">Continuous assessment vs end-semester exam marks</p>
                        <div className="max-h-[420px] overflow-y-auto custom-scrollbar pr-1">
                            <div style={{ height: `${dynamicChartHeight}px` }}>
                                <Bar data={componentChartData} options={componentChartOptions} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Complete Filterable Subject Marks Table (Both Overview & Per-Semester!) */}
            {currentSubjects.length > 0 && (
                <div className="liquid-glass rounded-[24px] overflow-hidden">
                    <div className="p-5 sm:p-6 border-b border-on-surface/[0.07] flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <h3 className="text-sm font-bold text-on-surface tracking-tight">
                                {selectedSem === 'overall'
                                    ? 'All Published Papers'
                                    : `${results.semesters.find((s: any) => String(s.semester) === String(selectedSem))?.semester_label || `Semester ${selectedSem}`} — Papers`}
                            </h3>
                            {currentSemesterMeta ? (
                                <p className="mt-0.5 text-[11px] text-on-surface-variant/60">
                                    {currentSemesterMeta.examSession && <span>Exam {currentSemesterMeta.examSession}</span>}
                                    {currentSemesterMeta.examSession && currentSemesterMeta.declaredDate && <span className="mx-2">·</span>}
                                    {currentSemesterMeta.declaredDate && <span>Declared {currentSemesterMeta.declaredDate}</span>}
                                </p>
                            ) : (
                                <p className="mt-0.5 text-[11px] text-on-surface-variant/60">
                                    Green dot = Dashboard match · Indigo = Official IPU / Custom · Click any credit to adjust live
                                </p>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                            {([
                                { id: 'all', label: `All (${currentSubjects.length})` },
                                { id: 'distinction', label: 'Distinctions ≥75%' },
                                { id: 'focus', label: 'Focus <70%' },
                            ] as const).map((f) => (
                                <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => setTableFilter(f.id)}
                                    className={`no-fluid h-7 px-3 rounded-full text-[11px] font-bold border transition-colors cursor-pointer ${
                                        tableFilter === f.id
                                            ? 'bg-primary/14 border-primary/35 text-primary'
                                            : 'bg-on-surface/[0.04] border-on-surface/[0.09] text-on-surface-variant hover:text-on-surface'
                                    }`}
                                >
                                    {f.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[780px]">
                            <thead>
                                <tr className="bg-on-surface/[0.025] border-b border-on-surface/[0.07] text-[10px] font-bold text-on-surface-variant/65 uppercase tracking-wider whitespace-nowrap">
                                    <th className="px-5 py-3">Code</th>
                                    <th className="px-5 py-3">Subject</th>
                                    <th className="px-4 py-3 text-center">Credits</th>
                                    <th className="px-4 py-3 text-center">Internal</th>
                                    <th className="px-4 py-3 text-center">External</th>
                                    <th className="px-4 py-3 text-center">Total</th>
                                    <th className="px-4 py-3 text-center">Grade</th>
                                    <th className="px-5 py-3 text-right" data-tooltip="Credit Points = Credits × Grade Point">C×G</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-on-surface/[0.06] text-xs">
                                {filteredTableSubjects.map((sub: any, i: number) => {
                                    const { total, maxMarks } = getSubjectMarks(sub);
                                    const isLab = isLabSubject(sub.name || '', sub.credits ? Number(sub.credits) : 3);
                                    const rawInternal = sub.internal ?? (isLab ? (sub.internal_practical ?? sub.internal_theory) : (sub.internal_theory ?? sub.internal_practical));
                                    const rawExternal = sub.external ?? (isLab ? (sub.external_practical ?? sub.external_theory) : (sub.external_theory ?? sub.external_practical));
                                    const displayInternal = getSubjectDisplayMark(rawInternal);
                                    const displayExternal = getSubjectDisplayMark(rawExternal);
                                    const fromDash = sub.credit_source === 'dashboard';
                                    const fromSchemeOrManual = sub.credit_source === 'ipu_scheme' || sub.credit_source === 'manual' || sub.credit_source === 'portal';
                                    const rowKey = `${sub.code}-${sub._semester}-${i}`;
                                    const isEditingCr = editingCreditKey === rowKey;
                                    const dotColor = fromDash
                                        ? 'bg-emerald-500'
                                        : fromSchemeOrManual
                                        ? 'bg-indigo-500'
                                        : 'bg-on-surface-variant/35';
                                    const creditTooltip = fromDash
                                        ? `Synced live from Attendance Dashboard (${sub.credits} Cr)${onUpdateCredit ? ' — click to edit' : ''}`
                                        : sub.credit_source === 'manual'
                                        ? `Custom credit override (${sub.credits} Cr)${onUpdateCredit ? ' — click to edit' : ''}`
                                        : sub.credit_source === 'ipu_scheme'
                                        ? `Official GGSIPU CBCS scheme (${sub.credits} Cr)${onUpdateCredit ? ' — click to edit' : ''}`
                                        : `Estimated credit (${sub.credits} Cr)${onUpdateCredit ? ' — click to edit' : ''}`;
                                    const gp = sub.grade_point ?? (IPU_GRADE_POINTS[String(sub.grade || '').toUpperCase()] ?? 0);
                                    const cxg = (Number(sub.credits || 0) || 0) * Number(gp || 0);

                                    return (
                                        <tr key={rowKey} className="hover:bg-on-surface/[0.03] transition-colors">
                                            <td className="px-5 py-3 font-mono text-[11px] font-bold text-on-surface-variant whitespace-nowrap">
                                                {sub.code || '—'}
                                                {selectedSem === 'overall' && sub._semester && (
                                                    <span className="ml-1.5 px-1.5 py-0.5 rounded bg-on-surface/[0.06] text-[9.5px] font-semibold">
                                                        S{sub._semester}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3 font-semibold text-on-surface max-w-[260px]">
                                                <p className="truncate" data-tooltip={sub.name}>{sub.name}</p>
                                            </td>
                                            <td className="px-4 py-3 text-center font-semibold text-on-surface tabular-nums whitespace-nowrap">
                                                {isEditingCr && onUpdateCredit ? (
                                                    <select
                                                        autoFocus
                                                        aria-label={`Credits for ${sub.code || sub.name}`}
                                                        defaultValue={String(sub.credits ?? 0)}
                                                        onBlur={() => setEditingCreditKey(null)}
                                                        onChange={(e) => {
                                                            const next = parseInt(e.target.value, 10);
                                                            setEditingCreditKey(null);
                                                            if (!Number.isNaN(next) && next !== Number(sub.credits ?? 0)) {
                                                                void onUpdateCredit(Number(sub._semester || selectedSem || 1), String(sub.code || ''), String(sub.name || ''), next);
                                                            }
                                                        }}
                                                        className="h-6 px-1.5 rounded-lg bg-surface border border-primary/45 text-xs font-bold text-on-surface outline-none cursor-pointer"
                                                    >
                                                        {[0, 1, 2, 3, 4, 5, 6].map((c) => (
                                                            <option key={c} value={c}>
                                                                {c} Cr
                                                            </option>
                                                        ))}
                                                    </select>
                                                ) : onUpdateCredit ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingCreditKey(rowKey)}
                                                        data-tooltip={creditTooltip}
                                                        className="no-fluid inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full hover:bg-primary/12 hover:text-primary transition-colors cursor-pointer"
                                                    >
                                                        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                                                        {sub.credits ?? 0}
                                                    </button>
                                                ) : (
                                                    <span
                                                        data-tooltip={creditTooltip}
                                                        className="inline-flex items-center gap-1.5 cursor-help"
                                                    >
                                                        <span className={`w-1.5 h-1.5 rounded-full ${dotColor}`} />
                                                        {sub.credits ?? 0}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-center text-on-surface-variant tabular-nums">{sub.is_pending ? 'Pending' : displayInternal}</td>
                                            <td className="px-4 py-3 text-center text-on-surface-variant tabular-nums">{sub.is_pending ? 'Pending' : displayExternal}</td>
                                            <td className="px-4 py-3 text-center font-bold text-on-surface tabular-nums whitespace-nowrap">
                                                {sub.is_pending ? 'Pending' : total}
                                                <span className="text-[10px] text-on-surface-variant/45 font-medium">/{maxMarks}</span>
                                            </td>
                                            <td className="px-4 py-3 text-center whitespace-nowrap">
                                                <span
                                                    data-tooltip={`Grade ${sub.grade || '—'} (${gp} Grade Points)`}
                                                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase ${gradeBgClass(sub.grade)}`}
                                                >
                                                    {sub.grade || '—'}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 text-right font-mono font-bold text-on-surface-variant tabular-nums whitespace-nowrap">
                                                {sub.is_pending ? '—' : cxg}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ResultsDashboard;
