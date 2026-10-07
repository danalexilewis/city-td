import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { Button } from '@/components/ui/Button';
import { Screen } from '@/components/ui/Screen';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  listPendingOwnSites,
  reviewSite,
  sitePhotoPublicUrl,
} from '@/lib/proposals/api';
import type { PendingOwnSite } from '@/lib/proposals/types';
import { borders, colours, radii, spacing, typography } from '@/theme';

/**
 * Team-only queue of pending own_sites; approve / reject via `review_site`.
 */
export default function ReviewSitesScreen() {
  const { profile, isLoading: isAuthLoading } = useAuth();
  const [sites, setSites] = useState<PendingOwnSite[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [busySiteId, setBusySiteId] = useState<string | null>(null);

  useEffect(
    function gateAndLoad() {
      if (isAuthLoading) {
        return;
      }
      if (!profile?.is_team) {
        router.replace('/settings');
        return;
      }
      void loadQueue({ refreshing: false });
    },
    [isAuthLoading, profile?.is_team],
  );

  async function loadQueue(args: { refreshing: boolean }) {
    if (args.refreshing) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);

    const result = await listPendingOwnSites();
    if (result.error) {
      setErrorMessage(result.error);
      setSites([]);
    } else {
      setSites(result.data ?? []);
    }

    setIsLoading(false);
    setIsRefreshing(false);
  }

  async function handleDecision(args: {
    siteId: string;
    decision: 'approve' | 'reject';
  }) {
    setErrorMessage(null);
    setStatusMessage(null);
    setBusySiteId(args.siteId);

    const result = await reviewSite({
      siteId: args.siteId,
      decision: args.decision,
    });

    setBusySiteId(null);

    if (result.error) {
      setErrorMessage(result.error);
      return;
    }

    setSites(function removeReviewed(current) {
      return current.filter(function keepOthers(site) {
        return site.id !== args.siteId;
      });
    });
    setStatusMessage(
      args.decision === 'approve'
        ? 'Approved — site is live with stocks.'
        : 'Rejected.',
    );
  }

  if (!isAuthLoading && !profile?.is_team) {
    return (
      <Screen>
        <View style={styles.panel}>
          <Text style={styles.heading}>Team only</Text>
          <Text style={styles.caption}>
            Review queue is for moderator accounts.
          </Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen scroll>
      <View style={styles.panel}>
        <Text style={styles.heading}>Review proposals</Text>
        <Text style={styles.caption}>
          Pending player sites. Approve makes them live and seeds stocks; plot
          cells were stored when they proposed.
        </Text>

        <Button
          label="Refresh"
          variant="secondary"
          onPress={() => loadQueue({ refreshing: true })}
          loading={isRefreshing}
          disabled={isLoading || isRefreshing || busySiteId != null}
        />

        {errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
        {statusMessage ? (
          <Text style={styles.status}>{statusMessage}</Text>
        ) : null}

        {isLoading ? (
          <Text style={styles.caption}>Loading…</Text>
        ) : sites.length === 0 ? (
          <Text style={styles.empty}>No pending proposals.</Text>
        ) : (
          sites.map(function renderSite(site) {
            return (
              <ProposalCard
                key={site.id}
                site={site}
                busy={busySiteId === site.id}
                disabled={busySiteId != null}
                onApprove={() =>
                  handleDecision({ siteId: site.id, decision: 'approve' })
                }
                onReject={() =>
                  handleDecision({ siteId: site.id, decision: 'reject' })
                }
              />
            );
          })
        )}
      </View>
    </Screen>
  );
}

type ProposalCardProps = {
  site: PendingOwnSite;
  busy: boolean;
  disabled: boolean;
  onApprove: () => void;
  onReject: () => void;
};

function ProposalCard(props: ProposalCardProps) {
  const photoUrl = props.site.photo_path
    ? sitePhotoPublicUrl(props.site.photo_path)
    : null;
  const created = formatCreatedAt(props.site.created_at);

  return (
    <View style={styles.card}>
      {photoUrl ? (
        <Image source={{ uri: photoUrl }} style={styles.photo} />
      ) : (
        <View style={styles.photoMissing}>
          <Text style={styles.caption}>No photo</Text>
        </View>
      )}
      <Text style={styles.cardTitle}>{props.site.name}</Text>
      {props.site.description ? (
        <Text style={styles.caption}>{props.site.description}</Text>
      ) : null}
      <Text style={styles.meta}>
        {created} · cell {props.site.cell_r12.slice(0, 8)}…
      </Text>
      <View style={styles.actions}>
        <View style={styles.actionGrow}>
          <Button
            label="Approve"
            onPress={props.onApprove}
            loading={props.busy}
            disabled={props.disabled}
          />
        </View>
        <View style={styles.actionGrow}>
          <Button
            label="Reject"
            variant="danger"
            onPress={props.onReject}
            disabled={props.disabled}
          />
        </View>
      </View>
    </View>
  );
}

function formatCreatedAt(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
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
  empty: {
    color: colours.ink,
    fontSize: typography.bodySize,
    fontWeight: typography.weightMedium,
  },
  card: {
    backgroundColor: colours.paper,
    borderColor: colours.ink,
    borderWidth: borders.chunky,
    borderRadius: radii.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    color: colours.ink,
    fontSize: typography.bodySize,
    fontWeight: typography.weightBold,
  },
  meta: {
    color: colours.muted,
    fontSize: typography.captionSize,
  },
  photo: {
    width: '100%',
    height: 160,
    borderRadius: radii.sm,
    borderWidth: borders.chunky,
    borderColor: colours.ink,
    backgroundColor: colours.path,
  },
  photoMissing: {
    height: 80,
    borderRadius: radii.sm,
    borderWidth: borders.chunky,
    borderColor: colours.ink,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colours.path,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionGrow: {
    flex: 1,
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
