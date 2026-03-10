// ─────────────────────────────────────────────────────────
//  Bloei API — Fastify entry point
// ─────────────────────────────────────────────────────────
import Fastify from 'fastify'
import fastifyJwt from '@fastify/jwt'
import fastifyCors from '@fastify/cors'
import fastifyHelmet from '@fastify/helmet'
import fastifyRateLimit from '@fastify/rate-limit'
import fastifySwagger from '@fastify/swagger'
import fastifySwaggerUi from '@fastify/swagger-ui'

import { config } from './config.js'
import { AppError } from './lib/errors.js'

// Plugins
import dbPlugin from './plugins/db.js'
import authPlugin from './plugins/auth.js'
import redisQueuePlugin from './plugins/redis-queue.js'

// Routes
import authRoutes from './routes/auth.js'
import usersRoutes from './routes/users.js'
import orgsRoutes from './routes/orgs.js'
import postsRoutes from './routes/posts.js'
import platformsRoutes from './routes/platforms.js'
import aiRoutes from './routes/ai.js'
import analyticsRoutes from './routes/analytics.js'
import advocacyRoutes from './routes/advocacy.js'
import webhooksRoutes from './routes/webhooks.js'

// Post scheduler worker
import { startSchedulerWorker } from './services/scheduler.js'

const app = Fastify({
  logger: {
    level: config.isDev ? 'debug' : 'info',
    transport: config.isDev ? { target: 'pino-pretty' } : undefined,
  },
})

// ── Security & middleware ──────────────────────────────
await app.register(fastifyHelmet, {
  contentSecurityPolicy: config.isProd,
})

await app.register(fastifyCors, {
  origin: config.isProd ? [config.frontendUrl] : true,
  credentials: true,
})

await app.register(fastifyRateLimit, {
  global: true,
  max: 100,
  timeWindow: '1 minute',
  errorResponseBuilder: () => ({
    statusCode: 429,
    error: 'Too Many Requests',
    message: 'Te veel verzoeken — probeer het later opnieuw',
  }),
})

// ── JWT ───────────────────────────────────────────────
await app.register(fastifyJwt, {
  secret: config.jwt.accessSecret,
})

// ── OpenAPI docs ──────────────────────────────────────
await app.register(fastifySwagger, {
  openapi: {
    info: {
      title: 'Bloei API',
      description: 'Dutch B2B Social Media SaaS — REST API',
      version: '1.0.0',
      contact: { email: 'api@bloei.nl' },
    },
    servers: [{ url: config.apiBaseUrl }],
    tags: [
      { name: 'auth',      description: 'Authenticatie & sessies' },
      { name: 'users',     description: 'Gebruikersbeheer' },
      { name: 'orgs',      description: 'Organisaties & teams' },
      { name: 'posts',     description: 'Post scheduling & kalender' },
      { name: 'platforms', description: 'Social platform koppelingen' },
      { name: 'ai',        description: 'Bloem AI contentgeneratie' },
      { name: 'analytics', description: 'Analytics & rapportages' },
      { name: 'advocacy',  description: 'Employee advocacy' },
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  },
})

await app.register(fastifySwaggerUi, {
  routePrefix: '/docs',
  uiConfig: { docExpansion: 'list', deepLinking: true },
})

// ── Core plugins ──────────────────────────────────────
await app.register(dbPlugin)
await app.register(authPlugin)
await app.register(redisQueuePlugin)

// ── API routes ────────────────────────────────────────
const V1 = { prefix: '/api/v1' }
await app.register(authRoutes,      { ...V1, prefix: `${V1.prefix}/auth` })
await app.register(usersRoutes,     { ...V1, prefix: `${V1.prefix}/users` })
await app.register(orgsRoutes,      { ...V1, prefix: `${V1.prefix}/orgs` })
await app.register(postsRoutes,     { ...V1, prefix: `${V1.prefix}/posts` })
await app.register(platformsRoutes, { ...V1, prefix: `${V1.prefix}/platforms` })
await app.register(aiRoutes,        { ...V1, prefix: `${V1.prefix}/ai` })
await app.register(analyticsRoutes, { ...V1, prefix: `${V1.prefix}/analytics` })
await app.register(advocacyRoutes,  { ...V1, prefix: `${V1.prefix}/advocacy` })
await app.register(webhooksRoutes,  { ...V1, prefix: `${V1.prefix}/webhooks` })

// ── Health check ──────────────────────────────────────
app.get('/health', async () => ({
  status: 'ok',
  version: '1.0.0',
  timestamp: new Date().toISOString(),
}))

// ── Global error handler ──────────────────────────────
app.setErrorHandler((error, _req, reply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      statusCode: error.statusCode,
      error:  error.code ?? 'ERROR',
      message: error.message,
    })
  }
  // Zod / Fastify validation errors
  if (error.validation) {
    return reply.status(400).send({
      statusCode: 400,
      error: 'VALIDATION_ERROR',
      message: 'Ongeldige invoer',
      details: error.validation,
    })
  }
  app.log.error(error)
  return reply.status(500).send({
    statusCode: 500,
    error: 'INTERNAL_ERROR',
    message: 'Er is een onverwachte fout opgetreden',
  })
})

// ── Boot ──────────────────────────────────────────────
try {
  await app.listen({ port: config.port, host: '0.0.0.0' })
  app.log.info(`🌸 Bloei API running on port ${config.port}`)
  app.log.info(`📚 API docs: http://localhost:${config.port}/docs`)

  // Start BullMQ worker for post scheduling
  await startSchedulerWorker(app)
} catch (err) {
  app.log.error(err)
  process.exit(1)
}
