// ─────────────────────────────────────────────────────────
//  Bloem AI Service — Claude-powered Dutch content engine
// ─────────────────────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk'
import { config } from '../config.js'
import type { FastifyBaseLogger } from 'fastify'

type Platform = 'LINKEDIN' | 'INSTAGRAM' | 'TWITTER' | 'FACEBOOK' | 'TIKTOK' | 'WHATSAPP_BUSINESS'
type Language = 'NL' | 'FR' | 'EN'

interface BrandContext {
  name:          string
  description:   string
  toneKeywords:  string[]
  avoidKeywords: string[]
  examplePosts:  string[]
  usp:           string
}

interface GenerateOptions {
  type:        string
  language:    Language
  platform?:   Platform
  tone:        string
  postsCount:  number
  inputText?:  string
  inputUrl?:   string
  topic?:      string
  sector?:     string
  brandContext: BrandContext
}

export interface GeneratedPost {
  content:   string
  hashtags:  string[]
  platform?: Platform
  type:      string
  score:     number   // AI self-assessed quality 0-100
  reasoning: string   // why this approach
}

export interface GenerateResult {
  posts:      GeneratedPost[]
  tokensUsed: number
  model:      string
}

export interface ScoreResult {
  overall:     number          // 0-100
  dimensions: {
    engagement:   number
    clarity:      number
    tone:         number
    cta:          number
    hashtags:     number
  }
  suggestions: string[]
  verdict:     string
}

// ── Platform character limits ──────────────────────────
const LIMITS: Record<Platform, number> = {
  LINKEDIN:           3000,
  INSTAGRAM:          2200,
  TWITTER:            280,
  FACEBOOK:           63206,
  TIKTOK:             2200,
  WHATSAPP_BUSINESS:  4096,
}

const LANG_NAMES: Record<Language, string> = {
  NL: 'Dutch (Nederlandse zakelijke taal)',
  FR: 'French (Belgisch-Frans)',
  EN: 'English',
}

export class BloемService {
  private client: Anthropic

  constructor(private log: FastifyBaseLogger) {
    this.client = new Anthropic({ apiKey: config.ai.anthropicKey })
  }

  // ── Main generation ────────────────────────────────
  async generate(opts: GenerateOptions): Promise<GenerateResult> {
    const { platform, postsCount, language, tone, brandContext, sector } = opts
    const charLimit = platform ? LIMITS[platform] : 3000
    const langStr   = LANG_NAMES[language]

    const systemPrompt = `You are Bloem, an expert B2B social media copywriter specializing in ${langStr}.
You write for Dutch and Belgian professional services companies (law, accounting, IT, HR, consulting).
Your writing is ${tone}, authentic, and business-appropriate.
You never use generic filler phrases. Every post has a clear hook, value proposition, and call to action.

Brand context:
- Company: ${brandContext.name}
- Description: ${brandContext.description}
- USP: ${brandContext.usp}
- Sector: ${sector ?? 'professional services'}
- Tone keywords: ${brandContext.toneKeywords.join(', ') || 'professional, trustworthy'}
- Avoid: ${brandContext.avoidKeywords.join(', ') || 'nothing specific'}
${brandContext.examplePosts.length ? `\nExample approved posts:\n${brandContext.examplePosts.slice(0, 3).map(p => `"${p}"`).join('\n')}` : ''}

Platform: ${platform ?? 'LinkedIn'}
Max characters: ${charLimit}
Language: ${langStr}`

    const userPrompt = this.buildUserPrompt(opts)

    const response = await this.client.messages.create({
      model:      config.ai.model,
      max_tokens: 4096,
      system:     systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : ''
    const posts = this.parsePostsFromResponse(raw, platform, postsCount)

    return {
      posts,
      tokensUsed: response.usage.input_tokens + response.usage.output_tokens,
      model:      config.ai.model,
    }
  }

  // ── Quality scoring ────────────────────────────────
  async scorePost(content: string, platform: Platform, language: Language): Promise<ScoreResult> {
    const prompt = `Score this ${LANG_NAMES[language]} ${platform} post for B2B engagement quality.
Return ONLY valid JSON matching this schema:
{
  "overall": <0-100>,
  "dimensions": {
    "engagement": <0-100>,
    "clarity": <0-100>,
    "tone": <0-100>,
    "cta": <0-100>,
    "hashtags": <0-100>
  },
  "suggestions": ["<tip 1>", "<tip 2>"],
  "verdict": "<one sentence in ${language}>"
}

Post to score:
"""
${content}
"""`

    const response = await this.client.messages.create({
      model:      config.ai.model,
      max_tokens: 512,
      messages: [{ role: 'user', content: prompt }],
    })

    const raw = response.content[0].type === 'text' ? response.content[0].text : '{}'
    try {
      return JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as ScoreResult
    } catch {
      return {
        overall: 70,
        dimensions: { engagement: 70, clarity: 70, tone: 70, cta: 60, hashtags: 65 },
        suggestions: ['Voeg een duidelijkere call-to-action toe', 'Overweeg meer specifieke hashtags'],
        verdict: 'Goede post met ruimte voor verbetering.',
      }
    }
  }

  // ── Private helpers ────────────────────────────────
  private buildUserPrompt(opts: GenerateOptions): string {
    switch (opts.type) {
      case 'GENERATE_QUARTER':
        return `Generate exactly ${opts.postsCount} unique social media posts for a quarterly content calendar.
Mix of types: 40% educational, 30% personal/behind-scenes, 20% promotional, 10% employee advocacy.
${opts.topic ? `Focus theme: ${opts.topic}` : ''}
Return each post as JSON array: [{"content":"...","hashtags":["..."],"type":"...","score":85,"reasoning":"..."}]`

      case 'GENERATE_SINGLE':
        return `Write 1 post${opts.topic ? ` about: ${opts.topic}` : ''}.
Return JSON: {"content":"...","hashtags":["..."],"type":"TEXT","score":90,"reasoning":"..."}`

      case 'REPURPOSE':
        return `Repurpose this content into ${opts.postsCount} social media posts:
"""
${opts.inputText?.slice(0, 5000) ?? ''}
"""
Return JSON array: [{"content":"...","hashtags":["..."],"type":"...","score":85,"reasoning":"..."}]`

      case 'IMPROVE':
        return `Improve this post and return a better version:
"""
${opts.inputText ?? ''}
"""
Return JSON: {"content":"...","hashtags":["..."],"type":"TEXT","score":92,"reasoning":"what was changed and why"}`

      default:
        return 'Generate 1 professional LinkedIn post. Return as JSON.'
    }
  }

  private parsePostsFromResponse(raw: string, platform: Platform | undefined, expected: number): GeneratedPost[] {
    try {
      const match = raw.match(/\[[\s\S]*\]|\{[\s\S]*\}/)
      if (!match) return this.fallbackPosts(expected, platform)
      const parsed = JSON.parse(match[0])
      const arr = Array.isArray(parsed) ? parsed : [parsed]
      return arr.slice(0, expected).map(p => ({
        content:   p.content ?? '',
        hashtags:  p.hashtags ?? [],
        platform,
        type:      p.type ?? 'TEXT',
        score:     p.score ?? 80,
        reasoning: p.reasoning ?? '',
      }))
    } catch {
      return this.fallbackPosts(expected, platform)
    }
  }

  private fallbackPosts(count: number, platform?: Platform): GeneratedPost[] {
    return Array.from({ length: count }, (_, i) => ({
      content:   `Post ${i + 1} — Bloem kon geen content genereren. Probeer het opnieuw.`,
      hashtags:  [],
      platform,
      type:      'TEXT',
      score:     0,
      reasoning: 'Generation failed',
    }))
  }
}
