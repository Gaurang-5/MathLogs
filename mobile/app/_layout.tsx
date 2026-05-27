/**
 * Root Layout — wraps the entire app with providers.
 * Handles auth-guarding: unauthenticated users are sent to /login.
 */
import { useEffect } from 'react';
import { StatusBar, View, ActivityIndicator } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, useAuth } from '../contexts/AuthContext';

// Prevent the splash screen from auto-hiding
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30,
    },
  },
});

/**
 * Auth guard — runs inside AuthProvider so it has access to auth state.
 * Redirects to /login when not authenticated; redirects away from /login when authenticated.
 */
function AuthGuard({ children }: { children: React.ReactNode }) {
  const { isLoggedIn, isLoading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return; // Wait until session is checked

    const inAuthGroup = segments[0] === '(tabs)';
    const inLoginPage = segments[0] === 'login';

    if (!isLoggedIn && inAuthGroup) {
      // Not logged in but trying to access protected tab — redirect to login
      router.replace('/login');
    } else if (isLoggedIn && inLoginPage) {
      // Already logged in but on login page — redirect to dashboard
      router.replace('/(tabs)');
    }
  }, [isLoggedIn, isLoading, segments]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F5F5F7' }}>
        <ActivityIndicator color="#111827" />
      </View>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    // System fonts are used — add custom fonts here if needed
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthGuard>
            <StatusBar barStyle="dark-content" backgroundColor="#F5F5F7" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: '#F5F5F7' },
                animation: 'ios_from_right',
              }}
            >
              <Stack.Screen name="login" options={{ animation: 'fade' }} />
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="quick-fee-modal" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen name="quiz-generator" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
              <Stack.Screen
                name="modal"
                options={{ presentation: 'modal', animation: 'slide_from_bottom' }}
              />
              <Stack.Screen name="+not-found" />
            </Stack>
          </AuthGuard>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
