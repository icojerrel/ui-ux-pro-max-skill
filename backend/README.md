# Bloei Backend API

Dutch B2B Social Media SaaS — REST API built with Fastify + TypeScript + PostgreSQL.

## Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20+ / Bun |
| Framework | Fastify 4 + TypeScript |
| Database | PostgreSQL 16 + Prisma ORM |
| Queue | BullMQ + Redis 7 |
| Auth | JWT (access 15m + refresh 30d) |
| AI | Claude (claude-sonnet-4-6) via Anthropic SDK |
| Encryption | AES-256-GCM for OAuth tokens |

## Quick Start

```bash
# 1. Start infra
docker compose up -d

# 2. Install dependencies
bun install

# 3. Configure environment
cp .env.example .env
# Edit .env — at minimum set JWT secrets

# 4. Push database schema
bun run db:push

# 5. Seed demo data
bun run db:seed

# 6. Start dev server
bun run dev
```

API available at: http://localhost:3001  
Swagger docs at: http://localhost:3001/docs  
Health check:    http://localhost:3001/health

## API Endpoints

### Auth — `/api/v1/auth`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Nieuw account + org aanmaken |
| POST | `/login` | Inloggen (returns JWT pair) |
| POST | `/refresh` | Nieuw access token ophalen |
| POST | `/logout` | Refresh token intrekken |

### Posts — `/api/v1/posts`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Berichten ophalen (gefilterd) |
| GET | `/calendar?from=&to=` | Kalenderoverzicht |
| GET | `/:id` | Bericht details |
| POST | `/` | Nieuw bericht (optioneel inplannen) |
| PUT | `/:id` | Bericht bijwerken / herplannen |
| DELETE | `/:id` | Bericht verwijderen |
| POST | `/bulk-schedule` | Kwartaalplan in bulk inplannen |

### AI — `/api/v1/ai`
| Method | Path | Description |
|--------|------|-------------|
| POST | `/generate` | Bloem AI content genereren |
| POST | `/score` | Post kwaliteitsscore berekenen |
| GET | `/jobs` | AI jobs lijst |
| GET | `/jobs/:id` | AI job status |

### Analytics — `/api/v1/analytics`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/overview` | Dashboard statistieken |
| GET | `/posts` | Top presterende berichten |
| GET | `/benchmark` | Vergelijking met sector gemiddelde |

### Advocacy — `/api/v1/advocacy`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/leaderboard` | Team scorebord |
| GET | `/suggestions` | Openstaande suggesties voor medewerker |
| POST | `/:itemId/share` | Bericht delen (+10 punten) |
| POST | `/:itemId/decline` | Suggestie afwijzen |
| POST | `/suggest` | Post doorsturen naar teamleden |

### Platforms — `/api/v1/platforms`
| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Gekoppelde platformen |
| POST | `/connect` | Nieuw platform koppelen (OAuth callback) |
| DELETE | `/:id` | Platform ontkoppelen |

## Database Models

```
User ─── TeamMember ─── Organisation ─── Brand
                    └── PlatformConnection
                    └── Post ─── PostAnalytics
                    │       └── AdvocacyItem
                    └── Campaign
                    └── AiJob
                    └── AnalyticsSnapshot
                    └── OrgDesignSystem
```

## Environment Variables

See `.env.example` for all required variables. Required at startup:
- `DATABASE_URL`
- `JWT_ACCESS_SECRET` (min 32 chars)
- `JWT_REFRESH_SECRET` (min 32 chars)

Optional (features degrade gracefully without them):
- `ANTHROPIC_API_KEY` — Bloem AI generation
- `REDIS_URL` — post scheduling queue
- Social OAuth credentials per platform

## Security

- Passwords hashed with bcrypt (cost 12)
- OAuth tokens encrypted with AES-256-GCM at rest
- JWT access tokens expire in 15 minutes
- Refresh token rotation on every use
- Rate limiting: 100 req/min global, 10 req/min on login, 20 req/hr on AI
- CORS restricted to `FRONTEND_URL` in production
- Helmet security headers enabled in production

## Architecture Notes

**Post scheduling**: BullMQ jobs are created with `delay` calculated from `scheduledAt`. On reschedule, the old job is removed and a new one is queued. If the worker fails, BullMQ retries with exponential backoff (max 3 attempts).

**Bloem AI**: Uses Claude claude-sonnet-4-6 with org-specific brand context. The system prompt includes tone keywords, example posts, and sector. Output is JSON-parsed and stored in `AiJob.result`. Bulk-schedule writes all posts to the DB and queues them.

**Multi-tenant isolation**: Every DB query is scoped to `orgId` from the JWT payload. No cross-tenant data leakage.
