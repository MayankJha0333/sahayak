import { dark as darkPalette, light as lightPalette, type Palette } from './palettes';

export const light: Palette = lightPalette;
export const dark: Palette = darkPalette;
export type { Palette };

export const font = { r: 'Jakarta400', m: 'Jakarta500', s: 'Jakarta600', b: 'Jakarta700', x: 'Jakarta800' };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const radius = { sm: 10, md: 16, lg: 22, xl: 28, pill: 999 };
export const type = {
  display: { fontSize: 30, lineHeight: 36, fontFamily: font.x, letterSpacing: -0.7 },
  title: { fontSize: 22, lineHeight: 28, fontFamily: font.b, letterSpacing: -0.4 },
  h: { fontSize: 16, lineHeight: 21, fontFamily: font.s, letterSpacing: -0.1 },
  body: { fontSize: 14, lineHeight: 21, fontFamily: font.r },
  tiny: { fontSize: 12, lineHeight: 17, fontFamily: font.r },
  eyebrow: { fontSize: 10.5, fontFamily: font.x, letterSpacing: 1.3 },
};
