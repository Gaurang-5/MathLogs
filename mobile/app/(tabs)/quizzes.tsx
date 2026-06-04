import React, { useState, useMemo } from 'react';
import {
  View, Text, FlatList, StyleSheet, TextInput,
  RefreshControl, Dimensions, Platform, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { SkeletonLoader } from '../../components/ui';
import { Search, Brain, Calendar, ChevronRight, Plus, Sparkles, Timer } from 'lucide-react-native';
import api from '../../services/api';
import * as Haptics from 'expo-haptics';

const { width } = Dimensions.get('window');

const T = {
  bg: '#F5F5F7', white: '#FFFFFF', text: '#1D1D1F',
  textSec: '#86868B', textMuted: '#AEAEB2', accent: '#111827',
  emerald: '#10b981', amber: '#f59e0b', red: '#ef4444',
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
  const router = useRouter();

  const { data: quizzes, isLoading, refetch, isRefetching } = useQuery<OnlineQuiz[]>({
    queryKey: ['quizzes'],
    queryFn: async () => {
      const res = await api.get('/tests/online');
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
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={T.accent} />}
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
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: T.bg },
  headerArea: { paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8 },
  title: { color: T.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  subtitle: { color: T.textSec, fontSize: 14, fontWeight: '500', marginTop: 4, marginBottom: 16 },
  createBtn: {
    backgroundColor: T.accent, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 999, flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  createBtnText: { color: T.white, fontWeight: '600', fontSize: 13 },
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
});
