import React from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { LayoutDashboard, Users, FileText, Receipt, Zap } from 'lucide-react-native';

const T = { accent: '#0d7ff2', text: '#1D1D1F', muted: '#AEAEB2' };

function TabIcon({ Icon, focused, label }: { Icon: any; focused: boolean; label: string }) {
  return (
    <View style={styles.iconWrap}>
      <Icon
        size={24}
        color={focused ? T.text : T.muted}
        strokeWidth={focused ? 2.5 : 2}
      />
      <Text style={{
        fontSize: 10, fontWeight: focused ? '700' : '500',
        color: focused ? T.text : T.muted, marginTop: 4,
      }}>
        {label}
      </Text>
      {focused && <View style={styles.dot} />}
    </View>
  );
}

function CenterButton() {
  return (
    <View style={styles.centerButtonWrapper}>
      <View style={styles.centerButton}>
        <Zap size={28} color="#FFFFFF" strokeWidth={2.5} fill="#FFFFFF" />
      </View>
    </View>
  );
}

export default function TabLayout() {
  return (
    <Tabs
      screenListeners={{
        tabPress: () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
      }}
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarBackground: () => (
          <View style={[StyleSheet.absoluteFill, { borderRadius: 36, overflow: 'hidden' }]}>
            <BlurView tint="systemChromeMaterialLight" intensity={100} style={StyleSheet.absoluteFill} />
            <View style={[StyleSheet.absoluteFill, {
              borderWidth: 1,
              borderColor: 'rgba(255, 255, 255, 0.7)',
              borderRadius: 36,
            }]} />
          </View>
        ),
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 32 : 24,
          left: 16, right: 16,
          height: 72,
          backgroundColor: 'transparent',
          borderTopWidth: 0, elevation: 0,
          paddingHorizontal: 8,
          ...Platform.select({
            ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.08, shadowRadius: 24 },
            android: { elevation: 10 },
          }),
        },
      }}
    >
      <Tabs.Screen name="index" options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={LayoutDashboard} focused={focused} label="Home" /> }} />
      <Tabs.Screen name="batches" options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={Users} focused={focused} label="Batches" /> }} />
      <Tabs.Screen name="quick-fee" options={{ tabBarIcon: () => <CenterButton /> }} />
      <Tabs.Screen name="tests" options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={FileText} focused={focused} label="Tests" /> }} />
      <Tabs.Screen name="fees" options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={Receipt} focused={focused} label="Fees" /> }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  iconWrap: {
    width: 56, height: 56, justifyContent: 'center', alignItems: 'center',
    position: 'relative', top: Platform.OS === 'ios' ? 14 : 0,
  },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: T.text, position: 'absolute', bottom: -6 },
  centerButtonWrapper: {
    position: 'absolute', top: Platform.OS === 'ios' ? -22 : -32,
    alignItems: 'center', justifyContent: 'center', width: 80, height: 80, zIndex: 20,
  },
  centerButton: {
    width: 68, height: 68, borderRadius: 34,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#f59e0b',
    borderWidth: 5, borderColor: 'rgba(255,255,255,0.95)',
    ...Platform.select({
      ios: { shadowColor: '#f59e0b', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 16 },
      android: { elevation: 10 },
    }),
  },
});
