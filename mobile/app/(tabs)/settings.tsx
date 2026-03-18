/**
 * Settings Screen — Account, preferences, and app info.
 */
import React from 'react';
import { View, Text, ScrollView, StyleSheet, useColorScheme, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../../contexts/AuthContext';
import { GlassCard, BrandButton } from '../../components/ui';
import { clearCache } from '../../services/offlineSync';
import { Colors, Spacing, FontSize, FontWeight, BorderRadius } from '../../constants/theme';

function SettingsRow({
  icon,
  label,
  value,
  onPress,
  isDark,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  isDark: boolean;
}) {
  const colors = isDark ? Colors.dark : Colors.light;
  return (
    <GlassCard style={styles.settingsRow} onPress={onPress}>
      <View style={styles.rowLeft}>
        <Text style={{ fontSize: 20, marginRight: Spacing.md }}>{icon}</Text>
        <Text style={[styles.rowLabel, { color: colors.text }]}>{label}</Text>
      </View>
      {value && (
        <Text style={[styles.rowValue, { color: colors.textMuted }]}>{value}</Text>
      )}
    </GlassCard>
  );
}

export default function SettingsScreen() {
  const { user, logout } = useAuth();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const colors = isDark ? Colors.dark : Colors.light;

  const handleLogout = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            await clearCache();
            await logout();
          },
        },
      ],
    );
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will clear all offline data. You will need to reconnect to load data.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            await clearCache();
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <Animated.View entering={FadeInDown.duration(400)}>
          <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
        </Animated.View>

        {/* Profile Section */}
        <Animated.View entering={FadeInDown.duration(400).delay(100)}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>PROFILE</Text>
          <GlassCard style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={{ fontSize: 32 }}>
                {user?.name ? user.name.charAt(0).toUpperCase() : '?'}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text style={[styles.profileName, { color: colors.text }]}>
                {user?.name || 'Guest'}
              </Text>
              <Text style={[styles.profileEmail, { color: colors.textSecondary }]}>
                {user?.email || 'Not signed in'}
              </Text>
              {user?.instituteName && (
                <Text style={[styles.profileInstitute, { color: Colors.primary }]}>
                  {user.instituteName}
                </Text>
              )}
            </View>
          </GlassCard>
        </Animated.View>

        {/* App Settings */}
        <Animated.View entering={FadeInDown.duration(400).delay(200)}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>APP</Text>
          <View style={styles.settingsGroup}>
            <SettingsRow icon="🌙" label="Theme" value="System" isDark={isDark} />
            <SettingsRow icon="🔔" label="Notifications" value="On" isDark={isDark} />
            <SettingsRow icon="🗑️" label="Clear cache" onPress={handleClearCache} isDark={isDark} />
          </View>
        </Animated.View>

        {/* About */}
        <Animated.View entering={FadeInDown.duration(400).delay(300)}>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ABOUT</Text>
          <View style={styles.settingsGroup}>
            <SettingsRow icon="📱" label="Version" value="1.0.0" isDark={isDark} />
            <SettingsRow icon="📄" label="Privacy Policy" isDark={isDark} />
            <SettingsRow icon="📋" label="Terms of Service" isDark={isDark} />
          </View>
        </Animated.View>

        {/* Sign Out */}
        <Animated.View entering={FadeInDown.duration(400).delay(400)} style={styles.logoutArea}>
          <BrandButton title="Sign Out" variant="danger" onPress={handleLogout} size="lg" />
        </Animated.View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: { padding: Spacing.xl },
  title: { fontSize: FontSize['2xl'], fontWeight: FontWeight.bold, marginBottom: Spacing['2xl'] },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: FontWeight.semibold,
    letterSpacing: 1,
    marginBottom: Spacing.sm,
    marginTop: Spacing.xl,
    marginLeft: Spacing.xs,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primaryGlow,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.lg,
  },
  profileInfo: { flex: 1 },
  profileName: { fontSize: FontSize.md, fontWeight: FontWeight.bold },
  profileEmail: { fontSize: FontSize.sm, marginTop: 2 },
  profileInstitute: { fontSize: FontSize.sm, fontWeight: FontWeight.semibold, marginTop: 4 },
  settingsGroup: { gap: Spacing.sm },
  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center' },
  rowLabel: { fontSize: FontSize.base, fontWeight: FontWeight.medium },
  rowValue: { fontSize: FontSize.sm },
  logoutArea: { marginTop: Spacing['3xl'] },
});
