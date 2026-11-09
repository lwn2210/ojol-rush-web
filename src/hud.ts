import { HURRY_TICKS, TICK_RATE } from './sim/constants'
import { rating, type GameState } from './sim/game'
import { formatMeters } from './render/view'

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

export const rupiah = (n: number) => `Rp ${String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
export const ratingText = (r: number) => r.toFixed(2).replace('.', ',')
export const clockText = (ticks: number) => {
  const secs = Math.max(0, Math.ceil(ticks / TICK_RATE))
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

export class Hud {
  private readonly root = $('hud')
  private readonly earn = $('earn')
  private readonly clock = $('clock')
  private readonly rate = $('rating')
  private readonly order = $('order')
  private readonly chip = $('order-chip')
  private readonly name = $('order-name')
  private readonly info = $('order-info')
  private readonly time = $('order-time')
  private readonly bar = $('order-bar')
  private readonly banner = $('banner')
  private readonly bannerMain = $('banner-main')
  private readonly bannerSub = $('banner-sub')
  private bannerUntil = 0
  private readonly shown = new Map<HTMLElement, string>()

  get visible(): boolean {
    return !this.root.hidden
  }

  show(): void {
    this.root.hidden = false
  }

  hide(): void {
    this.root.hidden = true
    this.banner.classList.remove('show')
  }

  /** Bottom edge of the order card, so the camera can keep the rider below it. */
  coveredTop(): number {
    return this.root.hidden ? 0 : this.order.getBoundingClientRect().bottom
  }

  say(main: string, sub = '', tone: '' | 'good' | 'bad' = '', seconds = 1.8, now = performance.now()): void {
    this.bannerMain.textContent = main
    this.bannerSub.textContent = sub
    this.banner.classList.toggle('good', tone === 'good')
    this.banner.classList.toggle('bad', tone === 'bad')
    this.banner.classList.add('show')
    this.bannerUntil = now + seconds * 1000
  }

  private text(el: HTMLElement, value: string): void {
    if (this.shown.get(el) === value) return
    this.shown.set(el, value)
    el.textContent = value
  }

  update(state: GameState, routeTiles: number, now: number): void {
    if (now > this.bannerUntil) this.banner.classList.remove('show')
    const s = state.stats
    this.text(this.earn, rupiah(s.earnings))
    this.text(this.clock, clockText(state.shiftLeft))
    this.clock.classList.toggle('low', state.shiftLeft < 20 * TICK_RATE)
    const r = rating(state)
    this.text(this.rate, `★ ${ratingText(r)}`)
    this.rate.classList.toggle('bad', r < 4)

    const o = state.order
    const phase = o ? o.phase : 'cari'
    this.order.classList.toggle('jemput', phase === 'jemput')
    this.order.classList.toggle('antar', phase === 'antar')
    if (!o) {
      this.text(this.chip, 'Nyari')
      this.text(this.name, state.phase === 'over' ? 'Shift selesai' : 'Nyari orderan…')
      this.text(this.info, state.phase === 'over' ? 'Aplikasi dimatiin dulu' : 'Tunggu bentar, aplikasi lagi muter')
      this.text(this.time, '')
      this.bar.style.width = '0%'
      return
    }
    const resto = state.map.restos[o.resto]!
    const home = state.map.homes[o.home]!
    const dist = routeTiles >= 0 ? `${formatMeters(routeTiles)} lagi` : ''
    if (o.phase === 'jemput') {
      this.text(this.chip, 'Jemput')
      this.text(this.name, resto.name)
      this.text(this.info, `${dist} · ongkir ${rupiah(o.fare)}`)
    } else {
      this.text(this.chip, 'Antar')
      this.text(this.name, home.name)
      this.text(this.info, `${dist} · pesanan ${resto.name}`)
    }
    if (state.player.held > 0) this.text(this.info, `Ditahan razia… ${Math.ceil(state.player.held / TICK_RATE)} detik`)
    const hurry = o.ticksLeft <= HURRY_TICKS
    this.text(this.time, clockText(o.ticksLeft))
    this.time.classList.toggle('hurry', hurry)
    this.bar.classList.toggle('hurry', hurry)
    this.bar.style.width = `${(o.ticksLeft / o.totalTicks) * 100}%`
  }
}
