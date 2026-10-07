import type { ResourceAmounts } from '@city-td/game-core';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type CollectRpcResult = {
  taken: ResourceAmounts;
  wallet: ResourceAmounts;
};

export type DebugTrackPoint = {
  lng: number;
  lat: number;
  accuracy_m?: number | null;
  speed_mps?: number | null;
  recorded_at?: string;
};

type CollectRow = {
  materials: number;
  ammo: number;
  power: number;
  wallet_materials: number;
  wallet_ammo: number;
  wallet_power: number;
};

type WalletRow = {
  materials: number;
  ammo: number;
  power: number;
};

type StockRow = {
  materials: number;
  ammo: number;
  power: number;
};

function toAmounts(row: {
  materials: number;
  ammo: number;
  power: number;
}): ResourceAmounts {
  return {
    materials: Number(row.materials),
    ammo: Number(row.ammo),
    power: Number(row.power),
  };
}

/** Load the signed-in player's wallet, or null when unconfigured / missing. */
export async function fetchWallet(): Promise<ResourceAmounts | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return null;
  }

  const { data, error } = await supabase
    .from('wallets')
    .select('materials, ammo, power')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (error) {
    console.warn('wallet fetch failed', error.message);
    return null;
  }

  if (!data) {
    return { materials: 0, ammo: 0, power: 0 };
  }

  return toAmounts(data as WalletRow);
}

/**
 * Collect from a site via the `collect` RPC.
 * Throws with the server message on reach / cooldown / empty stock.
 */
export async function collectAtSite(args: {
  siteRef: string;
  lng: number;
  lat: number;
}): Promise<CollectRpcResult> {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase not configured');
  }

  const { data, error } = await supabase.rpc('collect', {
    p_site_ref: args.siteRef,
    p_lng: args.lng,
    p_lat: args.lat,
  });

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data ?? []) as CollectRow[];
  const row = rows[0];
  if (!row) {
    throw new Error('collect returned no row');
  }

  return {
    taken: {
      materials: Number(row.materials),
      ammo: Number(row.ammo),
      power: Number(row.power),
    },
    wallet: {
      materials: Number(row.wallet_materials),
      ammo: Number(row.wallet_ammo),
      power: Number(row.wallet_power),
    },
  };
}

/** Upsert live presence for the signed-in player. */
export async function sendHeartbeat(args: {
  cellR12: string;
  cellR7: string;
  lng: number;
  lat: number;
}): Promise<void> {
  if (!isSupabaseConfigured) {
    return;
  }

  const { error } = await supabase.rpc('heartbeat', {
    p_cell_r12: args.cellR12,
    p_cell_r7: args.cellR7,
    p_lng: args.lng,
    p_lat: args.lat,
  });

  if (error) {
    console.warn('heartbeat failed', error.message);
  }
}

/**
 * Count other players with fresh presence in the same r7 parent cell.
 */
export async function countNearbyPlayers(args: {
  cellR7: string;
  staleAfterMs: number;
  excludeUserId: string | null;
}): Promise<number | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const cutoffIso = new Date(Date.now() - args.staleAfterMs).toISOString();

  let query = supabase
    .from('presence')
    .select('user_id', { count: 'exact', head: true })
    .eq('cell_r7', args.cellR7)
    .gte('updated_at', cutoffIso);

  if (args.excludeUserId) {
    query = query.neq('user_id', args.excludeUserId);
  }

  const { count, error } = await query;
  if (error) {
    console.warn('presence count failed', error.message);
    return null;
  }

  return count ?? 0;
}

/** Fetch stock amounts for a site_ref. */
export async function fetchSiteStock(
  siteRef: string,
): Promise<ResourceAmounts | null> {
  if (!isSupabaseConfigured) {
    return null;
  }

  const { data, error } = await supabase
    .from('site_stocks')
    .select('materials, ammo, power')
    .eq('site_ref', siteRef)
    .maybeSingle();

  if (error) {
    console.warn('site_stocks fetch failed', error.message);
    return null;
  }

  if (!data) {
    return null;
  }

  return toAmounts(data as StockRow);
}

/** Batch-insert debug GPS points when the profile has logging enabled. */
export async function logDebugTracks(
  points: DebugTrackPoint[],
): Promise<number> {
  if (!isSupabaseConfigured || points.length === 0) {
    return 0;
  }

  const { data, error } = await supabase.rpc('log_debug_tracks', {
    p_points: points,
  });

  if (error) {
    console.warn('log_debug_tracks failed', error.message);
    return 0;
  }

  return typeof data === 'number' ? data : 0;
}

/** Compact stock label for the debug HUD. */
export function formatStockLabel(stock: ResourceAmounts): string {
  return `M${Math.round(stock.materials)} A${Math.round(stock.ammo)} P${Math.round(stock.power)}`;
}
