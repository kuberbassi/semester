import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { isTauriDesktop } from '@/utils/platform';
import { desktopDb } from '@/services/desktopDb';

type RGB = [number, number, number];

// Minimal executive academic palette (crisp on screen & monochrome printers)
const INK: RGB = [15, 23, 42];        // slate-900
const SLATE: RGB = [71, 85, 105];     // slate-600
const MUTED: RGB = [100, 116, 139];   // slate-500
const INDIGO: RGB = [79, 70, 229];    // indigo-600
const SOFT_BG: RGB = [248, 250, 252]; // slate-50
const HAIRLINE: RGB = [226, 232, 240];// slate-200
const EMERALD: RGB = [5, 150, 105];
const ROSE: RGB = [225, 29, 72];

const GRADE_POINTS: Record<string, number> = {
    'O': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C': 5, 'C+': 5, 'P': 4, 'F': 0, 'Ab': 0, 'I': 0,
};

function parseNumeric(val: unknown): number | null {
    if (val === null || val === undefined || val === '' || val === '-') return null;
    const num = Number(val);
    return Number.isNaN(num) ? null : num;
}

function isLabSubject(name: string, credits: number) {
    const upper = String(name || '').toUpperCase();
    return credits <= 1 || upper.includes('LAB') || upper.includes('PRACTICAL') || upper.includes('WORKSHOP') || upper.includes('VIVA');
}

function getSubjectMarks(subject: any) {
    const name = subject.name || subject.subject_name || '';
    const credits = parseNumeric(subject.credits) ?? 3;
    const isLab = isLabSubject(name, credits);

    const internalVal = subject.internal ?? (isLab ? (subject.internal_practical ?? subject.internal_theory) : (subject.internal_theory ?? subject.internal_practical));
    const externalVal = subject.external ?? (isLab ? (subject.external_practical ?? subject.external_theory) : (subject.external_theory ?? subject.external_practical));

    const internal = parseNumeric(internalVal);
    const external = parseNumeric(externalVal);
    const total = parseNumeric(subject.total_marks ?? subject.marks);
    const maxMarks = parseNumeric(subject.max_marks) ?? 100;

    return {
        internal: internal !== null ? String(internal) : '—',
        external: external !== null ? String(external) : '—',
        total: total !== null ? total : (internal ?? 0) + (external ?? 0),
        maxMarks,
    };
}

function normalizeProfileInfo(info: any) {
    return {
        name: info?.name || info?.stname || '',
        roll_no: info?.roll_no || info?.nrollno || info?.enrollment_number || '',
        batch: info?.batch || info?.byoa || '',
        admission_year: info?.admission_year || info?.yoa || '',
        institution: info?.institution || info?.iname || '',
        programme: info?.programme || info?.prgname || '',
    };
}

function formatBatch(raw: string): string {
    const s = String(raw || '').trim();
    if (!s) return '—';
    if (/^\d{4}$/.test(s)) {
        const y = Number(s);
        return `${y}-${String((y + 4) % 100).padStart(2, '0')}`;
    }
    return s;
}

function formatDeclaredDate(value: unknown): string | null {
    if (!value) return null;
    const str = String(value).trim();
    const match = str.match(/^(\d{2}),(\d{4})$/);
    if (match) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const m = parseInt(match[1], 10);
        if (m >= 1 && m <= 12) return `${months[m - 1]} ${match[2]}`;
    }
    const parsed = new Date(str);
    if (Number.isNaN(parsed.getTime())) return str;
    return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getSemestersToRender(results: any, selectedSem: string) {
    const allSems = results?.semesters || [];
    return selectedSem === 'overall'
        ? allSems
        : allSems.filter((sem: any) => String(sem.semester_num ?? sem.semester) === selectedSem);
}

export async function downloadResultsPdf(
    results: any,
    selectedSem: string
): Promise<{ filename: string; savedToDownloads: boolean }> {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 15;
    const contentW = pageW - margin * 2;

    const info = normalizeProfileInfo(results?.student_info || {});
    const dateStr = new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
    const semesters = getSemestersToRender(results, selectedSem);

    // Compute exact credit-weighted headline metrics across rendered semesters
    let totalCredits = 0;
    let totalWeightedPts = 0;
    let totalMarks = 0;
    let totalMax = 0;
    let passedCount = 0;
    let declaredCount = 0;

    for (const sem of semesters) {
        for (const sub of sem.subjects || []) {
            if (sub.is_pending || sub.grade === '-') continue;
            declaredCount += 1;
            const cr = Math.max(0, Number(sub.credits ?? 0) || 0);
            const gp = sub.grade_point !== null && sub.grade_point !== undefined
                ? Number(sub.grade_point)
                : (GRADE_POINTS[String(sub.grade || '').toUpperCase()] ?? 0);
            const { total, maxMarks } = getSubjectMarks(sub);
            totalMarks += total;
            totalMax += maxMarks;
            if (gp >= 4) passedCount += 1;
            if (cr > 0) {
                totalCredits += cr;
                totalWeightedPts += cr * gp;
            }
        }
    }

    const headlineGpa = totalCredits > 0
        ? totalWeightedPts / totalCredits
        : Number(results?.cgpa || 0);
    const aggPct = totalMax > 0 ? (totalMarks / totalMax) * 100 : 0;

    // ── Clean Executive Header (White paper + thin indigo rule) ──────────────
    doc.setFillColor(...INDIGO);
    doc.rect(0, 0, pageW, 2.2, 'F');

    let y = 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...INDIGO);
    doc.text('GURU GOBIND SINGH INDRAPRASTHA UNIVERSITY', margin, y);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text(`Issued ${dateStr}`, pageW - margin, y, { align: 'right' });

    y += 6.5;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(...INK);
    doc.text(
        selectedSem === 'overall' ? 'Academic Result Transcript' : `Semester ${selectedSem} Result Statement`,
        margin,
        y
    );

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...SLATE);
    doc.text('examweb.ggsipu.ac.in · Ordinance 11 (10-Point CBCS)', margin, y + 5);

    y += 9;
    doc.setDrawColor(...HAIRLINE);
    doc.setLineWidth(0.35);
    doc.line(margin, y, pageW - margin, y);
    y += 6;

    // ── Student Profile & Headline GPA Strip ─────────────────────────────────
    const leftW = contentW - 44;
    const rightX = margin + leftW + 4;

    doc.setFillColor(...SOFT_BG);
    doc.setDrawColor(...HAIRLINE);
    doc.roundedRect(margin, y, leftW, 28, 2, 2, 'FD');

    const details: Array<[string, string]> = [
        ['Student', String(info.name || '—').slice(0, 44)],
        ['Enrollment', String(results?.enrollment_number || info.roll_no || '—')],
        ['Programme', String(info.programme || '—').slice(0, 46)],
        ['Institution', `${String(info.institution || '—').slice(0, 34)} · Batch ${formatBatch(info.batch)}`],
    ];
    let dy = y + 6.5;
    for (const [lbl, val] of details) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor(...MUTED);
        doc.text(lbl.toUpperCase(), margin + 4, dy);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.2);
        doc.setTextColor(...INK);
        doc.text(val, margin + 27, dy);
        dy += 5.8;
    }

    // Headline GPA card
    doc.setFillColor(...SOFT_BG);
    doc.setDrawColor(...INDIGO);
    doc.setLineWidth(0.4);
    doc.roundedRect(rightX, y, 40, 28, 2, 2, 'FD');
    doc.setLineWidth(0.35);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(...INDIGO);
    doc.text(selectedSem === 'overall' ? 'OVERALL CGPA' : `SEM ${selectedSem} SGPA`, rightX + 20, y + 6.5, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(19);
    doc.setTextColor(...INK);
    doc.text(headlineGpa > 0 ? headlineGpa.toFixed(2) : '—', rightX + 20, y + 16.5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...SLATE);
    doc.text(`${aggPct.toFixed(1)}% · ${totalCredits} Cr`, rightX + 20, y + 23.2, { align: 'center' });

    y += 33;

    // Compact KPI summary ribbon
    const kpiItems = [
        { k: 'SCORED MARKS', v: `${Math.round(totalMarks)} / ${Math.round(totalMax)}` },
        { k: 'AGGREGATE %', v: `${aggPct.toFixed(1)}%` },
        { k: 'IPU EQ. (GPA×10)', v: `${(headlineGpa * 10).toFixed(1)}%` },
        { k: 'EARNED CREDITS', v: String(totalCredits) },
        { k: 'PASSED PAPERS', v: `${passedCount} / ${declaredCount}` },
    ];
    const kpiW = contentW / kpiItems.length;
    doc.setDrawColor(...HAIRLINE);
    doc.line(margin, y, pageW - margin, y);
    kpiItems.forEach((item, idx) => {
        const kx = margin + idx * kpiW;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(6.5);
        doc.setTextColor(...MUTED);
        doc.text(item.k, kx + 2, y + 4.5);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        doc.setTextColor(...INK);
        doc.text(item.v, kx + 2, y + 9.5);
    });
    y += 12.5;
    doc.line(margin, y, pageW - margin, y);
    y += 7;

    // ── Semester Tables ──────────────────────────────────────────────────────
    for (const sem of semesters) {
        if (y > pageH - 58) {
            doc.addPage();
            y = 16;
        }

        const semNum = sem.semester_num ?? sem.semester;
        const semLabel = String(sem.semester_label || `Semester ${semNum}`);
        const subjects = sem.subjects || [];
        const sgpaVal = sem.sgpa ? parseFloat(sem.sgpa) : 0;
        const semCredits = subjects.reduce((acc: number, s: any) => acc + (Number(s.credits) || 0), 0);
        const semMarks = subjects.reduce((acc: number, s: any) => acc + (s.is_pending ? 0 : getSubjectMarks(s).total), 0);
        const semMax = subjects.reduce((acc: number, s: any) => acc + (s.is_pending ? 0 : getSubjectMarks(s).maxMarks), 0);
        const semPts = subjects.reduce((acc: number, s: any) => {
            if (s.is_pending) return acc;
            const cr = Number(s.credits) || 0;
            const gp = s.grade_point ?? (GRADE_POINTS[String(s.grade || '').toUpperCase()] ?? 0);
            return acc + cr * Number(gp);
        }, 0);

        const examSession = subjects.find((s: any) => s?.exam_session)?.exam_session;
        const declared = formatDeclaredDate(subjects.find((s: any) => s?.declared_date)?.declared_date);
        const subMeta = [examSession ? `Session: ${examSession}` : null, declared ? `Declared: ${declared}` : null]
            .filter(Boolean)
            .join('  ·  ');

        // Clean section bar (no dark ink block)
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10.5);
        doc.setTextColor(...INK);
        doc.text(semLabel, margin, y);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...INDIGO);
        doc.text(
            `SGPA ${sgpaVal.toFixed(2)}  ·  ${semCredits} Cr  ·  ${Math.round(semMarks)}/${Math.round(semMax)}`,
            pageW - margin,
            y,
            { align: 'right' }
        );

        if (subMeta) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...MUTED);
            doc.text(subMeta, margin, y + 4);
            y += 6.5;
        } else {
            y += 3;
        }

        const tableBody = subjects.map((sub: any) => {
            const { internal, external, total, maxMarks } = getSubjectMarks(sub);
            const pending = sub.is_pending || sub.grade === '-';
            const cr = Number(sub.credits ?? 0);
            const gp = pending ? '—' : String(sub.grade_point ?? (GRADE_POINTS[String(sub.grade || '').toUpperCase()] ?? 0));
            return [
                sub.code || '—',
                sub.name || '—',
                String(cr),
                pending ? '—' : internal,
                pending ? '—' : external,
                pending ? 'Pending' : `${total}/${maxMarks}`,
                pending ? '—' : (sub.grade || '—'),
                gp,
            ];
        });

        tableBody.push([
            '',
            `${semLabel} Total  (Credit Points: ${semPts})`,
            String(semCredits),
            '',
            '',
            `${Math.round(semMarks)}/${Math.round(semMax)}`,
            `SGPA`,
            sgpaVal.toFixed(2),
        ]);

        autoTable(doc, {
            startY: y,
            margin: { left: margin, right: margin },
            head: [['Code', 'Subject Name', 'Cr', 'Int', 'Ext', 'Total', 'Grade', 'GP']],
            body: tableBody,
            theme: 'plain',
            styles: {
                font: 'helvetica',
                fontSize: 7.8,
                textColor: INK,
                cellPadding: { top: 2.3, bottom: 2.3, left: 2.2, right: 2.2 },
                lineColor: HAIRLINE,
                lineWidth: { bottom: 0.25 },
            },
            headStyles: {
                fillColor: SOFT_BG,
                textColor: SLATE,
                fontSize: 7.2,
                fontStyle: 'bold',
                halign: 'center' as const,
                lineColor: HAIRLINE,
                lineWidth: { top: 0.35, bottom: 0.45 },
            },
            columnStyles: {
                0: { halign: 'left' as const, cellWidth: 20, font: 'courier', fontSize: 7.4, textColor: SLATE },
                1: { halign: 'left' as const, cellWidth: 'auto' as const },
                2: { halign: 'center' as const, cellWidth: 10 },
                3: { halign: 'center' as const, cellWidth: 12 },
                4: { halign: 'center' as const, cellWidth: 12 },
                5: { halign: 'center' as const, cellWidth: 19, fontStyle: 'bold' as const },
                6: { halign: 'center' as const, cellWidth: 14, fontStyle: 'bold' as const },
                7: { halign: 'center' as const, cellWidth: 12 },
            },
            didParseCell: (data: any) => {
                const isSummaryRow = data.section === 'body' && data.row.index === tableBody.length - 1;
                if (isSummaryRow) {
                    data.cell.styles.fillColor = SOFT_BG;
                    data.cell.styles.fontStyle = 'bold';
                    data.cell.styles.textColor = data.column.index >= 6 ? INDIGO : INK;
                    return;
                }
                if (data.section === 'body' && data.column.index === 6) {
                    const g = String(data.cell.raw);
                    if (g === 'F') data.cell.styles.textColor = ROSE;
                    else if (g === 'O' || g === 'A+') data.cell.styles.textColor = EMERALD;
                }
            },
        });

        y = (doc as any).lastAutoTable.finalY + 9;
    }

    // ── Overall Formula Note ─────────────────────────────────────────────────
    if (y > pageH - 28) {
        doc.addPage();
        y = 16;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(...MUTED);
    doc.text(
        'Grading Scale (GGSIPU Ordinance 11 CBCS): O=10 (90–100), A+=9 (75–89), A=8 (65–74), B+=7 (55–64), B=6 (50–54), C=5 (45–49), P=4 (40–44), F=0 (<40).',
        margin,
        y
    );
    doc.text(
        'Formula: SGPA = Sum(Ci × Gi) / Sum(Ci)  ·  CGPA = Sum(Ci × Gi across all semesters) / Sum(Ci).',
        margin,
        y + 4
    );

    // ── Minimal Clean Footer on Every Page ───────────────────────────────────
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setDrawColor(...HAIRLINE);
        doc.setLineWidth(0.25);
        doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(...MUTED);
        doc.text(`Semester Academic Workspace · Unofficial transcript from examweb.ggsipu.ac.in · ${dateStr}`, margin, pageH - 7.5);
        doc.text(`Page ${i} of ${totalPages}`, pageW - margin, pageH - 7.5, { align: 'right' });
    }

    const nameSlug = (info.name || 'Student').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase();
    const enroll = String(results?.enrollment_number || info.roll_no || '').replace(/[^A-Za-z0-9]/g, '');
    const semPart = selectedSem === 'overall' ? 'All_Semesters' : `Sem_${selectedSem}`;
    const filename = `${nameSlug}${enroll ? '_' + enroll : ''}_${semPart}_Transcript.pdf`;

    if (isTauriDesktop()) {
        const dataUri = doc.output('datauristring');
        const b64 = dataUri.split(',')[1] || '';
        const saved = await desktopDb.savePdfToDownloads(filename, b64);
        return { filename: saved.filename, savedToDownloads: true };
    }

    doc.save(filename);
    return { filename, savedToDownloads: false };
}
