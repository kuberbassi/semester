import { Router } from 'express'
import { normalizeRelatedInstant } from '../utils/timestamps.js'
import crypto, { randomUUID } from 'crypto'
import jwt from 'jsonwebtoken'
import { requireAuth, type AuthRequest } from '../middleware/auth.js'
import { prisma } from '../config/prisma.js'
import { ok, fail } from '../utils/response.js'
import { getClientIp } from '../utils/ip.js'
import { normalizeAttendanceStatus } from '../utils/attendanceStatus.js'
import { 
  collectUserData, 
  clearUserData, 
  restoreUserData, 
  type UserData, 
  normalizeValue,
  getSafeProfileUpdate
} from '../utils/userData.js'
import { 
  performDriveBackup, 
  listDriveBackups, 
  restoreDriveBackup,
  downloadDriveBackup
} from '../utils/googleDrive.js'
import { clearUserViewCache } from '../utils/viewCache.js'

const router = Router()
router.use(requireAuth)

// In-memory rate limit for destructive ops
const _deleteAttempts = new Map<string, Date>()
const DELETE_COOLDOWN_MS = 5 * 60 * 1000
const MAX_DELETE_ENTRIES = 500

function checkDeleteRateLimit(userId: string): { ok: boolean; waitMinutes: number } {
  const now = new Date()
  const last = _deleteAttempts.get(userId)
  if (last) {
    const diff = now.getTime() - last.getTime()
    if (diff < DELETE_COOLDOWN_MS) {
      const wait = Math.ceil((DELETE_COOLDOWN_MS - diff) / 60000)
      return { ok: false, waitMinutes: wait }
    }
  }
  if (_deleteAttempts.size > MAX_DELETE_ENTRIES) {
    for (const [key, date] of _deleteAttempts) {
      if (now.getTime() - date.getTime() > DELETE_COOLDOWN_MS) _deleteAttempts.delete(key)
    }
  }
  _deleteAttempts.set(userId, now)
  return { ok: true, waitMinutes: 0 }
}

// ─── Cryptography Helpers for Secure Backups ──────────────────────────────────
function getEncryptionKey(): Buffer {
  const secret = process.env.JWT_SECRET || 'zenith-backup-encryption-key-fallback-secret-2026'
  return crypto.createHash('sha256').update(secret).digest()
}

function encrypt(text: string): string {
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(16)
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv)
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return iv.toString('hex') + ':' + encrypted
}

function decrypt(encryptedText: string): string {
  const key = getEncryptionKey()
  const parts = encryptedText.split(':')
  if (parts.length !== 2) throw new Error('Invalid encrypted format')
  const iv = Buffer.from(parts[0], 'hex')
  const encrypted = parts[1]
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  return decrypted
}



// ─── Export ──────────────────────────────────────────────────────────────────

router.get('/export_data', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!
    const user = await prisma.user.findUnique({ where: { id: userId } })

    const data = await collectUserData(userId)

    const payload = {
      metadata: { version: '2.0', exported_at: new Date().toISOString(), source_email: user?.email ?? '' },
      data,
    }

    const json = JSON.stringify(payload)
    const encryptedJson = encrypt(json)

    const securePayload = {
      secure: true,
      payload: encryptedJson,
      checksum: crypto.createHash('sha256').update(encryptedJson).digest('hex')
    }

    const finalJson = JSON.stringify(securePayload)
    const email = (user?.email ?? 'user').replace(/@/g, '_at_').replace(/\./g, '_')
    const filename = `semester_export_${email}_${new Date().toISOString().slice(0, 10)}.json`

    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    res.setHeader('Content-Type', 'application/json')
    res.send(finalJson)
  } catch (err) {
    console.error('[data/export]', err)
    fail(res, 'Export failed', 'EXPORT_FAILED', 500)
  }
})

// ─── Import ──────────────────────────────────────────────────────────────────

router.post('/import_data', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!
    const body = req.body as any
    let importData: UserData

    if (body && body.secure === true && typeof body.payload === 'string') {
      if (body.checksum) {
        const check = crypto.createHash('sha256').update(body.payload).digest('hex')
        if (check !== body.checksum) {
          fail(res, 'Backup file integrity verification failed. File may be corrupted or altered.', 'INTEGRITY_FAILED', 400)
          return
        }
      }
      try {
        const decryptedText = decrypt(body.payload)
        const decryptedJson = JSON.parse(decryptedText)
        importData = ((decryptedJson as { data?: UserData })?.data ?? decryptedJson) as UserData
      } catch (decErr: any) {
        fail(res, 'Failed to decrypt secure backup file. Key mismatch or corrupted content.', 'DECRYPTION_FAILED', 400)
        return
      }
    } else {
      importData = ((body as { data?: UserData })?.data ?? body) as UserData
    }

    console.log('[data/import] Received keys:', Object.keys(importData))
    if (!importData || typeof importData !== 'object') { fail(res, 'Invalid import file format', 'INVALID_FORMAT'); return }

    const backupData = await collectUserData(userId)

    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    await prisma.userBackup.create({
      data: { user_id: userId, backup_type: 'pre_import_auto', data: backupData as any, expires_at: expires },
    })
    try {
      console.log(`[data/import] Clearing data for user: ${userId}`)
      await clearUserData(userId)
      await restoreUserData(userId, importData)
      await clearUserViewCache(userId).catch(() => {})
      ok(res, { message: 'Data imported successfully' })
    } catch (txErr: any) {
      console.error('[data/import] Transaction failed at:', txErr.table || 'unknown', txErr)
      try {
        console.warn(`[data/import] Rolling back import for user: ${userId}`)
        await clearUserData(userId)
        await restoreUserData(userId, backupData)
        await clearUserViewCache(userId).catch(() => {})
      } catch (rollbackErr) {
        console.error('[data/import] Rollback failed:', rollbackErr)
      }
      fail(res, `Import failed and previous data was restored: ${txErr.message}`, 'IMPORT_FAILED', 500)
      return
    }

  } catch (err: any) {
    console.error('[data/import] Global error:', err)
    fail(res, `Import failed: ${err.message}`, 'IMPORT_FAILED', 500)
  }
})

// ─── Delete All Data ─────────────────────────────────────────────────────────

router.delete('/delete_all_data', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!

    const rl = checkDeleteRateLimit(userId)
    if (!rl.ok) {
      fail(res, `Please wait ${rl.waitMinutes} more minutes before deleting again.`, 'RATE_LIMITED', 429)
      return
    }

    const body = req.body as { confirmation_email?: string, backup_id?: string }
    const user = await prisma.user.findUnique({ where: { id: userId } })

    // Require backup_id in body
    if (body.confirmation_email && user) {
      if (body.confirmation_email.toLowerCase() !== user.email.toLowerCase()) {
        fail(res, "Email mismatch. Confirmation email doesn't match your account.", 'EMAIL_MISMATCH', 403)
        return
      }
    }

    if (!body.backup_id) {
      fail(res, "Backup required before wipe. Please provide backup_id.", "BACKUP_REQUIRED", 400)
      return
    }

    // Verify backup exists and belongs to user
    const backup = await prisma.userBackup.findFirst({
      where: { id: body.backup_id, user_id: userId }
    })
    if (!backup) {
      fail(res, "Invalid backup_id. Please create a backup first.", "INVALID_BACKUP", 400)
      return
    }

    // Wipe all collections
    const [s, al, t, mc, up, sl] = await Promise.all([
      prisma.subject.deleteMany({ where: { user_id: userId } }),
      // attendance_logs cascade-deleted with subjects — but also delete orphans
      prisma.attendanceLog.deleteMany({ where: { user_id: userId } }),
      prisma.timetable.deleteMany({ where: { user_id: userId } }),
      prisma.manualCourse.deleteMany({ where: { user_id: userId } }),
      prisma.userPreference.deleteMany({ where: { user_id: userId } }),
      prisma.systemLog.deleteMany({ where: { user_id: userId } }),
    ])

    const summary = { subjects: s.count, attendance_logs: al.count, timetable: t.count, semester_results: 0, manual_courses: mc.count, user_preferences: up.count, skills: 0, system_logs: sl.count, notes: 0 }

    await prisma.user.update({
      where: { id: userId },
      data: {
        branch: null,
        course: null,
        college: null,
        batch: null,
        enrollment_number: null,




        admission_year: null,
        current_semester: 1,
        target_attendance: 75,
        attendance_threshold: 75,
        warning_threshold: 76,
        biometrics: {},
        picture: null
      }
    })

    const clientIp = getClientIp(req)
    console.warn(`🚨 DELETE ALL DATA for user ${userId} from IP: ${clientIp}`)

    await prisma.systemLog.create({
      data: { user_id: userId, action: 'Account Reset', description: `All personal data deleted. Backup ID: ${backup.id}. Summary: ${JSON.stringify(summary)}. IP: ${clientIp}.` },
    })

    await clearUserViewCache(userId).catch(() => {})

    const expires = backup.expires_at || new Date()
    ok(res, { message: 'All data wiped successfully.', backup_id: backup.id, backup_expires: expires instanceof Date ? expires.toISOString() : expires, summary })
  } catch (err) {
    console.error('[data/delete_all]', err)
    fail(res, 'Failed to delete data', 'DELETE_FAILED', 500)
  }
})

// ─── Backups ─────────────────────────────────────────────────────────────────

router.post('/backups', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!
    const backupData = await collectUserData(userId)

    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
    const backup = await prisma.userBackup.create({
      data: { user_id: userId, backup_type: 'manual', data: backupData as any, expires_at: expires },
    })

    ok(res, { backup_id: backup.id, expires_at: expires.toISOString() })
  } catch (err) {
    console.error('[data/backups POST]', err)
    fail(res, 'Failed to create backup', 'BACKUP_FAILED', 500)
  }
})

router.get('/backups', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!
    const backups = await prisma.userBackup.findMany({
      where: { user_id: userId, expires_at: { gt: new Date() } },
      select: { id: true, backup_type: true, created_at: true, expires_at: true },
      orderBy: { created_at: 'desc' },
      take: 10,
    })
    ok(res, { backups: backups.map(b => ({
      ...b,
      _id: b.id,
      created_at: normalizeRelatedInstant(b.id, b.created_at, b.created_at),
      expires_at: normalizeRelatedInstant(b.id, b.created_at, b.expires_at),
    })) })
  } catch (err) {
    console.error('[data/backups GET]', err)
    fail(res, 'Failed to list backups', 'LIST_FAILED', 500)
  }
})

router.post('/restore_backup/:backupId', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!
    const backupId = String(req.params.backupId)

    const backup = await prisma.userBackup.findFirst({ where: { id: backupId, user_id: userId } })
    if (!backup) { fail(res, 'Backup not found or access denied', 'NOT_FOUND', 404); return }
    const normalizedExpiry = normalizeRelatedInstant(backup.id, backup.created_at, backup.expires_at)
    if (normalizedExpiry && normalizedExpiry < new Date()) {
      fail(res, 'This backup has expired', 'EXPIRED', 410); return
    }

    const data = backup.data as UserData
    await clearUserData(userId)
    await restoreUserData(userId, data)
    await clearUserViewCache(userId).catch(() => {})

    ok(res, { message: 'Backup restored successfully' })
  } catch (err) {
    console.error('[data/restore]', err)
    fail(res, 'Restore failed', 'RESTORE_FAILED', 500)
  }
})

// ─── Account Data Migration ──────────────────────────────────────────────────

router.post('/migration/initiate', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      fail(res, 'User not found', 'NOT_FOUND', 404)
      return
    }

    const secret = process.env.JWT_SECRET || 'zenith-backup-encryption-key-fallback-secret-2026'
    
    // Sign a token valid for 15 minutes
    const token = jwt.sign(
      {
        from_user_id: userId,
        from_email: user.email,
        purpose: 'account_migration'
      },
      secret,
      { expiresIn: '15m' }
    )

    ok(res, { key: `semester_migrate_${token}` })
  } catch (err) {
    console.error('[data/migration/initiate]', err)
    fail(res, 'Failed to generate migration key', 'MIGRATION_INIT_FAILED', 500)
  }
})

router.post('/migration/complete', async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!
    const { key } = req.body

    if (!key || typeof key !== 'string') {
      fail(res, 'Migration key is required', 'KEY_REQUIRED', 400)
      return
    }

    const token = key
      .replace(/^semester_migrate_/, '')
      .replace(/^zenith_migrate_/, '')
    const secret = process.env.JWT_SECRET || 'zenith-backup-encryption-key-fallback-secret-2026'

    let decoded: any
    try {
      decoded = jwt.verify(token, secret)
    } catch (err) {
      fail(res, 'Invalid or expired migration key', 'INVALID_KEY', 400)
      return
    }

    if (decoded.purpose !== 'account_migration' || !decoded.from_user_id) {
      fail(res, 'Invalid migration key signature', 'INVALID_KEY_PURPOSE', 400)
      return
    }

    const fromUserId = decoded.from_user_id

    if (fromUserId === userId) {
      fail(res, 'Cannot migrate data to the same account', 'SAME_ACCOUNT', 400)
      return
    }

    // Verify source user exists
    const sourceUser = await prisma.user.findUnique({ where: { id: fromUserId } })
    if (!sourceUser) {
      fail(res, 'Source user account no longer exists', 'SOURCE_NOT_FOUND', 404)
      return
    }

    const destinationUser = await prisma.user.findUnique({ where: { id: userId } })
    if (!destinationUser) {
      fail(res, 'Destination user account not found', 'DEST_NOT_FOUND', 404)
      return
    }

    // 1. Collect backups of both accounts in case of any transaction failure
    const [sourceData, destData] = await Promise.all([
      collectUserData(fromUserId),
      collectUserData(userId)
    ])

    const backupExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days safety backup
    await Promise.all([
      prisma.userBackup.create({
        data: { user_id: fromUserId, backup_type: 'pre_migration_source', data: sourceData as any, expires_at: backupExpires }
      }),
      prisma.userBackup.create({
        data: { user_id: userId, backup_type: 'pre_migration_destination', data: destData as any, expires_at: backupExpires }
      })
    ]).catch(() => null)

    // 2. Clear destination user data to avoid conflicts
    await clearUserData(userId)

    // 3. Restore source data into destination user
    await restoreUserData(userId, sourceData)

    // 4. Update destination profile fields if empty but exist in source
    const updateData: Record<string, any> = {}
    const fields = [
      'branch', 'course', 'college', 'batch', 'enrollment_number',
      'admission_year',
      'current_semester', 'target_attendance', 'attendance_threshold', 'warning_threshold',
      'biometrics', 'picture'
    ]
    for (const f of fields) {
      if (!destinationUser[f as keyof typeof destinationUser] && sourceUser[f as keyof typeof sourceUser]) {
        updateData[f] = sourceUser[f as keyof typeof sourceUser]
      }
    }
    if (Object.keys(updateData).length > 0) {
      await prisma.user.update({ where: { id: userId }, data: updateData })
    }

    // 5. Completely clear and purge source user account
    await clearUserData(fromUserId)
    await prisma.user.delete({ where: { id: fromUserId } })

    // Clear caches for both accounts
    await Promise.all([
      clearUserViewCache(userId),
      clearUserViewCache(fromUserId)
    ]).catch(() => null)

    // Create system log for auditing
    await prisma.systemLog.create({
      data: {
        user_id: userId,
        action: 'Account Migration',
        description: `Successfully migrated all academic data from user ID ${fromUserId} (${decoded.from_email}) to ${destinationUser.email}.`
      }
    }).catch(() => null)

    ok(res, { message: 'Account data migrated successfully.' })
  } catch (err) {
    console.error('[data/migration/complete]', err)
    fail(res, 'Failed to complete migration', 'MIGRATION_FAILED', 500)
  }
})

// ─── Google Drive Cloud Backup & Restore ──────────────────────────────────────

router.post('/drive/backup', async (req: AuthRequest, res) => {
  try {
    const result = await performDriveBackup(req.userId!)
    if (result.success) {
      ok(res, { message: 'Backup created successfully on Google Drive', file_id: result.fileId })
    } else {
      fail(res, result.error || 'Drive backup failed', 'DRIVE_BACKUP_FAILED', 400)
    }
  } catch (err) {
    console.error('[data/drive/backup]', err)
    fail(res, 'Internal server error during Google Drive backup', 'DRIVE_BACKUP_ERROR', 500)
  }
})

router.get('/drive/backups', async (req: AuthRequest, res) => {
  try {
    const result = await listDriveBackups(req.userId!)
    if (result.success) {
      ok(res, { backups: result.backups })
    } else {
      fail(res, result.error || 'Failed to list backups', 'DRIVE_LIST_FAILED', 400)
    }
  } catch (err) {
    console.error('[data/drive/backups]', err)
    fail(res, 'Internal server error listing Google Drive backups', 'DRIVE_LIST_ERROR', 500)
  }
})

router.post('/drive/restore/:fileId', async (req: AuthRequest, res) => {
  try {
    const fileId = String(req.params.fileId)
    const result = await restoreDriveBackup(req.userId!, fileId)
    if (result.success) {
      await clearUserViewCache(req.userId!).catch(() => {})
      ok(res, { message: 'Backup restored successfully from Google Drive' })
    } else {
      fail(res, result.error || 'Drive restore failed', 'DRIVE_RESTORE_FAILED', 400)
    }
  } catch (err) {
    console.error('[data/drive/restore]', err)
    fail(res, 'Internal server error restoring Google Drive backup', 'DRIVE_RESTORE_ERROR', 500)
  }
})

router.get('/drive/download/:fileId', async (req: AuthRequest, res) => {
  try {
    const fileId = String(req.params.fileId)
    const result = await downloadDriveBackup(req.userId!, fileId)
    if (result.success) {
      const email = (req.user?.email ?? 'user').replace(/@/g, '_at_').replace(/\./g, '_')
      const filename = `semester_drive_backup_${email}_${fileId}.json`
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.setHeader('Content-Type', 'application/json')
      res.send(JSON.stringify(result.data))
    } else {
      fail(res, result.error || 'Drive download failed', 'DRIVE_DOWNLOAD_FAILED', 400)
    }
  } catch (err) {
    console.error('[data/drive/download]', err)
    fail(res, 'Internal server error downloading Google Drive backup', 'DRIVE_DOWNLOAD_ERROR', 500)
  }
})

router.get('/drive/status', async (req: AuthRequest, res) => {
  try {
    const pref = await prisma.userPreference.findUnique({
      where: { user_id: req.userId! },
      select: { preferences: true }
    })
    const current = (pref?.preferences ?? {}) as Record<string, any>
    ok(res, {
      google_drive_linked: !!current.google_drive_linked,
      google_drive_backup_frequency: current.google_drive_backup_frequency || 'never',
      google_drive_last_backup: current.google_drive_last_backup || null,
      has_refresh_token: !!current.google_drive_refresh_token
    })
  } catch (err) {
    console.error('[data/drive/status]', err)
    fail(res, 'Failed to fetch Google Drive status', 'STATUS_FAILED', 500)
  }
})

router.post('/drive/settings', async (req: AuthRequest, res) => {
  try {
    const { frequency } = req.body
    if (!['daily', 'weekly', 'monthly', 'never'].includes(frequency)) {
      fail(res, 'Invalid frequency. Must be daily, weekly, monthly, or never', 'INVALID_FREQUENCY', 400)
      return
    }

    const pref = await prisma.userPreference.findUnique({
      where: { user_id: req.userId! }
    })
    const current = (pref?.preferences ?? {}) as Record<string, any>
    const nextPrefs = {
      ...current,
      google_drive_backup_frequency: frequency
    }

    await prisma.userPreference.upsert({
      where: { user_id: req.userId! },
      create: { user_id: req.userId!, preferences: nextPrefs as any },
      update: { preferences: nextPrefs as any }
    })

    ok(res, { message: 'Google Drive backup settings updated.' })
  } catch (err) {
    console.error('[data/drive/settings]', err)
    fail(res, 'Failed to update Google Drive settings', 'SETTINGS_FAILED', 500)
  }
})

router.post('/drive/disconnect', async (req: AuthRequest, res) => {
  try {
    const pref = await prisma.userPreference.findUnique({
      where: { user_id: req.userId! }
    })
    const current = (pref?.preferences ?? {}) as Record<string, any>
    const nextPrefs = { ...current }
    delete nextPrefs.google_drive_linked
    delete nextPrefs.google_drive_refresh_token
    delete nextPrefs.google_drive_backup_frequency
    delete nextPrefs.google_drive_last_backup

    await prisma.userPreference.update({
      where: { user_id: req.userId! },
      data: { preferences: nextPrefs as any }
    })

    ok(res, { message: 'Google Drive disconnected successfully.' })
  } catch (err) {
    console.error('[data/drive/disconnect]', err)
    fail(res, 'Failed to disconnect Google Drive', 'DISCONNECT_FAILED', 500)
  }
})

export default router


