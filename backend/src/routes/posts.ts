// ─────────────────────────────────────────────────────────
//  POST scheduling — CRUD + calendar + bulk ops
// ─────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import dayjs from 'dayjs'
import { E } from '../lib/errors.js'

const CreatePostBody = z.object({
  contentNl:    z.string().max(3000).optional(),
  contentFr:    z.string().max(3000).optional(),
  contentEn:    z.string().max(3000).optional(),
  hashtags:     z.array(z.string()).max(30).default([]),
  mediaUrls:    z.array(z.string().url()).max(10).default([]),
  type:         z.enum(['TEXT','IMAGE','VIDEO','CAROUSEL','PDF_DOCUMENT','STORY','REEL','THREAD','POLL']).default('TEXT'),
  scheduledAt:  z.string().datetime().optional(),
  connectionId: z.string().optional(),
  campaignId:   z.string().optional(),
  brandId:      z.string().optional(),
  // LinkedIn extras
  liTaggedPeople:  z.array(z.string()).default([]),
  liArticleUrl:    z.string().url().optional(),
  liDocumentTitle: z.string().optional(),
})

const UpdatePostBody = CreatePostBody.partial()

const CalendarQuery = z.object({
  from:     z.string().datetime(),
  to:       z.string().datetime(),
  platform: z.string().optional(),
  status:   z.string().optional(),
})

export default async function postsRoutes(app: FastifyInstance) {

  // ── GET /posts — list with filters ────────────────────
  app.get('/', {
    schema: { tags: ['posts'], security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req) => {
    const q = z.object({
      status:   z.string().optional(),
      platform: z.string().optional(),
      page:     z.coerce.number().default(1),
      limit:    z.coerce.number().min(1).max(100).default(20),
    }).parse(req.query)

    const [posts, total] = await Promise.all([
      app.db.post.findMany({
        where: {
          orgId: req.orgId,
          ...(q.status   && { status: q.status as never }),
          ...(q.platform && { connection: { platform: q.platform as never } }),
        },
        include: { analytics: true, connection: { select: { platform: true, platformName: true } } },
        orderBy: { scheduledAt: 'asc' },
        skip:  (q.page - 1) * q.limit,
        take:  q.limit,
      }),
      app.db.post.count({ where: { orgId: req.orgId } }),
    ])

    return { posts, total, page: q.page, pages: Math.ceil(total / q.limit) }
  })

  // ── GET /posts/calendar — calendar view ───────────────
  app.get('/calendar', {
    schema: { tags: ['posts'], summary: 'Kalenderoverzicht', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req) => {
    const q = CalendarQuery.parse(req.query)
    const posts = await app.db.post.findMany({
      where: {
        orgId:       req.orgId,
        scheduledAt: { gte: new Date(q.from), lte: new Date(q.to) },
        ...(q.status   && { status:   q.status as never }),
        ...(q.platform && { connection: { platform: q.platform as never } }),
      },
      include: { connection: { select: { platform: true, platformName: true } } },
      orderBy: { scheduledAt: 'asc' },
    })
    return { posts }
  })

  // ── GET /posts/:id ─────────────────────────────────────
  app.get('/:id', {
    schema: { tags: ['posts'], security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const post = await app.db.post.findFirst({
      where: { id, orgId: req.orgId },
      include: { analytics: true, advocacyItems: { include: { user: { select: { name: true, avatarUrl: true } } } } },
    })
    if (!post) throw E.notFound('Bericht niet gevonden')
    return post
  })

  // ── POST /posts — create + optionally schedule ────────
  app.post('/', {
    schema: { tags: ['posts'], summary: 'Nieuw bericht aanmaken', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const body = CreatePostBody.parse(req.body)

    const post = await app.db.post.create({
      data: {
        ...body,
        orgId:  req.orgId,
        status: body.scheduledAt ? 'SCHEDULED' : 'DRAFT',
      },
    })

    // Enqueue BullMQ job if scheduled
    if (post.scheduledAt) {
      const delay = Math.max(0, dayjs(post.scheduledAt).diff(dayjs(), 'ms'))
      const job = await app.postQueue.add('publish', { postId: post.id }, { delay, jobId: post.id })
      await app.db.post.update({ where: { id: post.id }, data: { jobId: job.id } })
    }

    return reply.status(201).send(post)
  })

  // ── PUT /posts/:id ─────────────────────────────────────
  app.put('/:id', {
    schema: { tags: ['posts'], security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const body   = UpdatePostBody.parse(req.body)

    const existing = await app.db.post.findFirst({ where: { id, orgId: req.orgId } })
    if (!existing) throw E.notFound()
    if (existing.status === 'PUBLISHED') throw E.badRequest('Gepubliceerde berichten kunnen niet worden gewijzigd')

    // If rescheduling, cancel old BullMQ job and re-queue
    if (body.scheduledAt && existing.jobId) {
      await app.postQueue.remove(existing.jobId)
    }

    const updated = await app.db.post.update({
      where: { id },
      data: {
        ...body,
        status: body.scheduledAt ? 'SCHEDULED' : existing.status,
      },
    })

    if (body.scheduledAt) {
      const delay = Math.max(0, dayjs(body.scheduledAt).diff(dayjs(), 'ms'))
      const job = await app.postQueue.add('publish', { postId: id }, { delay, jobId: id })
      await app.db.post.update({ where: { id }, data: { jobId: job.id } })
    }

    return updated
  })

  // ── DELETE /posts/:id ─────────────────────────────────
  app.delete('/:id', {
    schema: { tags: ['posts'], security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const post = await app.db.post.findFirst({ where: { id, orgId: req.orgId } })
    if (!post) throw E.notFound()
    if (post.jobId) await app.postQueue.remove(post.jobId)
    await app.db.post.delete({ where: { id } })
    return reply.status(204).send()
  })

  // ── POST /posts/bulk-schedule ─────────────────────────
  // Used by Bloem AI after generating a quarter plan
  app.post('/bulk-schedule', {
    schema: { tags: ['posts'], summary: 'Kwartaalplan in bulk inplannen', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req, reply) => {
    const body = z.object({
      posts: z.array(CreatePostBody).min(1).max(50),
    }).parse(req.body)

    const created = await Promise.all(body.posts.map(async (p) => {
      const post = await app.db.post.create({
        data: { ...p, orgId: req.orgId, status: p.scheduledAt ? 'SCHEDULED' : 'DRAFT' },
      })
      if (post.scheduledAt) {
        const delay = Math.max(0, dayjs(post.scheduledAt).diff(dayjs(), 'ms'))
        await app.postQueue.add('publish', { postId: post.id }, { delay, jobId: post.id })
      }
      return post
    }))

    return reply.status(201).send({ created: created.length, posts: created })
  })
}
