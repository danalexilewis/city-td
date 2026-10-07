import type { StructureType } from '@city-td/game-core';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type {
  CareAction,
  StructureRow,
  WalletRow,
} from '@/lib/structures/types';

function asStructureRow(data: unknown): StructureRow {
  return data as StructureRow;
}

function rpcErrorMessage(error: { message: string } | null): string {
  return error?.message ?? 'Unknown error';
}

/**
 * Load structures whose `cell_r7` is in the given parent set.
 */
export async function fetchStructuresByR7(args: {
  cellR7Ids: readonly string[];
}): Promise<{ structures: StructureRow[]; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { structures: [], error: null };
  }
  if (args.cellR7Ids.length === 0) {
    return { structures: [], error: null };
  }

  const { data, error } = await supabase
    .from('structures')
    .select(
      'id, cell_r12, cell_r7, type, owner_id, health, max_health, ammo, boosted_until, last_cared_at, zeroed_at, created_at, updated_at',
    )
    .in('cell_r7', [...args.cellR7Ids]);

  if (error) {
    return { structures: [], error: error.message };
  }

  return { structures: (data ?? []) as StructureRow[], error: null };
}

/** Fetch the signed-in player's wallet, or null when unauthenticated / missing. */
export async function fetchOwnWallet(): Promise<{
  wallet: WalletRow | null;
  error: string | null;
}> {
  if (!isSupabaseConfigured) {
    return { wallet: null, error: null };
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { wallet: null, error: userError?.message ?? null };
  }

  const { data, error } = await supabase
    .from('wallets')
    .select('user_id, materials, ammo, power')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) {
    return { wallet: null, error: error.message };
  }

  return { wallet: (data as WalletRow | null) ?? null, error: null };
}

/** True when the cell is listed in `plot_cells` (any site). */
export async function isPlotCell(args: {
  cellR12: string;
}): Promise<{ isPlot: boolean; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { isPlot: false, error: null };
  }

  const { data, error } = await supabase
    .from('plot_cells')
    .select('cell_r12')
    .eq('cell_r12', args.cellR12)
    .limit(1)
    .maybeSingle();

  if (error) {
    return { isPlot: false, error: error.message };
  }

  return { isPlot: Boolean(data), error: null };
}

export async function placeStructure(args: {
  cellR12: string;
  type: StructureType;
  lng: number;
  lat: number;
}): Promise<{ structure: StructureRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc('place_structure', {
    p_cell_r12: args.cellR12,
    p_type: args.type,
    p_lng: args.lng,
    p_lat: args.lat,
  });

  if (error) {
    return { structure: null, error: rpcErrorMessage(error) };
  }

  return { structure: asStructureRow(data), error: null };
}

export async function careStructure(args: {
  structureId: string;
  action: CareAction;
  lng: number;
  lat: number;
  repairHp?: number;
}): Promise<{ structure: StructureRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc('care_structure', {
    p_structure_id: args.structureId,
    p_action: args.action,
    p_lng: args.lng,
    p_lat: args.lat,
    p_repair_hp: args.repairHp ?? null,
  });

  if (error) {
    return { structure: null, error: rpcErrorMessage(error) };
  }

  return { structure: asStructureRow(data), error: null };
}

export async function rebuildRubble(args: {
  structureId: string;
  lng: number;
  lat: number;
}): Promise<{ structure: StructureRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc('rebuild_rubble', {
    p_structure_id: args.structureId,
    p_lng: args.lng,
    p_lat: args.lat,
  });

  if (error) {
    return { structure: null, error: rpcErrorMessage(error) };
  }

  return { structure: asStructureRow(data), error: null };
}

export async function removeStructure(args: {
  structureId: string;
  lng: number;
  lat: number;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('remove_structure', {
    p_structure_id: args.structureId,
    p_lng: args.lng,
    p_lat: args.lat,
  });

  return { error: error ? rpcErrorMessage(error) : null };
}

/** Team-only debug damage RPC. */
export async function debugDamage(args: {
  structureId: string;
  damage: number;
}): Promise<{ structure: StructureRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc('debug_damage', {
    p_structure_id: args.structureId,
    p_damage: args.damage,
  });

  if (error) {
    return { structure: null, error: rpcErrorMessage(error) };
  }

  return { structure: asStructureRow(data), error: null };
}
