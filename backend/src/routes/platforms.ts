// ─────────────────────────────────────────────────────────
//  Platform connections — OAuth + management
// ─────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { E } from '../lib/errors.js'
import { encrypt } from '../lib/crypto.js'

export default async function platformsRoutes(app: FastifyInstance) {

  // ── GET /platforms — list connected platforms ─────────
  app.get('/', {
    schema: { tags: ['platforms'], security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req) => {
    const connections = await app.db.platformConnection.findMany({
      where:   { orgId: req.orgId },
      select: {
        id: true, platform: true, platformName: true, platformUsername: true,
        avatarUrl: true, followerCount: true, isActive: true, lastSyncAt: true,
      },
      orderBy: { platform: 'asc' },
    })
    return { connections }
  })

  // ── POST /platforms/connect — store OAuth tokens ──────
  // In production: called by OAuth callback after user authorizes
  app.post('/connect', {
    schema: { tags: ['platforms'], summary: 'Nieuw platform koppelen', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const body = z.object({
      platform:        z.enum(['LINKEDIN','INSTAGRAM','TWITTER','FACEBOOK','TIKTOK','WHATSAPP_BUSINESS']),
      platformUserId:  z.string(),
      platformName:    z.string(),
      platformUsername:z.string().optional(),
      avatarUrl:       z.string().url().optional(),
      accessToken:     z.string(),
      refreshToken:    z.string().optional(),
      tokenExpiresAt:  z.string().datetime().optional(),
      followerCount:   z.number().optional(),
      brandId:         z.string().optional(),
    }).parse(req.body)

    const conn = await app.db.platformConnection.upsert({
      where: { orgId_platform_platformUserId: {
        orgId: req.orgId,
        platform: body.platform,
        platformUserId: body.platformUserId,
      }},
      create: {
        orgId:           req.orgId,
        platform:        body.platform,
        platformUserId:  body.platformUserId,
        platformName:    body.platformName,
        platformUsername:body.platformUsername,
        avatarUrl:       body.avatarUrl,
        accessTokenEnc:  encrypt(body.accessToken),
        refreshTokenEnc: body.refreshToken ? encrypt(body.refreshToken) : null,
        tokenExpiresAt:  body.tokenExpiresAt ? new Date(body.tokenExpiresAt) : null,
        followerCount:   body.followerCount,
        brandId:         body.brandId,
        lastSyncAt:      new Date(),
      },
      update: {
        platformName:    body.platformName,
        accessTokenEnc:  encrypt(body.accessToken),
        refreshTokenEnc: body.refreshToken ? encrypt(body.refreshToken) : undefined,
        tokenExpiresAt:  body.tokenExpiresAt ? new Date(body.tokenExpiresAt) : undefined,
        followerCount:   body.followerCount,
        isActive:        true,
        lastSyncAt:      new Date(),
      },
    })

    return reply.status(201).send({ id: conn.id, platform: conn.platform, platformName: conn.platformName })
  })

  // ── DELETE /platforms/:id ─────────────────────────────
  app.delete('/:id', {
    schema: { tags: ['platforms'], security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const conn = await app.db.platformConnection.findFirst({ where: { id, orgId: req.orgId } })
    if (!conn) throw E.notFound()
    await app.db.platformConnection.delete({ where: { id } })
    return reply.status(204).send()
  })
}
