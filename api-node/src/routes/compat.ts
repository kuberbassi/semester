import { Router, type Request, type Response, type NextFunction } from 'express'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { prisma } from '../config/prisma.js'
import { ok, fail } from '../utils/response.js'
import { ATTENDED_ATTENDANCE_STATUSES, COUNTED_ATTENDANCE_STATUSES } from '../utils/attendanceStatus.js'

const STATIC_REWRITES: Record<string, { path: string; method?: string }> = {
  '/api/current_user': { path: '/api/auth/me' },
  '/api/dashboard_data': { path: '/api/dashboard/data' },
  '/api/reports_data': { path: '/api/dashboard/reports_data' },
  '/api/attendance_logs': { path: '/api/attendance/logs' },
  '/api/mark_attendance': { path: '/api/attendance/mark' },
  '/api/calendar_data': { path: '/api/attendance/calendar_data' },
  '/api/classes_for_date': { path: '/api/attendance/classes-for-date' },
  '/api/full_subjects_data': { path: '/api/academic/full_subjects_data' },
  '/api/analytics/day_of_week': { path: '/api/dashboard/analytics/day-of-week' },
  '/api/update_profile': { path: '/api/profile', method: 'PUT' },
  '/api/upload_pfp': { path: '/api/profile/upload_pfp' },
  '/api/preferences': { path: '/api/profile/preferences' },
  '/api/backups': { path: '/api/data/backups' },
  '/api/system_logs': { path: '/api/profile/logs' },
  '/api/semester_results': { path: '/api/academic/results' },
  '/api/courses/manual': { path: '/api/academic/courses/manual' },
  '/api/notifications': { path: '/api/dashboard/notifications' },
}

const PARAM_REWRITES: Array<{
  pattern: RegExp
  to: (match: RegExpExecArray) => string
  method?: string
}> = [
  { pattern: /^\/api\/subject_details\/([^/?]+)/, to: (m) => `/api/academic/subjects/${m[1]}` },
  { pattern: /^\/api\/edit_attendance\/([^/?]+)/, to: (m) => `/api/attendance/logs/${m[1]}`, method: 'PUT' },
  { pattern: /^\/api\/logs\/([^/?]+)/, to: (m) => `/api/attendance/logs/${m[1]}` },
  { pattern: /^\/api\/restore_backup\/([^/?]+)/, to: (m) => `/api/data/restore_backup/${m[1]}` },
  { pattern: /^\/api\/semester_results\/([^/?]+)/, to: (m) => `/api/academic/results/${m[1]}` },
  { pattern: /^\/api\/courses\/manual\/([^/?]+)/, to: (m) => `/api/academic/courses/manual/${m[1]}` },
  { pattern: /^\/api\/approve_leave\/([^/?]+)/, to: (m) => `/api/attendance/approve_leave/${m[1]}` },
]

export function flaskRewrite(req: Request, _res: Response, next: NextFunction): void {
  if (!req.url.startsWith('/api/')) { next(); return }
  if (/^\/api\/v\d+\//.test(req.url)) { next(); return }

  const qsIdx = req.url.indexOf('?')
  const path = qsIdx >= 0 ? req.url.slice(0, qsIdx) : req.url
  const queryString = qsIdx >= 0 ? req.url.slice(qsIdx) : ''

  const staticRule = STATIC_REWRITES[path]
  if (staticRule) {
    req.url = staticRule.path + queryString
    if (staticRule.method) req.method = staticRule.method
    next()
    return
  }

  for (const rule of PARAM_REWRITES) {
    const match = rule.pattern.exec(path)
    if (match) {
      req.url = rule.to(match) + queryString
      if (rule.method) req.method = rule.method
      next()
      return
    }
  }

  next()
}

export const compatHandlers = Router()

compatHandlers.post('/mark_all_attendance', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { subject_ids, status, date } = req.body as {
      subject_ids: string[]
      status: string
      date: string
    }
    if (!subject_ids?.length || !status || !date) {
      fail(res, 'subject_ids, status, and date required', 'MISSING_FIELDS')
      return
    }

    const userId = req.userId!
    let marked = 0

    for (const sid of subject_ids) {
      const subject = await prisma.subject.findFirst({ where: { id: sid, user_id: userId } })
      if (!subject) continue

      try {
        await prisma.attendanceLog.create({
          data: {
            user_id: userId,
            subject_id: sid,
            status: status as never,
            date,
            subject_name: subject.name,
            semester: subject.semester,
          },
        })
      } catch (err: any) {
        if (err.code === 'P2002') continue
        throw err
      }

      const [present, total] = await Promise.all([
        prisma.attendanceLog.count({
          where: { subject_id: sid, user_id: userId, status: { in: [...ATTENDED_ATTENDANCE_STATUSES] as never[] } },
        }),
        prisma.attendanceLog.count({
          where: { subject_id: sid, user_id: userId, status: { in: [...COUNTED_ATTENDANCE_STATUSES] as never[] } },
        }),
      ])

      await prisma.subject.update({ where: { id: sid }, data: { attended: present, total } })
      marked++
    }

    ok(res, { message: `Marked ${marked} subjects`, marked })
  } catch (err) {
    console.error('[compat/mark_all_attendance]', err)
    fail(res, 'Failed to mark attendance', 'MARK_FAILED', 500)
  }
})

compatHandlers.get('/all_semesters_overview', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!
    const semesters: Array<Record<string, unknown>> = []

    for (let sem = 1; sem <= 8; sem++) {
      const subjects = await prisma.subject.findMany({ where: { user_id: userId, semester: sem } })
      if (!subjects.length) continue

      const medicalLeaveGroups = await prisma.attendanceLog.groupBy({
        by: ['subject_id'],
        where: {
          user_id: userId,
          status: { in: ['medical', 'approved_medical'] },
          OR: [
            { semester: sem },
            { semester: null, subject: { is: { semester: sem } } },
          ],
        },
        _count: { _all: true },
      })
      const medicalLeaveCountBySubject = new Map(medicalLeaveGroups.map(group => [group.subject_id, group._count._all]))
      const medicalLeaveCount = [...medicalLeaveCountBySubject.values()].reduce((sum, count) => sum + count, 0)
      const totalAttended = subjects.reduce((sum: number, sub: any) => sum + Math.max(0, (sub.attended ?? 0) - (medicalLeaveCountBySubject.get(sub.id) ?? 0)), 0)
      const totalClasses = subjects.reduce((sum: number, sub: any) => sum + Math.max(0, (sub.total ?? 0) - (medicalLeaveCountBySubject.get(sub.id) ?? 0)), 0)

      semesters.push({
        semester: sem,
        total_subjects: subjects.length,
        total_attended: totalAttended,
        total_classes: totalClasses,
        medical_leave_count: medicalLeaveCount,
        attendance_percentage: totalClasses > 0 ? Math.round((totalAttended / totalClasses) * 1000) / 10 : 0,
      })
    }

    ok(res, semesters)
  } catch (err) {
    console.error('[compat/all_semesters_overview]', err)
    fail(res, 'Failed to fetch overview', 'FETCH_FAILED', 500)
  }
})

compatHandlers.get('/pending_leaves', requireAuth, (_req, res) => {
  fail(res, 'Pending leaves endpoint is not implemented in the Node API.', 'NOT_IMPLEMENTED', 501)
})

compatHandlers.get('/unresolved_substitutions', requireAuth, (_req, res) => {
  fail(res, 'Unresolved substitutions endpoint is not implemented in the Node API.', 'NOT_IMPLEMENTED', 501)
})

compatHandlers.post('/mark_substituted', requireAuth, (_req, res) => {
  ok(res, { message: 'Substitution recorded' })
})
