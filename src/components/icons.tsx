import Feather from '@expo/vector-icons/Feather';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import type { ColorValue, StyleProp, TextStyle } from 'react-native';
import { light } from '@/theme/palettes';

/**
 * Icon fonts from @expo/vector-icons rather than an icon-per-file package.
 * Same call signature everywhere: <Name size={18} color="#..." />
 */
export type IconProps = { size?: number; color?: ColorValue; style?: StyleProp<TextStyle> };

const feather = (name: React.ComponentProps<typeof Feather>['name']) =>
  function Icon({ size = 20, color = light.ink2, style }: IconProps) {
    return <Feather name={name} size={size} color={color} style={style} />;
  };

export const ChevronLeft = feather('chevron-left');
export const ChevronRight = feather('chevron-right');
export const ChevronDown = feather('chevron-down');
export const Sun = feather('sun');
export const Sunrise = feather('sunrise');
export const Moon = feather('moon');
export const Info = feather('info');
export const Book = feather('book-open');
export const Shield = feather('shield');
export const Headphones = feather('headphones');
export const MapPin = feather('map-pin');
export const Timer = feather('clock');
export const Check = feather('check');
export const X = feather('x');
export const Phone = feather('phone');
export const MessageSquare = feather('message-square');
export const ShieldCheck = feather('shield');
export const ShieldAlert = feather('alert-triangle');
export const CalendarOff = feather('calendar');
export const CalendarDays = feather('calendar');
export const RotateCcw = feather('rotate-ccw');
export const CreditCard = feather('credit-card');
export const Gift = feather('gift');
export const Tag = feather('tag');
export const Share2 = feather('share-2');
export const UserPlus = feather('user-plus');
export const LifeBuoy = feather('life-buoy');
export const Wallet = feather('briefcase');
export const Briefcase = feather('briefcase');
export const LayoutDashboard = feather('grid');
export const Smartphone = feather('smartphone');
export const Home = feather('home');
export const Repeat = feather('repeat');
export const User = feather('user');
export const CircleUser = feather('user');
export const Users = feather('users');
export const TrendingUp = feather('trending-up');
export const Zap = feather('zap');
export const Navigation = feather('navigation');
export const BadgeCheck = feather('award');
export const Banknote = feather('credit-card');
export const FileText = feather('file-text');
export const HeartPulse = feather('activity');
export const Send = feather('send');
export const Clock = feather('clock');
export const Plus = feather('plus');
export const Sparkles = feather('star');
export const Lock = feather('lock');
export const Camera = feather('camera');
export const ImageIcon = feather('image');
export const Upload = feather('upload');
export const Bell = feather('bell');
export const BellOff = feather('bell-off');

export function IndianRupee({ size = 20, color = light.ink2, style }: IconProps) {
  return <MaterialIcons name="currency-rupee" size={size} color={color} style={style} />;
}

export function Star({ size = 20, color = light.amber, filled, style }: IconProps & { filled?: boolean }) {
  return <Ionicons name={filled ? 'star' : 'star-outline'} size={size} color={color} style={style} />;
}

export function ServiceGlyph({ name, size = 22, color = light.brand, style }: IconProps & { name: string }) {
  return <MaterialIcons name={name as React.ComponentProps<typeof MaterialIcons>['name']} size={size} color={color} style={style} />;
}
