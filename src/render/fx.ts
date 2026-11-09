// Short-lived cosmetic bits in world space: splashes, dust, crash stars,
// exhaust puffs and floating "+Rp" texts. Never fed back into the sim.

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  max: number
  size: number
  color: string
  grow: number
}

interface Floater {
  x: number
  y: number
  text: string
  color: string
  life: number
  max: number
  big: boolean
}

export class Fx {
  particles: Particle[] = []
  floaters: Floater[] = []

  burst(x: number, y: number, n: number, color: string, speed: number, size: number, life: number, grow = 0): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const s = speed * (0.4 + Math.random() * 0.6)
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.4), max: life, size, color, grow })
    }
  }

  puff(x: number, y: number, vx: number, vy: number): void {
    this.particles.push({ x, y, vx, vy, life: 0.5, max: 0.5, size: 0.06, color: 'rgba(120,120,120,0.35)', grow: 0.25 })
  }

  float(x: number, y: number, text: string, color = '#ffffff', big = false): void {
    this.floaters.push({ x, y, text, color, life: big ? 1.8 : 1.2, max: big ? 1.8 : 1.2, big })
  }

  update(dt: number): void {
    for (const p of this.particles) {
      p.life -= dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.vx *= 1 - 3 * dt
      p.vy *= 1 - 3 * dt
      p.size += p.grow * dt
    }
    this.particles = this.particles.filter((p) => p.life > 0)
    for (const f of this.floaters) {
      f.life -= dt
      f.y -= dt * 0.7
    }
    this.floaters = this.floaters.filter((f) => f.life > 0)
  }

  /** World-space particles; the context is already in tile units. */
  drawParticles(ctx: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.max)
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
  }

  /** Screen-space texts, so they stay crisp; `toScreen` maps world to CSS pixels. */
  drawFloaters(ctx: CanvasRenderingContext2D, toScreen: (x: number, y: number) => [number, number]): void {
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.lineJoin = 'round'
    for (const f of this.floaters) {
      const [sx, sy] = toScreen(f.x, f.y)
      const k = f.life / f.max
      ctx.globalAlpha = Math.min(1, k * 2.5)
      const size = f.big ? 26 : 18
      ctx.font = `${size}px "Lilita One", system-ui, sans-serif`
      ctx.strokeStyle = 'rgba(40, 22, 10, 0.75)'
      ctx.lineWidth = 4
      ctx.strokeText(f.text, sx, sy)
      ctx.fillStyle = f.color
      ctx.fillText(f.text, sx, sy)
    }
    ctx.globalAlpha = 1
  }
}
