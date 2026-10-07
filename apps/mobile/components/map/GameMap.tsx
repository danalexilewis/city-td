import {
  h3Adapter,
  metresPerPoint,
  metresToPoints,
  squareAdapter,
  type GridAdapter,
} from '@city-td/game-core';
import {
  Camera,
  GeoJSONSource,
  Images,
  Layer,
  Map,
  UserLocation,
  type CameraRef,
  type LngLatBounds,
  type MapRef,
  type StyleSpecification,
  type ViewStateChangeEvent,
} from '@maplibre/maplibre-react-native';
import { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  type NativeSyntheticEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import cartoonStyleJson from '@/assets/map/cartoon-style.json';
import { AutoCollectBanner } from '@/components/map/AutoCollectBanner';
import { DebugHud } from '@/components/map/DebugHud';
import { MapChrome } from '@/components/map/MapChrome';
import { WalletBar } from '@/components/map/WalletBar';
import { StructureLayers } from '@/components/structures/StructureLayers';
import { StructureSheet } from '@/components/structures/StructureSheet';
import { useAuth } from '@/lib/auth/AuthProvider';
import { useLocationLoop } from '@/lib/location';
import {
  APPROX_CELL_METRES,
  CAMERA,
  WELLINGTON_CENTER,
  type CameraMode,
} from '@/lib/map/constants';
import {
  multiPolygonToOutlineLines,
  plotsAndBoardsToGeoJSON,
  sitesToGeoJSON,
} from '@/lib/map/plotGeojson';
import {
  fetchSitesInBbox,
  type MapSite,
} from '@/lib/map/sites';
import type { PlayerPose } from '@/lib/structures/types';
import { useStructuresInView } from '@/lib/structures/useStructuresInView';
import { colours } from '@/theme';

const cartoonStyle = cartoonStyleJson as StyleSpecification;

const SITE_IMAGES = {
  'site-intersection': require('@/assets/map/icons/site-intersection.png'),
  'site-landmark': require('@/assets/map/icons/site-landmark.png'),
  'site-stop': require('@/assets/map/icons/site-stop.png'),
  'site-station': require('@/assets/map/icons/site-station.png'),
  'site-own': require('@/assets/map/icons/site-own.png'),
  'site-cluster': require('@/assets/map/icons/site-cluster.png'),
} as const;

const EMPTY_FC: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

/**
 * MapLibre map: cartoon basemap, camera modes, plots, sites, structures, HUD.
 */
export function GameMap() {
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const mapRef = useRef<MapRef>(null);
  const cameraRef = useRef<CameraRef>(null);
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [cameraMode, setCameraMode] = useState<CameraMode>('street');
  const [useSquareGrid, setUseSquareGrid] = useState(false);
  const [zoom, setZoom] = useState(CAMERA.streetDefaultZoom);
  const [centerLat, setCenterLat] = useState<number>(WELLINGTON_CENTER.lat);
  const [centerLng, setCenterLng] = useState<number>(WELLINGTON_CENTER.lng);
  const [sites, setSites] = useState<MapSite[]>([]);
  const [sitesSource, setSitesSource] = useState<'rpc' | 'mock' | 'empty'>(
    'mock',
  );
  const [buildCellId, setBuildCellId] = useState<string | null>(null);
  const [isBuildSheetOpen, setIsBuildSheetOpen] = useState(false);
  const [buildIsPlotCell, setBuildIsPlotCell] = useState(false);

  const location = useLocationLoop({ sites });
  const {
    structures,
    byCellId: structuresByCell,
    refresh: refreshStructures,
  } = useStructuresInView({
    sites,
    enabled: cameraMode === 'street',
  });

  const playerPose: PlayerPose | null = location.position
    ? {
        lat: location.position.lat,
        lng: location.position.lng,
        gateLocked: location.isGateLocked,
      }
    : null;

  const [wasGateLocked, setWasGateLocked] = useState(location.isGateLocked);
  if (location.isGateLocked !== wasGateLocked) {
    setWasGateLocked(location.isGateLocked);
    if (location.isGateLocked) {
      setIsBuildSheetOpen(false);
    }
  }

  const grid: GridAdapter = useSquareGrid ? squareAdapter : h3Adapter;
  const showPlots =
    cameraMode === 'street' && zoom >= CAMERA.plotsVisibleFromZoom;

  const siteGeojson = sitesToGeoJSON(sites);
  const plotGeo =
    showPlots
      ? plotsAndBoardsToGeoJSON({
          sites,
          grid,
        })
      : { cells: EMPTY_FC, boards: EMPTY_FC };
  const boardOutlines = multiPolygonToOutlineLines(plotGeo.boards);
  const plotCellIdSet = new Set(
    plotGeo.cells.features
      .map((feature) => feature.properties?.cellId)
      .filter((id): id is string => typeof id === 'string'),
  );

  const playerLat = location.position?.lat ?? centerLat;
  const playerLng = location.position?.lng ?? centerLng;
  const mpp = metresPerPoint(playerLat, zoom);
  const cellSizePoints = metresToPoints({
    metres: APPROX_CELL_METRES,
    latDegrees: playerLat,
    zoom,
  });
  const currentCell =
    location.cellR12 ??
    grid.cellAt({ lat: playerLat, lng: playerLng });

  useEffect(function loadInitialSites() {
    let cancelled = false;

    async function load() {
      const pad = 0.02;
      const result = await fetchSitesInBbox({
        minLng: WELLINGTON_CENTER.lng - pad,
        minLat: WELLINGTON_CENTER.lat - pad,
        maxLng: WELLINGTON_CENTER.lng + pad,
        maxLat: WELLINGTON_CENTER.lat + pad,
      });
      if (cancelled) {
        return;
      }
      setSites(result.sites);
      setSitesSource(result.source);
    }

    load().catch((error: unknown) => {
      console.warn('initial site fetch failed', error);
    });

    return function cleanup() {
      cancelled = true;
    };
  }, []);

  useEffect(
    function cleanupFetchTimer() {
      return function onUnmount() {
        if (fetchTimerRef.current) {
          clearTimeout(fetchTimerRef.current);
        }
      };
    },
    [],
  );

  function scheduleSiteFetch(bounds: LngLatBounds) {
    if (fetchTimerRef.current) {
      clearTimeout(fetchTimerRef.current);
    }
    const [west, south, east, north] = bounds;
    fetchTimerRef.current = setTimeout(() => {
      fetchSitesInBbox({
        minLng: west,
        minLat: south,
        maxLng: east,
        maxLat: north,
      })
        .then((result) => {
          setSites(result.sites);
          setSitesSource(result.source);
        })
        .catch((error: unknown) => {
          console.warn('bbox site fetch failed', error);
        });
    }, 350);
  }

  function handleRegionChange(
    event: NativeSyntheticEvent<ViewStateChangeEvent>,
  ) {
    const next = event.nativeEvent;
    setZoom(next.zoom);
    setCenterLat(next.center[1]);
    setCenterLng(next.center[0]);
    scheduleSiteFetch(next.bounds);
  }

  function handleCameraModeChange(mode: CameraMode) {
    setCameraMode(mode);
    if (mode === 'street') {
      cameraRef.current?.easeTo({
        center: [centerLng, centerLat],
        zoom: CAMERA.streetDefaultZoom,
        duration: 400,
      });
      return;
    }
    const overviewZoom = Math.min(zoom, CAMERA.overviewMaxZoom);
    cameraRef.current?.easeTo({
      center: [centerLng, centerLat],
      zoom: Math.max(overviewZoom, 12),
      duration: 400,
    });
  }

  function openBuildOrZoom(args: {
    lng: number;
    lat: number;
    /** Display/grid cell from the tap; build sheet always uses H3. */
    cellId?: string;
    isPlotCell?: boolean;
  }) {
    if (location.isGateLocked) {
      return;
    }

    // Server stores H3 only; square lab cells are view-only.
    const h3CellId = h3Adapter.cellAt({ lat: args.lat, lng: args.lng });
    const tappedIsPlot =
      args.isPlotCell === true ||
      (args.cellId ? plotCellIdSet.has(args.cellId) : false) ||
      plotCellIdSet.has(h3CellId);

    if (zoom >= CAMERA.buildFromZoom) {
      setBuildCellId(h3CellId);
      setBuildIsPlotCell(tappedIsPlot);
      setIsBuildSheetOpen(true);
      return;
    }

    cameraRef.current?.easeTo({
      center: [args.lng, args.lat],
      zoom: CAMERA.streetDefaultZoom,
      duration: 450,
    });
    if (cameraMode !== 'street') {
      setCameraMode('street');
    }
  }

  function handleMapPress(
    event: NativeSyntheticEvent<{
      lngLat: [number, number];
      features?: GeoJSON.Feature[];
    }>,
  ) {
    if (location.isGateLocked) {
      return;
    }

    const [lng, lat] = event.nativeEvent.lngLat;
    const features = event.nativeEvent.features ?? [];
    const cellFeature = features.find(
      (feature) =>
        feature.properties &&
        typeof feature.properties.cellId === 'string',
    );
    openBuildOrZoom({
      lng,
      lat,
      cellId: cellFeature?.properties?.cellId as string | undefined,
    });
  }

  const minZoom =
    cameraMode === 'street' ? CAMERA.streetMinZoom : CAMERA.overviewMinZoom;
  const maxZoom =
    cameraMode === 'street' ? CAMERA.streetMaxZoom : CAMERA.overviewMaxZoom;

  return (
    <View style={styles.root}>
      <Map
        ref={mapRef}
        style={styles.map}
        mapStyle={cartoonStyle}
        attribution={false}
        logo={false}
        compass
        compassPosition={{ top: insets.top + 8, right: 8 }}
        scaleBar={false}
        touchPitch={false}
        onRegionDidChange={handleRegionChange}
        onPress={handleMapPress}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{
            center: [WELLINGTON_CENTER.lng, WELLINGTON_CENTER.lat],
            zoom: CAMERA.streetDefaultZoom,
            pitch: 0,
            bearing: 0,
          }}
          minZoom={minZoom}
          maxZoom={maxZoom}
          trackUserLocation={
            cameraMode === 'street' ? 'default' : undefined
          }
        />

        <UserLocation />

        <Images images={SITE_IMAGES} />

        {showPlots ? (
          <>
            <GeoJSONSource
              id="plot-cells"
              data={plotGeo.cells}
              onPress={(event) => {
                const [lng, lat] = event.nativeEvent.lngLat;
                const cellId = event.nativeEvent.features[0]?.properties
                  ?.cellId as string | undefined;
                openBuildOrZoom({
                  lng,
                  lat,
                  cellId,
                  isPlotCell: true,
                });
                event.stopPropagation();
              }}
            >
              <Layer
                id="plot-cells-fill"
                type="fill"
                paint={{
                  'fill-color': colours.path,
                  'fill-opacity': 0.22,
                }}
              />
              <Layer
                id="plot-cells-line"
                type="line"
                paint={{
                  'line-color': colours.ink,
                  'line-width': 1.5,
                  'line-opacity': 0.55,
                }}
              />
            </GeoJSONSource>

            <GeoJSONSource id="board-outlines" data={boardOutlines}>
              <Layer
                id="board-outline-line"
                type="line"
                paint={{
                  'line-color': colours.building,
                  'line-width': 3,
                  'line-opacity': 0.9,
                }}
                layout={{
                  'line-cap': 'round',
                  'line-join': 'round',
                }}
              />
            </GeoJSONSource>
          </>
        ) : null}

        <GeoJSONSource
          id="sites"
          data={siteGeojson}
          cluster={cameraMode === 'overview'}
          clusterRadius={48}
          clusterMaxZoom={14}
          onPress={(event) => {
            if (location.isGateLocked) {
              event.stopPropagation();
              return;
            }
            const feature = event.nativeEvent.features[0];
            if (!feature) {
              return;
            }
            if (
              feature.properties &&
              feature.properties.cluster === true &&
              typeof feature.properties.cluster_id === 'number'
            ) {
              return;
            }
            if (feature.geometry.type !== 'Point') {
              return;
            }
            const [lng, lat] = feature.geometry.coordinates;
            cameraRef.current?.easeTo({
              center: [lng, lat],
              zoom: Math.max(zoom, CAMERA.streetDefaultZoom),
              duration: 400,
            });
          }}
        >
          {cameraMode === 'overview' ? (
            <Layer
              id="sites-clusters"
              type="symbol"
              filter={['has', 'point_count']}
              layout={{
                'icon-image': 'site-cluster',
                'icon-size': 1,
                'icon-allow-overlap': true,
                'text-field': ['get', 'point_count_abbreviated'],
                'text-font': ['Noto Sans Bold'],
                'text-size': 12,
                'text-allow-overlap': true,
              }}
              paint={{
                'text-color': colours.ink,
              }}
            />
          ) : null}
          <Layer
            id="sites-icons"
            type="symbol"
            filter={['!', ['has', 'point_count']]}
            layout={{
              'icon-image': ['get', 'icon'],
              'icon-size': cameraMode === 'street' ? 0.85 : 0.7,
              'icon-allow-overlap': true,
              'icon-ignore-placement': true,
            }}
          />
        </GeoJSONSource>

        <StructureLayers
          structures={structures}
          visible={showPlots}
          onStructurePress={({ cellId }) => {
            const centre = h3Adapter.centreOf(cellId);
            openBuildOrZoom({
              lng: centre.lng,
              lat: centre.lat,
              cellId,
              isPlotCell: true,
            });
          }}
        />
      </Map>

      <View
        style={[styles.overlayTop, { paddingTop: insets.top + 8 }]}
        pointerEvents="box-none"
      >
        <MapChrome
          cameraMode={cameraMode}
          useSquareGrid={useSquareGrid}
          onCameraModeChange={handleCameraModeChange}
          onSquareGridChange={setUseSquareGrid}
        />
        {location.isGateLocked ? (
          <View style={styles.bannerSlot}>
            <AutoCollectBanner
              speedKmh={location.speedKmh}
              lastCollectNote={location.lastCollectNote}
            />
          </View>
        ) : null}
      </View>

      <View
        style={[styles.overlayBottom, { paddingBottom: insets.bottom + 8 }]}
        pointerEvents="box-none"
      >
        <WalletBar wallet={location.wallet} />
        <DebugHud
          zoom={zoom}
          metresPerPoint={mpp}
          cellSizePoints={cellSizePoints}
          gpsAccuracyM={location.position?.accuracyM ?? null}
          speedKmh={location.speedKmh}
          gateState={
            location.permissionError
              ? 'denied'
              : location.permissionGranted
                ? location.gateState
                : '…'
          }
          currentCell={currentCell}
          playersNearby={location.playersNearby}
          nearestStock={location.nearestStockLabel}
          debugLogging={profile?.debug_logging ?? null}
          sitesSource={sitesSource}
          gridKind={grid.kind}
          cameraMode={cameraMode}
        />
      </View>

      <StructureSheet
        visible={isBuildSheetOpen}
        cellId={buildCellId}
        structure={buildCellId ? (structuresByCell[buildCellId] ?? null) : null}
        isPlotCellHint={buildIsPlotCell}
        player={playerPose}
        onClose={() => setIsBuildSheetOpen(false)}
        onChanged={() => {
          void refreshStructures();
          void location.refreshWallet();
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colours.grass,
  },
  map: {
    flex: 1,
  },
  overlayTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
  },
  overlayBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 10,
    gap: 8,
  },
  bannerSlot: {
    marginTop: 8,
  },
});
