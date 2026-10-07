import { GeoJSONSource, Images, Layer } from '@maplibre/maplibre-react-native';

import {
  STRUCTURE_HEALTH_COLORS,
  structuresToGeoJSON,
} from '@/lib/structures/structureGeojson';
import type { StructureRow } from '@/lib/structures/types';
import { colours } from '@/theme';

const STRUCTURE_IMAGES = {
  'structure-wall': require('@/assets/map/icons/structure-wall.png'),
  'structure-turret': require('@/assets/map/icons/structure-turret.png'),
  'structure-garrison': require('@/assets/map/icons/structure-garrison.png'),
  'structure-rubble': require('@/assets/map/icons/structure-rubble.png'),
} as const;

export type StructureLayersProps = {
  structures: readonly StructureRow[];
  visible: boolean;
  onStructurePress: (args: { cellId: string; structureId: string }) => void;
};

/**
 * MapLibre layers: boost glow, health ring, structure/rubble icon, ammo dots.
 */
export function StructureLayers(props: StructureLayersProps) {
  if (!props.visible) {
    return null;
  }

  const geojson = structuresToGeoJSON(props.structures);

  return (
    <>
      <Images images={STRUCTURE_IMAGES} />

      <GeoJSONSource
        id="structures"
        data={geojson}
        onPress={(event) => {
          const feature = event.nativeEvent.features[0];
          const cellId = feature?.properties?.cellId;
          const structureId = feature?.properties?.structureId;
          if (typeof cellId === 'string' && typeof structureId === 'string') {
            props.onStructurePress({ cellId, structureId });
          }
          event.stopPropagation();
        }}
      >
        <Layer
          id="structures-boost-glow"
          type="circle"
          filter={['==', ['get', 'boosted'], 1]}
          paint={{
            'circle-radius': 22,
            'circle-color': colours.power,
            'circle-opacity': 0.35,
            'circle-blur': 0.6,
          }}
        />

        <Layer
          id="structures-health-ring"
          type="circle"
          filter={['==', ['get', 'state'], 'active']}
          paint={{
            'circle-radius': 16,
            'circle-color': 'rgba(0,0,0,0)',
            'circle-stroke-width': 3.5,
            'circle-stroke-color': [
              'interpolate',
              ['linear'],
              ['get', 'healthRatio'],
              0,
              STRUCTURE_HEALTH_COLORS.low,
              0.45,
              STRUCTURE_HEALTH_COLORS.mid,
              1,
              STRUCTURE_HEALTH_COLORS.high,
            ],
            'circle-stroke-opacity': 0.95,
          }}
        />

        <Layer
          id="structures-icons"
          type="symbol"
          layout={{
            'icon-image': ['get', 'icon'],
            'icon-size': 0.75,
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          }}
        />

        <Layer
          id="structures-ammo-dots"
          type="symbol"
          filter={[
            'all',
            ['==', ['get', 'state'], 'active'],
            ['>', ['get', 'ammoRatio'], 0],
          ]}
          layout={{
            'text-field': ['get', 'ammoDots'],
            'text-size': 10,
            'text-offset': [0, 1.6],
            'text-anchor': 'top',
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          }}
          paint={{
            'text-color': colours.ammo,
            'text-halo-color': colours.paper,
            'text-halo-width': 1.2,
          }}
        />
      </GeoJSONSource>
    </>
  );
}
