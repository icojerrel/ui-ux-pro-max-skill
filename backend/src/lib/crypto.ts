// ─────────────────────────────────────────────────────────
//  Bloei — AES-256-GCM encryption for OAuth tokens
// ─────────────────────────────────────────────────────────
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { config } from '../config.js'

const ALGO = 'aes-256-gcm'
const KEY  = Buffer.from(config.encryption.key.padEnd(32, '0').slice(0, 32), 'utf8')

export function encrypt(plain: string): string {
  const iv  = randomBytes(12)
  const cipher = createCipheriv(ALGO, KEY, iv)
  const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  // iv(12) + tag(16) + enc
  return Buffer.concat([iv, tag, enc]).toString('base64url')
}

export function decrypt(packed: string): string {
  const buf = Buffer.from(packed, 'base64url')
  const iv  = buf.subarray(0, 12)
  const tag = buf.subarray(12, 28)
  const enc = buf.subarray(28)
  const decipher = createDecipheriv(ALGO, KEY, iv)
  decipher.setAuthTag(tag)
  return decipher.update(enc) + decipher.final('utf8')
}
