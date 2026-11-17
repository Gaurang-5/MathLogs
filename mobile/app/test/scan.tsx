import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

/**
 * Compatibility route for older links. The global scanner now owns the full
 * capture/review/save flow so both entry points behave identically.
 */
export default function TestScanRedirect() {
  const { testId } = useLocalSearchParams<{ testId?: string }>();
  const router = useRouter();

  useEffect(() => {
    if (testId) router.replace({ pathname: '/scan', params: { testId } } as never);
    else router.back();
  }, [router, testId]);

  return (
    <View style={styles.container} accessibilityLiveRegion="polite">
      <ActivityIndicator color="#FFFFFF" />
      <Text style={styles.text}>Opening marks scanner…</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: '#000000' },
  text: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
});
