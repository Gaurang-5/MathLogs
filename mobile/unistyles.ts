import { StyleSheet } from 'react-native-unistyles';
import {
  BorderRadius,
  Colors,
  FontSize,
  FontWeight,
  Motion,
  Spacing,
  TouchTarget,
  TypeScale,
} from './constants/theme';

const sharedTheme = {
  spacing: Spacing,
  radii: BorderRadius,
  fontSizes: FontSize,
  fontWeights: FontWeight,
  typeScale: TypeScale,
  touchTarget: TouchTarget,
  motion: Motion,
  status: {
    success: Colors.success,
    successBackground: Colors.successBg,
    warning: Colors.warning,
    warningBackground: Colors.warningBg,
    error: Colors.error,
    errorBackground: Colors.errorBg,
  },
} as const;

const lightTheme = {
  ...sharedTheme,
  colors: {
    ...Colors.light,
    primary: Colors.primary,
    primaryPressed: Colors.primaryDark,
  },
} as const;

const darkTheme = {
  ...sharedTheme,
  colors: {
    ...Colors.dark,
    primary: '#F5F5F7',
    primaryPressed: '#D1D1D6',
  },
} as const;

const appThemes = {
  light: lightTheme,
  dark: darkTheme,
};

const breakpoints = {
  xs: 0,
  sm: 390,
  md: 768,
  lg: 1024,
};

type AppThemes = typeof appThemes;
type AppBreakpoints = typeof breakpoints;

declare module 'react-native-unistyles' {
  export interface UnistylesThemes extends AppThemes {}
  export interface UnistylesBreakpoints extends AppBreakpoints {}
}

StyleSheet.configure({
  themes: appThemes,
  breakpoints,
  settings: {
    adaptiveThemes: true,
    nativeBreakpointsMode: 'points',
  },
});
