import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

type RGB = [number, number, number];

const CHARCOAL: RGB = [24, 24, 27]; // zinc-900
const ACCENT: RGB = [9, 9, 11]; // zinc-950
const BG_LIGHT: RGB = [250, 250, 250]; // zinc-50
const BORDER: RGB = [228, 228, 231]; // zinc-200
const TEXT_MUTED: RGB = [113, 113, 122]; // zinc-500
const WHITE: RGB = [255, 255, 255];
const RED: RGB = [239, 68, 68]; // red-500
const GREEN: RGB = [16, 185, 129]; // emerald-500

function parseNumeric(val: unknown): number | null {
    if (val === null || val === undefined || val === '') return null;
    const num = Number(val);
    return Number.isNaN(num) ? null : num;
}

function isLabSubject(name: string, credits: number) {
    const upper = String(name || '').toUpperCase();
    return credits <= 1 || upper.includes('LAB') || upper.includes('PRACTICAL') || upper.includes('WORKSHOP') || upper.includes('SEMINAR') || upper.includes('VIVA');
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
    
    const calculatedTotal = (internal ?? 0) + (external ?? 0);
    return {
        internal: internal !== null ? String(internal) : '-',
        external: external !== null ? String(external) : '-',
        total: total !== null ? String(total) : String(calculatedTotal),
        maxMarks,
    };
}

function normalizeProfileInfo(info: any) {
    return {
        name: info?.name || info?.stname || '',
        roll_no: info?.roll_no || info?.nrollno || info?.enrollment_number || '',
        father: info?.father || '',
        mother: info?.mother || '',
        gender: info?.gender || '',
        email: info?.email || '',
        phone: info?.phone || info?.mobno || '',
        batch: info?.batch || info?.byoa || '',
        admission_year: info?.admission_year || info?.yoa || '',
        institution: info?.institution || info?.iname || '',
        programme: info?.programme || info?.prgname || '',
    };
}

function shortenProgramme(value: string): string {
    return value
        .replace(/BACHELOR OF TECHNOLOGY/i, 'B.Tech')
        .replace(/MASTER OF TECHNOLOGY/i, 'M.Tech')
        .replace(/BACHELOR OF/i, 'B.')
        .replace(/MASTER OF/i, 'M.')
        .slice(0, 46);
}

function shortenInst(value: string): string {
    return value.slice(0, 42);
}

function formatDeclaredDate(value: unknown): string | null {
    if (!value) return null;
    const parsed = new Date(String(value));
    if (Number.isNaN(parsed.getTime())) return String(value);
    return parsed.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getLatestDeclaredDate(subjects: any[]): string | null {
    let latest: Date | null = null;
    for (const subject of subjects) {
        if (!subject?.declared_date) continue;
        const parsed = new Date(String(subject.declared_date));
        if (Number.isNaN(parsed.getTime())) continue;
        if (!latest || parsed > latest) latest = parsed;
    }
    if (!latest) return null;
    return latest.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function getSemestersToRender(results: any, selectedSem: string) {
    const allSems = results?.semesters || [];
    return selectedSem === 'overall'
        ? allSems
        : allSems.filter((sem: any) => String(sem.semester_num ?? sem.semester) === selectedSem);
}

export function downloadResultsPdf(results: any, selectedSem: string) {
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentW = pageW - (margin * 2);

    const info = normalizeProfileInfo(results?.student_info || {});
    const dateStr = new Date().toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'long',
        year: 'numeric',
    });
    const semesters = getSemestersToRender(results, selectedSem);

    doc.setFillColor(...CHARCOAL);
    doc.rect(0, 0, pageW, 40, 'F');
    doc.setFillColor(...ACCENT);
    doc.rect(0, 36, pageW, 4, 'F');

    doc.setTextColor(...WHITE);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('GURU GOBIND SINGH INDRAPRASTHA UNIVERSITY', pageW / 2, 12, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text('Sector 16C, Dwarka, New Delhi | examweb.ggsipu.ac.in', pageW / 2, 19, { align: 'center' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(selectedSem === 'overall' ? 'ACADEMIC RESULT TRANSCRIPT' : 'SEMESTER RESULT REPORT', pageW / 2, 28, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(212, 212, 216); // zinc-300
    doc.text(`Generated: ${dateStr}`, pageW - margin, 35, { align: 'right' });

    let y = 48;

    doc.setFillColor(...BG_LIGHT);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(margin, y, contentW, 34, 2, 2, 'FD');

    doc.setTextColor(...CHARCOAL);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('STUDENT INFORMATION', margin + 4, y + 6);

    const c1 = margin + 4;
    const c1v = c1 + 28;
    const c2 = margin + 100;
    const c2v = c2 + 28;
    const lh = 6.2;

    const infoRows: [string, string, string, string][] = [
        ['Name', info.name || '---', 'Enrollment No.', results?.enrollment_number || info.roll_no || '---'],
        ['Programme', shortenProgramme(info.programme || '---'), 'Batch', info.batch ? `${info.batch} (Adm: ${info.admission_year || '---'})` : (info.admission_year || '---')],
        ['Institution', shortenInst(info.institution || '---'), 'CGPA', results?.cgpa ? Number(results.cgpa).toFixed(2) : '---'],
    ];

    let iy = y + 12;
    for (const [l1, v1, l2, v2] of infoRows) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.setTextColor(...TEXT_MUTED);
        doc.text(`${l1}:`, c1, iy);
        doc.text(`${l2}:`, c2, iy);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...ACCENT);
        doc.text(String(v1), c1v, iy);
        doc.text(String(v2), c2v, iy);
        iy += lh;
    }

    y += 39;

    for (const sem of semesters) {
        if (y > pageH - 70) {
            doc.addPage();
            y = 14;
        }

        const semNum = sem.semester_num ?? sem.semester;
        const semLabel = String(sem.semester_label || `Semester ${semNum}`).toUpperCase();
        const subjects = sem.subjects || [];
        const completedSubjects = subjects.filter((sub: any) => !sub.is_pending && sub.grade !== '-');
        const passedSubjects = completedSubjects.filter((sub: any) => String(sub.grade || '').toUpperCase() !== 'F');
        const distinctionCount = completedSubjects.filter((sub: any) => Number(sub.percentage || 0) >= 75).length;
        const semesterTotal = completedSubjects.reduce((sum: number, sub: any) => sum + Number(sub.total_marks ?? 0), 0);
        const semesterMax = completedSubjects.reduce((sum: number, sub: any) => sum + Number(sub.max_marks ?? 100), 0);
        const semesterPct = semesterMax > 0 ? ((semesterTotal / semesterMax) * 100).toFixed(1) : '0.0';
        const declaredDate = formatDeclaredDate(subjects.find((sub: any) => sub?.declared_date)?.declared_date);
        const examSession = subjects.find((sub: any) => sub?.exam_session)?.exam_session || null;
        const sgpaVal = sem.sgpa ? parseFloat(sem.sgpa) : 0;

        doc.setFillColor(...CHARCOAL);
        doc.rect(margin, y, contentW, 8, 'F');
        doc.setTextColor(...WHITE);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        doc.text(semLabel, margin + 4, y + 5.5);
        if (sgpaVal > 0) {
            doc.text(`SGPA: ${sgpaVal.toFixed(2)}`, pageW - margin - 4, y + 5.5, { align: 'right' });
        }
        y += 11;

        if (examSession || declaredDate) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(7);
            doc.setTextColor(...TEXT_MUTED);
            const meta = [examSession ? `Exam: ${examSession}` : null, declaredDate ? `Declared: ${declaredDate}` : null]
                .filter(Boolean)
                .join(' | ');
            doc.text(meta, margin, y + 2.5);
            y += 5;
        }

        doc.setFillColor(...BG_LIGHT);
        doc.setDrawColor(...BORDER);
        doc.roundedRect(margin, y, contentW, 12, 2, 2, 'FD');
        doc.setTextColor(...CHARCOAL);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        doc.text(`Subjects: ${subjects.length}`, margin + 4, y + 7);
        doc.text(`Passed: ${passedSubjects.length}/${completedSubjects.length || subjects.length}`, margin + 36, y + 7);
        doc.text(`Distinctions: ${distinctionCount}`, margin + 78, y + 7);
        doc.text(`Marks: ${semesterTotal}/${semesterMax || 0}`, margin + 116, y + 7);
        doc.text(`Percentage: ${semesterPct}%`, pageW - margin - 4, y + 7, { align: 'right' });
        y += 15;

        const tableBody = subjects.map((sub: any, idx: number) => {
            const { internal, external, total, maxMarks } = getSubjectMarks(sub);
            const isPending = sub.is_pending || sub.grade === '-' || (sub.total_marks === null && sub.marks === null && sub.internal === null && sub.external === null && sub.internal_theory === null && sub.external_theory === null && sub.internal_practical === null && sub.external_practical === null);
            return [
                idx + 1,
                sub.code || '---',
                sub.name || '---',
                isPending ? 'Pending' : internal,
                isPending ? 'Pending' : external,
                isPending ? 'Pending' : total,
                isPending ? '---' : maxMarks,
                sub.grade || '-',
                sub.credits || sub.status || '-',
            ];
        });

        autoTable(doc, {
            startY: y,
            margin: { left: margin, right: margin },
            head: [['#', 'Paper Code', 'Subject Name', 'Int', 'Ext', 'Total', 'Max', 'Grade', 'Status/Credits']],
            body: tableBody,
            theme: 'grid',
            headStyles: {
                fillColor: [39, 39, 42], // zinc-800
                textColor: [255, 255, 255],
                fontSize: 7.5,
                fontStyle: 'bold',
                halign: 'center' as const,
                cellPadding: 2.5,
            },
            bodyStyles: {
                fontSize: 7.5,
                textColor: [24, 24, 27],
                cellPadding: 2,
            },
            columnStyles: {
                0: { halign: 'center' as const, cellWidth: 7 },
                1: { halign: 'center' as const, cellWidth: 24 },
                2: { halign: 'left' as const, cellWidth: 68 },
                3: { halign: 'center' as const, cellWidth: 11 },
                4: { halign: 'center' as const, cellWidth: 11 },
                5: { halign: 'center' as const, cellWidth: 16 },
                6: { halign: 'center' as const, cellWidth: 10 },
                7: { halign: 'center' as const, cellWidth: 13 },
                8: { halign: 'center' as const, cellWidth: 22 },
            },
            alternateRowStyles: { fillColor: [...BG_LIGHT] },
            didParseCell: (data: any) => {
                if (data.section === 'body' && data.column.index === 7) {
                    const grade = String(data.cell.raw);
                    if (grade === 'F') data.cell.styles.textColor = RED;
                    else if (grade === 'O' || grade === 'A+') data.cell.styles.textColor = GREEN;
                    else if (grade === '-') data.cell.styles.textColor = TEXT_MUTED;
                }
            },
        });

        y = (doc as any).lastAutoTable.finalY + 6;
    }

    if (selectedSem === 'overall') {
        if (y > pageH - 45) {
            doc.addPage();
            y = 14;
        }

        const sgpaRows = (results?.semesters || [])
            .filter((sem: any) => sem.sgpa && parseFloat(sem.sgpa) > 0)
            .map((sem: any) => {
                const semNum = sem.semester_num ?? sem.semester;
                return [sem.semester_label || `Semester ${semNum}`, parseFloat(sem.sgpa).toFixed(2)];
            });

        if (sgpaRows.length) {
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(8);
            doc.setTextColor(...CHARCOAL);
            doc.text('SEMESTER-WISE PERFORMANCE SUMMARY', margin, y + 1);
            y += 5;

            autoTable(doc, {
                startY: y,
                margin: { left: margin, right: margin },
                head: [['Semester', 'SGPA']],
                body: sgpaRows,
                theme: 'striped',
                tableWidth: contentW / 2.5,
                headStyles: {
                    fillColor: CHARCOAL,
                    textColor: WHITE,
                    fontSize: 8,
                    halign: 'center' as const,
                },
                bodyStyles: { fontSize: 8, halign: 'center' as const },
            });

            y = (doc as any).lastAutoTable.finalY + 8;
        }

        const allSubjects = (results?.semesters || []).flatMap((sem: any) => sem.subjects || []);
        const completedSubjects = allSubjects.filter((sub: any) => !sub.is_pending && sub.grade !== '-');
        const distinctionCount = completedSubjects.filter((sub: any) => Number(sub.percentage || 0) >= 75).length;
        const latestDeclared = getLatestDeclaredDate(completedSubjects);

        doc.setFillColor(...BG_LIGHT);
        doc.setDrawColor(...BORDER);
        doc.roundedRect(margin, y, contentW, 24, 2, 2, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(...ACCENT);
        doc.text(`Cumulative GPA (CGPA): ${results?.cgpa ? Number(results.cgpa).toFixed(2) : '---'}`, pageW / 2, y + 8, { align: 'center' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(...CHARCOAL);
        doc.text(`Overall Percentage (declared subjects only): ${results?.overallPercentage ? Number(results.overallPercentage).toFixed(1) : '0.0'}%`, pageW / 2, y + 14, { align: 'center' });
        doc.text(`Declared Subjects: ${completedSubjects.length} | Distinctions: ${distinctionCount} | Latest Declared Date: ${latestDeclared || '---'}`, pageW / 2, y + 20, { align: 'center' });
    }

    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFillColor(244, 244, 245); // zinc-100
        doc.rect(0, pageH - 10, pageW, 10, 'F');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.5);
        doc.setTextColor(...TEXT_MUTED);
        doc.text(`Generated by Zenith Academic Suite | ${dateStr} | Data sourced from GGSIPU examination portal.`, pageW / 2, pageH - 4, { align: 'center' });
        doc.text(`Page ${i} / ${totalPages}`, pageW - margin, pageH - 4, { align: 'right' });
    }

    const nameSlug = (info.name || 'Student').replace(/\s+/g, '_').toUpperCase();
    const enroll = results?.enrollment_number || info.roll_no || '';
    const semPart = selectedSem === 'overall' ? 'All_Semesters' : `Sem_${selectedSem}`;
    doc.save(`${nameSlug}_${enroll}_${semPart}_Results_Zenith.pdf`);
}
