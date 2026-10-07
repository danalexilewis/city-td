import type { SiteType } from '@city-td/game-core';

import { WELLINGTON_CENTER } from '@/lib/map/constants';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type MapSite = {
  siteRef: string;
  source: string;
  id: string;
  name: string;
  siteKind: SiteType;
  lat: number;
  lng: number;
  cellR12: string | null;
  cellR7: string | null;
  status: string;
};

type SitesInBboxRow = {
  site_ref: string;
  source: string;
  id: string;
  name: string;
  site_kind: string;
  lng: number;
  lat: number;
  cell_r12: string | null;
  cell_r7: string | null;
  status: string;
};

export type Bbox = {
  minLng: number;
  minLat: number;
  maxLng: number;
  maxLat: number;
};

const SITE_KINDS: ReadonlySet<string> = new Set([
  'intersection',
  'landmark',
  'stop',
  'station',
  'own',
]);

/**
 * Map RPC / mock site_kind strings onto game-core SiteType.
 */
export function toSiteKind(raw: string): SiteType {
  if (SITE_KINDS.has(raw)) {
    return raw as SiteType;
  }
  return 'landmark';
}

function rowToSite(row: SitesInBboxRow): MapSite {
  return {
    siteRef: row.site_ref,
    source: row.source,
    id: String(row.id),
    name: row.name,
    siteKind: toSiteKind(row.site_kind),
    lat: row.lat,
    lng: row.lng,
    cellR12: row.cell_r12,
    cellR7: row.cell_r7,
    status: row.status,
  };
}

/** Small CBD mock set when Supabase env is missing or the RPC fails. */
export function mockWellingtonSites(): MapSite[] {
  const seeds: Array<{
    kind: SiteType;
    name: string;
    dLat: number;
    dLng: number;
  }> = [
    {
      kind: 'intersection',
      name: 'Lambton Quay × Willis',
      dLat: 0,
      dLng: 0,
    },
    {
      kind: 'landmark',
      name: 'Civic Square',
      dLat: -0.0012,
      dLng: 0.001,
    },
    {
      kind: 'stop',
      name: 'Wellington Station stop',
      dLat: 0.002,
      dLng: -0.0004,
    },
    {
      kind: 'station',
      name: 'Wellington Station',
      dLat: 0.0024,
      dLng: -0.0002,
    },
    {
      kind: 'own',
      name: 'Team pin',
      dLat: -0.0006,
      dLng: -0.0014,
    },
  ];

  return seeds.map((seed, index) => {
    const lat = WELLINGTON_CENTER.lat + seed.dLat;
    const lng = WELLINGTON_CENTER.lng + seed.dLng;
    return {
      siteRef: `mock:${seed.kind}:${index}`,
      source: 'mock',
      id: `mock-${index}`,
      name: seed.name,
      siteKind: seed.kind,
      lat,
      lng,
      cellR12: null,
      cellR7: null,
      status: 'live',
    };
  });
}

/**
 * Fetch live sites for a viewport via `sites_in_bbox`, or mock / empty fallback.
 */
export async function fetchSitesInBbox(bbox: Bbox): Promise<{
  sites: MapSite[];
  source: 'rpc' | 'mock' | 'empty';
}> {
  if (!isSupabaseConfigured) {
    return { sites: mockWellingtonSites(), source: 'mock' };
  }

  const { data, error } = await supabase.rpc('sites_in_bbox', {
    min_lng: bbox.minLng,
    min_lat: bbox.minLat,
    max_lng: bbox.maxLng,
    max_lat: bbox.maxLat,
  });

  if (error) {
    console.warn('sites_in_bbox failed; using mock sites', error.message);
    return { sites: mockWellingtonSites(), source: 'mock' };
  }

  const rows = (data ?? []) as SitesInBboxRow[];
  if (rows.length === 0) {
    return { sites: [], source: 'empty' };
  }

  return { sites: rows.map(rowToSite), source: 'rpc' };
}
