import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  Dimensions, Image, Platform, TouchableOpacity, Modal
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { useRouter, useFocusEffect } from 'expo-router';
import {
  Users, BookOpen, AlertCircle, TrendingUp, IndianRupee,
  X, LogOut, Mail, Phone, ChevronRight, Eye, EyeOff, Bell, Scan, Sparkles,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { OfflineBanner, SkeletonLoader } from '../../components/ui';
import api from '../../services/api';

const { width } = Dimensions.get('window');

const T = {
  bg: '#F5F5F7', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#111827',
  emerald: '#10b981', red: '#ef4444', amber: '#f59e0b',
  blue: '#3b82f6', border: 'rgba(0,0,0,0.07)', shadow: 'rgba(0,0,0,0.08)',
};

interface DashboardData {
  stats: { batches: number; students: number };
  finances: { collected: number; totalCollected: number; pending: number };
  defaulters: Array<{ name: string; amount: number }>;
  userName: string;
}

export default function DashboardScreen() {
  const router = useRouter();
  const { user, isLoggedIn, logout } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);

  const mask = (val: string) => isPrivate ? '••••' : val;

  const loadData = useCallback(async () => {
    try {
      const dashRes = await api.get('/dashboard/summary');
      setData(dashRes.data);
    } catch (e: any) {
      console.warn('Dashboard load failed:', e?.response?.data || e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (isLoggedIn) loadData();
    }, [isLoggedIn, loadData])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const totalCol = data?.finances?.totalCollected ?? 0;
  const pending = data?.finances?.pending ?? 0;
  const thisMonth = data?.finances?.collected ?? 0;
  const totalGenerated = totalCol + pending;
  const collectionRate = totalGenerated > 0 ? Math.round((totalCol / totalGenerated) * 100) : 0;

  const logoUri = user?.logo
    ? (user.logo.startsWith('http') || user.logo.startsWith('data:') ? user.logo : `https://mathlogs.app${user.logo}`)
    : `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.instituteName || user?.name || 'M')}&background=111827&color=fff&size=120&bold=true`;

  const greetingHour = new Date().getHours();
  const greeting = greetingHour < 12 ? 'Good Morning' : greetingHour < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <OfflineBanner visible={false} />

      {/* ── Top Navbar ── */}
      <Animated.View entering={FadeInDown.duration(400)} style={s.navbar}>
        <View style={{ flex: 1 }}>
          <Text style={s.navGreeting}>{greeting} 👋</Text>
          <Text style={s.navName} numberOfLines={1}>{data?.userName || user?.name || 'Admin'}</Text>
        </View>
        <View style={s.navRight}>
          <TouchableOpacity
            style={[s.navIconBtn, { backgroundColor: '#F3E8FF', borderColor: '#D8B4FE' }]}
            onPress={() => router.push('/(tabs)/quizzes' as any)}
            activeOpacity={0.75}
          >
            <Sparkles size={18} color="#9333EA" />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.navIconBtn}
            onPress={() => router.push('/scan' as any)}
            activeOpacity={0.75}
          >
            <Scan size={18} color={T.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.navIconBtn}
            onPress={() => setIsPrivate(p => !p)}
            activeOpacity={0.75}
          >
            {isPrivate
              ? <EyeOff size={18} color={T.text} />
              : <Eye size={18} color={T.text} />}
          </TouchableOpacity>
          <TouchableOpacity onPress={() => setIsProfileOpen(true)} activeOpacity={0.85} style={s.navAvatarWrap}>
            <Image source={{ uri: logoUri }} style={s.navAvatar} resizeMode="contain" />
          </TouchableOpacity>
        </View>
      </Animated.View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}
      >
        {/* ── Finance Hero Card ── */}
        <Animated.View entering={FadeInDown.duration(500).delay(80)} style={s.heroCard}>
          <Text style={s.heroCardLabel}>Financial Overview</Text>
          {loading ? (
            <View style={{ marginTop: 12 }}>
              <SkeletonLoader width={width - 96} height={80} borderRadius={12} />
            </View>
          ) : (
            <>
              <View style={s.heroAmountsRow}>
                <View>
                  <Text style={s.heroFinLabel}>Collected</Text>
                  <Text style={s.heroFinValue}>{mask(`₹${totalCol.toLocaleString()}`)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[s.heroFinLabel, { color: 'rgba(255,100,100,0.9)' }]}>Pending</Text>
                  <Text style={[s.heroFinValue, { color: '#ff6b6b' }]}>{mask(`₹${pending.toLocaleString()}`)}</Text>
                </View>
              </View>
              <View style={s.heroPbarBg}>
                <View style={[s.heroPbarGreen, { flex: collectionRate || 1 }]} />
                <View style={[s.heroPbarRed, { flex: Math.max(100 - collectionRate, 0) }]} />
              </View>
              <Text style={s.heroPbarLabel}>{mask(`${collectionRate}% of total fees collected`)}</Text>
            </>
          )}
        </Animated.View>

        {/* ── Stats Row ── */}
        <Animated.View entering={FadeInDown.duration(500).delay(160)} style={s.statsRow}>
          <StatPill
            icon={<Users size={16} color={T.accent} />}
            value={loading ? '–' : String(data?.stats.students ?? 0)}
            label="Students"
            color={T.accent}
          />
          <View style={s.statDivider} />
          <StatPill
            icon={<BookOpen size={16} color={T.blue} />}
            value={loading ? '–' : String(data?.stats.batches ?? 0)}
            label="Batches"
            color={T.blue}
          />
          <View style={s.statDivider} />
          <StatPill
            icon={<IndianRupee size={16} color={T.emerald} />}
            value={loading ? '–' : mask(`₹${(thisMonth / 1000).toFixed(0)}k`)}
            label="This Month"
            color={T.emerald}
          />
        </Animated.View>

        {/* ── Batch Pending Dues ── */}
        <Animated.View entering={FadeInDown.duration(500).delay(240)}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Batch Pending Dues</Text>
            <TouchableOpacity onPress={() => router.push('/(tabs)/fees' as any)} style={s.seeAllBtn}>
              <Text style={s.seeAllText}>Manage</Text>
              <ChevronRight size={14} color={T.accent} />
            </TouchableOpacity>
          </View>
          <View style={s.card}>
            {loading ? (
              <View style={{ padding: 16, gap: 12 }}>
                {[1, 2, 3].map(i => <SkeletonLoader key={i} width={width - 96} height={44} borderRadius={12} />)}
              </View>
            ) : data?.defaulters?.length ? (
              data.defaulters.map((d, i) => (
                <Animated.View key={d.name + i} entering={FadeInRight.duration(400).delay(i * 60)}>
                  <View style={[s.txRow, i < data.defaulters.length - 1 && s.txBorder]}>
                    <View style={[s.txIcon, { backgroundColor: `${T.red}12` }]}>
                      <AlertCircle size={16} color={T.red} />
                    </View>
                    <Text style={[s.txName, { flex: 1 }]}>{d.name}</Text>
                    <Text style={s.txAmount}>{mask(`₹${d.amount.toLocaleString()}`)}</Text>
                  </View>
                </Animated.View>
              ))
            ) : (
              <View style={s.emptyState}>
                <TrendingUp size={28} color={T.textMuted} />
                <Text style={s.emptyText}>All dues cleared! 🎉</Text>
              </View>
            )}
          </View>
        </Animated.View>

      </ScrollView>

      {/* ── Profile Modal ── */}
      <Modal visible={isProfileOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setIsProfileOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: T.bg }} edges={['top']}>
          <View style={s.profileModalHeader}>
            <Text style={s.profileModalTitle}>Profile</Text>
            <TouchableOpacity onPress={() => setIsProfileOpen(false)} style={s.profileClose}>
              <X size={20} color={T.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={s.profileContent}>
            <View style={s.profileAvatarWrap}>
              <View style={s.profileAvatarBg}>
                <Image source={{ uri: logoUri }} style={s.profileAvatar} resizeMode="contain" />
              </View>
              <Text style={s.profileName}>{user?.instituteName || user?.name || 'Institute'}</Text>
              <Text style={s.profileSubtitle}>MathLogs Admin</Text>
            </View>
            <View style={s.profileInfoCard}>
              {user?.email && (
                <View style={s.profileInfoRow}>
                  <Mail size={18} color={T.textSec} />
                  <Text style={s.profileInfoText}>{user.email}</Text>
                </View>
              )}
              {(user as any)?.phone && (
                <View style={[s.profileInfoRow, { borderTopWidth: 1, borderTopColor: T.border }]}>
                  <Phone size={18} color={T.textSec} />
                  <Text style={s.profileInfoText}>{(user as any).phone}</Text>
                </View>
              )}
            </View>
            <TouchableOpacity style={s.logoutBtn} onPress={logout}>
              <LogOut size={18} color={T.red} />
              <Text style={s.logoutBtnText}>Logout from MathLogs</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

function StatPill({ icon, value, label, color }: { icon: React.ReactNode; value: string; label: string; color: string }) {
  return (
    <View style={s.statPill}>
      <View style={[s.statPillIcon, { backgroundColor: `${color}15` }]}>{icon}</View>
      <Text style={s.statPillValue}>{value}</Text>
      <Text style={s.statPillLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  scroll: { paddingHorizontal: 20, paddingBottom: 130, paddingTop: 8, gap: 0 },

  // Navbar
  navbar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 12,
    backgroundColor: T.bg,
  },
  navGreeting: { fontSize: 12, color: T.textSec, fontWeight: '600', marginBottom: 2 },
  navName: { fontSize: 20, fontWeight: '800', color: T.text, letterSpacing: -0.4 },
  navRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navIconBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: T.white,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: T.border,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  navAvatarWrap: {
    width: 44, height: 44, borderRadius: 14, backgroundColor: T.white,
    borderWidth: 1.5, borderColor: T.border, overflow: 'hidden',
    alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6 },
      android: { elevation: 2 },
    }),
  },
  navAvatar: { width: 38, height: 38 },

  // Hero Finance Card
  heroCard: {
    backgroundColor: T.accent, borderRadius: 24, padding: 22, marginBottom: 16,
    ...Platform.select({
      ios: { shadowColor: T.accent, shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 20 },
      android: { elevation: 6 },
    }),
  },
  heroCardLabel: { color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 16 },
  heroAmountsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  heroDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: 20 },
  heroFinLabel: { color: 'rgba(255,255,255,0.55)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 4 },
  heroFinValue: { color: '#fff', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  heroPbarBg: { height: 6, borderRadius: 3, flexDirection: 'row', overflow: 'hidden', backgroundColor: 'rgba(255,255,255,0.12)' },
  heroPbarGreen: { height: '100%', backgroundColor: T.emerald },
  heroPbarRed: { height: '100%', backgroundColor: 'rgba(239,68,68,0.55)' },
  heroPbarLabel: { color: 'rgba(255,255,255,0.45)', fontSize: 11, fontWeight: '500', marginTop: 8 },

  // Stats Row
  statsRow: {
    flexDirection: 'row', backgroundColor: T.white, borderRadius: 20,
    padding: 16, marginBottom: 24, alignItems: 'center',
    borderWidth: 1, borderColor: T.border,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12 },
      android: { elevation: 2 },
    }),
  },
  statPill: { flex: 1, alignItems: 'center', gap: 6 },
  statDivider: { width: 1, height: 40, backgroundColor: T.border },
  statPillIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  statPillValue: { fontSize: 18, fontWeight: '800', color: T.text, letterSpacing: -0.3 },
  statPillLabel: { fontSize: 10, fontWeight: '600', color: T.textSec, textTransform: 'uppercase', letterSpacing: 0.5 },

  // Sections
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: T.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  seeAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { color: T.accent, fontSize: 13, fontWeight: '700' },

  card: {
    backgroundColor: T.white, borderRadius: 20, borderWidth: 1, borderColor: T.border,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12 },
      android: { elevation: 2 },
    }),
  },

  txRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  txBorder: { borderBottomWidth: 1, borderBottomColor: T.border },
  txIcon: { width: 36, height: 36, borderRadius: 11, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  txName: { fontSize: 14, fontWeight: '700', color: T.text },
  txAmount: { fontSize: 15, fontWeight: '800', color: T.red },

  emptyState: { paddingVertical: 32, alignItems: 'center', gap: 8 },
  emptyText: { color: T.textSec, fontSize: 14, fontWeight: '600' },

  // Profile Modal
  profileModalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 24, paddingVertical: 20,
    borderBottomWidth: 1, borderBottomColor: T.border,
  },
  profileModalTitle: { fontSize: 20, fontWeight: '800', color: T.text },
  profileClose: { width: 36, height: 36, borderRadius: 18, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center' },
  profileContent: { padding: 24, gap: 20 },
  profileAvatarWrap: { alignItems: 'center', gap: 8, paddingVertical: 16 },
  profileAvatarBg: {
    width: 96, height: 96, borderRadius: 24, backgroundColor: T.white,
    borderWidth: 2, borderColor: T.border, alignItems: 'center', justifyContent: 'center',
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  profileAvatar: { width: 80, height: 80 },
  profileName: { fontSize: 22, fontWeight: '800', color: T.text, textAlign: 'center' },
  profileSubtitle: { fontSize: 14, color: T.textSec, fontWeight: '600' },
  profileInfoCard: { backgroundColor: T.white, borderRadius: 16, borderWidth: 1, borderColor: T.border, overflow: 'hidden' },
  profileInfoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  profileInfoText: { fontSize: 15, color: T.text, fontWeight: '500' },
  logoutBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 18,
    backgroundColor: `${T.red}10`, borderRadius: 16, justifyContent: 'center',
    borderWidth: 1, borderColor: `${T.red}20`,
  },
  logoutBtnText: { color: T.red, fontWeight: '700', fontSize: 16 },
  privacyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.1)' },
  privacyBtnText: { color: 'rgba(255,255,255,0.6)', fontSize: 11, fontWeight: '600' },
});
