import { Router } from 'express'
import { z } from 'zod'
import { prisma } from '../config/prisma.js'
import { ENV } from '../config/env.js'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { ok, fail } from '../utils/response.js'
import { AttendanceCalculator, calculateAttendanceExcludingMedical, calculateAttendanceWithMedicalAsAbsent } from '../lib/calculations.js'
import { callLLM, ChatMessage } from '../utils/llm.js'
import { normalizeLegacyPrismaInstant } from '../utils/timestamps.js'

const router = Router()
router.use(requireAuth)

const ChatSchema = z.object({
    message: z.string().min(1),
    history: z.array(z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string()
    })).optional(),
    selectedSemester: z.number().optional()
})

/**
 * Builds a comprehensive data profile for the AI context.
 */
async function buildFullContext(req: AuthRequest, selectedSemester?: number): Promise<string> {
    const userId = req.userId!
    const now = new Date()
    const dateParts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now)
    const datePart = (type: Intl.DateTimeFormatPartTypes) => dateParts.find(part => part.type === type)?.value || ''
    const today = `${datePart('year')}-${datePart('month')}-${datePart('day')}`
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
    const todayStr = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Kolkata', weekday: 'long' }).format(now)

    const user = await prisma.user.findUnique({ where: { id: userId } })
    const activeSem = selectedSemester || user?.current_semester || 1
    const attendanceSemesterFilter = {
        OR: [
            { semester: activeSem },
            { semester: null, subject: { is: { semester: activeSem } } },
        ],
    }

    const [subjects, recentLogs, todayAttendanceLogs, medicalLeaveCount, allTimetables, courses, prefs, backups, systemLogs] = await Promise.all([
        prisma.subject.findMany({ where: { user_id: userId, semester: activeSem } }),
        prisma.attendanceLog.findMany({ where: { user_id: userId, ...attendanceSemesterFilter }, orderBy: [{ date: 'desc' }, { timestamp: 'desc' }], take: 30 }),
        prisma.attendanceLog.findMany({ where: { user_id: userId, date: today, ...attendanceSemesterFilter }, orderBy: { timestamp: 'asc' } }),
        prisma.attendanceLog.count({ where: { user_id: userId, ...attendanceSemesterFilter, status: { in: ['medical', 'approved_medical'] } } }),
        prisma.timetable.findMany({ where: { user_id: userId } }),
        prisma.manualCourse.findMany({ where: { user_id: userId } }),
        prisma.userPreference.findUnique({ where: { user_id: userId } }),
        prisma.userBackup.findMany({ where: { user_id: userId }, orderBy: { created_at: 'desc' } }),
        prisma.systemLog.findMany({ where: { user_id: userId }, orderBy: { timestamp: 'desc' }, take: 20 })
    ])

    const resolvedTimetable = allTimetables.find(t => t.semester === activeSem)

    const lines: string[] = []
    lines.push('## Context Metadata')
    lines.push(`Generated At: ${new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'full', timeStyle: 'long' }).format(now)}`)
    lines.push('Authoritative Timezone For Today: Asia/Kolkata (IST)')
    lines.push(`Authoritative Today: ${today} (${todayStr})`)
    lines.push(`Selected Semester Scope: ${activeSem}`)
    lines.push('Assistant Access: Read-only database context; cannot perform attendance or settings mutations.')
    lines.push('')

    if (user) {
        lines.push('## User Profile')
        lines.push(`Name: ${user.name || 'Student'}`)
        lines.push(`Email: ${user.email}`)

        lines.push(`Institution/College: ${user.college || 'Unknown'}`)
        lines.push(`Course: ${user.course || 'N/A'}`)
        lines.push(`Branch: ${user.branch || 'N/A'}`)
        lines.push(`Batch: ${user.batch || 'N/A'}`)
        lines.push(`Enrollment Number: ${user.enrollment_number || 'N/A'}`)
        lines.push(`Admission Year: ${user.admission_year || 'N/A'}`)
        lines.push(`Current Semester: ${user.current_semester || 1}`)
        lines.push(`Default Target Attendance: ${user.target_attendance || 75}%`)
        lines.push(`Attendance Threshold: ${user.attendance_threshold || 75}%`)
        lines.push(`Warning Threshold: ${user.warning_threshold || 76}%`)
        lines.push(`Active Selected Semester (UI State): ${selectedSemester || user.current_semester || 1}`)
        lines.push('')
    }

    // Google Drive backup preferences and status
    const preferences = (prefs?.preferences ?? {}) as Record<string, any>
    const isDriveActive = !!preferences.google_drive_linked
    const lastBackup = preferences.google_drive_last_backup || 'Never'
    const backupFreq = preferences.google_drive_backup_frequency || 'never'
    lines.push('## Google Drive Cloud Backup Settings')
    lines.push(`Backup Active (Linked): ${isDriveActive ? 'YES' : 'NO'}`)
    lines.push(`Backup Frequency: ${backupFreq}`)
    lines.push(`Last Backup Timestamp: ${lastBackup}`)
    lines.push('')


    if (subjects.length) {
        lines.push('## Subjects, Attendance & Trackers')
        let totalPracticals = 0
        let completedPracticals = 0
        let submittedPracticalSubjects = 0
        let practicalSubjectCount = 0
        let totalAssignments = 0
        let completedAssignments = 0
        let submittedAssignmentSubjects = 0
        let assignmentSubjectCount = 0

        for (const sub of subjects) {
            const attended = sub.attended ?? 0
            const total = sub.total ?? 0
            const pct = AttendanceCalculator.calculatePercentage(attended, total)
            const target = sub.target ?? user?.attendance_threshold ?? 75
            
            // Calculate bunk guard details programmatically to prevent LLM mathematical hallucinations
            const bg = AttendanceCalculator.calculateBunkGuard(attended, total, target)
            const categories = sub.categories || []
            const isPractical = categories.includes('Practical')
            const isAssignment = categories.includes('Assignment')
            
            let trackerInfo = ''
            if (isPractical) {
                const p = (sub.practicals as any) || { total: 10, completed: 0, hardcopy: false }
                trackerInfo += ` | Practicals: ${p.completed}/${p.total} | Practical submission: ${p.hardcopy ? 'Submitted' : 'Unsubmitted'}`
                totalPracticals += Number(p.total ?? 0)
                completedPracticals += Number(p.completed ?? 0)
                practicalSubjectCount += 1
                if (p.hardcopy) submittedPracticalSubjects += 1
            }
            if (isAssignment) {
                const a = (sub.assignments as any) || { total: 4, completed: 0, hardcopy: false }
                trackerInfo += ` | Assignments: ${a.completed}/${a.total} | Assignment submission: ${a.hardcopy ? 'Submitted' : 'Unsubmitted'}`
                totalAssignments += Number(a.total ?? 0)
                completedAssignments += Number(a.completed ?? 0)
                assignmentSubjectCount += 1
                if (a.hardcopy) submittedAssignmentSubjects += 1
            }

            lines.push(`  - ${sub.name} (Code: ${sub.code || 'N/A'}, Semester: ${sub.semester} - Selected): Current: ${pct}% (${attended}/${total}) | Target: ${target}% | Bunk Status: ${bg.status_message}${trackerInfo}`)
        }
        
        const summary = AttendanceCalculator.getAttendanceSummary(subjects, user?.attendance_threshold ?? 75, user?.warning_threshold ?? 76)
        const adjustedOverallAttendance = calculateAttendanceExcludingMedical(
            summary.total_attended,
            summary.total_classes,
            medicalLeaveCount,
        )
        const attendanceWithMedicalAsAbsent = calculateAttendanceWithMedicalAsAbsent(
            summary.total_attended,
            summary.total_classes,
            medicalLeaveCount,
        )
        
        lines.push('')
        lines.push('## Analytics KPIs')
        lines.push(`Official Overall Attendance (medical leaves excluded): ${Math.max(0, summary.total_attended - medicalLeaveCount)}/${Math.max(0, summary.total_classes - medicalLeaveCount)} = ${adjustedOverallAttendance}% (${medicalLeaveCount} medical leave${medicalLeaveCount === 1 ? '' : 's'} excluded)`)
        lines.push(`Attendance With Medical Leaves Counted As Absent: ${Math.max(0, summary.total_attended - medicalLeaveCount)}/${summary.total_classes} = ${attendanceWithMedicalAsAbsent}%`)
        lines.push(`Overall Attendance Status: ${summary.risk_level}`)
        lines.push(`Safe Bunks Remaining (Overall): ${summary.safe_bunks_remaining}`)
        lines.push(`Total Practical Items Tracked: ${completedPracticals}/${totalPracticals} Completed`)
        lines.push(`Practical Subject Submissions: ${submittedPracticalSubjects}/${practicalSubjectCount} Submitted`)
        lines.push(`Total Assignment Items Tracked: ${completedAssignments}/${totalAssignments} Completed`)
        lines.push(`Assignment Subject Submissions: ${submittedAssignmentSubjects}/${assignmentSubjectCount} Submitted`)
        lines.push('')
    }

    if (recentLogs.length) {
        lines.push('## Recent Attendance Logs (Last 30 entries)')
        for (const log of recentLogs) {
            lines.push(`  - ${log.date} | ${log.subject_name}: ${log.status} (${log.type})${log.notes ? ` - Note: ${log.notes}` : ''}`)
        }
        lines.push('')
    }

    lines.push('## Cloud Backup History')
    lines.push(`Total Backups Done: ${backups.length}`)
    if (backups.length > 0) {
        const latest = backups[0]
        lines.push(`Latest Backup Date & Time: ${new Date(latest.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', timeZoneName: 'short' })}`)
        for (let i = 0; i < backups.length; i++) {
            const b = backups[i]
            lines.push(`  - Backup #${i + 1}: Timestamp: ${new Date(b.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Kolkata', timeZoneName: 'short' })} | Type: ${b.backup_type} | Expires: ${new Date(b.expires_at).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' })}`)
        }
    } else {
        lines.push('No cloud backups completed yet.')
    }
    lines.push('')

    if (resolvedTimetable) {
        const schedule = (resolvedTimetable.schedule as any) || {}
        lines.push('## COMPLETE WEEKLY ACADEMIC SCHEDULE')
        for (const day of ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']) {
            const slots = schedule[day]
            if (slots?.length) {
                lines.push(`  ### ${day}${day === todayStr ? ' (TODAY)' : ''}`)
                for (const slot of slots) {
                    const subId = String(slot.subject_id || '')
                    const subName = subjects.find((s: any) => String(s.id) === subId)?.name || String(slot.label || 'Activity')
                    lines.push(`    - ${slot.start_time}: ${subName} (${slot.type || 'Lecture'})`)
                }
            } else {
                lines.push(`  ### ${day}${day === todayStr ? ' (TODAY)' : ''}`)
                lines.push(`    - No classes scheduled.`)
            }
        }
        lines.push('')

        const todaySlots = schedule[todayStr]
        if (todaySlots?.length) {
            const matchedLogIds = new Set<string>()
            let previousClass: any = null
            let blockStart = ''
            let currentBlockHasLog = false
            const pending = todaySlots.filter((slot: any) => {
                const subId = String(slot.subject_id || '')
                const slotType = String(slot.type || 'Lecture')
                const normalizedType = slotType.toLowerCase()
                const isClass = !!subId && !['break', 'lunch', 'gap', 'free', 'custom'].includes(normalizedType)
                if (!isClass) {
                    previousClass = null
                    blockStart = ''
                    return false
                }

                const continuesBlock = previousClass
                    && String(previousClass.subject_id || '') === subId
                    && String(previousClass.type || 'Lecture') === slotType
                if (continuesBlock) {
                    previousClass = slot
                    return false
                }
                blockStart = String(slot.start_time || slot.startTime || slot.time || '')
                previousClass = slot
                const blockType = `${slotType}::${blockStart}`
                const exact = todayAttendanceLogs.find((log: any) =>
                    !matchedLogIds.has(String(log.id))
                    && String(log.subject_id) === subId
                    && String(log.type) === blockType
                )
                const legacy = exact || todayAttendanceLogs.find((log: any) =>
                    !matchedLogIds.has(String(log.id))
                    && String(log.subject_id) === subId
                    && String(log.type) === slotType
                )
                if (legacy) matchedLogIds.add(String(legacy.id))
                currentBlockHasLog = !!legacy
                return !currentBlockHasLog
            })

            if (pending.length) {
                lines.push('## Pending Attendance (To be marked today)')
                for (const p of pending) {
                    const subName = subjects.find((s: any) => String(s.id) === String(p.subject_id))?.name || String(p.label || 'Unknown')
                    lines.push(`  - [ ] ${p.start_time}: ${subName} (${p.type || 'Class'})`)
                }
                lines.push('')
            }

            lines.push('## Today Attendance Operation State')
            lines.push(`Existing Marked Records Today: ${todayAttendanceLogs.length}`)
            lines.push(`Bulk Mark Eligibility: ${todayAttendanceLogs.length === 0 ? 'ALLOWED - date is empty' : 'BLOCKED - use Unmark all first because at least one record exists'}`)
            lines.push(`Pending Scheduled Attendance Blocks: ${pending.length}`)
            lines.push('Bulk marking can only use Present, Absent, Medical Leave, or Cancelled. Substitution must be marked individually.')
            lines.push('')
        }
    } else {
        lines.push(`## Weekly Timetable\nNo timetable is stored for selected Semester ${activeSem}. Do not use another semester's timetable as a fallback.\n`)
    }

    if (courses.length) {
        lines.push('## Active Online Courses')
        const completed = courses.filter(c => c.status === 'Completed' || c.progress === 100).length
        lines.push(`Total Courses Tracked: ${courses.length} | Completed: ${completed} | Active: ${courses.length - completed}`)
        for (const course of courses) {
            lines.push(`  - ${course.name || 'Untitled'} | Platform: ${course.platform || 'N/A'} | Progress: ${course.progress ?? 0}% | Status: ${course.status || 'Active'}${course.url ? ` | URL: ${course.url}` : ''}`)
        }
        lines.push('')
    }


    if (systemLogs.length) {
        lines.push('## Recent Activity Logs (Last 20, newest first)')
        for (const log of systemLogs) {
            lines.push(`  - Event ${log.id} | ${normalizeLegacyPrismaInstant(log.id, log.timestamp).toISOString()} (UTC) | ${log.action}: ${log.description}`)
        }
        lines.push('')
    }

    return lines.join('\n')
}

const systemPrompt = `You are Semester Assistant, a high-performance AI academic strategist.

You have direct, real-time access to the student's unified database. Your mission is to provide precise reporting, strategic planning, and automated check-ins. Make your replies ultra-useful and concrete.

## Operational Directives
1. TRUTHFULNESS: Use ONLY the provided context. If context is missing, report it.
2. FULL WEEK AWARENESS: If "COMPLETE WEEKLY ACADEMIC SCHEDULE" exists in context, use the requested day's exact slots. If it is absent, say that no timetable is stored for the selected semester.
3. BUNK ESTIMATIONS & DEFICIT RISK: For attendance queries, use each subject's provided target and calculated Bunk Status exactly:
   - List subjects below their own configured target in a **DEFICIT WARNING** section.
   - Exactly how many classes they need to attend consecutively to restore safety, or how many they are safe to skip (bunk).
4. STUDY STRATEGY & TACTICS: If a student asks about performance or optimization:
   - Identify low-attendance subjects, incomplete trackers, or low-progress online courses that are actually present in context.
   - Suggest a concrete 3-step study or attendance strategy to optimize their semester.
5. METRIC UNIFICATION: Use Official Overall Attendance and Attendance With Medical Leaves Counted As Absent as separate definitive metrics. Clearly label which percentage you quote and never treat the medical-as-absent scenario as official attendance. Do not claim CGPA, SGPA, marks, grades, or academic-strength data unless those exact values appear in context.
6. TODAY'S PENDING ACTION: When asked about today, attendance status, or planning, report the supplied pending attendance blocks. Do not call an already-marked block pending.
7. SEMESTER CURATION: The context specifies the active selected semester (UI State). Unless the user explicitly specifies a particular semester in their prompt, you MUST default your answers and stats analysis to the currently active selected semester.
8. TRACKER & ACTIVITY PRECISION: Practical/assignment item progress and submission state are independent. "Unsubmitted" does not mean incomplete. For activity questions, quote the event ID, action, and UTC timestamp supplied in context; never infer an action from attendance-log creation time.
9. ATTENDANCE MUTATION RULES: You are read-only. Explain how to use the UI but never claim you marked, edited, submitted, unmarked, or changed anything. Bulk mark is allowed only when the context says the selected date is empty; otherwise instruct the user to use Unmark all first. Substitution is never a bulk option.
10. TIME & DATE: Treat Context Metadata's Asia/Kolkata date as authoritative for "today". Activity timestamps are explicitly UTC; state the timezone whenever quoting them and do not shift dates mentally.

## Strict Anti-Hallucination & Verification Guidelines (Targeting 99.9% Accuracy)
- NEVER make up, invent, or extrapolate facts, grades, dates, backup statuses, or logs.
- If the user asks about a subject or a value that is NOT in the CURRENT ACADEMIC CONTEXT, state clearly: "This information is not present in your profile database." Do NOT assume or guess.
- Use provided calculations such as Bunk Status and attendance KPIs as the single source of truth. Do not recompute or contradict them.
- Always quote the exact numbers and text from the context.
- Ground every answer in the relevant context category without pretending unavailable categories exist.

## Design, Tone and Length
- Persona: High-impact Academic Strategist. Tactical, professional, and extremely direct.
- Formatting: Give ultra-concise, short, crisp answers. Avoid wordy explanations, meta-commentary, or verbose transitions.
- Maximum Length: Usually stay under 150 words with 2-3 clean bullets; exceed this only when the user explicitly requests an exhaustive schedule or report.
- Bolding: Use **bolding** for all metrics and numbers.`

async function chatHandler(req: AuthRequest, res: any) {
    try {
        const body = ChatSchema.parse(req.body)
        const { message, history = [], selectedSemester } = body

        // Detect if user is asking about a specific semester in their message
        let finalSemester = selectedSemester
        const semRegex = /(?:sem|semester)\s*([1-8])/i
        const match = message.match(semRegex)
        if (match) {
            finalSemester = parseInt(match[1], 10)
        }

        let context = ''
        try {
            context = await buildFullContext(req, finalSemester)
        } catch (contextErr) {
            console.error('[ai/chat] context build failed:', contextErr)
            context = 'Profile sync temporarily unavailable.'
        }

        const messages: ChatMessage[] = [
            { role: 'system', content: `${systemPrompt}\n\nCURRENT ACADEMIC CONTEXT:\n${context}` },
            ...history,
            { role: 'user', content: message }
        ]

        const aiResponse = await callLLM(messages, {
            temperature: 0.2,
            maxTokens: 512
        })

        ok(res, { response: aiResponse })
    } catch (err: any) {
        if (err instanceof z.ZodError) { fail(res, 'Invalid message', 'VALIDATION_ERROR', 400); return }
        console.error('[ai/chat]', err)
        fail(res, err.message || 'Failed to process message', 'SERVER_ERROR', 500)
    }
}

const ProcessNoteSchema = z.object({
    content: z.string(),
    action: z.enum(['reformat', 'improve', 'custom']),
    customPrompt: z.string().optional()
})

async function processNoteHandler(req: AuthRequest, res: any) {
    try {
        const body = ProcessNoteSchema.parse(req.body)
        const { content, action, customPrompt } = body

        let systemInstruction = ''
        const DATA_PRESERVATION_PROTOCOL = `
CRITICAL DATA PRESERVATION PROTOCOL (99.9% ACCURACY TARGET):
- Absolutely ZERO information loss is allowed. Do NOT summarize, omit, truncate, or skip any facts, dates, names, links, image tags, checklists, details, numbers, or bullet points present in the original HTML.
- Do NOT hallucinate new facts, details, links, or dates.
- Keep all HTML links (<a href="...">...</a>) and inline tags exactly as they are without modifying their attributes.
- Your output must consist ONLY of valid, clean, semantic HTML. Do not wrap the code in markdown code blocks (like \`\`\`html or \`\`\`). Do not output any chat or conversational prefix/suffix (e.g., "Here is your note:").`

        if (action === 'reformat') {
            systemInstruction = `You are an AI writing assistant specializing in structural organization, layout cleaning, and professional styling.
Your task is to take the user's HTML note and reformat its layout, spacing, list hierarchy, and structure.
${DATA_PRESERVATION_PROTOCOL}
Specific rules for Re-Format:
1. Re-organize spacing, fix improper list nests, alignment, and messy paragraph spacing.
2. Group related items logically with headings (h1, h2, h3) and list structures if they are disorganized, but never remove any content.
3. Make the formatting look premium, neat, and highly readable.`
        } else if (action === 'improve') {
            systemInstruction = `You are an AI writing assistant specializing in language enhancement, grammatical checking, and stylistic improvements.
Your task is to take the user's HTML note and polish its writing style, phrasing, clarity, and tone.
${DATA_PRESERVATION_PROTOCOL}
Specific rules for Improve Writing:
1. Improve vocabulary, fix grammar/spelling errors, and make sentences flow smoother.
2. Retain the structure (lists, headings, paragraph flow) of the original HTML as much as possible.
3. Do not rewrite so aggressively that the original details or context are lost or obscured.`
        } else {
            const userInstructions = customPrompt || 'Improve this note.'
            systemInstruction = `You are an AI writing assistant. The user wants you to modify/improve their HTML note based on this request: "${userInstructions}".
${DATA_PRESERVATION_PROTOCOL}
Specific rules for Custom Prompt:
1. Apply the user's specific request: "${userInstructions}" to modify or refine the note content.
2. If the user request does not ask to delete a specific piece of information, you MUST preserve 100% of all details, links, images, dates, and numbers.
3. If the user's request is a refinement command (e.g., "make the second point bold" or "add a summary at the end"), perform it while keeping all other parts of the document fully intact.`
        }

        const messages: ChatMessage[] = [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: content }
        ]

        let aiResponse = await callLLM(messages, {
            temperature: 0.1,
            maxTokens: 1536
        })

        // Sanitize any wrapped markdown code block symbols if they were generated
        if (aiResponse.includes('```')) {
            aiResponse = aiResponse.replace(/```html/g, '').replace(/```/g, '').trim()
        }

        ok(res, { processedContent: aiResponse })
    } catch (err: any) {
        if (err instanceof z.ZodError) { fail(res, 'Invalid input parameters', 'VALIDATION_ERROR', 400); return }
        console.error('[ai/process_note]', err)
        fail(res, err.message || 'Failed to process note', 'SERVER_ERROR', 500)
    }
}

router.post('/chat', chatHandler)
router.post('/chat_v2', chatHandler)
router.post('/process_note', processNoteHandler)

export default router


