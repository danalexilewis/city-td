import { Stack } from 'expo-router';

import { colours } from '@/theme';

/**
 * Authenticated stack: map home, settings, about, propose, review.
 * Map agent owns the home screen content.
 */
export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colours.sky },
        headerTintColor: colours.ink,
        headerTitleStyle: { fontWeight: '800' },
        contentStyle: { backgroundColor: colours.paper },
      }}
    >
      <Stack.Screen
        name="index"
        options={{ title: 'City TD', headerShown: false }}
      />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="about" options={{ title: 'About' }} />
      <Stack.Screen name="propose" options={{ title: 'Propose a site' }} />
      <Stack.Screen name="review" options={{ title: 'Review proposals' }} />
    </Stack>
  );
}
