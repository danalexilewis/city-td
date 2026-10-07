import {
  BALANCE,
  createSpeedGate,
  distanceMetres,
  h3Adapter,
  isWithinReach,
  type SpeedGate,
} from '@city-td/game-core';
import * as Location from 'expo-location';
import { useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';

import { useAuth } from '@/lib/auth/AuthProvider';
import type { MapSite } from '@/lib/map/sites';
import {
  collectAtSite,
  countNearbyPlayers,
  fetchSiteStock,
  fetchWallet,
  formatStockLabel,
  logDebugTracks,
  sendHeartbeat,
  type DebugTrackPoint,
} from '@/lib/location/rpc';
import type {
  LocationLoopResult,
  PlayerPosition,
  WalletBalances,
} from '@/lib/location/types';

const LOCATION_OPTIONS: Location.LocationOptions = {
  accuracy: Location.Accuracy.High,
  timeInterval: 1000,
  distanceInterval: 1,
};

const DEBUG_FLUSH_INTERVAL_MS = 10_000;
const DEBUG_FLUSH_BATCH = 20;
const NEAREST_STOCK_REFRESH_MS = 8_000;
const PRESENCE_REFRESH_MS = 15_000;

export type UseLocationLoopArgs = {
  /** Sites currently in the map viewport (used for auto-collect + nearest stock). */
  sites: MapSite[];
};

/**
 * Foreground-only location loop: speed gate, heartbeat, auto-collect,
 * wallet, opt-in debug tracks.
 */
export function useLocationLoop(args: UseLocationLoopArgs): LocationLoopResult {
  const { profile, session } = useAuth();
  const sitesRef = useRef(args.sites);
  sitesRef.current = args.sites;

  const gateRef = useRef<SpeedGate | null>(null);
  if (!gateRef.current) {
    gateRef.current = createSpeedGate();
  }

  const prevPositionRef = useRef<PlayerPosition | null>(null);
  const inReachRef = useRef<Set<string>>(new Set());
  const collectCooldownUntilRef = useRef<Map<string, number>>(new Map());
  const collectingRef = useRef<Set<string>>(new Set());
  const debugBufferRef = useRef<DebugTrackPoint[]>([]);
  const lastHeartbeatAtRef = useRef(0);
  const appActiveRef = useRef(AppState.currentState === 'active');

  const [permissionGranted, setPermissionGranted] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [position, setPosition] = useState<PlayerPosition | null>(null);
  const [cellR12, setCellR12] = useState<string | null>(null);
  const [cellR7, setCellR7] = useState<string | null>(null);
  const [speedKmh, setSpeedKmh] = useState<number | null>(null);
  const [gateState, setGateState] = useState(
    gateRef.current.getState(),
  );
  const [wallet, setWallet] = useState<WalletBalances | null>(null);
  const [playersNearby, setPlayersNearby] = useState<number | null>(null);
  const [nearestStockLabel, setNearestStockLabel] = useState<string | null>(
    null,
  );
  const [lastCollectNote, setLastCollectNote] = useState<string | null>(null);

  const debugLogging = profile?.debug_logging ?? false;
  const userId = session?.user.id ?? null;

  useEffect(
    function loadWallet() {
      let cancelled = false;

      fetchWallet()
        .then((next) => {
          if (!cancelled) {
            setWallet(next);
          }
        })
        .catch((error: unknown) => {
          console.warn('wallet load failed', error);
        });

      return function cleanup() {
        cancelled = true;
      };
    },
    [userId],
  );

  useEffect(function trackAppState() {
    function onChange(next: AppStateStatus) {
      appActiveRef.current = next === 'active';
    }

    const sub = AppState.addEventListener('change', onChange);
    return function cleanup() {
      sub.remove();
    };
  }, []);

  useEffect(
    function watchForegroundLocation() {
      let cancelled = false;
      let subscription: Location.LocationSubscription | null = null;

      async function start() {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) {
          return;
        }

        if (status !== 'granted') {
          setPermissionGranted(false);
          setPermissionError('Location permission denied');
          return;
        }

        setPermissionGranted(true);
        setPermissionError(null);

        subscription = await Location.watchPositionAsync(
          LOCATION_OPTIONS,
          function onLocation(update) {
            if (cancelled || !appActiveRef.current) {
              return;
            }
            handleLocationUpdate(update);
          },
          function onError(reason) {
            console.warn('location watch error', reason);
          },
        );
      }

      function handleLocationUpdate(update: Location.LocationObject) {
        const atMs = update.timestamp || Date.now();
        const next: PlayerPosition = {
          lat: update.coords.latitude,
          lng: update.coords.longitude,
          accuracyM: update.coords.accuracy,
          speedMps: update.coords.speed,
          atMs,
        };

        const sampleKmh = resolveSpeedKmh({
          next,
          prev: prevPositionRef.current,
          reportedMps: update.coords.speed,
        });

        const gate = gateRef.current!;
        if (sampleKmh != null) {
          const nextGate = gate.pushSample({
            speedKmh: sampleKmh,
            atMs,
          });
          setGateState(nextGate);
        }
        setSpeedKmh(gate.getMedianSpeedKmh());

        const nextCellR12 = h3Adapter.cellAt({
          lat: next.lat,
          lng: next.lng,
        });
        const nextCellR7 = h3Adapter.parentCell(
          nextCellR12,
          BALANCE.grid.h3ParentResolution,
        );

        prevPositionRef.current = next;
        setPosition(next);
        setCellR12(nextCellR12);
        setCellR7(nextCellR7);

        void maybeHeartbeat({
          cellR12: nextCellR12,
          cellR7: nextCellR7,
          lng: next.lng,
          lat: next.lat,
        });

        void maybeAutoCollect(next);

        if (debugLogging) {
          bufferDebugPoint(next);
        }
      }

      async function maybeHeartbeat(argsHb: {
        cellR12: string;
        cellR7: string;
        lng: number;
        lat: number;
      }) {
        const now = Date.now();
        if (
          now - lastHeartbeatAtRef.current <
          BALANCE.presence.heartbeatIntervalMs
        ) {
          return;
        }
        lastHeartbeatAtRef.current = now;
        await sendHeartbeat(argsHb);
      }

      async function maybeAutoCollect(player: PlayerPosition) {
        const sites = sitesRef.current;
        const nextInReach = new Set<string>();

        for (const site of sites) {
          const inReach = isWithinReach({
            origin: { lat: player.lat, lng: player.lng },
            point: { lat: site.lat, lng: site.lng },
            radiusM: BALANCE.reach.actionRadiusM,
          });
          if (!inReach) {
            continue;
          }
          nextInReach.add(site.siteRef);

          const wasInReach = inReachRef.current.has(site.siteRef);
          if (wasInReach) {
            continue;
          }

          await tryCollectSite({
            site,
            player,
          });
        }

        inReachRef.current = nextInReach;
      }

      async function tryCollectSite(argsCollect: {
        site: MapSite;
        player: PlayerPosition;
      }) {
        const { site, player } = argsCollect;
        if (site.siteRef.startsWith('mock:')) {
          return;
        }

        const cooldownUntil =
          collectCooldownUntilRef.current.get(site.siteRef) ?? 0;
        if (Date.now() < cooldownUntil) {
          return;
        }

        if (collectingRef.current.has(site.siteRef)) {
          return;
        }

        collectingRef.current.add(site.siteRef);
        try {
          const result = await collectAtSite({
            siteRef: site.siteRef,
            lng: player.lng,
            lat: player.lat,
          });
          setWallet(result.wallet);
          collectCooldownUntilRef.current.set(
            site.siteRef,
            Date.now() + BALANCE.collect.cooldownMs,
          );
          setLastCollectNote(
            `+${fmtTaken(result.taken)} @ ${site.name}`,
          );
        } catch (error: unknown) {
          const message =
            error instanceof Error ? error.message : String(error);
          if (message.toLowerCase().includes('cooldown')) {
            collectCooldownUntilRef.current.set(
              site.siteRef,
              Date.now() + BALANCE.collect.cooldownMs,
            );
            setLastCollectNote(`Cooldown @ ${site.name}`);
            return;
          }
          if (message.toLowerCase().includes('empty')) {
            setLastCollectNote(`Empty @ ${site.name}`);
            return;
          }
          if (message.toLowerCase().includes('out of reach')) {
            return;
          }
          console.warn('collect failed', message);
          setLastCollectNote(`Collect fail: ${message}`);
        } finally {
          collectingRef.current.delete(site.siteRef);
        }
      }

      function bufferDebugPoint(player: PlayerPosition) {
        debugBufferRef.current.push({
          lng: player.lng,
          lat: player.lat,
          accuracy_m: player.accuracyM,
          speed_mps: player.speedMps,
          recorded_at: new Date(player.atMs).toISOString(),
        });
        if (debugBufferRef.current.length >= DEBUG_FLUSH_BATCH) {
          void flushDebugTrackBuffer(debugBufferRef);
        }
      }

      start().catch((error: unknown) => {
        console.warn('location start failed', error);
        if (!cancelled) {
          setPermissionError(
            error instanceof Error ? error.message : 'Location failed',
          );
        }
      });

      return function cleanup() {
        cancelled = true;
        subscription?.remove();
      };
    },
    [debugLogging],
  );

  useEffect(
    function flushDebugOnInterval() {
      if (!debugLogging) {
        debugBufferRef.current = [];
        return;
      }

      const timer = setInterval(() => {
        void flushDebugTrackBuffer(debugBufferRef);
      }, DEBUG_FLUSH_INTERVAL_MS);

      return function cleanup() {
        clearInterval(timer);
        void flushDebugTrackBuffer(debugBufferRef);
      };
    },
    [debugLogging],
  );

  useEffect(
    function refreshPresenceAndStock() {
      let cancelled = false;

      async function refresh() {
        const player = prevPositionRef.current;
        const r7 = cellR7;
        if (!player || !r7 || !appActiveRef.current) {
          return;
        }

        const nearby = await countNearbyPlayers({
          cellR7: r7,
          staleAfterMs: BALANCE.presence.staleAfterMs,
          excludeUserId: userId,
        });
        if (!cancelled) {
          setPlayersNearby(nearby);
        }

        const nearest = findNearestSite({
          player,
          sites: sitesRef.current,
        });
        if (!nearest) {
          if (!cancelled) {
            setNearestStockLabel(null);
          }
          return;
        }

        if (nearest.siteRef.startsWith('mock:')) {
          if (!cancelled) {
            setNearestStockLabel('mock');
          }
          return;
        }

        const stock = await fetchSiteStock(nearest.siteRef);
        if (cancelled) {
          return;
        }
        setNearestStockLabel(
          stock
            ? `${nearest.name}: ${formatStockLabel(stock)}`
            : `${nearest.name}: —`,
        );
      }

      void refresh();
      const timer = setInterval(refresh, Math.min(
        PRESENCE_REFRESH_MS,
        NEAREST_STOCK_REFRESH_MS,
      ));

      return function cleanup() {
        cancelled = true;
        clearInterval(timer);
      };
    },
    [cellR7, userId, args.sites],
  );

  async function refreshWallet() {
    try {
      const next = await fetchWallet();
      setWallet(next);
    } catch (error: unknown) {
      console.warn('wallet load failed', error);
    }
  }

  return {
    permissionGranted,
    permissionError,
    position,
    cellR12,
    cellR7,
    speedKmh,
    gateState,
    isGateLocked: gateState === 'locked',
    wallet,
    refreshWallet,
    playersNearby,
    nearestStockLabel,
    lastCollectNote,
  };
}

async function flushDebugTrackBuffer(bufferRef: {
  current: DebugTrackPoint[];
}) {
  const batch = bufferRef.current;
  if (batch.length === 0) {
    return;
  }
  bufferRef.current = [];
  await logDebugTracks(batch);
}

function resolveSpeedKmh(args: {
  next: PlayerPosition;
  prev: PlayerPosition | null;
  reportedMps: number | null;
}): number | null {
  if (args.reportedMps != null && args.reportedMps >= 0) {
    return args.reportedMps * 3.6;
  }

  const prev = args.prev;
  if (!prev) {
    return null;
  }

  const dtSec = (args.next.atMs - prev.atMs) / 1000;
  if (dtSec <= 0.2) {
    return null;
  }

  const metres = distanceMetres(
    { lat: prev.lat, lng: prev.lng },
    { lat: args.next.lat, lng: args.next.lng },
  );
  return (metres / dtSec) * 3.6;
}

function findNearestSite(args: {
  player: PlayerPosition;
  sites: MapSite[];
}): MapSite | null {
  let best: MapSite | null = null;
  let bestDist = Infinity;

  for (const site of args.sites) {
    const dist = distanceMetres(
      { lat: args.player.lat, lng: args.player.lng },
      { lat: site.lat, lng: site.lng },
    );
    if (dist < bestDist) {
      bestDist = dist;
      best = site;
    }
  }

  return best;
}

function fmtTaken(taken: WalletBalances): string {
  const parts: string[] = [];
  if (taken.materials > 0) {
    parts.push(`M${Math.round(taken.materials)}`);
  }
  if (taken.ammo > 0) {
    parts.push(`A${Math.round(taken.ammo)}`);
  }
  if (taken.power > 0) {
    parts.push(`P${Math.round(taken.power)}`);
  }
  return parts.length > 0 ? parts.join(' ') : '0';
}
