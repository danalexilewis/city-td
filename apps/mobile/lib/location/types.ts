import type {
  LatLng,
  ResourceAmounts,
  SpeedGateState,
} from '@city-td/game-core';

/** Latest GPS fix used by the location loop. */
export type PlayerPosition = LatLng & {
  accuracyM: number | null;
  /** Instantaneous device speed in m/s, when reported. */
  speedMps: number | null;
  atMs: number;
};

/** Wallet balances for the signed-in player. */
export type WalletBalances = ResourceAmounts;

/**
 * Public surface of `useLocationLoop` for map HUD and structures.
 * Structures should read `position` + `isGateLocked` before reach checks / taps.
 */
export type LocationLoopResult = {
  /** Foreground permission granted. */
  permissionGranted: boolean;
  permissionError: string | null;
  /** Latest player fix, or null until the first update. */
  position: PlayerPosition | null;
  /** Authoritative H3 r12 cell at the player (for heartbeat / presence). */
  cellR12: string | null;
  /** Parent H3 r7 cell. */
  cellR7: string | null;
  /** Median smoothed speed from the speed gate (km/h). */
  speedKmh: number | null;
  gateState: SpeedGateState;
  /** True when taps should be locked (gateState === 'locked'). */
  isGateLocked: boolean;
  wallet: WalletBalances | null;
  /** Re-fetch wallet after structure spends (sheet already updates its local copy). */
  refreshWallet: () => Promise<void>;
  /** Other players with recent presence in the same r7 parent. */
  playersNearby: number | null;
  /** Compact nearest-site stock label for the debug HUD. */
  nearestStockLabel: string | null;
  /** Last auto-collect outcome line (success or skip reason). */
  lastCollectNote: string | null;
};
