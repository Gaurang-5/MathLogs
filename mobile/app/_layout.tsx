/**
 * Root app shell. Providers live here so every route shares authentication,
 * safe-area handling, and the same React Query cache.
 */
import { useEffect } from 'react';
import { ActivityIndicator, StatusBar, View, useColorScheme } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { ProUpgradeProvider } from '../contexts/ProUpgradeContext';
import { ThemePreferenceProvider } from '../contexts/ThemePreferenceContext';
import { Colors } from '../constants/theme';
import { OfflineStatusBanner } from '../components/offline/OfflineStatusBanner';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        const status = isAxiosError(error) ? error.response?.status : undefined;
        // The API client already handles renewal once; retrying rejected access
        // would otherwise repeat login failures across every dashboard query.
        return status !== 401 && status !== 402 && status !== 403 && failureCount < 1;
      },
      staleTime: 5 * 60 * 1000,
      gcTime: 30 * 60 * 1000,
    },
  },
});

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isLoading, hasSeenOnboarding } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const selectedScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const isPublicEntryRoute = segments[0] === 'login' || segments[0] === 'signup' || segments[0] === 'welcome';
  const scheme = isPublicEntryRoute ? 'light' : selectedScheme;
  const colors = Colors[scheme];
  const isProtectedRoute = segments[0] === '(tabs)' || segments[0] === 'batch';

  useEffect(() => {
    if (isLoading) return;

    const routeGroup = segments[0];
    const isPublicEntry = routeGroup === 'login' || routeGroup === 'signup' || routeGroup === 'welcome';

    if (!isLoggedIn && isProtectedRoute) {
      router.replace(hasSeenOnboarding ? '/login' : '/welcome');
    } else if (isLoggedIn && isPublicEntry) {
      router.replace('/(tabs)');
    }
  }, [hasSeenOnboarding, isLoading, isLoggedIn, isProtectedRoute, router, segments]);

  useEffect(() => {
    if (!isLoading) void SplashScreen.hideAsync();
  }, [isLoading]);

  if (isLoading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.background,
        }}
      >
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  // Avoid mounting a protected screen and issuing its queries during redirection.
  if (!isLoggedIn && isProtectedRoute) return null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      {children}
      {isLoggedIn ? <OfflineStatusBanner /> : null}
    </View>
  );
}

function ThemedAppStack() {
  const segments = useSegments();
  const selectedScheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const isPublicEntryRoute = segments[0] === 'login' || segments[0] === 'signup' || segments[0] === 'welcome';
  const scheme = isPublicEntryRoute ? 'light' : selectedScheme;
  const colors = Colors[scheme];

  return (
    <AuthGuard>
      <StatusBar barStyle={scheme === 'dark' ? 'light-content' : 'dark-content'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'ios_from_right',
        }}
      >
        <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
        <Stack.Screen name="login" options={{ animation: 'fade' }} />
        <Stack.Screen name="signup" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="quick-fee-modal"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen
          name="quiz-generator"
          options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
        />
        <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </AuthGuard>
  );
}

export default function RootLayout() {
  return (
    <ThemePreferenceProvider>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <ProUpgradeProvider>
              <ThemedAppStack />
            </ProUpgradeProvider>
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ThemePreferenceProvider>
  );
}
