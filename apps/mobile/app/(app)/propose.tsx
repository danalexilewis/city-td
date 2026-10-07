import { useEffect, useState } from 'react';
import {
  Image,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { router } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { TextField } from '@/components/ui/TextField';
import { useAuth } from '@/lib/auth/AuthProvider';
import { proposeSite, uploadSitePhoto } from '@/lib/proposals/api';
import { borders, colours, radii, spacing, typography } from '@/theme';

type PlayerCoords = {
  lat: number;
  lng: number;
  accuracyM: number | null;
};

/**
 * Propose a site at the player's current location (name, photo, description).
 */
export default function ProposeSiteScreen() {
  const { session, profile } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [coords, setCoords] = useState<PlayerCoords | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(function loadLocation() {
    void refreshLocation();
  }, []);

  async function refreshLocation() {
    setIsLocating(true);
    setLocationError(null);

    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      setCoords(null);
      setLocationError('Location permission is required to propose a site here.');
      setIsLocating(false);
      return;
    }

    try {
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      setCoords({
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracyM: position.coords.accuracy,
      });
    } catch {
      setCoords(null);
      setLocationError('Could not read GPS. Try again outdoors with a clear sky.');
    }

    setIsLocating(false);
  }

  async function handleTakePhoto() {
    setErrorMessage(null);
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setErrorMessage('Camera permission is required for a site photo.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [4, 3],
    });

    if (result.canceled || !result.assets[0]?.uri) {
      return;
    }

    setPhotoUri(result.assets[0].uri);
  }

  async function handleSubmit() {
    setErrorMessage(null);
    setStatusMessage(null);

    const userId = session?.user.id;
    if (!userId) {
      setErrorMessage('Not signed in.');
      return;
    }
    if (!coords) {
      setErrorMessage('Wait for a GPS fix before submitting.');
      return;
    }
    if (!photoUri) {
      setErrorMessage('Take a photo of the place first.');
      return;
    }
    if (!name.trim()) {
      setErrorMessage('Give the site a short name.');
      return;
    }

    setIsSubmitting(true);

    const upload = await uploadSitePhoto({ userId, localUri: photoUri });
    if (upload.error || !upload.data) {
      setIsSubmitting(false);
      setErrorMessage(upload.error ?? 'Photo upload failed.');
      return;
    }

    const result = await proposeSite({
      name,
      description,
      photoPath: upload.data,
      lat: coords.lat,
      lng: coords.lng,
    });

    setIsSubmitting(false);

    if (result.error || !result.data) {
      setErrorMessage(result.error ?? 'Could not propose site.');
      return;
    }

    if (result.data.status === 'live' || profile?.is_team) {
      setStatusMessage('Site is live. Team proposals skip the review queue.');
    } else {
      setStatusMessage('Submitted for team review. Thanks!');
    }

    setTimeout(function goBack() {
      router.back();
    }, 1200);
  }

  const locationLabel = isLocating
    ? 'Getting GPS…'
    : coords
      ? `${coords.lat.toFixed(5)}, ${coords.lng.toFixed(5)}${
          coords.accuracyM != null
            ? ` (±${Math.round(coords.accuracyM)} m)`
            : ''
        }`
      : 'No fix';

  return (
    <Screen scroll>
      <View style={styles.panel}>
        <Text style={styles.heading}>Propose a site</Text>
        <Text style={styles.caption}>
          Uses your current location. Plot cells are computed on the phone and
          checked by the server (centres within 50 m).
        </Text>

        <View style={styles.locationBox}>
          <Text style={styles.rowTitle}>Location</Text>
          <Text style={styles.locationValue}>{locationLabel}</Text>
          {locationError ? (
            <Text style={styles.error}>{locationError}</Text>
          ) : null}
          <Button
            label="Refresh GPS"
            variant="secondary"
            onPress={refreshLocation}
            loading={isLocating}
            disabled={isLocating || isSubmitting}
          />
        </View>

        <TextField
          label="Name"
          value={name}
          onChangeText={setName}
          placeholder="e.g. Corner of Cuba & Dixon"
          autoCapitalize="words"
          maxLength={80}
          editable={!isSubmitting}
        />

        <TextField
          label="Short description"
          value={description}
          onChangeText={setDescription}
          placeholder="Why is this a good place?"
          autoCapitalize="sentences"
          maxLength={280}
          multiline
          numberOfLines={3}
          editable={!isSubmitting}
        />

        <View style={styles.photoBlock}>
          <Text style={styles.rowTitle}>Photo</Text>
          {photoUri ? (
            <Image source={{ uri: photoUri }} style={styles.photo} />
          ) : (
            <View style={styles.photoPlaceholder}>
              <Text style={styles.caption}>Camera only — no library picks.</Text>
            </View>
          )}
          <Button
            label={photoUri ? 'Retake photo' : 'Take photo'}
            variant="secondary"
            onPress={handleTakePhoto}
            disabled={isSubmitting}
          />
        </View>

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        {statusMessage ? (
          <Text style={styles.status}>{statusMessage}</Text>
        ) : null}

        <Button
          label="Submit proposal"
          onPress={handleSubmit}
          loading={isSubmitting}
          disabled={isSubmitting || isLocating || !coords}
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
  heading: {
    color: colours.ink,
    fontSize: typography.headingSize,
    fontWeight: typography.weightBold,
  },
  caption: {
    color: colours.muted,
    fontSize: typography.captionSize,
    lineHeight: 18,
  },
  locationBox: {
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    borderBottomWidth: borders.chunky,
    borderBottomColor: colours.ink,
  },
  rowTitle: {
    color: colours.ink,
    fontSize: typography.bodySize,
    fontWeight: typography.weightBold,
  },
  locationValue: {
    color: colours.ink,
    fontSize: typography.captionSize,
    fontWeight: typography.weightMedium,
  },
  photoBlock: {
    gap: spacing.sm,
  },
  photo: {
    width: '100%',
    height: 200,
    borderRadius: radii.md,
    borderWidth: borders.chunky,
    borderColor: colours.ink,
    backgroundColor: colours.paper,
  },
  photoPlaceholder: {
    height: 120,
    borderRadius: radii.md,
    borderWidth: borders.chunky,
    borderColor: colours.ink,
    borderStyle: 'dashed',
    backgroundColor: colours.paper,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
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
});
