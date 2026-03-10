// ─────────────────────────────────────────────────────────
//  Prisma plugin — injects db into Fastify instance
// ─────────────────────────────────────────────────────────
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { PrismaClient } from '@prisma/client'

declare module 'fastify' {
  interface FastifyInstance { db: PrismaClient }
}

export default fp(async (app: FastifyInstance) => {
  const db = new PrismaClient({
    log: app.log.level === 'debug'
      ? ['query', 'info', 'warn', 'error']
      : ['warn', 'error'],
  })

  await db.$connect()
  app.decorate('db', db)

  app.addHook('onClose', async () => {
    await db.$disconnect()
    app.log.info('Prisma disconnected')
  })

  app.log.info('Prisma connected to PostgreSQL')
})
