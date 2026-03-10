// ─────────────────────────────────────────────────────────
//  Auth plugin — JWT verify helper + request decoration
// ─────────────────────────────────────────────────────────
import fp from 'fastify-plugin'
import { FastifyInstance, FastifyRequest } from 'fastify'
import { E } from '../lib/errors.js'

export interface JwtPayload {
  sub: string   // userId
  org: string   // orgId (primary membership)
  role: string
}

declare module 'fastify' {
  interface FastifyRequest {
    userId: string
    orgId:  string
    role:   string
  }
}

export default fp(async (app: FastifyInstance) => {
  // Decorate request with auth data
  app.decorateRequest('userId', '')
  app.decorateRequest('orgId', '')
  app.decorateRequest('role', '')

  // Reusable auth hook — add to routes via preHandler
  app.decorate('authenticate', async (request: FastifyRequest) => {
    try {
      const payload = await request.jwtVerify<JwtPayload>()
      request.userId = payload.sub
      request.orgId  = payload.org
      request.role   = payload.role
    } catch {
      throw E.unauthorized()
    }
  })
})

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest) => Promise<void>
  }
}
