import React from 'react';
import { Platform, View, Text, StyleSheet, useColorScheme } from 'react-native';
import { Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LayoutDashboard, Users, FileText, Receipt, IndianRupee } from 'lucide-react-native';
import { Colors } from '../../constants/theme';

function TabIcon({ Icon, focused, label, text, muted }: { Icon: any; focused: boolean; label: string; text: string; muted: string }) {
  return (
    <View style={styles.iconWrap}>
      <Icon
        size={24}
        color={focused ? text : muted}
        strokeWidth={focused ? 2.5 : 2}
      />
      <Text style={{
        fontSize: 10, fontWeight: focused ? '700' : '500',
        color: focused ? text : muted, marginTop: 4,
      }}>
        {label}
      </Text>
      {focused && <View style={[styles.dot, { backgroundColor: text }]} />}
    </View>
  );
}

function CenterButton() {
  return (
    <View style={styles.centerButtonWrapper}>
      <View style={styles.centerButton}>
        <IndianRupee size={28} color="#FFFFFF" strokeWidth={2.5} />
      </View>
    </View>
  );
}

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const scheme = useColorScheme() === 'dark' ? 'dark' : 'light';
  const colors = Colors[scheme];

  return (
    <Tabs
      screenListeners={{
        tabPress: () => void Haptics.selectionAsync(),
      }}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarBackground: () => (
          <BlurView
            intensity={55}
            tint={scheme}
            style={[
              StyleSheet.absoluteFill,
              styles.material,
              { backgroundColor: colors.material, borderColor: colors.border },
            ]}
          />
        ),
        tabBarStyle: {
          position: 'absolute',
          bottom: Math.max(insets.bottom, 10),
          left: 12, right: 12,
          height: 68,
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          elevation: 0,
          paddingBottom: 0,
          paddingHorizontal: 8,
          borderRadius: 24,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ tabBarAccessibilityLabel: 'Dashboard', tabBarIcon: ({ focused }) => <TabIcon Icon={LayoutDashboard} focused={focused} label="Home" text={colors.text} muted={colors.textMuted} /> }} />
      <Tabs.Screen name="batches" options={{ tabBarAccessibilityLabel: 'Batches', tabBarIcon: ({ focused }) => <TabIcon Icon={Users} focused={focused} label="Batches" text={colors.text} muted={colors.textMuted} /> }} />
      <Tabs.Screen 
        name="quick-fee" 
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            navigation.navigate('quick-fee-modal');
          },
        })}
        options={{ tabBarAccessibilityLabel: 'Record fee payment', tabBarIcon: () => <CenterButton /> }}
      />
      <Tabs.Screen name="tests" options={{ tabBarAccessibilityLabel: 'Tests', tabBarIcon: ({ focused }) => <TabIcon Icon={FileText} focused={focused} label="Tests" text={colors.text} muted={colors.textMuted} /> }} />
      <Tabs.Screen name="quizzes" options={{ href: null }} />
      <Tabs.Screen name="fees" options={{ tabBarAccessibilityLabel: 'Fees', tabBarIcon: ({ focused }) => <TabIcon Icon={Receipt} focused={focused} label="Fees" text={colors.text} muted={colors.textMuted} /> }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 56, height: 56, justifyContent: 'center', alignItems: 'center',
    position: 'relative', top: Platform.OS === 'ios' ? 14 : 0,
  },
  dot: { width: 4, height: 4, borderRadius: 2, position: 'absolute', bottom: -6 },
  material: { borderWidth: 1, borderRadius: 24, overflow: 'hidden' },
  centerButtonWrapper: {
    position: 'absolute', top: Platform.OS === 'ios' ? -22 : -32,
    alignItems: 'center', justifyContent: 'center', width: 80, height: 80, zIndex: 20,
  },
  centerButton: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#111827', // Black background
    borderWidth: 5, borderColor: 'rgba(255,255,255,0.95)',
    ...Platform.select({
      ios: { shadowColor: '#111827', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 16 },
      android: { elevation: 10 },
    }),
  },
});
