// Webhooks from social platforms (LinkedIn, Instagram, etc.)
import { FastifyInstance } from 'fastify'

export default async function webhooksRoutes(app: FastifyInstance) {
  // LinkedIn webhook — post analytics update
  app.post('/linkedin', async (req, reply) => {
    // Verify LinkedIn signature (X-Li-Signature header)
    // Process engagement events, update PostAnalytics
    app.log.info({ body: req.body }, 'LinkedIn webhook received')
    return reply.status(200).send({ received: true })
  })

  // Instagram webhook
  app.post('/instagram', async (req, reply) => {
    app.log.info({ body: req.body }, 'Instagram webhook received')
    return reply.status(200).send({ received: true })
  })
}
