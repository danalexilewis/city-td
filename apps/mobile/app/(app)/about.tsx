import { Linking, StyleSheet, Text, View } from 'react-native';

import { Screen } from '@/components/ui/Screen';
import { borders, colours, radii, spacing, typography } from '@/theme';

/**
 * Map and data credits required for OSM / OpenFreeMap / Metlink attribution.
 */
export default function AboutScreen() {
  return (
    <Screen scroll>
      <View style={styles.panel}>
        <Text style={styles.title}>About & credits</Text>
        <Text style={styles.body}>
          City TD is a Wellington-region playtest. Map and place data come from
          several sources that must stay separate — see the repo README.
        </Text>

        <Text style={styles.heading}>Map</Text>
        <Text style={styles.body}>
          © OpenStreetMap contributors. Map style and tiles via OpenFreeMap,
          using the OpenMapTiles schema.
        </Text>
        <Text
          style={styles.link}
          onPress={() => Linking.openURL('https://www.openstreetmap.org/copyright')}
        >
          openstreetmap.org/copyright
        </Text>
        <Text
          style={styles.link}
          onPress={() => Linking.openURL('https://openfreemap.org/')}
        >
          openfreemap.org
        </Text>
        <Text
          style={styles.link}
          onPress={() => Linking.openURL('https://openmaptiles.org/')}
        >
          openmaptiles.org
        </Text>

        <Text style={styles.heading}>Transit data</Text>
        <Text style={styles.body}>
          Metlink stop and station data © Greater Wellington Regional Council,
          licensed under Creative Commons Attribution 4.0 International (CC BY
          4.0).
        </Text>
        <Text
          style={styles.link}
          onPress={() =>
            Linking.openURL('https://creativecommons.org/licenses/by/4.0/')
          }
        >
          creativecommons.org/licenses/by/4.0
        </Text>
        <Text
          style={styles.link}
          onPress={() => Linking.openURL('https://www.metlink.org.nz/')}
        >
          metlink.org.nz
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colours.panel,
    borderColor: colours.ink,
    borderWidth: borders.chunky,
    borderRadius: radii.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    color: colours.ink,
    fontSize: typography.titleSize,
    fontWeight: typography.weightBold,
    marginBottom: spacing.xs,
  },
  heading: {
    color: colours.ink,
    fontSize: typography.headingSize,
    fontWeight: typography.weightBold,
    marginTop: spacing.md,
  },
  body: {
    color: colours.ink,
    fontSize: typography.bodySize,
    lineHeight: 22,
  },
  link: {
    color: colours.water,
    fontSize: typography.captionSize,
    fontWeight: typography.weightMedium,
  },
});
