/**
 * Every colour in the app comes from here. Change `active` and both
 * NativeWind classes and the runtime theme follow.
 *
 * Options: 'coral' | 'teal' | 'navy' | 'plum'
 */
const active = 'coral';

// Primary button: black pill on the cream light theme, white pill on dark.
const ctaLight = { cta: '#111113', onCta: '#FFFFFF' };
const gold = { amber: '#F5B301', amberDeep: '#9A6B00', amberSoft: '#FFF3CC' };
const goldDark = { amber: '#FFC53D', amberDeep: '#FFC53D', amberSoft: '#2B2108' };
const status = { ok: '#0E7A52', okSoft: '#DAF0E6', warn: '#9A5B00', warnSoft: '#FCEBD4', crit: '#C0392B', critSoft: '#FBE2DE' };
const statusDark = { ok: '#5FD19B', okSoft: '#0F2219', warn: '#E8C077', warnSoft: '#26200E', crit: '#F28B82', critSoft: '#2C1614' };

const palettes = {
  coral: {
    // Heavy colour, Pronto-style: the brand red-orange fills headers and heroes edge to edge,
    // white cards sit on top, and the page below is a cool light grey.
    light: {
      ground: '#F4F5F7', paper: '#FFFFFF', sunk: '#ECEEF2', line: '#E2E5EA', line2: '#EBEDF1',
      ink: '#1B1B20', ink2: '#5B5F6B', ink3: '#8A8F9C',
      brand: '#EE5A40', brandPress: '#D24528', brandSoft: '#FDEBE6', onBrand: '#FFFFFF',
      cta: '#EE5A40', onCta: '#FFFFFF',
      hero: '#CF3E27', heroDeep: '#8E2413', ...gold, ...status,
    },
    dark: {
      ground: '#0A0A0D', paper: '#141419', sunk: '#0F0F13', line: '#26262E', line2: '#1C1C23',
      ink: '#F4F4F6', ink2: '#A6A6B2', ink3: '#6C6C78',
      brand: '#FF6B52', brandPress: '#FF8A75', brandSoft: '#2A1612', onBrand: '#0A0A0D',
      cta: '#F4F4F6', onCta: '#0A0A0D',
      hero: '#121217', heroDeep: '#0A0A0D', ...goldDark, ...statusDark,
    },
  },
  teal: {
    light: {
      ground: '#F3F6F6', paper: '#FFFFFF', sunk: '#E7EEEE', line: '#D9E4E4', line2: '#E4ECEC',
      ink: '#10201F', ink2: '#4A5C5B', ink3: '#7A8C8B',
      brand: '#0F8B8D', brandPress: '#0B6F71', brandSoft: '#DDF3F2', onBrand: '#FFFFFF',
      hero: '#0D1F22', heroDeep: '#0D1F22', cta: '#0F8B8D', onCta: '#FFFFFF', ...gold, ...status,
    },
    dark: {
      ground: '#0B1415', paper: '#152224', sunk: '#101B1C', line: '#26383A', line2: '#1E2E30',
      ink: '#EEF5F5', ink2: '#AEC1C0', ink3: '#7C9190',
      brand: '#3FB8BA', brandPress: '#5CC9CB', brandSoft: '#123536', onBrand: '#0D1F22',
      hero: '#07161A', heroDeep: '#07161A', cta: '#EEF5F5', onCta: '#0B1415', ...goldDark, ...statusDark,
    },
  },
  navy: {
    light: {
      ground: '#F5F5F8', paper: '#FFFFFF', sunk: '#EAEAF1', line: '#DEDFE9', line2: '#E7E8F0',
      ink: '#14183F', ink2: '#525782', ink3: '#8286A8',
      brand: '#F4A722', brandPress: '#D98F12', brandSoft: '#FBEBD0', onBrand: '#1D2359',
      hero: '#1D2359', heroDeep: '#1D2359', cta: '#1D2359', onCta: '#FFFFFF', ...gold, ...status,
    },
    dark: {
      ground: '#0B0D1F', paper: '#161A36', sunk: '#11142C', line: '#292E52', line2: '#202446',
      ink: '#EEF0FA', ink2: '#B0B5D0', ink3: '#7F85A6',
      brand: '#FFB933', brandPress: '#FFC85C', brandSoft: '#3A2C0C', onBrand: '#14183F',
      hero: '#080A1C', heroDeep: '#080A1C', cta: '#EEF0FA', onCta: '#0B0D1F', ...goldDark, ...statusDark,
    },
  },
  plum: {
    light: {
      ground: '#F8F5F6', paper: '#FFFFFF', sunk: '#F0E9EC', line: '#E6DCE1', line2: '#EEE6EA',
      ink: '#1F1017', ink2: '#5E4A53', ink3: '#8E7C84',
      brand: '#8B2252', brandPress: '#6E1A41', brandSoft: '#F6E1EA', onBrand: '#FFFFFF',
      hero: '#1F0F17', heroDeep: '#1F0F17', cta: '#8B2252', onCta: '#FFFFFF', ...{ amber: '#E9B44C', amberDeep: '#8F6410', amberSoft: '#FBF0D6' }, ...status,
    },
    dark: {
      ground: '#140A0F', paper: '#20131A', sunk: '#1A0E14', line: '#3A2630', line2: '#2E1D26',
      ink: '#F5EEF1', ink2: '#C3AEB8', ink3: '#907E87',
      brand: '#D9578F', brandPress: '#E777A6', brandSoft: '#3B1A2A', onBrand: '#1F0F17',
      hero: '#0D0509', heroDeep: '#0D0509', cta: '#F5EEF1', onCta: '#140A0F', ...goldDark, ...statusDark,
    },
  },
};

module.exports = { active, palettes, light: palettes[active].light, dark: palettes[active].dark };
