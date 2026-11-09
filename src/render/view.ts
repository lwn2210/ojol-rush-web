import { DWELL_TICKS, RAZIA_HOLD } from '../sim/constants'
import { orderTarget, wrapAngle, type GameState } from '../sim/game'
import { distanceField, fieldAt, routeFrom, type CityMap } from '../sim/map'
import { COLORS, paintCity, paintMinimap } from './city'
import { Fx } from './fx'
import { drawMotor, drawPin, drawRazia, drawRestoDot, drawVehicle } from './sprites'

// Canvas 2D renderer. Reads the sim state (plus the previous tick's
// positions for interpolation) and draws; never changes the state.

export interface Pose {
  x: number
  y: number
  heading: number
}

const DIR_ANGLE = [0, Math.PI / 2, Math.PI, -Math.PI / 2]
const MAX_LAYER_PX = 80

export class View {
  private readonly ctx: CanvasRenderingContext2D
  private w = 1
  private h = 1
  private dpr = 1
  /** CSS pixels per tile. */
  tile = 40
  private layer: HTMLCanvasElement | null = null
  private layerPx = 0
  private map: CityMap | null = null
  private miniBase: HTMLCanvasElement | null = null
  private cam = { x: 0, y: 0 }
  private angles = new Map<number, number>()
  private fieldKey = ''
  private field: Int32Array | null = null
  private puffClock = 0
  /** Screen-space insets the HUD covers, so the camera and arrows avoid them. */
  insets = { top: 0, bottom: 0 }
  /** Screen shake after a crash, in tiles; decays by itself. */
  shake = 0
  readonly fx = new Fx()

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly mini: HTMLCanvasElement,
  ) {
    this.ctx = canvas.getContext('2d')!
  }

  resize(w: number, h: number, dpr: number): void {
    this.w = w
    this.h = h
    this.dpr = Math.min(2, dpr)
    this.canvas.width = Math.round(w * this.dpr)
    this.canvas.height = Math.round(h * this.dpr)
    this.tile = Math.max(34, Math.min(60, Math.min(w, h) / 10.5))
    this.layer = null
  }

  setMap(map: CityMap): void {
    if (this.map === map) return
    this.map = map
    this.layer = null
    this.miniBase = null
    this.angles.clear()
    this.field = null
    this.fieldKey = ''
  }

  snap(x: number, y: number): void {
    this.cam.x = x
    this.cam.y = y
  }

  /** Route distance to the current pin in tiles (for the HUD), or -1. */
  routeLeft(state: GameState): number {
    const field = this.targetField(state)
    if (!field) return -1
    return fieldAt(state.map, field, Math.floor(state.player.x), Math.floor(state.player.y))
  }

  private targetField(state: GameState): Int32Array | null {
    const t = orderTarget(state)
    if (!t) return null
    const key = `${state.seed}:${t.x},${t.y}`
    if (key !== this.fieldKey || !this.field) {
      this.fieldKey = key
      this.field = distanceField(state.map, t.x, t.y)
    }
    return this.field
  }

  draw(state: GameState, prev: Pose, prevCars: ReadonlyArray<{ x: number; y: number }>, alpha: number, t: number, dt: number, live: boolean): void {
    const map = state.map
    this.setMap(map)
    const ctx = this.ctx
    const p = state.player
    const px = prev.x + (p.x - prev.x) * alpha
    const py = prev.y + (p.y - prev.y) * alpha
    const heading = prev.heading + wrapAngle(p.heading - prev.heading) * alpha
    const tile = this.tile

    // Camera: ahead of the motor, a little lower so the HUD doesn't hide what's coming.
    const look = 0.42
    const offsetY = (this.insets.top - this.insets.bottom) / 2 / tile
    const tx = px + Math.cos(p.heading) * p.speed * look
    const ty = py + Math.sin(p.heading) * p.speed * look - offsetY
    const k = Math.min(1, dt * 4)
    this.cam.x += (tx - this.cam.x) * k
    this.cam.y += (ty - this.cam.y) * k
    const halfW = this.w / 2 / tile
    const halfH = this.h / 2 / tile
    const margin = 1.2
    const clampCam = (v: number, half: number) => (half * 2 > map.size + margin * 2 ? map.size / 2 : Math.max(half - margin, Math.min(map.size + margin - half, v)))
    this.cam.x = clampCam(this.cam.x, halfW)
    this.cam.y = clampCam(this.cam.y, halfH)
    this.shake = Math.max(0, this.shake - dt * 1.2)
    const cx = this.cam.x + (Math.random() - 0.5) * this.shake
    const cy = this.cam.y + (Math.random() - 0.5) * this.shake

    const s = this.dpr * tile
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.fillStyle = COLORS.kali
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)
    ctx.setTransform(s, 0, 0, s, this.dpr * (this.w / 2 - cx * tile), this.dpr * (this.h / 2 - cy * tile))

    // River ripples beyond the edge of town.
    ctx.strokeStyle = COLORS.kaliLight
    ctx.lineWidth = 0.05
    ctx.beginPath()
    for (let yy = Math.floor(cy - halfH) - 1; yy < cy + halfH + 1; yy += 1.3) {
      for (let xx = Math.floor(cx - halfW) - 1; xx < cx + halfW + 1; xx += 2.1) {
        if (xx > -0.5 && xx < map.size + 0.5 && yy > -0.5 && yy < map.size + 0.5) continue
        const o = Math.sin(t * 1.5 + xx * 0.7 + yy) * 0.15
        ctx.moveTo(xx + o, yy)
        ctx.lineTo(xx + 0.6 + o, yy)
      }
    }
    ctx.stroke()

    // The painted city.
    const wantPx = Math.min(MAX_LAYER_PX, Math.round(tile * this.dpr))
    if (!this.layer || this.layerPx !== wantPx) {
      this.layerPx = wantPx
      this.layer = paintCity(map, wantPx)
    }
    const x0 = Math.max(0, Math.floor(cx - halfW - 1))
    const y0 = Math.max(0, Math.floor(cy - halfH - 1))
    const x1 = Math.min(map.size, Math.ceil(cx + halfW + 1))
    const y1 = Math.min(map.size, Math.ceil(cy + halfH + 1))
    if (x1 > x0 && y1 > y0) {
      const lp = this.layerPx
      ctx.imageSmoothingEnabled = true
      ctx.drawImage(this.layer, x0 * lp, y0 * lp, (x1 - x0) * lp, (y1 - y0) * lp, x0, y0, x1 - x0, y1 - y0)
    }
    ctx.strokeStyle = 'rgba(30, 20, 12, 0.35)'
    ctx.lineWidth = 0.12
    ctx.strokeRect(-0.06, -0.06, map.size + 0.12, map.size + 0.12)

    // Route line, like the app's map.
    const target = orderTarget(state)
    const field = this.targetField(state)
    if (target && field) {
      const route = routeFrom(map, field, Math.floor(p.x), Math.floor(p.y), 90)
      const color = state.order!.phase === 'jemput' ? 'rgba(240, 138, 36, 0.75)' : 'rgba(31, 154, 75, 0.75)'
      ctx.lineJoin = 'round'
      ctx.lineCap = 'round'
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'
      ctx.lineWidth = 0.26
      ctx.beginPath()
      ctx.moveTo(px, py)
      for (let i = 1; i < route.length; i++) ctx.lineTo(route[i]!.x + 0.5, route[i]!.y + 0.5)
      ctx.stroke()
      ctx.strokeStyle = color
      ctx.lineWidth = 0.15
      ctx.setLineDash([0.3, 0.22])
      ctx.lineDashOffset = -t * 1.2
      ctx.stroke()
      ctx.setLineDash([])
      ctx.lineCap = 'butt'
    }

    // Restaurants that aren't the current pickup.
    map.restos.forEach((r, i) => {
      if (state.order?.phase === 'jemput' && state.order.resto === i) return
      ctx.save()
      ctx.translate(r.x + 0.5, r.y + 0.5)
      drawRestoDot(ctx)
      ctx.restore()
    })

    for (const z of state.razia) {
      const spot = map.raziaSpots[z.spot]!
      if (spot.x > cx + halfW + 2 || spot.x + spot.w < cx - halfW - 2 || spot.y > cy + halfH + 2 || spot.y + spot.h < cy - halfH - 2) continue
      ctx.save()
      ctx.translate(spot.x, spot.y)
      const horizontal = spot.y % 11 === 0 && spot.x % 11 !== 0
      drawRazia(ctx, spot.w, spot.h, horizontal, t)
      ctx.restore()
    }

    state.vehicles.forEach((v, i) => {
      const q = prevCars[i] ?? v
      const vx = q.x + (v.x - q.x) * alpha
      const vy = q.y + (v.y - q.y) * alpha
      const want = DIR_ANGLE[v.dir]!
      const a0 = this.angles.get(v.id) ?? want
      const a = a0 + wrapAngle(want - a0) * Math.min(1, dt * 12)
      this.angles.set(v.id, a)
      if (vx < cx - halfW - 2 || vx > cx + halfW + 2 || vy < cy - halfH - 2 || vy > cy + halfH + 2) return
      ctx.save()
      ctx.translate(vx, vy)
      ctx.rotate(a)
      drawVehicle(ctx, v.kind, v.color, t, v.speed < v.maxSpeed * 0.6 && v.kind !== 'gerobak')
      ctx.restore()
    })

    // Exhaust puffs while riding.
    this.puffClock += dt
    if (live && p.speed > 1 && this.puffClock > 0.07) {
      this.puffClock = 0
      this.fx.puff(px - Math.cos(heading) * 0.42, py - Math.sin(heading) * 0.42, -Math.cos(heading) * 0.5, -Math.sin(heading) * 0.5)
    }

    ctx.save()
    ctx.translate(px, py)
    const wobble = p.stun > 0 ? Math.sin(t * 40) * 0.25 : 0
    ctx.rotate(heading + wobble)
    const lean = Math.max(-1, Math.min(1, wrapAngle(p.heading - prev.heading) * 20))
    drawMotor(ctx, lean, state.order?.phase === 'antar', t, p.speed > 0.5 && p.held === 0 && p.stun === 0 && p.speed < 2)
    ctx.restore()

    this.fx.update(dt)
    this.fx.drawParticles(ctx)

    const pulse = (t * 0.9) % 1
    if (target) {
      ctx.save()
      ctx.translate(target.x + 0.5, target.y + 0.5)
      drawPin(ctx, state.order!.phase === 'jemput' ? 'resto' : 'home', pulse)
      ctx.restore()
    }

    // Screen space from here.
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
    const toScreen = (x: number, y: number): [number, number] => [this.w / 2 + (x - cx) * tile, this.h / 2 + (y - cy) * tile]
    const [sx, sy] = toScreen(px, py)

    // Razia hold countdown or stopping-at-the-pin progress, as a ring round the rider.
    if (p.held > 0) this.ring(sx, sy, p.held / RAZIA_HOLD, '#ff4b3a')
    else if (state.order && state.order.dwell > 0) this.ring(sx, sy, state.order.dwell / DWELL_TICKS, state.order.phase === 'jemput' ? '#f08a24' : '#1f9a4b')

    if (target && live) {
      const [tsx, tsy] = toScreen(target.x + 0.5, target.y + 0.5)
      const top = this.insets.top + 10
      const bottom = this.h - this.insets.bottom - 10
      const onScreen = tsx > 24 && tsx < this.w - 24 && tsy > top + 30 && tsy < bottom
      if (onScreen) this.label(tsx, tsy - tile * 1.35, target.name, state.order!.phase === 'jemput' ? '#f08a24' : '#1f9a4b')
      else this.edgeArrow(sx, sy, tsx, tsy, top, bottom, state.order!.phase === 'jemput' ? '#f08a24' : '#1f9a4b', this.routeLeft(state))
    }
    this.fx.drawFloaters(ctx, toScreen)
    this.drawMini(state)
  }

  private ring(x: number, y: number, frac: number, color: string): void {
    const ctx = this.ctx
    const r = this.tile * 0.62
    ctx.lineWidth = 5
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.beginPath()
    ctx.arc(x, y, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.strokeStyle = color
    ctx.beginPath()
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, Math.min(1, frac)))
    ctx.stroke()
  }

  private label(x: number, y: number, text: string, color: string): void {
    const ctx = this.ctx
    ctx.font = '800 13px Nunito, system-ui, sans-serif'
    const w = ctx.measureText(text).width + 16
    const lx = Math.max(w / 2 + 6, Math.min(this.w - w / 2 - 6, x))
    ctx.fillStyle = 'rgba(255, 249, 240, 0.95)'
    ctx.beginPath()
    ctx.roundRect(lx - w / 2, y - 12, w, 24, 12)
    ctx.fill()
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.stroke()
    ctx.fillStyle = '#2a1e17'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(text, lx, y + 1)
  }

  private edgeArrow(fromX: number, fromY: number, toX: number, toY: number, top: number, bottom: number, color: string, tiles: number): void {
    const ctx = this.ctx
    const a = Math.atan2(toY - fromY, toX - fromX)
    const pad = 30
    const cxs = this.w / 2
    const cys = (top + bottom) / 2
    const hw = this.w / 2 - pad
    const hh = (bottom - top) / 2 - pad
    const kx = Math.abs(Math.cos(a)) > 1e-6 ? hw / Math.abs(Math.cos(a)) : Infinity
    const ky = Math.abs(Math.sin(a)) > 1e-6 ? hh / Math.abs(Math.sin(a)) : Infinity
    const d = Math.min(kx, ky)
    const x = cxs + Math.cos(a) * d
    const y = cys + Math.sin(a) * d
    ctx.save()
    ctx.translate(x, y)
    ctx.fillStyle = color
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.arc(0, 0, 20, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.rotate(a)
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.moveTo(30, 0)
    ctx.lineTo(21, -7)
    ctx.lineTo(21, 7)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
    if (tiles >= 0) {
      ctx.font = '800 11px Nunito, system-ui, sans-serif'
      ctx.fillStyle = '#ffffff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(formatMeters(tiles), x, y + 1)
    }
  }

  private drawMini(state: GameState): void {
    const mini = this.mini
    if (mini.offsetParent === null) return
    const map = state.map
    const cssSize = mini.clientWidth
    const dpr = this.dpr
    if (mini.width !== Math.round(cssSize * dpr)) {
      mini.width = Math.round(cssSize * dpr)
      mini.height = Math.round(cssSize * dpr)
      this.miniBase = null
    }
    if (!this.miniBase) this.miniBase = paintMinimap(map, 4)
    const ctx = mini.getContext('2d')!
    const k = mini.width / map.size
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.imageSmoothingEnabled = false
    ctx.drawImage(this.miniBase, 0, 0, mini.width, mini.height)
    ctx.setTransform(k, 0, 0, k, 0, 0)
    for (const z of state.razia) {
      const s = map.raziaSpots[z.spot]!
      ctx.fillStyle = '#e8352a'
      ctx.beginPath()
      ctx.arc(s.x + s.w / 2, s.y + s.h / 2, 1.3, 0, Math.PI * 2)
      ctx.fill()
    }
    map.restos.forEach((r) => {
      ctx.fillStyle = 'rgba(240, 138, 36, 0.7)'
      ctx.fillRect(r.x - 0.1, r.y - 0.1, 1.2, 1.2)
    })
    const t = orderTarget(state)
    if (t) {
      ctx.fillStyle = state.order!.phase === 'jemput' ? '#f08a24' : '#1f9a4b'
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.arc(t.x + 0.5, t.y + 0.5, 1.6, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }
    const p = state.player
    ctx.fillStyle = '#1f7a3a'
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 0.5
    ctx.save()
    ctx.translate(p.x, p.y)
    ctx.rotate(p.heading)
    ctx.beginPath()
    ctx.moveTo(1.8, 0)
    ctx.lineTo(-1.2, -1.2)
    ctx.lineTo(-0.6, 0)
    ctx.lineTo(-1.2, 1.2)
    ctx.closePath()
    ctx.fill()
    ctx.stroke()
    ctx.restore()
    // The camera's window.
    const halfW = this.w / 2 / this.tile
    const halfH = this.h / 2 / this.tile
    ctx.strokeStyle = 'rgba(42, 30, 23, 0.5)'
    ctx.lineWidth = 0.4
    ctx.strokeRect(this.cam.x - halfW, this.cam.y - halfH, halfW * 2, halfH * 2)
  }
}

/** Route tiles to a friendly distance (a tile is about 10 m of Jakarta). */
export function formatMeters(tiles: number): string {
  const m = Math.max(0, tiles) * 10
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} km` : `${m} m`
}
