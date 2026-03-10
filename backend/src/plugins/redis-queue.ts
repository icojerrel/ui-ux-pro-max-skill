// ─────────────────────────────────────────────────────────
//  Redis + BullMQ queue plugin
// ─────────────────────────────────────────────────────────
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { Queue, Worker, QueueEvents } from 'bullmq'
import IORedis from 'ioredis'
import { config } from '../config.js'

declare module 'fastify' {
  interface FastifyInstance {
    redis: IORedis
    postQueue: Queue
  }
}

export default fp(async (app: FastifyInstance) => {
  const connection = new IORedis(config.redis.url, { maxRetriesPerRequest: null })

  const postQueue = new Queue('post-publishing', {
    connection,
    defaultJobOptions: {
      attempts: config.queue.maxRetries,
      backoff: { type: 'exponential', delay: config.queue.retryDelay },
      removeOnComplete: { count: 500 },
      removeOnFail:    { count: 100 },
    },
  })

  app.decorate('redis', connection)
  app.decorate('postQueue', postQueue)

  app.addHook('onClose', async () => {
    await postQueue.close()
    connection.disconnect()
    app.log.info('Redis/BullMQ disconnected')
  })

  app.log.info('BullMQ post queue ready')
})
