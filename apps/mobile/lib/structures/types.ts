import type { StructureType } from '@city-td/game-core';

/** Care actions accepted by `care_structure`. */
export type CareAction = 'repair' | 'load' | 'boost';

/** Row shape from public.structures. */
export type StructureRow = {
  id: string;
  cell_r12: string;
  cell_r7: string;
  type: StructureType;
  owner_id: string;
  health: number;
  max_health: number;
  ammo: number;
  boosted_until: string | null;
  last_cared_at: string;
  zeroed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** Own wallet balances for cost checks in the sheet. */
export type WalletRow = {
  user_id: string;
  materials: number;
  ammo: number;
  power: number;
};

/** Player pose used for reach checks (location-loop may own the source). */
export type PlayerPose = {
  lat: number;
  lng: number;
  /** When true, taps/actions other than view should stay locked. */
  gateLocked: boolean;
};
