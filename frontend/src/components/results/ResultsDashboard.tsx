import React from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import {
    ArcElement, BarElement, CategoryScale, Chart as ChartJS, Filler, Legend, LinearScale, LineElement, PointElement, Tooltip as ChartTooltip,
} from 'chart.js';
import {
    Activity, BarChart3, BookOpen, Download, PieChart, RefreshCw, ShieldCheck, TrendingUp
} from 'lucide-react';

ChartJS.register(
    CategoryScale, LinearScale, BarElement, PointElement, LineElement,
    ArcElement, Filler, ChartTooltip, Legend,
);

function isLabSubject(name: string, credits: number) {
    const upper = String(name || '').toUpperCase();
    return credits <= 1 || upper.includes('LAB') || upper.includes('PRACTICAL') || upper.includes('WORKSHOP') || upper.includes('SEMINAR') || upper.includes('VIVA');
}

type ResultsDashboardProps = {
    user: any;
    results: any;
    profileInfo: any;
    displayBatch: string;
    lastUpdated: string | null;
    formatDate: (value: string | null) => string;
    handleSyncClick: () => void;
    onOpenPdf: () => void;
    selectedSem: string;
    setSelectedSem: (value: string) => void;
    currentMetrics: any;
    metrics: any;
    semMetrics: any;
    academicStrength: number;
    performanceSummary: any;
    chartSubjects: any[];
    barChartData: any;
    barChartOptions: any;
    marksBreakdownData: any;
    marksBreakdownOptions: any;
    currentSubjects: any[];
    currentSemesterMeta: any;
    gradeDistributionData: any;
    doughnutOptions: any;
    getSubjectMarks: (subject: any) => { total: number; maxMarks: number; hasExplicitTotal: boolean };
    getSubjectDisplayMark: (value: unknown) => string;
    gradeBgClass: (grade: string) => string;
    getSubjectPercentage: (subject: any) => number;
};

const ResultsDashboard: React.FC<ResultsDashboardProps> = ({
    user,
    results,
    profileInfo,
    displayBatch,
    lastUpdated,
    formatDate,
    handleSyncClick,
    onOpenPdf,
    selectedSem,
    setSelectedSem,
    currentMetrics,
    metrics,
    semMetrics,
    academicStrength,
    performanceSummary,
    chartSubjects,
    barChartData,
    barChartOptions,
    marksBreakdownData,
    marksBreakdownOptions,
    currentSubjects,
    currentSemesterMeta,
    gradeDistributionData,
    doughnutOptions,
    getSubjectMarks,
    getSubjectDisplayMark,
    gradeBgClass,
    getSubjectPercentage,
}) => {
    return (
        <div className="space-y-6 text-on-background select-none">
            {/* Header profile overview */}
            <div className="rounded-lg border border-outline bg-surface p-6 md:p-8 relative overflow-hidden">
                <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-8">
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-3">
                            <ShieldCheck size={14} className="text-on-surface-variant/55" />
                            <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40">Academic Record</span>
                        </div>
                        <h1 className="text-2xl font-bold text-on-surface mb-1">{profileInfo?.name || user?.name}</h1>
                        <p className="text-xs font-semibold text-on-surface-variant/60 tracking-tight mb-6">{profileInfo?.programme || 'Programme unavailable'} · Batch {displayBatch}</p>
 
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div><p className="text-[9px] font-bold uppercase text-on-surface-variant/40 mb-1">Enrollment</p><p className="text-xs font-bold text-on-surface">{results.enrollment_number}</p></div>
                            <div><p className="text-[9px] font-bold uppercase text-on-surface-variant/40 mb-1">Batch</p><p className="text-xs font-bold text-on-surface">{displayBatch}</p></div>
                            <div><p className="text-[9px] font-bold uppercase text-on-surface-variant/40 mb-1">Admission</p><p className="text-xs font-bold text-on-surface">{profileInfo?.admission_year || '---'}</p></div>
                            <div><p className="text-[9px] font-bold uppercase text-on-surface-variant/40 mb-1">Institution</p><p className="text-xs font-bold text-on-surface truncate">{profileInfo?.institution || '---'}</p></div>
                        </div>
                        
                        <div className="flex flex-wrap items-center justify-between gap-4 mt-6 pt-4 border-t border-outline">
                            <div>
                                <p className="text-[10px] font-bold text-on-surface-variant/40 uppercase mb-0.5">Last Synced</p>
                                <p className="text-xs font-semibold text-on-surface-variant/60">{formatDate(lastUpdated)}</p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <button onClick={handleSyncClick} className="flex items-center gap-2 px-3 py-1.5 rounded border border-outline bg-surface text-xs font-semibold text-on-surface hover:bg-surface-container transition-all cursor-pointer"><RefreshCw size={12} /> Sync Results</button>
                                <button onClick={onOpenPdf} className="flex items-center gap-2 px-3 py-1.5 rounded bg-on-surface text-surface text-xs font-semibold hover:opacity-90 transition-all cursor-pointer"><Download size={12} /> Download PDF</button>
                            </div>
                        </div>
                    </div>
 
                    <div className="flex flex-col items-center justify-center border border-outline bg-surface-container/30 rounded-lg p-6 min-w-[160px] text-center">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40 mb-1">Overall CGPA</p>
                        <p className="text-4xl font-bold text-on-surface tracking-tight leading-none">
                            {results.cgpa ? parseFloat(results.cgpa).toFixed(2) : (metrics?.cgpa?.toFixed(2) || '---')}
                        </p>
                        <p className="text-[10px] font-bold text-on-surface-variant/60 mt-3 uppercase tracking-wider">
                            {Math.round(selectedSem === 'overall' ? (results.academicStrength ?? academicStrength ?? 0) : academicStrength)}% Performance
                        </p>
                    </div>
                </div>
            </div>
 
            {/* Semester Tabs */}
            <div className="flex flex-wrap gap-2">
                <button onClick={() => setSelectedSem('overall')} className={`px-3 py-1.5 rounded text-xs font-bold transition-all border ${selectedSem === 'overall' ? 'bg-on-surface text-surface border-on-surface' : 'bg-surface border-outline text-on-surface-variant hover:border-on-surface'}`}>Overview</button>
                {results.semesters.map((s: any) => (
                    <button key={s.semester} onClick={() => setSelectedSem(s.semester)} className={`px-3 py-1.5 rounded text-xs font-bold transition-all border ${selectedSem === s.semester ? 'bg-on-surface text-surface border-on-surface' : 'bg-surface border-outline text-on-surface-variant hover:border-on-surface'}`}>
                        Sem {s.semester}
                    </button>
                ))}
            </div>
 
            {/* Metrics Row */}
            {currentMetrics && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[
                        { label: 'Scored Marks', val: `${currentMetrics.totalMarks}/${currentMetrics.totalMaxMarks}`, icon: <BarChart3 size={14} /> },
                        { label: 'Pass Rate', val: `${currentMetrics.passRate}%`, icon: <TrendingUp size={14} /> },
                        { label: selectedSem === 'overall' ? 'CGPA' : 'SGPA', val: (selectedSem === 'overall' ? metrics?.cgpa : semMetrics?.sgpa)?.toFixed(2) ?? '---', icon: <Activity size={14} /> },
                        { label: 'Earned Credits', val: currentMetrics.totalCredits ? String(Math.round(currentMetrics.totalCredits)) : '---', icon: <BookOpen size={14} /> },
                    ].map(k => (
                        <div key={k.label} className="rounded-lg border border-outline bg-surface p-5 flex flex-col justify-between min-h-[120px] hover:border-on-surface transition-all">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant/40">{k.label}</span>
                                <div className="text-on-surface-variant/30">{k.icon}</div>
                            </div>
                            <p className="text-2xl font-bold tracking-tight text-on-surface leading-none">{k.val}</p>
                        </div>
                    ))}
                </div>
            )}
 
            {/* Performance breakdown */}
            {currentMetrics && performanceSummary && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-lg border border-outline bg-surface p-5"><p className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/40 mb-1">Performance Strength</p><p className="text-xl font-bold tracking-tight text-on-surface">{Math.round(academicStrength)}%</p><p className="text-[10px] text-on-surface-variant/40 mt-1 font-semibold">Single combined score value.</p></div>
                    <div className="rounded-lg border border-outline bg-surface p-5"><p className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/40 mb-1">Strongest Subject</p><p className="text-sm font-bold tracking-tight text-on-surface truncate">{performanceSummary.strongest?.code || performanceSummary.strongest?.name || '---'}</p><p className="text-[10px] text-on-surface-variant/40 mt-1 font-semibold">{performanceSummary.strongest ? `${getSubjectPercentage(performanceSummary.strongest)}% score` : 'No finished subjects.'}</p></div>
                    <div className="rounded-lg border border-outline bg-surface p-5"><p className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/40 mb-1">Needs Improvement</p><p className="text-sm font-bold tracking-tight text-red-500 truncate">{performanceSummary.weakest?.code || performanceSummary.weakest?.name || '---'}</p><p className="text-[10px] text-on-surface-variant/40 mt-1 font-semibold">{performanceSummary.weakest ? `${getSubjectPercentage(performanceSummary.weakest)}% score` : 'All subjects look clear.'}</p></div>
                    <div className="rounded-lg border border-outline bg-surface p-5"><p className="text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/40 mb-1">Distinction count</p><p className="text-xl font-bold tracking-tight text-on-surface">{performanceSummary.distinctionCount}</p><p className="text-[10px] text-on-surface-variant/40 mt-1 font-semibold">Subjects with 75% or above.</p></div>
                </div>
            )}
 
            {/* Charts layout */}
            {chartSubjects.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div className="rounded-lg border border-outline bg-surface p-5 min-h-[300px] flex flex-col hover:border-on-surface transition-all">
                        <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider mb-1">Score Breakdown</h3>
                        <p className="text-[10px] text-on-surface-variant/40 mb-4 font-semibold">Individual percentage performance mapped per paper.</p>
                        <div className="flex-1 min-h-[200px]"><Bar data={barChartData} options={barChartOptions} /></div>
                    </div>
                    <div className="rounded-lg border border-outline bg-surface p-5 min-h-[300px] flex flex-col hover:border-on-surface transition-all">
                        <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider mb-1">Component Distribution</h3>
                        <p className="text-[10px] text-on-surface-variant/40 mb-4 font-semibold">Internal vs external marks contributions.</p>
                        <div className="flex-1 min-h-[200px]"><Bar data={marksBreakdownData} options={marksBreakdownOptions} /></div>
                    </div>
                </div>
            )}
 
            {/* Table or Sem list */}
            {selectedSem !== 'overall' && currentSubjects.length > 0 && (
                <div className="rounded-lg border border-outline bg-surface overflow-hidden">
                    <div className="p-5 border-b border-outline flex items-center justify-between gap-4">
                        <div>
                            <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider">{results.semesters.find((s: any) => s.semester === selectedSem)?.semester_label || 'Semester'} — Subjects</h3>
                            {currentSemesterMeta && (
                                <p className="mt-1 text-[10px] font-semibold text-on-surface-variant/40 uppercase tracking-wider">
                                    {currentSemesterMeta.examSession && <span>Exam {currentSemesterMeta.examSession}</span>}
                                    {currentSemesterMeta.examSession && currentSemesterMeta.declaredDate && <span className="mx-2">•</span>}
                                    {currentSemesterMeta.declaredDate && <span>Declared {currentSemesterMeta.declaredDate}</span>}
                                </p>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-0.5 rounded border border-outline bg-surface-container text-on-surface-variant text-[10px] font-bold">{currentSubjects.length} PAPERS</span>
                            {semMetrics && <span className="px-2 py-0.5 rounded bg-on-surface text-surface text-[10px] font-bold">SGPA {semMetrics.sgpa.toFixed(2)}</span>}
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse min-w-[800px]">
                            <thead>
                                <tr className="bg-surface-container/40 border-b border-outline text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-wider">
                                    <th className="px-5 py-3">Code</th>
                                    <th className="px-5 py-3">Subject</th>
                                    <th className="px-5 py-3 text-center">Credits</th>
                                    <th className="px-5 py-3 text-center">Internal</th>
                                    <th className="px-5 py-3 text-center">External</th>
                                    <th className="px-5 py-3 text-center">Total</th>
                                    <th className="px-5 py-3 text-right">Grade</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-outline text-xs">
                                {currentSubjects.map((sub: any, i: number) => {
                                    const { total, maxMarks } = getSubjectMarks(sub);
                                    const isLab = isLabSubject(sub.name || '', sub.credits ? Number(sub.credits) : 3);
                                    const rawInternal = sub.internal ?? (isLab ? (sub.internal_practical ?? sub.internal_theory) : (sub.internal_theory ?? sub.internal_practical));
                                    const rawExternal = sub.external ?? (isLab ? (sub.external_practical ?? sub.external_theory) : (sub.external_theory ?? sub.external_practical));
                                    const displayInternal = getSubjectDisplayMark(rawInternal);
                                    const displayExternal = getSubjectDisplayMark(rawExternal);
                                    return (
                                        <tr key={i} className="hover:bg-surface-container/50 transition-colors">
                                            <td className="px-5 py-3.5 font-mono text-on-surface-variant/50">{sub.code || '---'}</td>
                                            <td className="px-5 py-3.5 font-bold text-on-surface max-w-[200px] truncate">{sub.name}</td>
                                            <td className="px-5 py-3.5 text-center font-bold text-on-surface">{sub.credits || '---'}</td>
                                            <td className="px-5 py-3.5 text-center text-on-surface-variant/60">{sub.is_pending ? 'Pending' : displayInternal}</td>
                                            <td className="px-5 py-3.5 text-center text-on-surface-variant/60">{sub.is_pending ? 'Pending' : displayExternal}</td>
                                            <td className="px-5 py-3.5 text-center font-bold text-on-surface">{sub.is_pending ? 'Pending' : total}<span className="text-[10px] text-on-surface-variant/30 font-medium">/{maxMarks}</span></td>
                                            <td className="px-5 py-3.5 text-right"><span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${gradeBgClass(sub.grade)}`}>{sub.grade || '---'}</span></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
 
            {selectedSem === 'overall' && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {results.semesters.map((sem: any) => {
                            const sgpa = sem.sgpa ? parseFloat(sem.sgpa) : 0;
                            const semCredits = (sem.subjects || []).reduce((a: number, s: any) => a + (parseFloat(s.credits || '0') || 0), 0);
                            const passedCount = (sem.subjects || []).filter((s: any) => {
                                const grade = String(s.grade || '').toUpperCase();
                                return ['O', 'A+', 'A', 'B+', 'B', 'C+', 'C', 'P'].includes(grade);
                            }).length;
                            const totalCount = sem.subjects?.length || 0;
                            const passRate = totalCount > 0 ? Math.round((passedCount / totalCount) * 100) : 0;
                            return (
                                <div key={sem.semester} onClick={() => setSelectedSem(sem.semester)} className="cursor-pointer group rounded-lg border border-outline bg-surface p-5 hover:border-on-surface transition-all">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <p className="text-[10px] font-bold text-on-surface-variant/40 uppercase mb-0.5">{sem.semester_label || `Semester ${sem.semester}`}</p>
                                            <p className="text-xs font-bold text-on-surface-variant/60">{sem.subjects?.length || 0} Subjects</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-2xl font-bold text-on-surface">{sgpa.toFixed(2)}</p>
                                            <p className="text-[9px] font-bold text-on-surface-variant/40 uppercase mt-0.5">SGPA</p>
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between text-[10px] font-bold uppercase text-on-surface-variant/40 mb-2">
                                        <span>{Math.round(semCredits)} Credits</span>
                                        <span>{passRate}% Pass</span>
                                    </div>
                                    <div className="h-1 rounded-full bg-on-surface/10 overflow-hidden">
                                        <div className="h-full bg-on-surface" style={{ width: `${(sgpa / 10) * 100}%` }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
 
                    <div className="rounded-lg border border-outline bg-surface overflow-hidden">
                        <div className="p-5 border-b border-outline flex items-center gap-3">
                            <PieChart size={14} className="text-on-surface-variant/40" />
                            <h3 className="text-xs font-bold text-on-surface uppercase tracking-wider">Grade Breakdown Analysis</h3>
                        </div>
                        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
                            <div className="h-48 relative flex items-center justify-center">
                                <Doughnut data={gradeDistributionData} options={doughnutOptions} />
                                <div className="absolute inset-0 flex items-center justify-center flex-col pointer-events-none">
                                    <span className="text-3xl font-bold text-on-surface">{results.totalSubjects || metrics?.totalSubjects || 0}</span>
                                    <span className="text-[9px] font-bold text-on-surface-variant/40 uppercase tracking-wider mt-0.5">Subjects</span>
                                </div>
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center pb-2 border-b border-outline text-[9px] font-bold text-on-surface-variant/40 uppercase">
                                    <span>Grade</span>
                                    <span>Count</span>
                                </div>
                                {gradeDistributionData.labels.map((lbl: any, idx: number) => (
                                    <div key={lbl} className="flex justify-between items-center text-xs">
                                        <div className="flex items-center gap-2">
                                            <span className="w-2 h-2 rounded-full border border-outline" style={{ backgroundColor: gradeDistributionData.datasets[0].backgroundColor[idx] }} />
                                            <span className="font-bold text-on-surface-variant/85">{lbl}</span>
                                        </div>
                                        <span className="font-mono font-bold text-on-surface bg-surface-container px-2 py-0.5 rounded border border-outline">{(results.gradeDistribution || {})[lbl]}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
 
                    <div className="pt-4 mt-6 border-t border-outline">
                        <p className="text-[10px] font-bold text-on-surface-variant/40 uppercase mb-4">Historical Semester GPA Chart</p>
                        <div className="space-y-3">
                            {results.semesters.map((sem: any) => {
                                const sgpa = sem.sgpa ? parseFloat(sem.sgpa) : 0;
                                return (
                                    <div key={sem.semester} className="flex items-center gap-4 text-xs font-bold">
                                        <span className="text-on-surface-variant/60 w-20 shrink-0 truncate uppercase tracking-wider text-[9px]">{sem.semester_label || `Sem ${sem.semester}`}</span>
                                        <div className="flex-1 h-1 rounded-full bg-on-surface/10 overflow-hidden">
                                            <div className="h-full bg-on-surface" style={{ width: `${(sgpa / 10) * 100}%` }} />
                                        </div>
                                        <span className="font-mono text-on-surface w-10 text-right tabular-nums">{sgpa.toFixed(2)}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default ResultsDashboard;
