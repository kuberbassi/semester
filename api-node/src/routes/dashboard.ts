import { Router } from 'express'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { prisma } from '../config/prisma.js'
import { AttendanceCalculator, GradeCalculator } from '../lib/calculations.js'
import { ok, fail } from '../utils/response.js'
import { isAttendedAttendanceStatus, isCountedAttendanceStatus } from '../utils/attendanceStatus.js'
import { buildViewCacheId, clearUserViewCache, readViewCache, writeViewCache } from '../utils/viewCache.js'

const router = Router()
router.use(requireAuth)

// ─── Dashboard Data ──────────────────────────────────────────────────────────

router.get('/data', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!
    const semester = req.query.semester ? parseInt(String(req.query.semester)) : 1
    const cacheId = buildViewCacheId('dashboard_data', { semester })
    if (req.query.refresh === '1') {
      await clearUserViewCache(userId).catch(() => {})
    } else {
      const cached = await readViewCache<any>(userId, cacheId)
      if (cached) {
        ok(res, cached, 200, 0)
        return
      }
    }

    const medicalAttendanceFilter = {
      user_id: userId,
      status: { in: ['medical' as const, 'approved_medical' as const] },
      OR: [
        { semester },
        { semester: null, subject: { is: { semester } } },
      ],
    }
    const [subjects, recentLogs, medicalLeaveCount, medicalLeaveGroups] = await Promise.all([
      prisma.subject.findMany({
        where: { user_id: userId, semester },
        orderBy: { name: 'asc' },
      }),
      prisma.attendanceLog.findMany({
        where: { user_id: userId, semester },
        orderBy: [{ date: 'desc' }, { timestamp: 'desc' }],
        take: 30,
      }),
      prisma.attendanceLog.count({ where: medicalAttendanceFilter }),
      prisma.attendanceLog.groupBy({
        by: ['subject_id'],
        where: medicalAttendanceFilter,
        _count: { _all: true },
      }),
    ])
    const medicalLeaveCountBySubject = new Map(
      medicalLeaveGroups.map(group => [group.subject_id, group._count._all]),
    )
    const resultRows: any[] = []

    const enriched = subjects.map((sub: any) => {
      const subjectMedicalLeaveCount = medicalLeaveCountBySubject.get(sub.id) ?? 0
      const adjustedAttended = Math.max(0, sub.attended - subjectMedicalLeaveCount)
      const adjustedTotal = Math.max(0, sub.total - subjectMedicalLeaveCount)
      const pct = AttendanceCalculator.calculatePercentage(adjustedAttended, adjustedTotal)
      const guard = AttendanceCalculator.calculateBunkGuard(adjustedAttended, adjustedTotal, sub.target ?? 75)
      return {
        ...sub,
        _id: sub.id,
        medical_leave_count: subjectMedicalLeaveCount,
        attendance_percentage: pct,
        status_message: guard.status_message,
      }
    })
    const summary = AttendanceCalculator.getAttendanceSummary(
      subjects.map((sub: any) => {
        const medicalCount = medicalLeaveCountBySubject.get(sub.id) ?? 0
        return {
          attended: Math.max(0, sub.attended - medicalCount),
          total: Math.max(0, sub.total - medicalCount),
        }
      }),
      req.user?.attendance_threshold,
      req.user?.warning_threshold,
    )

    const cgpaCalc = resultRows.length ? GradeCalculator.calculateCGPA(resultRows.map((row: any) => row.subjects as Array<Record<string, unknown>>)) : { cgpa: 0 }
    const attendanceWithMedicalAsAbsent = AttendanceCalculator.calculatePercentage(
      summary.total_attended,
      summary.total_classes + medicalLeaveCount,
    )

    const payload = {
      overall_attendance: summary.overall_percentage,
      attendance_without_medical: attendanceWithMedicalAsAbsent,
      medical_leave_count: medicalLeaveCount,
      total_subjects: subjects.length,
      subjects: enriched,
      recent_logs: recentLogs,
      summary: {
        ...summary,
        academic_standing: cgpaCalc.cgpa > 0 ? Number(cgpaCalc.cgpa.toFixed(2)) : 0,
      },
      last_updated: new Date().toISOString(),
    }
    console.log(`[DEBUG] Dashboard Bunks: Att:${summary.total_attended}, Tot:${summary.total_classes}, Target:${req.user?.attendance_threshold} => SafeBunks:${summary.safe_bunks_remaining}`);
    ok(res, payload, 200, 0)
    void writeViewCache(userId, cacheId, payload, 60_000)
  } catch (err) {
    console.error('[dashboard/data]', err)
    fail(res, 'Failed to fetch dashboard data', 'FETCH_FAILED', 500)
  }
})

// ─── Reports Data ─────────────────────────────────────────────────────────────

router.get('/reports_data', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!
    const semester = req.query.semester ? parseInt(String(req.query.semester)) : 1
    const cacheId = buildViewCacheId('reports_data', { semester })
    if (req.query.refresh === '1') {
      await clearUserViewCache(userId).catch(() => {})
    } else {
      const cached = await readViewCache<any>(userId, cacheId)
      if (cached) {
        ok(res, cached, 200, 0)
        return
      }
    }
    const userTarget = req.user?.attendance_threshold ?? 75

    const medicalAttendanceFilter = {
      user_id: userId,
      status: { in: ['medical' as const, 'approved_medical' as const] },
      OR: [
        { semester },
        { semester: null, subject: { is: { semester } } },
      ],
    }
    const [subjects, logs, medicalLeaveGroups] = await Promise.all([
      prisma.subject.findMany({
        where: { user_id: userId, semester },
        select: { id: true, name: true, attended: true, total: true, target: true, semester: true },
      }),
      prisma.attendanceLog.findMany({
        where: {
          user_id: userId,
          OR: [
            { semester },
            { semester: null, subject: { is: { semester } } },
          ],
        },
        select: { date: true, status: true, subject_name: true },
        orderBy: { date: 'desc' },
      }),
      prisma.attendanceLog.groupBy({
        by: ['subject_id'],
        where: medicalAttendanceFilter,
        _count: { _all: true },
      }),
    ])
    const medicalLeaveCountBySubject = new Map(
      medicalLeaveGroups.map(group => [group.subject_id, group._count._all]),
    )
    const resultRows: any[] = []

    let totalAbsences = 0
    let totalAttended = 0
    let totalClasses = 0
    let atRiskCount = 0
    let safeBunksRemaining = 0

    const processedSubjects = subjects.map((sub: any) => {
      const rawAttended = sub.attended ?? 0
      const rawTotal = sub.total ?? 0
      const medicalLeaveCount = medicalLeaveCountBySubject.get(sub.id) ?? 0
      const attended = Math.max(0, rawAttended - medicalLeaveCount)
      const total = Math.max(0, rawTotal - medicalLeaveCount)
      const target = sub.target ?? userTarget
      const pct = total > 0 ? Math.round((attended / total) * 1000) / 10 : 0
      const missed = total - attended
      const guard = AttendanceCalculator.calculateBunkGuard(attended, total, target)
      totalAbsences += missed
      totalAttended += attended
      totalClasses += total
      safeBunksRemaining += Math.max(0, guard.count ?? 0)
      if (total > 0 && pct < target) atRiskCount++
      return { ...sub, _id: sub.id, attended, total, medical_leave_count: medicalLeaveCount, percentage: pct, target, safe_bunks_remaining: Math.max(0, guard.count ?? 0) }
    })

    const overallPct = totalClasses > 0 ? Math.round((totalAttended / totalClasses) * 1000) / 10 : 0

    const bestSubject = processedSubjects.length
      ? processedSubjects.reduce((a: any, b: any) => (a.percentage > b.percentage ? a : b))
      : null
    const worstSubject = processedSubjects.length
      ? processedSubjects.reduce((a: any, b: any) => {
        if (a.total === 0) return b
        if (b.total === 0) return a
        return a.percentage < b.percentage ? a : b
      })
      : null

    // Calculate attendance streak — only counts consecutive weekdays (Mon-Fri)
    let streak = 0
    const dateSet = new Set<string>()
    const recentDailyPct = new Map<string, { attended: number; total: number; medical: number }>()
    for (const log of logs) {
      const isMedicalLeave = log.status === 'medical' || log.status === 'approved_medical'
      if (!isMedicalLeave && isAttendedAttendanceStatus(log.status)) {
        // Only count weekday attendance dates for streak
        const day = new Date(log.date + 'T00:00:00').getDay()
        if (day !== 0 && day !== 6) dateSet.add(log.date)
      }
      const bucket = recentDailyPct.get(log.date) ?? { attended: 0, total: 0, medical: 0 }
      if (isCountedAttendanceStatus(log.status)) bucket.total += 1
      if (isMedicalLeave) bucket.medical += 1
      else if (isAttendedAttendanceStatus(log.status)) bucket.attended += 1
      recentDailyPct.set(log.date, bucket)
    }
    // Latest 10 dates (most recent first)
    const sortedDates = [...recentDailyPct.keys()].sort().reverse()
    const latest5 = sortedDates.slice(0, 5)
    const previous5 = sortedDates.slice(5, 10)

    const calcAvg = (dates: string[]) => {
      if (!dates.length) return 0
      const sum = dates.reduce((acc, d) => {
        const val = recentDailyPct.get(d)!
        const eligibleTotal = Math.max(0, val.total - val.medical)
        return acc + (eligibleTotal > 0 ? (val.attended / eligibleTotal) * 100 : 0)
      }, 0)
      return sum / dates.length
    }

    const latestAvg = calcAvg(latest5)
    const previousAvg = calcAvg(previous5)
    
    // Momentum is latest performance minus previous performance
    const attendanceMomentum = previous5.length > 0 
      ? Math.round((latestAvg - previousAvg) * 10) / 10 
      : 0

    // Restore Streak Logic
    // Sort descending (most recent first)
    const weekdayDates = [...dateSet].sort().reverse()
    if (weekdayDates.length > 0) {
      streak = 1
      for (let i = 1; i < weekdayDates.length; i++) {
        // Move back exactly one weekday from the previous date
        const prev = new Date(weekdayDates[i - 1] + 'T00:00:00')
        prev.setDate(prev.getDate() - 1)
        while (prev.getDay() === 0 || prev.getDay() === 6) prev.setDate(prev.getDate() - 1)
        if (weekdayDates[i] === prev.toISOString().slice(0, 10)) {
          streak++
        } else {
          break
        }
      }
    }

    const heatmapData: Record<string, string[]> = {}
    for (const log of logs) {
      if (!heatmapData[log.date]) heatmapData[log.date] = []
      heatmapData[log.date].push(log.status)
    }

    const consistencyScore = Math.max(0, Math.min(100, Math.round((overallPct * 0.65) + (Math.min(streak, 10) * 3.5))))
    const achievementLevel =
      overallPct >= 90 ? 'legend' :
      overallPct >= 82 ? 'elite' :
      overallPct >= 75 ? 'steady' :
      overallPct >= 65 ? 'recovery' : 'danger'
    const focusLabel =
      atRiskCount === 0 ? 'All subjects above target' :
      worstSubject?.name ? `Recover ${worstSubject.name}` : 'Recover weak subjects'

    const resultSubjects = resultRows.flatMap((row: any) => Array.isArray(row.subjects) ? row.subjects as Array<Record<string, unknown>> : [])
    const cgpaCalc = resultRows.length ? GradeCalculator.calculateCGPA(resultRows.map((row: any) => row.subjects as Array<Record<string, unknown>>)) : { cgpa: 0 }
    const completedResultSubjects = resultSubjects.filter((subject: any) => !subject.is_pending && subject.grade !== '-')
    const academicScore = completedResultSubjects.length
      ? Math.round(completedResultSubjects.reduce((sum: number, subject: any) => sum + Number(subject.grade_point ?? 0), 0) / completedResultSubjects.length * 10)
      : 0

    const payload = {
      kpis: {
        best_subject_name: bestSubject?.name ?? 'N/A',
        best_subject_percent: bestSubject ? `${bestSubject.percentage}%` : '0%',
        worst_subject_name: worstSubject?.name ?? 'N/A',
        worst_subject_percent: worstSubject ? `${worstSubject.percentage}%` : '0%',
        total_absences: totalAbsences,
        overall_percentage: overallPct,
        attendance_streak: streak,
        at_risk_count: atRiskCount,
        total_subjects: subjects.length,
        target_threshold: userTarget,
        safe_bunks_remaining: (() => {
          const val = totalClasses > 0 ? Math.max(0, Math.floor((totalAttended * 100 - userTarget * totalClasses) / userTarget)) : 0;
          console.log(`[DEBUG] Reports Bunks: Att:${totalAttended}, Tot:${totalClasses}, Target:${userTarget} => SafeBunks:${val}`);
          return val;
        })(),
        consistency_score: consistencyScore,
        attendance_momentum: attendanceMomentum,
        achievement_level: achievementLevel,
        focus_label: focusLabel,
        academic_score: academicScore,
        academic_standing: cgpaCalc.cgpa > 0 ? Number(cgpaCalc.cgpa.toFixed(2)) : Number((academicScore / 10).toFixed(2)),
      },
      subject_breakdown: processedSubjects,
      heatmap_data: heatmapData,
    }
    ok(res, payload, 200, 0)
    void writeViewCache(userId, cacheId, payload, 90_000)
  } catch (err) {
    console.error('[dashboard/reports_data]', err)
    fail(res, 'Failed to fetch reports data', 'FETCH_FAILED', 500)
  }
})

// ─── Day-of-Week Analytics ────────────────────────────────────────────────────

router.get('/analytics/day-of-week', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!
    const semester = req.query.semester ? parseInt(String(req.query.semester)) : 1

    const semSubjectIds = await prisma.subject.findMany({
      where: { user_id: userId, semester },
      select: { id: true },
    })
    const subjectIds = semSubjectIds.map((s: any) => s.id)

    if (!subjectIds.length) { ok(res, { days: [] }); return }

    const logs = await prisma.attendanceLog.findMany({
      where: { user_id: userId, subject_id: { in: subjectIds } },
      select: { date: true, status: true },
    })

    const dayCounts: Record<number, { present: number; absent: number; medical: number }> = {}

    for (const log of logs) {
      const dt = new Date(log.date + 'T00:00:00')
      const dayIdx = dt.getDay() + 1 // 1=Sun, 2=Mon, ..., 7=Sat

      if (!dayCounts[dayIdx]) dayCounts[dayIdx] = { present: 0, absent: 0, medical: 0 }
      if (log.status === 'medical' || log.status === 'approved_medical') {
        dayCounts[dayIdx].medical++
      } else if (isAttendedAttendanceStatus(log.status)) {
        dayCounts[dayIdx].present++
      } else if (log.status === 'absent') {
        dayCounts[dayIdx].absent++
      }
    }

    const dayMapping: Record<number, string> = {
      2: 'Mon', 3: 'Tue', 4: 'Wed', 5: 'Thu', 6: 'Fri',
    }
    // Only Mon-Fri (indices 2-6), Saturday and Sunday excluded
    const daysData = [2, 3, 4, 5, 6].map((d) => {
      const counts = dayCounts[d] ?? { present: 0, absent: 0, medical: 0 }
      const total = counts.present + counts.absent
      return {
        day: dayMapping[d],
        present: counts.present,
        total,
        medical_leave_count: counts.medical,
        percentage: total > 0 ? Math.round((counts.present / total) * 1000) / 10 : 0,
      }
    })

    ok(res, { days: daysData }, 200, 0) // No browser cache
  } catch (err) {
    console.error('[dashboard/analytics/day-of-week]', err)
    fail(res, 'Failed to fetch analytics', 'ANALYTICS_FAILED', 500)
  }
})

// ─── Notifications ────────────────────────────────────────────────────────────

router.get('/notifications', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!
    const semester = req.query.semester ? parseInt(String(req.query.semester)) : undefined
    const cacheId = buildViewCacheId('notifications', { semester: semester ?? 'all', warning: req.user?.warning_threshold ?? 76 })
    const cached = await readViewCache<any[]>(userId, cacheId)
    if (cached) {
      ok(res, cached, 200, 0)
      return
    }
    const [subjects, medicalLeaveGroups] = await Promise.all([
      prisma.subject.findMany({
        where: { user_id: userId, ...(semester ? { semester } : {}) },
        select: { id: true, name: true, attended: true, total: true, target: true },
      }),
      prisma.attendanceLog.groupBy({
        by: ['subject_id'],
        where: {
          user_id: userId,
          status: { in: ['medical', 'approved_medical'] },
          ...(semester ? {
            OR: [
              { semester },
              { semester: null, subject: { is: { semester } } },
            ],
          } : {}),
        },
        _count: { _all: true },
      }),
    ])
    const medicalLeaveCountBySubject = new Map(
      medicalLeaveGroups.map(group => [group.subject_id, group._count._all]),
    )
    const notifications: Array<Record<string, unknown>> = []

    const userWarningThreshold = req.user?.warning_threshold ?? 76

    for (const sub of subjects) {
      const target = sub.target ?? 75
      const medicalLeaveCount = medicalLeaveCountBySubject.get(sub.id) ?? 0
      const attended = Math.max(0, sub.attended - medicalLeaveCount)
      const total = Math.max(0, sub.total - medicalLeaveCount)
      if (total === 0) continue
      const guard = AttendanceCalculator.calculateBunkGuard(attended, total, target)
      const pct = Math.round((attended / total) * 1000) / 10

      if (pct <= userWarningThreshold || (!guard.can_bunk && guard.count > 0)) {
        notifications.push({
          type: 'warning',
          title: 'Attendance Warning',
          message: `Critical: ${sub.name} is at ${pct}%. ${guard.status_message}`,
          priority: pct < target ? 'high' : 'medium',
        })
      }
    }

    ok(res, notifications, 200, 0)
    void writeViewCache(userId, cacheId, notifications, 120_000)
  } catch (err) {
    console.error('[dashboard/notifications]', err)
    fail(res, 'Failed to fetch notifications', 'FETCH_FAILED', 500)
  }
})

export default router
