import { Router } from 'express'
import { OAuth2Client } from 'google-auth-library'
import jwt from 'jsonwebtoken'
import crypto from 'crypto'
import { ENV } from '../config/env.js'
import { prisma } from '../config/prisma.js'
import { requireAuth, invalidateAuthCache, type AuthRequest } from '../middleware/auth.js'
import { ok, fail } from '../utils/response.js'
import { getClientCountry, getClientIp } from '../utils/ip.js'
import { triggerAutoBackupIfNeeded } from '../utils/googleDrive.js'
import { encryptSecret } from '../utils/secrets.js'
import { normalizeRelatedInstant } from '../utils/timestamps.js'

const router = Router()
const googleClient = new OAuth2Client(ENV.GOOGLE_CLIENT_ID)

const ACCESS_COOKIE_NAME = 'zenith_access_token'
const REFRESH_COOKIE_NAME = 'zenith_refresh_token'
const CSRF_COOKIE_NAME = 'zenith_csrf_token'
const AUTH_PREF_KEY = 'auth_session'
const ACCESS_TOKEN_TTL_MS = 15 * 60 * 1000
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

type AuthSessionState = {
  refresh_token_hash?: string
  refresh_expires_at?: number
  refresh_issued_at?: number
}

function getCookieBaseOptions() {
  return {
    httpOnly: true,
    secure: ENV.COOKIE_SECURE,
    sameSite: 'lax' as const,
    path: '/',
    ...(ENV.COOKIE_DOMAIN ? { domain: ENV.COOKIE_DOMAIN } : {}),
  }
}

function setAccessCookie(res: any, token: string) {
  res.cookie(ACCESS_COOKIE_NAME, token, {
    ...getCookieBaseOptions(),
    maxAge: ACCESS_TOKEN_TTL_MS,
  })
  res.cookie(CSRF_COOKIE_NAME, crypto.randomBytes(24).toString('hex'), {
    httpOnly: false,
    secure: ENV.COOKIE_SECURE,
    sameSite: 'lax' as const,
    path: '/',
    ...(ENV.COOKIE_DOMAIN ? { domain: ENV.COOKIE_DOMAIN } : {}),
    maxAge: ACCESS_TOKEN_TTL_MS,
  })
}

function setRefreshCookie(res: any, token: string) {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    ...getCookieBaseOptions(),
    maxAge: REFRESH_TOKEN_TTL_MS,
  })
}

function clearAuthCookies(res: any) {
  const base = {
    path: '/',
    ...(ENV.COOKIE_DOMAIN ? { domain: ENV.COOKIE_DOMAIN } : {}),
  }
  res.clearCookie(ACCESS_COOKIE_NAME, base)
  res.clearCookie(REFRESH_COOKIE_NAME, base)
  res.clearCookie(CSRF_COOKIE_NAME, base)
}

function readCookie(req: any, name: string): string | null {
  const cookieHeader = String(req.headers.cookie ?? '')
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rawValue] = part.trim().split('=')
    if (rawKey === name) return decodeURIComponent(rawValue.join('='))
  }
  return null
}

function signAccessToken(userId: string) {
  return jwt.sign({ sub: userId }, ENV.JWT_SECRET, { expiresIn: '15m' })
}

function hashRefreshToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

const sessionDb = (prisma as any).userSession

type AuthSession = {
  id: string
  device_id: string | null
  refresh_token_hash: string
  refresh_expires_at: Date
  refresh_issued_at: Date
  ip: string | null
  country_code: string | null
  user_agent: string | null
  last_active_at: Date
  rotated_at: Date | null
}

async function getAuthSessions(userId: string): Promise<AuthSession[]> {
  const now = new Date()

  // Prisma's Neon HTTP adapter cannot run the implicit transactions used by
  // deleteMany/updateMany. Resolve exact IDs first and delete each row with a
  // standalone statement so session management works in both HTTP and pooled
  // database modes.
  const candidateSessions = await sessionDb.findMany({
    where: { user_id: userId },
    select: { id: true, refresh_issued_at: true, refresh_expires_at: true, rotated_at: true },
  }).catch(() => [])
  const staleSessions = candidateSessions.filter((session: Pick<AuthSession, 'id' | 'refresh_issued_at' | 'refresh_expires_at' | 'rotated_at'>) => {
    const expiry = normalizeRelatedInstant(session.id, session.refresh_issued_at, session.refresh_expires_at)!
    const rotated = normalizeRelatedInstant(session.id, session.refresh_issued_at, session.rotated_at)
    return expiry < now || Boolean(rotated && rotated < new Date(now.getTime() - 2 * 60 * 1000))
  })
  await Promise.all(staleSessions.map((session: { id: string }) =>
    sessionDb.delete({ where: { id: session.id } }).catch(() => null)
  ))

  const sessions = await sessionDb.findMany({
    where: { user_id: userId },
    orderBy: { last_active_at: 'desc' }
  })

  return sessions
}

async function revokeRefreshSessionByToken(refreshToken: string | null | undefined): Promise<void> {
  if (!refreshToken) return
  const hash = hashRefreshToken(refreshToken)
  await sessionDb.delete({
    where: { refresh_token_hash: hash }
  }).catch(() => null)
}

async function logAuthEvent(req: any, userId: string, action: string, description: string): Promise<void> {
  const ip = getClientIp(req)
  const user_agent = (req.headers['user-agent'] as string) || null
  await prisma.systemLog.create({
    data: { user_id: userId, action, description, ip, user_agent },
  }).catch(() => null)
}

async function issueAuthSession(req: any, res: any, userId: string, replaceOldHash?: string): Promise<void> {
  const accessToken = signAccessToken(userId)
  const refreshToken = crypto.randomBytes(48).toString('hex')
  const now = new Date()

  const ip = getClientIp(req)
  const countryCode = getClientCountry(req)
  const user_agent = (req.headers['user-agent'] as string) || null
  const deviceId = (req.headers['x-device-id'] as string) || null
  const hash = hashRefreshToken(refreshToken)

  // 1. If we are replacing an old token (rotating), we mark it as rotated with a grace period
  if (replaceOldHash) {
    await sessionDb.update({
      where: { refresh_token_hash: replaceOldHash },
      data: { rotated_at: now }
    }).catch(() => null)
  }

  // 2. Clean up any existing sessions for this device ID to avoid bloating
  let duplicateSessions: Array<{ id: string }> = []
  if (deviceId) {
    duplicateSessions = await sessionDb.findMany({
      where: {
        user_id: userId,
        device_id: deviceId,
        refresh_token_hash: { not: replaceOldHash ?? '' }
      },
      select: { id: true },
    })
  }
  await Promise.all(duplicateSessions.map((session) =>
    sessionDb.delete({ where: { id: session.id } }).catch(() => null)
  ))

  // 3. Create the new session
  await sessionDb.create({
    data: {
      user_id: userId,
      device_id: deviceId,
      refresh_token_hash: hash,
      refresh_expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      ip,
      country_code: countryCode,
      user_agent,
      last_active_at: now,
    }
  })

  // 4. Enforce session limit (max 10 active sessions)
  const activeSessions = await sessionDb.findMany({
    where: { user_id: userId },
    orderBy: { last_active_at: 'desc' }
  })
  if (activeSessions.length > 10) {
    await Promise.all(activeSessions.slice(10).map((session: AuthSession) =>
      sessionDb.delete({ where: { id: session.id } }).catch(() => null)
    ))
  }

  setAccessCookie(res, accessToken)
  setRefreshCookie(res, refreshToken)
}


function userResponse(user: Awaited<ReturnType<typeof prisma.user.findUniqueOrThrow>>) {
  return {
    _id: user.id,
    id: user.id,
    name: user.name,
    email: user.email,
    picture: user.picture,
    course: user.course,
    branch: user.branch,
    college: user.college,
    semester: user.current_semester,
    batch: user.batch,
    enrollment_number: user.enrollment_number,
    current_semester: user.current_semester,
    target_attendance: user.target_attendance,
    attendance_threshold: user.attendance_threshold,
    warning_threshold: user.warning_threshold,

    created_at: user.created_at,
  }
}

router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body as { credential: string }
    if (!credential) {
      fail(res, 'credential is required', 'MISSING_FIELD')
      return
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: ENV.GOOGLE_CLIENT_ID,
    })
    const payload = ticket.getPayload()
    if (!payload?.sub) {
      fail(res, 'Invalid Google token', 'INVALID_TOKEN', 401)
      return
    }

    const { sub: google_id, email, name, picture } = payload
    let user = await prisma.user.findUnique({ where: { email: email! } })

    if (user) {
      user = await prisma.user.update({
        where: { email: email! },
        data: { google_id, name: name!, picture: user.picture || picture },
      })
    } else {
      const existingByGoogle = await prisma.user.findUnique({ where: { google_id } })
      if (existingByGoogle) {
        user = await prisma.user.update({
          where: { google_id },
          data: { email: email!, name: name!, picture: existingByGoogle.picture || picture },
        })
      } else {
        user = await prisma.user.create({
          data: { google_id, email: email!, name: name!, picture },
        })
      }
    }

    await issueAuthSession(req, res, user.id)
    void logAuthEvent(req, user.id, 'auth_login', 'Signed in with Google OAuth')
    ok(res, { user: userResponse(user) })
  } catch (err: any) {
    console.error('[auth/google]', err)
    fail(res, `Authentication failed: ${err?.message || String(err)}`, 'AUTH_FAILED', 500)
  }
})

router.post('/refresh', async (req, res) => {
  try {
    const refreshToken = readCookie(req, REFRESH_COOKIE_NAME)
    if (!refreshToken) {
      clearAuthCookies(res)
      return fail(res, 'Refresh token missing', 'REFRESH_MISSING', 401)
    }

    const hash = hashRefreshToken(refreshToken)
    
    // Find the session for this refresh token
    const session = await sessionDb.findUnique({
      where: { refresh_token_hash: hash }
    })

    if (!session) {
      clearAuthCookies(res)
      return fail(res, 'Refresh token invalid', 'REFRESH_INVALID', 401)
    }

    // Check if the session is rotated and in grace period (60 seconds)
    if (session.rotated_at) {
      const rotatedAt = normalizeRelatedInstant(session.id, session.refresh_issued_at, session.rotated_at)!
      const isWithinGracePeriod = Date.now() - rotatedAt.getTime() < 60_000
      if (isWithinGracePeriod) {
        // Return a fresh access token, but reuse the rotated refresh token cookie (do not rotate again)
        const accessToken = signAccessToken(session.user_id)
        setAccessCookie(res, accessToken)
        
        const user = await prisma.user.findUnique({ where: { id: session.user_id } })
        if (!user) {
          clearAuthCookies(res)
          return fail(res, 'Refresh user not found', 'REFRESH_INVALID', 401)
        }
        
        return ok(res, { user: userResponse(user) })
      } else {
        // This browser has presented an obsolete rotated token. Revoke only
        // that token: other device sessions are independent and must remain
        // signed in. A stale response or restored browser tab should never
        // become an account-wide logout.
        await sessionDb.delete({ where: { id: session.id } }).catch(() => null)
        clearAuthCookies(res)
        return fail(res, 'Refresh token reuse detected', 'REFRESH_INVALID', 401)
      }
    }

    // Check if session is expired
    const refreshExpiresAt = normalizeRelatedInstant(session.id, session.refresh_issued_at, session.refresh_expires_at)!
    if (refreshExpiresAt.getTime() < Date.now()) {
      await sessionDb.delete({ where: { id: session.id } }).catch(() => null)
      clearAuthCookies(res)
      return fail(res, 'Refresh token expired', 'REFRESH_EXPIRED', 401)
    }

    const user = await prisma.user.findUnique({ where: { id: session.user_id } })
    if (!user) {
      await sessionDb.delete({ where: { id: session.id } }).catch(() => null)
      clearAuthCookies(res)
      return fail(res, 'Refresh user not found', 'REFRESH_INVALID', 401)
    }

    // Process rotation normally
    await issueAuthSession(req, res, user.id, hash)
    void logAuthEvent(req, user.id, 'auth_refresh', 'Rotated web refresh token')
    ok(res, { user: userResponse(user) })
  } catch (err) {
    console.error('[auth/refresh]', err)
    fail(res, 'Refresh failed', 'REFRESH_FAILED', 500)
  }
})


router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const authHeader = req.headers.authorization
  if (!req.headers.cookie && authHeader?.startsWith('Bearer ')) {
    setAccessCookie(res, authHeader.slice(7))
  }
  
  // Lazy trigger background backup if Drive is enabled & scheduled
  if (process.env.VERCEL) {
    await triggerAutoBackupIfNeeded(req.userId!).catch(() => null)
  } else {
    void triggerAutoBackupIfNeeded(req.userId!).catch(() => null)
  }

  ok(res, userResponse(req.user!))
})

router.post('/google/link-drive', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { code, redirectUri } = req.body
    if (!code) {
      fail(res, 'Authorization code is required', 'MISSING_CODE')
      return
    }

    const redirect = redirectUri || 'postmessage'

    if (!ENV.GOOGLE_CLIENT_SECRET) {
      fail(
        res,
        'Google Drive linking is not configured. Set GOOGLE_CLIENT_SECRET for the API server and restart it.',
        'GOOGLE_SECRET_MISSING',
        500
      )
      return
    }

    // Google API requires a client secret for offline access exchange
    const exchangeClient = new OAuth2Client(
      ENV.GOOGLE_CLIENT_ID,
      ENV.GOOGLE_CLIENT_SECRET,
      redirect
    )

    const { tokens } = await exchangeClient.getToken(code)

    if (!tokens.refresh_token) {
      console.warn('[Google Drive] Code flow did not return a refresh token for user:', req.userId)
    }

    const pref = await prisma.userPreference.findUnique({
      where: { user_id: req.userId! }
    })
    
    const current = (pref?.preferences ?? {}) as Record<string, any>
    const nextPrefs = {
      ...current,
      google_drive_linked: true,
      google_drive_refresh_token: tokens.refresh_token
        ? encryptSecret(tokens.refresh_token)
        : current.google_drive_refresh_token,
      google_drive_backup_frequency: current.google_drive_backup_frequency || 'daily',
      google_drive_last_backup: current.google_drive_last_backup || null
    }

    await prisma.userPreference.upsert({
      where: { user_id: req.userId! },
      create: { user_id: req.userId!, preferences: nextPrefs as any },
      update: { preferences: nextPrefs as any }
    })

    ok(res, { 
      message: 'Google Drive connected successfully.',
      has_refresh_token: !!(tokens.refresh_token || current.google_drive_refresh_token)
    })
  } catch (err) {
    console.error('[auth/google/link-drive]', err)
    fail(res, 'Failed to link Google Drive', 'LINK_FAILED', 500)
  }
})

// ─── Active Sessions Management ────────────────────────────────────────────────

router.get('/sessions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!
    const currentRefreshToken = readCookie(req, REFRESH_COOKIE_NAME)
    const currentHash = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : null
    if (currentHash) {
      await sessionDb.update({
        where: { refresh_token_hash: currentHash },
        data: { last_active_at: new Date() },
      }).catch(() => null)
    }
    const sessions = await getAuthSessions(userId)

    const payload = sessions.map(s => ({
      id: s.id,
      device_id: s.device_id || null,
      ip: s.ip || 'Unknown',
      country_code: s.country_code || null,
      user_agent: s.user_agent || 'Unknown',
      refresh_issued_at: normalizeRelatedInstant(s.id, s.refresh_issued_at, s.refresh_issued_at)!.getTime(),
      last_active_at: normalizeRelatedInstant(s.id, s.refresh_issued_at, s.last_active_at)!.getTime(),
      is_current: s.refresh_token_hash === currentHash,
    }))

    ok(res, payload)
  } catch (err) {
    console.error('[auth/sessions GET]', err)
    fail(res, 'Failed to fetch sessions', 'FETCH_FAILED', 500)
  }
})

router.delete('/sessions/:id', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!
    const sessionId = req.params.id
    
    const session = await sessionDb.findUnique({
      where: { id: sessionId }
    })
    
    if (!session || session.user_id !== userId) {
      fail(res, 'Session not found', 'NOT_FOUND', 404)
      return
    }

    await sessionDb.delete({
      where: { id: sessionId }
    })
    
    void logAuthEvent(req, userId, 'auth_revoke_session', `Revoked device session: ${session.user_agent || 'Unknown'}`)
    ok(res, { message: 'Session revoked successfully' })
  } catch (err) {
    console.error('[auth/sessions DELETE]', err)
    fail(res, 'Failed to revoke session', 'REVOKE_FAILED', 500)
  }
})

router.delete('/sessions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const userId = req.userId!
    const currentRefreshToken = readCookie(req, REFRESH_COOKIE_NAME)
    const currentHash = currentRefreshToken ? hashRefreshToken(currentRefreshToken) : null

    const sessionsToRevoke = await sessionDb.findMany({
      where: {
        user_id: userId,
        ...(currentHash ? { refresh_token_hash: { not: currentHash } } : {}),
      },
      select: { id: true },
    })
    await Promise.all(sessionsToRevoke.map((session: { id: string }) =>
      sessionDb.delete({ where: { id: session.id } })
    ))
    
    void logAuthEvent(req, userId, 'auth_revoke_other_sessions', 'Revoked all other active sessions')
    ok(res, { message: 'All other sessions revoked successfully' })
  } catch (err) {
    console.error('[auth/sessions/all DELETE]', err)
    fail(res, 'Failed to revoke other sessions', 'REVOKE_FAILED', 500)
  }
})

router.get('/debug_db', requireAuth, async (req: AuthRequest, res) => {
  if (ENV.NODE_ENV === 'production') {
    fail(res, 'Not available', 'FORBIDDEN', 403)
    return
  }
  try {
    const [subjectCount, samples] = await Promise.all([
      prisma.subject.count({ where: { user_id: req.userId! } }),
      prisma.subject.findMany({ where: { user_id: req.userId! }, take: 5 }),
    ])
    res.json({ subjects_count: subjectCount, sample_subjects: samples })
  } catch (err) {
    console.error('[auth/debug_db]', err)
    fail(res, String(err), 'DB_ERROR', 500)
  }
})

router.post('/logout', async (req, res) => {
  const token = req.headers.authorization?.slice(7)
  if (token) invalidateAuthCache(token)
  const refreshToken = readCookie(req, REFRESH_COOKIE_NAME)
  let userId: string | null = null
  if (refreshToken) {
    const hash = hashRefreshToken(refreshToken)
    const session = await sessionDb.findUnique({
      where: { refresh_token_hash: hash },
      select: { user_id: true }
    })
    if (session) {
      userId = session.user_id
      await sessionDb.delete({ where: { refresh_token_hash: hash } }).catch(() => null)
    }
  }
  if (userId) {
    void logAuthEvent(req, userId, 'auth_logout', 'Signed out from web session')
  }
  clearAuthCookies(res)
  ok(res, { message: 'Logged out' })
})

export default router

