import {
  ACCEL,
  BIKE_PROFILES,
  type BikeType,
  BLOCKS,
  BRAKE,
  BUMP_SAFE,
  CAR_ACCEL,
  CAR_BRAKE,
  CAR_GAP,
  COAST,
  CRASH_COOLDOWN,
  CRASH_IMPACT,
  DT,
  DWELL_TICKS,
  FARE_BASE,
  FARE_PER_TILE,
  HURRY_TICKS,
  MAP_SIZE,
  MAX_SPEED,
  MEPET,
  NEXT_ORDER_TICKS,
  ORDER_MAX_TRIP,
  ORDER_MIN_TRIP,
  ORDER_REF_SPEED,
  ORDER_SLACK,
  PERIOD,
  PIN_RADIUS,
  PIN_SPEED,
  RATING_FLOOR,
  RATING_PRIOR,
  RAZIA_COUNT,
  RAZIA_HOLD,
  RAZIA_IMMUNE,
  RAZIA_MAX,
  RAZIA_MIN,
  RIDER_R,
  ROAD,
  SHIFT_TICKS,
  STUN_TICKS,
  TICK_RATE,
  TURN_RATE,
  VEHICLES,
  WALL_CRASH,
  WATER_FACTOR,
  type VehicleKind,
} from './constants'
import { distanceField, drivable, generateMap, isRoadLine, type CityMap, type Dir, type Place } from './map'
import { pick, rand, randInt } from './rng'

// The whole shift as plain data and one step function at a fixed 60 Hz. No
// DOM, no clocks, no Math.random: the same seed and inputs always give the
// same shift, and the renderer only ever reads this state.

export interface Input {
  /** Wanted direction on screen (y down), length 0..1. Length is throttle. */
  x: number
  y: number
  horn: boolean
}

export const NO_INPUT: Input = { x: 0, y: 0, horn: false }

export interface Player {
  x: number
  y: number
  heading: number
  speed: number
  /** Knock-back velocity after a crash, decays fast. */
  kx: number
  ky: number
  stun: number
  /** Ticks left held at a razia. */
  held: number
  /** Ticks a razia can't catch you again after letting you go. */
  immune: number
  crashCooldown: number
  hornCooldown: number
  wet: boolean
}

export interface Vehicle {
  id: number
  kind: VehicleKind
  x: number
  y: number
  dir: Dir
  speed: number
  maxSpeed: number
  /** Parked: ngetem (angkot waiting for passengers) or shaken after a crash. */
  wait: number
  /** Ticks stopped behind something. Two vehicles stuck on each other squeeze past. */
  stuck: number
  ghost: number
  /** Crossing (road index along the travel axis) whose turn is already chosen. */
  decided: number
  turnAt: number
  turnDir: Dir | -1
  ngetem: number
  honk: number
  color: number
}

export interface Razia {
  spot: number
  ticks: number
}

export interface Order {
  id: number
  resto: number
  home: number
  phase: 'jemput' | 'antar'
  ticksLeft: number
  totalTicks: number
  crashes: number
  spills: number
  fare: number
  dwell: number
}

export interface Stats {
  delivered: number
  cancelled: number
  earnings: number
  starsSum: number
  rated: number
  crashes: number
  perfect: number
  raziaHits: number
}

export interface TripResult {
  stars: number
  fare: number
  tip: number
  crashes: number
  spills: number
  mepet: boolean
  cancelled: boolean
}

export interface GameOptions {
  traffic: boolean
  razia: boolean
  bike?: BikeType
}

export interface GameState {
  seed: number
  rng: number
  tick: number
  shiftLeft: number
  phase: 'play' | 'over'
  endReason: 'waktu' | 'rating' | null
  opts: GameOptions
  map: CityMap
  player: Player
  vehicles: Vehicle[]
  razia: Razia[]
  order: Order | null
  nextOrder: number
  orderSeq: number
  stats: Stats
  last: TripResult | null
}

export type SimEvent =
  | { type: 'orderNew' }
  | { type: 'pickup' }
  | { type: 'delivered'; result: TripResult }
  | { type: 'cancelled' }
  | { type: 'hurry' }
  | { type: 'crash'; what: 'tembok' | VehicleKind; x: number; y: number; counted: boolean }
  | { type: 'splash'; x: number; y: number }
  | { type: 'bump'; hard: boolean; spill: boolean; x: number; y: number }
  | { type: 'razia' }
  | { type: 'released' }
  | { type: 'horn' }
  | { type: 'honk'; x: number; y: number }
  | { type: 'shiftOver'; reason: 'waktu' | 'rating' }

const TAU = Math.PI * 2

export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU
  if (a < 0) a += TAU
  return a - Math.PI
}

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

export function createGame(seed: number, opts: Partial<GameOptions> = {}): GameState {
  const map = generateMap(seed)
  const state: GameState = {
    seed,
    rng: (seed * 2654435761) >>> 0,
    tick: 0,
    shiftLeft: SHIFT_TICKS,
    phase: 'play',
    endReason: null,
    opts: { traffic: true, razia: true, ...opts },
    map,
    player: {
      x: map.start.x,
      y: map.start.y,
      heading: map.start.heading,
      speed: 0,
      kx: 0,
      ky: 0,
      stun: 0,
      held: 0,
      immune: 0,
      crashCooldown: 0,
      hornCooldown: 0,
      wet: false,
    },
    vehicles: [],
    razia: [],
    order: null,
    nextOrder: NEXT_ORDER_TICKS,
    orderSeq: 0,
    stats: { delivered: 0, cancelled: 0, earnings: 0, starsSum: 0, rated: 0, crashes: 0, perfect: 0, raziaHits: 0 },
    last: null,
  }
  if (state.opts.traffic) spawnTraffic(state)
  if (state.opts.razia) for (let i = 0; i < RAZIA_COUNT; i++) placeRazia(state, randInt(state, RAZIA_MIN / 2, RAZIA_MAX))
  return state
}

/** Account rating as the app would show it: a fresh account starts on a few 5-star trips. */
export function rating(state: GameState): number {
  return (state.stats.starsSum + 5 * RATING_PRIOR) / (state.stats.rated + RATING_PRIOR)
}

export function orderTarget(state: GameState): Place | null {
  const o = state.order
  if (!o) return null
  return o.phase === 'jemput' ? state.map.restos[o.resto]! : state.map.homes[o.home]!
}

export function step(state: GameState, input: Input): SimEvent[] {
  const events: SimEvent[] = []
  if (state.phase === 'over') return events
  state.tick++
  state.shiftLeft--
  stepPlayer(state, input, events)
  if (state.opts.traffic) {
    stepVehicles(state, events)
    collideVehicles(state, events)
  }
  pushOutOfWalls(state.map, state.player)
  if (state.opts.razia) stepRazia(state, events)
  stepOrder(state, events)
  if (state.phase === 'play' && state.shiftLeft <= 0) end(state, 'waktu', events)
  return events
}

function end(state: GameState, reason: 'waktu' | 'rating', events: SimEvent[]): void {
  state.phase = 'over'
  state.endReason = reason
  state.order = null
  events.push({ type: 'shiftOver', reason })
}

// ── Motor ────────────────────────────────────────────────────────────────

function overlapsWall(map: CityMap, x: number, y: number): boolean {
  const x0 = Math.floor(x - RIDER_R)
  const x1 = Math.floor(x + RIDER_R)
  const y0 = Math.floor(y - RIDER_R)
  const y1 = Math.floor(y + RIDER_R)
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (!drivable(map, tx, ty)) return true
  return false
}

/**
 * Moves one axis and stops flush against walls. When blocked, nudges the
 * rider sideways towards a gap that's right there, so turning into a 1-tile
 * gang doesn't need pixel-perfect aim.
 */
function moveAxis(map: CityMap, p: Player, d: number, axis: 0 | 1): boolean {
  if (d === 0) return false
  if (axis === 0) p.x += d
  else p.y += d
  if (!overlapsWall(map, p.x, p.y)) return false
  const eps = 1e-4
  if (axis === 0) p.x = d > 0 ? Math.floor(p.x + RIDER_R) - RIDER_R - eps : Math.floor(p.x - RIDER_R) + 1 + RIDER_R + eps
  else p.y = d > 0 ? Math.floor(p.y + RIDER_R) - RIDER_R - eps : Math.floor(p.y - RIDER_R) + 1 + RIDER_R + eps

  const side = axis === 0 ? p.y : p.x
  const along = axis === 0 ? p.x : p.y
  const ahead = Math.floor(along + Math.sign(d) * (RIDER_R + 0.05))
  for (const lane of [Math.floor(side - RIDER_R), Math.floor(side + RIDER_R)]) {
    const centre = lane + 0.5
    if (Math.abs(centre - side) < 0.08 || Math.abs(centre - side) > 0.55) continue
    const free = axis === 0 ? drivable(map, ahead, lane) : drivable(map, lane, ahead)
    if (!free) continue
    const nudge = Math.sign(centre - side) * Math.min(Math.abs(centre - side), 0.05 + Math.abs(d) * 0.6)
    if (axis === 0 && !overlapsWall(map, p.x, p.y + nudge)) p.y += nudge
    else if (axis === 1 && !overlapsWall(map, p.x + nudge, p.y)) p.x += nudge
    break
  }
  return true
}

function pushOutOfWalls(map: CityMap, p: Player): void {
  for (let iter = 0; iter < 4 && overlapsWall(map, p.x, p.y); iter++) {
    let best = { dx: 0, dy: 0, len: Infinity }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      for (let s = 0.02; s <= 0.6; s += 0.02) {
        if (!overlapsWall(map, p.x + dx * s, p.y + dy * s)) {
          if (s < best.len) best = { dx: dx * s, dy: dy * s, len: s }
          break
        }
      }
    }
    if (best.len === Infinity) return
    p.x += best.dx
    p.y += best.dy
  }
}

function crash(state: GameState, what: 'tembok' | VehicleKind, x: number, y: number, events: SimEvent[]): void {
  const p = state.player
  p.crashCooldown = CRASH_COOLDOWN
  p.stun = STUN_TICKS
  state.stats.crashes++
  if (state.order) state.order.crashes++
  events.push({ type: 'crash', what, x, y, counted: state.order !== null })
}

function stepPlayer(state: GameState, input: Input, events: SimEvent[]): void {
  const p = state.player
  const map = state.map
  if (p.crashCooldown > 0) p.crashCooldown--
  if (p.hornCooldown > 0) p.hornCooldown--
  if (input.horn && p.hornCooldown === 0) {
    p.hornCooldown = 22
    events.push({ type: 'horn' })
    // Horn urges traffic ahead to speed up and stops lingering angkot!
    if (state.vehicles) {
      for (const car of state.vehicles) {
        const dx = car.x - p.x
        const dy = car.y - p.y
        const dist = Math.hypot(dx, dy)
        if (dist < 4.5) {
          const dot = (dx * Math.cos(p.heading) + dy * Math.sin(p.heading)) / (dist || 1)
          if (dot > 0.4) {
            car.wait = 0
            car.speed = Math.min(car.speed * 1.25, car.maxSpeed)
          }
        }
      }
    }
  }

  const ti = Math.floor(p.y) * map.size + Math.floor(p.x)
  const wet = map.water[ti] === 1
  if (wet && !p.wet && p.speed > 2.5) {
    p.speed *= 0.7
    events.push({ type: 'splash', x: p.x, y: p.y })
  }
  p.wet = wet

  let ix = Number.isFinite(input.x) ? input.x : 0
  let iy = Number.isFinite(input.y) ? input.y : 0
  const m = Math.min(1, Math.hypot(ix, iy))
  let target = 0
  let steering = false
  const bike = BIKE_PROFILES[state.opts.bike ?? 'matic']
  const maxSpeed = bike.maxSpeed
  const accel = bike.accel
  const turnRate = bike.turnRate
  const waterFactor = bike.waterFactor

  if (p.held > 0) {
    p.held--
    p.speed = 0
    if (p.held === 0) {
      p.immune = RAZIA_IMMUNE
      events.push({ type: 'released' })
    }
  } else if (p.stun > 0) {
    p.stun--
  } else if (m > 0.15) {
    steering = true
    const want = Math.atan2(iy, ix)
    const diff = wrapAngle(want - p.heading)
    const rate = turnRate * (1.3 - 0.6 * Math.min(1, p.speed / maxSpeed))
    p.heading = wrapAngle(p.heading + clamp(diff, -rate * DT, rate * DT))
    target = maxSpeed * (wet ? waterFactor : 1) * Math.min(1, m / 0.85)
    // Pointing back the way you came: brake and swing round.
    if (Math.abs(diff) > 1.9) target *= 0.3
  }
  if (p.speed < target) p.speed = Math.min(target, p.speed + accel * DT)
  else p.speed = Math.max(target, p.speed - (steering || p.speed > maxSpeed * waterFactor ? BRAKE : COAST) * DT)
  p.kx *= 0.86
  p.ky *= 0.86
  if (Math.abs(p.kx) < 0.01) p.kx = 0
  if (Math.abs(p.ky) < 0.01) p.ky = 0

  const vx = Math.cos(p.heading) * p.speed + p.kx
  const vy = Math.sin(p.heading) * p.speed + p.ky
  const ox = p.x
  const oy = p.y
  const hitX = moveAxis(map, p, vx * DT, 0)
  const hitY = moveAxis(map, p, vy * DT, 1)
  if (hitX || hitY) {
    const into = Math.max(hitX ? Math.abs(vx) : 0, hitY ? Math.abs(vy) : 0)
    if (into > WALL_CRASH && p.crashCooldown === 0) crash(state, 'tembok', p.x, p.y, events)
    // Head-on loses most of the speed, a graze along the wall little.
    const share = into / Math.max(0.01, Math.hypot(vx, vy))
    p.speed *= 1 - 0.6 * share
    if (hitX) p.kx = 0
    if (hitY) p.ky = 0
  }

  // Polisi tidur: crossing the line in the middle of a bump tile.
  for (const [tx, ty] of [
    [Math.floor(p.x), Math.floor(p.y)],
    [Math.floor(ox), Math.floor(oy)],
  ] as const) {
    const b = map.bumps[ty * map.size + tx]
    if (!b) continue
    const line = b === 1 ? tx + 0.5 : ty + 0.5
    const a0 = b === 1 ? ox : oy
    const a1 = b === 1 ? p.x : p.y
    const across = b === 1 ? p.y : p.x
    const lo = b === 1 ? ty : tx
    if ((a0 - line) * (a1 - line) >= 0 || a0 === a1 || across < lo || across >= lo + 1) continue
    const hard = p.speed > BUMP_SAFE
    const spill = hard && state.order?.phase === 'antar'
    if (hard) p.speed *= 0.45
    if (spill) state.order!.spills++
    events.push({ type: 'bump', hard, spill, x: p.x, y: p.y })
    break
  }
}

// ── Traffic ──────────────────────────────────────────────────────────────

const laneOffset = (d: Dir) => (d === 0 || d === 3 ? 0.5 : 1.5)
const isHorizontal = (d: Dir) => d === 0 || d === 2
const sign = (d: Dir) => (d === 0 || d === 1 ? 1 : -1)

function spawnTraffic(state: GameState): void {
  let id = 0
  for (const kind of Object.keys(VEHICLES) as VehicleKind[]) {
    const spec = VEHICLES[kind]
    for (let n = 0; n < spec.count; n++) {
      for (let tries = 0; tries < 50; tries++) {
        const dir = randInt(state, 0, 3) as Dir
        const k = randInt(state, 0, BLOCKS)
        const along = 2 + rand(state) * (MAP_SIZE - 4)
        const m = along % PERIOD
        if (m < ROAD + 1 || m > PERIOD - 1) continue
        const lane = k * PERIOD + laneOffset(dir)
        const x = isHorizontal(dir) ? along : lane
        const y = isHorizontal(dir) ? lane : along
        if (Math.hypot(x - state.player.x, y - state.player.y) < 6) continue
        if (state.vehicles.some((v) => Math.hypot(v.x - x, v.y - y) < 2.4)) continue
        state.vehicles.push({
          id: id++,
          kind,
          x,
          y,
          dir,
          speed: 0,
          maxSpeed: spec.speed[0] + rand(state) * (spec.speed[1] - spec.speed[0]),
          wait: 0,
          stuck: 0,
          ghost: 0,
          decided: -1,
          turnAt: 0,
          turnDir: -1,
          ngetem: randInt(state, 240, 900),
          honk: 0,
          color: randInt(state, 0, 7),
        })
        break
      }
    }
  }
}

export interface Box {
  x0: number
  y0: number
  x1: number
  y1: number
}

export function vehicleBox(v: Vehicle): Box {
  const spec = VEHICLES[v.kind]
  const hl = spec.length / 2
  const hw = spec.width / 2
  return isHorizontal(v.dir) ? { x0: v.x - hl, x1: v.x + hl, y0: v.y - hw, y1: v.y + hw } : { x0: v.x - hw, x1: v.x + hw, y0: v.y - hl, y1: v.y + hl }
}

const overlap = (a: Box, b: Box) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0

/** Distance to whatever is in front of `v` within `look` tiles. */
function clearAhead(state: GameState, v: Vehicle, look: number): { dist: number; player: boolean; blocker: Vehicle | null } {
  const spec = VEHICLES[v.kind]
  const s = sign(v.dir)
  const h = isHorizontal(v.dir)
  const front = (h ? v.x : v.y) + s * (spec.length / 2)
  const lane = h ? v.y : v.x
  const hw = spec.width * 0.45
  const a0 = Math.min(front, front + s * look)
  const a1 = Math.max(front, front + s * look)
  const probe: Box = h ? { x0: a0, x1: a1, y0: lane - hw, y1: lane + hw } : { x0: lane - hw, x1: lane + hw, y0: a0, y1: a1 }
  let best = { dist: Infinity, player: false, blocker: null as Vehicle | null }
  const consider = (b: Box, player: boolean, blocker: Vehicle | null) => {
    if (!overlap(probe, b)) return
    const near = h ? (s > 0 ? b.x0 : b.x1) : s > 0 ? b.y0 : b.y1
    const dist = Math.max(0, (near - front) * s)
    if (dist < best.dist) best = { dist, player, blocker }
  }
  if (v.ghost === 0) {
    for (const u of state.vehicles) if (u !== v && u.ghost === 0) consider(vehicleBox(u), false, u)
  }
  const p = state.player
  consider({ x0: p.x - RIDER_R, x1: p.x + RIDER_R, y0: p.y - RIDER_R, y1: p.y + RIDER_R }, true, null)
  return best
}

function decideTurn(state: GameState, v: Vehicle, j: number): void {
  const h = isHorizontal(v.dir)
  const k = Math.floor((h ? v.y : v.x) / PERIOD)
  const opts: Array<Dir | -1> = []
  if (sign(v.dir) > 0 ? j < BLOCKS : j > 0) opts.push(-1, -1)
  if (h) {
    if (k > 0) opts.push(3)
    if (k < BLOCKS) opts.push(1)
  } else {
    if (k < BLOCKS) opts.push(0)
    if (k > 0) opts.push(2)
  }
  const choice = pick(state, opts)
  v.decided = j
  if (choice === -1) return
  v.turnDir = choice
  v.turnAt = j * PERIOD + laneOffset(choice)
}

function stepVehicles(state: GameState, events: SimEvent[]): void {
  for (const v of state.vehicles) {
    if (v.honk > 0) v.honk--
    if (v.ghost > 0) v.ghost--
    if (v.wait > 0) {
      v.wait--
      v.speed = 0
      continue
    }
    const h = isHorizontal(v.dir)
    const s = sign(v.dir)
    let along = h ? v.x : v.y
    const m = along % PERIOD

    if (v.kind === 'angkot' && --v.ngetem <= 0 && m > 4 && m < PERIOD - 1.5 && v.turnDir === -1) {
      v.wait = randInt(state, 100, 220)
      v.ngetem = randInt(state, 600, 1200)
      v.speed = 0
      continue
    }

    const want = CAR_GAP + v.speed * 0.3
    const ahead = clearAhead(state, v, want + 1.4)
    let target = v.maxSpeed
    if (ahead.dist < want) {
      target = 0
      if (ahead.player && v.honk === 0) {
        v.honk = 100
        events.push({ type: 'honk', x: v.x, y: v.y })
      }
    } else if (ahead.dist < want + 1.4) {
      target = Math.min(target, 0.6 + (ahead.dist - want) * 2.5)
    }
    if (target === 0 && v.speed < 0.2) {
      v.stuck++
      // Two vehicles nosed into each other in a crossing: one squeezes past.
      if (v.stuck > 90 && ahead.blocker && ahead.blocker.stuck > 90) {
        v.ghost = 50
        v.stuck = 0
      }
    } else v.stuck = 0
    v.speed = v.speed < target ? Math.min(target, v.speed + CAR_ACCEL * DT) : Math.max(target, v.speed - CAR_BRAKE * DT)

    along += s * v.speed * DT
    if (v.turnDir !== -1 && (s > 0 ? along >= v.turnAt : along <= v.turnAt)) {
      const lane = h ? v.y : v.x
      if (h) {
        v.x = v.turnAt
        v.y = lane
      } else {
        v.y = v.turnAt
        v.x = lane
      }
      v.dir = v.turnDir
      v.turnDir = -1
      v.decided = Math.floor(lane / PERIOD)
      continue
    }
    if (h) v.x = along
    else v.y = along
    if (v.turnDir === -1) {
      const j = s > 0 ? Math.ceil(along / PERIOD) : Math.floor((along - ROAD) / PERIOD)
      const entry = s > 0 ? j * PERIOD : j * PERIOD + ROAD
      if (j >= 0 && j <= BLOCKS && j !== v.decided && Math.abs(entry - along) < 1.6) decideTurn(state, v, j)
    }
  }
}

function collideVehicles(state: GameState, events: SimEvent[]): void {
  const p = state.player
  for (const v of state.vehicles) {
    const b = vehicleBox(v)
    const cx = clamp(p.x, b.x0, b.x1)
    const cy = clamp(p.y, b.y0, b.y1)
    let nx = p.x - cx
    let ny = p.y - cy
    let d = Math.hypot(nx, ny)
    if (d >= RIDER_R) continue
    let push: number
    if (d < 1e-6) {
      // Centre inside the box: out the nearest side.
      const options = [
        { nx: -1, ny: 0, pen: p.x - b.x0 },
        { nx: 1, ny: 0, pen: b.x1 - p.x },
        { nx: 0, ny: -1, pen: p.y - b.y0 },
        { nx: 0, ny: 1, pen: b.y1 - p.y },
      ].sort((a, c) => a.pen - c.pen)[0]!
      nx = options.nx
      ny = options.ny
      push = options.pen + RIDER_R
    } else {
      nx /= d
      ny /= d
      push = RIDER_R - d
    }
    p.x += nx * push
    p.y += ny * push
    const vvx = isHorizontal(v.dir) ? sign(v.dir) * v.speed : 0
    const vvy = isHorizontal(v.dir) ? 0 : sign(v.dir) * v.speed
    const pvx = Math.cos(p.heading) * p.speed + p.kx
    const pvy = Math.sin(p.heading) * p.speed + p.ky
    const impact = -((pvx - vvx) * nx + (pvy - vvy) * ny)
    if (impact > CRASH_IMPACT && p.crashCooldown === 0) {
      crash(state, v.kind, (p.x + cx) / 2, (p.y + cy) / 2, events)
      p.speed *= 0.25
      p.kx = nx * (1.5 + impact * 0.45)
      p.ky = ny * (1.5 + impact * 0.45)
      v.wait = 45
      v.speed = 0
    } else {
      p.speed *= 0.85
    }
  }
}

// ── Razia ────────────────────────────────────────────────────────────────

function placeRazia(state: GameState, ticks: number, replace = -1): void {
  const spots = state.map.raziaSpots
  const p = state.player
  for (let tries = 0; tries < 60; tries++) {
    const i = randInt(state, 0, spots.length - 1)
    const s = spots[i]!
    if (state.razia.some((z) => z.spot === i)) continue
    if (Math.hypot(s.x + 1 - p.x, s.y + 1 - p.y) < 9) continue
    if (replace >= 0) state.razia[replace] = { spot: i, ticks }
    else state.razia.push({ spot: i, ticks })
    return
  }
}

function stepRazia(state: GameState, events: SimEvent[]): void {
  state.razia.forEach((z, i) => {
    if (--z.ticks <= 0) placeRazia(state, randInt(state, RAZIA_MIN, RAZIA_MAX), i)
  })
  const p = state.player
  if (p.immune > 0) {
    p.immune--
    return
  }
  if (p.held > 0) return
  for (const z of state.razia) {
    const s = state.map.raziaSpots[z.spot]!
    if (p.x > s.x + 0.15 && p.x < s.x + s.w - 0.15 && p.y > s.y + 0.15 && p.y < s.y + s.h - 0.15) {
      p.held = RAZIA_HOLD
      p.speed = 0
      p.kx = 0
      p.ky = 0
      state.stats.raziaHits++
      events.push({ type: 'razia' })
      return
    }
  }
}

// ── Orders ───────────────────────────────────────────────────────────────

function newOrder(state: GameState, events: SimEvent[]): void {
  const map = state.map
  const p = state.player
  const fromPlayer = distanceField(map, Math.floor(p.x), Math.floor(p.y))
  const at = (f: Int32Array, q: Place) => f[q.y * map.size + q.x]!
  const reachable = map.restos.map((_, i) => i).filter((i) => at(fromPlayer, map.restos[i]!) > 0)
  const near = reachable.filter((i) => {
    const d = at(fromPlayer, map.restos[i]!)
    return d >= 5 && d <= 28
  })
  const resto = pick(state, near.length ? near : reachable)
  const r = map.restos[resto]!
  const fromResto = distanceField(map, r.x, r.y)
  const homes = map.homes.map((_, i) => i).filter((i) => {
    const d = at(fromResto, map.homes[i]!)
    return d >= ORDER_MIN_TRIP && d <= ORDER_MAX_TRIP
  })
  const home = homes.length ? pick(state, homes) : map.homes.reduce((best, h, i) => (at(fromResto, h) > at(fromResto, map.homes[best]!) ? i : best), 0)
  const trip = at(fromResto, map.homes[home]!)
  const toResto = at(fromPlayer, r)
  const totalTicks = Math.round(((toResto + trip) / ORDER_REF_SPEED + ORDER_SLACK) * TICK_RATE)
  state.order = {
    id: ++state.orderSeq,
    resto,
    home,
    phase: 'jemput',
    ticksLeft: totalTicks,
    totalTicks,
    crashes: 0,
    spills: 0,
    fare: Math.round((FARE_BASE + trip * FARE_PER_TILE) / 500) * 500,
    dwell: 0,
  }
  events.push({ type: 'orderNew' })
}

export function starsFor(o: Pick<Order, 'crashes' | 'spills' | 'ticksLeft' | 'totalTicks'>): { stars: number; mepet: boolean } {
  const mepet = o.ticksLeft < o.totalTicks * MEPET
  const stars = clamp(5 - o.crashes - Math.ceil(o.spills / 2) - (mepet ? 1 : 0), 1, 5)
  return { stars, mepet }
}

function settle(state: GameState, stars: number, events: SimEvent[]): void {
  state.stats.starsSum += stars
  state.stats.rated++
  state.order = null
  state.nextOrder = NEXT_ORDER_TICKS
  if (rating(state) < RATING_FLOOR) end(state, 'rating', events)
}

function stepOrder(state: GameState, events: SimEvent[]): void {
  const o = state.order
  if (!o) {
    if (--state.nextOrder <= 0) newOrder(state, events)
    return
  }
  o.ticksLeft--
  if (o.ticksLeft === HURRY_TICKS) events.push({ type: 'hurry' })
  if (o.ticksLeft <= 0) {
    state.stats.cancelled++
    state.last = { stars: 1, fare: 0, tip: 0, crashes: o.crashes, spills: o.spills, mepet: true, cancelled: true }
    events.push({ type: 'cancelled' })
    settle(state, 1, events)
    return
  }
  const t = orderTarget(state)!
  const p = state.player
  const close = Math.hypot(p.x - (t.x + 0.5), p.y - (t.y + 0.5)) < PIN_RADIUS
  o.dwell = close && p.speed < PIN_SPEED && p.held === 0 ? o.dwell + 1 : 0
  if (o.dwell < DWELL_TICKS) return
  o.dwell = 0
  if (o.phase === 'jemput') {
    o.phase = 'antar'
    events.push({ type: 'pickup' })
    return
  }
  const { stars, mepet } = starsFor(o)
  const bonusTip = stars === 5 ? (BIKE_PROFILES[state.opts.bike ?? 'matic']?.tipBonus ?? 0) : 0
  const tip = stars === 5 ? 2000 + 500 * randInt(state, 0, 6) + bonusTip : 0
  const result: TripResult = { stars, fare: o.fare, tip, crashes: o.crashes, spills: o.spills, mepet, cancelled: false }
  state.stats.delivered++
  state.stats.earnings += o.fare + tip
  if (stars === 5) state.stats.perfect++
  state.last = result
  events.push({ type: 'delivered', result })
  settle(state, stars, events)
}

/** True for main-road tiles (cars) as opposed to gangs. */
export function onJalan(x: number, y: number): boolean {
  return isRoadLine(Math.floor(x)) || isRoadLine(Math.floor(y))
}
