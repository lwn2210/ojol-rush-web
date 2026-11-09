import { RIDER_R } from './constants'
import { distanceField, drivable, routeFrom, type CityMap } from './map'
import { orderTarget, vehicleBox, type GameState, type Input } from './game'

// A driver that follows the shortest route to the current pin. Used for the
// menu's background demo and by the tests to run whole orders through the
// real physics. It only produces an Input, like a player would.

function clearLine(map: CityMap, x0: number, y0: number, x1: number, y1: number): boolean {
  const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.15)
  for (let i = 1; i <= steps; i++) {
    const x = x0 + ((x1 - x0) * i) / steps
    const y = y0 + ((y1 - y0) * i) / steps
    for (const [dx, dy] of [
      [-RIDER_R, -RIDER_R],
      [RIDER_R, -RIDER_R],
      [-RIDER_R, RIDER_R],
      [RIDER_R, RIDER_R],
    ] as const) {
      if (!drivable(map, Math.floor(x + dx), Math.floor(y + dy))) return false
    }
  }
  return true
}

export class Autopilot {
  private key = ''
  private field: Int32Array | null = null
  private waited = 0
  private nudge = 0

  think(state: GameState): Input {
    const target = orderTarget(state)
    const p = state.player
    if (!target || state.phase !== 'play') return { x: 0, y: 0, horn: false }
    const map = state.map
    const key = `${target.x},${target.y}`
    if (key !== this.key || !this.field) {
      this.key = key
      this.field = distanceField(map, target.x, target.y)
    }
    const tx = Math.floor(p.x)
    const ty = Math.floor(p.y)
    const route = routeFrom(map, this.field, tx, ty, 6)
    const left = route.length - 1

    let aimX = target.x + 0.5
    let aimY = target.y + 0.5
    if (left > 0) {
      // Furthest route tile we can see in a straight line.
      for (let i = Math.min(left, 4); i >= 1; i--) {
        const q = route[i]!
        if (i === 1 || clearLine(map, p.x, p.y, q.x + 0.5, q.y + 0.5)) {
          aimX = q.x + 0.5
          aimY = q.y + 0.5
          break
        }
      }
    }
    const dx = aimX - p.x
    const dy = aimY - p.y
    const len = Math.hypot(dx, dy)
    if (left === 0 && len < 0.25) return { x: 0, y: 0, horn: false }

    let mag = 1
    if (left <= 2) mag = 0.25
    // Slow for polisi tidur (including the one under us, until it's crossed) and corners.
    for (let i = 0; i < Math.min(route.length, 4); i++) {
      const q = route[i]!
      if (map.bumps[q.y * map.size + q.x]) mag = Math.min(mag, 0.35)
    }
    if (route.length >= 3) {
      const a = route[1]!
      const b = route[2]!
      const turning = (a.x - tx) * (b.y - a.y) - (a.y - ty) * (b.x - a.x) !== 0
      if (turning && p.speed > 4.5) mag = Math.min(mag, 0.5)
    }
    let ux = dx / len
    let uy = dy / len
    // Waited long enough (cars stop for us too, so we'd wait forever): creep
    // round whatever is there and let the collision slide us past it.
    if (this.nudge > 0) {
      this.nudge--
      return { x: ux * 0.22, y: uy * 0.22, horn: false }
    }
    // Something in the way: swerve into whichever side is free, or wait.
    if (this.blocked(state, p.x, p.y, ux, uy)) {
      const sides = [
        [-uy, ux],
        [uy, -ux],
      ] as const
      const free = sides.find(([sx, sy]) => {
        const ax = p.x + sx * 0.9
        const ay = p.y + sy * 0.9
        return clearLine(map, p.x, p.y, ax, ay) && !this.blocked(state, ax, ay, ux, uy)
      })
      if (free) {
        ux = ux * 0.5 + free[0]
        uy = uy * 0.5 + free[1]
        const l = Math.hypot(ux, uy)
        ux /= l
        uy /= l
        mag = Math.min(mag, 0.6)
      } else mag = 0
    }
    this.waited = mag === 0 ? this.waited + 1 : 0
    if (this.waited > 45) {
      this.waited = 0
      this.nudge = 60
    }
    return { x: ux * mag, y: uy * mag, horn: mag === 0 }
  }

  private blocked(state: GameState, x: number, y: number, ux: number, uy: number): boolean {
    for (const v of state.vehicles) {
      const b = vehicleBox(v)
      for (let d = 0.3; d <= 1.5; d += 0.3) {
        const px = x + ux * d
        const py = y + uy * d
        if (px > b.x0 - 0.3 && px < b.x1 + 0.3 && py > b.y0 - 0.3 && py < b.y1 + 0.3) return true
      }
    }
    return false
  }
}
