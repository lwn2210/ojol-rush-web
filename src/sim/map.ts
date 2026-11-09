import { BLOCK, BLOCKS, MAP_SIZE, PERIOD, ROAD } from './constants'
import { pick, rand, randInt, shuffle, type RngState } from './rng'

// The city: main roads on a fixed grid, blocks of houses in between, and
// gangs carved through the blocks from a seed. Everything here is plain data
// so it can sit inside the game state.

export const WALL = 0
export const JALAN = 1
export const GANG = 2

/** 0 east, 1 south, 2 west, 3 north (screen axes, y grows down). */
export type Dir = 0 | 1 | 2 | 3
export const DX = [1, 0, -1, 0] as const
export const DY = [0, 1, 0, -1] as const

/** A pin: the drivable tile you stop on, and which side the building is. */
export interface Place {
  x: number
  y: number
  face: Dir
  name: string
}

export interface Spot {
  x: number
  y: number
  w: number
  h: number
}

export interface CityMap {
  size: number
  tiles: number[]
  /** 1 where a genangan (flood puddle) slows you down. */
  water: number[]
  /** Polisi tidur across the tile: 1 = line x = tx + 0.5, 2 = line y = ty + 0.5. */
  bumps: number[]
  restos: Place[]
  /** Doorsteps orders get delivered to. */
  homes: Place[]
  /** Where a razia can be set up: across a main road, mid-block. */
  raziaSpots: Spot[]
  start: { x: number; y: number; heading: number }
}

export const RESTO_NAMES = [
  'Warung Bu Tini',
  'Nasi Goreng Pak Kumis',
  'Bakso Mas Bejo',
  'Martabak Bangka 88',
  'Sate Madura Cak Mat',
  'Ayam Geprek Mbak Rina',
  'Soto Betawi H. Maman',
  'Es Teh Jumbo',
  'Pecel Lele Lamongan',
  'Kopi Senja',
  'Mie Ayam Gajah Mungkur',
  'Seblak Teh Euis',
]

const HOME_NAMES = [
  'Kos Melati No. #',
  'Rumah Bu Ani',
  'Kontrakan Pak Haji No. #',
  'Kantor Kelurahan',
  'Warnet Jaya',
  'Bengkel Motor Abadi',
  'Pos Ronda RT 0#',
  'Apotek Sehat',
  'Rumah Bang Jali',
  'Toko Kelontong Madura',
  'Gang Mawar No. #',
  'Rusun Blok #',
  'Konter Pulsa Berkah',
  'Rumah Pak RT',
  'Kos Putri Anggrek No. #',
  'Laundry Kiloan Bersih',
  'Bimbel Cerdas',
  'Barbershop Rapi',
]

export function isRoadLine(v: number): boolean {
  return v >= 0 && v < MAP_SIZE && v % PERIOD < ROAD
}

export function isIntersection(x: number, y: number): boolean {
  return isRoadLine(x) && isRoadLine(y)
}

export function tileAt(map: CityMap, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= map.size || y >= map.size) return WALL
  return map.tiles[y * map.size + x]!
}

export function drivable(map: CityMap, x: number, y: number): boolean {
  return tileAt(map, x, y) !== WALL
}

export function generateMap(seed: number): CityMap {
  const size = MAP_SIZE
  const r: RngState = { rng: (seed ^ 0x9e3779b9) >>> 0 }
  const tiles = new Array<number>(size * size).fill(WALL)
  const set = (x: number, y: number, t: number) => {
    if (x >= 0 && y >= 0 && x < size && y < size) tiles[y * size + x] = t
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (isRoadLine(x) || isRoadLine(y)) set(x, y, JALAN)

  // Gangs. Every gang touches a main road, so the whole city stays connected.
  for (let by = 0; by < BLOCKS; by++) {
    for (let bx = 0; bx < BLOCKS; bx++) {
      const x0 = bx * PERIOD + ROAD
      const y0 = by * PERIOD + ROAD
      const last = BLOCK - 1
      const a = randInt(r, 2, 6)
      const b = randInt(r, 2, 6)
      const row = (y: number, from: number, to: number) => {
        for (let i = from; i <= to; i++) set(x0 + i, y0 + y, GANG)
      }
      const col = (x: number, from: number, to: number) => {
        for (let i = from; i <= to; i++) set(x0 + x, y0 + i, GANG)
      }
      const kind = rand(r)
      if (kind < 0.24) {
        row(a, 0, last)
        col(b, 0, last)
      } else if (kind < 0.44) {
        row(a, 0, last)
        if (rand(r) < 0.6) rand(r) < 0.5 ? col(b, 0, a) : col(b, a, last)
      } else if (kind < 0.64) {
        col(b, 0, last)
        if (rand(r) < 0.6) rand(r) < 0.5 ? row(a, 0, b) : row(a, b, last)
      } else if (kind < 0.88) {
        // Gang tikus: an L from one side road round to another.
        rand(r) < 0.5 ? row(a, 0, b) : row(a, b, last)
        rand(r) < 0.5 ? col(b, 0, a) : col(b, a, last)
      } else {
        const len = randInt(r, 3, 6)
        const side = randInt(r, 0, 3)
        if (side === 0) row(a, 0, len - 1)
        else if (side === 1) row(a, last - len + 1, last)
        else if (side === 2) col(b, 0, len - 1)
        else col(b, last - len + 1, last)
      }
    }
  }

  const map: CityMap = {
    size,
    tiles,
    water: new Array<number>(size * size).fill(0),
    bumps: new Array<number>(size * size).fill(0),
    restos: [],
    homes: [],
    raziaSpots: [],
    start: { x: 27.5, y: PERIOD * 2 + 0.5, heading: 0 },
  }

  for (let k = 0; k <= BLOCKS; k++) {
    for (let j = 0; j < BLOCKS; j++) {
      map.raziaSpots.push({ x: j * PERIOD + 5, y: k * PERIOD, w: 2, h: 2 })
      map.raziaSpots.push({ x: k * PERIOD, y: j * PERIOD + 5, w: 2, h: 2 })
    }
  }
  const inRaziaSpot = (x: number, y: number) =>
    map.raziaSpots.some((s) => x >= s.x - 1 && x < s.x + s.w + 1 && y >= s.y - 1 && y < s.y + s.h + 1)

  // Doorsteps: a drivable tile next to a building, away from crossings and razia spots.
  const doorsteps: Place[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!drivable(map, x, y) || isIntersection(x, y) || inRaziaSpot(x, y)) continue
      // Not on the tile right next to a crossing either: cars turn there.
      if (isRoadLine(x) && (isRoadLine(y - 1) || isRoadLine(y + 1)) && !isRoadLine(y)) continue
      if (isRoadLine(y) && (isRoadLine(x - 1) || isRoadLine(x + 1)) && !isRoadLine(x)) continue
      for (const d of shuffle(r, [0, 1, 2, 3] as Dir[])) {
        const nx = x + DX[d]
        const ny = y + DY[d]
        if (nx >= 0 && ny >= 0 && nx < size && ny < size && tileAt(map, nx, ny) === WALL) {
          doorsteps.push({ x, y, face: d, name: '' })
          break
        }
      }
    }
  }

  const names = shuffle(r, RESTO_NAMES.slice())
  for (const p of shuffle(r, doorsteps.slice())) {
    if (map.restos.length >= 10) break
    if (map.restos.every((q) => Math.abs(q.x - p.x) + Math.abs(q.y - p.y) >= 11)) {
      map.restos.push({ ...p, name: names[map.restos.length]! })
    }
  }
  const nearResto = (x: number, y: number, d: number) => map.restos.some((q) => Math.abs(q.x - x) + Math.abs(q.y - y) <= d)
  const nearStart = (x: number, y: number) => Math.abs(x - Math.floor(map.start.x)) + Math.abs(y - Math.floor(map.start.y)) <= 4

  // Genangan: short puddles along a corridor.
  for (let n = 0, tries = 0; n < 16 && tries < 500; tries++) {
    const x = randInt(r, 0, size - 1)
    const y = randInt(r, 0, size - 1)
    if (!drivable(map, x, y) || isIntersection(x, y) || nearResto(x, y, 1) || nearStart(x, y)) continue
    const horizontal = drivable(map, x - 1, y) || drivable(map, x + 1, y)
    const len = randInt(r, 1, 3)
    for (let i = 0; i < len; i++) {
      const tx = horizontal ? x + i : x
      const ty = horizontal ? y : y + i
      if (drivable(map, tx, ty) && !isIntersection(tx, ty) && !nearResto(tx, ty, 1)) map.water[ty * size + tx] = 1
    }
    n++
  }

  // Polisi tidur: plenty in the gangs, a few on main roads (both lanes).
  const bumpNear = (x: number, y: number) => {
    for (let dy = -3; dy <= 3; dy++)
      for (let dx = -3; dx <= 3; dx++) if (Math.abs(dx) + Math.abs(dy) <= 3 && x + dx >= 0 && y + dy >= 0 && x + dx < size && y + dy < size && map.bumps[(y + dy) * size + x + dx]) return true
    return false
  }
  const gangTiles: number[] = []
  tiles.forEach((t, i) => t === GANG && gangTiles.push(i))
  for (const i of shuffle(r, gangTiles)) {
    const x = i % size
    const y = Math.floor(i / size)
    if (map.water[i] || nearResto(x, y, 0) || bumpNear(x, y) || rand(r) > 0.45) continue
    const ew = drivable(map, x - 1, y) && drivable(map, x + 1, y) && !drivable(map, x, y - 1) && !drivable(map, x, y + 1)
    const ns = drivable(map, x, y - 1) && drivable(map, x, y + 1) && !drivable(map, x - 1, y) && !drivable(map, x + 1, y)
    if (ew) map.bumps[i] = 1
    else if (ns) map.bumps[i] = 2
  }
  for (let n = 0; n < 8; n++) {
    const k = randInt(r, 0, BLOCKS)
    const j = randInt(r, 0, BLOCKS - 1)
    const along = j * PERIOD + pick(r, [3, 9])
    const across = k * PERIOD
    const horizontal = rand(r) < 0.5
    for (let w = 0; w < ROAD; w++) {
      const x = horizontal ? along : across + w
      const y = horizontal ? across + w : along
      if (nearResto(x, y, 0)) continue
      map.water[y * size + x] = 0
      map.bumps[y * size + x] = horizontal ? 1 : 2
    }
  }

  // Homes: every remaining doorstep that isn't a restaurant, puddle or bump.
  for (const p of doorsteps) {
    const i = p.y * size + p.x
    if (nearResto(p.x, p.y, 1) || map.water[i] || map.bumps[i]) continue
    const name = pick(r, HOME_NAMES).replace('#', String(randInt(r, 1, 9) + (rand(r) < 0.5 ? randInt(r, 1, 3) * 10 : 0)))
    map.homes.push({ ...p, name })
  }
  return map
}

/** Breadth-first distance in tiles from (tx, ty) to every tile; -1 where unreachable. */
export function distanceField(map: CityMap, tx: number, ty: number): Int32Array {
  const size = map.size
  const dist = new Int32Array(size * size).fill(-1)
  if (!drivable(map, tx, ty)) return dist
  const queue = new Int32Array(size * size)
  let head = 0
  let tail = 0
  dist[ty * size + tx] = 0
  queue[tail++] = ty * size + tx
  while (head < tail) {
    const i = queue[head++]!
    const x = i % size
    const y = (i - x) / size
    const d = dist[i]! + 1
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k]!
      const ny = y + DY[k]!
      if (!drivable(map, nx, ny)) continue
      const j = ny * size + nx
      if (dist[j] !== -1) continue
      dist[j] = d
      queue[tail++] = j
    }
  }
  return dist
}

export function fieldAt(map: CityMap, field: Int32Array, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= map.size || y >= map.size) return -1
  return field[y * map.size + x]!
}

/** The route along a distance field from (x, y) to its target, tile by tile (start included). */
export function routeFrom(map: CityMap, field: Int32Array, x: number, y: number, max = 200): Array<{ x: number; y: number }> {
  const out = [{ x, y }]
  let d = fieldAt(map, field, x, y)
  if (d < 0) return out
  while (d > 0 && out.length < max) {
    let moved = false
    for (let k = 0; k < 4; k++) {
      const nx = x + DX[k]!
      const ny = y + DY[k]!
      if (fieldAt(map, field, nx, ny) === d - 1) {
        x = nx
        y = ny
        d--
        out.push({ x, y })
        moved = true
        break
      }
    }
    if (!moved) break
  }
  return out
}
