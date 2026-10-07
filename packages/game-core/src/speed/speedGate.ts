import { BALANCE, type BalanceConfig } from "../balance/config.js";
import type { SpeedGateState, SpeedSample } from "../types.js";

export type SpeedGateOptions = {
  balance?: BalanceConfig;
  /** Initial gate state (defaults to open). */
  initialState?: SpeedGateState;
};

/**
 * Median speed over a sliding ~5 s window with hysteresis:
 * locks around 10 km/h, unlocks around 8 km/h.
 */
export function createSpeedGate(options: SpeedGateOptions = {}) {
  const balance = options.balance ?? BALANCE;
  const { lockKmh, unlockKmh, windowMs } = balance.speedGate;
  let state: SpeedGateState = options.initialState ?? "open";
  let samples: SpeedSample[] = [];

  function prune(nowMs: number): void {
    const cutoff = nowMs - windowMs;
    samples = samples.filter((sample) => sample.atMs >= cutoff);
  }

  function medianSpeedKmh(): number | null {
    if (samples.length === 0) {
      return null;
    }
    const speeds = samples.map((sample) => sample.speedKmh).sort((a, b) => a - b);
    const mid = Math.floor(speeds.length / 2);
    if (speeds.length % 2 === 1) {
      return speeds[mid]!;
    }
    return (speeds[mid - 1]! + speeds[mid]!) / 2;
  }

  function pushSample(sample: SpeedSample): SpeedGateState {
    prune(sample.atMs);
    samples.push(sample);
    const median = medianSpeedKmh();
    if (median === null) {
      return state;
    }
    if (state === "open" && median >= lockKmh) {
      state = "locked";
    } else if (state === "locked" && median <= unlockKmh) {
      state = "open";
    }
    return state;
  }

  function getState(): SpeedGateState {
    return state;
  }

  function getMedianSpeedKmh(): number | null {
    return medianSpeedKmh();
  }

  function reset(nextState: SpeedGateState = "open"): void {
    samples = [];
    state = nextState;
  }

  return {
    pushSample,
    getState,
    getMedianSpeedKmh,
    reset,
  };
}

export type SpeedGate = ReturnType<typeof createSpeedGate>;
