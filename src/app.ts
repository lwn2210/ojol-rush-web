import { Sfx } from './audio'
import { clockText, Hud, ratingText, rupiah } from './hud'
import { LocalInput } from './input'
import { drawMotor } from './render/sprites'
import { View, type Pose } from './render/view'
import { Autopilot } from './sim/autopilot'
import { BIKE_PROFILES, type BikeType, DT, HURRY_TICKS, SHIFT_TICKS, TICK_RATE } from './sim/constants'
import { createGame, rating, step, type GameState, type SimEvent } from './sim/game'

// Menu (an autopilot demo rides behind it) → shift → result. The sim runs
// at a fixed 60 Hz; the view draws between ticks with interpolation.

interface Session {
  state: GameState
  live: boolean
  bot: Autopilot | null
}

interface Best {
  earnings: number
  delivered: number
  rating: number
}

const BEST_KEY = 'ojol-rush.best'
const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T

function loadBest(): Best | null {
  try {
    const raw = localStorage.getItem(BEST_KEY)
    if (!raw) return null
    const b = JSON.parse(raw) as Best
    return typeof b.earnings === 'number' ? b : null
  } catch {
    return null
  }
}

function saveBest(b: Best): void {
  try {
    localStorage.setItem(BEST_KEY, JSON.stringify(b))
  } catch {
    // Private mode: the record just isn't kept.
  }
}

const newSeed = () => (Math.random() * 2 ** 32) >>> 0

export class App {
  private readonly canvas = $<HTMLCanvasElement>('scene')
  private readonly view = new View(this.canvas, $<HTMLCanvasElement>('minimap'))
  private readonly hud = new Hud()
  private readonly sfx = new Sfx()
  private readonly input = new LocalInput(this.canvas, $('stick'), $('knob'), $('btn-horn'))
  private session: Session
  private prev: Pose = { x: 0, y: 0, heading: 0 }
  private prevCars: Array<{ x: number; y: number }> = []
  private accumulator = 0
  private last = performance.now()
  private time = 0
  private paused = false
  private resultAt = 0
  private lastOrderSecond = -1
  private lastState: GameState | null = null
  private selectedBike: BikeType = 'matic'

  constructor() {
    this.session = this.demo()
    this.capture()
    window.addEventListener('resize', () => this.resize())
    this.resize()

    const picks = $('bike-picks')
    picks.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>('button')
      if (!btn) return
      this.selectedBike = (btn.dataset.bike as BikeType) || 'matic'
      picks.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === btn))
    })

    $('play').addEventListener('click', () => this.start())
    $('again').addEventListener('click', () => this.start())
    $('share-score').addEventListener('click', () => this.shareResult())
    $('to-menu').addEventListener('click', () => this.toMenu())
    $('resume').addEventListener('click', () => this.setPaused(false))
    $('quit').addEventListener('click', () => this.toMenu())
    $('pause').addEventListener('click', () => this.setPaused(true))
    const mute = $('mute')
    mute.textContent = this.sfx.muted ? '🔇' : '🔊'
    mute.addEventListener('click', () => (mute.textContent = this.sfx.toggleMute() ? '🔇' : '🔊'))
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return
      if (e.code === 'KeyM') mute.textContent = this.sfx.toggleMute() ? '🔇' : '🔊'
      if ((e.code === 'KeyP' || e.code === 'Escape') && this.session.live && this.session.state.phase === 'play') this.setPaused(!this.paused)
      if (e.code === 'Enter' && (!$('menu').hidden || !$('result').hidden)) this.start()
    })
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.session.live && this.session.state.phase === 'play') this.setPaused(true)
    })

    this.showBest()
    this.drawLogo()
    requestAnimationFrame(() => this.frame())
  }

  private demo(): Session {
    const state = createGame(newSeed())
    this.view.setMap(state.map)
    this.view.snap(state.player.x, state.player.y)
    return { state, live: false, bot: new Autopilot() }
  }

  private start(): void {
    const state = createGame(newSeed(), { bike: this.selectedBike })
    this.session = { state, live: true, bot: null }
    this.capture()
    this.view.setMap(state.map)
    this.view.snap(state.player.x, state.player.y)
    this.view.fx.particles = []
    this.view.fx.floaters = []
    this.input.clear()
    this.paused = false
    this.resultAt = 0
    this.accumulator = 0
    $('menu').hidden = true
    $('result').hidden = true
    $('paused').hidden = true
    $('pause').hidden = false
    this.hud.show()
    this.resize()
    this.hud.say('Siap narik!', 'Orderan pertama lagi dicariin…', 'good', 1.6)
  }

  private toMenu(): void {
    this.paused = false
    this.session = this.demo()
    this.capture()
    this.hud.hide()
    $('result').hidden = true
    $('paused').hidden = true
    $('pause').hidden = true
    $('menu').hidden = false
    this.showBest()
    this.resize()
  }

  private setPaused(on: boolean): void {
    if (!this.session.live || this.session.state.phase !== 'play') return
    this.paused = on
    this.input.clear()
    $('paused').hidden = !on
    this.last = performance.now()
  }

  private showBest(): void {
    const b = loadBest()
    $('menu-best').textContent = b ? `Rekor: ${rupiah(b.earnings)} · ${b.delivered} antaran · ★ ${ratingText(b.rating)}` : 'Belum ada rekor. Gas!'
  }

  private drawLogo(): void {
    const c = $<HTMLCanvasElement>('logo')
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#dff1e2'
    ctx.beginPath()
    ctx.arc(80, 80, 76, 0, Math.PI * 2)
    ctx.fill()
    ctx.setTransform(150, 0, 0, 150, 80, 86)
    ctx.rotate(-Math.PI / 2)
    drawMotor(ctx, 0, true, 0.4, false)
  }

  private resize(): void {
    this.view.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1)
    this.view.insets.top = this.hud.coveredTop()
    this.view.insets.bottom = 0
  }

  private capture(): void {
    const p = this.session.state.player
    this.prev = { x: p.x, y: p.y, heading: p.heading }
    this.prevCars = this.session.state.vehicles.map((v) => ({ x: v.x, y: v.y }))
  }

  private frame(): void {
    const now = performance.now()
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    this.time += dt
    const s = this.session

    if (!this.paused) {
      this.accumulator += dt
      while (this.accumulator >= DT) {
        this.capture()
        const input = s.bot ? s.bot.think(s.state) : this.input.read()
        const events = step(s.state, input)
        for (const e of events) this.handle(e)
        this.accumulator -= DT
      }
      // The demo starts a fresh shift when its clock runs out.
      if (!s.live && s.state.phase === 'over') {
        this.session = this.demo()
        this.capture()
      }
    }
    const alpha = this.paused ? 1 : this.accumulator / DT
    const state = this.session.state
    this.view.draw(state, this.prev, this.prevCars, alpha, this.time, this.paused ? 0 : dt, this.session.live)
    this.sfx.update(state, this.session.live && !this.paused)
    if (this.session.live) {
      this.hud.update(state, this.view.routeLeft(state), now)
      const o = state.order
      const sec = o && o.ticksLeft <= HURRY_TICKS ? Math.ceil(o.ticksLeft / TICK_RATE) : -1
      if (sec !== this.lastOrderSecond && sec > 0 && !this.paused) this.sfx.tick()
      this.lastOrderSecond = sec
      if (this.resultAt && now >= this.resultAt) {
        this.resultAt = 0
        this.showResult(state)
      }
    }
    requestAnimationFrame(() => this.frame())
  }

  private handle(e: SimEvent): void {
    const s = this.session
    const state = s.state
    const p = state.player
    const fx = this.view.fx
    // Visual bits show in the demo too; sounds and banners only in a real shift.
    switch (e.type) {
      case 'splash':
        fx.burst(e.x, e.y, 14, 'rgba(150, 200, 235, 0.9)', 3.2, 0.06, 0.45)
        break
      case 'bump':
        if (e.hard) fx.burst(e.x, e.y, 8, 'rgba(160, 140, 110, 0.7)', 1.6, 0.08, 0.5, 0.2)
        break
      case 'crash':
        fx.burst(e.x, e.y, 12, '#ffd23f', 3.5, 0.06, 0.5)
        fx.burst(e.x, e.y, 6, 'rgba(255,255,255,0.8)', 2, 0.1, 0.4)
        fx.float(e.x, e.y - 0.4, '💥 Aduh! -1 Bintang', '#ff3b2f', true)
        break
      case 'horn':
        fx.float(p.x, p.y - 0.45, '📢 TIN TIN!', '#ffe600')
        break
      case 'pickup':
        fx.float(p.x, p.y - 0.35, '📦 Ambil Pesanan! Antar sekarang!', '#f5b623', true)
        break
      case 'delivered': {
        fx.burst(p.x, p.y, 22, ['#f5b623', '#1f9a4b', '#f08a24', '#ffffff'][Math.floor(Math.random() * 4)]!, 4, 0.07, 0.8)
        const comments = ['Makasih Mas Ojol! ⭐️5', 'Cepat banget sampai!', 'Top markotop! +Tip', 'Pesanan selamat! Mantap!']
        fx.float(p.x, p.y - 0.45, comments[Math.floor(Math.random() * comments.length)]!, '#2fae55', true)
        break
      }
      default:
        break
    }
    if (!s.live) return
    const dist = 'x' in e ? Math.hypot(e.x - p.x, e.y - p.y) : 0
    this.sfx.event(e, dist)
    switch (e.type) {
      case 'orderNew': {
        const o = state.order!
        this.hud.say('Orderan masuk!', `Jemput di ${state.map.restos[o.resto]!.name}`, '', 1.8)
        break
      }
      case 'pickup': {
        const o = state.order!
        fx.float(p.x, p.y - 0.6, 'Pesanan diambil!', '#ffe2b8')
        this.hud.say('Gas antar!', `Ke ${state.map.homes[o.home]!.name}`, 'good', 1.5)
        break
      }
      case 'delivered': {
        const r = e.result
        const why = [r.crashes ? `nabrak ${r.crashes}×` : '', r.spills ? 'makanan goyang' : '', r.mepet ? 'mepet' : ''].filter(Boolean).join(' · ')
        fx.float(p.x, p.y - 0.6, `+${rupiah(r.fare + r.tip)}`, '#ffe066', true)
        this.hud.say(`Sampai! ${'★'.repeat(r.stars)}${'☆'.repeat(5 - r.stars)}`, why || (r.tip ? `Dikasih tip ${rupiah(r.tip)}!` : 'Mantap!'), r.stars >= 4 ? 'good' : '', 2)
        break
      }
      case 'cancelled':
        this.hud.say('Dicancel!', 'Kelamaan, pelanggan kasih bintang 1', 'bad', 2.2)
        break
      case 'crash':
        this.view.shake = 0.35
        fx.float(e.x, e.y - 0.5, e.counted ? 'Nabrak! −1★' : 'Nabrak!', '#ffb3a8')
        break
      case 'bump':
        if (e.spill) fx.float(p.x, p.y - 0.6, 'Makanan goyang!', '#ffcf8a')
        else if (e.hard) fx.float(p.x, p.y - 0.6, 'Jedug!', '#ffffff')
        break
      case 'honk':
        if (dist < 7) fx.float(e.x, e.y - 0.5, 'Tiiin!', '#ffffff')
        break
      case 'razia':
        this.hud.say('Kena razia!', 'Ditahan 4 detik. Lain kali muter lewat gang', 'bad', 2.4)
        break
      case 'released':
        this.hud.say('Lanjut!', 'Surat-surat aman', 'good', 1)
        break
      case 'shiftOver':
        $('pause').hidden = true
        this.hud.say(e.reason === 'waktu' ? 'Shift selesai!' : 'Akun dibekukan!', e.reason === 'waktu' ? 'Waktunya pulang' : 'Rating jatuh di bawah 3,5', e.reason === 'waktu' ? 'good' : 'bad', 2)
        this.resultAt = performance.now() + 1600
        break
      default:
        break
    }
  }

  private showResult(state: GameState): void {
    this.lastState = state
    const s = state.stats
    const r = rating(state)
    const frozen = state.endReason === 'rating'
    $('result-title').textContent = frozen ? 'Akun dibekukan!' : 'Shift beres!'
    $('result-sub').textContent = frozen
      ? 'Rating kamu jatuh di bawah 3,5. Istirahat dulu, besok narik lagi.'
      : s.delivered === 0
        ? 'Belum ada yang kelar. Coba lagi, ikutin garis rutenya.'
        : r >= 4.8
          ? 'Driver teladan! Pelanggan pada senyum.'
          : 'Lumayan buat bensin sama kopi.'
    $('result-earn').textContent = rupiah(s.earnings)
    $('r-delivered').textContent = String(s.delivered)
    $('r-rating').textContent = ratingText(r)
    $('r-perfect').textContent = String(s.perfect)
    $('r-cancelled').textContent = String(s.cancelled)
    $('r-crashes').textContent = String(s.crashes)
    $('r-razia').textContent = String(s.raziaHits)
    const best = loadBest()
    const record = s.earnings > 0 && (!best || s.earnings > best.earnings)
    if (record) saveBest({ earnings: s.earnings, delivered: s.delivered, rating: r })
    $('result-record').hidden = !record
    $('result-best').textContent = best
      ? `${record ? 'Rekor lama' : 'Rekor'}: ${rupiah(best.earnings)} · ${best.delivered} antaran`
      : frozen
        ? `Bertahan ${clockText(SHIFT_TICKS - Math.max(0, state.shiftLeft))} dari 3:00`
        : ''
    this.hud.hide()
    $('result').hidden = false
  }

  private shareResult(): void {
    const state = this.lastState
    if (!state) return
    const s = state.stats
    const r = rating(state)
    const bikeName = BIKE_PROFILES[state.opts.bike ?? 'matic'].name
    const text =
      `🛵 HASIL SHIFT DRIVER OJOL RUSH 🛵\n` +
      `🏍️ Kendaraan: ${bikeName}\n` +
      `💰 Total Pendapatan: ${rupiah(s.earnings)}\n` +
      `⭐ Rating Driver: ${ratingText(r)} / 5.0\n` +
      `📦 Orderan Selesai: ${s.delivered} antaran\n` +
      `🌟 Bintang 5 Sempurna: ${s.perfect}\n` +
      `💥 Nabrak: ${s.crashes}x · Kena Razia: ${s.raziaHits}x\n\n` +
      `Bisa lebih lincah tembus macet Jakarta? Mainkan gratis di:\n` +
      `👉 https://lwn2210.github.io/mini-arcade/ojol-rush/`

    const btn = $('share-score')
    if (navigator.share) {
      navigator.share({ title: 'Hasil Shift Ojol Rush!', text, url: 'https://lwn2210.github.io/mini-arcade/ojol-rush/' }).catch(() => {})
    } else {
      navigator.clipboard.writeText(text).then(() => {
        btn.textContent = '✓ Hasil Shift Disalin!'
        setTimeout(() => { btn.textContent = '📤 Pamer Hasil Shift (WhatsApp/Medsos)' }, 2000)
      }).catch(() => {
        window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank')
      })
    }
  }
}
