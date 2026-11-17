/**
 * MathLogs Design System
 * Custom Brand-First Theme — dark, premium, and smooth.
 */

export const Colors = {
  // Brand Primary (Matches --neutral-900)
  primary: '#111827',
  primaryLight: '#4B5563',
  primaryDark: '#030712',
  primaryGlow: 'rgba(17, 24, 39, 0.15)',

  // Accent - Dark Minimalist (Apple Black/Grey, replacing Blue)
  accent: '#111827',
  accentLight: '#1f2937',
  accentDark: '#030712',

  // Success / Error / Warning
  success: '#34c759',
  successLight: '#4cd964',
  successBg: 'rgba(52, 199, 89, 0.12)',
  error: '#ff3b30',
  errorLight: '#ff453a',
  errorBg: 'rgba(255, 59, 48, 0.12)',
  warning: '#ffcc00',
  warningLight: '#ffd60a',
  warningBg: 'rgba(255, 204, 0, 0.12)',
  info: '#111827',
  infoBg: 'rgba(17, 24, 39, 0.12)',

  // Midnight — authenticated teacher dark theme
  dark: {
    background: '#0E1116',
    backgroundDeep: '#080B0F',
    surface: '#1B2027',
    surfaceSecondary: '#242B33',
    surfaceElevated: '#242B33',
    card: '#1B2027',
    border: 'rgba(214, 221, 229, 0.09)',
    borderLight: 'rgba(214, 221, 229, 0.05)',
    text: '#F2F4F6',
    textSecondary: '#A3AAB2',
    textMuted: '#667682',
    overlay: 'rgba(0, 0, 0, 0.65)',
    material: 'rgba(25, 31, 39, 0.54)',
    materialStrong: 'rgba(31, 38, 47, 0.67)',
    focus: '#D6DDE5',
    tabBar: 'rgba(31, 38, 47, 0.67)',
    tabBarBorder: 'rgba(225, 233, 238, 0.18)',
    hero: '#192028',
    heroEnd: '#303A44',
    heroText: '#F7F8FA',
    chart: '#B8C7D1',
    chartSoft: '#667682',
    positive: '#7CA696',
    attention: '#BA8F70',
    shadow: 'rgba(0, 0, 0, 0.38)',
  },

  // Blue Ash — authenticated teacher light theme
  light: {
    background: '#E9EFF3',
    backgroundDeep: '#D9E2E8',
    surface: '#F8FBFD',
    surfaceSecondary: '#EDF3F6',
    surfaceElevated: '#F8FBFD',
    card: '#F8FBFD',
    border: 'rgba(39, 59, 75, 0.09)',
    borderLight: 'rgba(39, 59, 75, 0.05)',
    text: '#131A22',
    textSecondary: '#687683',
    textMuted: '#687683',
    overlay: 'rgba(0, 0, 0, 0.4)',
    material: 'rgba(248, 251, 253, 0.58)',
    materialStrong: 'rgba(255, 255, 255, 0.72)',
    focus: '#506778',
    tabBar: 'rgba(255, 255, 255, 0.72)',
    tabBarBorder: 'rgba(39, 59, 75, 0.09)',
    hero: '#111A22',
    heroEnd: '#27343E',
    heroText: '#F5F7F8',
    chart: '#506778',
    chartSoft: '#9EAFBB',
    positive: '#688B7D',
    attention: '#9B785F',
    shadow: 'rgba(25, 43, 57, 0.15)',
  },
} as const;

export type ThemeScheme = 'light' | 'dark';

export function getThemeColors(scheme: ThemeScheme) {
  return Colors[scheme];
}

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 32,
  '4xl': 40,
  '5xl': 48,
  '6xl': 64,
} as const;

export const BorderRadius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const;

export const FontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  '2xl': 28,
  '3xl': 34,
  '4xl': 42,
} as const;

export const FontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
  extrabold: '800' as const,
  black: '900' as const,
};

export const TypeScale = {
  pageTitle: { fontSize: FontSize['2xl'], lineHeight: 34, fontWeight: FontWeight.bold, letterSpacing: -0.6 },
  sectionTitle: { fontSize: FontSize.md, lineHeight: 23, fontWeight: FontWeight.semibold, letterSpacing: -0.2 },
  body: { fontSize: FontSize.base, lineHeight: 22, fontWeight: FontWeight.regular, letterSpacing: 0 },
  label: { fontSize: FontSize.sm, lineHeight: 18, fontWeight: FontWeight.semibold, letterSpacing: 0.1 },
  caption: { fontSize: FontSize.xs, lineHeight: 16, fontWeight: FontWeight.medium, letterSpacing: 0.2 },
} as const;

export const TouchTarget = {
  minimum: 44,
  comfortable: 48,
} as const;

export const Shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
  glow: (color: string) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 6,
  }),
} as const;

export const Motion = {
  press: {
    damping: 30,
    stiffness: 420,
    mass: 0.8,
  },
  default: {
    damping: 30,
    stiffness: 350,
    mass: 0.8,
  },
  momentum: {
    damping: 22,
    stiffness: 300,
    mass: 0.9,
  },
  reducedDuration: 120,
} as const;

export const Animation = {
  fast: 150,
  normal: 250,
  slow: 400,
  spring: Motion.default,
  springBouncy: Motion.momentum,
} as const;

/**
 * Component tokens for the public OTP login experience.
 * These map shared semantic tokens to the exact roles used by the screen.
 */
export const LoginTokens = {
  background: '#f5f5f7',
  surface: '#ffffff',
  primary: Colors.primaryDark,
  primaryForeground: '#ffffff',
  foreground: '#1d1d1f',
  mutedForeground: '#86868b',
  subtleForeground: '#a1a1a6',
  border: 'rgba(0, 0, 0, 0.08)',
  borderStrong: Colors.primaryLight,
  focus: '#111827',
  destructive: Colors.error,
  success: Colors.success,
  disabledOpacity: 0.5,
  scanStrong: 'rgba(0, 0, 0, 0.08)',
  scanSubtle: 'rgba(0, 0, 0, 0.04)',
  decorativeBorder: 'rgba(0, 0, 0, 0.05)',
  accountSurface: 'rgba(255, 255, 255, 0.9)',
  accountPressed: 'rgba(0, 0, 0, 0.04)',
  placeholder: '#a1a1a6',
  pressedOpacity: 0.72,
} as const;
