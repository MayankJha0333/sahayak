export type Palette = {
  ground: string; paper: string; sunk: string; line: string; line2: string;
  ink: string; ink2: string; ink3: string;
  brand: string; brandPress: string; brandSoft: string; onBrand: string;
  cta: string;
  onCta: string;
  hero: string; heroDeep: string;
  amber: string; amberDeep: string; amberSoft: string;
  ok: string; okSoft: string; warn: string; warnSoft: string; crit: string; critSoft: string;
};
export const active: 'coral' | 'teal' | 'navy' | 'plum';
export const palettes: Record<'coral' | 'teal' | 'navy' | 'plum', { light: Palette; dark: Palette }>;
export const light: Palette;
export const dark: Palette;
