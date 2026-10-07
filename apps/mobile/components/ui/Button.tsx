import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from 'react-native';

import { borders, colours, radii, spacing, typography } from '@/theme';

type ButtonProps = {
  label: string;
  onPress: PressableProps['onPress'];
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'danger';
};

/**
 * Chunky cartoon pressable used across auth and settings screens.
 */
export function Button(props: ButtonProps) {
  const variant = props.variant ?? 'primary';
  const isDisabled = Boolean(props.disabled || props.loading);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.base,
        variantStyles[variant],
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      {props.loading ? (
        <ActivityIndicator color={colours.ink} />
      ) : (
        <Text style={styles.label}>{props.label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 48,
    borderRadius: radii.md,
    borderWidth: borders.chunky,
    borderColor: colours.ink,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ translateY: 1 }],
  },
  disabled: {
    opacity: 0.5,
  },
  label: {
    color: colours.ink,
    fontSize: typography.bodySize,
    fontWeight: typography.weightBold,
  },
});

const variantStyles = StyleSheet.create({
  primary: {
    backgroundColor: colours.path,
  },
  secondary: {
    backgroundColor: colours.panel,
  },
  danger: {
    backgroundColor: colours.danger,
  },
});
