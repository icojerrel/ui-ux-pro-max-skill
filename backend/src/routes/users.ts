// ─────────────────────────────────────────────────────────
//  GET|PUT /api/v1/users/*
// ─────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { E } from '../lib/errors.js'

const UpdateProfileBody = z.object({
  name:     z.string().min(2).max(80).optional(),
  locale:   z.enum(['NL', 'FR', 'EN']).optional(),
  timezone: z.string().optional(),
})

const ChangePasswordBody = z.object({
  currentPassword: z.string(),
  newPassword:     z.string().min(8).max(128),
})

export default async function usersRoutes(app: FastifyInstance) {

  // ── GET /users/me ─────────────────────────────────────
  app.get('/me', {
    schema: { tags: ['users'], summary: 'Huidig gebruikersprofiel', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const user = await app.db.user.findUnique({
      where: { id: req.userId },
      include: {
        memberships: {
          include: { org: { select: { id: true, name: true, slug: true, plan: true, trialEndsAt: true } } },
        },
      },
    })
    if (!user) throw E.notFound('Gebruiker niet gevonden')
    const { passwordHash: _, ...safe } = user
    return reply.send(safe)
  })

  // ── PUT /users/me ─────────────────────────────────────
  app.put('/me', {
    schema: { tags: ['users'], summary: 'Profiel bijwerken', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const body = UpdateProfileBody.parse(req.body)
    const user = await app.db.user.update({
      where: { id: req.userId },
      data:  body,
    })
    const { passwordHash: _, ...safe } = user
    return reply.send(safe)
  })

  // ── POST /users/me/change-password ────────────────────
  app.post('/me/change-password', {
    schema: { tags: ['users'], security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const body = ChangePasswordBody.parse(req.body)
    const user = await app.db.user.findUniqueOrThrow({ where: { id: req.userId } })

    if (!await bcrypt.compare(body.currentPassword, user.passwordHash)) {
      throw E.badRequest('Huidig wachtwoord onjuist')
    }

    await app.db.user.update({
      where: { id: req.userId },
      data:  { passwordHash: await bcrypt.hash(body.newPassword, 12) },
    })

    // Revoke all refresh tokens (force re-login on other devices)
    await app.db.refreshToken.updateMany({
      where: { userId: req.userId, revokedAt: null },
      data:  { revokedAt: new Date() },
    })

    return reply.send({ success: true, message: 'Wachtwoord gewijzigd. Log opnieuw in op andere apparaten.' })
  })
}
