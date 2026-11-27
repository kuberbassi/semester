import React, { useCallback, useState, useEffect } from 'react';
import { usePageMeta } from '@/hooks/usePageMeta';
import {
    ExternalLink, Trash, Edit2, Award, Plus,
    Book, Globe, Video, GraduationCap, CheckCircle2, Flame, TrendingUp
} from 'lucide-react';
import PageHeader from '@/components/ui/PageHeader';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import { HoldButton, RubberSegment, WakeSlider } from '@/components/react-bits';
import { useToast } from '@/components/ui/toast-context';
import { attendanceService } from '@/services/attendance.service';
import { useConfirm } from '@/contexts/confirm-context';
import { formatLocalDate } from '@/lib/date';
import { openExternalUrl } from '@/services/desktopDb';

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
    response?: { data?: { error?: string } };
};

const getApiErrorMessage = (err: unknown, fallback: string): string => {
    const apiError = err as ApiErrorLike;
    return apiError?.response?.data?.error || fallback;
};

function clampProgress(value: unknown): number {
    const progress = Number(value ?? 0);
    if (!Number.isFinite(progress)) return 0;
    return Math.min(100, Math.max(0, Math.round(progress)));
}

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

const PLATFORMS = [
    { value: 'coursera', label: 'Coursera', icon: Globe, gradient: 'from-indigo-500 to-cyan-500' },
    { value: 'udemy', label: 'Udemy', icon: Video, gradient: 'from-violet-500 to-fuchsia-500' },
    { value: 'youtube', label: 'YouTube', icon: Video, gradient: 'from-rose-500 to-orange-500' },
    { value: 'codedex', label: 'Codédex', icon: Globe, gradient: 'from-amber-500 to-orange-500' },
    { value: 'linkedin', label: 'LinkedIn', icon: Globe, gradient: 'from-sky-500 to-indigo-500' },
    { value: 'college', label: 'College', icon: Book, gradient: 'from-emerald-500 to-teal-500' },
    { value: 'custom', label: 'Custom', icon: Globe, gradient: 'from-indigo-500 to-violet-500' },
];

type CourseFilter = 'all' | 'active' | 'completed';

const Courses: React.FC = () => {
    const confirm = useConfirm();
    const { showToast } = useToast();
    const [courses, setCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<CourseFilter>('all');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingCourse, setEditingCourse] = useState<Course | null>(null);
    const [formData, setFormData] = useState<Partial<Course>>({
        title: '', platform: 'coursera', url: '', progress: 0,
        enrolledDate: formatLocalDate(), instructor: '', notes: ''
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
            enrolledDate: formatLocalDate(), instructor: '', notes: ''
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
            void openExternalUrl(url.toString());
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
    const avgProgress = courses.length > 0
        ? Math.round(courses.reduce((sum, c) => sum + c.progress, 0) / courses.length)
        : 0;

    const visibleCourses = filter === 'active'
        ? activeCourses
        : filter === 'completed'
        ? completedCourses
        : [...activeCourses, ...completedCourses];

    const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-primary/18 bg-on-surface/[0.04] text-on-surface text-xs font-medium placeholder:text-on-surface-variant/45 focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-all";

    return (
        <div className="w-full pb-12 select-none">
            <PageHeader
                title="Courses"
                icon={GraduationCap}
                badge={`${courses.length} total`}
                actions={
                    <div className="flex items-center gap-2.5 flex-wrap">
                        <RubberSegment<CourseFilter>
                            options={[
                                { id: 'all', label: 'All', count: courses.length },
                                { id: 'active', label: 'Active', count: activeCourses.length },
                                { id: 'completed', label: 'Done', count: completedCourses.length },
                            ]}
                            value={filter}
                            size="sm"
                            layoutId="courses-filter-segment"
                            onChange={setFilter}
                        />
                        <button
                            onClick={handleAddCourse}
                            className="no-fluid h-8 px-4 text-xs font-bold rounded-full btn-gradient cursor-pointer inline-flex items-center justify-center gap-1.5"
                        >
                            <Plus size={13} />
                            Add Course
                        </button>
                    </div>
                }
            />

            {/* Studio Summary Strip */}
            {courses.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
                    <div className="liquid-hero-banner rounded-[22px] p-5 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/65">Average Progress</p>
                            <p className="font-display text-3xl font-extrabold gradient-text tabular-nums mt-1">{avgProgress}%</p>
                        </div>
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white flex items-center justify-center shadow-sm">
                            <TrendingUp size={19} />
                        </div>
                    </div>
                    <div className="liquid-glass rounded-[22px] p-5 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/65">In Progress</p>
                            <p className="font-display text-3xl font-extrabold text-on-surface tabular-nums mt-1">{activeCourses.length}</p>
                        </div>
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/25 text-amber-500 flex items-center justify-center">
                            <Flame size={19} />
                        </div>
                    </div>
                    <div className="liquid-glass rounded-[22px] p-5 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant/65">Completed</p>
                            <p className="font-display text-3xl font-extrabold text-on-surface tabular-nums mt-1">{completedCourses.length}</p>
                        </div>
                        <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/25 text-emerald-500 dark:text-cyan-400 flex items-center justify-center">
                            <Award size={19} />
                        </div>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="animate-pulse h-44 liquid-glass rounded-[24px]" />
                    ))}
                </div>
            ) : visibleCourses.length === 0 ? (
                <div className="liquid-glass rounded-[26px] py-20 text-center">
                    <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-cyan-500 text-white flex items-center justify-center mx-auto mb-4 shadow-sm">
                        <Book size={22} />
                    </div>
                    <p className="font-display text-base font-extrabold text-on-surface mb-1">
                        {courses.length === 0 ? 'No courses tracked yet' : 'No courses match this filter'}
                    </p>
                    <p className="text-xs text-on-surface-variant/70 mb-6">
                        Track online certificates, video playlists, and self-study milestones.
                    </p>
                    <button
                        onClick={handleAddCourse}
                        className="no-fluid h-9 px-5 text-xs font-bold rounded-full btn-gradient cursor-pointer"
                    >
                        Add Your First Course
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    {visibleCourses.map((course) => {
                        const plat = PLATFORMS.find(p => p.value === course.platform) || PLATFORMS[PLATFORMS.length - 1];
                        const PlatIcon = plat.icon;
                        const isDone = course.progress === 100;

                        return (
                            <div
                                key={getCourseId(course)}
                                className="group relative overflow-hidden liquid-glass rounded-[24px] p-5 sm:p-6 flex flex-col justify-between gap-5"
                            >
                                {/* Top gradient accent hairline */}
                                <div className={`pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r ${plat.gradient}`} />

                                <div>
                                    <div className="flex items-start justify-between gap-3 mb-3.5">
                                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold text-white bg-gradient-to-r ${plat.gradient} shadow-sm`}>
                                            <PlatIcon size={11} />
                                            {plat.label}
                                        </span>

                                        <div className="flex items-center gap-1">
                                            <button
                                                aria-label={`Edit ${course.title}`}
                                                onClick={() => handleEditCourse(course)}
                                                className="no-fluid w-7 h-7 rounded-full bg-on-surface/[0.06] hover:bg-primary/15 text-on-surface-variant hover:text-primary flex items-center justify-center transition-colors cursor-pointer"
                                                title="Edit course"
                                            >
                                                <Edit2 size={12} />
                                            </button>
                                            <HoldButton
                                                variant="danger"
                                                holdDuration={700}
                                                title={`Hold to delete ${course.title}`}
                                                onComplete={() => void handleDeleteCourse(getCourseId(course))}
                                                className="no-fluid w-7 h-7 p-0 flex items-center justify-center rounded-full"
                                            >
                                                <Trash size={12} />
                                            </HoldButton>
                                        </div>
                                    </div>

                                    <h3 className="font-display text-lg font-extrabold text-on-surface leading-snug line-clamp-2">
                                        {course.title}
                                    </h3>
                                    {course.instructor && (
                                        <p className="text-xs font-medium text-on-surface-variant mt-1 truncate">
                                            by {course.instructor}
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-3.5">
                                    <div>
                                        <div className="flex items-center justify-between text-xs mb-1.5">
                                            <span className="font-semibold text-on-surface-variant">
                                                {isDone ? 'Completed' : 'Progress'}
                                            </span>
                                            <span className="font-display font-extrabold text-primary tabular-nums">
                                                {course.progress}%
                                            </span>
                                        </div>
                                        <div className="h-2 rounded-full bg-on-surface/[0.08] overflow-hidden">
                                            <div
                                                className={`h-full rounded-full bg-gradient-to-r ${plat.gradient} transition-all duration-300`}
                                                style={{ width: `${course.progress}%` }}
                                            />
                                        </div>
                                    </div>

                                    <div className="flex items-center justify-between gap-2 pt-3 border-t border-primary/10">
                                        {isDone ? (
                                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-cyan-300">
                                                <CheckCircle2 size={14} />
                                                Milestone Reached
                                            </span>
                                        ) : (
                                            <button
                                                aria-label={`Increase ${course.title} progress`}
                                                data-tooltip={`Bump ${course.title} progress by +10%`}
                                                onClick={() => {
                                                    const previous = courses;
                                                    const nextProgress = clampProgress(course.progress + 10);
                                                    setCourses(courses.map(c => getCourseId(c) === getCourseId(course) ? { ...c, progress: nextProgress } : c));
                                                    void attendanceService.updateManualCourse(getCourseId(course), { progress: nextProgress }).catch(() => {
                                                        setCourses(previous);
                                                        showToast('error', 'Save Failed');
                                                    });
                                                }}
                                                className="no-fluid h-7 px-3 rounded-full bg-primary/12 hover:bg-primary hover:text-white border border-primary/25 text-xs font-bold text-primary transition-colors cursor-pointer"
                                            >
                                                +10% Progress
                                            </button>
                                        )}

                                        <button
                                            onClick={() => openCourse(course)}
                                            data-tooltip={`Open course link in your browser (${course.url})`}
                                            className="no-fluid h-7 px-3.5 rounded-full bg-on-surface/[0.06] hover:bg-primary/15 border border-primary/15 text-xs font-bold text-on-surface hover:text-primary inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                                        >
                                            Open <ExternalLink size={11} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            <Modal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                title={editingCourse ? 'Edit Course' : 'Add Course'}
                subtitle="Track external courses, playlists & completion targets"
                icon={<GraduationCap size={18} />}
                size="md"
            >
                <form onSubmit={handleSubmit} className="space-y-4 pt-1 text-on-surface">
                    <div>
                        <label className="block text-[11px] font-semibold text-on-surface-variant mb-1.5 ml-0.5">Course Title</label>
                        <input
                            type="text"
                            value={formData.title || ''}
                            onChange={e => setFormData({ ...formData, title: e.target.value })}
                            className={inputCls}
                            placeholder="e.g., Machine Learning"
                            required
                        />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Select
                            label="Platform"
                            value={formData.platform || 'coursera'}
                            onChange={e => setFormData({ ...formData, platform: e.target.value as Course['platform'] })}
                            options={PLATFORMS.map(p => ({ value: p.value, label: p.label }))}
                        />
                        <div>
                            <label className="block text-[11px] font-semibold text-on-surface-variant mb-1.5 ml-0.5">Course URL</label>
                            <input
                                type="url"
                                value={formData.url || ''}
                                onChange={e => setFormData({ ...formData, url: e.target.value })}
                                className={inputCls}
                                placeholder="https://..."
                                required
                            />
                        </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                        <div>
                            <WakeSlider
                                label="Course Progress"
                                value={formData.progress || 0}
                                min={0}
                                max={100}
                                step={5}
                                unit="%"
                                color="indigo"
                                onChange={val => setFormData({ ...formData, progress: clampProgress(val) })}
                            />
                        </div>
                        <div>
                            <label className="block text-[11px] font-semibold text-on-surface-variant mb-1.5 ml-0.5">Target Date</label>
                            <input
                                type="date"
                                value={formData.targetCompletionDate || ''}
                                onChange={e => setFormData({ ...formData, targetCompletionDate: e.target.value })}
                                className={inputCls}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-[11px] font-semibold text-on-surface-variant mb-1.5 ml-0.5">Instructor</label>
                        <input
                            type="text"
                            value={formData.instructor || ''}
                            onChange={e => setFormData({ ...formData, instructor: e.target.value })}
                            className={inputCls}
                            placeholder="Optional"
                        />
                    </div>
                    <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-primary/12">
                        <button
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="no-fluid h-9 px-4 text-xs font-bold rounded-full bg-on-surface/[0.06] border border-primary/15 text-on-surface hover:bg-primary/10 transition-colors cursor-pointer"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="no-fluid h-9 px-5 text-xs font-bold rounded-full btn-gradient cursor-pointer"
                        >
                            {editingCourse ? 'Save Changes' : 'Add Course'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

export default Courses;
