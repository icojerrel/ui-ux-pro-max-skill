import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { E } from '../lib/errors.js'

export default async function orgsRoutes(app: FastifyInstance) {

  app.get('/me', { preHandler:[app.authenticate] }, async (req) => {
    const org = await app.db.organisation.findFirst({
      where: { id: req.orgId },
      include: { members: { include: { user: { select: { id:true,name:true,email:true,avatarUrl:true } } } } },
    })
    if (!org) throw E.notFound()
    return org
  })

  app.put('/me', { preHandler:[app.authenticate] }, async (req) => {
    const body = z.object({
      name: z.string().min(2).max(100).optional(),
      sector: z.string().optional(),
      website: z.string().url().optional(),
      language: z.enum(['NL','FR','EN']).optional(),
    }).parse(req.body)
    return app.db.organisation.update({ where: { id: req.orgId }, data: body })
  })

  app.post('/members/invite', { preHandler:[app.authenticate] }, async (req, reply) => {
    // In production: sends email invite — here we create pending member directly
    const body = z.object({
      email: z.string().email(),
      role: z.enum(['ADMIN','EDITOR','VIEWER']).default('EDITOR'),
    }).parse(req.body)
    const user = await app.db.user.findUnique({ where: { email: body.email } })
    if (!user) throw E.notFound('Gebruiker niet gevonden — vraag hen eerst een account aan te maken')
    const existing = await app.db.teamMember.findFirst({ where: { userId: user.id, orgId: req.orgId } })
    if (existing) throw E.conflict('Gebruiker is al lid van deze organisatie')
    const member = await app.db.teamMember.create({ data: { userId: user.id, orgId: req.orgId, role: body.role } })
    return reply.status(201).send(member)
  })

  app.delete('/members/:userId', { preHandler:[app.authenticate] }, async (req, reply) => {
    const { userId } = z.object({ userId: z.string() }).parse(req.params)
    await app.db.teamMember.deleteMany({ where: { userId, orgId: req.orgId } })
    return reply.status(204).send()
  })
}
