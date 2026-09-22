import Svg, { Circle, Defs, Ellipse, G, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

/**
 * Small glossy illustrations, drawn in SVG so they look the same on every phone
 * (system emoji are missing on some devices and simulators). Each one is a 100×100 scene
 * with a soft drop shadow, a gradient body and a highlight — the "3D sticker" look
 * the Pronto reference uses.
 */
export type ArtName = 'bolt' | 'calendar' | 'party' | 'sweep-mop' | 'dishes' | 'kitchen' | 'bathroom' | 'laundry' | 'cooking';

const Shadow = () => <Ellipse cx="50" cy="88" rx="30" ry="6" fill="#000" opacity="0.14" />;

function Grad({ id, from, to }: { id: string; from: string; to: string }) {
  return (
    <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
      <Stop offset="0" stopColor={from} />
      <Stop offset="1" stopColor={to} />
    </LinearGradient>
  );
}

const SCENES: Record<ArtName, () => React.JSX.Element> = {
  bolt: () => (
    <G>
      <Defs><Grad id="bolt" from="#FFE27A" to="#F5A300" /><Grad id="boltD" from="#E68A00" to="#B86A00" /></Defs>
      <Shadow />
      <Path d="M58 6 L26 54 H46 L38 92 L74 40 H54 Z" fill="url(#boltD)" transform="translate(3,3)" />
      <Path d="M58 6 L26 54 H46 L38 92 L74 40 H54 Z" fill="url(#bolt)" />
      <Path d="M56 12 L34 46 H48" stroke="#FFF8D6" strokeWidth="4" strokeLinecap="round" fill="none" opacity="0.8" />
    </G>
  ),
  calendar: () => (
    <G>
      <Defs><Grad id="calTop" from="#FF8A6E" to="#E24B31" /><Grad id="calBody" from="#FFFFFF" to="#F1EFEA" /></Defs>
      <Shadow />
      <Rect x="14" y="22" width="72" height="66" rx="14" fill="#C9C4BA" transform="translate(3,3)" />
      <Rect x="14" y="22" width="72" height="66" rx="14" fill="url(#calBody)" />
      <Path d="M14 36 a14 14 0 0 1 14-14 h44 a14 14 0 0 1 14 14 v10 H14 Z" fill="url(#calTop)" />
      <Rect x="28" y="12" width="9" height="18" rx="4.5" fill="#8E2413" /><Rect x="63" y="12" width="9" height="18" rx="4.5" fill="#8E2413" />
      {[0, 1, 2].map((r) => [0, 1, 2].map((c) => <Circle key={`${r}${c}`} cx={32 + c * 18} cy={58 + r * 12} r="3.6" fill={r === 1 && c === 1 ? '#EE5A40' : '#D6D1C8'} />))}
    </G>
  ),
  party: () => (
    <G>
      <Defs><Grad id="cone" from="#FFD36E" to="#F5A300" /></Defs>
      <Shadow />
      <Path d="M22 84 L44 34 L66 56 Z" fill="#B86A00" transform="translate(3,3)" />
      <Path d="M22 84 L44 34 L66 56 Z" fill="url(#cone)" />
      <Path d="M30 78 L48 42" stroke="#FFF1C2" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
      <Circle cx="72" cy="26" r="6" fill="#EE5A40" /><Circle cx="86" cy="44" r="4.5" fill="#3FB8BA" /><Circle cx="60" cy="16" r="4" fill="#F5B301" />
      <Path d="M58 34 q10 -14 22 -6" stroke="#8B2252" strokeWidth="3" fill="none" strokeLinecap="round" />
      <Path d="M70 60 q12 2 16 14" stroke="#0F8B8D" strokeWidth="3" fill="none" strokeLinecap="round" />
    </G>
  ),
  'sweep-mop': () => (
    <G>
      <Defs><Grad id="broom" from="#FFD36E" to="#E69A1C" /><Grad id="stick" from="#C98A5A" to="#8A5A34" /></Defs>
      <Shadow />
      <Path d="M62 10 L40 62" stroke="url(#stick)" strokeWidth="9" strokeLinecap="round" />
      <Path d="M30 58 L58 66 L54 90 L18 84 Z" fill="#B87415" transform="translate(3,3)" />
      <Path d="M30 58 L58 66 L54 90 L18 84 Z" fill="url(#broom)" />
      <Path d="M26 72 L50 78 M24 80 L46 85" stroke="#B87415" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
      <Rect x="30" y="55" width="30" height="9" rx="4" transform="rotate(14 45 60)" fill="#EE5A40" />
    </G>
  ),
  dishes: () => (
    <G>
      <Defs><Grad id="plate" from="#FFFFFF" to="#E3E0DA" /><Grad id="rim" from="#EE5A40" to="#C93A21" /></Defs>
      <Shadow />
      <Ellipse cx="50" cy="56" rx="36" ry="30" fill="#C9C4BA" transform="translate(3,3)" />
      <Ellipse cx="50" cy="56" rx="36" ry="30" fill="url(#rim)" />
      <Ellipse cx="50" cy="56" rx="29" ry="24" fill="url(#plate)" />
      <Ellipse cx="50" cy="56" rx="14" ry="11" fill="#F1EFEA" />
      <Path d="M20 18 v20 M26 18 v20 M23 38 v18" stroke="#8A8F9C" strokeWidth="3.5" strokeLinecap="round" />
    </G>
  ),
  kitchen: () => (
    <G>
      <Defs><Grad id="pan" from="#4A4F5C" to="#1B1B20" /><Grad id="egg" from="#FFFFFF" to="#EFEDE7" /></Defs>
      <Shadow />
      <Circle cx="46" cy="56" r="30" fill="#0E0E11" transform="translate(3,3)" />
      <Circle cx="46" cy="56" r="30" fill="url(#pan)" />
      <Circle cx="46" cy="56" r="24" fill="#2C303A" />
      <Path d="M74 46 L94 30" stroke="#8A5A34" strokeWidth="9" strokeLinecap="round" />
      <Path d="M40 52 q4 -12 16 -8 q10 4 6 16 q-6 8 -16 4 q-10 -4 -6 -12 Z" fill="url(#egg)" />
      <Circle cx="48" cy="58" r="6" fill="#F5B301" />
    </G>
  ),
  bathroom: () => (
    <G>
      <Defs><Grad id="tub" from="#FFFFFF" to="#DDE6F0" /><Grad id="water" from="#7FD3FF" to="#2E9BE8" /></Defs>
      <Shadow />
      <Path d="M12 48 H88 V64 a24 24 0 0 1 -24 24 H36 A24 24 0 0 1 12 64 Z" fill="#B9C6D3" transform="translate(3,3)" />
      <Path d="M12 48 H88 V64 a24 24 0 0 1 -24 24 H36 A24 24 0 0 1 12 64 Z" fill="url(#tub)" />
      <Rect x="18" y="48" width="64" height="10" rx="5" fill="url(#water)" />
      <Path d="M24 46 V24 a8 8 0 0 1 16 0" stroke="#8A8F9C" strokeWidth="4" fill="none" strokeLinecap="round" />
      <Circle cx="58" cy="30" r="5" fill="#BFE8FF" /><Circle cx="70" cy="22" r="3.5" fill="#BFE8FF" /><Circle cx="50" cy="20" r="3" fill="#BFE8FF" />
    </G>
  ),
  laundry: () => (
    <G>
      <Defs><Grad id="basket" from="#F2C48B" to="#C98A5A" /><Grad id="cloth" from="#FF8A6E" to="#EE5A40" /></Defs>
      <Shadow />
      <Path d="M18 44 H82 L76 88 H24 Z" fill="#8A5A34" transform="translate(3,3)" />
      <Path d="M18 44 H82 L76 88 H24 Z" fill="url(#basket)" />
      <Path d="M26 54 h48 M28 66 h44 M30 78 h40" stroke="#A66F3E" strokeWidth="2.5" opacity="0.6" />
      <Path d="M28 44 q10 -22 22 -12 q10 -14 22 12 Z" fill="url(#cloth)" />
      <Path d="M40 44 q8 -14 12 -6" stroke="#3FB8BA" strokeWidth="5" strokeLinecap="round" fill="none" />
    </G>
  ),
  cooking: () => (
    <G>
      <Defs><Grad id="pot" from="#EE5A40" to="#B32E18" /><Grad id="lid" from="#FF9A80" to="#E24B31" /></Defs>
      <Shadow />
      <Rect x="20" y="42" width="60" height="44" rx="12" fill="#7A1E10" transform="translate(3,3)" />
      <Rect x="20" y="42" width="60" height="44" rx="12" fill="url(#pot)" />
      <Path d="M8 52 h14 M78 52 h14" stroke="#7A1E10" strokeWidth="7" strokeLinecap="round" />
      <Ellipse cx="50" cy="42" rx="34" ry="8" fill="url(#lid)" />
      <Rect x="44" y="26" width="12" height="10" rx="5" fill="#7A1E10" />
      <Path d="M36 24 q4 -8 0 -14 M50 20 q4 -8 0 -14 M64 24 q4 -8 0 -14" stroke="#C9C4BA" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.7" />
    </G>
  ),
};

export function Art({ name, size = 64 }: { name: ArtName; size?: number }) {
  const Scene = SCENES[name];
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      <Scene />
    </Svg>
  );
}
