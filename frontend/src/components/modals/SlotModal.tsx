import React, { useState, useEffect } from 'react';
import { Clock, Trash2 } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import Select from '../ui/Select';
import { attendanceService } from '@/services/attendance.service';
import type { GridPeriod, Subject, TimetableSlot } from '@/types';

interface SlotModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    slot: TimetableSlot | null;
    day: string | null;
    period: GridPeriod | null;
    subjects: Subject[];
    semester: number;
}

const SlotModal: React.FC<SlotModalProps> = ({ isOpen, onClose, onSuccess, slot, day, period, subjects, semester }) => {
    const [formData, setFormData] = useState<Partial<TimetableSlot>>({
        type: 'class',
        subject_id: '',
        label: ''
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (slot) {
            setFormData({
                type: slot.type || 'class',
                subject_id: String(slot.subject_id || slot.subjectId || (typeof slot.subject === 'object' ? slot.subject?._id || slot.subject?.id : '') || ''),
                label: slot.label || ''
            });
        } else {
            setFormData({ type: 'class', subject_id: '', label: '' });
        }
    }, [slot, isOpen]);

    const handleSave = async () => {
        if (loading) return;
        try {
            setLoading(true);
            const requestedType = String(formData.type || 'class').toLowerCase();
            const normalizedType: TimetableSlot['type'] = ['class', 'break', 'free', 'custom'].includes(requestedType)
                ? requestedType as TimetableSlot['type']
                : 'class';
            const isClassType = normalizedType === 'class';
            const startTime = period?.startTime || period?.start_time || slot?.start_time || slot?.startTime;
            const endTime = period?.endTime || period?.end_time || slot?.end_time || slot?.endTime;
            const slotDay = day || slot?.day;
            if (!slotDay || !startTime || !endTime) {
                throw new Error('A timetable day and period are required');
            }
            const slotData: TimetableSlot = {
                ...formData,
                type: normalizedType,
                subject_id: isClassType && formData.subject_id ? String(formData.subject_id) : '',
                label: isClassType ? (formData.label || '') : String(formData.label || slot?.label || ''),
                day: slotDay,
                start_time: startTime,
                end_time: endTime,
                semester
            };

            if (slot?._id || slot?.id) {
                await attendanceService.updateTimetableSlot(slot._id || slot.id!, slotData, semester);
            } else {
                await attendanceService.addTimetableSlot(slotData, semester);
            }
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Failed to save slot', error);
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async () => {
        if (loading) return;
        const slotId = slot?._id || slot?.id;
        if (!slotId) return;
        try {
            setLoading(true);
            await attendanceService.deleteTimetableSlot(slotId, semester, {
                day: String(slot?.day || day || ''),
                start_time: String(slot?.start_time || slot?.startTime || period?.startTime || period?.start_time || ''),
            });
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Failed to delete slot', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={slot ? 'Edit Class Slot' : 'Add Class Slot'}
            size="sm"
        >
            <div className="space-y-6">
                <div className="flex items-center gap-4 p-4 bg-surface-container border border-outline rounded-xl">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                        <Clock size={20} />
                    </div>
                    <div>
                        <p className="text-xs font-semibold text-on-surface-variant/70 uppercase tracking-wider">Date & Time</p>
                        <p className="text-sm font-bold text-on-surface">{day} • {period?.startTime || slot?.start_time}</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <Select label="Type" value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as TimetableSlot['type'] })} options={[
                        { value: 'class', label: 'Class' },
                        { value: 'break', label: 'Break' },
                        { value: 'free', label: 'Free' },
                        { value: 'custom', label: 'Custom' }
                    ]} />
                    {formData.type === 'class' ? (
                        <Select label="Subject" value={formData.subject_id} onChange={e => setFormData({ ...formData, subject_id: e.target.value })} options={subjects.map(s => ({ value: String(s._id || s.id || ''), label: s.name }))} />
                    ) : (
                        <Input label="Label" value={formData.label} onChange={e => setFormData({ ...formData, label: e.target.value })} placeholder="e.g. Lunch Break, Free Period" />
                    )}
                </div>

                <div className="flex gap-3 pt-4 border-t border-outline">
                    {slot && (
                        <Button variant="outlined" onClick={handleDelete} className="text-red-500 hover:bg-red-500/10 hover:text-red-600 px-3">
                            <Trash2 size={16} />
                        </Button>
                    )}
                    <Button variant="text" onClick={onClose} className="flex-1">Cancel</Button>
                    <Button onClick={handleSave} isLoading={loading} className="flex-[2] shadow-sm">Save</Button>
                </div>
            </div>
        </Modal>
    );
};

export default SlotModal;
