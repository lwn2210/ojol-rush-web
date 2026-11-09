/**
 * Seeded PRNG (mulberry32). The state lives in a plain object so a whole game
 * stays JSON and replays from its seed.
 */
export interface RngState {
  rng: number
}

export function rand(s: RngState): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0
  let t = s.rng
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

export function randInt(s: RngState, min: number, maxInclusive: number): number {
  return min + Math.floor(rand(s) * (maxInclusive - min + 1))
}

export function pick<T>(s: RngState, list: readonly T[]): T {
  return list[Math.floor(rand(s) * list.length)] as T
}

export function shuffle<T>(s: RngState, list: T[]): T[] {
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1))
    ;[list[i], list[j]] = [list[j] as T, list[i] as T]
  }
  return list
}
