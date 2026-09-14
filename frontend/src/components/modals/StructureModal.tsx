import React, { useState, useEffect } from 'react';
import { Trash2, Settings } from 'lucide-react';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import Input from '../ui/Input';
import { attendanceService } from '@/services/attendance.service';
import type { GridPeriod } from '@/types';

const to24Hour = (time12h: string) => {
    if (!time12h) return '';
    try {
        const parts = time12h.split(' ');
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
        const newPeriod = { id: Math.random().toString(36).substr(2, 9), name: `Period ${periods.length + 1}`, startTime: '09:00', endTime: '10:00' };
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
            size="lg"
        >
            <div className="space-y-6">
                <div className="flex items-center justify-between p-4 bg-surface-container border border-outline rounded-xl">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary border border-outline/20">
                            <Settings size={20} />
                        </div>
                        <div>
                            <p className="text-xs font-bold text-on-surface-variant/40 uppercase tracking-wider">Configure Slots</p>
                            <p className="text-sm font-bold text-on-surface">Semester {semester} Grid</p>
                        </div>
                    </div>
                    <Button onClick={handleAddPeriod} variant="tonal" size="sm">
                        Add Slot
                    </Button>
                </div>

                <div className="max-h-[350px] overflow-y-auto pr-1 space-y-3 custom-scrollbar">
                    {periods.map((period, idx) => (
                        <div key={period.id} className="flex items-center gap-4 p-4 rounded-xl border border-outline bg-surface-container-low group hover:border-primary/30 transition-all">
                            <div className="w-8 h-8 rounded-lg bg-surface-container flex items-center justify-center text-xs font-bold text-on-surface-variant/50 border border-outline/30">{idx + 1}</div>
                            <div className="flex-1 grid grid-cols-3 gap-3">
                                <Input label="Slot Name" value={period.name} onChange={e => handleUpdatePeriod(period.id, 'name', e.target.value)} placeholder="e.g. Period 1" className="h-10 text-xs px-3" />
                                <Input label="Start Time" type="time" value={period.startTime} onChange={e => handleUpdatePeriod(period.id, 'startTime', e.target.value)} className="h-10 text-xs px-3" />
                                <Input label="End Time" type="time" value={period.endTime} onChange={e => handleUpdatePeriod(period.id, 'endTime', e.target.value)} className="h-10 text-xs px-3" />
                            </div>
                            <button onClick={() => handleRemovePeriod(period.id)} className="w-9 h-9 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant/50 hover:text-red-500 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100 self-end mb-1"><Trash2 size={15} /></button>
                        </div>
                    ))}
                    {periods.length === 0 && (
                        <div className="py-16 text-center border border-dashed border-outline rounded-xl">
                            <p className="text-xs font-semibold text-on-surface-variant/50 uppercase tracking-widest">No slots configured</p>
                        </div>
                    )}
                </div>

                <div className="flex gap-3 pt-4 border-t border-outline">
                    <Button variant="text" onClick={onClose} className="flex-1">Cancel</Button>
                    <Button onClick={handleSave} isLoading={loading} className="flex-[2] shadow-sm">Save Structure</Button>
                </div>
            </div>
        </Modal>
    );
};

export default StructureModal;
