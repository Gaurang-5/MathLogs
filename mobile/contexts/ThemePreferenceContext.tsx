import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Appearance,
  type ColorSchemeName,
} from 'react-native';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ThemePreference = 'system' | 'light' | 'dark';

interface ThemePreferenceContextData {
  preference: ThemePreference;
  setPreference: (preference: ThemePreference) => Promise<void>;
}

const STORAGE_KEY = 'mathlogs_theme_preference';
const ThemePreferenceContext = createContext<ThemePreferenceContextData | null>(null);

function isThemePreference(value: string | null): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

function applyPreference(preference: ThemePreference) {
  const override: 'auto' | 'light' | 'dark' = preference === 'system' ? 'auto' : preference;
  Appearance.setColorScheme(override);
}

export function ThemePreferenceProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let active = true;

    void AsyncStorage.getItem(STORAGE_KEY)
      .then((storedPreference) => {
        if (!active) return;
        const nextPreference = isThemePreference(storedPreference) ? storedPreference : 'system';
        applyPreference(nextPreference);
        setPreferenceState(nextPreference);
      })
      .catch(() => {
        if (active) applyPreference('system');
      })
      .finally(() => {
        if (active) setIsReady(true);
      });

    return () => {
      active = false;
    };
  }, []);

  const setPreference = useCallback(async (nextPreference: ThemePreference) => {
    applyPreference(nextPreference);
    setPreferenceState(nextPreference);
    await AsyncStorage.setItem(STORAGE_KEY, nextPreference);
  }, []);

  const value = useMemo(
    () => ({ preference, setPreference }),
    [preference, setPreference],
  );

  return (
    <ThemePreferenceContext.Provider value={value}>
      {isReady ? children : null}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference() {
  const context = useContext(ThemePreferenceContext);
  if (!context) {
    throw new Error('useThemePreference must be used inside ThemePreferenceProvider');
  }
  return context;
}

export function getThemePreferenceLabel(preference: ThemePreference) {
  if (preference === 'dark') return 'Dark';
  if (preference === 'light') return 'Light';
  return 'System';
}

export function resolveThemeScheme(
  preference: ThemePreference,
  systemScheme: ColorSchemeName,
): 'light' | 'dark' {
  if (preference === 'dark' || preference === 'light') return preference;
  return systemScheme === 'dark' ? 'dark' : 'light';
}
