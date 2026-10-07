import { StyleSheet, Text, View } from 'react-native';

import { borders, colours, radii, spacing, typography } from '@/theme';

export type AutoCollectBannerProps = {
  /** Median speed shown while the gate is locked. */
  speedKmh: number | null;
  lastCollectNote: string | null;
};

/**
 * Read-only banner when the speed gate locks taps (auto-collect only).
 */
export function AutoCollectBanner(props: AutoCollectBannerProps) {
  const speedLabel =
    props.speedKmh == null ? '—' : `${props.speedKmh.toFixed(0)} km/h`;

  return (
    <View style={styles.banner} accessibilityRole="text">
      <Text style={styles.title}>Auto-collecting</Text>
      <Text style={styles.body}>
        Moving too fast ({speedLabel}). Taps locked — sites still collect when
        you pass within reach.
      </Text>
      {props.lastCollectNote ? (
        <Text style={styles.note} numberOfLines={1}>
          {props.lastCollectNote}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colours.panel,
    borderColor: colours.ink,
    borderWidth: borders.chunky,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: 2,
    maxWidth: 360,
  },
  title: {
    color: colours.ink,
    fontSize: typography.captionSize,
    fontWeight: typography.weightBold,
  },
  body: {
    color: colours.ink,
    fontSize: 11,
    fontWeight: typography.weightMedium,
    lineHeight: 15,
  },
  note: {
    color: colours.success,
    fontSize: 11,
    fontWeight: typography.weightBold,
    marginTop: 2,
  },
});
