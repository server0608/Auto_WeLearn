export function generateCipherText(password: string): [string, string] {
  const T0 = Date.now();
  const bytes = new TextEncoder().encode(password);
  let V = (T0 >> 16) & 0xFF;

  for (const byte of bytes) {
    V ^= byte;
  }

  const remainder = V % 100;
  const T1 = Math.floor(T0 / 100) * 100 + remainder;

  let hexStr = '';
  for (const byte of bytes) {
    hexStr += byte.toString(16).padStart(2, '0');
  }

  const S = `${T1}*${hexStr}`;
  const encoded = btoa(S);

  return [encoded, T1.toString()];
}
