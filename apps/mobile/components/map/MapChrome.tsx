import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/lib/auth/AuthProvider';
import type { CameraMode } from '@/lib/map/constants';
import { MAP_ATTRIBUTION } from '@/lib/map/constants';
import { borders, colours, radii, spacing, typography } from '@/theme';

export type MapChromeProps = {
  cameraMode: CameraMode;
  useSquareGrid: boolean;
  onCameraModeChange: (mode: CameraMode) => void;
  onSquareGridChange: (enabled: boolean) => void;
};

/**
 * Street / overview toggle, square lab toggle, nav links, map attribution.
 */
export function MapChrome(props: MapChromeProps) {
  const { profile } = useAuth();

  return (
    <View style={styles.wrap} pointerEvents="box-none">
      <View style={styles.topRow} pointerEvents="box-none">
        <View style={styles.segment}>
          <ModeChip
            label="Street"
            active={props.cameraMode === 'street'}
            onPress={() => props.onCameraModeChange('street')}
          />
          <ModeChip
            label="Overview"
            active={props.cameraMode === 'overview'}
            onPress={() => props.onCameraModeChange('overview')}
          />
        </View>
        <View style={styles.links}>
          <Link href="/propose" style={styles.link}>
            <Text style={styles.linkText}>Propose</Text>
          </Link>
          {profile?.is_team ? (
            <Link href="/review" style={styles.link}>
              <Text style={styles.linkText}>Review</Text>
            </Link>
          ) : null}
          <Link href="/settings" style={styles.link}>
            <Text style={styles.linkText}>Settings</Text>
          </Link>
          <Link href="/about" style={styles.link}>
            <Text style={styles.linkText}>About</Text>
          </Link>
        </View>
      </View>

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: props.useSquareGrid }}
        onPress={() => props.onSquareGridChange(!props.useSquareGrid)}
        style={[styles.lab, props.useSquareGrid ? styles.labOn : null]}
      >
        <Text style={styles.labText}>
          Square z21 lab {props.useSquareGrid ? 'ON' : 'OFF'}
        </Text>
        <Text style={styles.labCaption}>View-only · server stays H3</Text>
      </Pressable>

      <Text style={styles.attribution}>{MAP_ATTRIBUTION}</Text>
    </View>
  );
}

type ModeChipProps = {
  label: string;
  active: boolean;
  onPress: () => void;
};

function ModeChip(props: ModeChipProps) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={props.onPress}
      style={[styles.chip, props.active ? styles.chipActive : null]}
    >
      <Text style={styles.chipText}>{props.label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colours.panel,
    borderColor: colours.ink,
    borderWidth: borders.chunky,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipActive: {
    backgroundColor: colours.path,
  },
  chipText: {
    color: colours.ink,
    fontSize: typography.captionSize,
    fontWeight: typography.weightBold,
  },
  links: {
    backgroundColor: 'rgba(255, 248, 231, 0.92)',
    borderColor: colours.ink,
    borderWidth: borders.chunky,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: 2,
  },
  link: {
    paddingVertical: 2,
  },
  linkText: {
    color: colours.water,
    fontSize: typography.captionSize,
    fontWeight: typography.weightBold,
  },
  lab: {
    alignSelf: 'flex-start',
    backgroundColor: colours.panel,
    borderColor: colours.ink,
    borderWidth: borders.chunky,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  labOn: {
    backgroundColor: colours.path,
  },
  labText: {
    color: colours.ink,
    fontSize: typography.captionSize,
    fontWeight: typography.weightBold,
  },
  labCaption: {
    color: colours.muted,
    fontSize: 10,
    fontWeight: typography.weightMedium,
  },
  attribution: {
    color: colours.ink,
    fontSize: 10,
    fontWeight: typography.weightMedium,
    backgroundColor: 'rgba(255, 248, 231, 0.85)',
    alignSelf: 'flex-start',
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
});
