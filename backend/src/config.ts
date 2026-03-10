// ─────────────────────────────────────────────────────────
//  Bloei — Centralized config (validated at startup)
// ─────────────────────────────────────────────────────────

function require_env(key: string): string {
  const val = process.env[key]
  if (!val) throw new Error(`Missing required env var: ${key}`)
  return val
}

export const config = {
  env:  process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3001),
  apiBaseUrl: process.env.API_BASE_URL ?? 'http://localhost:3001',
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3000',

  db: {
    url: require_env('DATABASE_URL'),
  },

  redis: {
    url: process.env.REDIS_URL ?? 'redis://localhost:6379',
  },

  jwt: {
    accessSecret:  require_env('JWT_ACCESS_SECRET'),
    refreshSecret: require_env('JWT_REFRESH_SECRET'),
    accessExpiry:  process.env.JWT_ACCESS_EXPIRY  ?? '15m',
    refreshExpiry: process.env.JWT_REFRESH_EXPIRY ?? '30d',
  },

  ai: {
    anthropicKey: process.env.ANTHROPIC_API_KEY ?? '',
    model: 'claude-sonnet-4-6',
  },

  email: {
    resendKey:  process.env.RESEND_API_KEY ?? '',
    fromEmail:  process.env.FROM_EMAIL ?? 'noreply@bloei.nl',
  },

  encryption: {
    key: process.env.ENCRYPTION_KEY ?? 'dev_key_32bytes_change_in_prod!!',
  },

  // Social OAuth credentials
  social: {
    linkedin:  { clientId: process.env.LINKEDIN_CLIENT_ID ?? '', secret: process.env.LINKEDIN_CLIENT_SECRET ?? '' },
    instagram: { clientId: process.env.INSTAGRAM_CLIENT_ID ?? '', secret: process.env.INSTAGRAM_CLIENT_SECRET ?? '' },
    twitter:   { clientId: process.env.TWITTER_CLIENT_ID ?? '', secret: process.env.TWITTER_CLIENT_SECRET ?? '' },
    facebook:  { clientId: process.env.FACEBOOK_APP_ID ?? '', secret: process.env.FACEBOOK_APP_SECRET ?? '' },
  },

  // Scheduling queue
  queue: {
    concurrency: Number(process.env.QUEUE_CONCURRENCY ?? 5),
    maxRetries:  Number(process.env.QUEUE_MAX_RETRIES ?? 3),
    retryDelay:  Number(process.env.QUEUE_RETRY_DELAY_MS ?? 60_000), // 1 min
  },

  isProd: process.env.NODE_ENV === 'production',
  isDev:  process.env.NODE_ENV !== 'production',
} as const
