import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { borders, colours, radii, spacing, typography } from '@/theme';

export type DebugHudProps = {
  zoom: number;
  metresPerPoint: number;
  cellSizePoints: number;
  gpsAccuracyM: number | null;
  speedKmh: number | null;
  gateState: string;
  currentCell: string | null;
  playersNearby: number | null;
  nearestStock: string | null;
  debugLogging: boolean | null;
  sitesSource: 'rpc' | 'mock' | 'empty';
  gridKind: 'h3' | 'square';
  cameraMode: 'street' | 'overview';
};

/**
 * Compact debug readout for walk tests (zoom, cell size, gate placeholders).
 */
export function DebugHud(props: DebugHudProps) {
  const gpsLabel =
    props.gpsAccuracyM == null
      ? 'GPS ± —'
      : `GPS ± ${props.gpsAccuracyM.toFixed(0)} m`;
  const speedLabel =
    props.speedKmh == null
      ? 'Speed —'
      : `${props.speedKmh.toFixed(1)} km/h`;
  const playersLabel =
    props.playersNearby == null
      ? 'Nearby —'
      : `${props.playersNearby} nearby`;
  const stockLabel = props.nearestStock ?? 'Stock —';
  const debugLabel =
    props.debugLogging == null
      ? 'Debug log —'
      : props.debugLogging
        ? 'Debug log ON'
        : 'Debug log OFF';

  return (
    <View style={styles.panel} pointerEvents="box-none">
      <Text style={styles.line}>
        z {props.zoom.toFixed(2)} · {props.metresPerPoint.toFixed(2)} m/pt ·
        cell ~{props.cellSizePoints.toFixed(0)} pt
      </Text>
      <Text style={styles.line}>
        {props.cameraMode} · {props.gridKind} · sites:{props.sitesSource}
      </Text>
      <Text style={styles.line}>
        {gpsLabel} · {speedLabel} · gate:{props.gateState}
      </Text>
      <Text style={styles.line} numberOfLines={1}>
        cell {props.currentCell ?? '—'} · {playersLabel} · {stockLabel}
      </Text>
      <View style={styles.row}>
        <Text style={styles.line}>{debugLabel}</Text>
        {props.debugLogging != null ? (
          <Link href="/settings" style={styles.link}>
            <Text style={styles.linkText}>Settings</Text>
          </Link>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: 'rgba(255, 248, 231, 0.92)',
    borderColor: colours.ink,
    borderWidth: borders.chunky,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 2,
    maxWidth: 360,
  },
  line: {
    color: colours.ink,
    fontSize: 11,
    fontWeight: typography.weightMedium,
    fontVariant: ['tabular-nums'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  link: {
    paddingVertical: 2,
  },
  linkText: {
    color: colours.water,
    fontSize: 11,
    fontWeight: typography.weightBold,
  },
});
