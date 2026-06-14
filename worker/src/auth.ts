import { hmacSha256Base64 } from './crypto';

const SESSION_COOKIE = 'welearn_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
const DEFAULT_SECRET = 'change-me-random-string';

function base64UrlEncode(value: string): string {
  return btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
  return atob(padded);
}

export function isDefaultSecret(secret: string): boolean {
  return secret === DEFAULT_SECRET;
}

export async function createSessionToken(username: string, secret: string): Promise<string> {
  const ttl = isDefaultSecret(secret) ? 60 * 15 : SESSION_TTL_SECONDS;
  const payload = JSON.stringify({ username, exp: Math.floor(Date.now() / 1000) + ttl });
  const encodedPayload = base64UrlEncode(payload);
  const signature = await hmacSha256Base64(encodedPayload, secret);
  return `${encodedPayload}.${base64UrlEncode(signature)}`;
}

export async function parseSessionToken(token: string, secret: string): Promise<string | null> {
  const [encodedPayload, encodedSignature] = token.split('.');
  if (!encodedPayload || !encodedSignature) return null;

  const expectedSignature = base64UrlEncode(await hmacSha256Base64(encodedPayload, secret));
  if (encodedSignature !== expectedSignature) return null;

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as { username?: string; exp?: number };
    if (!payload.username || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload.username;
  } catch {
    return null;
  }
}

export function makeSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function getSessionFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('Cookie') || '';
  const match = cookieHeader.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
  return match ? match[1] : null;
}
