export function generateCipherText(password: string): [string, string] {
  const T0 = Date.now();
  const V = (T0 >> 16) & 0xFF;

  let vv = V;
  for (let i = 0; i < password.length; i++) {
    vv ^= password.charCodeAt(i);
  }

  const remainder = vv % 100;
  const T1 = Math.floor(T0 / 100) * 100 + remainder;

  let hexStr = '';
  for (let i = 0; i < password.length; i++) {
    hexStr += password.charCodeAt(i).toString(16).padStart(2, '0');
  }

  const S = `${T1}*${hexStr}`;
  const encoded = btoa(S);

  return [encoded, T1.toString()];
}
