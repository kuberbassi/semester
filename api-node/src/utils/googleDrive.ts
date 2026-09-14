import { OAuth2Client } from 'google-auth-library'
import axios from 'axios'
import { ENV } from '../config/env.js'
import { prisma } from '../config/prisma.js'
import { collectUserData, clearUserData, restoreUserData, type UserData } from './userData.js'
import { decryptSecret, encryptSecret, isEncryptedSecret } from './secrets.js'

// New backups use Semester branding. The legacy prefix remains in list queries
// so existing user backups do not disappear after the rename.
const DRIVE_BACKUP_QUERY = "name contains 'semester_backup_' or name contains 'zenith_backup_'"

async function getDriveAccessToken(userId: string): Promise<string | null> {
  const pref = await prisma.userPreference.findUnique({
    where: { user_id: userId },
    select: { preferences: true }
  })
  if (!pref) return null
  const preferences = (pref.preferences ?? {}) as Record<string, any>
  const storedRefreshToken = preferences.google_drive_refresh_token
  if (!storedRefreshToken || typeof storedRefreshToken !== 'string') return null

  try {
    const refreshToken = decryptSecret(storedRefreshToken)
    const oauth2Client = new OAuth2Client(
      ENV.GOOGLE_CLIENT_ID,
      ENV.GOOGLE_CLIENT_SECRET
    )
    oauth2Client.setCredentials({ refresh_token: refreshToken })
    const { token } = await oauth2Client.getAccessToken()
    if (!isEncryptedSecret(storedRefreshToken)) {
      const nextPreferences = {
        ...preferences,
        google_drive_refresh_token: encryptSecret(refreshToken)
      }
      await prisma.userPreference.update({
        where: { user_id: userId },
        data: { preferences: nextPreferences as any }
      }).catch(() => null)
    }
    return token || null
  } catch (err) {
    console.error('[Google Drive] Failed to get access token from refresh token:', err)
    return null
  }
}

export async function cleanOldDriveBackups(accessToken: string): Promise<void> {
  try {
    const listResponse = await axios.get(
      'https://www.googleapis.com/drive/v3/files',
      {
        params: {
          spaces: 'appDataFolder',
          q: DRIVE_BACKUP_QUERY,
          orderBy: 'createdTime desc',
          pageSize: 20
        },
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    )

    const files = listResponse.data?.files || []
    if (files.length > 5) {
      const filesToDelete = files.slice(5)
      for (const file of filesToDelete) {
        await axios.delete(`https://www.googleapis.com/drive/v3/files/${file.id}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`
          }
        }).catch((err) => {
          console.error(`[Google Drive] Failed to delete old backup file ${file.id}:`, err?.message)
        })
      }
    }
  } catch (err) {
    console.error('[Google Drive Clean Old Backups Error]', err)
  }
}

export async function performDriveBackup(userId: string): Promise<{ success: boolean; fileId?: string; error?: string }> {
  const accessToken = await getDriveAccessToken(userId)
  if (!accessToken) {
    return { success: false, error: 'Google Drive is not linked or authorization expired' }
  }

  try {
    const backupData = await collectUserData(userId)

    const backupContent = JSON.stringify(backupData)
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
    const filename = `semester_backup_${timestamp}.json`

    const metadata = {
      name: filename,
      parents: ['appDataFolder']
    }

    const boundary = '-------314159265358979323846'
    const delimiter = `\r\n--${boundary}\r\n`
    const closeDelimiter = `\r\n--${boundary}--`

    const body =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      'Content-Type: application/json\r\n\r\n' +
      backupContent +
      closeDelimiter

    const uploadResponse = await axios.post(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      body,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`
        }
      }
    )

    const fileId = uploadResponse.data?.id
    if (!fileId) {
      throw new Error('No file ID returned from Google Drive upload')
    }

    // Update last backup timestamp in preferences
    const pref = await prisma.userPreference.findUnique({
      where: { user_id: userId }
    })
    const preferences = (pref?.preferences ?? {}) as Record<string, any>
    const nextPreferences = {
      ...preferences,
      google_drive_last_backup: new Date().toISOString()
    }
    await prisma.userPreference.update({
      where: { user_id: userId },
      data: { preferences: nextPreferences as any }
    })

    // Keep only the 5 most recent backups
    await cleanOldDriveBackups(accessToken)

    return { success: true, fileId }
  } catch (err: any) {
    console.error('[Google Drive Backup Error]', err?.response?.data || err)
    return { success: false, error: err.message || 'Failed to upload backup to Google Drive' }
  }
}

export async function listDriveBackups(userId: string): Promise<{ success: boolean; backups?: any[]; error?: string }> {
  const accessToken = await getDriveAccessToken(userId)
  if (!accessToken) {
    return { success: false, error: 'Google Drive is not linked or authorization expired' }
  }

  try {
    const listResponse = await axios.get(
      'https://www.googleapis.com/drive/v3/files',
      {
        params: {
          spaces: 'appDataFolder',
          q: DRIVE_BACKUP_QUERY,
          orderBy: 'createdTime desc',
          fields: 'files(id, name, createdTime, size)',
          pageSize: 20
        },
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      }
    )

    const files = listResponse.data?.files || []
    return {
      success: true,
      backups: files.map((f: any) => ({
        id: f.id,
        name: f.name,
        created_at: f.createdTime,
        size: f.size
      }))
    }
  } catch (err: any) {
    console.error('[Google Drive List Error]', err?.response?.data || err)
    return { success: false, error: err.message || 'Failed to list backups from Google Drive' }
  }
}

export async function restoreDriveBackup(userId: string, fileId: string): Promise<{ success: boolean; error?: string }> {
  const accessToken = await getDriveAccessToken(userId)
  if (!accessToken) {
    return { success: false, error: 'Google Drive is not linked or authorization expired' }
  }

  try {
    const fileResponse = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        params: { alt: 'media' },
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )

    const rawData = fileResponse.data as UserData
    if (!rawData || typeof rawData !== 'object') {
      return { success: false, error: 'Invalid backup file content received from Google Drive' }
    }

    // Safety backup to local database
    const currentData = await collectUserData(userId)
    const backupExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    await prisma.userBackup.create({
      data: {
        user_id: userId,
        backup_type: 'pre_drive_restore_safety',
        data: currentData as any,
        expires_at: backupExpires
      }
    }).catch(() => null)

    // Overwrite data
    await clearUserData(userId)
    await restoreUserData(userId, rawData)

    return { success: true }
  } catch (err: any) {
    console.error('[Google Drive Restore Error]', err?.response?.data || err)
    return { success: false, error: err.message || 'Failed to restore backup from Google Drive' }
  }
}

export async function downloadDriveBackup(userId: string, fileId: string): Promise<{ success: boolean; data?: any; error?: string }> {
  const accessToken = await getDriveAccessToken(userId)
  if (!accessToken) {
    return { success: false, error: 'Google Drive is not linked or authorization expired' }
  }

  try {
    const fileResponse = await axios.get(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        params: { alt: 'media' },
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    )
    return { success: true, data: fileResponse.data }
  } catch (err: any) {
    console.error('[Google Drive Download Error]', err?.response?.data || err)
    return { success: false, error: err.message || 'Failed to download backup from Google Drive' }
  }
}

export async function triggerAutoBackupIfNeeded(userId: string) {
  try {
    const pref = await prisma.userPreference.findUnique({
      where: { user_id: userId },
      select: { preferences: true }
    })
    if (!pref) return
    const preferences = (pref.preferences ?? {}) as Record<string, any>
    
    const linked = preferences.google_drive_linked
    const frequency = preferences.google_drive_backup_frequency || 'never'
    if (!linked || frequency === 'never') return

    const lastBackupStr = preferences.google_drive_last_backup
    if (!lastBackupStr) {
      console.log(`[Auto Backup] First-time backup for user ${userId}`)
      await performDriveBackup(userId)
      return
    }

    const lastBackup = new Date(lastBackupStr).getTime()
    const now = Date.now()
    const diffMs = now - lastBackup

    let thresholdMs = 0
    if (frequency === 'daily') thresholdMs = 24 * 60 * 60 * 1000
    else if (frequency === 'weekly') thresholdMs = 7 * 24 * 60 * 60 * 1000
    else if (frequency === 'monthly') thresholdMs = 30 * 24 * 60 * 60 * 1000
    else return

    if (diffMs >= thresholdMs) {
      console.log(`[Auto Backup] Frequency '${frequency}' elapsed. Backing up user ${userId}...`)
      await performDriveBackup(userId)
    }
  } catch (err) {
    console.error('[Auto Backup Error]', err)
  }
}
