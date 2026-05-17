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

  // Dark Theme
  // Retained a deeply premium dark mode
  dark: {
    background: '#0F0F14',
    surface: '#1c1c1e',
    surfaceElevated: '#2c2c2e',
    card: '#1c1c1e',
    border: 'rgba(255, 255, 255, 0.15)',
    borderLight: 'rgba(255, 255, 255, 0.08)',
    text: '#f5f5f7',
    textSecondary: '#86868b',
    textMuted: '#636366',
    overlay: 'rgba(0, 0, 0, 0.65)',
    tabBar: '#1c1c1e',
    tabBarBorder: 'rgba(255, 255, 255, 0.15)',
  },

  // Light Theme (Exactly matches web CSS)
  light: {
    background: '#f5f5f7',
    surface: 'rgba(255, 255, 255, 0.85)',
    surfaceElevated: '#ffffff',
    card: '#ffffff',
    border: 'rgba(0, 0, 0, 0.08)',
    borderLight: 'rgba(0, 0, 0, 0.04)',
    text: '#1d1d1f',
    textSecondary: '#86868b',
    textMuted: '#a1a1a6',
    overlay: 'rgba(0, 0, 0, 0.4)',
    tabBar: 'rgba(255, 255, 255, 0.9)',
    tabBarBorder: 'rgba(0, 0, 0, 0.08)',
  },
} as const;

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
};

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

export const Animation = {
  fast: 150,
  normal: 250,
  slow: 400,
  spring: {
    damping: 15,
    stiffness: 150,
    mass: 0.8,
  },
  springBouncy: {
    damping: 10,
    stiffness: 120,
    mass: 0.6,
  },
} as const;
