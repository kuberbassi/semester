import React, { useCallback, useState, useEffect } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import {
    ExternalLink, Trash, Edit2, Award, Plus,
    Book, Globe, Video
} from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import { useToast } from '@/components/ui/toast-context';
import { attendanceService } from '@/services/attendance.service';
import { useConfirm } from '@/contexts/confirm-context';
import { formatLocalDate } from '@/lib/date';

interface Course {
    _id?: string;
    title: string;
    platform: 'coursera' | 'udemy' | 'youtube' | 'codedex' | 'linkedin' | 'college' | 'custom';
    url: string;
    progress: number;
    enrolledDate: string;
    targetCompletionDate?: string;
    instructor?: string;
    notes?: string;
}

type RawCourse = Partial<Course> & {
    id?: string;
    name?: string;
    provider?: string;
    percentage?: number;
    created_at?: string;
};

type ApiErrorLike = {
    response?: {
        data?: {
            error?: string;
        };
    };
};

const getApiErrorMessage = (err: unknown, fallback: string): string => {
    const apiError = err as ApiErrorLike;
    return apiError?.response?.data?.error || fallback;
};

const normalizeCourse = (raw: RawCourse): Course => ({
    _id: String(raw?._id || raw?.id || ''),
    title: String(raw?.title || raw?.name || '').trim(),
    platform: (raw?.platform || raw?.provider || 'custom') as Course['platform'],
    url: String(raw?.url || ''),
    progress: clampProgress(raw?.progress ?? raw?.percentage ?? 0),
    enrolledDate: String(raw?.enrolledDate || raw?.created_at || formatLocalDate()).slice(0, 10),
    targetCompletionDate: raw?.targetCompletionDate ? String(raw.targetCompletionDate).slice(0, 10) : undefined,
    instructor: raw?.instructor ? String(raw.instructor) : undefined,
    notes: raw?.notes ? String(raw.notes) : undefined,
});

function getCourseId(course: Course): string {
    return course._id || '';
}

function clampProgress(value: unknown): number {
    const progress = Number(value ?? 0);
    if (!Number.isFinite(progress)) return 0;
    return Math.min(100, Math.max(0, Math.round(progress)));
}

const NOTION_COLORS = [
    { bgLight: '#f1f1ef', textLight: '#37352f', borderLight: '#e9e9e6', bgDark: '#252525', textDark: '#9b9a97', borderDark: '#2a2a2a' },
    { bgLight: '#f8ecdf', textLight: '#c27c38', borderLight: '#f1dfcd', bgDark: '#3f2c1e', textDark: '#e79e50', borderDark: '#4d3826' },
    { bgLight: '#faebd9', textLight: '#d9730d', borderLight: '#f6d5b3', bgDark: '#432912', textDark: '#ffa344', borderDark: '#533418' },
    { bgLight: '#fbf3db', textLight: '#dfab01', borderLight: '#f7e3a6', bgDark: '#443d1a', textDark: '#ffdc4f', borderDark: '#564d23' },
    { bgLight: '#eddffc', textLight: '#6940a5', borderLight: '#decbf7', bgDark: '#2d2238', textDark: '#b390e6', borderDark: '#3b2d49' },
    { bgLight: '#ebdff9', textLight: '#9065b0', borderLight: '#dfccf3', bgDark: '#301c3f', textDark: '#cfa6f3', borderDark: '#3d254f' },
    { bgLight: '#dff1eb', textLight: '#1d825c', borderLight: '#cbe7dc', bgDark: '#1a3229', textDark: '#52c49c', borderDark: '#234438' },
    { bgLight: '#e0ecfc', textLight: '#0b6e99', borderLight: '#cbe0fa', bgDark: '#182f42', textDark: '#529cca', borderDark: '#223f59' },
    { bgLight: '#fbe4e4', textLight: '#c41d1d', borderLight: '#f6c7c7', bgDark: '#451a1a', textDark: '#ff7373', borderDark: '#572323' },
    { bgLight: '#fdecf2', textLight: '#ad1a72', borderLight: '#fad0e2', bgDark: '#40182c', textDark: '#f26fb6', borderDark: '#512239' },
];

function getNotionTagStyles(text: string) {
    if (!text) return { className: '', style: {} };
    let hash = 0;
    const cleanText = text.trim();
    for (let i = 0; i < cleanText.length; i++) {
        hash = cleanText.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = NOTION_COLORS[Math.abs(hash) % NOTION_COLORS.length];
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

const PLATFORMS = [
    { value: 'coursera', label: 'Coursera', icon: Globe },
    { value: 'udemy', label: 'Udemy', icon: Video },
    { value: 'youtube', label: 'YouTube', icon: Video },
    { value: 'codedex', label: 'Codédex', icon: Globe },
    { value: 'linkedin', label: 'LinkedIn', icon: Globe },
    { value: 'college', label: 'College', icon: Book },
    { value: 'custom', label: 'Custom', icon: Globe },
];

const Courses: React.FC = () => {
    const confirm = useConfirm();
    const { showToast } = useToast();
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCourse, setEditingCourse] = useState<Course | null>(null);
    const [formData, setFormData] = useState<Partial<Course>>({
        title: '', platform: 'coursera', url: '', progress: 0,
        enrolledDate: formatLocalDate(),
        instructor: '', notes: ''
    });

    usePageMeta({
        title: 'Courses | Semester',
        description: 'Track your enrolled courses, progress, and learning milestones all in one place.',
    });

    const loadCourses = useCallback(async () => {
        try {
            setLoading(true);
            const data = await attendanceService.getManualCourses();
            setCourses(Array.isArray(data) ? data.map(normalizeCourse).filter((c: Course) => c.title || c.url) : []);
        } catch {
            showToast('error', 'Sync Failed');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => { void loadCourses(); }, [loadCourses]);

    const handleAddCourse = () => {
        setEditingCourse(null);
        setFormData({
            title: '', platform: 'coursera', url: '', progress: 0,
            enrolledDate: formatLocalDate(),
            instructor: '', notes: ''
        });
        setIsModalOpen(true);
    };

    const handleEditCourse = (course: Course) => {
        setEditingCourse(course);
        setFormData(course);
        setIsModalOpen(true);
    };

    const openCourse = (course: Course) => {
        try {
            const url = new URL(course.url);
            if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsafe URL');
            window.open(url.toString(), '_blank', 'noopener,noreferrer');
        } catch {
            showToast('error', 'Course link must be a valid web URL');
        }
    };

    const handleDeleteCourse = async (id: string) => {
        const isConfirmed = await confirm({
            title: 'Delete Course',
            message: 'Are you sure you want to delete this course?',
        });
        if (!isConfirmed) return;
        const previous = courses;
        setCourses(courses.filter(c => getCourseId(c) !== id));
        try {
            await attendanceService.deleteManualCourse(id);
            showToast('success', 'Course deleted successfully');
        } catch {
            setCourses(previous);
            showToast('error', 'Save Failed');
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const normalizedProgress = clampProgress(formData.progress);
        const payload = { ...formData, progress: normalizedProgress };

        if (editingCourse) {
            const previous = courses;
            setCourses(courses.map(c => getCourseId(c) === getCourseId(editingCourse) ? { ...c, ...payload } as Course : c));
            try {
                await attendanceService.updateManualCourse(getCourseId(editingCourse), payload);
                showToast('success', 'Course updated successfully');
            } catch (err: unknown) {
                setCourses(previous);
                showToast('error', getApiErrorMessage(err, 'Save Failed'));
            }
        } else {
            const previous = courses;
            setCourses([{ ...payload, _id: Date.now().toString() } as Course, ...courses]);
            try {
                await attendanceService.addManualCourse(payload);
                await loadCourses();
                showToast('success', 'Course added successfully');
            } catch (err: unknown) {
                setCourses(previous);
                showToast('error', getApiErrorMessage(err, 'Save Failed'));
            }
        }
        setIsModalOpen(false);
    };

    const activeCourses = courses.filter(c => c.progress < 100);
    const completedCourses = courses.filter(c => c.progress === 100);
    const inputCls = "w-full px-3 py-2.5 rounded border border-outline bg-surface text-on-surface text-xs placeholder-on-surface-variant/30 focus:outline-none focus:border-on-surface transition-all";

    return (
        <div className="w-full max-w-5xl mx-auto pb-24 select-none">
            <div className="mb-8">
                <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/40 mb-2">Learning / Courses</p>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-2xl font-bold text-on-surface tracking-tight">Courses</h1>
                        <p className="text-xs text-on-surface-variant/40 mt-0.5">{activeCourses.length} active / {completedCourses.length} completed</p>
                    </div>
                    <button onClick={handleAddCourse} className="h-9 w-full sm:w-auto px-3 text-xs font-bold rounded bg-on-surface text-surface hover:opacity-90 transition-all cursor-pointer inline-flex items-center justify-center gap-2">
                        <Plus size={13} />
                        Add Course
                    </button>
                </div>
                <div className="flex gap-0 border-b border-outline mt-4 overflow-x-auto no-scrollbar">
                    {[
                        { label: 'All', count: courses.length },
                        { label: 'In Progress', count: activeCourses.length },
                        { label: 'Completed', count: completedCourses.length },
                    ].map((item) => (
                        <span key={item.label} className="px-4 py-2 text-xs font-semibold border-b-2 border-transparent text-on-surface-variant/50 whitespace-nowrap">
                            {item.label} <span className="text-on-surface-variant/30">{item.count}</span>
                        </span>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="space-y-3">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="animate-pulse h-16 bg-surface-container border border-outline rounded-lg" />
                    ))}
                </div>
            ) : courses.length === 0 ? (
                <div className="rounded-xl border border-dashed border-outline/50 py-20 text-center">
                    <Book size={28} className="mx-auto mb-4 text-on-surface-variant/20" />
                    <p className="text-xs font-bold text-on-surface-variant/30 uppercase tracking-widest mb-1">No courses tracked</p>
                    <p className="text-xs text-on-surface-variant/25 mb-6 font-semibold">Add your first course to start tracking progress.</p>
                    <button onClick={handleAddCourse} className="h-8.5 px-4 text-xs font-bold rounded-md bg-on-surface text-surface hover:opacity-90 transition-all cursor-pointer">Add Course</button>
                </div>
            ) : (
                <div className="space-y-8">
                    {activeCourses.length > 0 && (
                        <section>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/30 mb-4 px-1">In Progress</p>
                            <div className="border border-outline/50 rounded-xl overflow-hidden bg-surface shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
                                {activeCourses.map((course, idx) => {
                                    const plat = PLATFORMS.find(p => p.value === course.platform) || PLATFORMS[PLATFORMS.length - 1];
                                    const tag = getNotionTagStyles(plat.label);
                                    return (
                                        <div key={getCourseId(course)} className={`group flex flex-col md:flex-row md:items-center gap-3 p-4 sm:p-5 hover:bg-surface-container/20 transition-all ${idx < activeCourses.length - 1 ? 'border-b border-outline/35' : ''}`}>
                                            <span style={tag.style} className={`shrink-0 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide rounded-md min-w-[72px] text-center ${tag.className}`}>
                                                {plat.label}
                                            </span>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-xs font-bold text-on-surface break-words md:truncate">{course.title}</p>
                                                {course.instructor && <p className="text-[10px] text-on-surface-variant/40 mt-0.5 truncate font-semibold">{course.instructor}</p>}
                                            </div>
                                            <div className="flex items-center gap-3 w-full md:w-36 shrink-0">
                                                <div className="flex-1 h-1 bg-on-surface/5 border border-outline/35 rounded-full overflow-hidden">
                                                    <div className="h-full bg-on-surface" style={{ width: `${course.progress}%` }} />
                                                </div>
                                                <span className="text-[10px] font-bold text-on-surface-variant/50 w-8 text-right shrink-0">{course.progress}%</span>
                                            </div>
                                            <div className="flex items-center gap-1.5 shrink-0 self-end md:self-auto">
                                                <button aria-label={`Increase ${course.title} progress`} onClick={() => { const previous = courses; const nextProgress = clampProgress(course.progress + 10); setCourses(courses.map(c => getCourseId(c) === getCourseId(course) ? { ...c, progress: nextProgress } : c)); void attendanceService.updateManualCourse(getCourseId(course), { progress: nextProgress }).catch(() => { setCourses(previous); showToast('error', 'Save Failed'); }); }} className="no-fluid h-8 md:h-7 px-2.5 text-[9px] font-bold rounded-md border border-outline/60 bg-surface text-on-surface-variant hover:bg-surface-container transition-all cursor-pointer">+10%</button>
                                                <button aria-label={`Open ${course.title}`} onClick={() => openCourse(course)} className="no-fluid h-8 w-8 md:h-7 md:w-7 flex items-center justify-center rounded-md border border-outline/60 bg-surface text-on-surface-variant hover:bg-surface-container transition-all cursor-pointer"><ExternalLink size={11} /></button>
                                                <button aria-label={`Edit ${course.title}`} onClick={() => handleEditCourse(course)} className="no-fluid h-8 w-8 md:h-7 md:w-7 flex items-center justify-center rounded-md border border-outline/60 bg-surface text-on-surface-variant hover:bg-surface-container transition-all cursor-pointer"><Edit2 size={11} /></button>
                                                <button aria-label={`Delete ${course.title}`} onClick={() => void handleDeleteCourse(getCourseId(course))} className="no-fluid h-8 w-8 md:h-7 md:w-7 flex items-center justify-center rounded-md border border-outline bg-surface text-red-500/60 hover:text-red-500 hover:bg-red-500/5 transition-all cursor-pointer"><Trash size={11} /></button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {completedCourses.length > 0 && (
                        <section>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-on-surface-variant/30 mb-4 px-1">Completed</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {completedCourses.map(course => (
                                    <div key={getCourseId(course)} className="group p-5 rounded-xl border border-outline/50 bg-surface hover:border-on-surface/20 transition-all flex flex-col justify-between shadow-[0_1px_3px_rgba(0,0,0,0.01)]">
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="w-8 h-8 rounded-md border border-outline/50 bg-surface-container-high flex items-center justify-center text-on-surface"><Award size={13} /></div>
                                            <div className="flex gap-1.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                <button aria-label={`Edit ${course.title}`} onClick={() => handleEditCourse(course)} className="no-fluid p-1 text-on-surface-variant/40 hover:text-on-surface cursor-pointer"><Edit2 size={11} /></button>
                                                <button aria-label={`Delete ${course.title}`} onClick={() => void handleDeleteCourse(getCourseId(course))} className="no-fluid p-1 text-on-surface-variant/40 hover:text-red-500 cursor-pointer"><Trash size={11} /></button>
                                            </div>
                                        </div>
                                        <h4 className="text-xs font-bold text-on-surface-variant/70 line-clamp-2 mb-4 break-words">{course.title}</h4>
                                        <button onClick={() => openCourse(course)} className="no-fluid w-full py-1.5 rounded-md border border-outline/50 bg-surface text-[10px] font-bold hover:bg-surface-container flex items-center justify-center gap-1 cursor-pointer">Open Course <ExternalLink size={10} /></button>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}
                </div>
            )}

            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingCourse ? 'Edit Course' : 'Add Course'}>
                <form onSubmit={handleSubmit} className="space-y-4 pt-2 text-on-surface">
                    <div>
                        <label className="block text-[10px] font-bold text-on-surface-variant/40 uppercase mb-1.5">Course Title</label>
                        <input type="text" value={formData.title || ''} onChange={e => setFormData({ ...formData, title: e.target.value })} className={inputCls} placeholder="e.g., Machine Learning" required />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Select label="Platform" value={formData.platform || 'coursera'} onChange={e => setFormData({ ...formData, platform: e.target.value as Course['platform'] })} options={PLATFORMS.map(p => ({ value: p.value, label: p.label }))} />
                        <div>
                            <label className="block text-[10px] font-bold text-on-surface-variant/40 uppercase mb-1.5">Course URL</label>
                            <input type="url" value={formData.url || ''} onChange={e => setFormData({ ...formData, url: e.target.value })} className={inputCls} placeholder="https://..." required />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <div className="flex justify-between mb-1.5">
                                <label className="text-[10px] font-bold text-on-surface-variant/40 uppercase">Progress</label>
                                <span className="text-[10px] font-bold text-on-surface">{formData.progress || 0}%</span>
                            </div>
                            <input type="range" min="0" max="100" value={formData.progress || 0} onChange={e => setFormData({ ...formData, progress: clampProgress(e.target.value) })} className="w-full accent-primary h-1 bg-on-surface/15 rounded-full appearance-none cursor-pointer" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-on-surface-variant/40 uppercase mb-1.5">Target Date</label>
                            <input type="date" value={formData.targetCompletionDate || ''} onChange={e => setFormData({ ...formData, targetCompletionDate: e.target.value })} className={inputCls} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold text-on-surface-variant/40 uppercase mb-1.5">Instructor</label>
                        <input type="text" value={formData.instructor || ''} onChange={e => setFormData({ ...formData, instructor: e.target.value })} className={inputCls} placeholder="Optional" />
                    </div>
                    <div className="flex flex-col sm:flex-row gap-3 pt-2">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 h-10 text-xs font-semibold rounded border border-outline bg-surface text-on-surface hover:bg-surface-container transition-all cursor-pointer">Cancel</button>
                        <button type="submit" className="flex-1 h-10 text-xs font-semibold rounded bg-on-surface text-surface hover:opacity-90 transition-all cursor-pointer">{editingCourse ? 'Save' : 'Add Course'}</button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default Courses;

