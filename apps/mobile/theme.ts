/**
 * Brand colours and chunky cartoon UI tokens.
 * No UI kit — screens compose React Native primitives with these values.
 */
export const colours = {
  sky: '#7EC8E3',
  grass: '#6FBF73',
  path: '#F2D16B',
  road: '#F4A261',
  water: '#4A90A4',
  building: '#E76F51',
  ink: '#1F2A24',
  paper: '#FFF8E7',
  panel: '#FFE8A3',
  success: '#2A9D8F',
  danger: '#E63946',
  muted: '#6B7C72',
  team: '#2A9D8F',
  rival: '#E76F51',
  materials: '#C0842A',
  ammo: '#457B9D',
  power: '#E9C46A',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radii = {
  sm: 8,
  md: 14,
  lg: 22,
  pill: 999,
} as const;

export const typography = {
  titleSize: 28,
  headingSize: 22,
  bodySize: 16,
  captionSize: 13,
  weightBold: '800' as const,
  weightMedium: '600' as const,
  weightRegular: '400' as const,
};

export const borders = {
  chunky: 3,
  thick: 4,
} as const;

export const theme = {
  colours,
  spacing,
  radii,
  typography,
  borders,
} as const;

export type Theme = typeof theme;
