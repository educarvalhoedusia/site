export function generatePassword(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < length; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function encodeToken(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary);
}

export function decodeToken(token) {
  let binary;
  try {
    binary = atob(token);
  } catch (e) {
    throw new Error('Token inválido');
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  let payload;
  try {
    payload = JSON.parse(json);
  } catch (e) {
    throw new Error('Token corrompido');
  }
  if (!payload.nome || !payload.email || !payload.disc) {
    throw new Error('Token incompleto');
  }
  return payload;
}
