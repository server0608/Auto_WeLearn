function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function generateCipherText(password: string): [string, string] {
  const timestamp = Date.now();
  const passwordBytes = new TextEncoder().encode(password);
  let value = (timestamp >> 16) & 0xff;

  for (const byte of passwordBytes) {
    value ^= byte;
  }

  const remainder = value % 100;
  const adjustedTimestamp = Math.floor(timestamp / 100) * 100 + remainder;
  const payload = `${adjustedTimestamp}*${bytesToHex(passwordBytes)}`;

  return [btoa(payload), String(adjustedTimestamp)];
}

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(hash));
}

export async function hashPassword(password: string): Promise<string> {
  return `sha256:${await sha256Hex(password)}`;
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return hash === await hashPassword(password);
}

export async function hmacSha256Base64(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}
