import type { Input } from './sim/game'

// Keyboard (WASD / arrows, Space = klakson) and a floating joystick: put a
// thumb (or the mouse) down anywhere on the street and drag towards where you
// want to ride. Folded into the sim's Input every tick.

const RADIUS = 56

/** Keeps the drag ours even when the finger slides over the HUD. Can throw for a pointer that's already gone. */
function capture(el: HTMLElement, id: number): void {
  try {
    el.setPointerCapture(id)
  } catch {
    // Fine without capture.
  }
}

export class LocalInput {
  private keys = new Set<string>()
  private stickId: number | null = null
  private origin = { x: 0, y: 0 }
  private stick = { x: 0, y: 0 }
  private hornHeld = false
  private readonly base: HTMLElement
  private readonly knob: HTMLElement

  constructor(surface: HTMLElement, base: HTMLElement, knob: HTMLElement, horn: HTMLElement) {
    this.base = base
    this.knob = knob
    window.addEventListener('keydown', (e) => {
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault()
      this.keys.add(e.code)
    })
    window.addEventListener('keyup', (e) => this.keys.delete(e.code))
    window.addEventListener('blur', () => this.clear())

    surface.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return
      e.preventDefault()
      capture(surface, e.pointerId)
      this.stickId = e.pointerId
      this.origin = { x: e.clientX, y: e.clientY }
      this.stick = { x: 0, y: 0 }
      this.base.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`
      this.knob.style.transform = 'translate(0px, 0px)'
      this.base.hidden = false
    })
    surface.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return
      let dx = e.clientX - this.origin.x
      let dy = e.clientY - this.origin.y
      const d = Math.hypot(dx, dy)
      if (d > RADIUS) {
        // Drag past the rim and the base follows the thumb.
        this.origin.x += (dx / d) * (d - RADIUS)
        this.origin.y += (dy / d) * (d - RADIUS)
        dx = (dx / d) * RADIUS
        dy = (dy / d) * RADIUS
        this.base.style.transform = `translate(${this.origin.x}px, ${this.origin.y}px)`
      }
      this.stick = { x: dx / RADIUS, y: dy / RADIUS }
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`
    })
    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return
      this.stickId = null
      this.stick = { x: 0, y: 0 }
      this.base.hidden = true
    }
    surface.addEventListener('pointerup', release)
    surface.addEventListener('pointercancel', release)

    horn.addEventListener('pointerdown', (e) => {
      e.preventDefault()
      capture(horn, e.pointerId)
      horn.classList.add('held')
      this.hornHeld = true
    })
    const up = () => {
      horn.classList.remove('held')
      this.hornHeld = false
    }
    horn.addEventListener('pointerup', up)
    horn.addEventListener('pointercancel', up)
  }

  clear(): void {
    this.keys.clear()
    this.stickId = null
    this.stick = { x: 0, y: 0 }
    this.hornHeld = false
    this.base.hidden = true
  }

  read(): Input {
    const k = this.keys
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0)
    let y = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0)
    if (x !== 0 || y !== 0) {
      const l = Math.hypot(x, y)
      x /= l
      y /= l
    } else {
      x = this.stick.x
      y = this.stick.y
    }
    return { x, y, horn: this.hornHeld || k.has('Space') || k.has('KeyH') }
  }
}
