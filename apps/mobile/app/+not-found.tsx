import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { colours, spacing, typography } from '@/theme';

/**
 * Fallback route when navigation misses a screen.
 */
export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen does not exist.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go home</Text>
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: colours.paper,
  },
  title: {
    fontSize: typography.headingSize,
    fontWeight: typography.weightBold,
    color: colours.ink,
  },
  link: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
  },
  linkText: {
    fontSize: typography.bodySize,
    fontWeight: typography.weightMedium,
    color: colours.water,
  },
});
