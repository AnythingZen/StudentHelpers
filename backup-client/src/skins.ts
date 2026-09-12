// One world type — a forest — with a palette per subject. Never a second biome.
export interface Skin { ground: number; path: number; trunk: number; foliage: number[]; fog: number; sky: number }

const MATHS: Skin = { ground: 0x7fa37a, path: 0xc9b98f, trunk: 0xe9e4d6, foliage: [0x4f9a6e, 0x5aa87a, 0x3f8a60], fog: 0xbfd0dc, sky: 0xcfe0ea };
const ENGLISH: Skin = { ground: 0x93a052, path: 0xd8bf86, trunk: 0x6b4a2b, foliage: [0xd98b2b, 0xe0a43a, 0xc4692a], fog: 0xf0d9a8, sky: 0xf6e6c2 };

export const skinFor = (subject: string): Skin => (/english|reading/i.test(subject) ? ENGLISH : MATHS);
