import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { borders, colours, radii, spacing, typography } from '@/theme';

type TextFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  autoCorrect?: boolean;
  keyboardType?: TextInputProps['keyboardType'];
  textContentType?: TextInputProps['textContentType'];
  autoComplete?: TextInputProps['autoComplete'];
  editable?: boolean;
  maxLength?: number;
  multiline?: boolean;
  numberOfLines?: number;
};

/**
 * Labelled text input matching the cartoon theme tokens.
 */
export function TextField(props: TextFieldProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        placeholderTextColor={colours.muted}
        autoCapitalize={props.autoCapitalize}
        autoCorrect={props.autoCorrect}
        keyboardType={props.keyboardType}
        textContentType={props.textContentType}
        autoComplete={props.autoComplete}
        editable={props.editable}
        maxLength={props.maxLength}
        multiline={props.multiline}
        numberOfLines={props.numberOfLines}
        textAlignVertical={props.multiline ? 'top' : 'center'}
        style={[styles.input, props.multiline ? styles.multiline : null]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  label: {
    color: colours.ink,
    fontSize: typography.captionSize,
    fontWeight: typography.weightMedium,
  },
  input: {
    minHeight: 48,
    borderWidth: borders.chunky,
    borderColor: colours.ink,
    borderRadius: radii.md,
    backgroundColor: colours.paper,
    color: colours.ink,
    fontSize: typography.bodySize,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  multiline: {
    minHeight: 96,
    paddingTop: spacing.sm,
  },
});
