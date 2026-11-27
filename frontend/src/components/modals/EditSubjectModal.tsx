import React, { useCallback, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { useToast } from '@/components/ui/toast-context';
import { attendanceService } from '@/services/attendance.service';
import { BookOpen, User, MapPin, Hash, FileText, Maximize2, Save, X, SlidersHorizontal } from 'lucide-react';
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
    const [medicalLeaveCount, setMedicalLeaveCount] = useState(subject.medical_leave_count ?? 0);

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
                const medicalCount = details.medical_leave_count ?? subject.medical_leave_count ?? 0;
                setMedicalLeaveCount(medicalCount);
                setFormData(prev => ({
                    ...prev,
                    code: details.code || prev.code,
                    categories: details.categories || prev.categories,
                    professor: details.professor || prev.professor,
                    classroom: details.classroom || prev.classroom,
                    syllabus: details.syllabus || prev.syllabus,
                    semester: details.semester || prev.semester,
                    credits: details.credits !== null && details.credits !== undefined ? Number(details.credits) : prev.credits,
                    attended: typeof details.attended === 'number'
                        ? Math.max(0, details.attended - medicalCount)
                        : prev.attended,
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
    }, [showToast, onClose, subject.medical_leave_count]);

    useEffect(() => {
        if (!subject || !isOpen) return;

        setIsSyllabusExpanded(false);
        const currentMedicalLeaveCount = subject.medical_leave_count ?? 0;
        setMedicalLeaveCount(currentMedicalLeaveCount);
        setFormData({
            name: subject.name || '',
            code: subject.code || '',
            professor: subject.professor || '',
            classroom: subject.classroom || '',
            syllabus: subject.syllabus || '',
            semester: subject.semester || 1,
            credits: subject.credits !== undefined ? Number(subject.credits) : 3,
            attended: Math.max(0, (subject.attended || 0) - currentMedicalLeaveCount),
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

    const eligibleTotal = Math.max(0, formData.total - medicalLeaveCount);
    const attendanceWithoutMedical = eligibleTotal > 0 ? (formData.attended / eligibleTotal) * 100 : 0;
    const attendanceWithMedicalAsAbsent = formData.total > 0 ? (formData.attended / formData.total) * 100 : 0;

    return (
        <>
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Edit Subject"
            subtitle={formData.code ? `${formData.code} · Semester ${formData.semester}` : `Semester ${formData.semester} course details`}
            icon={<SlidersHorizontal size={18} />}
            size="lg"
        >
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* Subject Name */}
                <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-on-surface-variant/75 ml-0.5">Subject Name</label>
                    <div className="relative">
                        <BookOpen className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/45" />
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-on-surface/[0.04] border border-on-surface/[0.10] focus:border-primary/50 focus:ring-2 focus:ring-primary/15 focus:outline-none transition-all text-xs font-medium text-on-surface placeholder:text-on-surface-variant/40"
                            placeholder="e.g. Data Structures"
                            required
                        />
                    </div>
                </div>

                {/* Categories, Code, & Credits Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                    {/* Categories Multi-Select */}
                    <div className="space-y-1.5 sm:col-span-2">
                        <label className="text-[11px] font-semibold text-on-surface-variant/75 ml-0.5">Categories</label>
                        <div className="flex flex-wrap items-center gap-2 p-2 bg-on-surface/[0.03] border border-on-surface/[0.08] rounded-2xl min-h-[46px]">
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
                                    className={`no-fluid px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer
                                        ${formData.categories.includes(cat)
                                            ? 'bg-primary/16 border-primary/35 text-primary'
                                            : 'bg-on-surface/[0.04] border-transparent text-on-surface-variant hover:bg-on-surface/[0.08] hover:text-on-surface'
                                        }
                                    `}
                                >
                                    {cat}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Subject Code */}
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-on-surface-variant/75 ml-0.5">Subject Code</label>
                        <div className="relative">
                            <Hash className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/45" />
                            <input
                                type="text"
                                name="code"
                                value={formData.code}
                                onChange={handleChange}
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-on-surface/[0.04] border border-on-surface/[0.10] focus:border-primary/50 focus:outline-none transition-all text-xs font-medium text-on-surface placeholder:text-on-surface-variant/40"
                                placeholder="e.g. CS-101"
                            />
                        </div>
                    </div>

                    {/* Credits */}
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-on-surface-variant/75 ml-0.5">Credits</label>
                        <div className="relative">
                            <input
                                type="number"
                                name="credits"
                                value={formData.credits}
                                onChange={handleChange}
                                min="0"
                                max="10"
                                className="w-full px-3.5 py-2.5 rounded-xl bg-on-surface/[0.04] border border-on-surface/[0.10] focus:border-primary/50 focus:outline-none transition-all text-xs font-medium text-on-surface placeholder:text-on-surface-variant/40"
                                placeholder="3"
                            />
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Professor */}
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-on-surface-variant/75 ml-0.5">Professor</label>
                        <div className="relative">
                            <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/45" />
                            <input
                                type="text"
                                name="professor"
                                value={formData.professor}
                                onChange={handleChange}
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-on-surface/[0.04] border border-on-surface/[0.10] focus:border-primary/50 focus:outline-none transition-all text-xs font-medium text-on-surface placeholder:text-on-surface-variant/40"
                                placeholder="Prof. Name"
                            />
                        </div>
                    </div>

                    {/* Classroom */}
                    <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-on-surface-variant/75 ml-0.5">Classroom</label>
                        <div className="relative">
                            <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-on-surface-variant/45" />
                            <input
                                type="text"
                                name="classroom"
                                value={formData.classroom}
                                onChange={handleChange}
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-on-surface/[0.04] border border-on-surface/[0.10] focus:border-primary/50 focus:outline-none transition-all text-xs font-medium text-on-surface placeholder:text-on-surface-variant/40"
                                placeholder="Room 301"
                            />
                        </div>
                    </div>
                </div>

                {/* Syllabus */}
                <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-on-surface-variant/75 ml-0.5">Syllabus / Notes</label>
                    <button
                        type="button"
                        onClick={() => setIsSyllabusExpanded(true)}
                        className="no-fluid group w-full min-h-[82px] rounded-2xl border border-on-surface/[0.09] bg-on-surface/[0.03] px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-on-surface/[0.06] cursor-pointer"
                        aria-label="Expand syllabus and notes editor"
                    >
                        <div className="flex min-w-0 items-center justify-between gap-3">
                            <div className="flex min-w-0 flex-1 items-start gap-2.5">
                            <FileText className="mt-0.5 h-4 w-4 shrink-0 text-on-surface-variant/45 group-hover:text-primary" />
                            <p className={`line-clamp-2 min-w-0 whitespace-pre-line text-xs leading-5 ${formData.syllabus ? 'text-on-surface' : 'italic text-on-surface-variant/45'}`}>
                                {formData.syllabus || 'Add syllabus topics or important notes…'}
                            </p>
                            </div>
                            <span className="flex h-7 shrink-0 items-center gap-1.5 self-center rounded-full border border-on-surface/[0.09] bg-on-surface/[0.05] px-2.5 text-[10px] font-semibold text-on-surface-variant transition-colors group-hover:border-primary/30 group-hover:text-primary">
                                <Maximize2 className="h-3 w-3" />
                                <span className="hidden min-[380px]:inline">Expand</span>
                            </span>
                        </div>
                    </button>
                </div>

                {/* Attendance Count Override */}
                <div className="p-4 rounded-2xl bg-amber-500/[0.06] border border-amber-500/20">
                    <label className="text-xs font-bold text-amber-400 mb-1 block">Manual Attendance Override</label>
                    <p className="text-[11px] text-on-surface-variant/65 mb-3">Adjust conducted totals directly. Medical leave is excluded from the adjusted total.</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-on-surface-variant/75 ml-0.5">Classes Attended</label>
                            <input
                                type="number"
                                name="attended"
                                value={formData.attended}
                                onChange={handleChange}
                                min="0"
                                max={Math.max(0, formData.total - medicalLeaveCount)}
                                className="w-full px-3.5 py-2 rounded-xl bg-on-surface/[0.05] border border-on-surface/[0.10] focus:border-amber-400/50 focus:outline-none transition-all text-on-surface text-center font-bold text-base tabular-nums"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-semibold text-on-surface-variant/75 ml-0.5">Total Conducted</label>
                            <input
                                type="number"
                                name="total"
                                value={formData.total}
                                onChange={handleChange}
                                min={medicalLeaveCount}
                                className="w-full px-3.5 py-2 rounded-xl bg-on-surface/[0.05] border border-on-surface/[0.10] focus:border-amber-400/50 focus:outline-none transition-all text-on-surface text-center font-bold text-base tabular-nums"
                            />
                        </div>

                        <div className="col-span-1 sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-xl border border-on-surface/[0.07] bg-on-surface/[0.03] p-3">
                            <div>
                                <p className="text-[10px] font-semibold text-on-surface-variant/55">Medical excluded · {formData.attended}/{eligibleTotal}</p>
                                <p className="mt-0.5 text-sm font-bold text-on-surface tabular-nums">{attendanceWithoutMedical.toFixed(1)}%</p>
                            </div>
                            <div>
                                <p className="text-[10px] font-semibold text-on-surface-variant/55">Medical counted absent · {formData.attended}/{formData.total}</p>
                                <p className="mt-0.5 text-sm font-bold text-on-surface tabular-nums">{attendanceWithMedicalAsAbsent.toFixed(1)}%</p>
                            </div>
                        </div>

                        {/* Assignment & Practical Totals Override */}
                        {(formData.categories.includes('Practical') || formData.categories.includes('Assignment')) && (
                            <div className="col-span-1 sm:col-span-2 p-3.5 rounded-xl bg-on-surface/[0.03] border border-on-surface/[0.07]">
                                <label className="text-xs font-bold text-on-surface mb-2.5 block">Target Totals</label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                                    {formData.categories.includes('Practical') && (
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-semibold text-on-surface-variant/75 ml-0.5">Practical Total</label>
                                            <input
                                                type="number"
                                                name="practical_total"
                                                value={formData.practical_total || 10}
                                                onChange={handleChange}
                                                min="1"
                                                className="w-full px-3.5 py-2 rounded-xl bg-on-surface/[0.05] border border-on-surface/[0.10] focus:border-primary/50 focus:outline-none transition-all text-on-surface text-center font-bold text-base tabular-nums"
                                            />
                                        </div>
                                    )}
                                    {formData.categories.includes('Assignment') && (
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-semibold text-on-surface-variant/75 ml-0.5">Assignment Total</label>
                                            <input
                                                type="number"
                                                name="assignment_total"
                                                value={formData.assignment_total || 4}
                                                onChange={handleChange}
                                                min="1"
                                                className="w-full px-3.5 py-2 rounded-xl bg-on-surface/[0.05] border border-on-surface/[0.10] focus:border-primary/50 focus:outline-none transition-all text-on-surface text-center font-bold text-base tabular-nums"
                                            />
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-on-surface/[0.08]">
                    <Button type="button" variant="text" onClick={onClose} disabled={loading}>
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        disabled={loading}
                        isLoading={loading}
                        icon={!loading && <Save size={15} />}
                    >
                        {loading ? 'Saving…' : 'Save Changes'}
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
                    className="absolute inset-0 bg-black/70"
                    onClick={() => setIsSyllabusExpanded(false)}
                />
                <section
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="expanded-syllabus-title"
                    className="relative flex h-[min(78vh,640px)] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] liquid-glass-overlay"
                >
                    <header className="flex items-center justify-between border-b border-on-surface/[0.08] px-5 py-4">
                        <div className="flex min-w-0 items-center gap-3">
                            <FileText className="h-4 w-4 shrink-0 text-primary" />
                            <div className="min-w-0">
                                <h2 id="expanded-syllabus-title" className="truncate text-sm font-bold text-on-surface">Syllabus / Notes</h2>
                                <p className="truncate text-[11px] text-on-surface-variant/60">{formData.name || 'Subject details'}</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={() => setIsSyllabusExpanded(false)}
                            className="no-fluid w-7 h-7 rounded-full bg-on-surface/[0.06] hover:bg-on-surface/[0.12] text-on-surface-variant hover:text-on-surface flex items-center justify-center transition-colors cursor-pointer"
                            aria-label="Close expanded syllabus editor"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    </header>
                    <div className="flex min-h-0 flex-1 p-4 sm:p-5">
                        <textarea
                            name="syllabus"
                            value={formData.syllabus}
                            onChange={handleChange}
                            autoFocus
                            className="h-full w-full resize-none rounded-2xl border border-on-surface/[0.09] bg-on-surface/[0.03] p-4 text-sm leading-6 text-on-surface placeholder:text-on-surface-variant/35 focus:border-primary/50 focus:outline-none"
                            placeholder="Enter syllabus topics or important notes…"
                        />
                    </div>
                    <footer className="flex items-center justify-between gap-3 border-t border-on-surface/[0.08] px-5 py-3.5">
                        <span className="text-[11px] text-on-surface-variant/55">Changes save with the subject form</span>
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
