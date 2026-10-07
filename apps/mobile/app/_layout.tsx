import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { AuthProvider, useAuth } from '@/lib/auth/AuthProvider';
import { colours } from '@/theme';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Splash may already be hidden in fast refresh.
});

/**
 * Root shell: auth context, splash until session loads, protected routes.
 */
export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="dark" />
      <SplashGate />
      <RootNavigator />
    </AuthProvider>
  );
}

/** Hides the splash screen once auth bootstrap finishes. */
function SplashGate() {
  const { isLoading } = useAuth();

  useEffect(
    function hideSplashWhenReady() {
      if (!isLoading) {
        SplashScreen.hideAsync().catch(() => undefined);
      }
    },
    [isLoading],
  );

  return null;
}

/**
 * Signed-out → sign-in; signed-in without nickname → profile; else main app.
 */
function RootNavigator() {
  const { session, hasNickname: profileHasNickname, isLoading } = useAuth();

  if (isLoading) {
    return null;
  }

  const isSignedIn = Boolean(session);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colours.sky },
        headerTintColor: colours.ink,
        headerTitleStyle: { fontWeight: '800' },
        contentStyle: { backgroundColor: colours.paper },
      }}
    >
      <Stack.Protected guard={isSignedIn && profileHasNickname}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>

      <Stack.Protected guard={isSignedIn && !profileHasNickname}>
        <Stack.Screen
          name="profile-setup"
          options={{ title: 'Choose nickname', headerBackVisible: false }}
        />
      </Stack.Protected>

      <Stack.Protected guard={!isSignedIn}>
        <Stack.Screen
          name="sign-in"
          options={{ title: 'Sign in', headerBackVisible: false }}
        />
      </Stack.Protected>
    </Stack>
  );
}
