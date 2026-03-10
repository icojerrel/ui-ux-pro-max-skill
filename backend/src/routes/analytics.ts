// ─────────────────────────────────────────────────────────
//  Analytics — /api/v1/analytics/*
// ─────────────────────────────────────────────────────────
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import dayjs from 'dayjs'

export default async function analyticsRoutes(app: FastifyInstance) {

  // ── GET /analytics/overview — dashboard metrics ───────
  app.get('/overview', {
    schema: { tags: ['analytics'], summary: 'Dashboard statistieken', security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req) => {
    const q = z.object({
      from: z.string().datetime().default(() => dayjs().subtract(30, 'day').toISOString()),
      to:   z.string().datetime().default(() => dayjs().toISOString()),
    }).parse(req.query)

    const [postStats, snapshots, advocacyCount] = await Promise.all([
      // Post counts by status
      app.db.post.groupBy({
        by: ['status'],
        where: { orgId: req.orgId },
        _count: true,
      }),
      // Daily analytics snapshots
      app.db.analyticsSnapshot.findMany({
        where: { orgId: req.orgId, date: { gte: new Date(q.from), lte: new Date(q.to) } },
        orderBy: { date: 'asc' },
      }),
      // Advocacy count
      app.db.advocacyItem.count({
        where: { post: { orgId: req.orgId }, status: 'SHARED' },
      }),
    ])

    const totals = snapshots.reduce((acc, s) => ({
      reach:       acc.reach       + s.totalReach,
      impressions: acc.impressions + s.totalImpressions,
      engagement:  acc.engagement  + s.totalEngagement,
      clicks:      acc.clicks      + s.linkClicks,
    }), { reach: 0, impressions: 0, engagement: 0, clicks: 0 })

    const avgEngRate = snapshots.length
      ? snapshots.reduce((a, s) => a + s.avgEngagementRate, 0) / snapshots.length
      : 0

    return {
      period: { from: q.from, to: q.to },
      posts:  Object.fromEntries(postStats.map(s => [s.status, s._count])),
      totals,
      avgEngagementRate: Math.round(avgEngRate * 100) / 100,
      advocacyShared: advocacyCount,
      timeline: snapshots,
    }
  })

  // ── GET /analytics/posts — top performing posts ───────
  app.get('/posts', {
    schema: { tags: ['analytics'], security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req) => {
    const q = z.object({
      sortBy: z.enum(['impressions','reach','engagementRate','likes']).default('impressions'),
      limit:  z.coerce.number().min(1).max(50).default(10),
    }).parse(req.query)

    const posts = await app.db.post.findMany({
      where: { orgId: req.orgId, status: 'PUBLISHED', analytics: { isNot: null } },
      include: {
        analytics:  true,
        connection: { select: { platform: true } },
      },
      orderBy: { analytics: { [q.sortBy]: 'desc' } },
      take: q.limit,
    })

    return { posts }
  })

  // ── GET /analytics/competitors — benchmark ────────────
  // (In production: fetches public data via platform APIs)
  app.get('/benchmark', {
    schema: { tags: ['analytics'], security: [{ bearerAuth: [] }] },
    preHandler: [app.authenticate],
  }, async (req) => {
    // Mock benchmark data — replace with real competitor API in production
    const orgSnapshots = await app.db.analyticsSnapshot.findMany({
      where: { orgId: req.orgId, date: { gte: dayjs().subtract(30, 'day').toDate() } },
    })
    const myAvgEng = orgSnapshots.length
      ? orgSnapshots.reduce((a, s) => a + s.avgEngagementRate, 0) / orgSnapshots.length
      : 0

    return {
      yourEngagementRate: Math.round(myAvgEng * 100) / 100,
      industryAverage:    3.2,
      topQuartile:        6.1,
      trend: myAvgEng >= 3.2 ? 'above_average' : 'below_average',
      tip: myAvgEng < 3.2
        ? 'Probeer meer carousel-posts — die scoren gemiddeld 2× beter op LinkedIn in jouw sector.'
        : 'Goed bezig! Je zit boven het gemiddelde. Overweeg meer video voor nog meer bereik.',
    }
  })
}
