import { supabase } from '@/lib/supabase';
import { computePlotCellsForSite } from '@/lib/proposals/plotCells';
import type {
  OwnSiteRow,
  PendingOwnSite,
  ReviewDecision,
} from '@/lib/proposals/types';

const SITE_PHOTOS_BUCKET = 'site-photos';

type Result<T> = { data: T; error: null } | { data: null; error: string };

/**
 * Upload a local camera photo under `{userId}/{uuid}.jpg` in site-photos.
 */
export async function uploadSitePhoto(args: {
  userId: string;
  localUri: string;
}): Promise<Result<string>> {
  const ext = guessImageExtension(args.localUri);
  const path = `${args.userId}/${cryptoRandomId()}.${ext}`;
  const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';

  try {
    const response = await fetch(args.localUri);
    const body = await response.arrayBuffer();

    const { error } = await supabase.storage
      .from(SITE_PHOTOS_BUCKET)
      .upload(path, body, {
        contentType,
        upsert: false,
      });

    if (error) {
      return { data: null, error: error.message };
    }

    return { data: path, error: null };
  } catch (caught) {
    const message =
      caught instanceof Error ? caught.message : 'Photo upload failed.';
    return { data: null, error: message };
  }
}

/**
 * Public URL for a stored proposal photo path (bucket is public-read).
 */
export function sitePhotoPublicUrl(photoPath: string): string {
  const { data } = supabase.storage
    .from(SITE_PHOTOS_BUCKET)
    .getPublicUrl(photoPath);
  return data.publicUrl;
}

/**
 * Propose a site at the given coords: compute plot cells, call `propose_site`.
 * Team proposers go live immediately (server sets status).
 */
export async function proposeSite(args: {
  name: string;
  description: string;
  photoPath: string;
  lat: number;
  lng: number;
}): Promise<Result<OwnSiteRow>> {
  const name = args.name.trim();
  if (!name) {
    return { data: null, error: 'Name is required.' };
  }

  const plot = computePlotCellsForSite({ lat: args.lat, lng: args.lng });
  if (!plot.ok) {
    return { data: null, error: plot.error };
  }

  const { data, error } = await supabase.rpc('propose_site', {
    p_name: name,
    p_description: args.description.trim() || null,
    p_photo_path: args.photoPath,
    p_lng: args.lng,
    p_lat: args.lat,
    p_cell_r12: plot.cellR12,
    p_cell_r7: plot.cellR7,
    p_plot_cells: plot.plotCells,
  });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as OwnSiteRow, error: null };
}

/** List pending own_sites for the team review queue. */
export async function listPendingOwnSites(): Promise<Result<PendingOwnSite[]>> {
  const { data, error } = await supabase
    .from('own_sites')
    .select(
      'id, name, description, photo_path, status, cell_r12, cell_r7, proposer_id, created_at',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: (data as PendingOwnSite[]) ?? [], error: null };
}

/** Approve or reject a pending own site (team only). */
export async function reviewSite(args: {
  siteId: string;
  decision: ReviewDecision;
}): Promise<Result<OwnSiteRow>> {
  const { data, error } = await supabase.rpc('review_site', {
    p_site_id: args.siteId,
    p_decision: args.decision,
  });

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as OwnSiteRow, error: null };
}

function guessImageExtension(uri: string): 'jpg' | 'png' {
  const lower = uri.toLowerCase();
  if (lower.includes('.png')) {
    return 'png';
  }
  return 'jpg';
}

/** Prefer crypto.randomUUID when available; fall back for older Hermes. */
function cryptoRandomId(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
