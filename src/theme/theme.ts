import { MD3DarkTheme, MD3LightTheme } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';

const palette = {
  primary: '#1A73E8',
  primaryContainer: '#D3E4FD',
  secondary: '#4285F4',
  surface: '#FFFFFF',
  surfaceVariant: '#F1F3F4',
  background: '#F8F9FA',
  error: '#B3261E',
  onPrimary: '#FFFFFF',
  onSurface: '#202124',
  onSurfaceVariant: '#5F6368',
  outline: '#DADCE0',
};

const darkPalette = {
  primary: '#4DA3FF',
  primaryContainer: '#1A3A5C',
  secondary: '#7BB3FF',
  surface: '#1C1C1E',
  surfaceVariant: '#2C2C2E',
  background: '#000000',
  error: '#F28B82',
  onPrimary: '#FFFFFF',
  onSurface: '#E8EAED',
  onSurfaceVariant: '#9AA0A6',
  outline: '#3C4043',
};

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: palette.primary,
    primaryContainer: palette.primaryContainer,
    secondary: palette.secondary,
    surface: palette.surface,
    surfaceVariant: palette.surfaceVariant,
    background: palette.background,
    error: palette.error,
    onPrimary: palette.onPrimary,
    onSurface: palette.onSurface,
    onSurfaceVariant: palette.onSurfaceVariant,
    outline: palette.outline,
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: darkPalette.primary,
    primaryContainer: darkPalette.primaryContainer,
    secondary: darkPalette.secondary,
    surface: darkPalette.surface,
    surfaceVariant: darkPalette.surfaceVariant,
    background: darkPalette.background,
    error: darkPalette.error,
    onPrimary: darkPalette.onPrimary,
    onSurface: darkPalette.onSurface,
    onSurfaceVariant: darkPalette.onSurfaceVariant,
    outline: darkPalette.outline,
  },
};
