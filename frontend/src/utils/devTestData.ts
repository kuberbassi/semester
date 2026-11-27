import type { User, DashboardData, TimetableSlot } from '@/types';
import type { Note } from '@/hooks/useNotes';

export const DEV_TEST_MODE_KEY = 'semester_dev_test_mode';
export const DEV_TEST_DATA_KEY = 'semester_dev_test_data';
export const DEV_TEST_NOTES_KEY = 'semester_dev_test_notes';
export const DEV_TEST_RESULTS_KEY = 'semester_dev_test_results';

export const isDevTestMode = (): boolean => {
    // Dev preview is a web-only demo; the desktop app always uses the real local SQLite workspace.
    if (typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || window.location.hostname.endsWith('tauri.localhost'))) {
        try { localStorage.removeItem(DEV_TEST_MODE_KEY); } catch { /* ignore */ }
        return false;
    }
    try {
        return localStorage.getItem(DEV_TEST_MODE_KEY) === 'true';
    } catch {
        return false;
    }
};

export const DEV_TEST_USER: User = {
    _id: 'dev-test-user-id',
    name: 'Alex Mercer (Dev Mode)',
    email: 'dev@semester.app',
    branch: 'Computer Science & Engineering',
    course: 'B.Tech',
    college: 'USICT, GGSIPU Main Campus',
    batch: '2023-2027',
    enrollment_number: '04216403223',
    current_semester: 5,
    attendance_threshold: 75,
    warning_threshold: 76,
    picture: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200',
    created_at: new Date().toISOString(),
};

export const getInitialDevSubjects = () => [
    {
        _id: 'sub-dev-algo',
        id: 'sub-dev-algo',
        name: 'Design & Analysis of Algorithms',
        code: 'CST-301',
        professor: 'Dr. Amit Sharma',
        classroom: 'Room 402',
        semester: 5,
        type: 'theory',
        credits: 4,
        target: 75,
        attended: 38,
        total: 42,
        attendance_percentage: 90.48,
        status_message: 'On Track',
        categories: ['Theory'],
    },
    {
        _id: 'sub-dev-os',
        id: 'sub-dev-os',
        name: 'Operating Systems & Architecture',
        code: 'CST-303',
        professor: 'Prof. Neha Gupta',
        classroom: 'Room 305',
        semester: 5,
        type: 'theory',
        credits: 4,
        target: 75,
        attended: 32,
        total: 41,
        attendance_percentage: 78.05,
        status_message: 'On Track (1 Bunk Left)',
        categories: ['Theory'],
    },
    {
        _id: 'sub-dev-cn',
        id: 'sub-dev-cn',
        name: 'Computer Networks & Security',
        code: 'CST-305',
        professor: 'Dr. Rajesh Verma',
        classroom: 'Room 201',
        semester: 5,
        type: 'theory',
        credits: 4,
        target: 75,
        attended: 25,
        total: 39,
        attendance_percentage: 64.10,
        status_message: 'Low Attendance',
        categories: ['Theory'],
    },
    {
        _id: 'sub-dev-ml',
        id: 'sub-dev-ml',
        name: 'Machine Learning Foundations',
        code: 'CST-307',
        professor: 'Dr. Priya Singh',
        classroom: 'Lab 1 / 501',
        semester: 5,
        type: 'theory',
        credits: 4,
        target: 75,
        attended: 33,
        total: 38,
        attendance_percentage: 86.84,
        status_message: 'On Track',
        categories: ['Theory'],
    },
    {
        _id: 'sub-dev-se',
        id: 'sub-dev-se',
        name: 'Software Engineering & Agile',
        code: 'CST-309',
        professor: 'Er. Vikram Malhotra',
        classroom: 'Room 308',
        semester: 5,
        type: 'theory',
        credits: 3,
        target: 75,
        attended: 29,
        total: 36,
        attendance_percentage: 80.56,
        status_message: 'On Track',
        categories: ['Theory'],
    },
    {
        _id: 'sub-dev-cn-lab',
        id: 'sub-dev-cn-lab',
        name: 'Computer Networks Lab',
        code: 'CST-351',
        professor: 'Dr. Rajesh Verma',
        classroom: 'Lab 2',
        semester: 5,
        type: 'practical',
        credits: 2,
        target: 75,
        attended: 14,
        total: 14,
        attendance_percentage: 100.0,
        status_message: 'Excellent',
        categories: ['Practical'],
    },
    {
        _id: 'sub-dev-algo-lab',
        id: 'sub-dev-algo-lab',
        name: 'Algorithms Lab',
        code: 'CST-353',
        professor: 'Dr. Amit Sharma',
        classroom: 'Lab 3',
        semester: 5,
        type: 'practical',
        credits: 2,
        target: 75,
        attended: 12,
        total: 14,
        attendance_percentage: 85.71,
        status_message: 'On Track',
        categories: ['Practical'],
    },
];

export const getDevInitialDashboardData = (): DashboardData => {
    const subjects = getInitialDevSubjects();
    let totalAtt = 0;
    let totalClasses = 0;
    subjects.forEach((s) => {
        totalAtt += s.attended;
        totalClasses += s.total;
    });

    const overallPct = totalClasses > 0 ? (totalAtt / totalClasses) * 100 : 0;
    const safeBunks = Math.max(0, Math.floor((totalAtt - 0.75 * totalClasses) / 0.75));

    return {
        user: DEV_TEST_USER,
        subjects,
        summary: {
            total_classes: totalClasses,
            total_attended: totalAtt,
            overall_percentage: Math.round(overallPct * 10) / 10,
            safe_bunks_remaining: safeBunks,
        },
        recent_activity: [
            {
                id: 'log-1',
                subject_id: 'sub-dev-algo',
                subject_name: 'Design & Analysis of Algorithms',
                status: 'present',
                date: new Date().toISOString().split('T')[0],
                type: 'Lecture',
            },
            {
                id: 'log-2',
                subject_id: 'sub-dev-os',
                subject_name: 'Operating Systems & Architecture',
                status: 'present',
                date: new Date().toISOString().split('T')[0],
                type: 'Lecture',
            },
            {
                id: 'log-3',
                subject_id: 'sub-dev-cn',
                subject_name: 'Computer Networks & Security',
                status: 'absent',
                date: new Date(Date.now() - 86400000).toISOString().split('T')[0],
                type: 'Lecture',
            },
        ],
        attendance_logs: [],
        total_subjects: subjects.length,
    } as unknown as DashboardData;
};

// Generates dynamic timetable slots anchored relative to current clock time
export const getDevTodayTimetableSlots = (): TimetableSlot[] => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');

    // Slot 1: Started 20 mins ago, ends in 40 mins (Live period right now!)
    const start1 = new Date(now.getTime() - 20 * 60 * 1000);
    const end1 = new Date(now.getTime() + 40 * 60 * 1000);

    // Slot 2: Starts 50 mins from now, ends in 110 mins
    const start2 = new Date(now.getTime() + 50 * 60 * 1000);
    const end2 = new Date(now.getTime() + 110 * 60 * 1000);

    // Slot 3: Starts 120 mins from now, ends in 180 mins
    const start3 = new Date(now.getTime() + 120 * 60 * 1000);
    const end3 = new Date(now.getTime() + 180 * 60 * 1000);

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const currentDay = dayNames[now.getDay()];

    return [
        {
            id: 'slot-1',
            day: currentDay,
            start_time: `${pad(start1.getHours())}:${pad(start1.getMinutes())}`,
            end_time: `${pad(end1.getHours())}:${pad(end1.getMinutes())}`,
            subject_name: 'Design & Analysis of Algorithms',
            subject_id: 'sub-dev-algo',
            classroom: 'Room 402',
            type: 'class',
        },
        {
            id: 'slot-2',
            day: currentDay,
            start_time: `${pad(start2.getHours())}:${pad(start2.getMinutes())}`,
            end_time: `${pad(end2.getHours())}:${pad(end2.getMinutes())}`,
            subject_name: 'Operating Systems & Architecture',
            subject_id: 'sub-dev-os',
            classroom: 'Room 305',
            type: 'class',
        },
        {
            id: 'slot-3',
            day: currentDay,
            start_time: `${pad(start3.getHours())}:${pad(start3.getMinutes())}`,
            end_time: `${pad(end3.getHours())}:${pad(end3.getMinutes())}`,
            subject_name: 'Machine Learning Foundations',
            subject_id: 'sub-dev-ml',
            classroom: 'Lab 1 / 501',
            type: 'class',
        },
    ];
};

export const getDevInitialNotes = (): Note[] => [
    {
        id: 'note-dev-1',
        title: 'Algorithms End-Term Syllabus Checklist',
        content: 'Focus areas for end-term examination and viva.',
        is_todo: true,
        todos: [
            { id: 'todo-1', text: 'Dynamic Programming (Knapsack, LCS, Matrix Chain)', completed: true },
            { id: 'todo-2', text: 'Greedy Algorithms (Huffman Coding, MST Kruskal/Prim)', completed: true },
            { id: 'todo-3', text: 'Graph Algorithms (Dijkstra, Bellman-Ford, Floyd-Warshall)', completed: false },
            { id: 'todo-4', text: 'NP-Completeness proof reductions', completed: false },
            { id: 'todo-5', text: 'String Matching (KMP & Rabin-Karp)', completed: false },
        ],
        is_pinned: true,
        is_archived: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        color: '#10b981',
        category: 'Exams',
    },
    {
        id: 'note-dev-2',
        title: 'OS - Process Synchronization & Deadlock',
        content: '<p>Key points for viva:</p><ul><li><strong>Coffman Conditions:</strong> Mutual Exclusion, Hold &amp; Wait, No Preemption, Circular Wait.</li><li><strong>Banker\'s Algorithm:</strong> Safe state vs Unsafe state calculation.</li><li><strong>Peterson\'s Solution:</strong> Software-based two-process critical section solution.</li></ul>',
        is_todo: false,
        todos: [],
        is_pinned: true,
        is_archived: false,
        created_at: new Date(Date.now() - 86400000).toISOString(),
        updated_at: new Date().toISOString(),
        color: '#3b82f6',
        category: 'Academics',
    },
    {
        id: 'note-dev-3',
        title: 'CN Lab - Wireshark & Socket Commands',
        content: 'tcpdump -i eth0 -nn -s0 -v\nnetstat -tuln\nwireshark capture filters: ip.addr == 192.168.1.1 && tcp.port == 80',
        is_todo: false,
        todos: [],
        is_pinned: false,
        is_archived: false,
        created_at: new Date(Date.now() - 172800000).toISOString(),
        updated_at: new Date().toISOString(),
        color: '#8b5cf6',
        category: 'Lab',
    },
];

export const getDevInitialResults = () => ({
    enrollment_number: '04216403223',
    student_name: 'Alex Mercer',
    programme: 'B.Tech (CSE)',
    institution: 'USICT, GGSIPU Main Campus',
    cgpa: '8.98',
    overall_cgpa: 8.98,
    academicStrength: 90,
    totalSubjects: 21,
    last_updated: new Date().toISOString(),
    student_info: {
        name: 'Alex Mercer',
        roll_no: '04216403223',
        programme: 'B.Tech (Computer Science & Engineering)',
        institution: 'USICT, GGSIPU Main Campus',
        batch: '2023-27',
        admission_year: '2023',
    },
    gradeDistribution: {
        'O': 10,
        'A+': 6,
        'A': 3,
        'B+': 2,
    },
    semesters: [
        {
            semester: '1',
            semester_label: 'Semester 1',
            sgpa: '8.85',
            credits: 24,
            subjects: [
                { code: 'BS-101', name: 'Applied Mathematics - I', credits: '4', grade: 'A+', internal: '23', external: '68', total: '91', maxMarks: 100 },
                { code: 'BS-103', name: 'Applied Physics - I', credits: '3', grade: 'A', internal: '21', external: '61', total: '82', maxMarks: 100 },
                { code: 'ES-105', name: 'Programming in C', credits: '4', grade: 'O', internal: '25', external: '71', total: '96', maxMarks: 100 },
                { code: 'ES-107', name: 'Electrical Science', credits: '3', grade: 'B+', internal: '19', external: '56', total: '75', maxMarks: 100 },
                { code: 'HS-109', name: 'Communication Skills', credits: '2', grade: 'A+', internal: '24', external: '66', total: '90', maxMarks: 100 },
                { code: 'ES-151', name: 'C Programming Lab', credits: '2', grade: 'O', internal: '38', external: '58', total: '96', maxMarks: 100 },
            ],
        },
        {
            semester: '2',
            semester_label: 'Semester 2',
            sgpa: '9.12',
            credits: 25,
            subjects: [
                { code: 'BS-102', name: 'Applied Mathematics - II', credits: '4', grade: 'O', internal: '25', external: '72', total: '97', maxMarks: 100 },
                { code: 'BS-104', name: 'Applied Chemistry', credits: '3', grade: 'A', internal: '22', external: '60', total: '82', maxMarks: 100 },
                { code: 'ES-106', name: 'Data Structures & Algorithms', credits: '4', grade: 'O', internal: '25', external: '70', total: '95', maxMarks: 100 },
                { code: 'ES-108', name: 'Electronic Devices & Circuits', credits: '3', grade: 'A+', internal: '23', external: '65', total: '88', maxMarks: 100 },
                { code: 'ES-152', name: 'Data Structures Lab', credits: '2', grade: 'O', internal: '39', external: '59', total: '98', maxMarks: 100 },
            ],
        },
        {
            semester: '3',
            semester_label: 'Semester 3',
            sgpa: '8.65',
            credits: 24,
            subjects: [
                { code: 'CST-201', name: 'Discrete Mathematics', credits: '4', grade: 'A', internal: '22', external: '62', total: '84', maxMarks: 100 },
                { code: 'CST-203', name: 'Computer Architecture & Org', credits: '4', grade: 'B+', internal: '20', external: '58', total: '78', maxMarks: 100 },
                { code: 'CST-205', name: 'Object Oriented Programming (Java)', credits: '4', grade: 'O', internal: '25', external: '72', total: '97', maxMarks: 100 },
                { code: 'CST-207', name: 'Database Management Systems', credits: '4', grade: 'A+', internal: '24', external: '67', total: '91', maxMarks: 100 },
                { code: 'CST-251', name: 'Java Programming Lab', credits: '2', grade: 'O', internal: '39', external: '58', total: '97', maxMarks: 100 },
            ],
        },
        {
            semester: '4',
            semester_label: 'Semester 4',
            sgpa: '9.30',
            credits: 26,
            subjects: [
                { code: 'CST-202', name: 'Theory of Computation', credits: '4', grade: 'O', internal: '25', external: '73', total: '98', maxMarks: 100 },
                { code: 'CST-204', name: 'Microprocessors & Microcontrollers', credits: '4', grade: 'A+', internal: '23', external: '66', total: '89', maxMarks: 100 },
                { code: 'CST-206', name: 'Web Technologies', credits: '4', grade: 'O', internal: '25', external: '72', total: '97', maxMarks: 100 },
                { code: 'CST-208', name: 'Software Engineering Fundamentals', credits: '4', grade: 'A+', internal: '24', external: '68', total: '92', maxMarks: 100 },
                { code: 'CST-252', name: 'Web Technologies Lab', credits: '2', grade: 'O', internal: '40', external: '59', total: '99', maxMarks: 100 },
            ],
        },
    ],
});

export const loadDevDashboardData = (): DashboardData => {
    try {
        const stored = localStorage.getItem(DEV_TEST_DATA_KEY);
        if (stored) return JSON.parse(stored);
    } catch {
        // fallback
    }
    const initial = getDevInitialDashboardData();
    localStorage.setItem(DEV_TEST_DATA_KEY, JSON.stringify(initial));
    return initial;
};

export const saveDevDashboardData = (data: DashboardData) => {
    localStorage.setItem(DEV_TEST_DATA_KEY, JSON.stringify(data));
};

export const devMarkAttendance = (subjectId: string, status: 'present' | 'absent') => {
    const data = loadDevDashboardData();
    const updatedSubjects = data.subjects.map((sub: any) => {
        if (sub._id === subjectId || sub.id === subjectId) {
            const newAttended = status === 'present' ? (sub.attended || 0) + 1 : (sub.attended || 0);
            const newTotal = (sub.total || 0) + 1;
            const newPct = (newAttended / newTotal) * 100;
            return {
                ...sub,
                attended: newAttended,
                total: newTotal,
                attendance_percentage: Math.round(newPct * 100) / 100,
                status_message: newPct < 75 ? 'Low Attendance' : 'On Track',
            };
        }
        return sub;
    });

    let totalAtt = 0;
    let totalClasses = 0;
    updatedSubjects.forEach((s: any) => {
        totalAtt += s.attended || 0;
        totalClasses += s.total || 0;
    });

    const overallPct = totalClasses > 0 ? (totalAtt / totalClasses) * 100 : 0;
    const safeBunks = Math.max(0, Math.floor((totalAtt - 0.75 * totalClasses) / 0.75));

    data.subjects = updatedSubjects;
    data.summary = {
        total_classes: totalClasses,
        total_attended: totalAtt,
        overall_percentage: Math.round(overallPct * 10) / 10,
        safe_bunks_remaining: safeBunks,
    };

    saveDevDashboardData(data);
    return data;
};

export const enableDevTestMode = () => {
    localStorage.setItem(DEV_TEST_MODE_KEY, 'true');
    localStorage.setItem('user', JSON.stringify(DEV_TEST_USER));
    loadDevDashboardData();
};

export const disableDevTestMode = () => {
    localStorage.removeItem(DEV_TEST_MODE_KEY);
    localStorage.removeItem('user');
    localStorage.removeItem(DEV_TEST_DATA_KEY);
    localStorage.removeItem(DEV_TEST_NOTES_KEY);
    localStorage.removeItem(DEV_TEST_RESULTS_KEY);
};

export const resetDevTestData = () => {
    localStorage.removeItem(DEV_TEST_DATA_KEY);
    localStorage.removeItem(DEV_TEST_NOTES_KEY);
    localStorage.removeItem(DEV_TEST_RESULTS_KEY);
    return loadDevDashboardData();
};

// ─── Extended Dev Test Mode Generators (Timetable Grid, Courses, Calendar, Logs) ───

export const getDevTimetablePeriods = () => [
    { id: 'p1', number: 1, name: 'Period 1', startTime: '09:00', endTime: '10:00', type: 'class' as const },
    { id: 'p2', number: 2, name: 'Period 2', startTime: '10:00', endTime: '11:00', type: 'class' as const },
    { id: 'p3', number: 3, name: 'Period 3', startTime: '11:15', endTime: '12:15', type: 'class' as const },
    { id: 'p4', number: 4, name: 'Period 4', startTime: '12:15', endTime: '13:15', type: 'class' as const },
    { id: 'p5', number: 5, name: 'Period 5', startTime: '14:00', endTime: '15:00', type: 'class' as const },
];

export const getDevWeeklySchedule = () => {
    const subs = getInitialDevSubjects();
    const mk = (id: string, day: string, period: number, start: string, end: string, subIdx: number): TimetableSlot => {
        const s = subs[subIdx % subs.length];
        return {
            id: `dev-slot-${day}-${period}-${id}`,
            day,
            start_time: start,
            end_time: end,
            startTime: start,
            endTime: end,
            subject_id: s._id,
            subjectId: s._id,
            subject_name: s.name,
            subjectName: s.name,
            label: s.name,
            classroom: s.classroom,
            type: 'class' as const,
        };
    };

    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const todayName = days[new Date().getDay()];
    const schedule: Record<string, TimetableSlot[]> = {
        Monday: [
            mk('m1', 'Monday', 1, '09:00', '10:00', 0),
            mk('m2', 'Monday', 2, '10:00', '11:00', 1),
            mk('m3', 'Monday', 3, '11:15', '12:15', 2),
            mk('m4', 'Monday', 5, '14:00', '15:00', 5),
        ],
        Tuesday: [
            mk('t1', 'Tuesday', 1, '09:00', '10:00', 3),
            mk('t2', 'Tuesday', 2, '10:00', '11:00', 4),
            mk('t3', 'Tuesday', 3, '11:15', '12:15', 0),
            mk('t4', 'Tuesday', 4, '12:15', '13:15', 6),
        ],
        Wednesday: [
            mk('w1', 'Wednesday', 1, '09:00', '10:00', 1),
            mk('w2', 'Wednesday', 2, '10:00', '11:00', 2),
            mk('w3', 'Wednesday', 3, '11:15', '12:15', 3),
            mk('w4', 'Wednesday', 5, '14:00', '15:00', 5),
        ],
        Thursday: [
            mk('th1', 'Thursday', 1, '09:00', '10:00', 0),
            mk('th2', 'Thursday', 2, '10:00', '11:00', 4),
            mk('th3', 'Thursday', 3, '11:15', '12:15', 1),
            mk('th4', 'Thursday', 4, '12:15', '13:15', 6),
        ],
        Friday: [
            mk('f1', 'Friday', 1, '09:00', '10:00', 2),
            mk('f2', 'Friday', 2, '10:00', '11:00', 3),
            mk('f3', 'Friday', 3, '11:15', '12:15', 4),
        ],
        Saturday: [],
        Sunday: [],
    };
    // Ensure today always has live radar slots
    schedule[todayName] = getDevTodayTimetableSlots();
    return schedule;
};

export const DEV_TEST_COURSES_KEY = 'semester_dev_test_manual_courses';

export const getDevManualCourses = () => {
    try {
        const stored = localStorage.getItem(DEV_TEST_COURSES_KEY);
        if (stored) return JSON.parse(stored);
    } catch {
        // ignore
    }
    const initial = [
        {
            _id: 'dev-mc-1',
            id: 'dev-mc-1',
            title: 'MIT 6.006 — Introduction to Algorithms',
            instructor: 'Prof. Erik Demaine',
            platform: 'youtube',
            progress: 72,
            url: 'https://ocw.mit.edu',
            created_at: new Date(Date.now() - 18 * 86400000).toISOString(),
        },
        {
            _id: 'dev-mc-2',
            id: 'dev-mc-2',
            title: 'Deep Learning Specialization',
            instructor: 'Andrew Ng',
            platform: 'coursera',
            progress: 45,
            url: 'https://coursera.org',
            created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
        },
        {
            _id: 'dev-mc-3',
            id: 'dev-mc-3',
            title: 'Rust Systems & Native Bridges',
            instructor: 'Jon Gjengset',
            platform: 'other',
            progress: 100,
            url: 'https://doc.rust-lang.org/book/',
            created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
        },
    ];
    try {
        localStorage.setItem(DEV_TEST_COURSES_KEY, JSON.stringify(initial));
    } catch {
        // ignore
    }
    return initial;
};

export const saveDevManualCourses = (courses: any[]) => {
    try {
        localStorage.setItem(DEV_TEST_COURSES_KEY, JSON.stringify(courses));
    } catch {
        // ignore
    }
};

export const getDevCalendarRecords = (year: number, month: number) => {
    const subs = getInitialDevSubjects();
    const records: any[] = [];
    const daysInMonth = new Date(year, month, 0).getDate();
    const today = new Date();

    for (let day = 1; day <= daysInMonth; day++) {
        const d = new Date(year, month - 1, day);
        if (d > today) break;
        const dow = d.getDay();
        if (dow === 0 || dow === 6) continue;
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        // 3 classes per weekday
        for (let i = 0; i < 3; i++) {
            const sub = subs[(day + i) % subs.length];
            const isAbsent = (day + i) % 7 === 0;
            records.push({
                _id: `dev-cal-${dateStr}-${i}`,
                id: `dev-cal-${dateStr}-${i}`,
                subject_id: sub._id,
                subject_name: sub.name,
                subject_code: sub.code,
                date: dateStr,
                status: isAbsent ? 'absent' : 'present',
                type: sub.type === 'practical' ? 'Lab' : 'Lecture',
                semester: 5,
            });
        }
    }
    return records;
};

export const getDevSystemLogs = () => [
    {
        id: 'dev-log-1',
        action: 'ATTENDANCE_MARKED',
        description: 'Marked Present for Design & Analysis of Algorithms (CST-301)',
        details: 'Marked Present for Design & Analysis of Algorithms (CST-301)',
        timestamp: new Date(Date.now() - 15 * 60000).toISOString(),
        ip_address: '127.0.0.1',
    },
    {
        id: 'dev-log-2',
        action: 'TIMETABLE_SYNCED',
        description: 'Loaded Semester 5 live schedule (5 periods)',
        details: 'Loaded Semester 5 live schedule (5 periods)',
        timestamp: new Date(Date.now() - 3 * 3600000).toISOString(),
        ip_address: '127.0.0.1',
    },
    {
        id: 'dev-log-3',
        action: 'RESULTS_ARCHIVED',
        description: 'Synced IPU Semester 4 scorecard (SGPA 9.30)',
        details: 'Synced IPU Semester 4 scorecard (SGPA 9.30)',
        timestamp: new Date(Date.now() - 26 * 3600000).toISOString(),
        ip_address: '127.0.0.1',
    },
];

export const loadDevNotes = (): Note[] => {
    try {
        const stored = localStorage.getItem(DEV_TEST_NOTES_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) return parsed;
        }
    } catch {
        // ignore
    }
    const initial = getDevInitialNotes();
    try {
        localStorage.setItem(DEV_TEST_NOTES_KEY, JSON.stringify(initial));
    } catch {
        // ignore
    }
    return initial;
};

export const saveDevNotes = (notes: Note[]) => {
    try {
        localStorage.setItem(DEV_TEST_NOTES_KEY, JSON.stringify(notes));
    } catch {
        // ignore
    }
};
