import { useEffect, useRef, useState } from 'react';

import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { fetchStructuresByR7 } from '@/lib/structures/api';
import {
  filterVisibleStructures,
  r7ParentsInView,
} from '@/lib/structures/viewState';
import type { StructureRow } from '@/lib/structures/types';

type SiteLike = {
  cellR7: string | null;
  cellR12: string | null;
  lat: number;
  lng: number;
};

type UseStructuresInViewResult = {
  structures: StructureRow[];
  byCellId: Record<string, StructureRow>;
  error: string | null;
  refresh: () => Promise<void>;
};

/**
 * Fetch + realtime-sync structures for r7 parents covering sites in view.
 */
export function useStructuresInView(args: {
  sites: readonly SiteLike[];
  enabled?: boolean;
}): UseStructuresInViewResult {
  const enabled = args.enabled ?? true;
  const [structures, setStructures] = useState<StructureRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const r7Ids = r7ParentsInView({ sites: args.sites });
  const r7Key = r7Ids.join(',');
  const r7Ref = useRef(r7Ids);
  r7Ref.current = r7Ids;

  async function load() {
    if (!enabled || !isSupabaseConfigured) {
      setStructures([]);
      setError(null);
      return;
    }

    const result = await fetchStructuresByR7({ cellR7Ids: r7Ref.current });
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    setStructures(filterVisibleStructures(result.structures));
  }

  useEffect(
    function fetchWhenR7Changes() {
      let cancelled = false;

      async function run() {
        await load();
        if (cancelled) {
          return;
        }
      }

      run().catch((err: unknown) => {
        console.warn('structures fetch failed', err);
      });

      return function cleanup() {
        cancelled = true;
      };
    },
    // r7Key captures the parent set; sites array identity is intentionally ignored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, r7Key],
  );

  useEffect(
    function subscribeRealtime() {
      if (!enabled || !isSupabaseConfigured || r7Ids.length === 0) {
        return;
      }

      const channelName = `structures-r7:${r7Key.slice(0, 80)}`;
      const channel = supabase.channel(channelName);
      const parentSet = new Set(r7Ids);

      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'structures',
        },
        (payload) => {
          const next = payload.new as StructureRow | Record<string, never>;
          const prev = payload.old as StructureRow | Record<string, never>;
          const cellR7 =
            ('cell_r7' in next && typeof next.cell_r7 === 'string'
              ? next.cell_r7
              : null) ??
            ('cell_r7' in prev && typeof prev.cell_r7 === 'string'
              ? prev.cell_r7
              : null);

          if (cellR7 && !parentSet.has(cellR7)) {
            return;
          }

          setStructures((current) => {
            if (payload.eventType === 'DELETE') {
              const deletedId =
                'id' in prev && typeof prev.id === 'string' ? prev.id : null;
              if (!deletedId) {
                return current;
              }
              return current.filter((row) => row.id !== deletedId);
            }

            if (!('id' in next) || typeof next.id !== 'string') {
              return current;
            }

            const row = next as StructureRow;
            const visible = filterVisibleStructures([row]);
            const without = current.filter((item) => item.id !== row.id);
            if (visible.length === 0) {
              return without;
            }
            return [...without, visible[0]!];
          });
        },
      );

      channel.subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.warn('structures realtime channel error');
        }
      });

      return function cleanup() {
        void supabase.removeChannel(channel);
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [enabled, r7Key],
  );

  const byCellId: Record<string, StructureRow> = {};
  for (const row of structures) {
    byCellId[row.cell_r12] = row;
  }

  return {
    structures,
    byCellId,
    error,
    refresh: load,
  };
}
