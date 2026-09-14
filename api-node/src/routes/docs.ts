import { Router } from 'express'

const router = Router()

const openApiSpec = {
  openapi: '3.1.0',
  info: {
    title: 'Semester API',
    version: '1.0.0',
    description: 'Versioned API for Semester web and mobile clients.',
  },
  servers: [
    { url: '/api/v1', description: 'Canonical versioned API' },
    { url: '/api', description: 'Backward-compatible alias' },
  ],
  tags: [
    { name: 'auth' },
    { name: 'profile' },
    { name: 'attendance' },
    { name: 'academic' },
    { name: 'dashboard' },
    { name: 'data' },
  ],
  paths: {
    '/auth/google': {
      post: {
        tags: ['auth'],
        summary: 'Authenticate with Google OAuth credential',
      },
    },
    '/auth/me': {
      get: {
        tags: ['auth'],
        summary: 'Get current authenticated user',
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['auth'],
        summary: 'Rotate refresh token and issue a fresh access token',
      },
    },
    '/profile': {
      get: {
        tags: ['profile'],
        summary: 'Get profile',
      },
      put: {
        tags: ['profile'],
        summary: 'Update profile',
      },
    },
    '/profile/account': {
      delete: {
        tags: ['profile'],
        summary: 'Delete the authenticated account permanently',
      },
    },
    '/attendance/mark': {
      post: {
        tags: ['attendance'],
        summary: 'Mark attendance for a subject and date',
      },
    },
    '/attendance/unmark-all': {
      post: {
        tags: ['attendance'],
        summary: 'Atomically clear an exact date-modal attendance snapshot',
        description: 'Validates explicit log IDs against the authenticated user, selected date, and semester before deleting records and applying counter deltas.',
      },
    },
    '/academic/subjects': {
      get: {
        tags: ['academic'],
        summary: 'List subjects for a semester',
      },
    },
    '/dashboard/data': {
      get: {
        tags: ['dashboard'],
        summary: 'Get dashboard summary payload',
      },
    },
    '/data/export_data': {
      get: {
        tags: ['data'],
        summary: 'Export all user data',
      },
    },
    '/data/import_data': {
      post: {
        tags: ['data'],
        summary: 'Import a user data snapshot',
      },
    },
  },
}

router.get('/openapi.json', (_req, res) => {
  res.json(openApiSpec)
})

router.get('/', (_req, res) => {
  res.type('text/plain').send('Semester API docs: GET /api/docs/openapi.json')
})

export default router
