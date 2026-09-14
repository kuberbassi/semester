import React, { useState } from 'react';
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
        <Modal isOpen={isOpen} onClose={onClose} title="Add Subject" size="sm">
            <p className="text-xs text-on-surface-variant/60 mb-6">
                Create a new subject to track attendance for.
            </p>

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
                        <label className="text-[10px] font-bold text-on-surface-variant/50 uppercase tracking-widest ml-1">Categories</label>
                        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-outline bg-surface-container p-2 min-h-[46px]">
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
                                    className={`px-3 py-1.5 rounded-md text-[10px] font-bold border transition-all
                                        ${categories.includes(cat)
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
                </div>

                <div className="flex justify-end gap-3 mt-4">
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
