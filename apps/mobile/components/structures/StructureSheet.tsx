import { BALANCE, type StructureType } from '@city-td/game-core';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Button } from '@/components/ui/Button';
import { useAuth } from '@/lib/auth/AuthProvider';
import {
  careStructure,
  debugDamage,
  fetchOwnWallet,
  isPlotCell,
  placeStructure,
  rebuildRubble,
  removeStructure,
} from '@/lib/structures/api';
import { isWithinCellReach, metresToCell } from '@/lib/structures/reach';
import type {
  CareAction,
  PlayerPose,
  StructureRow,
  WalletRow,
} from '@/lib/structures/types';
import {
  ammoCapacityFor,
  canRebuild,
  isBoosted,
  placeCostMaterials,
  rebuildCostMaterials,
  structureViewState,
} from '@/lib/structures/viewState';
import { borders, colours, radii, spacing, typography } from '@/theme';

const BUILD_TYPES: StructureType[] = ['wall', 'turret', 'garrison'];

export type StructureSheetProps = {
  visible: boolean;
  cellId: string | null;
  structure: StructureRow | null;
  /** True when the cell is known to be inside a plot (from map plots). */
  isPlotCellHint?: boolean;
  player: PlayerPose | null;
  onClose: () => void;
  onChanged: () => void;
};

/**
 * Build / care / rebuild / remove sheet for a tapped plot cell.
 */
export function StructureSheet(props: StructureSheetProps) {
  const { profile, session } = useAuth();
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [isPlot, setIsPlot] = useState(Boolean(props.isPlotCellHint));
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [localStructure, setLocalStructure] = useState<StructureRow | null>(
    props.structure,
  );

  const cellId = props.cellId;
  const inReach = cellId
    ? isWithinCellReach({ player: props.player, cellR12: cellId })
    : false;
  const distanceM = cellId
    ? metresToCell({ player: props.player, cellR12: cellId })
    : null;
  const gateLocked = Boolean(props.player?.gateLocked);
  const actionsLocked = gateLocked || !inReach || !props.player;
  const isTeam = Boolean(profile?.is_team);
  const userId = session?.user.id ?? null;

  useEffect(
    function syncStructureProp() {
      setLocalStructure(props.structure);
      setMessage(null);
    },
    [props.structure, props.cellId, props.visible],
  );

  useEffect(
    function loadSheetContext() {
      if (!props.visible || !cellId) {
        return;
      }

      let cancelled = false;

      async function load() {
        const [walletResult, plotResult] = await Promise.all([
          fetchOwnWallet(),
          props.isPlotCellHint
            ? Promise.resolve({ isPlot: true, error: null })
            : isPlotCell({ cellR12: cellId! }),
        ]);

        if (cancelled) {
          return;
        }

        setWallet(walletResult.wallet);
        setIsPlot(plotResult.isPlot);
        if (walletResult.error) {
          setMessage(walletResult.error);
        } else if (plotResult.error) {
          setMessage(plotResult.error);
        }
      }

      load().catch((error: unknown) => {
        console.warn('structure sheet context failed', error);
      });

      return function cleanup() {
        cancelled = true;
      };
    },
    [props.visible, cellId, props.isPlotCellHint],
  );

  async function runAction(
    actionKey: string,
    work: () => Promise<{ error: string | null; structure?: StructureRow | null }>,
  ) {
    setBusyAction(actionKey);
    setMessage(null);
    try {
      const result = await work();
      if (result.error) {
        setMessage(result.error);
        return;
      }
      if (result.structure !== undefined) {
        setLocalStructure(result.structure);
      }
      const walletRefresh = await fetchOwnWallet();
      setWallet(walletRefresh.wallet);
      props.onChanged();
    } catch (error: unknown) {
      setMessage(error instanceof Error ? error.message : 'Action failed');
    } finally {
      setBusyAction(null);
    }
  }

  function requirePose(): { lng: number; lat: number } | null {
    if (!props.player) {
      setMessage('Waiting for your location…');
      return null;
    }
    if (props.player.gateLocked) {
      setMessage('Moving too fast — actions locked.');
      return null;
    }
    if (!inReach) {
      setMessage('Out of reach (need ~40 m).');
      return null;
    }
    return { lng: props.player.lng, lat: props.player.lat };
  }

  function handlePlace(type: StructureType) {
    const pose = requirePose();
    if (!pose || !cellId) {
      return;
    }
    void runAction(`place:${type}`, async () => {
      const result = await placeStructure({
        cellR12: cellId,
        type,
        lng: pose.lng,
        lat: pose.lat,
      });
      return { error: result.error, structure: result.structure };
    });
  }

  function handleCare(action: CareAction) {
    const pose = requirePose();
    if (!pose || !localStructure) {
      return;
    }
    void runAction(`care:${action}`, async () => {
      const result = await careStructure({
        structureId: localStructure.id,
        action,
        lng: pose.lng,
        lat: pose.lat,
      });
      return { error: result.error, structure: result.structure };
    });
  }

  function handleRebuild() {
    const pose = requirePose();
    if (!pose || !localStructure) {
      return;
    }
    void runAction('rebuild', async () => {
      const result = await rebuildRubble({
        structureId: localStructure.id,
        lng: pose.lng,
        lat: pose.lat,
      });
      return { error: result.error, structure: result.structure };
    });
  }

  function handleRemove() {
    const pose = requirePose();
    if (!pose || !localStructure) {
      return;
    }
    void runAction('remove', async () => {
      const result = await removeStructure({
        structureId: localStructure.id,
        lng: pose.lng,
        lat: pose.lat,
      });
      if (!result.error) {
        setLocalStructure(null);
      }
      return { error: result.error, structure: null };
    });
  }

  function handleDebugDamage() {
    if (!localStructure || !isTeam) {
      return;
    }
    const damage = Math.max(
      1,
      Math.round(Number(localStructure.max_health) * 0.1),
    );
    void runAction('debug_damage', async () => {
      const result = await debugDamage({
        structureId: localStructure.id,
        damage,
      });
      return { error: result.error, structure: result.structure };
    });
  }

  const now = new Date();
  const state = localStructure
    ? structureViewState(localStructure, now)
    : null;
  const isOwner =
    Boolean(userId) && localStructure?.owner_id === userId;

  return (
    <Modal
      visible={props.visible}
      transparent
      animationType="slide"
      onRequestClose={props.onClose}
    >
      <Pressable style={styles.backdrop} onPress={props.onClose}>
        <Pressable
          style={styles.sheet}
          onPress={(event) => event.stopPropagation()}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>
              {state === 'rubble'
                ? 'Rubble'
                : localStructure
                  ? titleForType(localStructure.type)
                  : 'Build'}
            </Text>

            <Text style={styles.meta}>
              Cell {cellId ?? '—'}
              {distanceM !== null ? ` · ${Math.round(distanceM)} m` : ''}
              {gateLocked ? ' · gate locked' : ''}
              {!props.player ? ' · no GPS yet' : ''}
              {props.player && !inReach ? ' · out of reach' : ''}
            </Text>

            {wallet ? (
              <Text style={styles.wallet}>
                Wallet · mat {fmt(wallet.materials)} · ammo {fmt(wallet.ammo)} ·
                power {fmt(wallet.power)}
              </Text>
            ) : (
              <Text style={styles.wallet}>Wallet unavailable</Text>
            )}

            {message ? <Text style={styles.message}>{message}</Text> : null}

            {!localStructure && !isPlot ? (
              <Text style={styles.body}>
                This cell is not a build plot. Walk onto a site plot (highlighted
                cells) to place a wall, turret or garrison.
              </Text>
            ) : null}

            {!localStructure && isPlot ? (
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Place one structure</Text>
                {BUILD_TYPES.map((type) => {
                  const cost = placeCostMaterials(type);
                  const canAfford =
                    wallet !== null && wallet.materials >= cost;
                  return (
                    <Button
                      key={type}
                      label={`${titleForType(type)} · ${cost} mat`}
                      disabled={actionsLocked || !canAfford || busyAction !== null}
                      loading={busyAction === `place:${type}`}
                      onPress={() => handlePlace(type)}
                    />
                  );
                })}
              </View>
            ) : null}

            {localStructure && state === 'active' ? (
              <View style={styles.section}>
                <Text style={styles.body}>
                  HP {fmt(localStructure.health)} /{' '}
                  {fmt(localStructure.max_health)}
                  {ammoCapacityFor(localStructure.type) > 0
                    ? ` · ammo ${fmt(localStructure.ammo)} / ${ammoCapacityFor(localStructure.type)}`
                    : ''}
                  {isBoosted(localStructure, now) ? ' · boosted' : ''}
                </Text>

                <Button
                  label={`Repair · ${repairCostLabel(localStructure)} mat`}
                  disabled={
                    actionsLocked ||
                    busyAction !== null ||
                    Number(localStructure.health) >=
                      Number(localStructure.max_health)
                  }
                  loading={busyAction === 'care:repair'}
                  onPress={() => handleCare('repair')}
                />
                {ammoCapacityFor(localStructure.type) > 0 ? (
                  <Button
                    label={`Load ammo · ${BALANCE.structures.loadAmmoPerAction}`}
                    disabled={actionsLocked || busyAction !== null}
                    loading={busyAction === 'care:load'}
                    onPress={() => handleCare('load')}
                  />
                ) : null}
                <Button
                  label="Boost 24h · power"
                  disabled={actionsLocked || busyAction !== null}
                  loading={busyAction === 'care:boost'}
                  onPress={() => handleCare('boost')}
                />

                {isOwner ? (
                  <Button
                    label="Remove (owner)"
                    variant="danger"
                    disabled={actionsLocked || busyAction !== null}
                    loading={busyAction === 'remove'}
                    onPress={handleRemove}
                  />
                ) : (
                  <Text style={styles.caption}>
                    Only the owner can remove this structure. Anyone can repair,
                    load or boost.
                  </Text>
                )}

                {isTeam ? (
                  <Button
                    label="Debug damage 10%"
                    variant="secondary"
                    disabled={busyAction !== null}
                    loading={busyAction === 'debug_damage'}
                    onPress={handleDebugDamage}
                  />
                ) : null}
              </View>
            ) : null}

            {localStructure && state === 'rubble' && canRebuild(localStructure, now) ? (
              <View style={styles.section}>
                <Text style={styles.body}>
                  Rebuild within 7 days at half cost — you become the owner.
                </Text>
                <Button
                  label={`Rebuild ${titleForType(localStructure.type)} · ${rebuildCostMaterials(localStructure.type)} mat`}
                  disabled={actionsLocked || busyAction !== null}
                  loading={busyAction === 'rebuild'}
                  onPress={handleRebuild}
                />
                <Text style={styles.caption}>
                  Half of place cost ({placeCostMaterials(localStructure.type)}{' '}
                  mat).
                </Text>
              </View>
            ) : null}

            {busyAction && !message ? (
              <ActivityIndicator color={colours.ink} />
            ) : null}

            <Button
              label="Close"
              variant="secondary"
              onPress={props.onClose}
              disabled={busyAction !== null}
            />
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function titleForType(type: StructureType): string {
  if (type === 'wall') {
    return 'Wall';
  }
  if (type === 'turret') {
    return 'Turret';
  }
  return 'Garrison';
}

function fmt(value: number): string {
  return String(Math.round(Number(value)));
}

function repairCostLabel(row: StructureRow): string {
  const missing = Math.max(
    0,
    Number(row.max_health) - Number(row.health),
  );
  return fmt(missing * BALANCE.structures.repairMaterialsPerHealth);
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(31, 42, 36, 0.35)',
  },
  sheet: {
    maxHeight: '78%',
    backgroundColor: colours.panel,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    borderColor: colours.ink,
    borderWidth: borders.chunky,
    borderBottomWidth: 0,
    padding: spacing.lg,
  },
  scroll: {
    gap: spacing.md,
    paddingBottom: spacing.md,
  },
  title: {
    color: colours.ink,
    fontSize: typography.headingSize,
    fontWeight: typography.weightBold,
  },
  meta: {
    color: colours.muted,
    fontSize: typography.captionSize,
  },
  wallet: {
    color: colours.ink,
    fontSize: typography.captionSize,
    fontWeight: typography.weightMedium,
  },
  message: {
    color: colours.danger,
    fontSize: typography.bodySize,
  },
  body: {
    color: colours.ink,
    fontSize: typography.bodySize,
    lineHeight: 22,
  },
  caption: {
    color: colours.muted,
    fontSize: typography.captionSize,
    lineHeight: 18,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colours.ink,
    fontSize: typography.bodySize,
    fontWeight: typography.weightBold,
  },
});
