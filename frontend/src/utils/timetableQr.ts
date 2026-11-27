import type { GridPeriod, Subject, TimetableSchedule, TimetableSlot } from '@/types';
import { attendanceService } from '@/services/attendance.service';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;

const normalizeKey = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

const getPeriodStart = (p: GridPeriod) => String(p.startTime || p.start_time || '').trim();
const getPeriodEnd = (p: GridPeriod) => String(p.endTime || p.end_time || '').trim();
const getPeriodName = (p: GridPeriod) => String(p.name || p.label || '').trim();
const getSlotStart = (s: TimetableSlot) => String(s.start_time || s.startTime || '').trim();
const getSlotEnd = (s: TimetableSlot) => String(s.end_time || s.endTime || '').trim();

/**
 * Compact Semester QR v2 (`SEMQR2:...`) encoder — byte-for-byte compatible
 * with `semester-core/src/workspace.rs::export_timetable_qr_v2` on Android!
 */
export function encodeTimetableQrV2(
    periods: GridPeriod[],
    schedule: TimetableSchedule,
    subjects: Subject[],
): string {
    const subById = new Map<string, Subject>();
    subjects.forEach((s) => {
        const id = String(s._id || s.id || '').trim();
        if (id) subById.set(id, s);
    });

    const periodsCompact = periods.map((p, idx) => [
        getPeriodName(p) || `Period ${idx + 1}`,
        getPeriodStart(p),
        getPeriodEnd(p),
    ]);

    const dict: Array<[string, string, string, number, number]> = [];
    const dictIndex = new Map<string, number>();
    const slotTuples: Array<unknown[]> = [];

    DAYS.forEach((dayName, dayIdx) => {
        const daySlots = schedule[dayName] || [];
        for (const slot of daySlots) {
            const rawType = String(slot.type || 'class').toLowerCase();
            const typeCode =
                rawType === 'break' ? 'b' : rawType === 'free' ? 'f' : rawType === 'custom' ? 'u' : 'c';
            const start = getSlotStart(slot);
            const end = getSlotEnd(slot);
            const room = String(slot.classroom || '').trim();
            const label = String(slot.label || '').trim();
            const subjectObj = typeof slot.subject === 'object' && slot.subject !== null ? slot.subject : undefined;
            const sid = String(slot.subject_id || slot.subjectId || subjectObj?._id || subjectObj?.id || '').trim();
            const sname = String(slot.subject_name || slot.subjectName || subjectObj?.name || '').trim();

            let subIdx = -1;
            if (typeCode === 'c' && (sid || sname)) {
                const key = sid ? `id:${sid}` : `nm:${sname.toLowerCase()}`;
                const existing = dictIndex.get(key);
                if (existing !== undefined) {
                    subIdx = existing;
                } else {
                    const meta = sid ? subById.get(sid) : undefined;
                    const finalName = (meta?.name || sname || 'Class').trim();
                    const code = String(meta?.code || '').trim();
                    const subRoom = String(meta?.classroom || room || '').trim();
                    const credits = Number.isFinite(Number(meta?.credits)) ? Number(meta?.credits) : 3;
                    const isPrac =
                        String(meta?.type || '').toLowerCase() === 'practical' ||
                        (Array.isArray(meta?.categories) &&
                            meta.categories.some((c) => String(c).toLowerCase() === 'practical'));
                    subIdx = dict.length;
                    dict.push([finalName, code, subRoom, credits, isPrac ? 1 : 0]);
                    dictIndex.set(key, subIdx);
                }
            }

            const matchedPi = periodsCompact.findIndex(
                (p) => p[1].toLowerCase() === start.toLowerCase() && p[2].toLowerCase() === end.toLowerCase(),
            );
            const subDefaultRoom = subIdx >= 0 ? dict[subIdx][2] : '';

            if (
                matchedPi >= 0 &&
                typeCode === 'c' &&
                subIdx >= 0 &&
                !label &&
                (!room || room === subDefaultRoom)
            ) {
                slotTuples.push([dayIdx, matchedPi, subIdx]);
            } else {
                slotTuples.push([dayIdx, start, end, subIdx, typeCode, room, label]);
            }
        }
    });

    return `SEMQR2:${JSON.stringify({ p: periodsCompact, s: dict, t: slotTuples })}`;
}

export interface QrImportSummary {
    slotsImported: number;
    subjectsLinked: number;
    subjectsCreated: number;
    periodsImported: number;
}

/**
 * Imports `SEMQR2:...` OR legacy QR v1 (`{"v":1,"slots":[...]}`) directly into the
 * active Desktop semester, auto-linking existing Dashboard courses or creating missing ones!
 */
export async function importTimetableQrV2ToWorkspace(
    semester: number,
    rawPayload: string,
    existingSubjects: Subject[],
): Promise<QrImportSummary> {
    const trimmed = rawPayload.trim();
    if (!trimmed) throw new Error('Paste a timetable share code first.');

    const byCode = new Map<string, Subject>();
    const byName = new Map<string, Subject>();
    for (const sub of existingSubjects) {
        const ck = normalizeKey(String(sub.code || ''));
        const nk = normalizeKey(String(sub.name || ''));
        if (ck) byCode.set(ck, sub);
        if (nk) byName.set(nk, sub);
    }

    let subjectsLinked = 0;
    let subjectsCreated = 0;
    let slotsImported = 0;
    let periodsImported = 0;

    const ensureSubject = async (
        name: string,
        code: string,
        room: string,
        credits: number,
        isPrac: boolean,
    ): Promise<Subject> => {
        const ck = normalizeKey(code);
        if (ck && byCode.has(ck)) {
            subjectsLinked++;
            return byCode.get(ck)!;
        }
        const nk = normalizeKey(name);
        if (nk && byName.has(nk)) {
            subjectsLinked++;
            return byName.get(nk)!;
        }
        const cleanName = name.trim() || 'Imported Course';
        await attendanceService.addSubject(
            cleanName,
            semester,
            [isPrac ? 'Practical' : 'Theory'],
            code.trim(),
            '',
            room.trim(),
            Math.max(0, Math.min(12, credits || 3)),
        );
        subjectsCreated++;
        const refreshed = await attendanceService.getSubjects(semester);
        const found =
            refreshed.find((s) => (ck && normalizeKey(String(s.code || '')) === ck) || normalizeKey(String(s.name || '')) === normalizeKey(cleanName)) ||
            refreshed[refreshed.length - 1];
        if (found) {
            if (ck) byCode.set(ck, found);
            if (nk) byName.set(nk, found);
            return found;
        }
        const fallback: Subject = {
            id: '',
            _id: '',
            name: cleanName,
            code: code.trim(),
            classroom: room.trim(),
            semester,
            credits: Math.max(0, Math.min(12, credits || 3)),
            attended: 0,
            total: 0,
            target: 75,
            attendance_percentage: 0,
            status_message: 'New',
        };
        return fallback;
    };

    if (trimmed.startsWith('SEMQR2:')) {
        const root = JSON.parse(trimmed.slice('SEMQR2:'.length)) as {
            p?: Array<[string, string, string]>;
            s?: Array<[string, string, string, number, number]>;
            t?: Array<unknown[]>;
        };

        const periodDefs: Array<{ name: string; startTime: string; endTime: string }> = [];
        if (Array.isArray(root.p) && root.p.length > 0) {
            const fullPeriods: GridPeriod[] = [];
            root.p.forEach((p, idx) => {
                const startTime = String(p?.[1] || '').trim();
                const endTime = String(p?.[2] || '').trim();
                if (!startTime || !endTime) return;
                const name = String(p?.[0] || '').trim() || `Period ${idx + 1}`;
                periodDefs.push({ name, startTime, endTime });
                fullPeriods.push({ id: `p${idx + 1}`, name, startTime, endTime });
            });
            if (fullPeriods.length > 0) {
                await attendanceService.saveTimetableStructure(fullPeriods, semester);
                periodsImported = fullPeriods.length;
            }
        }

        const resolvedSubs: Subject[] = [];
        if (Array.isArray(root.s)) {
            for (const entry of root.s) {
                const sub = await ensureSubject(
                    String(entry?.[0] || ''),
                    String(entry?.[1] || ''),
                    String(entry?.[2] || ''),
                    Number(entry?.[3] ?? 3),
                    Number(entry?.[4] ?? 0) !== 0,
                );
                resolvedSubs.push(sub);
            }
        }

        if (Array.isArray(root.t)) {
            for (const arr of root.t) {
                if (!Array.isArray(arr) || arr.length < 3) continue;
                const dayIdx = Math.max(0, Math.min(5, Number(arr[0] ?? 0)));
                const day = DAYS[dayIdx];

                let startTime = '';
                let endTime = '';
                let subIdx = -1;
                let type: TimetableSlot['type'] = 'class';
                let label = '';

                if (arr.length === 3 && typeof arr[1] === 'number') {
                    const p = periodDefs[arr[1]];
                    if (!p) continue;
                    startTime = p.startTime;
                    endTime = p.endTime;
                    subIdx = Number(arr[2] ?? -1);
                } else {
                    startTime = String(arr[1] || '').trim();
                    endTime = String(arr[2] || '').trim();
                    subIdx = Number(arr[3] ?? -1);
                    const tc = String(arr[4] || 'c');
                    type = tc === 'b' ? 'break' : tc === 'f' ? 'free' : tc === 'u' ? 'custom' : 'class';
                    label = String(arr[6] || '').trim();
                }
                if (!startTime || !endTime) continue;

                const linked = type === 'class' && subIdx >= 0 ? resolvedSubs[subIdx] : undefined;
                const slot: TimetableSlot = {
                    day,
                    start_time: startTime,
                    end_time: endTime,
                    type,
                    subject_id: linked ? String(linked._id || linked.id || '') : '',
                    subject_name: linked ? linked.name : '',
                    label: type === 'class' ? '' : label || type,
                    semester,
                };
                await attendanceService.addTimetableSlot(slot, semester);
                slotsImported++;
            }
        }
    } else {
        // Legacy v1 JSON fallback: {"v":1,"slots":[...]}
        const parsed = JSON.parse(trimmed) as {
            slots?: Array<{
                day?: string;
                start_time?: string;
                end_time?: string;
                subject_name?: string;
                room?: string;
                slot_type?: string;
            }>;
        };
        if (!Array.isArray(parsed?.slots)) {
            throw new Error('Unrecognized timetable code. Expected a Semester QR code starting with SEMQR2:');
        }
        for (const s of parsed.slots) {
            const rawType = String(s.slot_type || 'class').toLowerCase();
            const type: TimetableSlot['type'] =
                rawType === 'break' || rawType === 'free' || rawType === 'custom' ? rawType : 'class';
            const linked =
                type === 'class' && s.subject_name
                    ? await ensureSubject(s.subject_name, '', s.room || '', 3, false)
                    : undefined;
            await attendanceService.addTimetableSlot(
                {
                    day: s.day || 'Monday',
                    start_time: s.start_time || '09:00 AM',
                    end_time: s.end_time || '10:00 AM',
                    type,
                    subject_id: linked ? String(linked._id || linked.id || '') : '',
                    subject_name: linked ? linked.name : '',
                    label: type === 'class' ? '' : s.subject_name || type,
                    semester,
                },
                semester,
            );
            slotsImported++;
        }
    }

    return { slotsImported, subjectsLinked, subjectsCreated, periodsImported };
}
