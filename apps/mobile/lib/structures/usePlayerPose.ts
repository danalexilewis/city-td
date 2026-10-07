import { useCurrentPosition } from '@maplibre/maplibre-react-native';

import type { PlayerPose } from '@/lib/structures/types';

type UsePlayerPoseArgs = {
  /** When location-loop lands, pass its pose here to override MapLibre GPS. */
  override?: PlayerPose | null;
  /** Gate lock from location-loop; MapLibre fallback is always unlocked. */
  gateLocked?: boolean;
};

/**
 * Player lat/lng for structure reach checks.
 * Prefers an override from the location agent; otherwise MapLibre GPS.
 */
export function usePlayerPose(args: UsePlayerPoseArgs = {}): PlayerPose | null {
  const mapLibrePosition = useCurrentPosition({
    enabled: !args.override,
  });

  if (args.override) {
    return args.override;
  }

  const coords = mapLibrePosition?.coords;
  if (
    !coords ||
    typeof coords.latitude !== 'number' ||
    typeof coords.longitude !== 'number'
  ) {
    return null;
  }

  return {
    lat: coords.latitude,
    lng: coords.longitude,
    gateLocked: args.gateLocked ?? false,
  };
}
