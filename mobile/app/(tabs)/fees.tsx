import React, { useState, useMemo } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Platform, ActivityIndicator, Dimensions
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useQuery } from '@tanstack/react-query';
import { Receipt, Search, TrendingUp, TrendingDown, IndianRupee, History, Mail, CheckCircle2 } from 'lucide-react-native';
import api from '../../services/api';
import { SkeletonLoader } from '../../components/ui';

const { width } = Dimensions.get('window');

const T = {
  bg: '#F5F5F7', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#0d7ff2',
  emerald: '#10b981', red: '#ef4444', 
  border: 'rgba(0,0,0,0.06)', shadow: 'rgba(0,0,0,0.06)',
};

interface FeeSummary {
  id: string;
  humanId: string | null;
  name: string;
  batchName: string;
  totalFee: number;
  totalPaid: number;
  balance: number;
  lastPaymentDate: string | null;
}

interface Transaction {
  id: string;
  studentName: string;
  batchName: string;
  amount: number;
  date: string;
  type: string;
}

export default function FeesDashboardScreen() {
  const [viewMode, setViewMode] = useState<'defaulters' | 'recent'>('defaulters');

  const { data: fees = [], isLoading: isLoadingFees } = useQuery<FeeSummary[]>({
    queryKey: ['fees'],
    queryFn: async () => {
      const res = await api.get('/fees');
      return res.data;
    },
  });

  const { data: transactions = [], isLoading: isLoadingTx } = useQuery<Transaction[]>({
    queryKey: ['recent-transactions'],
    queryFn: async () => {
      const res = await api.get('/fees/recent');
      return res.data;
    },
  });

  const stats = useMemo(() => {
    const totalDue = fees.reduce((sum, s) => sum + Math.max(0, s.balance), 0);
    const totalCollected = fees.reduce((sum, s) => sum + s.totalPaid, 0);
    const totalExpected = totalCollected + totalDue;
    const collectionRate = totalExpected > 0 ? Math.min(100, Math.round((totalCollected / totalExpected) * 100)) : 0;
    return { totalDue, totalCollected, collectionRate };
  }, [fees]);

  const defaulters = useMemo(() => {
    return fees.filter(s => s.balance > 0).sort((a,b) => b.balance - a.balance);
  }, [fees]);

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <View style={s.header}>
        <Text style={s.headerTitle}>Fees & Finances</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>
        {isLoadingFees || isLoadingTx ? (
           <View style={{ gap: 16 }}>
             <View style={s.statsScroll}>
               <SkeletonLoader width={140} height={110} borderRadius={20} />
               <SkeletonLoader width={140} height={110} borderRadius={20} />
             </View>
             <SkeletonLoader width={width-32} height={200} borderRadius={20} />
           </View>
        ) : (
          <View>
            <Animated.View entering={FadeInDown.duration(400)}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.statsScroll}>
                <View style={s.statCard}>
                  <View style={[s.statIconWrap, { backgroundColor: `${T.emerald}15` }]}>
                    <TrendingUp size={20} color={T.emerald} />
                  </View>
                  <Text style={s.statLabel}>Collected</Text>
                  <Text style={s.statValue}>₹{stats.totalCollected.toLocaleString()}</Text>
                </View>
                
                <View style={[s.statCard, { borderColor: `${T.red}20` }]}>
                  <View style={[s.statIconWrap, { backgroundColor: `${T.red}15` }]}>
                    <TrendingDown size={20} color={T.red} />
                  </View>
                  <Text style={s.statLabel}>Due</Text>
                  <Text style={[s.statValue, { color: T.red }]}>₹{stats.totalDue.toLocaleString()}</Text>
                </View>

                <View style={s.statCard}>
                  <View style={[s.statIconWrap, { backgroundColor: `${T.accent}15` }]}>
                    <IndianRupee size={20} color={T.accent} />
                  </View>
                  <Text style={s.statLabel}>Collection</Text>
                  <Text style={[s.statValue, { color: T.accent }]}>{stats.collectionRate}%</Text>
                </View>
              </ScrollView>
            </Animated.View>

            <Animated.View entering={FadeInDown.duration(400).delay(100)} style={s.viewToggle}>
              <TouchableOpacity
                style={[s.toggleBtn, viewMode === 'defaulters' && s.toggleBtnActive]}
                onPress={() => setViewMode('defaulters')}
              >
                <Text style={[s.toggleText, viewMode === 'defaulters' && s.toggleTextActive]}>Pending Dues</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toggleBtn, viewMode === 'recent' && s.toggleBtnActive]}
                onPress={() => setViewMode('recent')}
              >
                <Text style={[s.toggleText, viewMode === 'recent' && s.toggleTextActive]}>Recent</Text>
              </TouchableOpacity>
            </Animated.View>

            {viewMode === 'defaulters' ? (
               <Animated.View entering={FadeIn.duration(300)}>
                 <Text style={s.sectionTitle}>Pending Dues List</Text>
                 <View style={s.listContainer}>
                   {defaulters.length === 0 ? (
                     <View style={s.emptyState}>
                       <CheckCircle2 size={40} color={T.emerald} style={{ opacity: 0.5, marginBottom: 12 }} />
                       <Text style={s.emptyText}>No pending dues! 100% collected.</Text>
                     </View>
                   ) : (
                     defaulters.map((s, i) => (
                       <View key={s.id} style={[s.listItem, i < defaulters.length - 1 && s.borderBottom]}>
                         <View style={s.avatar}><Text style={s.avatarText}>{s.name.charAt(0)}</Text></View>
                         <View style={{ flex: 1, paddingRight: 12 }}>
                           <Text style={s.itemName} numberOfLines={1}>{s.name}</Text>
                           <Text style={s.itemMeta}>{s.humanId || 'No ID'} • {s.batchName}</Text>
                         </View>
                         <View style={{ alignItems: 'flex-end' }}>
                           <Text style={s.dueAmount}>₹{s.balance.toLocaleString()}</Text>
                           <Text style={s.dueLabel}>Due</Text>
                         </View>
                       </View>
                     ))
                   )}
                 </View>
               </Animated.View>
            ) : (
                <Animated.View entering={FadeIn.duration(300)}>
                <Text style={s.sectionTitle}>Recent Transactions</Text>
                <View style={s.listContainer}>
                  {transactions.length === 0 ? (
                     <View style={s.emptyState}>
                       <History size={40} color={T.textMuted} style={{ opacity: 0.5, marginBottom: 12 }} />
                       <Text style={s.emptyText}>No recent transactions.</Text>
                     </View>
                  ) : (
                    transactions.map((tx, i) => (
                      <View key={tx.id} style={[s.listItem, i < transactions.length - 1 && s.borderBottom]}>
                        <View style={[s.avatar, { backgroundColor: `${T.emerald}15` }]}>
                           <Text style={[s.avatarText, { color: T.emerald }]}>{tx.studentName.charAt(0)}</Text>
                        </View>
                        <View style={{ flex: 1, paddingRight: 12 }}>
                          <Text style={s.itemName} numberOfLines={1}>{tx.studentName}</Text>
                          <Text style={s.itemMeta}>{tx.batchName} • {new Date(tx.date).toLocaleDateString()}</Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={[s.dueAmount, { color: T.emerald }]}>+₹{tx.amount.toLocaleString()}</Text>
                        </View>
                      </View>
                    ))
                  )}
                </View>
              </Animated.View>
            )}
            
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  header: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 16 },
  headerTitle: { fontSize: 24, fontWeight: '800', color: T.text, letterSpacing: -0.5 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 120 },
  
  statsScroll: { gap: 12, marginBottom: 24, paddingHorizontal: 4 },
  statCard: {
    backgroundColor: T.white, borderRadius: 24, padding: 20, minWidth: 140,
    borderWidth: 1, borderColor: T.border,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12 },
      android: { elevation: 2 },
    }),
  },
  statIconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  statLabel: { fontSize: 12, color: T.textSec, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
  statValue: { fontSize: 22, fontWeight: '800', color: T.text, letterSpacing: -0.5 },

  viewToggle: {
    flexDirection: 'row', backgroundColor: '#E5E5EA', padding: 4, borderRadius: 16,
    marginBottom: 24, marginHorizontal: 4
  },
  toggleBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12 },
  toggleBtnActive: { backgroundColor: T.white, ...Platform.select({ ios: { shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } }, android: { elevation: 2 }}) },
  toggleText: { fontSize: 13, fontWeight: '600', color: T.textSec },
  toggleTextActive: { color: T.text, fontWeight: '700' },

  sectionTitle: { fontSize: 18, fontWeight: '800', color: T.text, marginBottom: 12, marginLeft: 4, letterSpacing: -0.3 },
  listContainer: {
    backgroundColor: T.white, borderRadius: 24, padding: 8,
    borderWidth: 1, borderColor: T.border, marginHorizontal: 4,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 1, shadowRadius: 12 },
      android: { elevation: 2 },
    }),
  },
  listItem: { flexDirection: 'row', alignItems: 'center', padding: 12 },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: T.border },
  avatar: { width: 44, height: 44, borderRadius: 12, backgroundColor: T.bg, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { fontSize: 18, fontWeight: '700', color: T.textSec },
  itemName: { fontSize: 15, fontWeight: '700', color: T.text, marginBottom: 2 },
  itemMeta: { fontSize: 12, color: T.textSec, fontWeight: '500' },
  dueAmount: { fontSize: 16, fontWeight: '800', color: T.red },
  dueLabel: { fontSize: 11, color: T.textSec, fontWeight: '600', marginTop: 2 },

  emptyState: { padding: 40, alignItems: 'center' },
  emptyText: { color: T.textSec, fontSize: 15, fontWeight: '600' }
});
