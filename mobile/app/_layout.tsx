/**
 * Root app shell. Providers live here so every route shares authentication,
 * safe-area handling, and the same React Query cache.
 */
import { useEffect } from 'react';
import { ActivityIndicator, StatusBar, View } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
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
  const isProtectedRoute = segments[0] === '(tabs)' || segments[0] === 'batch';

  useEffect(() => {
    if (isLoading) return;

    const routeGroup = segments[0];
    const isPublicEntryRoute = routeGroup === 'login' || routeGroup === 'welcome';

    if (!isLoggedIn && isProtectedRoute) {
      router.replace(hasSeenOnboarding ? '/login' : '/welcome');
    } else if (isLoggedIn && isPublicEntryRoute) {
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
          backgroundColor: Colors.light.background,
        }}
      >
        <ActivityIndicator color={Colors.primary} />
      </View>
    );
  }

  // Avoid mounting a protected screen and issuing its queries during redirection.
  if (!isLoggedIn && isProtectedRoute) return null;

  return (
    <View style={{ flex: 1 }}>
      {children}
      {isLoggedIn ? <OfflineStatusBanner /> : null}
    </View>
  );
}

export default function RootLayout() {
  return (
    <ThemePreferenceProvider>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <AuthGuard>
              <StatusBar barStyle="dark-content" />
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: Colors.light.background },
                  animation: 'ios_from_right',
                }}
              >
                <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
                <Stack.Screen name="login" options={{ animation: 'fade' }} />
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
          </AuthProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </ThemePreferenceProvider>
  );
}
