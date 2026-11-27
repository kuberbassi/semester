import React, { useState } from 'react';
import { BookPlus } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { attendanceService } from '@/services/attendance.service';
import { useToast } from '../ui/toast-context';

interface AddSubjectModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    currentSemester?: number;
}

const AddSubjectModal: React.FC<AddSubjectModalProps> = ({ isOpen, onClose, onSuccess, currentSemester = 1 }) => {
    const [subjectName, setSubjectName] = useState('');
    const [semester, setSemester] = useState(currentSemester.toString());
    const [credits, setCredits] = useState('3');
    const [categories, setCategories] = useState<string[]>(['Theory']);
    const [loading, setLoading] = useState(false);
    const { showToast } = useToast();

    // Reset state on open
    React.useEffect(() => {
        if (isOpen) {
            setSubjectName('');
            setSemester(currentSemester.toString());
            setCredits('3');
            setCategories(['Theory']);
        }
    }, [isOpen, currentSemester]);

    // Automatic smart credits assigner
    React.useEffect(() => {
        if (categories.includes('Theory') && !categories.includes('Practical')) {
            setCredits('3');
        } else if (categories.includes('Practical') && !categories.includes('Theory')) {
            setCredits('1');
        } else if (categories.includes('Theory') && categories.includes('Practical')) {
            setCredits('4');
        }
    }, [categories]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!subjectName.trim()) {
            showToast('error', 'Subject name is required');
            return;
        }

        setLoading(true);
        try {
            await attendanceService.addSubject(
                subjectName,
                parseInt(semester),
                categories,
                undefined,
                undefined,
                undefined,
                parseInt(credits) || 0
            );
            showToast('success', 'Subject added successfully');
            onSuccess();
            onClose();
        } catch (error) {
            console.error(error);
            showToast('error', 'Failed to add subject');
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Add Subject"
            subtitle="Create a new course to track attendance & credits"
            icon={<BookPlus size={18} />}
            size="md"
        >
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Input
                    label="Subject Name"
                    placeholder="e.g. Advanced Mathematics"
                    value={subjectName}
                    onChange={(e) => setSubjectName(e.target.value)}
                    autoFocus
                />

                <div className="grid grid-cols-2 gap-4">
                    <Input
                        label="Semester"
                        type="number"
                        min="1"
                        max="8"
                        value={semester}
                        onChange={(e) => setSemester(e.target.value)}
                    />

                    <Input
                        label="Credits"
                        type="number"
                        min="0"
                        max="10"
                        value={credits}
                        onChange={(e) => setCredits(e.target.value)}
                    />

                    <div className="col-span-2 space-y-2">
                        <label className="text-[11px] font-semibold text-on-surface-variant/75 ml-0.5">Categories</label>
                        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-on-surface/[0.08] bg-on-surface/[0.03] p-2 min-h-[46px]">
                            {['Theory', 'Practical', 'Assignment'].map((cat) => (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => {
                                        if (categories.includes(cat)) {
                                            setCategories(categories.filter(c => c !== cat));
                                        } else {
                                            setCategories([...categories, cat]);
                                        }
                                    }}
                                    className={`no-fluid px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-colors cursor-pointer
                                        ${categories.includes(cat)
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
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-4 mt-2 border-t border-on-surface/[0.08]">
                    <Button
                        type="button"
                        variant="text"
                        onClick={onClose}
                        disabled={loading}
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="filled"
                        isLoading={loading}
                    >
                        Create Subject
                    </Button>
                </div>
            </form>
        </Modal>
    );
};

export default AddSubjectModal;
