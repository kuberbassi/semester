import test from 'node:test';
import assert from 'node:assert/strict';

import {
    isAttendedAttendanceStatus,
    isCountedAttendanceStatus,
    normalizeAttendanceStatus,
} from '../api-node/src/utils/attendanceStatus.ts';
import { getSlotType, scoreScheduleBySubjects } from '../api-node/src/utils/timetableSlots.ts';
import { AttendanceCalculator, GradeCalculator } from '../frontend/src/lib/calculationEngine.ts';
import { formatLocalDate } from '../frontend/src/lib/date.ts';
import { findSubjectForSlot, parseTimeToMinutes, sortTimetableSlots } from '../frontend/src/lib/timetable.ts';

test('attendance statuses normalize legacy input safely', () => {
    assert.equal(normalizeAttendanceStatus(' Approved Medical '), 'approved_medical');
    assert.equal(normalizeAttendanceStatus('ABSENT'), 'absent');
    assert.equal(normalizeAttendanceStatus('unknown value'), 'present');
});

test('cancelled classes do not count and medical leave counts as attended', () => {
    assert.equal(isCountedAttendanceStatus('cancelled'), false);
    assert.equal(isCountedAttendanceStatus('approved_medical'), true);
    assert.equal(isAttendedAttendanceStatus('approved_medical'), true);
    assert.equal(isAttendedAttendanceStatus('absent'), false);
});

test('timetable slot type supports current and legacy slot shapes', () => {
    assert.equal(getSlotType({ type: ' Break ' }), 'break');
    assert.equal(getSlotType({ label: 'Lunch' }), 'custom');
    assert.equal(getSlotType({ subjectId: 'subject-1' }), 'class');
});

test('schedule scoring ignores custom slots and unknown subjects', () => {
    const schedule = {
        Monday: [
            { subject_id: 'subject-1' },
            { subjectId: 'subject-2' },
            { subject_id: 'missing' },
            { type: 'break', subject_id: 'subject-1' },
        ],
        Tuesday: 'invalid legacy data',
    };
    assert.equal(scoreScheduleBySubjects(schedule, new Set(['subject-1', 'subject-2'])), 2);
});

test('frontend timetable helpers sort times and resolve legacy subject references', () => {
    const subjects = [
        { _id: 'subject-1', name: 'Data Structures', code: 'DS', credits: 4, semester: 2 },
        { _id: 'subject-2', name: 'Discrete Mathematics', code: 'DM', credits: 4, semester: 2 },
    ];
    assert.equal(parseTimeToMinutes('12:30 PM'), 750);
    assert.deepEqual(
        sortTimetableSlots([
            { day: 'Monday', start_time: '1:00 PM', end_time: '2:00 PM' },
            { day: 'Monday', start_time: '9:00 AM', end_time: '10:00 AM' },
        ]).map((slot) => slot.start_time),
        ['9:00 AM', '1:00 PM'],
    );
    assert.equal(findSubjectForSlot(subjects, {
        day: 'Monday', start_time: '09:00', end_time: '10:00', subjectId: 'subject-1',
    })?.code, 'DS');
    assert.equal(findSubjectForSlot(subjects, {
        day: 'Monday', start_time: '10:00', end_time: '11:00', label: 'DM',
    })?._id, 'subject-2');
    assert.equal(findSubjectForSlot(subjects, {
        day: 'Monday', start_time: '11:00', end_time: '12:00', type: 'break', label: 'DS',
    }), undefined);
});

test('attendance calculations cover zero, target, and impossible targets', () => {
    assert.equal(AttendanceCalculator.calculatePercentage(0, 0), 0);
    assert.equal(AttendanceCalculator.calculatePercentage(3, 4), 75);
    assert.equal(AttendanceCalculator.calculateDaysNeeded(7, 10, 75), 2);
    assert.equal(AttendanceCalculator.calculateDaysNeeded(9, 10, 100), Infinity);
});

test('attendance summary aggregates subjects and rounds percentage', () => {
    const summary = AttendanceCalculator.getAttendanceSummary([
        { attended: 3, total: 4 },
        { attended: 2, total: 3 },
    ]);
    assert.equal(summary.totalAttended, 5);
    assert.equal(summary.totalPossible, 7);
    assert.equal(summary.overallPercentage, 71.43);
    assert.equal(summary.status, 'Needs Attention');
});

test('grade calculations remain credit weighted', () => {
    assert.equal(GradeCalculator.calculateSGPA([
        { credits: 4, grade: 'O' },
        { credits: 2, grade: 'B' },
    ]), 52 / 6);
    assert.equal(GradeCalculator.calculateCGPA([
        [{ credits: 4, grade: 'O' }],
        [{ credits: 4, grade: 'A' }],
    ]), 9);
});

test('local dates are formatted without UTC conversion', () => {
    assert.equal(formatLocalDate(new Date(2026, 0, 5, 23, 59)), '2026-01-05');
});
