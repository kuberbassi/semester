import React, { useState, useEffect } from 'react';
import { Trash2, CalendarClock, Plus } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import TimePicker from '../ui/TimePicker';
import { attendanceService } from '@/services/attendance.service';
import type { GridPeriod } from '@/types';

const to24Hour = (time12h: string) => {
    if (!time12h) return '09:00';
    try {
        const parts = time12h.trim().split(' ');
        if (parts.length !== 2) return time12h;
        const [time, modifier] = parts;
        const [rawHours, minutes] = time.split(':');
        let hours = rawHours;
        if (hours === '12') hours = '00';
        if (modifier.toLowerCase() === 'pm') hours = (parseInt(hours, 10) + 12).toString();
        return `${hours.padStart(2, '0')}:${minutes}`;
    } catch { return time12h; }
};

const to12Hour = (time24h: string) => {
    if (!time24h) return '';
    try {
        const parts = time24h.split(':');
        if (parts.length !== 2) return time24h;
        const [hours, minutes] = parts;
        let h = parseInt(hours, 10);
        const ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12;
        h = h ? h : 12;
        return `${h.toString().padStart(2, '0')}:${minutes} ${ampm}`;
    } catch { return time24h; }
};

interface StructureModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
    currentPeriods: GridPeriod[];
    semester: number;
}

const StructureModal: React.FC<StructureModalProps> = ({ isOpen, onClose, onSuccess, currentPeriods, semester }) => {
    const [periods, setPeriods] = useState<GridPeriod[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setPeriods(currentPeriods.map(p => ({
            ...p,
            id: p.id || Math.random().toString(36).substr(2, 9),
            startTime: to24Hour(p.startTime || p.start_time || ''),
            endTime: to24Hour(p.endTime || p.end_time || '')
        })));
    }, [currentPeriods, isOpen]);

    const handleAddPeriod = () => {
        const lastEnd = periods[periods.length - 1]?.endTime || '09:00';
        const [hStr, mStr] = lastEnd.split(':');
        const nextEndH = Math.min(22, (parseInt(hStr, 10) || 9) + 1).toString().padStart(2, '0');
        const newPeriod = {
            id: Math.random().toString(36).substr(2, 9),
            name: `Period ${periods.length + 1}`,
            startTime: lastEnd,
            endTime: `${nextEndH}:${mStr || '00'}`,
        };
        setPeriods([...periods, newPeriod]);
    };

    const handleRemovePeriod = (id: string) => {
        setPeriods(periods.filter(p => p.id !== id));
    };

    const handleUpdatePeriod = (id: string, field: 'name' | 'startTime' | 'endTime', value: string) => {
        setPeriods(periods.map(p => p.id === id ? { ...p, [field]: value } : p));
    };

    const handleSave = async () => {
        try {
            setLoading(true);
            const formattedPeriods = periods.map(p => ({
                ...p,
                startTime: to12Hour(p.startTime),
                endTime: to12Hour(p.endTime)
            }));
            await attendanceService.saveTimetableStructure(formattedPeriods, semester);
            onSuccess();
            onClose();
        } catch (error) {
            console.error('Failed to save structure', error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title="Timetable Structure"
            subtitle={`Configure daily periods & timings for Semester ${semester}`}
            icon={<CalendarClock size={18} />}
            size="lg"
        >
            <div className="space-y-5">
                <div className="flex items-center justify-between px-4 py-3 bg-on-surface/[0.03] dark:bg-white/[0.035] border border-on-surface/[0.09] rounded-2xl">
                    <div>
                        <p className="text-[10px] font-bold text-primary uppercase tracking-wider">Daily Schedule Slots</p>
                        <p className="text-xs font-semibold text-on-surface-variant mt-0.5">
                            {periods.length} period{periods.length === 1 ? '' : 's'} active in grid
                        </p>
                    </div>
                    <Button onClick={handleAddPeriod} variant="tonal" size="sm" icon={<Plus size={13} />}>
                        Add Slot
                    </Button>
                </div>

                <div className="max-h-[360px] overflow-y-auto pr-1 space-y-2.5 custom-scrollbar">
                    {periods.map((period, idx) => (
                        <div
                            key={period.id}
                            className="flex items-end gap-3 p-3.5 rounded-2xl border border-on-surface/[0.09] bg-on-surface/[0.025] dark:bg-white/[0.03] group hover:border-primary/35 transition-all duration-150"
                        >
                            <div className="w-8 h-9 rounded-xl bg-primary/14 border border-primary/25 flex items-center justify-center text-xs font-extrabold text-primary shrink-0 tabular-nums">
                                {idx + 1}
                            </div>
                            <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <Input
                                    label="Slot Name"
                                    value={period.name}
                                    onChange={e => handleUpdatePeriod(period.id, 'name', e.target.value)}
                                    placeholder="Period 1"
                                    className="h-9 text-xs px-3"
                                />
                                <TimePicker
                                    label="Start Time"
                                    value={period.startTime}
                                    onChange={(val) => handleUpdatePeriod(period.id, 'startTime', val)}
                                />
                                <TimePicker
                                    label="End Time"
                                    value={period.endTime}
                                    onChange={(val) => handleUpdatePeriod(period.id, 'endTime', val)}
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => handleRemovePeriod(period.id)}
                                title="Remove slot"
                                className="no-fluid w-9 h-9 rounded-xl bg-on-surface/[0.05] flex items-center justify-center text-on-surface-variant/70 hover:text-rose-500 hover:bg-rose-500/12 transition-colors shrink-0 cursor-pointer"
                            >
                                <Trash2 size={14} />
                            </button>
                        </div>
                    ))}
                    {periods.length === 0 && (
                        <div className="py-14 text-center border border-dashed border-on-surface/15 rounded-2xl">
                            <p className="text-xs font-semibold text-on-surface-variant">No slots configured yet</p>
                        </div>
                    )}
                </div>

                <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-on-surface/[0.08]">
                    <Button variant="text" onClick={onClose}>Cancel</Button>
                    <Button onClick={handleSave} isLoading={loading}>Save Structure</Button>
                </div>
            </div>
        </Modal>
    );
};

export default StructureModal;
