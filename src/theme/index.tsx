import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { font, light, radius, space, type, type Palette } from './tokens';

type Theme = {
  c: Palette; space: typeof space; radius: typeof radius;
  type: typeof type; font: typeof font; scheme: 'light' | 'dark';
};

const Ctx = createContext<Theme>({ c: light, space, radius, type, font, scheme: 'light' });

export function ThemeProvider({ children }: { children: ReactNode }) {
  // One look everywhere: cream with black panels. The dark palette stays for the web console.
  const value = useMemo(() => ({ c: light, space, radius, type, font, scheme: 'light' }) as Theme, []);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
export { font, radius, space, type };
export type { Palette };
