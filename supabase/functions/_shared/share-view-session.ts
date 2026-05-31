// Stateless HMAC-signed session tokens for anonymous transcript share viewing.
// Format: base64url(payload).base64url(hmacSHA256(payload, secret))
// Payload JSON: { t: shareToken, r: recipientEmailLowerHash, e: expEpochSeconds, v: 1 }

const SECRET = Deno.env.get('CONSENT_IP_SALT_SECRET') || ''

function b64urlEncode(bytes: Uint8Array): string {
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlDecode(str: string): Uint8Array {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4))
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function hmacSign(payload: string): Promise<string> {
  if (!SECRET) throw new Error('CONSENT_IP_SALT_SECRET not configured')
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
  return b64urlEncode(new Uint8Array(sig))
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export interface ShareViewSessionPayload {
  shareToken: string
  recipientEmailHash: string
  expiresAt: number // epoch seconds
}

export async function issueShareViewSession(
  shareToken: string,
  recipientEmailLower: string,
  ttlSeconds: number,
): Promise<string> {
  const recipientEmailHash = await sha256Hex(`${SECRET}|${recipientEmailLower}`)
  const payload = {
    t: shareToken,
    r: recipientEmailHash,
    e: Math.floor(Date.now() / 1000) + ttlSeconds,
    v: 1,
  }
  const payloadJson = JSON.stringify(payload)
  const payloadB64 = b64urlEncode(new TextEncoder().encode(payloadJson))
  const sig = await hmacSign(payloadB64)
  return `${payloadB64}.${sig}`
}

export async function verifyShareViewSession(token: string): Promise<ShareViewSessionPayload | null> {
  try {
    const parts = token.split('.')
    if (parts.length !== 2) return null
    const [payloadB64, sig] = parts
    const expectedSig = await hmacSign(payloadB64)
    // Constant-time compare
    if (sig.length !== expectedSig.length) return null
    let diff = 0
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i)
    if (diff !== 0) return null
    const payloadJson = new TextDecoder().decode(b64urlDecode(payloadB64))
    const payload = JSON.parse(payloadJson)
    if (payload.v !== 1) return null
    if (typeof payload.t !== 'string' || typeof payload.r !== 'string' || typeof payload.e !== 'number') return null
    if (payload.e < Math.floor(Date.now() / 1000)) return null
    return { shareToken: payload.t, recipientEmailHash: payload.r, expiresAt: payload.e }
  } catch {
    return null
  }
}

export async function hashRecipientEmail(recipientEmailLower: string): Promise<string> {
  return sha256Hex(`${SECRET}|${recipientEmailLower}`)
}

export async function hashOtpCode(shareToken: string, code: string): Promise<string> {
  return sha256Hex(`${SECRET}|otp|${shareToken}|${code}`)
}
