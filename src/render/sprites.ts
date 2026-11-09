import { VEHICLES, type VehicleKind } from '../sim/constants'

// Real cartoon sprite cache with smart fallback for tests and offline rendering
const spriteCache: Record<string, HTMLImageElement> = {}
function getSprite(key: string, url: string): HTMLImageElement | null {
  if (typeof Image === 'undefined') return null
  if (!spriteCache[key]) {
    const img = new Image()
    img.src = url
    spriteCache[key] = img
  }
  return spriteCache[key].complete && spriteCache[key].naturalWidth > 0 ? spriteCache[key] : null
}

// Top-down sprites drawn with paths, in tile units, facing +x. The caller
// translates and rotates the context first.

const CAR_COLORS = ['#f4f1ea', '#b9bec4', '#2b2e33', '#c23a2f', '#2f5d9a', '#7a8088', '#7b2b35', '#e1d3b0']
const ANGKOT_COLORS = ['#3fa7d6', '#d94a3a', '#3e9e5b', '#e58b2b', '#3fa7d6', '#d94a3a', '#9a63c4', '#e0c23a']
const UMBRELLA = [
  ['#e8453c', '#f6f0e2'],
  ['#2f8fd8', '#f7d23a'],
  ['#3ba55c', '#f6f0e2'],
  ['#f08a24', '#2f6fb5'],
]

function rrect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

function shadow(ctx: CanvasRenderingContext2D, l: number, w: number, r: number): void {
  ctx.fillStyle = 'rgba(30, 20, 12, 0.3)'
  rrect(ctx, -l / 2 + 0.07, -w / 2 + 0.09, l, w, r)
  ctx.fill()
}

export function drawVehicle(ctx: CanvasRenderingContext2D, kind: VehicleKind, color: number, t: number, braking: boolean): void {
  const { length: l, width: w } = VEHICLES[kind]
  if (kind === 'gerobak') return drawGerobak(ctx, color, t)
  shadow(ctx, l, w, 0.18)
  if (kind === 'bajaj') {
    const body = color % 2 ? '#2f6fb5' : '#e8742a'
    ctx.fillStyle = '#1d1d1f'
    ctx.fillRect(l / 2 - 0.2, -0.06, 0.16, 0.12)
    ctx.fillRect(-l / 2 + 0.1, -w / 2 - 0.02, 0.22, 0.1)
    ctx.fillRect(-l / 2 + 0.1, w / 2 - 0.08, 0.22, 0.1)
    ctx.fillStyle = body
    ctx.beginPath()
    ctx.moveTo(-l / 2, -w / 2 + 0.04)
    ctx.lineTo(l / 2 - 0.25, -w / 2 + 0.04)
    ctx.quadraticCurveTo(l / 2, -0.05, l / 2, 0)
    ctx.quadraticCurveTo(l / 2, 0.05, l / 2 - 0.25, w / 2 - 0.04)
    ctx.lineTo(-l / 2, w / 2 - 0.04)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#26282c'
    rrect(ctx, -l / 2 + 0.06, -w / 2 + 0.1, l * 0.62, w - 0.2, 0.08)
    ctx.fill()
    ctx.fillStyle = 'rgba(160, 200, 230, 0.8)'
    ctx.fillRect(l / 2 - 0.42, -w / 2 + 0.14, 0.1, w - 0.28)
    ctx.fillStyle = '#fff6c8'
    ctx.beginPath()
    ctx.arc(l / 2 - 0.05, 0, 0.05, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  const body = kind === 'angkot' ? ANGKOT_COLORS[color % ANGKOT_COLORS.length]! : CAR_COLORS[color % CAR_COLORS.length]!
  // Wheels peeking out.
  ctx.fillStyle = '#18181a'
  for (const sx of [-l / 2 + 0.25, l / 2 - 0.3]) for (const sy of [-w / 2 - 0.02, w / 2 - 0.08]) ctx.fillRect(sx, sy, 0.24, 0.1)
  ctx.fillStyle = body
  rrect(ctx, -l / 2, -w / 2, l, w, 0.16)
  ctx.fill()
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'
  ctx.lineWidth = 0.025
  ctx.stroke()
  if (kind === 'angkot') {
    const busSprite = getSprite('metromini', './assets/metromini_bus_facing_right.png')
    if (busSprite) {
      ctx.drawImage(busSprite, -l / 2, -w / 2, l, w)
      ctx.fillStyle = '#fff6c8'
      ctx.fillRect(l / 2 - 0.06, -w / 2 + 0.06, 0.05, 0.14)
      ctx.fillRect(l / 2 - 0.06, w / 2 - 0.2, 0.05, 0.14)
      ctx.fillStyle = braking ? '#ff3b2f' : '#9c2a22'
      ctx.fillRect(-l / 2 + 0.01, -w / 2 + 0.06, 0.05, 0.13)
      ctx.fillRect(-l / 2 + 0.01, w / 2 - 0.19, 0.05, 0.13)
      if (braking) {
        ctx.fillStyle = 'rgba(255, 60, 40, 0.25)'
        ctx.beginPath()
        ctx.arc(-l / 2, 0, 0.32, 0, Math.PI * 2)
        ctx.fill()
      }
      return
    }
    // Boxy minibus: windscreen, long roof with a stripe, sliding door gap.
    ctx.fillStyle = '#2b3440'
    rrect(ctx, l / 2 - 0.3, -w / 2 + 0.07, 0.2, w - 0.14, 0.05)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    rrect(ctx, -l / 2 + 0.08, -w / 2 + 0.1, l - 0.42, w - 0.2, 0.08)
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillRect(-l / 2 + 0.12, -0.04, l - 0.5, 0.08)
    ctx.fillStyle = '#1f2328'
    ctx.fillRect(-l / 2 + 0.02, -w / 2 + 0.12, 0.08, w - 0.24)
  } else {
    // Sedan: bonnet, glass, roof, rear glass.
    ctx.fillStyle = '#26303b'
    ctx.beginPath()
    ctx.moveTo(l * 0.22, -w / 2 + 0.08)
    ctx.lineTo(l * 0.34, -w / 2 + 0.12)
    ctx.lineTo(l * 0.34, w / 2 - 0.12)
    ctx.lineTo(l * 0.22, w / 2 - 0.08)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,0.14)'
    rrect(ctx, -l * 0.22, -w / 2 + 0.1, l * 0.42, w - 0.2, 0.08)
    ctx.fill()
    ctx.fillStyle = '#26303b'
    ctx.fillRect(-l * 0.33, -w / 2 + 0.12, 0.1, w - 0.24)
    ctx.fillStyle = body
    ctx.fillRect(l * 0.34 - 0.04, -w / 2 - 0.05, 0.05, 0.06)
    ctx.fillRect(l * 0.34 - 0.04, w / 2 - 0.01, 0.05, 0.06)
  }
  // Lights.
  ctx.fillStyle = '#fff6c8'
  ctx.fillRect(l / 2 - 0.06, -w / 2 + 0.06, 0.05, 0.14)
  ctx.fillRect(l / 2 - 0.06, w / 2 - 0.2, 0.05, 0.14)
  ctx.fillStyle = braking ? '#ff3b2f' : '#9c2a22'
  ctx.fillRect(-l / 2 + 0.01, -w / 2 + 0.06, 0.05, 0.13)
  ctx.fillRect(-l / 2 + 0.01, w / 2 - 0.19, 0.05, 0.13)
  if (braking) {
    ctx.fillStyle = 'rgba(255, 60, 40, 0.25)'
    ctx.beginPath()
    ctx.arc(-l / 2, 0, 0.32, 0, Math.PI * 2)
    ctx.fill()
  }
  void t
}

function drawGerobak(ctx: CanvasRenderingContext2D, color: number, t: number): void {
  const { length: l, width: w } = VEHICLES.gerobak
  shadow(ctx, l, w, 0.06)
  // Seller pushing from behind.
  ctx.fillStyle = '#3a6ea8'
  ctx.beginPath()
  ctx.ellipse(-l / 2 - 0.12, 0, 0.11, 0.16, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#3b2a20'
  ctx.beginPath()
  ctx.arc(-l / 2 - 0.1, 0, 0.08, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = '#6b4a2b'
  ctx.lineWidth = 0.04
  ctx.beginPath()
  ctx.moveTo(-l / 2 - 0.05, -0.16)
  ctx.lineTo(-l / 2 + 0.1, -0.16)
  ctx.moveTo(-l / 2 - 0.05, 0.16)
  ctx.lineTo(-l / 2 + 0.1, 0.16)
  ctx.stroke()
  // Wheels, wooden cart and glass case.
  ctx.fillStyle = '#2a2420'
  ctx.fillRect(-0.12, -w / 2 - 0.05, 0.26, 0.08)
  ctx.fillRect(-0.12, w / 2 - 0.03, 0.26, 0.08)
  ctx.fillStyle = '#a8743f'
  ctx.fillRect(-l / 2 + 0.08, -w / 2, l - 0.1, w)
  ctx.fillStyle = 'rgba(220, 240, 250, 0.75)'
  ctx.fillRect(-l / 2 + 0.16, -w / 2 + 0.08, l * 0.42, w - 0.16)
  // Umbrella seen from above, turning slowly.
  const [a, b] = UMBRELLA[color % UMBRELLA.length]!
  const rad = 0.44
  const cx = 0.1
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 ? b! : a!
    ctx.beginPath()
    ctx.moveTo(cx, 0)
    ctx.arc(cx, 0, rad, (i / 8) * Math.PI * 2 + t * 0.2, ((i + 1) / 8) * Math.PI * 2 + t * 0.2)
    ctx.closePath()
    ctx.fill()
  }
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(cx, 0, 0.04, 0, Math.PI * 2)
  ctx.fill()
}

/** The player: motor, rider in a plain green jacket and helmet, green delivery box. */
export function drawMotor(ctx: CanvasRenderingContext2D, lean: number, carrying: boolean, t: number, brake: boolean): void {
  const ojolSprite = getSprite('ojol', './assets/ojol_driver_facing_right.png')
  if (ojolSprite) {
    // Shadow under rider & scooter
    ctx.fillStyle = 'rgba(30, 20, 12, 0.35)'
    ctx.beginPath()
    ctx.ellipse(0.04, 0.08, 0.44, 0.18, 0, 0, Math.PI * 2)
    ctx.fill()

    // Headlight beam projecting ahead on the road
    const beam = ctx.createLinearGradient(0.33, 0, 1.4, 0)
    beam.addColorStop(0, 'rgba(255, 246, 200, 0.42)')
    beam.addColorStop(1, 'rgba(255, 246, 200, 0)')
    ctx.fillStyle = beam
    ctx.beginPath()
    ctx.moveTo(0.33, -0.04)
    ctx.lineTo(1.4, -0.35)
    ctx.lineTo(1.4, 0.35)
    ctx.lineTo(0.33, 0.04)
    ctx.closePath()
    ctx.fill()

    // Ojol rider sprite
    ctx.save()
    ctx.rotate(lean * 0.18)
    ctx.drawImage(ojolSprite, -0.48, -0.22, 0.96, 0.44)
    ctx.restore()

    if (brake) {
      ctx.fillStyle = '#ff3b2f'
      ctx.fillRect(-0.46, -0.04, 0.05, 0.08)
      ctx.fillStyle = 'rgba(255, 60, 40, 0.28)'
      ctx.beginPath()
      ctx.arc(-0.46, 0, 0.24, 0, Math.PI * 2)
      ctx.fill()
    }

    if (carrying) {
      // Warm food: a wisp of steam off the box.
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'
      ctx.lineWidth = 0.025
      ctx.beginPath()
      for (let i = 0; i < 2; i++) {
        const o = Math.sin(t * 6 + i * 2) * 0.03
        ctx.moveTo(-0.36 + i * 0.1, -0.05)
        ctx.quadraticCurveTo(-0.4 + i * 0.1 + o, -0.12, -0.36 + i * 0.1 - o, -0.2)
      }
      ctx.stroke()
    }
    return
  }

  ctx.fillStyle = 'rgba(30, 20, 12, 0.32)'
  ctx.beginPath()
  ctx.ellipse(0.06, 0.08, 0.42, 0.17, 0, 0, Math.PI * 2)
  ctx.fill()
  // Wheels.
  ctx.fillStyle = '#17171a'
  rrect(ctx, 0.2, -0.05, 0.2, 0.1, 0.05)
  ctx.fill()
  rrect(ctx, -0.42, -0.055, 0.2, 0.11, 0.05)
  ctx.fill()
  // Body.
  ctx.fillStyle = '#3a3d44'
  rrect(ctx, -0.3, -0.1, 0.6, 0.2, 0.08)
  ctx.fill()
  ctx.fillStyle = '#d23b31'
  rrect(ctx, 0.08, -0.09, 0.2, 0.18, 0.07)
  ctx.fill()
  // Headlight and handlebar.
  ctx.fillStyle = '#fff6c8'
  ctx.beginPath()
  ctx.arc(0.33, 0, 0.045, 0, Math.PI * 2)
  ctx.fill()

  // Headlight beam projecting ahead on the road
  const beam = ctx.createLinearGradient(0.33, 0, 1.4, 0)
  beam.addColorStop(0, 'rgba(255, 246, 200, 0.42)')
  beam.addColorStop(1, 'rgba(255, 246, 200, 0)')
  ctx.fillStyle = beam
  ctx.beginPath()
  ctx.moveTo(0.33, -0.04)
  ctx.lineTo(1.4, -0.35)
  ctx.lineTo(1.4, 0.35)
  ctx.lineTo(0.33, 0.04)
  ctx.closePath()
  ctx.fill()

  ctx.strokeStyle = '#1e1f22'
  ctx.lineWidth = 0.05
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(0.18, -0.2 + lean * 0.05)
  ctx.lineTo(0.18, 0.2 + lean * 0.05)
  ctx.stroke()
  ctx.lineCap = 'butt'
  if (brake) {
    ctx.fillStyle = '#ff3b2f'
    ctx.fillRect(-0.44, -0.04, 0.04, 0.08)
  }
  // Delivery box: plain green, no logo.
  ctx.fillStyle = '#1f7a3a'
  rrect(ctx, -0.47, -0.17, 0.27, 0.34, 0.04)
  ctx.fill()
  ctx.fillStyle = '#2fae55'
  rrect(ctx, -0.45, -0.15, 0.23, 0.3, 0.03)
  ctx.fill()
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'
  ctx.lineWidth = 0.02
  ctx.beginPath()
  ctx.moveTo(-0.45, 0)
  ctx.lineTo(-0.22, 0)
  ctx.stroke()
  if (carrying) {
    // Warm food: a wisp of steam off the box.
    ctx.strokeStyle = 'rgba(255,255,255,0.6)'
    ctx.lineWidth = 0.025
    ctx.beginPath()
    for (let i = 0; i < 2; i++) {
      const o = Math.sin(t * 6 + i * 2) * 0.03
      ctx.moveTo(-0.36 + i * 0.1, -0.05)
      ctx.quadraticCurveTo(-0.4 + i * 0.1 + o, -0.12, -0.36 + i * 0.1 - o, -0.2)
    }
    ctx.stroke()
  }
  // Rider: green jacket, arms to the bars, green helmet.
  ctx.save()
  ctx.rotate(lean * 0.25)
  ctx.fillStyle = '#25964a'
  ctx.beginPath()
  ctx.ellipse(-0.07, 0, 0.14, 0.17, 0, 0, Math.PI * 2)
  ctx.fill()
  // Reflective white safety stripe on back
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(-0.11, -0.15, 0.03, 0.3)
  ctx.strokeStyle = '#25964a'
  ctx.lineWidth = 0.07
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(-0.02, -0.13)
  ctx.lineTo(0.16, -0.17)
  ctx.moveTo(-0.02, 0.13)
  ctx.lineTo(0.16, 0.17)
  ctx.stroke()
  ctx.lineCap = 'butt'
  ctx.fillStyle = '#1c7a3b'
  ctx.beginPath()
  ctx.arc(-0.02, 0, 0.105, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#2a2d33'
  ctx.beginPath()
  ctx.arc(-0.02, 0, 0.105, -0.9, 0.9)
  ctx.lineTo(-0.02, 0)
  ctx.fill()
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.beginPath()
  ctx.arc(-0.05, -0.04, 0.035, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

/** Map pin standing on its tile (drawn upright on screen). */
export function drawPin(ctx: CanvasRenderingContext2D, kind: 'resto' | 'home', pulse: number): void {
  const color = kind === 'resto' ? '#f08a24' : '#1f9a4b'
  // Ground ring.
  ctx.strokeStyle = kind === 'resto' ? 'rgba(240, 138, 36, 0.8)' : 'rgba(31, 154, 75, 0.85)'
  ctx.lineWidth = 0.06
  ctx.beginPath()
  ctx.ellipse(0, 0, 0.35 + pulse * 0.45, (0.35 + pulse * 0.45) * 0.75, 0, 0, Math.PI * 2)
  ctx.globalAlpha = 1 - pulse
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.fillStyle = 'rgba(30,20,12,0.3)'
  ctx.beginPath()
  ctx.ellipse(0, 0, 0.16, 0.08, 0, 0, Math.PI * 2)
  ctx.fill()
  const bob = Math.sin(pulse * Math.PI * 2) * 0.04
  ctx.save()
  ctx.translate(0, -0.62 + bob)
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(0, 0, 0.33, Math.PI * 0.82, Math.PI * 0.18)
  ctx.lineTo(0, 0.6)
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#ffffff'
  ctx.lineWidth = 0.05
  ctx.stroke()
  ctx.fillStyle = '#ffffff'
  if (kind === 'resto') {
    // Bowl with chopsticks.
    ctx.beginPath()
    ctx.arc(0, -0.02, 0.17, 0, Math.PI)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 0.035
    ctx.beginPath()
    ctx.moveTo(-0.02, -0.04)
    ctx.lineTo(0.14, -0.2)
    ctx.moveTo(0.04, -0.04)
    ctx.lineTo(0.2, -0.17)
    ctx.stroke()
  } else {
    ctx.beginPath()
    ctx.moveTo(0, -0.18)
    ctx.lineTo(0.17, -0.02)
    ctx.lineTo(0.12, -0.02)
    ctx.lineTo(0.12, 0.14)
    ctx.lineTo(-0.12, 0.14)
    ctx.lineTo(-0.12, -0.02)
    ctx.lineTo(-0.17, -0.02)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = color
    ctx.fillRect(-0.035, 0.03, 0.07, 0.11)
  }
  ctx.restore()
}

/** A small food-stall marker for restaurants that aren't the current target. */
export function drawRestoDot(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = 'rgba(240, 138, 36, 0.9)'
  ctx.beginPath()
  ctx.arc(0, 0, 0.13, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.beginPath()
  ctx.arc(0, 0.005, 0.07, 0, Math.PI)
  ctx.fill()
}

/** Razia across a 2×2 stretch of road: cones, sign, officer, flashing light. */
export function drawRazia(ctx: CanvasRenderingContext2D, w: number, h: number, horizontal: boolean, t: number): void {
  const flash = Math.floor(t * 4) % 2 === 0
  ctx.fillStyle = flash ? 'rgba(255, 50, 40, 0.16)' : 'rgba(40, 90, 255, 0.16)'
  ctx.fillRect(-0.1, -0.1, w + 0.2, h + 0.2)
  const cone = (x: number, y: number) => {
    ctx.fillStyle = 'rgba(30,20,12,0.3)'
    ctx.beginPath()
    ctx.arc(x + 0.04, y + 0.05, 0.12, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#f26b1d'
    ctx.beginPath()
    ctx.arc(x, y, 0.12, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 0.035
    ctx.beginPath()
    ctx.arc(x, y, 0.07, 0, Math.PI * 2)
    ctx.stroke()
    ctx.fillStyle = '#f26b1d'
    ctx.beginPath()
    ctx.arc(x, y, 0.035, 0, Math.PI * 2)
    ctx.fill()
  }
  // Cones across the road on both edges of the stretch.
  for (let i = 0; i < 4; i++) {
    const o = 0.25 + i * 0.5
    if (horizontal) {
      cone(0.15, o)
      cone(w - 0.15, o)
    } else {
      cone(o, 0.15)
      cone(o, h - 0.15)
    }
  }
  // Sign board.
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.fillStyle = 'rgba(30,20,12,0.3)'
  ctx.fillRect(-0.42 + 0.05, -0.18 + 0.07, 0.84, 0.36)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(-0.42, -0.18, 0.84, 0.36)
  ctx.strokeStyle = '#d6271f'
  ctx.lineWidth = 0.06
  ctx.strokeRect(-0.39, -0.15, 0.78, 0.3)
  // Tiny font sizes misbehave in some engines, so scale down a 20px one instead.
  ctx.scale(0.01, 0.01)
  ctx.fillStyle = '#d6271f'
  ctx.font = '800 20px Nunito, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('RAZIA', 0, 1)
  ctx.restore()
  // Officer and patrol bike.
  const ox = horizontal ? w / 2 + 0.55 : w / 2 - 0.5
  const oy = horizontal ? h / 2 + 0.55 : h / 2 + 0.6
  ctx.fillStyle = 'rgba(30,20,12,0.3)'
  ctx.beginPath()
  ctx.arc(ox + 0.05, oy + 0.06, 0.17, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#8a6d45'
  ctx.beginPath()
  ctx.ellipse(ox, oy, 0.13, 0.17, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#f4f4f0'
  ctx.beginPath()
  ctx.arc(ox, oy, 0.1, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = '#e8f13a'
  ctx.fillRect(ox - 0.13, oy - 0.03, 0.26, 0.06)
  const bx = horizontal ? w / 2 - 0.6 : w / 2 + 0.6
  const by = horizontal ? h / 2 - 0.6 : h / 2 - 0.55
  ctx.fillStyle = '#f4f4f0'
  rrect(ctx, bx - 0.3, by - 0.1, 0.6, 0.2, 0.08)
  ctx.fill()
  ctx.fillStyle = flash ? '#ff3b2f' : '#2f6bff'
  ctx.beginPath()
  ctx.arc(bx - 0.12, by, 0.07, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = flash ? 'rgba(255,59,47,0.35)' : 'rgba(47,107,255,0.35)'
  ctx.beginPath()
  ctx.arc(bx - 0.12, by, 0.26, 0, Math.PI * 2)
  ctx.fill()
}
