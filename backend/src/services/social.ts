// ─────────────────────────────────────────────────────────
//  Social publisher — platform API adapters
//  Each platform has its own publish() implementation
// ─────────────────────────────────────────────────────────
import type { FastifyBaseLogger } from 'fastify'
import type { Post } from '@prisma/client'

type Platform = 'LINKEDIN' | 'INSTAGRAM' | 'TWITTER' | 'FACEBOOK' | 'TIKTOK' | 'WHATSAPP_BUSINESS'

export class SocialPublisher {
  constructor(
    private platform: Platform,
    private accessToken: string,
    private log: FastifyBaseLogger,
  ) {}

  async publish(post: Post): Promise<{ platformPostId: string }> {
    const content = post.contentNl ?? post.contentEn ?? ''
    if (!content) throw new Error('Post heeft geen content')

    switch (this.platform) {
      case 'LINKEDIN':   return this.publishLinkedIn(post, content)
      case 'INSTAGRAM':  return this.publishInstagram(post, content)
      case 'TWITTER':    return this.publishTwitter(post, content)
      case 'FACEBOOK':   return this.publishFacebook(post, content)
      case 'TIKTOK':     return this.publishTikTok(post, content)
      case 'WHATSAPP_BUSINESS': return this.publishWhatsApp(post, content)
      default: throw new Error(`Platform ${this.platform} niet ondersteund`)
    }
  }

  // ── LinkedIn ────────────────────────────────────────
  private async publishLinkedIn(post: Post, content: string) {
    // LinkedIn UGC Posts API v2
    const body: Record<string, unknown> = {
      author:          `urn:li:person:${this.accessToken.slice(0, 8)}`, // replaced with real URN
      lifecycleState:  'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary:   { text: content },
          shareMediaCategory: post.mediaUrls.length ? 'IMAGE' : 'NONE',
          ...(post.liArticleUrl && {
            shareMediaCategory: 'ARTICLE',
            media: [{ status: 'READY', originalUrl: post.liArticleUrl, title: { text: post.liDocumentTitle ?? '' } }],
          }),
        },
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' },
    }

    // Mock API call (replace with real fetch in production)
    this.log.info({ platform: 'linkedin', body }, 'Publishing to LinkedIn')
    return { platformPostId: `li_${Date.now()}` }
  }

  // ── Instagram ───────────────────────────────────────
  private async publishInstagram(post: Post, content: string) {
    // Instagram Graph API — create media container then publish
    this.log.info({ platform: 'instagram', contentLen: content.length }, 'Publishing to Instagram')
    return { platformPostId: `ig_${Date.now()}` }
  }

  // ── Twitter/X ───────────────────────────────────────
  private async publishTwitter(post: Post, content: string) {
    // Twitter API v2 — POST /2/tweets
    if (content.length > 280) throw new Error('Tweet te lang (max 280 tekens)')
    this.log.info({ platform: 'twitter', contentLen: content.length }, 'Publishing to Twitter/X')
    return { platformPostId: `tw_${Date.now()}` }
  }

  // ── Facebook ────────────────────────────────────────
  private async publishFacebook(post: Post, content: string) {
    // Facebook Graph API — /{page-id}/feed
    this.log.info({ platform: 'facebook', contentLen: content.length }, 'Publishing to Facebook')
    return { platformPostId: `fb_${Date.now()}` }
  }

  // ── TikTok ──────────────────────────────────────────
  private async publishTikTok(_post: Post, _content: string) {
    // TikTok Content Posting API — video only
    this.log.info({ platform: 'tiktok' }, 'Publishing to TikTok')
    return { platformPostId: `tt_${Date.now()}` }
  }

  // ── WhatsApp Business ───────────────────────────────
  private async publishWhatsApp(post: Post, content: string) {
    // WhatsApp Business Cloud API — broadcast message
    this.log.info({ platform: 'whatsapp', contentLen: content.length }, 'Publishing to WhatsApp Business')
    return { platformPostId: `wa_${Date.now()}` }
  }
}
