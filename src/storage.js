const encode = bytes => btoa(String.fromCharCode(...bytes));
const decode = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));

async function key(passphrase, salt) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
    material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function seal(token, passphrase) {
  if (passphrase.length < 12) throw new Error('Bruk minst 12 tegn i passfrasen.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv },
    await key(passphrase, salt), new TextEncoder().encode(token));
  return { salt: encode(salt), iv: encode(iv), data: encode(new Uint8Array(encrypted)) };
}

export async function unseal(record, passphrase) {
  try {
    const clear = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode(record.iv) },
      await key(passphrase, decode(record.salt)), decode(record.data));
    return new TextDecoder().decode(clear);
  } catch {
    throw new Error('Kunne ikke låse opp tokenet. Sjekk passfrasen.');
  }
}

export function readLocal(id, fallback) {
  try { return JSON.parse(localStorage.getItem(id)) ?? fallback; }
  catch { return fallback; }
}
