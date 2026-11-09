import { PERIOD, ROAD } from '../sim/constants'
import { DX, DY, GANG, JALAN, WALL, type CityMap } from '../sim/map'
import { rand, randInt, type RngState } from '../sim/rng'

// The static city, painted once per map (and per zoom) onto an offscreen
// canvas in tile units, then blitted each frame. Purely cosmetic randomness
// comes from its own seeded stream so the sim never sees it.

export const COLORS = {
  kali: '#3d6b62',
  kaliLight: '#4f8077',
  yard: '#d8c8a4',
  yardDark: '#c6b48e',
  asphalt: '#4d5059',
  asphaltLight: '#5a5d66',
  curb: '#b8b0a0',
  paint: '#efe6cc',
  gang: '#cdc3ae',
  gangDark: '#b4a991',
  drain: '#6f6656',
  water: 'rgba(84, 145, 190, 0.82)',
  waterLight: 'rgba(205, 232, 246, 0.75)',
  shadow: 'rgba(40, 28, 18, 0.28)',
  tree: '#4f8a3c',
  treeDark: '#3c6e2d',
  treeLight: '#79ad55',
}

const ROOFS = ['#c8553d', '#d06d3c', '#a9452f', '#b85a3a', '#9ea6ab', '#b3babd', '#5c84a6', '#6f9a62', '#cfc6b4', '#d39a4a']
const AWNINGS: Array<[string, string]> = [
  ['#d93f35', '#fff4e4'],
  ['#2f9a52', '#fff4e4'],
  ['#e7a531', '#fff4e4'],
  ['#2f6fb5', '#fff4e4'],
  ['#8d3fb0', '#fff4e4'],
]

interface Lot {
  x: number
  y: number
  w: number
  h: number
  kind: 'roof' | 'flat' | 'trees'
  color: string
}

function makeLots(map: CityMap, r: RngState): Lot[] {
  const size = map.size
  const used = new Uint8Array(size * size)
  const free = (x: number, y: number, bx: number, by: number) =>
    x >= bx && y >= by && x < bx + PERIOD - ROAD && y < by + PERIOD - ROAD && map.tiles[y * size + x] === WALL && !used[y * size + x]
  const lots: Lot[] = []
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (map.tiles[y * size + x] !== WALL || used[y * size + x]) continue
      const bx = Math.floor(x / PERIOD) * PERIOD + ROAD
      const by = Math.floor(y / PERIOD) * PERIOD + ROAD
      let w = 1
      let h = 1
      const maxW = randInt(r, 1, 3)
      const maxH = randInt(r, 1, 3)
      while (w < maxW && free(x + w, y, bx, by)) w++
      outer: while (h < maxH) {
        for (let i = 0; i < w; i++) if (!free(x + i, y + h, bx, by)) break outer
        h++
      }
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) used[(y + j) * size + x + i] = 1
      const roll = rand(r)
      lots.push({
        x,
        y,
        w,
        h,
        kind: roll < 0.12 ? 'trees' : roll < 0.24 ? 'flat' : 'roof',
        color: ROOFS[randInt(r, 0, ROOFS.length - 1)]!,
      })
    }
  }
  return lots
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16)
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)))
  return `rgb(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`
}

function tree(ctx: CanvasRenderingContext2D, x: number, y: number, rad: number): void {
  ctx.fillStyle = COLORS.shadow
  ctx.beginPath()
  ctx.arc(x + rad * 0.3, y + rad * 0.35, rad, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = COLORS.treeDark
  ctx.beginPath()
  ctx.arc(x, y, rad, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = COLORS.tree
  ctx.beginPath()
  ctx.arc(x - rad * 0.12, y - rad * 0.12, rad * 0.78, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = COLORS.treeLight
  ctx.beginPath()
  ctx.arc(x - rad * 0.3, y - rad * 0.32, rad * 0.35, 0, Math.PI * 2)
  ctx.fill()
}

function drawLot(ctx: CanvasRenderingContext2D, lot: Lot, r: RngState): void {
  const { x, y, w, h } = lot
  if (lot.kind === 'trees') {
    ctx.fillStyle = '#a9b878'
    ctx.fillRect(x + 0.04, y + 0.04, w - 0.08, h - 0.08)
    const n = Math.max(1, Math.round((w * h) / 1.6))
    for (let i = 0; i < n; i++) tree(ctx, x + 0.3 + rand(r) * (w - 0.6), y + 0.3 + rand(r) * (h - 0.6), 0.28 + rand(r) * 0.14)
    return
  }
  const inset = 0.05
  const rx = x + inset
  const ry = y + inset
  const rw = w - inset * 2
  const rh = h - inset * 2
  ctx.fillStyle = COLORS.shadow
  ctx.fillRect(rx + 0.1, ry + 0.12, rw, rh)
  if (lot.kind === 'flat') {
    ctx.fillStyle = '#c9c4ba'
    ctx.fillRect(rx, ry, rw, rh)
    ctx.strokeStyle = '#aaa395'
    ctx.lineWidth = 0.05
    ctx.strokeRect(rx + 0.05, ry + 0.05, rw - 0.1, rh - 0.1)
    // Toren (water tank) and an AC unit.
    const tx = rx + 0.25 + rand(r) * (rw - 0.5)
    const ty = ry + 0.25 + rand(r) * (rh - 0.5)
    ctx.fillStyle = 'rgba(40,28,18,0.3)'
    ctx.beginPath()
    ctx.arc(tx + 0.05, ty + 0.06, 0.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = rand(r) < 0.5 ? '#3d7fc4' : '#e08a2c'
    ctx.beginPath()
    ctx.arc(tx, ty, 0.2, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.35)'
    ctx.beginPath()
    ctx.arc(tx - 0.05, ty - 0.05, 0.08, 0, Math.PI * 2)
    ctx.fill()
    if (rw > 0.8 || rh > 0.8) {
      ctx.fillStyle = '#e9e6df'
      ctx.fillRect(rx + rw - 0.42, ry + rh - 0.32, 0.3, 0.2)
      ctx.strokeStyle = '#9b968c'
      ctx.lineWidth = 0.02
      ctx.strokeRect(rx + rw - 0.42, ry + rh - 0.32, 0.3, 0.2)
    }
    return
  }
  // Pitched roof: two halves either side of a ridge along the long side.
  const along = rw >= rh
  ctx.fillStyle = shade(lot.color, 1.08)
  ctx.fillRect(rx, ry, rw, rh)
  ctx.fillStyle = shade(lot.color, 0.82)
  if (along) ctx.fillRect(rx, ry + rh / 2, rw, rh / 2)
  else ctx.fillRect(rx + rw / 2, ry, rw / 2, rh)
  // Tile rows.
  ctx.strokeStyle = shade(lot.color, 0.7)
  ctx.lineWidth = 0.025
  ctx.beginPath()
  const step = 0.16
  if (along) for (let i = ry + step; i < ry + rh; i += step) (ctx.moveTo(rx, i), ctx.lineTo(rx + rw, i))
  else for (let i = rx + step; i < rx + rw; i += step) (ctx.moveTo(i, ry), ctx.lineTo(i, ry + rh))
  ctx.stroke()
  ctx.strokeStyle = shade(lot.color, 0.6)
  ctx.lineWidth = 0.06
  ctx.beginPath()
  if (along) (ctx.moveTo(rx + 0.04, ry + rh / 2), ctx.lineTo(rx + rw - 0.04, ry + rh / 2))
  else (ctx.moveTo(rx + rw / 2, ry + 0.04), ctx.lineTo(rx + rw / 2, ry + rh - 0.04))
  ctx.stroke()
  ctx.strokeStyle = 'rgba(40,28,18,0.35)'
  ctx.lineWidth = 0.03
  ctx.strokeRect(rx, ry, rw, rh)
}

/** Paints the whole city at `px` pixels per tile. */
export function paintCity(map: CityMap, px: number): HTMLCanvasElement {
  const size = map.size
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(size * px)
  canvas.height = Math.ceil(size * px)
  const ctx = canvas.getContext('2d')!
  ctx.scale(px, px)
  const r: RngState = { rng: (map.tiles.length * 31 + map.restos[0]!.x * 977 + map.restos[0]!.y) >>> 0 }
  const t = (x: number, y: number) => (x < 0 || y < 0 || x >= size || y >= size ? -1 : map.tiles[y * size + x]!)

  ctx.fillStyle = COLORS.yard
  ctx.fillRect(0, 0, size, size)
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = COLORS.yardDark
    ctx.fillRect(rand(r) * size, rand(r) * size, 0.06, 0.06)
  }

  // Roads.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tile = t(x, y)
      if (tile === JALAN) {
        ctx.fillStyle = COLORS.asphalt
        ctx.fillRect(x, y, 1.01, 1.01)
        if (rand(r) < 0.25) {
          ctx.fillStyle = COLORS.asphaltLight
          ctx.fillRect(x + rand(r) * 0.8, y + rand(r) * 0.8, 0.12 + rand(r) * 0.2, 0.05)
        }
      } else if (tile === GANG) {
        ctx.fillStyle = COLORS.gang
        ctx.fillRect(x, y, 1.01, 1.01)
        ctx.strokeStyle = COLORS.gangDark
        ctx.lineWidth = 0.025
        ctx.beginPath()
        ctx.moveTo(x + 0.02, y + 0.5 + (rand(r) - 0.5) * 0.4)
        ctx.lineTo(x + 0.98, y + 0.5 + (rand(r) - 0.5) * 0.4)
        ctx.stroke()
      }
    }
  }
  // Curbs and gutters where a drivable tile meets a building.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const tile = t(x, y)
      if (tile === WALL || tile === -1) continue
      for (let d = 0; d < 4; d++) {
        if (t(x + DX[d], y + DY[d]) !== WALL) continue
        const w = tile === JALAN ? 0.12 : 0.08
        ctx.fillStyle = tile === JALAN ? COLORS.curb : COLORS.drain
        if (d === 0) ctx.fillRect(x + 1 - w, y, w, 1)
        if (d === 2) ctx.fillRect(x, y, w, 1)
        if (d === 1) ctx.fillRect(x, y + 1 - w, 1, w)
        if (d === 3) ctx.fillRect(x, y, 1, w)
      }
    }
  }
  // Lane markings and zebra crossings.
  ctx.strokeStyle = COLORS.paint
  ctx.lineWidth = 0.06
  ctx.setLineDash([0.35, 0.3])
  ctx.beginPath()
  for (let k = 0; k * PERIOD < size; k++) {
    const c = k * PERIOD + 1
    for (let j = 0; j * PERIOD + ROAD < size; j++) {
      const a = j * PERIOD + ROAD + 0.3
      const b = (j + 1) * PERIOD - 0.3
      ctx.moveTo(a, c)
      ctx.lineTo(b, c)
      ctx.moveTo(c, a)
      ctx.lineTo(c, b)
    }
  }
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = 'rgba(239, 230, 204, 0.85)'
  for (let k = 0; k * PERIOD < size; k++) {
    for (let j = 0; j * PERIOD < size; j++) {
      const cx = j * PERIOD
      const cy = k * PERIOD
      for (let s = 0; s < 5; s++) {
        const o = 0.12 + s * 0.38
        // East and west of the crossing.
        if (cx + ROAD < size) ctx.fillRect(cx + ROAD + 0.1, cy + o, 0.6, 0.2)
        if (cx - 1 >= 0) ctx.fillRect(cx - 0.7, cy + o, 0.6, 0.2)
        if (cy + ROAD < size) ctx.fillRect(cx + o, cy + ROAD + 0.1, 0.2, 0.6)
        if (cy - 1 >= 0) ctx.fillRect(cx + o, cy - 0.7, 0.2, 0.6)
      }
    }
  }

  // Genangan.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!map.water[y * size + x]) continue
      ctx.fillStyle = COLORS.water
      ctx.beginPath()
      ctx.ellipse(x + 0.5, y + 0.5, 0.56 + rand(r) * 0.08, 0.42 + rand(r) * 0.1, rand(r) * 0.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.strokeStyle = COLORS.waterLight
      ctx.lineWidth = 0.04
      ctx.beginPath()
      ctx.arc(x + 0.35 + rand(r) * 0.3, y + 0.4, 0.14, Math.PI * 1.1, Math.PI * 1.7)
      ctx.stroke()
    }
  }
  // Polisi tidur: yellow and black.
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const b = map.bumps[y * size + x]
      if (!b) continue
      const vertical = b === 1
      const thick = 0.16
      ctx.fillStyle = '#2a2622'
      if (vertical) ctx.fillRect(x + 0.5 - thick / 2, y + 0.04, thick, 0.92)
      else ctx.fillRect(x + 0.04, y + 0.5 - thick / 2, 0.92, thick)
      ctx.fillStyle = '#f2c230'
      for (let s = 0; s < 4; s++) {
        const o = 0.08 + s * 0.23
        if (vertical) ctx.fillRect(x + 0.5 - thick / 2, y + o, thick, 0.11)
        else ctx.fillRect(x + o, y + 0.5 - thick / 2, 0.11, thick)
      }
    }
  }

  // Houses.
  for (const lot of makeLots(map, r)) drawLot(ctx, lot, r)

  // Restaurant awnings on the building side of each resto pin.
  map.restos.forEach((p, i) => {
    const [a, b] = AWNINGS[i % AWNINGS.length]!
    const bx = p.x + DX[p.face]
    const by = p.y + DY[p.face]
    const horizontal = p.face === 1 || p.face === 3
    const depth = 0.32
    // Awning hangs over the edge facing the pin.
    const ax = p.face === 2 ? bx + 1 - depth : p.face === 0 ? bx : bx + 0.05
    const ay = p.face === 3 ? by + 1 - depth : p.face === 1 ? by : by + 0.05
    const aw = horizontal ? 0.9 : depth
    const ah = horizontal ? depth : 0.9
    ctx.fillStyle = COLORS.shadow
    ctx.fillRect(ax + 0.06, ay + 0.08, aw, ah)
    const stripes = 6
    for (let s = 0; s < stripes; s++) {
      ctx.fillStyle = s % 2 ? b : a
      if (horizontal) ctx.fillRect(ax + (aw / stripes) * s, ay, aw / stripes + 0.005, ah)
      else ctx.fillRect(ax, ay + (ah / stripes) * s, aw, ah / stripes + 0.005)
    }
    // Plastic chairs out front.
    ctx.fillStyle = i % 2 ? '#e94b3c' : '#3b7bd4'
    const cx = p.x + 0.5 + DX[p.face] * 0.32 + (horizontal ? 0.3 : 0)
    const cy = p.y + 0.5 + DY[p.face] * 0.32 + (horizontal ? 0 : 0.3)
    ctx.fillRect(cx - 0.07, cy - 0.07, 0.14, 0.14)
  })

  return canvas
}

/** Small overview for the minimap: roads, gangs, outlines. */
export function paintMinimap(map: CityMap, px: number): HTMLCanvasElement {
  const size = map.size
  const canvas = document.createElement('canvas')
  canvas.width = size * px
  canvas.height = size * px
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#e6d9bc'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const t = map.tiles[y * size + x]
      if (t === WALL) continue
      ctx.fillStyle = t === JALAN ? '#6b6e77' : '#b7a98c'
      ctx.fillRect(x * px, y * px, px, px)
    }
  }
  return canvas
}
