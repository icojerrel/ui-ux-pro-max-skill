// ─────────────────────────────────────────────────────────
//  POST /api/v1/auth/*
// ─────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
import dayjs from 'dayjs'
import { z } from 'zod'
import { E } from '../lib/errors.js'
import { config } from '../config.js'

const RegisterBody = z.object({
  name:         z.string().min(2).max(80),
  email:        z.string().email(),
  password:     z.string().min(8).max(128),
  orgName:      z.string().min(2).max(100),
  orgSector:    z.string().optional(),
})

const LoginBody = z.object({
  email:    z.string().email(),
  password: z.string(),
})

const RefreshBody = z.object({
  refreshToken: z.string(),
})

export default async function authRoutes(app: FastifyInstance) {

  // ── POST /auth/register ───────────────────────────────
  app.post('/register', {
    schema: { tags: ['auth'], summary: 'Nieuw account aanmaken' },
  }, async (req, reply) => {
    const body = RegisterBody.parse(req.body)
    const db   = app.db

    const existing = await db.user.findUnique({ where: { email: body.email } })
    if (existing) throw E.conflict('E-mailadres al in gebruik')

    const passwordHash = await bcrypt.hash(body.password, 12)
    const slug = body.orgName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '-' + nanoid(5)

    const user = await db.user.create({
      data: {
        name: body.name,
        email: body.email,
        passwordHash,
        ownedOrg: {
          create: {
            name:    body.orgName,
            slug,
            sector:  body.orgSector,
            plan:    'SOLO',
            trialEndsAt: dayjs().add(30, 'day').toDate(),
            members: {
              create: { role: 'OWNER', userId: undefined as unknown as string },
            },
          },
        },
      },
      include: { ownedOrg: true },
    })

    // Fix circular ref — set userId on the team member
    if (user.ownedOrg) {
      await db.teamMember.updateMany({
        where: { orgId: user.ownedOrg.id },
        data: { userId: user.id },
      })
    }

    const tokens = await issueTokens(app, user.id, user.ownedOrg!.id, 'OWNER')

    return reply.status(201).send({
      user:  sanitizeUser(user),
      org:   user.ownedOrg,
      ...tokens,
    })
  })

  // ── POST /auth/login ──────────────────────────────────
  app.post('/login', {
    schema: { tags: ['auth'], summary: 'Inloggen' },
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const body = LoginBody.parse(req.body)
    const db   = app.db

    const user = await db.user.findUnique({
      where: { email: body.email },
      include: {
        memberships: {
          orderBy: { joinedAt: 'asc' },
          take: 1,
          include: { org: true },
        },
      },
    })

    if (!user || !await bcrypt.compare(body.password, user.passwordHash)) {
      throw E.unauthorized('Onjuist e-mailadres of wachtwoord')
    }

    const membership = user.memberships[0]
    if (!membership) throw E.forbidden('Geen toegang tot een organisatie')

    const tokens = await issueTokens(app, user.id, membership.orgId, membership.role)

    return reply.send({
      user: sanitizeUser(user),
      org:  membership.org,
      ...tokens,
    })
  })

  // ── POST /auth/refresh ────────────────────────────────
  app.post('/refresh', {
    schema: { tags: ['auth'], summary: 'Nieuw access token ophalen' },
  }, async (req, reply) => {
    const { refreshToken } = RefreshBody.parse(req.body)
    const db = app.db

    const stored = await db.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { user: { include: { memberships: { take: 1 } } } },
    })

    if (!stored || stored.revokedAt || dayjs().isAfter(stored.expiresAt)) {
      throw E.unauthorized('Refresh token ongeldig of verlopen')
    }

    // Rotate: revoke old, issue new
    await db.refreshToken.update({
      where: { id: stored.id },
      data:  { revokedAt: new Date() },
    })

    const membership = stored.user.memberships[0]
    const tokens = await issueTokens(app, stored.userId, membership?.orgId ?? '', membership?.role ?? 'VIEWER')

    return reply.send(tokens)
  })

  // ── POST /auth/logout ─────────────────────────────────
  app.post('/logout', {
    schema: { tags: ['auth'], summary: 'Uitloggen' },
  }, async (req, reply) => {
    const { refreshToken } = RefreshBody.parse(req.body)
    await app.db.refreshToken.updateMany({
      where: { token: refreshToken },
      data:  { revokedAt: new Date() },
    })
    return reply.send({ success: true })
  })
}

// ── Helpers ────────────────────────────────────────────
async function issueTokens(app: FastifyInstance, userId: string, orgId: string, role: string) {
  const payload = { sub: userId, org: orgId, role }

  const accessToken  = app.jwt.sign(payload, { expiresIn: config.jwt.accessExpiry })
  const refreshToken = nanoid(64)

  await app.db.refreshToken.create({
    data: {
      token:     refreshToken,
      userId,
      expiresAt: dayjs().add(30, 'day').toDate(),
    },
  })

  return { accessToken, refreshToken }
}

function sanitizeUser(user: { id: string; email: string; name: string; avatarUrl: string | null }) {
  return { id: user.id, email: user.email, name: user.name, avatarUrl: user.avatarUrl }
}
