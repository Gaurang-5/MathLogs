import React from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { BlurView } from 'expo-blur';
import { LayoutDashboard, Users, FileText, Receipt, IndianRupee } from 'lucide-react-native';

const T = { accent: '#111827', text: '#1D1D1F', muted: '#AEAEB2' };

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
        <IndianRupee size={28} color="#FFFFFF" strokeWidth={2.5} />
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
          <View style={[StyleSheet.absoluteFill, { backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.1)' }]} />
        ),
        tabBarStyle: {
          position: 'absolute',
          bottom: 0,
          left: 0, right: 0,
          height: Platform.OS === 'ios' ? 88 : 72,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0, elevation: 0,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingHorizontal: 8,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={LayoutDashboard} focused={focused} label="Home" /> }} />
      <Tabs.Screen name="batches" options={{ tabBarIcon: ({ focused }) => <TabIcon Icon={Users} focused={focused} label="Batches" /> }} />
      <Tabs.Screen 
        name="quick-fee" 
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            navigation.navigate('quick-fee-modal');
          },
        })}
        options={{ tabBarIcon: () => <CenterButton /> }} 
      />
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
    backgroundColor: '#111827', // Black background
    borderWidth: 5, borderColor: 'rgba(255,255,255,0.95)',
    ...Platform.select({
      ios: { shadowColor: '#111827', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 16 },
      android: { elevation: 10 },
    }),
  },
});
