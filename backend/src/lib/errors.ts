// ─────────────────────────────────────────────────────────
//  Bloei — Domain error types
// ─────────────────────────────────────────────────────────
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message)
    this.name = 'AppError'
  }
}

export const E = {
  notFound:    (msg = 'Niet gevonden')          => new AppError(404, msg, 'NOT_FOUND'),
  unauthorized:(msg = 'Niet geautoriseerd')     => new AppError(401, msg, 'UNAUTHORIZED'),
  forbidden:   (msg = 'Geen toegang')           => new AppError(403, msg, 'FORBIDDEN'),
  badRequest:  (msg = 'Ongeldige invoer')       => new AppError(400, msg, 'BAD_REQUEST'),
  conflict:    (msg = 'Al in gebruik')          => new AppError(409, msg, 'CONFLICT'),
  internal:    (msg = 'Serverfout')             => new AppError(500, msg, 'INTERNAL_ERROR'),
  planLimit:   (msg = 'Plan limiet bereikt')    => new AppError(402, msg, 'PLAN_LIMIT'),
} as const
