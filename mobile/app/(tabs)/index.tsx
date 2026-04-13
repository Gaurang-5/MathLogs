import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, RefreshControl,
  Dimensions, Image, Platform, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { Users, BookOpen, FileText, AlertCircle, Bell, TrendingUp, IndianRupee, Wallet } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { BrandButton, OfflineBanner, SkeletonLoader } from '../../components/ui';
import api from '../../services/api';
import { LineChart, StackedBarChart } from 'react-native-chart-kit';

const { width } = Dimensions.get('window');
const CARD_W = (width - 48 - 12) / 2;

const T = {
  bg: '#F5F5F7', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#0d7ff2',
  teal: '#0d9488', emerald: '#10b981', red: '#ef4444',
  amber: '#f59e0b', border: 'rgba(0,0,0,0.06)', shadow: 'rgba(0,0,0,0.06)',
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
  const [loadingCharts, setLoadingCharts] = useState(true);
  const [growthData, setGrowthData] = useState<any[]>([]);
  const [financeGrowth, setFinanceGrowth] = useState<any[]>([]);

  const loadData = useCallback(async () => {
    try {
      const dashRes = await api.get('/dashboard/summary');
      setData(dashRes.data);

      try {
        const [growRes, finRes] = await Promise.all([
          api.get('/stats/growth'),
          api.get('/stats/finance-growth')
        ]);
        setGrowthData(growRes.data);
        setFinanceGrowth(finRes.data);
      } catch (err) {
        console.warn('Failed to load charts:', err);
      }
    } catch (e: any) {
      console.warn('Dashboard summary failed:', e?.response?.data || e);
    } finally {
      setLoading(false);
      setLoadingCharts(false);
    }
  }, []);

  useEffect(() => {
    if (isLoggedIn) loadData();
  }, [isLoggedIn]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  if (!isLoggedIn) {
    return (
      <SafeAreaView style={[s.container, { justifyContent: 'center', alignItems: 'center', padding: 32 }]}>
        <Text style={{ color: T.text, fontSize: 28, fontWeight: '700', marginBottom: 8 }}>Welcome to MathLogs</Text>
        <Text style={{ color: T.textSec, fontSize: 16, marginBottom: 40, textAlign: 'center' }}>
          Sign in to manage your institute
        </Text>
        <View style={{ width: '100%' }}>
          <BrandButton title="Sign In" onPress={() => router.push('/login')} />
        </View>
      </SafeAreaView>
    );
  }

  
  
  const totalCol = data?.finances?.totalCollected ?? 0;
  const pending = data?.finances?.pending ?? 0;
  const totalGenerated = totalCol + pending;
  const collectionRate = totalGenerated > 0 ? Math.round((totalCol / totalGenerated) * 100) : 0;

  const chartConfig = {
    backgroundGradientFrom: T.white,
    backgroundGradientTo: T.white,
    color: (opacity = 1) => `rgba(17, 24, 39, ${opacity})`,
    labelColor: (opacity = 1) => `rgba(156, 163, 175, ${opacity})`,
    strokeWidth: 2,
    barPercentage: 0.5,
    useShadowColorFromDataset: false,
    decimalPlaces: 0,
    propsForDots: {
      r: "4",
      strokeWidth: "2",
      stroke: T.white
    }
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <OfflineBanner visible={false} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={T.accent} />}
      >
        {/* Header */}
        <Animated.View entering={FadeInDown.duration(600).delay(100)} style={s.header}>
          <View style={{ flex: 1 }}>
            <Text style={s.headerLabel}>WELCOME BACK</Text>
            <Text style={s.headerName}>{data?.userName || user?.name || 'Admin'}</Text>
          </View>
          <View style={s.headerRight}>
            <TouchableOpacity style={s.bellWrap} onPress={logout}>
              <Bell size={20} color={T.text} />
            </TouchableOpacity>
            <Image source={{ uri: `https://avatar.vercel.sh/${user?.instituteName || 'mathlogs'}?size=120` }} style={s.avatar} />
          </View>
        </Animated.View>

        {/* 2×2 Stats */}
        <Animated.View entering={FadeInDown.duration(600).delay(250)} style={{ marginBottom: 24 }}>
          <View style={s.statsGrid}>
            {loading ? (
              <>{[1,2,3,4].map(i => <SkeletonLoader key={i} width={CARD_W} height={138} borderRadius={20} />)}</>
            ) : (
              <>
                <StatCard icon={<Users size={20} color={T.accent} />} value={data?.stats.students ?? 0} label="Students" color={T.accent} />
                <StatCard icon={<BookOpen size={20} color={T.teal} />} value={data?.stats.batches ?? 0} label="Batches" color={T.teal} />
                <StatCard icon={<TrendingUp size={20} color={T.emerald} />} value={`${collectionRate}%`} label="Collection" color={T.emerald} />
                <StatCard icon={<IndianRupee size={20} color={T.amber} />} value={`₹${(data?.finances?.collected ?? 0).toLocaleString()}`} label="This Month" color={T.amber} />
              </>
            )}
          </View>
        </Animated.View>

        {/* Charts Slider */}
        <Animated.View entering={FadeInDown.duration(600).delay(350)}>
          <ScrollView
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingLeft: 0 }}
          >
            {/* Growth Trends Chart */}
            <View style={{ width: width - 48, marginRight: 16 }}>
              <View style={[s.activityCard, { marginBottom: 24, padding: 16 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <TrendingUp size={20} color={T.text} />
                  <Text style={s.sectionTitle}>Growth Trends</Text>
                </View>
                {loadingCharts ? (
                  <SkeletonLoader width={width - 80} height={220} borderRadius={14} />
                ) : growthData.length > 0 ? (
                  <View style={{ position: 'relative', flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[s.yAxisLabel]}>S{'\n'}t{'\n'}u{'\n'}d{'\n'}e{'\n'}n{'\n'}t{'\n'}s</Text>
                    <View style={{ flex: 1, marginLeft: 6 }}>
                      <LineChart
                        data={{
                          labels: growthData.map(d => d.name),
                          datasets: [{ data: growthData.map(d => d.students) }]
                        }}
                        width={width - 100}
                        height={220}
                        chartConfig={chartConfig}
                        bezier
                        style={{ borderRadius: 16 }}
                        withVerticalLines={false}
                        withInnerLines={true}
                        segments={4}
                      />
                      <Text style={s.xAxisLabel}>Months</Text>
                    </View>
                  </View>
                ) : (
                  <View style={{ height: 220, alignItems: 'center', justifyContent: 'center' }}>
                    <TrendingUp size={32} color={T.textMuted} />
                    <Text style={{ color: T.textSec, fontSize: 14, marginTop: 12 }}>No growth data available</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Fee Overview Chart */}
            <View style={{ width: width - 48 }}>
              <View style={[s.activityCard, { marginBottom: 24, padding: 16 }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <Wallet size={20} color={T.text} />
                  <Text style={s.sectionTitle}>Fee Overview</Text>
                </View>
                {loadingCharts ? (
                  <SkeletonLoader width={width - 80} height={220} borderRadius={14} />
                ) : financeGrowth.length > 0 ? (
                  <View style={{ position: 'relative', flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={[s.yAxisLabel]}>₹{'\n'} {'\n'}T{'\n'}h{'\n'}o{'\n'}u{'\n'}s{'\n'}a{'\n'}n{'\n'}d{'\n'}s</Text>
                    <View style={{ flex: 1, marginLeft: 0 }}>
                      <StackedBarChart
                        data={{
                          labels: financeGrowth.map(d => d.name),
                          legend: ['Collected', 'Remaining'],
                          data: financeGrowth.map(d => [d.collected / 1000, d.remaining / 1000]),
                          barColors: ['#111827', '#d1d5db']
                        }}
                        width={width - 90}
                        height={220}
                        chartConfig={{
                          ...chartConfig,
                          color: (opacity = 1) => `rgba(0, 0, 0, ${opacity})`,
                          barPercentage: 0.7,
                        }}
                        style={{ borderRadius: 16 }}
                        hideLegend={true}
                      />
                      <Text style={s.xAxisLabel}>Months</Text>
                      
                      {/* Custom Legend to visually complement the hidden built-in points */}
                      <View style={s.customLegendRow}>
                        <View style={s.customLegendItem}>
                          <View style={[s.customLegendDot, { backgroundColor: '#111827' }]} />
                          <Text style={s.customLegendText}>Collected</Text>
                        </View>
                        <View style={s.customLegendItem}>
                          <View style={[s.customLegendDot, { backgroundColor: '#d1d5db' }]} />
                          <Text style={s.customLegendText}>Remaining</Text>
                        </View>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={{ height: 220, alignItems: 'center', justifyContent: 'center' }}>
                    <Wallet size={32} color={T.textMuted} />
                    <Text style={{ color: T.textSec, fontSize: 14, marginTop: 12 }}>No fee data available yet</Text>
                  </View>
                )}
              </View>
            </View>
          </ScrollView>
        </Animated.View>

        {/* Pending Due By Batch */}
        <Animated.View entering={FadeInDown.duration(600).delay(500)}>
          <View style={s.sectionHeader}>
            <Text style={s.sectionTitle}>Pending Due By Batch</Text>
          </View>
          <View style={s.activityCard}>
            {loading ? (
              <View style={{ padding: 16, gap: 12 }}>
                <SkeletonLoader width={width - 80} height={50} borderRadius={14} />
                <SkeletonLoader width={width - 80} height={50} borderRadius={14} />
              </View>
            ) : data?.defaulters?.length ? (
              data.defaulters.map((d, i) => (
                <Animated.View key={d.name + i} entering={FadeInRight.duration(500).delay(i * 80)}>
                  <View style={[s.actRow, i < data.defaulters.length - 1 && s.actRowBorder]}>
                    <View style={s.actIcon}><AlertCircle size={16} color={T.red} /></View>
                    <Text style={s.actName}>{d.name}</Text>
                    <Text style={[s.scoreText, { color: T.red }]}>₹{d.amount.toLocaleString()}</Text>
                  </View>
                </Animated.View>
              ))
            ) : (
              <View style={{ padding: 32, alignItems: 'center' }}>
                <TrendingUp size={32} color={T.textMuted} />
                <Text style={{ color: T.textSec, fontSize: 14, marginTop: 12 }}>No defaulters! 🎉</Text>
              </View>
            )}
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatCard({ icon, value, label, color }: { icon: React.ReactNode; value: number | string; label: string; color: string }) {
  return (
    <View style={s.statCard}>
      <View style={[s.statIconWrap, { backgroundColor: `${color}12` }]}>{icon}</View>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  scroll: { padding: 24, paddingBottom: 130 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 },
  headerLabel: { color: T.textSec, fontSize: 11, fontWeight: '600', letterSpacing: 1.4, marginBottom: 4 },
  headerName: { color: T.text, fontSize: 24, fontWeight: '700', letterSpacing: -0.5 },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  bellWrap: { backgroundColor: T.white, padding: 11, borderRadius: 999, borderWidth: 1, borderColor: T.border },
  avatar: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: T.accent },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    width: CARD_W, backgroundColor: T.white, padding: 18, borderRadius: 20,
    borderWidth: 1, borderColor: T.border,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  statIconWrap: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  statValue: { color: T.text, fontSize: 28, fontWeight: '700', marginBottom: 4 },
  statLabel: { color: T.textSec, fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  financeRow: { flexDirection: 'row', gap: 10 },
  finCard: {
    flex: 1, backgroundColor: T.white, borderRadius: 14, padding: 16,
    borderWidth: 1, borderColor: T.border,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6 },
      android: { elevation: 1 },
    }),
  },
  finLabel: { color: T.textSec, fontSize: 12, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  finValue: { fontSize: 22, fontWeight: '700' },
  actionsRow: { flexDirection: 'row', gap: 10 },
  actionCard: {
    flex: 1, backgroundColor: T.white, paddingVertical: 18, borderRadius: 16,
    alignItems: 'center', borderWidth: 1, borderColor: T.border,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8 },
      android: { elevation: 2 },
    }),
  },
  actionLabel: { color: T.text, fontSize: 12, fontWeight: '600' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { color: T.text, fontSize: 18, fontWeight: '700', letterSpacing: -0.3, marginBottom: 0 },
  activityCard: {
    backgroundColor: T.white, borderRadius: 20, borderWidth: 1, borderColor: T.border,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12 },
      android: { elevation: 3 },
    }),
  },
  actRow: { flexDirection: 'row', alignItems: 'center', padding: 14 },
  actRowBorder: { borderBottomWidth: 1, borderBottomColor: T.border },
  actIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: `${T.red}10`, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  actName: { flex: 1, color: T.text, fontSize: 15, fontWeight: '600' },
  scoreText: { fontSize: 15, fontWeight: '700' },
  yAxisLabel: { 
    color: T.textSec, 
    fontSize: 10, 
    fontWeight: '600',
    textAlign: 'center',
    marginRight: 6
  },
  xAxisLabel: { textAlign: 'center', color: T.textSec, fontSize: 10, fontWeight: '600', marginTop: -5 },
  customLegendRow: { flexDirection: 'row', justifyContent: 'center', gap: 24, marginTop: 12 },
  customLegendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  customLegendDot: { width: 10, height: 10, borderRadius: 3 },
  customLegendText: { color: T.textSec, fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
});
