const { light: L, dark: D } = require('./src/theme/palettes');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        ground: { DEFAULT: L.ground, dark: D.ground },
        paper: { DEFAULT: L.paper, dark: D.paper },
        sunk: { DEFAULT: L.sunk, dark: D.sunk },
        line: { DEFAULT: L.line, dark: D.line },
        line2: { DEFAULT: L.line2, dark: D.line2 },
        ink: { DEFAULT: L.ink, dark: D.ink },
        ink2: { DEFAULT: L.ink2, dark: D.ink2 },
        ink3: { DEFAULT: L.ink3, dark: D.ink3 },
        brand: { DEFAULT: L.brand, press: L.brandPress, soft: L.brandSoft, dark: D.brand, softdark: D.brandSoft },
        onbrand: { DEFAULT: L.onBrand, dark: D.onBrand },
        cta: { DEFAULT: L.cta, dark: D.cta },
        oncta: { DEFAULT: L.onCta, dark: D.onCta },
        amber: { DEFAULT: L.amber, deep: L.amberDeep, soft: L.amberSoft, softdark: D.amberSoft },
        hero: { DEFAULT: L.hero, deep: L.heroDeep, dark: D.hero },
        lavender: { DEFAULT: '#E9EAF7' },
        ok: { DEFAULT: L.ok, soft: L.okSoft, dark: D.ok, softdark: D.okSoft },
        warn: { DEFAULT: L.warn, soft: L.warnSoft, dark: D.warn, softdark: D.warnSoft },
        crit: { DEFAULT: L.crit, soft: L.critSoft, dark: D.crit, softdark: D.critSoft },
      },
      fontFamily: {
        jk: ['Jakarta400'], jkm: ['Jakarta500'], jks: ['Jakarta600'], jkb: ['Jakarta700'], jkx: ['Jakarta800'],
      },
      borderRadius: { '4xl': '28px', '5xl': '34px' },
    },
  },
  plugins: [],
};
