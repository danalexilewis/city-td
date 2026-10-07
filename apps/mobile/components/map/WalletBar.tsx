import { StyleSheet, Text, View } from 'react-native';

import type { WalletBalances } from '@/lib/location/types';
import { borders, colours, radii, spacing, typography } from '@/theme';

export type WalletBarProps = {
  wallet: WalletBalances | null;
};

/**
 * Materials / ammo / power wallet readout for the map HUD.
 */
export function WalletBar(props: WalletBarProps) {
  const wallet = props.wallet;

  return (
    <View style={styles.bar} accessibilityLabel="Wallet">
      <ResourceChip
        label="Mat"
        value={wallet?.materials}
        colour={colours.materials}
      />
      <ResourceChip
        label="Ammo"
        value={wallet?.ammo}
        colour={colours.ammo}
      />
      <ResourceChip
        label="Power"
        value={wallet?.power}
        colour={colours.power}
      />
    </View>
  );
}

type ResourceChipProps = {
  label: string;
  value: number | undefined;
  colour: string;
};

function ResourceChip(props: ResourceChipProps) {
  const display =
    props.value == null ? '—' : String(Math.floor(props.value));

  return (
    <View style={styles.chip}>
      <View style={[styles.dot, { backgroundColor: props.colour }]} />
      <Text style={styles.label}>{props.label}</Text>
      <Text style={styles.value}>{display}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(255, 248, 231, 0.94)',
    borderColor: colours.ink,
    borderWidth: borders.chunky,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colours.ink,
  },
  label: {
    color: colours.muted,
    fontSize: 11,
    fontWeight: typography.weightMedium,
  },
  value: {
    color: colours.ink,
    fontSize: 13,
    fontWeight: typography.weightBold,
    fontVariant: ['tabular-nums'],
    minWidth: 18,
  },
});
