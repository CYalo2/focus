// Tiny seeded PRNG (mulberry32)
export class SeededRandom {
  constructor(seed) {
    this.state = seed >>> 0;
  }

  // Same contract as Math.random(): a float in [0, 1).
  next() {
    this.state |= 0;
    this.state = (this.state + 0x6D2B79F5) | 0;
    let t = Math.imul(this.state ^ (this.state >>> 15), 1 | this.state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
}