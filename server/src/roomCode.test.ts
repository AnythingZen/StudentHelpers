import { describe, it, expect } from 'vitest';
import { mintRoomCode, isRoomCode } from './roomCode.js';

describe('mintRoomCode', () => {
  it('produces 4 unambiguous characters', () => {
    for (let i = 0; i < 500; i++) {
      const code = mintRoomCode(new Set());
      expect(code).toMatch(/^[A-Z0-9]{4}$/);
      expect(code).not.toMatch(/[01OILSZB258]/);
      expect(code).not.toMatch(/[AEIOUY]/); // no vowels, so no accidental words
    }
  });

  it('never returns a code that is already taken', () => {
    const seq = [0, 0, 0, 0, 0.99, 0.99, 0.99, 0.99];
    let i = 0;
    const taken = new Set([mintRoomCode(new Set(), () => 0)]);
    const code = mintRoomCode(taken, () => seq[i++ % seq.length]!);
    expect(taken.has(code)).toBe(false);
  });

  it('isRoomCode accepts the fixture codes and rejects junk', () => {
    expect(isRoomCode('OAK7')).toBe(true);
    expect(isRoomCode('FERN')).toBe(true);
    expect(isRoomCode('oak7')).toBe(false);
    expect(isRoomCode('OAK7X')).toBe(false);
  });
});
