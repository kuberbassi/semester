import type { Subject, TimetableSlot } from '@/types';

const normalizeId = (value: unknown): string =>
    value === null || value === undefined ? '' : String(value).trim();

export const parseTimeToMinutes = (value: string): number => {
    const [time = '', modifier = ''] = value.trim().split(/\s+/);
    const [hoursText, minutesText = '0'] = time.split(':');
    let hours = Number.parseInt(hoursText, 10);
    const minutes = Number.parseInt(minutesText, 10);
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
    if (modifier) {
        if (hours === 12) hours = 0;
        if (modifier.toLowerCase() === 'pm') hours += 12;
    }
    return hours * 60 + minutes;
};

export const sortTimetableSlots = (slots: TimetableSlot[]): TimetableSlot[] =>
    [...slots].sort((left, right) => {
        const leftStart = String(left.start_time || left.startTime || '');
        const rightStart = String(right.start_time || right.startTime || '');
        return parseTimeToMinutes(leftStart) - parseTimeToMinutes(rightStart);
    });

export const findSubjectForSlot = (subjects: Subject[], slot: TimetableSlot): Subject | undefined => {
    const explicitType = String(slot.type || '').trim().toLowerCase();
    if (['break', 'lunch', 'gap', 'free', 'custom'].includes(explicitType)) return undefined;

    const embeddedSubject = typeof slot.subject === 'object' ? slot.subject : undefined;
    const subjectId = normalizeId(slot.subject_id || slot.subjectId || embeddedSubject?._id || embeddedSubject?.id);
    if (subjectId) {
        const match = subjects.find((subject) => normalizeId(subject._id || subject.id) === subjectId);
        if (match) return match;
    }

    const subjectName = typeof slot.subject === 'string' ? slot.subject : embeddedSubject?.name;
    const label = String(subjectName || slot.label || slot.subject_name || slot.subjectName || slot.name || '').trim().toLowerCase();
    if (!label || ['break', 'lunch', 'gap'].includes(label)) return undefined;

    return subjects.find((subject) => {
        const name = subject.name.trim().toLowerCase();
        const code = subject.code.trim().toLowerCase();
        const acronym = name.split(/\s+/).map((word) => word[0]).join('');
        return name === label
            || code === label
            || acronym === label
            || name.includes(label)
            || Boolean(code && (code.includes(label) || label.includes(code)));
    });
};
