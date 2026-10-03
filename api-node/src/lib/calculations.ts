// ─── AttendanceCalculator ───────────────────────────────────────────────────

export interface BunkGuard {
  percentage: number
  can_bunk: boolean
  count: number
  status_message: string
}

export interface AttendanceSummary {
  overall_percentage: number
  total_attended: number
  total_classes: number
  subject_count: number
  risk_level: string
  color: string
  safe_bunks_remaining: number
}

export const AttendanceCalculator = {
  calculatePercentage(attended: number, total: number): number {
    if (total === 0) return 0
    return Math.round((attended / total) * 10000) / 100
  },

  calculateBunkGuard(attended: number, total: number, target = 75): BunkGuard {
    const pct = AttendanceCalculator.calculatePercentage(attended, total)

    // Edge case: target is 100% — cannot divide by (100 - target)
    if (target >= 100) {
      const missed = total - attended
      return {
        percentage: pct,
        can_bunk: missed === 0,
        count: missed === 0 ? 0 : missed,
        status_message:
          missed === 0
            ? 'Perfect attendance! Cannot bunk any class.'
            : `You have missed ${missed} class${missed > 1 ? 'es' : ''}. 100% attendance is no longer achievable.`,
      }
    }

    if (pct >= target) {
      const canBunk = Math.floor((attended * 100 - target * total) / target)
      return {
        percentage: pct,
        can_bunk: true,
        count: canBunk,
        status_message:
          canBunk > 0
            ? `You can bunk ${canBunk} more classes.`
            : "On the edge! Don't bunk.",
      }
    } else {
      const numerator = target * total - 100 * attended
      const denominator = 100 - target
      let mustAttend = Math.floor(numerator / denominator)
      if (numerator % denominator !== 0) mustAttend += 1
      return {
        percentage: pct,
        can_bunk: false,
        count: mustAttend,
        status_message: `Attend next ${mustAttend} classes to reach ${target}%.`,
      }
    }
  },

  getRiskLevel(percentage: number, target = 75, warning = 60): { level: string; color: string } {
    if (percentage >= target) return { level: 'Safe', color: 'green' }
    if (percentage >= warning) return { level: 'Warning', color: 'orange' }
    if (percentage >= 50) return { level: 'Critical', color: 'red' }
    return { level: 'Danger', color: 'darkred' }
  },

  getAttendanceSummary(
    subjects: Array<{ attended: number; total: number }>,
    target = 75,
    warning = 60
  ): AttendanceSummary {
    if (!subjects.length) {
      return {
        overall_percentage: 0,
        total_attended: 0,
        total_classes: 0,
        subject_count: 0,
        risk_level: 'No Data',
        color: 'gray',
        safe_bunks_remaining: 0,
      }
    }
    const totalAttended = subjects.reduce((s, x) => s + x.attended, 0)
    const totalClasses = subjects.reduce((s, x) => s + x.total, 0)
    const pct = AttendanceCalculator.calculatePercentage(
      totalAttended,
      totalClasses,
    )
    const { level, color } = AttendanceCalculator.getRiskLevel(pct, target, warning)
    const safeBunks = totalClasses > 0 ? Math.max(0, Math.floor((totalAttended * 100 - target * totalClasses) / target)) : 0
    return {
      overall_percentage: pct,
      total_attended: totalAttended,
      total_classes: totalClasses,
      subject_count: subjects.length,
      risk_level: level,
      color,
      safe_bunks_remaining: safeBunks,
    }
  },
}

/**
 * Approved medical leave is removed from both sides of the attendance ratio:
 * it is not a class attended, and it is not a conducted class for this metric.
 * Subject counters historically included medical logs in `attended`, so remove
 * those slots from the numerator as well.
 */
export function calculateAttendanceExcludingMedical(
  attended: number,
  total: number,
  medicalLeaveCount: number,
): number {
  const excluded = Math.max(0, medicalLeaveCount)
  const adjustedTotal = Math.max(0, total - excluded)
  const adjustedAttended = Math.max(0, attended - excluded)
  return AttendanceCalculator.calculatePercentage(adjustedAttended, adjustedTotal)
}

/** Treat medical leave as missed attendance while keeping the conducted-class denominator. */
export function calculateAttendanceWithMedicalAsAbsent(
  attended: number,
  total: number,
  medicalLeaveCount: number,
): number {
  const physicalAttended = Math.max(0, attended - Math.max(0, medicalLeaveCount))
  return AttendanceCalculator.calculatePercentage(physicalAttended, total)
}

// ─── GradeCalculator ─────────────────────────────────────────────────────────

const IPU_GRADE_SCALE: Record<string, number> = {
  O: 10,
  'A+': 9,
  A: 8,
  'B+': 7,
  B: 6,
  'C+': 5,
  C: 4,
  P: 4,
  F: 0,
}

export interface SubjectResult {
  total_marks: number
  max_marks: number
  percentage: number
  grade: string
  grade_point: number
}

export interface SGPAResult {
  sgpa: number
  total_credits: number
  earned_credits: number
}

export interface CGPAResult {
  cgpa: number
  total_semesters: number
}

export const GradeCalculator = {
  calculateSubjectResult(subject: Record<string, unknown>): SubjectResult {
    const internalT = Number(subject.internal_theory ?? 0)
    const externalT = Number(subject.external_theory ?? 0)
    const internalP = Number(subject.internal_practical ?? 0)
    const externalP = Number(subject.external_practical ?? 0)

    const total = internalT + externalT + internalP + externalP
    const maxMarks = 100
    const percentage = (total / maxMarks) * 100

    let grade = 'F'
    if (percentage >= 90) grade = 'O'
    else if (percentage >= 75) grade = 'A+'
    else if (percentage >= 65) grade = 'A'
    else if (percentage >= 55) grade = 'B+'
    else if (percentage >= 50) grade = 'B'
    else if (percentage >= 45) grade = 'C+'
    else if (percentage >= 40) grade = 'C'

    return {
      total_marks: Math.round(total * 100) / 100,
      max_marks: maxMarks,
      percentage: Math.round(percentage * 100) / 100,
      grade,
      grade_point: IPU_GRADE_SCALE[grade] ?? 0,
    }
  },

  calculateSGPA(
    courses: Array<{ credits?: number; grade_point?: number }>,
  ): SGPAResult {
    let weightedSum = 0
    let totalCredits = 0
    let earnedCredits = 0

    for (const c of courses) {
      const credits = Number(c.credits ?? 0)
      const gp = Number(c.grade_point ?? 0)
      totalCredits += credits
      weightedSum += credits * gp
      if (gp > 0) earnedCredits += credits
    }

    return {
      sgpa: totalCredits > 0 ? Math.round((weightedSum / totalCredits) * 100) / 100 : 0,
      total_credits: totalCredits,
      earned_credits: earnedCredits,
    }
  },

  calculateCGPA(
    semesters: Array<Array<{ credits?: number; grade_point?: number }>>,
  ): CGPAResult {
    const sgpas = semesters.map((s) => GradeCalculator.calculateSGPA(s))
    const validSgpas = sgpas.filter((s) => s.total_credits > 0)
    if (!validSgpas.length) return { cgpa: 0, total_semesters: 0 }

    let totalCredits = 0
    let weightedSum = 0
    for (const s of validSgpas) {
      totalCredits += s.total_credits
      weightedSum += s.sgpa * s.total_credits
    }

    return {
      cgpa: totalCredits > 0 ? Math.round((weightedSum / totalCredits) * 100) / 100 : 0,
      total_semesters: validSgpas.length,
    }
  },
}
