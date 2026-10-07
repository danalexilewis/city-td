import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/lib/auth/AuthProvider';
import { borders, colours, radii, spacing, typography } from '@/theme';

/**
 * Email one-time-code sign-in (Supabase OTP).
 */
export default function SignInScreen() {
  const { requestOtp, verifyOtp } = useAuth();
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  async function handleSendCode() {
    setErrorMessage(null);
    setIsSending(true);
    const result = await requestOtp({ email });
    setIsSending(false);

    if (result.error) {
      setErrorMessage(result.error);
      return;
    }

    setCodeSent(true);
  }

  async function handleVerifyCode() {
    setErrorMessage(null);
    setIsVerifying(true);
    const result = await verifyOtp({ email, token });
    setIsVerifying(false);

    if (result.error) {
      setErrorMessage(result.error);
    }
  }

  return (
    <Screen scroll>
      <View style={styles.panel}>
        <Text style={styles.title}>City TD</Text>
        <Text style={styles.body}>
          Sign in with a one-time code emailed to you. No password.
        </Text>

        <TextField
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          editable={!isSending && !isVerifying}
        />

        {codeSent ? (
          <TextField
            label="6-digit code"
            value={token}
            onChangeText={setToken}
            placeholder="123456"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="one-time-code"
            maxLength={8}
            editable={!isVerifying}
          />
        ) : null}

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}

        {!codeSent ? (
          <Button
            label="Email me a code"
            onPress={handleSendCode}
            loading={isSending}
            disabled={isSending}
          />
        ) : (
          <View style={styles.actions}>
            <Button
              label="Verify and continue"
              onPress={handleVerifyCode}
              loading={isVerifying}
              disabled={isVerifying}
            />
            <Button
              label="Resend code"
              variant="secondary"
              onPress={handleSendCode}
              loading={isSending}
              disabled={isSending || isVerifying}
            />
          </View>
        )}
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
  actions: {
    gap: spacing.sm,
  },
});
