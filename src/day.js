// The day clock (no Phaser). t runs in game seconds; the scene only advances it while the kitchen is running.
import { DAY } from './data.js';

export class Day {
  constructor(number) {
    this.number = number;
    this.t = 0;
    this.speed = 1; // debug: QA can slow the clock down or speed it up
    this.phase = phaseAt(0);
  }

  get closing() {
    return this.t >= DAY.length;
  }

  // 0 (dark) .. 1 (full daylight). Design renders it.
  get daylight() {
    return daylightAt(this.t);
  }

  // Advances the clock. Returns the new phase id when it changes this frame, else null.
  update(dt) {
    this.t += dt * this.speed;
    const phase = phaseAt(this.t);
    if (phase === this.phase) return null;
    this.phase = phase;
    return phase;
  }
}

export function phaseAt(t) {
  if (t >= DAY.length) return 'closing';
  return DAY.phases.filter((p) => t >= p.start).at(-1).id;
}

export function daylightAt(t) {
  const keys = DAY.light;
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i];
    const [t0, v0] = keys[i - 1];
    if (t <= t1) return v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return keys.at(-1)[1];
}
