// ─────────────────────────────────────────────────────────
//  BullMQ scheduler worker — publishes posts at scheduled time
// ─────────────────────────────────────────────────────────
import { Worker, Job } from 'bullmq'
import type { FastifyInstance } from 'fastify'
import { config } from '../config.js'
import { decrypt } from '../lib/crypto.js'
import { SocialPublisher } from './social.js'
import IORedis from 'ioredis'

interface PublishJobData {
  postId: string
}

export async function startSchedulerWorker(app: FastifyInstance): Promise<Worker> {
  const connection = new IORedis(config.redis.url, { maxRetriesPerRequest: null })

  const worker = new Worker<PublishJobData>(
    'post-publishing',
    async (job: Job<PublishJobData>) => {
      const { postId } = job.data
      app.log.info({ postId, jobId: job.id }, 'Publishing post')

      const post = await app.db.post.findUnique({
        where:   { id: postId },
        include: { connection: true },
      })

      if (!post) {
        app.log.warn({ postId }, 'Post not found — skipping')
        return
      }

      if (post.status !== 'SCHEDULED') {
        app.log.info({ postId, status: post.status }, 'Post not in SCHEDULED state — skipping')
        return
      }

      // Mark as in-progress
      await app.db.post.update({
        where: { id: postId },
        data:  { status: 'PUBLISHING' },
      })

      try {
        // Decrypt OAuth token and publish
        if (post.connection) {
          const accessToken = decrypt(post.connection.accessTokenEnc)
          const publisher   = new SocialPublisher(post.connection.platform, accessToken, app.log)
          await publisher.publish(post)
        }

        await app.db.post.update({
          where: { id: postId },
          data:  { status: 'PUBLISHED', publishedAt: new Date() },
        })

        // Initialize analytics record
        await app.db.postAnalytics.create({
          data: { postId },
        }).catch(() => { /* ignore if already exists */ })

        app.log.info({ postId }, 'Post published successfully')
      } catch (err) {
        const failureReason = err instanceof Error ? err.message : String(err)
        await app.db.post.update({
          where: { id: postId },
          data:  {
            status:        'FAILED',
            failureReason,
            retryCount:    { increment: 1 },
          },
        })
        app.log.error({ postId, err: failureReason }, 'Post publish failed')
        throw err // let BullMQ retry
      }
    },
    {
      connection,
      concurrency: config.queue.concurrency,
    }
  )

  worker.on('failed', (job, err) => {
    app.log.error({ jobId: job?.id, err: err.message }, 'Job permanently failed after retries')
  })

  app.addHook('onClose', async () => {
    await worker.close()
    connection.disconnect()
  })

  app.log.info(`Scheduler worker started (concurrency: ${config.queue.concurrency})`)
  return worker
}
