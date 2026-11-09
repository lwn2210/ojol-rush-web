import { MAX_SPEED } from './sim/constants'
import type { GameState, SimEvent } from './sim/game'

// Every sound is synthesised with Web Audio, so there are no files to ship.
// It only listens to the sim (state and events) and never feeds back into it.
// The context starts on the first tap or key press (iOS and Safari refuse to
// play before one). Note: on iPhone, the silent switch also mutes Web Audio.

const MUTE_KEY = 'ojol-rush.mute'

export class Sfx {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private noise: AudioBuffer | null = null
  private engine: { osc: OscillatorNode; sub: OscillatorNode; filter: BiquadFilterNode; gain: GainNode; lfo: OscillatorNode; lfoGain: GainNode } | null = null
  muted = false

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1'
    } catch {
      this.muted = false
    }
    const unlock = () => this.unlock()
    window.addEventListener('pointerdown', unlock)
    window.addEventListener('keydown', unlock)
    window.addEventListener('touchend', unlock)
  }

  private unlock(): void {
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return
      const ctx = new Ctor()
      this.ctx = ctx
      this.master = ctx.createGain()
      this.master.gain.value = this.muted ? 0 : 0.8
      this.master.connect(ctx.destination)
      const length = ctx.sampleRate
      this.noise = ctx.createBuffer(1, length, ctx.sampleRate)
      const data = this.noise.getChannelData(0)
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1
      this.engine = this.makeEngine(ctx)
    }
    if (this.ctx.state !== 'running') void this.ctx.resume()
  }

  /** Two detuned saws through a low-pass, amplitude-pulsed like a single cylinder. */
  private makeEngine(ctx: AudioContext) {
    const osc = ctx.createOscillator()
    osc.type = 'sawtooth'
    osc.frequency.value = 48
    const sub = ctx.createOscillator()
    sub.type = 'square'
    sub.frequency.value = 24
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 500
    filter.Q.value = 3
    const gain = ctx.createGain()
    gain.gain.value = 0
    const pulse = ctx.createGain()
    pulse.gain.value = 0.6
    const lfo = ctx.createOscillator()
    lfo.type = 'square'
    lfo.frequency.value = 12
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.4
    lfo.connect(lfoGain).connect(pulse.gain)
    const subGain = ctx.createGain()
    subGain.gain.value = 0.5
    osc.connect(filter)
    sub.connect(subGain).connect(filter)
    filter.connect(pulse).connect(gain).connect(this.master!)
    osc.start()
    sub.start()
    lfo.start()
    return { osc, sub, filter, gain, lfo, lfoGain }
  }

  toggleMute(): boolean {
    this.muted = !this.muted
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? '1' : '0')
    } catch {
      // Not remembered; fine.
    }
    if (this.ctx && this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.8, this.ctx.currentTime, 0.05)
    return this.muted
  }

  private ready(): AudioContext | null {
    return this.ctx && this.ctx.state === 'running' && this.master ? this.ctx : null
  }

  private tone(type: OscillatorType, from: number, to: number, start: number, length: number, volume: number, vibrato = 0): void {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(from, start)
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + length)
    if (vibrato) {
      const lfo = ctx.createOscillator()
      const depth = ctx.createGain()
      lfo.frequency.value = vibrato
      depth.gain.value = from * 0.06
      lfo.connect(depth).connect(osc.frequency)
      lfo.start(start)
      lfo.stop(start + length + 0.02)
    }
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01)
    gain.gain.setValueAtTime(volume, start + Math.max(0.01, length * 0.6))
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
    osc.connect(gain).connect(this.master!)
    osc.start(start)
    osc.stop(start + length + 0.02)
  }

  private hiss(type: BiquadFilterType, from: number, to: number, start: number, length: number, volume: number): void {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const bq = ctx.createBiquadFilter()
    bq.type = type
    bq.frequency.setValueAtTime(from, start)
    bq.frequency.exponentialRampToValueAtTime(to, start + length)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(volume, start)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
    src.connect(bq).connect(gain).connect(this.master!)
    src.start(start, Math.random() * 0.5)
    src.stop(start + length + 0.02)
  }

  /** Horn: two notes at once through a cheap speaker, "tin tin" or one long "teeet". */
  private horn(start: number, f1: number, f2: number, length: number, volume: number): void {
    const ctx = this.ctx!
    const filter = ctx.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.value = 1800
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01)
    gain.gain.setValueAtTime(volume, start + length - 0.03)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length)
    filter.connect(gain).connect(this.master!)
    for (const f of [f1, f2]) {
      const osc = ctx.createOscillator()
      osc.type = 'square'
      osc.frequency.value = f
      osc.connect(filter)
      osc.start(start)
      osc.stop(start + length + 0.02)
    }
  }

  /** Engine follows speed; silent outside a live shift. */
  update(state: GameState | null, live: boolean): void {
    const ctx = this.ready()
    if (!ctx || !this.engine) return
    const t = ctx.currentTime
    const p = state?.player
    const on = live && state?.phase === 'play' && p !== undefined
    const v = on ? Math.min(1, p.speed / MAX_SPEED) : 0
    this.engine.gain.gain.setTargetAtTime(on ? 0.05 + v * 0.05 : 0, t, 0.08)
    this.engine.osc.frequency.setTargetAtTime(46 + v * 70, t, 0.1)
    this.engine.sub.frequency.setTargetAtTime(23 + v * 35, t, 0.1)
    this.engine.lfo.frequency.setTargetAtTime(11 + v * 26, t, 0.1)
    this.engine.filter.frequency.setTargetAtTime(380 + v * 900, t, 0.1)
  }

  /** `dist`: tiles from the player, for sounds that happen elsewhere (car horns). */
  event(e: SimEvent, dist = 0): void {
    const ctx = this.ready()
    if (!ctx) return
    const t = ctx.currentTime
    switch (e.type) {
      case 'orderNew':
        this.tone('sine', 1320, 1320, t, 0.09, 0.16)
        this.tone('sine', 1760, 1760, t + 0.11, 0.16, 0.16)
        break
      case 'pickup':
        this.hiss('highpass', 3000, 5000, t, 0.12, 0.08)
        this.tone('triangle', 660, 660, t + 0.02, 0.1, 0.18)
        this.tone('triangle', 990, 990, t + 0.12, 0.2, 0.18)
        break
      case 'delivered': {
        const notes = [523, 659, 784, 1047]
        notes.forEach((f, i) => this.tone('triangle', f, f, t + i * 0.08, i === 3 ? 0.35 : 0.1, 0.16))
        // Coins.
        for (let i = 0; i < (e.result.stars === 5 ? 3 : 1); i++) {
          this.tone('square', 1976, 1976, t + 0.35 + i * 0.09, 0.05, 0.05)
          this.tone('square', 2637, 2637, t + 0.4 + i * 0.09, 0.12, 0.05)
        }
        break
      }
      case 'cancelled':
        ;[392, 349, 311, 262].forEach((f, i) => this.tone('triangle', f, f * 0.98, t + i * 0.16, i === 3 ? 0.5 : 0.15, 0.15))
        break
      case 'hurry':
        this.tone('square', 880, 880, t, 0.08, 0.06)
        this.tone('square', 880, 880, t + 0.15, 0.08, 0.06)
        break
      case 'crash':
        this.tone('sine', 140, 45, t, 0.3, 0.4)
        this.hiss('lowpass', 2400, 300, t, 0.35, 0.3)
        this.tone('square', 320, 160, t + 0.02, 0.12, 0.06)
        this.tone('square', 455, 240, t + 0.04, 0.1, 0.05)
        break
      case 'splash':
        this.hiss('bandpass', 1800, 350, t, 0.45, 0.3)
        this.hiss('highpass', 4000, 2500, t + 0.05, 0.25, 0.08)
        break
      case 'bump':
        this.tone('sine', e.hard ? 110 : 90, 45, t, e.hard ? 0.22 : 0.14, e.hard ? 0.4 : 0.18)
        this.tone('sine', e.hard ? 110 : 90, 45, t + 0.11, 0.14, e.hard ? 0.25 : 0.1)
        if (e.spill) this.hiss('bandpass', 1200, 800, t + 0.05, 0.15, 0.12)
        break
      case 'razia':
        // Priiit! Police whistle, twice.
        this.tone('sine', 2900, 2850, t, 0.35, 0.12, 32)
        this.tone('sine', 2900, 2850, t + 0.45, 0.6, 0.12, 32)
        break
      case 'released':
        this.tone('sine', 2700, 2650, t, 0.18, 0.08, 30)
        break
      case 'horn':
        this.horn(t, 415, 523, 0.12, 0.12)
        this.horn(t + 0.17, 415, 523, 0.14, 0.12)
        break
      case 'honk': {
        const vol = 0.13 * Math.max(0.15, 1 - dist / 9)
        this.horn(t, 311, 392, 0.32, vol)
        break
      }
      case 'shiftOver': {
        const notes = e.reason === 'waktu' ? [523, 659, 784, 659, 1047] : [392, 370, 349, 330, 262]
        notes.forEach((f, i) => this.tone('triangle', f, f, t + i * 0.14, i === notes.length - 1 ? 0.6 : 0.13, 0.15))
        break
      }
      default:
        break
    }
  }

  /** Clock ticks in the last seconds of an order. */
  tick(): void {
    const ctx = this.ready()
    if (!ctx) return
    this.tone('square', 1200, 1200, ctx.currentTime, 0.04, 0.035)
  }
}
