import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import * as Network from 'expo-network';
import { useQueryClient } from '@tanstack/react-query';
import { CloudOff } from 'lucide-react-native';
import { BorderRadius, Colors, Shadows, Spacing } from '../../constants/theme';
import { getQueueSize, processQueue, subscribeToOfflineQueue } from '../../services/offlineSync';

export function OfflineStatusBanner() {
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];
  const network = Network.useNetworkState();
  const queryClient = useQueryClient();
  const attemptedSync = useRef(false);
  const [queueSize, setQueueSize] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const isOffline = network.isConnected === false || network.isInternetReachable === false;

  useEffect(() => {
    const refreshSize = () => { void getQueueSize().then(setQueueSize); };
    refreshSize();
    return subscribeToOfflineQueue(refreshSize);
  }, []);

  const syncNow = useCallback(() => {
    if (isOffline || isSyncing || queueSize === 0) return;
    setIsSyncing(true);
    void processQueue()
      .then(() => getQueueSize())
      .then(setQueueSize)
      .finally(() => {
        setIsSyncing(false);
        void queryClient.invalidateQueries();
      });
  }, [isOffline, isSyncing, queryClient, queueSize]);

  useEffect(() => {
    if (isOffline) {
      attemptedSync.current = false;
      return;
    }

    if (network.isConnected !== true || queueSize === 0 || attemptedSync.current) return;
    attemptedSync.current = true;
    syncNow();
  }, [isOffline, network.isConnected, queueSize, syncNow]);

  if (!isOffline && queueSize === 0 && !isSyncing) return null;

  const title = isOffline
    ? 'Working offline'
    : isSyncing
      ? 'Syncing saved work'
      : 'Sync needs attention';
  const detail = isOffline
    ? queueSize > 0
      ? `${queueSize} ${queueSize === 1 ? 'change is' : 'changes are'} saved on this device.`
      : 'Showing saved data. Online-only actions require a connection.'
    : isSyncing
      ? `${queueSize} ${queueSize === 1 ? 'change' : 'changes'} remaining.`
      : `${queueSize} ${queueSize === 1 ? 'change could' : 'changes could'} not sync. Reconnect or retry later.`;

  return (
    <Pressable
      accessibilityLiveRegion="polite"
      accessibilityRole={isOffline ? 'alert' : 'button'}
      accessibilityLabel={isOffline ? `${title}. ${detail}` : `${title}. ${detail} Tap to retry.`}
      disabled={isOffline || isSyncing}
      onPress={syncNow}
      style={[
        styles.banner,
        {
          backgroundColor: colors.surfaceElevated,
          borderColor: colors.border,
          shadowColor: colors.shadow,
        },
      ]}
    >
      <CloudOff size={17} color={colors.attention} />
      <View style={styles.copy}>
        <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.detail, { color: colors.textSecondary }]}>{detail}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    zIndex: 1000,
    left: Spacing.xl,
    right: Spacing.xl,
    bottom: 104,
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    ...Shadows.md,
  },
  copy: { flex: 1 },
  title: { fontSize: 13, lineHeight: 18, fontWeight: '800' },
  detail: { fontSize: 11, lineHeight: 15, fontWeight: '500' },
});
