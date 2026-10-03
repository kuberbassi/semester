import { Router } from 'express'
import { z } from 'zod'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { prisma } from '../config/prisma.js'
import { ok, created, fail } from '../utils/response.js'
import { mergePreferredRecord } from '../utils/recordMerge.js'
import { buildViewCacheId, clearUserViewCache, readViewCache, writeViewCache } from '../utils/viewCache.js'
import { updateSubjectWithActivityAtomic } from '../utils/subjectActivity.js'

const router = Router()
router.use(requireAuth)

const SemesterParamSchema = z.object({ semester: z.string().regex(/^\d+$/).transform(Number) })

async function sysLog(req: AuthRequest, user_id: string, action: string, description: string) {
    const ip = req.ip || req.socket?.remoteAddress || null
    const user_agent = (req.headers['user-agent'] as string) || null
    return prisma.systemLog.create({ data: { user_id, action, description, ip, user_agent } })
}

type TrackerState = { total: number; completed: number; hardcopy: boolean }

async function countSubjectMedicalLeaves(userId: string, subjectId: string): Promise<number> {
    return prisma.attendanceLog.count({
        where: { user_id: userId, subject_id: subjectId, status: { in: ['medical', 'approved_medical'] } },
    })
}

async function groupMedicalLeavesBySubject(userId: string, semester: number) {
    return prisma.attendanceLog.groupBy({
        by: ['subject_id'],
        where: {
            user_id: userId,
            status: { in: ['medical', 'approved_medical'] },
            OR: [
                { semester },
                { semester: null, subject: { is: { semester } } },
            ],
        },
        _count: { _all: true },
    })
}

function trackerState(value: unknown, fallbackTotal: number): TrackerState {
    const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
    return {
        total: typeof raw.total === 'number' ? raw.total : fallbackTotal,
        completed: typeof raw.completed === 'number' ? raw.completed : 0,
        hardcopy: raw.hardcopy === true,
    }
}

function describeTrackerChange(label: 'Practical' | 'Assignment', before: TrackerState, after: TrackerState) {
    const changes: string[] = []
    if (before.completed !== after.completed || before.total !== after.total) {
        changes.push(`progress ${before.completed}/${before.total} to ${after.completed}/${after.total}`)
    }
    if (before.hardcopy !== after.hardcopy) {
        changes.push(`submission ${before.hardcopy ? 'submitted' : 'unsubmitted'} to ${after.hardcopy ? 'submitted' : 'unsubmitted'}`)
    }
    return changes.length ? `${label}: ${changes.join(', ')}` : null
}

// ─── Subjects ────────────────────────────────────────────────────────────────

const CreateSubjectSchema = z.object({
    name: z.string().min(1).max(200),
    semester: z.number().int().min(1).default(1),
    code: z.string().max(50).optional().default(''),
    professor: z.string().max(200).optional().default(''),
    classroom: z.string().max(100).optional().default(''),
    type: z.string().optional().default('theory'),
    credits: z.number().optional().default(0),
    categories: z.array(z.string()).optional().default(['Theory']),
    target: z.number().min(0).max(100).optional().default(75),
    syllabus: z.string().optional().default(''),
    practical_total: z.number().optional().default(10),
    assignment_total: z.number().optional().default(4),
})

const UpdateSubjectSchema = z.object({
    name: z.string().min(1).max(200).optional(),
    semester: z.number().int().min(1).optional(),
    code: z.string().max(50).optional(),
    professor: z.string().max(200).optional(),
    classroom: z.string().max(100).optional(),
    type: z.string().optional(),
    credits: z.number().optional(),
    categories: z.array(z.string()).optional(),
    target: z.number().min(0).max(100).optional(),
    attended: z.number().int().min(0).optional(),
    total: z.number().int().min(0).optional(),
    syllabus: z.string().optional(),
    practicals: z.object({ total: z.number().int().min(0).optional(), completed: z.number().int().min(0).optional(), hardcopy: z.boolean().optional() }).optional(),
    assignments: z.object({ total: z.number().int().min(0).optional(), completed: z.number().int().min(0).optional(), hardcopy: z.boolean().optional() }).optional(),
    practical_total: z.number().int().min(0).optional(),
    assignment_total: z.number().int().min(0).optional(),
}).passthrough()

const SemesterQuerySchema = z.object({
    semester: z.string().regex(/^\d+$/).optional().transform(v => v ? parseInt(v, 10) : 1),
})

/* GET /api/academic/subjects */
router.get('/subjects', async (req: AuthRequest, res) => {
    try {
        const { semester } = SemesterQuerySchema.parse(req.query)
        const userId = req.userId!
        const cacheId = buildViewCacheId('academic_subjects', { semester })
        const cached = await readViewCache<any>(userId, cacheId)
        if (cached) { ok(res, cached, 200, 0); return }
        const [subjects, medicalLeaveGroups] = await Promise.all([prisma.subject.findMany({
            where: {
                user_id: userId,
                semester,
            },
            orderBy: { name: 'asc' },
        }), groupMedicalLeavesBySubject(userId, semester)])
        const medicalLeaveCountBySubject = new Map(medicalLeaveGroups.map(group => [group.subject_id, group._count._all]))
        const payload = subjects.map((s: any) => ({ ...s, _id: s.id, medical_leave_count: medicalLeaveCountBySubject.get(s.id) ?? 0 }))
        ok(res, payload, 200, 0)
        void writeViewCache(userId, cacheId, payload, 120_000).catch(() => {})
    } catch (err) {
        if (err instanceof z.ZodError) { fail(res, err.errors[0]?.message || 'Validation failed', 'VALIDATION_ERROR', 400); return }
        console.error('[academic/subjects GET]', err)
        fail(res, 'Failed to fetch subjects', 'FETCH_FAILED', 500)
    }
})

/* GET /api/academic/full_subjects_data */
router.get('/full_subjects_data', async (req: AuthRequest, res) => {
    try {
        const { semester } = SemesterQuerySchema.parse(req.query)
        const userId = req.userId!
        const cacheId = buildViewCacheId('full_subjects_data', { semester })
        const cached = await readViewCache<any>(userId, cacheId)
        if (cached) { ok(res, cached, 200, 0); return }
        const [subjects, medicalLeaveGroups] = await Promise.all([prisma.subject.findMany({
            where: {
                user_id: userId,
                semester,
            },
        }), groupMedicalLeavesBySubject(userId, semester)])
        const medicalLeaveCountBySubject = new Map(medicalLeaveGroups.map(group => [group.subject_id, group._count._all]))
        const enriched = subjects.map((sub: any) => {
            const medicalLeaveCount = medicalLeaveCountBySubject.get(sub.id) ?? 0
            const attended = Math.max(0, (sub.attended ?? 0) - medicalLeaveCount)
            const total = Math.max(0, (sub.total ?? 0) - medicalLeaveCount)
            const pct = total > 0 ? Math.round((attended / total) * 1000) / 10 : 0
            return { ...sub, _id: sub.id, medical_leave_count: medicalLeaveCount, percentage: pct, status_message: pct < 75 ? 'Low Attendance' : 'On Track' }
        })
        ok(res, enriched, 200, 0)
        void writeViewCache(userId, cacheId, enriched, 120_000).catch(() => {})
    } catch (err) {
        if (err instanceof z.ZodError) { fail(res, err.errors[0]?.message || 'Validation failed', 'VALIDATION_ERROR', 400); return }
        console.error('[academic/full_subjects_data GET]', err)
        fail(res, 'Failed to fetch subjects data', 'FETCH_FAILED', 500)
    }
})

/* POST /api/academic/subjects */
router.post('/subjects', async (req: AuthRequest, res) => {
    try {
        const body = CreateSubjectSchema.parse(req.body)
        const userId = req.userId!
        const userThreshold = req.user?.attendance_threshold ?? 75
        const target = body.target === 75 ? userThreshold : body.target
        const subject = await prisma.subject.create({
            data: {
                user_id: userId,
                name: body.name,
                semester: body.semester,
                code: body.code,
                professor: body.professor,
                classroom: body.classroom,
                type: body.type,
                credits: body.credits,
                categories: body.categories,
                target,
                syllabus: body.syllabus,
                practicals: { total: body.practical_total, completed: 0, hardcopy: false },
                assignments: { total: body.assignment_total, completed: 0, hardcopy: false },
            },
        })
        await sysLog(req, userId, 'Subject Added', `Added '${body.name}' to semester ${body.semester}`).catch(() => { })
        await clearUserViewCache(userId).catch(() => { })
        created(res, { _id: subject.id, ...subject })
    } catch (err) {
        if (err instanceof z.ZodError) { fail(res, 'Validation failed', 'INVALID_PARAMS'); return }
        console.error('[academic/subjects POST]', err)
        fail(res, 'Failed to create subject', 'CREATE_FAILED', 500)
    }
})

/* GET /api/academic/subjects/:id */
router.get('/subjects/:id', async (req: AuthRequest, res) => {
    try {
        const subjectId = String(req.params.id)
        const userId = req.userId!
        const subject = await prisma.subject.findFirst({ where: { id: subjectId, user_id: userId } })
        if (!subject) { fail(res, 'Subject not found', 'NOT_FOUND', 404); return }
        const medicalLeaveCount = await countSubjectMedicalLeaves(userId, subjectId)
        ok(res, { _id: subject.id, ...subject, medical_leave_count: medicalLeaveCount })
    } catch (err) {
        console.error('[academic/subjects/:id GET]', err)
        fail(res, 'Failed to fetch subject', 'FETCH_FAILED', 500)
    }
})

async function handleUpdateSubject(req: AuthRequest, res: any) {
    try {
        const subjectId = String(req.params.id)
        const userId = req.userId!
        const data = UpdateSubjectSchema.parse(req.body)

        const existing = await prisma.subject.findFirst({ where: { id: subjectId, user_id: userId } })
        if (!existing) { fail(res, 'Subject not found', 'NOT_FOUND', 404); return }

        const allowedFields = ['name', 'semester', 'categories', 'type', 'code', 'professor', 'classroom', 'credits', 'syllabus', 'target', 'attended', 'total']
        const updateData: Record<string, unknown> = {}
        for (const k of allowedFields) {
            if (k in data) updateData[k] = (data as Record<string, unknown>)[k]
        }
        if (data.attended !== undefined || data.total !== undefined) {
            const medicalLeaveCount = await countSubjectMedicalLeaves(userId, subjectId)
            const total = data.total ?? existing.total
            const physicalAttended = data.attended ?? Math.max(0, existing.attended - medicalLeaveCount)
            if (total < medicalLeaveCount || physicalAttended > total - medicalLeaveCount) {
                fail(res, 'Attended classes must not exceed total classes after medical leave is excluded', 'INVALID_ATTENDANCE_OVERRIDE', 400)
                return
            }
            // The form accepts actual physical attendance; subject counters keep
            // the historical raw representation so medical logs remain reversible.
            if (data.attended !== undefined) updateData.attended = data.attended + medicalLeaveCount
        }

        // Handle practicals (JSON read-modify-write)
        if (data.practicals || data.practical_total !== undefined) {
            const cur = { ...(((existing.practicals ?? { total: 10, completed: 0, hardcopy: false }) as Record<string, unknown>)) }
            if (data.practicals) {
                for (const [k, v] of Object.entries(data.practicals)) { if (v !== undefined) cur[k] = v }
            } else if (data.practical_total !== undefined) {
                cur['total'] = data.practical_total
            }
            updateData['practicals'] = cur
        }

        // Handle assignments (JSON read-modify-write)
        if (data.assignments || data.assignment_total !== undefined) {
            const cur = { ...(((existing.assignments ?? { total: 4, completed: 0, hardcopy: false }) as Record<string, unknown>)) }
            if (data.assignments) {
                for (const [k, v] of Object.entries(data.assignments)) { if (v !== undefined) cur[k] = v }
            } else if (data.assignment_total !== undefined) {
                cur['total'] = data.assignment_total
            }
            updateData['assignments'] = cur
        }

        const beforePracticals = trackerState(existing.practicals, 10)
        const beforeAssignments = trackerState(existing.assignments, 4)
        const afterPracticals = trackerState(updateData.practicals ?? existing.practicals, 10)
        const afterAssignments = trackerState(updateData.assignments ?? existing.assignments, 4)
        if (afterPracticals.completed > afterPracticals.total || afterAssignments.completed > afterAssignments.total) {
            fail(res, 'Completed work cannot exceed the configured total', 'INVALID_TRACKER_STATE', 400)
            return
        }
        const trackerChanges = [
            describeTrackerChange('Practical', beforePracticals, afterPracticals),
            describeTrackerChange('Assignment', beforeAssignments, afterAssignments),
        ].filter((value): value is string => Boolean(value))
        const ordinaryChanges = allowedFields.filter(key => key in updateData && JSON.stringify((existing as any)[key]) !== JSON.stringify(updateData[key]))

        if (trackerChanges.length === 0 && ordinaryChanges.length === 0) {
            ok(res, { message: 'No changes needed', subject: { ...existing, _id: existing.id }, activity_id: null, unchanged: true })
            return
        }

        const action = trackerChanges.length > 0 && ordinaryChanges.length === 0
            ? (trackerChanges.some(change => change.includes('submission')) ? 'Submission Status Updated' : 'Tracker Progress Updated')
            : 'Subject Updated'
        const descriptionParts = [
            ...trackerChanges,
            ...(ordinaryChanges.length ? [`Fields: ${ordinaryChanges.join(', ')}`] : []),
        ]
        const description = `${existing.name} — ${descriptionParts.join('; ')}`
        const ip = req.ip || req.socket?.remoteAddress || null
        const user_agent = (req.headers['user-agent'] as string) || null
        const [updatedSubject, activity] = await updateSubjectWithActivityAtomic({
            subjectId,
            expectedUpdatedAt: existing.updated_at,
            updateData,
            userId,
            action,
            description,
            ip,
            userAgent: user_agent,
        })
        await clearUserViewCache(userId).catch(() => { })
        ok(res, {
            message: 'Subject updated',
            subject: { ...updatedSubject, _id: updatedSubject.id },
            activity_id: activity.id,
            unchanged: false,
        })
    } catch (err) {
        if (err instanceof z.ZodError) { fail(res, err.errors[0]?.message || 'Validation failed', 'INVALID_PARAMS'); return }
        if (err && typeof err === 'object' && 'code' in err && err.code === 'P2025') {
            fail(res, 'This subject changed on another device. Refresh and try again.', 'STALE_SUBJECT', 409)
            return
        }
        console.error('[academic/subjects/:id PUT]', err)
        fail(res, 'Failed to update subject', 'UPDATE_FAILED', 500)
    }
}

router.put('/subjects/:id', handleUpdateSubject)
router.patch('/subjects/:id', handleUpdateSubject)

/* DELETE /api/academic/subjects/:id */
router.delete('/subjects/:id', async (req: AuthRequest, res) => {
    try {
        const subjectId = String(req.params.id)
        const userId = req.userId!
        const subject = await prisma.subject.findFirst({ where: { id: subjectId, user_id: userId } })
        if (!subject) { fail(res, 'Subject not found', 'NOT_FOUND', 404); return }
        // onDelete: Cascade in schema auto-deletes attendance_logs
        await prisma.subject.delete({ where: { id: subjectId } })
        await sysLog(req, userId, 'Subject Deleted', `Deleted subject '${subject.name}'`).catch(() => { })
        await clearUserViewCache(userId).catch(() => { })
        ok(res, { message: 'Subject deleted' })
    } catch (err) {
        if (err instanceof z.ZodError) { fail(res, err.errors[0]?.message || 'Validation failed', 'INVALID_PARAMS'); return }
        console.error('[academic/subjects/:id DELETE]', err)
        fail(res, 'Failed to delete subject', 'DELETE_FAILED', 500)
    }
})

/* POST /api/academic/subjects/:id/attendance-count */
const AttendanceCountSchema = z.object({
    attended: z.number().int().min(0).default(0),
    total: z.number().int().min(0).default(0),
})

router.post('/subjects/:id/attendance-count', async (req: AuthRequest, res) => {
    try {
        const subjectId = String(req.params.id)
        const userId = req.userId!
        const { attended, total } = AttendanceCountSchema.parse(req.body)
        const existing = await prisma.subject.findFirst({ where: { id: subjectId, user_id: userId } })
        if (!existing) { fail(res, 'Subject not found', 'NOT_FOUND', 404); return }
        const medicalLeaveCount = await countSubjectMedicalLeaves(userId, subjectId)
        if (total < medicalLeaveCount || attended > total - medicalLeaveCount) {
            fail(res, 'Attended classes must not exceed total classes after medical leave is excluded', 'INVALID_ATTENDANCE_OVERRIDE', 400)
            return
        }
        await prisma.subject.update({ where: { id: subjectId }, data: { attended: attended + medicalLeaveCount, total } })
        await clearUserViewCache(userId).catch(() => { })
        ok(res, { message: 'Attendance count updated' })
    } catch (err) {
        if (err instanceof z.ZodError) { fail(res, err.errors[0]?.message || 'Validation failed', 'INVALID_PARAMS'); return }
        console.error('[academic/attendance-count]', err)
        fail(res, 'Failed to update count', 'UPDATE_FAILED', 500)
    }
})

// ─── Manual / Online Courses ─────────────────────────────────────────────────

// Accepts both frontend format (title/progress/instructor/enrolledDate/targetCompletionDate)
// and legacy backend format (name/provider/percentage).
const ManualCourseSchema = z.object({
    title: z.string().max(200).nullish(),
    name: z.string().max(200).nullish(),
    platform: z.string().max(200).nullish(),
    provider: z.string().max(200).nullish(),
    url: z.string().max(2048).nullish(),
    progress: z.number().min(0).max(100).nullish(),
    percentage: z.number().min(0).max(100).nullish(),
    status: z.enum(['not_started', 'in_progress', 'completed']).nullish(),
    instructor: z.string().max(200).nullish(),
    enrolledDate: z.string().nullish(),
    targetCompletionDate: z.string().nullish(),
    notes: z.string().max(1000).nullish(),
})

function normalizeHttpUrl(url?: string | null): string | null {
    const raw = String(url ?? '').trim()
    if (!raw) return null
    try {
        const parsed = new URL(raw)
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Invalid URL protocol')
        return parsed.toString()
    } catch {
        throw new Error('Course URL must be a valid http or https URL')
    }
}

function normalizeCourseForSave(raw: z.infer<typeof ManualCourseSchema>) {
    const courseName = raw.title || raw.name || ''
    if (!courseName) throw new Error('Course name/title is required')
    const progress = raw.progress ?? raw.percentage ?? 0
    const computedStatus = raw.status ?? (progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'not_started')
    const platform = raw.platform || raw.provider || null
    const extra: Record<string, string> = {}
    if (raw.instructor) extra.instructor = raw.instructor
    if (raw.enrolledDate) extra.enrolledDate = raw.enrolledDate
    if (raw.targetCompletionDate) extra.targetCompletionDate = raw.targetCompletionDate
    return { name: courseName, platform, status: computedStatus, progress, url: normalizeHttpUrl(raw.url), notes: raw.notes || '', extra }
}

function formatCourseForClient(c: { id: string; name: string | null; platform: string | null; status: string | null; progress: number; url: string | null; notes: string | null; extra: unknown; created_at: Date }) {
    const extra = (c.extra as Record<string, string> | null) ?? {}
    const progress = c.progress ?? 0
    const computedStatus = c.status ?? (progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'not_started')
    return {
        ...c,
        _id: c.id,
        title: c.name ?? extra.title ?? '',
        platform: c.platform ?? 'custom',
        status: computedStatus,
        url: c.url ?? '',
        progress,
        notes: c.notes ?? '',
        instructor: extra.instructor ?? extra.instructor_name ?? '',
        enrolledDate: extra.enrolledDate ?? extra.enrolled_date ?? c.created_at.toISOString().slice(0, 10),
        targetCompletionDate: extra.targetCompletionDate ?? extra.target_completion_date ?? '',
    }
}

router.get('/courses/manual', async (req: AuthRequest, res) => {
    try {
        const userId = req.userId!
        const cacheId = buildViewCacheId('manual_courses', {})
        const cached = await readViewCache<any>(userId, cacheId)
        if (cached) { ok(res, cached, 200, 0); return }
        const courses = await prisma.manualCourse.findMany({ where: { user_id: userId } })
        const payload = courses.map((c: any) => formatCourseForClient(c))
        ok(res, payload, 200, 0)
        void writeViewCache(userId, cacheId, payload, 10 * 60 * 1000).catch(() => {})
    } catch (err) {
        console.error('[academic/courses/manual GET]', err)
        fail(res, 'Failed to fetch courses', 'FETCH_FAILED', 500)
    }
})

router.post('/courses/manual', async (req: AuthRequest, res) => {
    try {
        const userId = req.userId!
        const data = req.body
        
        if (Array.isArray(data)) {
            const items = data.map((c: any) => normalizeCourseForSave(ManualCourseSchema.parse(c)))
            await prisma.manualCourse.deleteMany({ where: { user_id: userId } })

            await Promise.all(items.map((i) =>
                prisma.manualCourse.create({
                    data: {
                        user_id: userId,
                        name: i.name,
                        platform: i.platform,
                        status: i.status,
                        progress: i.progress,
                        url: i.url,
                        notes: i.notes,
                        extra: Object.keys(i.extra).length ? i.extra as any : undefined,
                    }
                })
            ))
        } else {
            const item = normalizeCourseForSave(ManualCourseSchema.parse(data))
            await prisma.manualCourse.create({
                data: { 
                    user_id: userId, 
                    name: item.name, 
                    platform: item.platform, 
                    status: item.status, 
                    progress: item.progress, 
                    url: item.url, 
                    notes: item.notes, 
                    extra: Object.keys(item.extra).length ? item.extra as any : undefined 
                },
            })
        }

        await clearUserViewCache(userId).catch(() => { })
        ok(res, { message: 'Courses saved' })
    } catch (err) {
        if (err instanceof z.ZodError) {
            console.error('[academic/courses/manual POST] Zod validation errors:', JSON.stringify(err.errors, null, 2))
            fail(res, err.errors[0]?.message || 'Validation failed', 'INVALID_PARAMS'); return
        }
        if (err instanceof Error && err.message === 'Course name/title is required') { 
            fail(res, err.message, 'INVALID_PARAMS', 400); return 
        }
        if (err instanceof Error && err.message === 'Course URL must be a valid http or https URL') {
            fail(res, err.message, 'INVALID_PARAMS', 400); return
        }
        
        // Comprehensive error logging to diagnose the 500 error
        console.error('[academic/courses/manual POST] Unexpected Error:', err)
        if (err && typeof err === 'object' && 'code' in err) {
            console.error('Error Code:', (err as any).code)
            console.error('Error Meta:', (err as any).meta)
        }
        
        fail(res, 'Failed to save courses', 'SAVE_FAILED', 500)
    }
})

router.put('/courses/manual/:id', async (req: AuthRequest, res) => {
    try {
        const courseId = String(req.params.id)
        const userId = req.userId!
        const raw = ManualCourseSchema.partial().parse(req.body)
        const existing = await prisma.manualCourse.findFirst({ where: { id: courseId, user_id: userId } })
        if (!existing) { fail(res, 'Course not found', 'NOT_FOUND', 404); return }

        const existingExtra = (existing.extra as Record<string, string> | null) ?? {}
        const newExtra: Record<string, string> = { ...existingExtra }
        if (raw.instructor !== undefined) newExtra.instructor = raw.instructor ?? ''
        if (raw.enrolledDate !== undefined) newExtra.enrolledDate = raw.enrolledDate ?? ''
        if (raw.targetCompletionDate !== undefined) newExtra.targetCompletionDate = raw.targetCompletionDate ?? ''

        const progress = raw.progress ?? raw.percentage ?? existing.progress
        const computedStatus = raw.status ?? (progress >= 100 ? 'completed' : progress > 0 ? 'in_progress' : 'not_started')

        const course = await prisma.manualCourse.update({
            where: { id: courseId },
            data: {
                ...(raw.title || raw.name ? { name: raw.title || raw.name } : {}),
                ...(raw.platform !== undefined ? { platform: raw.platform || raw.provider || null } : {}),
                status: computedStatus,
                progress,
                ...(raw.url !== undefined ? { url: normalizeHttpUrl(raw.url) } : {}),
                ...(raw.notes !== undefined ? { notes: raw.notes } : {}),
                extra: Object.keys(newExtra).length ? newExtra as any : undefined,
            },
        })
        await clearUserViewCache(userId).catch(() => { })
        ok(res, { message: 'Course updated', course: formatCourseForClient(course) })
    } catch (err) {
        if (err instanceof z.ZodError) { fail(res, err.errors[0]?.message || 'Validation failed', 'INVALID_PARAMS'); return }
        if (err instanceof Error && err.message === 'Course URL must be a valid http or https URL') {
            fail(res, err.message, 'INVALID_PARAMS', 400); return
        }
        console.error('[academic/courses/manual PUT]', err)
        fail(res, 'Failed to update course', 'UPDATE_FAILED', 500)
    }
})

router.delete('/courses/manual/:id', async (req: AuthRequest, res) => {
    try {
        const courseId = String(req.params.id)
        const userId = req.userId!
        const existing = await prisma.manualCourse.findFirst({ where: { id: courseId, user_id: userId } })
        if (!existing) { fail(res, 'Course not found', 'NOT_FOUND', 404); return }
        await prisma.manualCourse.delete({ where: { id: courseId } })
        await clearUserViewCache(userId).catch(() => { })
        ok(res, { message: 'Course deleted' })
    } catch (err) {
        if (err instanceof z.ZodError) { fail(res, err.errors[0]?.message || 'Validation failed', 'INVALID_PARAMS'); return }
        console.error('[academic/courses/manual DELETE]', err)
        fail(res, 'Failed to delete course', 'DELETE_FAILED', 500)
    }
})

export default router
