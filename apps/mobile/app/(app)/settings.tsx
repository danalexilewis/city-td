import { useState } from 'react';
import { StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/lib/auth/AuthProvider';
import { borders, colours, radii, spacing, typography } from '@/theme';

/**
 * Nickname edit, read-only team flag, debug-logging toggle, sign out.
 */
export default function SettingsScreen() {
  const { profile, saveNickname, setDebugLogging, signOut } = useAuth();
  const [nickname, setNickname] = useState(profile?.nickname ?? '');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isSavingNickname, setIsSavingNickname] = useState(false);
  const [isTogglingDebug, setIsTogglingDebug] = useState(false);

  async function handleSaveNickname() {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsSavingNickname(true);
    const result = await saveNickname({ nickname });
    setIsSavingNickname(false);

    if (result.error) {
      setErrorMessage(result.error);
      return;
    }

    setStatusMessage('Nickname saved.');
  }

  async function handleDebugToggle(enabled: boolean) {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsTogglingDebug(true);
    const result = await setDebugLogging({ enabled });
    setIsTogglingDebug(false);

    if (result.error) {
      setErrorMessage(result.error);
      return;
    }

    setStatusMessage(
      enabled
        ? 'Debug GPS logging on. Tracks delete after 30 days.'
        : 'Debug GPS logging off.',
    );
  }

  return (
    <Screen scroll>
      <View style={styles.panel}>
        <Text style={styles.heading}>Profile</Text>

        <TextField
          label="Nickname"
          value={nickname}
          onChangeText={setNickname}
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={24}
          editable={!isSavingNickname}
        />
        <Button
          label="Save nickname"
          onPress={handleSaveNickname}
          loading={isSavingNickname}
          disabled={isSavingNickname}
        />

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Team account</Text>
            <Text style={styles.rowCaption}>
              Read-only. Moderators are flagged in the database, not from the
              app.
            </Text>
          </View>
          <Text style={styles.flag}>
            {profile?.is_team ? 'Yes' : 'No'}
          </Text>
        </View>

        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.rowTitle}>Debug GPS logging</Text>
            <Text style={styles.rowCaption}>
              Opt-in only. Raw tracks are stored when on and deleted after 30
              days. Location loop will honour this flag.
            </Text>
          </View>
          <Switch
            value={Boolean(profile?.debug_logging)}
            onValueChange={handleDebugToggle}
            disabled={isTogglingDebug || !profile}
            trackColor={{ false: colours.muted, true: colours.success }}
            thumbColor={colours.paper}
          />
        </View>

        <View style={styles.sitesBlock}>
          <Text style={styles.rowTitle}>Sites</Text>
          <Text style={styles.rowCaption}>
            Propose a place at your GPS fix. Team accounts also review the
            pending queue.
          </Text>
          <Button
            label="Propose a site"
            variant="secondary"
            onPress={() => router.push('/propose')}
          />
          {profile?.is_team ? (
            <Button
              label="Review proposals"
              variant="secondary"
              onPress={() => router.push('/review')}
            />
          ) : null}
        </View>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        {statusMessage ? (
          <Text style={styles.status}>{statusMessage}</Text>
        ) : null}

        <Button label="Sign out" variant="danger" onPress={signOut} />
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
    gap: spacing.md,
  },
  heading: {
    color: colours.ink,
    fontSize: typography.headingSize,
    fontWeight: typography.weightBold,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: borders.chunky,
    borderTopColor: colours.ink,
  },
  rowText: {
    flex: 1,
    gap: spacing.xs,
  },
  rowTitle: {
    color: colours.ink,
    fontSize: typography.bodySize,
    fontWeight: typography.weightBold,
  },
  rowCaption: {
    color: colours.muted,
    fontSize: typography.captionSize,
    lineHeight: 18,
  },
  flag: {
    color: colours.ink,
    fontSize: typography.bodySize,
    fontWeight: typography.weightBold,
  },
  error: {
    color: colours.danger,
    fontSize: typography.captionSize,
    fontWeight: typography.weightMedium,
  },
  status: {
    color: colours.success,
    fontSize: typography.captionSize,
    fontWeight: typography.weightMedium,
  },
  sitesBlock: {
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: borders.chunky,
    borderTopColor: colours.ink,
  },
});
