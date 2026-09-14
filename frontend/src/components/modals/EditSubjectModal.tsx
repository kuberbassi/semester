import React, { useCallback, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/toast-context';
import { attendanceService } from '@/services/attendance.service';
import { BookOpen, User, MapPin, Hash, FileText, Maximize2, Save, X } from 'lucide-react';
import type { Subject } from '@/types';

interface SubjectFormData {
    name: string;
    code: string;
    professor: string;
    classroom: string;
    syllabus: string;
    semester: number;
    credits: number;
    attended: number;
    total: number;
    categories: string[];
    practical_total: number;
    assignment_total: number;
}

interface EditSubjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    subject: Subject;
    onSuccess: () => void;
}

const EditSubjectModal: React.FC<EditSubjectModalProps> = ({ isOpen, onClose, subject, onSuccess }) => {
    const { showToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [isSyllabusExpanded, setIsSyllabusExpanded] = useState(false);

    // Form State
    const [formData, setFormData] = useState<SubjectFormData>({
        name: '',
        code: '',
        professor: '',
        classroom: '',
        syllabus: '',
        semester: 1,
        credits: 3,
        attended: 0,
        total: 0,
        categories: ['Theory'],
        practical_total: 10,
        assignment_total: 4
    });

    const fetchDetails = useCallback(async (id: string) => {
        try {
            const details = await attendanceService.getSubjectDetails(id);
            if (details) {
                setFormData(prev => ({
                    ...prev,
                    code: details.code || prev.code,
                    categories: details.categories || prev.categories,
                    professor: details.professor || prev.professor,
                    classroom: details.classroom || prev.classroom,
                    syllabus: details.syllabus || prev.syllabus,
                    semester: details.semester || prev.semester,
                    credits: details.credits !== null && details.credits !== undefined ? Number(details.credits) : prev.credits,
                    attended: details.attended ?? prev.attended,
                    total: details.total ?? prev.total,
                    practical_total: details.practicals?.total ?? 10,
                    assignment_total: details.assignments?.total ?? 4
                }));
            }
        } catch (error) {
            console.error(error);
            showToast('error', 'Subject not found or has been deleted');
            onClose();
        }
    }, [showToast, onClose]);

    useEffect(() => {
        if (!subject || !isOpen) return;

        setIsSyllabusExpanded(false);
        setFormData({
            name: subject.name || '',
            code: subject.code || '',
            professor: subject.professor || '',
            classroom: subject.classroom || '',
            syllabus: subject.syllabus || '',
            semester: subject.semester || 1,
            credits: subject.credits !== undefined ? Number(subject.credits) : 3,
            attended: subject.attended || 0,
            total: subject.total || 0,
            categories: subject.categories || ['Theory'],
            practical_total: 10,
            assignment_total: 4
        });

        const id = subject.id || subject._id;
        if (id) void fetchDetails(id);
    }, [subject, isOpen, fetchDetails]);


    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        const isNumeric = ['credits', 'attended', 'total', 'practical_total', 'assignment_total'].includes(name);
        setFormData(prev => ({ ...prev, [name]: isNumeric ? parseInt(value) || 0 : value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!subject) return;

        setLoading(true);

        try {
            const id = subject.id || subject._id;
            if (!id) throw new Error('Subject has no identifier');

            await attendanceService.updateSubjectFullDetails(id, formData);

            showToast('success', 'Subject details updated successfully');
            onSuccess();
            onClose();
        } catch (error) {
            console.error(error);
            showToast('error', 'Failed to update subject details');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Edit Subject Details"
            size="md"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Subject Name */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-on-surface-variant/70 uppercase ml-1">Subject Name</label>
                    <div className="relative">
                        <BookOpen className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant/40" />
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-surface border border-outline focus:border-primary focus:outline-none transition-all text-on-surface placeholder:text-on-surface-variant/30"
                            placeholder="e.g. Data Structures"
                            required
                        />
                    </div>
                </div>

                {/* Categories, Code, & Credits Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                    {/* Categories Multi-Select */}
                    <div className="space-y-2 sm:col-span-2">
                        <label className="text-xs font-semibold text-on-surface-variant/70 uppercase ml-1">Categories</label>
                        <div className="flex flex-wrap items-center gap-2 p-2 bg-surface-container border border-outline rounded-lg min-h-[46px]">
                            {['Theory', 'Practical', 'Assignment'].map((cat) => (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => {
                                        const current = formData.categories;
                                        let nextCats;
                                        if (current.includes(cat)) {
                                            nextCats = current.filter((c: string) => c !== cat);
                                        } else {
                                            nextCats = [...current, cat];
                                        }
                                        
                                        // Auto-assign credits based on category selection change action
                                        let nextCredits = formData.credits;
                                        if (nextCats.includes('Theory') && !nextCats.includes('Practical')) {
                                            nextCredits = 3;
                                        } else if (nextCats.includes('Practical') && !nextCats.includes('Theory')) {
                                            nextCredits = 1;
                                        } else if (nextCats.includes('Theory') && nextCats.includes('Practical')) {
                                            nextCredits = 4;
                                        }
                                        
                                        setFormData(prev => ({ 
                                            ...prev, 
                                            categories: nextCats, 
                                            credits: nextCredits 
                                        }));
                                    }}
                                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold border transition-all
                                        ${formData.categories.includes(cat)
                                            ? 'bg-primary/10 border-primary text-primary'
                                            : 'bg-surface border-transparent text-on-surface-variant/50 hover:bg-surface-container hover:text-on-surface'
                                        }
                                    `}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Subject Code */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-on-surface-variant/70 uppercase ml-1">Subject Code</label>
                        <div className="relative">
                            <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant/40" />
                            <input
                                type="text"
                                name="code"
                                value={formData.code}
                                onChange={handleChange}
                                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-surface border border-outline focus:border-primary focus:outline-none transition-all text-on-surface placeholder:text-on-surface-variant/30"
                                placeholder="e.g. CS-101"
                            />
                        </div>
                    </div>

                    {/* Credits */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-on-surface-variant/70 uppercase ml-1">Credits</label>
                        <div className="relative">
                            <input
                                type="number"
                                name="credits"
                                value={formData.credits}
                                onChange={handleChange}
                                min="0"
                                max="10"
                                className="w-full px-4 py-2.5 rounded-lg bg-surface border border-outline focus:border-primary focus:outline-none transition-all text-on-surface placeholder:text-on-surface-variant/30"
                                placeholder="Credits (e.g. 3)"
                            />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Professor */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-on-surface-variant/70 uppercase ml-1">Professor</label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant/40" />
                            <input
                                type="text"
                                name="professor"
                                value={formData.professor}
                                onChange={handleChange}
                                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-surface border border-outline focus:border-primary focus:outline-none transition-all text-on-surface placeholder:text-on-surface-variant/30"
                                placeholder="Prof. Name"
                            />
                        </div>
                    </div>

                    {/* Classroom */}
                    <div className="space-y-2">
                        <label className="text-xs font-semibold text-on-surface-variant/70 uppercase ml-1">Classroom</label>
                        <div className="relative">
                            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant/40" />
                            <input
                                type="text"
                                name="classroom"
                                value={formData.classroom}
                                onChange={handleChange}
                                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-surface border border-outline focus:border-primary focus:outline-none transition-all text-on-surface placeholder:text-on-surface-variant/30"
                                placeholder="Room 301"
                            />
                        </div>
                    </div>
                </div>

                {/* Syllabus */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-on-surface-variant/70 uppercase ml-1">Syllabus / Notes</label>
                    <button
                        type="button"
                        onClick={() => setIsSyllabusExpanded(true)}
                        className="group w-full min-h-[92px] rounded-lg border border-outline bg-surface px-4 py-3 text-left transition-colors hover:border-primary/50 hover:bg-surface-container/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                        aria-label="Expand syllabus and notes editor"
                    >
                        <div className="flex min-w-0 items-center justify-between gap-3">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-on-surface-variant/40 group-hover:text-primary/70" />
                            <p className={`line-clamp-2 min-w-0 whitespace-pre-line text-sm leading-6 ${formData.syllabus ? 'text-on-surface' : 'italic text-on-surface-variant/35'}`}>
                                {formData.syllabus || 'Add syllabus topics or important notes…'}
                            </p>
                            </div>
                            <span className="flex h-9 shrink-0 items-center gap-1.5 self-center rounded-md border border-outline/50 bg-surface-container/40 px-2.5 text-[9px] font-bold uppercase tracking-wider text-on-surface-variant/50 transition-colors group-hover:border-primary/30 group-hover:text-primary">
                                <Maximize2 className="h-3.5 w-3.5" />
                                <span className="hidden min-[380px]:inline">Expand</span>
                            </span>
                        </div>
                    </button>
                </div>

                {/* Attendance Count Override */}
                <div className="p-4 rounded-lg bg-orange-500/10 dark:bg-orange-500/5 border border-orange-500/20">
                    <label className="text-xs font-bold text-orange-600 dark:text-orange-400 uppercase mb-2 block">⚠️ Manual Attendance Override</label>
                    <p className="text-xs text-on-surface-variant/60 mb-3">Use this to fix incorrect counts. Be careful!</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-on-surface-variant/70 uppercase ml-1">Classes Attended</label>
                            <input
                                type="number"
                                name="attended"
                                value={formData.attended}
                                onChange={handleChange}
                                min="0"
                                className="w-full px-4 py-2.5 rounded-lg bg-surface border border-outline focus:border-orange-500/50 focus:outline-none transition-all text-on-surface text-center font-bold text-lg"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-semibold text-on-surface-variant/70 uppercase ml-1">Total Classes</label>
                            <input
                                type="number"
                                name="total"
                                value={formData.total}
                                onChange={handleChange}
                                min="0"
                                className="w-full px-4 py-2.5 rounded-lg bg-surface border border-outline focus:border-orange-500/50 focus:outline-none transition-all text-on-surface text-center font-bold text-lg"
                            />
                        </div>

                        {/* Assignment & Practical Totals Override */}
                        <div className="col-span-1 sm:col-span-2 p-4 rounded-lg bg-surface-container/30 border border-outline">
                            <label className="text-xs font-bold text-on-surface-variant/80 uppercase mb-2 block">🎯 Target Totals</label>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {formData.categories.includes('Practical') && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-on-surface-variant/70 uppercase ml-1">Practical Total</label>
                                        <input
                                            type="number"
                                            name="practical_total"
                                            value={formData.practical_total || 10}
                                            onChange={handleChange}
                                            min="1"
                                            className="w-full px-4 py-2.5 rounded-lg bg-surface border border-outline focus:border-primary/50 focus:outline-none transition-all text-on-surface text-center font-bold text-lg"
                                        />
                                    </div>
                                )}
                                {formData.categories.includes('Assignment') && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-semibold text-on-surface-variant/70 uppercase ml-1">Assignment Total</label>
                                        <input
                                            type="number"
                                            name="assignment_total"
                                            value={formData.assignment_total || 4}
                                            onChange={handleChange}
                                            min="1"
                                            className="w-full px-4 py-2.5 rounded-lg bg-surface border border-outline focus:border-primary/50 focus:outline-none transition-all text-on-surface text-center font-bold text-lg"
                                        />
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="pt-2">
                    <Button
                        type="submit"
                        disabled={loading}
                        className="w-full"
                        icon={!loading && <Save size={18} />}
                    >
                        {loading ? 'Saving...' : 'Save Changes'}
                    </Button>
                </div>
            </form>
        </Modal>
        {isOpen && isSyllabusExpanded && createPortal(
            <div
                className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-6"
                onKeyDownCapture={(event) => {
                    if (event.key === 'Escape') {
                        event.stopPropagation();
                        setIsSyllabusExpanded(false);
                    }
                }}
            >
                <button
                    type="button"
                    aria-label="Close expanded syllabus editor"
                    className="absolute inset-0 bg-black/70 backdrop-blur-sm"
                    onClick={() => setIsSyllabusExpanded(false)}
                />
                <section
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="expanded-syllabus-title"
                    className="relative flex h-[min(78vh,640px)] w-full max-w-3xl flex-col overflow-hidden rounded-xl border border-outline bg-surface shadow-2xl"
                >
                    <header className="flex items-center justify-between border-b border-outline bg-surface-container/20 px-4 py-3 sm:px-5">
                        <div className="flex min-w-0 items-center gap-3">
                            <FileText className="h-5 w-5 shrink-0 text-primary" />
                            <div className="min-w-0">
                                <h2 id="expanded-syllabus-title" className="truncate text-sm font-bold text-on-surface">Syllabus / Notes</h2>
                                <p className="truncate text-[10px] text-on-surface-variant/50">{formData.name || 'Subject details'}</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsSyllabusExpanded(false)}
                            className="rounded-lg p-2 text-on-surface-variant/50 transition-colors hover:bg-surface-container hover:text-on-surface"
                            aria-label="Close expanded syllabus editor"
                        >
                            <X className="h-5 w-5" />
                        </button>
                    </header>
                    <div className="flex min-h-0 flex-1 p-3 sm:p-5">
                        <textarea
                            name="syllabus"
                            value={formData.syllabus}
                            onChange={handleChange}
                            autoFocus
                            className="h-full w-full resize-none rounded-lg border border-outline bg-surface-container/20 p-4 text-sm leading-6 text-on-surface placeholder:text-on-surface-variant/30 focus:border-primary focus:outline-none"
                            placeholder="Enter syllabus topics or important notes…"
                        />
                    </div>
                    <footer className="flex items-center justify-between gap-3 border-t border-outline px-4 py-3 sm:px-5">
                        <span className="text-[10px] text-on-surface-variant/40">Changes save with the subject form</span>
                        <Button type="button" onClick={() => setIsSyllabusExpanded(false)}>Done</Button>
                    </footer>
                </section>
            </div>,
            document.body
        )}
        </>
    );
};

export default EditSubjectModal;
