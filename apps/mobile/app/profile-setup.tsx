import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/lib/auth/AuthProvider';
import { borders, colours, radii, spacing, typography } from '@/theme';

/**
 * First-run nickname setup before entering the main app.
 */
export default function ProfileSetupScreen() {
  const { saveNickname, signOut } = useAuth();
  const [nickname, setNickname] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  async function handleSave() {
    setErrorMessage(null);
    setIsSaving(true);
    const result = await saveNickname({ nickname });
    setIsSaving(false);

    if (result.error) {
      setErrorMessage(result.error);
    }
  }

  return (
    <Screen scroll>
      <View style={styles.panel}>
        <Text style={styles.title}>Pick a nickname</Text>
        <Text style={styles.body}>
          This is how other players see you on the map. You can change it later
          in Settings.
        </Text>

        <TextField
          label="Nickname"
          value={nickname}
          onChangeText={setNickname}
          placeholder="e.g. Kelburn Walker"
          autoCapitalize="words"
          autoCorrect={false}
          maxLength={24}
          editable={!isSaving}
        />

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        <Button
          label="Save and play"
          onPress={handleSave}
          loading={isSaving}
          disabled={isSaving}
        />
        <Button
          label="Sign out"
          variant="secondary"
          onPress={signOut}
          disabled={isSaving}
        />
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
  title: {
    color: colours.ink,
    fontSize: typography.titleSize,
    fontWeight: typography.weightBold,
  },
  body: {
    color: colours.ink,
    fontSize: typography.bodySize,
    lineHeight: 22,
  },
  error: {
    color: colours.danger,
    fontSize: typography.captionSize,
    fontWeight: typography.weightMedium,
  },
});
