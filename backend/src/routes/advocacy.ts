// ─────────────────────────────────────────────────────────
//  Employee Advocacy — /api/v1/advocacy/*
// ─────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { E } from '../lib/errors.js'

export default async function advocacyRoutes(app: FastifyInstance) {

  // ── GET /advocacy/leaderboard ─────────────────────────
  app.get('/leaderboard', {
    schema: { tags: ['advocacy'], summary: 'Team scorebord', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req) => {
    const members = await app.db.teamMember.findMany({
      where:   { orgId: req.orgId },
      include: { user: { select: { name: true, avatarUrl: true } } },
      orderBy: { advocacyScore: 'desc' },
      take:    20,
    })

    return {
      leaderboard: members.map((m, i) => ({
        rank:          i + 1,
        userId:        m.userId,
        name:          m.user.name,
        avatarUrl:     m.user.avatarUrl,
        score:         m.advocacyScore,
        postsShared:   m.postsShared,
        streak:        m.advocacyStreak,
        badge:         i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : null,
      })),
    }
  })

  // ── GET /advocacy/suggestions — pending for current user
  app.get('/suggestions', {
    schema: { tags: ['advocacy'], security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req) => {
    const items = await app.db.advocacyItem.findMany({
      where:   { userId: req.userId, status: 'PENDING' },
      include: {
        post: {
          select: {
            id: true, contentNl: true, contentEn: true,
            hashtags: true, mediaUrls: true,
            connection: { select: { platform: true } },
            scheduledAt: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return { suggestions: items }
  })

  // ── POST /advocacy/:itemId/share — employee shares post ─
  app.post('/:itemId/share', {
    schema: { tags: ['advocacy'], security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { itemId } = z.object({ itemId: z.string() }).parse(req.params)
    const { message } = z.object({ message: z.string().max(300).optional() }).parse(req.body)

    const item = await app.db.advocacyItem.findFirst({
      where: { id: itemId, userId: req.userId },
    })
    if (!item) throw E.notFound()
    if (item.status === 'SHARED') throw E.conflict('Al gedeeld')

    await app.db.$transaction([
      app.db.advocacyItem.update({
        where: { id: itemId },
        data:  { status: 'SHARED', sharedAt: new Date(), message },
      }),
      app.db.teamMember.updateMany({
        where: { userId: req.userId, orgId: req.orgId },
        data:  { advocacyScore: { increment: 10 }, postsShared: { increment: 1 } },
      }),
    ])

    return reply.send({ success: true, pointsEarned: 10, message: 'Goed gedaan! +10 punten verdiend 🎉' })
  })

  // ── POST /advocacy/:itemId/decline ────────────────────
  app.post('/:itemId/decline', {
    schema: { tags: ['advocacy'], security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { itemId } = z.object({ itemId: z.string() }).parse(req.params)
    const item = await app.db.advocacyItem.findFirst({ where: { id: itemId, userId: req.userId } })
    if (!item) throw E.notFound()
    await app.db.advocacyItem.update({ where: { id: itemId }, data: { status: 'DECLINED' } })
    return reply.send({ success: true })
  })

  // ── POST /advocacy/suggest — manager pushes post to team
  app.post('/suggest', {
    schema: { tags: ['advocacy'], summary: 'Post doorsturen naar teamleden', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const body = z.object({
      postId:  z.string(),
      userIds: z.array(z.string()).min(1),
    }).parse(req.body)

    // Verify post belongs to org
    const post = await app.db.post.findFirst({ where: { id: body.postId, orgId: req.orgId } })
    if (!post) throw E.notFound()

    // Verify all users are org members
    const members = await app.db.teamMember.findMany({
      where: { orgId: req.orgId, userId: { in: body.userIds } },
    })
    const validUserIds = members.map(m => m.userId)

    const items = await app.db.advocacyItem.createMany({
      data: validUserIds.map(userId => ({
        postId: body.postId,
        userId,
        status: 'PENDING',
      })),
      skipDuplicates: true,
    })

    return reply.status(201).send({ suggested: items.count })
  })
}
