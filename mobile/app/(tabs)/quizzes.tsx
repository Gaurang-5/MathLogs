import React, { useState, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput,
  RefreshControl, Dimensions, Platform, TouchableOpacity,
  Modal, Linking
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SkeletonLoader } from '../../components/ui';
import { Search, Brain, Calendar, ChevronRight, Plus, Sparkles, Timer, ShoppingCart, X, Check } from 'lucide-react-native';
import api from '../../services/api';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

const T = {
  bg: '#F5F5F7', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#111827',
  emerald: '#10b981', amber: '#f59e0b', red: '#ef4444', blue: '#2563eb',
  border: 'rgba(0,0,0,0.06)', shadow: 'rgba(0,0,0,0.06)',
};

interface OnlineQuiz {
  id: string;
  title: string;
  topic?: string | null;
  difficulty?: string | null;
  timeLimitMins: number;
  totalMarks: number;
  availableFrom?: string | null;
  availableUntil?: string | null;
  isFinalized: boolean;
  createdAt: string;
  batchId?: string | null;
  studentQuestionCount?: number | null;
  batch?: {
      id?: string;
      name: string;
      className?: string | null;
  };
  _count: { submissions: number };
}

function getQuizStatus(quiz: OnlineQuiz): { color: string; label: string } {
  if (quiz.isFinalized) return { color: T.textSec, label: 'Finalized' };
  
  if (quiz.availableFrom) {
    const testDate = new Date(quiz.availableFrom);
    const now = new Date();
    if (testDate > now) return { color: T.amber, label: 'Upcoming' };
  }
  
  return { color: T.emerald, label: 'Published' };
}

function QuizCard({ item, index }: { item: OnlineQuiz; index: number }) {
  const st = getQuizStatus(item);
  const router = useRouter();
  
  const dateStr = item.availableFrom 
    ? new Date(item.availableFrom).toLocaleString('en-IN', {
        day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit'
      })
    : 'Instant';

  return (
    <Animated.View entering={FadeInRight.duration(400).delay(index * 50)}>
      <TouchableOpacity activeOpacity={0.7} style={s.card} onPress={() => router.push((`/quiz/${item.id}`) as any)}>
        <View style={[s.testIcon, { backgroundColor: `${st.color}12` }]}>
          <Brain size={20} color={st.color} />
        </View>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={s.testName} numberOfLines={1}>{item.title}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
            <Calendar size={12} color={T.textSec} />
            <Text style={s.testDate}>{dateStr}</Text>
            {item.timeLimitMins > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                <Timer size={12} color={T.textSec} />
                <Text style={s.testDate}>{item.timeLimitMins} mins</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 3 }}>
            <Text style={[s.testDate, { color: T.textMuted }]} numberOfLines={1}>{item.batch?.name || 'General'}</Text>
            {item.topic && <Text style={[s.testDate, { color: T.textMuted }]} numberOfLines={1}>• {item.topic}</Text>}
            <Text style={[s.testDate, { color: T.textMuted }]}>• Max: {item.totalMarks}</Text>
          </View>
        </View>
        <View style={[s.statusPill, { backgroundColor: `${st.color}12` }]}>
          <Text style={[s.statusText, { color: st.color }]}>{st.label}</Text>
        </View>
        <ChevronRight size={18} color={T.textMuted} style={{ marginLeft: 8 }} />
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function QuizzesScreen() {
  const [search, setSearch] = useState('');
  const [showBuyModal, setShowBuyModal] = useState(false);
  const router = useRouter();

  const { data: quizzes, isLoading, refetch, isRefetching } = useQuery<OnlineQuiz[]>({
    queryKey: ['quizzes'],
    queryFn: async () => {
      const res = await api.get('/tests/online');
      return res.data;
    },
  });

  const { data: institute, refetch: refetchInstitute } = useQuery<{ quizCredits?: number }>({
    queryKey: ['institute-me'],
    queryFn: async () => {
      const res = await api.get('/institute/me');
      return res.data;
    },
  });

  const filtered = useMemo(() => {
    if (!quizzes) return [];
    if (!search) return quizzes;
    const q = search.toLowerCase();
    return quizzes.filter(t =>
      t.title.toLowerCase().includes(q) ||
      (t.topic && t.topic.toLowerCase().includes(q))
    );
  }, [quizzes, search]);

  const activeCount = useMemo(() =>
    (quizzes || []).filter(t => !t.isFinalized).length, [quizzes]);
  const finalizedCount = useMemo(() =>
    (quizzes || []).filter(t => t.isFinalized).length, [quizzes]);

  const handleOpenBilling = () => {
    setShowBuyModal(false);
    const webUrl = api.defaults.baseURL ? api.defaults.baseURL.replace(/\/api\/?$/, '/billing') : 'https://mathlogs.in/billing';
    Linking.openURL(webUrl).catch(() => {
      Linking.openURL('https://mathlogs.in/billing');
    });
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      <Animated.View entering={FadeInDown.duration(400)} style={s.headerArea}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <View>
            <Text style={s.title}>AI Quizzes</Text>
            <Text style={s.subtitle}>{quizzes?.length ?? 0} total quizzes</Text>
          </View>
          <TouchableOpacity 
            style={s.createBtn} 
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push('/quiz-generator' as any);
            }}
          >
            <Sparkles size={16} color={T.white} />
            <Text style={s.createBtnText}>Generate</Text>
          </TouchableOpacity>
        </View>

        {/* Quiz Credits Banner Card */}
        <Animated.View entering={FadeInDown.duration(400).delay(100)} style={s.creditsCard}>
          <View style={s.creditsLeft}>
            <View style={s.creditsIconBox}>
              <Sparkles size={18} color="#2563eb" />
            </View>
            <View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={s.creditsVal}>{institute?.quizCredits ?? 0}</Text>
                <Text style={s.creditsTitle}>Quiz Credits</Text>
              </View>
              <Text style={s.creditsSub}>1 credit = 1 AI quiz generation</Text>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            style={s.buyBtn}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowBuyModal(true);
            }}
          >
            <ShoppingCart size={13} color={T.white} />
            <Text style={s.buyBtnText}>Buy More</Text>
          </TouchableOpacity>
        </Animated.View>

        <View style={s.searchWrap}>
          <Search size={18} color={T.textMuted} />
          <TextInput
            placeholder="Search quizzes..."
            placeholderTextColor={T.textMuted}
            value={search} onChangeText={setSearch}
            style={s.searchInput}
          />
        </View>
      </Animated.View>

      {/* Stats Row */}
      {!isLoading && (
        <Animated.View entering={FadeInDown.duration(400).delay(150)} style={s.statsRow}>
          <View style={s.miniStat}>
            <Text style={[s.miniValue, { color: T.emerald }]}>{activeCount}</Text>
            <Text style={s.miniLabel}>Active</Text>
          </View>
          <View style={s.miniStat}>
            <Text style={[s.miniValue, { color: T.textSec }]}>{finalizedCount}</Text>
            <Text style={s.miniLabel}>Finalized</Text>
          </View>
        </Animated.View>
      )}

      <FlatList
        data={filtered}
        renderItem={({ item, index }) => <QuizCard item={item} index={index} />}
        keyExtractor={item => item.id}
        contentContainerStyle={s.listContent}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); refetchInstitute(); }} tintColor={T.accent} />}
        ListEmptyComponent={
          isLoading ? (
            <View style={{ gap: 12 }}>
              {[1, 2, 3].map(i => <SkeletonLoader key={i} width={width - 48} height={90} borderRadius={16} />)}
            </View>
          ) : (
            <View style={s.empty}>
              <Brain size={48} color={T.textMuted} />
              <Text style={s.emptyTitle}>No quizzes yet</Text>
              <Text style={s.emptyDesc}>Generate your first AI-powered quiz above.</Text>
            </View>
          )
        }
      />

      {/* Buy Quiz Credits Bottom Sheet Modal */}
      <Modal
        visible={showBuyModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowBuyModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalContent}>
            <View style={s.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={s.modalIconBox}>
                  <Sparkles size={20} color="#2563eb" />
                </View>
                <View>
                  <Text style={s.modalTitle}>Purchase Quiz Credits</Text>
                  <Text style={s.modalSub}>1 Credit = 1 AI Quiz Generation</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowBuyModal(false)} style={s.closeBtn}>
                <X size={20} color={T.textSec} />
              </TouchableOpacity>
            </View>

            <View style={s.packsGrid}>
              {[
                { credits: 5, price: '₹250', tagline: '₹50 / credit' },
                { credits: 10, price: '₹500', tagline: '₹50 / credit' },
                { credits: 25, price: '₹1,000', tagline: '₹40 / credit', popular: true },
                { credits: 40, price: '₹1,500', tagline: '₹37.5 / credit' },
              ].map((pack, idx) => (
                <TouchableOpacity
                  key={idx}
                  activeOpacity={0.8}
                  style={[s.packCard, pack.popular && s.packCardPopular]}
                  onPress={handleOpenBilling}
                >
                  {pack.popular && (
                    <View style={s.popularBadge}>
                      <Text style={s.popularBadgeText}>MOST POPULAR</Text>
                    </View>
                  )}
                  <Text style={s.packCredits}>{pack.credits} Credits</Text>
                  <Text style={s.packPrice}>{pack.price}</Text>
                  <Text style={s.packTagline}>{pack.tagline}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity style={s.proceedBtn} onPress={handleOpenBilling}>
              <ShoppingCart size={16} color={T.white} />
              <Text style={s.proceedBtnText}>Proceed to Secure Payment</Text>
            </TouchableOpacity>

            <Text style={s.creditsDisclaimer}>Credits never expire and roll over automatically.</Text>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  headerArea: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  title: { color: T.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { color: T.textSec, fontSize: 14, fontWeight: '500', marginTop: 4, marginBottom: 12 },
  createBtn: {
    backgroundColor: T.accent, paddingHorizontal: 14, paddingVertical: 9,
    borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  createBtnText: { color: T.white, fontWeight: '600', fontSize: 13 },

  /* Credits Card */
  creditsCard: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE',
    borderRadius: 18, padding: 14, marginBottom: 14,
    ...Platform.select({
      ios: { shadowColor: '#2563eb', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
      android: { elevation: 1 },
    }),
  },
  creditsLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  creditsIconBox: {
    width: 38, height: 38, borderRadius: 12, backgroundColor: '#DBEAFE',
    alignItems: 'center', justifyContent: 'center',
  },
  creditsVal: { color: '#1E3A8A', fontSize: 20, fontWeight: '800' },
  creditsTitle: { color: '#1E40AF', fontSize: 14, fontWeight: '700' },
  creditsSub: { color: '#3B82F6', fontSize: 11, fontWeight: '500', marginTop: 1 },
  buyBtn: {
    backgroundColor: '#2563eb', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 5,
  },
  buyBtnText: { color: T.white, fontWeight: '700', fontSize: 12 },

  searchWrap: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: T.white,
    borderRadius: 14, paddingHorizontal: 14, height: 46,
    borderWidth: 1, borderColor: T.border,
  },
  searchInput: { flex: 1, marginLeft: 10, fontSize: 15, color: T.text, fontWeight: '500' },
  statsRow: { flexDirection: 'row', paddingHorizontal: 24, gap: 10, marginBottom: 8 },
  miniStat: {
    flex: 1, backgroundColor: T.white, borderRadius: 14, padding: 14,
    alignItems: 'center', borderWidth: 1, borderColor: T.border,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 6 },
      android: { elevation: 1 },
    }),
  },
  miniValue: { fontSize: 22, fontWeight: '700' },
  miniLabel: { color: T.textSec, fontSize: 11, fontWeight: '600', marginTop: 2, textTransform: 'uppercase', letterSpacing: 0.5 },
  listContent: { padding: 24, paddingTop: 12, paddingBottom: 120 },
  card: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: T.white,
    borderRadius: 16, padding: 16, marginBottom: 10,
    borderWidth: 1, borderColor: T.border,
    ...Platform.select({
      ios: { shadowColor: T.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 1, shadowRadius: 10 },
      android: { elevation: 2 },
    }),
  },
  testIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  testName: { color: T.text, fontSize: 16, fontWeight: '600', marginBottom: 4 },
  testMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  testDate: { color: T.textSec, fontSize: 12 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  statusText: { fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
  empty: { alignItems: 'center', paddingTop: 80 },
  emptyTitle: { color: T.text, fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptyDesc: { color: T.textSec, fontSize: 14, marginTop: 6, textAlign: 'center' },

  /* Purchase Modal Styles */
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: T.white, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 40,
  },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20,
  },
  modalIconBox: {
    width: 42, height: 42, borderRadius: 14, backgroundColor: '#EFF6FF',
    alignItems: 'center', justifyContent: 'center',
  },
  modalTitle: { color: T.text, fontSize: 18, fontWeight: '700' },
  modalSub: { color: T.textSec, fontSize: 12, marginTop: 1 },
  closeBtn: { padding: 8, borderRadius: 999, backgroundColor: T.bg },
  packsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  packCard: {
    width: (width - 60) / 2, backgroundColor: '#FAFAFA', borderWidth: 1,
    borderColor: '#E5E7EB', borderRadius: 18, padding: 16, position: 'relative',
  },
  packCardPopular: {
    borderColor: '#2563eb', backgroundColor: '#EFF6FF',
  },
  popularBadge: {
    position: 'absolute', top: -10, right: 12, backgroundColor: '#2563eb',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999,
  },
  popularBadgeText: { color: T.white, fontSize: 8, fontWeight: '800' },
  packCredits: { fontSize: 16, fontWeight: '800', color: T.text },
  packPrice: { fontSize: 20, fontWeight: '900', color: '#2563eb', marginTop: 4 },
  packTagline: { fontSize: 11, color: T.textSec, marginTop: 2, fontWeight: '500' },
  proceedBtn: {
    backgroundColor: T.accent, borderRadius: 16, height: 52,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    marginBottom: 12,
  },
  proceedBtnText: { color: T.white, fontWeight: '700', fontSize: 15 },
  creditsDisclaimer: { textAlign: 'center', color: T.textSec, fontSize: 12, fontWeight: '500' },
});
