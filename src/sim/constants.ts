// Every tunable of the sim in one place. Distances are in tiles, times in
// seconds unless the name says ticks.

export const TICK_RATE = 60
export const DT = 1 / TICK_RATE

// City grid: 2-tile main roads every PERIOD tiles, 9×9 blocks of houses in
// between, cut by 1-tile gangs.
export const ROAD = 2
export const BLOCK = 9
export const PERIOD = BLOCK + ROAD
export const BLOCKS = 4
export const MAP_SIZE = PERIOD * BLOCKS + ROAD

// Shift and rating.
export const SHIFT_TICKS = 180 * TICK_RATE
export const RATING_PRIOR = 3 // a fresh account counts as this many 5-star trips
export const RATING_FLOOR = 3.5 // average below this ends the shift
export const NEXT_ORDER_TICKS = Math.round(1.6 * TICK_RATE)
export const HURRY_TICKS = 8 * TICK_RATE

// Orders.
export const PIN_RADIUS = 0.9
export const PIN_SPEED = 2.6 // must be slower than this at the pin
export const DWELL_TICKS = 18
export const ORDER_REF_SPEED = 3.4 // tiles/s the timer assumes
export const ORDER_SLACK = 14 // seconds added on top
export const ORDER_MIN_TRIP = 14
export const ORDER_MAX_TRIP = 34
export const FARE_BASE = 5000
export const FARE_PER_TILE = 350
export const MEPET = 0.2 // less than this share of time left = mepet, −1 star

// Motor.
export type BikeType = 'matic' | 'bebek' | 'maxi'
export const BIKE_PROFILES: Record<BikeType, { name: string; maxSpeed: number; accel: number; turnRate: number; waterFactor: number; tipBonus: number }> = {
  matic: { name: 'Matic Gesit', maxSpeed: 7.5, accel: 8.5, turnRate: 6.5, waterFactor: 0.45, tipBonus: 0 },
  bebek: { name: 'Bebek Badak', maxSpeed: 7.0, accel: 7.5, turnRate: 5.8, waterFactor: 0.80, tipBonus: 0 },
  maxi: { name: 'Maxi 155cc', maxSpeed: 8.6, accel: 9.5, turnRate: 5.2, waterFactor: 0.40, tipBonus: 1000 },
}

export const RIDER_R = 0.26
export const MAX_SPEED = 7.5
export const ACCEL = 8.5
export const BRAKE = 15
export const COAST = 6
export const TURN_RATE = 6.5
export const WATER_FACTOR = 0.45
export const BUMP_SAFE = 3.4
export const WALL_CRASH = 5.2
export const CRASH_IMPACT = 2.2
export const STUN_TICKS = 28
export const CRASH_COOLDOWN = 60

// Razia.
export const RAZIA_COUNT = 3
export const RAZIA_HOLD = 4 * TICK_RATE
export const RAZIA_IMMUNE = 3 * TICK_RATE
export const RAZIA_MIN = 32 * TICK_RATE
export const RAZIA_MAX = 48 * TICK_RATE

// Traffic. Left-hand traffic, one lane each way on the 2-tile roads.
export type VehicleKind = 'mobil' | 'angkot' | 'bajaj' | 'gerobak'
export const VEHICLES: Record<VehicleKind, { count: number; length: number; width: number; speed: [number, number] }> = {
  mobil: { count: 16, length: 1.45, width: 0.78, speed: [4.4, 5.6] },
  angkot: { count: 6, length: 1.6, width: 0.8, speed: [4, 4.6] },
  bajaj: { count: 4, length: 1.05, width: 0.68, speed: [3.4, 3.9] },
  gerobak: { count: 4, length: 0.95, width: 0.6, speed: [1.1, 1.4] },
}
export const CAR_ACCEL = 4
export const CAR_BRAKE = 12
export const CAR_GAP = 0.45
