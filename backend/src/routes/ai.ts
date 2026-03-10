// ─────────────────────────────────────────────────────────
//  Bloem AI — /api/v1/ai/*
// ─────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { E } from '../lib/errors.js'
import { BloемService } from '../services/bloem.js'

const GenerateBody = z.object({
  type:       z.enum(['GENERATE_QUARTER','GENERATE_SINGLE','REPURPOSE','IMPROVE']),
  language:   z.enum(['NL','FR','EN']).default('NL'),
  platform:   z.enum(['LINKEDIN','INSTAGRAM','TWITTER','FACEBOOK','TIKTOK','WHATSAPP_BUSINESS']).optional(),
  tone:       z.enum(['formal','personal','educational','inspiring','humorous']).default('formal'),
  postsCount: z.number().min(1).max(26).default(1),
  // Context for generation
  inputText:  z.string().max(20_000).optional(),  // blog/PDF text
  inputUrl:   z.string().url().optional(),         // website to scrape
  topic:      z.string().max(500).optional(),      // specific topic
  sector:     z.string().max(100).optional(),
})

const ScoreBody = z.object({
  content:  z.string().min(10).max(3000),
  platform: z.enum(['LINKEDIN','INSTAGRAM','TWITTER','FACEBOOK','TIKTOK','WHATSAPP_BUSINESS']),
  language: z.enum(['NL','FR','EN']).default('NL'),
})

export default async function aiRoutes(app: FastifyInstance) {

  // ── POST /ai/generate — main generation endpoint ──────
  app.post('/generate', {
    schema: { tags: ['ai'], summary: 'Content genereren met Bloem AI', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const body = GenerateBody.parse(req.body)

    // Load org design system for brand context
    const designSystem = await app.db.orgDesignSystem.findUnique({
      where: { orgId: req.orgId },
    })

    const job = await app.db.aiJob.create({
      data: {
        type:       body.type,
        language:   body.language,
        platform:   body.platform,
        inputText:  body.inputText,
        inputUrl:   body.inputUrl,
        sector:     body.sector,
        tone:       body.tone,
        postsCount: body.postsCount,
        orgId:      req.orgId,
        userId:     req.userId,
        status:     'processing',
        startedAt:  new Date(),
      },
    })

    try {
      const bloem = new BloемService(app.log)
      const result = await bloem.generate({
        type:         body.type,
        language:     body.language,
        platform:     body.platform,
        tone:         body.tone,
        postsCount:   body.postsCount,
        inputText:    body.inputText,
        inputUrl:     body.inputUrl,
        topic:        body.topic,
        sector:       body.sector ?? designSystem?.sector,
        brandContext: {
          name:          designSystem?.brandName ?? '',
          description:   designSystem?.brandDescription ?? '',
          toneKeywords:  designSystem?.toneKeywords ?? [],
          avoidKeywords: designSystem?.avoidKeywords ?? [],
          examplePosts:  designSystem?.examplePosts ?? [],
          usp:           designSystem?.usp ?? '',
        },
      })

      await app.db.aiJob.update({
        where: { id: job.id },
        data: {
          status:     'done',
          result:     result as never,
          tokensUsed: result.tokensUsed,
          finishedAt: new Date(),
        },
      })

      return reply.status(201).send({ jobId: job.id, ...result })
    } catch (err) {
      await app.db.aiJob.update({
        where: { id: job.id },
        data: { status: 'failed', errorMsg: String(err), finishedAt: new Date() },
      })
      throw E.internal('Bloem AI kon geen content genereren — probeer het opnieuw')
    }
  })

  // ── POST /ai/score — quality scoring ─────────────────
  app.post('/score', {
    schema: { tags: ['ai'], summary: 'Post kwaliteitsscore berekenen', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
    config: { rateLimit: { max: 60, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const body = ScoreBody.parse(req.body)
    const bloem = new BloемService(app.log)
    const score = await bloem.scorePost(body.content, body.platform, body.language)
    return reply.send(score)
  })

  // ── GET /ai/jobs/:id — check job status ───────────────
  app.get('/jobs/:id', {
    schema: { tags: ['ai'], security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const job = await app.db.aiJob.findFirst({
      where: { id, orgId: req.orgId },
    })
    if (!job) throw E.notFound('AI job niet gevonden')
    return job
  })

  // ── GET /ai/jobs — list jobs for org ──────────────────
  app.get('/jobs', {
    schema: { tags: ['ai'], security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req) => {
    const jobs = await app.db.aiJob.findMany({
      where:   { orgId: req.orgId },
      orderBy: { createdAt: 'desc' },
      take:    50,
    })
    return { jobs }
  })
}
