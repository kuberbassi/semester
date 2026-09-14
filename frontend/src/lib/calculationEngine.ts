/**
 * Semester Calculation Engine
 * Centralized logic for attendance and grade calculations
 */

export class AttendanceCalculator {
    static calculatePercentage(attended: number, total: number): number {
        if (total === 0) return 0;
        return (attended / total) * 100;
    }

    static getRiskLevel(percentage: number): { riskLevel: 'Safe' | 'Warning' | 'At Risk' | 'Critical'; color: string } {
        if (percentage >= 85) return { riskLevel: 'Safe', color: '#10B981' };
        if (percentage >= 75) return { riskLevel: 'Warning', color: '#F59E0B' };
        if (percentage >= 65) return { riskLevel: 'At Risk', color: '#EF4444' };
        return { riskLevel: 'Critical', color: '#B91C1C' };
    }

    static calculateDaysNeeded(attended: number, total: number, target: number): number {
        if (total === 0) return 0;
        if (attended / total >= target / 100) return 0;

        // Edge case: target is 100% — division by zero guard
        if (target >= 100) {
            const missed = total - attended;
            // If any class was missed, 100% is impossible; return Infinity-safe sentinel
            return missed > 0 ? Infinity : 0;
        }

        // target = (attended + x) / (total + x)
        // x = (target * total - attended) / (1 - target)
        const targetDecimal = target / 100;
        return Math.ceil((targetDecimal * total - attended) / (1 - targetDecimal));
    }

    static getAttendanceSummary(subjects: Array<{ attended?: number; total?: number }>) {
        const totalAttended = subjects.reduce((acc, s) => acc + (s.attended || 0), 0);
        const totalPossible = subjects.reduce((acc, s) => acc + (s.total || 0), 0);
        const overallPercentage = this.calculatePercentage(totalAttended, totalPossible);
        const { riskLevel, color } = this.getRiskLevel(overallPercentage);

        return {
            overallPercentage: Math.round(overallPercentage * 100) / 100,
            totalAttended,
            totalPossible,
            riskLevel,
            color,
            status: riskLevel === 'Safe' ? 'On Track' : 'Needs Attention'
        };
    }
}

export class GradeCalculator {
    static calculateSGPA(courses: Array<{ credits?: number; grade?: string }>): number {
        let totalCredits = 0;
        let weightedPoints = 0;

        courses.forEach(course => {
            const credits = course.credits || 0;
            const gradePoint = this.gradeToPoint(course.grade || '');
            totalCredits += credits;
            weightedPoints += credits * gradePoint;
        });

        return totalCredits > 0 ? weightedPoints / totalCredits : 0;
    }

    static calculateCGPA(semesters: Array<Array<{ credits?: number; grade?: string }>>): number {
        let totalSGPA = 0;
        let count = 0;

        semesters.forEach(semester => {
            const sgpa = this.calculateSGPA(semester);
            if (sgpa > 0) {
                totalSGPA += sgpa;
                count++;
            }
        });

        return count > 0 ? totalSGPA / count : 0;
    }

    private static gradeToPoint(grade: string): number {
        const grades: { [key: string]: number } = {
            'O': 10, 'A+': 9, 'A': 8, 'B+': 7, 'B': 6, 'C+': 5, 'C': 4, 'P': 4, 'F': 0
        };
        return grades[grade] || 0;
    }
}
