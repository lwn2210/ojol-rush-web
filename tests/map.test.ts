import { describe, expect, it } from 'vitest'
import { MAP_SIZE } from '../src/sim/constants'
import { distanceField, drivable, generateMap, isIntersection, JALAN, routeFrom, tileAt } from '../src/sim/map'

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7919 + 1)

describe('peta', () => {
  it('jalan utama membentuk grid, titik start di jalan', () => {
    const map = generateMap(1)
    expect(map.size).toBe(MAP_SIZE)
    for (const v of [0, 1, 11, 12, 22, 23, 33, 34, 44, 45]) {
      for (let i = 0; i < MAP_SIZE; i++) {
        expect(tileAt(map, v, i)).toBe(JALAN)
        expect(tileAt(map, i, v)).toBe(JALAN)
      }
    }
    expect(drivable(map, Math.floor(map.start.x), Math.floor(map.start.y))).toBe(true)
  })

  it('semua pin resto dan rumah bisa dicapai dari start (40 seed)', () => {
    for (const seed of SEEDS) {
      const map = generateMap(seed)
      const field = distanceField(map, Math.floor(map.start.x), Math.floor(map.start.y))
      expect(map.restos.length).toBe(10)
      expect(map.homes.length).toBeGreaterThan(80)
      for (const p of [...map.restos, ...map.homes]) {
        expect(field[p.y * map.size + p.x], `${seed}: ${p.name} (${p.x},${p.y})`).toBeGreaterThanOrEqual(0)
      }
      // No sealed-off gang anywhere: every drivable tile is connected.
      map.tiles.forEach((t, i) => {
        if (t !== 0) expect(field[i], `${seed}: tile ${i % map.size},${Math.floor(i / map.size)}`).toBeGreaterThanOrEqual(0)
      })
    }
  })

  it('pin ada di depan bangunan, bukan di perempatan, genangan, polisi tidur, atau titik razia', () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const map = generateMap(seed)
      for (const p of [...map.restos, ...map.homes]) {
        const i = p.y * map.size + p.x
        expect(drivable(map, p.x, p.y)).toBe(true)
        expect(isIntersection(p.x, p.y)).toBe(false)
        expect(map.water[i]).toBe(0)
        expect(map.bumps[i]).toBe(0)
        const bx = p.x + [1, 0, -1, 0][p.face]!
        const by = p.y + [0, 1, 0, -1][p.face]!
        expect(drivable(map, bx, by)).toBe(false)
        for (const s of map.raziaSpots) expect(p.x >= s.x && p.x < s.x + s.w && p.y >= s.y && p.y < s.y + s.h).toBe(false)
      }
      for (let a = 0; a < map.restos.length; a++)
        for (let b = a + 1; b < map.restos.length; b++) {
          const ra = map.restos[a]!
          const rb = map.restos[b]!
          expect(Math.abs(ra.x - rb.x) + Math.abs(ra.y - rb.y)).toBeGreaterThanOrEqual(11)
        }
    }
  })

  it('titik razia menutup jalan utama, polisi tidur cuma di tile yang bisa dilewati', () => {
    const map = generateMap(5)
    expect(map.raziaSpots.length).toBe(40)
    for (const s of map.raziaSpots) for (let y = s.y; y < s.y + s.h; y++) for (let x = s.x; x < s.x + s.w; x++) expect(tileAt(map, x, y)).toBe(JALAN)
    map.bumps.forEach((b, i) => b && expect(map.tiles[i]).not.toBe(0))
    expect(map.bumps.filter(Boolean).length).toBeGreaterThan(10)
    expect(map.water.filter(Boolean).length).toBeGreaterThan(10)
  })

  it('rute BFS turun satu tile per langkah sampai tujuan', () => {
    const map = generateMap(9)
    const goal = map.restos[0]!
    const field = distanceField(map, goal.x, goal.y)
    const route = routeFrom(map, field, Math.floor(map.start.x), Math.floor(map.start.y))
    expect(route.at(-1)).toEqual({ x: goal.x, y: goal.y })
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1]!
      const b = route[i]!
      expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBe(1)
      expect(drivable(map, b.x, b.y)).toBe(true)
    }
  })
})
