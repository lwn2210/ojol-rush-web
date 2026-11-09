import { describe, expect, it } from 'vitest'
import { Autopilot } from '../src/sim/autopilot'
import {
  BUMP_SAFE,
  DWELL_TICKS,
  MAX_SPEED,
  NEXT_ORDER_TICKS,
  RAZIA_HOLD,
  RAZIA_IMMUNE,
  RIDER_R,
  WATER_FACTOR,
} from '../src/sim/constants'
import { createGame, NO_INPUT, rating, starsFor, step, vehicleBox, type GameState, type Input, type SimEvent } from '../src/sim/game'
import { drivable, JALAN, tileAt } from '../src/sim/map'
import { rand } from '../src/sim/rng'

const quiet = (seed = 3) => createGame(seed, { traffic: false, razia: false })

function run(state: GameState, ticks: number, input: Input | ((s: GameState) => Input) = NO_INPUT): SimEvent[] {
  const all: SimEvent[] = []
  for (let i = 0; i < ticks; i++) all.push(...step(state, typeof input === 'function' ? input(state) : input))
  return all
}

function insideWall(state: GameState): boolean {
  const p = state.player
  for (const [dx, dy] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    if (!drivable(state.map, Math.floor(p.x + dx * (RIDER_R - 0.01)), Math.floor(p.y + dy * (RIDER_R - 0.01)))) return true
  return false
}

/** A main-road tile with a building straight north of it, away from crossings. */
function roadBelowWall(state: GameState): { x: number; y: number } {
  const m = state.map
  for (let y = 1; y < m.size; y++)
    for (let x = 3; x < m.size - 3; x++)
      if (tileAt(m, x, y) === JALAN && tileAt(m, x, y - 1) === 0 && tileAt(m, x - 1, y - 1) === 0 && tileAt(m, x + 1, y - 1) === 0) return { x, y }
  throw new Error('none')
}

describe('gerak motor', () => {
  it('ngegas sampai kecepatan maksimal di jalan lurus, lalu berhenti sendiri kalau dilepas', () => {
    const s = quiet()
    const y0 = s.player.y
    run(s, 90, { x: 1, y: 0, horn: false })
    expect(s.player.speed).toBeCloseTo(MAX_SPEED, 5)
    expect(s.player.y).toBeCloseTo(y0, 6)
    run(s, 120)
    expect(s.player.speed).toBe(0)
  })

  it('belok ke arah input, putar balik pelan', () => {
    const s = quiet()
    run(s, 40, { x: 1, y: 0, horn: false })
    const before = s.player.speed
    run(s, 6, { x: -1, y: 0, horn: false })
    expect(s.player.speed).toBeLessThan(before)
    run(s, 40, { x: -1, y: 0, horn: false })
    expect(Math.abs(Math.abs(s.player.heading) - Math.PI)).toBeLessThan(0.01)
  })

  it('nabrak tembok kencang: berhenti di tembok dan dihitung nabrak; pelan cuma mentok', () => {
    const s = quiet()
    const spot = roadBelowWall(s)
    Object.assign(s.player, { x: spot.x + 0.5, y: spot.y + 0.7, heading: -Math.PI / 2, speed: MAX_SPEED })
    const events = run(s, 20, { x: 0, y: -1, horn: false })
    expect(events.some((e) => e.type === 'crash' && e.what === 'tembok')).toBe(true)
    expect(insideWall(s)).toBe(false)
    expect(s.player.y).toBeGreaterThanOrEqual(spot.y + RIDER_R - 0.001)

    const slow = quiet()
    Object.assign(slow.player, { x: spot.x + 0.5, y: spot.y + 0.7, heading: -Math.PI / 2, speed: 2 })
    const soft = run(slow, 30, { x: 0, y: -0.3, horn: false })
    expect(soft.some((e) => e.type === 'crash')).toBe(false)
    expect(insideWall(slow)).toBe(false)
  })

  it('nggak pernah nembus tembok walau disetir acak sepanjang shift', () => {
    const s = quiet(11)
    const r = { rng: 99 }
    let input: Input = NO_INPUT
    for (let i = 0; i < 6000; i++) {
      if (i % 20 === 0) input = { x: rand(r) * 2 - 1, y: rand(r) * 2 - 1, horn: false }
      step(s, input)
      expect(insideWall(s)).toBe(false)
    }
  })

  it('genangan bikin lambat', () => {
    const s = quiet()
    const m = s.map
    const i = m.water.findIndex((w, k) => w && m.water[k + 1] && tileAt(m, (k % m.size) - 1, Math.floor(k / m.size)) !== 0)
    expect(i).toBeGreaterThan(0)
    const x = (i % m.size) - 0.5
    const y = Math.floor(i / m.size) + 0.5
    Object.assign(s.player, { x, y, heading: 0, speed: MAX_SPEED })
    const events = run(s, 20, { x: 1, y: 0, horn: false })
    expect(events.some((e) => e.type === 'splash')).toBe(true)
    expect(s.player.wet).toBe(true)
    expect(s.player.speed).toBeLessThanOrEqual(MAX_SPEED * WATER_FACTOR + 0.01)
  })

  it('polisi tidur: kencang = jedug (makanan goyang kalau lagi antar), pelan = aman', () => {
    const s = quiet()
    const m = s.map
    const i = m.bumps.findIndex((b, k) => b === 1 && drivable(m, (k % m.size) - 2, Math.floor(k / m.size)))
    const x = (i % m.size) + 0.5
    const y = Math.floor(i / m.size) + 0.5
    run(s, NEXT_ORDER_TICKS)
    s.order!.phase = 'antar'
    Object.assign(s.player, { x: x - 1.2, y, heading: 0, speed: MAX_SPEED })
    const hard = run(s, 12, { x: 1, y: 0, horn: false }).filter((e) => e.type === 'bump')
    expect(hard).toEqual([expect.objectContaining({ hard: true, spill: true })])
    expect(s.order!.spills).toBe(1)
    expect(s.player.speed).toBeLessThan(MAX_SPEED * 0.6)

    Object.assign(s.player, { x: x - 1.2, y, heading: 0, speed: BUMP_SAFE - 0.5 })
    const soft = run(s, 40, { x: 0.25, y: 0, horn: false }).filter((e) => e.type === 'bump')
    expect(soft).toEqual([expect.objectContaining({ hard: false, spill: false })])
    expect(s.order!.spills).toBe(1)
  })
})

describe('lalu lintas', () => {
  it('kendaraan tetap di lajur kiri jalan utama selama semenit', () => {
    const s = createGame(21, { razia: false })
    for (let t = 0; t < 3600; t++) {
      step(s, NO_INPUT)
      if (t % 30) continue
      for (const v of s.vehicles) {
        expect(tileAt(s.map, Math.floor(v.x), Math.floor(v.y))).toBe(JALAN)
        const lane = v.dir === 0 || v.dir === 2 ? v.y : v.x
        const offset = lane % 11
        expect(offset === 0.5 || offset === 1.5).toBe(true)
        // Left-hand traffic: east and north on the 0.5 lane, west and south on 1.5.
        expect(offset).toBe(v.dir === 0 || v.dir === 3 ? 0.5 : 1.5)
      }
    }
    const moved = s.vehicles.filter((v) => v.kind !== 'gerobak').length
    expect(moved).toBe(26)
  })

  it('mobil ngerem dan klakson kalau motor diam di depannya', () => {
    const s = createGame(21, { razia: false })
    const v = s.vehicles.find((u) => u.kind === 'mobil' && u.dir === 0)!
    s.vehicles = [v]
    Object.assign(v, { x: 30, y: 11.5, speed: v.maxSpeed, turnDir: -1, decided: 3 })
    Object.assign(s.player, { x: 34, y: 11.5, heading: 0, speed: 0 })
    const events = run(s, 120)
    expect(events.some((e) => e.type === 'honk')).toBe(true)
    expect(events.some((e) => e.type === 'crash')).toBe(false)
    expect(vehicleBox(v).x1).toBeLessThan(s.player.x - RIDER_R)
  })

  it('motor nabrak mobil: kepental, dihitung nabrak, nggak nembus', () => {
    const s = createGame(21, { razia: false })
    const v = s.vehicles.find((u) => u.kind === 'mobil')!
    s.vehicles = [v]
    Object.assign(v, { x: 32, y: 22.5, dir: 0, speed: 0, wait: 9999 })
    run(s, NEXT_ORDER_TICKS)
    Object.assign(s.player, { x: 28, y: 22.5, heading: 0, speed: MAX_SPEED })
    const events = run(s, 60, { x: 1, y: 0, horn: false })
    expect(events.filter((e) => e.type === 'crash')).toEqual([expect.objectContaining({ what: 'mobil', counted: true })])
    expect(s.order!.crashes).toBe(1)
    expect(s.player.x + RIDER_R).toBeLessThanOrEqual(vehicleBox(v).x0 + 0.02)
  })
})

describe('razia', () => {
  it('masuk titik razia aktif: ditahan 4 detik, terus kebal sebentar', () => {
    const s = createGame(4, { traffic: false })
    const spot = s.map.raziaSpots[s.razia[0]!.spot]!
    s.razia[0]!.ticks = 99999
    Object.assign(s.player, { x: spot.x + 1, y: spot.y + 0.5, heading: 0, speed: 0 })
    const events = run(s, 2, { x: 1, y: 0, horn: false })
    expect(events.some((e) => e.type === 'razia')).toBe(true)
    const x = s.player.x
    run(s, RAZIA_HOLD - 5, { x: 1, y: 0, horn: false })
    expect(s.player.x).toBe(x)
    const out = run(s, 10, { x: 1, y: 0, horn: false })
    expect(out.some((e) => e.type === 'released')).toBe(true)
    expect(s.player.x).toBeGreaterThan(x)
    expect(s.player.immune).toBeGreaterThan(RAZIA_IMMUNE - 20)
    expect(s.stats.raziaHits).toBe(1)
  })

  it('razia pindah tempat setelah waktunya habis', () => {
    const s = createGame(4, { traffic: false })
    const before = s.razia.map((z) => z.spot).join()
    run(s, 50 * 60)
    expect(s.razia.map((z) => z.spot).join()).not.toBe(before)
    expect(s.razia.length).toBe(3)
  })
})

describe('order, timer, rating', () => {
  it('siklus order: masuk → jemput di resto → antar → dibayar', () => {
    const s = quiet()
    expect(s.order).toBeNull()
    const first = run(s, NEXT_ORDER_TICKS)
    expect(first.map((e) => e.type)).toContain('orderNew')
    const o = s.order!
    expect(o.phase).toBe('jemput')
    expect(o.fare % 500).toBe(0)
    const resto = s.map.restos[o.resto]!
    Object.assign(s.player, { x: resto.x + 0.5, y: resto.y + 0.5, speed: 0 })
    const picked = run(s, DWELL_TICKS + 1)
    expect(picked.map((e) => e.type)).toContain('pickup')
    expect(s.order!.phase).toBe('antar')
    const home = s.map.homes[o.home]!
    Object.assign(s.player, { x: home.x + 0.5, y: home.y + 0.5, speed: 0 })
    const done = run(s, DWELL_TICKS + 1).find((e) => e.type === 'delivered')
    expect(done && done.type === 'delivered' && done.result.stars).toBe(5)
    expect(s.stats.delivered).toBe(1)
    expect(s.stats.earnings).toBe(o.fare + s.last!.tip)
    expect(s.last!.tip).toBeGreaterThanOrEqual(2000)
    expect(s.order).toBeNull()
    run(s, NEXT_ORDER_TICKS)
    expect(s.order!.id).toBe(2)
  })

  it('lewat pin kenceng nggak dihitung, harus berhenti dulu', () => {
    const s = quiet()
    run(s, NEXT_ORDER_TICKS)
    const resto = s.map.restos[s.order!.resto]!
    for (let i = 0; i < 30; i++) {
      Object.assign(s.player, { x: resto.x + 0.5, y: resto.y + 0.5, speed: 5, heading: 0 })
      step(s, { x: 0, y: 0, horn: false })
      s.player.x = resto.x + 0.5
    }
    expect(s.order!.phase).toBe('jemput')
  })

  it('timer habis = pelanggan cancel, bintang 1; dua cancel di awal = akun dibekukan', () => {
    const s = quiet()
    run(s, NEXT_ORDER_TICKS)
    const events = run(s, s.order!.ticksLeft)
    expect(events.map((e) => e.type)).toContain('cancelled')
    expect(s.stats.cancelled).toBe(1)
    expect(rating(s)).toBeCloseTo(4, 5)
    expect(s.phase).toBe('play')
    run(s, NEXT_ORDER_TICKS)
    const second = run(s, s.order!.ticksLeft + 1)
    expect(second.find((e) => e.type === 'shiftOver')).toEqual({ type: 'shiftOver', reason: 'rating' })
    expect(s.phase).toBe('over')
    expect(rating(s)).toBeLessThan(3.5)
  })

  it('hitungan bintang: nabrak, goyang, dan mepet ngurangin; minimal 1', () => {
    const base = { crashes: 0, spills: 0, ticksLeft: 600, totalTicks: 1000 }
    expect(starsFor(base).stars).toBe(5)
    expect(starsFor({ ...base, crashes: 2 }).stars).toBe(3)
    expect(starsFor({ ...base, spills: 1 }).stars).toBe(4)
    expect(starsFor({ ...base, spills: 3 }).stars).toBe(3)
    expect(starsFor({ ...base, ticksLeft: 150 })).toEqual({ stars: 4, mepet: true })
    expect(starsFor({ crashes: 9, spills: 9, ticksLeft: 1, totalTicks: 1000 }).stars).toBe(1)
  })

  it('shift selesai waktu jam habis', () => {
    const s = quiet()
    s.shiftLeft = 30
    const events = run(s, 40)
    expect(events.filter((e) => e.type === 'shiftOver')).toEqual([{ type: 'shiftOver', reason: 'waktu' }])
    expect(s.phase).toBe('over')
    expect(step(s, NO_INPUT)).toEqual([])
  })

  it('autopilot bisa nyelesaiin order sebelum waktunya habis (sepi, 6 seed)', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const s = quiet(seed)
      const bot = new Autopilot()
      let delivered = 0
      for (let t = 0; t < 120 * 60 && delivered < 3; t++) {
        for (const e of step(s, bot.think(s))) {
          if (e.type === 'cancelled') throw new Error(`seed ${seed}: cancel`)
          if (e.type === 'delivered') {
            delivered++
            expect(e.result.stars, `seed ${seed}`).toBeGreaterThanOrEqual(4)
          }
        }
      }
      expect(delivered, `seed ${seed}`).toBe(3)
    }
  })

  it('satu shift penuh pakai autopilot di lalu lintas + razia tetap waras', () => {
    const s = createGame(77)
    const bot = new Autopilot()
    for (let t = 0; t < 180 * 60 && s.phase === 'play'; t++) {
      step(s, bot.think(s))
      expect(Number.isFinite(s.player.x) && Number.isFinite(s.player.y)).toBe(true)
      expect(insideWall(s)).toBe(false)
    }
    expect(s.stats.delivered).toBeGreaterThanOrEqual(3)
  })
})

describe('determinisme', () => {
  it('seed + input sama = shift sama persis; seed beda = beda', () => {
    const script = (seed: number) => {
      const r = { rng: seed }
      let input: Input = NO_INPUT
      return () => {
        if (rand(r) < 0.05) input = { x: rand(r) * 2 - 1, y: rand(r) * 2 - 1, horn: rand(r) < 0.1 }
        return input
      }
    }
    const a = createGame(1234)
    const b = createGame(1234)
    const ia = script(5)
    const ib = script(5)
    const ea: SimEvent[] = []
    const eb: SimEvent[] = []
    for (let t = 0; t < 4000; t++) {
      ea.push(...step(a, ia()))
      eb.push(...step(b, ib()))
    }
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
    expect(ea).toEqual(eb)
    const c = createGame(4321)
    run(c, 4000, script(5))
    expect(JSON.stringify(c.vehicles)).not.toBe(JSON.stringify(a.vehicles))
  })
})
