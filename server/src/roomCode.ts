// 4-character room codes a person can read out on stage and another can type.
// No 0/O, 1/I/L, 5/S, 2/Z, 8/B — characters that get misheard or misread.
const ALPHABET = 'ACDEFGHJKMNPQRTUVWXY3469';

export function mintRoomCode(taken: Set<string>, random: () => number = Math.random): string {
  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(random() * ALPHABET.length)];
    if (!taken.has(code)) return code;
  }
  // 24^4 = 331,776 codes; reaching this means the store is effectively full.
  throw new Error('Could not mint a unique room code');
}

export const isRoomCode = (s: string) => /^[A-Z0-9]{4}$/.test(s);
