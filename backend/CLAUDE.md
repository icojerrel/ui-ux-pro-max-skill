# CLAUDE.md — Bloei Backend

Fastify REST API for Bloei, Dutch B2B Social Media SaaS.

## Quick Start

```bash
docker compose up -d          # PostgreSQL + Redis
bun install
bun run db:push               # Apply schema (no migration files)
bun run db:seed               # Demo data
bun run dev                   # :3001 — hot reload via tsx watch
```

## Tech Stack

| Layer | Tech |
|-------|------|
| Runtime | Node.js 20 / Bun |
| Framework | Fastify 4 + TypeScript (NodeNext) |
| ORM | Prisma 5 + PostgreSQL 16 |
| Queue | BullMQ 5 + Redis 7 |
| Auth | @fastify/jwt — access (15m) + refresh (30d) |
| AI | Anthropic SDK — claude-sonnet-4-6 |
| Crypto | Node.js `crypto` — AES-256-GCM |
| Docs | @fastify/swagger + swagger-ui at /docs |

## Environment Variables

Copy `.env.example` → `.env`. Required at startup:

| Var | Description |
|-----|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | Min 32 chars random string |
| `JWT_REFRESH_SECRET` | Min 32 chars random string (different from access) |
| `REDIS_URL` | Redis connection string (default: redis://localhost:6379) |
| `ANTHROPIC_API_KEY` | For Bloem AI generation (optional — degrades gracefully) |
| `ENCRYPTION_KEY` | 32-char key for AES-256-GCM OAuth token encryption |

## Project Layout

```
src/
├── index.ts          # App entry: registers plugins + routes + starts worker
├── config.ts         # All env vars with defaults — import from here, not process.env
├── lib/
│   ├── errors.ts     # AppError class + E.notFound/unauthorized/forbidden/etc
│   └── crypto.ts     # encrypt(plain) → base64url, decrypt(packed) → plain
├── plugins/
│   ├── db.ts         # Prisma → app.db
│   ├── auth.ts       # app.authenticate preHandler + request.userId/orgId/role
│   └── redis-queue.ts# app.postQueue (BullMQ Queue) + app.redis (IORedis)
├── routes/           # One file per resource (see API below)
└── services/
    ├── bloem.ts      # BloемService.generate() + .scorePost()
    ├── scheduler.ts  # BullMQ Worker — publish posts at scheduled time
    └── social.ts     # SocialPublisher — platform-specific publish methods
```

## API Endpoints

All routes prefixed `/api/v1`. Protected routes require `Authorization: Bearer <access_token>`.

### Auth
```
POST /auth/register   Body: { name, email, password, orgName }
POST /auth/login      Body: { email, password }
POST /auth/refresh    Body: { refreshToken }
POST /auth/logout     Body: { refreshToken }
```

### Posts
```
GET    /posts                  ?status=&platform=&page=&limit=
GET    /posts/calendar         ?from=ISO&to=ISO
GET    /posts/:id
POST   /posts                  Body: { contentNl, scheduledAt, connectionId, ... }
PUT    /posts/:id
DELETE /posts/:id
POST   /posts/bulk-schedule    Body: { posts: [...] }
```

### AI (Bloem)
```
POST /ai/generate    Body: { type, platform, tone, language, postsCount, inputText? }
POST /ai/score       Body: { content, platform, language }
GET  /ai/jobs
GET  /ai/jobs/:id
```

`type` values: `GENERATE_SINGLE` | `GENERATE_QUARTER` | `REPURPOSE` | `IMPROVE`

### Analytics
```
GET /analytics/overview    ?from=ISO&to=ISO
GET /analytics/posts       ?sortBy=impressions&limit=10
GET /analytics/benchmark
```

### Advocacy
```
GET  /advocacy/leaderboard
GET  /advocacy/suggestions
POST /advocacy/:itemId/share    Body: { message? }
POST /advocacy/:itemId/decline
POST /advocacy/suggest          Body: { postId, userIds: [] }
```

### Platforms
```
GET    /platforms
POST   /platforms/connect    Body: { platform, platformUserId, accessToken, ... }
DELETE /platforms/:id
```

### Org + Users
```
GET /users/me
PUT /users/me               Body: { name?, locale?, timezone? }
POST /users/me/change-password

GET /orgs/me
PUT /orgs/me
POST /orgs/members/invite   Body: { email, role }
DELETE /orgs/members/:userId
```

## Adding a Route

```typescript
// src/routes/example.ts
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { E } from '../lib/errors.js'

export default async function exampleRoutes(app: FastifyInstance) {
  app.get('/', {
    preHandler: [app.authenticate],
  }, async (req) => {
    // req.userId, req.orgId, req.role available
    const data = await app.db.someModel.findMany({ where: { orgId: req.orgId } })
    return { data }
  })
}
```

Register in `src/index.ts`:
```typescript
import exampleRoutes from './routes/example.js'
await app.register(exampleRoutes, { prefix: '/api/v1/example' })
```

## Error Handling

Use the `E` helpers — they throw `AppError` which the global handler formats:

```typescript
if (!record) throw E.notFound('Bericht niet gevonden')
if (!allowed) throw E.forbidden()
if (conflict)  throw E.conflict('Al in gebruik')
```

All errors return: `{ statusCode, error, message }`.

## Post Scheduling Flow

```
POST /posts { scheduledAt }
  → Post.status = SCHEDULED
  → BullMQ job added with delay = scheduledAt - now()
  → Job fires → scheduler worker → SocialPublisher.publish()
  → Post.status = PUBLISHED | FAILED
  → PostAnalytics record created
```

On reschedule (PUT /posts/:id with new scheduledAt):
- Old BullMQ job removed via `postQueue.remove(post.jobId)`
- New job queued with updated delay

## Bloem AI — Adding Generation Types

Edit `src/services/bloem.ts`:

1. Add to `AiJobType` enum in `prisma/schema.prisma`
2. Add case in `BloемService.buildUserPrompt()` with the prompt
3. Call `this.client.messages.create()` — always JSON-parse the response
4. Add to route validation in `src/routes/ai.ts` → `GenerateBody.type`

## Conventions

- Import paths must end with `.js` (NodeNext module resolution)
- Use `z.parse()` for request body validation — Zod errors are caught by global handler
- Always scope DB queries with `orgId: req.orgId` — never query without tenant filter
- Encrypt OAuth tokens before storing: `encrypt(rawToken)`, decrypt with `decrypt(enc)`
- Passwords: `bcrypt.hash(password, 12)` — cost 12 is non-negotiable
- Never log tokens, passwords, or encrypted values
